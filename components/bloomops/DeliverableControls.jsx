'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { DELIVERABLE_DETAIL_FIELDS, DELIVERABLE_STATUS_LABELS, DELIVERABLE_TRANSITIONS } from '@/lib/bloomops/deliverable-values.mjs';
import { PROJECT_VISIBILITY_LABELS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, Notice, Section, fieldAria } from './Primitives';
import Dialog from './Dialog';
import { DeliverableList } from './Deliverables';
import { send } from './ClientOverview';

export default function DeliverableControls({ projectId, summary, mayManage, canRestrict }) {
  const router = useRouter(), pending = useRef(false), requestId = useRef(null), focusAfterMutation = useRef(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null);
  const [values, setValues] = useState({}), [initial, setInitial] = useState({}), [errors, setErrors] = useState({}), [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    const previous = focusAfterMutation.current;
    if (!previous || busy || dialog) return;
    const fresh = summary.items.find(item => item.id === previous.id);
    if (fresh && fresh.revision <= previous.revision) return;
    if (document.activeElement === document.body) {
      const stable = document.querySelector(`[data-deliverable-id="${CSS.escape(previous.id)}"] button:not(:disabled)`) || document.getElementById('add-deliverable');
      stable?.focus();
    }
    focusAfterMutation.current = null;
  }, [busy, dialog, summary]);
  const close = useCallback(() => { if (!pending.current) setDialog(null); }, []);
  const open = (kind, item = null) => {
    setError(''); setErrors({}); requestId.current = crypto.randomUUID();
    const next = kind === 'status' ? { toStatus: DELIVERABLE_TRANSITIONS[item.status][0] } :
      Object.fromEntries(DELIVERABLE_DETAIL_FIELDS.map(key => [key, item?.[key] ?? (key === 'visibility' ? 'internal' : '')]));
    setValues(next); setInitial(next); setDialog({ kind, item });
  };
  const change = key => event => setValues(current => ({ ...current, [key]: event.target.value }));
  const aria = key => fieldAria({ id: `deliverable-${key}`, error: errors[key], hint: ['clientLabel', 'visibility'].includes(key) });
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const { kind, item } = dialog;
    if (kind !== 'status' && !values.title.trim()) { setErrors({ title: 'Enter a Deliverable title.' }); document.getElementById('deliverable-title')?.focus(); return; }
    const details = kind === 'edit' ? Object.fromEntries(Object.entries(values).filter(([key, value]) => initial[key] !== value)) : values;
    const path = `/api/bloomops/projects/${projectId}/deliverables${item ? `/${item.id}${kind === 'status' ? '/transition' : ''}` : ''}`;
    pending.current = true; setBusy(true); setError(''); setErrors({});
    try {
      const result = await send(path, { method: kind === 'edit' ? 'PATCH' : 'POST', body: { ...details,
        ...(kind === 'create' ? { requestId: requestId.current } : { expectedRevision: item.revision }) } });
      if (item && !result.unchanged) focusAfterMutation.current = { id: item.id, revision: item.revision };
      const message = kind === 'create' ? 'Deliverable created.' : kind === 'edit' ? 'Deliverable details saved.' : 'Deliverable status updated.';
      setDialog(null); setAnnouncement(message); toast(message); router.refresh();
    } catch (err) { setErrors(err.fields || {}); setError(err.fields?.form || (!err.fields ? err.message : 'Check the highlighted fields.')); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Section id="project-deliverables" title="Deliverables" aside={mayManage && <Button id="add-deliverable" size="sm" disabled={busy || !ready} onClick={() => open('create')}>Add Deliverable</Button>}>
    <p className="bo-small">What the client receives from this Project.</p>
    <DeliverableList items={summary.items} controls={mayManage ? item => <div className="bo-deliverable-controls" role="group" aria-label={`${item.title} controls`}>
      <Button size="sm" disabled={busy || !ready} onClick={() => open('edit', item)}>Edit Deliverable</Button>
      {DELIVERABLE_TRANSITIONS[item.status].length > 0 && <Button size="sm" disabled={busy || !ready} onClick={() => open('status', item)}>Change Deliverable status</Button>}
    </div> : null} />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <Dialog open={Boolean(dialog)} onClose={close} title={dialog?.kind === 'create' ? 'Add Deliverable' : dialog?.kind === 'status' ? 'Change Deliverable status' : 'Edit Deliverable'} initialFocus={dialog?.kind === 'status' ? '#deliverable-toStatus' : '#deliverable-title'}>
      {dialog && <form onSubmit={submit} noValidate><div className="bo-dialog-body">
        {dialog.kind === 'status' ? <>
          <p className="bo-body">{dialog.item.title} · Currently {DELIVERABLE_STATUS_LABELS[dialog.item.status]}.</p>
          <Field id="deliverable-toStatus" label="Next Deliverable status" error={errors.toStatus}><select {...aria('toStatus')} className="bo-control" value={values.toStatus} onChange={change('toStatus')}>
            {DELIVERABLE_TRANSITIONS[dialog.item.status].map(status => <option key={status} value={status}>{DELIVERABLE_STATUS_LABELS[status]}</option>)}
          </select></Field>
          {['delivered', 'cancelled'].includes(values.toStatus) && <p className="bo-small">This status is final.</p>}
        </> : <>
          <Field id="deliverable-title" label="Internal title" error={errors.title}><input {...aria('title')} className="bo-control" value={values.title} onChange={change('title')} maxLength={120} required /></Field>
          <Field id="deliverable-clientLabel" label="Client-facing label" optional hint="Clients see this label. If blank, they see “Deliverable”." error={errors.clientLabel}><input {...aria('clientLabel')} className="bo-control" value={values.clientLabel} onChange={change('clientLabel')} maxLength={120} /></Field>
          <Field id="deliverable-description" label="Internal description" optional error={errors.description}><textarea {...aria('description')} className="bo-control bo-textarea" value={values.description} onChange={change('description')} maxLength={5000} rows={3} /></Field>
          <Field id="deliverable-targetDate" label="Target date" optional error={errors.targetDate}><input {...aria('targetDate')} className="bo-control" type="date" value={values.targetDate} onChange={change('targetDate')} /></Field>
          <Field id="deliverable-visibility" label="Deliverable visibility" error={errors.visibility} hint="Clients see this only when both the Project and Deliverable are client visible."><select {...aria('visibility')} className="bo-control" value={values.visibility} onChange={change('visibility')}>
            {Object.entries(PROJECT_VISIBILITY_LABELS).filter(([key]) => key !== 'restricted' || canRestrict).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></Field>
          {dialog.kind === 'create' && <p className="bo-small">Starts Planned. A Project can hold up to 200 Deliverables.</p>}
        </>}
        {error && <Notice tone="error">{error}</Notice>}
      </div><div className="bo-dialog-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={busy}>{dialog.kind === 'create' ? 'Create Deliverable' : dialog.kind === 'status' ? 'Save Deliverable status' : 'Save Deliverable details'}</Button></div></form>}
    </Dialog>
  </Section>;
}
