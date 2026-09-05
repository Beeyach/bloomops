import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV, SECTIONS, ALL_VIEWS, OFF_RAIL_VIEWS } from '../lib/nav-structure.mjs';
import { LAYOUT_KEY, buildDefaultLayout, reconcile } from '../lib/nav-layout.mjs';
import { NEEDS_YOU_LIMIT, DUE_LIMIT } from '../lib/today-sections.mjs';
import { TODAY_APPROVALS_LIMIT, PREVIEW } from '../lib/today-buckets.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// ── the rail ────────────────────────────────────────────────────────────────

test('the primary rail is Work first: Today, Prospects, Clients, System', () => {
  assert.equal(SECTIONS[0], 'Work');
  const work = NAV.filter((t) => t.section === 'Work').map((t) => t.key);
  // Chapter 2: Leads left the rail entirely; New finds lives inside
  // Prospects. The route still resolves (asserted below).
  // Chapter 8: System joined the primary group and everything else moved
  // behind one More, because four section headers over ten rows was still
  // ten rows to read.
  // 2026-08-27: Journey joined first — the five-tab rebuild Ary asked for.
  assert.deepEqual(work, ['journey', 'today', 'prospects', 'clients', 'health']);
  assert.ok(!NAV.some((t) => t.key === 'inbox'), 'no separate Leads destination');
});

test('there is no Conversations entry before the feature exists', () => {
  assert.ok(!NAV.some((t) => /conversation/i.test(t.key) || /conversation/i.test(t.label)));
  assert.ok(!ALL_VIEWS.some((v) => /conversation/i.test(v)), 'no dead future route either');
});

test('Help absorbs the guide entries: one door, guides still routable', () => {
  const labels = NAV.map((t) => t.label);
  assert.ok(labels.includes('Help'));
  for (const guide of ['guide-automation', 'guide-agents', 'guide-sourcing']) {
    assert.ok(!NAV.some((t) => t.key === guide), `${guide} has no rail entry`);
    assert.ok(ALL_VIEWS.includes(guide), `${guide} still resolves`);
  }
  // And Help's page actually links all three, so they are reachable by
  // clicking, not only by hash.
  const startSrc = src('components/StartHerePage.jsx');
  for (const guide of ['guide-automation', 'guide-sourcing', 'guide-agents']) {
    assert.ok(startSrc.includes(`go('${guide}')`), `Start here links ${guide}`);
  }
});

test('non-daily tools live behind one collapsed More, work stays open', () => {
  // Chapter 8: Library / System / Utilities collapsed into a single More.
  // The invariant Chapter 1 was protecting is unchanged — nothing that is
  // not daily work is visible when the rail opens — and it is now enforced
  // by one folder instead of three.
  assert.deepEqual(SECTIONS, ['Work', 'More']);
  const more = NAV.filter((t) => t.section === 'More').map((t) => t.key).sort();
  assert.deepEqual(more, ['army', 'settings', 'start', 'stats', 'trash', 'workspace'],
    'stats, templates, help, AI helpers, settings and trash are all one disclosure away');
  const layout = buildDefaultLayout(NAV, SECTIONS);
  const collapsed = Object.fromEntries(layout.map((s) => [s.id, s.collapsed]));
  assert.equal(collapsed.Work, false, 'work greets you open');
  // Ary's call, 2026-08-18: More greets you open too; her pages live in it.
  assert.equal(collapsed.More, false, 'More starts open');
  assert.equal(layout.length, 2, 'and there is nothing else to read');
});

test('every old view key still resolves in the shell', () => {
  const shell = src('components/ProspectsApp.jsx');
  const before = [
    'today', 'prospects', 'inbox', 'clients', 'stats', 'army',
    'guide-automation', 'guide-agents', 'guide-sourcing', 'start', 'workspace',
    'prompts', 'health', 'settings', 'trash', 'handsoff', 'page',
  ];
  for (const key of before) {
    assert.ok(ALL_VIEWS.includes(key), `${key} is a preserved route`);
    if (key !== 'page') assert.ok(shell.includes(`view === '${key}'`), `shell still renders ${key}`);
  }
  assert.ok(OFF_RAIL_VIEWS.every((v) => !NAV.some((t) => t.key === v)), 'off-rail views have no rail entry');
});

test('a layout saved against the old sections cannot resurrect them', () => {
  assert.notEqual(LAYOUT_KEY, 'ltb_nav_layout', 'the storage key is bumped');
  assert.notEqual(LAYOUT_KEY, 'ltb_nav_layout_v2', 'and bumped again for the Chapter 8 sections');
  // Even if an old blob were fed in, reconcile re-homes every tab into the
  // new built-in sections rather than reviving Pipeline/AI/Resources tabs.
  const stale = { sections: [{ id: 'Pipeline', title: 'Pipeline', collapsed: false, builtin: true, tabs: ['today', 'nonexistent-view'] }] };
  const { sections } = reconcile(stale, NAV, SECTIONS);
  const everyTab = sections.flatMap((s) => s.tabs);
  assert.ok(!everyTab.includes('nonexistent-view'), 'unknown tabs drop out');
  assert.ok(NAV.every((t) => everyTab.includes(t.key)), 'every built-in tab still has a home');
});

// ── Today ───────────────────────────────────────────────────────────────────

test('Today caps hold: replies 6, approvals 3, follow-ups due 8', () => {
  assert.equal(NEEDS_YOU_LIMIT, 6);
  assert.equal(TODAY_APPROVALS_LIMIT, 3);
  assert.ok(TODAY_APPROVALS_LIMIT < PREVIEW, 'Today draws fewer approval cards than the full queue view');
  assert.equal(DUE_LIMIT, 8);
  const today = src('components/TodayView.jsx');
  assert.ok(today.includes('previewLimit={TODAY_APPROVALS_LIMIT}'), 'the cap is actually passed');
});

test('Today does not fake a conversational Follow up? group before the turn branch', () => {
  const today = src('components/TodayView.jsx');
  assert.ok(!/Follow up\?/.test(today), 'no invented group; the due list keeps its own name');
  assert.ok(!/FOLLOWUP_ELIGIBLE/.test(today), 'no reaching for state this base does not have');
});

test('Today sheds its instructional clutter and shrinks the greeting', () => {
  const today = src('components/TodayView.jsx');
  assert.ok(!today.includes('How Today works'), 'the explainer paragraph is gone');
  assert.ok(!today.includes('today-sections-v1'), 'the four-sections hint is gone');
  assert.ok(!today.includes('text-[34px]'), 'the greeting is no longer the loudest thing on the page');
  assert.ok(today.includes('upcomingCountOnly'), 'upcoming follow-ups render as a count, not rows');
  // Chapter 9: the section titles come from the tab definitions rather than
  // being written into the view, so the strip and the panel cannot disagree.
  // Chapter 12: the panel drew the tab's name a third time and its count a
  // fourth. The tab above IS the title; the panel keeps only the blurb.
  assert.ok(today.includes('<Section blurb={tabDef.blurb}>'), 'the panel carries the blurb, not a second title');
  const tabs = src('lib/today-tabs.mjs');
  for (const label of ['Replies', 'Approvals', 'Follow-ups', 'Decisions', 'Exceptions']) {
    assert.ok(tabs.includes(`label: '${label}'`), `${label} is one of Today's places`);
  }
});

test('completed onboarding cannot dominate Today', () => {
  const onboarding = src('components/OnboardingChecklist.jsx');
  assert.ok(onboarding.includes('if (!state || established) return null;'),
    'an established workspace never sees the checklist');
});

// ── wording safety ──────────────────────────────────────────────────────────

test('no global Rejected -> Sequence finished substitution happened', () => {
  const stagesBlock = src('lib/db.js');
  assert.ok(/export const STAGES = \[[^\]]*'Rejected'/s.test(stagesBlock), 'the stage vocabulary is untouched');
  // The canonical relationship labels stay distinct: an ordinary decline, a
  // hard no, and a deferral must never collapse into one word.
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED]];
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(!labels.includes('Sequence finished'));
});

test('package approval semantics are untouched by this chapter', () => {
  // Chapter 1 only threads a preview-count prop through ApprovalQueue. The
  // send/approve handlers still call the same endpoints with the same bodies.
  const q = src('components/ApprovalQueue.jsx');
  for (const marker of ["action === 'approve'", "'auto-followup'", 'Send now', '--i-mean-it']) {
    if (marker === '--i-mean-it') { assert.ok(!q.includes(marker)); continue; }
    assert.ok(q.includes(marker), `approval surface still carries ${marker}`);
  }
  assert.ok(q.includes('previewLimit = PREVIEW'), 'the only change is the preview default');
});
