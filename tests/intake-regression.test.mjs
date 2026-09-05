// Production intake regressions. These cover the two live failures reproduced before this fix.
import './_jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFile } from 'node:fs/promises';

import { ORIGIN, ORIGIN_FIELDS, resolveOrigin, originValues } from '../lib/origin.mjs';
import { SEND_DEFAULTS } from '../lib/send-policy.mjs';

const loadPreview = async () => (await import('../components/ImportPreview.jsx')).default;

function visibleText(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('Add Prospect binds every origin column in database order', async () => {
  const resolved = resolveOrigin({
    origin_class: ORIGIN.OTHER,
    origin_subtype: 'Acceptance test',
    origin_batch: 'batch-1',
    origin_query: 'test query',
    origin_at: '2026-08-10 11:27:00',
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(ORIGIN_FIELDS, [
    'origin_class', 'origin_subtype', 'origin_batch', 'origin_query', 'origin_at',
  ]);
  assert.deepEqual(originValues(resolved.origin), [
    'OTHER', 'Acceptance test', 'batch-1', 'test query', '2026-08-10 11:27:00',
  ]);

  const route = await readFile('app/api/prospects/route.js', 'utf8');
  assert.match(route, /origin_class, origin_subtype, origin_batch, origin_query, origin_at/);
  assert.match(route, /\.\.\.originValues\(origin\)/);
});

test('CSV import validates and stores the same five origin fields', async () => {
  const route = await readFile('app/api/prospects/import/route.js', 'utf8');
  for (const field of ORIGIN_FIELDS) assert.ok(route.includes(`'${field}'`), `${field} must be accepted from CSV`);
  assert.match(route, /const originIn = resolveOrigin\(raw\)/);
  assert.match(route, /\.\.\.originValues\(r\.origin\)/);
  assert.match(route, /Row \$\{records\.length \+ 2\}/, 'bad rows must identify themselves instead of crashing');
});

test('CSV preview renders its counts without an undefined Stat component', async () => {
  const ImportPreview = await loadPreview();
  const html = renderToString(React.createElement(ImportPreview, {
    preview: { total: 3, toInsert: 2, skipped: 1 },
    onCancel() {},
    onConfirm() {},
  }));
  const text = visibleText(html);
  assert.match(text, /Ready to import\?/);
  assert.match(text, /In CSV 3/);
  assert.match(text, /To insert 2/);
  assert.match(text, /Duplicates skipped 1/);
});

test('intake fixes do not enable either send switch', () => {
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});
