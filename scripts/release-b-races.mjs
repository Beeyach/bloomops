// Test-only shared assertions: the same overlapping domain operations run on
// migrated SQLite in node:test and on disposable workerd D1 with actual R2.
import assert from 'node:assert/strict';
import { createProject, getProject, updateProject, transitionProject } from '../lib/bloomops/projects.mjs';
import { createMilestone, listMilestones, reorderMilestones, transitionMilestone } from '../lib/bloomops/milestones.mjs';
import { createAction, getAction, updateAction, transitionAction, listActions } from '../lib/bloomops/actions.mjs';
import { addActionDependency, removeActionDependency, listActionDependencies } from '../lib/bloomops/action-dependencies.mjs';
import { createDeliverable, getDeliverable, updateDeliverable, transitionDeliverable } from '../lib/bloomops/deliverables.mjs';
import { uploadFile, changeFile, downloadFile } from '../lib/bloomops/files.mjs';
import { FILE_LEASE_MS } from '../lib/bloomops/file-values.mjs';

export async function releaseBRaces({ db, bucket, owner, team, clientId, run, one, all, check }) {
  const actor = owner;
  const projectId = (await createProject(db, { actor, clientId, input: { name: 'B7 race laboratory', visibility: 'client' } })).projectId;
  assert.ok(projectId);
  const count = async (id, type) => (await one('SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type=?', id, type)).n;
  const winner = (name, results) => check(name, results.filter(r => r.ok && !r.unchanged).length === 1 && results.filter(r => !r.ok).every(r => ['conflict', 'cycle', 'not_found', 'invalid'].includes(r.reason)));
  winner('Project edit/edit has one canonical winner', await Promise.all(['Left', 'Right'].map(name => updateProject(db, { actor, projectId, input: { name }, expectedRevision: 1 }))));
  check('Project edit/edit appends one semantic event', await count(projectId, 'PROJECT_DETAILS_UPDATED') === 1 && (await getProject(db, actor, projectId)).revision === 2);
  winner('Project edit/status has one canonical winner', await Promise.all([
    updateProject(db, { actor, projectId, input: { health: 'at_risk' }, expectedRevision: 2 }),
    transitionProject(db, { actor, projectId, toStatus: 'ready', expectedRevision: 2 }),
  ]));
  check('Project race advances revision once', (await getProject(db, actor, projectId)).revision === 3);

  const factories = [
    ['milestone', createMilestone, 'milestoneId', { name: 'Same initial milestone' }, 'MILESTONE_CREATED'],
    ['action', createAction, 'actionId', { title: 'Same initial Action' }, 'ACTION_CREATED'],
    ['deliverable', createDeliverable, 'deliverableId', { title: 'Same initial Deliverable' }, 'DELIVERABLE_CREATED'],
  ];
  for (const [kind, create, key, input, event] of factories) {
    const requestId = crypto.randomUUID(), args = { actor, projectId, requestId, input };
    const same = await Promise.all([create(db, args), create(db, args)]);
    check(`${kind} identical overlapping creates converge with one history fact`, same.every(r => r.ok) && same[0][key] === same[1][key] && await count(same[0][key], event) === 1);
    const incompatibleKey = crypto.randomUUID();
    const different = await Promise.all(['first', 'second'].map(value => create(db, { ...args, requestId: incompatibleKey, input: { ...input, [kind === 'milestone' ? 'name' : 'title']: value } })));
    winner(`${kind} incompatible request-key race has one winner`, different);
    check(`${kind} incompatible loser appends no creation event`, await count(different.find(r => r.ok)[key], event) === 1);
  }

  const orderProject = (await createProject(db, { actor, clientId, input: { name: 'Milestone races' } })).projectId;
  for (const name of ['One', 'Two', 'Hidden', 'Three']) assert.ok((await createMilestone(db, { actor, projectId: orderProject, requestId: crypto.randomUUID(), input: { name, visibility: name === 'Hidden' ? 'restricted' : 'internal' } })).ok);
  const orderArgs = async () => {
    const { items } = await listMilestones(db, actor, orderProject);
    return { actor, projectId: orderProject, orderedIds: items.map(r => r.id).reverse(), expected: items.map(({ id, revision }) => ({ id, revision })) };
  };
  let order = await orderArgs();
  winner('Milestone competing reorder/reorder has one winner', await Promise.all([
    reorderMilestones(db, order), reorderMilestones(db, { ...order, orderedIds: [...order.orderedIds.slice(1), order.orderedIds[0]] }),
  ]));
  order = await orderArgs();
  winner('Milestone reorder/status cannot overwrite either revision', await Promise.all([
    reorderMilestones(db, order), transitionMilestone(db, { actor, projectId: orderProject, milestoneId: order.expected[0].id, expectedRevision: order.expected[0].revision, toStatus: 'in_progress' }),
  ]));
  order = await orderArgs();
  const creation = await Promise.all([
    reorderMilestones(db, order), createMilestone(db, { actor, projectId: orderProject, requestId: crypto.randomUUID(), input: { name: 'Concurrent new milestone' } }),
  ]);
  const ordered = (await listMilestones(db, actor, orderProject)).items;
  check('Milestone reorder/create preserves all rows and unique positions', creation[1].ok && ordered.length === 5 && new Set(ordered.map(r => r.position)).size === 5);
  if (creation[0].ok) check('winning reorder remains a complete order before appended creation', ordered.slice(0, 4).every((r, i) => r.id === order.orderedIds[i]));
  else check('reorder losing to visible creation conflicts', ['conflict', 'invalid'].includes(creation[0].reason));

  const action = async title => (await createAction(db, { actor, projectId, requestId: crypto.randomUUID(), input: { title, dueDate: '2020-01-01' } })).actionId;
  const nodes = [];
  for (let i = 0; i < 12; i++) nodes.push(await action(`Chain ${i}`));
  const add = async (source, target) => addActionDependency(db, { actor, actionId: source, dependsOnActionId: target, expectedRevision: (await getAction(db, actor, source)).revision });
  for (let i = 0; i < 10; i++) assert.ok((await add(nodes[i], nodes[i + 1])).ok);
  winner('concurrent opposite ends cannot close a twelve-node cycle', await Promise.all([add(nodes[10], nodes[11]), add(nodes[11], nodes[0])]));
  const edges = await all('SELECT action_id,depends_on_action_id FROM action_dependencies WHERE project_id=?', projectId);
  check('long cycle race leaves exactly eleven edges', edges.length === 11);
  check('recursive database query finds no cycle after overlapping commits', !(await one('WITH RECURSIVE reach(source,target) AS (SELECT action_id,depends_on_action_id FROM action_dependencies WHERE project_id=? UNION SELECT reach.source,d.depends_on_action_id FROM reach JOIN action_dependencies d ON d.action_id=reach.target WHERE d.project_id=?) SELECT 1 cyclic FROM reach WHERE source=target LIMIT 1', projectId, projectId)));
  const edge = (await listActionDependencies(db, actor, nodes[0])).items[0];
  const revision = (await getAction(db, actor, nodes[0])).revision;
  const beforeRemove = await count(nodes[0], 'ACTION_DEPENDENCY_REMOVED');
  const mixed = await Promise.all([
    removeActionDependency(db, { actor, actionId: nodes[0], dependencyId: edge.id, expectedRevision: revision }),
    addActionDependency(db, { actor, actionId: nodes[0], dependsOnActionId: nodes[1], expectedRevision: revision }),
  ]);
  check('add/remove race preserves edge identity and one removal event', mixed[0].ok && await count(nodes[0], 'ACTION_DEPENDENCY_REMOVED') === beforeRemove + 1);
  assert.ok((await add(nodes[0], nodes[1])).ok);
  const replacement = (await listActionDependencies(db, actor, nodes[0])).items[0];
  check('delayed old removal cannot remove a recreated edge', replacement.id !== edge.id && (await removeActionDependency(db, { actor, actionId: nodes[0], dependencyId: edge.id, expectedRevision: revision })).unchanged && (await listActionDependencies(db, actor, nodes[0])).items[0].id === replacement.id);
  const source = await action('Status/dependency race'), target = await action('Unresolved prerequisite');
  winner('Action status/dependency has one revision winner', await Promise.all([
    addActionDependency(db, { actor, actionId: source, dependsOnActionId: target, expectedRevision: 1 }),
    transitionAction(db, { actor, actionId: source, toStatus: 'in_progress', expectedRevision: 1 }),
  ]));
  assert.ok((await add(source, target)).ok);
  assert.ok((await transitionAction(db, { actor, actionId: target, toStatus: 'cancelled', expectedRevision: 1 })).ok);
  check('Cancelled prerequisite remains blocking and excludes ordinary Overdue', (await getAction(db, actor, source)).dependencyBlocked && !(await listActions(db, actor, { view: 'overdue', projectId })).items.some(r => r.id === source));
  const assigned = (await createAction(db, { actor, projectId, requestId: crypto.randomUUID(), input: { title: 'Assigned progress race', assigneeMembershipId: team.membershipId } })).actionId;
  winner('reassignment versus Team progress has one winner', await Promise.all([
    updateAction(db, { actor, actionId: assigned, input: { assigneeMembershipId: null }, expectedRevision: 1 }),
    transitionAction(db, { actor: team, actionId: assigned, toStatus: 'in_progress', expectedRevision: 1 }),
  ]));
  check('Action-only grant never grants the full race Project', await getProject(db, team, projectId) === null);

  const deliverableId = (await createDeliverable(db, { actor, projectId, requestId: crypto.randomUUID(), input: { title: 'Delivery race', visibility: 'client' } })).deliverableId;
  winner('Deliverable edit/status has one winner', await Promise.all([
    updateDeliverable(db, { actor, projectId, deliverableId, input: { clientLabel: 'Your final handoff' }, expectedRevision: 1 }),
    transitionDeliverable(db, { actor, projectId, deliverableId, toStatus: 'in_progress', expectedRevision: 1 }),
  ]));
  const states = ['planned', 'in_progress', 'internal_review', 'approved', 'delivered'];
  for (const toStatus of states.slice(states.indexOf((await getDeliverable(db, actor, projectId, deliverableId)).status) + 1, -1)) {
    assert.ok((await transitionDeliverable(db, { actor, projectId, deliverableId, toStatus, expectedRevision: (await getDeliverable(db, actor, projectId, deliverableId)).revision })).ok);
  }
  const deliveryRevision = (await getDeliverable(db, actor, projectId, deliverableId)).revision;
  const completed = await Promise.all([0, 1].map(i => transitionDeliverable(db, { actor, projectId, deliverableId, toStatus: 'delivered', expectedRevision: deliveryRevision, now: new Date(Date.now() + i * 1000) })));
  check('concurrent Delivered retries share one timestamp and semantic event', completed.every(r => r.ok) && (await getDeliverable(db, actor, projectId, deliverableId)).revision === deliveryRevision + 1 && (await one("SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type='DELIVERABLE_STATUS_CHANGED' AND json_extract(metadata_json,'$.to')='delivered'", deliverableId)).n === 1);

  const bytes = new TextEncoder().encode('B7 real recovery bytes'), metadata = { requestId: crypto.randomUUID(), filename: 'recovery.txt', mimeType: 'text/plain', byteSize: bytes.length, visibility: 'client', deliverableId };
  const wrap = overrides => ({ put: (...args) => bucket.put(...args), get: (...args) => bucket.get(...args), head: (...args) => bucket.head(...args), delete: (...args) => bucket.delete(...args), ...overrides });
  let started, release;
  const reached = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const now = new Date();
  const old = uploadFile(db, { actor, bucket: wrap({ put: async (...args) => { started(); await gate; return bucket.put(...args); } }), projectId, input: metadata, bytes, now });
  await reached;
  const reserved = await one('SELECT * FROM assets WHERE creation_request_id=?', metadata.requestId);
  try {
    const recovery = await uploadFile(db, { actor, bucket, projectId, input: metadata, bytes, now: new Date(now.getTime() + FILE_LEASE_MS) });
    check('expired generation recovery finalizes same File under a fresh key', recovery.ok && recovery.fileId === reserved.id && (await one('SELECT object_key FROM assets WHERE id=?', reserved.id)).object_key !== reserved.object_key);
  } finally { release(); }
  await old;
  check('late original PUT/finalizer cannot replace winning bytes or history', await new Response((await downloadFile(db, { actor, bucket, fileId: reserved.id })).body).text() === 'B7 real recovery bytes' && await count(reserved.id, 'FILE_UPLOADED') === 1 && await bucket.head(reserved.object_key) === null);
  const ready = await one('SELECT * FROM assets WHERE id=?', reserved.id);
  winner('File visibility/archive has one winning revision', await Promise.all([
    changeFile(db, { actor, bucket, fileId: ready.id, operation: 'visibility', visibility: 'internal', expectedRevision: ready.revision }),
    changeFile(db, { actor, bucket, fileId: ready.id, operation: 'archive', expectedRevision: ready.revision }),
  ]));
  check('File revision race appends one event and retains Ready bytes', await count(ready.id, 'FILE_VISIBILITY_CHANGED') + await count(ready.id, 'FILE_ARCHIVED') === 1 && Boolean(await bucket.head(ready.object_key)));
  const beforeFailure = JSON.stringify(await one('SELECT * FROM projects WHERE id=?', projectId));
  const eventsBefore = await count(projectId, 'PROJECT_DETAILS_UPDATED');
  await run("CREATE TRIGGER b7_late_failure BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT,'B7 injected failure after activity insert'); END");
  try { await assert.rejects(updateProject(db, { actor, projectId, input: { name: 'Must roll back' }, expectedRevision: (await getProject(db, actor, projectId)).revision })); }
  finally { await run('DROP TRIGGER b7_late_failure'); }
  check('late fact failure rolls back the earlier semantic event and fact together', beforeFailure === JSON.stringify(await one('SELECT * FROM projects WHERE id=?', projectId)) && await count(projectId, 'PROJECT_DETAILS_UPDATED') === eventsBefore);
  check('race matrix leaves relational integrity intact', (await all('PRAGMA foreign_key_check')).length === 0);
  return { projectId, deliverableId, fileId: ready.id };
}
