'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status} from './Primitives';
import {Icon} from './Icons';
import ProspectAvatar from './ProspectAvatar';
const api='/api/bloomops/prospecting/reports';
const date=value=>new Date(value).toLocaleString('en-US',{timeZone:'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' UTC';
const reasons={mailbox:'Finish the mailbox review before checking individual reports.',connect:'Connect Google in Sender setup to review reports.',connection:'Check the Google connection in Sender setup first.',no_deliveries:'No accepted conversations to review yet.',limit:'This account has more conversations than one check can cover.',thread_checks:'Finish checking the existing conversations first.',busy:'A check is in progress. Reload status when it finishes.',cooldown:'Wait briefly, then reload status before checking again.',disabled:'Reading report contents is not available yet.'};
const outcomes={failed:'Delivery failed',delayed:'Delivery delayed',delivered:'Delivered',relayed:'Relayed',expanded:'Expanded'};
function ReportStopForm({row,ready,busy,onConfirm}){
 const [note,setNote]=useState(''),[reviewed,setReviewed]=useState(false),id='report-stop-'+row.selection;
 return <form className="bo-report-stop-form" onSubmit={e=>{e.preventDefault();if(reviewed&&note.trim())onConfirm({note,reviewed});}}>
  <p>Review the original report in Gmail before recording a permanent stop.</p>
  <Field id={id} label="Evidence reviewed"><textarea id={id} className="bo-control" rows={3} required maxLength={1000} value={note} disabled={!ready||busy} onChange={e=>setNote(e.target.value)}/></Field>
  <label className="bo-mailbox-ack"><input type="checkbox" checked={reviewed} disabled={!ready||busy} onChange={e=>setReviewed(e.target.checked)}/><span>I reviewed this report and confirm permanent delivery failure.</span></label>
  <Button type="submit" variant="danger" icon="x" disabled={!ready||busy||!reviewed||!note.trim()} loading={busy}>Confirm and stop outreach</Button>
  <p className="bo-hint">This saves a permanent stop. It does not send email.</p>
 </form>;
}
export default function ProspectReportReview({initial}){
 const [data,setData]=useState(initial),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[ack,setAck]=useState(null),[notice,setNotice]=useState(''),[error,setError]=useState(false);
 const pending=useRef(false),feedback=useRef(null);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(notice)feedback.current?.focus();},[notice]);
 async function refresh(){const response=await fetch(api,{cache:'no-store'});if(!response.ok)throw Error('Status could not reload. Try again.');const next=await response.json();setData(next);setAck(null);return next;}
 async function act(row,confirmation){
  if(!ready||pending.current||row&&(confirmation?(!row.canConfirm||confirmation.reviewed!==true||!confirmation.note.trim()):(!row.canCheck||ack!==row.selection)))return;
  pending.current=true;setBusy(true);setSelected(row?.selection||null);setNotice('');setError(false);
  try{
   let response,result;
   if(row){response=await fetch(confirmation?api+'/confirm':api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:data.workspaceId,selection:row.selection,expectedRevision:confirmation?row.replyRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true,...(confirmation?{note:confirmation.note}:{})})});result=await response.json();}
   await refresh();if(row&&!response.ok)throw Error(result.error||'The report could not be checked. Reload its status.');
   setNotice(row?(confirmation?'Permanent stop saved. No email was sent.':result.status==='associated'?'Original message matched. Human confirmation is still needed.':'No reliable match was saved. Outreach stays on hold.'):'Status updated.');
  }catch(e){setError(true);setNotice(e instanceof TypeError?'Check your connection, then reload status.':e.message);}finally{pending.current=false;setBusy(false);}
 }
 const allStopped=data.items.length>0&&data.items.every(r=>r.stop);
 const pendingRows=data.items.filter(r=>r.status!=='associated');
 const reason=pendingRows.length&&pendingRows.every(r=>r.reason==='disabled')?'disabled':null;
 const explanation=data.items.length&&!pendingRows.length?null:data.reason?reasons[data.reason]:reason?reasons[reason]:null;
 return <div className="bo-report-review">
  <div className="bo-report-toolbar"><div className="bo-report-mailbox"><Icon name="mail" size={20}/><span>{data.accountEmail||'Google mailbox'}</span></div><Button icon="refresh" variant="ghost" onClick={()=>act()} disabled={!ready||busy} loading={busy&&!selected}>Reload status</Button></div>
  <div className="bo-report-guidance"><Status tone={allStopped?"error":"warning"} glyph={allStopped?"cross":"dash"} label={allStopped?"Outreach stopped":"Outreach held"}/><p>{allStopped?"These conversations remain stopped.":"A message match needs human confirmation before it can be treated as a bounce."}</p></div>
  {explanation&&<p className="bo-report-availability">{explanation} {['connect','connection'].includes(data.reason)&&<a href="/prospecting/sender">Sender setup</a>}{data.reason==='mailbox'&&<a href="/prospecting/mailbox">Mailbox review</a>}{data.reason==='thread_checks'&&<a href="/prospecting/overview">Review conversations</a>}</p>}
  {notice&&<p ref={feedback} tabIndex={-1} role={error?'alert':'status'} className="bo-skill-notice">{notice}</p>}
  {!data.items.length?<section className="bo-report-empty"><span className="bo-outreach-mark"><Icon name="mail" size={22}/></span><h2>No saved reports to review</h2><p>Delivery reports and unassigned messages from a mailbox check appear here.</p><Button href="/prospecting/mailbox" icon="chevron-left" variant="ghost">Back to Mailbox review</Button></section>:<div className="bo-report-list">{data.items.map(row=>{
   const matched=row.status==='associated',interrupted=['superseded','interrupted'].includes(row.status);
   return <article className="bo-report-row" key={row.selection}>
    <header className="bo-report-heading"><div className="bo-report-identity"><ProspectAvatar id={row.prospect?.id||row.selection} website={row.prospect?.website} size="list"/><h2>{row.prospect?.businessName||'Unassigned report'}</h2></div><Status tone={row.stop?'error':matched?'warning':row.status==='unresolved'?'warning':'neutral'} label={row.stop?'Outreach stopped':matched?'Needs confirmation':row.status==='unresolved'?'No reliable match':row.status==='checking'?'Checking':interrupted?'Check interrupted':'Not checked'}/></header>
    <dl className="bo-report-facts"><div><dt>Received</dt><dd><time dateTime={row.receivedAt}>{date(row.receivedAt)}</time></dd></div><div><dt>Original message</dt><dd>{matched?'Matched':row.status==='pending'?'Not checked':'Unconfirmed'}</dd></div>{matched&&<div><dt>Reported outcome</dt><dd>{outcomes[row.action]||'Unconfirmed'}</dd></div>}</dl>
    {row.status==='unresolved'&&<p className="bo-hint">The report could not be reliably linked to an accepted message.</p>}
    {matched?<div className="bo-report-result-actions"><Button href={'/prospecting/'+encodeURIComponent(row.prospect.id)+'/replies'} icon="history" variant="ghost">Review conversation</Button><details><summary>Report details</summary><dl><div><dt>Status code</dt><dd>{row.statusCode}</dd></div><div><dt>Checked</dt><dd>{date(row.checkedAt)}</dd></div><div><dt>Authenticity</dt><dd>Unverified</dd></div></dl></details></div>:<div className="bo-report-check">
     {row.canCheck&&<label className="bo-mailbox-ack"><input type="checkbox" checked={ack===row.selection} disabled={!ready||busy} onChange={e=>setAck(e.target.checked?row.selection:null)}/><span>Read this report’s contents to check its original message.</span></label>}
     <Button icon="mail" onClick={()=>act(row)} disabled={!ready||busy||!row.canCheck||ack!==row.selection} loading={busy&&selected===row.selection}>Check report</Button>
    </div>}
    {row.canConfirm&&<details className="bo-report-stop"><summary>Review permanent failure</summary><ReportStopForm row={row} ready={ready} busy={busy} onConfirm={confirmation=>act(row,confirmation)}/></details>}
    {row.stop&&<section className="bo-report-stop-saved"><h3>Human stop decision</h3><p>{row.stop.reason==='hard_bounce'?'Confirmed hard bounce':'Outreach stopped by a reviewer'}</p><p className="bo-reply-evidence">{row.stop.note}</p><time dateTime={row.stop.at}>{date(row.stop.at)}</time></section>}
   </article>;
  })}</div>}
  {data.more&&<p className="bo-hint">Showing the 50 most recent saved reports.</p>}
 </div>;
}
