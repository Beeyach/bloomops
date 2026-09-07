// The A6 Clients domain, proven end to end: the real route handlers over
// the real schema with real Better Auth sessions, and the real components
// rendered with react-dom/server.
//
// The scenario is two agencies. Agency A has an Owner, an Admin, a Project
// Manager, three Team Members (one assigned to the client Lawrence, one
// assigned only to Lawrence's Social engagement, one assigned to nothing),
// and two Client memberships (one linked to Lawrence through a
// client_contacts row, one not linked at all). Agency B has its own Owner
// and its own client. Every allowed case has its denied twin.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAuth, run, one, all, APP_URL } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { ACTIVITY } from '../lib/bloomops/activity.mjs';
import { ACTIONS, evaluate, loadActor, loadClientResource, loadInternalClientResource } from '../lib/bloomops/authorization.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';
import {
  CLIENT_FILTERS,
  CLIENT_HEALTHS,
  CLIENT_STATUSES,
  getClient,
  listClients,
  normalizeFilter,
  ownerCandidates,
  slugify,
  timezoneOptions,
  validateDate,
  validateTimezone,
  validateWebsite,
} from '../lib/bloomops/clients.mjs';
import { listContacts } from '../lib/bloomops/client-contacts.mjs';
import { clientActivity, describeEvent } from '../lib/bloomops/client-activity.mjs';

const root = new URL('..', import.meta.url);
const src = (path) => readFileSync(new URL(path, root), 'utf8');

const { POST: createRoute } = await import('../app/api/bloomops/clients/route.js');
const { PATCH: patchRoute } = await import('../app/api/bloomops/clients/[id]/route.js');
const { POST: addContactRoute } = await import('../app/api/bloomops/clients/[id]/contacts/route.js');
const { PATCH: patchContactRoute, DELETE: deleteContactRoute } = await import('../app/api/bloomops/clients/[id]/contacts/[contactId]/route.js');

const Clients = await import('../components/bloomops/Clients.jsx');
const render = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, props));

// ── scenario ─────────────────────────────────────────────────────────────

const PEOPLE = {
  owner: 'a-owner@example.com',
  admin: 'a-admin@example.com',
  pm: 'a-pm@example.com',
  tmClient: 'a-tm-client@example.com',
  tmService: 'a-tm-service@example.com',
  tmNone: 'a-tm-none@example.com',
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
  person('tmService', A, 'team_member', 'Sana Service');
  person('tmNone', A, 'team_member', 'Nils Nobody');
  person('clientLinked', A, 'client', 'Rae Ellis');
  person('clientUnlinked', A, 'client', 'Dana Newclient');

  // One client that already exists, so scope can be set up before anything
  // is created through the API, plus one in the other agency.
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status, health) VALUES ('c_lawrence', ?, 'Lawrence', 'lawrence', 'active', 'on_track')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) VALUES ('c_other', ?, 'Other Client', 'other-client', 'paused')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_b1', ?, 'B One', 'b-one')", B);
  run(t.raw, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_social', ?, 'Social', 'social')", A);
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_lawrence_social', ?, 'c_lawrence', 'st_social')", A);

  // Scope rows: a client assignment reaches the client record; a service
  // assignment reaches the engagement only.
  run(t.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) VALUES (?, 'c_lawrence', 'm_tmClient', 'member')", A);
  run(t.raw, "INSERT INTO service_assignments (workspace_id, service_engagement_id, membership_id, assignment_role) VALUES (?, 'se_lawrence_social', 'm_tmService', 'lead')", A);
  run(t.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) VALUES ('cc_lawrence', ?, 'c_lawrence', 'Rae Ellis', ?, 'u_clientLinked', 1)", A, PEOPLE.clientLinked);

  const membershipOf = (email, workspaceId) => one(t.raw, 'SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = ? AND m.workspace_id = ?', email, workspaceId);
  const ownerA = membershipOf(PEOPLE.owner, A);

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

  // A real call into a real route handler. The Cloudflare context global is
  // what getCloudflareContext() reads, so the handler resolves the test D1
  // binding exactly as the deployed one resolves its own.
  async function call(email, path, { method = 'POST', body = null, origin = APP_URL, params = {} } = {}) {
    globalThis[CONTEXT] = { env: t.env, cf: {}, ctx: {} };
    const headers = {};
    if (email) headers.cookie = await cookieFor(email);
    if (method !== 'GET') headers.origin = origin;
    if (body !== null) headers['content-type'] = 'application/json';
    const req = new Request(`${APP_URL}${path}`, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
    const handler =
      path === '/api/bloomops/clients'
        ? createRoute
        : /\/contacts\/[^/]+$/.test(path)
          ? method === 'DELETE'
            ? deleteContactRoute
            : patchContactRoute
          : /\/contacts$/.test(path)
            ? addContactRoute
            : patchRoute;
    const res = await handler(req, { params: Promise.resolve(params) });
    let json = null;
    try {
      json = JSON.parse(await res.clone().text());
    } catch {}
    return { status: res.status, json, res };
  }

  const create = (email, body) => call(email, '/api/bloomops/clients', { body });
  const patch = (email, id, body) => call(email, `/api/bloomops/clients/${id}`, { method: 'PATCH', body, params: { id } });
  const addContact = (email, id, body) => call(email, `/api/bloomops/clients/${id}/contacts`, { body, params: { id } });
  const patchContact = (email, id, contactId, body) =>
    call(email, `/api/bloomops/clients/${id}/contacts/${contactId}`, { method: 'PATCH', body, params: { id, contactId } });
  const removeContact = (email, id, contactId) =>
    call(email, `/api/bloomops/clients/${id}/contacts/${contactId}`, { method: 'DELETE', params: { id, contactId } });

  const events = (clientId) => all(t.raw, 'SELECT * FROM activity_events WHERE client_id = ? ORDER BY rowid', clientId);
  const eventTypes = (clientId) => events(clientId).map((e) => e.event_type);
  const contactsOf = (clientId) => all(t.raw, 'SELECT * FROM client_contacts WHERE client_id = ? ORDER BY rowid', clientId);
  const clientRow = (id) => one(t.raw, 'SELECT * FROM bloomops_clients WHERE id = ?', id);

  return { ...t, A, B, ownerA, membershipOf, actorFor, cookieFor, call, create, patch, addContact, patchContact, removeContact, events, eventTypes, contactsOf, clientRow };
}

const GOOD = { name: 'Northwind Studio', contactName: 'Rae Ellis', contactEmail: 'Rae@Example.COM' };

// ── the action policy ────────────────────────────────────────────────────

test('client.create joins the A4 action table as a workspace-level delivery action', async () => {
  const s = await scenario();
  assert.ok(ACTIONS['client.create'], 'the action exists');
  assert.deepEqual(ACTIONS['client.create'].roles, ['owner', 'admin', 'project_manager']);
  assert.equal(ACTIONS['client.create'].resource, undefined, 'creating needs no resource: the record does not exist yet');
  assert.equal(ACTIONS['client.create'].capability, undefined);

  const expected = {
    owner: true,
    admin: true,
    project_manager: true,
    team_member: false,
    client: false,
  };
  const actors = {
    owner: await s.actorFor(PEOPLE.owner),
    admin: await s.actorFor(PEOPLE.admin),
    project_manager: await s.actorFor(PEOPLE.pm),
    team_member: await s.actorFor(PEOPLE.tmClient),
    client: await s.actorFor(PEOPLE.clientLinked),
  };
  for (const [role, actor] of Object.entries(actors)) {
    assert.equal(evaluate(actor, { action: 'client.create' }).allowed, expected[role], `${role} client.create`);
  }
});

test('an internal client resource is internal, so the same record a Client may see in the portal is closed to them here', async () => {
  const s = await scenario();
  const portal = await loadClientResource(s.db, s.A, 'c_lawrence');
  const internal = await loadInternalClientResource(s.db, s.A, 'c_lawrence');
  assert.equal(portal.visibility, 'client');
  assert.equal(internal.visibility, 'internal');
  assert.deepEqual({ ...internal, visibility: 'client' }, portal, 'nothing else differs');

  const client = await s.actorFor(PEOPLE.clientLinked);
  assert.equal(evaluate(client, { action: 'client.view', resource: portal }).allowed, true, 'their own record, in the portal');
  const internalDecision = evaluate(client, { action: 'client.view', resource: internal });
  assert.equal(internalDecision.allowed, false);
  assert.equal(internalDecision.reason, 'visibility');
  assert.equal(internalDecision.outcome, 'not_found', 'and the refusal does not admit the record exists');

  // An internal role that reaches the client is unaffected.
  const tm = await s.actorFor(PEOPLE.tmClient);
  assert.equal(evaluate(tm, { action: 'client.view', resource: internal }).allowed, true);
  assert.equal(await loadInternalClientResource(s.db, s.A, 'c_b1'), null, 'and another workspace stays invisible');
});

// ── creating ─────────────────────────────────────────────────────────────

test('an Owner, an Admin, and a Project Manager can each create a client; a Team Member and a Client cannot', async () => {
  const s = await scenario();
  for (const email of [PEOPLE.owner, PEOPLE.admin, PEOPLE.pm]) {
    const r = await s.create(email, { ...GOOD, name: `Client of ${email}` });
    assert.equal(r.status, 201, `${email} may create (${JSON.stringify(r.json)})`);
    assert.ok(r.json.client.id);
  }
  for (const email of [PEOPLE.tmClient, PEOPLE.tmNone, PEOPLE.clientLinked, PEOPLE.clientUnlinked]) {
    const r = await s.create(email, GOOD);
    assert.equal(r.status, 403, `${email} may not create`);
    assert.deepEqual(r.json, { error: 'You do not have permission to do that.' }, 'and learns nothing from the refusal');
  }
  const anonymous = await s.create(null, GOOD);
  assert.equal(anonymous.status, 401);
  assert.equal(one(s.raw, "SELECT COUNT(*) AS n FROM bloomops_clients WHERE workspace_id = ?", s.A).n, 5, 'three created, two seeded');
});

test('a new client is always Draft and On Track, whatever the request asks for', async () => {
  const s = await scenario();
  const r = await s.create(PEOPLE.owner, { ...GOOD, relationshipStatus: 'active', health: 'at_risk', workspaceId: 'somewhere-else' });
  assert.equal(r.status, 201);
  const row = s.clientRow(r.json.client.id);
  assert.equal(row.relationship_status, 'draft', 'the browser does not choose a starting lifecycle');
  assert.equal(row.health, 'on_track');
  assert.equal(row.workspace_id, s.A, 'and it lands in the caller’s own workspace');
  assert.equal(row.end_date, null);
});

test('creating a client makes its primary contact, and invites nobody at all', async () => {
  const s = await scenario();
  // The address already belongs to somebody who can sign in, which is
  // exactly the case that must not become a link.
  run(s.raw, 'INSERT INTO user (id, name, email, email_verified) VALUES (?, ?, ?, 1)', 'u_existing', 'James Existing', 'james@example.com');
  const invitationsBefore = one(s.raw, 'SELECT COUNT(*) AS n FROM workspace_invitations').n;
  const membershipsBefore = one(s.raw, 'SELECT COUNT(*) AS n FROM workspace_memberships').n;
  const usersBefore = one(s.raw, 'SELECT COUNT(*) AS n FROM user').n;
  await s.cookieFor(PEOPLE.owner); // the Owner's own magic link, before the count that matters
  const mailBefore = s.mailer.sent.length;

  const r = await s.create(PEOPLE.owner, { name: 'James', contactName: 'James Existing', contactEmail: 'james@example.com' });
  assert.equal(r.status, 201);
  const id = r.json.client.id;

  const contacts = s.contactsOf(id);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, 'James Existing');
  assert.equal(contacts[0].email, 'james@example.com');
  assert.equal(contacts[0].is_primary, 1);
  assert.equal(contacts[0].user_id, null, 'a matching address is not a portal link');

  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM workspace_invitations').n, invitationsBefore, 'no invitation');
  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM workspace_memberships').n, membershipsBefore, 'no membership');
  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM user').n, usersBefore, 'no identity created');
  assert.equal(s.mailer.sent.length, mailBefore, 'no email sent');
  assert.ok(!s.mailer.sent.some((m) => JSON.stringify(m).includes('james@example.com')), 'and nothing was ever addressed to the contact');
  assert.deepEqual(s.eventTypes(id), [ACTIVITY.CLIENT_CREATED]);
});

test('the created client records who created it, and nothing about the request body', async () => {
  const s = await scenario();
  const r = await s.create(PEOPLE.pm, GOOD);
  const [event] = s.events(r.json.client.id);
  assert.equal(event.event_type, ACTIVITY.CLIENT_CREATED);
  assert.equal(event.workspace_id, s.A);
  assert.equal(event.client_id, r.json.client.id);
  assert.equal(event.subject_type, 'client');
  assert.equal(event.subject_id, r.json.client.id);
  assert.equal(event.actor_membership_id, 'm_pm');
  assert.equal(event.actor_user_id, 'u_pm');
  assert.deepEqual(JSON.parse(event.metadata_json), { name: 'Northwind Studio', ownerMembershipId: null });
});

test('duplicate names get their own workspace-unique slugs, and the same name in another agency is untouched', async () => {
  const s = await scenario();
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await s.create(PEOPLE.owner, { ...GOOD, name: 'Harbour & Co.', contactEmail: `harbour${i}@example.com` });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    ids.push(r.json.client.id);
  }
  const slugs = ids.map((id) => s.clientRow(id).slug);
  assert.deepEqual(slugs, ['harbour-co', 'harbour-co-2', 'harbour-co-3']);
  assert.equal(new Set(slugs).size, 3, 'and they are distinct');

  const inB = await s.create(PEOPLE.bOwner, { ...GOOD, name: 'Harbour & Co.' });
  assert.equal(inB.status, 201);
  assert.equal(s.clientRow(inB.json.client.id).slug, 'harbour-co', 'a slug is unique inside one workspace only');
  assert.equal(s.clientRow(inB.json.client.id).workspace_id, s.B);

  assert.equal(slugify('  '), 'client', 'a name with nothing sluggable still produces one');
  assert.equal(slugify('José & Co. — Marketing!'), 'jose-co-marketing');
});

test('creating refuses bad input field by field, and writes nothing when it does', async () => {
  const s = await scenario();
  const before = one(s.raw, 'SELECT COUNT(*) AS n FROM bloomops_clients').n;
  const eventsBefore = one(s.raw, 'SELECT COUNT(*) AS n FROM activity_events').n;

  const cases = [
    [{ contactName: 'A', contactEmail: 'a@example.com' }, 'name'],
    [{ name: '   ', contactName: 'A', contactEmail: 'a@example.com' }, 'name'],
    [{ name: 'x'.repeat(200), contactName: 'A', contactEmail: 'a@example.com' }, 'name'],
    [{ name: 'A', contactEmail: 'a@example.com' }, 'contactName'],
    [{ name: 'A', contactName: 'A' }, 'contactEmail'],
    [{ name: 'A', contactName: 'A', contactEmail: 'not-an-address' }, 'contactEmail'],
    [{ ...GOOD, website: 'javascript:alert(1)' }, 'website'],
    [{ ...GOOD, website: 'nodot' }, 'website'],
    [{ ...GOOD, timezone: 'Mars/Olympus' }, 'timezone'],
    [{ ...GOOD, timezone: 'nonsense' }, 'timezone'],
    [{ ...GOOD, startDate: '2026-02-30' }, 'startDate'],
    [{ ...GOOD, startDate: 'tomorrow' }, 'startDate'],
    [{ ...GOOD, ownerMembershipId: 'm_bOwner' }, 'ownerMembershipId'],
    [{ ...GOOD, ownerMembershipId: 'm_clientLinked' }, 'ownerMembershipId'],
    [{ ...GOOD, ownerMembershipId: 'nope' }, 'ownerMembershipId'],
  ];
  for (const [body, field] of cases) {
    const r = await s.create(PEOPLE.owner, body);
    assert.equal(r.status, 400, `${field}: ${JSON.stringify(body)}`);
    assert.ok(r.json.errors[field], `${field} is named in ${JSON.stringify(r.json.errors)}`);
  }
  const foreign = await s.create(PEOPLE.owner, { ...GOOD, ownerMembershipId: 'm_bOwner' });
  assert.deepEqual(Object.keys(foreign.json.errors), ['ownerMembershipId']);
  assert.match(foreign.json.errors.ownerMembershipId, /Choose an owner from the list\./, 'and says nothing about the other workspace');

  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM bloomops_clients').n, before, 'nothing was created');
  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM activity_events').n, eventsBefore, 'and a refusal records no history');
});

test('a website is completed and normalised, a time zone must be real, and a date must be a date', async () => {
  const s = await scenario();
  const r = await s.create(PEOPLE.owner, { ...GOOD, website: 'northwind.example/  ', timezone: 'Australia/Sydney', startDate: '2026-03-02' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const row = s.clientRow(r.json.client.id);
  assert.equal(row.website, 'https://northwind.example');
  assert.equal(row.timezone, 'Australia/Sydney');
  assert.equal(row.start_date, '2026-03-02');

  assert.deepEqual(validateWebsite('http://x.example/a/b'), { ok: true, value: 'http://x.example/a/b' });
  assert.equal(validateWebsite('mailto:a@b.example').ok, false);
  assert.equal(validateTimezone('').value, null, 'nothing is allowed');
  assert.equal(validateTimezone('UTC').ok, false, 'a zone without a region is not offered');
  assert.equal(validateDate('2025-02-29', 'the start date').ok, false, 'a day that does not exist');
  assert.ok(timezoneOptions().includes('Australia/Sydney'));
});

test('the owner picked at creation is stored, and only a candidate with workspace-wide reach may be picked', async () => {
  const s = await scenario();
  const candidates = await ownerCandidates(s.db, s.A);
  assert.deepEqual(candidates.map((c) => c.role).sort(), ['admin', 'owner', 'project_manager'], 'only the roles that already reach every client');
  assert.deepEqual(candidates.map((c) => c.name).sort(), ['Ary Admin', 'Ellen Owner', 'Priya Manel']);
  assert.equal(new Set(candidates.map((c) => c.id)).size, 3, 'each offered once');
  assert.ok(!candidates.some((c) => c.id === 'm_tmClient'), 'a Team Member is not offered for a client that does not exist yet');
  assert.ok(!candidates.some((c) => c.id === 'm_clientLinked'), 'a Client membership is never offered');

  const r = await s.create(PEOPLE.owner, { ...GOOD, ownerMembershipId: 'm_pm' });
  assert.equal(s.clientRow(r.json.client.id).owner_membership_id, 'm_pm');
  const [event] = s.events(r.json.client.id);
  assert.equal(JSON.parse(event.metadata_json).ownerMembershipId, 'm_pm');
});

test('a Team Member already assigned to a client stays selectable as that client’s owner', async () => {
  const s = await scenario();
  const forLawrence = await ownerCandidates(s.db, s.A, { clientId: 'c_lawrence' });
  assert.ok(forLawrence.some((c) => c.id === 'm_tmClient'), 'assigned to Lawrence, so offering them is not a trap');
  assert.ok(!forLawrence.some((c) => c.id === 'm_tmService'), 'assigned only to a service, so they cannot open the client');
  assert.ok(!forLawrence.some((c) => c.id === 'm_tmNone'));
  const forOther = await ownerCandidates(s.db, s.A, { clientId: 'c_other' });
  assert.ok(!forOther.some((c) => c.id === 'm_tmClient'), 'and only for the client they are on');
});

// ── the list ─────────────────────────────────────────────────────────────

test('the list offers All plus every lifecycle value, in lifecycle order', () => {
  assert.deepEqual(CLIENT_FILTERS.map((f) => f.key), ['all', ...CLIENT_STATUSES]);
  assert.deepEqual(CLIENT_FILTERS.map((f) => f.label), ['All', 'Draft', 'Onboarding', 'Active', 'Paused', 'Completed', 'Ended']);
  assert.deepEqual(CLIENT_STATUSES, ['draft', 'onboarding', 'active', 'paused', 'completed', 'ended']);
  assert.deepEqual(CLIENT_HEALTHS, ['on_track', 'needs_attention', 'at_risk']);
  assert.equal(normalizeFilter('active'), 'active');
  assert.equal(normalizeFilter('nonsense'), 'all', 'an invented filter falls back to All');
  assert.equal(normalizeFilter(undefined), 'all');
  assert.equal(normalizeFilter('constructor'), 'all', 'prototype names are not filters');
});

test('every lifecycle filter selects exactly its own clients, and the counts are the actor’s own', async () => {
  const s = await scenario();
  // One client at each lifecycle value, written directly because A6 moves
  // nothing out of Draft on purpose.
  const seeded = { draft: 1, onboarding: 1, active: 1, paused: 1, completed: 1, ended: 1 };
  let n = 0;
  for (const status of CLIENT_STATUSES) {
    n += 1;
    run(s.raw, `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) VALUES ('c_l${n}', ?, ?, ?, ?)`, s.A, `Life ${status}`, `life-${status}`, status);
  }
  const owner = await s.actorFor(PEOPLE.owner);
  const all7 = await listClients(s.db, owner, { filter: 'all' });
  assert.equal(all7.total, 8, 'six seeded lifecycles plus the two scenario clients');
  assert.equal(all7.counts.all, 8);
  assert.equal(all7.counts.active, 2, 'Lawrence is active too');
  assert.equal(all7.counts.paused, 2);

  for (const status of CLIENT_STATUSES) {
    const page = await listClients(s.db, owner, { filter: status });
    assert.ok(page.clients.length >= seeded[status], `${status} returns rows`);
    assert.ok(page.clients.every((c) => c.relationshipStatus === status), `${status} returns only ${status}`);
    assert.equal(page.filter, status);
  }
  const invented = await listClients(s.db, owner, { filter: 'archived' });
  assert.equal(invented.filter, 'all');
  assert.equal(invented.clients.length, 8);
});

test('the list is the actor’s scope, and no filter can widen it', async () => {
  const s = await scenario();
  const workspaceWide = ['owner', 'admin', 'pm'];
  for (const key of workspaceWide) {
    const actor = await s.actorFor(PEOPLE[key]);
    const page = await listClients(s.db, actor);
    assert.deepEqual(page.clients.map((c) => c.id).sort(), ['c_lawrence', 'c_other'], `${key} sees the workspace`);
  }

  const tmClient = await s.actorFor(PEOPLE.tmClient);
  const assigned = await listClients(s.db, tmClient);
  assert.deepEqual(assigned.clients.map((c) => c.id), ['c_lawrence'], 'a Team Member sees only what they are assigned to');
  assert.equal(assigned.counts.all, 1, 'and the counts are theirs, not the workspace’s');

  const tmService = await s.actorFor(PEOPLE.tmService);
  assert.deepEqual((await listClients(s.db, tmService)).clients, [], 'a service assignment does not add the client record');

  const tmNone = await s.actorFor(PEOPLE.tmNone);
  assert.deepEqual((await listClients(s.db, tmNone)).clients, []);

  for (const key of ['clientLinked', 'clientUnlinked']) {
    const actor = await s.actorFor(PEOPLE[key]);
    assert.deepEqual((await listClients(s.db, actor)).clients, [], `a Client membership reaches no internal list (${key})`);
  }

  // Every filter, for every scoped actor, stays inside the scope.
  for (const filter of CLIENT_FILTERS.map((f) => f.key)) {
    const page = await listClients(s.db, tmService, { filter });
    assert.deepEqual(page.clients, [], `${filter} does not widen a service-only assignment`);
    const one = await listClients(s.db, tmClient, { filter });
    assert.ok(one.clients.every((c) => c.id === 'c_lawrence'), `${filter} does not widen a client assignment`);
  }

  const bOwner = await s.actorFor(PEOPLE.bOwner, s.B);
  assert.deepEqual((await listClients(s.db, bOwner)).clients.map((c) => c.id), ['c_b1'], 'and another agency sees only its own');
});

test('a list row carries the operational context the screen shows and nothing internal beyond it', async () => {
  const s = await scenario();
  const r = await s.create(PEOPLE.owner, { ...GOOD, ownerMembershipId: 'm_pm', startDate: '2026-03-02' });
  const owner = await s.actorFor(PEOPLE.owner);
  const page = await listClients(s.db, owner);
  const row = page.clients.find((c) => c.id === r.json.client.id);
  assert.equal(row.name, 'Northwind Studio');
  assert.equal(row.relationshipStatus, 'draft');
  assert.equal(row.statusLabel, 'Draft');
  assert.equal(row.health, 'on_track');
  assert.equal(row.healthLabel, 'On Track');
  assert.equal(row.owner.name, 'Priya Manel');
  assert.equal(row.primaryContact.name, 'Rae Ellis');
  assert.equal(row.startDate, '2026-03-02');
  assert.equal(row.slug, undefined, 'the slug is internal plumbing, not a list column');
});

// ── the detail ───────────────────────────────────────────────────────────

test('a client that is hidden, in another workspace, or absent is not found in exactly the same way', async () => {
  const s = await scenario();
  const owner = await s.actorFor(PEOPLE.owner);
  assert.equal((await getClient(s.db, owner, 'c_lawrence')).name, 'Lawrence');
  assert.equal(await getClient(s.db, owner, 'c_b1'), null, 'another workspace');
  assert.equal(await getClient(s.db, owner, 'c_missing'), null, 'absent');

  const tm = await s.actorFor(PEOPLE.tmClient);
  assert.equal((await getClient(s.db, tm, 'c_lawrence')).id, 'c_lawrence', 'assigned');
  assert.equal(await getClient(s.db, tm, 'c_other'), null, 'unassigned, in the same workspace');
  assert.equal(await getClient(s.db, tm, 'c_missing'), null);

  for (const key of ['tmService', 'tmNone', 'clientLinked', 'clientUnlinked']) {
    const actor = await s.actorFor(PEOPLE[key]);
    assert.equal(await getClient(s.db, actor, 'c_lawrence'), null, `${key} does not reach the internal record`);
  }

  // Over HTTP the two refusals are byte for byte the same.
  const hidden = await s.patch(PEOPLE.tmClient, 'c_other', { name: 'x' });
  const missing = await s.patch(PEOPLE.tmClient, 'c_missing', { name: 'x' });
  const foreign = await s.patch(PEOPLE.owner, 'c_b1', { name: 'x' });
  assert.equal(hidden.status, 404);
  assert.equal(missing.status, 404);
  assert.equal(foreign.status, 404);
  assert.deepEqual(hidden.json, { error: 'Not found.' });
  assert.deepEqual(missing.json, hidden.json);
  assert.deepEqual(foreign.json, hidden.json);
});

test('a Client membership calling an internal client route directly is answered as if it did not exist', async () => {
  const s = await scenario();
  for (const email of [PEOPLE.clientLinked, PEOPLE.clientUnlinked]) {
    // c_lawrence is the linked Client's own client, which they may see in
    // the portal. The internal route is a different thing.
    const r = await s.patch(email, 'c_lawrence', { health: 'at_risk' });
    assert.equal(r.status, 404, `${email} patching their own client internally`);
    assert.deepEqual(r.json, { error: 'Not found.' });
    const contact = await s.addContact(email, 'c_lawrence', { name: 'Sneak' });
    assert.equal(contact.status, 404);
  }
  assert.equal(s.clientRow('c_lawrence').health, 'on_track', 'and nothing changed');
  assert.equal(s.contactsOf('c_lawrence').length, 1);
});

test('a Team Member assigned to a client may read it and may change nothing', async () => {
  const s = await scenario();
  const client = await getClient(s.db, await s.actorFor(PEOPLE.tmClient), 'c_lawrence');
  assert.equal(client.name, 'Lawrence');
  const resource = await loadInternalClientResource(s.db, s.A, 'c_lawrence');
  const tm = await s.actorFor(PEOPLE.tmClient);
  assert.equal(evaluate(tm, { action: 'client.view', resource }).allowed, true);
  assert.equal(evaluate(tm, { action: 'client.manage', resource }).allowed, false);

  const edit = await s.patch(PEOPLE.tmClient, 'c_lawrence', { name: 'Renamed' });
  assert.equal(edit.status, 403, 'the refusal is a plain forbidden, because they can see the record');
  assert.deepEqual(edit.json, { error: 'You do not have permission to do that.' });
  const contact = await s.addContact(PEOPLE.tmClient, 'c_lawrence', { name: 'Nope' });
  assert.equal(contact.status, 403);
  assert.equal(s.clientRow('c_lawrence').name, 'Lawrence');
});

// ── editing ──────────────────────────────────────────────────────────────

test('the identity fields update, and a no-op records nothing', async () => {
  const s = await scenario();
  const created = await s.create(PEOPLE.owner, GOOD);
  const id = created.json.client.id;

  const r = await s.patch(PEOPLE.owner, id, { name: 'Northwind', website: 'northwind.example', timezone: 'Europe/Lisbon', startDate: '2026-04-01' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const row = s.clientRow(id);
  assert.equal(row.name, 'Northwind');
  assert.equal(row.website, 'https://northwind.example');
  assert.equal(row.timezone, 'Europe/Lisbon');
  assert.equal(row.start_date, '2026-04-01');
  assert.deepEqual(s.eventTypes(id), [ACTIVITY.CLIENT_CREATED, ACTIVITY.CLIENT_DETAILS_UPDATED]);
  const detail = JSON.parse(s.events(id)[1].metadata_json);
  assert.deepEqual(Object.keys(detail.fields).sort(), ['name', 'startDate', 'timezone', 'website']);
  assert.equal(detail.fields.name.from, 'Northwind Studio');
  assert.equal(detail.fields.name.to, 'Northwind');

  const again = await s.patch(PEOPLE.owner, id, { name: 'Northwind', website: 'https://northwind.example' });
  assert.equal(again.status, 200);
  assert.equal(again.json.unchanged, true);
  assert.deepEqual(s.eventTypes(id), [ACTIVITY.CLIENT_CREATED, ACTIVITY.CLIENT_DETAILS_UPDATED], 'a request that changes nothing is not history');

  const empty = await s.patch(PEOPLE.owner, id, {});
  assert.equal(empty.json.unchanged, true);
  assert.equal(s.events(id).length, 2);
});

test('editing refuses what creating refuses, records nothing when it does, and keeps the end date after the start', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, { ...GOOD, startDate: '2026-04-01' })).json.client.id;
  const before = s.events(id).length;
  const cases = [
    [{ name: '' }, 'name'],
    [{ website: 'javascript:alert(1)' }, 'website'],
    [{ timezone: 'Mars/Olympus' }, 'timezone'],
    [{ startDate: 'soon' }, 'startDate'],
    [{ endDate: '2026-13-01' }, 'endDate'],
    [{ endDate: '2026-03-01' }, 'endDate'],
    [{ health: 'fine' }, 'health'],
    [{ ownerMembershipId: 'm_bOwner' }, 'ownerMembershipId'],
    [{ ownerMembershipId: 'm_tmNone' }, 'ownerMembershipId'],
    [{ ownerMembershipId: 'm_clientLinked' }, 'ownerMembershipId'],
  ];
  for (const [body, field] of cases) {
    const r = await s.patch(PEOPLE.owner, id, body);
    assert.equal(r.status, 400, `${field}: ${JSON.stringify(body)} -> ${JSON.stringify(r.json)}`);
    assert.ok(r.json.errors[field], `${field} named`);
  }
  assert.equal(s.events(id).length, before, 'a refused edit records no history');
  const good = await s.patch(PEOPLE.owner, id, { endDate: '2026-12-31' });
  assert.equal(good.status, 200);
  assert.equal(s.clientRow(id).end_date, '2026-12-31');
});

// ── health, and its independence from lifecycle ──────────────────────────

test('health moves through its three values and never touches the lifecycle', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  assert.equal(s.clientRow(id).health, 'on_track');
  assert.equal(s.clientRow(id).relationship_status, 'draft');

  for (const [from, to] of [['on_track', 'needs_attention'], ['needs_attention', 'at_risk'], ['at_risk', 'on_track']]) {
    const r = await s.patch(PEOPLE.owner, id, { health: to });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(s.clientRow(id).health, to);
    assert.equal(s.clientRow(id).relationship_status, 'draft', `${from} -> ${to} left the lifecycle alone`);
    const last = s.events(id).at(-1);
    assert.equal(last.event_type, ACTIVITY.CLIENT_HEALTH_CHANGED);
    assert.deepEqual(JSON.parse(last.metadata_json), { from, to });
  }
  const same = await s.patch(PEOPLE.owner, id, { health: 'on_track' });
  assert.equal(same.json.unchanged, true);
  assert.equal(s.eventTypes(id).filter((e) => e === ACTIVITY.CLIENT_HEALTH_CHANGED).length, 3, 'setting the health it already has is not a change');

  // And the other way: a lifecycle that was set outside A6 is not disturbed
  // by a health change.
  assert.equal(s.clientRow('c_lawrence').relationship_status, 'active');
  await s.patch(PEOPLE.owner, 'c_lawrence', { health: 'at_risk' });
  assert.equal(s.clientRow('c_lawrence').relationship_status, 'active');
  assert.equal(s.clientRow('c_lawrence').health, 'at_risk');
});

test('A6 does not implement activation: the lifecycle cannot be written through any client route', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const before = s.events(id).length;

  for (const status of CLIENT_STATUSES) {
    const r = await s.patch(PEOPLE.owner, id, { relationshipStatus: status });
    assert.equal(r.status, 400, `relationshipStatus=${status} is refused`);
    assert.equal(r.json.reason, 'status_not_editable');
    assert.match(r.json.error, /activation/i);
    assert.equal(s.clientRow(id).relationship_status, 'draft');
  }
  // Even smuggled beside a legitimate field.
  const smuggled = await s.patch(PEOPLE.owner, id, { name: 'Renamed', relationshipStatus: 'active' });
  assert.equal(smuggled.status, 400);
  assert.equal(s.clientRow(id).name, 'Northwind Studio', 'and the legitimate field did not slip through either');
  assert.equal(s.clientRow(id).relationship_status, 'draft');

  assert.equal(s.events(id).length, before, 'a refused lifecycle write records nothing');
  assert.equal(one(s.raw, "SELECT COUNT(*) AS n FROM activity_events WHERE event_type='CLIENT_ACTIVATED'").n, 0, 'A6 editing emits no activation event');
  assert.ok(!Object.keys(ACTIVITY).includes('CLIENT_STATUS_CHANGED'), 'the lifecycle event belongs to the phase that moves the lifecycle');

  // Nothing that A9 owns was created as a side effect of anything A6 did.
  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM onboarding_instances').n, 0);
  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM service_engagements WHERE client_id = ?', id).n, 0);
  assert.equal(one(s.raw, 'SELECT COUNT(*) AS n FROM workspace_invitations').n, 0);

  // Activation has its own A9 action; ordinary A6 editing still refuses it.
  // The create route does not read a lifecycle at all; the edit route
  // forwards one on purpose, so the domain layer refuses it out loud
  // instead of dropping it silently (proved by the 400s above).
  const createRouteSource = src('app/api/bloomops/clients/route.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/relationshipStatus|health/.test(createRouteSource), 'creating reads no lifecycle and no health from a body');
  assert.match(src('lib/bloomops/clients.mjs'), /status_not_editable/, 'and the domain layer is where the refusal lives');
});

// ── the owner ────────────────────────────────────────────────────────────

test('the owner can be set, changed, and cleared, and each change is one line of history', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;

  await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_pm' });
  let last = s.events(id).at(-1);
  assert.equal(last.event_type, ACTIVITY.CLIENT_OWNER_CHANGED);
  assert.deepEqual(JSON.parse(last.metadata_json), { from: null, to: 'm_pm', fromName: null, toName: 'Priya Manel' });

  const same = await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_pm' });
  assert.equal(same.json.unchanged, true, 'setting the owner it already has is not a change');

  await s.patch(PEOPLE.owner, id, { ownerMembershipId: s.ownerA.id });
  last = s.events(id).at(-1);
  assert.equal(JSON.parse(last.metadata_json).fromName, 'Priya Manel');
  assert.equal(JSON.parse(last.metadata_json).toName, 'Ellen Owner');

  await s.patch(PEOPLE.owner, id, { ownerMembershipId: '' });
  assert.equal(s.clientRow(id).owner_membership_id, null);
  assert.equal(JSON.parse(s.events(id).at(-1).metadata_json).to, null);
  assert.deepEqual(s.eventTypes(id).filter((e) => e === ACTIVITY.CLIENT_OWNER_CHANGED).length, 3);
});

test('owning a client is responsibility, not access: it grants no scope and writes no assignment', async () => {
  const s = await scenario();
  const assignmentsBefore = all(s.raw, 'SELECT * FROM client_assignments');
  const id = (await s.create(PEOPLE.owner, { ...GOOD, ownerMembershipId: 'm_pm' })).json.client.id;
  await s.patch(PEOPLE.owner, 'c_other', { ownerMembershipId: 'm_pm' });
  assert.deepEqual(all(s.raw, 'SELECT * FROM client_assignments'), assignmentsBefore, 'naming an owner creates no client_assignments row');

  // The Team Member on Lawrence becomes Lawrence's owner. Their reach does
  // not change, because it never came from ownership.
  await s.patch(PEOPLE.owner, 'c_lawrence', { ownerMembershipId: 'm_tmClient' });
  assert.equal(s.clientRow('c_lawrence').owner_membership_id, 'm_tmClient');
  const tm = await s.actorFor(PEOPLE.tmClient);
  assert.deepEqual([...tm.scope.clientIds], ['c_lawrence'], 'still only the client they are assigned to');
  assert.equal(await getClient(s.db, tm, id), null, 'a client they own nothing of stays out of reach');
  assert.equal(evaluate(tm, { action: 'client.manage', resource: await loadInternalClientResource(s.db, s.A, 'c_lawrence') }).allowed, false, 'and owning it does not let them manage it');
  assert.equal((await s.patch(PEOPLE.tmClient, 'c_lawrence', { health: 'at_risk' })).status, 403);
});

test('an owner who leaves the workspace is kept on the record rather than silently dropped', async () => {
  const s = await scenario();
  await s.patch(PEOPLE.owner, 'c_other', { ownerMembershipId: 'm_pm' });
  run(s.raw, "UPDATE workspace_memberships SET status = 'suspended' WHERE id = 'm_pm'");
  const client = await getClient(s.db, await s.actorFor(PEOPLE.owner), 'c_other');
  assert.equal(client.owner.membershipId, 'm_pm');
  assert.equal(client.owner.name, 'Priya Manel');
  assert.equal(client.owner.active, false, 'and the screen can say so');
  assert.equal(s.clientRow('c_other').owner_membership_id, 'm_pm', 'nothing reassigned it');
  // They are no longer offered for a new assignment.
  assert.ok(!(await ownerCandidates(s.db, s.A)).some((c) => c.id === 'm_pm'));
});

// An owner who was valid when they were assigned may stop qualifying as a
// *new* owner: suspended, removed, or a Team Member whose client assignment
// went away. A6 keeps them on the record rather than silently dropping them
// (getClient returns them with active: false, and the edit form keeps them
// in its list), so the server has to accept the stored value coming back
// unchanged. Validating it as a fresh assignment would make every unrelated
// edit fail with "Choose an owner from the list."

test('keeping a suspended owner does not block an unrelated edit', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  assert.equal((await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_pm' })).status, 200);
  assert.equal(s.clientRow(id).owner_membership_id, 'm_pm');

  run(s.raw, "UPDATE workspace_memberships SET status = 'suspended' WHERE id = 'm_pm'");
  const client = await getClient(s.db, await s.actorFor(PEOPLE.owner), id);
  assert.equal(client.owner.membershipId, 'm_pm', 'still on the record');
  assert.equal(client.owner.active, false, 'and shown as no longer active');
  assert.ok(!(await ownerCandidates(s.db, s.A, { clientId: id })).some((c) => c.id === 'm_pm'), 'and no longer a candidate for a new assignment');

  const eventsBefore = s.eventTypes(id).length;
  // Exactly what the edit form sends: every field, owner included, unchanged.
  const r = await s.patch(PEOPLE.owner, id, {
    name: 'Northwind',
    website: 'northwind.example',
    timezone: '',
    startDate: '2026-05-01',
    endDate: '',
    ownerMembershipId: 'm_pm',
  });
  assert.equal(r.status, 200, `the unrelated edit succeeds (${JSON.stringify(r.json)})`);
  assert.equal(s.clientRow(id).name, 'Northwind');
  assert.equal(s.clientRow(id).website, 'https://northwind.example');
  assert.equal(s.clientRow(id).start_date, '2026-05-01');
  assert.equal(s.clientRow(id).owner_membership_id, 'm_pm', 'the owner is untouched');

  const added = s.eventTypes(id).slice(eventsBefore);
  assert.deepEqual(added, [ACTIVITY.CLIENT_DETAILS_UPDATED], 'one event, for the details that actually changed');
  assert.deepEqual(Object.keys(JSON.parse(s.events(id).at(-1).metadata_json).fields).sort(), ['name', 'startDate', 'website']);

  // And an edit that names only the unchanged owner is a plain no-op.
  const only = await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_pm' });
  assert.equal(only.status, 200);
  assert.equal(only.json.unchanged, true);
  assert.equal(s.eventTypes(id).length, eventsBefore + 1, 'and records nothing');
});

test('keeping a Team Member owner whose client assignment went away does not block an unrelated edit', async () => {
  const s = await scenario();
  // Assigned to Lawrence, so eligible to own it.
  assert.ok((await ownerCandidates(s.db, s.A, { clientId: 'c_lawrence' })).some((c) => c.id === 'm_tmClient'));
  assert.equal((await s.patch(PEOPLE.owner, 'c_lawrence', { ownerMembershipId: 'm_tmClient' })).status, 200);
  assert.equal(s.clientRow('c_lawrence').owner_membership_id, 'm_tmClient');

  run(s.raw, "DELETE FROM client_assignments WHERE client_id = 'c_lawrence' AND membership_id = 'm_tmClient'");
  assert.ok(!(await ownerCandidates(s.db, s.A, { clientId: 'c_lawrence' })).some((c) => c.id === 'm_tmClient'), 'no longer a candidate for a new assignment');

  const eventsBefore = s.eventTypes('c_lawrence').length;
  const r = await s.patch(PEOPLE.owner, 'c_lawrence', { website: 'lawrence.example', ownerMembershipId: 'm_tmClient' });
  assert.equal(r.status, 200, `the unrelated edit succeeds (${JSON.stringify(r.json)})`);
  assert.equal(s.clientRow('c_lawrence').website, 'https://lawrence.example');
  assert.equal(s.clientRow('c_lawrence').owner_membership_id, 'm_tmClient', 'the owner is untouched');
  assert.deepEqual(s.eventTypes('c_lawrence').slice(eventsBefore), [ACTIVITY.CLIENT_DETAILS_UPDATED]);

  // Ownership is not scope: losing the assignment lost the access, and
  // still owning the client did not give any of it back.
  const tm = await s.actorFor(PEOPLE.tmClient);
  assert.deepEqual([...tm.scope.clientIds], [], 'no client scope remains');
  assert.equal(await getClient(s.db, tm, 'c_lawrence'), null, 'the client they own is out of reach');
  assert.equal((await s.patch(PEOPLE.tmClient, 'c_lawrence', { health: 'at_risk' })).status, 404, 'and answered as if it did not exist');
});

test('an actual owner change to an ineligible membership is still refused', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  assert.equal((await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_pm' })).status, 200);
  const eventsBefore = s.eventTypes(id).length;

  run(s.raw, "UPDATE workspace_memberships SET status = 'suspended' WHERE id = 'm_tmClient'");
  run(s.raw, "UPDATE workspace_memberships SET status = 'removed' WHERE id = 'm_tmService'");
  // An Admin who is suspended: a workspace-wide role is not a free pass.
  run(s.raw, "UPDATE workspace_memberships SET status = 'suspended' WHERE id = 'm_admin'");

  const refused = [
    ['a suspended Admin', 'm_admin'],
    ['a suspended Team Member', 'm_tmClient'],
    ['a removed Team Member', 'm_tmService'],
    ['a Client membership', 'm_clientLinked'],
    ['an unlinked Client membership', 'm_clientUnlinked'],
    ['a Team Member with no client scope', 'm_tmNone'],
    ['a membership in another workspace', 'm_bOwner'],
    ['an invented id', 'not-a-membership'],
  ];
  for (const [what, membershipId] of refused) {
    const r = await s.patch(PEOPLE.owner, id, { ownerMembershipId: membershipId });
    assert.equal(r.status, 400, `${what} is refused as a new owner`);
    assert.equal(r.json.errors.ownerMembershipId, 'Choose an owner from the list.', `${what} says nothing more`);
    assert.equal(s.clientRow(id).owner_membership_id, 'm_pm', `${what} left the owner alone`);
  }
  // A Team Member assigned to a different client is still not a candidate here.
  run(s.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) VALUES (?, 'c_other', 'm_tmNone', 'member')", s.A);
  const elsewhere = await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_tmNone' });
  assert.equal(elsewhere.status, 400, 'an assignment to another client does not qualify them for this one');

  assert.equal(s.eventTypes(id).length, eventsBefore, 'and no refusal was recorded as history');
  // The escape hatch is only for the value already stored, and only for it.
  assert.equal((await s.patch(PEOPLE.owner, id, { ownerMembershipId: 'm_pm', name: 'Still fine' })).status, 200);
  assert.equal(s.clientRow(id).name, 'Still fine');
});

// ── contacts ─────────────────────────────────────────────────────────────

test('a client holds several contacts; adding, editing, and removing each records one event', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;

  const added = await s.addContact(PEOPLE.owner, id, { name: 'Sam Oyelaran', email: 'SAM@example.com', phone: '+61 2 5550 0100', title: 'Marketing lead' });
  assert.equal(added.status, 201, JSON.stringify(added.json));
  const samId = added.json.contact.id;
  let contacts = await listContacts(s.db, s.A, id);
  assert.equal(contacts.length, 2);
  const sam = contacts.find((c) => c.id === samId);
  assert.equal(sam.email, 'sam@example.com', 'the address is stored one way');
  assert.equal(sam.title, 'Marketing lead');
  assert.equal(sam.isPrimary, false);
  assert.equal(sam.linked, false);

  const edited = await s.patchContact(PEOPLE.owner, id, samId, { title: 'Head of marketing', phone: '' });
  assert.equal(edited.status, 200);
  contacts = await listContacts(s.db, s.A, id);
  assert.equal(contacts.find((c) => c.id === samId).title, 'Head of marketing');
  assert.equal(contacts.find((c) => c.id === samId).phone, null);

  const noop = await s.patchContact(PEOPLE.owner, id, samId, { title: 'Head of marketing' });
  assert.equal(noop.json.unchanged, true);

  const removed = await s.removeContact(PEOPLE.owner, id, samId);
  assert.equal(removed.status, 200);
  assert.equal((await listContacts(s.db, s.A, id)).length, 1);

  assert.deepEqual(s.eventTypes(id), [
    ACTIVITY.CLIENT_CREATED,
    ACTIVITY.CLIENT_CONTACT_ADDED,
    ACTIVITY.CLIENT_CONTACT_UPDATED,
    ACTIVITY.CLIENT_CONTACT_REMOVED,
  ], 'one event per real change and none for the no-op');
});

test('at most one contact is primary, switching moves the marker, and a client may have none', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const first = s.contactsOf(id)[0].id;
  const second = (await s.addContact(PEOPLE.owner, id, { name: 'Sam', email: 'sam@example.com' })).json.contact.id;
  const third = (await s.addContact(PEOPLE.owner, id, { name: 'Kit', email: 'kit@example.com', isPrimary: true })).json.contact.id;

  const primaries = () => s.contactsOf(id).filter((c) => c.is_primary === 1).map((c) => c.id);
  assert.deepEqual(primaries(), [third], 'adding a primary took the marker');

  assert.equal((await s.patchContact(PEOPLE.owner, id, second, { isPrimary: true })).status, 200);
  assert.deepEqual(primaries(), [second], 'switching moved it, and only one holds it');

  assert.equal((await s.patchContact(PEOPLE.owner, id, second, { isPrimary: false })).status, 200);
  assert.deepEqual(primaries(), [], 'standing down is allowed and promotes nobody');

  assert.equal((await s.patchContact(PEOPLE.owner, id, first, { isPrimary: true })).status, 200);
  assert.deepEqual(primaries(), [first]);

  const listed = await listContacts(s.db, s.A, id);
  assert.equal(listed[0].id, first, 'and the primary reads first');

  const primaryEvents = s.eventTypes(id).filter((e) => e === ACTIVITY.CLIENT_PRIMARY_CONTACT_CHANGED);
  assert.equal(primaryEvents.length, 4);
});

test('the database itself refuses two primary contacts, even with the domain layer bypassed', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const first = s.contactsOf(id)[0].id;
  assert.equal(s.contactsOf(id).find((c) => c.id === first).is_primary, 1);

  // A raw INSERT of a second primary, the way a future caller that forgot
  // the invariant would write it.
  assert.throws(
    () => run(s.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, is_primary) VALUES ('cc_two', ?, ?, 'Second Primary', 'second@example.com', 1)", s.A, id),
    /UNIQUE constraint failed/,
  );
  // And a raw UPDATE promoting an existing contact without demoting the
  // other, the sequence that a naive two-statement switch would produce.
  run(s.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, is_primary) VALUES ('cc_two', ?, ?, 'Second', 'second@example.com', 0)", s.A, id);
  assert.throws(() => run(s.raw, "UPDATE client_contacts SET is_primary = 1 WHERE id = 'cc_two'"), /UNIQUE constraint failed/);
  assert.equal(s.contactsOf(id).filter((c) => c.is_primary === 1).length, 1);

  // Two clients may each have their own primary; the index is per client.
  const other = (await s.create(PEOPLE.owner, { ...GOOD, name: 'Second Client', contactEmail: 'other@example.com' })).json.client.id;
  assert.equal(s.contactsOf(other).filter((c) => c.is_primary === 1).length, 1);

  // The index is on the migrations, so a fresh database has it.
  assert.match(src('drizzle/0003_a6_primary_contact.sql'), /CREATE UNIQUE INDEX `client_contacts_primary_uq` ON `client_contacts` \(`client_id`\) WHERE is_primary = 1/);
  assert.ok(one(s.raw, "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'client_contacts_primary_uq'"));
});

test('one address per client, the same address on another client is fine, and the refusal is readable', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const other = (await s.create(PEOPLE.owner, { ...GOOD, name: 'Second Client', contactEmail: 'other@example.com' })).json.client.id;

  const duplicate = await s.addContact(PEOPLE.owner, id, { name: 'Rae Again', email: 'rae@example.com' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.json.reason, 'duplicate_email');
  assert.match(duplicate.json.errors.email, /already uses that address/);
  assert.equal(s.contactsOf(id).length, 1, 'and nothing was written');

  const elsewhere = await s.addContact(PEOPLE.owner, other, { name: 'Rae Ellis', email: 'rae@example.com' });
  assert.equal(elsewhere.status, 201, 'the same person may be a contact at two clients');

  // Several contacts with no address at all are fine: the unique index is
  // partial.
  assert.equal((await s.addContact(PEOPLE.owner, id, { name: 'No Address One' })).status, 201);
  assert.equal((await s.addContact(PEOPLE.owner, id, { name: 'No Address Two' })).status, 201);

  const sam = (await s.addContact(PEOPLE.owner, id, { name: 'Sam', email: 'sam@example.com' })).json.contact.id;
  const collide = await s.patchContact(PEOPLE.owner, id, sam, { email: 'rae@example.com' });
  assert.equal(collide.status, 409);
  assert.equal((await listContacts(s.db, s.A, id)).find((c) => c.id === sam).email, 'sam@example.com');
});

test('a contact of another client cannot be reached or changed through this client’s route', async () => {
  const s = await scenario();
  const a = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const b = (await s.create(PEOPLE.owner, { ...GOOD, name: 'Other', contactEmail: 'other@example.com' })).json.client.id;
  const bContact = s.contactsOf(b)[0].id;

  const cross = await s.patchContact(PEOPLE.owner, a, bContact, { name: 'Hijacked' });
  assert.equal(cross.status, 404);
  assert.deepEqual(cross.json, { error: 'Not found.' });
  assert.equal(s.contactsOf(b)[0].name, 'Rae Ellis', 'and nothing moved');

  const crossDelete = await s.removeContact(PEOPLE.owner, a, bContact);
  assert.equal(crossDelete.status, 404);
  assert.equal(s.contactsOf(b).length, 1);

  const invented = await s.patchContact(PEOPLE.owner, a, 'nope', { name: 'x' });
  assert.equal(invented.status, 404);
  assert.deepEqual(invented.json, cross.json, 'the wrong client and the wrong id read the same');

  // And a contact of another workspace's client is not reachable at all.
  const foreign = await s.patchContact(PEOPLE.owner, 'c_b1', 'anything', { name: 'x' });
  assert.equal(foreign.status, 404);
});

test('the portal link is never written, never requested, and never inferred from an address', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;

  // A request that names the link, in every spelling a caller might try.
  const sneaky = await s.addContact(PEOPLE.owner, id, {
    name: 'Sneaky',
    email: PEOPLE.clientLinked,
    userId: 'u_clientLinked',
    user_id: 'u_clientLinked',
    isPrimary: false,
  });
  assert.equal(sneaky.status, 201);
  const contact = s.contactsOf(id).find((c) => c.name === 'Sneaky');
  assert.equal(contact.user_id, null, 'even though the address belongs to a real portal user');

  const patched = await s.patchContact(PEOPLE.owner, id, contact.id, { userId: 'u_clientLinked', user_id: 'u_clientLinked', name: 'Sneaky Two' });
  assert.equal(patched.status, 200);
  assert.equal(s.contactsOf(id).find((c) => c.id === contact.id).user_id, null);

  // And the linked Client's scope is unchanged: nothing here gave them
  // another client.
  const linked = await s.actorFor(PEOPLE.clientLinked);
  assert.deepEqual([...linked.scope.clientIds], ['c_lawrence']);

  // The routes never name it.
  for (const path of ['app/api/bloomops/clients/[id]/contacts/route.js', 'app/api/bloomops/clients/[id]/contacts/[contactId]/route.js']) {
    const body = src(path).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/pick\(body, \[[^\]]*user/i.test(body), `${path} does not read a user id from a body`);
  }
  const domain = src('lib/bloomops/client-contacts.mjs').replace(/^\s*\/\/.*$/gm, '');
  const written = domain.match(/userId: (?!c\.userId)[^,\n]+/g) || [];
  assert.deepEqual(written, ['userId: null'], 'the domain layer writes the portal link exactly once, as null');
  assert.ok(!/\.set\(\{[^}]*userId/.test(domain), 'and no update ever sets it');
  // Column references in joins (userId: schema.user.id) are reads; a write
  // is a literal in a values() or set() object.
  const clientsDomain = src('lib/bloomops/clients.mjs').replace(/^\s*\/\/.*$/gm, '');
  assert.deepEqual(clientsDomain.match(/userId: (?!schema\.)[^,\n]+/g), ['userId: null'], 'creating a client writes the portal link only as null');
  assert.ok(!/\.set\(\{[^}]*userId/.test(clientsDomain), 'and no update in the client domain sets it');
});

test('a contact who can sign in to the portal cannot be removed or stripped of their address here', async () => {
  const s = await scenario();
  // Lawrence's contact is the linked Client.
  const removed = await s.removeContact(PEOPLE.owner, 'c_lawrence', 'cc_lawrence');
  assert.equal(removed.status, 409);
  assert.equal(removed.json.reason, 'linked');
  assert.match(removed.json.error, /client portal/);
  assert.equal(s.contactsOf('c_lawrence').length, 1, 'the contact is still there');
  assert.equal(one(s.raw, "SELECT user_id FROM client_contacts WHERE id = 'cc_lawrence'").user_id, 'u_clientLinked', 'and still linked');

  const cleared = await s.patchContact(PEOPLE.owner, 'c_lawrence', 'cc_lawrence', { email: '' });
  assert.equal(cleared.status, 400);
  assert.match(cleared.json.errors.email, /client portal/);
  assert.equal(one(s.raw, "SELECT email FROM client_contacts WHERE id = 'cc_lawrence'").email, PEOPLE.clientLinked);

  // Ordinary editing of a linked contact is allowed: none of it touches
  // the link.
  const renamed = await s.patchContact(PEOPLE.owner, 'c_lawrence', 'cc_lawrence', { name: 'Rae Ellis-Ward', title: 'Director', email: 'rae.ward@example.com' });
  assert.equal(renamed.status, 200);
  const row = one(s.raw, "SELECT * FROM client_contacts WHERE id = 'cc_lawrence'");
  assert.equal(row.name, 'Rae Ellis-Ward');
  assert.equal(row.email, 'rae.ward@example.com');
  assert.equal(row.user_id, 'u_clientLinked', 'the link survived the edit');

  // The Client's own scope is unchanged throughout.
  const linked = await s.actorFor(PEOPLE.clientLinked);
  assert.deepEqual([...linked.scope.clientIds], ['c_lawrence']);
  assert.deepEqual((await listContacts(s.db, s.A, 'c_lawrence'))[0].linked, true, 'and the screen can show that they can sign in');
});

test('contact input is validated on the server whatever the browser did', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const cases = [
    [{ email: 'a@example.com' }, 'name'],
    [{ name: '  ' }, 'name'],
    [{ name: 'x'.repeat(200) }, 'name'],
    [{ name: 'A', email: 'not-an-address' }, 'email'],
    [{ name: 'A', phone: 'x'.repeat(60) }, 'phone'],
    [{ name: 'A', title: 'x'.repeat(200) }, 'title'],
  ];
  for (const [body, field] of cases) {
    const r = await s.addContact(PEOPLE.owner, id, body);
    assert.equal(r.status, 400, `${field}: ${JSON.stringify(body)}`);
    assert.ok(r.json.errors[field]);
  }
  assert.equal(s.contactsOf(id).length, 1);
  assert.deepEqual(s.eventTypes(id), [ACTIVITY.CLIENT_CREATED], 'refusals are not history');
});

// ── activity ─────────────────────────────────────────────────────────────

test('activity is the append-only table, in words, scoped to one client of one workspace', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.pm, { ...GOOD, ownerMembershipId: 'm_pm' })).json.client.id;
  await s.patch(PEOPLE.owner, id, { health: 'needs_attention' });
  await s.patch(PEOPLE.owner, id, { name: 'Northwind', website: 'northwind.example' });
  const contactId = (await s.addContact(PEOPLE.owner, id, { name: 'Sam', email: 'sam@example.com', isPrimary: true })).json.contact.id;

  const feed = await clientActivity(s.db, s.A, id);
  assert.deepEqual(
    feed.map((e) => e.title),
    ['Primary contact changed', 'Contact added', 'Details updated', 'Health changed', 'Client created'],
    'newest first, and two events from one request read in the order they happened',
  );
  assert.equal(feed[0].detail, 'Sam is now the primary contact.');
  assert.equal(feed[2].detail, 'Changed name and website.');
  assert.equal(feed[3].detail, 'From On Track to Needs Attention.');
  assert.equal(feed[4].actor, 'Priya Manel', 'the actor is a name');
  assert.equal(feed[0].actor, 'Ellen Owner');
  for (const event of feed) {
    assert.ok(!/[A-Z_]{6,}/.test(`${event.title} ${event.detail || ''}`), `no event code reaches the screen: ${event.title}`);
    assert.ok(!/[{}]/.test(`${event.title} ${event.detail || ''}`), 'and no raw metadata');
    assert.equal(event.eventType, undefined);
    assert.equal(event.metadataJson, undefined);
  }

  // Another workspace's history is not reachable, whatever id is handed in.
  assert.deepEqual(await clientActivity(s.db, s.B, id), [], 'the wrong workspace sees nothing');
  const bId = (await s.create(PEOPLE.bOwner, GOOD)).json.client.id;
  assert.deepEqual(await clientActivity(s.db, s.A, bId), []);
  assert.equal((await clientActivity(s.db, s.B, bId)).length, 1, 'and its own agency sees its own');
  assert.deepEqual(await clientActivity(s.db, s.A, null), []);

  // The removal of a contact keeps its history.
  await s.removeContact(PEOPLE.owner, id, contactId);
  const after = await clientActivity(s.db, s.A, id);
  assert.equal(after[0].title, 'Contact removed');
  assert.equal(after[0].detail, 'Sam was removed.');
  assert.equal(after.length, 6);
});

test('recorded activity cannot be changed or deleted, and A6 added no second history table', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const [event] = s.events(id);
  assert.throws(() => run(s.raw, "UPDATE activity_events SET event_type = 'TAMPERED' WHERE id = ?", event.id), /append-only|immutable|abort/i);
  assert.throws(() => run(s.raw, 'DELETE FROM activity_events WHERE id = ?', event.id), /append-only|immutable|abort/i);
  assert.equal(s.events(id).length, 1);
  assert.equal(s.events(id)[0].event_type, ACTIVITY.CLIENT_CREATED);

  const tables = all(s.raw, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);
  for (const forbidden of ['client_history', 'audit_log', 'client_events_v2', 'client_activity']) {
    assert.ok(!tables.includes(forbidden), `${forbidden} was not created`);
  }
  // Every A6 event goes through the one vocabulary.
  const recorded = all(s.raw, 'SELECT DISTINCT event_type FROM activity_events').map((r) => r.event_type);
  for (const type of recorded) assert.ok(ACTIVITY[type], `${type} is a known event`);
});

test('every A6 event renders as a sentence, and an unknown one still says something human', () => {
  const A6 = [
    'CLIENT_CREATED',
    'CLIENT_DETAILS_UPDATED',
    'CLIENT_OWNER_CHANGED',
    'CLIENT_HEALTH_CHANGED',
    'CLIENT_CONTACT_ADDED',
    'CLIENT_CONTACT_UPDATED',
    'CLIENT_CONTACT_REMOVED',
    'CLIENT_PRIMARY_CONTACT_CHANGED',
  ];
  for (const type of A6) {
    assert.ok(ACTIVITY[type], `${type} is in the vocabulary`);
    const { title, detail } = describeEvent(type, {});
    assert.ok(title && !/_/.test(title), `${type} -> ${title}`);
    assert.ok(detail === null || typeof detail === 'string');
  }
  assert.equal(describeEvent('CLIENT_HEALTH_CHANGED', { from: 'on_track', to: 'at_risk' }).detail, 'From On Track to At Risk.');
  assert.equal(describeEvent('CLIENT_HEALTH_CHANGED', { to: 'at_risk' }).detail, 'Set to At Risk.');
  assert.equal(describeEvent('CLIENT_OWNER_CHANGED', { toName: 'Priya Manel' }).title, 'Owner set');
  assert.equal(describeEvent('CLIENT_OWNER_CHANGED', { fromName: 'Priya Manel' }).title, 'Owner removed');
  assert.equal(describeEvent('CLIENT_PRIMARY_CONTACT_CHANGED', { name: 'Sam', cleared: true }).title, 'Primary contact cleared');
  assert.equal(describeEvent('CLIENT_DETAILS_UPDATED', { fields: { name: {}, website: {}, timezone: {} } }).detail, 'Changed name, website, and time zone.');
  assert.equal(describeEvent('SOMETHING_NEW', {}).title, 'Client updated');
});

// ── origin ───────────────────────────────────────────────────────────────

test('every state-changing client route refuses a cross-site call and accepts a same-origin one', async () => {
  const s = await scenario();
  const id = (await s.create(PEOPLE.owner, GOOD)).json.client.id;
  const contactId = s.contactsOf(id)[0].id;
  const evil = 'https://evil.example';

  const calls = [
    ['create', () => s.call(PEOPLE.owner, '/api/bloomops/clients', { body: { ...GOOD, name: 'X', contactEmail: 'x@example.com' }, origin: evil })],
    ['edit', () => s.call(PEOPLE.owner, `/api/bloomops/clients/${id}`, { method: 'PATCH', body: { name: 'X' }, origin: evil, params: { id } })],
    ['add contact', () => s.call(PEOPLE.owner, `/api/bloomops/clients/${id}/contacts`, { body: { name: 'X' }, origin: evil, params: { id } })],
    ['edit contact', () => s.call(PEOPLE.owner, `/api/bloomops/clients/${id}/contacts/${contactId}`, { method: 'PATCH', body: { name: 'X' }, origin: evil, params: { id, contactId } })],
    ['remove contact', () => s.call(PEOPLE.owner, `/api/bloomops/clients/${id}/contacts/${contactId}`, { method: 'DELETE', origin: evil, params: { id, contactId } })],
  ];
  for (const [what, run] of calls) {
    const r = await run();
    assert.equal(r.status, 403, `${what} from another site`);
    assert.deepEqual(r.json, { error: 'Cross-site request refused.' });
  }
  assert.equal(s.clientRow(id).name, 'Northwind Studio');
  assert.equal(s.contactsOf(id).length, 1);
  assert.deepEqual(s.eventTypes(id), [ACTIVITY.CLIENT_CREATED], 'and a refused origin is not history');

  assert.equal((await s.patch(PEOPLE.owner, id, { name: 'Same origin' })).status, 200);
});

// ── two workspaces ───────────────────────────────────────────────────────

test('the same person in two workspaces carries no authority between them', async () => {
  const s = await scenario();
  // Agency A's Project Manager is also the Owner of Agency B.
  run(s.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES ('m_pm_b', ?, 'u_pm', 'owner', 'active', '2026-06-01T00:00:00.000Z')", s.B);

  const inA = await s.actorFor(PEOPLE.pm, s.A);
  const inB = await s.actorFor(PEOPLE.pm, s.B);
  assert.equal(inA.role, 'project_manager');
  assert.equal(inB.role, 'owner');
  assert.deepEqual((await listClients(s.db, inA)).clients.map((c) => c.id).sort(), ['c_lawrence', 'c_other']);
  assert.deepEqual((await listClients(s.db, inB)).clients.map((c) => c.id), ['c_b1']);
  assert.equal(await getClient(s.db, inA, 'c_b1'), null);
  assert.equal(await getClient(s.db, inB, 'c_lawrence'), null);

  // An owner id from the other workspace is refused, and says nothing.
  const created = await s.create(PEOPLE.pm, GOOD);
  assert.equal(s.clientRow(created.json.client.id).workspace_id, s.A, 'their first active membership decides the workspace');
  const foreign = await s.patch(PEOPLE.pm, created.json.client.id, { ownerMembershipId: 'm_pm_b' });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.json.errors.ownerMembershipId, 'Choose an owner from the list.');

  // Agency B's Owner cannot touch Agency A's clients at all.
  assert.equal((await s.patch(PEOPLE.bOwner, 'c_lawrence', { health: 'at_risk' })).status, 404);
  assert.equal((await s.addContact(PEOPLE.bOwner, 'c_lawrence', { name: 'X' })).status, 404);
  assert.equal(s.clientRow('c_lawrence').health, 'on_track');
});

// ── the screens ──────────────────────────────────────────────────────────

test('a client row shows the name, both state markers with their labels, and the context beneath', () => {
  const html = render(Clients.ClientRow, {
    client: { id: 'x1', name: 'Northwind Studio', relationshipStatus: 'paused', health: 'at_risk', startDate: '2026-03-02', owner: { name: 'Priya Manel' }, primaryContact: { name: 'Rae Ellis' } },
  });
  assert.match(html, /href="\/clients\/x1"/);
  assert.match(html, /Northwind Studio/);
  assert.match(html, /Paused/);
  assert.match(html, /At Risk/, 'health is a label, never colour alone');
  assert.match(html, /Rae Ellis/);
  assert.match(html, /Owner: Priya Manel/);
  assert.match(html, /Started 2 Mar 2026/);
  assert.ok(!/bo-surface|holo|gradient/.test(html), 'a client is a row, not a card');

  const bare = render(Clients.ClientRow, { client: { id: 'x2', name: 'Vela', relationshipStatus: 'draft', health: 'on_track', startDate: null, owner: null, primaryContact: null } });
  assert.match(bare, /Draft/);
  assert.match(bare, /On Track/);
  assert.ok(!/·/.test(bare), 'nothing invented where there is nothing to say');
});

test('the filter strip offers every lifecycle, marks one as current, and keeps the scope out of the address', () => {
  const html = render(Clients.ClientFilters, { active: 'active', counts: { all: 8, draft: 1, onboarding: 1, active: 2, paused: 2, completed: 1, ended: 1 } });
  for (const { label } of CLIENT_FILTERS) assert.match(html, new RegExp(label));
  assert.match(html, /href="\/clients"/, 'All is the plain address');
  assert.match(html, /href="\/clients\?status=ended"/);
  assert.equal((html.match(/aria-current/g) || []).length, 1, 'exactly one selected state');
  assert.match(html, /aria-label="Filter clients by status"/);
  assert.ok(!/workspace|membership|scope/i.test(html), 'the filter carries no identity');
});

test('the detail tabs are the five Release A sections and no future ones', () => {
  assert.deepEqual(Clients.CLIENT_TABS.map(([key]) => key), ['overview', 'services', 'onboarding', 'team', 'activity']);
  const html = render(Clients.ClientTabs, { clientId: 'x1', active: 'activity' });
  for (const [, label] of Clients.CLIENT_TABS) assert.match(html, new RegExp(label));
  for (const future of ['Projects', 'Content', 'Files', 'Finance']) assert.ok(!new RegExp(future).test(html), `${future} is not a tab yet`);
  assert.match(html, /href="\/clients\/x1"/, 'Overview is the canonical route');
  assert.match(html, /href="\/clients\/x1\?tab=team"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.equal(Clients.isClientTab('projects'), false);
  assert.equal(Clients.isClientTab('constructor'), false);
});

test('a contact row names the primary in words and says when someone can sign in', () => {
  const primary = render(Clients.ContactRow, { contact: { id: 'c1', name: 'Rae Ellis', title: 'Operations lead', email: 'rae@example.com', phone: '+61 2 5550 0100', isPrimary: true, linked: false } });
  assert.match(primary, /Rae Ellis/);
  assert.match(primary, /Primary contact/);
  assert.match(primary, /Operations lead · rae@example.com/);
  assert.ok(!/Can sign in/.test(primary));

  const linked = render(Clients.ContactRow, { contact: { id: 'c2', name: 'Sam', title: null, email: 'sam@example.com', phone: null, isPrimary: false, linked: true } });
  assert.ok(!/Primary contact/.test(linked));
  assert.match(linked, /Can sign in to the client portal\./);
  assert.ok(!/u_|user_id|userId/.test(linked), 'and never the user id itself');
});

test('an activity line is words, a name, and a date, with no code, id, or JSON', () => {
  const html = render(Clients.ActivityRow, {
    event: { id: 'e1', title: 'Health changed', detail: 'From On Track to Needs Attention.', actor: 'Priya Manel', occurredAt: '2026-09-04T09:12:00.000Z' },
  });
  assert.match(html, /Health changed/);
  assert.match(html, /From On Track to Needs Attention\./);
  assert.match(html, /Priya Manel · 4 Sept? 2026/);
  assert.ok(!/CLIENT_|metadata|\{|e1/.test(html.replace(/class="[^"]*"/g, '')), 'no code, metadata, or id');
  assert.ok(!/mono/.test(html), 'and no console aesthetic');
});

// ── the screens, as source ───────────────────────────────────────────────

test('every A6 screen resolves its own access on the server, and the create screen matches the route', () => {
  for (const page of ['app/(internal)/clients/page.jsx', 'app/(internal)/clients/new/page.jsx', 'app/(internal)/clients/[id]/page.jsx']) {
    const body = src(page);
    assert.match(body, /requireShell\('internal'\)/, `${page} re-checks on the server`);
    assert.match(body, /export const dynamic = 'force-dynamic'/, `${page} is never cached`);
  }
  const list = src('app/(internal)/clients/page.jsx');
  assert.match(list, /evaluate\(actor, \{ action: 'client\.create' \}\)/, 'the create action decides the create control');
  assert.match(list, /normalizeFilter\(params\?\.status\)/, 'and the filter comes from the address, normalised');

  const create = src('app/(internal)/clients/new/page.jsx');
  assert.match(create, /client\.create/);
  assert.match(create, /notFound\(\)/, 'a person who may not create does not get the form');

  const detail = src('app/(internal)/clients/[id]/page.jsx');
  assert.match(detail, /loadInternalClientResource/, 'the detail asks about an internal record');
  assert.match(detail, /action: 'client\.manage'/, 'and separately about managing it');
  assert.ok(!/client_assignments|serviceEngagement|onboarding_items/.test(detail), 'and builds none of A7 or A8');
});

test('the A6 routes are thin: authorise, read named keys, call the domain, map the answer', () => {
  const routes = [
    'app/api/bloomops/clients/route.js',
    'app/api/bloomops/clients/[id]/route.js',
    'app/api/bloomops/clients/[id]/contacts/route.js',
    'app/api/bloomops/clients/[id]/contacts/[contactId]/route.js',
  ];
  for (const path of routes) {
    const body = src(path).replace(/^\s*\/\/.*$/gm, '');
    assert.match(body, /requireAuthorized|requireClient/, `${path} authorises`);
    assert.match(body, /pick\(/, `${path} reads only the keys it names`);
    assert.ok(!/role ===|=== 'owner'|=== 'admin'|capabilit/i.test(body), `${path} compares no roles itself`);
    assert.ok(!/workspaceId: body|access\.workspace\.id === /.test(body), `${path} never takes a workspace from a request`);
    assert.ok(!/drizzle|schema\./.test(body), `${path} does not reach the database directly`);
  }
  const shared = src('app/api/bloomops/clients/_shared.mjs');
  assert.match(shared, /loadInternalClientResource/, 'every client route uses the internal descriptor');
});

test('a date field keeps its 16px on a phone, against the inherited stylesheet', () => {
  // app/globals.css (inherited, untouched) carries
  // `input[type="date"] { font: inherit }`, which is more specific than
  // `.bo-control` and would leave the field at the body's 15px. Below 16px
  // a phone zooms the page on focus, which docs/DESIGN_CHECKLIST.md rules
  // out, so app/bloomops.css takes the size back.
  const inherited = src('app/globals.css');
  assert.match(inherited, /input\[type="date"\]\s*\{\s*font: inherit;/, 'the inherited rule is still there, and still not ours to edit');
  const bloomops = src('app/bloomops.css');
  assert.match(bloomops, /\.bo-control\[type='date'\][\s\S]{0,200}font-size: 16px/, 'and BloomOps overrides it with a more specific selector');
  assert.match(bloomops, /\.bo-control\[type='time'\]/, 'for every field the same rule would catch');
});

test('A6 built nothing that a later phase owns', () => {
  const domain = src('lib/bloomops/clients.mjs') + src('lib/bloomops/client-contacts.mjs') + src('lib/bloomops/client-activity.mjs');
  const stripped = domain.replace(/^\s*\/\/.*$/gm, '');
  for (const later of ['serviceEngagements', 'serviceTypes', 'onboardingInstances', 'onboardingItems', 'templates', 'workspaceInvitations']) {
    assert.ok(!new RegExp(`schema\\.${later}\\b`).test(stripped), `A6 does not write ${later}`);
  }
  assert.ok(!/schema\.clientAssignments\b/.test(stripped.replace(/\.from\(schema\.clientAssignments\)/g, '').replace(/schema\.clientAssignments\.\w+/g, '')), 'client_assignments is read for the owner picker and never written');
  assert.ok(!/insert\(schema\.clientAssignments/.test(stripped), 'no assignment row is ever created');
  assert.ok(!/archived_at|deleted_at|archive/i.test(stripped), 'no archive machinery was invented');
  // The schema gained one index and nothing else.
  const migration = src('drizzle/0003_a6_primary_contact.sql');
  assert.equal(migration.trim().split('\n').length, 1, 'the A6 migration is one statement');
  assert.match(migration, /^CREATE UNIQUE INDEX/);
});
