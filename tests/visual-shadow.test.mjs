// The seven cases, run end to end through the real pipeline.
//
// What this proves and what it does not, stated up front because the
// difference matters:
//
//   PROVEN — the contract. Given a set of findings and a set of captures, what
//            reaches the writer, what is rejected and why, whether the prospect
//            survives, and how many pictures it cost. This is the whole
//            decision path: collectEvidence → screenEvidence → canPrepare →
//            selectPlaybook → buildEmailParts. No stubs in the middle.
//
//   NOT PROVEN — that the live renderer takes the picture. The captures here
//            are fixtures shaped exactly like what /shots returns. The Cloud
//            Run deploy is blocked on a Google login, so nothing in this file
//            has photographed a real website.
//
// Naming that honestly is the point of the whole pass. A shadow run that
// silently used fixtures and reported "verified" would be the same error one
// level up.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planPackage } from '../lib/outreach.mjs';
import { EVIDENCE, VIEWPORT } from '../lib/visual-evidence.mjs';
import { captureTargets, boundTargets, artifactFrom, asEvidence } from '../lib/visual-capture.mjs';
import { parseVerdict, supports } from '../lib/visual-review.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');

const site = (host) => `https://${host}`;
const prospect = (host, keys, reasons) => ({
  id: 100, name: 'Sam', business_name: 'Sam Co', email: `sam@${host}`, domain: host,
  country: 'US', stage: 'Validated', rating: '💚',
  site_intel: JSON.stringify({
    worth: true, score: 6, why: 'checked', keys, reasons,
    checkedAt: NOW.toISOString(), source: 'precheck', pagesChecked: [site(host)], hasForm: true,
  }),
});

// A capture as /shots returns it, then turned into an artifact and an evidence
// row by the same code the live path uses.
const capture = (host, over = {}) => artifactFrom({
  url: site(host), viewport: 'desktop', capturedAt: NOW.toISOString(), status: 200,
  blocked: false, overlay: false, title: 'Home',
  storedAt: `https://file.gobloomwired.com/shot/${host.replace(/\./g, '-')}-desktop-abc`,
  sha256: 'f'.repeat(64), bytes: 210_000, ...over,
}, { workspace: 'ary', prospectId: 100, runId: 'shadow-1' });

// What a vision verdict does to an artifact: it either backs named findings or
// it does not. `supports` decides, and the polarity lives there.
const looked = (artifact, answers) => {
  const backs = [];
  const unclear = [];
  for (const [key, raw] of Object.entries(answers)) {
    const verdict = parseVerdict(JSON.stringify(raw));
    if (supports(key, verdict)) backs.push(key);
    // "Could not tell" is recorded separately from "not there". The first is a
    // failed check, the second says the claim was wrong, and the report should
    // not call them the same thing.
    else if (verdict.answer === 'unclear' || verdict.confidence === 'low') unclear.push(key);
  }
  return { ...asEvidence(artifact), supportsKeys: backs, unclearKeys: unclear };
};

const report = [];
const record = (name, row) => report.push({ name, ...row });

function run(name, { host, keys, reasons, captures = [], expect }) {
  const p = prospect(host, keys, reasons);
  const targets = boundTargets(captureTargets(
    keys.map((k, i) => ({ key: k, text: reasons[i], url: site(host) }))
  ));
  const plan = planPackage(p, { now: NOW, visualEvidence: captures });

  record(name, {
    url: site(host),
    findings: keys.join(', '),
    pagesNeedingAPicture: targets.length,
    shots: captures.length,
    visionCalls: captures.reduce((n, c) => n + (Array.isArray(c.supportsKeys) ? 1 : 0), 0),
    allowed: (plan.evidence || []).map((e) => e.key).filter(Boolean).join(', ') || '(none)',
    rejected: (plan.unsupported || []).map((u) => `${u.key}: ${u.why}`).join(' | ') || '(none)',
    outcome: plan.ok ? 'STRONG — prepares' : 'SKIP — no angle',
  });

  expect(plan, targets);
  return plan;
}

// ── A. Source suggests no booking; the picture shows one ─────────────────

test('A: the geometry says nothing to click, and the picture disagrees', () => {
  const shot = capture('sample-a.example');
  // The model was asked "is there a visible action?" and answered yes. The
  // `cta` finding claims there is none, so this REFUTES it.
  const seen = looked(shot, { cta: { answer: 'yes', visible: 'Book a call', confidence: 'high' } });

  run('A false claim refuted by the picture', {
    host: 'sample-a.example',
    keys: ['form-broken', 'cta'],
    reasons: ['The contact form is broken', 'Nothing above the fold to click'],
    captures: [seen],
    expect: (plan) => {
      assert.ok(!plan.evidence.some((e) => e.key === 'cta'), 'the false claim is gone');
      assert.ok(plan.unsupported.some((u) => u.key === 'cta'));
      assert.equal(plan.ok, true, 'and the real finding still carries them');
    },
  });
});

// ── B. The CTA really is below the fold ──────────────────────────────────

test('B: the picture agrees, so the claim may be made', () => {
  const seen = looked(capture('sample-b.example'), {
    cta: { answer: 'no', visible: '', observation: 'No action is visible in the first screen.', confidence: 'high' },
  });

  run('B buried CTA, confirmed', {
    host: 'sample-b.example',
    keys: ['form-broken', 'cta'],
    reasons: ['The contact form is broken', 'Nothing above the fold to click'],
    captures: [seen],
    expect: (plan) => {
      assert.ok(plan.evidence.some((e) => e.key === 'cta'), 'proved, so it may be said');
      assert.equal(plan.unsupported.length, 0);
    },
  });
});

// ── C. Desktop is fine, the phone is not ─────────────────────────────────

test('C: a phone claim is not settled by a desktop frame', () => {
  const desktop = looked(capture('sample-c.example'), {
    'mobile-overflow': { answer: 'yes', visible: 'clipped', confidence: 'high' },
  });
  const phone = looked(capture('sample-c.example', { viewport: 'mobile' }), {
    'mobile-overflow': { answer: 'yes', visible: 'The booking button runs off the right edge', confidence: 'high' },
  });

  const blind = run('C mobile claim, desktop frame only', {
    host: 'sample-c.example',
    keys: ['form-broken', 'mobile-overflow'],
    reasons: ['The contact form is broken', 'Content runs off the screen on a phone'],
    captures: [desktop],
    expect: (plan) => assert.ok(plan.unsupported.some((u) => u.key === 'mobile-overflow')),
  });
  assert.ok(blind);

  run('C mobile claim, phone frame', {
    host: 'sample-c.example',
    keys: ['form-broken', 'mobile-overflow'],
    reasons: ['The contact form is broken', 'Content runs off the screen on a phone'],
    captures: [phone],
    expect: (plan) => assert.ok(plan.evidence.some((e) => e.key === 'mobile-overflow')),
  });
});

// ── D. A popup that actually appeared ────────────────────────────────────

test('D: a popup is a claim only when it is in the frame', () => {
  const withPopup = capture('sample-d.example', { overlay: true });
  assert.equal(withPopup.overlay, true, 'recorded, never dismissed before the shutter');

  const seen = looked(withPopup, {
    overlay: { answer: 'yes', visible: 'Join our newsletter', confidence: 'high' },
  });
  assert.ok(seen.supportsKeys.includes('overlay'));

  // And when nothing covered the page, nothing invents one.
  const clean = looked(capture('sample-d.example'), {
    overlay: { answer: 'no', visible: '', confidence: 'high' },
  });
  assert.ok(!clean.supportsKeys.includes('overlay'));

  record('D popup, seen and not seen', {
    url: site('sample-d.example'), findings: 'overlay',
    pagesNeedingAPicture: 1, shots: 2, visionCalls: 2,
    allowed: 'overlay (when present)', rejected: 'overlay (when absent)',
    outcome: 'evidence follows the frame',
  });
});

// ── E. A wall ────────────────────────────────────────────────────────────

test('E: a page nobody could see supports nothing about how it looks', () => {
  const wall = looked(
    capture('sample-e.example', { blocked: true, status: 403, title: 'Just a moment...' }),
    { cta: { answer: 'no', visible: '', confidence: 'high' } }
  );

  run('E challenge page', {
    host: 'sample-e.example',
    keys: ['form-broken', 'cta'],
    reasons: ['The contact form is broken', 'Nothing above the fold to click'],
    captures: [wall],
    expect: (plan) => {
      const why = plan.unsupported.find((u) => u.key === 'cta')?.why || '';
      assert.match(why, /blocked or showed a challenge/);
    },
  });
});

// ── F. Technical is enough ───────────────────────────────────────────────

test('F: a technical finding costs no pictures and no vision calls', () => {
  run('F technical only', {
    host: 'sample-f.example',
    keys: ['form-broken', 'lead-magnet-open'],
    reasons: ['The contact form is broken', 'The guide downloads with no email capture'],
    captures: [],
    expect: (plan, targets) => {
      assert.equal(targets.length, 0, 'nothing here needs looking at');
      assert.equal(plan.ok, true);
      assert.equal(plan.unsupported.length, 0);
    },
  });
});

// ── G. Unverifiable ──────────────────────────────────────────────────────

test('G: an unverifiable visual claim is dropped, and never handed to a human', () => {
  // One capture, one look, and the model could not tell. That is the end of it.
  const unclear = looked(capture('sample-g.example'), {
    cta: { answer: 'unclear', visible: '', observation: 'The screenshot is mostly a loading state.', confidence: 'low' },
  });
  assert.deepEqual(unclear.supportsKeys, [], 'unclear is not support');

  const plan = run('G unverifiable, no other evidence', {
    host: 'sample-g.example',
    keys: ['cta'],
    reasons: ['Nothing above the fold to click'],
    captures: [unclear],
    expect: (p) => {
      assert.equal(p.ok, false, 'nothing provable is left');
      assert.match(p.unsupported.find((u) => u.key === 'cta').why, /could not settle it/,
        'a failed check reads differently from a refuted claim');
    },
  });

  const words = `${plan.reason} ${JSON.stringify(plan.unsupported || [])}`.toLowerCase();
  for (const nag of ['please check', 'manually', 'have a look', 'review this site', 'maybe']) {
    assert.ok(!words.includes(nag), `"${nag}" would turn a failed check into human work`);
  }
});

// ── The table ────────────────────────────────────────────────────────────

test('the shadow run reports what it did', () => {
  assert.ok(report.length >= 7, 'all seven cases ran');
  const shots = report.reduce((n, r) => n + r.shots, 0);
  const calls = report.reduce((n, r) => n + r.visionCalls, 0);
  console.log('\n── Shadow acceptance (contract proven, live capture NOT exercised) ──');
  for (const r of report) {
    console.log(`\n${r.name}`);
    console.log(`  url        ${r.url}`);
    console.log(`  findings   ${r.findings}`);
    console.log(`  pictures   ${r.pagesNeedingAPicture} page(s) needed · ${r.shots} taken · ${r.visionCalls} looked at`);
    console.log(`  allowed    ${r.allowed}`);
    console.log(`  rejected   ${r.rejected}`);
    console.log(`  outcome    ${r.outcome}`);
  }
  console.log(`\nTotals: ${shots} captures, ${calls} vision calls across ${report.length} cases.`);
  console.log('No prospect was contacted. No email was sent. No package was persisted.\n');
});
