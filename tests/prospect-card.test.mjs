// The prospect record, read by a person.
//
// Two failures this guards against, and they pull in opposite directions.
//
// The first is a page that turns silence into a claim: no evidence row for a
// booking system rendering as "they have no booking system". That is the exact
// mistake the evidence model exists to prevent, and a UI can make it without
// touching a single backend rule.
//
// The second is a page that draws a missing prerequisite like a rejection. A
// prospect with no address yet is not a prospect anybody decided against, and
// 702 of them look like a graveyard if the screen says so.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  identityOf, situationOf, SITUATION, qualificationOf, knowledgeOf,
  contactabilityOf, originOf, historyOf, nextActionOf, prospectCard,
} from '../lib/prospect-card.mjs';
import { CONTACT_STATE } from '../lib/contact-state.mjs';
import { VERIFICATION } from '../lib/verification.mjs';
import { SEND_DEFAULTS } from '../lib/send-policy.mjs';
import { showable, ASSOCIATION } from '../lib/contact-discovery.mjs';

const load = async (path) => (await import(path)).default;

const visibleText = (html) => String(html)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const nowish = new Date('2026-08-10T12:00:00Z');
const iso = (d) => new Date(d).toISOString();

// A prospect with something real on the record.
const STRONG = {
  id: 1, name: 'Kym Stewart', business_name: 'Heart and Soul', domain: 'heartandsoul.com',
  email: 'hello@heartandsoul.com', stage: 'New', country: 'US',
  primary_contact_reason: 'SAME_DOMAIN',
  own_findings: JSON.stringify([{ text: 'The header video does not play' }]),
  site_intel: JSON.stringify({
    worth: true, score: 11, reasons: ['Booking form returns a 500 on submit'],
    keys: ['form-broken'], platform: 'WordPress', hasForm: true, hasBooking: false,
    checkedAt: iso(nowish), source: 'precheck',
  }),
  site_intel_at: iso(nowish),
  origin_class: 'MAP_LISTING', origin_query: 'yoga studio portland', origin_at: iso('2026-07-01'),
  created_at: '2026-07-01 09:00:00',
};

const drawerProps = (prospect) => ({
  prospect, stages: ['New'], ratings: [], ratingMeta: () => ({}), sources: [],
  replyTypes: [], onPatch() {}, onLogTouch() {}, onSetReply() {}, onShowInTable() {},
  onOpenSequence() {}, onSnooze() {}, onClose() {}, position: null,
});

// Chapter 8 put the drawer's sections behind five tabs, so one render only
// ever contains one panel. These tests are about what the drawer SAYS, not
// about which click reveals it, so they render every tab and assert against
// the whole. The tab strip itself is covered in ui-chapter8.
const DRAWER_TABS = ['overview', 'email', 'evidence', 'activity', 'more'];

async function renderDrawer(prospect) {
  const ProspectDrawer = await load('../components/ProspectDrawer.jsx');
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [] }) });
  return DRAWER_TABS
    .map((initialTab) => visibleText(renderToString(
      React.createElement(ProspectDrawer, { ...drawerProps(prospect), initialTab }))))
    .join(' ');
}

// ── 1, 18. It renders for records that are barely there ──────────────────

test('a fresh prospect with almost nothing on it still renders', async () => {
  const text = await renderDrawer({ id: 9, business_name: 'Just Imported', email: 'a@b.com', stage: 'New' });
  // No website, so nothing can be checked. That is a gap in the record and the
  // page says so, rather than calling the business a bad fit.
  assert.match(text, /Missing something we need/);
  assert.match(text, /Add their domain/);
  assert.match(text, /not a decision about the business/);
  assert.match(text, /Source not recorded/);
  assert.ok(!/undefined|NaN|\[object/.test(text), 'no placeholder leakage on an empty record');
});

test('with no address, the missing address is the headline and not the missing check', async () => {
  // Precedence, and it is deliberate. Both facts are true of a fresh import,
  // and the one worth saying first is the one that blocks everything else.
  const text = await renderDrawer({ id: 10, business_name: 'Just Imported', stage: 'New' });
  assert.match(text, /Waiting for a safe contact/);
  assert.match(text, /Nothing yet\. The site check has not run\./, 'and the other fact is still on the page');
});

test('a legacy record with none of the V2 fields does not throw', () => {
  const legacy = { id: 3, name: 'Old Row', stage: 'Email 2', email: 'a@b.com', source: 'Google Maps', created_at: '2025-02-02 10:00:00' };
  const card = prospectCard(legacy, { now: nowish });
  assert.ok(card.situation.headline);
  assert.ok(card.next.text);
  assert.equal(card.qualification.band, null, 'no band invented for a record that never had one');
  assert.equal(card.knowledge.checked, false);
});

// ── 2, 3. Strong reads as an argument, not a promise ─────────────────────

test('a Strong prospect says why in words and lists the four dimensions', () => {
  const q = qualificationOf(STRONG, { now: nowish });
  assert.equal(q.strong, true);
  assert.equal(q.dimensions.length, 4);
  assert.ok(q.dimensions.every((d) => d.passed), 'all four have to pass for Strong');
  assert.ok(q.why, 'the sentence comes from the app, not from this module');
});

test('worth contacting never implies a sale or an ability to pay', async () => {
  const text = await renderDrawer(STRONG);
  assert.match(text, /Why they are worth contacting/);
  assert.match(text, /not a guess about whether they will buy/i);
  assert.match(text, /says nothing about what they can afford/i);
  for (const overclaim of [/likely to buy/i, /good lead/i, /high value/i, /will convert/i]) {
    assert.ok(!overclaim.test(text), `the page must not promise: ${overclaim}`);
  }
});

// ── 4. Held is a prerequisite, never a verdict ───────────────────────────

test('no contact yet is recoverable and is not drawn as a rejection', async () => {
  const held = { ...STRONG, email: null, primary_contact_reason: null, contact_state: CONTACT_STATE.NONE };
  const s = situationOf(held, { now: nowish });
  assert.equal(s.key, SITUATION.NO_CONTACT);
  assert.equal(s.judgement, false, 'a missing address is not a decision about the business');
  assert.equal(s.recoverable, true);
  assert.notEqual(s.tone, 'stop');

  const text = await renderDrawer(held);
  assert.match(text, /Nothing here is a judgement about the business/);
  for (const word of [/\brejected\b/i, /\bskipped\b/i, /\bfailed\b/i, /bad fit/i]) {
    assert.ok(!word.test(text), `held must not be described with ${word}`);
  }
});

test('a bounced address keeps everything already established', () => {
  const bounced = { ...STRONG, contact_state: CONTACT_STATE.NEEDS_CONTACT_RECOVERY, contact_state_reason: 'The address bounced.' };
  const s = situationOf(bounced, { now: nowish });
  assert.equal(s.key, SITUATION.CONTACT_BROKEN);
  assert.equal(s.judgement, false);
  // The evidence is untouched by a dead inbox, and the card must still show it.
  assert.ok(knowledgeOf(bounced, { now: nowish }).total > 0);
  assert.equal(qualificationOf(bounced, { now: nowish }).strong, true);
});

test('parked is the one state that is a decision about the business', () => {
  const parked = { ...STRONG, verification_state: VERIFICATION.NOT_ELIGIBLE, verification_reason: 'no-fit' };
  const s = situationOf(parked, { now: nowish });
  assert.equal(s.key, SITUATION.PARKED);
  assert.equal(s.judgement, true);
  // And the recoverable states are not.
  for (const state of [VERIFICATION.WAITING_FOR_BUDGET, VERIFICATION.RESEARCH_PROHIBITED]) {
    assert.equal(situationOf({ ...STRONG, verification_state: state }, { now: nowish }).judgement, false, state);
  }
});

// ── 5. Contactability sits apart from qualification ──────────────────────

test('being worth contacting and being reachable are answered separately', async () => {
  const text = await renderDrawer({ ...STRONG, email: null, contact_state: CONTACT_STATE.NONE });
  assert.match(text, /Why they are worth contacting/, 'still argues the case');
  assert.match(text, /How we can reach them/, 'and states the problem in its own section');
  assert.match(text, /No safe contact method found yet|no safe address/i);
});

test('the two questions cannot be collapsed into one field', () => {
  const card = prospectCard({ ...STRONG, email: null, contact_state: CONTACT_STATE.NONE }, { now: nowish });
  assert.equal(card.qualification.strong, true);
  assert.equal(card.contact.usable, false);
});

// ── 6, 7, 8. Evidence keeps its tiers and its silence ────────────────────

test('what was measured and what you saw are separate sections', () => {
  const k = knowledgeOf(STRONG, { now: nowish });
  const headings = k.sections.map((s) => s.heading);
  assert.ok(headings.includes('Checked and confirmed'));
  assert.ok(headings.includes('You confirmed'));
  const manual = k.sections.find((s) => s.tier === 'manual');
  assert.ok(manual.items.some((i) => /header video/.test(i.text)), "Ary's finding stays hers");
});

test('nothing checked is said as a gap in the work, never as a fact about them', async () => {
  const bare = { id: 7, name: 'Nobody', domain: 'nobody.com', stage: 'New' };
  const k = knowledgeOf(bare, { now: nowish });
  assert.equal(k.total, 0);
  assert.equal(k.sections.length, 0);

  const text = await renderDrawer(bare);
  assert.match(text, /Nothing yet\. The site check has not run\./);
  // The sentence that must never appear: an absent row rendered as a denial.
  for (const claim of [/they do not have/i, /has no booking/i, /lacks a/i]) {
    assert.ok(!claim.test(text), `absence must not become the claim ${claim}`);
  }
});

test('the tier is a footnote, never the headline', () => {
  const src = readFileSync(new URL('../components/prospects/ProspectCard.jsx', import.meta.url), 'utf8');
  for (const raw of ['>VERIFIED<', '>MANUAL<', '>INFERRED<']) {
    assert.ok(!src.includes(raw), `${raw} must not be rendered as a label`);
  }
});

// ── 9, 10. Provenance says what it knows and no more ─────────────────────

test('an unrecorded origin says so rather than borrowing one', () => {
  const o = originOf({ id: 1 });
  assert.equal(o.label, 'Source not recorded');
  assert.equal(o.recorded, false);
  assert.equal(o.structured, false);
  // And it never reaches for a neighbouring field that means something else.
  const withProvider = originOf({ id: 1, source_provider: 'apify', site_intel_source: 'precheck' });
  assert.equal(withProvider.label, 'Source not recorded', 'a provider is not an origin');
});

test('origin classes map to plain words, one for one', () => {
  const cases = [
    ['MAP_LISTING', 'Map listing'], ['SOCIAL_POST', 'Social post'], ['DIRECTORY', 'Directory'],
    ['MANUAL', 'Found manually'], ['REFERRAL', 'Referral'], ['REACTIVATION', 'Reactivation'], ['OTHER', 'Other'],
  ];
  for (const [cls, label] of cases) {
    const o = originOf({ origin_class: cls });
    assert.equal(o.label, label);
    assert.equal(o.structured, true);
  }
});

test('a legacy free-text source is shown, and is never promoted to a real origin', () => {
  const o = originOf({ source: 'Google Maps' });
  assert.match(o.label, /Google Maps/);
  assert.match(o.label, /older record/, 'and it says which field it came from');
  assert.equal(o.structured, false, 'the cohort rollups must not count it as recorded');
  assert.equal(o.recorded, false);
});

// ── 11, 12. Contact routes, deduplicated, without a second policy ────────

test('the same kind of route found twice collapses to one', () => {
  const c = contactabilityOf(STRONG, [
    { type: 'FORM', value: '/contact' },
    { type: 'FORM', value: '/get-in-touch' },
    { type: 'FORM', value: '/book' },
    { type: 'INSTAGRAM', value: '@hs' },
  ]);
  assert.deepEqual(c.alternates.map((a) => a.label), ['Contact form', 'Instagram']);
});

test('address ownership is humanised without restating the rule', () => {
  assert.match(contactabilityOf({ ...STRONG, primary_contact_reason: 'SAME_DOMAIN' }).emailOrigin, /their own website/i);
  assert.match(contactabilityOf({ ...STRONG, primary_contact_reason: 'OWNER_EXTERNAL' }).emailOrigin, /owner/i);
  // A typed-in address carries no stored reason, and inventing one would be a
  // claim about where it came from.
  assert.equal(contactabilityOf({ ...STRONG, primary_contact_reason: null }).emailOrigin, null);

  // The one rule lives in the discovery module and both callers ask it.
  assert.equal(showable(ASSOCIATION.THIRD_PARTY), false);
  assert.equal(showable(ASSOCIATION.SAME_DOMAIN), true);
  const held = readFileSync(new URL('../app/api/held/route.js', import.meta.url), 'utf8');
  assert.match(held, /showable\(/, 'the held bucket asks the shared rule rather than repeating it');
});

test('what discovery tried is only shown when a run is recorded', () => {
  assert.equal(contactabilityOf({ ...STRONG }).tried, null, 'no run, no claim that anybody looked');
  const searched = contactabilityOf({ ...STRONG, contact_searched_at: iso(nowish), contact_search_result: 'NONE', contact_search_pages: 4 });
  assert.equal(searched.tried.pages, 4);
  assert.match(searched.tried.text, /found no address/i);
});

// ── 13. Staleness comes from configuration ───────────────────────────────

test('evidence age uses the configured threshold, not a number typed in here', () => {
  const old = { ...STRONG, site_intel: JSON.stringify({ ...JSON.parse(STRONG.site_intel), checkedAt: iso('2026-01-01') }) };
  const k = knowledgeOf(old, { now: nowish });
  assert.equal(k.staleDays, SEND_DEFAULTS.evidenceStaleDays, 'the default is read from the policy module');
  assert.equal(k.stale, true);
  // A workspace with a stricter setting gets its own answer.
  assert.equal(knowledgeOf(old, { now: nowish, staleDays: 3650 }).stale, false);
  const src = readFileSync(new URL('../lib/prospect-card.mjs', import.meta.url), 'utf8');
  assert.ok(!/staleDays\s*=\s*90\b/.test(src), '90 must never be hard-coded here');
});

// ── 14, 15. The next step points somewhere, and changes nothing ──────────

test('the next step is derived from the state and names an existing place', async () => {
  const { BUCKET_VIEWS } = await import('../lib/today-buckets.mjs');
  const known = new Set([...BUCKET_VIEWS, 'clients', 'prospects', 'today', 'settings', null]);
  const states = [
    {}, { do_not_contact: 1 }, { unsubscribed: 1 }, { stage: 'Client' }, { replied: 1 },
    { deferred_until: '2099-01-01' }, { contact_state: CONTACT_STATE.NONE },
    { contact_state: CONTACT_STATE.NEEDS_CONTACT_RECOVERY }, { verification_state: VERIFICATION.NOT_ELIGIBLE },
    { verification_state: VERIFICATION.WAITING_FOR_BUDGET }, { verification_state: VERIFICATION.RESEARCH_PROHIBITED },
  ];
  for (const patch of states) {
    const n = nextActionOf({ ...STRONG, ...patch }, { now: nowish });
    assert.ok(n.text && n.text.length > 5, `no next step for ${JSON.stringify(patch)}`);
    assert.ok(known.has(n.view), `${n.view} is not a route that exists`);
  }
});

test('the next-step panel owns no mutation', () => {
  const view = readFileSync(new URL('../lib/prospect-card.mjs', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../components/prospects/ProspectCard.jsx', import.meta.url), 'utf8');
  for (const src of [view, card]) {
    assert.ok(!/method:\s*'(PUT|POST|PATCH|DELETE)'/.test(src), 'the card reads and never writes');
  }
});

// ── 16, 17. Engineering data stays reachable and stops being first ───────

test('technical fields are not headings, and are still there', async () => {
  const text = await renderDrawer(STRONG);
  // One disclosure, at the bottom, named for what it holds. The card used to
  // carry a second one of its own halfway up the page.
  assert.match(text, /System details/);
  assert.equal(text.split('System details').length - 1, 1, 'exactly one technical disclosure on the page');
  assert.ok(!text.includes('Technical details'), 'the old second disclosure is gone');
  const head = text.slice(0, text.indexOf('System details'));
  for (const leak of [/SAME_DOMAIN/, /NOT_ELIGIBLE/, /WAITING_FOR_/, /MAP_LISTING/, /confidence: 0\./]) {
    assert.ok(!leak.test(head), `${leak} is engineering vocabulary and must sit under the disclosure`);
  }
});

// ── 19, 20, 21. What this pass was not allowed to do ─────────────────────

test('no model call was added for any of this', () => {
  for (const file of ['../lib/prospect-card.mjs', '../components/prospects/ProspectCard.jsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const forbidden of ['askBackground', '/api/ai', 'anthropic', 'callAI']) {
      assert.ok(!src.includes(forbidden), `${file} must not reach a model (${forbidden})`);
    }
  }
});

test('sending, approval and the queue were not touched', () => {
  const guard = readFileSync(new URL('../lib/send-guard.mjs', import.meta.url), 'latin1');
  assert.ok(guard.includes('AUTOMATION_OFF'));
  for (const file of ['../lib/send-guard.mjs', '../lib/send-runner.mjs', '../lib/send-policy.mjs', '../lib/approval.mjs']) {
    const src = readFileSync(new URL(file, import.meta.url), 'latin1');
    assert.ok(!src.includes('prospect-card'), `${file} must not depend on how a prospect is displayed`);
  }
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});

// ── 23. No second state machine in React ─────────────────────────────────

test('the card consumes the canonical rules rather than reimplementing them', () => {
  const src = readFileSync(new URL('../lib/prospect-card.mjs', import.meta.url), 'utf8');
  for (const owner of ['contact-state.mjs', 'verification.mjs', 'vet.mjs', 'evidence.mjs', 'priority.mjs', 'deferral.mjs']) {
    assert.ok(src.includes(owner), `the view model has to read ${owner}, not guess at it`);
  }
  const card = readFileSync(new URL('../components/prospects/ProspectCard.jsx', import.meta.url), 'utf8');
  // The component draws. It does not decide.
  for (const rule of ['strongGate', 'contactStateOf', 'buildVetResult', 'evidenceStrength']) {
    assert.ok(!card.includes(rule), `${rule} belongs behind the view model, not in a component`);
  }
});

// ── 22. Narrow layout ────────────────────────────────────────────────────

test('nothing in the card is pinned wider than a phone', () => {
  const src = readFileSync(new URL('../components/prospects/ProspectCard.jsx', import.meta.url), 'utf8');
  const mins = [...src.matchAll(/min-w-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  for (const w of mins) assert.ok(w <= 200, `min-w-[${w}px] will scroll a narrow drawer sideways`);
  // Long strings are the other cause: an address or a URL with nowhere to break.
  assert.match(src, /break-all|break-words/, 'long values have to be allowed to wrap');
});

// ── Identity ─────────────────────────────────────────────────────────────

test('the same words are never printed twice in the header', () => {
  const both = identityOf({ id: 1, name: 'Heart and Soul', business_name: 'Heart and Soul' });
  assert.equal(both.title, 'Heart and Soul');
  assert.equal(both.subtitle, null, 'the importer copied the name; do not echo it');
  assert.equal(both.businessMirrorsName, true);

  const businessOnly = identityOf({ id: 2, business_name: 'Bloom Studio' });
  assert.equal(businessOnly.title, 'Bloom Studio', 'with no person, the business is the heading');

  // Absent is absent. "Unknown" is a word occupying the space where a fact
  // would go.
  assert.equal(identityOf({ id: 3, name: 'A' }).location, null);
});

// ── History ──────────────────────────────────────────────────────────────

test('history contains only moments that were written down', () => {
  const rows = historyOf(STRONG);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.at), 'every entry carries the timestamp it came from');
  // Sorted, so it reads as a sequence rather than as the order of the fields.
  const times = rows.map((r) => String(r.at));
  assert.deepEqual(times, [...times].sort((a, b) => a.localeCompare(b)));
  // Nothing is invented for a record with no timestamps at all.
  assert.deepEqual(historyOf({ id: 5 }), []);
});

test('a transition nobody recorded does not appear', () => {
  // Strong is computed, never stamped. There is no "became Strong" date on the
  // record, so there must be no row claiming one.
  const rows = historyOf(STRONG);
  assert.ok(!rows.some((r) => /strong/i.test(r.what)), 'no date may be invented for a computed verdict');
});


test('a stop that can be undone is never dressed as a refusal', () => {
  // The most common shape in the pipeline: imported, no website yet.
  const noSite = situationOf({ id: 1, business_name: 'X', email: 'a@b.com', stage: 'New' }, { now: nowish });
  assert.equal(noSite.key, SITUATION.MISSING_INPUT);
  assert.equal(noSite.judgement, false);
  assert.notEqual(noSite.tone, 'stop');
  assert.match(noSite.detail, /Add their domain/);

  // A real refusal still reads as one.
  const declined = situationOf({ id: 2, domain: 'x.com', email: 'a@b.com', stage: 'New', reply_type: 'decline', replied: 0 }, { now: nowish });
  assert.equal(declined.key, SITUATION.NOT_A_FIT);
  assert.equal(declined.judgement, true);
});

// ── One vocabulary, two screens ──────────────────────────────────────────
//
// Start here explains what Held means to somebody who has not opened a prospect
// yet. The prospect page says what is happening with this particular business.
// Those are different sentences on purpose and always will be.
//
// What they may never disagree about is whether a word is a conclusion about
// the business or a prerequisite nobody has met. Held drawn like a rejection
// turns 702 reachable businesses into a graveyard; Parked drawn like a
// prerequisite invites more spending on a business the rules already ruled out.
// Both surfaces read that pair from lib/concepts.mjs, and this is the test that
// keeps it that way.

test('the glossary is built from the shared vocabulary, not typed beside it', async () => {
  const { GLOSSARY } = await import('../lib/help-copy.mjs');
  const { CONCEPTS } = await import('../lib/concepts.mjs');
  assert.equal(GLOSSARY.length, CONCEPTS.length);
  for (const c of CONCEPTS) {
    const entry = GLOSSARY.find((g) => g.term === c.term);
    assert.ok(entry, `no glossary entry for ${c.key}`);
    assert.equal(entry.short, c.short, `${c.key} says two different one-liners`);
    assert.equal(entry.judgement, c.judgement);
    assert.ok(entry.body && entry.body.length > 40, `${c.key} lost its paragraph`);
  }
  const src = readFileSync(new URL('../lib/help-copy.mjs', import.meta.url), 'utf8');
  assert.match(src, /GLOSSARY = CONCEPTS\.map/, 'the glossary has to be derived, not restated');
});

test('the prospect page classifies a shared word the same way the glossary does', async () => {
  const { situationOf, SITUATION } = await import('../lib/prospect-card.mjs');
  const { CONCEPT } = await import('../lib/concepts.mjs');
  const { CONTACT_STATE } = await import('../lib/contact-state.mjs');
  const { VERIFICATION } = await import('../lib/verification.mjs');

  const cases = [
    [{ id: 1, domain: 'x.com', email: null, contact_state: CONTACT_STATE.NONE }, SITUATION.NO_CONTACT, 'HELD'],
    [{ id: 2, domain: 'x.com', email: 'a@b.com', contact_state: CONTACT_STATE.NEEDS_CONTACT_RECOVERY }, SITUATION.CONTACT_BROKEN, 'HELD'],
    [{ id: 3, domain: 'x.com', email: 'a@b.com', verification_state: VERIFICATION.NOT_ELIGIBLE }, SITUATION.PARKED, 'PARKED'],
    [{ id: 4, domain: 'x.com', email: 'a@b.com', deferred_until: '2099-01-01' }, SITUATION.DEFERRED, 'DEFERRED'],
  ];
  for (const [prospect, key, concept] of cases) {
    const s = situationOf(prospect);
    assert.equal(s.key, key);
    assert.equal(s.concept, concept, `${key} should name the ${concept} concept`);
    assert.equal(s.judgement, CONCEPT[concept].judgement, `${concept} is classified two different ways`);
    assert.equal(s.recoverable, !CONCEPT[concept].judgement);
  }
});

test('Held is a prerequisite and Parked is a decision, in exactly one place', async () => {
  const { CONCEPT } = await import('../lib/concepts.mjs');
  assert.equal(CONCEPT.HELD.judgement, false);
  assert.equal(CONCEPT.HELD.recoverable, true);
  assert.equal(CONCEPT.PARKED.judgement, true);
  assert.equal(CONCEPT.PARKED.recoverable, false);
  // Parked is the only conclusion in the vocabulary. If that ever stops being
  // true it should be a deliberate edit, not a side effect.
  const judgements = Object.entries(CONCEPT).filter(([, c]) => c.judgement).map(([k]) => k);
  assert.deepEqual(judgements, ['PARKED']);
});

test('neither screen restates a classification the other owns', () => {
  const card = readFileSync(new URL('../lib/prospect-card.mjs', import.meta.url), 'utf8');
  // The situations that map to a shared word must not carry their own flag.
  for (const key of ['NO_CONTACT', 'CONTACT_BROKEN', 'PARKED', 'WORTH_CONTACTING', 'DEFERRED']) {
    const line = card.split('\n').find((l) => l.includes(`[SITUATION.${key}]:`));
    assert.ok(line, `no copy for ${key}`);
    assert.ok(/concept: '/.test(line), `${key} must name its shared concept`);
    assert.ok(!/judgement:/.test(line), `${key} must not restate the classification`);
  }
  assert.match(card, /CONCEPT\[copy\.concept\]\.judgement/, 'and it must read the shared one');
});

test('consolidating the wording changed no prospecting rule', () => {
  const concepts = readFileSync(new URL('../lib/concepts.mjs', import.meta.url), 'utf8');
  // Vocabulary only. Nothing here may decide which concept applies to anybody.
  for (const policy of ['strongGate', 'contactStateOf', 'buildVetResult', 'prescreen', 'evidenceStrength', 'allowedTouches']) {
    assert.ok(!concepts.includes(policy), `${policy} is policy and must not live in the vocabulary`);
  }
  assert.ok(!/import .* from/.test(concepts), 'the vocabulary depends on nothing');
});
