'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,PageHeader} from './Primitives';
import PageBody from './PageBody';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';

function useTemplateAccess(api,scope,initial=null){
 const [data,setData]=useState(initial),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[denied,setDenied]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(false),[conflict,setConflict]=useState(false);
 const live=useRef(true),read=useRef(0),write=useRef(0),writing=useRef(false),pending=useRef(null),lost=useRef(false);
 const same=b=>b?.scope?.userId===scope.userId&&b?.scope?.workspaceId===scope.workspaceId;
 const revoke=()=>{lost.current=true;read.current++;write.current++;pending.current=null;writing.current=false;setData(null);setBusy(false);setLoading(false);setDenied(true);setError('Your Page template access or workspace changed. Reopen in the correct account.');};
 async function load({reset=false}={}){if(writing.current||lost.current)return;if(reset){setError('');setConflict(false);}const g=++read.current;setLoading(true);
  try{const r=await fetch(api,{cache:'no-store'}),b=await r.json();if(!live.current||g!==read.current)return;if([401,403,404].includes(r.status)||r.ok&&!same(b)){revoke();return;}if(!r.ok)throw Error('Could not load the saved template. Retry when connected.');setData(b.source||b.template);}
  catch(e){if(live.current&&g===read.current){setData(null);setError(e.message);}}
  finally{if(live.current&&g===read.current)setLoading(false);}
 }
 useEffect(()=>{live.current=true;load();const refresh=()=>{if(!document.hidden)load();},change=()=>revoke(),storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)revoke();};let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=change;}catch{}const timer=setInterval(refresh,30000);
  addEventListener('focus',refresh);addEventListener('pageshow',refresh);addEventListener(DRAFT_CONTEXT_KEY,change);addEventListener('storage',storage);addEventListener('pagehide',change);
  return()=>{live.current=false;read.current++;write.current++;channel?.close();clearInterval(timer);removeEventListener('focus',refresh);removeEventListener('pageshow',refresh);removeEventListener(DRAFT_CONTEXT_KEY,change);removeEventListener('storage',storage);removeEventListener('pagehide',change);};
 },[api,scope.userId,scope.workspaceId]);
 async function mutate(command){if(writing.current||lost.current)return;command=pending.current||command;pending.current=command;writing.current=true;read.current++;setLoading(false);const g=++write.current;setBusy(true);setError('');setMessage('');setRetry(false);let succeeded=false;
  try{const r=await fetch(command.url,{method:command.method,headers:{'content-type':'application/json'},body:JSON.stringify(command.body)}),b=await r.json();if(!live.current||g!==write.current)return;
   if([401,403,404].includes(r.status)||r.ok&&!same(b)){revoke();return;}if(!r.ok){if(r.status<500)pending.current=null;if(r.status===409)setConflict(true);throw Error(b.error||'The change could not be confirmed. Retry the same request.');}
   pending.current=null;succeeded=true;if(command.create){window.location.assign('/pages/'+b.id);return;}setMessage(b.unchanged?'This saved version is already captured.':'Page template updated.');
  }catch(e){if(live.current&&g===write.current){setError(e.message);setRetry(!!pending.current);}}
  finally{if(live.current&&g===write.current){writing.current=false;setBusy(false);if(succeeded)await load({reset:true});}}
 }
 return {data,loading,busy,error,denied,message,retry,conflict,load:()=>load({reset:true}),mutate,pending};
}
export function PageTemplateTools({pageId,workspaceId,userId,disabled}){
 const [open,setOpen]=useState(false);return <section className="bo-page-record-context" aria-label="Reusable Page template"><h2>Reusable template</h2><p className="bo-hint">Capture saved writing for a new private Page. Existing Pages keep their own content.</p>
 <Button href="/pages/templates" variant="ghost">Browse Page templates</Button>{!open?<Button disabled={disabled} onClick={()=>setOpen(true)}>Review saved Page as template</Button>:<TemplateSource key={JSON.stringify([pageId,workspaceId,userId])} pageId={pageId} scope={{workspaceId,userId}} disabled={disabled}/>}
 {disabled&&<p>Finish saving this Page before capturing a template.</p>}</section>;
}
function TemplateSource({pageId,scope,disabled}){
 const api=`/api/bloomops/pages/${pageId}/template`,state=useTemplateAccess(api,scope),s=state.data;
 if(state.denied)return <p role="alert">{state.error}</p>;
 return <>{state.loading&&<p role="status">Loading saved template information…</p>}{state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}{state.busy&&<p role="status">Saving template change…</p>}
 {!s&&!state.loading&&<Button onClick={state.load}>Retry template information</Button>}
 {s&&<><p><strong>{s.title}</strong></p><p>Saved Page revision {s.sourceRevision}. {s.version?`Reusable version ${s.version}${s.active?'':' (retired)'}.`:'No reusable version yet.'}</p><p className="bo-hint">Only this saved title and writing are copied. Sharing, linked records, comments and subpages stay separate.</p>
 <details open><summary>Saved writing to capture</summary><PageBody key={s.sourceRevision} page={{id:pageId,workspaceId:scope.workspaceId,body:s.body,canReadWork:true}}/></details>
 <div className="bo-form-actions">{!state.retry&&<Button disabled={disabled||state.busy||state.loading||state.conflict} onClick={()=>state.mutate({url:api,method:'POST',body:{...scope,requestId:crypto.randomUUID(),expectedRevision:s.revision,expectedPageRevision:s.sourceRevision}})}>Save template version</Button>}
 {s.versionId&&<Button href={`/pages/templates/${s.versionId}`}>Preview saved template</Button>}
 {s.versionId&&!state.retry&&<Button disabled={state.busy||state.loading||state.conflict} onClick={()=>{if(confirm(s.active?'Retire this template from new Page creation? Existing Pages remain unchanged.':'Restore this template for new Page creation?'))state.mutate({url:api,method:'PATCH',body:{...scope,expectedRevision:s.revision,active:!s.active}});}}>{s.active?'Retire template':'Restore template'}</Button>}</div></>}
 {state.retry&&<Button disabled={state.busy} onClick={()=>state.mutate()}>Retry template change</Button>}{state.conflict&&<Button onClick={state.load}>Reopen saved template information</Button>}</>;
}
export function PageTemplatePreview({initial,scope}){
 const state=useTemplateAccess(`/api/bloomops/page-templates/${initial.id}`,scope,initial),t=state.data;
 if(state.denied)return <p role="alert">{state.error}</p>;
 return <div className="bo-page-template-preview"><Button href="/pages/templates" variant="ghost">Back to Page templates</Button>{state.error&&<p role="alert">{state.error}</p>}{state.loading&&<p role="status">Checking current template access…</p>}{state.busy&&<p role="status">Creating your private Page…</p>}
 {!t&&!state.loading&&<Button onClick={state.load}>Retry template preview</Button>}
 {t&&<><PageHeader title={t.title} subtitle={`Saved reusable version ${t.version}. Private internal preview.`}/><p>Creates a new private top-level Page. Referenced work stays live and requires its own access; linked records, comments, sharing and subpages are not copied.</p>
 <div className="bo-form-actions"><Button href={`/pages/${t.pageId}`}>Edit source Page</Button>{!state.retry&&<Button variant="primary" disabled={state.busy||state.loading||!t.active||!t.current||state.conflict} onClick={()=>state.mutate({url:'/api/bloomops/page-templates/create',method:'POST',create:true,body:{...scope,versionId:t.id,requestId:crypto.randomUUID()}})}>Create Page from this version</Button>}</div>
 {!t.active&&<p role="status">Retired. Existing Pages are unchanged.</p>}{!t.current&&<p role="status">A newer reusable version is available in the catalogue.</p>}
 <PageBody key={t.id} page={{id:t.pageId,workspaceId:t.workspaceId,body:t.body,canReadWork:true}}/></>}
 {state.retry&&<Button disabled={state.busy} onClick={()=>state.mutate()}>Retry Page creation</Button>}{state.conflict&&<Button href="/pages/templates">Reopen current templates</Button>}</div>;
}
