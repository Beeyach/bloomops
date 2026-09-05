import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readRules, matchRules, qualificationFlags, classifyRed, RED, GREEN, ruleId,
} from '../lib/qual-rules.mjs';
import { prescreen, buildVetResult } from '../lib/vet.mjs';
import { rankProspects, BAND } from '../lib/pick.mjs';

// Ary's twenty, verbatim. Not a paraphrase: the whole point of the classifier
// is that it reads what is actually stored, and a test written against tidied
// -up versions of the rules would prove nothing about the real ones.
const SETTINGS = {
  offer: 'fixes the form, booking, reminders, and follow-up path so every inquiry gets answered, booked, or brought back',
  audience: 'small service businesses',
  greenRules: [
    'inquiries or leads going cold before they book',
    'people message or inquire and then never book',
    'missed calls or missed DMs turning into lost bookings',
    'asking for a booking system, CRM or intake form',
    'asking for follow-up automation, reminders or auto-replies',
    'no-shows they are losing every week',
    'calendar gaps while they say they are slammed',
    'hiring an assistant to chase and follow up leads',
    'front desk cannot keep up with the messages',
    'running ads but the inquiries are not converting',
  ],
  redRules: [
    'the post sells instead of asks: we help, our team, a list of packages or prices',
    'ends on a call to action (DM me, link in bio, comment a word, spots open) instead of a question',
    'shows off client results, testimonials or screenshots of wins',
    'scarcity pitch: taking on 3 clients this month, 2 spots left',
    'wants ads run or content made, nothing about what happens after someone inquires',
    'scam patterns: vague opportunity, pay to apply, rates too good to be true',
    'engagement farming: a poll, a hot take or a hook with no actual request in it',
    'hiring a full-time employee or a salaried assistant, not a setup',
    'procurement wording: RFP, vendor onboarding, tender, purchasing department',
    'asking for free work, a spec build, or a quick favour',
  ],
};

test('all twenty rules read and classify', () => {
  const r = readRules(SETTINGS);
  assert.equal(r.green.length, 10);
  assert.equal(r.red.length, 10);
});

// ── The non-negotiable ───────────────────────────────────────────────────

test('a green rule can never create evidence', () => {
  const q = qualificationFlags(
    { qualification: JSON.stringify({ reasons: ['front desk cannot keep up with the messages'] }) },
    SETTINGS
  );
  assert.ok(q.matchedGreen.length > 0, 'the rule did match');
  assert.equal(q.evidence, 'never');
});

test('wanting a prospect badly does not give Vet anything to say about them', () => {
  // Everything green fires. Nothing has been verified about their site.
  const p = {
    id: 1,
    domain: 'example.com',
    qualification: JSON.stringify({
      reasons: SETTINGS.greenRules.slice(0, 5),
      postText: 'our front desk cannot keep up with the messages',
    }),
  };
  const v = buildVetResult(p, { settings: SETTINGS });
  assert.equal(v.qualification.green.length, 5, 'the rules matched');
  assert.equal(v.fit.level, 'good', 'and fit rose, which is what they are allowed to do');
  // The two that decide whether there is a truthful email to write.
  assert.equal(v.opportunity.level, 'none');
  assert.equal(v.evidenceQuality.level, 'none');
  assert.notEqual(v.verdict, 'STRONG', 'five green rules must not manufacture a Strong');
});

// ── Red rules are five instructions, not one ─────────────────────────────

test('red rules keep their different meanings', () => {
  const { red } = readRules(SETTINGS);
  const by = (i) => red[i].semantic;
  assert.equal(by(5), RED.HARD_SKIP, 'scam');
  assert.equal(by(4), RED.OUTREACH_EXCLUSION, 'wants ads run');
  assert.equal(by(7), RED.OUTREACH_EXCLUSION, 'hiring an employee');
  assert.equal(by(8), RED.OUTREACH_EXCLUSION, 'procurement');
  assert.equal(by(9), RED.LEAN_SKIP, 'asking for free work');
  // Six of the ten judge the post, not the business. Flattening these into
  // permanent skips would blacklist real businesses for posting a testimonial.
  for (const i of [0, 1, 2, 3, 6]) assert.equal(by(i), RED.LEAN_SKIP, `rule ${i + 1}`);
  assert.ok(new Set(red.map((r) => r.semantic)).size >= 3, 'not all red rules are the same instruction');
});

test('a post-shape red rule does not stop research', () => {
  const p = {
    id: 1,
    domain: 'example.com',
    qualification: JSON.stringify({ reasons: ['shows off client results, testimonials or screenshots of wins'] }),
  };
  const pre = prescreen(p, { settings: SETTINGS });
  assert.equal(pre.pass, true, 'a salesy post is not a permanent disqualification');
  assert.equal(pre.qualification.action.semantic, RED.LEAN_SKIP);
});

test('a hard skip and an offer mismatch both stop it, with the rule named', () => {
  for (const [reason, semantic] of [
    ['scam patterns: vague opportunity, pay to apply, rates too good to be true', RED.HARD_SKIP],
    ['procurement wording: RFP, vendor onboarding, tender, purchasing department', RED.OUTREACH_EXCLUSION],
  ]) {
    const pre = prescreen(
      { id: 1, domain: 'example.com', qualification: JSON.stringify({ reasons: [reason] }) },
      { settings: SETTINGS }
    );
    assert.equal(pre.pass, false);
    assert.equal(pre.rule, `qualification:${semantic}`);
    assert.match(pre.reasons[0], /Your own rule/, 'the reason names whose rule it was');
  }
});

// ── Never guessing ───────────────────────────────────────────────────────

test('a scraped prospect with no post text evaluates to twenty unknowns', () => {
  // Every one of Ary's rules is about something somebody WROTE. A prospect
  // from a map listing wrote nothing, so there is no honest answer but this.
  const m = matchRules(readRules(SETTINGS), {});
  assert.equal(m.matchedGreen.length, 0);
  assert.equal(m.matchedRed.length, 0);
  assert.equal(m.unknown.length, 20);
  const q = qualificationFlags({ id: 1, domain: 'example.com' }, SETTINGS);
  assert.equal(q.known, false);
  assert.equal(q.action, null);
});

test('prescreen on a scraped prospect is unchanged by the rules existing', () => {
  const p = { id: 1, domain: 'example.com' };
  const withRules = prescreen(p, { settings: SETTINGS });
  const without = prescreen(p);
  assert.equal(withRules.verdict, without.verdict);
  assert.equal(withRules.rule, without.rule);
});

// ── Deterministic matching, and what it must NOT match ───────────────────

test('four rules can be decided from raw text', () => {
  const rules = readRules(SETTINGS);
  const cases = [
    ['We are issuing an RFP for vendor onboarding this quarter.', RED.OUTREACH_EXCLUSION],
    ['Could someone do this as a quick favour, unpaid?', RED.LEAN_SKIP],
    ['Hiring a full-time employee, salaried, benefits package included.', RED.OUTREACH_EXCLUSION],
    ['Great opportunity, pay to apply, no experience needed.', RED.HARD_SKIP],
  ];
  for (const [postText, semantic] of cases) {
    const m = matchRules(rules, { postText });
    assert.ok(m.matchedRed.length, `nothing matched: ${postText}`);
    assert.equal(m.matchedRed[0].semantic, semantic, postText);
    assert.ok(m.matchedRed[0].quote, 'the matched phrase is recorded');
    assert.equal(m.matchedRed[0].source, 'deterministic');
  }
});

test('the deterministic rules do not fire on ordinary business language', () => {
  // Each of these contains a word from a rule and means something else. A
  // false positive here writes a permanent skip onto a real prospect.
  const rules = readRules(SETTINGS);
  const innocent = [
    'Visit our purchasing page for wholesale pricing.',
    'Book a free consultation with one of our therapists.',
    'We are hiring a massage therapist, part time, apply within.',
    'Our team offers competitive rates and free parking.',
    'Tender loving care for your pets since 2011.',
  ];
  for (const postText of innocent) {
    const m = matchRules(rules, { postText });
    assert.equal(m.matchedRed.length, 0, `false positive on: ${postText}`);
  }
});

// ── Traceability ─────────────────────────────────────────────────────────

test('a match records which rule, from where, and the words that justified it', () => {
  const m = matchRules(readRules(SETTINGS), {
    leadReasons: ['asking for follow-up automation, reminders or auto-replies'],
  });
  const hit = m.matchedGreen[0];
  assert.ok(hit.id.startsWith('green-'));
  assert.equal(hit.source, 'lead-scoring');
  assert.ok(hit.quote.length > 0);
  assert.equal(hit.effect, GREEN.STATED_NEED);
});

test('a rule id changes when the rule is rewritten', () => {
  // Traceability depends on this: a package traced to a rule must not have
  // that rule silently mean something else six months later.
  assert.notEqual(
    ruleId('red', 'procurement wording: RFP, vendor onboarding'),
    ruleId('red', 'anybody mentioning a purchase order')
  );
});

test('a loose restatement does not get attached to a rule', () => {
  // The scorer is asked which rules matched, and mostly restates them. A
  // vague answer must land in unknown rather than borrowing a rule id.
  const m = matchRules(readRules(SETTINGS), { leadReasons: ['seems like a decent fit honestly'] });
  assert.equal(m.matchedGreen.length, 0);
  assert.equal(m.matchedRed.length, 0);
});

// ── Pick ─────────────────────────────────────────────────────────────────

test('green rules never outrank somebody waiting on a reply', () => {
  const answerThem = { id: 1, stage: 'Contacted', replied: 1, reply_type: 'interested', reply_date: '2026-08-01' };
  const veryGreen = {
    id: 2,
    stage: 'New',
    qualification: JSON.stringify({ reasons: SETTINGS.greenRules }),
  };
  const ranked = rankProspects([veryGreen, answerThem], { now: new Date('2026-08-09T12:00:00Z'), settings: SETTINGS });
  assert.equal(ranked[0].prospect.id, 1);
  assert.equal(ranked[0].band, BAND.ANSWER_THEM);
});

test('among prospects nothing else can separate, green rules decide', () => {
  const plain = { id: 10, stage: 'New' };
  const matches = { id: 11, stage: 'New', qualification: JSON.stringify({ reasons: ['asking for a booking system, CRM or intake form'] }) };
  const ranked = rankProspects([plain, matches], { now: new Date('2026-08-09T12:00:00Z'), settings: SETTINGS });
  assert.equal(ranked[0].prospect.id, 11);
  assert.equal(ranked[0].band, ranked[1].band, 'same band: the rule broke a tie, it did not create one');
});

test('with no settings the ranking is exactly what it always was', () => {
  const rows = [{ id: 10, stage: 'New' }, { id: 11, stage: 'New' }];
  const ranked = rankProspects(rows, { now: new Date('2026-08-09T12:00:00Z') });
  assert.deepEqual(ranked.map((r) => r.prospect.id), [10, 11]);
});

// ── Classification is generic, not keyed to Ary's wording ────────────────

test('rules this workspace has never written still classify sensibly', () => {
  assert.equal(classifyRed('anything mentioning a tender or an RFP', SETTINGS).semantic, RED.OUTREACH_EXCLUSION);
  assert.equal(classifyRed('obvious fraud or a pyramid scheme', SETTINGS).semantic, RED.HARD_SKIP);
  assert.equal(classifyRed('post is older than 3 days', SETTINGS).semantic, RED.COST_GUARD);
  assert.equal(classifyRed('another provider advertising their services', SETTINGS).semantic, RED.HARD_SKIP);
  // Nothing recognisable falls back to a person, never to a silent skip.
  assert.equal(classifyRed('something only I would know', SETTINGS).semantic, RED.HUMAN_REVIEW);
});

test('every caller actually passes the settings the rules live in', async () => {
  // The bug this catches was live for an hour: prescreen and Vet read the
  // rules, and the unattended sweep called them without settings, so the
  // wiring only applied when somebody clicked. Nothing failed, nothing warned,
  // and the rules were half-connected in exactly the path that matters most.
  const { readFileSync } = await import('node:fs');
  const CALLERS = [
    ['../lib/runner.mjs', /prescreen\(|buildVetResult\(/g],
    ['../app/api/vet/route.js', /prescreen\(|buildVetResult\(/g],
    ['../app/api/ai/route.js', /rankProspects\(/g],
  ];
  for (const [file, re] of CALLERS) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(re)) {
      // The call and its options object, up to the closing paren on that line.
      const call = src.slice(m.index, src.indexOf(')', m.index) + 1);
      assert.match(call, /settings/, `${file}: ${call.trim()} does not pass settings`);
    }
  }
});

test('an unconfigured workspace is not filtered by rules it never wrote', () => {
  const q = qualificationFlags({ id: 1 }, { greenRules: [], redRules: [] });
  assert.equal(q.configured, false);
  assert.equal(q.action, null);
  assert.equal(q.evidence, 'never');
});
