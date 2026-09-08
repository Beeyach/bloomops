import { setup as projects } from './_projects.mjs';
import { all, run } from './_bloomops-db.mjs';
import { createMilestone, getMilestone, listMilestones, reorderMilestones, updateMilestone, transitionMilestone } from '../lib/bloomops/milestones.mjs';
export async function setup(options = {}) {
  const t = await projects(options);
  t.projectId = (await t.create({ visibility: 'client', serviceEngagementId: 'ghl-service' })).projectId;
  t.add = (input = {}, extra = {}) => createMilestone(t.db, { actor: t.owner, projectId: t.projectId, requestId: crypto.randomUUID(), input: { name: 'Discovery', ...input }, ...extra });
  t.milestone = (id, actor = t.owner, projectId = t.projectId) => getMilestone(t.db, actor, projectId, id);
  t.list = (actor = t.owner, projectId = t.projectId) => listMilestones(t.db, actor, projectId);
  t.change = async (id, input, extra = {}) => updateMilestone(t.db, { actor: t.owner, projectId: t.projectId, milestoneId: id, input, expectedRevision: (await t.milestone(id)).revision, ...extra });
  t.transition = async (id, toStatus, extra = {}) => transitionMilestone(t.db, { actor: t.owner, projectId: t.projectId, milestoneId: id, toStatus, reason: 'Waiting for client feedback', expectedRevision: (await t.milestone(id)).revision, ...extra });
  t.order = async (orderedIds, extra = {}) => reorderMilestones(t.db, { actor: t.owner, projectId: t.projectId, orderedIds,
    expected: (await t.list(extra.actor)).items.map(({id,revision}) => ({id,revision})), ...extra });
  t.history = (type = null) => all(t.raw, "SELECT * FROM activity_events WHERE subject_type='milestone'" + (type ? ' AND event_type=?' : '') + ' ORDER BY rowid', ...type ? [type] : []);
  t.snapshot = () => ['milestones','activity_events'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  t.parents = () => ['projects','bloomops_clients','service_engagements','onboarding_instances','onboarding_items','department_memberships'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  t.beforeBatch = callback => { const batch = t.db.batch.bind(t.db); let once = true; t.db.batch = async writes => { if (once) { once = false; await callback(); } return batch(writes); }; };
  t.assign = (member = 'sam') => run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,?)", t.projectId, `m-${member}`);
  return t;
}
