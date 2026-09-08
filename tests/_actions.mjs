import { setup as milestones } from './_milestones.mjs';
import { all, run } from './_bloomops-db.mjs';
import { createAction, getAction, listActions, updateAction, transitionAction } from '../lib/bloomops/actions.mjs';
import { addActionDependency, listActionDependencies, removeActionDependency } from '../lib/bloomops/action-dependencies.mjs';

export async function setup(options = {}) {
  const t = await milestones(options);
  t.addAction = (input = {}, extra = {}) => createAction(t.db, { actor: t.owner, projectId: t.projectId, requestId: crypto.randomUUID(), input: { title: 'Build the landing page', ...input }, ...extra });
  t.action = (id, actor = t.owner, extra = {}) => getAction(t.db, actor, id, extra);
  t.actions = (actor = t.owner, input = {}, extra = {}) => listActions(t.db, actor, { view: 'all', ...input }, extra);
  t.editAction = async (id, input, extra = {}) => updateAction(t.db, { actor: t.owner, actionId: id, input, expectedRevision: (await t.action(id)).revision, ...extra });
  t.progress = async (id, toStatus, extra = {}) => transitionAction(t.db, { actor: t.owner, actionId: id, toStatus, waitingType: 'client', waitingReason: 'Awaiting feedback\nExpected tomorrow', expectedRevision: (await t.action(id)).revision, ...extra });
  t.depend = async (id, target, extra = {}) => addActionDependency(t.db, { actor: t.owner, actionId: id, dependsOnActionId: target, expectedRevision: (await t.action(id)).revision, ...extra });
  t.dependencies = (id, actor = t.owner) => listActionDependencies(t.db, actor, id);
  t.removeDependency = async (id, dependencyId, extra = {}) => removeActionDependency(t.db, { actor: t.owner, actionId: id, dependencyId, expectedRevision: (await t.action(id)).revision, ...extra });
  t.actionHistory = type => all(t.raw, "SELECT * FROM activity_events WHERE subject_type='action'" + (type ? ' AND event_type=?' : '') + ' ORDER BY rowid', ...type ? [type] : []);
  t.actionSnapshot = () => ['actions', 'action_dependencies', 'activity_events'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`));
  t.allParents = () => [...t.parents(), all(t.raw, 'SELECT * FROM milestones ORDER BY rowid')];
  t.seedAction = (id, patch = {}) => {
    const row = { id, workspace_id: 'a', project_id: t.projectId, creation_request_id: crypto.randomUUID(), title: id, ...patch };
    run(t.raw, `INSERT INTO actions(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row));
    return id;
  };
  return t;
}
