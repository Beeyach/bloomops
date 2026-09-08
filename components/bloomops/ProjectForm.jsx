'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { PROJECT_VISIBILITY_LABELS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, Notice, fieldAria } from './Primitives';
import { send } from './ClientOverview';

export default function ProjectForm({ project = null, options, clientId = '', onCancel = null, onSaved = null }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [values, setValues] = useState({ name: project?.name || '', clientId: project?.clientId || clientId,
    serviceEngagementId: project?.serviceEngagementId || '', departmentId: project?.departmentId || '',
    clientLabel: project?.clientLabel || '', ownerMembershipId: project?.ownerMembershipId || '',
    visibility: project?.visibility || 'internal', startDate: project?.startDate || '', targetDate: project?.targetDate || '' });
  const set = key => e => setValues(old => ({ ...old, [key]: e.target.value,
    ...(key === 'clientId' ? { serviceEngagementId: '' } : {}), ...(key === 'serviceEngagementId' && e.target.value ? { departmentId: '' } : {}) }));
  const aria = key => fieldAria({ id: `project-${key}`, error: errors[key] });
  const owners = project?.ownerMembershipId && !options.members.some(m => m.membershipId === project.ownerMembershipId)
    ? [{ membershipId: project.ownerMembershipId, name: `${project.ownerName} (inactive)` }, ...options.members] : options.members;
  const departments = project?.departmentId && !options.departments.some(d => d.id === project.departmentId)
    ? [{ id: project.departmentId, name: `${project.departmentName} (inactive)` }, ...options.departments] : options.departments;

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const next = {};
    if (!values.name.trim()) next.name = 'Enter a project name.';
    if (!values.clientId) next.clientId = 'Choose a client.';
    if (values.startDate && values.targetDate && values.targetDate < values.startDate) next.targetDate = 'The target date cannot be before the start date.';
    setErrors(next); setError('');
    if (Object.keys(next).length) { document.getElementById(`project-${Object.keys(next)[0]}`)?.focus(); return; }
    pending.current = true; setBusy(true);
    const { clientId: parent, serviceEngagementId, ...details } = values;
    try {
      const result = await send(project ? `/api/bloomops/projects/${project.id}` : `/api/bloomops/clients/${parent}/projects`, {
        method: project ? 'PATCH' : 'POST', body: project ? { ...details, expectedRevision: project.revision } : { ...details, serviceEngagementId },
      });
      toast(project ? 'Project details saved.' : 'Project created.');
      if (onSaved) onSaved();
      else router.push(`/work/projects/${result.projectId}`);
      router.refresh();
    } catch (err) {
      setErrors(err.fields || {}); setError(err.fields?.form || (!err.fields ? err.message : 'Check the highlighted fields.'));
      if (err.fields) requestAnimationFrame(() => document.getElementById(`project-${Object.keys(err.fields)[0]}`)?.focus());
    } finally { pending.current = false; setBusy(false); }
  }

  return <form className={project ? '' : 'bo-form bo-project-form'} onSubmit={submit} noValidate>
    <div className={project ? 'bo-dialog-body' : 'bo-project-fields'}>
      <Field id="project-name" label="Project name" error={errors.name}><input {...aria('name')} className="bo-control" value={values.name} onChange={set('name')} maxLength={120} required /></Field>
      {!project && <>
        <Field id="project-clientId" label="Client" error={errors.clientId}><select {...aria('clientId')} className="bo-control" value={values.clientId} onChange={set('clientId')} required>
          <option value="">Choose a client</option>{options.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></Field>
        <Field id="project-serviceEngagementId" label="Purchased service" optional error={errors.serviceEngagementId}><select {...aria('serviceEngagementId')} className="bo-control" value={values.serviceEngagementId} onChange={set('serviceEngagementId')} disabled={!values.clientId}>
          <option value="">Client-level project</option>{options.services.filter(s => s.clientId === values.clientId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></Field>
      </>}
      {!values.serviceEngagementId && <Field id="project-departmentId" label="Department" optional error={errors.departmentId}><select {...aria('departmentId')} className="bo-control" value={values.departmentId} onChange={set('departmentId')}>
        <option value="">Not set</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select></Field>}
      <div className="bo-project-dates">
        {['startDate', 'targetDate'].map(key => <Field key={key} id={`project-${key}`} label={key === 'startDate' ? 'Start date' : 'Target date'} optional error={errors[key]}><input {...aria(key)} className="bo-control" type="date" value={values[key]} onChange={set(key)} /></Field>)}
      </div>
      <Field id="project-ownerMembershipId" label="Internal owner" optional error={errors.ownerMembershipId} hint="Who is responsible for this project. Access comes from team assignments."><select {...aria('ownerMembershipId')} aria-describedby={`project-ownerMembershipId-hint${errors.ownerMembershipId ? ' project-ownerMembershipId-error' : ''}`} className="bo-control" value={values.ownerMembershipId} onChange={set('ownerMembershipId')}>
        <option value="">Nobody yet</option>{owners.map(m => <option key={m.membershipId} value={m.membershipId}>{m.name}</option>)}
      </select></Field>
      <Field id="project-visibility" label="Visibility" error={errors.visibility} hint="Client visible shares the project label, status and dates with this client."><select {...aria('visibility')} aria-describedby={`project-visibility-hint${errors.visibility ? ' project-visibility-error' : ''}`} className="bo-control" value={values.visibility} onChange={set('visibility')}>
        {Object.entries(PROJECT_VISIBILITY_LABELS).filter(([key]) => key !== 'restricted' || options.canRestrict || project?.visibility === 'restricted').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>
      <Field id="project-clientLabel" label="Client-facing label" optional error={errors.clientLabel} hint="A clear name for the client. If left blank, a client-visible project uses its project name."><input {...aria('clientLabel')} aria-describedby={`project-clientLabel-hint${errors.clientLabel ? ' project-clientLabel-error' : ''}`} className="bo-control" value={values.clientLabel} onChange={set('clientLabel')} maxLength={120} /></Field>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
    <div className={project ? 'bo-dialog-actions' : 'bo-form-actions'}>
      {onCancel ? <Button onClick={onCancel} disabled={busy}>Cancel</Button> : <Button href="/work">Cancel</Button>}
      <Button type="submit" variant="primary" loading={busy} disabled={busy}>{project ? 'Save details' : 'Create project'}</Button>
    </div>
  </form>;
}
