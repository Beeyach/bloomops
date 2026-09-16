'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function ProspectSkillActions({skillId,version,instructions,prospect}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[fallback,setFallback]=useState(''),status=useRef(null),manual=useRef(null),inFlight=useRef(false);
 useEffect(()=>setReady(true),[]);
 useEffect(()=>{if(fallback){manual.current?.focus();manual.current?.select();}else if(notice)status.current?.focus();},[fallback,notice]);
 async function act(action){
  if(!ready||inFlight.current)return;inFlight.current=true;setBusy(true);setNotice(null);setFallback('');
  try{
   if(!prospect){download(instructions,`bloomsi-${skillId}-v${version}-instructions.md`,'text/markdown;charset=utf-8');setNotice({text:'Instructions downloaded. Add a saved prospect context before using the task.'});return;}
   const response=await fetch('/api/bloomops/prospecting/skill-export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:prospect.workspaceId,prospectId:prospect.id,expectedRevision:prospect.revision,skillId,skillVersion:version})});
   const data=await response.json().catch(()=>null);
   if(!response.ok){setNotice({error:true,reload:response.status===409,text:[401,403,404].includes(response.status)?'Access to this prospect is unavailable. Return to your prospect list.':data?.error||'The task could not be prepared. Try again.'});return;}
   if(action==='copy'){
    try{await navigator.clipboard.writeText(data.task);setNotice({text:'Task and saved context copied.'});}
    catch{setFallback(data.task);setNotice({error:true,text:'Clipboard access is unavailable. Copy the selected text below or download the task.'});}
   }else{download(action==='context'?JSON.stringify(data.context,null,2)+'\n':data.task,`bloomsi-${skillId}-v${version}-${action==='context'?'context.json':'task.md'}`,action==='context'?'application/json':'text/markdown;charset=utf-8');setNotice({text:action==='context'?'Saved context downloaded.':'Task and saved context downloaded.'});}
  }catch{setNotice({error:true,text:'The task could not be prepared. Check your connection and try again.'});}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="bo-skill-export" aria-label="Prepare manual task">
  {prospect?<><div className="bo-skill-actions"><Button icon="copy" variant="primary" disabled={!ready||busy} loading={busy} onClick={()=>act('copy')}>{busy?'Preparing task…':'Copy task with context'}</Button><Button icon="download" disabled={!ready||busy} onClick={()=>act('task')}>Download task</Button><Button variant="ghost" icon="download" disabled={!ready||busy} onClick={()=>act('context')}>Download context</Button></div><p className="bo-hint">Paste into your manual chat. Review the result before updating the profile.</p></>:<><h2 className="bo-h3">Choose context for this task</h2><p className="bo-hint">No prospect selected. Choose one to include its saved fields.</p><div className="bo-skill-actions"><Button href="/prospecting" icon="prospecting" variant="primary">Choose a prospect</Button><Button icon="download" disabled={!ready||busy} onClick={()=>act('instructions')}>Download instructions</Button></div></>}
  {notice&&<div ref={status} tabIndex={-1} className="bo-prospect-notice bo-skill-notice" role={notice.error?'alert':'status'}><p>{notice.text}</p>{notice.reload&&<Button onClick={()=>window.location.reload()} variant="ghost">Reload saved context</Button>}</div>}
  {fallback&&<div className="bo-skill-fallback"><label htmlFor="skill-manual-copy">Task and saved context</label><textarea ref={manual} id="skill-manual-copy" className="bo-control" readOnly rows={10} value={fallback}/></div>}
 </section>;
}
