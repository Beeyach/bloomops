import './_jsx.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { FileList, PortalFiles, DeliverableFiles } = await import('../components/bloomops/Files.jsx');
const { PortalProjects } = await import('../components/bloomops/Projects.jsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const file = { id: 'opaque', filename: 'Café handoff.txt', mimeType: 'text/plain', byteSize: 16, readyAt: '2026-09-08T12:00:00Z', attachmentLabel: 'Your website' };
test('portal empty Files disappear and safe rows have accessible, pre-hydration guarded download controls', () => {
  assert.equal(render(PortalFiles, { summary: { items: [] } }), ''); const markup = render(PortalFiles, { summary: { items: [file] } });
  assert.match(markup, /Shared files/); assert.match(markup, /Download Café handoff.txt/); assert.match(markup, /disabled/); assert.match(markup, /Your website/);
  assert.doesNotMatch(markup, /uploader|revision|workspace|Restricted|Internal|Uploading|Archive|Change file/);
});
test('internal pending/failed rows explain status and never offer a byte download', () => {
  for (const status of ['uploading', 'failed', 'archived']) { const markup = render(FileList, { items: [{ ...file, status, visibility: 'internal' }] }); assert.doesNotMatch(markup, /Download/); assert.match(markup, /Internal/); }
  assert.match(render(FileList, { items: [{ ...file, status: 'ready', visibility: 'restricted' }] }), /Download/);
});
test('Deliverable attachments show only actual Ready Files; portal Files live under the Project', () => {
  assert.equal(render(DeliverableFiles, { items: [{ ...file, status: 'failed' }] }), ''); assert.match(render(DeliverableFiles, { items: [{ ...file, status: 'ready' }] }), /Attached files/);
  const markup = render(PortalProjects, { projects: [{ id: 'project', label: 'Launch', statusLabel: 'Planned' }], files: { project: { items: [file] } } }); assert.match(markup, /Launch/); assert.match(markup, /Café handoff/);
});
test('upload, retry, visibility and archive reuse guarded Bloom controls, live status and stable focus restoration', () => {
  const source = readFileSync(new URL('../components/bloomops/FileControls.jsx', import.meta.url), 'utf8');
  assert.match(source, /pending\.current/); assert.match(source, /disabled=\{busy \|\| !ready\}/); assert.match(source, /type="file"/); assert.match(source, /FILE_MAX_BYTES/);
  assert.match(source, /focusAfter/); assert.match(source, /aria-live="polite"/); assert.match(source, /Same|same original file/); assert.doesNotMatch(source, /presigned|objectKey|bucket|version|approval/i);
});
