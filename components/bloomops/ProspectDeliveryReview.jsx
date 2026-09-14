'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Status} from './Primitives';
import {Icon} from './Icons';
const states={prepared:['Prepared','neutral'],submitting:['Awaiting confirmation','warning'],uncertain:['Unresolved','warning'],accepted:['Accepted by Google','success'],cancelled:['Cancelled','neutral']};
export default function ProspectDeliveryReview({initial}){
 const [data,setData]=useState(initial),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[reviewed,setReviewed]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(false);
 const pending=useRef(false),focus=useRef(null);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(notice)focus.current?.focus();},[notice]);
 async function act(action){
  if(pending.current||!ready)return;pending.current=true;setBusy(true);setNotice('');setError(false);
  try{
   const body={action,workspaceId:data.workspaceId,prospectId:data.prospectId,...(action==='prepare'?{approvalId:data.approvalId}:{deliveryId:data.receipt.id}),...(action==='send'?{reviewed}:{} )};
   const response=await fetch('/api/bloomops/prospecting/delivery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
   if(!response.ok)throw new Error(result.error||'Delivery status could not be confirmed. Reload the receipt.');
   const refreshed=await fetch('/api/bloomops/prospecting/delivery?prospectId='+encodeURIComponent(data.prospectId),{cache:'no-store'}),next=await refreshed.json();
   if(!refreshed.ok)throw new Error('Reload this receipt to check its current status.');
   setData(next);setReviewed(false);
   setNotice(action==='prepare'?'Receipt prepared. Nothing was sent.':action==='cancel'?'Test cancelled. Nothing will be sent from this receipt.':next.receipt.state==='accepted'?'Google accepted the introduction. Inbox delivery is not yet confirmed.':'No confirmed result yet. This receipt cannot send again.');
  }catch(e){setError(true);setReviewed(false);setNotice(e instanceof TypeError?'The response was interrupted. Reload this receipt before taking another action.':e.message);}finally{pending.current=false;setBusy(false);}
 }
 const state=data.receipt?.state,status=states[state]||['Not prepared','neutral'],message=data.message;
 return <div className="bo-delivery-review">
 <div className="bo-outreach-review-status"><Status label={status[0]} tone={status[1]}/>{!data.enabled&&<Status label="Test sending disabled" tone="warning"/>}</div>
 {notice&&<p ref={focus} tabIndex={-1} role={error?'alert':'status'} className="bo-skill-notice">{notice}</p>}
 {message?<section className="bo-delivery-message" aria-label="Exact introduction"><dl className="bo-delivery-addresses"><div><dt><Icon name="mail"/>From</dt><dd>{message.displayName&&<strong>{message.displayName}</strong>}{message.sender||'Sender not configured'}</dd></div><div><dt><Icon name="mail"/>To</dt><dd>{message.recipient||'Recipient not recorded'}</dd></div></dl><h2>{message.subject||'Subject not recorded'}</h2><div className="bo-delivery-body">{message.body||'Introduction not recorded'}</div></section>:<p>Save and approve an outreach draft before preparing a test.</p>}
 {data.recipientProtection&&<section className="bo-delivery-protection" aria-label="Recipient protection"><h2><Icon name="shield-check"/>{data.recipientProtection.kind==='stopped'?'Outreach stopped for this email':data.recipientProtection.kind==='held'?'Outreach held for this email':'Conversation check pending'}</h2><p>{data.recipientProtection.recipient}</p><p>{data.recipientProtection.kind==='stopped'?'A saved stop decision blocks further introductions to this address.':data.recipientProtection.kind==='held'?'A reply or unresolved check needs review before further outreach.':'An unfinished conversation check blocks further outreach to this address.'}</p><Button href={'/prospecting/'+data.recipientProtection.prospectId+'/replies'} icon="history" variant="ghost">Review protected conversation</Button></section>}
 <section className="bo-delivery-actions" aria-label="Delivery controls">
 {!state&&<><p>Preparation saves a permanent receipt for this introduction. It does not send email.</p><Button variant="primary" icon="check" disabled={!ready||busy||!data.approvalId||Boolean(data.recipientProtection)} loading={busy} onClick={()=>act('prepare')}>Prepare test receipt</Button>{!data.approvalId&&<p className="bo-hint">Review and approve the current content in the draft first.</p>}</>}
 {state==='prepared'&&<>
 {!data.enabled&&<p>This test needs an explicitly enabled receipt and owner-controlled recipient before sending.</p>}
 {!data.approvalCurrent&&<p role="status">The approval changed. This saved message is held.</p>}
 {!data.googleConnected&&<Button href="/prospecting/sender" icon="refresh" variant="ghost">Check Google connection</Button>}
 <label className="bo-prospect-check"><input type="checkbox" checked={reviewed} disabled={!ready||busy||!data.canSend} onChange={e=>setReviewed(e.target.checked)}/><span>I control {message.recipient} and approve sending this introduction now.</span></label>
 <div className="bo-delivery-buttons"><Button variant="primary" icon="mail" disabled={!ready||busy||!reviewed||!data.canSend} loading={busy} onClick={()=>act('send')}>Send this test email</Button><Button icon="x" disabled={!ready||busy} onClick={()=>act('cancel')}>Cancel test</Button></div><p className="bo-hint">Sends immediately. No follow-up is scheduled. Submitted email cannot be recalled here.</p></>}
 {['submitting','uncertain'].includes(state)&&<><p>Google may have accepted this email. Sending again is blocked to prevent a duplicate.</p><Button icon="refresh" disabled={!ready||busy||!data.enabled||!data.googleConnected} loading={busy} onClick={()=>act('reconcile')}>Check sent receipt</Button><p className="bo-hint">Checks only this message in Google Sent. An interrupted submission needs 90 seconds before checking. No match remains unresolved.</p></>}
 {state==='accepted'&&<><Button href={'/prospecting/'+data.prospectId+'/replies'} icon="history">Replies and stop review</Button><p>Google accepted one introduction. Confirm its arrival in the test inbox; this is not proof of delivery.</p><dl className="bo-delivery-receipt"><div><dt>Accepted at (UTC)</dt><dd><time dateTime={data.receipt.acceptedAt}>{data.receipt.acceptedAt.replace('T',' ').replace('Z','')}</time></dd></div><div><dt>Google message</dt><dd>{data.receipt.providerMessageId}</dd></div><div><dt>Google thread</dt><dd>{data.receipt.providerThreadId}</dd></div></dl></>}
 {state==='cancelled'&&<p>This receipt is closed. It cannot send or be reopened.</p>}
 </section></div>;
}
