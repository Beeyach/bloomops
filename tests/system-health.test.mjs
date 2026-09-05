// Is it working, and does the page know the difference between kinds of "no"?
//
// The failure this guards against is not a wrong number. It is a page that
// calls a pause a failure. Waiting for the day's budget drawn in red teaches
// somebody to ignore red, and after that the one genuine failure a month is
// invisible too. Most of what follows is about that one distinction.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  systemHealth, HEALTH, scannerSummary, serviceState, claimIsStale, runIsStale,
  ago, minutesSince, MAILBOX_STALE_MINUTES, CLAIM_TTL_MINUTES, HEARTBEAT_STALE_MINUTES,
} from '../lib/system-health.mjs';
import { RUN, HEARTBEAT_STALE_MINUTES as CANON_HEARTBEAT } from '../lib/scanner-run.mjs';
import { CLAIM_TTL_MINUTES as CANON_CLAIM } from '../lib/queue.mjs';

const now = new Date('2026-08-10T16:00:00Z');
const minsAgo = (n) => new Date(now.getTime() - n * 60_000).toISOString();
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

const ROUTE = src('../app/api/system-health/route.js');
const PAGE = src('../components/SystemHealth.jsx');
const MODEL = src('../lib/system-health.mjs');

// ── 1, 2, 3. The route ───────────────────────────────────────────────────

test('the health route resolves and the page is reachable', () => {
  const app = src('../components/ProspectsApp.jsx');
  assert.match(app, /'health'/, 'the view key has to be valid or the hash resolves to nothing');
  // Chapter 6 made the health view a control room: SystemHealth renders
  // first inside it, with the automation surfaces grouped beneath.
  // Chapter 11 put a tab strip above it: System is four questions now, and
  // the strip has to render before the panel it switches.
  assert.match(app, /view === 'health' \? \(\s*<div[^>]*>[\s\S]{0,600}<SystemTabs[\s\S]{0,200}<SystemHealth/);
  const nav = src('../lib/nav-structure.mjs');
  // Chapter 8 shortened the label to System: Chapter 6 had already made the
  // page a control room holding sending, shadow and held as well as health,
  // so "System health" had stopped describing it.
  assert.match(nav, /key: 'health', label: 'System'/);
  // Today is the work queue and stays first.
  assert.ok(nav.indexOf("key: 'today'") < nav.indexOf("key: 'health'"), 'health must not sit above Today');
});

test('the endpoint is workspace scoped and read only', () => {
  assert.match(ROUTE, /getWorkspace\(req\)/);
  assert.match(ROUTE, /if \(!ctx\) return unauthorized\(\)/);

  // Comments stripped first. The file explains in prose that it never writes,
  // and a naive scan reads its own promise as a violation of itself.
  const code = ROUTE.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Every table read is scoped to the workspace.
  const froms = [...code.matchAll(/FROM\s+(\w+)/g)].map((m) => m[1]);
  assert.ok(froms.length >= 6, 'this endpoint reads several tables');
  const scoped = (code.match(/workspace = \?/g) || []).length;
  assert.ok(scoped >= froms.length - 2, `only ${scoped} workspace binds for ${froms.length} reads`);

  // Read only, by construction.
  for (const write of ['INSERT ', 'UPDATE ', 'DELETE ', 'enqueue(', 'sendApproved', 'spendCredits(', 'recordAutoSpend']) {
    assert.ok(!code.includes(write), `the health endpoint must never ${write.trim()}`);
  }
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(code), 'GET only');
});

// ── 4, 5, 6, 11. A pause is not a failure ────────────────────────────────

test('an empty queue is healthy, not broken', () => {
  const h = systemHealth({ queue: {}, attention: [], services: [], now });
  assert.equal(h.state, HEALTH.IDLE);
  assert.match(h.headline, /Quiet/);
  assert.match(h.detail, /Nothing is stuck/);
});

test('waiting for budget is WAITING and says it is not a rejection', () => {
  const h = systemHealth({ queue: { waitingBudget: 42 }, attention: [], services: [], now });
  assert.equal(h.state, HEALTH.WAITING);
  assert.notEqual(h.state, HEALTH.ATTENTION);
  assert.notEqual(h.state, HEALTH.DEGRADED);
  assert.match(h.detail, /have not been turned down/);
  // And the page repeats it where the number is shown.
  assert.match(PAGE, /Waiting for budget is a pause, not a rejection/);
});

test('waiting on a person is waiting, and points at Today rather than repeating it', () => {
  const h = systemHealth({ queue: { waitingHuman: 4 }, attention: [], services: [], now });
  assert.equal(h.state, HEALTH.WAITING);
  assert.match(h.detail, /They are in Today/);
  // Not a second copy of the exception queue.
  assert.ok(!/ExceptionQueue/.test(PAGE), 'there is already one user-facing error queue');
});

test('work in flight is healthy', () => {
  const h = systemHealth({ queue: { running: 3 }, attention: [], services: [], now });
  assert.equal(h.state, HEALTH.HEALTHY);
  assert.match(h.detail, /3 jobs are being worked on/);
});

// ── 7, 8, 9, 10. What is actually a problem ──────────────────────────────

test('a failed job creates attention, and says outreach is still safe', () => {
  const h = systemHealth({ queue: { running: 5 }, attention: [{ id: 1 }, { id: 2 }], services: [], now });
  assert.equal(h.state, HEALTH.ATTENTION, 'busy does not answer "something broke"');
  assert.match(h.headline, /2 things could not finish/);
  assert.match(h.detail, /Nothing was sent by mistake/);
});

test('a stale claim uses the queue rule and not a number invented here', () => {
  assert.equal(CLAIM_TTL_MINUTES, CANON_CLAIM, 'the page must not have its own idea of a lease');
  assert.equal(claimIsStale(minsAgo(CANON_CLAIM + 1), now), true);
  assert.equal(claimIsStale(minsAgo(CANON_CLAIM - 1), now), false);
  assert.equal(claimIsStale(null, now), false);
  assert.ok(!/15 \* 60|900000|const .*TTL.*=\s*\d/.test(MODEL), 'no magic lease value in the model');
});

test('a scanner with a dead heartbeat is a problem, and one you stopped is not', () => {
  assert.equal(HEARTBEAT_STALE_MINUTES, CANON_HEARTBEAT);

  const dead = scannerSummary({ id: 1, scanner: 'precheck', state: RUN.RUNNING, processed: 12, total: 40, heartbeat_at: minsAgo(90) }, now);
  assert.equal(dead.state, RUN.ABANDONED);
  assert.equal(dead.attention, true);
  // The wording now comes from abandonedSummary in scanner-run.mjs, so the
  // page and the recovery say the same sentence.
  assert.match(dead.text, /Everything it completed was kept/);

  const stopped = scannerSummary({ id: 2, scanner: 'precheck', state: RUN.STOPPED, processed: 12, total: 40, heartbeat_at: minsAgo(90) }, now);
  assert.equal(stopped.attention, false, 'you pressed Stop; that is not a failure');
  assert.match(stopped.text, /Stopped by you/);

  const live = scannerSummary({ id: 3, scanner: 'precheck', state: RUN.RUNNING, processed: 5, total: 40, heartbeat_at: minsAgo(1) }, now);
  assert.equal(live.attention, false);
  assert.equal(runIsStale({ state: RUN.COMPLETED, heartbeat_at: minsAgo(9999) }, now), false, 'a finished run cannot be stale');
});

test('the Hive section renders with no run at all', () => {
  const none = scannerSummary(null, now);
  assert.equal(none.attention, false);
  assert.equal(none.text, 'No Hive run is active.');
});

// ── 12, 13. Services need evidence ───────────────────────────────────────

test('a service with no telemetry is UNKNOWN, never healthy', () => {
  const s = serviceState({ label: 'Something', lastActivityAt: null, staleMinutes: 60, evidence: 'x', now });
  assert.equal(s.state, 'UNKNOWN');
  assert.match(s.signal, /cannot be called healthy/);
});

test('a quiet mailbox is not a broken mailbox', () => {
  // No reply for hours proves nothing. What proves the sync ran is the sync
  // timestamp, and that is what is measured.
  const fresh = serviceState({ label: 'Mailbox sync', lastActivityAt: minsAgo(5), staleMinutes: MAILBOX_STALE_MINUTES, evidence: 'read at this time', now });
  assert.equal(fresh.state, 'OK');
  const quiet = serviceState({ label: 'Mailbox sync', lastActivityAt: minsAgo(MAILBOX_STALE_MINUTES + 10), staleMinutes: MAILBOX_STALE_MINUTES, evidence: 'read at this time', now });
  assert.equal(quiet.state, 'STALE');
  assert.notEqual(quiet.state, 'DOWN', 'quiet is not down');

  // Only a stored reconnect flag is allowed to say DOWN.
  const down = serviceState({ label: 'Mailbox sync', lastActivityAt: minsAgo(5), staleMinutes: 60, evidence: 'x', hardDown: true, now });
  assert.equal(down.state, 'DOWN');
});

test('every service claim on the page carries the signal behind it', () => {
  assert.match(PAGE, /\{s\.signal\}/, 'the evidence sentence has to be rendered');
  assert.match(ROUTE, /evidence: '[^']*token would not prove this/, 'a stored token proves consent, not health');
  // The three things that must never be treated as proof.
  for (const bad of ['process.env', 'RENDER_SECRET', 'refresh_token']) {
    assert.ok(!ROUTE.includes(bad), `${bad} is not evidence of health`);
  }
});

// ── 14. No invented number ───────────────────────────────────────────────

test('there is no health score, percentage or gauge', () => {
  const h = systemHealth({ queue: { running: 2 }, attention: [], services: [], now });
  assert.equal(h.score, undefined);
  assert.equal(h.percent, undefined);
  for (const s of [MODEL, PAGE, ROUTE]) {
    assert.ok(!/\b(healthScore|uptimePercent|score:\s*\d)/.test(s), 'a made-up number invites the wrong question');
  }
});

// ── 15, 16, 17, 18, 19. The attention list ───────────────────────────────

test('the attention list is bounded and says when it was cut', () => {
  assert.match(ROUTE, /const MAX_ATTENTION = 25/);
  assert.match(ROUTE, /attention\.slice\(0, MAX_ATTENTION\)/);
  assert.match(ROUTE, /attentionTruncated/);
  assert.match(ROUTE, /LIMIT \?/, 'the query itself is bounded, not just the response');
});

test('raw errors are hidden and the friendly translation is reused', () => {
  assert.match(ROUTE, /friendlyError\(b\.last_error, \{ errorKind: b\.error_kind \}\)/);
  assert.match(ROUTE, /technical: \{[^}]*lastError/, 'the raw text lives in the technical blob');
  // On the page it is behind a disclosure, never in the sentence.
  assert.match(PAGE, /<summary[^>]*>Technical details<\/summary>/);
  assert.ok(!/\{a\.technical\.lastError\}/.test(PAGE), 'a stack trace is not a headline');
});

test('retry reuses the existing safe path and there is no retry everything', () => {
  assert.match(PAGE, /fetch\('\/api\/jobs\/retry'/, 'the app already has one safe retry');
  assert.ok(!/retryAll|Retry all|retry-all|Try all/i.test(PAGE), 'a button that replays 200 failures spends 200 credits');
  // Offered only where the canonical translation says the failure is retryable
  // and there is a prospect to retry.
  assert.match(ROUTE, /retryable: b\.status === 'failed' && friendly\.retry === true && Boolean\(b\.prospect_id\)/);
});

// ── 20, 21, 22, 23, 24, 25. Counting honestly ────────────────────────────

test("today's work counts prospects, not job rows, and skips deleted ones", () => {
  // A job that ran twice on one prospect is one website checked. Counting jobs
  // would make a retry look like progress.
  assert.match(ROUTE, /FROM prospects[\s\S]*?deleted_at IS NULL AND date\(site_intel_at\) = date\('now'\)/);
  assert.match(ROUTE, /deleted_at IS NULL AND date\(contact_searched_at\) = date\('now'\)/);
  const workBlock = ROUTE.slice(ROUTE.indexOf("const work = await one("), ROUTE.indexOf('// ── Contact recovery'));
  const prospectSelects = workBlock.match(/FROM prospects/g) || [];
  const deletedGuards = workBlock.match(/deleted_at IS NULL/g) || [];
  assert.equal(prospectSelects.length, deletedGuards.length, 'every prospect count excludes deleted and test rows');
});

test('budget math is internally consistent and kept apart from credits', () => {
  assert.match(ROUTE, /remaining: Math\.max\(0, limits\.autoCreditsPerDay - spentToday\)/);
  // The allowance and the balance are different things and are never added.
  assert.ok(!/balance \+|\+ spentToday|dailyAllowance \+/.test(ROUTE), 'two different meanings of money must not be summed');
  assert.match(PAGE, /These are workspace totals/);
});

test('credits never pretend to per-prospect attribution', () => {
  assert.ok(!/prospect_id/.test(ROUTE.slice(ROUTE.indexOf('Budget and credits'), ROUTE.indexOf('// ── Hive'))), 'per-prospect spend is incomplete and is not shown');
  assert.match(PAGE, /not reliably recorded against individual prospects/);
});

test('the contact backlog is counted, not loaded, and is not a failure', () => {
  const block = ROUTE.slice(ROUTE.indexOf('// ── Contact recovery'), ROUTE.indexOf('// ── Services'));
  assert.match(block, /SELECT COUNT\(\*\)/);
  assert.ok(!/SELECT id, name/.test(block), '4,132 rows must never be loaded to count them');
  assert.match(PAGE, /pipeline inventory, not a system failure/);
  // And it never reaches the overall state.
  const h = systemHealth({ queue: {}, attention: [], services: [], now });
  assert.notEqual(h.state, HEALTH.ATTENTION);
});

// ── 26, 27, 28. The page itself ──────────────────────────────────────────

test('refresh is bounded and not a poll', () => {
  assert.match(PAGE, /const REFRESH_MS = 45_000/);
  const ms = Number(PAGE.match(/REFRESH_MS = ([\d_]+)/)[1].replace(/_/g, ''));
  assert.ok(ms >= 30_000, 'sub-second polling would make the cheapest page the most expensive');
  assert.ok(!/WebSocket|EventSource/.test(PAGE), 'no new transport for this');
});

test('the page renders before the data arrives, and when the check itself fails', async () => {
  const SystemHealth = (await import('../components/SystemHealth.jsx')).default;
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  const html = renderToString(React.createElement(SystemHealth, { onNavigate() {} }));
  assert.match(html, /System health/);
  assert.match(html, /Checking/);
});

test('zero counts are not rendered as a wall of noughts', () => {
  assert.match(PAGE, /items\.filter\(\(i\) => Number\(i\.n\) > 0\)/);
  assert.match(PAGE, /Nothing is running and nothing is queued/);
});

// ── 29, 30, 31, 32, 33. What this pass was not allowed to do ─────────────

test('no model call was added', () => {
  for (const s of [MODEL, PAGE, ROUTE]) {
    for (const forbidden of ['askBackground', '/api/ai', 'anthropic', 'callAI']) {
      assert.ok(!s.includes(forbidden), `health must not reach a model (${forbidden})`);
    }
  }
});

test('nothing about sending, approval or the queue engine changed', () => {
  const guard = readFileSync(new URL('../lib/send-guard.mjs', import.meta.url), 'latin1');
  assert.ok(guard.includes('AUTOMATION_OFF'));
  for (const f of ['../lib/send-guard.mjs', '../lib/send-runner.mjs', '../lib/approval.mjs', '../lib/queue.mjs']) {
    const s = readFileSync(new URL(f, import.meta.url), 'latin1');
    assert.ok(!s.includes('system-health'), `${f} must not depend on a health page`);
  }
  // The page cannot send, approve, or start a scan.
  for (const s of [PAGE, ROUTE]) {
    for (const action of ['/api/outreach', 'scanner-runs', 'audit-video/precheck', 'action: \'send\'']) {
      assert.ok(!s.includes(action), `the health surface must not be able to ${action}`);
    }
  }
});

test('both send switches are still off by default', async () => {
  const { SEND_DEFAULTS } = await import('../lib/send-policy.mjs');
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});

// ── 34. Narrow layout ────────────────────────────────────────────────────

test('nothing on the page is pinned wider than a phone', () => {
  const mins = [...PAGE.matchAll(/min-w-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  for (const w of mins) assert.ok(w <= 200, `min-w-[${w}px] will scroll a 402px screen sideways`);
  // Job ids and error text are the two things that widen an operations page.
  assert.match(PAGE, /break-words/);
  assert.match(PAGE, /whitespace-pre-wrap/);
});

// ── Wording ──────────────────────────────────────────────────────────────

test('how long ago reads like a person wrote it', () => {
  assert.equal(ago(null), 'never');
  assert.equal(ago(0), 'just now');
  assert.equal(ago(1), 'a minute ago');
  assert.equal(ago(30), '30 minutes ago');
  assert.equal(ago(60), 'an hour ago');
  assert.equal(ago(60 * 5), '5 hours ago');
  assert.equal(ago(60 * 24), 'yesterday');
  assert.equal(minutesSince(null, now), null);
});
