'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast.mjs';
import { Button, Field, Notice, Section, fieldAria } from './Primitives';
import Dialog from './Dialog';
import { send } from './ClientOverview';

export default function ProjectTeam({ projectId, assignments, members = [], mayManage = false }) {
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [member, setMember] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const close = useCallback(() => { if (!pending.current) setEditing(null); }, []);
  const candidates = members.filter(m => !assignments.some(a => a.membershipId === m.membershipId));
  function open(assignment) { setEditing(assignment); setMember(''); setRole(assignment.assignmentRole || 'member'); setError(''); setErrors({}); }
  async function save(remove = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setErrors({});
    try {
      await send(`/api/bloomops/projects/${projectId}/assignments${editing.id ? `/${editing.id}` : ''}`, {
        method: remove ? 'DELETE' : editing.id ? 'PATCH' : 'POST', body: remove ? null : { membershipId: member, assignmentRole: role },
      });
      setEditing(null); toast(remove ? 'Project assignment removed.' : 'Project assignment saved.'); router.refresh();
    } catch (err) { setErrors(err.fields || {}); setError(err.fields ? 'Check the highlighted fields.' : err.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Section id="project-team" title="Project assignments" aside={mayManage && <Button size="sm" onClick={() => open({})}>Assign someone</Button>}>
    <p className="bo-body">People assigned here have access to this project. Client-wide and service assignments also apply to projects that are not restricted.</p>
    {assignments.length ? <ul className="bo-rows" aria-label="Project assignments">{assignments.map(a => <li key={a.id} className="bo-row bo-row-wrap">
      <span className="bo-row-text"><span className="bo-row-title">{a.name} <span className="bo-assign-role">{a.assignmentRole === 'lead' ? 'Lead' : 'Member'}</span></span>
        {(a.status !== 'active' || a.role === 'client') && <span className="bo-row-meta">No longer an active internal member. This assignment grants no access.</span>}
      </span>
      {mayManage && <Button size="sm" onClick={() => open(a)} aria-label={`Edit assignment for ${a.name}`}>Edit</Button>}
    </li>)}</ul> : <p className="bo-small">No one is assigned specifically to this project yet.</p>}
    {mayManage && <Dialog open={Boolean(editing)} onClose={close} title={editing?.id ? 'Edit project assignment' : 'Assign someone to this project'} initialFocus={editing?.id ? '#project-assignmentRole' : '#project-membershipId'}>
      <form noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <div className="bo-dialog-body">
          {editing?.id ? <p className="bo-body">{editing.name}</p> : <Field id="project-membershipId" label="Person" error={errors.membershipId}><select {...fieldAria({ id: 'project-membershipId', error: errors.membershipId })} className="bo-control" value={member} onChange={e => setMember(e.target.value)} required>
            <option value="">Choose someone</option>{candidates.map(m => <option key={m.membershipId} value={m.membershipId}>{m.name}</option>)}
          </select></Field>}
          <Field id="project-assignmentRole" label="Responsibility" error={errors.assignmentRole}><select {...fieldAria({ id: 'project-assignmentRole', error: errors.assignmentRole })} className="bo-control" value={role} onChange={e => setRole(e.target.value)}><option value="member">Member</option><option value="lead">Lead</option></select></Field>
          {error && <Notice tone="error">{error}</Notice>}
          {editing?.id && <Button variant="danger" disabled={busy} onClick={() => save(true)}>Remove assignment</Button>}
        </div>
        <div className="bo-dialog-actions"><Button onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" loading={busy} disabled={busy}>Save assignment</Button></div>
      </form>
    </Dialog>}
  </Section>;
}
