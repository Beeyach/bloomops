import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { default: ClientWorkOverview, ClientWorkError, ClientWorkLoading } = await import('../components/bloomops/ClientWorkOverview.jsx');
import { setup, NOW } from './_work-projections.mjs';
import { clientOverview } from '../lib/bloomops/client-overview.mjs';

const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
test('real overview has labelled sections, canonical navigation and escaped record names', async () => {
  const t = await setup(); t.action('a', { title: '<script>unsafe()</script>', due_date: '2026-09-09' });
  const html = render(ClientWorkOverview, { clientId: 'james', overview: await clientOverview(t.db, t.owner, 'james', { now: NOW }) });
  for (const title of ['Purchased services','Current work','Next deadline','Open requests']) assert.ok(html.includes(title));
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/); assert.doesNotMatch(html, /<script| · |Preview|notifications/i);
  assert.match(html, /href="\/work\/actions\/a"/); assert.match(html, /clientId=james/);
  assert.match(html, /href="\/clients\/james\?tab=projects"/);
  assert.doesNotMatch(html, /tab=projects&amp;clientId=/);
  assert.match(html, /Onboarding has not been created yet/); assert.match(html, /Dates in UTC/);
});
test('loading and failed reads never imply empty or complete work', () => {
  const loading = render(ClientWorkLoading), failed = render(ClientWorkError, { clientId: 'james' });
  assert.match(loading, /role="status"/); assert.match(loading, /Loading client overview/);
  assert.match(failed, /could not be loaded/); assert.match(failed, /Try again/);
  assert.doesNotMatch(loading + failed, /No open|No upcoming|complete/);
});
