'use client';
import {useEffect,useRef,useState} from 'react';
import {Icon} from './Icons';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
import {WORKSPACE_INTENT} from './WorkspaceTransition';
import styles from './WorkspaceSwitcher.module.css';
export default function WorkspaceSwitcher({workspace,userId,membershipId}){
 return <Switcher key={JSON.stringify([workspace.id,userId,membershipId])} workspace={workspace} userId={userId}/>;
}
function Switcher({workspace,userId}){
 const root=useRef(null),trigger=useRef(null),generation=useRef(0),controller=useRef(null),active=useRef(false),writing=useRef(false);
 const [open,setOpen]=useState(false),[rows,setRows]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[switching,setSwitching]=useState(null),[lost,setLost]=useState(false);
 function dismiss(){generation.current++;controller.current?.abort();setOpen(false);setBusy(false);trigger.current?.focus();}
 useEffect(()=>{
  active.current=true;
  const invalidate=()=>{active.current=false;generation.current++;controller.current?.abort();setRows(null);setLost(true);setBusy(false);};
  const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();};
  const pointer=e=>{if(root.current&&!root.current.contains(e.target)&&!writing.current){generation.current++;controller.current?.abort();setOpen(false);setBusy(false);}};
  const key=e=>{if(e.key==='Escape'&&root.current?.contains(document.activeElement)&&!writing.current){e.preventDefault();dismiss();}};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
  addEventListener(DRAFT_CONTEXT_KEY,invalidate);addEventListener('storage',storage);document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);
  return()=>{active.current=false;generation.current++;controller.current?.abort();channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,invalidate);removeEventListener('storage',storage);document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);};
 },[]);
 async function load(){
  if(!active.current||writing.current)return;const stamp=++generation.current;controller.current?.abort();controller.current=new AbortController();setBusy(true);setError('');setRows(null);
  try{const r=await fetch('/api/bloomops/workspaces?page=1',{cache:'no-store',signal:controller.current.signal}),data=await r.json();if(!active.current||stamp!==generation.current)return;if(!r.ok||!Array.isArray(data.workspaces))throw Error();setRows(data.workspaces.slice(0,8));}
  catch(e){if(active.current&&stamp===generation.current&&e.name!=='AbortError')setError('Workspaces could not load. Try again.');}
  finally{if(active.current&&stamp===generation.current)setBusy(false);}
 }
 function choose(id){
  if(!active.current||writing.current)return;if(id===workspace.id){dismiss();return;}
  try{
   const nonce=crypto.randomUUID();
   sessionStorage.setItem(WORKSPACE_INTENT,JSON.stringify({nonce,userId,workspaceId:id,createdAt:Date.now()}));
   // Native navigation runs existing unsaved-draft guards before leaving.
   // Selection starts on the next document only, so cancel never changes scope.
   location.assign('/workspaces?switch='+encodeURIComponent(nonce));
  }catch{setError('This browser could not start the switch. Open View all workspaces to choose it.');}
 }

 return <div className={styles.root} ref={root}><button ref={trigger} type="button" className="bo-workspace-control" title={workspace.name} aria-label={`Switch workspace: ${workspace.name}`} aria-expanded={open} disabled={!!switching} onClick={()=>{if(open)dismiss();else{setOpen(true);load();}}}><Icon name="team" size={18}/><span><small>Workspace</small><strong>{workspace.name}</strong></span><Icon name="chevron-down" size={16}/></button>
 {open&&<section className={styles.panel} aria-label="Switch workspace"><h2>Your workspaces</h2>{lost?<p role="alert">Your account or workspace changed. Reload to continue.</p>:<>{busy&&<p role="status">Loading workspaces…</p>}{error&&<div role="alert"><p>{error}</p><button className="bo-btn" onClick={load} disabled={!!switching}>Retry</button></div>}{rows&&<ul>{rows.map(row=><li key={row.id}><button type="button" aria-current={row.id===workspace.id?'true':undefined} disabled={!!switching} onClick={()=>choose(row.id)}><span>{row.name}</span>{row.id===workspace.id?<Icon name="check" size={18}/>:switching===row.id?<span role="status">Switching…</span>:null}</button></li>)}</ul>}{rows?.length===0&&<p>No active memberships were returned.</p>}</>}<a className="bo-btn bo-btn-ghost" href="/workspaces">View all workspaces</a></section>}
 </div>;
}
