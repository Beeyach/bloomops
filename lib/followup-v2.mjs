// Writing the next cold email, when there is a next one.
//
// The old follow-up path could not do this correctly, and the reasons are worth
// keeping written down because none of them were about the model:
//
//   - It had no step identity. It wrote "a follow-up", never Email 2 or Email 3,
//     so it could not know it was the last one.
//   - It never saw Email 1. It was told "do not repeat the first email" without
//     being shown the first email, which is not an instruction anybody can obey.
//   - Its output went to `pending_draft` while Email 1 lived in
//     `outreach_packages`. Zero of the eleven production packages contain a
//     single follow-up.
//   - It had no ceiling. Nothing in that path consulted the band.
//
// So the app decides which step may exist and hands the model the angle it must
// stay on. The model writes forty words. It never decides how long a sequence
// is, and it is never asked to find something to say.

import { effectiveBand } from './priority.mjs';
import { prospectPreparationCeiling, sequenceCeilingFor } from './sequence-ceiling.mjs';
import { nextStepFor, NEXT } from './cutover.mjs';
import { checkGreeting, blocksSend } from './name-guard.mjs';
import { identity } from './hive-context.mjs';
import { knownUnknowns } from './evidence.mjs';
import { outcomeClaims } from './outcome-claims.mjs';

export const FOLLOWUP_V2_VERSION = 'followup-v2-2026-08-10.1';

// Word count. A follow-up that runs long has started re-arguing Email 1.
export const MIN_WORDS = 20;
export const MAX_WORDS = 80;

// Every cold step this prospect may ever receive. The app's answer, from the
// same helper the cadence and the cutover use.
export function legalSteps(prospect = {}, opts = {}) {
  const ceiling = prospectPreparationCeiling(prospect, opts);
  return Array.from({ length: Math.max(0, ceiling) }, (_, i) => i + 1);
}

const STEP_OF = {
  [NEXT.ELIGIBLE_EMAIL_1]: 1,
  [NEXT.ELIGIBLE_EMAIL_2]: 2,
  [NEXT.ELIGIBLE_EMAIL_3]: 3,
  [NEXT.ELIGIBLE_EMAIL_4]: 4,
};

// The one step to write next, or null with the reason there is none.
//
// Deliberately delegates the whole decision. A second opinion about who is owed
// an email is exactly the thing that produced two files disagreeing before.
export function nextFollowupStep(args = {}) {
  const decision = nextStepFor(args);
  const step = STEP_OF[decision.next] || null;
  return {
    step,
    decision,
    ceiling: sequenceCeilingFor(args.prospect || {}, args.pkg || null, { strong: args.strong ?? null }),
    band: effectiveBand(args.prospect || {}, { strong: args.strong ?? null }).band,
    why: decision.why,
  };
}

// Email 1 as it actually went out.
//
// A live package first, because that is where new work lands. Falling back to
// the legacy `email_sequence` blob is not a nicety: every prospect currently
// owed a follow-up predates packages entirely, so without this there is no
// angle to continue and the model would be inventing one.
export function firstEmailOf(prospect = {}, { pkg = null } = {}) {
  const body = String(pkg?.edited_body ?? pkg?.email_body ?? '').trim();
  if (body) {
    return { subject: String(pkg.edited_subject ?? pkg.email_subject ?? '').trim(), body, source: 'package' };
  }

  let seq = prospect.email_sequence;
  if (typeof seq === 'string') {
    try { seq = JSON.parse(seq); } catch { seq = null; }
  }
  if (Array.isArray(seq)) {
    const one = seq.find((e) => Number(e?.number) === 1) || seq[0];
    const b = String(one?.body || '').trim();
    if (b) return { subject: String(one?.subject || '').trim(), body: b, source: 'email_sequence' };
  }
  return { subject: '', body: '', source: null };
}

// The prompt.
//
// Handed the step, the ceiling and Email 1 verbatim. Nothing is left for the
// model to work out about strategy.
export function buildFollowupParts(settings = {}, prospect = {}, {
  step, ceiling, firstEmail = { subject: '', body: '' }, evidence = [], strength = null,
  now = new Date(),
} = {}) {
  const ws = identity(settings || {});
  // The holes go in as well as the facts. A prompt told only what is known
  // fills the rest in; handing it what nobody has checked gives the
  // uncertainty somewhere to go. Carried over from the retired prompt, where
  // it was load-bearing for exactly the same reason.
  const gaps = knownUnknowns(prospect, evidence, { now });
  const isLast = step >= ceiling;
  const canPersonalise = Boolean(strength?.canPersonalise);

  const system = [
    `You write one short follow-up email for ${ws.who}.`,
    ws.offerLine ? `CURRENT WORKSPACE OFFER: ${ws.offerLine}` : null,
    '',
    `This is email ${step} of at most ${ceiling}. ${isLast
      ? 'It is the last one. Nobody will write to them again after this, and they must not be told that, because saying so is a way of applying pressure.'
      : 'There is one more after it, so nothing needs resolving here.'}`,
    '',
    'The first email is below. Your job is to say the same thing again, shorter.',
    '- Stay on the subject the first email raised. Do not raise a second one.',
    '- Keep whatever it offered. Do not replace a concrete offer with a vague question.',
    '- Do not restate the first email. Assume they read it.',
    '',
    'Length: 30 to 50 words. Not more. Two or three sentences is normal.',
    '',
    'The voice, and these are rules not suggestions:',
    '- Plain words. No metaphors, no figurative language, no decorated phrases.',
    '- Open with "Hi [name]." and go straight in.',
    // A real second email opened "Just checking in on the note about your
    // contact page". Three sentences is no budget for announcing that this is
    // a follow-up, which the reader can already see.
    '- The first sentence after the greeting is the offer or the reason. Never spend it saying that you are following up.',
    '- No exclamation marks, no emojis, no em dashes, no semicolons.',
    '- "just" is the softener of choice, at most once.',
    '',
    'Never write any of these:',
    '- "just circling back", "bumping this", "following up on my last email"',
    '- "just checking in", "just following up", "wanted to see if you saw this", "touching base"',
    '- "I have not heard back", "last chance", "before I close your file"',
    '- "I hope this email finds you well", "I wanted to reach out", "no worries if"',
    // The follow-up writer made the same jump as the first-email writer and
    // for the same reason: nothing told it not to. Its Email 2 for package 20
    // said "get people onto a set time faster, no back and forth needed".
    '- Anything about what happens after somebody uses their form: who replies, how many messages it takes, whether anybody waits. You cannot see their inbox.',
    '- Any promise that something would be faster, quicker, easier or save time. Nothing measured that.',
    '- anything about what happens to other businesses like theirs. Not a number, and not a soft version either: no "how other centers handle this", no "what most studios do", no "others in your position". You have not counted them, and it reads as telling somebody they are behind, which is scaring somebody into buying.',
    '- anything saying a path breaks, that enquiries get stuck or lost, that people give up or cannot reach them, or that any of it is costing them business. What was seen on the page is a design choice, not a measured failure.',
    '- anything offering a video, a PDF, an audit or a report, unless the first email already offered exactly that.',
    '- figures of speech. Not "fall through the cracks", not "slip away", not "drop off the radar". Say the plain thing: nobody replies to them, or nobody follows up.',
    '',
    canPersonalise
      ? 'Verified facts about their site are below. You may refer to those and ONLY those. Every specific claim in your email must trace to a line in the evidence or to the first email.'
      : 'You have NO verified facts about their website beyond what the first email already said. Do not describe, guess at, or imply anything further about their site, their booking, their forms or their response times.',
    '',
    'Output exactly:',
    'SUBJECT: <one line, under 8 words, lowercase except names>',
    'BODY:',
    '<the email>',
  ].filter((x) => x !== null).join('\n');

  const user = [
    // A company is not a person, so it is not a greeting.
    //
    // This read `p.name || p.business_name || 'there'`, and for a prospect with
    // no verified person on the record the model was handed the company as the
    // name. Package 20 opened "Hi AZ Therapy Quest LLC," — which is not wrong
    // about anybody, just plainly written by a machine.
    //
    // The mailbox local-part is not evidence either: `brianda@` is a strong
    // hint and still a guess, and guessing a stranger's first name wrong is
    // worse than not using one. So a real recorded name or "there", and the
    // business goes on its own line below where it belongs.
    `Their name: ${prospect.name || 'there'}`,
    prospect.business_name && prospect.business_name !== prospect.name ? `Business: ${prospect.business_name}` : null,
    `Emails sent so far: ${Number(prospect.emails_sent) || 0}`,
    '',
    'THE FIRST EMAIL THAT WAS SENT',
    firstEmail.subject ? `Subject: ${firstEmail.subject}` : null,
    firstEmail.body,
    canPersonalise && evidence.length ? '' : null,
    canPersonalise && evidence.length ? 'Verified about them:' : null,
    canPersonalise && evidence.length ? evidence.map((e) => `- ${e.text}`).join('\n') : null,
    !canPersonalise ? 'Nothing about their site has been verified.' : null,
    gaps.length ? 'What nobody has checked, so do not claim any of it:' : null,
    gaps.length ? gaps.map((g) => `- ${g}`).join('\n') : null,
  ].filter((x) => x !== null && x !== '').join('\n');

  return { system, user };
}

export function parseFollowup(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/SUBJECT:\s*(.+?)\s*\n+BODY:\s*([\s\S]+)$/i);
  if (!m) return { ok: false, reason: 'The draft was not in the SUBJECT/BODY shape asked for.' };
  const subject = m[1].trim();
  const body = m[2].trim();
  if (!body) return { ok: false, reason: 'The body was empty.' };
  return { ok: true, subject, body };
}

// ── Validation ───────────────────────────────────────────────────────────
//
// Deterministic. The model is not asked whether the model did well.

export const REJECT = {
  STEP_ILLEGAL: 'STEP_ILLEGAL',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  EMPTY: 'EMPTY',
  TOO_LONG: 'TOO_LONG',
  TOO_SHORT: 'TOO_SHORT',
  REPEATS_FIRST: 'REPEATS_FIRST',
  OFF_ANGLE: 'OFF_ANGLE',
  BANNED_PHRASE: 'BANNED_PHRASE',
  UNSUPPORTED_CLAIM: 'UNSUPPORTED_CLAIM',
  ASSET_PROMISE: 'ASSET_PROMISE',
  NAME_MISMATCH: 'NAME_MISMATCH',
  THIRD_PARTY_CLAIM: 'THIRD_PARTY_CLAIM',
};

const BANNED = [
  /just circling back/i, /circling back/i, /bumping this/i, /bump this/i,
  /haven'?t heard back/i, /have not heard back/i, /last chance/i,
  /clos(e|ing) your file/i, /one final time/i, /final follow[- ]?up/i,
  /hope this (email )?finds you well/i, /wanted to reach out/i,
  /no worries if/i, /game[- ]changer/i, /touching base/i,
];

// Openers that say nothing.
//
// "Just checking in on the note about your contact page" was the second email
// this system wrote for a real prospect. It is not on the list above, which
// covers "circling back" and "bumping this" and stops one synonym short. A
// follow-up has three sentences and cannot spend the first one announcing that
// it is a follow-up: the reader can see that. Start with the offer.
const FILLER_OPENER = [
  /just (checking in|following up|wanted to (follow up|check in))/i,
  /^(checking in|following up)\b/i,
  /wanted to (see|check) if you (saw|got|had seen)/i,
  /following up on (my|the) (last )?(email|note|message)/i,
];

// Claims about an industry rather than about them. The failure mode is a
// confident sentence about businesses we have never counted.
const INDUSTRY_CLAIM = [
  /\b(most|many|a lot of|plenty of|nearly all|the majority of)\s+\w*\s*(businesses|coaches|clinics|studios|therapists|owners|practices)/i,
  /\b\d+\s*(%|percent)/i,
  /\b\d+\s*(out of|in)\s*\d+\b/i,
  /\b(studies|research|data)\s+(show|shows|suggest)/i,
];

const ASSET = /\b(video|pdf|audit|report|guide|walkthrough|screen ?recording|loom)\b/i;

// Claiming to know what businesses like theirs do.
//
// A real generated draft said "happy to share how other centers handle that
// gap". It carries no statistic, so the numbers check above saw nothing wrong,
// and it is the same move in a softer coat: implying we have counted an
// industry we have never counted, so that somebody feels behind. It reached the
// shadow output before this pattern existed.
const THIRD_PARTY = [
  /\b(other|similar|most|several|a few|some)\s+\w*\s*(centers|centres|businesses|coaches|clinics|studios|practices|therapists|owners|companies|clients|places|teams)\b/i,
  /\b(everyone|everybody|people)\s+(else|i work with|i talk to)\b/i,
  /\bothers\b[^.?!]{0,30}\b(in|doing|handle|handling|solve|position)\b/i,
  /\bhow\s+(others|other\s+\w+)\s+(do|handle|manage|solve)/i,
];

// Words that carry no angle. Function words, courtesies, and the vocabulary
// every cold email uses regardless of what it is about.
const STOP_WORDS = new Set([
  'this', 'that', 'with', 'your', 'you', 'yours', 'from', 'about', 'have', 'here', 'and', 'the', 'for',
  'there', 'they', 'them', 'then', 'than', 'what', 'when', 'where', 'would', 'could', 'just', 'like',
  'been', 'were', 'will', 'into', 'over', 'more', 'some', 'thing', 'things', 'hello', 'thanks', 'thank',
  'email', 'emails', 'sent', 'send', 'reply', 'replied', 'looked', 'looking', 'noticed', 'wanted',
  'are', 'was', 'its', 'our', 'out', 'all', 'any', 'can', 'get', 'got', 'one', 'two', 'way', 'who',
  'not', 'but', 'still', 'happy', 'know', 'let', 'want', 'need', 'take', 'make', 'made', 'much',
  'now', 'yet', 'not', 'did', 'does', 'had', 'has', 'him', 'her', 'his', 'she', 'and', 'also', 'why',
]);

const words = (s) => String(s || '').toLowerCase().match(/[a-z']{3,}/g) || [];

// The angle words. Names are stripped: the recipient appears in every email
// either side, so counting "jane" as shared subject matter would let a draft
// about pricing pass as a follow-up about a contact form. It did, once.
const content = (s, ignore = new Set()) =>
  new Set(words(s).filter((w) => !STOP_WORDS.has(w) && !ignore.has(w)));

// Which distinctive words the follow-up shares with Email 1.
//
// Counted, not scored as a ratio. A ratio is the wrong shape: a short email
// that changes the subject entirely can still clear a percentage threshold on
// one incidental word, which is exactly how the first version of this let a
// draft about pricing through as a follow-up about a contact form.
function sharedWords(a, b, ignore = new Set()) {
  const B = content(b, ignore);
  return [...content(a, ignore)].filter((w) => B.has(w));
}

// How much of the follow-up is Email 1 again.
function overlapRatio(a, b, ignore = new Set()) {
  const A = content(a, ignore);
  if (!A.size) return 0;
  return sharedWords(a, b, ignore).length / A.size;
}

// Two words in common is the line. One is coincidence.
export const MIN_SHARED_WITH_FIRST = 2;

export function validateFollowup(parsed = {}, ctx = {}) {
  const {
    prospect = {}, step, ceiling, firstEmail = { subject: '', body: '' },
    eligible = true, canPersonalise = false,
  } = ctx;
  const problems = [];
  const body = String(parsed.body || '').trim();

  if (!eligible) problems.push({ code: REJECT.NOT_ELIGIBLE, why: 'They are not owed a cold follow-up.' });
  if (!Number.isInteger(step) || step < 1 || step > ceiling) {
    problems.push({ code: REJECT.STEP_ILLEGAL, why: `Email ${step} is past the ${ceiling} this prospect allows.` });
  }
  if (!body) {
    problems.push({ code: REJECT.EMPTY, why: 'There is no body.' });
    return { ok: false, problems };
  }

  const n = words(body).length;
  if (n > MAX_WORDS) problems.push({ code: REJECT.TOO_LONG, why: `${n} words. A follow-up this long is re-arguing the first email.` });
  if (n < MIN_WORDS) problems.push({ code: REJECT.TOO_SHORT, why: `${n} words is too short to say anything.` });

  // The opening line only, with the greeting stripped, because these phrases
  // are a problem where they set the tone and not where they appear.
  const afterGreeting = body.replace(/^[^\r\n]*[\r\n]+/, (m) => (/^\s*(hi|hello|hey)\b/i.test(m) ? '' : m));
  const opening = (afterGreeting.split(/(?<=[.?!])\s/)[0] || '').trim();
  for (const re of FILLER_OPENER) {
    const m = opening.match(re);
    if (m) problems.push({ code: REJECT.BANNED_PHRASE, why: `"${m[0].trim()}" opens on filler. Start with the offer.` });
  }

  // An outcome the evidence never established. Email 2 inherits Email 1's
  // angle, so it inherits this risk: a follow-up that offers to fix 'where
  // enquiries get stuck' is diagnosing a failure nobody measured.
  for (const hit of outcomeClaims(body, ctx.evidenceKeys || [])) {
    problems.push({ code: REJECT.UNSUPPORTED_CLAIM, why: `\"${hit}\" claims an outcome the evidence does not support.` });
  }

  for (const re of BANNED) {
    const m = body.match(re);
    if (m) problems.push({ code: REJECT.BANNED_PHRASE, why: `"${m[0]}" is on the never-write list.` });
  }

  for (const re of INDUSTRY_CLAIM) {
    const m = body.match(re);
    if (m) problems.push({ code: REJECT.UNSUPPORTED_CLAIM, why: `"${m[0].trim()}" is a claim about an industry nobody counted.` });
  }

  for (const re of THIRD_PARTY) {
    const m = body.match(re);
    if (m) problems.push({ code: REJECT.THIRD_PARTY_CLAIM, why: `"${m[0].trim()}" implies knowing what businesses like theirs do.` });
  }

  // An asset may only be offered if the first email already offered it.
  const asset = body.match(ASSET);
  if (asset && !ASSET.test(firstEmail.body || '')) {
    problems.push({ code: REJECT.ASSET_PROMISE, why: `Offers a ${asset[0]}, which the first email never promised.` });
  }

  if (firstEmail.body) {
    const ignore = new Set(words(`${prospect.name || ''} ${prospect.business_name || ''}`));
    const shared = sharedWords(body, `${firstEmail.subject || ''} ${firstEmail.body}`, ignore);
    const ratio = overlapRatio(body, firstEmail.body, ignore);
    if (ratio >= 0.75) {
      problems.push({ code: REJECT.REPEATS_FIRST, why: `${Math.round(ratio * 100)}% of it is the first email again.` });
    } else if (shared.length < MIN_SHARED_WITH_FIRST) {
      problems.push({
        code: REJECT.OFF_ANGLE,
        why: shared.length
          ? `Only "${shared[0]}" connects it to the first email, so it has changed the subject.`
          : 'Nothing connects it to the first email, so it has changed the subject.',
      });
    }
  }

  const name = checkGreeting({
    body,
    expectedName: prospect.name || '',
    businessName: prospect.business_name || '',
  });
  if (blocksSend(name)) {
    problems.push({ code: REJECT.NAME_MISMATCH, why: name.reason || 'The greeting names somebody else.' });
  }

  return { ok: problems.length === 0, problems, words: n, canPersonalise };
}

// What shape of package this prospect's band allows, for fingerprinting.
//
// Reflects the real V2 shape, and changes when the legal remaining steps change
// because sends have happened. No five-email assumption anywhere.
export function packageShape(prospect = {}, opts = {}) {
  const ceiling = prospectPreparationCeiling(prospect, opts);
  const sent = Math.max(0, Number(prospect.emails_sent) || 0);
  const remaining = legalSteps(prospect, opts).filter((s) => s > sent);
  return {
    ceiling,
    sent: Math.min(sent, ceiling),
    remaining,
    key: `${effectiveBand(prospect, opts).band || 'none'}:${ceiling}:${remaining.join(',') || 'none'}:${FOLLOWUP_V2_VERSION}`,
  };
}
