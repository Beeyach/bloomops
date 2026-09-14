// One serial save stream per open page. A failed request keeps the draft intact.
export function createPageDraftSession({initial,save,onState=()=>{},persist=()=>{},clear=()=>{},delay=800}){
 let draft={title:initial.title,body:initial.body},saved={...draft},revision=initial.revision,busy=false,error=null,timer=null,active=null,disposed=false;
 const dirty=()=>draft.title!==saved.title||draft.body!==saved.body;
 const snapshot=()=>({draft:{...draft},revision,dirty:dirty(),busy,error});
 const emit=()=>{if(!disposed)onState(snapshot());};
 const retain=()=>{try{persist({...draft,revision});}catch{}};
 const schedule=()=>{clearTimeout(timer);if(!disposed&&!error&&dirty())timer=setTimeout(()=>flush(),delay);};
 async function flush(){
  clearTimeout(timer);if(active)return active;if(disposed||error||!dirty())return;
  busy=true;emit();
  active=(async()=>{
   while(!disposed&&dirty()&&!error){
    const sent={...draft},base=revision;
    try{
     const result=await save({...sent,expectedRevision:base});
     if(disposed)return;
     if(!result.ok){error={kind:result.reason||'network',message:result.error||'Your draft is here. Try saving again.'};break;}
     if(!Number.isSafeInteger(result.revision)||result.revision!==base+1)throw Error('Unexpected save result');
     saved=sent;revision=result.revision;
     if(dirty())retain();else try{clear();}catch{}
    }catch{error={kind:'network',message:'Your draft is here. Check your connection, then retry.'};break;}
   }
   busy=false;active=null;emit();
  })();
  return active;
 }
 return {
  snapshot,flush,
  edit(patch){draft={...draft,...patch};if(error?.kind==='invalid')error=null;retain();emit();schedule();},
  restore(value){if(!value||typeof value.title!=='string'||typeof value.body!=='string'||!Number.isSafeInteger(value.revision)||value.revision<1)return false;draft={title:value.title,body:value.body};if(value.revision!==revision&&dirty())error={kind:'conflict',message:'A newer version was saved. Your recovered draft is here.'};emit();schedule();return true;},
  retry(){if(error?.kind==='conflict')return;error=null;emit();return flush();},
  useSaved(page){if(busy)return;clearTimeout(timer);draft={title:page.title,body:page.body};saved={...draft};revision=page.revision;error=null;try{clear();}catch{}emit();},
  dispose(){disposed=true;clearTimeout(timer);},
 };
}
export const pageDraftKey=(userId,workspaceId,pageId)=>'bloomsi:page-draft:'+JSON.stringify([userId,workspaceId,pageId]);
