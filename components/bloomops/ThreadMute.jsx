'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import {notificationRequest} from '@/lib/bloomops/notification-client.mjs';
export default function ThreadMute({threadId,kind='record',workspaceId}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);
 async function load(){const run=++generation.current;setBusy(true);setError('');try{const next=await notificationRequest(`/api/bloomops/notifications?${new URLSearchParams({settings:'true',threadId,kind})}`);if(run!==generation.current)return;if(next.scope.workspaceId!==workspaceId)throw Error('Scope changed');setData(next);}catch{if(run===generation.current){setData(null);setError('Notification settings unavailable.');}}finally{if(run===generation.current)setBusy(false);}}
 useEffect(()=>{setData(null);load();return()=>{generation.current++;};},[threadId,kind,workspaceId]);
 async function toggle(){if(!data||busy)return;const run=generation.current;setBusy(true);setError('');try{await notificationRequest('/api/bloomops/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data.scope,action:'mute',threadId,kind,muted:!data.muted})});if(run===generation.current)setData(old=>({...old,muted:!old.muted}));}catch(e){if(run===generation.current){if([401,403,404].includes(e.status))setData(null);setError('Could not save. Try again.');}}finally{if(run===generation.current)setBusy(false);}}
 return <span><Button variant="ghost" icon="bell" disabled={!data||busy} onClick={toggle}>{data?.muted?'Unmute thread':'Mute thread'}</Button>{error&&<><span role="alert" className="bo-hint">{error}</span>{!data&&<Button variant="ghost" disabled={busy} onClick={load}>Retry notification settings</Button>}</>}</span>;
}
