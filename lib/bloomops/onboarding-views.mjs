import { guidanceReady } from "./onboarding-guidance-values.mjs";
// Dedicated portal allowlists. No raw runtime row crosses a Client boundary.
import { and, desc, eq } from "drizzle-orm";
import { schema } from "./db.mjs";
import {
  evaluate,
  loadClientResource,
  loadInternalClientResource,
} from "./authorization.mjs";
import { portalClients } from "./overview.mjs";
import {
  freshOnboardingActor,
  itemActions,
  itemResource,
  SATISFIED,
} from "./onboarding-runtime.mjs";

export async function onboardingView(
  db,
  actor,
  clientId,
  { portal = false } = {},
) {
  actor = await freshOnboardingActor(db, actor);
  if (!actor || (portal && actor.role !== "client")) return null;
  const resource = await (
    portal ? loadClientResource : loadInternalClientResource
  )(db, actor.workspaceId, clientId);
  if (
    !resource ||
    !evaluate(actor, { action: "onboarding.view", resource }).allowed
  )
    return null;
  const ws = actor.workspaceId,
    n = schema.onboardingInstances,
    a = schema.clientActivations;
  const activation = (
    await db
      .select({ instanceId: a.onboardingInstanceId })
      .from(a)
      .where(and(eq(a.workspaceId, ws), eq(a.clientId, clientId)))
      .limit(1)
  )[0];
  const instance = (
    await db
      .select()
      .from(n)
      .where(
        and(
          eq(n.workspaceId, ws),
          eq(n.clientId, clientId),
          activation ? eq(n.id, activation.instanceId) : undefined,
        ),
      )
      .orderBy(desc(n.createdAt), desc(n.id))
      .limit(1)
  )[0];
  if (!instance)
    return {
      state: "not_created",
      items: [],
      progress: { done: 0, total: 0, percent: 0 },
    };
  const i = schema.onboardingItems,
    s = schema.onboardingItemSubmissions,
    r = schema.onboardingItemResolutions;
  const rows = await db
    .select({ item: i, submittedAt: s.submittedAt, resolutionReason: r.reason })
    .from(i)
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
        eq(i.workspaceId, ws),
        eq(i.onboardingInstanceId, instance.id),
        portal ? eq(i.visibility, "client") : undefined,
      ),
    )
    .orderBy(i.position, i.id);
  const visible = rows
    .map(({ item, ...extra }) => ({ ...item, ...extra, clientId }))
    .filter(
      (item) =>
        evaluate(actor, {
          action: "onboarding.view",
          resource: itemResource(item),
        }).allowed,
    );
  const required = visible.filter(
    (item) => item.required && (!portal || item.responsibleParty === "client"),
  );
  const done = required.filter(
    (item) =>
      SATISFIED.includes(item.status) ||
      (portal && item.verificationRequired && Boolean(item.submittedAt)),
  ).length;
  return {
    state: portal
      ? instance.status === "complete"
        ? "complete"
        : "open"
      : instance.status,
    progress: {
      done,
      total: required.length,
      percent: required.length
        ? Math.round((done * 100) / required.length)
        : 100,
    },
    items: visible.map((item) => {
      const actions = itemActions(actor, item);
      const base = {
        id: item.id,
        title: item.title,
        instructions: item.guidanceInstructions || item.instructions,
        actionType: item.actionType,
        actionUrl: guidanceReady(item) ? item.actionUrl : null,
        guidanceRevision: item.guidanceRevision,
        guidanceReady: guidanceReady(item),
        required: item.required,
        verificationRequired: item.verificationRequired,
        position: item.position,
      };
      if (portal)
        return {
          ...base,
          canAct: actions.submit,
          state:
            item.status === "completed"
              ? "complete"
              : ["waived", "not_applicable"].includes(item.status)
                ? "no_action"
                : item.submittedAt
                  ? "awaiting_verification"
                  : item.responsibleParty !== "client"
                    ? "agency"
                    : "todo",
        };
      return {
        ...base,
        status: item.status,
        responsibleParty: item.responsibleParty,
        visibility: item.visibility,
        submittedAt: item.submittedAt,
        resolutionReason: item.resolutionReason,
        completedAt: item.completedAt,
        verifiedAt: item.verifiedAt,
        actions: { ...actions, configure: actions.resolve && item.responsibleParty === "client" && item.visibility === "client" && !item.submittedAt },
      };
    }),
  };
}
export async function portalOnboarding(db, actor) {
  actor = await freshOnboardingActor(db, actor);
  if (!actor || actor.role !== "client") return [];
  const clients = await portalClients(db, actor);
  const result = [];
  for (const client of clients) {
    const onboarding = await onboardingView(db, actor, client.id, {
      portal: true,
    });
    if (onboarding)
      result.push({ id: client.id, name: client.name, onboarding });
  }
  return result;
}
