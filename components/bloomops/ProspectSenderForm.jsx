'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status} from './Primitives';
import {Icon} from './Icons';
export default function ProspectSenderForm({initial,onSaved,onDirty}){
 const [sender,setSender]=useState(initial.sender),[email,setEmail]=useState(initial.sender?.email||''),[name,setName]=useState(initial.sender?.displayName||''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
 const pending=useRef(false),notice=useRef(null);
 const edited=email!==(sender?.email||'')||name!==(sender?.displayName||'');
 useEffect(()=>{if(!edited)return;const leave=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[edited]);
 useEffect(()=>{onDirty?.(edited);},[edited,onDirty]);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(message)notice.current?.focus();},[message]);
 async function save(e){
  e.preventDefault();if(!ready||pending.current)return;pending.current=true;setBusy(true);setMessage('');setError(false);
  try{const response=await fetch('/api/bloomops/prospecting/sender',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:initial.workspaceId,expectedRevision:sender?.revision||0,fields:{provider:'google_workspace',email,displayName:name||null}})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Sender setup is unavailable. Reload and try again.');
   const savedEmail=email.trim().toLowerCase(),savedName=name.trim();setEmail(savedEmail);setName(savedName);setSender({provider:'google_workspace',email:savedEmail,displayName:savedName||null,revision:result.revision});await onSaved?.();setMessage('Sender identity saved. Sending is off.');
  }catch(e){setError(true);setMessage(e instanceof TypeError?'Check your connection and retry.':e.message);}finally{pending.current=false;setBusy(false);}
 }
 return <form onSubmit={save} className="bo-sender-form">
 <div className="bo-outreach-sender"><span className="bo-outreach-mark"><Icon name="mail" size={20}/></span><div><h2>Google Workspace</h2><span className="bo-hint">Sender identity</span></div></div>
 <p className="bo-hint">Save the address you intend to send from, then connect Google below.</p>
 {message&&<p ref={notice} tabIndex={-1} role={error?'alert':'status'} className="bo-skill-notice">{message}{error&&' Copy any unsaved changes before reloading.'}</p>}
 <fieldset disabled={!ready||busy} className="bo-outreach-fields">
 <Field id="sender-email" label="Sender email"><input id="sender-email" className="bo-control" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></Field>
 <Field id="sender-name" label="Sender name" optional><input id="sender-name" className="bo-control" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></Field>
 <p className="bo-hint">Changing the sender requires fresh content approval for saved drafts.</p>
 <Button type="submit" variant="primary" icon="check" loading={busy}>Save sender</Button>
 </fieldset>
 </form>;
}
