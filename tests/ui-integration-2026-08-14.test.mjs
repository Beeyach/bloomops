// The six chapters, assembled.
//
// Each chapter has its own suite proving its own claim. This file proves the
// things that are only true once they are stacked: that Chapter 7's visual
// vocabulary reached the surfaces Chapters 2, 3 and 5 brought in, that no
// chapter quietly undid another's semantics, and that the two systems in
// globals.css compose instead of one overwriting the other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NAV, ALL_VIEWS, OFF_RAIL_VIEWS } from '../lib/nav-structure.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';
import { approvalCard } from '../lib/approval.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const CSS = src('app/globals.css');
const SHELL = src('components/ProspectsApp.jsx');

// Every surface a person touches on an ordinary day, after all six chapters.
const DAILY_SURFACES = [
  'components/GlassRail.jsx', 'components/TodayView.jsx', 'components/ProspectTabs.jsx',
  'components/ProspectListRow.jsx', 'components/ProspectDrawer.jsx', 'components/ProspectHeadline.jsx',
  'components/SystemHealth.jsx', 'components/ApprovalQueue.jsx', 'components/Followups.jsx',
  'components/NeedsAttention.jsx', 'components/ExceptionQueue.jsx', 'components/LeadInbox.jsx',
];

// ── 1-4. Structure: Chapter 1 + Chapter 2 together ─────────────────────────

test('the rail is Today / Prospects / Clients / System over one collapsed More', () => {
  assert.deepEqual(NAV.filter((t) => t.section === 'Work').map((t) => t.key),
    ['journey', 'today', 'prospects', 'clients', 'health']);
  assert.deepEqual(NAV.filter((t) => t.section === 'More').map((t) => t.key).sort(),
    ['army', 'settings', 'start', 'stats', 'trash', 'workspace']);
});

test('New finds lives inside Prospects, and the old #leads link still resolves', () => {
  assert.ok(!NAV.some((t) => t.key === 'inbox'), 'no separate Leads destination');
  assert.ok(OFF_RAIL_VIEWS.includes('inbox') && ALL_VIEWS.includes('inbox'), 'the route survives');
  assert.match(SHELL, /HASH_TO_VIEW = \{ leads: 'inbox' \}/);
  assert.match(SHELL, /newFinds=\{\{ count: newLeadCount, active: true \}\}/);
});

test('no Conversations placeholder was introduced by any chapter', () => {
  assert.ok(!NAV.some((t) => /conversation/i.test(t.key) || /conversation/i.test(t.label)));
  assert.ok(!ALL_VIEWS.some((v) => /conversation/i.test(v)));
});

test('every old route still resolves in the assembled shell', () => {
  for (const key of ['today', 'prospects', 'inbox', 'clients', 'stats', 'army', 'guide-automation',
    'guide-agents', 'guide-sourcing', 'start', 'workspace', 'prompts', 'health', 'settings', 'trash', 'handsoff']) {
    assert.ok(ALL_VIEWS.includes(key), `${key} is a preserved route`);
    assert.ok(SHELL.includes(`view === '${key}'`), `the shell still renders ${key}`);
  }
});

// ── 5-7. Chapter 3 safety semantics survived the restyle ───────────────────

test('a hard stop still suppresses the next action entirely', () => {
  const head = src('components/ProspectHeadline.jsx');
  assert.match(head, /p\.do_not_contact \? 'Do not contact' : p\.unsubscribed \? 'Unsubscribed' : null/);
  assert.match(head, /They asked for no further contact/);
  // The Next box is inside the else branch, so a boundary cannot render one.
  assert.match(head, /\{boundary \? \([\s\S]*?\) : \([\s\S]*?Next[\s\S]*?\)\}/);
});

test('Activity and technical detail stay out of the way, evidence still one click deep', () => {
  const drawer = src('components/ProspectDrawer.jsx');
  // Chapter 8 replaced the disclosures with tabs. Same guarantee: neither
  // the log nor the technical dump is on the surface you land on.
  assert.match(drawer, /tab === 'activity'/, 'Activity is its own place');
  assert.match(drawer, /tab === 'more' &&[\s\S]*?<SystemDetails/, 'technical is last, inside More');
  assert.match(drawer, /<ProspectCard prospect=\{p\} onNavigate=\{onNavigate\} \/>/, 'why-chosen evidence unchanged');
  assert.ok(drawer.lastIndexOf('SystemDetails') > drawer.indexOf('ProspectCard'), 'technical after evidence');
  assert.match(drawer, /useState\(initialTab \|\| 'overview'\)/, 'and Overview is where a prospect opens');
});

// ── 8-9. Chapter 5 consequence hierarchy survived the restyle ──────────────

test('Send now is still the single strongest action, distinct from approvals', () => {
  const q = src('components/ApprovalQueue.jsx');
  assert.equal((q.match(/btn-send/g) || []).length, 1, 'exactly one send-class control');
  assert.ok(q.includes('btn-approve'), 'Email 1 approval has its own class');
  assert.ok(q.includes('btn-approve-2nd'), 'sequence approval is the quieter one');
  assert.ok(!/btn-send[^"]*btn-approve/.test(q), 'the classes never collapse onto one control');
  assert.match(q, /\{busy === item\.id \? 'Sending…' : 'Send now'\}/, 'no double-submit ambiguity');
});

test('auto-followup is still a package-level stateful switch, not a global one', () => {
  const q = src('components/ApprovalQueue.jsx');
  assert.match(q, /role="switch"/);
  assert.match(q, /aria-checked=\{card\.automation\.approved \? 'true' : 'false'\}/);
  assert.match(q, /act\(item, 'auto-followup', \{ allow: !card\.automation\.approved \}\)/, 'same backend action');
  // And the invariant itself: a global switch alone can never arm a package.
  const base = {
    status: 'APPROVED', email_subject: 'S', email_body: 'B', priority_band: 'P2',
    followups: [{ step: 2, subject: 'S2', body: 'B2' }], allowed_length: 2, sequence_max_step: 2,
  };
  const noSeq = approvalCard({ ...base, sequence_approved: 0, auto_followup_approved: 0 },
    { rating: '💙', emails_sent: 1 }, { autoSendFollowups: true });
  assert.equal(noSeq.automation, null, 'package-level consent still required');
});

// ── 10-11. Chapter 6 control room survived ─────────────────────────────────

test('System owns the passive automation panels and Today does not', () => {
  const healthBlock = SHELL.slice(SHELL.indexOf("view === 'health'"), SHELL.indexOf("view === 'start'"));
  const settingsBlock = SHELL.slice(SHELL.indexOf("view === 'settings'"), SHELL.indexOf("view === 'trash'"));
  for (const panel of ['SendingSummary', 'ShadowPanel', 'HeldPanel']) {
    assert.ok(healthBlock.includes(`<${panel}`), `${panel} lives under System health`);
    assert.ok(!settingsBlock.includes(`<${panel}`), `${panel} left Settings`);
  }
  const today = src('components/TodayView.jsx');
  for (const passive of ['SystemHealth', 'ShadowPanel', 'SendingSummary', 'HeldPanel', 'StatsView', 'CreditsBadge']) {
    assert.ok(!today.includes(passive), `${passive} is not on Today`);
  }
  assert.ok(today.includes('ExceptionQueue'), 'human-needed exceptions stay');
});

// ── 12-14. Chapter 7's vocabulary reached everything the others brought ────

test('the visual vocabulary covers every daily surface, including the ones Ch2/3/5 merged in', () => {
  for (const rel of DAILY_SURFACES) {
    const s = src(rel);
    const rawType = s.match(/text-\[[0-9.]+px\]/g) || [];
    const rawRadius = s.match(/rounded-\[[0-9]+px\]/g) || [];
    assert.deepEqual(rawType, [], `${rel} has raw font sizes: ${[...new Set(rawType)].join(', ')}`);
    assert.deepEqual(rawRadius, [], `${rel} has raw radii: ${[...new Set(rawRadius)].join(', ')}`);
  }
});

test('disabled controls on daily surfaces use explicit tokens, never stacked opacity', () => {
  for (const rel of DAILY_SURFACES) {
    const stacked = src(rel).match(/disabled:opacity-\d+/g) || [];
    assert.deepEqual(stacked, [], `${rel} still fades disabled text`);
  }
  assert.match(CSS, /\.ui-control:disabled\{[\s\S]*?opacity:1/);
});

test('both stylesheets compose: no class is defined twice', () => {
  // Chapter 7 owns the shared vocabulary, Chapter 5 the action consequence.
  // If a merge had let one overwrite the other, a class would appear twice
  // or vanish. Both must be present, exactly once each.
  for (const cls of ['.btn-send{', '.btn-approve{', '.btn-approve-2nd{', '.switch-pill{',
    '.ui-body{', '.ui-small{', '.ui-meta{', '.r-md{', '.r-lg{']) {
    assert.equal(CSS.split(cls).length - 1, 1, `${cls} is defined exactly once`);
  }
});

// ── 15-17. Nothing semantic drifted ────────────────────────────────────────

test('relationship labels remain distinct after six merges', () => {
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED], REL_LABEL[REL.WON]];
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(!labels.includes('Rejected'), 'no collapse into one bucket');
  assert.ok(!labels.includes('Sequence finished'), 'no global rename');
});

test('the stage vocabulary was never string-replaced', () => {
  assert.ok(/export const STAGES = \[[^\]]*'Rejected'/s.test(src('lib/db.js')));
});

test('no backend endpoint changed anywhere in the assembled UI', () => {
  // The approval surface still speaks to exactly one endpoint, and the
  // triage surface to exactly the eight it always did.
  const q = src('components/ApprovalQueue.jsx');
  assert.deepEqual([...new Set([...q.matchAll(/fetch\('([^'?]+)/g)].map((m) => m[1]))], ['/api/outreach']);
  const inbox = src('components/LeadInbox.jsx');
  assert.deepEqual([...new Set([...inbox.matchAll(/fetch\('(\/api\/[a-z/-]+)[?']/g)].map((m) => m[1]))].sort(),
    ['/api/ai', '/api/import/apify', '/api/leads', '/api/limits',
     '/api/scan', '/api/scan/enrich', '/api/scan/import', '/api/settings']);
});
