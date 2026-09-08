// Membership, acceptance, any explicit portal contact link and their events
// commit in one D1 transaction. Generic invitations never infer contact links.
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

// Membership, acceptance, optional portal contact and activity are one fact.
// Generic invitations use the same fenced transaction without inferring a link.
export async function acceptInvitationMembership(db, { invitation, workspace, link = null, user, now }) {
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
    link
      ? db
          .select()
          .from(c)
          .where(
            and(
              eq(c.workspaceId, workspace.id),
              eq(c.clientId, invitation.clientId),
              eq(c.id, link.contactId),
            ),
          )
          .limit(1)
          .then((r) => r[0])
      : null;
  const own = await membership(),
    intended = await contact();
  if (workspace.status !== 'active') return { ok: false, reason: 'workspace_inactive' };
  if (
    link &&
    (invitation.role !== 'client' ||
      link.clientId !== invitation.clientId ||
      link.workspaceId !== workspace.id ||
      !intended)
  )
    return { ok: false, reason: 'conflict' };
  if (invitation.status === 'accepted') {
    return own?.id === invitation.acceptedMembershipId &&
      own.status === 'active' &&
      (!link || (own.role === 'client' && intended.userId === user.id))
      ? { ok: true, membership: own, workspace, invitation, alreadyAccepted: true }
      : { ok: false, reason: 'accepted' };
  }
  if (invitation.status !== 'pending') return { ok: false, reason: invitation.status };
  if (normalizeEmail(user.email) !== invitation.email) return { ok: false, reason: 'email_mismatch' };
  if (
    link &&
    (normalizeEmail(intended.email) !== invitation.email ||
      (intended.userId && intended.userId !== user.id) ||
      (own && own.role !== 'client'))
  )
    return { ok: false, reason: 'conflict' };
  const iso = now.toISOString(),
    memberId = own?.id || crypto.randomUUID();
  const contactValid = link
    ? sql`EXISTS (SELECT 1 FROM client_contacts c WHERE c.workspace_id=${workspace.id} AND c.client_id=${invitation.clientId} AND c.id=${link.contactId} AND lower(trim(c.email))=${invitation.email} AND (c.user_id IS NULL OR c.user_id=${user.id}))
    AND NOT EXISTS (SELECT 1 FROM client_contacts c WHERE c.workspace_id=${workspace.id} AND c.user_id=${user.id} AND c.client_id<>${invitation.clientId})`
    : sql`NOT EXISTS (SELECT 1 FROM client_invitation_contacts WHERE invitation_id=${invitation.id})`;
  const valid = sql`${contactValid}
    AND EXISTS (SELECT 1 FROM workspace_memberships m WHERE m.workspace_id=${workspace.id} AND m.user_id=${user.id} AND m.id=${memberId} AND m.role=${own?.role || invitation.role} AND m.status=${own?.status || 'active'})
    AND EXISTS (SELECT 1 FROM workspaces WHERE id=${workspace.id} AND status='active')`;
  const event = (type, subjectType, subjectId) =>
    db.insert(schema.activityEvents).values(
      activityValues({
        workspaceId: workspace.id,
        clientId: invitation.clientId,
        actorMembershipId: memberId,
        actorUserId: user.id,
        eventType: type,
        subjectType,
        subjectId,
        occurredAt: iso,
        metadata: { role: invitation.role, via: 'invitation' },
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
            role: invitation.role,
            status: 'active',
            invitedByMembershipId: invitation.invitedByMembershipId,
            joinedAt: iso,
            createdAt: iso,
            updatedAt: iso,
          })
          .onConflictDoNothing(),
      );
    writes.push(
      db
        .update(i)
        .set({
          // Any stale token, role, membership or contact aborts the whole batch.
          status: sql`CASE WHEN status='pending' AND token_hash=${invitation.tokenHash} AND expires_at>${iso} AND ${valid} THEN 'accepted' ELSE 'a11_acceptance_conflict' END`,
          acceptedAt: iso,
          acceptedMembershipId: memberId,
          updatedAt: iso,
        })
        .where(and(eq(i.workspaceId, workspace.id), eq(i.id, invitation.id))),
    );
    // Active generic members keep their current role. Re-inviting an inactive
    // member changes it only if that exact inactive state still holds.
    if (!own || own.status !== 'active' || link)
      writes.push(
        db
          .update(m)
          .set({
            status: 'active',
            role: own?.status === 'active' ? own.role : invitation.role,
            joinedAt: own?.joinedAt || iso,
            suspendedAt: null,
            removedAt: null,
            updatedAt: iso,
          })
          .where(and(eq(m.workspaceId, workspace.id), eq(m.id, memberId))),
      );
    if (link)
      writes.push(
        db
          .update(c)
          .set({ userId: user.id, updatedAt: iso })
          .where(
            and(
              eq(c.workspaceId, workspace.id),
              eq(c.clientId, invitation.clientId),
              eq(c.id, link.contactId),
            ),
          ),
      );
    writes.push(
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
    const activeWorkspace = (
      await db
        .select()
        .from(schema.workspaces)
        .where(and(eq(schema.workspaces.id, workspace.id), eq(schema.workspaces.status, 'active')))
        .limit(1)
    )[0];
    if (
      activeWorkspace &&
      final?.tokenHash === invitation.tokenHash &&
      final.status === 'accepted' &&
      final.acceptedMembershipId === finalMember?.id &&
      finalMember?.status === 'active' &&
      (!link || (finalMember.role === 'client' && finalContact?.userId === user.id))
    )
      return { ok: true, membership: finalMember, workspace, invitation: final, alreadyAccepted: true };
    return { ok: false, reason: 'conflict' };
  }
}
