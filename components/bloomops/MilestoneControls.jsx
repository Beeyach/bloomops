'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { MILESTONE_STATUS_LABELS, MILESTONE_TRANSITIONS } from '@/lib/bloomops/milestone-values.mjs';
import { PROJECT_VISIBILITY_LABELS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, Notice, Section, fieldAria } from './Primitives';
import Dialog from './Dialog';
import { MilestoneList, MilestoneProgress } from './Milestones';
import { send } from './ClientOverview';

export default function MilestoneControls({ projectId, summary, mayManage, canRestrict }) {
  const router = useRouter(), pending = useRef(false), requestId = useRef(null), focusAfterMutation = useRef(null);
  const [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null);
  const [values, setValues] = useState({}), [errors, setErrors] = useState({}), [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (busy || dialog || !focusAfterMutation.current) return;
    document.querySelector(`[data-milestone-id="${CSS.escape(focusAfterMutation.current)}"] button:not(:disabled)`)?.focus();
    focusAfterMutation.current = null;
  }, [busy, dialog, summary]);
  const close = useCallback(() => { if (!pending.current) setDialog(null); }, []);
  const open = (kind, item = null) => {
    setError(''); setErrors({}); requestId.current = crypto.randomUUID();
    setValues(kind === 'status' ? { toStatus: MILESTONE_TRANSITIONS[item.status][0], reason: '' } :
      { name: item?.name || '', clientLabel: item?.clientLabel || '', startDate: item?.startDate || '', targetDate: item?.targetDate || '', visibility: item?.visibility || 'internal' });
    setDialog({ kind, item });
  };
  async function mutate(path, method, body, message) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setErrors({});
    try {
      await send(`/api/bloomops/projects/${projectId}/milestones${path}`, { method, body });
      setDialog(null); setAnnouncement(message); toast(message); router.refresh();
    } catch (err) { setErrors(err.fields || {}); setError(err.fields?.form || (!err.fields ? err.message : 'Check the highlighted fields.')); }
    finally { pending.current = false; setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    const { kind, item } = dialog;
    if (kind !== 'status') {
      const next = {};
      if (!values.name.trim()) next.name = 'Enter a milestone name.';
      if (values.startDate && values.targetDate && values.targetDate < values.startDate) next.targetDate = 'The target date cannot be before the start date.';
      if (Object.keys(next).length) { setErrors(next); document.getElementById(`milestone-${Object.keys(next)[0]}`)?.focus(); return; }
    }
    if (item) focusAfterMutation.current = item.id;
    return kind === 'create' ? mutate('', 'POST', { ...values, requestId: requestId.current }, 'Milestone created.') :
      mutate(`/${item.id}${kind === 'status' ? '/transition' : ''}`, kind === 'status' ? 'POST' : 'PATCH', { ...values, expectedRevision: item.revision }, kind === 'status' ? 'Milestone status updated.' : 'Milestone details saved.');
  }
  function reorder(item, index, offset) {
    focusAfterMutation.current = item.id;
    const orderedIds = summary.items.map(row => row.id);
    [orderedIds[index], orderedIds[index + offset]] = [orderedIds[index + offset], orderedIds[index]];
    mutate('/reorder', 'POST', { orderedIds, expected: summary.items.map(({ id, revision }) => ({ id, revision })) }, `${item.name} moved ${offset < 0 ? 'earlier' : 'later'}.`);
  }
  const aria = key => fieldAria({ id: `milestone-${key}`, error: errors[key], hint: ['clientLabel', 'visibility'].includes(key) });
  return <Section id="project-milestones" title="Milestones" aside={mayManage && <Button size="sm" disabled={busy} onClick={() => open('create')}>Add milestone</Button>}>
    <MilestoneProgress progress={summary.progress} />
    <MilestoneList items={summary.items} controls={mayManage ? (item, index) => <div className="bo-milestone-controls" role="group" aria-label={`${item.name} controls`}>
      <Button size="sm" disabled={busy} onClick={() => open('edit', item)}>Edit milestone</Button>
      {MILESTONE_TRANSITIONS[item.status].length > 0 && <Button size="sm" disabled={busy} onClick={() => open('status', item)}>Change milestone status</Button>}
      {summary.items.length > 1 && <>
        <Button size="sm" disabled={busy || index === 0} aria-label={`Move ${item.name} earlier`} onClick={() => reorder(item, index, -1)}>Move earlier</Button>
        <Button size="sm" disabled={busy || index === summary.items.length - 1} aria-label={`Move ${item.name} later`} onClick={() => reorder(item, index, 1)}>Move later</Button>
      </>}
    </div> : null} />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {error && !dialog && <Notice tone="error">{error}</Notice>}
    <Dialog open={Boolean(dialog)} onClose={close} title={dialog?.kind === 'create' ? 'Add milestone' : dialog?.kind === 'status' ? 'Change milestone status' : 'Edit milestone'} initialFocus={dialog?.kind === 'status' ? '#milestone-toStatus' : '#milestone-name'}>
      {dialog && <form onSubmit={submit} noValidate><div className="bo-dialog-body">
        {dialog.kind === 'status' ? <>
          <p className="bo-body">{dialog.item.name} · Currently {MILESTONE_STATUS_LABELS[dialog.item.status]}.</p>
          <Field id="milestone-toStatus" label="Next milestone status" error={errors.toStatus}><select {...aria('toStatus')} className="bo-control" value={values.toStatus} onChange={e => setValues(v => ({ ...v, toStatus: e.target.value }))}>
            {MILESTONE_TRANSITIONS[dialog.item.status].map(status => <option key={status} value={status}>{MILESTONE_STATUS_LABELS[status]}</option>)}
          </select></Field>
          {values.toStatus === 'waiting' && <Field id="milestone-reason" label="What or whom are we waiting on?" error={errors.reason}><textarea {...aria('reason')} className="bo-control" rows={3} maxLength={1000} required value={values.reason} onChange={e => setValues(v => ({ ...v, reason: e.target.value }))} /></Field>}
          {['completed', 'skipped'].includes(values.toStatus) && <p className="bo-small">This finishes the milestone permanently. Project status stays separate.</p>}
        </> : <>
          <Field id="milestone-name" label="Milestone name" error={errors.name}><input {...aria('name')} className="bo-control" value={values.name} onChange={e => setValues(v => ({ ...v, name: e.target.value }))} maxLength={120} required /></Field>
          <Field id="milestone-clientLabel" label="Client-facing label" optional hint="If blank, a shared milestone uses its milestone name." error={errors.clientLabel}><input {...aria('clientLabel')} className="bo-control" value={values.clientLabel} onChange={e => setValues(v => ({ ...v, clientLabel: e.target.value }))} maxLength={120} /></Field>
          <div className="bo-project-dates">{['startDate', 'targetDate'].map(key => <Field key={key} id={`milestone-${key}`} label={key === 'startDate' ? 'Start date' : 'Target date'} optional error={errors[key]}>
            <input {...aria(key)} className="bo-control" type="date" value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))} />
          </Field>)}</div>
          <Field id="milestone-visibility" label="Milestone visibility" error={errors.visibility} hint="Clients see this only when both the project and milestone are client visible."><select {...aria('visibility')} className="bo-control" value={values.visibility} onChange={e => setValues(v => ({ ...v, visibility: e.target.value }))}>
            {Object.entries(PROJECT_VISIBILITY_LABELS).filter(([key]) => key !== 'restricted' || canRestrict).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></Field>
        </>}
        {error && <Notice tone="error">{error}</Notice>}
      </div><div className="bo-dialog-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={busy}>{dialog.kind === 'create' ? 'Create milestone' : dialog.kind === 'status' ? 'Save milestone status' : 'Save milestone details'}</Button></div></form>}
    </Dialog>
  </Section>;
}
