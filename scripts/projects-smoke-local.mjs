#!/usr/bin/env node
// B1 invariants on disposable, nonpersistent workerd D1. Never uses the
// repository's configured database or an account binding; no email is sent.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createProject, getProject, listProjects, portalProjects, updateProject, transitionProject } from '../lib/bloomops/projects.mjs';
import { addProjectAssignment, updateProjectAssignment, removeProjectAssignment } from '../lib/bloomops/project-assignments.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';

const temp = mkdtempSync(join(tmpdir(), 'bloomops-b1-d1-'));
let proxy, checks = 0;
const check = (name, value) => { assert.ok(value, name); checks++; console.log(`ok   ${name}`); };
try {
  const configPath = join(temp, 'wrangler.json');
  writeFileSync(configPath, JSON.stringify({ name: 'bloomops-b1-disposable', compatibility_date: '2025-05-01', d1_databases: [{ binding: 'DB', database_name: 'b1-disposable-local', database_id: 'b1-disposable-local' }] }));
  proxy = await getPlatformProxy({ configPath, persist: false, remoteBindings: false, envFiles: [] });
  const d1 = proxy.env.DB, db = drizzle(d1, { schema });
  const run = (q, ...args) => d1.prepare(q).bind(...args).run();
  const one = (q, ...args) => d1.prepare(q).bind(...args).first();
  const all = async (q, ...args) => (await d1.prepare(q).bind(...args).all()).results;
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
  for (const { tag } of journal.entries) for (const statement of readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint')) if (statement.trim()) await run(statement.trim());
  check('nine domain migrations apply on actual workerd D1', journal.entries.length === 9);
  for (const ws of ['a', 'b']) await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', ws, ws, ws);
  for (const [id, role, ws] of [['ellen','owner','a'],['pm','project_manager','a'],['sam','team_member','a'],['james','client','a'],['foreign','owner','b']]) {
    await run('INSERT INTO user(id,name,email) VALUES(?,?,?)', id, id, `${id}@example.com`);
    await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')", `m-${id}`, ws, id, role);
  }
  for (const [id, ws] of [['james','a'],['lawrence','a'],['foreign-client','b']]) await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)', id, ws, id, id);
  await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','james')");
  await run("INSERT INTO service_types(id,workspace_id,name,slug) VALUES('systems','a','Systems','systems')");
  for (const client of ['james', 'lawrence']) await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a',?,'systems')", `service-${client}`, client);
  const actor = async id => { const m = await one('SELECT * FROM workspace_memberships WHERE user_id=?', id); return loadActor(db, { workspace: { id: m.workspace_id }, membership: { id: m.id, workspaceId: m.workspace_id, userId: id, role: m.role, status: m.status } }); };
  const owner = await actor('ellen');
  const create = (input = {}, opts = {}) => createProject(db, { actor: owner, clientId: 'james', input: { name: 'Website launch', ...input }, ...opts });
  const get = id => getProject(db, owner, id);
  const edit = async (id, input) => updateProject(db, { actor: owner, projectId: id, expectedRevision: (await get(id)).revision, input });
  const move = async (id, toStatus, extra = {}) => transitionProject(db, { actor: owner, projectId: id, expectedRevision: (await get(id)).revision, toStatus, ...extra });
  const events = async (id, event) => (await one('SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type=?', id, event)).n;
  const snapshot = async () => JSON.stringify(await Promise.all(['projects','project_assignments','activity_events'].map(table => all(`SELECT * FROM ${table} ORDER BY rowid`))));
  const parents = JSON.stringify(await Promise.all(['bloomops_clients','service_engagements'].map(table => all(`SELECT * FROM ${table} ORDER BY id`))));
  const created = await Promise.all([create(), create()]);
  check('same-name intentional creates get distinct Projects and one event each', created.every(r => r.ok) && created[0].projectId !== created[1].projectId && (await events(created[0].projectId, 'PROJECT_CREATED')) === 1);
  const id = created[0].projectId;
  check('new Project has independent Planned / On Track / internal defaults', (await get(id)).status === 'planned' && (await get(id)).health === 'on_track' && (await get(id)).visibility === 'internal');
  const revision = (await get(id)).revision;
  const edits = await Promise.all([1,2].map(() => updateProject(db, { actor: owner, projectId: id, expectedRevision: revision, input: { health: 'at_risk', ownerMembershipId: 'm-sam' } })));
  check('identical concurrent edits converge on one health and owner event', edits.every(r => r.ok) && await events(id, 'PROJECT_HEALTH_CHANGED') === 1 && await events(id, 'PROJECT_OWNER_CHANGED') === 1);
  check('responsibility alone grants no Project access', await getProject(db, await actor('sam'), id) === null);
  const adds = await Promise.all([1,2].map(() => addProjectAssignment(db, { actor: owner, projectId: id, membershipId: 'm-sam' })));
  check('concurrent assignment additions converge on one row and one event', adds.every(r => r.ok) && await events(id, 'PROJECT_ASSIGNMENT_ADDED') === 1);
  check('explicit Project assignment reaches only this Project', (await listProjects(db, await actor('sam'))).items.length === 1);
  check('Team Member cannot coordinate a Project', !(await updateProject(db, { actor: await actor('sam'), projectId: id, expectedRevision: (await get(id)).revision, input: { name: 'Unauthorized' } })).ok);
  const assignmentId = adds[0].assignmentId;
  const roleEdits = await Promise.all([1,2].map(() => updateProjectAssignment(db, { actor: owner, projectId: id, assignmentId, assignmentRole: 'lead' })));
  check('concurrent responsibility changes record one event', roleEdits.every(r => r.ok) && await events(id, 'PROJECT_ASSIGNMENT_UPDATED') === 1);
  const removes = await Promise.all([1,2].map(() => removeProjectAssignment(db, { actor: owner, projectId: id, assignmentId })));
  check('concurrent assignment removals record one event and revoke scope', removes.every(r => r.ok) && await events(id, 'PROJECT_ASSIGNMENT_REMOVED') === 1 && await getProject(db, await actor('sam'), id) === null);
  check('foreign Client and mismatched Service are refused', !(await create({}, { clientId: 'foreign-client' })).ok && !(await create({ serviceEngagementId: 'service-lawrence' })).ok);
  await assert.rejects(run("UPDATE projects SET service_engagement_id='service-lawrence' WHERE id=?", id));
  check('D1 itself enforces the Service/Client composite relationship', (await get(id)).serviceEngagementId === null);
  await move(id, 'ready'); await move(id, 'in_progress');
  check('Waiting and Blocked require an explanation', !(await move(id, 'waiting')).ok && !(await move(id, 'blocked')).ok);
  const beforeStatus = await get(id);
  const transitions = await Promise.all(['waiting','review'].map(toStatus => transitionProject(db, { actor: owner, projectId: id, expectedRevision: beforeStatus.revision, toStatus, reason: 'Waiting on the client' })));
  check('competing transitions commit one valid successor', transitions.filter(r => r.ok).length === 1);
  if ((await get(id)).status === 'waiting') { await move(id, 'in_progress'); await move(id, 'review'); }
  await move(id, 'completed'); const completedAt = (await get(id)).completedAt; await move(id, 'archived');
  check('completion survives archive and cannot reopen', completedAt && (await get(id)).completedAt === completedAt && !(await move(id, 'in_progress')).ok);
  check('status did not change health or any Client/Service facts', (await get(id)).health === 'at_risk' && parents === JSON.stringify(await Promise.all(['bloomops_clients','service_engagements'].map(table => all(`SELECT * FROM ${table} ORDER BY id`)))));
  await edit(id, { visibility: 'client', clientLabel: 'Your website' });
  const clientActor = await actor('james'), portal = await portalProjects(db, clientActor);
  check('Client projection uses the exact safe allowlist', portal.length === 1 && portal[0].label === 'Your website' && JSON.stringify(Object.keys(portal[0]).sort()) === JSON.stringify(['id','label','statusLabel','targetDate','completedAt','clientId','clientName'].sort()));
  await edit(id, { visibility: 'restricted' });
  check('visibility changes revoke Client reads and internal history scope immediately', (await portalProjects(db, clientActor)).length === 0 && (await projectActivity(db, await actor('sam'), id)).length === 0);
  for (const [event, operation] of [
    ['PROJECT_CREATED', () => create()], ['PROJECT_HEALTH_CHANGED', () => edit(id, { health: 'on_track' })],
    ['PROJECT_ASSIGNMENT_ADDED', () => addProjectAssignment(db, { actor: owner, projectId: id, membershipId: 'm-sam' })],
  ]) {
    const before = await snapshot();
    await run(`CREATE TRIGGER fail_late BEFORE INSERT ON activity_events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'injected local failure'); END`);
    await assert.rejects(operation());
    check(`${event} failure rolls back the complete D1 batch`, before === await snapshot());
    await run('DROP TRIGGER fail_late');
  }
  const stale = await actor('ellen'); await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");
  check('a previously loaded actor loses reads and writes after suspension', !(await createProject(db, { actor: stale, clientId: 'james', input: { name: 'Denied' } })).ok && (await listProjects(db, stale)).items.length === 0);
  await run("UPDATE workspace_memberships SET status='active' WHERE id='m-ellen'");
  const batch = db.batch.bind(db); let armed = true;
  db.batch = async writes => { if (armed) { armed = false; await run("UPDATE workspace_memberships SET status='removed' WHERE id='m-pm'"); } return batch(writes); };
  const before = await snapshot();
  check('owner invalidated immediately before commit prevents both Project and event', !(await create({ ownerMembershipId: 'm-pm' })).ok && before === await snapshot());
  db.batch = batch;
  for (let n = 0; n < 230; n++) await d1.batch([
    d1.prepare("INSERT INTO projects(id,workspace_id,client_id,name) VALUES(?,'a','james',?)").bind(`large-${n}`, `Large ${n}`),
    d1.prepare("INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')").bind(`large-${n}`),
  ]);
  const large = await listProjects(db, await actor('sam'));
  check('230 assigned Projects stay within real D1 bind limits and omit inaccessible work', large.items.length === 200 && large.hasMore && large.items.every(p => p.id.startsWith('large-')));
  check('foreign keys and SQLite integrity remain valid', (await all('PRAGMA foreign_key_check')).length === 0 && (await one('PRAGMA quick_check')).quick_check === 'ok');
  console.log(`B1 disposable workerd/D1: ${checks} checks passed.`);
} finally { await proxy?.dispose(); rmSync(temp, { recursive: true, force: true }); }
