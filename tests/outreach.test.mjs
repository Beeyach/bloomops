import test from 'node:test';
import assert from 'node:assert/strict';
import { canPrepare, planPackage, buildEmailParts, validateOutreachEmail, STATUS } from '../lib/outreach.mjs';
import { selectPlaybook, PLAYBOOK, PLAYBOOKS } from '../lib/playbooks.mjs';
import { pdfDecision, videoDecision, PDF, VIDEO } from '../lib/assets.mjs';
import { parseFollowUp } from '../lib/followup.mjs';
import { sanitizeAutoLimits } from '../lib/auto-budget.mjs';

// Turning a qualified prospect into something Ary can approve in ten seconds.
//
// The order is the safety property: eligibility, then evidence, then angle,
// then email. Every decision the generator could get wrong is made from facts
// before it runs, so it is writing four sentences about a conclusion rather
// than looking for something to say.

const NOW = new Date('2026-08-09T12:00:00Z');

// Ratings are the emoji the table stores, not numbers.
const GREEN = String.fromCodePoint(0x1F49A);
const BLUE = String.fromCodePoint(0x1F499);
const DEAD = String.fromCodePoint(0x1F940);

const withFindings = (keys, over = {}) => ({
  id: 1, name: 'Kym', business_name: 'Coastal', email: 'kym@coastal.com.au',
  domain: 'coastal.com.au', country: 'AU', stage: 'Validated', rating: GREEN,
  site_intel: JSON.stringify({
    checkedAt: '2026-08-08T00:00:00Z', pagesChecked: 4, readFacts: true, blocked: null,
    keys, reasons: keys.map((k) => `finding for ${k}`),
  }),
  ...over,
});

// ── Eligibility comes before everything ──────────────────────────────────

test('a conversation outranks a Strong verdict', () => {
  // Qualification says the business is worth writing to. It says nothing about
  // whether somebody is already mid-sentence with them.
  const r = canPrepare(withFindings(['form-broken'], { replied: 1, reply_date: '2026-08-08', last_contact_date: '2026-08-01' }), { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.BLOCKED);
});

test('no verified evidence means no email, and it says so', () => {
  const r = canPrepare({ id: 2, email: 'a@b.com', stage: 'Validated' }, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, STATUS.NEEDS_DECISION);
  assert.match(r.reason, /nothing true to say|verified/i);
});

test('cosmetic-only findings are not worth an email', () => {
  const r = canPrepare(withFindings(['stale-copyright', 'no-meta-description']), { now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cosmetic/i);
});

test('not being due yet does not block preparing', () => {
  // Preparing ahead of the date is the entire point of preparing.
  const r = canPrepare(withFindings(['form-broken'], { next_action_date: null }), { now: NOW });
  assert.equal(r.ok, true);
});

// ── The angle must be one the evidence supports ──────────────────────────

test('a broken form picks the lead capture angle', () => {
  const r = selectPlaybook(withFindings(['form-broken']), { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.LEAD_CAPTURE_GAP);
  assert.ok(r.supporting.length);
});

test('missing booking is NOT a booking angle', () => {
  // The website-audit skill is explicit that manual scheduling is often
  // deliberate, and this is the claim most likely to get a correction back.
  const booking = PLAYBOOKS.find((p) => p.id === PLAYBOOK.BOOKING_FRICTION);
  assert.ok(!booking.keys.includes('no-booking'), 'absence of a calendar is not friction');
  const r = selectPlaybook(withFindings(['no-booking']), { now: NOW });
  assert.notEqual(r.playbook.id, PLAYBOOK.BOOKING_FRICTION);
});

test('a booking path that is verifiably awkward does pick it', () => {
  const r = selectPlaybook(withFindings(['booking-is-a-form']), { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.BOOKING_FRICTION);
});

test("Ary's own finding outranks anything the machine noticed", () => {
  const p = withFindings(['form-broken'], {
    own_findings: JSON.stringify([{ text: 'Their intake form emails a personal gmail', at: '2026-08-07' }]),
  });
  const r = selectPlaybook(p, { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.OWN_FINDING);
});

test('nothing verified means no safe angle, stated', () => {
  const r = selectPlaybook({ id: 9, stage: 'Validated' }, { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.NONE);
  assert.ok(r.why.length > 10);
});

// ── Assets are two decisions, not one ────────────────────────────────────

test('one finding does not earn a PDF that repeats the email', () => {
  const d = pdfDecision(withFindings(['form-broken']), { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  assert.equal(d.decision, PDF.OPTIONAL);
  assert.match(d.reason, /repeat/i);
});

test('several findings and a country earn a PDF', () => {
  const d = pdfDecision(withFindings(['form-broken', 'dead-links', 'mobile-overflow']), { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  assert.equal(d.decision, PDF.RECOMMENDED);
});

test('an existing review page means no new PDF', () => {
  const d = pdfDecision(withFindings(['form-broken', 'dead-links'], { review_url: 'https://file.gobloomwired.com/review/x' }), { now: NOW });
  assert.equal(d.decision, PDF.NO);
});

test('video needs strong evidence AND something to show', () => {
  // Real findings, none of them visual. This is an email.
  const invisible = videoDecision(withFindings(['insecure', 'phone-mismatch']), { now: NOW, playbookId: PLAYBOOK.TRUST_GAP });
  assert.equal(invisible.decision, VIDEO.NONE);
  assert.match(invisible.reason, /nothing to show/i);

  const visual = videoDecision(withFindings(['form-broken', 'mobile-overflow']), { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  assert.equal(visual.decision, VIDEO.RECOMMENDED);
  assert.equal(visual.why, 'MULTIPLE_VISUAL_FINDINGS');
});

test('the evidence decides the video, not the rating', () => {
  // The production package recommended a 200-credit video off ONE visual
  // finding because the prospect was rated green. That is the rating deciding
  // rather than informing: one thing to point at is a sentence, and paying to
  // say it out loud is the "reaching" video the findings rules exist to stop.
  const at = { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP };
  const oneVisualLiked = videoDecision(withFindings(['form-broken', 'insecure'], { rating: GREEN }), at);
  assert.equal(oneVisualLiked.decision, VIDEO.OPTIONAL);
  assert.equal(oneVisualLiked.why, 'ONE_VISUAL_ONLY');

  // And two visual findings carry it with no rating at all.
  const twoVisualUnrated = videoDecision(withFindings(['form-broken', 'mobile-overflow'], { rating: null }), at);
  assert.equal(twoVisualUnrated.decision, VIDEO.RECOMMENDED);
});

test('stale evidence never earns a video', () => {
  const old = withFindings(['form-broken', 'mobile-overflow'], { rating: GREEN });
  const intel = JSON.parse(old.site_intel);
  intel.checkedAt = '2026-05-01T00:00:00Z';
  old.site_intel = JSON.stringify(intel);
  const d = videoDecision(old, { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  assert.equal(d.decision, VIDEO.NONE);
  assert.equal(d.why, 'EVIDENCE_STALE');
});

test('the PDF reason names our own asset, not the prospect reviews page', () => {
  // review_url is the page THIS product generated at file.gobloomwired.com.
  // The reason used to read "they already have a review page", which sounds
  // like their testimonials and made the rule look like it treated a
  // prospect's own reviews as a substitute for our note.
  const d = pdfDecision(withFindings(['form-broken', 'dead-links'], { review_url: 'https://file.gobloomwired.com/review/x' }), { now: NOW });
  assert.equal(d.decision, PDF.NO);
  assert.equal(d.why, 'CURRENT_ASSET_EXISTS');
  assert.match(d.reason, /We have already made them one/);
  assert.doesNotMatch(d.reason, /they already have/i);
});

test('a site that could not be read never gets a walkthrough', () => {
  const p = withFindings(['form-broken', 'mobile-overflow']);
  p.site_intel = JSON.stringify({ ...JSON.parse(p.site_intel), blocked: { reason: 'empty' } });
  assert.equal(videoDecision(p, { now: NOW }).decision, VIDEO.NONE);
});

test('a strong prospect does not automatically get both assets', () => {
  const p = withFindings(['form-broken', 'dead-links', 'mobile-overflow']);
  const pdf = pdfDecision(p, { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  const video = videoDecision(p, { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  // They may both be recommended, but each must justify itself separately and
  // say why in its own words.
  assert.ok(pdf.reason !== video.reason, 'each asset argues for itself');
});

// ── The plan, and the prompt it produces ─────────────────────────────────

test('a full plan carries everything the reviewer needs', () => {
  const plan = planPackage(withFindings(['form-broken', 'dead-links']), { now: NOW, prices: { video: 200 } });
  assert.equal(plan.ok, true);
  assert.ok(plan.whyContact);
  assert.ok(plan.playbook.id);
  assert.ok(plan.contact.email);
  assert.ok(plan.pdf.decision && plan.video.decision);
  assert.ok(plan.supporting.length);
});

test('the prompt is handed a decision, not a prospect', () => {
  const plan = planPackage(withFindings(['form-broken']), { now: NOW });
  const { system, user } = buildEmailParts({ positioning: 'booking and follow-up systems' }, withFindings(['form-broken']), plan);
  assert.match(system, /The angle has already been chosen for you/);
  assert.match(system, /NO SAFE ANGLE/, 'and it is allowed to refuse');
  // Reworded when a draft answered the old line, which listed only numbers,
  // with a qualitative claim instead. What matters is that the prompt forbids
  // saying anything about the trade, and confines the email to three things.
  assert.match(system, /Never describe what people in their trade do/);
  assert.match(system, /what was observed on their site, what you could not tell from outside, and the offer/);
  assert.match(user, /Verified about them/);
});

// ── Validation against the decision that produced it ─────────────────────

const plan = planPackage(withFindings(['form-broken']), { now: NOW });

test('claiming they have no booking system is caught when it was never verified', () => {
  const parsed = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Kym. I noticed you do not have an online booking system on the site. How do people book with you at the moment?');
  const v = validateOutreachEmail(parsed, plan);
  assert.ok(v.flags.some((f) => /never verified and is often deliberate/.test(f)));
});

test('claiming they are losing business is caught', () => {
  const parsed = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Kym. Your contact form did not submit when I tried it, which means you are losing enquiries every week. How are messages reaching you?');
  const v = validateOutreachEmail(parsed, plan);
  assert.ok(v.flags.some((f) => /losing business/.test(f)));
});

test('a truthful email grounded in the evidence passes clean', () => {
  const parsed = parseFollowUp('SUBJECT: your contact form\nBODY:\nHi Kym. I tried the contact form on your site last week and it did not submit for me. If that is already sorted, ignore me. How are enquiries reaching you at the moment?');
  const v = validateOutreachEmail(parsed, plan);
  assert.deepEqual(v.flags, [], `unexpected flags: ${v.flags.join('; ')}`);
  assert.equal(v.clean, true);
});

// ── The settings that stop it spending ───────────────────────────────────

test('asset generation is off by default and email preparation is on', () => {
  const l = sanitizeAutoLimits({});
  assert.equal(l.autoPrepareEmail, true, 'a draft costs a fraction of a cent');
  assert.equal(l.autoGeneratePdf, 'off');
  assert.equal(l.autoGenerateVideo, 'off');
  assert.equal(l.maxAssetCreditsPerDay, 0, 'research money must not authorise render money');
});

test('an unrecognised asset mode is never read as permission', () => {
  assert.equal(sanitizeAutoLimits({ autoGenerateVideo: 'yes please' }).autoGenerateVideo, 'off');
  assert.equal(sanitizeAutoLimits({ autoGenerateVideo: 'ON' }).autoGenerateVideo, 'off');
  assert.equal(sanitizeAutoLimits({ autoGenerateVideo: 'recommended-only' }).autoGenerateVideo, 'recommended-only');
});

test('the claim check reads the finding, not the wording', () => {
  // The probe writes "the contact form does not submit" and the email says "I
  // tried the form". Comparing one piece of English to another calls that a
  // fabrication, which is how a validator starts rejecting good emails.
  const evidenceOnly = {
    ok: true,
    supporting: [{ key: 'form-broken', text: 'Some quite differently worded finding' }],
    evidence: [],
  };
  const parsed = parseFollowUp('SUBJECT: your contact form\nBODY:\nHi Kym. I tried the contact form on your site and it did not submit for me. If that is already sorted, ignore me. How are enquiries reaching you now?');
  const v = validateOutreachEmail(parsed, evidenceOnly);
  assert.deepEqual(v.flags, [], 'the key says the finding is real whatever words it used');
});

test('speed is always unsupported, because nothing measures it', () => {
  const parsed = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Kym. Your site loads slowly on my connection, which is worth a look. How are enquiries reaching you now?');
  const v = validateOutreachEmail(parsed, { supporting: [{ key: 'form-broken', text: 'x' }], evidence: [] });
  assert.ok(v.flags.some((f) => /speed/.test(f)));
});

test('the rating check reads the emoji the table actually stores', () => {
  // An earlier version compared Number(p.rating) >= 3. Every rating in the
  // database is an emoji, so that was NaN on every row and the branch never
  // once ran: no prospect could ever be recommended a video.
  const visual = ['form-broken', 'mobile-overflow'];
  const at = { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP };
  // Two visual findings carry it regardless; the rating is named in the reason
  // so she can see it was considered.
  assert.match(videoDecision(withFindings(visual, { rating: GREEN }), at).reason, /You rated them/);
  assert.match(videoDecision(withFindings(visual, { rating: BLUE }), at).reason, /You rated them/);
  assert.doesNotMatch(videoDecision(withFindings(visual, { rating: DEAD }), at).reason, /You rated them/);
  assert.doesNotMatch(videoDecision(withFindings(visual, { rating: null }), at).reason, /You rated them/);
});

test('an invented worry phrased as an observation is still caught', () => {
  // The shape the first real package produced: "this is usually the point
  // where people lose a few days waiting on a reply". Same invented claim,
  // phrased as a fact about the world rather than about them, which is what
  // let it past a pattern looking for "a lot of coaches".
  const r = parseFollowUp('SUBJECT: how bookings reach you\nBODY:\nHi Deborah. Your booking page is a request form rather than a live calendar. If that is already handled, ignore me. This is usually the point where people lose a few days waiting on a reply. How does a booking reach your calendar now?');
  assert.ok(r.banned.includes('a claim about what happens to other businesses'));
});

test('the video reason counts in English', () => {
  const one = videoDecision(withFindings(['form-broken', 'insecure'], { rating: GREEN }), { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  assert.match(one.reason, /1 thing to show/, `got: ${one.reason}`);
  const many = videoDecision(withFindings(['form-broken', 'mobile-overflow'], { rating: GREEN }), { now: NOW, playbookId: PLAYBOOK.LEAD_CAPTURE_GAP });
  assert.match(many.reason, /2 things to show/);
});

// The approval queue said every package was blocked, and showed the address it
// claimed not to have on the next line.
//
// The GET query aliases `p.email AS prospect_email` so it does not collide
// with the package's own columns, then handed that row straight to the
// outbound guard, which reads `p.email`. Every package came back BLOCKED with
// "No email address on the record", so nothing could ever be approved, and
// there were zero sends in production for a reason nobody had noticed.
//
// The same omission hid do_not_contact and unsubscribed, which fails the other
// way: a package for somebody who had unsubscribed would NOT have been blocked.
test('the approval queue selects every column its guard reads', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
  const select = src.slice(src.indexOf('SELECT k.*'), src.indexOf('FROM outreach_packages'));
  for (const field of ['email', 'stage', 'replied', 'reply_type', 'next_action_date', 'do_not_contact', 'unsubscribed']) {
    // Built from a plain string: in a template literal `\b` is a backspace
    // character, not a word boundary, and the assertion silently never matches.
    assert.match(select, new RegExp('p\\.' + field + '\\b'), `the guard reads ${field} and the query does not select it`);
  }
  // And the row never reaches the guard raw. guardView undoes the alias in one
  // place and throws when a column is absent, so "not selected" and "no email
  // address" stop being the same answer.
  assert.match(src, /guardView\(/, 'the guard must be given a checked view, not a joined row');
  assert.match(src, /aliases:\s*\{[^}]*email:\s*'prospect_email'/, 'the alias is declared at the boundary');
});
