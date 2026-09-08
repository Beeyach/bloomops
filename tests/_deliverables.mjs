import { setup as projects } from './_projects.mjs';
import { all, run } from './_bloomops-db.mjs';
import { createDeliverable, getDeliverable, listDeliverables, portalDeliverables, updateDeliverable, transitionDeliverable } from '../lib/bloomops/deliverables.mjs';
import { createMilestone } from '../lib/bloomops/milestones.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
import { addActionDependency } from '../lib/bloomops/action-dependencies.mjs';

export async function setup(options = {}) {
  const t = await projects(options);
  t.projectId = (await t.create({ visibility: 'client', serviceEngagementId: 'ghl-service' })).projectId;
  t.add = (input = {}, extra = {}) => createDeliverable(t.db, { actor: t.owner, projectId: t.projectId, requestId: crypto.randomUUID(), input: { title: 'Website handoff', ...input }, ...extra });
  t.item = (id, actor = t.owner, projectId = t.projectId) => getDeliverable(t.db, actor, projectId, id);
  t.list = (actor = t.owner, projectId = t.projectId) => listDeliverables(t.db, actor, projectId);
  t.portal = async (actor = null, projectId = t.projectId) => portalDeliverables(t.db, actor || await t.actor('james'), projectId);
  t.change = async (id, input, extra = {}) => updateDeliverable(t.db, { actor: t.owner, projectId: t.projectId, deliverableId: id, input, expectedRevision: (await t.item(id)).revision, ...extra });
  t.transition = async (id, toStatus, extra = {}) => transitionDeliverable(t.db, { actor: t.owner, projectId: t.projectId, deliverableId: id, toStatus, expectedRevision: (await t.item(id)).revision, ...extra });
  t.history = (type = null) => all(t.raw, "SELECT * FROM activity_events WHERE subject_type='deliverable'" + (type ? ' AND event_type=?' : '') + ' ORDER BY rowid', ...type ? [type] : []);
  t.snapshot = () => ['deliverables','activity_events'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  t.parents = () => ['projects','milestones','actions','action_dependencies','bloomops_clients','service_engagements','onboarding_instances','onboarding_items','department_memberships'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  t.beforeBatch = callback => { const batch = t.db.batch.bind(t.db); let once = true; t.db.batch = async writes => { if (once) { once = false; await callback(); } return batch(writes); }; };
  t.assign = (member = 'sam') => run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,?)", t.projectId, `m-${member}`);
  t.seedWork = async () => {
    const parent = { actor: t.owner, projectId: t.projectId };
    const milestoneId = (await createMilestone(t.db, { ...parent, requestId: crypto.randomUUID(), input: { name: 'Build' } })).milestoneId;
    const a = await createAction(t.db, { ...parent, requestId: crypto.randomUUID(), input: { title: 'Prepare', milestoneId } });
    const b = await createAction(t.db, { ...parent, requestId: crypto.randomUUID(), input: { title: 'Build', assigneeMembershipId: 'm-sam' } });
    await addActionDependency(t.db, { actor: t.owner, actionId: b.actionId, dependsOnActionId: a.actionId, expectedRevision: 1 });
  };
  return t;
}
