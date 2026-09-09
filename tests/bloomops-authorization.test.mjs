// The A4 authorization engine, proven against the real schema and the real
// Better Auth session path: identity, membership, workspace, scope,
// visibility, role, and capability, with the denied cases spelled out as
// carefully as the allowed ones. Default deny should be visible throughout.
//
// The scenario is two agencies. Agency A has an Owner, an Admin, a Project
// Manager, four Team Members (one unassigned, one assigned to client James,
// one assigned only to James' Social engagement, one who merely sits in the
// Social department), three Client members (one linked to James through a
// client_contacts row, one with no link at all, one whose only link is to a
// client in Agency B), and one person who is a Team Member in A and the
// Owner of B. Agency B has its own Owner, Admin, and client.
import { test } from 'node:test';
import { projectResource } from '../lib/bloomops/project-access.mjs';
import assert from 'node:assert/strict';
import { testAuth, run, one, all, APP_URL } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { resolveWorkspaceAccess, setMembershipStatus } from '../lib/bloomops/membership.mjs';
import { getAccess, getActor, requireAccess, requireAuthorized } from '../lib/bloomops/access.mjs';
import { getWorkspace, legacyAppAllowed } from '../lib/workspace.mjs';
import {
  ACTIONS,
  CAPABILITIES,
  INTERNAL_ROLES,
  ROLES,
  VISIBILITIES,
  baseActor,
  canAccessClient,
  canAccessService,
  canSeeVisibility,
  evaluate,
  grantCapability,
  hasCapability,
  inScope,
  isAction,
  isCapability,
  listCapabilities,
  loadActor,
  loadClientResource,
  loadServiceResource,
  revokeCapability,
  roleCapabilities,
} from '../lib/bloomops/authorization.mjs';

// ── scenario ─────────────────────────────────────────────────────────────

const PEOPLE = {
  owner: 'a-owner@example.com',
  admin: 'a-admin@example.com',
  pm: 'a-pm@example.com',
  tmNone: 'a-tm-none@example.com',
  tmClient: 'a-tm-client@example.com',
  tmService: 'a-tm-service@example.com',
  tmDept: 'a-tm-dept@example.com',
  clientLinked: 'a-client-linked@example.com',
  clientUnlinked: 'a-client-unlinked@example.com',
  clientBLinked: 'a-client-b-linked@example.com',
  cross: 'cross@example.com',
  bOwner: 'b-owner@example.com',
  bAdmin: 'b-admin@example.com',
};

async function scenario() {
  const t = testAuth();
  await runBootstrap(t.d1, { workspaceName: 'Agency A', owner: { email: PEOPLE.owner }, admin: { email: PEOPLE.admin } });
  await runBootstrap(t.d1, { workspaceName: 'Agency B', owner: { email: PEOPLE.bOwner }, admin: { email: PEOPLE.bAdmin } });
  const A = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-a'").id;
  const B = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-b'").id;

  const person = (key, workspaceId, role, id = key) => {
    const email = PEOPLE[key];
    if (!one(t.raw, 'SELECT id FROM user WHERE email = ?', email)) {
      run(t.raw, 'INSERT INTO user (id, name, email, email_verified) VALUES (?, ?, ?, 1)', `u_${id}`, key, email);
    }
    const userId = one(t.raw, 'SELECT id FROM user WHERE email = ?', email).id;
    run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)", `m_${id}`, workspaceId, userId, role, `2026-01-01T00:00:0${String(id.length % 10)}.000Z`);
    return `m_${id}`;
  };
  person('pm', A, 'project_manager');
  person('tmNone', A, 'team_member');
  person('tmClient', A, 'team_member');
  person('tmService', A, 'team_member');
  person('tmDept', A, 'team_member');
  person('clientLinked', A, 'client');
  person('clientUnlinked', A, 'client');
  person('clientBLinked', A, 'client');
  person('cross', A, 'team_member', 'cross_a');
  run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES ('m_cross_b', ?, 'u_cross_a', 'owner', 'active', '2026-06-01T00:00:00.000Z')", B);

  // Clients, engagements, and a department. The service types and the
  // departments themselves come from the workspace's own seeded catalogue
  // (A7 bootstrap), so this fixture uses the real rows rather than
  // inventing a second Social that the unique slug would refuse.
  const typeId = (workspaceId, slug) => one(t.raw, 'SELECT id FROM service_types WHERE workspace_id = ? AND slug = ?', workspaceId, slug).id;
  const departmentId = (workspaceId, slug) => one(t.raw, 'SELECT id FROM departments WHERE workspace_id = ? AND slug = ?', workspaceId, slug).id;
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_james', ?, 'James', 'james')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_lawrence', ?, 'Lawrence', 'lawrence')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_b1', ?, 'B One', 'b-one')", B);
  const stASocial = typeId(A, 'social-media-management');
  const stAGhl = typeId(A, 'ghl');
  const stBSocial = typeId(B, 'social-media-management');
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_james_social', ?, 'c_james', ?)", A, stASocial);
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_james_ghl', ?, 'c_james', ?)", A, stAGhl);
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_lawrence_social', ?, 'c_lawrence', ?)", A, stASocial);
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_b1_social', ?, 'c_b1', ?)", B, stBSocial);
  const dSocial = departmentId(A, 'social');

  // Scope rows.
  run(t.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) VALUES (?, 'c_james', 'm_tmClient', 'member')", A);
  run(t.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) VALUES (?, 'c_james', 'm_cross_a', 'member')", A);
  run(t.raw, "INSERT INTO service_assignments (workspace_id, service_engagement_id, membership_id, assignment_role) VALUES (?, 'se_james_social', 'm_tmService', 'lead')", A);
  run(t.raw, 'INSERT INTO department_memberships (workspace_id, department_id, membership_id) VALUES (?, ?, ?)', A, dSocial, 'm_tmDept');
  run(t.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) VALUES ('cc_james', ?, 'c_james', 'James Client', ?, 'u_clientLinked', 1)", A, PEOPLE.clientLinked);
  run(t.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id) VALUES ('cc_b1', ?, 'c_b1', 'B Contact', ?, 'u_clientBLinked')", B, PEOPLE.clientBLinked);

  const membershipOf = (email, workspaceId) => one(t.raw, 'SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = ? AND m.workspace_id = ?', email, workspaceId);
  const ownerA = membershipOf(PEOPLE.owner, A);
  const adminA = membershipOf(PEOPLE.admin, A);

  // An actor straight from the database, no session needed.
  async function actorFor(email, workspaceId = A) {
    const user = one(t.raw, 'SELECT id FROM user WHERE email = ?', email);
    const resolved = await resolveWorkspaceAccess(t.db, user.id, { workspaceId });
    if (!resolved) return null;
    return loadActor(t.db, { ...resolved, user });
  }

  // A signed-in session for the person, through the real magic-link flow.
  const cookies = new Map();
  async function cookieFor(email) {
    if (!cookies.has(email)) cookies.set(email, (await t.signIn(email)).cookie);
    return cookies.get(email);
  }
  const request = (cookie, path = '/api/bloomops/members', method = 'GET', origin = APP_URL) =>
    new Request(`${APP_URL}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(method === 'GET' ? {} : { origin }) } });
  async function http(email, options) {
    const cookie = email ? await cookieFor(email) : '';
    const method = options.resource ? 'GET' : options.method || 'GET';
    return requireAuthorized(request(cookie, options.path, method, options.origin), { ...options, env: t.env });
  }

  const client = (id) => (access) => loadClientResource(access.db, access.workspace.id, id);
  const service = (id) => (access) => loadServiceResource(access.db, access.workspace.id, id);

  return { ...t, A, B, ownerA, adminA, membershipOf, actorFor, cookieFor, request, http, client, service, typeId, departmentId, stASocial, stAGhl, stBSocial, dSocial };
}

const describe = (d) => `${d.allowed ? 'allow' : d.outcome}:${d.reason}`;

// A representative record under James (client A1) and one under Lawrence.
const james = (extra = {}) => ({ type: 'file', id: 'f_james', workspaceId: 'A', clientId: 'c_james', visibility: 'internal', ...extra });

// ── vocabulary and default deny ──────────────────────────────────────────

test('the vocabulary is the five roles, three visibilities, and five capabilities the domain model names', () => {
  assert.deepEqual(ROLES, ['owner', 'admin', 'project_manager', 'team_member', 'client']);
  assert.deepEqual(INTERNAL_ROLES, ['owner', 'admin', 'project_manager', 'team_member']);
  assert.deepEqual(VISIBILITIES, ['internal', 'client', 'restricted']);
  assert.deepEqual(CAPABILITIES, ['members.manage', 'workspace.settings', 'templates.manage', 'finance.view', 'finance.edit']);
  for (const [name, policy] of Object.entries(ACTIONS)) {
    assert.ok(isAction(name));
    assert.ok(Array.isArray(policy.roles) && policy.roles.length > 0, `${name} names who may perform it`);
    assert.ok(policy.roles.every((r) => ROLES.includes(r)), `${name} names only real roles`);
    if (policy.capability) assert.ok(isCapability(policy.capability), `${name} needs a real capability`);
  }
  assert.equal(isAction('toString'), false, 'prototype names are not actions');
  assert.equal(isAction('anything.else'), false);
  assert.equal(isCapability('finance.delete'), false);
});

test('default deny is observable: no actor, an inactive actor, an unknown action, a missing resource, an unloaded actor', async () => {
  const s = await scenario();
  assert.equal(describe(evaluate(null, { action: 'members.manage' })), 'forbidden:no_actor');
  const owner = await s.actorFor(PEOPLE.owner);
  assert.equal(describe(evaluate(owner, { action: 'nonsense' })), 'forbidden:unknown_action');
  assert.equal(describe(evaluate(owner, { action: 'toString' })), 'forbidden:unknown_action');
  assert.equal(describe(evaluate(owner, {})), 'forbidden:unknown_action');
  assert.equal(describe(evaluate(owner, { action: 'client.view' })), 'forbidden:resource_required', 'an action about one record refuses to run without one');
  assert.equal(describe(evaluate({ ...owner, status: 'suspended' }, { action: 'members.manage' })), 'forbidden:membership_inactive');
  const stale = await loadActor(s.db, { workspace: { id: s.A }, membership: { ...s.ownerA, status: 'suspended' } });
  assert.equal(describe(evaluate(stale, { action: 'members.manage' })), 'forbidden:membership_inactive', 'loadActor never upgrades a non-active membership');
  assert.equal(hasCapability(stale, 'members.manage'), false);
  assert.equal(canAccessClient(stale, 'c_james'), false);
  // A role-only actor answers role-only questions and refuses to guess the rest.
  const base = baseActor({ workspace: { id: s.A }, membership: s.ownerA });
  assert.equal(evaluate(base, { action: 'legacy.prospecting' }).allowed, true);
  assert.throws(() => evaluate(base, { action: 'members.manage' }), /not loaded/);
  assert.throws(() => canAccessClient(base, 'c_james'), /not loaded/);
  assert.equal(baseActor({ workspace: null, membership: s.ownerA }), null);
  assert.equal(await loadActor(s.db, { workspace: null, membership: null }), null);
});

// ── identity and membership ──────────────────────────────────────────────

test('identity and membership: anonymous, no workspace, active, suspended, and removed', async () => {
  const s = await scenario();
  const anonymous = await s.http(null, { action: 'members.manage' });
  assert.equal(anonymous.response.status, 401);
  assert.deepEqual(await anonymous.response.json(), { error: 'Sign in to continue.' });

  run(s.raw, "INSERT INTO user (id, name, email, email_verified) VALUES ('u_orphan', 'Orphan', 'orphan@example.com', 1)");
  const orphan = await s.http('orphan@example.com', { action: 'members.manage' });
  assert.equal(orphan.response.status, 403);
  assert.deepEqual(await orphan.response.json(), { error: 'This account has no active workspace access.' });

  const admin = await s.http(PEOPLE.admin, { action: 'members.manage' });
  assert.ok(admin.access, 'an active Admin reaches the engine and passes');
  assert.equal(admin.decision.allowed, true);
  assert.equal(admin.access.actor.role, 'admin');
  assert.ok(admin.access.actor.capabilities.has('members.manage'));

  const actor = { id: s.ownerA.id, userId: s.ownerA.user_id };
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: s.adminA.id, status: 'suspended', actorMembership: actor });
  const suspended = await s.http(PEOPLE.admin, { action: 'members.manage' });
  assert.equal(suspended.response.status, 403, 'suspended: refused on the very next request');
  assert.ok(await s.session(await s.cookieFor(PEOPLE.admin)), 'while the identity session itself still exists');
  assert.equal(await getWorkspace(s.request(await s.cookieFor(PEOPLE.admin)), { env: s.env }), null, 'and the inherited routes see nobody');

  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: s.adminA.id, status: 'active', actorMembership: actor });
  assert.ok((await s.http(PEOPLE.admin, { action: 'members.manage' })).access, 'reinstated: back');
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: s.adminA.id, status: 'removed', actorMembership: actor });
  assert.equal((await s.http(PEOPLE.admin, { action: 'members.manage' })).response.status, 403, 'removed: refused');
  assert.ok(await s.session(await s.cookieFor(PEOPLE.admin)), 'identity session untouched by removal too');
});

test('an actor is loaded once per request and never carried into the next', async () => {
  const s = await scenario();
  const cookie = await s.cookieFor(PEOPLE.tmClient);
  const access = await getAccess(s.request(cookie), { env: s.env });
  const first = await getActor(access);
  assert.equal(await getActor(access), first, 'same request, same actor');
  assert.equal(canAccessClient(first, 'c_lawrence'), false);
  run(s.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id) VALUES (?, 'c_lawrence', 'm_tmClient')", s.A);
  assert.equal(canAccessClient(first, 'c_lawrence'), false, 'the request in flight keeps the answer it started with');
  const next = await getActor(await getAccess(s.request(cookie), { env: s.env }));
  assert.equal(canAccessClient(next, 'c_lawrence'), true, 'the next request sees the new assignment');
  run(s.raw, "DELETE FROM client_assignments WHERE membership_id = 'm_tmClient'");
  const later = await getActor(await getAccess(s.request(cookie), { env: s.env }));
  assert.equal(canAccessClient(later, 'c_james'), false, 'and a removed assignment is gone on the next request');
});

// ── workspace isolation ──────────────────────────────────────────────────

test('workspace: a same-workspace record proceeds, a foreign one is not found, however privileged the actor', async () => {
  const s = await scenario();
  const owner = await s.actorFor(PEOPLE.owner);
  const mine = await loadClientResource(s.db, s.A, 'c_james');
  assert.deepEqual(mine, { type: 'client', id: 'c_james', workspaceId: s.A, clientId: 'c_james', visibility: 'client' });
  assert.equal(describe(evaluate(owner, { action: 'client.manage', resource: mine })), 'allow:ok');

  assert.equal(await loadClientResource(s.db, s.A, 'c_b1'), null, "B's client does not load through A's workspace");
  assert.equal(await loadServiceResource(s.db, s.A, 'se_b1_social'), null);
  assert.equal(await loadClientResource(s.db, s.A, 'c_nope'), null);
  assert.equal(await loadClientResource(s.db, null, 'c_james'), null);
  assert.equal(await loadClientResource(s.db, s.A, ''), null);

  // Even a descriptor that somehow names B is refused, as not found.
  const theirs = await loadClientResource(s.db, s.B, 'c_b1');
  assert.equal(describe(evaluate(owner, { action: 'client.view', resource: theirs })), 'not_found:foreign_workspace');
  assert.equal(describe(evaluate(owner, { action: 'client.view', resource: { ...mine, workspaceId: '' } })), 'not_found:foreign_workspace');
  assert.equal(describe(evaluate(owner, { action: 'client.view', resource: { ...mine, workspaceId: undefined } })), 'not_found:foreign_workspace');
  // Over HTTP the guessed id and the foreign id look the same.
  const foreign = await s.http(PEOPLE.owner, { action: 'client.view', resource: s.service('se_b1_social') });
  const missing = await s.http(PEOPLE.owner, { action: 'client.view', resource: s.service('se_nope') });
  assert.equal(foreign.response.status, 404);
  assert.equal(missing.response.status, 404);
  assert.equal(await foreign.response.text(), await missing.response.text());
});

// ── role matrix ──────────────────────────────────────────────────────────

test('the role matrix: every role against every representative action, allow and deny', async () => {
  const s = await scenario();
  const actors = {
    owner: await s.actorFor(PEOPLE.owner),
    admin: await s.actorFor(PEOPLE.admin),
    project_manager: await s.actorFor(PEOPLE.pm),
    team_member: await s.actorFor(PEOPLE.tmClient), // assigned to James
    client: await s.actorFor(PEOPLE.clientLinked), // James' contact
  };
  const jamesClient = await loadClientResource(s.db, s.A, 'c_james');
  const jamesSocial = await loadServiceResource(s.db, s.A, 'se_james_social');
  const jamesProject = projectResource({ id: 'project-james', workspaceId: s.A, clientId: 'c_james', visibility: 'client' }, [], { internal: false });
  const jamesAction = { ...jamesProject, type: 'action', projectId: jamesProject.id, id: 'action-james', visibility: 'internal', assigneeMembershipId: actors.team_member.membershipId };
  const cases = {
    'members.manage': [true, true, false, false, false],
    'invitations.manage': [true, true, false, false, false],
    'capabilities.manage': [true, true, false, false, false],
    'workspace.settings': [true, true, false, false, false],
    'templates.manage': [true, true, false, false, false],
    'finance.view': [true, false, false, false, false],
    'finance.edit': [true, false, false, false, false],
    // Creating a client names no record: it does not exist yet (A6).
    'client.create': [true, true, true, false, false],
    'client.view': [true, true, true, true, true],
    'onboarding.view': [true, true, true, true, true],
    'onboarding.submit': [false, false, false, false, true],
    'onboarding.verify': [true, true, true, false, false],
    'onboarding.manage': [true, true, true, false, false],
    'client.activate': [true, true, true, false, false],
    'client.manage': [true, true, true, false, false],
    'service.view': [true, true, true, true, true],
    'service.manage': [true, true, true, false, false],
    // A7's three delivery-coordination actions. Owner, Admin, and Project
    // Manager; never a Team Member, never a Client. `service.create` names
    // the client the engagement is being added to, because the engagement
    // does not exist yet.
    'service.create': [true, true, true, false, false],
    'client.assign': [true, true, true, false, false],
    'service.assign': [true, true, true, false, false],
    'project.create': [true, true, true, false, false],
    'project.view': [true, true, true, true, true],
    'project.manage': [true, true, true, false, false],
    'project.assign': [true, true, true, false, false],
    'milestone.view': [true, true, true, true, true],
    'milestone.manage': [true, true, true, false, false],
    'deliverable.view': [true, true, true, true, true],
    'deliverable.manage': [true, true, true, false, false],
    'file.view': [true, true, true, true, true],
    'file.manage': [true, true, true, false, false],
    'content.list': [true, true, true, true, false],
    'content.create': [true, true, true, true, false],
    'content.view': [true, true, true, true, false],
    'content.calendar': [true, true, true, true, false],
    'content.platforms': [true, true, true, true, false],
    'content.transition': [true, true, true, true, false],
    'content.manage': [true, true, true, true, false],
    'content.file.manage': [true, true, true, true, false],
    'recording.view': [false, false, false, false, true],
    'recording.upload': [false, false, false, false, true],
    'action.list': [true, true, true, true, false],
    'action.view': [true, true, true, true, false],
    'action.manage': [true, true, true, false, false],
    'action.progress': [true, true, true, true, false],
    'action.dependencies': [true, true, true, false, false],
    'legacy.prospecting': [true, true, false, false, false],
  };
  // Which record each resource action is asked about, so the matrix uses
  // the same descriptor the real routes do rather than a convenient one.
  const RESOURCE_OF = {
    'content.file.manage': { ...jamesSocial, type: 'content', visibility: 'internal' },
    'recording.view': { ...jamesSocial, type: 'recording_request', visibility: 'client' },
    'recording.upload': { ...jamesSocial, type: 'recording_request', visibility: 'client' },
    'client.view': jamesClient,
    'onboarding.view': jamesClient,
    'onboarding.submit': jamesClient,
    'onboarding.verify': jamesClient,
    'onboarding.manage': jamesClient,
    'client.activate': jamesClient,
    'client.manage': jamesClient,
    'client.assign': jamesClient,
    'service.create': jamesClient,
    'service.view': jamesSocial,
    'service.manage': jamesSocial,
    'service.assign': jamesSocial,
    'project.create': jamesClient,
    'project.view': jamesProject,
    'project.manage': jamesProject,
    'project.assign': jamesProject,
    'milestone.view': { ...jamesProject, type: 'milestone', projectId: jamesProject.id, id: 'milestone' },
    'milestone.manage': { ...jamesProject, type: 'milestone', projectId: jamesProject.id, id: 'milestone' },
    'deliverable.view': { ...jamesProject, type: 'deliverable', projectId: jamesProject.id, id: 'deliverable' },
    'deliverable.manage': { ...jamesProject, type: 'deliverable', projectId: jamesProject.id, id: 'deliverable' },
    'file.view': { ...jamesProject, type: 'file', projectId: jamesProject.id, id: 'file' },
    'file.manage': { ...jamesProject, type: 'file', projectId: jamesProject.id, id: 'file' },
    'content.create': { ...jamesClient, type: 'content_parent', visibility: 'internal' },
    'content.view': { ...jamesClient, type: 'content', visibility: 'internal' },
    'content.platforms': { ...jamesClient, type: 'content', visibility: 'internal' },
    'content.transition': { ...jamesClient, type: 'content', visibility: 'internal' },
    'content.manage': { ...jamesClient, type: 'content', visibility: 'internal' },
    'action.view': jamesAction,
    'action.manage': jamesAction,
    'action.progress': jamesAction,
    'action.dependencies': jamesAction,
  };
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(ACTIONS).sort(), 'every action is in the matrix');
  for (const [action, policy] of Object.entries(ACTIONS)) {
    assert.equal(Boolean(policy.resource), Object.prototype.hasOwnProperty.call(RESOURCE_OF, action), `${action} names a record, or does not`);
  }
  const seen = [];
  for (const [action, expected] of Object.entries(cases)) {
    const resource = RESOURCE_OF[action] || null;
    Object.entries(actors).forEach(([role, actor], i) => {
      const decision = evaluate(actor, { action, resource });
      seen.push(`${role} ${action}: ${describe(decision)}`);
      assert.equal(decision.allowed, expected[i], `${role} ${action} -> ${describe(decision)}`);
    });
  }
  // All actors can see James. Clients cannot discover internal Actions or Content.
  assert.ok(seen.filter((l) => l.includes('forbidden')).every((l) => /forbidden:(role|capability)$/.test(l)), seen.join('\n'));
  assert.deepEqual(seen.filter((l) => l.includes('not_found')), [...['create', 'view', 'platforms', 'transition', 'manage', 'file.manage'].map(operation => `client content.${operation}: not_found:visibility`), ...['view', 'manage', 'progress', 'dependencies'].map(operation => `client action.${operation}: not_found:visibility`)]);
});

// ── capabilities ─────────────────────────────────────────────────────────

test('capabilities: role baseline, explicit grants, missing grants, and what a grant can never do', async () => {
  const s = await scenario();
  assert.deepEqual([...roleCapabilities('owner')], CAPABILITIES);
  assert.deepEqual([...roleCapabilities('admin')], ['members.manage', 'workspace.settings', 'templates.manage']);
  assert.deepEqual([...roleCapabilities('project_manager')], []);
  assert.deepEqual([...roleCapabilities('team_member')], []);
  assert.deepEqual([...roleCapabilities('client')], []);
  assert.deepEqual([...roleCapabilities('nope')], []);

  let pm = await s.actorFor(PEOPLE.pm);
  assert.equal(describe(evaluate(pm, { action: 'finance.view' })), 'forbidden:capability');
  assert.deepEqual(listCapabilities(pm), []);

  const granted = await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'finance.view', grantedByMembershipId: s.ownerA.id });
  assert.deepEqual(granted, { ok: true });
  pm = await s.actorFor(PEOPLE.pm);
  assert.equal(describe(evaluate(pm, { action: 'finance.view' })), 'allow:ok', 'an explicit grant opens exactly that area');
  assert.equal(describe(evaluate(pm, { action: 'finance.edit' })), 'forbidden:capability', 'and not its neighbour');
  assert.equal(describe(evaluate(pm, { action: 'members.manage' })), 'forbidden:capability');
  assert.deepEqual(listCapabilities(pm), ['finance.view']);
  assert.deepEqual(await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'finance.view' }), { ok: true, unchanged: true });
  assert.equal(one(s.raw, "SELECT COUNT(*) AS n FROM member_capabilities WHERE membership_id = 'm_pm'").n, 1);

  // An Admin is not Finance by role, but can be granted it.
  let admin = await s.actorFor(PEOPLE.admin);
  assert.equal(evaluate(admin, { action: 'finance.edit' }).allowed, false);
  await grantCapability(s.db, { workspaceId: s.A, membershipId: s.adminA.id, capability: 'finance.edit', grantedByMembershipId: s.ownerA.id });
  admin = await s.actorFor(PEOPLE.admin);
  assert.equal(evaluate(admin, { action: 'finance.edit' }).allowed, true);
  assert.deepEqual(listCapabilities(admin), ['members.manage', 'workspace.settings', 'templates.manage', 'finance.edit']);

  // Refusals at the grant: unknown key, foreign membership (looks like a
  // wrong id), Client role, removed membership.
  assert.equal((await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'finance.delete' })).reason, 'unknown_capability');
  assert.equal((await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_cross_b', capability: 'finance.view' })).reason, 'not_found', "B's membership is not in A");
  assert.equal((await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_nope', capability: 'finance.view' })).reason, 'not_found');
  assert.equal((await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_clientLinked', capability: 'finance.view' })).reason, 'role', 'a Client can be granted nothing');
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: 'm_tmNone', status: 'removed', actorMembership: { id: s.ownerA.id, userId: s.ownerA.user_id } });
  assert.equal((await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_tmNone', capability: 'finance.view' })).reason, 'removed');

  // A capability row that exists despite the rules (written directly) still
  // grants a Client nothing.
  run(s.raw, "INSERT INTO member_capabilities (workspace_id, membership_id, capability) VALUES (?, 'm_clientLinked', 'finance.view')", s.A);
  run(s.raw, "INSERT INTO member_capabilities (workspace_id, membership_id, capability) VALUES (?, 'm_clientLinked', 'members.manage')", s.A);
  const client = await s.actorFor(PEOPLE.clientLinked);
  assert.deepEqual(listCapabilities(client), []);
  assert.equal(describe(evaluate(client, { action: 'finance.view' })), 'forbidden:capability');
  assert.equal(describe(evaluate(client, { action: 'members.manage' })), 'forbidden:capability');
  assert.equal(describe(evaluate(client, { action: 'client.manage', resource: await loadClientResource(s.db, s.A, 'c_james') })), 'forbidden:role', 'nor does it change what the Client role may do to its own client');
  // Nor does an unknown key on an internal member.
  run(s.raw, "INSERT INTO member_capabilities (workspace_id, membership_id, capability) VALUES (?, 'm_pm', 'finance.everything')", s.A);
  pm = await s.actorFor(PEOPLE.pm);
  assert.deepEqual(listCapabilities(pm), ['finance.view']);

  // Revoke, and the history of it all.
  assert.deepEqual(await revokeCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'finance.view', revokedByMembershipId: s.ownerA.id }), { ok: true });
  assert.deepEqual(await revokeCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'finance.view' }), { ok: true, unchanged: true });
  assert.equal((await revokeCapability(s.db, { workspaceId: s.B, membershipId: 'm_pm', capability: 'finance.view' })).reason, 'not_found');
  assert.equal((await revokeCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'nope' })).reason, 'unknown_capability');
  pm = await s.actorFor(PEOPLE.pm);
  assert.equal(evaluate(pm, { action: 'finance.view' }).allowed, false, 'revoked on the next request');
  const events = all(s.raw, "SELECT event_type, subject_id, actor_membership_id, metadata_json FROM activity_events WHERE event_type LIKE 'CAPABILITY_%' ORDER BY occurred_at, id");
  assert.deepEqual(events.map((e) => `${e.event_type} ${e.subject_id} ${JSON.parse(e.metadata_json).capability} by ${e.actor_membership_id}`), [
    `CAPABILITY_GRANTED m_pm finance.view by ${s.ownerA.id}`,
    `CAPABILITY_GRANTED ${s.adminA.id} finance.edit by ${s.ownerA.id}`,
    `CAPABILITY_REVOKED m_pm finance.view by ${s.ownerA.id}`,
  ]);
});

test('a capability, an assignment, or a contact link in one workspace grants nothing in another', async () => {
  const s = await scenario();
  // The cross person is Owner of B (every capability there) and an assigned
  // Team Member in A. Give them Finance in B explicitly as well.
  await grantCapability(s.db, { workspaceId: s.B, membershipId: 'm_cross_b', capability: 'finance.edit' });
  run(s.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id) VALUES (?, 'c_b1', 'm_cross_b')", s.B);
  run(s.raw, "INSERT INTO service_assignments (workspace_id, service_engagement_id, membership_id) VALUES (?, 'se_b1_social', 'm_cross_b')", s.B);

  const inA = await s.actorFor(PEOPLE.cross, s.A);
  assert.equal(inA.role, 'team_member');
  assert.equal(inA.workspaceId, s.A);
  assert.deepEqual(listCapabilities(inA), []);
  assert.equal(describe(evaluate(inA, { action: 'members.manage' })), 'forbidden:capability');
  assert.equal(describe(evaluate(inA, { action: 'finance.edit' })), 'forbidden:capability');
  assert.equal(describe(evaluate(inA, { action: 'legacy.prospecting' })), 'forbidden:role');
  assert.equal(canAccessClient(inA, 'c_james'), true, 'their A assignment works in A');
  assert.equal(canAccessClient(inA, 'c_b1'), false, 'their B assignment does not');
  assert.equal(canAccessService(inA, { serviceEngagementId: 'se_b1_social', clientId: 'c_b1' }), false);
  assert.equal(describe(evaluate(inA, { action: 'client.view', resource: await loadClientResource(s.db, s.B, 'c_b1') })), 'not_found:foreign_workspace');

  const inB = await s.actorFor(PEOPLE.cross, s.B);
  assert.equal(inB.role, 'owner');
  assert.equal(describe(evaluate(inB, { action: 'members.manage' })), 'allow:ok');
  assert.equal(describe(evaluate(inB, { action: 'client.view', resource: await loadClientResource(s.db, s.B, 'c_b1') })), 'allow:ok');
  assert.equal(describe(evaluate(inB, { action: 'client.view', resource: await loadClientResource(s.db, s.A, 'c_james') })), 'not_found:foreign_workspace', "A's client is foreign to their B authority");

  // The Client whose only contact link is in B has no client in A.
  const bLinked = await s.actorFor(PEOPLE.clientBLinked, s.A);
  assert.equal(bLinked.role, 'client');
  assert.deepEqual([...bLinked.scope.clientIds], []);
  assert.equal(describe(evaluate(bLinked, { action: 'client.view', resource: await loadClientResource(s.db, s.A, 'c_james') })), 'not_found:scope');

  // Over HTTP the earliest membership (A) is the one a plain request acts in.
  const me = await s.http(PEOPLE.cross, { action: 'members.manage' });
  assert.equal(me.response.status, 403, 'a Team Member of A, whatever they own elsewhere');
});

// ── Team Member scope ────────────────────────────────────────────────────

test('client scope: a Team Member reaches an assigned client, not others, and department membership is not an assignment', async () => {
  const s = await scenario();
  const james = await loadClientResource(s.db, s.A, 'c_james');
  const lawrence = await loadClientResource(s.db, s.A, 'c_lawrence');

  const none = await s.actorFor(PEOPLE.tmNone);
  assert.deepEqual([...none.scope.clientIds], []);
  assert.equal(describe(evaluate(none, { action: 'client.view', resource: james })), 'not_found:scope');
  assert.equal(describe(evaluate(none, { action: 'client.view', resource: lawrence })), 'not_found:scope');

  const assigned = await s.actorFor(PEOPLE.tmClient);
  assert.equal(describe(evaluate(assigned, { action: 'client.view', resource: james })), 'allow:ok');
  assert.equal(describe(evaluate(assigned, { action: 'client.view', resource: lawrence })), 'not_found:scope', 'James is not Lawrence');
  assert.equal(describe(evaluate(assigned, { action: 'client.manage', resource: james })), 'forbidden:role', 'visible, but a Team Member does not manage clients');
  assert.equal(describe(evaluate(assigned, { action: 'client.manage', resource: lawrence })), 'not_found:scope', 'and an unassigned client stays invisible even to a manage attempt');

  const dept = await s.actorFor(PEOPLE.tmDept);
  assert.equal(one(s.raw, "SELECT COUNT(*) AS n FROM department_memberships WHERE membership_id = 'm_tmDept'").n, 1);
  assert.deepEqual([...dept.scope.clientIds], []);
  assert.deepEqual([...dept.scope.serviceEngagementIds], []);
  assert.equal(describe(evaluate(dept, { action: 'client.view', resource: james })), 'not_found:scope', 'the Social department is not James');
  assert.equal(describe(evaluate(dept, { action: 'service.view', resource: await loadServiceResource(s.db, s.A, 'se_james_social') })), 'not_found:scope', 'nor is it his Social engagement');
});

test('service scope: one engagement, not its sibling, not the client record, and a client assignment covers every engagement', async () => {
  const s = await scenario();
  const jamesSocial = await loadServiceResource(s.db, s.A, 'se_james_social');
  const jamesGhl = await loadServiceResource(s.db, s.A, 'se_james_ghl');
  const lawrenceSocial = await loadServiceResource(s.db, s.A, 'se_lawrence_social');
  const james = await loadClientResource(s.db, s.A, 'c_james');
  assert.deepEqual(jamesSocial, { type: 'service_engagement', id: 'se_james_social', workspaceId: s.A, clientId: 'c_james', serviceEngagementId: 'se_james_social', visibility: 'client' });

  const contractor = await s.actorFor(PEOPLE.tmService);
  assert.deepEqual([...contractor.scope.serviceEngagementIds], ['se_james_social']);
  assert.equal(contractor.scope.serviceClientIds.get('se_james_social'), 'c_james');
  assert.equal(describe(evaluate(contractor, { action: 'service.view', resource: jamesSocial })), 'allow:ok');
  assert.equal(describe(evaluate(contractor, { action: 'service.view', resource: jamesGhl })), 'not_found:scope', "James' GHL work is a sibling engagement");
  assert.equal(describe(evaluate(contractor, { action: 'service.view', resource: lawrenceSocial })), 'not_found:scope', 'Social for another client is another engagement');
  assert.equal(describe(evaluate(contractor, { action: 'client.view', resource: james })), 'not_found:scope', 'a service assignment does not widen into the client record');
  assert.equal(describe(evaluate(contractor, { action: 'service.manage', resource: jamesSocial })), 'forbidden:role');
  // A record under the engagement is reachable; the same record under the sibling is not.
  assert.equal(describe(evaluate(contractor, { action: 'service.view', resource: { ...james, type: 'task', id: 't1', serviceEngagementId: 'se_james_social', visibility: 'internal' } })), 'allow:ok');
  assert.equal(describe(evaluate(contractor, { action: 'service.view', resource: { ...james, type: 'task', id: 't2', serviceEngagementId: 'se_james_ghl', visibility: 'internal' } })), 'not_found:scope');
  assert.equal(inScope(contractor, { workspaceId: s.A, type: 'template', id: 'tpl' }), true, 'a workspace-level record is within an internal reach');

  const assigned = await s.actorFor(PEOPLE.tmClient);
  assert.equal(describe(evaluate(assigned, { action: 'service.view', resource: jamesSocial })), 'allow:ok');
  assert.equal(describe(evaluate(assigned, { action: 'service.view', resource: jamesGhl })), 'allow:ok', 'assignment to the client reaches all of his engagements');
  assert.equal(describe(evaluate(assigned, { action: 'service.view', resource: lawrenceSocial })), 'not_found:scope');

  assert.equal(canAccessService(contractor, { serviceEngagementId: '' }), false);
  assert.equal(canAccessService(contractor, {}), false);
  assert.equal(canAccessClient(contractor, null), false);
});

// ── Client role ──────────────────────────────────────────────────────────

test('a linked Client reaches their own client-visible records and nothing else', async () => {
  const s = await scenario();
  const client = await s.actorFor(PEOPLE.clientLinked);
  assert.equal(client.scope.kind, 'contact');
  assert.deepEqual([...client.scope.clientIds], ['c_james']);
  const james = await loadClientResource(s.db, s.A, 'c_james');
  const lawrence = await loadClientResource(s.db, s.A, 'c_lawrence');
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: james })), 'allow:ok');
  assert.equal(describe(evaluate(client, { action: 'service.view', resource: await loadServiceResource(s.db, s.A, 'se_james_social') })), 'allow:ok');
  assert.equal(describe(evaluate(client, { action: 'service.view', resource: await loadServiceResource(s.db, s.A, 'se_james_ghl') })), 'allow:ok', 'every engagement of their own client');
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: lawrence })), 'not_found:scope', 'never another client');
  assert.equal(describe(evaluate(client, { action: 'service.view', resource: await loadServiceResource(s.db, s.A, 'se_lawrence_social') })), 'not_found:scope');
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: await loadClientResource(s.db, s.B, 'c_b1') })), 'not_found:foreign_workspace');
  assert.equal(describe(evaluate(client, { action: 'client.manage', resource: james })), 'forbidden:role');
  assert.equal(describe(evaluate(client, { action: 'service.manage', resource: await loadServiceResource(s.db, s.A, 'se_james_social') })), 'forbidden:role');
  // Internal and restricted records of their own client stay invisible.
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: { ...james, type: 'note', id: 'n1', visibility: 'internal' } })), 'not_found:visibility');
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: { ...james, type: 'file', id: 'f1', visibility: 'restricted', restrictedToMembershipIds: ['m_clientLinked'] } })), 'not_found:visibility', 'even when named on it');
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: { ...james, type: 'file', id: 'f2', visibility: undefined } })), 'not_found:visibility', 'a record that never declared itself client-visible is internal');
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: { ...james, type: 'file', id: 'f3', visibility: 'client' } })), 'allow:ok');
  // Workspace-level internal things (team, finance, settings, templates, the inherited app) are out of reach.
  assert.equal(describe(evaluate(client, { action: 'client.view', resource: { type: 'template', id: 'tpl', workspaceId: s.A, visibility: 'client' } })), 'not_found:scope', 'a record with no client is not theirs, whatever its visibility');
  for (const action of ['members.manage', 'invitations.manage', 'workspace.settings', 'templates.manage', 'finance.view', 'finance.edit']) {
    assert.equal(describe(evaluate(client, { action })), 'forbidden:capability', action);
  }
  assert.equal(describe(evaluate(client, { action: 'legacy.prospecting' })), 'forbidden:role');
  assert.equal(hasCapability(client, 'finance.view'), false);
});

test('a Client membership with no durable client link fails closed', async () => {
  const s = await scenario();
  const unlinked = await s.actorFor(PEOPLE.clientUnlinked);
  assert.equal(unlinked.status, 'active', 'the membership itself is fine');
  assert.deepEqual([...unlinked.scope.clientIds], []);
  for (const id of ['c_james', 'c_lawrence']) {
    assert.equal(describe(evaluate(unlinked, { action: 'client.view', resource: await loadClientResource(s.db, s.A, id) })), 'not_found:scope', id);
  }
  assert.equal(describe(evaluate(unlinked, { action: 'service.view', resource: await loadServiceResource(s.db, s.A, 'se_james_social') })), 'not_found:scope');
  // Neither an email match nor an accepted invitation naming the client is a link.
  run(s.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email) VALUES ('cc_unlinked', ?, 'c_lawrence', 'Same Address', ?)", s.A, PEOPLE.clientUnlinked);
  run(s.raw, "INSERT INTO workspace_invitations (workspace_id, email, role, status, token_hash, client_id, accepted_membership_id, expires_at) VALUES (?, ?, 'client', 'accepted', 'h_unlinked', 'c_lawrence', 'm_clientUnlinked', '2099-01-01T00:00:00.000Z')", s.A, PEOPLE.clientUnlinked);
  const still = await s.actorFor(PEOPLE.clientUnlinked);
  assert.deepEqual([...still.scope.clientIds], [], 'only client_contacts.user_id counts');
  assert.equal(describe(evaluate(still, { action: 'client.view', resource: await loadClientResource(s.db, s.A, 'c_lawrence') })), 'not_found:scope');
  // The link itself, once made, is what opens the door.
  run(s.raw, "UPDATE client_contacts SET user_id = 'u_clientUnlinked' WHERE id = 'cc_unlinked'");
  const linked = await s.actorFor(PEOPLE.clientUnlinked);
  assert.equal(describe(evaluate(linked, { action: 'client.view', resource: await loadClientResource(s.db, s.A, 'c_lawrence') })), 'allow:ok');
  assert.equal(describe(evaluate(linked, { action: 'client.view', resource: await loadClientResource(s.db, s.A, 'c_james') })), 'not_found:scope');
  // Over HTTP the unlinked Client and the missing record answer alike.
  const own = await s.http(PEOPLE.clientBLinked, { action: 'client.view', resource: s.client('c_james') });
  const none = await s.http(PEOPLE.clientBLinked, { action: 'client.view', resource: s.client('c_missing') });
  assert.equal(own.response.status, 404);
  assert.equal(await own.response.text(), await none.response.text());
});

// ── visibility ───────────────────────────────────────────────────────────

test('visibility: internal, client, restricted, and their interaction with scope', async () => {
  const s = await scenario();
  const under = (clientId, visibility, extra = {}) => ({ type: 'file', id: `f_${clientId}_${visibility}`, workspaceId: s.A, clientId, visibility, ...extra });
  const actors = {
    owner: await s.actorFor(PEOPLE.owner),
    admin: await s.actorFor(PEOPLE.admin),
    pm: await s.actorFor(PEOPLE.pm),
    tmClient: await s.actorFor(PEOPLE.tmClient),
    tmNone: await s.actorFor(PEOPLE.tmNone),
    client: await s.actorFor(PEOPLE.clientLinked),
  };
  const see = (who, resource) => describe(evaluate(actors[who], { action: 'client.view', resource }));

  // James' records, by visibility.
  const expectJames = {
    internal: { owner: 'allow:ok', admin: 'allow:ok', pm: 'allow:ok', tmClient: 'allow:ok', tmNone: 'not_found:scope', client: 'not_found:visibility' },
    client: { owner: 'allow:ok', admin: 'allow:ok', pm: 'allow:ok', tmClient: 'allow:ok', tmNone: 'not_found:scope', client: 'allow:ok' },
    restricted: { owner: 'allow:ok', admin: 'allow:ok', pm: 'not_found:visibility', tmClient: 'not_found:visibility', tmNone: 'not_found:scope', client: 'not_found:visibility' },
  };
  for (const [visibility, expected] of Object.entries(expectJames)) {
    for (const [who, outcome] of Object.entries(expected)) {
      assert.equal(see(who, under('c_james', visibility)), outcome, `${who} on James ${visibility}`);
    }
  }
  // Lawrence's client-visible record: visibility never substitutes for scope.
  assert.equal(see('tmClient', under('c_lawrence', 'client')), 'not_found:scope');
  assert.equal(see('client', under('c_lawrence', 'client')), 'not_found:scope');
  assert.equal(see('pm', under('c_lawrence', 'client')), 'allow:ok');
  // Being named on a restricted record opens it for internal people only,
  // and only inside their scope.
  const named = (clientId) => under(clientId, 'restricted', { restrictedToMembershipIds: ['m_pm', 'm_tmClient', 'm_tmNone', 'm_clientLinked'] });
  assert.equal(see('pm', named('c_james')), 'allow:ok');
  assert.equal(see('tmClient', named('c_james')), 'allow:ok');
  assert.equal(see('tmNone', named('c_james')), 'not_found:scope', 'named, but not assigned');
  assert.equal(see('client', named('c_james')), 'not_found:visibility', 'a Client never sees restricted');
  assert.equal(see('tmClient', named('c_lawrence')), 'not_found:scope');
  assert.equal(see('pm', under('c_james', 'restricted', { restrictedToMembershipIds: ['m_owner'] })), 'not_found:visibility', 'named somebody else');
  assert.equal(see('pm', under('c_james', 'restricted', { restrictedToMembershipIds: 'm_pm' })), 'not_found:visibility', 'the list has to be a list');
  // Unknown and missing visibilities fail closed.
  for (const who of Object.keys(actors)) {
    assert.equal(see(who, under('c_james', 'public')), who === 'tmNone' ? 'not_found:scope' : 'not_found:visibility', `${who} on an unknown visibility`);
    assert.equal(see(who, under('c_james', 'Internal')), who === 'tmNone' ? 'not_found:scope' : 'not_found:visibility', `${who} on a mis-cased visibility`);
  }
  assert.equal(see('client', under('c_james', undefined)), 'not_found:visibility');
  assert.equal(see('client', under('c_james', null)), 'not_found:visibility');
  assert.equal(see('tmClient', under('c_james', undefined)), 'allow:ok', 'missing means internal');
  assert.equal(canSeeVisibility(actors.owner, null), false);
  assert.equal(canSeeVisibility(null, under('c_james', 'client')), false);
});

// ── member management over HTTP ──────────────────────────────────────────

test('member management: Owner and Admin still manage, Project Manager, Team Member, and Client are refused, without reasons', async () => {
  const s = await scenario();
  for (const [email, expected] of [[PEOPLE.owner, 'ok'], [PEOPLE.admin, 'ok'], [PEOPLE.pm, 403], [PEOPLE.tmClient, 403], [PEOPLE.clientLinked, 403]]) {
    for (const action of ['members.manage', 'invitations.manage']) {
      const r = await s.http(email, { action, path: '/api/bloomops/invitations', method: 'POST' });
      if (expected === 'ok') {
        assert.ok(r.access, `${email} ${action}`);
        assert.equal(r.decision.allowed, true);
      } else {
        assert.equal(r.response?.status, expected, `${email} ${action}`);
        assert.deepEqual(await r.response.json(), { error: 'You do not have permission to do that.' }, 'no reason, no role, no hint');
      }
    }
  }
  // Nothing in the outward refusal names the engine's reason vocabulary.
  const r = await s.http(PEOPLE.tmClient, { action: 'members.manage' });
  const text = await r.response.text();
  assert.doesNotMatch(text, /capability|role|scope|visibility|workspace/i);
});

test('leak safety: an inaccessible record and a nonexistent one answer identically', async () => {
  const s = await scenario();
  const pairs = [
    [PEOPLE.tmClient, 'client.view', s.client('c_lawrence'), s.client('c_does_not_exist')],
    [PEOPLE.tmService, 'service.view', s.service('se_james_ghl'), s.service('se_does_not_exist')],
    [PEOPLE.tmService, 'client.view', s.client('c_james'), s.client('c_does_not_exist')],
    [PEOPLE.clientLinked, 'client.view', s.client('c_lawrence'), s.client('c_does_not_exist')],
    [PEOPLE.clientUnlinked, 'client.view', s.client('c_james'), s.client('c_does_not_exist')],
    [PEOPLE.tmNone, 'client.manage', s.client('c_james'), s.client('c_does_not_exist')],
    [PEOPLE.owner, 'client.view', s.client('c_b1'), s.client('c_does_not_exist')],
  ];
  for (const [email, action, hidden, missing] of pairs) {
    const a = await s.http(email, { action, resource: hidden });
    const b = await s.http(email, { action, resource: missing });
    assert.equal(a.response?.status, 404, `${email} ${action} hidden`);
    assert.equal(b.response?.status, 404, `${email} ${action} missing`);
    assert.equal(await a.response.text(), await b.response.text());
    assert.equal([...a.response.headers.entries()].join(), [...b.response.headers.entries()].join());
  }
  assert.deepEqual(await (await s.http(PEOPLE.tmClient, { action: 'client.view', resource: s.client('c_lawrence') })).response.json(), { error: 'Not found.' });
  // A visible record the actor may not act on is refused as forbidden, which
  // reveals only what they could already see.
  const seen = await s.http(PEOPLE.tmClient, { action: 'client.manage', resource: s.client('c_james') });
  assert.equal(seen.response.status, 403);
  // And a descriptor handed in directly is checked like a loaded one.
  const direct = await s.http(PEOPLE.tmClient, { action: 'client.view', resource: { type: 'client', id: 'c_lawrence', workspaceId: s.A, clientId: 'c_lawrence', visibility: 'client' } });
  assert.equal(direct.response.status, 404);
  const okDirect = await s.http(PEOPLE.tmClient, { action: 'client.view', resource: { type: 'client', id: 'c_james', workspaceId: s.A, clientId: 'c_james', visibility: 'client' } });
  assert.equal(okDirect.decision.allowed, true);
  assert.equal(okDirect.access.resource.id, 'c_james');
});

// ── origin ───────────────────────────────────────────────────────────────

test('a state-changing cross-site request is refused before the engine, and a same-origin one proceeds', async () => {
  const s = await scenario();
  const foreign = await s.http(PEOPLE.owner, { action: 'members.manage', path: '/api/bloomops/members/x', method: 'PATCH', origin: 'https://evil.example' });
  assert.equal(foreign.response.status, 403);
  assert.deepEqual(await foreign.response.json(), { error: 'Cross-site request refused.' });
  const same = await s.http(PEOPLE.owner, { action: 'members.manage', path: '/api/bloomops/members/x', method: 'PATCH' });
  assert.ok(same.access);
  const read = await s.http(PEOPLE.owner, { action: 'members.manage', path: '/api/bloomops/members', method: 'GET' });
  assert.ok(read.access, 'reads carry no Origin and are fine');
  // requireAccess alone (membership only) keeps the same fence.
  const cookie = await s.cookieFor(PEOPLE.owner);
  assert.equal((await requireAccess(s.request(cookie, '/x', 'POST', 'https://evil.example'), { env: s.env })).response.status, 403);
});

// ── legacy compatibility fence ───────────────────────────────────────────

test('the inherited prospecting routes admit workspace administrators only', async () => {
  const s = await scenario();
  for (const [email, expected] of [[PEOPLE.owner, 'admin'], [PEOPLE.admin, 'admin'], [PEOPLE.pm, null], [PEOPLE.tmClient, null], [PEOPLE.tmService, null], [PEOPLE.clientLinked, null], [PEOPLE.cross, null]]) {
    const cookie = await s.cookieFor(email);
    const ctx = await getWorkspace(s.request(cookie, '/api/pages'), { env: s.env });
    if (expected) {
      assert.equal(ctx.role, expected, email);
      assert.equal(ctx.workspace, 'agency-a');
      assert.equal(ctx.workspaceId, s.A);
    } else {
      assert.equal(ctx, null, `${email} sees the inherited app as a stranger would`);
    }
    const access = await getAccess(s.request(cookie), { env: s.env });
    assert.equal(legacyAppAllowed(access), Boolean(expected), `${email} on the home page`);
  }
  assert.equal(legacyAppAllowed(null), false);
  assert.equal(legacyAppAllowed({}), false);
  // The fence is the engine's decision, not a second list of roles.
  for (const role of ROLES) {
    const allowed = evaluate({ workspaceId: s.A, membershipId: 'm', userId: 'u', role, status: 'active', capabilities: null, scope: null }, { action: 'legacy.prospecting' }).allowed;
    assert.equal(allowed, role === 'owner' || role === 'admin', role);
  }
  // A suspended Admin loses it on the next request like everything else.
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: s.adminA.id, status: 'suspended', actorMembership: { id: s.ownerA.id, userId: s.ownerA.user_id } });
  assert.equal(await getWorkspace(s.request(await s.cookieFor(PEOPLE.admin), '/api/pages'), { env: s.env }), null);
  // The cross person is Owner of B, yet in A (their acting workspace) they are a Team Member and fenced.
  assert.equal(await getWorkspace(s.request(await s.cookieFor(PEOPLE.cross), '/api/pages'), { env: s.env }), null);
});
