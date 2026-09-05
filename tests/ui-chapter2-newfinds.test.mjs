// Chapter 2: one pipeline home.
//
// Leads and Prospects were two top-level workspaces for one human journey.
// These tests pin the merge: New finds is a tab of Prospects, the old Leads
// route still resolves, the unread count moved onto the tab, and none of the
// triage behavior (promote, delete, filters, endpoints) changed shape.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { NAV, ALL_VIEWS, OFF_RAIL_VIEWS } from '../lib/nav-structure.mjs';
import { TABS } from '../lib/prospect-tabs.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const SHELL = src('components/ProspectsApp.jsx');
const INBOX = src('components/LeadInbox.jsx');

function visibleText(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// ── 1. Leads has no navigation entry of its own ─────────────────────────────

test('Leads is gone from the rail; the pipeline has one home', () => {
  assert.ok(!NAV.some((t) => t.key === 'inbox' || t.label === 'Leads'));
  assert.deepEqual(NAV.filter((t) => t.section === 'Work').map((t) => t.key), ['journey', 'today', 'prospects', 'clients', 'health']);
});

// ── 2, 3. New finds is a Prospects subview and the old route still works ────

test('the old #leads route still resolves to the same triage screen', () => {
  assert.ok(OFF_RAIL_VIEWS.includes('inbox'), 'off-rail, not deleted');
  assert.ok(ALL_VIEWS.includes('inbox'));
  assert.match(SHELL, /HASH_TO_VIEW = \{ leads: 'inbox' \}/, 'the #leads alias is untouched');
  assert.match(SHELL, /view === 'inbox' \? \(/, 'the view still renders');
});

test('both screens share one tab strip: New finds sits inside Prospects', () => {
  // Prospects offers the New finds door with the moved count.
  assert.match(SHELL, /newFinds=\{\{ count: newLeadCount, active: false, onOpen: \(\) => setView\('inbox'\) \}\}/);
  // The Leads view renders the same strip with New finds active, and picking
  // a pipeline tab walks straight back into Prospects.
  assert.match(SHELL, /newFinds=\{\{ count: newLeadCount, active: true \}\}/);
  // Chapter 8 added pickedTab, which freezes the urgency-based opening pick
  // the moment a tab is chosen deliberately. The walk back into Prospects
  // is otherwise unchanged.
  assert.match(SHELL, /onTab=\{\(t\) => \{ pickedTab\.current = true; setView\('prospects'\); setTab\(t\); setActionFilter\(null\); \}\}/);
});

test('the strip renders New finds first, with the count, as a real tab', async () => {
  const ProspectTabs = (await import('../components/ProspectTabs.jsx')).default;
  const html = renderToString(React.createElement(ProspectTabs, {
    tab: null, onTab() {}, counts: {},
    newFinds: { count: 12, active: true },
  }));
  const text = visibleText(html);
  assert.ok(text.startsWith('New finds 12'), 'first tab, count beside it');
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*?New finds/);
  assert.ok(text.includes('Raw finds awaiting your look'), 'the blurb explains what these people are');
  // The six pipeline tabs are all still there, none claiming active.
  for (const t of TABS) assert.ok(text.includes(t.label), `${t.label} still present`);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
});

test('on the Prospects side the New finds tab is quiet and the current tab stays active', async () => {
  const ProspectTabs = (await import('../components/ProspectTabs.jsx')).default;
  const html = renderToString(React.createElement(ProspectTabs, {
    tab: 'all', onTab() {}, counts: { all: 5 },
    newFinds: { count: 3, active: false, onOpen() {} },
  }));
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1, 'exactly one active tab');
  assert.ok(visibleText(html).includes('New finds 3'));
});

// ── 4. The triage screen itself is intact ───────────────────────────────────

test('LeadInbox still renders its whole triage surface, retitled only', () => {
  assert.ok(INBOX.includes('New finds</h1>'), 'the page title joins the new vocabulary');
  assert.ok(!/>[^<]*\bLeads\b[^<]*<\/h1>/.test(INBOX), 'no second pipeline title');
});

test('promote, delete, and triage still speak to the exact same endpoints', () => {
  const endpoints = [...INBOX.matchAll(/fetch\('(\/api\/[a-z/-]+)[?']/g)].map((m) => m[1]);
  const unique = [...new Set(endpoints)].sort();
  // The screen's backend surface, frozen: leads CRUD, settings, AI helpers,
  // limits, imports, and the scan/enrich pipeline. Anything appearing or
  // vanishing here is a semantics change Chapter 2 is not allowed to make.
  assert.deepEqual(unique, [
    '/api/ai', '/api/import/apify', '/api/leads', '/api/limits',
    '/api/scan', '/api/scan/enrich', '/api/scan/import', '/api/settings',
  ]);
});

test('the unread count moved to the tab and still comes from the same source', () => {
  assert.match(SHELL, /setNewLeadCount\(\(d\.leads \|\| \[\]\)\.length\)/, 'same count, same feed');
  // And no other top-level badge pile was created: the rail no longer knows
  // about inbox at all.
  assert.ok(!/key: 'inbox'/.test(src('lib/nav-structure.mjs')));
});

// ── 9, 15. Nothing else moved ───────────────────────────────────────────────

test('no backend endpoint, package, or send semantics changed in the shell', () => {
  assert.ok(!/action: 'send'/.test(INBOX), 'the triage screen still cannot send email');
  assert.ok(!NAV.some((t) => /conversation/i.test(t.key) || /conversation/i.test(t.label)), 'no Conversations placeholder appeared');
});
