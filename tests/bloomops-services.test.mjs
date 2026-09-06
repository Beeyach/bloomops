// The A7 service catalogue and service engagements, proven end to end: the
// real route handlers over the real schema with real Better Auth sessions,
// and the real components rendered with react-dom/server.
//
// The scenario is two agencies, each bootstrapped so each has its own
// catalogue. Agency A has an Owner, an Admin, a Project Manager, three Team
// Members (one assigned to the client James, one assigned only to James'
// Social engagement, one assigned to nothing but the Social department),
// and two Client memberships (one linked to James through a client_contacts
// row, one not linked at all). Agency B has its own Owner and its own
// client. Every allowed case has its denied twin.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAuth, testDb, run, one, all, APP_URL } from './_bloomops-db.mjs';
import { bootstrapPlan, runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { ACTIONS, evaluate, loadInternalServiceResource, loadServiceResource } from '../lib/bloomops/authorization.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_SERVICE_TYPES,
  ensureWorkspaceServiceCatalog,
  findServiceType,
  listDepartments,
  listServiceTypes,
} from '../lib/bloomops/service-catalog.mjs';
import {
  SERVICE_OPEN_STATUSES,
  SERVICE_STATUSES,
  SERVICE_TERMINAL_STATUSES,
  availableServiceTypes,
  getClientService,
  listClientServices,
  serviceStatusLabel,
  validateScopeNotes,
} from '../lib/bloomops/services.mjs';
import { describeEvent } from '../lib/bloomops/client-activity.mjs';

const { POST: addServiceRoute } = await import('../app/api/bloomops/clients/[id]/services/route.js');
const { PATCH: patchServiceRoute } = await import('../app/api/bloomops/clients/[id]/services/[serviceId]/route.js');

const Services = await import('../components/bloomops/Services.jsx');
const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, props));

// ── scenario ─────────────────────────────────────────────────────────────

const PEOPLE = {
  owner: 'a-owner@example.com',
  admin: 'a-admin@example.com',
  pm: 'a-pm@example.com',
  tmClient: 'a-tm-client@example.com',
  tmService: 'a-tm-service@example.com',
  tmDept: 'a-tm-dept@example.com',
  clientLinked: 'a-client-linked@example.com',
  clientUnlinked: 'a-client-unlinked@example.com',
  bOwner: 'b-owner@example.com',
  bAdmin: 'b-admin@example.com',
};

const CONTEXT = Symbol.for('__cloudflare-context__');

async function scenario() {
  const t = testAuth();
  await runBootstrap(t.d1, { workspaceName: 'Agency A', owner: { email: PEOPLE.owner, name: 'Ellen Owner' }, admin: { email: PEOPLE.admin, name: 'Ary Admin' } });
  await runBootstrap(t.d1, { workspaceName: 'Agency B', owner: { email: PEOPLE.bOwner, name: 'Bea Owner' }, admin: { email: PEOPLE.bAdmin, name: 'Bo Admin' } });
  const A = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-a'").id;
  const B = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-b'").id;

  const person = (key, workspaceId, role, name) => {
    run(t.raw, 'INSERT INTO user (id, name, email, email_verified) VALUES (?, ?, ?, 1)', `u_${key}`, name, PEOPLE[key]);
    run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', '2026-01-01T00:00:00.000Z')", `m_${key}`, workspaceId, `u_${key}`, role);
    return `m_${key}`;
  };
  person('pm', A, 'project_manager', 'Priya Manel');
  person('tmClient', A, 'team_member', 'Tomas Member');
  person('tmService', A, 'team_member', 'Maria Service');
  person('tmDept', A, 'team_member', 'Dev Department');
  person('clientLinked', A, 'client', 'Rae Ellis');
  person('clientUnlinked', A, 'client', 'Dana Newclient');

  const typeId = (workspaceId, slug) => one(t.raw, 'SELECT id FROM service_types WHERE workspace_id = ? AND slug = ?', workspaceId, slug).id;
  const departmentId = (workspaceId, slug) => one(t.raw, 'SELECT id FROM departments WHERE workspace_id = ? AND slug = ?', workspaceId, slug).id;

  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status, health) VALUES ('c_james', ?, 'James', 'james', 'active', 'on_track')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_other', ?, 'Other Client', 'other-client')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_b1', ?, 'B One', 'b-one')", B);

  // One engagement that already exists, so scope can be arranged before
  // anything is created through the API.
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_james_social', ?, 'c_james', ?, 'active')", A, typeId(A, 'social-media-management'));
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_james_ghl', ?, 'c_james', ?, 'planned')", A, typeId(A, 'ghl'));
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_b1_social', ?, 'c_b1', ?, 'active')", B, typeId(B, 'social-media-management'));

  run(t.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) VALUES (?, 'c_james', 'm_tmClient', 'member')", A);
  run(t.raw, "INSERT INTO service_assignments (workspace_id, service_engagement_id, membership_id, assignment_role) VALUES (?, 'se_james_social', 'm_tmService', 'lead')", A);
  run(t.raw, 'INSERT INTO department_memberships (workspace_id, department_id, membership_id) VALUES (?, ?, ?)', A, departmentId(A, 'social'), 'm_tmDept');
  run(t.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) VALUES ('cc_james', ?, 'c_james', 'Rae Ellis', ?, 'u_clientLinked', 1)", A, PEOPLE.clientLinked);

  async function actorFor(email, workspaceId = A) {
    const user = one(t.raw, 'SELECT id FROM user WHERE email = ?', email);
    const resolved = await resolveWorkspaceAccess(t.db, user.id, { workspaceId });
    return resolved ? loadActorFor(t, resolved, user) : null;
  }

  const cookies = new Map();
  async function cookieFor(email) {
    if (!cookies.has(email)) cookies.set(email, (await t.signIn(email)).cookie);
    return cookies.get(email);
  }

  // A real call into a real route handler, through the same Cloudflare
  // context the deployed one resolves its D1 binding from.
  async function call(email, path, { method = 'POST', body = null, origin = APP_URL, params = {} } = {}) {
    globalThis[CONTEXT] = { env: t.env, cf: {}, ctx: {} };
    const headers = {};
    if (email) headers.cookie = await cookieFor(email);
    if (method !== 'GET') headers.origin = origin;
    if (body !== null) headers['content-type'] = 'application/json';
    const req = new Request(`${APP_URL}${path}`, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
    const handler = /\/services\/[^/]+$/.test(path) ? patchServiceRoute : addServiceRoute;
    const res = await handler(req, { params: Promise.resolve(params) });
    let json = null;
    try {
      json = JSON.parse(await res.clone().text());
    } catch {}
    return { status: res.status, json, res };
  }

  const addService = (email, clientId, body, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/services`, { body, params: { id: clientId }, ...options });
  const patchService = (email, clientId, serviceId, body, options = {}) =>
    call(email, `/api/bloomops/clients/${clientId}/services/${serviceId}`, { method: 'PATCH', body, params: { id: clientId, serviceId }, ...options });

  const events = (clientId) => all(t.raw, 'SELECT * FROM activity_events WHERE client_id = ? ORDER BY rowid', clientId);
  const eventTypes = (clientId) => events(clientId).map((e) => e.event_type);
  const clientRow = (id) => one(t.raw, 'SELECT * FROM bloomops_clients WHERE id = ?', id);
  const serviceRows = (clientId) => all(t.raw, 'SELECT * FROM service_engagements WHERE client_id = ? ORDER BY rowid', clientId);

  return { ...t, A, B, typeId, departmentId, actorFor, cookieFor, call, addService, patchService, events, eventTypes, clientRow, serviceRows };
}

async function loadActorFor(t, resolved, user) {
  const { loadActor } = await import('../lib/bloomops/authorization.mjs');
  return loadActor(t.db, { ...resolved, user });
}

// ── the default catalogue ────────────────────────────────────────────────

test('an empty workspace receives exactly the four departments and five service types, mapped to the right departments', async () => {
  const { db, raw } = testDb();
  run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'Solo', 'solo')");
  const result = await ensureWorkspaceServiceCatalog(db, 'ws');
  assert.deepEqual(result, { departmentsAdded: 4, serviceTypesAdded: 5 });

  const departments = await listDepartments(db, 'ws');
  assert.deepEqual(departments.map((d) => d.slug), ['social', 'ads', 'systems', 'operations'], 'in position order');
  assert.deepEqual(departments.map((d) => d.name), ['Social', 'Ads', 'Systems', 'Operations']);
  assert.deepEqual(departments.map((d) => d.position), [10, 20, 30, 40]);
  assert.ok(departments.every((d) => d.active), 'all four are active');

  const types = await listServiceTypes(db, 'ws');
  assert.equal(types.length, 5);
  const mapping = Object.fromEntries(types.map((t) => [t.slug, t.departmentName]));
  assert.deepEqual(mapping, {
    'social-media-management': 'Social',
    ads: 'Ads',
    ghl: 'Systems',
    kajabi: 'Systems',
    'content-calendar': 'Social',
  });
  assert.deepEqual(
    types.map((t) => t.name).sort(),
    ['Ads', 'Content Calendar', 'GHL', 'Kajabi', 'Social Media Management'],
    'the five the phase asks for, and no funnels, sequences, automations, course builds, or integrations',
  );
  // Operations is a real department with no default service type: internal
  // work lives there, and it is not something the agency sells.
  assert.equal(types.filter((t) => t.departmentName === 'Operations').length, 0);
  assert.ok(departments.some((d) => d.slug === 'operations'));
});

test('seeding the catalogue again changes nothing, and never duplicates a slug', async () => {
  const { db, raw } = testDb();
  run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'Solo', 'solo')");
  await ensureWorkspaceServiceCatalog(db, 'ws');
  const before = all(raw, 'SELECT * FROM departments UNION ALL SELECT * FROM departments WHERE 0');
  const typesBefore = all(raw, 'SELECT id, slug, name, department_id, active FROM service_types ORDER BY slug');

  const second = await ensureWorkspaceServiceCatalog(db, 'ws');
  assert.deepEqual(second, { departmentsAdded: 0, serviceTypesAdded: 0 }, 'a second pass adds nothing');
  const third = await ensureWorkspaceServiceCatalog(db, 'ws');
  assert.deepEqual(third, { departmentsAdded: 0, serviceTypesAdded: 0 });

  assert.deepEqual(all(raw, 'SELECT * FROM departments UNION ALL SELECT * FROM departments WHERE 0'), before, 'departments untouched');
  assert.deepEqual(all(raw, 'SELECT id, slug, name, department_id, active FROM service_types ORDER BY slug'), typesBefore, 'service types untouched');
  assert.equal(all(raw, 'SELECT slug FROM departments').length, 4);
  assert.equal(all(raw, 'SELECT slug FROM service_types').length, 5);
});

test('a row that already carries a canonical slug is left exactly as the workspace made it', async () => {
  const { db, raw } = testDb();
  run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'Solo', 'solo')");
  // A workspace that renamed its Ads department and deactivated Kajabi
  // before the catalogue arrived. The defaults are a starting point, not a
  // policy the product re-imposes.
  run(raw, "INSERT INTO departments (id, workspace_id, name, slug, position) VALUES ('d_ads', 'ws', 'Paid Media', 'ads', 99)");
  run(raw, "INSERT INTO service_types (id, workspace_id, name, slug, active) VALUES ('st_kajabi', 'ws', 'Kajabi Courses', 'kajabi', 0)");

  const result = await ensureWorkspaceServiceCatalog(db, 'ws');
  assert.deepEqual(result, { departmentsAdded: 3, serviceTypesAdded: 4 }, 'only what was missing');
  const ads = one(raw, "SELECT * FROM departments WHERE slug = 'ads'");
  assert.equal(ads.id, 'd_ads');
  assert.equal(ads.name, 'Paid Media', 'the workspace keeps its own name');
  assert.equal(ads.position, 99);
  const kajabi = one(raw, "SELECT * FROM service_types WHERE slug = 'kajabi'");
  assert.equal(kajabi.name, 'Kajabi Courses');
  assert.equal(kajabi.active, 0, 'still deactivated');
  assert.equal(all(raw, 'SELECT slug FROM departments').length, 4);
  assert.equal(all(raw, 'SELECT slug FROM service_types').length, 5);
});

test('two workspaces get independent catalogues, and one cannot reference the other workspace’s department', async () => {
  const { db, raw } = testDb();
  run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws_a', 'A', 'a')");
  run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws_b', 'B', 'b')");
  await ensureWorkspaceServiceCatalog(db, 'ws_a');
  await ensureWorkspaceServiceCatalog(db, 'ws_b');

  const aDepartments = await listDepartments(db, 'ws_a');
  const bDepartments = await listDepartments(db, 'ws_b');
  assert.equal(aDepartments.length, 4);
  assert.equal(bDepartments.length, 4);
  assert.equal(aDepartments.filter((d) => bDepartments.some((x) => x.id === d.id)).length, 0, 'no row is shared');

  const aTypes = await listServiceTypes(db, 'ws_a');
  const bDepartmentIds = new Set(bDepartments.map((d) => d.id));
  assert.equal(aTypes.filter((t) => bDepartmentIds.has(t.departmentId)).length, 0, "A's types point only at A's departments");

  // The composite foreign key is what makes that true, not the code above.
  assert.throws(
    () => run(raw, "INSERT INTO service_types (id, workspace_id, name, slug, department_id) VALUES ('st_x', 'ws_a', 'Borrowed', 'borrowed', ?)", bDepartments[0].id),
    /FOREIGN KEY/i,
  );
  // And a service type of another workspace is invisible, exactly as an id
  // that never existed is.
  assert.equal(await findServiceType(db, 'ws_a', bDepartments[0].id), null);
  assert.equal(await findServiceType(db, 'ws_a', aTypes[0].id) !== null, true);
});

test('the bootstrap plan seeds the same catalogue as the domain helper, and re-running the plan changes nothing', async () => {
  // The two seeding paths exist because one runs through Drizzle and the
  // other through `wrangler d1 execute --file`, where none of our
  // JavaScript is running. They must agree.
  const viaPlan = testDb();
  await runBootstrap(viaPlan.d1, { workspaceName: 'Agency A', owner: { email: 'o@example.com' }, admin: { email: 'a@example.com' } });
  const viaHelper = testDb();
  run(viaHelper.raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'Agency A', 'agency-a')");
  await ensureWorkspaceServiceCatalog(viaHelper.db, 'ws');

  const shape = (raw) => ({
    departments: all(raw, 'SELECT name, slug, position, active FROM departments ORDER BY position'),
    types: all(raw, 'SELECT s.name, s.slug, s.active, d.slug AS department FROM service_types s LEFT JOIN departments d ON d.id = s.department_id ORDER BY s.slug'),
  });
  assert.deepEqual(shape(viaPlan.raw), shape(viaHelper.raw), 'both paths produce the same catalogue');

  const before = shape(viaPlan.raw);
  await runBootstrap(viaPlan.d1, { workspaceName: 'Agency A', owner: { email: 'o@example.com' }, admin: { email: 'a@example.com' } });
  assert.deepEqual(shape(viaPlan.raw), before, 'a second bootstrap is a no-op');
  assert.equal(all(viaPlan.raw, 'SELECT id FROM workspaces').length, 1, 'and still one workspace');
});

test('the catalogue statements are guarded, so an existing workspace picks the catalogue up without a data migration', async () => {
  const plan = bootstrapPlan({ workspaceName: 'Agency A', owner: { email: 'o@example.com' }, admin: { email: 'a@example.com' } });
  const catalogue = plan.statements.filter((s) => /INSERT INTO (departments|service_types)/.test(s));
  assert.equal(catalogue.length, 9, 'four departments and five service types');
  for (const statement of catalogue) {
    assert.match(statement, /NOT EXISTS/, 'every catalogue statement is guarded');
    assert.match(statement, /FROM workspaces w WHERE w\.slug = 'agency-a'/, 'and scoped to this workspace by slug');
  }
  // A workspace that existed before A7, with its people already in place.
  const { d1, raw } = testDb();
  run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws', 'Agency A', 'agency-a')");
  run(raw, "INSERT INTO user (id, name, email) VALUES ('u1', 'O', 'o@example.com')");
  run(raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m1', 'ws', 'u1', 'owner', 'active')");
  assert.equal(all(raw, 'SELECT id FROM departments').length, 0);
  for (const sql of plan.statements) await d1.prepare(sql).run();
  assert.equal(all(raw, 'SELECT id FROM departments').length, 4, 'the existing workspace now has the departments');
  assert.equal(all(raw, 'SELECT id FROM service_types').length, 5);
  assert.equal(one(raw, "SELECT role FROM workspace_memberships WHERE id = 'm1'").role, 'owner', 'and nothing else was rewritten');
});

test('the canonical definitions live in one module and nowhere else', async () => {
  assert.deepEqual(DEFAULT_DEPARTMENTS.map((d) => d.slug), ['social', 'ads', 'systems', 'operations']);
  assert.deepEqual(DEFAULT_SERVICE_TYPES.map((t) => t.slug), ['social-media-management', 'ads', 'ghl', 'kajabi', 'content-calendar']);
  const departmentSlugs = new Set(DEFAULT_DEPARTMENTS.map((d) => d.slug));
  for (const type of DEFAULT_SERVICE_TYPES) {
    assert.ok(departmentSlugs.has(type.department), `${type.slug} names a real department`);
  }
  assert.equal(new Set(DEFAULT_DEPARTMENTS.map((d) => d.slug)).size, DEFAULT_DEPARTMENTS.length, 'no duplicate department slug');
  assert.equal(new Set(DEFAULT_SERVICE_TYPES.map((t) => t.slug)).size, DEFAULT_SERVICE_TYPES.length, 'no duplicate service-type slug');
});

test('department membership alone gives no client scope and no service scope', async () => {
  const s = await scenario();
  const dept = await s.actorFor(PEOPLE.tmDept);
  assert.equal(dept.role, 'team_member');
  assert.equal(dept.scope.kind, 'assigned');
  assert.equal(dept.scope.clientIds.size, 0, 'belonging to Social is not a client assignment');
  assert.equal(dept.scope.serviceEngagementIds.size, 0, 'nor a service assignment');
  assert.deepEqual(await listClientServices(s.db, dept, 'c_james'), []);
  // The row really is there; it just grants nothing.
  assert.equal(all(s.raw, "SELECT id FROM department_memberships WHERE membership_id = 'm_tmDept'").length, 1);
  const resource = await loadInternalServiceResource(s.db, s.A, 'se_james_social');
  assert.equal(evaluate(dept, { action: 'service.view', resource }).outcome, 'not_found');
});

// ── the action policy ────────────────────────────────────────────────────

test('service.create joins the A4 action table as a delivery action about the client', async () => {
  const s = await scenario();
  assert.ok(ACTIONS['service.create']);
  assert.deepEqual(ACTIONS['service.create'].roles, ['owner', 'admin', 'project_manager']);
  assert.equal(ACTIONS['service.create'].resource, true, 'it names the client the service is added to');
  assert.equal(ACTIONS['service.create'].capability, undefined, 'no capability: this is delivery, not security administration');
});

test('an internal service resource is internal, so the record a Client may one day see in the portal is closed to them here', async () => {
  const s = await scenario();
  const portal = await loadServiceResource(s.db, s.A, 'se_james_social');
  const internal = await loadInternalServiceResource(s.db, s.A, 'se_james_social');
  assert.equal(portal.visibility, 'client');
  assert.equal(internal.visibility, 'internal');
  assert.deepEqual({ ...internal, visibility: 'client' }, portal, 'nothing else differs');

  const client = await s.actorFor(PEOPLE.clientLinked);
  assert.equal(evaluate(client, { action: 'service.view', resource: portal }).allowed, true, 'their own client’s service, in the portal');
  const refused = evaluate(client, { action: 'service.view', resource: internal });
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'visibility');
  assert.equal(refused.outcome, 'not_found', 'and the refusal does not admit the record exists');
});

test('a service loaded under the wrong client is not found, even inside the same workspace', async () => {
  const s = await scenario();
  assert.ok(await loadInternalServiceResource(s.db, s.A, 'se_james_social', { clientId: 'c_james' }));
  assert.equal(await loadInternalServiceResource(s.db, s.A, 'se_james_social', { clientId: 'c_other' }), null);
  assert.equal(await loadInternalServiceResource(s.db, s.A, 'se_b1_social', { clientId: 'c_james' }), null, "B's engagement");
  assert.equal(await loadInternalServiceResource(s.db, s.A, 'se_nope', { clientId: 'c_james' }), null, 'an invented id');
});

// ── creating ─────────────────────────────────────────────────────────────

test('Owner, Admin, and Project Manager may add a service; a Team Member and a Client may not', async () => {
  const s = await scenario();
  const kajabi = s.typeId(s.A, 'kajabi');
  const contentCalendar = s.typeId(s.A, 'content-calendar');
  const ads = s.typeId(s.A, 'ads');

  const owner = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: kajabi });
  assert.equal(owner.status, 201);
  const admin = await s.addService(PEOPLE.admin, 'c_james', { serviceTypeId: contentCalendar });
  assert.equal(admin.status, 201);
  const pm = await s.addService(PEOPLE.pm, 'c_james', { serviceTypeId: ads });
  assert.equal(pm.status, 201);

  // A Team Member assigned to the client may read it and gets a plain
  // refusal, with no field errors and nothing about why.
  const tm = await s.addService(PEOPLE.tmClient, 'c_james', { serviceTypeId: kajabi });
  assert.equal(tm.status, 403);
  assert.deepEqual(tm.json, { error: 'You do not have permission to do that.' });

  // A Client membership is refused on visibility, so the answer is the one
  // a client that does not exist gets.
  const linked = await s.addService(PEOPLE.clientLinked, 'c_james', { serviceTypeId: kajabi });
  assert.equal(linked.status, 404);
  assert.deepEqual(linked.json, { error: 'Not found.' });
  const unlinked = await s.addService(PEOPLE.clientUnlinked, 'c_james', { serviceTypeId: kajabi });
  assert.equal(unlinked.status, 404);
  assert.deepEqual(unlinked.json, linked.json);

  // A Team Member with only a service assignment does not reach the client
  // record, so adding a service to it is not found either.
  const tmService = await s.addService(PEOPLE.tmService, 'c_james', { serviceTypeId: kajabi });
  assert.equal(tmService.status, 404);
});

test('a new engagement is always Planned, whatever the request says, and nothing else moves', async () => {
  const s = await scenario();
  // Sign in first, so the magic-link message is not counted as something
  // adding a service sent.
  await s.cookieFor(PEOPLE.owner);
  const mailBefore = s.mailer.sent.length;
  const before = { ...s.clientRow('c_james') };
  const created = await s.addService(PEOPLE.owner, 'c_james', {
    serviceTypeId: s.typeId(s.A, 'kajabi'),
    packageName: '  Course build  ',
    startDate: '2026-10-01',
    scopeNotes: '  Two courses, no ads.  ',
    // Everything below is ignored: not in the keys the route picks, and
    // not writable by the domain either.
    status: 'active',
    approvalPreference: 'auto',
    sourceTemplateVersionId: 'tv_1',
    clientId: 'c_other',
    workspaceId: s.B,
  });
  assert.equal(created.status, 201);
  const row = one(s.raw, 'SELECT * FROM service_engagements WHERE id = ?', created.json.service.id);
  assert.equal(row.status, 'planned', 'the browser cannot choose a starting status');
  assert.equal(row.client_id, 'c_james', 'and cannot choose the client');
  assert.equal(row.workspace_id, s.A, 'or the workspace');
  assert.equal(row.package_name, 'Course build', 'trimmed');
  assert.equal(row.scope_notes, 'Two courses, no ads.');
  assert.equal(row.start_date, '2026-10-01');
  assert.equal(row.end_date, null);
  assert.equal(row.approval_preference, null, 'A7 does not surface approval preference');
  assert.equal(row.source_template_version_id, null, 'and instantiates no template');

  // The client did not move, and nothing was generated.
  assert.deepEqual({ ...s.clientRow('c_james') }, before, 'not one column of the client changed');
  assert.equal(all(s.raw, 'SELECT id FROM onboarding_instances').length, 0, 'no onboarding');
  assert.equal(all(s.raw, 'SELECT id FROM onboarding_items').length, 0);
  assert.equal(all(s.raw, 'SELECT id FROM workspace_invitations').length, 0, 'nobody was invited');
  assert.equal(s.mailer.sent.length, mailBefore, 'and no mail was sent');
  assert.equal(one(s.raw, "SELECT user_id FROM client_contacts WHERE id = 'cc_james'").user_id, 'u_clientLinked', 'the portal link is untouched');
});

test('one client holds Social, Ads, and GHL at once, and is still one client record', async () => {
  const s = await scenario();
  // Social and GHL already exist in the fixture; Ads is added through the
  // real route, which is the case the phase names.
  const added = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'ads'), packageName: 'Meta + Google' });
  assert.equal(added.status, 201);

  const owner = await s.actorFor(PEOPLE.owner);
  const services = await listClientServices(s.db, owner, 'c_james');
  assert.deepEqual(services.map((x) => x.serviceTypeName).sort(), ['Ads', 'GHL', 'Social Media Management']);
  assert.deepEqual(services.map((x) => x.departmentName).sort(), ['Ads', 'Social', 'Systems'], 'each carries its own department');
  assert.equal(new Set(services.map((x) => x.clientId)).size, 1);
  assert.equal(all(s.raw, "SELECT id FROM bloomops_clients WHERE name = 'James'").length, 1, 'one client, three engagements');
  assert.deepEqual(services.map((x) => x.statusLabel).sort(), ['Active', 'Planned', 'Planned']);
});

test('a service type from another workspace, an inactive one, and an invented one are all refused the same way', async () => {
  const s = await scenario();
  const foreign = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.B, 'kajabi') });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.json.errors.serviceTypeId, 'Choose the service this client bought.');
  const invented = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: 'st_nope' });
  assert.deepEqual(invented.json, foreign.json, 'and neither says which it was');
  const missing = await s.addService(PEOPLE.owner, 'c_james', {});
  assert.equal(missing.status, 400);

  run(s.raw, "UPDATE service_types SET active = 0 WHERE workspace_id = ? AND slug = 'kajabi'", s.A);
  const inactive = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'kajabi') });
  assert.equal(inactive.status, 400, 'a deactivated type cannot start something new');
  assert.equal(s.serviceRows('c_james').length, 2, 'nothing was created by any of them');
});

test('validation is bounded and server-side: package, scope notes, and dates', async () => {
  const s = await scenario();
  const kajabi = s.typeId(s.A, 'kajabi');
  const long = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: kajabi, packageName: 'x'.repeat(121) });
  assert.equal(long.status, 400);
  assert.match(long.json.errors.packageName, /120 characters or fewer/);
  const notes = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: kajabi, scopeNotes: 'y'.repeat(2001) });
  assert.equal(notes.status, 400);
  const badDate = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: kajabi, startDate: '2026-13-40' });
  assert.equal(badDate.status, 400);
  assert.equal(s.serviceRows('c_james').length, 2, 'no half-made row');
  // Scope notes are text, never JSON.
  assert.deepEqual(validateScopeNotes('  '), { ok: true, value: null });
  assert.deepEqual(validateScopeNotes('Two posts a week.'), { ok: true, value: 'Two posts a week.' });
});

// ── the duplicate invariant ──────────────────────────────────────────────

test('a client may not hold two open engagements of the same service type, in any open status', async () => {
  const s = await scenario();
  const social = s.typeId(s.A, 'social-media-management');
  assert.deepEqual(SERVICE_OPEN_STATUSES, ['planned', 'onboarding', 'active', 'paused']);
  assert.deepEqual(SERVICE_TERMINAL_STATUSES, ['completed', 'cancelled']);

  for (const status of SERVICE_OPEN_STATUSES) {
    run(s.raw, 'UPDATE service_engagements SET status = ? WHERE id = ?', status, 'se_james_social');
    const refused = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: social });
    assert.equal(refused.status, 409, `${status} blocks a second Social`);
    assert.equal(refused.json.error, 'That service is already running for this client.');
    assert.match(refused.json.errors.serviceTypeId, /Social Media Management is already running/);
    assert.doesNotMatch(JSON.stringify(refused.json), /UNIQUE|constraint|sqlite/i, 'never the database’s own words');
    assert.equal(s.serviceRows('c_james').length, 2);
  }
});

test('a completed or cancelled engagement leaves the service type free to be sold again', async () => {
  // A fresh scenario per terminal status, because activity_events is
  // append-only and a cleanup delete is exactly what the triggers refuse.
  for (const terminal of SERVICE_TERMINAL_STATUSES) {
    const s = await scenario();
    const social = s.typeId(s.A, 'social-media-management');
    run(s.raw, 'UPDATE service_engagements SET status = ? WHERE id = ?', terminal, 'se_james_social');
    const created = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: social });
    assert.equal(created.status, 201, `a ${terminal} Social may be replaced`);
    assert.equal(one(s.raw, 'SELECT status FROM service_engagements WHERE id = ?', created.json.service.id).status, 'planned');
    // Both rows stand: the old engagement is history, not something the new
    // one overwrote.
    assert.equal(all(s.raw, 'SELECT id FROM service_engagements WHERE client_id = ? AND service_type_id = ?', 'c_james', social).length, 2);
  }
});

test('the invariant is the database’s, so a direct insert cannot make two open engagements of one type either', async () => {
  const s = await scenario();
  const social = s.typeId(s.A, 'social-media-management');
  // Straight past every line of domain code, the way a concurrent request
  // that lost the race would arrive.
  assert.throws(
    () => run(s.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_dupe', ?, 'c_james', ?, 'planned')", s.A, social),
    /UNIQUE constraint failed/i,
  );
  // The same pair is fine once one side is terminal, and fine for a
  // different client.
  run(s.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_old', ?, 'c_james', ?, 'completed')", s.A, social);
  run(s.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status) VALUES ('se_other', ?, 'c_other', ?, 'active')", s.A, social);
  assert.equal(s.serviceRows('c_james').length, 3);
});

test('reopening a terminal engagement into a conflict is refused in words, not as a database error', async () => {
  const s = await scenario();
  const social = s.typeId(s.A, 'social-media-management');
  // One old completed Social, one current planned Social.
  run(s.raw, 'UPDATE service_engagements SET status = ? WHERE id = ?', 'completed', 'se_james_social');
  const current = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: social });
  assert.equal(current.status, 201);

  const reopened = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_social', { status: 'active' });
  assert.equal(reopened.status, 409);
  assert.match(reopened.json.errors.serviceTypeId, /already running/);
  assert.doesNotMatch(JSON.stringify(reopened.json), /UNIQUE|constraint|sqlite/i);
  assert.equal(one(s.raw, "SELECT status FROM service_engagements WHERE id = 'se_james_social'").status, 'completed', 'unchanged');
  assert.equal(s.eventTypes('c_james').filter((e) => e === 'SERVICE_STATUS_CHANGED').length, 0, 'and a refusal records nothing');

  // Once the current one is out of the way, reopening is allowed.
  await s.patchService(PEOPLE.owner, 'c_james', current.json.service.id, { status: 'cancelled' });
  const again = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_social', { status: 'active' });
  assert.equal(again.status, 200);
  assert.equal(one(s.raw, "SELECT status FROM service_engagements WHERE id = 'se_james_social'").status, 'active');
});

// ── lifecycle ────────────────────────────────────────────────────────────

test('every canonical service status is accepted, and none of them touches the client', async () => {
  const s = await scenario();
  assert.deepEqual(SERVICE_STATUSES, ['planned', 'onboarding', 'active', 'paused', 'completed', 'cancelled']);
  await s.cookieFor(PEOPLE.owner);
  const mailBefore = s.mailer.sent.length;
  const before = s.clientRow('c_james');
  for (const status of SERVICE_STATUSES) {
    const res = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', { status });
    assert.equal(res.status, 200, `${status} is accepted`);
    assert.equal(one(s.raw, "SELECT status FROM service_engagements WHERE id = 'se_james_ghl'").status, status);
    const after = s.clientRow('c_james');
    assert.equal(after.relationship_status, before.relationship_status, `client status unchanged by service ${status}`);
    assert.equal(after.health, before.health, 'and so is health');
    assert.equal(after.start_date, before.start_date);
    assert.equal(after.end_date, before.end_date);
  }
  // The one the phase names explicitly: active -> paused on the service
  // leaves an active client active.
  assert.equal(s.clientRow('c_james').relationship_status, 'active');
  assert.equal(all(s.raw, 'SELECT id FROM onboarding_instances').length, 0, 'and Onboarding status generated nothing');
  assert.equal(s.mailer.sent.length, mailBefore, 'no mail either');
});

test('an unknown status is refused and a status equal to the stored one is a no-op', async () => {
  const s = await scenario();
  const bad = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', { status: 'archived' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.errors.status, 'Choose a status from the list.');
  const same = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', { status: 'planned' });
  assert.equal(same.status, 200);
  assert.equal(same.json.unchanged, true);
  assert.equal(s.eventTypes('c_james').filter((e) => e === 'SERVICE_STATUS_CHANGED').length, 0, 'a no-op records nothing');
});

test('editing changes the package, dates, and scope notes, and never the service type', async () => {
  const s = await scenario();
  const res = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', {
    packageName: 'Systems build',
    startDate: '2026-02-01',
    endDate: '2026-08-01',
    scopeNotes: 'Funnel plus two automations.',
  });
  assert.equal(res.status, 200);
  const row = one(s.raw, "SELECT * FROM service_engagements WHERE id = 'se_james_ghl'");
  assert.equal(row.package_name, 'Systems build');
  assert.equal(row.start_date, '2026-02-01');
  assert.equal(row.end_date, '2026-08-01');
  assert.equal(row.scope_notes, 'Funnel plus two automations.');

  const backwards = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', { startDate: '2026-09-01' });
  assert.equal(backwards.status, 400, 'the end date cannot end up before the start date');
  assert.match(backwards.json.errors.endDate, /cannot be before the start date/);

  const swap = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', { serviceTypeId: s.typeId(s.A, 'kajabi') });
  assert.equal(swap.status, 400);
  assert.match(swap.json.errors.serviceTypeId, /keeps the service it was bought for/);
  assert.equal(one(s.raw, "SELECT service_type_id FROM service_engagements WHERE id = 'se_james_ghl'").service_type_id, s.typeId(s.A, 'ghl'));
});

// ── activity ─────────────────────────────────────────────────────────────

test('service mutations record one readable event each, on the right client and engagement', async () => {
  const s = await scenario();
  const created = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'kajabi'), packageName: 'Course build' });
  await s.patchService(PEOPLE.pm, 'c_james', created.json.service.id, { packageName: 'Course build v2', status: 'active' });

  const events = s.events('c_james');
  assert.deepEqual(events.map((e) => e.event_type), ['SERVICE_ENGAGEMENT_CREATED', 'SERVICE_DETAILS_UPDATED', 'SERVICE_STATUS_CHANGED'], 'details and status are two facts, one event each');
  for (const event of events) {
    assert.equal(event.workspace_id, s.A);
    assert.equal(event.client_id, 'c_james');
    assert.equal(event.service_engagement_id, created.json.service.id);
    assert.equal(event.subject_type, 'service_engagement');
  }
  assert.equal(events[0].actor_membership_id, one(s.raw, "SELECT id FROM workspace_memberships WHERE user_id = (SELECT id FROM user WHERE email = ?)", PEOPLE.owner).id);
  assert.equal(events[1].actor_membership_id, 'm_pm', 'the Project Manager who made the change');

  // Words, never a code, a UUID, or the metadata JSON.
  const said = events.map((e) => describeEvent(e.event_type, JSON.parse(e.metadata_json)));
  assert.deepEqual(said[0], { title: 'Service added', detail: 'Kajabi (Course build) was added.' });
  assert.deepEqual(said[1], { title: 'Service updated', detail: 'Kajabi: package changed.' });
  assert.deepEqual(said[2], { title: 'Service status changed', detail: 'Kajabi changed from Planned to Active.' });
  for (const line of said) {
    assert.doesNotMatch(`${line.title} ${line.detail}`, /SERVICE_|_CHANGED|[0-9a-f]{16}|[{}]/, 'no code, no id, no JSON');
  }
});

test('history stays readable after the service type is renamed, and a failed mutation records nothing', async () => {
  const s = await scenario();
  const created = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'kajabi') });
  run(s.raw, "UPDATE service_types SET name = 'Kajabi (retired)' WHERE workspace_id = ? AND slug = 'kajabi'", s.A);
  const event = s.events('c_james')[0];
  assert.equal(JSON.parse(event.metadata_json).serviceTypeName, 'Kajabi', 'the name as it was when it happened');

  const before = s.events('c_james').length;
  await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: 'st_nope' });
  await s.addService(PEOPLE.tmClient, 'c_james', { serviceTypeId: s.typeId(s.A, 'ads') });
  await s.patchService(PEOPLE.owner, 'c_james', created.json.service.id, { status: 'planned' });
  assert.equal(s.events('c_james').length, before, 'a validation failure, a refusal, and a no-op all record nothing');
});

test('activity events cannot be edited or deleted afterwards', async () => {
  const s = await scenario();
  await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'kajabi') });
  const event = s.events('c_james')[0];
  assert.throws(() => run(s.raw, 'UPDATE activity_events SET event_type = ? WHERE id = ?', 'CLIENT_CREATED', event.id), /append-only|immutable/i);
  assert.throws(() => run(s.raw, 'DELETE FROM activity_events WHERE id = ?', event.id), /append-only|immutable/i);
});

// ── scope, leak safety, and the origin fence ─────────────────────────────

test('a Team Member sees the services their assignment reaches, and no others', async () => {
  const s = await scenario();
  const clientAssigned = await s.actorFor(PEOPLE.tmClient);
  const serviceAssigned = await s.actorFor(PEOPLE.tmService);

  const all1 = await listClientServices(s.db, clientAssigned, 'c_james');
  assert.deepEqual(all1.map((x) => x.serviceTypeName).sort(), ['GHL', 'Social Media Management'], 'a client assignment reaches every engagement');

  const only = await listClientServices(s.db, serviceAssigned, 'c_james');
  assert.deepEqual(only.map((x) => x.id), ['se_james_social'], 'a service assignment reaches exactly one');
  assert.equal(await getClientService(s.db, serviceAssigned, 'c_james', 'se_james_ghl'), null);

  // And a later engagement under the same client is covered by the client
  // assignment without anybody touching a row.
  await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'ads') });
  const after = await listClientServices(s.db, await s.actorFor(PEOPLE.tmClient), 'c_james');
  assert.equal(after.length, 3);
  assert.equal((await listClientServices(s.db, await s.actorFor(PEOPLE.tmService), 'c_james')).length, 1, 'the service-only assignment did not widen');
});

test('leak safety: a foreign service, a service under the wrong client, and an invented id answer identically', async () => {
  const s = await scenario();
  const foreign = await s.patchService(PEOPLE.owner, 'c_james', 'se_b1_social', { status: 'paused' });
  const wrongClient = await s.patchService(PEOPLE.owner, 'c_other', 'se_james_social', { status: 'paused' });
  const invented = await s.patchService(PEOPLE.owner, 'c_james', 'se_nope', { status: 'paused' });
  const outOfScope = await s.patchService(PEOPLE.owner, 'c_nope', 'se_james_social', { status: 'paused' });
  for (const res of [foreign, wrongClient, invented, outOfScope]) {
    assert.equal(res.status, 404);
    assert.deepEqual(res.json, { error: 'Not found.' }, 'one answer, with no reason in it');
  }
  assert.equal(one(s.raw, "SELECT status FROM service_engagements WHERE id = 'se_b1_social'").status, 'active', "B's engagement untouched");
});

test('every A7 service mutation is behind the origin fence', async () => {
  const s = await scenario();
  const evil = 'https://evil.example';
  const create = await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'kajabi') }, { origin: evil });
  assert.equal(create.status, 403);
  assert.deepEqual(create.json, { error: 'Cross-site request refused.' });
  const patch = await s.patchService(PEOPLE.owner, 'c_james', 'se_james_ghl', { status: 'active' }, { origin: evil });
  assert.equal(patch.status, 403);
  assert.equal(s.serviceRows('c_james').length, 2, 'and neither changed anything');
  assert.equal(one(s.raw, "SELECT status FROM service_engagements WHERE id = 'se_james_ghl'").status, 'planned');

  // Same-origin, same person, same body: allowed.
  assert.equal((await s.addService(PEOPLE.owner, 'c_james', { serviceTypeId: s.typeId(s.A, 'kajabi') })).status, 201);
});

// ── what the screen offers ───────────────────────────────────────────────

test('the add form offers only service types that could actually start now', async () => {
  const s = await scenario();
  const catalogue = await listServiceTypes(s.db, s.A);
  const offered = await availableServiceTypes(s.db, s.A, 'c_james', catalogue);
  assert.deepEqual(offered.map((t) => t.slug).sort(), ['ads', 'content-calendar', 'kajabi'], 'Social and GHL are already open');

  run(s.raw, "UPDATE service_engagements SET status = 'completed' WHERE id = 'se_james_social'");
  const afterCompletion = await availableServiceTypes(s.db, s.A, 'c_james', catalogue);
  assert.ok(afterCompletion.some((t) => t.slug === 'social-media-management'), 'a completed one may be sold again');

  run(s.raw, "UPDATE service_types SET active = 0 WHERE workspace_id = ? AND slug = 'kajabi'", s.A);
  const afterDeactivation = await availableServiceTypes(s.db, s.A, 'c_james', await listServiceTypes(s.db, s.A));
  assert.ok(!afterDeactivation.some((t) => t.slug === 'kajabi'), 'a deactivated type is not offered');
});

// ── rendering ────────────────────────────────────────────────────────────

test('a service row is a row: name, department, package, date, and a status in words', () => {
  const html = render(Services.ServiceRow, {
    service: {
      id: 'se1',
      serviceTypeName: 'Social Media Management',
      departmentName: 'Social',
      packageName: 'Growth',
      startDate: '2026-03-01',
      status: 'active',
      scopeNotes: 'Three posts a week.',
    },
  });
  assert.match(html, /Social Media Management/);
  assert.match(html, /Social · Growth · Started 1 Mar 2026/);
  assert.match(html, /Three posts a week\./);
  assert.match(html, />Active</, 'the status is a word, not a colour');
  assert.doesNotMatch(html, /bo-card|gradient|holo|progress/i, 'no card, no chart, no ring');
  assert.doesNotMatch(html, /se1/, 'the id is not rendered');
});

test('every service status renders a label and a glyph, so none is colour alone', () => {
  for (const status of SERVICE_STATUSES) {
    const html = render(Services.ServiceStatus, { status });
    assert.match(html, new RegExp(serviceStatusLabel(status)), `${status} says its name`);
    assert.match(html, /<svg/, `${status} carries a glyph`);
  }
});

test('an assignment row says the role in words, and marks somebody who is no longer active', () => {
  const active = render(Services.AssignmentRow, {
    assignment: { id: 'a1', name: 'Maria Service', email: 'maria@example.com', roleLabel: 'Team Member', assignmentRole: 'lead', assignmentRoleLabel: 'Lead', active: true },
  });
  assert.match(active, /Maria Service/);
  assert.match(active, />Lead</);
  assert.doesNotMatch(active, /No longer active/);
  // A real space between the name and the role, so anything reading the
  // text gets "Maria Service Lead" and not "Maria ServiceLead". The
  // marker's left margin is styling and reaches none of them.
  assert.match(active.replace(/<[^>]+>/g, ''), /Maria Service Lead/);

  const gone = render(Services.AssignmentRow, {
    assignment: { id: 'a2', name: 'Tomas Member', email: 't@example.com', roleLabel: 'Team Member', assignmentRole: 'member', assignmentRoleLabel: 'Member', active: false },
  });
  assert.match(gone, /No longer active in this workspace\./, 'said in words, not implied by styling');
  assert.match(gone, /Tomas Member/, 'and they keep their place in the list');
});
