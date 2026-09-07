// Only explicit invitation/contact associations enter this path. Membership,
// acceptance, the portal link and their events commit in one D1 transaction.
import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityValues } from './activity.mjs';
import { normalizeEmail } from './membership.mjs';
import { constraintMatches } from './onboarding-templates.mjs';

export async function invitationContact(db, workspaceId, invitationId) {
  const t = schema.clientInvitationContacts;
  return (
    (
      await db
        .select()
        .from(t)
        .where(and(eq(t.workspaceId, workspaceId), eq(t.invitationId, invitationId)))
        .limit(1)
    )[0] || null
  );
}

export async function acceptContactInvitation(db, { invitation, workspace, link, user, now }) {
  const m = schema.workspaceMemberships,
    c = schema.clientContacts,
    i = schema.workspaceInvitations;
  const membership = () =>
    db
      .select()
      .from(m)
      .where(and(eq(m.workspaceId, workspace.id), eq(m.userId, user.id)))
      .limit(1)
      .then((r) => r[0]);
  const contact = () =>
    db
      .select()
      .from(c)
      .where(
        and(eq(c.workspaceId, workspace.id), eq(c.clientId, invitation.clientId), eq(c.id, link.contactId)),
      )
      .limit(1)
      .then((r) => r[0]);
  const own = await membership();
  const intended = await contact();
  if (
    invitation.role !== 'client' ||
    link.clientId !== invitation.clientId ||
    link.workspaceId !== workspace.id ||
    !intended
  )
    return { ok: false, reason: 'conflict' };
  if (normalizeEmail(user.email) !== invitation.email) return { ok: false, reason: 'email_mismatch' };
  if (workspace.status !== 'active') return { ok: false, reason: 'workspace_inactive' };
  if (invitation.status === 'accepted') {
    return own?.id === invitation.acceptedMembershipId &&
      own.role === 'client' &&
      own.status === 'active' &&
      intended.userId === user.id
      ? { ok: true, membership: own, workspace, invitation, alreadyAccepted: true }
      : { ok: false, reason: 'accepted' };
  }
  if (invitation.status !== 'pending') return { ok: false, reason: invitation.status };
  if (
    normalizeEmail(intended.email) !== invitation.email ||
    (intended.userId && intended.userId !== user.id) ||
    (own && own.role !== 'client')
  )
    return { ok: false, reason: 'conflict' };
  const iso = now.toISOString();
  const newMembershipId = crypto.randomUUID();
  const memberId = own?.id || newMembershipId;
  // Evaluated inside the transaction, after a possible concurrent membership
  // insert. Token rotation/revocation, contact edits, or an unrelated portal
  // link must abort the entire batch, including a new membership.
  const valid = sql`EXISTS (SELECT 1 FROM client_contacts c WHERE c.workspace_id = ${workspace.id} AND c.client_id = ${invitation.clientId} AND c.id = ${link.contactId} AND lower(trim(c.email)) = ${invitation.email} AND (c.user_id IS NULL OR c.user_id = ${user.id}))
    AND NOT EXISTS (SELECT 1 FROM client_contacts c WHERE c.workspace_id = ${workspace.id} AND c.user_id = ${user.id} AND c.client_id <> ${invitation.clientId})
    AND EXISTS (SELECT 1 FROM workspace_memberships m WHERE m.workspace_id = ${workspace.id} AND m.user_id = ${user.id} AND m.id = ${memberId} AND m.role = 'client')
    AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = ${workspace.id} AND w.status = 'active')`;
  const event = (type, subjectType, subjectId) =>
    db
      .insert(schema.activityEvents)
      .values(
        activityValues({
          workspaceId: workspace.id,
          clientId: invitation.clientId,
          actorMembershipId: memberId,
          actorUserId: user.id,
          eventType: type,
          subjectType,
          subjectId,
          occurredAt: iso,
          metadata: { role: 'client', via: 'invitation' },
        }),
      );
  try {
    const writes = [];
    if (!own)
      writes.push(
        db
          .insert(m)
          .values({
            id: memberId,
            workspaceId: workspace.id,
            userId: user.id,
            role: 'client',
            status: 'active',
            invitedByMembershipId: invitation.invitedByMembershipId,
            joinedAt: iso,
          })
          .onConflictDoNothing(),
      );
    writes.push(
      db
        .update(i)
        .set({
          // An invalid CHECK value deliberately aborts the whole batch if the
          // invitation or scope changed since the read; caught as conflict.
          status: sql`CASE WHEN status = 'pending' AND token_hash = ${invitation.tokenHash} AND expires_at > ${iso} AND ${valid} THEN 'accepted' ELSE 'a9_acceptance_conflict' END`,
          acceptedAt: iso,
          acceptedMembershipId: memberId,
          updatedAt: iso,
        })
        .where(and(eq(i.workspaceId, workspace.id), eq(i.id, invitation.id))),
      db
        .update(m)
        .set({
          status: 'active',
          joinedAt: own?.joinedAt || iso,
          suspendedAt: null,
          removedAt: null,
          updatedAt: iso,
        })
        .where(and(eq(m.workspaceId, workspace.id), eq(m.id, memberId))),
      db
        .update(c)
        .set({ userId: user.id, updatedAt: iso })
        .where(
          and(eq(c.workspaceId, workspace.id), eq(c.clientId, invitation.clientId), eq(c.id, link.contactId)),
        ),
      event(ACTIVITY.INVITATION_ACCEPTED, 'invitation', invitation.id),
      event(own ? ACTIVITY.MEMBERSHIP_ACTIVATED : ACTIVITY.MEMBERSHIP_CREATED, 'membership', memberId),
    );
    await db.batch(writes);
    return {
      ok: true,
      membership: await membership(),
      workspace,
      invitation: { ...invitation, status: 'accepted', acceptedAt: iso, acceptedMembershipId: memberId },
      created: !own,
    };
  } catch (e) {
    if (!constraintMatches(e, /workspace_invitations_status_chk|FOREIGN KEY constraint failed/)) throw e;
    const final = (
      await db
        .select()
        .from(i)
        .where(and(eq(i.workspaceId, workspace.id), eq(i.id, invitation.id)))
        .limit(1)
    )[0];
    const finalMember = await membership(),
      finalContact = await contact();
    if (
      final?.status === 'accepted' &&
      final.acceptedMembershipId === finalMember?.id &&
      finalMember?.role === 'client' &&
      finalMember?.status === 'active' &&
      finalContact?.userId === user.id
    )
      return { ok: true, membership: finalMember, workspace, invitation: final, alreadyAccepted: true };
    return { ok: false, reason: 'conflict' };
  }
}
