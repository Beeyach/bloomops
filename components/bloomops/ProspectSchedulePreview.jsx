'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field} from './Primitives';
export default function ProspectSchedulePreview({data,dirty}){
 const [start,setStart]=useState(''),[plan,setPlan]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false),notice=useRef(null),scope=useRef('');scope.current=JSON.stringify([data.draft?.revision,data.profile.revision,data.sender?.revision,dirty]);
 useEffect(()=>setStart(new Date(Math.ceil(Date.now()/60000)*60000).toISOString().slice(0,16)),[]);
 useEffect(()=>{setPlan(null);setError('');},[data.draft?.revision,data.profile.revision,data.sender?.revision,dirty]);
 useEffect(()=>{if(error||plan)notice.current?.focus();},[error,plan]);
 async function preview(e){e.preventDefault();if(pending.current||dirty||!data.draft)return;const requestedScope=scope.current;pending.current=true;setBusy(true);setError('');setPlan(null);try{const response=await fetch('/api/bloomops/prospecting/schedule-preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:data.profile.workspaceId,prospectId:data.profile.id,expectedRevision:data.draft.revision,expectedProfileRevision:data.profile.revision,expectedSenderRevision:data.sender?.revision||0,earliestAt:new Date(start+'Z').toISOString()})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Timing could not be previewed.');if(scope.current===requestedScope)setPlan(result);}catch(e){setError(e instanceof TypeError?'Check your connection and retry.':e.message);}finally{pending.current=false;setBusy(false);}}
 return <section className="bo-schedule-preview"><h2>Preview timing</h2><p>Weekdays from 9–11 a.m. in the recipient’s timezone. Three business days to the first follow-up, then five more.</p>
 <form onSubmit={preview}><Field id="schedule-start" label="Earliest start (UTC)"><input id="schedule-start" type="datetime-local" className="bo-control" required min="2000-01-01T00:00" max="2100-12-31T23:59" value={start} disabled={busy} onChange={e=>{setStart(e.target.value);setPlan(null);}}/></Field><Button type="submit" icon="calendar" disabled={!start||busy||dirty||!data.draft} loading={busy}>Preview timing</Button></form>
 {dirty&&<p className="bo-hint">Save draft changes before previewing timing.</p>}{error&&<p ref={notice} tabIndex={-1} role="alert" className="bo-skill-notice">{error}</p>}
 {plan&&<div ref={notice} tabIndex={-1} className="bo-schedule-result"><p><strong>Recipient timezone</strong> {plan.timeZone}</p><ol>{plan.messages.map((item,i)=><li key={item.number}><strong>{['Introduction','First follow-up','Second follow-up'][i]}</strong><time dateTime={item.at}>{item.local}</time></li>)}</ol><p className="bo-hint">{plan.note}</p></div>}
 </section>;
}
