import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, snapshot } from './_onboarding.mjs';
import { APP_URL, run, one, all } from './_bloomops-db.mjs';
import { createInvitation } from '../lib/bloomops/invitations.mjs';

async function http() {
  const t = await setup({ auth: true });
  t.ownerCookie = (await t.signIn('ellen@example.com')).cookie;
  t.clientCookie = (await t.signIn('lawrence@example.com')).cookie;
  t.call = async (
    path,
    method,
    { cookie = t.ownerCookie, body = {}, params = {}, origin = APP_URL, raw } = {},
  ) => {
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const route = await import(`../app/api/bloomops/${path}/route.js`);
    return route[method](
      new Request(`${APP_URL}/api/bloomops/${path}`, {
        method,
        headers: { cookie, origin, 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(body) }),
      }),
      {
        params: Promise.resolve({
          id: 'lawrence',
          itemId: t.item('agreement').id,
          operation: 'waive',
          ...params,
        }),
      },
    );
  };
  return t;
}
for (const [path, method, body, params, event] of [
  [
    'clients',
    'POST',
    { name: 'New', contactName: 'New', contactEmail: 'new@example.com' },
    {},
    'CLIENT_CREATED',
  ],
  ['clients/[id]/contacts', 'POST', { name: 'New', email: 'new@example.com' }, {}, 'CLIENT_CONTACT_ADDED'],
  ['invitations', 'POST', { email: 'new@example.com', role: 'team_member' }, {}, 'INVITATION_SENT'],
  ['invitations/[id]/revoke', 'POST', {}, { id: 'generic' }, 'INVITATION_REVOKED'],
  ['invitations/accept', 'POST', {}, {}, 'INVITATION_ACCEPTED'],
])
  test(`${path} returns safe JSON and rolls back when a database write fails`, async () => {
    const t = await http();
    // A nonmember identity for generic acceptance; other failures use Owner.
    let cookie = t.ownerCookie,
      input = body,
      ids = params;
    if (path.startsWith('invitations/')) {
      await t.person('new-person');
      run(t.raw, "UPDATE workspace_memberships SET status='removed' WHERE user_id='new-person'");
      const made = await createInvitation(t.db, {
        workspaceId: t.ws,
        email: 'new-person@example.com',
        role: 'team_member',
      });
      if (path.endsWith('accept')) {
        cookie = (await t.signIn('new-person@example.com')).cookie;
        input = { token: made.token };
      } else ids = { id: made.invitation.id };
    }
    const before = snapshot(t),
      membership = all(t.raw, 'SELECT * FROM workspace_memberships'),
      invitations = all(t.raw, 'SELECT * FROM workspace_invitations');
    t.raw.exec(
      `CREATE TRIGGER fail_http BEFORE INSERT ON activity_events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL constraint internal_secret_identifier'); END`,
    );
    const response = await t.call(path, method, { body: input, params: ids, cookie });
    assert.equal(response.status, 500);
    assert.match(response.headers.get('content-type'), /json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await response.text(), /PRIVATE|SQL|constraint|identifier|stack|token|workspaceId/);
    assert.deepEqual(snapshot(t), before);
    assert.deepEqual(all(t.raw, 'SELECT * FROM workspace_memberships'), membership);
    assert.deepEqual(all(t.raw, 'SELECT * FROM workspace_invitations'), invitations);
  });
for (const path of ['clients/[id]', 'clients/[id]/contacts/[contactId]', 'clients/[id]/services/[serviceId]'])
  test(`${path} rejects malformed or nonobject JSON without claiming a saved edit`, async () => {
    const t = await http(),
      before = snapshot(t);
    for (const raw of ['{', 'null', '[]', '"text"']) {
      const r = await t.call(path, 'PATCH', {
        raw,
        params: { contactId: 'lawrence-contact', serviceId: 'kajabi' },
      });
      assert.equal(r.status, 400, raw);
      assert.doesNotMatch(await r.text(), /SQL|constraint|stack/);
    }
    assert.deepEqual(snapshot(t), before);
  });
for (const state of ['suspended', 'removed', 'workspace'])
  test(`already-issued Client session loses every A10 route after ${state}`, async () => {
    const t = await http();
    if (state === 'workspace') run(t.raw, "UPDATE workspaces SET status='suspended' WHERE id=?", t.ws);
    else run(t.raw, 'UPDATE workspace_memberships SET status=? WHERE id=?', state, t.client.membershipId);
    assert.ok(await t.session(t.clientCookie));
    for (const [path, method] of [
      ['portal/onboarding', 'GET'],
      ['portal/onboarding/[id]', 'GET'],
      ['portal/onboarding/[id]/items/[itemId]/submit', 'POST'],
    ]) {
      const r = await t.call(path, method, { cookie: t.clientCookie });
      assert.equal(r.status, 403);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    }
  });
test('portal HTTP compares missing, foreign, hidden and guessed instance resources byte for byte', async () => {
  const t = await http();
  t.extra('restricted_secret', { visibility: 'restricted' });
  t.extra('internal_secret');
  t.extra('foreign_item', { ws: t.otherWs, clientId: 'foreign' });
  const missing = await (
    await t.call('portal/onboarding/[id]/items/[itemId]/submit', 'POST', {
      cookie: t.clientCookie,
      params: { itemId: 'absent' },
    })
  ).text();
  for (const itemId of ['restricted_secret', 'internal_secret', 'foreign_item', t.instance]) {
    const r = await t.call('portal/onboarding/[id]/items/[itemId]/submit', 'POST', {
      cookie: t.clientCookie,
      params: { itemId },
    });
    assert.equal(r.status, 404);
    assert.equal(await r.text(), missing);
  }
  for (const id of ['james', 'foreign', t.instance, 'absent']) {
    const r = await t.call('portal/onboarding/[id]', 'GET', { cookie: t.clientCookie, params: { id } });
    assert.equal(r.status, 404);
    assert.equal(await r.text(), missing);
  }
  const data = await (await t.call('portal/onboarding', 'GET', { cookie: t.clientCookie })).json();
  for (const client of data.clients) {
    assert.deepEqual(Object.keys(client).sort(), ['id', 'name', 'onboarding']);
    for (const item of client.onboarding.items)
      assert.deepEqual(Object.keys(item).sort(), [
        'canAct',
        'id',
        'instructions',
        'position',
        'required',
        'state',
        'title',
        'verificationRequired',
      ]);
  }
});
test('Client HTTP cannot invoke internal Client, Service, assignment, invitation or onboarding management', async () => {
  const t = await http(),
    before = snapshot(t);
  for (const [path, method, params, status] of [
    ['clients', 'POST', {}, 403],
    ['clients/[id]', 'PATCH', {}, 404],
    ['clients/[id]/services', 'POST', {}, 404],
    ['clients/[id]/services/[serviceId]', 'PATCH', { serviceId: 'kajabi' }, 404],
    ['clients/[id]/assignments', 'POST', {}, 404],
    ['clients/[id]/services/[serviceId]/assignments', 'POST', { serviceId: 'kajabi' }, 404],
    ['clients/[id]/onboarding', 'GET', {}, 404],
    ['clients/[id]/onboarding/items/[itemId]/[operation]', 'POST', {}, 404],
    ['invitations', 'GET', {}, 403],
    ['invitations/[id]/revoke', 'POST', {}, 403],
    ['members', 'GET', {}, 403],
  ]) {
    const r = await t.call(path, method, { cookie: t.clientCookie, params });
    assert.equal(r.status, status, path);
    assert.doesNotMatch(await r.text(), /SQL|constraint|stack|internal_secret/);
  }
  assert.deepEqual(snapshot(t), before);
});
test('A10 APIs refuse invalid operations, oversized reasons and cross-site writes safely', async () => {
  const t = await http(),
    before = snapshot(t);
  const path = 'clients/[id]/onboarding/items/[itemId]/[operation]';
  for (const operation of ['__proto__', 'constructor', 'unknown', 'submit'])
    assert.equal((await t.call(path, 'POST', { params: { operation } })).status, 409);
  for (const raw of ['{', JSON.stringify({ reason: 'x'.repeat(9000) }), JSON.stringify({ reason: ' ' })])
    assert.equal((await t.call(path, 'POST', { raw })).status, 400);
  for (const target of [
    path,
    'clients/[id]/activate',
    'clients/[id]/retry-invitation',
    'portal/onboarding/[id]/items/[itemId]/submit',
    'invitations/accept',
  ]) {
    assert.equal((await t.call(target, 'POST', { origin: 'https://foreign.example' })).status, 403);
  }
  assert.deepEqual(snapshot(t), before);
});

test('middleware preserves no-store for protected APIs, portal pages, token pages and denied requests', async () => {
  const {NextRequest}=await import('next/server');
  const {middleware}=await import('../middleware.js');
  for(const [path,cookie] of [
    ['/api/bloomops/portal/onboarding','bloomops.session_token=present'],
    ['/portal','bloomops.session_token=present'],
    ['/api/bloomops/me',''],['/portal',''],
    [`/invite/${'a'.repeat(43)}`,''],['/api/auth/get-session',''],
  ]) {
    const response=await middleware(new NextRequest(`${APP_URL}${path}`,{headers:{cookie}}));
    assert.equal(response.headers.get('cache-control'),'no-store',path);
  }
});
