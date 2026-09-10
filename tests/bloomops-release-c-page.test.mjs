import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_content.mjs';

// Execute real server pages with Next's request stores and issued sessions.
// Invalid filters must retain page orientation and a working recovery link;
// query validation must still happen after shell authorization.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external.js');
const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external.js');
const { getURLFromRedirectError } = await import('next/dist/client/components/redirect.js');
const { default: SocialPage } = await import('../app/(internal)/social/page.jsx');
const { default: CalendarPage } = await import('../app/(internal)/social/calendar/page.jsx');

const cases = [
  ['invalid list page', SocialPage, '/social', { page: '0' }, 'Social', 'Reset filters'],
  ['invalid calendar month', CalendarPage, '/social/calendar', { month: '2026-13' }, 'Content calendar', 'Reset calendar'],
  ['invalid calendar page', CalendarPage, '/social/calendar', { month: '2026-09', page: '0' }, 'Content calendar', 'Reset calendar'],
];
async function fixture(user, testContext) {
  const t = await setup({ auth: true });
  testContext.after(() => t.raw.close());
  const cookie = user ? (await t.signIn(`${user}@example.com`)).cookie : '';
  return (Page, route, query) => {
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    return workAsyncStorage.run({ route }, () => workUnitAsyncStorage.run({
      type: 'request', phase: 'render', headers: new Headers({ cookie }),
    }, () => Page({ searchParams: Promise.resolve(query) })));
  };
}
for (const [label, Page, route, query, title, recovery] of cases) {
  test(`${label} keeps a page heading, announced error and reset link`, async t => {
    const render = await fixture('ellen', t);
    const html = renderToStaticMarkup(await render(Page, route, query));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`));
    assert.match(html, /role="alert"/);
    const reset = html.match(new RegExp(`<a[^>]*href="${route}"[^>]*>(.*?)</a>`));
    assert.equal(reset?.[1].replace(/<[^>]*>/g, ''), recovery);
  });
  for (const [user, destination] of [[null, '/sign-in'], ['james', '/portal']]) {
    test(`${label} still authorizes ${user || 'anonymous'} before rendering query errors`, async t => {
      const render = await fixture(user, t);
      await assert.rejects(render(Page, route, query), error => getURLFromRedirectError(error) === destination);
    });
  }
}
