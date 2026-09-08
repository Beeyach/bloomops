'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { PROJECT_HEALTHS, PROJECT_HEALTH_LABELS, PROJECT_STATUS_LABELS, PROJECT_TRANSITIONS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, Notice, Section, fieldAria } from './Primitives';
import Dialog from './Dialog';
import ProjectForm from './ProjectForm';
import { ProjectFacts, ProjectStatus } from './Projects';
import { send } from './ClientOverview';

export default function ProjectControls({ project, options, clientHref }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [toStatus, setToStatus] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const close = useCallback(() => { if (!pending.current) setDialog(null); }, []);
  const transitions = PROJECT_TRANSITIONS[project.status];

  async function save(path, body, message) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setErrors({});
    try {
      await send(`/api/bloomops/projects/${project.id}${path}`, { method: path ? 'POST' : 'PATCH', body: { ...body, expectedRevision: project.revision } });
      setDialog(null); toast(message); router.refresh();
    } catch (err) { setErrors(err.fields || {}); setError(err.fields?.form || (!err.fields ? err.message : 'Check the highlighted fields.')); }
    finally { pending.current = false; setBusy(false); }
  }

  return <>
    <Section id="project-details" title="Details" aside={<Button size="sm" onClick={() => setDialog('details')}>Edit details</Button>}>
      <ProjectFacts project={project} clientHref={clientHref} />
    </Section>
    <Section id="project-status" title="Progress" aside={transitions.length > 0 && <Button size="sm" onClick={() => { setError(''); setErrors({}); setToStatus(transitions[0]); setReason(''); setDialog('status'); }}>Change status</Button>}>
      <ProjectStatus status={project.status} />
      {project.statusReason && <p className="bo-body bo-project-reason">{project.statusReason}</p>}
      {project.status === 'archived' && <p className="bo-small">This project is archived. Its completion date and history remain available.</p>}
    </Section>
    <Section id="project-health" title="Project health">
      <p className="bo-body">How delivery is going, independently of progress.</p>
      <div className="bo-choices" role="group" aria-label="Project health">
        {PROJECT_HEALTHS.map(health => <Button key={health} size="sm" aria-pressed={project.health === health} variant={project.health === health ? 'primary' : 'secondary'} disabled={busy || project.health === health}
          onClick={() => save('', { health }, 'Project health updated.')}>{PROJECT_HEALTH_LABELS[health]}</Button>)}
      </div>
      {error && !dialog && <Notice tone="error">{error}</Notice>}
    </Section>
    <Dialog open={dialog === 'details'} onClose={close} title="Edit project details" initialFocus="#project-name">
      <ProjectForm project={project} options={options} onCancel={close} onSaved={close} />
    </Dialog>
    <Dialog open={dialog === 'status'} onClose={close} title="Change project status" initialFocus="#project-toStatus">
      <form onSubmit={e => { e.preventDefault(); save('/transition', { toStatus, reason }, 'Project status updated.'); }} noValidate>
        <div className="bo-dialog-body">
          <p className="bo-body">Currently {PROJECT_STATUS_LABELS[project.status]}.</p>
          <Field id="project-toStatus" label="Next status" error={errors.toStatus}><select {...fieldAria({ id: 'project-toStatus', error: errors.toStatus })} className="bo-control" value={toStatus} onChange={e => { setToStatus(e.target.value); setErrors({}); }}>
            {transitions.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}
          </select></Field>
          {['waiting', 'blocked'].includes(toStatus) && <Field id="project-reason" label={toStatus === 'waiting' ? 'What or whom are we waiting on?' : 'What is blocking this project?'} error={errors.reason}>
            <textarea {...fieldAria({ id: 'project-reason', error: errors.reason })} className="bo-control" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} rows={3} required />
          </Field>}
          {['completed', 'cancelled', 'archived'].includes(toStatus) && <p className="bo-small">{toStatus === 'completed' ? 'Completion is permanent. You can archive this project later.' : toStatus === 'cancelled' ? 'Cancelled projects can be archived, but cannot be reopened.' : 'Archiving preserves the project’s details and history.'}</p>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <div className="bo-dialog-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" disabled={busy} loading={busy}>Save status</Button></div>
      </form>
    </Dialog>
  </>;
}
