'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';

async function request(api,scope,options={}){
 const r=await fetch(api,{cache:'no-store',...options});const b=await r.json().catch(()=>null);
 if(!r.ok||b?.scope?.userId!==scope.userId||b?.scope?.workspaceId!==scope.workspaceId){const e=Error(b?.error||'Record context could not be loaded. Retry when connected.');e.status=r.ok?403:r.status;throw e;}return b;
}
const denied=e=>[401,403,404].includes(e.status);
function RecordPicker({api,scope,kind,clientId=null,selected,onChange,disabled,onDenied}){
 const [query,setQuery]=useState(''),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),alive=useRef(true),usedQuery=useRef('');
 async function load(page=1,search=query){const g=++generation.current;setLoading(true);setError('');usedQuery.current=search;
  try{const q=new URLSearchParams({kind,search,page:String(page),...(clientId?{clientId}:{})});const b=await request(api+'?'+q,scope);if(alive.current&&g===generation.current)setResult(b.options);}
  catch(e){if(alive.current&&g===generation.current){if(denied(e))onDenied();else setError(e.message);}}
  finally{if(alive.current&&g===generation.current)setLoading(false);}
 }
 useEffect(()=>{alive.current=true;load(1,'');return()=>{alive.current=false;generation.current++;};},[api,scope.userId,scope.workspaceId,kind,clientId]);
 const label=kind==='client'?'Client':'Project',items=result?.items||[];
 return <fieldset disabled={disabled} className="bo-page-record-picker"><legend>{label}</legend>
  <label>Search {label.toLowerCase()}s<input maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();load();}}}/></label><Button disabled={loading} onClick={()=>load()}>Search {label.toLowerCase()}s</Button>
  {loading&&<p role="status">Loading {label.toLowerCase()} choices…</p>}{error&&<p role="alert">{error} <Button onClick={()=>load()}>Retry choices</Button></p>}
  <label>Linked {label.toLowerCase()}<select disabled={loading} value={selected?.id||''} onChange={e=>onChange(items.find(i=>i.id===e.target.value)||null)}><option value="">None</option>{selected&&!items.some(i=>i.id===selected.id)&&<option value={selected.id}>{selected.name}</option>}{items.map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label>
  {!loading&&result&&!items.length&&<p className="bo-hint">No matching {label.toLowerCase()}s.</p>}
  <div className="bo-form-actions">{result?.page>1&&<Button disabled={loading} onClick={()=>load(result.page-1,usedQuery.current)}>Previous {label.toLowerCase()}s</Button>}{result?.more&&<Button disabled={loading} onClick={()=>load(result.page+1,usedQuery.current)}>More {label.toLowerCase()}s</Button>}</div>
 </fieldset>;
}
export default function PageRecordContext({pageId,workspaceId,userId}){
 const scope={workspaceId,userId},api=`/api/bloomops/pages/${pageId}/context`;
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[lost,setLost]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[conflict,setConflict]=useState(false),[selection,setSelection]=useState({client:null,project:null,revision:0});
 const alive=useRef(true),reads=useRef(0),writes=useRef(0),writing=useRef(false),editing=useRef(false),dirty=useRef(false),revision=useRef(0);
 function revoke(){reads.current++;writes.current++;writing.current=false;dirty.current=false;setData(null);setOpen(false);setSelection({client:null,project:null,revision:0});setBusy(false);setLoading(false);setLost(true);setError('Your account, workspace or Page access changed. Reload to continue.');}
 function adopt(next){setSelection({client:next.client,project:next.project,revision:next.revision});revision.current=next.revision;dirty.current=false;setConflict(false);}
 async function load({replace=false}={}){if(writing.current)return;const g=++reads.current;setLoading(true);
  try{const b=await request(api,scope);if(!alive.current||g!==reads.current)return;
   if(editing.current&&!b.context.canManage){revoke();return;}setData(b.context);setError('');
   if(replace||!dirty.current)adopt(b.context);else if(b.context.revision!==revision.current)setConflict(true);
  }catch(e){if(alive.current&&g===reads.current){if(denied(e))revoke();else{setData(null);setError(e.message);}}}
  finally{if(alive.current&&g===reads.current)setLoading(false);}
 }
 useEffect(()=>{alive.current=true;load();const refresh=()=>{if(!document.hidden)load();};const invalidate=()=>revoke();const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)revoke();};let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
  const leave=e=>{if(dirty.current||writing.current){e.preventDefault();e.returnValue='';}};
  const link=e=>{const a=e.target.closest?.('a[href]');if(a&&(dirty.current||writing.current)&&!confirm('Leave with unsaved record context?')){e.preventDefault();e.stopPropagation();}};
  const timer=setInterval(refresh,30000);addEventListener('focus',refresh);addEventListener('pageshow',refresh);addEventListener(DRAFT_CONTEXT_KEY,invalidate);addEventListener('storage',storage);addEventListener('pagehide',invalidate);addEventListener('beforeunload',leave);document.addEventListener('click',link,true);
  return()=>{alive.current=false;reads.current++;writes.current++;clearInterval(timer);channel?.close();removeEventListener('focus',refresh);removeEventListener('pageshow',refresh);removeEventListener(DRAFT_CONTEXT_KEY,invalidate);removeEventListener('storage',storage);removeEventListener('pagehide',invalidate);removeEventListener('beforeunload',leave);document.removeEventListener('click',link,true);};
 },[pageId,workspaceId,userId]);
 function choose(patch){dirty.current=true;setSelection(s=>({...s,...patch}));setMessage('');}
 async function save(e){e.preventDefault();if(writing.current||conflict||lost||!data?.canManage)return;writing.current=true;reads.current++;setLoading(false);const g=++writes.current;setBusy(true);setError('');setMessage('');
  try{const b=await request(api,scope,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...scope,expectedRevision:selection.revision,clientId:selection.client?.id||null,projectId:selection.project?.id||null})});if(!alive.current||g!==writes.current)return;
   dirty.current=false;revision.current=b.revision;setSelection(s=>({...s,revision:b.revision}));setMessage(b.unchanged?'Record context already saved.':'Record context saved.');
  }catch(e){if(alive.current&&g===writes.current){if(denied(e)){revoke();return;}if(e.status===409)setConflict(true);setError(e.message);}}
  finally{if(alive.current&&g===writes.current){writing.current=false;setBusy(false);if(!dirty.current)await load();}}
 }
 if(lost)return <section className="bo-page-record-context"><p role="alert">{error}</p></section>;
 return <section className="bo-page-record-context" aria-label="Page record context"><h2>Record context</h2><p className="bo-hint">Link this document to work. Linking does not change anyone’s access.</p>
  {loading&&<p role="status">Loading record context…</p>}{error&&<p role="alert">{error}</p>}{!data&&!loading&&<Button onClick={()=>load()}>Retry context</Button>}
  {data&&<div className="bo-form-actions">{data.client&&<Button href={data.client.href}>{data.client.name}</Button>}{data.project&&<Button href={data.project.href}>{data.project.name}</Button>}{!data.client&&!data.project&&<span className="bo-hint">No linked records are available to you.</span>}</div>}
  {data?.canManage&&!open&&<Button onClick={()=>{editing.current=true;adopt(data);setOpen(true);setMessage('');}}>Edit record context</Button>}
  {open&&<form onSubmit={save}><RecordPicker api={api} scope={scope} kind="client" selected={selection.client} onChange={client=>choose({client,project:null})} disabled={busy||conflict} onDenied={revoke}/>
   {selection.client&&<RecordPicker key={selection.client.id} api={api} scope={scope} kind="project" clientId={selection.client.id} selected={selection.project} onChange={project=>choose({project})} disabled={busy||conflict} onDenied={revoke}/>}
   {conflict&&<p role="alert">The saved context changed. Your selection is preserved. <Button disabled={busy} onClick={()=>{if(confirm('Replace this unsaved selection with the current saved context?'))load({replace:true});}}>Reopen saved context</Button></p>}
   <div className="bo-form-actions"><Button type="submit" variant="primary" disabled={busy||conflict||loading||!data?.canManage}>{busy?'Saving context…':'Save record context'}</Button><Button disabled={busy} onClick={()=>{if(dirty.current&&!confirm('Discard this unsaved record context?'))return;editing.current=false;dirty.current=false;setOpen(false);setConflict(false);setError('');}}>Cancel context edit</Button></div>
  </form>}{message&&<p role="status">{message}</p>}
 </section>;
}
