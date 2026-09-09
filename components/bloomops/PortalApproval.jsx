'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { Button,Field,Notice,PageHeader } from './Primitives';
import Dialog from './Dialog';
import ContentReviewSnapshot from './ContentReviewSnapshot';
export default function PortalApproval({item}) {
  const pending=useRef(false),confirmation=useRef(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[decision,setDecision]=useState(null),[feedback,setFeedback]=useState(''),[error,setError]=useState(''),[completed,setCompleted]=useState(null);
  useEffect(()=>setReady(true),[]);useEffect(()=>{if(completed)confirmation.current?.focus();},[completed]);
  const close=useCallback(()=>{if(!pending.current){setDecision(null);setError('');}},[]);
  async function submit(e) {
    e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');
    try {
      const response=await fetch(`/api/bloomops/portal/approvals/${item.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision,feedback:decision==='changes_requested'?feedback:null})}),data=await response.json();
      if(!response.ok){setError(data.errors?.form||data.error||'This request is no longer available. Return home to check.');return;}
      setCompleted(decision);setDecision(null);
    }catch{setError('We could not confirm your response. Please retry the same response, or return home to check.');}finally{pending.current=false;setBusy(false);}
  }
  return <div className="bo-page-narrow bo-approval-page"><Button href="/portal" variant="ghost">Back to home</Button>
    <PageHeader title={completed?'Thank you':'Approval needed'} subtitle={completed?'Your response has been saved.':`Review round ${item.number}. Please check the copy below before responding.`}/>
    {completed?<div ref={confirmation} tabIndex={-1}><Notice tone="success">{completed==='approved'?'You approved this round.':'Your requested changes have been shared with your team.'}</Notice><Button href="/portal">Return home</Button></div>:<>
      <ContentReviewSnapshot snapshot={item.snapshot}/>
      <p className="bo-hint">This review covers the copy, platforms and target date shown above. Recordings and other files are not included.</p>
      <div className="bo-form-actions"><Button disabled={!ready||busy} onClick={()=>{setFeedback('');setDecision('changes_requested');}}>Request changes</Button><Button variant="primary" disabled={!ready||busy} onClick={()=>setDecision('approved')}>Approve</Button></div>
    </>}
    <Dialog open={!!decision} onClose={close} title={decision==='approved'?'Approve this round?':'What would you like changed?'} initialFocus={decision==='approved'?'#approval-response-confirm':'#approval-feedback'}>
      <form onSubmit={submit} aria-busy={busy}>
        {decision==='approved'?<p className="bo-body">You are approving round {item.number} of “{item.snapshot.title}”. Your team can then prepare it for publication.</p>:<Field id="approval-feedback" label="Your requested changes" hint="Please be specific. Required, up to 2,000 characters."><textarea id="approval-feedback" aria-describedby="approval-feedback-hint" className="bo-control" rows={6} maxLength={2000} required value={feedback} onChange={e=>setFeedback(e.target.value)} disabled={busy}/></Field>}
        {error&&<Notice tone="error">{error} <a href="/portal">Return home</a></Notice>}
        <div className="bo-form-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button id="approval-response-confirm" type="submit" variant="primary" disabled={!ready||busy||(decision==='changes_requested'&&!feedback.trim())} loading={busy}>{decision==='approved'?'Approve this round':'Send requested changes'}</Button></div>
      </form>
    </Dialog>
  </div>;
}
