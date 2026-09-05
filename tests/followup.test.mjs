import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canPrepareFollowUp, buildFollowUpParts, parseFollowUp, PREPARE } from '../lib/followup.mjs';
// The prompt moved to the V2 generator when the legacy one was retired. These
// rules moved with it: they are about what a follow-up may claim, not about
// which file writes it.
import { buildFollowupParts } from '../lib/followup-v2.mjs';

const FIRST = {
  subject: 'your contact form',
  body: ['Hi Kym,', '', 'I had a look at your contact form.', '', 'Thanks,', 'Ary'].join('\n'),
};
const v2 = (settings, prospect, opts = {}) =>
  buildFollowupParts(settings, prospect, { step: 2, ceiling: 3, firstEmail: FIRST, ...opts });
import { STOP } from '../lib/outbound.mjs';

// Preparing a follow-up is the only part of the outreach loop the app does on
// its own, and the reason it is safe is that it stops at the draft.
//
// The failure mode worth testing is not a clumsy sentence. It is a confident
// sentence about a booking system the business does not have, which is what
// happens when a model is handed a prospect and asked to be specific about it.

const NOW = new Date('2026-08-09T12:00:00Z');
const due = {
  id: 1, name: 'Kym', business_name: 'Coastal Counselling', email: 'kym@x.com',
  stage: 'Email 2', next_action_date: '2026-08-09', emails_sent: 2,
};

test('a due, clean prospect is ready', () => {
  const r = canPrepareFollowUp(due, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.status, PREPARE.READY);
  assert.equal(r.dueOn, '2026-08-09');
});

test('an unanswered reply blocks preparation, not just sending', () => {
  // Writing the follow-up at all is the mistake. A draft sitting in "ready for
  // approval" for somebody who is waiting on an answer is an invitation to
  // send exactly the wrong email.
  const r = canPrepareFollowUp(
    { ...due, replied: 1, reply_date: '2026-08-08', last_contact_date: '2026-08-01' },
    { now: NOW }
  );
  assert.equal(r.ok, false);
  assert.equal(r.stop, STOP.UNANSWERED_REPLY);
});

test('a draft already waiting is not replaced', () => {
  const r = canPrepareFollowUp({ ...due, pending_draft: 'Hi Kym...' }, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, PREPARE.ALREADY);
});

test('a stale draft may be replaced', () => {
  // Stale means a reply overtook it. If the conversation is otherwise clear to
  // continue, writing a fresh one is the right move.
  const r = canPrepareFollowUp({ ...due, pending_draft: 'Hi Kym...', pending_draft_stale: 1 }, { now: NOW });
  assert.equal(r.ok, true);
});

test('with no evidence the prompt forbids saying anything about their site', () => {
  const { system, user } = v2({}, due, { evidence: [], strength: { canPersonalise: false }, now: NOW });
  assert.match(system, /NO verified facts/);
  assert.match(system, /Do not describe, guess at, or imply/);
  assert.match(user, /Nothing about their site has been verified/);
  assert.doesNotMatch(user, /Verified about them:/);
});

test('with evidence the prompt allows only what is in it', () => {
  const p = {
    ...due,
    own_findings: JSON.stringify([{ text: 'Their contact form does not submit', at: '2026-08-01' }]),
  };
  const { system, user } = v2({}, p, {
    evidence: [{ tier: 'manual', text: 'Their contact form does not submit', confidence: 'high' }],
    strength: { canPersonalise: true },
    now: NOW,
  });
  assert.match(system, /ONLY those/);
  assert.match(system, /must trace to a line in the evidence/);
  assert.match(user, /Verified about them:/);
});

test('the gaps go into the prompt, not just the facts', () => {
  // A prompt told only what is known fills the rest in. Handing it the holes
  // explicitly gives the uncertainty somewhere to go.
  const { user } = v2({}, due, { evidence: [], strength: { canPersonalise: false }, now: NOW });
  assert.match(user, /do not claim any of it/i);
  assert.match(user, /site check/i);
});

test('her hard bans are in the instructions', () => {
  const { system } = v2({}, due, { evidence: [], strength: {}, now: NOW });
  for (const banned of ['em dash', 'exclamation', 'finds you well', 'circling back']) {
    assert.match(system, new RegExp(banned, 'i'), `${banned} must be banned in the prompt`);
  }
});

test('a draft in the wrong shape is refused, not used', () => {
  // Silently treating a malformed answer as the email body is how something
  // unreviewed reaches a stranger.
  assert.equal(parseFollowUp('Here is a nice email for you!').ok, false);
  assert.equal(parseFollowUp('').ok, false);
  assert.equal(parseFollowUp('SUBJECT: hi\nBODY:\nshort').ok, false, 'an empty body is not a draft');
});

test('a good draft parses into subject and body', () => {
  const r = parseFollowUp('SUBJECT: following up on the form\nBODY:\nHi Kym. Just checking in about the contact form on your site. I could not get it to submit when I tried last week, so I wanted to flag it. How are enquiries reaching you right now?');
  assert.equal(r.ok, true);
  assert.equal(r.subject, 'following up on the form');
  assert.match(r.body, /^Hi Kym\./);
  assert.deepEqual(r.banned, [], 'this one breaks none of her rules');
});

test('style breaches are reported rather than hidden', () => {
  // Not fatal: Ary still reads it. But a draft that ignored her rules should
  // say so rather than arrive looking approved.
  const r = parseFollowUp('SUBJECT: hello there\nBODY:\nHi Kym. I hope this email finds you well and things are going great! I was just circling back about the booking setup we discussed a while ago now.');
  assert.equal(r.ok, true);
  assert.ok(r.banned.includes('an exclamation mark'));
  assert.ok(r.banned.includes('"hope this finds you well"'));
  assert.ok(r.banned.includes('a filler opener'));
});

test('an em dash is caught', () => {
  const r = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Kym. Just checking in about the form — it did not submit for me. How are enquiries reaching you at the moment?');
  assert.ok(r.banned.includes('an em dash'));
});

test('"no worries if" is caught, because the first real draft used it', () => {
  // Written in production on 2026-08-09. Everything else about it was right,
  // and it still closed on the stock softener every cold email closes on.
  const r = parseFollowUp('SUBJECT: quick question\nBODY:\nHi Megan. I know I sent a note last week and have not heard back, so no worries if this is not the right time. What happens when somebody messages you and does not book right away?');
  assert.equal(r.ok, true);
  assert.ok(r.banned.includes('"no worries if"'));
});

// The next three come from the first four drafts written in production on
// 2026-08-09. Every one of them was fluent, and none of these would have been
// caught by asking "does this read well".

test('inventing a worry about their industry is caught', () => {
  // Ary's rule, in her words: no fear-mongering. "A lot of coaches lose people
  // in that gap" is not a fact, it is a worry made up for a stranger about
  // their own business.
  const r = parseFollowUp('SUBJECT: quick question\nBODY:\nHi Stephan. When someone reaches out after hours, what happens to that message until you see it? A lot of coaches lose people in that gap without knowing it. How do you handle enquiries outside your hours?');
  assert.ok(r.banned.includes('a claim about what happens to other businesses'));

  const clean = parseFollowUp('SUBJECT: quick question\nBODY:\nHi Stephan. I was wondering what happens to a message that comes in after hours, before you see it the next morning. How are you handling those at the moment?');
  assert.deepEqual(clean.banned, [], 'asking about their situation is the whole point');
});

test('figures of speech are caught', () => {
  const r = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Claire. When someone reaches out but does not book right away, do you follow up yourself, or does that fall through the cracks?');
  assert.ok(r.banned.includes('a figure of speech'));
});

test('a question written with a full stop comes back with a question mark', () => {
  // It turns the one line inviting an answer into a statement. Reporting it
  // would leave Ary to fix the same typo every morning.
  const r = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Ahmed. I wanted to add one thing to my last note about how enquiries reach you. How do you keep track of somebody who messages your page.');
  assert.match(r.body, /messages your page\?$/);
  assert.match(r.body, /how enquiries reach you\./, 'the sentence that was not a question is untouched');
});

test('the prompt says both of the new rules out loud', () => {
  const { system } = v2({}, due, { evidence: [], strength: {}, now: NOW });
  assert.match(system, /scaring somebody into buying/i);
  assert.match(system, /fall through the cracks/i);
  // Not "a question ends with a question mark". The code does that, and a
  // prompt that lists rules the code already enforces is a prompt nobody
  // trusts to be the real list.
});

// Punctuation is something code can simply be right about. Three of the first
// six real drafts closed their question with a full stop; telling the model
// again was the wrong fix.

test('a question written with a full stop is repaired, not just reported', () => {
  const r = parseFollowUp('SUBJECT: a\nBODY:\nHi Federico. I know I have sent a few notes already, so I will keep this short. When someone messages asking about training but does not book right away, what happens next on your end. Do you follow up yourself, or does it depend on whether you remember to.');
  assert.match(r.body, /what happens next on your end\?/);
  assert.match(r.body, /whether you remember to\?/);
  assert.ok(!r.banned.includes('a question ending in a full stop'), 'repaired means no longer a complaint');
});

test('Ary as the subject is a statement, not a question', () => {
  // "When I looked at your site, the form did not submit" is a finding. Turning
  // its full stop into a question mark would be worse than the bug.
  const r = parseFollowUp('SUBJECT: a\nBODY:\nHi Kym. When I looked at your site last week, the contact form did not submit. What I could not tell from the outside is where those messages end up. How are enquiries reaching you at the moment?');
  assert.match(r.body, /the contact form did not submit\./);
  assert.match(r.body, /where those messages end up\./);
  assert.match(r.body, /reaching you at the moment\?/);
});

test('ordinary sentences keep their full stops', () => {
  const r = parseFollowUp('SUBJECT: a\nBODY:\nHi Laura. I sent a note last week and did not hear back, which is fine. I am just trying to understand your setup before I say anything more about it. Do you handle that yourself?');
  assert.match(r.body, /which is fine\./);
  assert.match(r.body, /anything more about it\./);
  assert.match(r.body, /handle that yourself\?/);
});

// ── The validator, hardened after the first live batch ────────────────────
//
// Prompt rules alone were proven insufficient: the model broke them in four of
// the first ten drafts. Everything mechanically checkable is checked.

test('an invented statistic is caught', () => {
  // There is no source for a number in this system, so any statistic about
  // their industry was made up on the spot.
  for (const claim of [
    'Around 40% of enquiries never get a reply.',
    'Studies show most owners lose leads this way.',
    'About 3 in 5 businesses miss these.',
  ]) {
    const r = parseFollowUp(`SUBJECT: x\nBODY:\nHi Kym. ${claim} How are you handling enquiries at the moment?`);
    assert.ok(r.banned.includes('a statistic nobody can source'), claim);
  }
});

test('an unfilled placeholder is caught', () => {
  // The one defect that reaches a stranger looking unmistakably automated.
  const r = parseFollowUp('SUBJECT: quick one\nBODY:\nHi [Name]. I wanted to follow up about the booking side of things. How are enquiries reaching you?');
  assert.ok(r.banned.includes('an unfilled placeholder'));
  const curly = parseFollowUp('SUBJECT: quick one\nBODY:\nHi Kym. I looked at {{business_name}} again this week and wanted to ask one thing. How do enquiries reach you?');
  assert.ok(curly.banned.includes('an unfilled placeholder'));
});

test('a link in a prepared draft is caught', () => {
  // Nothing prepared without a person reading it gets to send somebody
  // somewhere. The video and review links have their own rules and their own
  // places in the sequence.
  const r = parseFollowUp('SUBJECT: x\nBODY:\nHi Kym. I put together a short page about this at https://example.com/thing. Worth a look? What happens to enquiries now?');
  assert.ok(r.banned.includes('a link'));
});

test('length and question count are bounded', () => {
  const long = `Hi Kym. ${'This is a sentence about the booking process on your website. '.repeat(20)}How are you handling it?`;
  const r = parseFollowUp(`SUBJECT: x\nBODY:\n${long}`);
  assert.ok(r.banned.some((b) => /too long/.test(b)));

  const grilling = parseFollowUp('SUBJECT: x\nBODY:\nHi Kym. Who handles your enquiries? Do you reply yourself? What happens after hours? Is anybody checking?');
  assert.ok(grilling.banned.some((b) => /questions/.test(b)));
});

test('the greeting is checked, because it is the one thing that cannot be argued about', () => {
  const r = parseFollowUp('SUBJECT: x\nBODY:\nFollowing up on my last note about the booking page. How are enquiries reaching you now?');
  assert.ok(r.banned.includes('no "Hi" opening'));
});

test('a clean draft still passes everything', () => {
  const r = parseFollowUp('SUBJECT: following up on the form\nBODY:\nHi Kym. Just checking in about the contact form on your site. I could not get it to submit when I tried last week, so I wanted to flag it. How are enquiries reaching you right now?');
  assert.deepEqual(r.banned, [], 'the rules must not fire on a good email');
});


test('the legacy follow-up prompt is retired and fails loudly if reached', () => {
  // Kept as a throw rather than deleted so nothing can quietly produce a draft
  // that never went through the V2 validators.
  assert.throws(() => buildFollowUpParts({}, {}), /retired/i);
});

test('there is exactly one live follow-up generator', () => {
  const runner = readFileSync(new URL('../lib/runner.mjs', import.meta.url), 'utf8');
  assert.ok(runner.includes('buildFollowupParts'), 'the live path uses the V2 generator');
  assert.ok(!runner.includes('buildFollowUpParts'), 'and never the retired one');
});
