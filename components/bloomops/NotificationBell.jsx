'use client';
import {useEffect,useRef,useState,useId} from 'react';
import {usePathname} from 'next/navigation';
import {Icon} from './Icons';
import {notificationRequest} from '@/lib/bloomops/notification-client.mjs';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
import styles from './NotificationBell.module.css';

export default function NotificationBell({scope}) {
 return <ScopedBell key={JSON.stringify(scope)} scope={scope}/>;
}
function ScopedBell({scope}) {
 const pathname=usePathname(),id=useId(),dialog=useRef(null),trigger=useRef(null);
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[opening,setOpening]=useState(false);
 const alive=useRef(false),lost=useRef(false),generation=useRef(0),mutation=useRef(0),writing=useRef(false),controller=useRef(null);
 const active=()=>alive.current&&!lost.current;
 const same=value=>value?.workspaceId===scope.workspaceId&&value.userId===scope.userId&&value.membershipId===scope.membershipId;
 function dismiss(){generation.current++;controller.current?.abort();setBusy(false);setOpen(false);dialog.current?.close();trigger.current?.focus();}
 function revoke(){lost.current=true;generation.current++;mutation.current++;controller.current?.abort();setData(null);setError('Your account or workspace changed. Reload to continue.');setBusy(false);setOpening(false);}
 async function load(){
  if(!active()||writing.current||!scope.membershipId)return;
  const run=++generation.current;controller.current?.abort();controller.current=new AbortController();setBusy(true);setError('');
  try{const next=await notificationRequest('/api/bloomops/notifications',{signal:controller.current.signal});
   if(!active()||run!==generation.current)return;
   if(!same(next.scope)){revoke();return;}setData(next);
  }catch(e){if(active()&&run===generation.current&&e.name!=='AbortError'){setData(null);if([401,403,404].includes(e.status))revoke();else setError('Notifications could not load. Try again.');}}
  finally{if(active()&&run===generation.current)setBusy(false);}
 }
 useEffect(()=>{
  alive.current=true;
  const invalidate=()=>revoke(),storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)revoke();};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
  window.addEventListener(DRAFT_CONTEXT_KEY,invalidate);window.addEventListener('storage',storage);
  return()=>{alive.current=false;generation.current++;mutation.current++;controller.current?.abort();channel?.close();window.removeEventListener(DRAFT_CONTEXT_KEY,invalidate);window.removeEventListener('storage',storage);};
 },[]);
 useEffect(()=>{
  // The full inbox owns its own refresh. The bell adds no polling loop.
  if(pathname==='/notifications'){setData(null);return;}
  load();const refresh=()=>{if(!document.hidden)load();};window.addEventListener('focus',refresh);
  return()=>{generation.current++;controller.current?.abort();window.removeEventListener('focus',refresh);};
 },[pathname]);
 useEffect(()=>{if(!open)return;const node=dialog.current;
  if(matchMedia('(max-width:767px)').matches)node.showModal();else node.show();
  node.querySelector('button')?.focus();
  const outside=e=>{if(!node.contains(e.target)&&!trigger.current?.contains(e.target))dismiss();};
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{node.close();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 async function openItem(item){
  if(!active()||writing.current)return;writing.current=true;const run=++mutation.current;generation.current++;controller.current?.abort();setBusy(false);setOpening(true);setError('');
  try{const result=await notificationRequest('/api/bloomops/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...scope,action:'open',id:item.id})});if(active()&&run===mutation.current)location.assign(result.href);}
  catch(e){if(active()&&run===mutation.current){if([401,403,404].includes(e.status))revoke();else setError('This notification could not open. Try again.');}}
  finally{if(active()&&run===mutation.current){writing.current=false;setOpening(false);}}
 }
 const count=data?.unread;
 return <div className={styles.root}>
  <button ref={trigger} className={styles.bell} aria-label={count?`Notifications, ${count} unread`:'Notifications'} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>{if(open)dismiss();else{setData(null);setOpen(true);load();}}}><Icon name="bell" size={20}/>{count>0&&<span className={styles.badge} aria-hidden="true">{count>99?'99+':count}</span>}</button>
  <dialog ref={dialog} id={id} className={styles.panel} aria-label="Recent notifications" onCancel={e=>{e.preventDefault();dismiss();}} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();}}}>
   <header><h2>Notifications</h2><button onClick={dismiss} aria-label="Close notifications"><Icon name="x" size={18}/></button></header>
   {busy&&<p role="status">Loading notifications…</p>}
   {error&&<div role="alert"><p>{error}</p>{!lost.current&&<button onClick={load}>Try again</button>}</div>}
   {!busy&&data&&<><p className={styles.count}>{data.unread} unread in this workspace</p><ul>{data.items.slice(0,6).map(item=><li key={item.id} className={item.readAt?'':styles.unread}><button disabled={opening} onClick={()=>openItem(item)}><span><strong>{item.author}</strong> {item.category==='mentions'?'mentioned you':item.category==='assignments'?'assigned you a task':'replied to your conversation'}</span><strong>{item.title}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time>{!item.readAt&&<span className={styles.unreadLabel}>Unread</span>}</button></li>)}</ul>{!data.items.length&&<div className={styles.empty}><Icon name="bell" size={24}/><h3>No notifications yet</h3><p>Mentions, replies and assignments will appear here.</p></div>}</>}
   <footer><a href="/notifications">View all notifications</a></footer>
  </dialog>
 </div>;
}
