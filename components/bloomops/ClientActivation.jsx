'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button,Notice} from './Primitives';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';

export default function ClientActivation({clientId,draft,activation,workspaceId,userId}) {
 const router=useRouter(),live=useRef(false),readGeneration=useRef(0),locked=useRef(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[outcome,setOutcome]=useState(null),[readiness,setReadiness]=useState(null),[confirmed,setConfirmed]=useState(false),[lost,setLost]=useState(false);
 const current=outcome||activation,activated=Boolean(current);
 async function check(){
  if(!live.current||locked.current||activated)return;
  const generation=++readGeneration.current;setLoading(true);setError('');setConfirmed(false);
  try{const r=await fetch(`/api/bloomops/clients/${clientId}/readiness`,{cache:'no-store'}),data=await r.json();if(!live.current||generation!==readGeneration.current)return;
   if(!r.ok)throw Error('Readiness could not be checked. Retry or reopen this client.');
   if(data.scope?.userId!==userId||data.scope?.workspaceId!==workspaceId||data.scope?.clientId!==clientId){setLost(true);setReadiness(null);return;}setReadiness(data);
  }catch(e){if(live.current&&generation===readGeneration.current){setReadiness(null);setError(e.message);}}
  finally{if(live.current&&generation===readGeneration.current)setLoading(false);}
 }
 useEffect(()=>{
  live.current=true;check();
  const invalidate=()=>{live.current=false;readGeneration.current++;setReadiness(null);setConfirmed(false);setLost(true);};
  const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
  addEventListener('focus',check);addEventListener(DRAFT_CONTEXT_KEY,invalidate);addEventListener('storage',storage);
  return()=>{live.current=false;readGeneration.current++;channel?.close();removeEventListener('focus',check);removeEventListener(DRAFT_CONTEXT_KEY,invalidate);removeEventListener('storage',storage);};
 },[clientId,workspaceId,userId,activated]);
 async function submit(e){
  e.preventDefault();if(locked.current||!live.current||(!activated&&(!readiness?.ready||!confirmed||loading)))return;
  locked.current=true;readGeneration.current++;setLoading(false);setBusy(true);setError('');
  try{const response=await fetch(`/api/bloomops/clients/${clientId}/${activated?'retry-invitation':'activate'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,userId,...(!activated?{reviewHash:readiness.reviewHash}:{})})}),data=await response.json();
   if(!live.current)return;
   if(!response.ok){setError(data.error||'Activation could not be confirmed. Recheck readiness.');setConfirmed(false);setReadiness(null);return;}
   setOutcome({...data,retryAvailable:data.deliveryStatus==='failed'||data.deliveryStatus==='pending'});router.refresh();
  }catch{if(live.current)setError('We could not confirm the result. Reload to check the client before trying again.');}
  finally{locked.current=false;if(live.current)setBusy(false);}
 }
 if(!draft&&!activated)return null;
 if(lost)return <Notice tone="error">Your workspace or account changed. Reopen the client before continuing.</Notice>;
 const recovery=readiness?.reason==='existing_open_instance'?{tab:'onboarding',label:'existing onboarding'}:['services_required','too_many_services'].includes(readiness?.reason)?{tab:'services',label:'purchased services'}:{tab:'overview',label:'client details'};
 const templateProblem=['missing_published_template','invalid_definition','definition_conflict'].includes(readiness?.reason);
 return <section className="bo-client-readiness" aria-label="Client activation">
  <h2>{activated?'Activation status':'Prepare onboarding'}</h2>
  {activated?<Notice tone={current.deliveryStatus==='sent'&&!current.retryAvailable?'success':'warning'}>{current.deliveryStatus==='sent'&&current.retryAvailable?'Client activated. The portal invitation has expired. Retry to send a new invitation.':current.deliveryStatus==='sent'?'Client activated. The portal invitation has been sent.':current.deliveryStatus==='sending'?'Client activated. The invitation is being sent. Reload to check its progress.':'Client activated. The invitation could not be sent. You can retry it safely.'}</Notice>:<>
   <p>Draft client details and services are saved independently. Checking readiness sends nothing.</p>
   {loading&&<p role="status">Checking contact, purchased services and onboarding instructions…</p>}
   {readiness&&!loading&&(readiness.ready?<><p><strong>Ready:</strong> {readiness.serviceCount} purchased {readiness.serviceCount===1?'service':'services'} and {readiness.stepCount} onboarding steps.</p><p>Activating creates onboarding and sends a portal invitation to <strong>{readiness.recipient}</strong>.</p></>:<div className="bo-readiness-recovery"><p>{readiness.message}</p>{templateProblem?(readiness.canManageTemplates?<><Button href={'/settings/onboarding?clientId='+encodeURIComponent(clientId)+'&workspaceId='+encodeURIComponent(workspaceId)} target="_blank" rel="noopener noreferrer" icon="settings">Review onboarding setup</Button><p>Setup opens in a new tab. Return here and recheck readiness.</p></>:<p>Template-management permission is required. A workspace Owner, Admin or an authorized template manager can prepare these instructions.</p>):<Button href={`/clients/${clientId}?tab=${recovery.tab}${readiness.reason?.startsWith('primary_')?'#contacts':''}`}>Review {recovery.label}</Button>}</div>)}
   <Button onClick={check} disabled={loading||busy}>Recheck readiness</Button>
  </>}
  {error&&<div role="alert"><Notice tone="error">{error}</Notice></div>}
  {(!activated||current.retryAvailable)&&<form onSubmit={submit} className="bo-activation-actions">
   {!activated&&readiness?.ready&&!loading&&<label className="bo-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Create onboarding and send this portal invitation.</label>}
   <Button type="submit" variant="primary" loading={busy} disabled={busy||(!activated&&(!readiness?.ready||!confirmed||loading))}>{activated?'Retry invitation':'Activate client and send invitation'}</Button>
  </form>}
 </section>;
}
