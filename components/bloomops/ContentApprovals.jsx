'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button,Field,Notice,Section,Status } from './Primitives';
import Dialog from './Dialog';
import ContentReviewSnapshot from './ContentReviewSnapshot';
import { APPROVAL_STATUS_LABELS } from '@/lib/bloomops/content-approval-values.mjs';
export default function ContentApprovals({item,history,openRound=null,mayManage=false}) {
  const router=useRouter(),pending=useRef(false),requestId=useRef(null),heading=useRef(null),restore=useRef(false);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[mode,setMode]=useState(null),[reason,setReason]=useState(''),[error,setError]=useState('');
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{requestId.current=null;if(restore.current){restore.current=false;heading.current?.focus();}},[item.revision]);
  const close=useCallback(()=>{if(!pending.current){setMode(null);setError('');}},[]);
  async function submit(e) {
    e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');requestId.current ||= crypto.randomUUID();
    try {
      const path=mode==='withdraw'?`/api/bloomops/approvals/${openRound.id}/withdraw`:`/api/bloomops/content/${item.id}/approvals`;
      const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:item.revision,...mode==='withdraw'?{reason}:{requestId:requestId.current}})}),data=await response.json();
      if(!response.ok){setError(data.errors?.form||data.error||'Unable to save the approval request.');return;}
      setMode(null);restore.current=true;router.refresh();
    }catch{setError('The result could not be confirmed. Retry this same request or reload to check.');}finally{pending.current=false;setBusy(false);}
  }
  const canRequest=!openRound&&item.stage==='client_review'&&item.clientApprovalRequired&&item.visibility==='client';
  return <div id="content-approvals"><Section id="content-approvals" title="Client approval">
    <p id="approval-status-focus" ref={heading} tabIndex={-1} className="bo-body">{openRound?`Round ${openRound.number} is awaiting a Client response. Reviewed copy, workflow requirements, platforms and date are frozen until this round is resolved or withdrawn.`:'Each requested round preserves the structured copy, platforms and target date your Client reviews.'}</p>
    <p className="bo-hint">Recordings and assets are not included in these review snapshots. No notification is sent; eligible Clients find the request on their portal home.</p>
    {mayManage&&<div className="bo-form-actions">{openRound?<Button disabled={!ready||busy} onClick={()=>{setReason('');setMode('withdraw');}}>Withdraw request</Button>:canRequest?<Button variant="primary" disabled={!ready||busy} onClick={()=>setMode('request')}>Request Client approval</Button>:<p className="bo-hint">To request approval, enable Client approval, use Client eligible visibility and move this item to Client Review.</p>}</div>}
    {history.items.length?<ol className="bo-approval-history">{history.items.map(round=><li key={round.id}>
      <div className="bo-section-head"><h3 className="bo-h2">Round {round.number}</h3><Status label={APPROVAL_STATUS_LABELS[round.status]} tone={round.status==='approved'?'success':round.status==='requested'?'info':'neutral'} /></div>
      <p className="bo-hint">Requested <time dateTime={round.requestedAt}>{round.requestedAt.replace('T',' ').replace('Z',' UTC')}</time>{round.requesterName?` by ${round.requesterName}`:''}</p>
      {round.respondedAt&&<p className="bo-hint">Responded <time dateTime={round.respondedAt}>{round.respondedAt.replace('T',' ').replace('Z',' UTC')}</time>{round.responderName?` by ${round.responderName}`:''}</p>}
      {round.withdrawnAt&&<p className="bo-hint">Withdrawn <time dateTime={round.withdrawnAt}>{round.withdrawnAt.replace('T',' ').replace('Z',' UTC')}</time>{round.withdrawerName?` by ${round.withdrawerName}`:''}</p>}
      {round.feedback&&<div className="bo-review-feedback"><h4 className="bo-label">Client feedback</h4><p className="bo-content-copy">{round.feedback}</p></div>}
      {round.withdrawalReason&&<p className="bo-content-copy">Withdrawal reason: {round.withdrawalReason}</p>}
      <details className="bo-review-details"><summary>Review snapshot · Round {round.number}</summary><ContentReviewSnapshot snapshot={round.snapshot} /></details>
    </li>)}</ol>:<p className="bo-body">No approval rounds on this page.</p>}
    <nav className="bo-form-actions" aria-label="Approval history pages">{history.page>1&&<Button href={`/social/${item.id}?approvalPage=${history.page-1}#content-approvals`}>Newer rounds</Button>}{history.hasMore&&<Button href={`/social/${item.id}?approvalPage=${history.page+1}#content-approvals`}>Older rounds</Button>}</nav>
    <Dialog open={!!mode} onClose={close} title={mode==='withdraw'?'Withdraw approval request':'Request Client approval'} initialFocus={mode==='withdraw'?'#approval-withdrawal-reason':'#approval-confirm'}>
      <form onSubmit={submit} aria-busy={busy}>
        <p className="bo-body">{mode==='withdraw'?'This keeps the round and its snapshot in history, leaves Content in Client Review, and reopens editing. A new request will create a new round.':'Your Client will review a fixed copy of the title, format, hook, script, caption, call to action, platforms and target date. Files and internal notes are excluded. Reviewed fields will be frozen while a response is pending.'}</p>
        {mode==='withdraw'&&<Field id="approval-withdrawal-reason" label="Reason" optional hint="Up to 2,000 characters. Internal history only."><textarea id="approval-withdrawal-reason" aria-describedby="approval-withdrawal-reason-hint" className="bo-control" rows={4} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></Field>}
        {error&&<Notice tone="error">{error} <a href={`/social/${item.id}`}>Reload Content</a></Notice>}
        <div className="bo-form-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button id="approval-confirm" type="submit" variant="primary" disabled={!ready||busy} loading={busy}>{mode==='withdraw'?'Withdraw request':'Request approval'}</Button></div>
      </form>
    </Dialog>
  </Section></div>;
}
