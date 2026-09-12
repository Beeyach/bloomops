import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { freshOnboardingActor, runtimeItem, itemResource } from './onboarding-runtime.mjs';
import { activityValues } from './activity.mjs';
import { constraintMatches } from './onboarding-templates.mjs';
import { validateOnboardingGuidance } from './onboarding-guidance-values.mjs';

export async function configureOnboardingItem(db, { actor, clientId, itemId, input, now = new Date() }) {
  actor = await freshOnboardingActor(db, actor);
  if (!actor) return { ok: false, reason: 'forbidden' };
  const item = await runtimeItem(db, actor.workspaceId, clientId, itemId);
  if (!item) return { ok: false, reason: 'not_found' };
  const permission = evaluate(actor, { action: 'onboarding.manage', resource: itemResource(item) });
  if (!permission.allowed) return { ok: false, reason: permission.outcome === 'not_found' ? 'not_found' : 'forbidden' };
  const value = validateOnboardingGuidance(input);
  if (!value) return { ok: false, reason: 'invalid_guidance' };
  if (!['pending','in_progress','blocked'].includes(item.status) || item.submittedAt ||
      item.responsibleParty !== 'client' || item.visibility !== 'client' || item.guidanceRevision !== input.revision)
    return { ok: false, reason: 'conflict' };
  if (item.actionType === value.actionType && item.actionUrl === value.actionUrl && item.guidanceInstructions === value.guidanceInstructions)
    return { ok: true, unchanged: true };
  const i = schema.onboardingItems, ws = actor.workspaceId, iso = now.toISOString();
  const live = sql`EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.id=${actor.membershipId} AND m.workspace_id=${ws} AND m.user_id=${actor.userId} AND m.role=${actor.role}
    AND m.status='active' AND w.status='active')`;
  const valid = sql`${live} AND ${i.guidanceRevision}=${input.revision} AND ${i.status}=${item.status}
    AND ${i.responsibleParty}='client' AND ${i.visibility}='client'
    AND NOT EXISTS (SELECT 1 FROM onboarding_item_submissions s WHERE s.workspace_id=${ws} AND s.onboarding_item_id=${item.id})`;
  try {
    // Failing the first guard aborts the whole batch, including its activity.
    await db.batch([
      db.update(schema.onboardingInstances).set({ status: sql`CASE WHEN EXISTS (
        SELECT 1 FROM onboarding_items WHERE id=${item.id} AND workspace_id=${ws} AND ${valid}
        ) THEN ${schema.onboardingInstances.status} ELSE 'pilot_guidance_conflict' END` })
        .where(and(eq(schema.onboardingInstances.workspaceId, ws), eq(schema.onboardingInstances.id, item.onboardingInstanceId))),
      db.update(i).set({ ...value, updatedAt: iso }).where(and(eq(i.workspaceId, ws), eq(i.id, item.id))),
      db.insert(schema.activityEvents).values(activityValues({ workspaceId: ws, clientId, actorMembershipId: actor.membershipId,
        actorUserId: actor.userId, eventType: 'ONBOARDING_GUIDANCE_UPDATED', subjectType: 'onboarding_item', subjectId: item.id,
        // Destinations may be private share links; never place them in activity.
        metadata: { title: item.title }, occurredAt: iso })),
    ]);
    return { ok: true, unchanged: false };
  } catch (error) {
    if (constraintMatches(error, /onboarding_instances_status_chk|FOREIGN KEY constraint failed/)) return { ok: false, reason: 'conflict' };
    throw error;
  }
}
