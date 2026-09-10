#!/usr/bin/env node
// Read-only SQL cost against synthetic local fixtures. No SQL, bind values,
// identity/session or row payloads are written to evidence. SQLite timings are
// not remote D1 timings. Use the same persisted database for both source SHAs.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { d1Binding } from '../tests/_bloomops-db.mjs';
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const database = realpathSync(arg('--database'));
assert.ok(!relative(realpathSync('.wrangler/state/v3/d1'), database).startsWith('..'), 'Only local D1 persistence is allowed.');
const fixture = JSON.parse(readFileSync(join(resolve(arg('--fixture')), 'fixture.json')));
assert.match(fixture.ws, /^perf1-[0-9a-f]{8}$/);
const source = resolve(arg('--source', '.'));
const module = name => import(pathToFileURL(join(source, 'lib/bloomops', name + '.mjs')));
const [databaseModule, auth, membership, clients, actions, content, systems, projections, projects, assignments, activity, milestones, deliverables, files, invitations] = await Promise.all(
  ['db', 'authorization', 'membership', 'clients', 'actions', 'content', 'systems', 'work-projections', 'projects', 'project-assignments', 'project-activity', 'milestones', 'deliverables', 'files', 'invitations'].map(module));
const together = existsSync(join(source, 'lib/bloomops/read-batch.mjs')) ? (await module('read-batch')).readTogether : (db, work) => work(db);
const raw = new DatabaseSync(database, { readOnly: true });
let measurements = null;
const prepare = raw.prepare.bind(raw);
raw.prepare = sql => {
  const start = performance.now(), statement = prepare(sql), prepareMs = performance.now() - start;
  return new Proxy(statement, { get(target, key) {
    if (key === 'all' || key === 'get') return (...params) => {
      const started = performance.now();
      const result = target[key](...params);
      const executionMs = performance.now() - started;
      if (measurements) measurements.push({ prepareMs, executionMs, bindings: params.length, sqlBytes: sql.length });
      return result;
    };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
};
try {
  const db = databaseModule.bloomOpsDb(d1Binding(raw));
  const resolved = await membership.resolveWorkspaceAccess(db, fixture.members.owner.id);
  assert.equal(resolved.workspace.id, fixture.ws);
  const actor = await auth.loadActor(db, { ...resolved, user: { id: fixture.members.owner.id } });
  const id = fixture.projects[0];
  const routes = {
    Home: db => projections.homeProjection(db, actor),
    Clients: db => clients.listClients(db, actor),
    Work: db => Promise.all([actions.listActions(db, actor), actions.actionFilterOptions(db, actor)]),
    Social: db => Promise.all([content.listContent(db, actor), content.contentOptions(db, actor)]),
    Systems: db => systems.systemsProjection(db, actor),
    Team: db => Promise.all([membership.listWorkspaceMembers(db, actor.workspaceId), invitations.listInvitations(db, actor.workspaceId)]),
    'Project detail': async db => {
      const result = await projects.authorizeProject(db, actor, id, 'project.view'); assert.ok(result.ok);
      return Promise.all([assignments.listProjectAssignments(db, actor, id), activity.projectActivity(db, actor, id),
        projects.projectOptions(db, actor, { clientId: result.project.clientId }), auth.loadInternalClientResource(db, actor.workspaceId, result.project.clientId),
        milestones.listMilestones(db, actor, id), actions.listActions(db, actor, { projectId: id, view: 'all' }),
        deliverables.listDeliverables(db, actor, id), files.listFiles(db, actor, id)]);
    },
  };
  const rows = [];
  for (let round = 0; round < 12; round++) for (const [route, read] of Object.entries(routes)) {
    measurements = []; const start = performance.now();
    await together(db, read);
    const elapsedMs = performance.now() - start;
    rows.push({ round, route, elapsedMs, statements: measurements.length,
      sqlMs: measurements.reduce((n, m) => n + m.executionMs, 0), prepareMs: measurements.reduce((n, m) => n + m.prepareMs, 0),
      maxStatementMs: Math.max(...measurements.map(m => m.executionMs)), maxBindings: Math.max(...measurements.map(m => m.bindings)),
      maxSqlBytes: Math.max(...measurements.map(m => m.sqlBytes)) });
    measurements = null;
  }
  const distribution = values => { values.sort((a,b) => a-b); return { median: (values[4]+values[5])/2, p95: values[9], min: values[0], max: values[9] }; };
  const summary = Object.keys(routes).map(route => { const selected = rows.filter(r => r.route === route && r.round >= 2);
    return { route, sqlMs: distribution(selected.map(r => r.sqlMs)), prepareMs: distribution(selected.map(r => r.prepareMs)),
      elapsedMs: distribution(selected.map(r => r.elapsedMs)), maxBindings: Math.max(...selected.map(r => r.maxBindings)),
      maxStatementMs: Math.max(...selected.map(r => r.maxStatementMs)), statements: [...new Set(selected.map(r => r.statements))] }; });
  console.log(JSON.stringify({ kind: 'read-only-local-SQLite-authorized-data-only', scale: fixture.scale, counts: fixture.counts, rounds: 12, warmups: 2, summary, rows }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.name, message: 'Synthetic read-only SQL measurement failed; no query or row is logged.' })); process.exitCode = 1;
} finally { raw.close(); }
