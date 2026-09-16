'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { ACTION_DETAIL_FIELDS, ACTION_PRIORITIES, ACTION_STATUS_LABELS, ACTION_TRANSITIONS, ACTION_WAITING_TYPES } from '@/lib/bloomops/action-values.mjs';
import { Button, Field, Notice, Section, fieldAria } from './Primitives';
import Dialog from './Dialog';
import { actionLabel, ActionList } from './Actions';
import { send } from './ClientOverview';

export function ActionControls({ action = null, projectId, members = [], milestones = [], mayManage = false, mayProgress = false, canRestrict = false, dependencies = null, candidates = [] }) {
  const router = useRouter(), root = useRef(null), pending = useRef(false), requestId = useRef(null), focusAfterMutation = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null), [values, setValues] = useState({}), [initial, setInitial] = useState({});
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [announcement, setAnnouncement] = useState('');
  const close = useCallback(() => { if (!pending.current) setDialog(null); }, []);
  // Server-rendered controls must not look actionable before React attaches
  // their handlers. Native disabled state also keeps early Tab navigation safe.
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (!focusAfterMutation.current) return;
    // A terminal transition or dependency removal may remove its opener.
    // Preserve normal dialog restoration, otherwise choose a stable control
    // or the Action title after the refreshed revision has rendered.
    if (document.activeElement === document.body) {
      const fallback = root.current?.querySelector('button:not(:disabled)') || document.querySelector(`[data-action-id="${CSS.escape(action?.id || '')}"] a`) || document.getElementById('page-title');
      if (fallback) { if (fallback.tagName === 'H1') fallback.tabIndex = -1; fallback.focus(); }
    }
    focusAfterMutation.current = false;
  }, [action?.revision]);
  const available = candidates.filter(item => item.id !== action?.id && !dependencies?.items.some(edge => edge.actionId === item.id));
  const open = (kind, edge = null) => {
    setErrors({}); setError(''); requestId.current = crypto.randomUUID();
    const next = kind === 'status' ? { toStatus: ACTION_TRANSITIONS[action.status][0], waitingType: 'client', waitingReason: '' }
      : kind === 'dependency' ? { dependsOnActionId: available[0]?.id || '' }
      : Object.fromEntries(ACTION_DETAIL_FIELDS.map(key => [key, action?.[key] ?? (key === 'priority' ? 'normal' : key === 'visibility' ? 'internal' : '')]));
    setValues(next); setInitial(next); setDialog({ kind, edge });
  };
  const change = key => event => setValues(current => ({ ...current, [key]: event.target.value }));
  const aria = key => fieldAria({ id: `action-${key}`, error: errors[key] });
  async function mutate(path, method, body, message) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setErrors({});
    try {
      await send(path, { method, body }); focusAfterMutation.current = Boolean(action);
      setDialog(null); setAnnouncement(message); toast(message); router.refresh();
    } catch (err) { setErrors(err.fields || {}); setError(err.fields?.form || (!err.fields ? err.message : 'Check the highlighted fields.')); }
    finally { pending.current = false; setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    const kind = dialog.kind, path = `/api/bloomops/actions/${action?.id}`;
    if (['create', 'edit'].includes(kind)) {
      if (!values.title.trim()) { setErrors({ title: 'Enter an Action title.' }); document.getElementById('action-title')?.focus(); return; }
      // Submit only changed fields on edits. An undisclosed linked Milestone
      // or historical inactive assignee must not be silently cleared.
      const details = kind === 'create' ? values : Object.fromEntries(Object.entries(values).filter(([key, value]) => initial[key] !== value));
      return mutate(kind === 'create' ? `/api/bloomops/projects/${projectId}/actions` : path, kind === 'create' ? 'POST' : 'PATCH',
        { ...details, ...(kind === 'create' ? { requestId: requestId.current } : { expectedRevision: action.revision }) }, kind === 'create' ? 'Action created.' : 'Action details saved.');
    }
    if (kind === 'status') return mutate(`${path}/transition`, 'POST', { ...values, expectedRevision: action.revision }, 'Action status updated.');
    if (kind === 'dependency') return mutate(`${path}/dependencies`, 'POST', { ...values, expectedRevision: action.revision }, 'Dependency added.');
    return mutate(`${path}/dependencies/${dialog.edge.id}`, 'DELETE', { expectedRevision: action.revision }, 'Dependency removed.');
  }
  const dialogTitle = { create: 'Add Action', edit: 'Edit Action', status: 'Change Action status', dependency: 'Add dependency', remove: 'Remove dependency' }[dialog?.kind];
  return <div ref={root} className="bo-action-controls">
    <div className="bo-action-buttons">
      {mayManage && <Button size="sm" disabled={busy || !ready} onClick={() => open(action ? 'edit' : 'create')}>{action ? 'Edit Action' : 'Add Action'}</Button>}
      {action && mayProgress && ACTION_TRANSITIONS[action.status].length > 0 && <Button size="sm" disabled={busy || !ready} onClick={() => open('status')}>Change Action status</Button>}
    </div>
    {dependencies && <Section id="action-dependencies" title="Dependencies" aside={mayManage && <Button size="sm" disabled={busy || !ready || !available.length} onClick={() => open('dependency')}>Add dependency</Button>}>
      <p className="bo-small bo-section-description">Prerequisite Actions are satisfied when Done. Cancelled work remains unresolved.</p>
      {dependencies.items.length ? <ul className="bo-action-dependencies" aria-label="Prerequisite Actions">{dependencies.items.map(edge => <li key={edge.id}>
        <div><a className="bo-action-title" href={`/work/actions/${edge.actionId}`}>{edge.title}</a><p className="bo-small"><span>{ACTION_STATUS_LABELS[edge.status]}</span> <span>{edge.satisfied ? 'Satisfied' : 'Unresolved'}</span></p></div>
        {mayManage && <Button size="sm" disabled={busy || !ready} onClick={() => open('remove', edge)} aria-label={`Remove dependency on ${edge.title}`}>Remove dependency</Button>}
      </li>)}</ul> : <p className="bo-body">{action.dependencyBlocked ? 'A prerequisite is unresolved. Its details are not available to you.' : 'No available prerequisites.'}</p>}
      {mayManage && !available.length && <p className="bo-small">Add another Action to this Project before choosing a new prerequisite.</p>}
    </Section>}
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <Dialog open={Boolean(dialog)} onClose={close} title={dialogTitle} initialFocus={dialog?.kind === 'status' ? '#action-toStatus' : dialog?.kind === 'dependency' ? '#action-dependsOnActionId' : dialog?.kind === 'remove' ? '#action-remove-cancel' : '#action-title'}>
      {dialog && <form onSubmit={submit} noValidate><div className="bo-dialog-body">
        {['create', 'edit'].includes(dialog.kind) && <>
          <Field id="action-title" label="Action title" error={errors.title}><input {...aria('title')} className="bo-control" value={values.title} onChange={change('title')} maxLength={120} required /></Field>
          <Field id="action-description" label="Description" optional error={errors.description}><textarea {...aria('description')} className="bo-control bo-textarea" value={values.description} onChange={change('description')} maxLength={5000} rows={3} /></Field>
          <div className="bo-project-dates">
            <Field id="action-priority" label="Priority" error={errors.priority}><select {...aria('priority')} className="bo-control" value={values.priority} onChange={change('priority')}>{ACTION_PRIORITIES.map(value => <option key={value} value={value}>{actionLabel(value)}</option>)}</select></Field>
            <Field id="action-dueDate" label="Due date" optional error={errors.dueDate}><input {...aria('dueDate')} className="bo-control" type="date" value={values.dueDate} onChange={change('dueDate')} /></Field>
          </div>
          <Field id="action-assigneeMembershipId" label="Assignee" optional error={errors.assigneeMembershipId}><select {...aria('assigneeMembershipId')} className="bo-control" value={values.assigneeMembershipId} onChange={change('assigneeMembershipId')}>
            <option value="">Unassigned</option>{action?.assigneeMembershipId && !members.some(member => member.membershipId === action.assigneeMembershipId) && <option value={action.assigneeMembershipId}>{action.assigneeName || 'Current assignee'} (inactive)</option>}
            {members.map(member => <option key={member.membershipId} value={member.membershipId}>{member.name}</option>)}
          </select></Field>
          <Field id="action-milestoneId" label="Milestone" optional error={errors.milestoneId}><select {...aria('milestoneId')} className="bo-control" value={values.milestoneId} onChange={change('milestoneId')}>
            <option value="">None selected</option>{milestones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></Field>
          <Field id="action-visibility" label="Action visibility" error={errors.visibility}><select {...aria('visibility')} className="bo-control" value={values.visibility} onChange={change('visibility')}>
            <option value="internal">Internal</option>{canRestrict && <option value="restricted">Restricted</option>}
          </select></Field>
          {dialog.kind === 'create' && <p className="bo-small">Starts To Do with Normal priority unless you choose another priority. A Project can hold up to 200 Actions.</p>}
        </>}
        {dialog.kind === 'status' && <>
          <p className="bo-body">{action.title}. Currently {ACTION_STATUS_LABELS[action.status]}.</p>
          <Field id="action-toStatus" label="Next Action status" error={errors.toStatus}><select {...aria('toStatus')} className="bo-control" value={values.toStatus} onChange={change('toStatus')}>{ACTION_TRANSITIONS[action.status].map(value => <option key={value} value={value}>{ACTION_STATUS_LABELS[value]}</option>)}</select></Field>
          {values.toStatus === 'waiting' && <>
            <Field id="action-waitingType" label="Waiting on" error={errors.waitingType}><select {...aria('waitingType')} className="bo-control" value={values.waitingType} onChange={change('waitingType')}>{ACTION_WAITING_TYPES.map(value => <option key={value} value={value}>{actionLabel(value)}</option>)}</select></Field>
            <Field id="action-waitingReason" label="What needs to happen?" error={errors.waitingReason}><textarea {...aria('waitingReason')} className="bo-control bo-textarea" value={values.waitingReason} onChange={change('waitingReason')} rows={3} maxLength={1000} required /></Field>
          </>}
          {['done', 'cancelled'].includes(values.toStatus) && <p className="bo-small">This status is final.</p>}
        </>}
        {dialog.kind === 'dependency' && <Field id="action-dependsOnActionId" label="Prerequisite Action" error={errors.dependency}><select {...aria('dependsOnActionId')} className="bo-control" value={values.dependsOnActionId} onChange={change('dependsOnActionId')}>{available.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>}
        {dialog.kind === 'remove' && <p className="bo-body">Remove the dependency on {dialog.edge.title}? Both Actions keep their current status.</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </div><div className="bo-dialog-actions"><Button id="action-remove-cancel" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={busy}>{({ create: 'Create Action', edit: 'Save Action details', status: 'Save Action status', dependency: 'Save dependency', remove: 'Remove dependency' })[dialog.kind]}</Button></div></form>}
    </Dialog>
  </div>;
}

export function ProjectActions({ projectId, items, members, milestones, mayManage, membershipId, canRestrict }) {
  return <Section id="project-actions" title="Actions" aside={<ActionControls projectId={projectId} members={members} milestones={milestones} mayManage={mayManage} canRestrict={canRestrict} />}>
    <ActionList items={items} projectContext controls={item => <ActionControls action={item} projectId={projectId} members={members} milestones={milestones}
      mayManage={mayManage} mayProgress={mayManage || item.assigneeMembershipId === membershipId} canRestrict={canRestrict} />} />
  </Section>;
}
