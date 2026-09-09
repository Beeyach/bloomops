import './_jsx.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { default: FileControls } = await import('../components/bloomops/FileControls.jsx');
const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
const { PortalHome } = await import('../components/bloomops/PortalHome.jsx');
const render = (Component, props) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: { refresh() {} } }, React.createElement(Component, props)));
test('Content Files reuse controls without B5 attachment language and disable unhydrated writes', () => {
  const html = render(FileControls, { contentId: 'content', summary: { items: [] }, mayManage: true });
  assert.match(html, /Recordings &amp; assets/); assert.match(html, /does not change its production stage/); assert.match(html, /disabled=""/); assert.doesNotMatch(html, /Files for this Project/);
});
test('portal controls contain only safe recordings and no internal mutation controls', () => {
  const html = render(FileControls, { contentId: 'content', portal: true, mayManage: true, summary: { items: [{ id: 'f', filename: '<script>.mp4', mimeType: 'video/mp4', byteSize: 12, status: 'failed', readyAt: null }] } });
  assert.match(html, /Upload recording/); assert.match(html, /Retry upload/); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /Archive file|Change file visibility|Download|Production asset|revision|PRIVATE/);
});
test('portal home conditionally adds recording request links, never general Social or Content navigation', () => {
  const props = { user: { name: 'James', email: 'james@example.com' }, workspaceName: 'Studio', clients: [{ id: 'c', name: 'James', onboarding: null }] };
  assert.doesNotMatch(render(PortalHome, props), /Recording needed|\/recordings/);
  const html = render(PortalHome, { ...props, recordings: [{ id: 'c4', title: 'A short update' }] });
  assert.match(html, /Recording needed/); assert.match(html, /\/portal\/recordings\/c4/); assert.doesNotMatch(html, /href="\/social|href="\/portal\/content/);
});
