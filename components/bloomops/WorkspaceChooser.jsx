'use client';
import {useEffect,useState} from 'react';
import {changeDraftContext} from '@/lib/bloomops/draft-context.mjs';
import {signOutAndLeave} from './session-client.mjs';
import {Button,Field,Status} from './Primitives';
export default function WorkspaceChooser({workspaces,currentId,canCreate}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(null),[error,setError]=useState(''),[name,setName]=useState(''),[requestId,setRequestId]=useState('');
 useEffect(()=>{setReady(true);setRequestId(crypto.randomUUID());},[]);
 async function select(id){
  const response=await fetch('/api/bloomops/workspaces/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:id})});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'Workspace is unavailable.');
  changeDraftContext();
  window.location.assign(body.redirect);
 }
 async function choose(id){setBusy(id);setError('');try{await select(id);}catch(e){setError(e.message);setBusy(null);}}
 async function create(e){e.preventDefault();if(!ready||busy)return;setBusy('create');setError('');
  try{const response=await fetch('/api/bloomops/workspaces',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,requestId,sourceWorkspaceId:currentId})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Workspace could not be created.');await select(body.workspaceId);}
  catch(e){setError(e.message);setBusy(null);}
 }
 return <>
  <Button disabled={!ready||!!busy} variant="ghost" onClick={()=>signOutAndLeave()}>Sign out</Button>
  {error&&<p className="bo-prospect-notice" role="alert">{error}</p>}
  <ul className="bo-workspace-choices" aria-label="Your workspaces">{workspaces.map(workspace=><li key={workspace.id}>
   <div><h2>{workspace.name}</h2><dl className="bo-workspace-meta"><div><dt>Your role</dt><dd>{workspace.roleLabel}</dd></div><div><dt>Workspace</dt><dd>{workspace.purpose==='prospecting'?'Prospecting':'Agency operations'}</dd></div></dl></div>
   {workspace.id===currentId?<Status tone="info" label="Current workspace"/>:<Button disabled={!ready||!!busy} loading={busy===workspace.id} onClick={()=>choose(workspace.id)}>Open {workspace.name}</Button>}
  </li>)}</ul>
  {!workspaces.length&&<p className="bo-body">No active workspace membership. Contact your workspace administrator.</p>}
  {canCreate&&<section className="bo-prospect-section" aria-labelledby="fresh-workspace-title"><h2 id="fresh-workspace-title">Start a fresh prospecting workspace</h2>
   <p className="bo-body">Your existing workspaces stay available. The new workspace starts empty, with you as its owner.</p>
   <form onSubmit={create} className="bo-workspace-create"><fieldset disabled={!ready||!!busy}>
    <Field id="new-workspace-name" label="Workspace name"><input id="new-workspace-name" className="bo-control" maxLength={80} required value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></Field>
    <Button type="submit" variant="primary" loading={busy==='create'}>Create workspace</Button>
   </fieldset></form>
  </section>}
 </>;
}
