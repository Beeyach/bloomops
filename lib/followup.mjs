// Preparing a follow-up. Never sending one.
//
// This is the last piece of the automation the app can honestly do on its own.
// Everything before it decides who is worth writing to and what is true about
// them; this turns that into a draft sitting in Today under "ready for
// approval", with Ary's finger on the send button and nothing else.
//
// Two rules shape the whole file:
//
//   1. Nothing goes out. The queue writes `pending_draft` and stops. A reply
//      arriving afterwards marks that draft stale (see reply-apply.mjs), which
//      is why preparation ahead of time is safe at all.
//
//   2. A draft may only say things the app can prove. The failure mode of an
//      AI follow-up is not a clumsy sentence, it is a confident sentence about
//      a booking system the business does not have. So the prompt is handed
//      the evidence AND the gaps, and a prospect with no evidence gets a draft
//      that does not pretend to have looked.

import { canProgressOutbound } from './outbound.mjs';
import { identity } from './hive-context.mjs';
import { collectEvidence, evidenceStrength, evidenceBlock, knownUnknowns } from './evidence.mjs';

export const PREPARE = {
  READY: 'ready',
  BLOCKED: 'blocked',
  ALREADY: 'already-prepared',
};

// May a draft be prepared for this prospect right now?
//
// Deliberately a separate question from "may outreach progress". The outbound
// guard answers whether anything may be sent; this adds the two conditions
// that only matter when writing: there must not already be a fresh draft
// waiting, and there must be something to write about.
export function canPrepareFollowUp(p = {}, { now = new Date(), events = null } = {}) {
  const gate = canProgressOutbound(p, { now, events });
  if (!gate.ok) return { ok: false, status: PREPARE.BLOCKED, stop: gate.stop, reason: gate.reason };

  // A draft that has not been used or invalidated is still the answer. Writing
  // a second one would replace work Ary may have already read.
  if (p.pending_draft && !p.pending_draft_stale) {
    return { ok: false, status: PREPARE.ALREADY, reason: 'A draft is already waiting for approval.' };
  }

  const evidence = collectEvidence(p, { now });
  const strength = evidenceStrength(evidence);
  return { ok: true, status: PREPARE.READY, evidence, strength, dueOn: gate.dueOn };
}

// The prompt. Short, because the job is one email and the model's opinion
// about strategy is not wanted.
//
// `canPersonalise` is the switch that matters. With evidence, the email may
// point at a specific thing. Without it, the email must be honest that nobody
// has looked yet, which is a worse email and a far better outcome than a
// fluent invention.
// RETIRED. The V2 generator in lib/followup-v2.mjs writes every follow-up now.
//
// This prompt asked for "a follow-up" with no step number and without being
// shown the first email, so it could not know whether it was writing the second
// message or the last, and could not avoid repeating copy it had never seen. It
// also wrote into `pending_draft` while the first email lived in a package.
//
// Kept as a throw rather than deleted so that anything still reaching for it
// fails loudly here, instead of quietly producing a draft that never went
// through the V2 validators.
export function buildFollowUpParts() {
  throw new Error('buildFollowUpParts is retired. Use buildFollowupParts from lib/followup-v2.mjs, which knows the step and has seen the first email.');
}


// Question words that start a real question rather than a statement about one.
// "How do you handle that" is a question. "I'm curious how you handle that" is
// not, and it is a shape real senders actually use, so it must be left alone.
const OPENS_A_QUESTION = /^(how|what|when|where|who|why|do|does|did|are|is|was|would|could|can|have|has|will)\b/i;

// The same words open a statement when the sender is the subject. "When I looked at
// your site, the form did not submit" is a finding, not a question, and
// turning its full stop into a question mark would be worse than the bug.
const OPENS_A_STATEMENT = /^(how|what|when|where|who|why|while)\s+(i|we)\b/i;

// Three of the first six real drafts closed their question with a full stop,
// which turns the one line inviting an answer into a statement. Telling the
// model again is the wrong fix: this is punctuation, and punctuation is
// something code can simply be right about.
function fixQuestionMarks(body) {
  return body.replace(/([^.?!\n]+)\.(?=\s|$)/g, (whole, sentence) => {
    const s = sentence.trim();
    if (OPENS_A_STATEMENT.test(s)) return whole;
    return OPENS_A_QUESTION.test(s) ? `${sentence}?` : whole;
  });
}

// Reads the draft back. Refuses anything that is not the shape asked for,
// because a malformed draft silently becoming the email body is exactly the
// kind of thing that reaches a real person.
// Claims about how a whole trade behaves, phrased without a number.
const PEER_BEHAVIOUR = [
  /\b(businesses|practices|clinics|studios|coaches|therapists|owners|companies|people|clients|customers)\s+like\s+(yours|theirs|hers|his)\b/i,
  /\bfor\s+(a|an|most|many|some)?\s*[a-z-]*\s*(practice|practices|business|businesses|clinic|clinics|studio|studios|coach|coaches|therapist|therapists|owner|owners)\b[^.?!]{0,80}\b(often|usually|typically|generally|tends? to)\b/i,
  /\b(people|clients|customers|patients|enquiries|enquirers|visitors|folks)\s+(often|usually|typically|generally|tend to|tends to)\b/i,
];

export function parseFollowUp(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/SUBJECT:\s*(.+?)\s*\n+BODY:\s*([\s\S]+)$/i);
  if (!m) return { ok: false, reason: 'The draft did not come back in the expected shape.' };
  const subject = m[1].trim().replace(/^["']|["']$/g, '');
  const body = fixQuestionMarks(m[2].trim());
  if (!subject || body.length < 40) return { ok: false, reason: 'The draft came back empty.' };

  // Her hard bans, enforced rather than requested. A model that ignores a
  // style rule should not get to put it in front of a stranger.
  const banned = [];
  if (/[—–]/.test(body) || /[—–]/.test(subject)) banned.push('an em dash');
  if (/;/.test(body)) banned.push('a semicolon');
  if (/!/.test(body)) banned.push('an exclamation mark');
  if (/hope (this|you).{0,20}(finds you well|are well)/i.test(body)) banned.push('"hope this finds you well"');
  if (/circling back|reaching out|touching base/i.test(body)) banned.push('a filler opener');
  // The first draft written in production used this. It is the stock softener
  // every cold email ends on, which is what makes it read as a template.
  if (/no worries if/i.test(body)) banned.push('"no worries if"');

  // Scaring somebody into buying. Ary said not to, in those words, and the
  // model reached for it in two of the first four drafts: "a lot of coaches
  // lose people in that gap". It is not a fact, it is a worry invented for a
  // stranger about their own business.
  if (/\b(a lot of|most|many|plenty of|\d+%\s*of)\s+\w+(\s+\w+)?\s+(lose|lose track|miss|never|forget|fail|are losing)/i.test(body)
    // The shape the first real package produced: "this is usually the point
    // where people lose a few days waiting on a reply". Same invented worry,
    // phrased as an observation about the world rather than about them, which
    // is exactly what makes it slip past a pattern looking for "a lot of".
    || /\b(this|that) is (usually|often|typically|generally|where|the point)\b[^.?!]{0,80}\b(lose|lost|miss|missed|drop|slip|wait|waiting|go quiet|fall)/i.test(body)
    || /\b(usually|often|typically|generally)\b[^.?!]{0,40}\b(people|owners|businesses|clients|they)\b[^.?!]{0,40}\b(lose|miss|forget|never|wait)/i.test(body)) {
    banned.push('a claim about what happens to other businesses');
  }

  // Figures of speech. Banned everywhere in her voice, and the model uses them
  // exactly where a plain sentence would be shorter.
  // A claim about their industry with no number attached.
  //
  // Every peer rule above keys on a loss verb: lose, miss, forget, wait. A
  // real draft said \"for a therapy practice that first contact often happens
  // late at night or in a moment someone finally decides to reach out\", which
  // invents context about a stranger's clients, carries no statistic and no
  // loss, and matched none of them. It reached a prepared package and was
  // caught by a person reading it.
  //
  // What is left after this is the only thing the email may stand on: what was
  // observed, what could not be known from outside, and the offer.
  if (PEER_BEHAVIOUR.some((re) => re.test(body))) {
    banned.push('a claim about how their industry behaves');
  }

  const FIGURES = /fall(s|ing)? through the cracks|slip(s|ping)? (away|through)|drop(s|ping)? off the radar|on your radar|in the loop|reach out to touch base/i;
  if (FIGURES.test(body)) banned.push('a figure of speech');

  // A statistic. There is no source for one in this system, so any number
  // presented as a fact about their industry was invented by the model.
  if (/\b\d{1,3}\s?%|\b\d+\s+(out\s+of|in)\s+\d+\b|\b(studies|research|data)\s+(show|says?|suggests?)/i.test(body)) {
    banned.push('a statistic nobody can source');
  }

  // A template variable that never got filled. This is the one defect that
  // reaches a stranger looking unmistakably automated.
  if (/\[[A-Za-z_ ]{2,20}\]|\{\{?\s*[a-z_.]+\s*\}?\}|%[A-Z_]+%/.test(body) || /\[[A-Za-z_ ]{2,20}\]/.test(subject)) {
    banned.push('an unfilled placeholder');
  }

  // A link. A follow-up prepared without anybody reading it is not allowed to
  // send somebody somewhere, and the video and review links have their own
  // rules and their own places in the sequence.
  if (/https?:\/\/|www\.\w/i.test(body)) banned.push('a link');

  // Length. Her rule is three to six sentences; a follow-up that outgrows the
  // first email is not a follow-up.
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 140) banned.push(`${words} words, which is too long for a follow-up`);

  // Two asks. One question at the end is the shape; two is a form.
  const questions = (body.match(/\?/g) || []).length;
  if (questions > 2) banned.push(`${questions} questions`);

  // The greeting. Everything else can be argued about; opening with somebody
  // else's name, or with no greeting at all, cannot.
  if (!/^hi\b/i.test(body.trim())) banned.push('no "Hi" opening');

  return { ok: true, subject, body, banned, words };
}
