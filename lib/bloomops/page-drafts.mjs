const documentValue=value=>value&&typeof value.title==='string'&&typeof value.body==='string';
const revisionValue=value=>Number.isSafeInteger(value)&&value>0;
const fields=value=>({title:value.title,body:value.body});
const same=(a,b)=>a.title.trim()===b.title.trim()&&a.body===b.body;
const conflict=()=>({kind:'conflict',message:'A newer version was saved. Your draft is still here.'});
const network=()=>({kind:'network',message:'Your draft is here. Check your connection, then retry.'});
// One serial stream. Retain the exact outstanding attempt before sending so a
// lost reply can be reconciled even after reload, without replaying its write.
export function createPageDraftSession({initial,save,read,onState=()=>{},persist=()=>{},clear=()=>{},delay=800}){
 let draft=fields(initial),saved=fields(initial),revision=initial.revision,pending=null,busy=false,error=null,timer=null,active=null,disposed=false,generation=0;
 const dirty=()=>!same(draft,saved);
 const snapshot=()=>({draft:{...draft},revision,dirty:dirty(),busy,error,generation});
 const retained=()=>({...draft,revision,saved:{...saved},pending:pending?{...pending}:null});
 const emit=()=>{if(!disposed)onState(snapshot());};
 const retain=()=>{if(!disposed)try{if(dirty()||pending)persist(retained());else clear();}catch{}};
 const schedule=()=>{clearTimeout(timer);if(!disposed&&!error&&dirty())timer=setTimeout(()=>flush(),delay);};
 function reconcile(current){
  if(!documentValue(current)||!revisionValue(current.revision))throw Error('Invalid saved version');
  if(same(current,draft)){
   saved=fields(current);revision=current.revision;pending=null;error=null;retain();return true;
  }
  if(pending&&current.revision===pending.expectedRevision+1&&same(current,pending)){
   saved=fields(current);revision=current.revision;pending=null;error=null;retain();return true;
  }
  if(current.revision!==revision){error=conflict();return false;}
  error=null;return true;
 }
 async function flush(){
  clearTimeout(timer);if(active)return active;if(disposed||busy||error||!dirty())return;
  busy=true;emit();
  active=(async()=>{
   while(!disposed&&dirty()&&!error){
    const sent={...draft},base=revision;pending={...sent,expectedRevision:base};retain();
    try{
     const result=await save({...pending});
     if(disposed)return;
     if(!result.ok){error={kind:result.reason||'network',message:result.error||'Your draft is here. Try saving again.'};break;}
     if(!revisionValue(result.revision)||result.revision!==base+1)throw Error('Unexpected save result');
     saved={...sent,title:sent.title.trim()};revision=result.revision;pending=null;
     if(draft.title===sent.title)draft.title=saved.title;retain();
    }catch{if(!disposed)error=network();break;}
   }
   busy=false;active=null;emit();
  })();
  return active;
 }
 return {
  snapshot,flush,retained,
  pause(){if(disposed||busy)return;clearTimeout(timer);if(dirty()&&!error)error={kind:'recovered',message:'Your draft is here. Save when ready.'};emit();},
  edit(patch){if(disposed)return;generation++;draft={...draft,...patch};if(error?.kind==='invalid')error=null;retain();emit();schedule();},
  restore(value,current={...saved,revision}){
   if(disposed||busy||!documentValue(value)||!revisionValue(value.revision))return false;
   if(value.saved!==undefined&&!documentValue(value.saved))return false;
   if(value.pending!=null&&(!documentValue(value.pending)||value.pending.expectedRevision!==value.revision))return false;
   clearTimeout(timer);generation++;draft=fields(value);saved=fields(value.saved||initial);revision=value.revision;pending=value.pending?{...value.pending}:null;
   try{if(reconcile(current)&&dirty())error={kind:'recovered',message:'Review your recovered draft, then save when ready.'};}catch{error=network();}
   retain();emit();return true;
  },
  async retry(){
   if(disposed||busy||error?.kind==='conflict')return;
   clearTimeout(timer);busy=true;emit();
   try{if(read){const current=await read();if(disposed)return;if(!reconcile(current))return;}error=null;}
   catch{if(!disposed)error=network();}
   finally{busy=false;emit();}
   if(!disposed&&!error)return flush();
  },
  useSaved(page,expectedGeneration){if(disposed||busy||expectedGeneration!==undefined&&expectedGeneration!==generation||!documentValue(page)||!revisionValue(page.revision))return false;clearTimeout(timer);generation++;draft=fields(page);saved={...draft};revision=page.revision;pending=null;error=null;retain();emit();return true;},
  dispose(){disposed=true;clearTimeout(timer);},
 };
}
export const pageDraftKey=(userId,workspaceId,pageId)=>'bloomsi:page-draft:'+JSON.stringify([userId,workspaceId,pageId]);
