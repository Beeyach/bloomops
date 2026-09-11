#!/usr/bin/env node
// Synthetic development data only. Run once against the local built Worker,
// then reuse the same fixture/storage state for both before and after runs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = 'http://localhost:8787', out = resolve(arg('--out', '/tmp/bloomops-perf1-fixture'));
const scale = arg('--scale', 'representative');
assert.ok(['representative', 'stress'].includes(scale));
const clientCount = scale === 'stress' ? 150 : 50;
const health = await (await fetch(base + '/api/health')).json();
assert.ok(health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-c6-tools')), 'package.json'));
const { chromium } = require('playwright');
const cli = args => execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
mkdirSync(out, { recursive: true, mode: 0o700 });
const fixtureSql = join(out, 'fixture.sql'); writeFileSync(fixtureSql, statements.join('\n'), { mode: 0o600 });
cli(['d1', 'execute', 'DB', '--local', '--file', fixtureSql]);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const counts = { clients: clientCount, projects: clientCount * 2, milestones: clientCount * 6, actions: clientCount * 20,
    deliverables: clientCount * 6, content: clientCount * 5, files: clientCount * 4, projectAssignments: clientCount * 2 };
  writeFileSync(join(out, 'fixture.json'), JSON.stringify({ ws, scale, counts, members, clients, projects, content }, null, 2), { mode: 0o600 });
  for (const role of ['owner', 'admin', 'team_member', 'client']) {
    const context = await browser.newContext(), email = members[role].email;
    let res;
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await context.request.post(base + '/api/auth/sign-in/magic-link', { headers: { origin: base }, data: { email, callbackURL: '/' } });
      if (res.status() !== 429) break;
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    assert.equal(res.status(), 200, 'Local login must be available; wait for the normal throttle window before retrying.');
    const raw = cli(['r2', 'object', 'get', `bloomops-files-dev/dev-mail/${createHash('sha256').update(email).digest('hex')}.json`, '--local', '--pipe']);
    const link = JSON.parse(raw.slice(raw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0];
    assert.ok(link.startsWith(base + '/api/auth/magic-link/verify?'));
    const page = await context.newPage(); await page.goto(link, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, role === 'client' ? '/portal' : '/');
    writeFileSync(join(out, `${role}-state.json`), JSON.stringify(await context.storageState()), { mode: 0o600 });
    await context.close();
  }
  console.log(JSON.stringify({ scale, counts, sessions: 4 }));
} catch {
  console.error('Synthetic fixture login failed. Check the local preview and normal auth rate-limit window; no credentials are logged.');
  process.exitCode = 1;
} finally { await browser.close(); }
