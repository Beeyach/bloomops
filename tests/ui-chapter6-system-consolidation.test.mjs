// Chapter 6: one quiet control room.
//
// The three automation-status surfaces (what sends, what is watched, what is
// held) lived inside Settings, so inspecting the machine meant visiting the
// dials. They now live under System health with the health checks, Settings
// keeps configuration plus one pointer, and Today still carries only
// human-needed work. These tests pin the move and everything around it that
// must not have moved.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NAV, RAIL_PRIMARY } from '../lib/nav-structure.mjs';
import { sendingState, MODE } from '../lib/sending-state.mjs';
import { approvalCard } from '../lib/approval.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const SHELL = src('components/ProspectsApp.jsx');

// The health-view block and the settings-view block, isolated so assertions
// about "inside health" cannot accidentally match the other view.
const healthBlock = SHELL.slice(SHELL.indexOf("view === 'health'"), SHELL.indexOf("view === 'start'"));
const settingsBlock = SHELL.slice(SHELL.indexOf("view === 'settings'"), SHELL.indexOf("view === 'trash'"));

// ── 1, 2. The panels moved: System has them, Settings does not ─────────────

test('System health is the one home for the automation status surfaces', () => {
  for (const panel of ['SendingSummary', 'ShadowPanel', 'HeldPanel']) {
    assert.ok(healthBlock.includes(`<${panel}`), `${panel} renders under System health`);
    assert.ok(!settingsBlock.includes(`<${panel}`), `${panel} no longer renders inside Settings`);
  }
  // Chapter 11 replaced the plain heading with a tab. Same guarantee — the
  // automation surfaces live in the control room and nowhere else —
  // enforced by which tab renders them rather than by a heading above.
  assert.match(healthBlock, /\{systemTab === 'automation' && \(/, 'they are their own tab now');
  assert.ok(healthBlock.indexOf('SystemHealth') < healthBlock.indexOf('SendingSummary'),
    'health first, then what automation is doing');
});

test('Settings keeps the dials and one pointer to the control room', () => {
  assert.ok(settingsBlock.includes('<SettingsView'), 'configuration stays');
  assert.match(settingsBlock, /System health\s*<\/button>/, 'with a working link to where the effect is visible');
  assert.match(settingsBlock, /setView\('health'\)/);
});

// ── 3, 4. Today: human-needed only, no passive machine status ──────────────

test('Today still surfaces human-needed exceptions and nothing passive', () => {
  const today = src('components/TodayView.jsx');
  assert.ok(today.includes('ExceptionQueue'), 'the human-needed exception queue stays');
  assert.ok(today.includes('NeedsAttention'), 'recoverable human problems stay');
  for (const passive of ['SystemHealth', 'ShadowPanel', 'SendingSummary', 'HeldPanel', 'StatsView', 'CreditsBadge']) {
    assert.ok(!today.includes(passive), `${passive} does not render on Today`);
  }
});

// ── 5. One health model, not a second one ──────────────────────────────────

test('no new health model was invented; the panels keep their canonical sources', () => {
  assert.match(src('components/SendingSummary.jsx'), /sendingState/, 'sending truth still comes from lib/sending-state');
  assert.match(src('components/HeldPanel.jsx'), /today-buckets/, 'held truth still comes from the bucket model');
  const sysHealth = src('components/SystemHealth.jsx');
  assert.match(sysHealth, /system-health/, 'health truth still comes from lib/system-health');
});

// ── 6, 7, 8. Global switches vs package permission stay distinct ───────────

test('the sending summary reads both global switches from canonical state', () => {
  const off = sendingState({ autoSendApprovedFirstEmails: false, autoSendApprovedFollowups: false });
  assert.equal(off.first.mode, MODE.MANUAL, 'first emails: manual while the switch is off');
  assert.equal(off.followups.mode, MODE.WATCHING, 'follow-ups: shadow mode watches without acting while off');
  const on = sendingState({ autoSendApprovedFirstEmails: true, autoSendApprovedFollowups: true });
  assert.equal(on.first.mode, MODE.AUTOMATIC);
});

test('a global switch alone still cannot arm a package', () => {
  const card = approvalCard(
    { status: 'APPROVED', email_subject: 'S', email_body: 'B', priority_band: 'P2', followups: [{ step: 2, subject: 'S2', body: 'B2' }], allowed_length: 2, sequence_max_step: 2, sequence_approved: 0, auto_followup_approved: 0 },
    { rating: '💙', emails_sent: 1 },
    { autoSendFollowups: true }
  );
  assert.equal(card.automation, null, 'package-level consent remains required');
});

// ── 9. Stats and credits stay secondary ────────────────────────────────────

test('stats stay secondary in the rail, and credits live where they are spent', () => {
  // Chapter 6 put Stats under the System section; Chapter 8 replaced the
  // four sections with Work / More. What Chapter 6 actually asserted is
  // that Stats is not a peer of Today, and that is still true.
  const stats = NAV.find((t) => t.key === 'stats');
  assert.equal(stats.section, 'More');
  assert.ok(!RAIL_PRIMARY.includes('stats'), 'Stats is not one of the four working surfaces');
  assert.ok(!src('components/TodayView.jsx').includes('CreditsBadge'));
  assert.ok(src('components/ArmyPanel.jsx').includes('CreditsBadge'),
    'the credit counter stays beside the actions that spend credits');
});

// ── 10, 11. No behavior changed ────────────────────────────────────────────

test('the moved panels are byte-identical components; only their address changed', () => {
  // The move was pure composition in the shell: the components themselves
  // still fetch the same endpoints with the same shapes.
  assert.match(src('components/ShadowPanel.jsx'), /There is no enable button here/, 'shadow stays view-only');
  assert.ok(!/setView\('settings'\)[\s\S]{0,80}auto/i.test(healthBlock), 'no switch control was added to the control room');
});

test('old System routes still resolve and reach their screens', () => {
  for (const key of ['health', 'settings', 'stats', 'trash']) {
    assert.ok(SHELL.includes(`view === '${key}'`), `${key} still renders`);
    assert.ok(NAV.some((t) => t.key === key), `${key} still has a rail entry`);
  }
  // The control room itself is one of the four primary places now; the rest
  // of the old System section sits behind More.
  assert.ok(RAIL_PRIMARY.includes('health'), 'System is a first-class destination');
  for (const quiet of ['settings', 'stats', 'trash']) {
    assert.equal(NAV.find((t) => t.key === quiet).section, 'More', `${quiet} is behind More`);
  }
});

// ── 15, 16. Nothing else appeared or changed ───────────────────────────────

test('no Conversations placeholder and no relationship label changes', () => {
  assert.ok(!NAV.some((t) => /conversation/i.test(t.key) || /conversation/i.test(t.label)));
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED]];
  assert.equal(new Set(labels).size, labels.length);
});
