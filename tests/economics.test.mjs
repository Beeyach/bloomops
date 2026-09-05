import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarise, perProspect, PERIODS, periodSql } from '../lib/economics.mjs';
import { PRICES } from '../lib/credits.mjs';
import { CATALOG, byId } from '../lib/credit-catalog.mjs';
import { USD_PER_CREDIT } from '../lib/ai-cost.mjs';

// ── UNKNOWN never rounds to zero ─────────────────────────────────────────

test('an unmeasured action is listed, not costed as free', () => {
  // Video is charged 200 credits and its vendor cost has not been measured on
  // the current pipeline. The wrong answers are both available and both bad:
  // a zero, which reads as free, and a blank, which reads as nothing happened.
  const s = summarise({
    creditRows: [{ action: 'video', credits: PRICES.video, kind: 'charge', actor: 'human' }],
  });
  const video = s.rows.find((r) => r.action === 'video');
  assert.equal(video.costUsd, null);
  assert.equal(video.marginUsd, null);
  assert.equal(s.complete, false);
  assert.equal(s.unmeasured.length, 1);
  assert.equal(s.unmeasured[0].action, 'video');
  assert.ok(s.unmeasured[0].gap, 'and it says why');
  // The revenue is still counted. It really was charged.
  assert.equal(video.revenueUsd, PRICES.video * USD_PER_CREDIT);
});

test('the known margin excludes what it cannot cost, and says so', () => {
  const s = summarise({
    creditRows: [
      { action: 'video', credits: 200, kind: 'charge', actor: 'human' },
      { action: 'precheck', credits: 20, kind: 'charge', actor: 'auto' },
    ],
  });
  // Only precheck contributes to the cost side.
  assert.ok(s.totals.knownCostUsd > 0);
  assert.equal(s.complete, false);
  const precheck = s.rows.find((r) => r.action === 'precheck');
  assert.ok(precheck.costUsd > 0, 'a catalogued per-unit cost is applied per operation');
  assert.equal(precheck.autoCredits, 20, 'and unattended spend is separable');
  assert.equal(precheck.humanCredits, 0);
});

test('a free action reads as measured zero, not as unknown', () => {
  // "Free because there is no vendor call" and "we have no idea" are different
  // answers, and collapsing them would bury the one that needs attention.
  const s = summarise({ creditRows: [{ action: 'prescreen', credits: 0, kind: 'charge' }] });
  assert.equal(s.complete, true);
});

test('refunds come off the net rather than being counted separately', () => {
  const s = summarise({
    creditRows: [
      { action: 'precheck', credits: 20, kind: 'charge', actor: 'human' },
      { action: 'precheck', credits: -20, kind: 'refund', actor: 'human' },
    ],
  });
  const r = s.rows.find((x) => x.action === 'precheck');
  assert.equal(r.netCredits, 0);
  assert.equal(r.refunded, 20);
  assert.equal(r.refunds, 1);
  assert.equal(s.totals.credits, 0, 'a charge and its refund net to nothing');
});

test('failed AI calls are counted as failures and still cost money', () => {
  const s = summarise({
    aiRows: [
      { task: 'draft', cost_usd: 0.006, ok: 1 },
      { task: 'draft', cost_usd: 0.002, ok: 0 },
    ],
  });
  const draft = s.rows.find((r) => r.action === 'draft');
  assert.equal(draft.calls, 2);
  assert.equal(draft.failures, 1);
  assert.equal(Math.round(draft.costUsd * 1000) / 1000, 0.008, 'a failed call still burned tokens');
});

test('an empty period reports zeros and calls itself complete', () => {
  const s = summarise({});
  assert.equal(s.totals.credits, 0);
  assert.equal(s.totals.knownCostUsd, 0);
  assert.equal(s.complete, true);
  assert.deepEqual(s.rows, []);
});

// ── One price, one place ─────────────────────────────────────────────────

test('the economics view holds no price of its own', () => {
  // Two copies of a price is how a margin ends up computed against a figure
  // the product stopped charging months ago. Comments are stripped first: the
  // ones here quote the prices they warn about.
  // Comments go, and so do class names: `bg-poppy/10` and `rounded-[10px]`
  // are opacity and radius, not the price of a voice note.
  const strip = (s) => s
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/className=\{`[\s\S]*?`\}/g, '')
    .replace(/className="[^"]*"/g, '');
  const view = strip(readFileSync(new URL('../components/EconomicsCard.jsx', import.meta.url), 'utf8'));
  const lib = strip(readFileSync(new URL('../lib/economics.mjs', import.meta.url), 'utf8'));
  for (const [job, price] of Object.entries(PRICES)) {
    if (price < 10) continue; // small integers appear as spacing and indexes
    assert.ok(!new RegExp(`\\b${price}\\b`).test(view), `the view hardcodes the ${job} price`);
    assert.ok(!new RegExp(`\\b${price}\\b`).test(lib), `economics.mjs hardcodes the ${job} price`);
  }
  // And it does not restate the credit value either.
  assert.ok(!/0\.001/.test(view), 'the view hardcodes what a credit is worth');
});

test('every catalogued action prices itself from the shared table', () => {
  for (const c of CATALOG) {
    if (!c.credits) continue;
    assert.equal(c.credits, PRICES[c.id], `${c.id} disagrees with lib/credits.mjs`);
  }
});

// ── Per prospect ─────────────────────────────────────────────────────────

test('a prospect drill-down separates approved from sent', () => {
  const withoutSend = perProspect({
    prospect: { id: 1, name: 'Pat', stage: 'Email 1' },
    creditRows: [{ action: 'precheck', credits: 20 }],
    sends: 0,
    pkg: { status: 'APPROVED', playbook: 'booking-friction', reviewed_at: '2026-08-09 10:00:00' },
  });
  assert.equal(withoutSend.outcome.sends, 0);
  assert.ok(withoutSend.outcome.approvedAt, 'approved');
  assert.equal(withoutSend.credits, 20);
  assert.ok(withoutSend.knownCostUsd > 0);
  assert.equal(withoutSend.complete, true);
});

test('a prospect with an unmeasured action names it rather than under-reporting', () => {
  const d = perProspect({
    prospect: { id: 2, name: 'Sam' },
    creditRows: [{ action: 'precheck', credits: 20 }, { action: 'video', credits: 200 }],
    sends: 1,
  });
  assert.equal(d.complete, false);
  assert.deepEqual(d.unmeasured, [byId('video').action]);
  assert.equal(d.credits, 220, 'the credits are known even where the cost is not');
});

// ── Periods ──────────────────────────────────────────────────────────────

test('the period filters are real SQL and default safely', () => {
  for (const key of Object.keys(PERIODS)) assert.ok(periodSql(key).includes('created_at'));
  assert.equal(periodSql('nonsense'), PERIODS['7d'].sql, 'an unknown period is not an unfiltered query');
});
