// A10's shared runtime engine. Display projections are separate from the
// canonical item/instance lifecycle. All mutations and semantic events share
// one D1 transaction; a compare-and-set failure rolls back and reloads.
import { guidanceReady } from "./onboarding-guidance-values.mjs";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "./db.mjs";
import { evaluate, loadActor } from "./authorization.mjs";
import { resolveWorkspaceAccess } from "./membership.mjs";
import { activityValues } from "./activity.mjs";
import { constraintMatches } from "./onboarding-templates.mjs";

const i = schema.onboardingItems,
  n = schema.onboardingInstances;
const s = schema.onboardingItemSubmissions,
  r = schema.onboardingItemResolutions;
export const SATISFIED = ["completed", "waived", "not_applicable"];
const mutable = ["pending", "in_progress", "blocked"];
const fail = (reason) => ({ ok: false, reason });
export async function freshOnboardingActor(db, actor) {
  if (!actor?.workspaceId || !actor.userId) return null;
  const access = await resolveWorkspaceAccess(db, actor.userId, {
    workspaceId: actor.workspaceId,
  });
  return access?.membership.id === actor.membershipId
    ? loadActor(db, access)
    : null;
}
export function itemResource(item) {
  return {
    type: "onboarding_item",
    id: item.id,
    workspaceId: item.workspaceId,
    clientId: item.clientId,
    visibility: item.visibility,
  };
}
export async function runtimeItem(db, workspaceId, clientId, itemId) {
  return (
    (
      await db
        .select({
          item: i,
          clientId: n.clientId,
          instanceStatus: n.status,
          submittedAt: s.submittedAt,
          resolutionReason: r.reason,
        })
        .from(i)
        .innerJoin(
          n,
          and(
            eq(n.workspaceId, i.workspaceId),
            eq(n.id, i.onboardingInstanceId),
          ),
        )
        .leftJoin(
          s,
          and(eq(s.workspaceId, i.workspaceId), eq(s.onboardingItemId, i.id)),
        )
        .leftJoin(
          r,
          and(eq(r.workspaceId, i.workspaceId), eq(r.onboardingItemId, i.id)),
        )
        .where(
          and(
            eq(i.workspaceId, workspaceId),
            eq(n.clientId, clientId),
            eq(i.id, itemId),
          ),
        )
        .limit(1)
    ).map(({ item, ...extra }) => ({ ...item, ...extra }))[0] || null
  );
}

export function itemActions(actor, item) {
  const resource = itemResource(item);
  const open = mutable.includes(item.status);
  return {
    submit:
      open &&
      !item.submittedAt &&
      guidanceReady(item) &&
      item.responsibleParty === "client" &&
      item.visibility === "client" &&
      evaluate(actor, { action: "onboarding.submit", resource }).allowed,
    verify:
      open &&
      item.verificationRequired &&
      Boolean(item.submittedAt) &&
      evaluate(actor, { action: "onboarding.verify", resource }).allowed,
    complete:
      open &&
      item.responsibleParty !== "client" &&
      evaluate(actor, { action: "onboarding.manage", resource }).allowed,
    resolve:
      open &&
      evaluate(actor, { action: "onboarding.manage", resource }).allowed,
  };
}
const operationPolicy = {
  submit: "onboarding.submit",
  verify: "onboarding.verify",
  complete: "onboarding.manage",
  waive: "onboarding.manage",
  not_applicable: "onboarding.manage",
};

export async function mutateOnboardingItem(
  db,
  { actor, clientId, itemId, operation, reason, guidanceRevision, now = new Date() },
  attempt = 0,
) {
  actor = await freshOnboardingActor(db, actor);
  if (!actor) return fail("forbidden");
  if (!Object.hasOwn(operationPolicy, operation)) return fail("invalid_action");
  const item = await runtimeItem(db, actor.workspaceId, clientId, itemId);
  if (!item) return fail("not_found");
  const permission = evaluate(actor, {
    action: operationPolicy[operation],
    resource: itemResource(item),
  });
  if (!permission.allowed)
    return fail(permission.outcome === "not_found" ? "not_found" : "forbidden");
  if (
    operation === "submit" &&
    (item.responsibleParty !== "client" || item.visibility !== "client")
  )
    return fail("forbidden");
  if (operation === "complete" && item.responsibleParty === "client")
    return fail("invalid_action");
  if (operation === "verify" && !item.verificationRequired)
    return fail("invalid_action");
  const resolving = operation === "waive" || operation === "not_applicable";
  if (
    resolving &&
    (typeof reason !== "string" ||
      !reason.trim() ||
      reason.length > 1000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason))
  )
    return fail("invalid_reason");
  reason = resolving ? reason.trim() : null;
  if (operation === "submit" && (!guidanceReady(item) || guidanceRevision !== item.guidanceRevision))
    return fail("guidance_changed");
  const submitting = operation === "submit" && item.verificationRequired;
  const target = resolving
    ? operation === "waive"
      ? "waived"
      : "not_applicable"
    : submitting
      ? "in_progress"
      : "completed";
  const same = resolving
    ? item.status === target && item.resolutionReason === reason
    : submitting
      ? Boolean(item.submittedAt) &&
        ["in_progress", "completed"].includes(item.status)
      : item.status === "completed" &&
        (operation !== "verify" || Boolean(item.verifiedAt));
  if (same) return { ok: true, unchanged: true };
  if (
    !mutable.includes(item.status) ||
    (operation === "verify" && !item.submittedAt)
  )
    return fail("invalid_state");

  const ws = actor.workspaceId,
    iso = now.toISOString();
  // Recheck live identity, membership, contact scope, visibility, and action
  // prerequisites inside the write lock. A stale authorization cannot write.
  const active = sql`EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.workspace_id=${ws} AND m.id=${actor.membershipId} AND m.user_id=${actor.userId}
    AND m.status='active' AND m.role=${actor.role} AND w.status='active')`;
  const contact =
    actor.role === "client"
      ? sql`EXISTS (SELECT 1 FROM client_contacts c WHERE c.workspace_id=${ws} AND c.client_id=${clientId} AND c.user_id=${actor.userId})`
      : sql`1`;
  const submission = sql`EXISTS (SELECT 1 FROM onboarding_item_submissions s WHERE s.workspace_id=${ws} AND s.onboarding_item_id=${item.id})`;
  const valid = sql`${i.status}=${item.status} AND ${i.visibility}=${item.visibility}
    AND ${i.responsibleParty}=${item.responsibleParty} AND ${i.verificationRequired}=${item.verificationRequired ? 1 : 0}
    AND ${i.guidanceRevision}=${item.guidanceRevision} AND ${active} AND ${contact} AND ${submitting ? sql`NOT ${submission}` : operation === "verify" ? submission : sql`1`}`;
  const verified =
    operation === "verify" ||
    (operation === "complete" && item.verificationRequired);
  const eventType = resolving
    ? operation === "waive"
      ? "ONBOARDING_ITEM_WAIVED"
      : "ONBOARDING_ITEM_NOT_APPLICABLE"
    : submitting
      ? "ONBOARDING_ITEM_SUBMITTED"
      : verified
        ? "ONBOARDING_ITEM_VERIFIED"
        : "ONBOARDING_ITEM_COMPLETED";
  const event = (type, subjectType, subjectId, metadata = null) =>
    activityValues({
      workspaceId: ws,
      clientId,
      actorMembershipId: actor.membershipId,
      actorUserId: actor.userId,
      eventType: type,
      subjectType,
      subjectId,
      metadata,
      occurredAt: iso,
    });
  // Completion predicates are evaluated AFTER this item write, within the
  // same transaction, so concurrent final items cannot both complete a run.
  const finishes = sql`EXISTS (SELECT 1 FROM onboarding_instances n WHERE n.workspace_id=${ws} AND n.id=${item.onboardingInstanceId} AND n.status<>'complete')
    AND NOT EXISTS (SELECT 1 FROM onboarding_items x WHERE x.workspace_id=${ws} AND x.onboarding_instance_id=${item.onboardingInstanceId} AND x.required=1 AND x.status NOT IN ('completed','waived','not_applicable'))`;
  const activates = sql`${finishes} AND EXISTS (SELECT 1 FROM client_activations a JOIN bloomops_clients c ON c.id=a.client_id AND c.workspace_id=a.workspace_id
    WHERE a.workspace_id=${ws} AND a.client_id=${clientId} AND a.onboarding_instance_id=${item.onboardingInstanceId} AND c.relationship_status='onboarding')`;
  // Conditional event inserts avoid using timestamps as write ownership or
  // relying on D1 changes() semantics across statements.
  const conditionalEvent = (values, condition) =>
    db.insert(schema.activityEvents).select(sql`SELECT
    ${crypto.randomUUID()},${ws},${values.eventType},${values.subjectType},${values.subjectId},${actor.membershipId},${actor.userId},${clientId},NULL,NULL,${iso},${iso} WHERE ${condition}`);

  try {
    const writes = [
      db
        .update(n)
        .set({
          status: sql`CASE WHEN EXISTS (
      SELECT 1 FROM onboarding_items WHERE id=${item.id} AND workspace_id=${ws} AND onboarding_instance_id=${item.onboardingInstanceId} AND ${valid}
    ) THEN ${n.status} ELSE 'a10_runtime_conflict' END`,
        })
        .where(and(eq(n.workspaceId, ws), eq(n.id, item.onboardingInstanceId))),
      db
        .update(i)
        .set({
          status: sql`CASE WHEN ${valid} THEN ${target} ELSE 'a10_runtime_conflict' END`,
          completedAt: target === "completed" ? iso : null,
          completedByMembershipId:
            target === "completed" ? actor.membershipId : null,
          verifiedAt: verified ? iso : null,
          verifiedByMembershipId: verified ? actor.membershipId : null,
          updatedAt: iso,
        })
        .where(and(eq(i.workspaceId, ws), eq(i.id, item.id))),
    ];
    if (submitting)
      writes.push(
        db
          .insert(s)
          .values({
            workspaceId: ws,
            onboardingItemId: item.id,
            submittedAt: iso,
            submittedByMembershipId: actor.membershipId,
          }),
      );
    if (resolving)
      writes.push(
        db
          .insert(r)
          .values({
            workspaceId: ws,
            onboardingItemId: item.id,
            reason,
            resolvedAt: iso,
            resolvedByMembershipId: actor.membershipId,
          }),
      );
    writes.push(
      db
        .insert(schema.activityEvents)
        .values(
          event(eventType, "onboarding_item", item.id, {
            title: item.title,
            ...(reason ? { reason } : {}),
          }),
        ),
      db
        .update(n)
        .set({ status: "in_progress", startedAt: iso, updatedAt: iso })
        .where(
          and(
            eq(n.workspaceId, ws),
            eq(n.id, item.onboardingInstanceId),
            eq(n.status, "not_started"),
          ),
        ),
      conditionalEvent(
        event(
          "ONBOARDING_COMPLETED",
          "onboarding_instance",
          item.onboardingInstanceId,
        ),
        finishes,
      ),
      conditionalEvent(
        event("CLIENT_ONBOARDING_COMPLETED", "client", clientId),
        activates,
      ),
      db
        .update(schema.clients)
        .set({ relationshipStatus: "active", updatedAt: iso })
        .where(
          and(
            eq(schema.clients.workspaceId, ws),
            eq(schema.clients.id, clientId),
            activates,
          ),
        ),
      db
        .update(n)
        .set({
          status: "complete",
          completedAt: iso,
          completedByMembershipId: actor.membershipId,
          updatedAt: iso,
        })
        .where(
          and(
            eq(n.workspaceId, ws),
            eq(n.id, item.onboardingInstanceId),
            finishes,
          ),
        ),
    );
    await db.batch(writes);
    return { ok: true, unchanged: false };
  } catch (error) {
    if (
      !constraintMatches(
        error,
        /onboarding_(items|instances)_status_chk|UNIQUE constraint failed: onboarding_item_(submissions|resolutions)|FOREIGN KEY constraint failed/,
      )
    )
      throw error;
    if (attempt >= 2) return fail("conflict");
    return mutateOnboardingItem(
      db,
      { actor, clientId, itemId, operation, reason, guidanceRevision, now },
      attempt + 1,
    );
  }
}
