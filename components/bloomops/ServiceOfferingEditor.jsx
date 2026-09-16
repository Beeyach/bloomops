'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field} from './Primitives';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
export default function ServiceOfferingEditor({initial=null,workspaceId,userId,onSaved,onCancel}){
 const [name,setName]=useState(initial?.name||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[lost,setLost]=useState(false);
 const live=useRef(false),lock=useRef(false),requestId=useRef(null),input=useRef(null);
 useEffect(()=>{live.current=true;requestId.current=crypto.randomUUID();input.current?.focus();const invalidate=()=>{live.current=false;setLost(true);};const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();};let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}addEventListener(DRAFT_CONTEXT_KEY,invalidate);addEventListener('storage',storage);return()=>{live.current=false;channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,invalidate);removeEventListener('storage',storage);};},[]);
 async function save(event){event.preventDefault();if(lock.current||!live.current)return;lock.current=true;setBusy(true);setError('');try{
  const response=await fetch('/api/bloomops/service-offerings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,userId,name,...(initial?{id:initial.id,expectedUpdatedAt:initial.updatedAt}:{requestId:requestId.current})})}),body=await response.json();
  if(!live.current)return;if(!response.ok||!body.ok)throw Error(body.error||'Offering could not be saved. Keep your name and retry, or search the catalogue to check a previous save.');onSaved(body.offering);
 }catch(e){if(live.current)setError(e.message);}finally{lock.current=false;if(live.current)setBusy(false);}}
 if(lost)return <p role="alert">Your account or workspace changed. Reload before editing offerings.</p>;
 return <section className="bo-handoff-setup" aria-label="Custom service offering"><h2>{initial?'Edit custom offering':'Add a custom offering'}</h2><p>This reusable offering is separate from the client’s purchased scope. Custom offerings use common onboarding unless other existing services require specific categories.</p><form onSubmit={save}><Field id="custom-offering-name" label="Offering name"><input ref={input} id="custom-offering-name" className="bo-control" value={name} maxLength={120} required disabled={busy} onChange={e=>setName(e.target.value)}/></Field>{error&&<p role="alert">{error}</p>}<div className="bo-form-actions"><Button type="submit" disabled={busy} loading={busy}>Save offering</Button><Button disabled={busy} onClick={onCancel}>Cancel offering edit</Button></div></form></section>;
}
