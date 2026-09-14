'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Status} from './Primitives';
import {Icon} from './Icons';
const reasonText={
 connect:'Connect Google in Sender setup before reviewing this mailbox.',
 connection:'Check your Google connection in Sender setup first.',
 no_deliveries:'No accepted conversations to review yet.',
 limit:'This account has more conversations than one review can cover.',
 thread_checks:'Check the existing conversations before reviewing older mail.',
 disabled:'Live mailbox review is not available yet.',
 busy:'A mailbox review is already in progress.',
 cooldown:'Wait briefly, then reload status before checking again.',
};
const checkpointReasons={collection:'Complete a mailbox collection first.',incomplete:'Check available mail again to finish the recent changes.',unassigned:'Review the unassigned messages before choosing a starting point.',connection:'Check the Google connection in Sender setup first.',expired:'This collection is over five minutes old. Check available mail again.',changed:'The account or conversations changed. Check available mail again.',disabled:'Saving a starting point is not available yet.',used:'This collection has already been used.'};
const date=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' UTC':'Not checked';
function Results({data}){
 return <dl className="bo-mailbox-facts">
  <div><dt>Matched messages</dt><dd>{data.matchedCount}</dd></div><div><dt>Unassigned messages</dt><dd>{data.unassignedCount}</dd></div>
  <div><dt>Available messages</dt><dd><Status tone="success" label="Collected"/></dd></div><div><dt>Recent changes</dt><dd><Status tone={data.catchupStatus==='complete'?'success':'warning'} label={data.catchupStatus==='complete'?'Checked':'Incomplete'}/></dd></div>
 </dl>;
}
export default function ProspectMailboxReview({initial}){
 const [data,setData]=useState(initial),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[reviewed,setReviewed]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(false),[checkpointAck,setCheckpointAck]=useState(false),[saving,setSaving]=useState(false);
 const pending=useRef(false),message=useRef(null);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(notice)message.current?.focus();},[notice]);
 async function refresh(){
  const response=await fetch('/api/bloomops/prospecting/mailbox',{cache:'no-store'});if(!response.ok)throw Error('Status could not reload. Try again.');
  const next=await response.json();setData(next);setReviewed(false);setCheckpointAck(false);return next;
 }
 async function act(check=false,save=false){
  if(!ready||pending.current||check&&(!data.canRecover||!reviewed)||save&&(!data.checkpoint?.canSave||!checkpointAck))return;
  pending.current=true;setBusy(true);setChecking(check);setSaving(save);setNotice('');setError(false);
  try{
   let response,result;
   if(check||save){response=await fetch(save?'/api/bloomops/prospecting/mailbox/checkpoint':'/api/bloomops/prospecting/mailbox',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:data.workspaceId,...(save?{selection:data.checkpoint.selection}:{accountEmail:data.accountEmail}),expectedRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true})});result=await response.json();}
   const next=await refresh();
   if((check||save)&&!response.ok)throw Error(result.error||'Review could not complete. Check the status and try again.');
   setNotice(save?'Starting point saved. Older mail remains unverified and outreach stays held.':check?(next.latest?.from?'Collection saved. Outreach holds remain in place.':'No collection was saved. Check the status before trying again.'):'Status updated.');
   setError(Boolean(check&&!next.latest?.from));
  }catch(e){setError(true);setNotice(e instanceof TypeError?'Check your connection, then reload status.':e.message);}finally{pending.current=false;setBusy(false);}
 }
 const checkpoint=data.checkpoint;
 const latest=data.latest,saved=Boolean(latest?.from);
 return <div className="bo-mailbox-review">
  <section className="bo-mailbox-account"><span className="bo-outreach-mark"><Icon name="mail" size={20}/></span><div><h2>{data.accountEmail||'Google mailbox'}</h2><p>{data.total} accepted {data.total===1?'conversation':'conversations'}</p></div><Button href="/prospecting/sender" variant="ghost">Sender setup</Button></section>
  <div className="bo-mailbox-coverage"><Status tone="warning" glyph="dash" label="Older mail unverified"/><p>Completing a check does not release outreach holds.</p></div>
  <section className="bo-mailbox-result"><div className="bo-mailbox-heading"><h2>Latest review</h2>{latest&&<time dateTime={latest.finishedAt||latest.startedAt}>{date(latest.finishedAt||latest.startedAt)}</time>}</div>
   {saved?<><Results data={latest}/>{latest.catchupStatus!=='complete'&&<p className="bo-mailbox-warning">Recent changes could not be fully checked. The available-message collection is saved.</p>}{latest.unassignedCount>0&&<p className="bo-hint">Unassigned messages are saved for review without linking them to a prospect.</p>}</>:<div className="bo-mailbox-empty"><Icon name="history" size={24}/><h3>{latest?.status==='checking'?'Review in progress':latest?'No collection saved':'No mailbox review yet'}</h3><p>{latest?'Reload status before starting another check.':'A check collects message headers and links replies where the evidence matches.'}</p></div>}
  </section>
  <div className="bo-mailbox-actions"><Button href="/prospecting/mailbox/reports" icon="mail" variant="ghost">Delivery reports</Button></div>
  {checkpoint&&<section className="bo-mailbox-checkpoint">
   <div className="bo-mailbox-heading"><h2>Future checks</h2>{checkpoint.savedAt&&<Status tone="neutral" label="Starting point saved"/>}</div>
   <dl className="bo-mailbox-facts"><div><dt>Latest collection</dt><dd>{date(checkpoint.sourceAt)}</dd></div><div><dt>Saved starting point</dt><dd>{checkpoint.savedAt?date(checkpoint.savedAt):'Not saved'}</dd></div></dl>
   <p>Saving a starting point keeps older mail unverified and outreach held. It does not start automatic checks.</p>
   {checkpoint.reason!=='used'&&<><label className="bo-mailbox-ack"><input type="checkbox" checked={checkpointAck} onChange={e=>setCheckpointAck(e.target.checked)} disabled={!ready||busy||!checkpoint.canSave}/><span>Use this collection as the starting point for future checks.</span></label>{checkpoint.reason&&<p className="bo-hint">{checkpointReasons[checkpoint.reason]}</p>}<Button icon="history" onClick={()=>act(false,true)} disabled={!ready||busy||!checkpoint.canSave||!checkpointAck} loading={busy&&saving}>Save starting point</Button></>}
   {checkpoint.incomplete&&<p className="bo-hint">This attempt did not complete. Check available mail again before choosing another starting point.</p>}
  </section>}
  <section className="bo-mailbox-controls"><h2>Check available mail</h2>
   <label className="bo-mailbox-ack"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} disabled={!ready||busy||!data.canRecover}/><span>Collect message headers from this account. No email will be sent.</span></label>
   {data.reason&&<p className="bo-hint">{reasonText[data.reason]}</p>}
   {data.reason==='thread_checks'&&<Button href="/prospecting/overview" variant="ghost" icon="history">Review conversations</Button>}
   <div className="bo-mailbox-actions"><Button icon="mail" disabled={!ready||busy||!data.canRecover||!reviewed} loading={busy&&checking} onClick={()=>act(true)}>Check available mail</Button><Button icon="refresh" variant="ghost" disabled={!ready||busy} loading={busy&&!checking&&!saving} onClick={()=>act(false)}>Reload status</Button></div>
   {notice&&<p ref={message} tabIndex={-1} role={error?'alert':'status'} className="bo-skill-notice">{notice}</p>}
  </section>
  {data.history.length>0&&<details className="bo-mailbox-history"><summary>Saved collections</summary><ul>{data.history.map((row,i)=><li key={row.checkedAt+'-'+i}><time dateTime={row.checkedAt}>{date(row.checkedAt)}</time><span>{row.matchedCount} matched</span><span>{row.unassignedCount} unassigned</span><Status tone={row.catchupStatus==='complete'?'neutral':'warning'} label={row.catchupStatus==='complete'?'Recent changes checked':'Recent changes incomplete'}/></li>)}</ul></details>}
 </div>;
}
