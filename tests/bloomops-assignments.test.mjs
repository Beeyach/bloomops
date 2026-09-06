// A7 scoped team assignment, proven end to end against the real schema, the
// real route handlers, and the real A4 engine.
//
// What this suite exists to prove is one sentence: a client assignment
// grants the whole client, a service assignment grants exactly one service,
// and department membership grants nothing. Everything else here follows
// from that, including the two cases that matter most in practice, where
// somebody holds both kinds of row and one is taken away.
//
// Scope is never asserted from the rows. Every check goes through a freshly
// loaded actor, the way a real request does, so what is proved is what the
// engine actually answers on the next call.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testAuth, run, one, all, APP_URL } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import {
  ACTIONS,
  canAccessClient,
  canAccessService,
  evaluate,
  loadActor,
  loadInternalClientResource,
  loadInternalServiceResource,
} from '../lib/bloomops/authorization.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';
import { setMembershipStatus } from '../lib/bloomops/membership.mjs';
import { getClient, listClients } from '../lib/bloomops/clients.mjs';
import { listClientServices } from '../lib/bloomops/services.mjs';
import {
  ASSIGNMENT_ROLES,
  assignmentCandidates,
  listClientAssignments,
  listServiceAssignments,
} from '../lib/bloomops/assignments.mjs';
import { describeEvent } from '../lib/bloomops/client-activity.mjs';

const { POST: addClientAssignmentRoute } = await import('../app/api/bloomops/clients/[id]/assignments/route.js');
const { PATCH: patchClientAssignmentRoute, DELETE: deleteClientAssignmentRoute } = await import('../app/api/bloomops/clients/[id]/assignments/[assignmentId]/route.js');
const { POST: addServiceAssignmentRoute } = await import('../app/api/bloomops/clients/[id]/services/[serviceId]/assignments/route.js');
const { PATCH: patchServiceAssignmentRoute, DELETE: deleteServiceAssignmentRoute } = await import('../app/api/bloomops/clients/[id]/services/[serviceId]/assignments/[assignmentId]/route.js');

// ── scenario ─────────────────────────────────────────────────────────────

const PEOPLE = {
  owner: 'a-owner@example.com',
  admin: 'a-admin@example.com',
  pm: 'a-pm@example.com',
  maria: 'a-maria@example.com',
  tomas: 'a-tomas@example.com',
  dev: 'a-dev@example.com',
  suspended: 'a-suspended@example.com',
  removed: 'a-removed@example.com',
  clientLinked: 'a-client-linked@example.com',
  bOwner: 'b-owner@example.com',
  bAdmin: 'b-admin@example.com',
};

const CONTEXT = Symbol.for('__cloudflare-context__');

// James has three services (Social, Ads, GHL); Lawrence has one. Nobody
// starts with any assignment: each test arranges exactly what it needs.
async function scenario() {
  const t = testAuth();
  await runBootstrap(t.d1, { workspaceName: 'Agency A', owner: { email: PEOPLE.owner, name: 'Ellen Owner' }, admin: { email: PEOPLE.admin, name: 'Ary Admin' } });
  await runBootstrap(t.d1, { workspaceName: 'Agency B', owner: { email: PEOPLE.bOwner, name: 'Bea Owner' }, admin: { email: PEOPLE.bAdmin, name: 'Bo Admin' } });
  const A = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-a'").id;
  const B = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-b'").id;

  const person = (key, workspaceId, role, name, status = 'active') => {
    run(t.raw, 'INSERT INTO user (id, name, email, email_verified) VALUES (?, ?, ?, 1)', `u_${key}`, name, PEOPLE[key]);
    run(t.raw, 'INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', `m_${key}`, workspaceId, `u_${key}`, role, status, '2026-01-01T00:00:00.000Z');
    return `m_${key}`;
  };
  person('pm', A, 'project_manager', 'Priya Manel');
  person('maria', A, 'team_member', 'Maria Reyes');
  person('tomas', A, 'team_member', 'Tomas Bell');
  person('dev', A, 'team_member', 'Dev Ortiz');
  person('suspended', A, 'team_member', 'Sam Suspended', 'suspended');
  person('removed', A, 'team_member', 'Ren Removed', 'removed');
  person('clientLinked', A, 'client', 'Rae Ellis');

  const typeId = (workspaceId, slug) => one(t.raw, 'SELECT id FROM service_types WHERE workspace_id = ? AND slug = ?', workspaceId, slug).id;
  const departmentId = (workspaceId, slug) => one(t.raw, 'SELECT id FROM departments WHERE workspace_id = ? AND slug = ?', workspaceId, slug).id;

  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) VALUES ('c_james', ?, 'James', 'james', 'active')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) VALUES ('c_lawrence', ?, 'Lawrence', 'lawrence', 'active')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_b1', ?, 'B One', 'b-one')", B);
  const engagement = (id, workspaceId, clientId, slug, status = 'active') =>
    run(t.raw, 'INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES (?, ?, ?, ?, ?)', id, workspaceId, clientId, typeId(workspaceId, slug), status);
  engagement('se_james_social', A, 'c_james', 'social-media-management');
  engagement('se_james_ads', A, 'c_james', 'ads');
  engagement('se_james_ghl', A, 'c_james', 'ghl');
  engagement('se_lawrence_social', A, 'c_lawrence', 'social-media-management');
  engagement('se_b1_social', B, 'c_b1', 'social-media-management');
  run(t.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) VALUES ('cc_james', ?, 'c_james', 'Rae Ellis', ?, 'u_clientLinked', 1)", A, PEOPLE.clientLinked);

  // A fresh actor, exactly as a new request builds one.
  async function actorFor(email, workspaceId = A) {
    const user = one(t.raw, 'SELECT id FROM user WHERE email = ?', email);
    const resolved = await resolveWorkspaceAccess(t.db, user.id, { workspaceId });
    return resolved ? loadActor(t.db, { ...resolved, user }) : null;
  }

  const cookies = new Map();
  async function cookieFor(email) {
    if (!cookies.has(email)) cookies.set(email, (await t.signIn(email)).cookie);
    return cookies.get(email);
  }

  async function call(email, path, { method = 'POST', body = null, origin = APP_URL, params = {}, handler } = {}) {
    globalThis[CONTEXT] = { env: t.env, cf: {}, ctx: {} };
    const headers = {};
    if (email) headers.cookie = await cookieFor(email);
    if (method !== 'GET') headers.origin = origin;
    if (body !== null) headers['content-type'] = 'application/json';
    const req = new Request(`${APP_URL}${path}`, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
    const res = await handler(req, { params: Promise.resolve(params) });
    let json = null;
    try {
      json = JSON.parse(await res.clone().text());
    } catch {}
    return { status: res.status, json, res };
  }

  const assignClient = (email, clientId, body, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/assignments`, { body, params: { id: clientId }, handler: addClientAssignmentRoute, ...options });
  const patchClient = (email, clientId, assignmentId, body, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/assignments/${assignmentId}`, { method: 'PATCH', body, params: { id: clientId, assignmentId }, handler: patchClientAssignmentRoute, ...options });
  const unassignClient = (email, clientId, assignmentId, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/assignments/${assignmentId}`, { method: 'DELETE', params: { id: clientId, assignmentId }, handler: deleteClientAssignmentRoute, ...options });
  const assignService = (email, clientId, serviceId, body, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/services/${serviceId}/assignments`, { body, params: { id: clientId, serviceId }, handler: addServiceAssignmentRoute, ...options });
  const patchServiceAssignment = (email, clientId, serviceId, assignmentId, body, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/services/${serviceId}/assignments/${assignmentId}`, { method: 'PATCH', body, params: { id: clientId, serviceId, assignmentId }, handler: patchServiceAssignmentRoute, ...options });
  const unassignService = (email, clientId, serviceId, assignmentId, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/services/${serviceId}/assignments/${assignmentId}`, { method: 'DELETE', params: { id: clientId, serviceId, assignmentId }, handler: deleteServiceAssignmentRoute, ...options });

  const events = (clientId) => all(t.raw, 'SELECT * FROM activity_events WHERE client_id = ? ORDER BY rowid', clientId);
  const eventTypes = (clientId) => events(clientId).map((e) => e.event_type);
  const clientRow = (id) => one(t.raw, 'SELECT * FROM bloomops_clients WHERE id = ?', id);

  return {
    ...t, A, B, typeId, departmentId, actorFor, cookieFor,
    assignClient, patchClient, unassignClient, assignService, patchServiceAssignment, unassignService,
    events, eventTypes, clientRow,
  };
}

// What one person can actually reach, asked of a freshly loaded actor.
async function reach(s, email) {
  const actor = await s.actorFor(email);
  const clients = await listClients(s.db, actor);
  return {
    actor,
    clients: clients.clients.map((c) => c.id).sort(),
    james: canAccessClient(actor, 'c_james'),
    lawrence: canAccessClient(actor, 'c_lawrence'),
    social: canAccessService(actor, { serviceEngagementId: 'se_james_social', clientId: 'c_james' }),
    ads: canAccessService(actor, { serviceEngagementId: 'se_james_ads', clientId: 'c_james' }),
    ghl: canAccessService(actor, { serviceEngagementId: 'se_james_ghl', clientId: 'c_james' }),
    lawrenceSocial: canAccessService(actor, { serviceEngagementId: 'se_lawrence_social', clientId: 'c_lawrence' }),
    bSocial: canAccessService(actor, { serviceEngagementId: 'se_b1_social', clientId: 'c_b1' }),
  };
}

// ── the action policy ────────────────────────────────────────────────────

test('client.assign and service.assign are delivery actions, not membership administration', async () => {
  for (const action of ['client.assign', 'service.assign']) {
    assert.ok(ACTIONS[action], `${action} exists`);
    assert.deepEqual(ACTIONS[action].roles, ['owner', 'admin', 'project_manager']);
    assert.equal(ACTIONS[action].resource, true, 'each names the record it is about');
    assert.equal(ACTIONS[action].capability, undefined, 'and none of them needs members.manage');
  }
  assert.deepEqual(ASSIGNMENT_ROLES, ['lead', 'member'], 'two roles, and no invented third');
});

test('Owner, Admin, and Project Manager may assign; a Team Member and a Client may not', async () => {
  const s = await scenario();
  assert.equal((await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' })).status, 201);
  assert.equal((await s.assignClient(PEOPLE.admin, 'c_james', { membershipId: 'm_tomas', assignmentRole: 'lead' })).status, 201);
  assert.equal((await s.assignService(PEOPLE.pm, 'c_james', 'se_james_ghl', { membershipId: 'm_dev' })).status, 201);

  // Tomas can now reach James, and still cannot assign anybody.
  const refused = await s.assignClient(PEOPLE.tomas, 'c_james', { membershipId: 'm_dev' });
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.json, { error: 'You do not have permission to do that.' });
  const refusedService = await s.assignService(PEOPLE.tomas, 'c_james', 'se_james_social', { membershipId: 'm_dev' });
  assert.equal(refusedService.status, 403);

  // A Client membership never reaches the internal team surface at all.
  const client = await s.assignClient(PEOPLE.clientLinked, 'c_james', { membershipId: 'm_dev' });
  assert.equal(client.status, 404);
  assert.deepEqual(client.json, { error: 'Not found.' });
  const clientService = await s.assignService(PEOPLE.clientLinked, 'c_james', 'se_james_social', { membershipId: 'm_dev' });
  assert.equal(clientService.status, 404);
  assert.deepEqual(clientService.json, client.json);
});

// ── client-level scope ───────────────────────────────────────────────────

test('a client assignment grants the client record and every service under it, including later ones', async () => {
  const s = await scenario();
  const before = await reach(s, PEOPLE.maria);
  assert.deepEqual(before.clients, [], 'a Team Member with no assignment reaches nothing');
  assert.equal(before.james, false);

  const created = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'lead' });
  assert.equal(created.status, 201);

  const after = await reach(s, PEOPLE.maria);
  assert.deepEqual(after.clients, ['c_james'], 'the client appears in their list');
  assert.equal(after.james, true);
  assert.deepEqual([after.social, after.ads, after.ghl], [true, true, true], 'and every service under it');
  assert.equal(after.lawrence, false, 'and nothing of another client');
  assert.deepEqual([after.lawrenceSocial, after.bSocial], [false, false]);
  assert.ok(await getClient(s.db, after.actor, 'c_james'), 'the client detail opens');
  assert.equal(await getClient(s.db, after.actor, 'c_lawrence'), null, 'another client does not');
  assert.equal((await listClientServices(s.db, after.actor, 'c_james')).length, 3);

  // A service added afterwards is covered without touching a row.
  run(s.raw, 'INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES (?, ?, ?, ?, ?)', 'se_james_kajabi', s.A, 'c_james', s.typeId(s.A, 'kajabi'), 'planned');
  const later = await s.actorFor(PEOPLE.maria);
  assert.equal(canAccessService(later, { serviceEngagementId: 'se_james_kajabi', clientId: 'c_james' }), true);

  const row = one(s.raw, 'SELECT * FROM client_assignments WHERE id = ?', created.json.assignment.id);
  assert.equal(row.workspace_id, s.A, 'the row carries the current workspace');
  assert.equal(row.assignment_role, 'lead');
});

test('removing a client assignment takes the client and its services away on the next request', async () => {
  const s = await scenario();
  const created = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  assert.equal((await reach(s, PEOPLE.maria)).james, true);

  const removed = await s.unassignClient(PEOPLE.owner, 'c_james', created.json.assignment.id);
  assert.equal(removed.status, 200);

  const after = await reach(s, PEOPLE.maria);
  assert.deepEqual(after.clients, [], 'the client disappears from their list');
  assert.equal(after.james, false);
  assert.deepEqual([after.social, after.ads, after.ghl], [false, false, false]);
  assert.equal(await getClient(s.db, after.actor, 'c_james'), null, 'and the detail becomes not-found');
  const resource = await loadInternalClientResource(s.db, s.A, 'c_james');
  assert.equal(evaluate(after.actor, { action: 'client.view', resource }).outcome, 'not_found');
});

// ── service-level scope ──────────────────────────────────────────────────

test('a service assignment grants exactly that engagement: not the client, not its siblings, not another client’s', async () => {
  const s = await scenario();
  const created = await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId: 'm_maria', assignmentRole: 'member' });
  assert.equal(created.status, 201);

  const after = await reach(s, PEOPLE.maria);
  assert.equal(after.social, true, 'James → Social');
  assert.equal(after.james, false, 'but not the James client record');
  assert.deepEqual(after.clients, [], 'so James is not in their client list either');
  assert.equal(after.ads, false, 'not James → Ads');
  assert.equal(after.ghl, false, 'not James → GHL');
  assert.equal(after.lawrenceSocial, false, "not another client's Social");
  assert.equal(after.bSocial, false, "and nothing of another agency's");
  assert.equal(await getClient(s.db, after.actor, 'c_james'), null);

  const services = await listClientServices(s.db, after.actor, 'c_james');
  assert.deepEqual(services.map((x) => x.id), ['se_james_social'], 'they see the one engagement they hold');

  const social = await loadInternalServiceResource(s.db, s.A, 'se_james_social');
  const ghl = await loadInternalServiceResource(s.db, s.A, 'se_james_ghl');
  assert.equal(evaluate(after.actor, { action: 'service.view', resource: social }).allowed, true);
  assert.equal(evaluate(after.actor, { action: 'service.view', resource: ghl }).outcome, 'not_found', 'and the sibling is not even admitted to exist');

  const row = one(s.raw, 'SELECT * FROM service_assignments WHERE id = ?', created.json.assignment.id);
  assert.equal(row.workspace_id, s.A);
  assert.equal(row.service_engagement_id, 'se_james_social');
});

// ── the two narrowing cases ──────────────────────────────────────────────

test('removing the broad assignment narrows scope correctly and leaves the explicit service assignment standing', async () => {
  const s = await scenario();
  // Maria holds both: the whole client, and James → Social specifically.
  const clientAssignment = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  const serviceAssignment = await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId: 'm_maria', assignmentRole: 'lead' });
  const both = await reach(s, PEOPLE.maria);
  assert.deepEqual([both.james, both.social, both.ghl, both.ads], [true, true, true, true]);

  const removed = await s.unassignClient(PEOPLE.owner, 'c_james', clientAssignment.json.assignment.id);
  assert.equal(removed.status, 200);

  const after = await reach(s, PEOPLE.maria);
  assert.equal(after.james, false, 'the client record is gone');
  assert.deepEqual(after.clients, []);
  assert.equal(after.ghl, false, 'and so is implicit access to the other services');
  assert.equal(after.ads, false);
  assert.equal(after.social, true, 'but James → Social remains, through the explicit row');

  // The service assignment row was not deleted as a side effect.
  assert.ok(one(s.raw, 'SELECT id FROM service_assignments WHERE id = ?', serviceAssignment.json.assignment.id), 'nothing cascaded');
  assert.equal(all(s.raw, "SELECT id FROM client_assignments WHERE client_id = 'c_james'").length, 0);
});

test('removing the narrow assignment does not defeat broader access that still exists', async () => {
  const s = await scenario();
  await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  const serviceAssignment = await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId: 'm_maria' });

  const removed = await s.unassignService(PEOPLE.owner, 'c_james', 'se_james_social', serviceAssignment.json.assignment.id);
  assert.equal(removed.status, 200);

  const after = await reach(s, PEOPLE.maria);
  assert.equal(after.social, true, 'Social is still reachable, through the client assignment');
  assert.equal(after.james, true, 'and so is the client');
  assert.deepEqual([after.ads, after.ghl], [true, true]);
  assert.equal(all(s.raw, "SELECT id FROM client_assignments WHERE client_id = 'c_james'").length, 1, 'the broader row is untouched');
});

// ── department membership ────────────────────────────────────────────────

test('department membership alone grants no client and no service, however many rows exist', async () => {
  const s = await scenario();
  for (const slug of ['social', 'ads', 'systems', 'operations']) {
    run(s.raw, 'INSERT INTO department_memberships (workspace_id, department_id, membership_id, is_lead) VALUES (?, ?, ?, 1)', s.A, s.departmentId(s.A, slug), 'm_dev');
  }
  assert.equal(all(s.raw, "SELECT id FROM department_memberships WHERE membership_id = 'm_dev'").length, 4, 'lead of all four departments');

  const after = await reach(s, PEOPLE.dev);
  assert.deepEqual(after.clients, [], 'zero client scope');
  assert.deepEqual([after.james, after.lawrence], [false, false]);
  assert.deepEqual([after.social, after.ads, after.ghl, after.lawrenceSocial], [false, false, false, false], 'zero service scope');
  assert.equal(after.actor.scope.clientIds.size, 0);
  assert.equal(after.actor.scope.serviceEngagementIds.size, 0);
});

// ── candidates ───────────────────────────────────────────────────────────

test('the candidate list is this workspace’s active internal memberships, and nothing else', async () => {
  const s = await scenario();
  const candidates = await assignmentCandidates(s.db, s.A);
  const emails = candidates.map((c) => c.email).sort();
  assert.deepEqual(emails, [PEOPLE.admin, PEOPLE.dev, PEOPLE.maria, PEOPLE.owner, PEOPLE.pm, PEOPLE.tomas].sort());
  assert.ok(!emails.includes(PEOPLE.clientLinked), 'no Client membership');
  assert.ok(!emails.includes(PEOPLE.suspended), 'no suspended membership');
  assert.ok(!emails.includes(PEOPLE.removed), 'no removed membership');
  assert.ok(!emails.includes(PEOPLE.bOwner), 'and nobody from the other agency');
  assert.ok(candidates.every((c) => c.membershipId && c.name && c.roleLabel), 'each is a membership, named');
});

test('a new assignment refuses a Client membership, a suspended one, a removed one, a foreign one, and an invented id', async () => {
  const s = await scenario();
  const cases = {
    client: 'm_clientLinked',
    suspended: 'm_suspended',
    removed: 'm_removed',
    foreign: one(s.raw, 'SELECT m.id FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = ?', PEOPLE.bOwner).id,
    invented: 'm_nope',
    empty: '',
    // A user id is not a membership id, and this API takes membership ids.
    userId: 'u_maria',
  };
  for (const [label, membershipId] of Object.entries(cases)) {
    const res = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId });
    assert.equal(res.status, 400, `${label} is refused`);
    assert.equal(res.json.errors.membershipId, 'Choose someone from the list.', `${label} says nothing about why`);
    const service = await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId });
    assert.equal(service.status, 400, `${label} is refused on a service too`);
    assert.deepEqual(service.json, res.json);
  }
  assert.equal(all(s.raw, 'SELECT id FROM client_assignments').length, 0, 'and none of them made a row');
  assert.equal(all(s.raw, 'SELECT id FROM service_assignments').length, 0);
  assert.equal(s.events('c_james').length, 0, 'nor an event');

  const bad = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'supervisor' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.errors.assignmentRole, 'Choose Lead or Member.');
});

test('somebody assigned legitimately keeps their row when their membership ends, and is shown as no longer active', async () => {
  const s = await scenario();
  const created = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'lead' });
  assert.equal((await reach(s, PEOPLE.maria)).james, true);

  const ownerMembership = one(s.raw, 'SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = ? AND m.workspace_id = ?', PEOPLE.owner, s.A);
  await setMembershipStatus(s.db, {
    workspaceId: s.A,
    membershipId: 'm_maria',
    status: 'suspended',
    actorMembership: { id: ownerMembership.id, userId: ownerMembership.user_id },
  });

  // The row is still there, and the screen says what happened to them.
  const assignments = await listClientAssignments(s.db, s.A, 'c_james');
  assert.equal(assignments.length, 1, 'the assignment is operational history, not something to tidy away');
  assert.equal(assignments[0].name, 'Maria Reyes');
  assert.equal(assignments[0].active, false, 'marked as no longer active');
  assert.equal(assignments[0].assignmentRoleLabel, 'Lead');
  // And the engine refuses them anyway.
  assert.equal(await s.actorFor(PEOPLE.maria), null, 'a suspended membership resolves to no access at all');

  // A manager may take the stale row away deliberately.
  const removed = await s.unassignClient(PEOPLE.owner, 'c_james', created.json.assignment.id);
  assert.equal(removed.status, 200);
  assert.equal((await listClientAssignments(s.db, s.A, 'c_james')).length, 0);
});

// ── mutation semantics ───────────────────────────────────────────────────

test('re-assigning the same person is never a second row: the same role is a no-op, a different role is a change', async () => {
  const s = await scenario();
  const first = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'member' });
  assert.equal(first.status, 201);

  const same = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'member' });
  assert.equal(same.status, 200);
  assert.equal(same.json.unchanged, true);
  assert.equal(same.json.assignment.id, first.json.assignment.id);

  const promoted = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'lead' });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.json.unchanged, false);
  assert.equal(all(s.raw, "SELECT id FROM client_assignments WHERE client_id = 'c_james'").length, 1, 'still one row');
  assert.equal(one(s.raw, "SELECT assignment_role FROM client_assignments WHERE client_id = 'c_james'").assignment_role, 'lead');

  // The explicit PATCH is the same rule.
  const patched = await s.patchClient(PEOPLE.owner, 'c_james', first.json.assignment.id, { assignmentRole: 'lead' });
  assert.equal(patched.json.unchanged, true, 'already lead');
  const back = await s.patchClient(PEOPLE.owner, 'c_james', first.json.assignment.id, { assignmentRole: 'member' });
  assert.equal(back.json.unchanged, false);
  assert.equal(all(s.raw, "SELECT id FROM client_assignments WHERE client_id = 'c_james'").length, 1);

  assert.deepEqual(
    s.eventTypes('c_james'),
    ['CLIENT_ASSIGNMENT_ADDED', 'CLIENT_ASSIGNMENT_UPDATED', 'CLIENT_ASSIGNMENT_UPDATED'],
    'one event per real change, none for the two no-ops',
  );
});

test('several people may be lead on the same client or service: nothing enforces exactly one', async () => {
  const s = await scenario();
  assert.equal((await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'lead' })).status, 201);
  assert.equal((await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_tomas', assignmentRole: 'lead' })).status, 201);
  const assignments = await listClientAssignments(s.db, s.A, 'c_james');
  assert.equal(assignments.filter((a) => a.assignmentRole === 'lead').length, 2, 'the documents do not ask for one lead, so neither does this');

  assert.equal((await s.assignService(PEOPLE.owner, 'c_james', 'se_james_ghl', { membershipId: 'm_maria', assignmentRole: 'lead' })).status, 201);
  assert.equal((await s.assignService(PEOPLE.owner, 'c_james', 'se_james_ghl', { membershipId: 'm_dev', assignmentRole: 'lead' })).status, 201);
  const byService = await listServiceAssignments(s.db, s.A, ['se_james_ghl']);
  assert.equal(byService.get('se_james_ghl').filter((a) => a.assignmentRole === 'lead').length, 2);
});

test('the same person may hold one row per client and one per service without collision', async () => {
  const s = await scenario();
  await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  await s.assignClient(PEOPLE.owner, 'c_lawrence', { membershipId: 'm_maria' });
  await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId: 'm_maria' });
  await s.assignService(PEOPLE.owner, 'c_james', 'se_james_ghl', { membershipId: 'm_maria' });
  assert.equal(all(s.raw, "SELECT id FROM client_assignments WHERE membership_id = 'm_maria'").length, 2);
  assert.equal(all(s.raw, "SELECT id FROM service_assignments WHERE membership_id = 'm_maria'").length, 2);
  // The database is what guarantees it, not the code above.
  assert.throws(
    () => run(s.raw, 'INSERT INTO client_assignments (workspace_id, client_id, membership_id) VALUES (?, ?, ?)', s.A, 'c_james', 'm_maria'),
    /UNIQUE constraint failed/i,
  );
  assert.throws(
    () => run(s.raw, 'INSERT INTO service_assignments (workspace_id, service_engagement_id, membership_id) VALUES (?, ?, ?)', s.A, 'se_james_social', 'm_maria'),
    /UNIQUE constraint failed/i,
  );
});

// ── owner versus assignment ──────────────────────────────────────────────

test('assignment and ownership stay separate facts in both directions', async () => {
  const s = await scenario();
  run(s.raw, "UPDATE bloomops_clients SET owner_membership_id = 'm_tomas' WHERE id = 'c_james'");
  // Ownership alone still grants nothing (the A6 rule, unchanged).
  const ownerOnly = await reach(s, PEOPLE.tomas);
  assert.equal(ownerOnly.james, false, 'being the internal owner is responsibility, not access');
  assert.deepEqual(ownerOnly.clients, []);

  // Assigning somebody else does not move the owner.
  const created = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'lead' });
  assert.equal(s.clientRow('c_james').owner_membership_id, 'm_tomas', 'assigning writes no owner');
  assert.equal((await reach(s, PEOPLE.maria)).james, true, 'though it does grant access');

  // And removing an assignment does not clear the owner.
  await s.unassignClient(PEOPLE.owner, 'c_james', created.json.assignment.id);
  assert.equal(s.clientRow('c_james').owner_membership_id, 'm_tomas', 'removing an assignment writes no owner either');

  // Setting the owner writes no assignment row.
  run(s.raw, "UPDATE bloomops_clients SET owner_membership_id = 'm_dev' WHERE id = 'c_james'");
  assert.equal(all(s.raw, "SELECT id FROM client_assignments WHERE membership_id = 'm_dev'").length, 0);
  assert.equal((await reach(s, PEOPLE.dev)).james, false);
});

// ── activity ─────────────────────────────────────────────────────────────

test('assignment mutations record readable events on the right client and engagement', async () => {
  const s = await scenario();
  const clientAssignment = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', assignmentRole: 'member' });
  await s.patchClient(PEOPLE.owner, 'c_james', clientAssignment.json.assignment.id, { assignmentRole: 'lead' });
  const serviceAssignment = await s.assignService(PEOPLE.pm, 'c_james', 'se_james_social', { membershipId: 'm_tomas', assignmentRole: 'member' });
  await s.patchServiceAssignment(PEOPLE.pm, 'c_james', 'se_james_social', serviceAssignment.json.assignment.id, { assignmentRole: 'lead' });
  await s.unassignService(PEOPLE.pm, 'c_james', 'se_james_social', serviceAssignment.json.assignment.id);
  await s.unassignClient(PEOPLE.owner, 'c_james', clientAssignment.json.assignment.id);

  const events = s.events('c_james');
  assert.deepEqual(events.map((e) => e.event_type), [
    'CLIENT_ASSIGNMENT_ADDED',
    'CLIENT_ASSIGNMENT_UPDATED',
    'SERVICE_ASSIGNMENT_ADDED',
    'SERVICE_ASSIGNMENT_UPDATED',
    'SERVICE_ASSIGNMENT_REMOVED',
    'CLIENT_ASSIGNMENT_REMOVED',
  ]);
  for (const event of events) {
    assert.equal(event.workspace_id, s.A);
    assert.equal(event.client_id, 'c_james', 'every one is on this client’s history');
  }
  const serviceEvents = events.filter((e) => e.event_type.startsWith('SERVICE_'));
  assert.ok(serviceEvents.every((e) => e.service_engagement_id === 'se_james_social'), 'and the service ones name the engagement');
  assert.ok(events.filter((e) => e.event_type.startsWith('CLIENT_')).every((e) => e.service_engagement_id === null), 'while the client ones do not');
  assert.equal(events[0].actor_membership_id, one(s.raw, 'SELECT m.id FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = ? AND m.workspace_id = ?', PEOPLE.owner, s.A).id);
  assert.equal(events[2].actor_membership_id, 'm_pm');

  const said = events.map((e) => describeEvent(e.event_type, JSON.parse(e.metadata_json)));
  assert.deepEqual(said[0], { title: 'Client team member added', detail: 'Maria Reyes was assigned to this client as member.' });
  assert.deepEqual(said[1], { title: 'Client team role changed', detail: 'Maria Reyes is now lead on this client.' });
  assert.deepEqual(said[2], { title: 'Service team member added', detail: 'Tomas Bell was assigned to Social Media Management as member.' });
  assert.deepEqual(said[3], { title: 'Service team role changed', detail: 'Tomas Bell is now lead on Social Media Management.' });
  assert.deepEqual(said[4], { title: 'Service team member removed', detail: 'Tomas Bell was removed from Social Media Management.' });
  assert.deepEqual(said[5], { title: 'Client team member removed', detail: 'Maria Reyes was removed from this client.' });
  for (const line of said) {
    assert.doesNotMatch(`${line.title} ${line.detail}`, /ASSIGNMENT|_ADDED|_REMOVED|m_maria|m_tomas|[{}]/, 'no code, no id, no JSON');
  }
});

test('a name recorded on an event survives the person leaving the workspace', async () => {
  const s = await scenario();
  await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  run(s.raw, "UPDATE user SET name = 'Renamed Person' WHERE id = 'u_maria'");
  const event = s.events('c_james')[0];
  assert.equal(JSON.parse(event.metadata_json).memberName, 'Maria Reyes', 'the name as it was when it happened');
});

// ── leak safety and the origin fence ─────────────────────────────────────

test('leak safety: an assignment id from another client, another service, or nowhere all answer identically', async () => {
  const s = await scenario();
  const james = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  const lawrence = await s.assignClient(PEOPLE.owner, 'c_lawrence', { membershipId: 'm_tomas' });
  const social = await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId: 'm_dev' });

  const answers = [
    await s.patchClient(PEOPLE.owner, 'c_james', lawrence.json.assignment.id, { assignmentRole: 'lead' }),
    await s.unassignClient(PEOPLE.owner, 'c_james', lawrence.json.assignment.id),
    await s.patchClient(PEOPLE.owner, 'c_james', 'a_nope', { assignmentRole: 'lead' }),
    await s.unassignService(PEOPLE.owner, 'c_james', 'se_james_ghl', social.json.assignment.id),
    await s.unassignService(PEOPLE.owner, 'c_james', 'se_b1_social', social.json.assignment.id),
    await s.unassignClient(PEOPLE.owner, 'c_b1', james.json.assignment.id),
  ];
  for (const res of answers) {
    assert.equal(res.status, 404);
    assert.deepEqual(res.json, { error: 'Not found.' }, 'one answer, with no reason in it');
  }
  assert.equal(all(s.raw, 'SELECT id FROM client_assignments').length, 2, 'and nothing was changed by any of them');
  assert.equal(all(s.raw, 'SELECT id FROM service_assignments').length, 1);
});

test('a workspace cannot be named from the body, and a person cannot be assigned across workspaces', async () => {
  const s = await scenario();
  const res = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria', workspaceId: s.B, clientId: 'c_b1' });
  assert.equal(res.status, 201);
  const row = one(s.raw, 'SELECT * FROM client_assignments WHERE id = ?', res.json.assignment.id);
  assert.equal(row.workspace_id, s.A, 'the workspace comes from the session, never the body');
  assert.equal(row.client_id, 'c_james', 'and the client from the route');
  // The database refuses the cross-workspace row outright too: the
  // composite (workspace_id, client_id) key cannot reach A's client from B.
  assert.throws(
    () => run(s.raw, 'INSERT INTO client_assignments (workspace_id, client_id, membership_id) VALUES (?, ?, ?)', s.B, 'c_james', 'm_dev'),
    /FOREIGN KEY/i,
  );
  assert.throws(
    () => run(s.raw, 'INSERT INTO service_assignments (workspace_id, service_engagement_id, membership_id) VALUES (?, ?, ?)', s.B, 'se_james_social', 'm_dev'),
    /FOREIGN KEY/i,
  );
});

test('every A7 assignment mutation is behind the origin fence', async () => {
  const s = await scenario();
  const evil = 'https://evil.example';
  const created = await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  const serviceCreated = await s.assignService(PEOPLE.owner, 'c_james', 'se_james_social', { membershipId: 'm_tomas' });

  const refusals = [
    await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_dev' }, { origin: evil }),
    await s.patchClient(PEOPLE.owner, 'c_james', created.json.assignment.id, { assignmentRole: 'lead' }, { origin: evil }),
    await s.unassignClient(PEOPLE.owner, 'c_james', created.json.assignment.id, { origin: evil }),
    await s.assignService(PEOPLE.owner, 'c_james', 'se_james_ghl', { membershipId: 'm_dev' }, { origin: evil }),
    await s.patchServiceAssignment(PEOPLE.owner, 'c_james', 'se_james_social', serviceCreated.json.assignment.id, { assignmentRole: 'lead' }, { origin: evil }),
    await s.unassignService(PEOPLE.owner, 'c_james', 'se_james_social', serviceCreated.json.assignment.id, { origin: evil }),
  ];
  for (const res of refusals) {
    assert.equal(res.status, 403);
    assert.deepEqual(res.json, { error: 'Cross-site request refused.' });
  }
  assert.equal(all(s.raw, 'SELECT id FROM client_assignments').length, 1, 'nothing was created, changed, or removed');
  assert.equal(one(s.raw, 'SELECT assignment_role FROM client_assignments WHERE id = ?', created.json.assignment.id).assignment_role, 'member');
  assert.equal(all(s.raw, 'SELECT id FROM service_assignments').length, 1);

  // Same person, same body, same-origin: allowed.
  assert.equal((await s.patchClient(PEOPLE.owner, 'c_james', created.json.assignment.id, { assignmentRole: 'lead' })).status, 200);
});

test('the same user in two workspaces gets no bleed between their assignments', async () => {
  const s = await scenario();
  // One identity, a membership in each agency.
  run(s.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES ('m_maria_b', ?, 'u_maria', 'team_member', 'active', '2026-02-01T00:00:00.000Z')", s.B);
  run(s.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id) VALUES (?, 'c_b1', 'm_maria_b')", s.B);

  const inA = await s.actorFor(PEOPLE.maria, s.A);
  assert.equal(canAccessClient(inA, 'c_james'), false, 'the B assignment grants nothing in A');
  assert.equal(canAccessClient(inA, 'c_b1'), false);
  const inB = await s.actorFor(PEOPLE.maria, s.B);
  assert.equal(canAccessClient(inB, 'c_b1'), true);
  assert.equal(canAccessClient(inB, 'c_james'), false, 'and the A workspace is invisible from B');

  await s.assignClient(PEOPLE.owner, 'c_james', { membershipId: 'm_maria' });
  const laterB = await s.actorFor(PEOPLE.maria, s.B);
  assert.equal(canAccessClient(laterB, 'c_james'), false, 'a new A assignment still grants nothing in B');
});
