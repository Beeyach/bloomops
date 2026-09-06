'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmDialog } from '@/lib/dialog.mjs';
import { toast } from '@/lib/toast.mjs';
import { daysUntil, formatDate, plural } from '@/lib/bloomops/format.mjs';
import Dialog from './Dialog';
import { Button, EmptyState, Field, Notice, PageHeader, Section, Status, fieldAria } from './Primitives';
import { initialsOf } from './session-client.mjs';

// The Team screen for people who hold members.manage. Every change goes
// through the existing routes (A3, fenced by A4), which own the rules:
// nobody changes their own membership, the last active Owner stays, a
// removed person comes back only through a new invitation, tokens never
// leave the server. This component shows the directory, collects intent,
// sends it, and shows the answer, then asks the server to render the
// screen again.

const ROLE_OPTIONS = [
  ['team_member', 'Team Member'],
  ['project_manager', 'Project Manager'],
  ['admin', 'Admin'],
  ['owner', 'Owner'],
];

const MEMBER_STATUS = {
  active: { label: 'Active', tone: 'success', glyph: 'check' },
  suspended: { label: 'Suspended', tone: 'warning', glyph: 'clock' },
  invited: { label: 'Invited', tone: 'info', glyph: 'clock' },
  removed: { label: 'Removed', tone: 'neutral', glyph: 'dash' },
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function send(path, { method = 'POST', body = null } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data?.error || (res.status === 401 ? 'Your session has ended. Sign in again.' : 'That did not work. Try again.'));
  return data || {};
}

function invitationState(invitation) {
  if (invitation.status !== 'pending') return invitation.status;
  const days = daysUntil(invitation.expiresAt);
  return days !== null && days <= 0 ? 'expired' : 'pending';
}

export function MemberRow({ member, isSelf, busy, onSuspend, onReinstate, onRemove }) {
  const status = MEMBER_STATUS[member.status] || { label: member.status, tone: 'neutral', glyph: 'dot' };
  const joined = member.joinedAt ? `Joined ${formatDate(member.joinedAt)}` : null;
  const canAct = !isSelf && member.status !== 'removed';
  return (
    <li className="bo-row bo-row-wrap">
      <span className="bo-avatar" aria-hidden="true">
        {initialsOf(member.name, member.email)}
      </span>
      <span className="bo-row-text">
        <span className="bo-row-title">
          {member.name || member.email}
          {isSelf && <span className="bo-soft"> (you)</span>}
        </span>
        <span className="bo-row-meta" style={{ display: 'block' }}>
          {member.email} · {member.roleLabel}
          {joined ? ` · ${joined}` : ''}
        </span>
      </span>
      <span className="bo-row-end">
        <Status label={status.label} tone={status.tone} glyph={status.glyph} />
        {canAct && member.status === 'active' && (
          <Button size="sm" loading={busy === 'suspended'} onClick={onSuspend} aria-label={`Suspend ${member.name || member.email}`}>
            Suspend
          </Button>
        )}
        {canAct && member.status === 'suspended' && (
          <Button size="sm" loading={busy === 'active'} onClick={onReinstate} aria-label={`Reinstate ${member.name || member.email}`}>
            Reinstate
          </Button>
        )}
        {canAct && (
          <Button size="sm" variant="danger" loading={busy === 'removed'} onClick={onRemove} aria-label={`Remove ${member.name || member.email}`}>
            Remove
          </Button>
        )}
      </span>
    </li>
  );
}

export function InvitationRow({ invitation, busy, onResend, onRevoke }) {
  const state = invitationState(invitation);
  const days = daysUntil(invitation.expiresAt);
  const expiry = state === 'expired' ? `Expired ${formatDate(invitation.expiresAt)}` : days === 1 ? 'Expires tomorrow' : `Expires in ${plural(days, 'day')}`;
  return (
    <li className="bo-row bo-row-wrap">
      <span className="bo-row-text">
        <span className="bo-row-title">{invitation.inviteeName ? `${invitation.inviteeName} · ${invitation.email}` : invitation.email}</span>
        <span className="bo-row-meta" style={{ display: 'block' }}>
          {invitation.roleLabel} · {expiry}
        </span>
      </span>
      <span className="bo-row-end">
        {state === 'expired' ? <Status label="Expired" tone="warning" glyph="clock" /> : <Status label="Waiting" tone="info" glyph="clock" />}
        <Button size="sm" loading={busy === 'resend'} onClick={onResend} aria-label={`Resend the invitation to ${invitation.email}`}>
          {state === 'expired' ? 'Send again' : 'Resend'}
        </Button>
        {state === 'pending' && (
          <Button size="sm" variant="danger" loading={busy === 'revoke'} onClick={onRevoke} aria-label={`Withdraw the invitation to ${invitation.email}`}>
            Withdraw
          </Button>
        )}
      </span>
    </li>
  );
}

export function InviteForm({ onSubmit, onCancel, busy, serverError }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('team_member');
  const [errors, setErrors] = useState({});

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!EMAIL_SHAPE.test(email.trim())) next.email = 'Enter an email address, like name@example.com.';
    if (!ROLE_OPTIONS.some(([value]) => value === role)) next.role = 'Choose a role.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({ email: email.trim(), name: name.trim() || undefined, role });
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="bo-dialog-body">
        <Field id="invite-email" label="Email address" error={errors.email} hint="They will get a link to join. It works for 7 days.">
          <input {...fieldAria({ id: 'invite-email', hint: true, error: errors.email })} className="bo-control" type="email" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field id="invite-name" label="Name" optional>
          <input {...fieldAria({ id: 'invite-name' })} className="bo-control" type="text" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field id="invite-role" label="Role" error={errors.role} hint="Client invitations are sent from the client's own record, which is not available yet.">
          <select {...fieldAria({ id: 'invite-role', hint: true, error: errors.role })} className="bo-control" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {serverError && <Notice tone="error">{serverError}</Notice>}
      </div>
      <div className="bo-dialog-actions">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}

export default function TeamManager({ members, invitations, selfMembershipId, workspaceName }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [busy, setBusy] = useState({});

  const current = useMemo(() => members.filter((m) => m.status !== 'removed'), [members]);
  const removed = useMemo(() => members.filter((m) => m.status === 'removed'), [members]);
  const open = useMemo(() => invitations.filter((i) => i.status === 'pending' || i.status === 'expired'), [invitations]);

  const mark = (key, value) => setBusy((b) => ({ ...b, [key]: value }));

  async function changeMember(member, status, done) {
    mark(member.id, status);
    try {
      await send(`/api/bloomops/members/${member.id}`, { method: 'PATCH', body: { status } });
      toast(done);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(member.id, null);
    }
  }

  async function removeMember(member) {
    const who = member.name || member.email;
    const ok = await confirmDialog({
      title: `Remove ${who}?`,
      message: `They lose access to ${workspaceName} straight away. To bring them back later, send a new invitation.`,
      confirmLabel: 'Remove',
    });
    if (ok) await changeMember(member, 'removed', `${who} was removed.`);
  }

  async function resend(invitation) {
    mark(invitation.id, 'resend');
    try {
      const data = await send(`/api/bloomops/invitations/${invitation.id}/resend`);
      if (data.delivered === false) toast(`A new link was made for ${invitation.email}, but the email could not be sent. Try again in a moment.`, { tone: 'error' });
      else toast(`Invitation sent again to ${invitation.email}.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(invitation.id, null);
    }
  }

  async function revoke(invitation) {
    const ok = await confirmDialog({
      title: 'Withdraw this invitation?',
      message: `The link sent to ${invitation.email} will stop working.`,
      confirmLabel: 'Withdraw',
    });
    if (!ok) return;
    mark(invitation.id, 'revoke');
    try {
      await send(`/api/bloomops/invitations/${invitation.id}/revoke`);
      toast(`The invitation to ${invitation.email} was withdrawn.`);
      router.refresh();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      mark(invitation.id, null);
    }
  }

  async function invite(values) {
    setInviteBusy(true);
    setInviteError('');
    try {
      const data = await send('/api/bloomops/invitations', { body: values });
      setInviteOpen(false);
      if (data.delivered === false) toast(`The invitation for ${values.email} was created, but the email could not be sent. Resend it from the list.`, { tone: 'error' });
      else toast(data.resent ? `A fresh invitation was sent to ${values.email}.` : `Invitation sent to ${values.email}.`);
      router.refresh();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`Who is in ${workspaceName}, their role, and open invitations.`}
        actions={
          <Button variant="primary" icon="plus" onClick={() => { setInviteError(''); setInviteOpen(true); }}>
            Invite someone
          </Button>
        }
      />

      <Section id="members" title="People" aside={<span className="bo-small bo-num">{plural(current.length, 'member')}</span>}>
        <ul className="bo-rows" aria-label="Members">
          {current.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isSelf={member.id === selfMembershipId}
              busy={busy[member.id]}
              onSuspend={() => changeMember(member, 'suspended', `${member.name || member.email} was suspended. They lose access until reinstated.`)}
              onReinstate={() => changeMember(member, 'active', `${member.name || member.email} was reinstated.`)}
              onRemove={() => removeMember(member)}
            />
          ))}
        </ul>
        {removed.length > 0 && (
          <details style={{ marginTop: 16 }}>
            <summary className="bo-small" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
              {plural(removed.length, 'removed member')}
            </summary>
            <ul className="bo-rows" aria-label="Removed members">
              {removed.map((member) => (
                <MemberRow key={member.id} member={member} isSelf={false} busy={null} />
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section id="invitations" title="Invitations" aside={open.length > 0 ? <span className="bo-small bo-num">{plural(open.length, 'open invitation')}</span> : null}>
        {open.length === 0 ? (
          <EmptyState title="No open invitations">
            <p>When you invite someone, their invitation waits here until they accept it, it expires, or you withdraw it.</p>
          </EmptyState>
        ) : (
          <ul className="bo-rows" aria-label="Open invitations">
            {open.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} busy={busy[invitation.id]} onResend={() => resend(invitation)} onRevoke={() => revoke(invitation)} />
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={inviteOpen} onClose={() => { if (!inviteBusy) setInviteOpen(false); }} title="Invite someone" initialFocus="#invite-email">
        <InviteForm onSubmit={invite} onCancel={() => setInviteOpen(false)} busy={inviteBusy} serverError={inviteError} />
      </Dialog>
    </>
  );
}
