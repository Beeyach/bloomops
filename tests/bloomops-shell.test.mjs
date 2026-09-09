// The A5 shells: which shell each role gets, that the boundary between
// the internal application and the client portal is decided on the
// server from the A4 engine, that navigation is one list with one shape,
// and that the portal carries no internal chrome. Sessions are real
// Better Auth sessions over the real schema; the components are the real
// ones rendered with react-dom/server.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { testAuth, run, one, APP_URL } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { resolveWorkspaceAccess, setMembershipStatus } from '../lib/bloomops/membership.mjs';
import { grantCapability, loadActor } from '../lib/bloomops/authorization.mjs';
import { INTERNAL_NAV, NAV_GROUPS, PORTAL_NAV, activeKey, mobileMore, mobilePrimary, navGroups } from '../lib/bloomops/navigation.mjs';
import { AREAS, ROLE_DESCRIPTIONS, financeViewFor, resolveShellAccess, routeDecision, shellFor, teamViewFor } from '../lib/bloomops/shell.mjs';
import { portalClients, visibleClients, workspaceOverview } from '../lib/bloomops/overview.mjs';

const root = new URL('..', import.meta.url);
const src = (path) => readFileSync(new URL(path, root), 'utf8');

// Components load after the JSX hook is registered.
const { NavList } = await import('../components/bloomops/InternalNav.jsx');
const { TabBar, MoreSheet } = await import('../components/bloomops/MobileNav.jsx');
const { default: InternalShell } = await import('../components/bloomops/InternalShell.jsx');
const { default: PortalShell } = await import('../components/bloomops/PortalShell.jsx');
const { PortalHome } = await import('../components/bloomops/PortalHome.jsx');
const { StateRows, AreaMap } = await import('../components/bloomops/HomeOverview.jsx');
const { MemberRow, InvitationRow, InviteForm } = await import('../components/bloomops/TeamManager.jsx');
const { default: AuthShell } = await import('../components/auth/AuthShell.jsx');

const render = (Component, props = {}, children = undefined) => renderToStaticMarkup(React.createElement(Component, props, children));

// ── scenario ─────────────────────────────────────────────────────────────

const PEOPLE = {
  owner: 'owner@example.com',
  admin: 'admin@example.com',
  pm: 'pm@example.com',
  tmNone: 'tm-none@example.com',
  tmClient: 'tm-client@example.com',
  clientLinked: 'client-linked@example.com',
  clientUnlinked: 'client-unlinked@example.com',
  stranger: 'stranger@example.com',
};

async function scenario() {
  const t = testAuth();
  await runBootstrap(t.d1, { workspaceName: 'Agency A', owner: { email: PEOPLE.owner, name: 'Ellen Owner' }, admin: { email: PEOPLE.admin, name: 'Ary Admin' } });
  const A = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-a'").id;
  const person = (key, role) => {
    run(t.raw, 'INSERT INTO user (id, name, email, email_verified) VALUES (?, ?, ?, 1)', `u_${key}`, key, PEOPLE[key]);
    if (role) run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', '2026-01-01T00:00:00.000Z')", `m_${key}`, A, `u_${key}`, role);
  };
  person('pm', 'project_manager');
  person('tmNone', 'team_member');
  person('tmClient', 'team_member');
  person('clientLinked', 'client');
  person('clientUnlinked', 'client');
  person('stranger', null);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) VALUES ('c_james', ?, 'James', 'james', 'active')", A);
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) VALUES ('c_lawrence', ?, 'Lawrence', 'lawrence', 'onboarding')", A);
  run(t.raw, "INSERT INTO service_types (id, workspace_id, name, slug) VALUES ('st_social', ?, 'Social', 'social')", A);
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_james_social', ?, 'c_james', 'st_social')", A);
  run(t.raw, "INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES ('se_lawrence_social', ?, 'c_lawrence', 'st_social')", A);
  run(t.raw, "INSERT INTO onboarding_instances (id, workspace_id, client_id, status) VALUES ('ob_lawrence', ?, 'c_lawrence', 'in_progress')", A);
  run(t.raw, "INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) VALUES (?, 'c_james', 'm_tmClient', 'member')", A);
  run(t.raw, "INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) VALUES ('cc_james', ?, 'c_james', 'James Client', ?, 'u_clientLinked', 1)", A, PEOPLE.clientLinked);

  const cookies = new Map();
  async function cookieFor(email) {
    if (!cookies.has(email)) cookies.set(email, (await t.signIn(email)).cookie);
    return cookies.get(email);
  }
  const request = (cookie, path = '/') => new Request(`${APP_URL}${path}`, { headers: cookie ? { cookie } : {} });
  async function decide(email, area, path = '/') {
    const cookie = email ? await cookieFor(email) : '';
    return resolveShellAccess(request(cookie, path), { area, env: t.env });
  }
  async function actorFor(email) {
    const user = one(t.raw, 'SELECT id FROM user WHERE email = ?', email);
    const resolved = await resolveWorkspaceAccess(t.db, user.id, { workspaceId: A });
    return resolved ? loadActor(t.db, { ...resolved, user }) : null;
  }
  const membership = (email) => one(t.raw, 'SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = ? AND m.workspace_id = ?', email, A);
  return { ...t, A, cookieFor, request, decide, actorFor, membership };
}

const outcome = (d) => (d.kind === 'ok' ? `ok:${d.shell}` : d.kind === 'redirect' ? `redirect:${d.to}` : d.kind);

// ── navigation metadata ──────────────────────────────────────────────────

test('the internal navigation is the eleven PRODUCT_SPEC destinations, in order, with explicit labels and one path each', () => {
  assert.deepEqual(
    INTERNAL_NAV.map((i) => i.label),
    ['Home', 'Clients', 'Onboarding', 'Work', 'Social', 'Ads', 'Systems', 'Pages', 'Team', 'Finance', 'Settings'],
  );
  assert.deepEqual(INTERNAL_NAV.map((i) => i.href), ['/', '/clients', '/onboarding', '/work', '/social', '/ads', '/systems', '/pages', '/team', '/finance', '/settings']);
  assert.equal(new Set(INTERNAL_NAV.map((i) => i.key)).size, 11);
  for (const item of INTERNAL_NAV) {
    assert.match(item.label, /^[A-Za-z ]+$/, `${item.key}: label is words, not emoji`);
    assert.ok(item.purpose.length > 20, `${item.key} says what it is for`);
    assert.ok(['now', 'later'].includes(item.availability), item.key);
    assert.ok(NAV_GROUPS.some((g) => g.key === item.group), `${item.key} belongs to a group`);
  }
  assert.deepEqual(INTERNAL_NAV.filter((i) => i.availability === 'now').map((i) => i.key), ['home', 'clients', 'onboarding', 'work', 'social', 'team', 'settings'], 'Release A areas, Work and C1 Social are live');
  assert.equal(JSON.stringify(INTERNAL_NAV).match(/prospect|leads?that|outreach|gmail/i), null, 'no prospecting destination in BloomOps navigation');
  assert.equal(navGroups().reduce((n, g) => n + g.items.length, 0), 11, 'every destination is in exactly one group');
});

test('the phone composition keeps every destination: four on the bar, seven behind More, none dropped', () => {
  assert.deepEqual(mobilePrimary().map((i) => i.key), ['home', 'clients', 'onboarding', 'team']);
  assert.deepEqual(mobileMore().map((i) => i.key), ['work', 'social', 'ads', 'systems', 'pages', 'finance', 'settings']);
  assert.equal(mobilePrimary().length + mobileMore().length, INTERNAL_NAV.length);
});

test('the active destination follows the route: exact root, own path and everything under it, nothing for strangers', () => {
  assert.equal(activeKey('/'), 'home');
  assert.equal(activeKey('/?tab=x'), 'home');
  assert.equal(activeKey('/team'), 'team');
  assert.equal(activeKey('/team/'), 'team');
  assert.equal(activeKey('/team/anything?x=1#y'), 'team');
  assert.equal(activeKey('/teams'), null, 'a prefix that is not a segment is not a match');
  assert.equal(activeKey('/portal'), null, 'the portal is not an internal destination');
  assert.equal(activeKey('/legacy'), null, 'the inherited app lights nothing');
  assert.equal(activeKey(''), 'home');
  assert.equal(activeKey(undefined), 'home');
});

test('the portal navigation is Home alone and shares no path with the internal application', () => {
  assert.deepEqual(PORTAL_NAV, [{ key: 'home', label: 'Home', href: '/portal' }]);
  const internalPaths = new Set(INTERNAL_NAV.map((i) => i.href));
  for (const item of PORTAL_NAV) assert.equal(internalPaths.has(item.href), false, item.href);
});

// ── the shell decision ───────────────────────────────────────────────────

test('routeDecision: default deny is visible before any session exists', () => {
  const internal = { membership: { role: 'admin', status: 'active' }, workspace: { id: 'w' } };
  const client = { membership: { role: 'client', status: 'active' }, workspace: { id: 'w' } };
  assert.deepEqual(AREAS, ['internal', 'portal', 'legacy']);
  assert.equal(outcome(routeDecision({ access: internal }, 'admin-panel')), 'not_found', 'an unknown area is nothing');
  assert.equal(outcome(routeDecision({ access: internal, configured: false }, 'internal')), 'redirect:/sign-in', 'an unconfigured deployment signs nobody in');
  assert.equal(outcome(routeDecision({ access: null }, 'internal')), 'redirect:/sign-in');
  assert.equal(outcome(routeDecision({ access: null }, 'portal')), 'redirect:/sign-in');
  assert.equal(outcome(routeDecision({ access: { membership: null, workspace: null } }, 'internal')), 'redirect:/sign-in', 'an identity without a membership has no shell');
  assert.equal(outcome(routeDecision({ access: { membership: { role: 'admin' }, workspace: null } }, 'internal')), 'redirect:/sign-in', 'a membership without a workspace has no shell');
  assert.equal(outcome(routeDecision({ access: { membership: { role: 'superuser' }, workspace: { id: 'w' } } }, 'internal')), 'redirect:/sign-in', 'an unknown role has no shell');
  assert.equal(outcome(routeDecision({ access: internal }, 'internal')), 'ok:internal');
  assert.equal(outcome(routeDecision({ access: internal }, 'portal')), 'redirect:/', 'an internal person never becomes a portal user');
  assert.equal(outcome(routeDecision({ access: client }, 'portal')), 'ok:portal');
  assert.equal(outcome(routeDecision({ access: client }, 'internal')), 'redirect:/portal', 'a Client never renders the internal shell');
  assert.equal(outcome(routeDecision({ access: client }, 'legacy')), 'redirect:/portal');
  assert.equal(outcome(routeDecision({ access: internal, actor: null }, 'legacy')), 'not_found', 'the inherited app needs the engine to say yes');
  assert.equal(shellFor(null), null);
  assert.equal(shellFor({}), null);
});

test('every role lands in its own shell, and only there, through real sessions', async () => {
  const s = await scenario();
  const table = [
    [null, 'redirect:/sign-in', 'redirect:/sign-in', 'redirect:/sign-in'],
    [PEOPLE.stranger, 'redirect:/sign-in', 'redirect:/sign-in', 'redirect:/sign-in'],
    [PEOPLE.owner, 'ok:internal', 'redirect:/', 'ok:internal'],
    [PEOPLE.admin, 'ok:internal', 'redirect:/', 'ok:internal'],
    [PEOPLE.pm, 'ok:internal', 'redirect:/', 'not_found'],
    [PEOPLE.tmNone, 'ok:internal', 'redirect:/', 'not_found'],
    [PEOPLE.tmClient, 'ok:internal', 'redirect:/', 'not_found'],
    [PEOPLE.clientLinked, 'redirect:/portal', 'ok:portal', 'redirect:/portal'],
    [PEOPLE.clientUnlinked, 'redirect:/portal', 'ok:portal', 'redirect:/portal'],
  ];
  for (const [email, internal, portal, legacy] of table) {
    const who = email || 'anonymous';
    assert.equal(outcome(await s.decide(email, 'internal', '/clients')), internal, `${who} on the internal app`);
    assert.equal(outcome(await s.decide(email, 'portal', '/portal')), portal, `${who} on the portal`);
    assert.equal(outcome(await s.decide(email, 'legacy', '/legacy')), legacy, `${who} on the inherited app`);
  }
  // A refused decision carries nothing a page could render with.
  const refused = await s.decide(PEOPLE.clientLinked, 'internal');
  assert.equal(refused.access, null);
  assert.equal(refused.actor, null);
  const admitted = await s.decide(PEOPLE.tmClient, 'internal');
  assert.equal(admitted.access.workspace.id, s.A);
  assert.equal(admitted.actor.role, 'team_member');
  assert.equal(admitted.actor.scope.kind, 'assigned', 'the actor arrives loaded, so pages ask the engine without another round trip');
});

test('suspension and removal take the shell away on the next request while the identity session survives', async () => {
  const s = await scenario();
  assert.equal(outcome(await s.decide(PEOPLE.pm, 'internal')), 'ok:internal');
  const owner = s.membership(PEOPLE.owner);
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: 'm_pm', status: 'suspended', actorMembership: { id: owner.id, userId: owner.user_id } });
  assert.equal(outcome(await s.decide(PEOPLE.pm, 'internal')), 'redirect:/sign-in', 'suspended: no internal shell');
  assert.equal(outcome(await s.decide(PEOPLE.pm, 'portal')), 'redirect:/sign-in', 'suspended: no portal either');
  assert.ok((await s.session(await s.cookieFor(PEOPLE.pm)))?.user, 'the Better Auth session itself is still valid');
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: 'm_pm', status: 'active', actorMembership: { id: owner.id, userId: owner.user_id } });
  assert.equal(outcome(await s.decide(PEOPLE.pm, 'internal')), 'ok:internal', 'reinstated: back');
  await setMembershipStatus(s.db, { workspaceId: s.A, membershipId: 'm_clientLinked', status: 'removed', actorMembership: { id: owner.id, userId: owner.user_id } });
  assert.equal(outcome(await s.decide(PEOPLE.clientLinked, 'portal')), 'redirect:/sign-in', 'removed Client: no portal');
  assert.equal(outcome(await s.decide(PEOPLE.clientLinked, 'internal')), 'redirect:/sign-in');
});

// ── what the pages show, by the engine ───────────────────────────────────

test('Team and Finance views follow capabilities, not roles: grants open them, nothing else does', async () => {
  const s = await scenario();
  const expected = { owner: ['manage', 'preview'], admin: ['manage', 'limited'], pm: ['limited', 'limited'], tmNone: ['limited', 'limited'], tmClient: ['limited', 'limited'] };
  for (const [key, [team, finance]] of Object.entries(expected)) {
    const actor = await s.actorFor(PEOPLE[key]);
    assert.equal(teamViewFor(actor), team, `${key} team`);
    assert.equal(financeViewFor(actor), finance, `${key} finance`);
  }
  assert.equal(teamViewFor(null), 'limited');
  assert.equal(financeViewFor(null), 'limited');
  await grantCapability(s.db, { workspaceId: s.A, membershipId: 'm_pm', capability: 'finance.view' });
  assert.equal(financeViewFor(await s.actorFor(PEOPLE.pm)), 'preview', 'an explicit grant opens Finance for a Project Manager');
  assert.equal(teamViewFor(await s.actorFor(PEOPLE.pm)), 'limited', 'and nothing else');
  await grantCapability(s.db, { workspaceId: s.A, membershipId: s.membership(PEOPLE.admin).id, capability: 'finance.view' });
  assert.equal(financeViewFor(await s.actorFor(PEOPLE.admin)), 'preview');
  for (const role of Object.keys(ROLE_DESCRIPTIONS)) assert.ok(ROLE_DESCRIPTIONS[role].length > 20, role);
});

test('Home, Clients, and Onboarding read real state through the actor\'s own scope and never wider', async () => {
  const s = await scenario();
  const owner = await workspaceOverview(s.db, await s.actorFor(PEOPLE.owner));
  assert.deepEqual(owner, { clients: 2, engagements: 2, onboardingOpen: 1, team: { active: 7, pendingInvitations: 0 } });
  const pm = await workspaceOverview(s.db, await s.actorFor(PEOPLE.pm));
  assert.deepEqual(pm, { clients: 2, engagements: 2, onboardingOpen: 1, team: null }, 'workspace-wide delivery reach, no team figures without members.manage');
  const assigned = await workspaceOverview(s.db, await s.actorFor(PEOPLE.tmClient));
  assert.deepEqual(assigned, { clients: 1, engagements: 1, onboardingOpen: 0, team: null }, 'James and his engagement only');
  const none = await workspaceOverview(s.db, await s.actorFor(PEOPLE.tmNone));
  assert.deepEqual(none, { clients: 0, engagements: 0, onboardingOpen: 0, team: null });
  const client = await workspaceOverview(s.db, await s.actorFor(PEOPLE.clientLinked));
  assert.deepEqual(client, { clients: 0, engagements: 0, onboardingOpen: 0, team: null }, 'a Client is never given internal counts');
  assert.deepEqual(await workspaceOverview(s.db, null), { clients: 0, engagements: 0, onboardingOpen: 0, team: null });

  assert.deepEqual((await visibleClients(s.db, await s.actorFor(PEOPLE.owner))).map((c) => `${c.name}:${c.statusLabel}`), ['James:Active', 'Lawrence:Onboarding']);
  assert.deepEqual((await visibleClients(s.db, await s.actorFor(PEOPLE.tmClient))).map((c) => c.name), ['James']);
  assert.deepEqual(await visibleClients(s.db, await s.actorFor(PEOPLE.tmNone)), []);
  assert.deepEqual(await visibleClients(s.db, await s.actorFor(PEOPLE.clientLinked)), [], 'the internal list is not for Clients');

  assert.deepEqual((await portalClients(s.db, await s.actorFor(PEOPLE.clientLinked))).map((c) => c.name), ['James']);
  assert.deepEqual(await portalClients(s.db, await s.actorFor(PEOPLE.clientUnlinked)), [], 'unlinked fails closed');
  assert.deepEqual(await portalClients(s.db, await s.actorFor(PEOPLE.owner)), [], 'the portal read is not for internal people');
});

// ── the chrome ───────────────────────────────────────────────────────────

const shellProps = { workspace: { id: 'w', name: 'Agency A' }, user: { id: 'u', name: 'Ary Admin', email: 'admin@example.com' }, roleLabel: 'Admin' };

test('the internal shell carries the whole navigation once per geometry, the workspace, the person, and no prospecting', () => {
  const html = render(InternalShell, shellProps, 'PAGE');
  assert.ok(html.includes('PAGE'));
  assert.equal((html.match(/aria-label="Main"/g) || []).length, 2, 'one sidebar navigation, one tab bar; the stylesheet shows one at a time');
  for (const item of INTERNAL_NAV) assert.ok(html.includes(`href="${item.href}"`), `${item.label} is reachable`);
  assert.ok(html.includes('Agency A') && html.includes('Ary Admin') && html.includes('Admin'));
  assert.doesNotMatch(html, /prospect|Leads That Bloom|Search prospects|legacy/i);
  assert.ok(html.includes('id="main"') && html.includes('href="#main"'), 'a skip link to the main landmark');
  assert.ok(html.includes('aria-label="Workspace"'), 'the sidebar is a landmark');
  assert.doesNotMatch(html, /[\u{1F300}-\u{1FAFF}]/u, 'no emoji navigation');
});

test('the navigation marks exactly one destination current, and More holds the seven off-bar destinations', () => {
  const sidebar = render(NavList, { active: 'team' });
  assert.equal((sidebar.match(/aria-current="page"/g) || []).length, 1);
  assert.match(sidebar, /href="\/team"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/team"/);
  assert.equal((sidebar.match(/class="bo-nav-item"/g) || []).length, 11);
  assert.equal((render(NavList, { active: null }).match(/aria-current/g) || []).length, 0, 'an unknown route lights nothing');
  const bar = render(TabBar, { active: 'settings' });
  assert.equal((bar.match(/<a /g) || []).length, 4);
  assert.match(bar, /aria-expanded="false"/, 'More is a button that opens a dialog');
  assert.match(bar, /<button[^>]*aria-current="page"/, 'a destination behind More lights More');
  const sheet = render(MoreSheet, { active: 'settings', open: true, onClose: () => {} });
  assert.equal((sheet.match(/class="bo-nav-item"/g) || []).length, 7);
  assert.match(sheet, /role="dialog"[^>]*aria-modal="true"/);
  assert.equal((sheet.match(/aria-current="page"/g) || []).length, 1);
});

test('the portal shell is not the internal shell with parts hidden: no navigation, no internal path, no internal vocabulary', () => {
  const html = render(PortalShell, { workspace: { name: 'Agency A' }, user: { name: 'James Client', email: 'client@example.com' } }, 'PAGE');
  assert.ok(html.includes('PAGE') && html.includes('Agency A') && html.includes('Client portal'));
  assert.equal(html.includes('<nav'), false, 'no navigation element at all');
  for (const item of INTERNAL_NAV.filter((i) => i.href !== '/')) assert.equal(html.includes(`href="${item.href}"`), false, `${item.label} is not in the portal`);
  assert.doesNotMatch(html, /Onboarding|Finance|Settings|Team|Prospect|legacy|workload|internal/i);
  assert.ok(html.includes('Sign out') || html.includes('Account:'), 'the way out is there');

  const unlinked = render(PortalHome, { workspaceName: 'Agency A', user: { name: 'James Client', email: 'client@example.com' }, clients: [] });
  assert.match(unlinked, /not connected yet/);
  assert.match(unlinked, /Hello, James/);
  assert.doesNotMatch(unlinked, /client_contacts|user_id|scope|A4|A9|linked/i, 'plain words, no implementation detail');
  const linked = render(PortalHome, { workspaceName: 'Agency A', user: { name: 'James Client', email: 'client@example.com' }, clients: [{ id: 'c', name: 'James Ltd', statusLabel: 'Active' }] });
  assert.match(linked, /James Ltd/);
  assert.match(linked, /Your onboarding/);
  assert.match(linked, /Your onboarding steps will appear here when the agency is ready/);
  // No requests, approvals, or deliverables exist yet to read, so the portal
  // never claims to know what the agency needs from the person.
  for (const html of [linked, unlinked]) assert.doesNotMatch(html, /needs your attention|waiting on you|nothing new has been shared|nothing is waiting/i, 'no inferred operational state');
  assert.doesNotMatch(linked, /Active/, 'the internal relationship status is not the client\'s vocabulary');
});

test('Home tells the truth about zero, by scope, and maps every area with its availability', () => {
  const empty = { clients: 0, engagements: 0, onboardingOpen: 0, team: null };
  const owner = render(StateRows, { overview: { ...empty, team: { active: 2, pendingInvitations: 1 } }, scopeKind: 'workspace' });
  assert.match(owner, /None yet/);
  assert.match(owner, /2 active members, 1 open invitation/);
  const tm = render(StateRows, { overview: empty, scopeKind: 'assigned' });
  assert.match(tm, /None assigned to you yet/);
  assert.doesNotMatch(tm, /Team/, 'no team row without members.manage');
  const some = render(StateRows, { overview: { clients: 1, engagements: 3, onboardingOpen: 1, team: null } });
  assert.match(some, /1 client</);
  assert.match(some, /3 service engagements in delivery/);
  assert.match(some, /1 client with onboarding still open/);
  const map = render(AreaMap);
  assert.equal((map.match(/Available now/g) || []).length, 6, 'Clients, Onboarding, Work, Social, Team, Settings');
  assert.equal((map.match(/Not available yet/g) || []).length, 4, 'Ads, Systems, Pages, Finance');
  assert.doesNotMatch(map, /Welcome back/i);
});

test('the Team rows offer only the actions the server would accept, and never a token', () => {
  const base = { id: 'm1', name: 'Pat', email: 'pat@example.com', role: 'team_member', roleLabel: 'Team Member', joinedAt: '2026-09-01T00:00:00.000Z' };
  const noop = () => {};
  const active = render(MemberRow, { member: { ...base, status: 'active' }, isSelf: false, busy: null, onSuspend: noop, onReinstate: noop, onRemove: noop });
  assert.match(active, /Suspend Pat/);
  assert.match(active, /Remove Pat/);
  assert.doesNotMatch(active, /Reinstate/);
  assert.match(active, /Active/);
  assert.match(active, /Joined 1 Sept 2026|Joined 1 Sep 2026/);
  const suspended = render(MemberRow, { member: { ...base, status: 'suspended' }, isSelf: false, busy: null, onSuspend: noop, onReinstate: noop, onRemove: noop });
  assert.match(suspended, /Reinstate Pat/);
  assert.doesNotMatch(suspended, /Suspend Pat/);
  const self = render(MemberRow, { member: { ...base, status: 'active' }, isSelf: true, busy: null, onSuspend: noop, onReinstate: noop, onRemove: noop });
  assert.match(self, /\(you\)/);
  assert.equal(self.includes('<button'), false, 'no action on yourself');
  const removed = render(MemberRow, { member: { ...base, status: 'removed' }, isSelf: false, busy: null });
  assert.equal(removed.includes('<button'), false, 'nothing to do with a removed membership');
  assert.match(removed, /Removed/);

  const pending = { id: 'i1', email: 'new@example.com', role: 'admin', roleLabel: 'Admin', status: 'pending', expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(), inviteeName: 'New Person', tokenHash: 'should-never-be-passed' };
  const row = render(InvitationRow, { invitation: pending, busy: null, onResend: noop, onRevoke: noop });
  assert.match(row, /New Person · new@example.com/);
  assert.match(row, /Expires in 3 days/);
  assert.match(row, /Resend the invitation/);
  assert.match(row, /Withdraw the invitation/);
  assert.doesNotMatch(row, /should-never-be-passed|tokenHash|token=/);
  const expired = render(InvitationRow, { invitation: { ...pending, expiresAt: new Date(Date.now() - 86400000).toISOString() }, busy: null, onResend: noop, onRevoke: noop });
  assert.match(expired, /Expired/);
  assert.match(expired, /Send again/);
  assert.doesNotMatch(expired, /Withdraw/);

  const form = render(InviteForm, { onSubmit: noop, onCancel: noop, busy: false, serverError: 'That person is already an active member of this workspace.' });
  assert.match(form, /<label for="invite-email"/);
  assert.match(form, /<label for="invite-role"/);
  assert.equal((form.match(/<option /g) || []).length, 4, 'the four internal roles');
  assert.doesNotMatch(form, /value="client"/, 'Client invitations need a client record and are not offered here');
  assert.match(form, /already an active member/, 'the server\'s answer is shown as written');
  assert.match(form, /type="email"/);
});

test('the signed-out frame is BloomOps and keeps the anchors the deploy verifier reads', () => {
  const html = render(AuthShell, { title: 'Sign in', lead: 'Lead', footer: 'Foot' }, 'BODY');
  assert.ok(html.includes('BloomOps') && html.includes('<h1 class="bo-display">Sign in</h1>') && html.includes('BODY') && html.includes('Foot'));
  assert.doesNotMatch(html, /glass-panel|font-logo|Leads That Bloom/);
  assert.match(src('app/sign-in/SignInForm.jsx'), /id: 'sign-in-email'/, 'the verifier looks for the sign-in field by id');
  assert.match(src('app/sign-in/page.jsx'), /Sign-in is not set up/);
  assert.match(src('app/invite/[token]/page.jsx'), /is not valid/);
});

// ── structure ────────────────────────────────────────────────────────────

test('the inherited application is no longer the root, and every shell page re-checks on the server', () => {
  assert.equal(existsSync(new URL('app/page.jsx', root)), false, 'the root page moved into the internal group');
  const home = src('app/(internal)/page.jsx');
  assert.doesNotMatch(home, /ProspectsApp/);
  assert.match(home, /requireShell\('internal'\)/);
  const legacy = src('app/legacy/page.jsx');
  assert.match(legacy, /requireShell\('legacy'\)/);
  assert.match(legacy, /ProspectsApp/);
  assert.equal(src('lib/bloomops/navigation.mjs').includes('/legacy'), false, 'and it is not a destination');

  const pages = [];
  const walk = (dir, area) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, area);
      else if (/^(page|layout)\.jsx$/.test(entry)) pages.push([full, area]);
    }
  };
  walk(new URL('app/(internal)', root).pathname, 'internal');
  walk(new URL('app/portal', root).pathname, 'portal');
  assert.equal(pages.filter(([, a]) => a === 'internal').length, 21, 'eleven destinations, Client and Project create/detail, Action detail, Content create/detail/edit/calendar and one layout');
  assert.equal(pages.filter(([, a]) => a === 'portal').length, 4, 'C5 adds only the dedicated approval response page');
  for (const [file, area] of pages) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, new RegExp(`requireShell\\('${area}'\\)`), `${file} resolves the ${area} shell itself`);
    assert.match(text, /export const dynamic\s*=\s*'force-dynamic'/, `${file} renders per request`);
  }
  // No BloomOps page reaches into the inherited data layer or the fenced routes.
  for (const [file] of pages) assert.doesNotMatch(readFileSync(file, 'utf8'), /from '@\/lib\/db'|ProspectsApp|\/api\/prospects|\/api\/pages/, file);
});

test('the front door still bounces anonymous callers from every new address', async () => {
  const { NextRequest } = await import('next/server');
  const { middleware } = await import('../middleware.js');
  for (const path of ['/', '/clients', '/team', '/settings', '/finance', '/portal', '/legacy', '/design', '/social/calendar']) {
    const r = await middleware(new NextRequest(`https://bloomops.example${path}`));
    assert.equal(r.status, 307, path);
    assert.equal(new URL(r.headers.get('location')).pathname, '/sign-in', path);
  }
});
