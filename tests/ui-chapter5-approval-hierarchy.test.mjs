// Chapter 5: consequence must be readable at a glance.
//
// The audit's finding was one button class carrying four consequence levels:
// approving words, approving a sequence, arming a timer, and actually
// emailing a human all wore btn-bloom. These tests pin the new vocabulary to
// the rendered card, and pin everything that must NOT have changed: the
// backend actions, the fingerprint discipline, and the package-level
// automation invariant.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { approvalCard } from '../lib/approval.mjs';

const load = async () => (await import('../components/ApprovalQueue.jsx')).default;
const SRC = readFileSync(new URL('../components/ApprovalQueue.jsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function visibleText(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

async function render(payload) {
  const ApprovalQueue = await load();
  global.fetch = async () => ({ ok: true, json: async () => payload });
  const html = renderToString(React.createElement(ApprovalQueue, { onOpen() {}, onViewAll() {}, initialData: payload }));
  return { html, text: visibleText(html) };
}

// An approved P2 with a written follow-up: the state where every consequence
// level is on screen at once, which is exactly where the old styling failed.
const approved = (over = {}) => ({
  id: 1,
  prospectId: 7,
  version: 1,
  status: 'APPROVED',
  name: 'Kym Hunter',
  business: 'Heart and Soul Woman',
  rating: '💚',
  stage: 'Email 1',
  playbook: 'lead-capture-gap',
  whyContact: 'The freebie has nowhere to land.',
  evidenceLevel: 'sufficient',
  contact: { email: 'kym@example.com', source: 'on the record' },
  email: { subject: 'The guide on your homepage', body: 'Hi.', flags: [] },
  creditsSpent: 0,
  emailsSent: 0,
  priorityBand: 'P2',
  sequenceApproved: true,
  sequenceMaxStep: 2,
  autoFollowup: { approved: false, maxStep: null },
  authorises: { steps: [{ step: 1, subject: 'S1', body: 'B1', approved: true }, { step: 2, subject: 'S2', body: 'B2', approved: true }], allowedLength: 2 },
  preparedBy: 'native',
  ctaClass: 'MICRO_OFFER',
  ...over,
});

const payload = (item, automation = { firstEmails: false, followups: false }) =>
  ({ items: [item], counts: {}, total: 1, automation });

// ── 1. Send now is the one strong action ────────────────────────────────────

test('Send now wears btn-send, alone, and names the recipient and mailbox', async () => {
  const { html, text } = await render(payload(approved()));
  assert.equal((html.match(/btn-send/g) || []).length, 1, 'exactly one send-class control on the card');
  assert.match(html, /btn-send[^>]*>Send now|Send now<\/button>/s);
  assert.ok(text.includes('Sends this email to kym@example.com from hello@bloomwired.io'),
    'the consequence is spelled out beside the button');
  assert.ok(!/btn-bloom[^"]*"[^>]*>\s*Send now/.test(html), 'Send now no longer shares the generic primary class');
});

// ── 2. The two approvals are visibly different consequences ────────────────

test('Approve Email 1 and Approve sequence carry different classes, and neither is the send class', () => {
  const e1 = SRC.indexOf('btn-approve transition');
  assert.ok(e1 > -1, 'Email 1 approval is btn-approve');
  assert.ok(SRC.includes('btn-approve-2nd'), 'sequence approval is the quieter outline');
  const sendIdx = SRC.indexOf('btn-send');
  assert.ok(sendIdx > -1);
  // No consequential control still wears btn-bloom: the only remaining
  // btn-bloom on this surface is the safe "Review email" opener.
  const bloomUses = SRC.split('btn-bloom').length - 1;
  assert.equal(bloomUses, 1, 'one navigational use only');
  assert.match(SRC, /btn-bloom transition"\s*>\s*\{isOpen \? 'Close' : 'Review email'\}/s);
});

// ── 3, 4. Auto-followup is state, not a command ────────────────────────────

test('auto-followup renders as a switch that is visibly off', async () => {
  const { html, text } = await render(payload(approved({ emailsSent: 1, sequenceInFlight: true })));
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="false"/);
  assert.ok(text.includes('Auto-followup off'));
  assert.ok(text.includes('Nothing is sent by turning this on.'));
});

test('the switch reflects the real auto_followup_approved state when on', async () => {
  const { html, text } = await render(payload(approved({ emailsSent: 1, sequenceInFlight: true, autoFollowup: { approved: true, maxStep: 2 } })));
  assert.match(html, /aria-checked="true"/);
  assert.ok(text.includes('Auto-followup on'));
  assert.ok(text.includes('The copy and the sequence approval stay exactly as they are.'),
    'turning it off is explained as harmless to the approvals');
});

// ── 5. Same backend action as the buttons it replaced ──────────────────────

test('toggling calls the existing auto-followup action with an allow flag, nothing new', () => {
  assert.match(SRC, /act\(item, 'auto-followup', \{ allow: !card\.automation\.approved \}\)/);
  const fetches = [...SRC.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(fetches)], ['/api/outreach'], 'the surface still speaks to exactly one endpoint');
});

// ── 6. Arming the timer never implies a send happened ──────────────────────

test('arming the timer never claims the follow-up went', async () => {
  const { text } = await render(payload(approved({ emailsSent: 1, sequenceInFlight: true, autoFollowup: { approved: true, maxStep: 2 } })));
  assert.ok(text.includes('The next approved one in this sequence has not.'),
    'the switch being on does not imply the automatic send happened');
});

// ── 7, 11. The package-level invariant is untouched ────────────────────────

test('automation is only ever offered on a sequence-approved P2, regardless of the global switch', () => {
  const base = {
    status: 'APPROVED', email_subject: 'S', email_body: 'B', priority_band: 'P2',
    followups: [{ step: 2, subject: 'S2', body: 'B2' }],
    allowed_length: 2, sequence_max_step: 2,
  };
  const sent = { rating: '💙', emails_sent: 1 };
  const withSeq = approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, sent, { autoSendFollowups: true });
  assert.ok(withSeq.automation, 'sequence-approved P2 with Email 1 gone gets the permission control');
  assert.equal(withSeq.automation.approved, false);
  const noSeq = approvalCard({ ...base, sequence_approved: 0, auto_followup_approved: 0 }, sent, { autoSendFollowups: true });
  assert.equal(noSeq.automation, null, 'a global switch alone can never arm a package');
  const preSend = approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, { rating: '💙', emails_sent: 0 }, { autoSendFollowups: true });
  assert.equal(preSend.automation, null, 'and neither can anything before Email 1 has gone');
});

// ── 8. Stale approvals still block the send, server-side ───────────────────

test('the send path still verifies the approval fingerprint before anything leaves', () => {
  const guard = readFileSync(new URL('../lib/send-guard.mjs', import.meta.url), 'utf8');
  assert.match(guard, /approvalFingerprint/, 'the guard still recomputes the fingerprint');
  const route = readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8');
  assert.match(route, /canSendNow|send-guard/, 'the send route still consults the guard');
});

// ── 9. Loading cannot double-submit ────────────────────────────────────────

test('a busy card disables the send and says so', () => {
  assert.match(SRC, /disabled=\{busy === item\.id\}\s*aria-busy=\{busy === item\.id \|\| undefined\}/);
  assert.match(SRC, /\{busy === item\.id \? 'Sending…' : 'Send now'\}/);
  // The disabled state stays readable: the class swaps to a solid muted
  // control instead of stacking opacity on small text.
  assert.match(CSS, /\.btn-send:disabled\{[^}]*color:var\(--ink-2\)/);
  assert.ok(!/btn-send[^"]*disabled:opacity/.test(SRC));
});

// ── 10, 12. Nothing semantic moved ─────────────────────────────────────────

test('approve still posts the same action shapes it always did', () => {
  assert.match(SRC, /act\(item, 'approve', \{\s*approveSequence: true/);
  assert.match(SRC, /body: JSON\.stringify\(\{ id: item\.id, action: 'send' \}\)/);
});

test('this surface still imports nothing from relationship or reply machinery', () => {
  assert.ok(!/from '[^']*relationship/.test(SRC));
  assert.ok(!/reply_events|reply-events|conversation-turn/.test(SRC));
});

// ── 13. Chapter 1 still holds ──────────────────────────────────────────────

test('the Chapter 1 preview cap still reaches this component', () => {
  assert.match(SRC, /previewLimit = PREVIEW/);
  const today = readFileSync(new URL('../components/TodayView.jsx', import.meta.url), 'utf8');
  assert.match(today, /previewLimit=\{TODAY_APPROVALS_LIMIT\}/);
});

// ── The already-sent state keeps its honesty ───────────────────────────────

test('a sequence in flight says the first email has gone, not that nothing was sent', async () => {
  const { text } = await render(payload(approved({ status: 'SENT', sequenceInFlight: true })));
  assert.ok(text.includes('The first email has gone. The next approved one in this sequence has not.'));
});
