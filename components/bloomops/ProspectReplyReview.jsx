'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status} from './Primitives';
import {Icon} from './Icons';
const kinds={reply_unreviewed:['Reply to review','mail'],automatic_response:['Automatic response','refresh'],delivery_report:['Delivery report','alert'],needs_review:['Message needs review','eye']};
const reasons={opt_out:'Opt-out request',declined:'Declined',hard_bounce:'Confirmed hard bounce',manual:'Other stop decision'};
const date=value=>value?new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC':'Not checked yet';
export default function ProspectReplyReview({initial}){
 const [data,setData]=useState(initial),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(false);
 const [ack,setAck]=useState(false),[stopAck,setStopAck]=useState(false),[reason,setReason]=useState(''),[note,setNote]=useState('');
 const pending=useRef(false),focus=useRef(null);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(notice)focus.current?.focus();},[notice]);
 async function act(action){
  if(pending.current||!ready)return;pending.current=true;setBusy(true);setNotice('');setError(false);
  try{
   if(action!=='reload'){
    const body={action,workspaceId:data.workspaceId,prospectId:data.prospectId,deliveryId:data.deliveryId,expectedRevision:data.revision,
     ...(action==='check'?{senderRevision:data.senderRevision,connectionRevision:data.connectionRevision,reviewed:ack}:{reason,note,reviewed:stopAck})};
    const response=await fetch('/api/bloomops/prospecting/replies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
    if(!response.ok)throw new Error(result.error||'Review could not be saved. Reload its status.');
   }
   const response=await fetch('/api/bloomops/prospecting/replies?prospectId='+encodeURIComponent(data.prospectId),{cache:'no-store'}),next=await response.json();
   if(!response.ok)throw new Error('Reload this review to see its current status.');
   setData(next);setAck(false);setStopAck(false);
   setNotice(action==='stop'?'Stop decision saved. Outreach stays stopped.':action==='check'?(next.state?.checkStatus==='unresolved'?'The thread could not be verified. Outreach is held.':'Thread checked. Earlier holds and stops are preserved.'):'Review updated.');
  }catch(e){setError(true);setNotice(e.message||'Connection interrupted. Reload this review before trying again.');}
  finally{pending.current=false;setBusy(false);}
 }
 const stopped=data.state?.holdState==='stopped',held=data.state?.holdState==='held',handled=held&&data.resolution?.current;
 return <div className="bo-reply-review">
  {notice&&<p ref={focus} tabIndex={-1} role={error?'alert':'status'} className={error?'bo-field-error':'bo-hint'}>{notice}</p>}
  <section className="bo-reply-context" aria-label="Conversation"><Icon name="mail"/><div><h2>{data.subject}</h2><dl className="bo-delivery-addresses"><div><dt>From</dt><dd>{data.sender}</dd></div><div><dt>To</dt><dd>{data.recipient}</dd></div></dl></div></section>
  <div className="bo-reply-status"><Status tone={stopped?'error':held?'warning':'neutral'} glyph={stopped?'cross':held?'dash':'clock'} label={stopped?'Outreach stopped':held?'Outreach held':'No outreach running'}/><p>{stopped?'This stop decision is saved.':handled?'The human decision is recorded. Protection remains in place.':held?'A response or unresolved check needs review.':'No follow-up sequence is active.'}</p></div>
  {handled&&<section className="bo-reply-resolution" aria-label="Handled decision"><Status tone="success" glyph="check" label="Reply handled"/><div><p>{data.resolution.note}</p><p className="bo-hint">Recorded <time dateTime={data.resolution.at}>{date(data.resolution.at)}</time>. This does not resume outreach.</p></div></section>}
  <div className="bo-reply-columns">
   <section className="bo-reply-history" aria-labelledby="reply-history-title"><h2 id="reply-history-title"><Icon name="history"/>Conversation checks</h2>
    <p className="bo-hint">Last completed check: <time dateTime={data.state?.checkedAt||undefined}>{date(data.state?.checkedAt)}</time></p>
    {data.state?.checkStatus==='unresolved'&&<p className="bo-field-error"><Icon name="alert"/>The last check was unresolved.</p>}
    {!stopped&&<div className="bo-reply-check">
     {!data.enabled&&<p className="bo-hint">Thread checks are not enabled for this test yet.</p>}
     {data.busy&&<p role="status">A check is in progress. Reload its status shortly.</p>}
     {data.cooling&&<p className="bo-hint">Just checked. Wait 30 seconds before checking again.</p>}
     {data.enabled&&!data.canCheck&&!data.busy&&!data.cooling&&<Button href="/prospecting/sender" icon="refresh" variant="ghost">Check Google connection</Button>}
     <label className="bo-prospect-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={!ready||busy||!data.canCheck}/><span>Check the message headers in this conversation.</span></label>
     <div className="bo-delivery-buttons"><Button icon="refresh" variant="primary" disabled={!ready||busy||!ack||!data.canCheck} loading={busy} onClick={()=>act('check')}>Check this thread</Button><Button variant="ghost" disabled={!ready||busy} onClick={()=>act('reload')}>Reload status</Button></div>
    </div>}
    {data.observations.length?<ul className="bo-reply-observations">{data.observations.map(item=><li key={item.id}><span className="bo-reply-observation-icon"><Icon name={kinds[item.kind][1]}/></span><div><h3>{kinds[item.kind][0]}</h3><time dateTime={item.receivedAt}>{date(item.receivedAt)}</time><p>{item.match==='reply_chain'?'Linked to this conversation.':'Conversation link needs review.'}</p></div></li>)}</ul>:<p className="bo-reply-empty">{data.state?.checkStatus==='checked'?'No incoming messages were found in this checked thread.':'No reply observations saved yet.'}</p>}
    {data.moreObservations&&<p className="bo-hint">Showing the 100 most recently saved observations.</p>}
    {held&&!handled&&<div className="bo-reply-resolution-action"><p>{data.resolution?'Newer evidence was saved after the last handled decision. Record the current decision without clearing protection.':'After reviewing the evidence, record that the reply was handled without clearing this hold.'}</p><Button href={'/prospecting/'+data.prospectId+'?contactEvent=resolved#conversation-records'} icon="check">Record reply handled</Button></div>}
    <details className="bo-reply-details"><summary>What this check covers</summary><p>Only this original sent thread is checked. Message bodies and attachments stay in Gmail. Automatic responses and delivery reports need review; they are not counted as human replies or confirmed bounces. An empty check never clears an earlier hold or stop.</p></details>
   </section>
   <section className="bo-reply-stop" aria-labelledby="reply-stop-title"><h2 id="reply-stop-title"><Icon name="shield-check"/>{stopped?'Saved stop decision':'Stop outreach'}</h2>
    {stopped?<><Status tone="error" glyph="cross" label={reasons[data.state.stopReason]}/><p className="bo-reply-evidence">{data.state.stopNote}</p><p className="bo-hint">Recorded by a workspace reviewer<br/><time dateTime={data.state.stoppedAt}>{date(data.state.stoppedAt)}</time></p></>:<form onSubmit={e=>{e.preventDefault();act('stop');}}>
     <p>Record the evidence you reviewed in Gmail or received directly.</p>
     <Field id="reply-stop-reason" label="Reason"><select id="reply-stop-reason" className="bo-control" required value={reason} disabled={!ready||busy} onChange={e=>setReason(e.target.value)}><option value="">Choose a reason</option>{Object.entries(reasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
     <Field id="reply-stop-note" label="Evidence reviewed"><textarea id="reply-stop-note" className="bo-control" rows={4} maxLength={1000} required value={note} disabled={!ready||busy} onChange={e=>setNote(e.target.value)}/></Field>
     <label className="bo-prospect-check"><input type="checkbox" checked={stopAck} disabled={!ready||busy} onChange={e=>setStopAck(e.target.checked)}/><span>I reviewed this evidence and want to stop outreach.</span></label>
     <Button type="submit" variant="danger" icon="x" disabled={!ready||busy||!reason||!note.trim()||!stopAck}>Stop outreach</Button><p className="bo-hint">Saved permanently for this prospect. This screen cannot resume outreach.</p>
    </form>}
   </section>
  </div>
 </div>;
}
