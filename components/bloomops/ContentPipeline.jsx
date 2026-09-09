'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import { Button, Field, Notice, Section } from './Primitives';
import { CONTENT_STAGE_LABELS } from '@/lib/bloomops/content-values.mjs';
import { CONTENT_CONTEXT_LIMIT, contentNeedsContext, contentNextStages } from '@/lib/bloomops/content-pipeline-values.mjs';

export default function ContentPipeline({ item }) {
  const router=useRouter(), pending=useRef(false), heading=useRef(null), restore=useRef(false);
  const [ready,setReady]=useState(false), [busy,setBusy]=useState(false), [target,setTarget]=useState(null), [context,setContext]=useState(''), [error,setError]=useState('');
  useEffect(()=>setReady(true),[]);
  useEffect(()=>{if(restore.current){restore.current=false;heading.current?.focus();}},[item.revision]);
  const close=useCallback(()=>{if(!pending.current){setTarget(null);setError('');}},[]);
  async function transition(stage) {
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const response=await fetch(`/api/bloomops/content/${item.id}/transition`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({targetStage:stage,expectedRevision:item.revision,...(contentNeedsContext(stage)?{context}:{})})});
      const result=await response.json();
      if(!response.ok){setError(result.errors?.context || result.error || 'Unable to update Content. Please try again.');return;}
      setTarget(null);restore.current=true;router.refresh();
    } catch {setError('The result could not be confirmed. Retry the same action or reload to check the current stage.');}
    finally {pending.current=false;setBusy(false);}
  }
  const actions=contentNextStages(item);
  return <Section id="content-production" title="Production">
    <p ref={heading} tabIndex={-1} className="bo-content-stage">{CONTENT_STAGE_LABELS[item.stage]}</p>
    {item.stage==='waiting_for_recording' && <p>Waiting for the recording described below before editing can continue.</p>}
    {item.stage==='revision_requested' && <p>Return to Editing to make the requested changes.</p>}
    {item.stageContext && <p className="bo-content-copy">{item.stageContext}</p>}
    {item.approvalRequested&&<p className="bo-hint">Awaiting the Client’s response. Withdraw the approval request before making production changes.</p>}
    {item.stage==='approved' && <p className="bo-hint">Production is approved. Client review decisions, when required, are recorded in the approval history below.</p>}
    {item.stage==='scheduled' && <p className="bo-hint">Ready and intended for publication. Confirm publication when it is live.</p>}
    {item.stage==='published' && <p>Published {item.publishedAt ? new Date(item.publishedAt).toISOString().replace('T',' ').replace('.000Z',' UTC') : ''}. This is the final production stage.</p>}
    {error && !target && <Notice tone="error"><span>{error}</span> <a href={`/social/${item.id}`}>Reload Content</a></Notice>}
    <div className="bo-form-actions" aria-busy={busy}>{actions.map(stage=><Button key={stage} type="button" disabled={!ready||busy} variant={stage==='revision_requested'?'secondary':'primary'} onClick={()=>{if(contentNeedsContext(stage)){setContext('');setError('');setTarget(stage);}else transition(stage);}}>{stage==='revision_requested'?'Request revision':`Move to ${CONTENT_STAGE_LABELS[stage]}`}</Button>)}</div>
    <Dialog open={!!target} onClose={close} title={target==='revision_requested'?'Request revision':'Waiting for Recording'} initialFocus="#content-transition-context">
      <form onSubmit={e=>{e.preventDefault();transition(target);}}>
        <Field id="content-transition-context" label={target==='revision_requested'?'What needs to change?':'What recording is needed, and from whom?'} hint={`Required. Up to ${CONTENT_CONTEXT_LIMIT} characters.`}>
          <textarea id="content-transition-context" aria-describedby="content-transition-context-hint" className="bo-control" rows={6} required maxLength={CONTENT_CONTEXT_LIMIT} value={context} disabled={busy} onChange={e=>setContext(e.target.value)} />
        </Field>
        {error && <Notice tone="error"><span>{error}</span> <a href={`/social/${item.id}`}>Reload Content</a></Notice>}
        <div className="bo-form-actions"><Button type="button" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" disabled={!ready||busy||!context.trim()}>{busy?'Saving…':target==='revision_requested'?'Request revision':'Wait for recording'}</Button></div>
      </form>
    </Dialog>
  </Section>;
}
