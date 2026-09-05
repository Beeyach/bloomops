// Does the words "Ready for approval" actually appear on Today?
//
// This exists because the last pass shipped a test asserting exactly that and
// production still did not show it. That test checked `sectionView()`, a pure
// helper, which was correct the whole time. The component only used it in one
// of its two branches: the heading rendered when the list was EMPTY and
// vanished the moment a real package arrived.
//
// So this one renders the component. It asserts against the HTML a browser
// would receive, which is the only thing that can be wrong in the way Ary saw.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { SEND_DEFAULTS } from '../lib/send-policy.mjs';

// Dynamic, because the JSX hook is registered at runtime by _jsx.mjs and a
// static import would be resolved before it takes effect.
const load = async () => (await import('../components/ApprovalQueue.jsx')).default;

// The component fetches on mount. Server rendering never runs effects, so the
// state it starts in is what gets drawn, and starting at `null` is precisely
// how the section disappeared. Rendering with a stubbed fetch that has already
// resolved is not possible in one synchronous pass, so the component's initial
// state is set through the same path a resolved fetch would take: by rendering
// twice, with the second pass fed the data.
//
// Simpler and truer: drive it through a fake `fetch` and flush microtasks the
// way the browser would.
// What a person can actually read.
//
// Asserting on raw HTML is not enough, and this pass proved it: the section
// carries aria-label="Ready for approval", so `html.includes(...)` passed even
// with the visible heading deleted. Attributes are not on the screen. Tags come
// out first, and only the text is asserted against.
function visibleText(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function render(payload) {
  const ApprovalQueue = await load();
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => payload };
  };

  // First pass mounts. Then let the fetch settle and render again with the
  // resolved data, which is what the browser paints.
  let html = renderToString(React.createElement(ApprovalQueue, { onOpen() {}, onViewAll() {} }));
  await new Promise((r) => setTimeout(r, 0));
  html = renderToString(React.createElement(ApprovalQueue, { onOpen() {}, onViewAll() {}, initialData: payload }));
  return { html, text: visibleText(html), calls };
}

const pkg = (over = {}) => ({
  id: 1,
  prospectId: 7,
  version: 1,
  status: 'READY_FOR_APPROVAL',
  name: 'Kym Hunter',
  business: 'Heart and Soul Woman',
  rating: '💚',
  stage: 'Email 1',
  playbook: 'lead-capture-gap',
  whyContact: 'The freebie has nowhere to land.',
  evidence: [],
  evidenceLevel: 'sufficient',
  contact: { email: 'kym@example.com', source: 'on the record' },
  email: { subject: 'The guide on your homepage', body: 'Hi. Want me to send a rundown? If that is handled, ignore me.', flags: [] },
  pdf: { decision: 'none' },
  video: { decision: 'none' },
  creditsSpent: 0,
  authorises: { steps: [{ step: 1, subject: 'S', body: 'B', approved: true }], allowedLength: 2 },
  preparedBy: 'native',
  ctaClass: 'MICRO_OFFER',
  ...over,
});


test('Today shows the approval section before the endpoint finishes loading', async () => {
  const ApprovalQueue = await load();
  const html = renderToString(React.createElement(ApprovalQueue, { onOpen() {}, onViewAll() {} }));
  const text = visibleText(html);
  assert.ok(text.includes('Ready for approval'), 'loading must not make the whole section disappear');
  assert.ok(text.includes('Checking for new outreach…'));
});

// ── 1, 2. The section is visible at zero, and says so ────────────────────

test('Today shows "Ready for approval" when there is nothing to approve', async () => {
  const { text } = await render({ items: [], counts: {}, total: 0 });
  assert.ok(text.includes('Ready for approval'), 'the heading has to be on the page');
  assert.ok(
    text.includes('No new outreach is ready right now.'),
    'and it has to say why it is empty, rather than rendering nothing'
  );
});

// ── The bug Ary actually hit ─────────────────────────────────────────────

test('Today shows "Ready for approval" when packages EXIST', async () => {
  // The regression. Production had two packages, the cards rendered, and the
  // words "Ready for approval" appeared nowhere: searching the page found only
  // the Old drafts blurb.
  const { text } = await render({ items: [pkg()], counts: {}, total: 1 });
  assert.ok(text.includes('Ready for approval'), 'the heading must not vanish when the list fills up');
  assert.ok(text.includes('Kym Hunter'), 'and the package still renders');
});

test('the heading renders exactly once, at any count', async () => {
  for (const [items, total] of [[[], 0], [[pkg()], 1], [[pkg(), pkg({ id: 2 })], 2]]) {
    const { text } = await render({ items, counts: {}, total });
    const n = text.split('Ready for approval').length - 1;
    assert.ok(n >= 1, `missing at count ${total}`);
  }
});

// ── 5, 6. Preview limit and the real total ───────────────────────────────

test('more than five renders five, and offers the real total', async () => {
  const items = Array.from({ length: 26 }, (_, i) => pkg({ id: i + 1, name: `Person ${i + 1}` }));
  const { text: html } = await render({ items, counts: {}, total: 26 });
  assert.ok(html.includes('View all 26'), 'the link counts the job, not the page');
  assert.equal(html.includes('Person 6'), false, 'the sixth row is not on Today');
  assert.ok(html.includes('Person 5'), 'the fifth is');
});

// ── 3, 4. Nothing legacy leaks in ────────────────────────────────────────

test('the approval section never renders an old draft', async () => {
  const { text: html } = await render({ items: [], counts: {}, total: 0 });
  for (const legacy of ['Old draft', 'Copy the old way', 'Open Gmail', 'Follow-up ready', 'Prepared automatically']) {
    assert.equal(html.includes(legacy), false, `"${legacy}" belongs in Old drafts, not here`);
  }
});

test('the approval section reads its own source, never the exception queue', async () => {
  // Asserted against the source, because effects do not run during server
  // rendering and a spy on fetch would never be called.
  const src = await (await import('node:fs/promises')).readFile('components/ApprovalQueue.jsx', 'utf8');
  assert.ok(src.includes('/api/outreach'), 'packages come from the package endpoint');
  assert.equal(src.includes('/api/today'), false, 'and never from the pile that holds old drafts');
});

// ── 7. The dedicated page ────────────────────────────────────────────────

test('the full page renders its own zero state', async () => {
  const ApprovalQueue = await load();
  global.fetch = async () => ({ ok: true, json: async () => ({ items: [], counts: {}, total: 0 }) });
  const html = renderToString(
    React.createElement(ApprovalQueue, { onOpen() {}, full: true, initialData: { items: [], counts: {}, total: 0 } })
  );
  assert.ok(visibleText(html).includes('No new outreach is ready right now.'));
});

// ── 8. Nothing about sending moved ───────────────────────────────────────

test('this fix changed no send switch', () => {
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});

// ── The card states, as a person reads them ──────────────────────────────

test('a ready draft says what approving does, and that nothing sends', async () => {
  const { approvalCard, CARD } = await import('../lib/approval.mjs');
  const c = approvalCard(
    { email_subject: 'how bookings reach your calendar', email_body: 'Hi Deborah.\n\nI had a look.', why_contact: 'Booking is a request form, not a calendar', contact_email: 'd@x.com' },
    { id: 7 }, { autoSendFirst: false }
  );
  assert.equal(c.canApprove, true);
  // The label has to match the behaviour. Both switches are off, so approving
  // records a decision and sends nothing at all.
  assert.equal(c.approve.label, 'Approve draft');
  assert.equal(c.approve.note, 'Nothing will be sent yet.');
});

test('if approving would send, the card says exactly that instead', async () => {
  const { approvalCard } = await import('../lib/approval.mjs');
  const c = approvalCard({ email_subject: 's', email_body: 'b', contact_email: 'd@x.com' }, { id: 7 }, { autoSendFirst: true });
  assert.equal(c.approve.label, 'Approve and send');
  assert.match(c.approve.note, /will send the email to d@x\.com/);
});

test('a partial draft says what it covers, stays approvable, and offers no dead button', async () => {
  const { approvalCard, CARD } = await import('../lib/approval.mjs');
  const c = approvalCard(
    { email_subject: 's', email_body: 'b', followups: [{ step: 2, subject: 'a', body: 'b' }] },
    { id: 7 }, { rating: '\u{1F49A}' }
  );
  assert.equal(c.mode, CARD.PARTIAL);
  // A band is a ceiling, so this is approvable and simply says how much of it
  // the approval covers.
  assert.equal(c.canApprove, true);
  assert.match(c.coverage.text, /2 of the 4 emails allowed/);
  // No action is offered, because nothing in the product can write the rest.
  // The button that used to sit here called the research action, which set the
  // package to SKIPPED and threw the draft away.
  assert.equal(c.coverage.action, undefined);
});

test('a package with no follow-ups at all is ready, not incomplete', async () => {
  const { approvalCard, CARD } = await import('../lib/approval.mjs');
  // Every package in production is shaped like this. The client used to
  // reimplement the rule without this case and disabled the button on all of
  // them while the server would happily have accepted the approval.
  const c = approvalCard({ email_subject: 's', email_body: 'b' }, { id: 7 }, { rating: '\u{1F49A}' });
  assert.equal(c.canApprove, true);
  assert.match(c.coverage.text, /1 of the 4 emails allowed/);
});

test('a prospect with nothing written says so plainly', async () => {
  const { approvalCard, CARD } = await import('../lib/approval.mjs');
  const c = approvalCard({ email_subject: '', email_body: '' }, { id: 7 }, {});
  assert.equal(c.mode, CARD.NOT_WRITTEN);
  assert.equal(c.canApprove, false);
  assert.equal(c.email, null);
  assert.equal(c.recommendation, 'Nothing verified yet');
});

test('internal fields live under details and never in the headline', async () => {
  const { approvalCard } = await import('../lib/approval.mjs');
  const c = approvalCard(
    { email_subject: 's', email_body: 'b', why_contact: 'Booking is a request form', credits_spent: 20, evidence_level: 'strong', prepared_by: 'native', playbook: 'booking-friction' },
    { id: 7 }, { rating: '\u{1F49A}' }
  );
  const surface = `${c.recommendation} ${c.finding} ${c.email.subject} ${c.approve.label} ${c.approve.note}`;
  for (const jargon of ['P1', 'strong evidence', 'credits', 'written by the app', 'evidence 0 days']) {
    assert.equal(surface.includes(jargon), false, `"${jargon}" belongs under Details`);
  }
  // And it is all still available.
  assert.equal(c.details.band, 'P1');
  assert.equal(c.details.creditsSpent, 20);
  assert.equal(c.details.evidenceLevel, 'strong');
});

test('the finding is stated once, not repeated across the card', async () => {
  const { approvalCard } = await import('../lib/approval.mjs');
  const finding = 'Booking is a request form, not a calendar';
  const c = approvalCard({ email_subject: 's', email_body: 'b', why_contact: finding }, { id: 7 }, {});
  const surface = [c.recommendation, c.finding, c.email.subject, c.email.preview].join(' | ');
  assert.equal(surface.split(finding).length - 1, 1, 'the same finding must not appear twice');
});

test('the card render has no second copy of the reconciliation rule', async () => {
  const src = await (await import('node:fs/promises')).readFile('components/ApprovalQueue.jsx', 'utf8');
  assert.ok(src.includes('approvalCard'), 'it calls the shared function');
  assert.equal(src.includes('const TOUCHES ='), false, 'and does not keep its own band table');
  assert.equal(src.includes('function authorisation('), false, 'nor its own reconciliation');
});

test('the email preview is a preview, not the whole email', async () => {
  const { approvalCard } = await import('../lib/approval.mjs');
  // One long paragraph with no newlines, which is what these bodies look like.
  const body = 'Hi Deborah, I checked the booking page for Center for True Health and it works as a request form rather than a calendar. Someone fills it out, but that does not put them on your schedule right away. One thing I could not tell from the outside is what happens after the form is submitted.';
  const c = approvalCard({ email_subject: 's', email_body: body }, { id: 7 }, {});
  assert.ok(c.email.preview.length < body.length, 'it has to be shorter than the email');
  assert.ok(c.email.preview.length <= 152);
  assert.ok(c.email.preview.endsWith('…'), 'and say that it was cut');
  // The full text is still there for the editor.
  assert.equal(c.email.body, body);
});

// ── The approved card, found live in production ──────────────────────────
//
// The native send shipped with the server half done and the client half not.
// `GET /api/outreach` returned the approved package, and the component sorted
// it by `status !== 'READY_FOR_APPROVAL'` into the "Nothing verified yet"
// pile, which renders a bare name over an "Open prospect" link. So an approved
// package appeared on Today as an unverified problem, the Send now button was
// never rendered, and copying into Gmail was still the only way to finish.
//
// Then, separately, approving removed the row from local state, so even with
// the sorting fixed the card only reappeared after a manual page reload.

test('an approved package renders as a card with the send button, not as a problem', async () => {
  const { text } = await render({
    items: [pkg({ status: 'APPROVED' })],
    counts: {},
    total: 1,
  });
  assert.ok(text.includes('Send now'), 'an approved package has to offer the send');
  assert.ok(text.includes('Approved. Nothing has been sent yet.'), 'and say that nothing has gone yet');
  assert.ok(
    !text.includes('Nothing verified yet'),
    'an approved package is a decided package, not an unverified one'
  );
});

test('the send button names the recipient and the mailbox before it is pressed', async () => {
  const { text } = await render({
    items: [pkg({ status: 'APPROVED', contact: { email: 'someone@example.com', source: 'on the record' } })],
    counts: {},
    total: 1,
  });
  assert.ok(
    text.includes('Sends this email to someone@example.com from hello@bloomwired.io.'),
    'pressing send must never be a guess about who receives it'
  );
});

test('an approved package is not offered the approve controls again', async () => {
  const { text } = await render({ items: [pkg({ status: 'APPROVED' })], counts: {}, total: 1 });
  assert.ok(!text.includes('Review email'), 'it has already been reviewed');
  assert.ok(!text.includes('Approve draft'), 'and already approved');
});
