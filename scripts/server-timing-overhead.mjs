#!/usr/bin/env node
// PERF4 fallback microbenchmark, not a Worker/RSC or browser navigation benchmark.
// Synthetic in-memory SQLite, real issued memory-mail sessions, existing fixture shape.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { testAuth, APP_URL } from '../tests/_bloomops-db.mjs';
import { getAccess, getActor } from '../lib/bloomops/access.mjs';
import { homeProjection } from '../lib/bloomops/work-projections.mjs';
import { systemsProjection } from '../lib/bloomops/systems.mjs';
import { createServerTiming } from '../lib/bloomops/server-timing.mjs';

// Data construction copied unchanged from navigation-perf-fixture.mjs. No HTTP,
// browser, credential files, native resource configuration or real mail is used.
async function fixture(scale) {
  const clientCount = scale === 'stress' ? 150 : 50;
const lit = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const statements = [], insert = (table, row) => statements.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`);
const ws = `perf1-${randomUUID().slice(0,8)}`, members = {}, clients = [], projects = [], content = [];
insert('workspaces', { id: ws, name: 'Performance fixture', slug: ws });
for (const role of ['owner', 'admin', 'project_manager', 'team_member', 'client']) {
  const id = `${ws}-${role}`, membership = `m-${id}`, email = `${id}@example.com`;
  members[role] = { id, membership, email };
  insert('user', { id, name: role, email, email_verified: 1 });
  insert('workspace_memberships', { id: membership, workspace_id: ws, user_id: id, role, status: 'active' });
}
for (const dept of ['systems', 'social']) {
  insert('departments', { id: `${ws}-${dept}`, workspace_id: ws, name: dept, slug: dept });
  insert('service_types', { id: `${ws}-type-${dept}`, workspace_id: ws, name: dept, slug: dept, department_id: `${ws}-${dept}` });
}
for (let i = 0; i < clientCount; i++) {
  const client = `${ws}-client-${i}`; clients.push(client);
  insert('bloomops_clients', { id: client, workspace_id: ws, name: `Client ${String(i).padStart(2,'0')}`, slug: `client-${i}`, timezone: i % 2 ? 'America/Los_Angeles' : 'Etc/UTC' });
  insert('client_contacts', { workspace_id: ws, client_id: client, name: `Contact ${i}`, is_primary: 1, user_id: i === 0 ? members.client.id : null });
  for (const dept of ['systems', 'social']) {
    const service = `${client}-${dept}`, project = `${service}-project`; projects.push(project);
    insert('service_engagements', { id: service, workspace_id: ws, client_id: client, service_type_id: `${ws}-type-${dept}` });
    insert('projects', { id: project, workspace_id: ws, client_id: client, service_engagement_id: service, name: `${dept} project ${String(i).padStart(2,'0')}`, visibility: 'client', health: 'at_risk' });
    insert('project_assignments', { workspace_id: ws, project_id: project, membership_id: members.team_member.membership });
    for (let j = 0; j < 3; j++) {
      insert('milestones', { workspace_id: ws, project_id: project, creation_request_id: randomUUID(), name: `Milestone ${j}`, position: j, visibility: 'client' });
      insert('deliverables', { workspace_id: ws, project_id: project, creation_request_id: randomUUID(), title: `Deliverable ${j}`, status: 'client_review', visibility: 'client' });
    }
    for (let j = 0; j < 10; j++) insert('actions', { workspace_id: ws, project_id: project, creation_request_id: randomUUID(), title: `Action ${j}`, assignee_membership_id: members.owner.membership, due_date: '2026-09-09' });
    for (let j = 0; j < 2; j++) {
      const id = `${project}-file-${j}`;
      insert('assets', { id, workspace_id: ws, creation_request_id: randomUUID(), filename: `Brief ${j}.pdf`, mime_type: 'application/pdf',
        byte_size: 1024, sha256: '0'.repeat(64), uploader_membership_id: members.owner.membership, initial_visibility: 'internal',
        visibility: 'internal', status: 'ready', object_key: `synthetic-perf2/${id}`, etag: 'synthetic-metadata-only', ready_at: new Date().toISOString() });
      insert('asset_links', { asset_id: id, workspace_id: ws, project_id: project });
    }
    if (dept === 'social') for (let j = 0; j < 5; j++) {
      const id = `${service}-content-${j}`; content.push(id);
      insert('content_items', { id, workspace_id: ws, client_id: client, service_engagement_id: service, creation_request_id: randomUUID(), title: `Content ${i}-${j}`, type: 'reel', visibility: 'client' });
    }
  }
}

  const t = testAuth();
  t.raw.exec('BEGIN');
  try { for (const sql of statements) t.raw.exec(sql); t.raw.exec('COMMIT'); }
  catch (error) { t.raw.exec('ROLLBACK'); t.raw.close(); throw error; }
  for (const [table, multiple] of [['bloomops_clients', 1], ['projects', 2], ['milestones', 6],
    ['actions', 20], ['deliverables', 6], ['content_items', 5], ['assets', 4], ['project_assignments', 2]]) {
    assert.equal(t.raw.prepare(`SELECT count(*) n FROM ${table}`).get().n, clientCount * multiple);
  }
  const { cookie } = await t.signIn(members.owner.email);
  return { ...t, cookie, counts: { clients: clientCount, projects: clientCount * 2,
    milestones: clientCount * 6, actions: clientCount * 20, deliverables: clientCount * 6,
    content: clientCount * 5, files: clientCount * 4, projectAssignments: clientCount * 2 } };
}

const distribution = list => {
  const a = [...list].sort((a,b) => a-b), n = a.length;
  const round = x => Number(x.toFixed(3));
  return { samples: n, median: round((a[n / 2 - 1] + a[n / 2]) / 2),
    min: round(a[0]), p95: round(a[Math.ceil(n * .95) - 1]), max: round(a[n - 1]) };
};
const results = [];
try {
  for (const scale of ['representative', 'stress']) {
    const t = await fixture(scale), rows = [];
    try {
      for (let cycle = 0; cycle < 44; cycle++) for (const route of ['home', 'systems']) {
        // Alternate paired order to reduce drift; four pairs are discarded warmups.
        for (const enabled of cycle % 2 ? [true, false] : [false, true]) {
          const started = performance.now();
          const timing = createServerTiming({ enabled, environment: 'development', route, emit: () => {} });
          const receive = ({ stage, event }) => timing.mark(stage, event);
          if (enabled) channel('bloomops.navigation').subscribe(receive);
          let headerBytes = 0;
          try {
            const request = new Request(APP_URL + '/', { headers: { cookie: t.cookie } });
            const access = await getAccess(request, { env: t.env });
            assert.ok(access?.membership);
            const actor = await getActor(access);
            const data = await (route === 'home' ? homeProjection : systemsProjection)(access.db, actor);
            // Data-ready response availability, NOT the earlier OpenNext headers boundary.
            const headers = timing.response();
            headerBytes = Object.entries(headers).reduce((n, [key,value]) => n + Buffer.byteLength(key + ': ' + value + '\r\n'), 0);
            // Do not read, serialize or retain projection contents in timing evidence.
            assert.ok(data);
            timing.finish();
          } finally { if (enabled) channel('bloomops.navigation').unsubscribe(receive); }
          rows.push({ cycle, route, enabled, elapsedMs: performance.now() - started, headerBytes });
        }
      }
      const summary = [];
      for (const route of ['home', 'systems']) for (const enabled of [false, true]) {
        const selected = rows.filter(row => row.cycle >= 4 && row.route === route && row.enabled === enabled);
        summary.push({ route, enabled, elapsedMs: distribution(selected.map(row => row.elapsedMs)),
          headerBytes: distribution(selected.map(row => row.headerBytes)) });
      }
      results.push({ scale, counts: t.counts, summary, rows });
    } finally { t.raw.close(); }
  }
  console.log(JSON.stringify({ kind: 'PERF4-in-memory-authorized-data-completion-overhead',
    limitations: 'Node SQLite + issued session + projection only; no RSC/Worker/stream/browser, native invocation adapter or real logging cost. Header bytes are uncompressed field lines, not wire bytes.',
    rounds: 44, warmups: 4, results }, null, 2));
} catch {
  console.error('Synthetic PERF4 overhead check failed; no private context is logged.');
  process.exitCode = 1;
}
