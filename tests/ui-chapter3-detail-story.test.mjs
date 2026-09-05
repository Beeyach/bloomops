// Chapter 3: a prospect reads as one story.
//
// The drawer already carried the right order (who and what next, what they
// said, why we chose them, what went out, the record, technical last). What
// it lacked: a hard opt-out that looks like one, and a past that stays out
// of the present's way. These tests pin both, plus everything that must not
// have moved.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const DRAWER = src('components/ProspectDrawer.jsx');

function visibleText(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

const loadHeadline = async () => (await import('../components/ProspectHeadline.jsx')).default;

const person = (over = {}) => ({
  id: 7,
  name: 'Christy Wiles',
  business_name: 'Christy Wiles LMFT',
  email: 'christy@example.com',
  domain: 'christywiles.com',
  stage: 'Rejected',
  replied: 1,
  reply_type: 'decline',
  emails_sent: 2,
  do_not_contact: 0,
  unsubscribed: 0,
  ...over,
});

// ── 1, 2. The first surface answers who, with one canonical state ──────────

test('the header answers who this is, and one state is primary', async () => {
  const Headline = await loadHeadline();
  const html = renderToString(React.createElement(Headline, { prospect: person() }));
  const text = visibleText(html);
  assert.ok(text.includes('Christy Wiles'), 'who');
  // Chapter 10 turned the canonical state from a coloured heading into a
  // pill. Same guarantee — exactly one state, said once — by stronger means:
  // it now carries an icon and a word, so colour is never the only signal.
  assert.equal((html.match(/class="pill/g) || []).length, 1, 'one state pill, said once');
  assert.ok(text.includes('Next'), 'and the one next action box');
});

// ── 3. A hard boundary outranks every normal state and action ──────────────

test('unsubscribed renders as an unmistakable boundary with no next action', async () => {
  const Headline = await loadHeadline();
  const html = renderToString(React.createElement(Headline, { prospect: person({ unsubscribed: 1 }) }));
  const text = visibleText(html);
  assert.ok(text.includes('Unsubscribed'), 'the boundary in plain words');
  assert.ok(text.includes('no further contact'), 'and what it means');
  assert.ok(!text.includes('Next'), 'no next-action box competes with a stop request');
});

test('do_not_contact says Do not contact, louder than any pipeline label', async () => {
  const Headline = await loadHeadline();
  const html = renderToString(React.createElement(Headline, { prospect: person({ do_not_contact: 1 }) }));
  const text = visibleText(html);
  assert.ok(text.includes('Do not contact'));
  assert.match(html, /poppy-text/, 'the boundary carries the danger hue, which no normal state uses');
});

test('a normal prospect is never shown the boundary banner', async () => {
  const Headline = await loadHeadline();
  const html = renderToString(React.createElement(Headline, { prospect: person() }));
  const text = visibleText(html);
  assert.ok(!text.includes('Do not contact'));
  assert.ok(!text.includes('no further contact'));
});

// ── 5, 6, 7. The story sections stay in order on the first surface ─────────

test('the drawer keeps the story order: headline, conversation, outreach, reason, record, technical last', () => {
  // Chapter 8 turned the single scroll into five tabs (Overview / Email /
  // Evidence / Activity / More), so Email's panel is declared before
  // Evidence's. What Chapter 3 was protecting still holds and is asserted
  // below: identity first, the editable record late, technical last.
  const order = [
    'ProspectHeadline', 'ConversationTimeline', 'OutreachHistory', 'ProspectCard',
    'The record</SectionHead>', 'SystemDetails',
  ];
  let at = DRAWER.indexOf('return (');
  for (const marker of order) {
    const next = DRAWER.indexOf(marker, at);
    assert.ok(next > at, `${marker} appears in story order`);
    at = next;
  }
});

// ── 8, 9. History and Technical are collapsed by default ───────────────────

test('the activity log is history: behind its own tab, never on the first surface', () => {
  // Chapter 3 hid it behind a <details>. Chapter 8 gave it a tab, which is
  // the same guarantee by stronger means: you only see the log by asking
  // for it, and it no longer sits under the present as a closed grey line.
  assert.match(DRAWER, /\{ key: 'activity', label: 'Activity' \}/, 'Activity is a tab');
  assert.match(DRAWER, /tab === 'activity' && \([\s\S]{0,800}<Timeline/, 'and the log renders only inside it');
  assert.match(DRAWER, /entries\.length === 0\s*\?\s*'Nothing logged yet'/, 'with an honest summary');
  assert.match(DRAWER, /last: /, 'and the newest entry previewed');
  // The default tab is Overview, so opening a prospect never opens the past.
  assert.match(DRAWER, /useState\(initialTab \|\| 'overview'\)/);
});

test('technical detail stays collapsed at the bottom', () => {
  const sys = src('components/SystemDetails.jsx');
  assert.match(sys, /<details/, 'System details is a disclosure');
  assert.ok(DRAWER.lastIndexOf('SystemDetails') > DRAWER.lastIndexOf('Timeline key='), 'and renders after history');
});

// ── 10. No raw ids or debug metadata in the header ─────────────────────────

test('the headline shows no raw ids, scores, or enum names', async () => {
  const Headline = await loadHeadline();
  const html = renderToString(React.createElement(Headline, { prospect: person() }));
  const text = visibleText(html);
  assert.ok(!/\bid[:=]/i.test(text));
  assert.ok(!/NO_TO_|PILE\.|DUE\./.test(text), 'no internal enums leak');
});

// ── 11. No fake turn-state on this base ────────────────────────────────────

test('no conversation-turn vocabulary is manufactured on this base', () => {
  for (const file of ['components/ProspectDrawer.jsx', 'components/ProspectHeadline.jsx']) {
    const t = src(file);
    assert.ok(!/WAITING_ON_THEM|FOLLOWUP_ELIGIBLE|DORMANT|conversationTurnState/.test(t), `${file} renders current truth only`);
  }
});

// ── 12, 13. Relationship wording stays distinct ────────────────────────────

test('Not interested, Declined working together, and Deferred remain distinct labels', () => {
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED]];
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(!labels.includes('Rejected'), 'no collapse into one bucket');
});

// ── 14, 15. Evidence and send behavior untouched ───────────────────────────

test('evidence rendering and send machinery are untouched by this chapter', () => {
  assert.ok(!/action: 'send'/.test(DRAWER), 'the drawer still cannot send email');
  const card = src('components/prospects/ProspectCard.jsx');
  assert.ok(card.length > 0, 'the why-chosen card is intact');
  assert.match(DRAWER, /<ProspectCard prospect=\{p\} onNavigate=\{onNavigate\} \/>/, 'and still renders unmodified');
});
