import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { renderToStaticMarkup } from 'react-dom/server';

// Supply the same request stores that Next uses, then execute the actual
// server page/layout against issued Better Auth sessions and migrated SQLite.
// Neither shell authorization, destination eligibility nor redirect is mocked.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external.js');
const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external.js');
const { getURLFromRedirectError } = await import('next/dist/client/components/redirect.js');
const { default: ContentPage } = await import('../app/portal/content/page.jsx');
const { default: PortalLayout } = await import('../app/portal/layout.jsx');
const { setup } = await import('./_content-files.mjs');
const { run } = await import('./_bloomops-db.mjs');

async function pageFixture(user = 'james') {
  const t = await setup({ auth: true });
  const cookie = user ? (await t.signIn(`${user}@example.com`)).cookie : '';
  const request = callback => {
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    return workAsyncStorage.run({ route: '/portal/content' }, () =>
      workUnitAsyncStorage.run({ type: 'request', phase: 'render', headers: new Headers({ cookie }) }, callback));
  };
  t.page = (query = {}) => request(() => ContentPage({ searchParams: Promise.resolve(query) }));
  t.navigation = async () => (await request(() => PortalLayout({ children: null }))).props.hasContent;
  return t;
}
const redirectsTo = path => error => getURLFromRedirectError(error) === path;
const publish = (t, daysAgo) => run(t.raw,
  "UPDATE content_items SET stage='published',stage_context=NULL,published_at=? WHERE id=?",
  new Date(Date.now() - daysAgo * 86400000).toISOString(), t.contentId);

test('no eligible Content hides navigation and redirects direct index access to Home', async () => {
  const t = await pageFixture();
  run(t.raw, 'DELETE FROM content_items');
  assert.equal(await t.navigation(), false);
  await assert.rejects(t.page(), redirectsTo('/portal'));
  await assert.rejects(t.page({ view: 'invalid' }), redirectsTo('/portal'));
});
test('only old Published Content hides navigation and redirects every direct index view', async () => {
  const t = await pageFixture();
  publish(t, 31);
  assert.equal(await t.navigation(), false);
  for (const view of ['current', 'action', 'published']) await assert.rejects(t.page({ view }), redirectsTo('/portal'));
});
test('current work enables navigation and direct index access', async () => {
  const t = await pageFixture();
  assert.equal(await t.navigation(), true);
  assert.match(renderToStaticMarkup(await t.page()), /Recording needed/);
});
test('recent Published-only work keeps navigation and valid empty current/action/page views', async () => {
  const t = await pageFixture();
  publish(t, 1);
  assert.equal(await t.navigation(), true);
  assert.match(renderToStaticMarkup(await t.page()), /No Content in progress/);
  assert.match(renderToStaticMarkup(await t.page({ view: 'action' })), /all set for now/);
  assert.match(renderToStaticMarkup(await t.page({ page: '2' })), /No Content on this page/);
  const result = (await t.page({ view: 'published' })).props.result;
  assert.deepEqual(result.items.map(item => item.id), [t.contentId]);
});
test('hidden and other-Client Content cannot enable navigation or direct index access', async () => {
  const t = await pageFixture();
  run(t.raw, "UPDATE content_items SET visibility='internal'");
  await t.add({ visibility: 'restricted' });
  await t.add({ visibility: 'client' }, { clientId: 'lawrence' });
  assert.equal(await t.navigation(), false);
  await assert.rejects(t.page(), redirectsTo('/portal'));
});
test('current contact and service revocation gate the page with an already issued session', async () => {
  const t = await pageFixture();
  await t.page();
  run(t.raw, "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'");
  assert.equal(await t.navigation(), false);
  await assert.rejects(t.page(), redirectsTo('/portal'));
  run(t.raw, "UPDATE client_contacts SET user_id='james' WHERE client_id='james'");
  run(t.raw, "UPDATE service_types SET department_id='systems' WHERE id='type-social'");
  assert.equal(await t.navigation(), false);
  await assert.rejects(t.page(), redirectsTo('/portal'));
});
for (const [user, destination] of [[null, '/sign-in'], ['ellen', '/']]) test(`${user || 'unauthenticated'} retains the existing portal redirect`, async () => {
  const t = await pageFixture(user);
  await assert.rejects(t.page({ view: 'invalid' }), redirectsTo(destination));
});
test('suspended issued membership retains the existing sign-in redirect', async () => {
  const t = await pageFixture();
  await t.page();
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'");
  await assert.rejects(t.page(), redirectsTo('/sign-in'));
});
