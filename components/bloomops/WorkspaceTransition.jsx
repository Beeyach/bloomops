'use client';
import {useEffect,useRef,useState} from 'react';
import {changeDraftContext} from '@/lib/bloomops/draft-context.mjs';
import {Button} from './Primitives';
export const WORKSPACE_INTENT='bloomsi:workspace-navigation';
// The old document must actually unload before any workspace cookie changes.
// This one-use, tab-local navigation intent is not workspace authority: the
// existing authenticated selection endpoint still checks current membership.
export default function WorkspaceTransition({nonce,userId}){
 const started=useRef(false),target=useRef(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 async function select(){
  if(!target.current)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/bloomops/workspaces/select',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:target.current})}),body=await response.json();
   if(!response.ok||!['/','/portal','/prospecting'].includes(body.redirect))throw Error();
   changeDraftContext();location.replace(body.redirect);
  }catch{setBusy(false);setError('Workspace selection could not be confirmed. Retry or open your workspace list to check it.');}
 }
 useEffect(()=>{
  if(started.current)return;started.current=true;
  try{
   const intent=JSON.parse(sessionStorage.getItem(WORKSPACE_INTENT)||'null');
   if(!intent||intent.nonce!==nonce||intent.userId!==userId||typeof intent.workspaceId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(intent.workspaceId)||Date.now()-intent.createdAt<0||Date.now()-intent.createdAt>60000)throw Error();
   sessionStorage.removeItem(WORKSPACE_INTENT);target.current=intent.workspaceId;select();
  }catch{setBusy(false);setError('This workspace selection expired. Choose it again from your workspace list.');}
 },[nonce,userId]);
 return <section aria-label="Workspace selection"><p role={error?'alert':'status'}>{error||'Switching workspace…'}</p>{error&&target.current&&<Button disabled={busy} onClick={select}>Retry workspace switch</Button>}<Button href="/workspaces" variant="ghost">View all workspaces</Button></section>;
}
