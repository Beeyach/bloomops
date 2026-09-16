import {canonicalJson,hashDefinitionJson} from './onboarding-definition.mjs';
// A9: one durable initial activation, one atomic core, recoverable invitation
// delivery. Callers supply a server-loaded actor, never request-body identity.
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIONS, evaluate, loadActor, loadInternalClientResource } from './authorization.mjs';
import { validateEmail } from './clients.mjs';
import { normalizeEmail, resolveWorkspaceAccess } from './membership.mjs';
import { SERVICE_OPEN_STATUSES } from './services.mjs';
import { prepareOnboardingPlan, prepareOnboardingWrites } from './onboarding-generation.mjs';
import { constraintMatches } from './onboarding-templates.mjs';
import { ACTIVITY, activityValues } from './activity.mjs';
import { createInvitation, findInvitationById } from './invitations.mjs';
import { invitationEmail } from './mail.mjs';

const a = schema.clientActivations;
export const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const failure = (reason) => ({ ok: false, reason });
const find = (db, workspaceId, clientId) =>
  db
    .select()
    .from(a)
    .where(and(eq(a.workspaceId, workspaceId), eq(a.clientId, clientId)))
    .limit(1)
    .then((r) => r[0]);
const result = (row, extra = {}) => ({
  ok: true,
  activated: true,
  instanceId: row.onboardingInstanceId,
  deliveryStatus: row.deliveryStatus,
  ...extra,
});

export async function activationSummary(db, workspaceId, clientId, { now = new Date() } = {}) {
  const row = await find(db, workspaceId, clientId);
  const expired = row ? await expiredActivationInvitation(db, row, now) : false;
  return row
    ? {
        deliveryStatus: row.deliveryStatus,
        deliveredAt: row.deliveredAt,
        retryAvailable:
          (row.deliveryStatus !== 'sent' || expired) &&
          (row.deliveryStatus !== 'sending' || Date.parse(row.deliveryLeaseUntil) <= now.getTime()),
      }
    : null;
}
// Expiry is recoverable through the existing activation retry. Accepted
// invitations need no delivery, and a withdrawn invitation is not renewed here.
async function expiredActivationInvitation(db, activation, now) {
  if (!activation.invitationId) return false;
  const invitation = await findInvitationById(db, { workspaceId: activation.workspaceId, invitationId: activation.invitationId });
  return invitation?.status === 'expired' || (invitation?.status === 'pending' && Date.parse(invitation.expiresAt) <= now.getTime());
}
async function authorize(db, actor, clientId) {
  if (!actor?.workspaceId) return failure('forbidden');
  const access = await resolveWorkspaceAccess(db, actor.userId, { workspaceId: actor.workspaceId });
  if (!access || access.membership.id !== actor.membershipId) return failure('forbidden');
  actor = await loadActor(db, access);
  const resource = await loadInternalClientResource(db, actor.workspaceId, clientId);
  if (!resource) return failure('not_found');
  const permission = evaluate(actor, { action: 'client.activate', resource });
  return permission.allowed
    ? { ok: true, actor }
    : failure(permission.outcome === 'not_found' ? 'not_found' : 'forbidden');
}
const event = (db, actor, clientId, type, subjectType, subjectId, iso) =>
  db.insert(schema.activityEvents).values(
    activityValues({
      workspaceId: actor.workspaceId,
      clientId,
      actorMembershipId: actor.membershipId,
      actorUserId: actor.userId,
      eventType: type,
      subjectType,
      subjectId,
      occurredAt: iso,
    }),
  );

// A read-only preparation shared by readiness and the consequential writer.
// Neither path invents a parallel set of activation requirements.
async function prepareActivation(db, actor, clientId) {
  const workspaceId = actor.workspaceId;
    const c = schema.clients,
      contact = schema.clientContacts,
      s = schema.serviceEngagements;
    const client = (
      await db
        .select()
        .from(c)
        .where(and(eq(c.workspaceId, workspaceId), eq(c.id, clientId)))
        .limit(1)
    )[0];
    if (client?.relationshipStatus !== 'draft') return failure('not_draft');
    const contacts = await db
      .select()
      .from(contact)
      .where(
        and(
          eq(contact.workspaceId, workspaceId),
          eq(contact.clientId, clientId),
          eq(contact.isPrimary, true),
        ),
      );
    if (contacts.length !== 1) return failure('primary_contact_required');
    const primary = contacts[0];
    const email = normalizeEmail(primary.email);
    if (!email || !validateEmail(primary.email, { required: true }).ok)
      return failure('primary_email_required');
    const services = await db
      .select({ id: s.id })
      .from(s)
      .where(
        and(
          eq(s.workspaceId, workspaceId),
          eq(s.clientId, clientId),
          inArray(s.status, SERVICE_OPEN_STATUSES),
        ),
      );
    if (!services.length) return failure('services_required');
    if (services.length > 50) return failure('too_many_services');
    const serviceIds = services.map((r) => r.id).sort();
    const planned = await prepareOnboardingPlan(db, {
      workspaceId,
      clientId,
      serviceEngagementIds: serviceIds,
    });
    if (!planned.ok) return planned;
    return {ok:true,primary,email,serviceIds,planned,reviewHash:await hashDefinitionJson(canonicalJson([primary.id,primary.name,email,planned.plan]))};
}
export async function activationReadiness(db, actor, clientId) {
  const allowed = await authorize(db, actor, clientId);
  if (!allowed.ok) return allowed;
  actor = allowed.actor;
  const prepared = await prepareActivation(db, actor, clientId);
  // Recheck after reads so a revoked actor cannot obtain stale preparation data.
  if (!(await authorize(db, actor, clientId)).ok) return failure('not_found');
  return {ok:true,scope:{userId:actor.userId,workspaceId:actor.workspaceId,clientId},
    ready:prepared.ok,reason:prepared.ok?null:prepared.reason,
    canManageTemplates:evaluate(actor,{action:'templates.manage'}).allowed,
    ...(prepared.ok?{recipient:prepared.email,contactName:prepared.primary.name,reviewHash:prepared.reviewHash,serviceCount:prepared.serviceIds.length,stepCount:prepared.planned.plan.items.length}:{}),
  };
}

export async function activateClient(
  db,
  { actor, clientId, mailer, appUrl, workspaceName, inviterName = null, now = new Date(), retryOnly = false, sendInvitation = true, activationGuard = sql`1`, expectedPlanHash = null, expectedReadinessHash = null },
) {
  const allowed = await authorize(db, actor, clientId);
  if (!allowed.ok) return allowed;
  actor = allowed.actor;
  const workspaceId = actor.workspaceId;
  let activation = await find(db, workspaceId, clientId);
  const alreadyActivated = Boolean(activation);
  if (!activation) {
    if (retryOnly) return failure('not_activated');
    const ready = await prepareActivation(db, actor, clientId);
    if (!ready.ok) return ready;
    const {primary,email,serviceIds,planned} = ready;
    const c = schema.clients;
    if (expectedReadinessHash && expectedReadinessHash !== ready.reviewHash) return failure('activation_conflict');
    if (expectedPlanHash && await hashDefinitionJson(canonicalJson(planned.plan)) !== expectedPlanHash) return failure('activation_conflict');
    const prepared = await prepareOnboardingWrites(db, { workspaceId, clientId, plan: planned.plan, now });
    if (!prepared.ok) {
      activation = await find(db, workspaceId, clientId);
      if (!activation) return prepared;
    } else {
      const iso = now.toISOString();
      const openStatuses = sql.raw(SERVICE_OPEN_STATUSES.map((v) => `'${v}'`).join(', '));
      const ids = sql.join(
        serviceIds.map((id) => sql`${id}`),
        sql`, `,
      );
      const roles = sql.raw(ACTIONS['client.activate'].roles.map((v) => `'${v}'`).join(', '));
      // The database rechecks mutable preconditions under the same write lock.
      // If an edit won after preparation, abort rather than apply a stale plan.
      const stillValid = sql`${activationGuard} AND relationship_status = 'draft'
        AND EXISTS (SELECT 1 FROM client_contacts p WHERE p.id = ${primary.id} AND p.workspace_id = ${workspaceId} AND p.client_id = ${clientId} AND p.is_primary = 1 AND lower(trim(p.email)) = ${email})
        AND (SELECT count(*) FROM service_engagements s WHERE s.workspace_id = ${workspaceId} AND s.client_id = ${clientId} AND s.status IN (${openStatuses})) = ${serviceIds.length}
        AND NOT EXISTS (SELECT 1 FROM service_engagements s WHERE s.workspace_id = ${workspaceId} AND s.client_id = ${clientId} AND s.status IN (${openStatuses}) AND s.id NOT IN (${ids}))
        AND EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.id = ${actor.membershipId} AND m.workspace_id = ${workspaceId} AND m.user_id = ${actor.userId} AND m.status = 'active' AND m.role IN (${roles}) AND w.status = 'active')`;
      try {
        await db.batch([
          ...prepared.statements,
          db
            .insert(a)
            .values({
              workspaceId,
              clientId,
              onboardingInstanceId: prepared.instanceId,
              contactId: primary.id,
              recipientEmail: email,
              inviteeName: primary.name,
              actorMembershipId: actor.membershipId,
              createdAt: iso,
              updatedAt: iso,
            }),
          db
            .update(c)
            .set({
              relationshipStatus: sql`CASE WHEN ${stillValid} THEN 'onboarding' ELSE 'a9_activation_conflict' END`,
              updatedAt: iso,
            })
            .where(and(eq(c.workspaceId, workspaceId), eq(c.id, clientId))),
          event(db, actor, clientId, ACTIVITY.CLIENT_ACTIVATED, 'client', clientId, iso),
          event(
            db,
            actor,
            clientId,
            ACTIVITY.ONBOARDING_STARTED,
            'onboarding_instance',
            prepared.instanceId,
            iso,
          ),
        ]);
      } catch (e) {
        if (
          !constraintMatches(
            e,
            /UNIQUE constraint failed: (onboarding_instances.client_id|client_activations.client_id)|clients_relationship_status_chk|FOREIGN KEY constraint failed/,
          )
        )
          throw e;
        activation = await find(db, workspaceId, clientId);
        if (!activation) return failure('activation_conflict');
      }
      activation = await find(db, workspaceId, clientId);
    }
  }
  if (!sendInvitation) {
    const current = await authorize(db, actor, clientId);
    return current.ok ? result(activation, { alreadyActivated, invitationDeferred: true }) : current;
  }
  // External mail can fail without invalidating the committed activation.
  // Every delivery failure returns a usable core result, including DB failures
  // while preparing/finalizing mail. An expired lease permits crash recovery.
  try {
    return await deliver(db, {
      activation,
      actor,
      mailer,
      appUrl,
      workspaceName,
      inviterName,
      now,
      alreadyActivated,
    });
  } catch {
    return result(activation, {
      alreadyActivated,
      deliveryStatus: 'failed',
      reason: 'invitation_retry_required',
    });
  }
}

async function deliver(
  db,
  { activation, actor, mailer, appUrl, workspaceName, inviterName, now, alreadyActivated },
) {
  if (activation.deliveryStatus === 'sent' && !await expiredActivationInvitation(db, activation, now)) return result(activation, { alreadyActivated });
  const iso = now.toISOString(),
    attemptId = crypto.randomUUID();
  const claimed = await db
    .update(a)
    .set({
      deliveryStatus: 'sending',
      deliveryAttemptId: attemptId,
      deliveryLeaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS).toISOString(),
      updatedAt: iso,
    })
    .where(
      and(
        eq(a.workspaceId, actor.workspaceId),
        eq(a.id, activation.id),
        or(
          inArray(a.deliveryStatus, ['pending', 'failed']),
          and(eq(a.deliveryStatus, 'sent'), sql`EXISTS (SELECT 1 FROM workspace_invitations i WHERE i.id=${a.invitationId} AND i.workspace_id=${a.workspaceId} AND (i.status='expired' OR (i.status='pending' AND i.expires_at<=${iso})))`),
          and(eq(a.deliveryStatus, 'sending'), sql`${a.deliveryLeaseUntil} <= ${iso}`),
        ),
      ),
    )
    .returning();
  if (!claimed.length)
    return result(await find(db, actor.workspaceId, activation.clientId), { alreadyActivated });
  const owned = and(
    eq(a.workspaceId, actor.workspaceId),
    eq(a.id, activation.id),
    eq(a.deliveryAttemptId, attemptId),
    eq(a.deliveryStatus, 'sending'),
  );
  let invitation;
  try {
    // An accepted invite proves receipt even if the prior sender crashed
    // before recording delivery. Never try to re-invite that member.
    invitation = activation.invitationId
      ? await findInvitationById(db, {
          workspaceId: actor.workspaceId,
          invitationId: activation.invitationId,
        })
      : null;
    if (invitation?.status !== 'accepted') {
      const created = await createInvitation(db, {
        workspaceId: actor.workspaceId,
        clientId: activation.clientId,
        contactId: activation.contactId,
        deliveryClaim: { activationId: activation.id, attemptId },
        email: activation.recipientEmail,
        inviteeName: activation.inviteeName,
        role: 'client',
        invitedByMembershipId: actor.membershipId,
        now,
      });
      if (!created.ok) throw new Error('invitation unavailable');
      invitation = created.invitation;
      const retained = await db.update(a).set({ invitationId: invitation.id }).where(owned).returning();
      if (!retained.length)
        return result(await find(db, actor.workspaceId, activation.clientId), { alreadyActivated });
      let timeout;
      try {
        await Promise.race([
          mailer.send({
            to: invitation.email,
            ...invitationEmail({
              url: `${appUrl}/invite/${created.token}`,
              workspaceName,
              roleLabel: 'Client',
              inviterName,
            }),
          }),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('delivery timeout')), 30000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
    // Fenced completion: a stale sender cannot mark a newer attempt sent or
    // append a duplicate client-level fact. This event means first confirmed
    // delivery; generic INVITATION_SENT/RESENT describe token preparation.
    const currentAttempt = sql`EXISTS (SELECT 1 FROM client_activations WHERE id = ${activation.id} AND workspace_id = ${actor.workspaceId} AND delivery_attempt_id = ${attemptId} AND delivery_status = 'sending')`;
    const values = activityValues({
      workspaceId: actor.workspaceId,
      clientId: activation.clientId,
      actorMembershipId: actor.membershipId,
      actorUserId: actor.userId,
      eventType: ACTIVITY.CLIENT_INVITED,
      subjectType: 'invitation',
      subjectId: invitation.id,
      occurredAt: iso,
    });
    await db.batch([
      db.insert(schema.activityEvents).select(
        db
          .select(
            Object.fromEntries(
              Object.entries({
                id: crypto.randomUUID(),
                ...values,
                createdAt: iso,
              }).map(([key, value]) => [key, sql`${value}`.as(key)]),
            ),
          )
          .from(a)
          .where(and(eq(a.id, activation.id), currentAttempt, sql`NOT EXISTS (SELECT 1 FROM activity_events WHERE workspace_id=${actor.workspaceId} AND client_id=${activation.clientId} AND event_type='CLIENT_INVITED')`)),
      ),
      db
        .update(a)
        .set({ deliveryStatus: 'sent', deliveredAt: sql`coalesce(${a.deliveredAt}, ${iso})`, deliveryLeaseUntil: null, updatedAt: iso })
        .where(owned),
    ]);
    return result(await find(db, actor.workspaceId, activation.clientId), { alreadyActivated });
  } catch {
    await db
      .update(a)
      .set({ deliveryStatus: 'failed', deliveryLeaseUntil: null, updatedAt: iso })
      .where(owned);
    return result(await find(db, actor.workspaceId, activation.clientId), {
      alreadyActivated,
      reason: 'invitation_retry_required',
    });
  }
}
