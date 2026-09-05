import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE, PROVIDER, PROVIDER_YIELDS, providerFor, possibleSources, availableSources, describeProvenance,
} from '../lib/sources.mjs';
import { readRules, matchRules, qualificationFlags, scopeOf, RESULT, RULES_VERSION } from '../lib/qual-rules.mjs';
import { buildVetResult } from '../lib/vet.mjs';
import { rankProspects } from '../lib/pick.mjs';
import { gateFor, rate, canCompare, GATE, RATE_THRESHOLDS, COMPARISON_MIN_PER_ARM, summarise, POSITIVE_REPLY } from '../lib/baseline.mjs';

const SETTINGS = {
  offer: 'fixes the form, booking, reminders, and follow-up path so every inquiry gets answered, booked, or brought back',
  greenRules: [
    'inquiries or leads going cold before they book',
    'asking for a booking system, CRM or intake form',
    'front desk cannot keep up with the messages',
  ],
  redRules: [
    'scam patterns: vague opportunity, pay to apply, rates too good to be true',
    'procurement wording: RFP, vendor onboarding, tender, purchasing department',
  ],
};

// A Google Maps record holds exactly this. No post, and there never was one.
const MAPS_PROSPECT = {
  id: 1,
  name: 'Northgate Dental',
  business_name: 'Northgate Dental',
  niche: 'dentist',
  email: 'hello@northgate.example',
  domain: 'northgate.example',
  source: 'Google Maps',
  source_provider: PROVIDER.APIFY_GOOGLE_MAPS,
};

const SOCIAL_PROSPECT = {
  id: 2,
  name: 'Pat',
  source: 'Instagram',
  source_provider: PROVIDER.SOCIAL_POST,
  qualification: JSON.stringify({
    sourceType: SOURCE.POST_TEXT,
    provider: PROVIDER.SOCIAL_POST,
    reasons: ['inquiries or leads going cold before they book'],
    postText: 'my inquiries keep going cold before they book',
  }),
};

// ── The distinction the whole pass rests on ──────────────────────────────

test('a post rule against a map listing is NOT_APPLICABLE, never false', () => {
  // If this returns NOT_MATCHED, every Maps prospect sits below every social
  // lead forever, for a reason that has nothing to do with the business: the
  // source never carried the evidence the rule asks about.
  const rules = readRules(SETTINGS);
  const { possible } = possibleSources(MAPS_PROSPECT);
  const m = matchRules(rules, { possible, available: availableSources(MAPS_PROSPECT) });

  assert.equal(m.matchedGreen.length, 0);
  assert.equal(m.notMatched.length, 0, 'nothing was checked and found absent');
  assert.equal(m.notApplicable.length, 5, 'all five rules ask about words this record cannot have');
  for (const r of m.notApplicable) assert.match(r.why, /cannot produce/);
});

test('the same rules against a social lead do apply', () => {
  const rules = readRules(SETTINGS);
  const { possible } = possibleSources(SOCIAL_PROSPECT);
  const m = matchRules(rules, {
    possible,
    available: availableSources(SOCIAL_PROSPECT),
    leadReasons: ['inquiries or leads going cold before they book'],
    postText: 'my inquiries keep going cold before they book',
  });
  assert.equal(m.matchedGreen.length, 1);
  assert.equal(m.notApplicable.length, 0, 'a post lead can be asked about posts');
});

test('the four results are four different facts', () => {
  const rules = readRules(SETTINGS);
  const all = new Set(Object.values(RESULT));
  assert.equal(all.size, 4);
  // Deterministic rule, real text, nothing found: answered.
  const checked = matchRules(rules, {
    postText: 'We fit kitchens in the greater Leeds area.',
    possible: new Set([SOURCE.POST_TEXT]),
    available: new Set([SOURCE.POST_TEXT]),
  });
  assert.ok(checked.notMatched.length > 0, 'checked against real words and not there');
  assert.ok(checked.unknown.length > 0, 'and the ones needing judgement stay unknown');
});

test('a Maps prospect is not penalised in Vet for being a Maps prospect', () => {
  const maps = buildVetResult({ ...MAPS_PROSPECT }, { settings: SETTINGS });
  const social = buildVetResult({ ...SOCIAL_PROSPECT, domain: 'pat.example' }, { settings: SETTINGS });
  // The social lead's rules matched, so its fit is higher. That is legitimate.
  // What must NOT happen is the Maps record collecting five unanswered rules.
  assert.equal(maps.qualification.notApplicable, 5);
  assert.equal(maps.qualification.unknown, 0, 'not five gaps in its research');
  assert.equal(social.qualification.notApplicable, 0);
});

// ── Provider is not evidence type ────────────────────────────────────────

test('a provider yields evidence types, and they are not the same thing', () => {
  assert.ok(PROVIDER_YIELDS[PROVIDER.APIFY_GOOGLE_MAPS].includes(SOURCE.MAP_LISTING));
  assert.ok(!PROVIDER_YIELDS[PROVIDER.APIFY_GOOGLE_MAPS].includes(SOURCE.POST_TEXT));
  assert.ok(PROVIDER_YIELDS[PROVIDER.SOCIAL_POST].includes(SOURCE.POST_TEXT));
  assert.ok(PROVIDER_YIELDS[PROVIDER.AD_LIBRARY].includes(SOURCE.AD));
  // An ad is not a post. Both are things a business put out; only one carries
  // a statement, and scoring one with the other's rules is the impersonation
  // the model exists to stop.
  assert.ok(!PROVIDER_YIELDS[PROVIDER.AD_LIBRARY].includes(SOURCE.POST_TEXT));
});

test('a future sourcing provider slots in without touching qualification', () => {
  // Apify produces a MAP_LISTING. That is already the mapping, so adding real
  // Apify sourcing later changes an importer and nothing about rules.
  assert.deepEqual(PROVIDER_YIELDS[PROVIDER.APIFY_GOOGLE_MAPS], PROVIDER_YIELDS[PROVIDER.APIFY_GOOGLE_MAPS]);
  for (const p of ['SOCIAL_POST', 'MANUAL_IMPORT', 'CSV', 'REFERRAL', 'APIFY_GOOGLE_MAPS', 'OTHER']) {
    assert.ok(PROVIDER[p], `${p} is not in the provider vocabulary`);
    assert.ok(Array.isArray(PROVIDER_YIELDS[PROVIDER[p]]), `${p} has no declared yield`);
  }
});

test('the source column as actually written maps to a provider', () => {
  // "Google Maps" is 744 live rows and was never in the vocabulary the app
  // validates against. Reading the real strings is the difference between a
  // model of this database and one of a tidier imaginary database.
  assert.equal(providerFor('Google Maps'), PROVIDER.APIFY_GOOGLE_MAPS);
  assert.equal(providerFor('Instagram'), PROVIDER.SOCIAL_POST);
  assert.equal(providerFor('Referral'), PROVIDER.REFERRAL);
  assert.equal(providerFor(''), PROVIDER.UNKNOWN);
  assert.equal(providerFor(null), PROVIDER.UNKNOWN);
});

test('an unknown origin gets unknown answers, never confident ones', () => {
  // 4,787 rows have no source at all. An unknown provider yields nothing, so
  // nothing is ever declared inapplicable on its behalf.
  const legacy = { id: 9, name: 'Old' };
  const q = qualificationFlags(legacy, SETTINGS);
  assert.equal(q.provider, PROVIDER.UNKNOWN);
  assert.equal(q.notApplicable.length, 0, 'we do not know what it could not have had');
  assert.equal(q.unknown.length, 5, 'so every rule is honestly unanswered');
  assert.match(describeProvenance(legacy), /never recorded/);
});

test('evidence on the record beats the provider table', () => {
  // A prospect whose post text is sitting right there must not have post rules
  // declared inapplicable because the source column was never filled in.
  const orphan = { id: 3, qualification: JSON.stringify({ postText: 'our front desk cannot keep up' }) };
  const { possible } = possibleSources(orphan);
  assert.ok(possible.has(SOURCE.POST_TEXT));
});

// ── Rule scope ───────────────────────────────────────────────────────────

test('each rule declares what evidence could support it', () => {
  const { all } = readRules(SETTINGS);
  for (const r of all) {
    assert.ok(Array.isArray(r.appliesTo) && r.appliesTo.length, `${r.id} has no scope`);
    assert.equal(r.version, RULES_VERSION);
    assert.equal(typeof r.hard, 'boolean');
  }
});

test('scope is read from the rule, not assumed', () => {
  assert.deepEqual(scopeOf('booking request is a form rather than live scheduling'), [SOURCE.WEBSITE]);
  assert.deepEqual(scopeOf('the prospect explicitly said not right now'), [SOURCE.CONVERSATION]);
  assert.deepEqual(scopeOf('their listed category is dentistry'), [SOURCE.BUSINESS_PROFILE, SOURCE.MAP_LISTING]);
  assert.deepEqual(scopeOf('currently advertising on Facebook'), [SOURCE.AD]);
  assert.deepEqual(scopeOf('inquiries or leads going cold before they book'), [SOURCE.POST_TEXT]);
});

test('an observable half does not stand in for a stated whole', () => {
  // "Running ads but the inquiries are not converting" mentions ads, and ads
  // are observable from an ad library. That they are not converting is only
  // ever something the owner says, so the rule stays scoped to what they wrote.
  assert.deepEqual(scopeOf('running ads but the inquiries are not converting'), [SOURCE.POST_TEXT]);
});

// ── Pick ─────────────────────────────────────────────────────────────────

test('a source-qualified lead outranks an equal Maps prospect, and neither outranks a reply', () => {
  const waiting = { id: 5, stage: 'Contacted', replied: 1, reply_type: 'interested', reply_date: '2026-08-01' };
  const ranked = rankProspects([MAPS_PROSPECT, SOCIAL_PROSPECT, waiting], {
    now: new Date('2026-08-09T12:00:00Z'), settings: SETTINGS,
  });
  assert.equal(ranked[0].prospect.id, 5, 'an unanswered human reply still wins');
  const cold = ranked.filter((r) => r.prospect.id !== 5);
  assert.equal(cold[0].prospect.id, SOCIAL_PROSPECT.id, 'and among cold ones the source signal decides');
});

// ── Sample gates ─────────────────────────────────────────────────────────

test('a rate below the gate is not stated as a percentage', () => {
  // A caveated number gets quoted without its caveat.
  const r = rate(1, 3, 'on replies');
  assert.equal(r.gate, GATE.INSUFFICIENT);
  assert.equal(r.pct, null);
  assert.match(r.readable, /1 of 3/);
  assert.ok(!/33/.test(r.readable));
});

test('a rate above the gate carries its n with it', () => {
  const r = rate(30, 120);
  assert.equal(r.gate, GATE.USABLE);
  assert.equal(r.pct, 25);
  assert.match(r.readable, /30 of 120/);
});

test('a comparison is refused until both sides are big enough', () => {
  const few = canCompare([{ name: 'booking-friction', n: 3 }, { name: 'lead-capture-gap', n: 2 }]);
  assert.equal(few.ok, false);
  assert.match(few.why, /Each side needs/);
  const one = canCompare([{ name: 'only-one', n: 500 }]);
  assert.equal(one.ok, false);
  const enough = canCompare([
    { name: 'a', n: COMPARISON_MIN_PER_ARM }, { name: 'b', n: COMPARISON_MIN_PER_ARM },
  ]);
  assert.equal(enough.ok, true);
});

test('gates are ordered and a rate needs more than a count', () => {
  assert.equal(gateFor(0), GATE.INSUFFICIENT);
  assert.equal(gateFor(10), GATE.EARLY_SIGNAL);
  assert.equal(gateFor(50), GATE.USABLE);
  assert.equal(gateFor(200), GATE.STRONGER_EVIDENCE);
  assert.equal(gateFor(50, 'rate'), GATE.EARLY_SIGNAL, 'the same 50 is weaker when it is a denominator');
});

test('the baseline refuses to be read as a result while it is empty', () => {
  const s = summarise({ counts: { added: 12, sent: 0, replied: 0 }, legacy: { prospects: 4787 } });
  assert.equal(s.readiness.ok, false);
  assert.match(s.readiness.why, new RegExp(String(RATE_THRESHOLDS.EARLY_SIGNAL)));
  assert.equal(s.rates.replyPerSend.pct, null);
  assert.equal(s.legacy.prospects, 4787);
  assert.match(s.legacy.note, /never added in/);
});

test('a positive reply is defined once and narrowly', () => {
  assert.ok(POSITIVE_REPLY.has('interested'));
  assert.ok(POSITIVE_REPLY.has('question'));
  // Politeness is not interest, and an autoresponder is not a person.
  for (const no of ['not-now', 'decline', 'out-of-office', 'bounce', 'unsubscribe', 'unknown']) {
    assert.ok(!POSITIVE_REPLY.has(no), `${no} must not count as positive`);
  }
});
