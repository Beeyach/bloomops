// Script building + ElevenLabs narration.
//
// Cached by hash of (script + voice + model). During development the same
// script gets rendered dozens of times; without this, a 10k credit balance
// disappears in an afternoon re-reading the same sentence. Same text, same
// voice = one API call ever.

import { createHash } from 'node:crypto';
import { mkdir, writeFile, access, copyFile, stat, rm, readdir, readFile, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spoken } from './findings.mjs';
import { greetingFor } from './greeting.mjs';

export { greetingFor };
import { duration } from './mux.mjs';

const CACHE_DIR = process.env.AUDIO_CACHE_DIR || '/tmp/audio-cache';

// The spoken lines that are neither a compliment nor a finding: the same words
// for every prospect, so they cache exactly like those do and belong in the
// cache list beside them.
//
// Declared here rather than written inline where they are pushed, because the
// cache key is the exact text. Two copies of a sentence would let an edit to
// one of them silently orphan every clip recorded from the other, and the only
// symptom would be the voice quietly costing credits again.
export const FIXED_SEGMENTS = {
  clean: `And beyond that, honestly, I couldn't find anything actually broken. That's more than I can say for most of the sites I look at.`,
  outro: `Anyway, that's everything I noticed.`,
  offers: `Fixing this kind of thing is what we do, the booking and the follow up side mostly, sometimes the whole site.`,
  // For videos that were mostly about the site itself being broken. Pitching
  // booking automation after listing three broken images reads as a script
  // that was written before the site was looked at.
  'offers-site': `That kind of thing is what we fix, and usually it is an afternoon rather than a project.`,
  // One closing question per video, picked to fit what was actually said —
  // two questions in one breath means neither gets answered, and "Either way"
  // opened closes that never presented a choice. Three variants:
  // question    — the findings were about the enquiry/follow-up path
  // 'question-booking' — the opener praised a live calendar, so ask about
  //                      what fires around it
  // 'question-mind'    — nothing above fits; open the door instead
  question: `Curious how enquiries actually reach you at the moment. If there's something behind it I can't see from out here, tell me. And if there isn't, that's the part we build.`,
  'question-booking': `One question before I go. Have you got reminders and a follow up running around that calendar? If not, that's usually where no-shows come from, and it's the kind of thing we can set up in an afternoon.`,
  'question-mind': `And if there's something about the site that's been on your mind, tell me what it is. I'll give you a straight answer on whether it's a quick fix.`,
  // "Those" is wrong when the video raised one thing, and a plural pronoun
  // pointing at a single problem is exactly the tell that the words were
  // assembled rather than spoken.
  'question-one': `Curious how you handle that right now. If there's a system behind it that I can't see, tell me. And if there isn't, that's the part we build.`,
  // Said only when the problems raised were about the same stretch of the
  // journey, so three separate observations land as one argument instead of a
  // list. Without it the video names three costs, never says they are the same
  // cost, and then jumps to what we do for a living.
  //
  // Deliberately claims nothing it cannot know. No lead counts, no lost
  // revenue, no "this is costing you customers": the video has no idea what
  // their volume is or whether the form gets used, and one unverifiable
  // sentence puts every checkable one around it in doubt.
  thread: `That's really all one thing. Someone deciding to get in touch, and what happens after they do.`,
  // Ary's escape hatch, from her sent mail: every audit she writes leaves the
  // door open before the question. Said once, after the findings, so the
  // video ends the way her emails do — an observation offered, not a verdict.
  hatch: `And any of that might be handled on your end already. I can only see the outside of it.`,
  // Said only when the site is detectably on GoHighLevel: the platform Ary
  // works in daily, which turns "here is a list of problems" into "these are
  // the easy kind". Comfort, not a finding, so it lives here as a fixed
  // cached line rather than in the findings at all.
  // "tightened up" was on the banned-verb list in Ary's voice guide. Her
  // verbs: fix, set up, clean up.
  ghl: `One thing in your favour here. You're already on HighLevel, which is the platform we work in every day, so none of this means a rebuild. It's all stuff we can fix inside what you've already got.`,
};

// The findings that live on the enquiry path: someone deciding to make contact
// and everything between that and a reply. Two or more of these in one video
// means it has been circling a single subject, which is when the thread line
// is true rather than a nice-sounding join.
const ENQUIRY_PATH = new Set([
  'cta',
  'ctas-collapse',
  'no-contact',
  'contact-page-no-form',
  'no-booking',
  'booking-is-a-form',
  'calendar-not-loading',
  'captcha-broken',
  'two-schedulers',
  'quote-form-thin',
  'no-reply-promise',
]);

// Short joins played between problems so the video sounds spoken rather than
// cut together. Fixed wording, so they cache once and are free forever after.
//
// Numbered rather than picked at random: the same prospect must get the same
// video if it is ever re-rendered, and an audit that reworded itself between
// runs would be impossible to check a complaint against. Index into this in
// order and the sequence is fixed by how many problems there are.
export const CONNECTORS = {
  // These used to narrate the act of moving on: "The other thing I noticed",
  // "Then there's this one". Nobody talks like that, and two of them cost
  // four seconds of a ninety second video saying nothing. Position instead,
  // which at least tells the listener where they are.
  'connector-1': `Second thing.`,
  'connector-2': `Last one.`,
  'connector-3': `And one more.`,
  'connector-4': `There's another.`,
  'connector-5': `Also this.`,
  'connector-6': `Last one.`,
};

// Segments whose wording belongs to one prospect and nobody else. The greeting
// names them and their site; Ary's own findings are written about their page.
// Neither can ever be a cache hit, so keeping the clips would leave one dead
// file per video and fill the review list with recordings nothing can reuse.
// Where the per-prospect clips go instead of straight in the bin.
//
// The greeting and Ary's own findings were deleted the moment the audio was
// joined, which is right for the long term: they can never be a cache hit for
// anybody else, and keeping them would fill the voice review list with
// recordings nothing can reuse.
//
// It was wrong for the next ten minutes, though. When a render failed after
// the audio was made — and measured over 90 days, 14% of them did, timing out
// in the walkthrough — the retry regenerated those exact clips and paid
// ElevenLabs for them a second time. At roughly 420 characters that is about
// nine cents thrown away per failed render, and ElevenLabs is 7 to 15 times
// the Cloud Run cost of the whole job.
//
// So they are moved here rather than deleted, and swept after RETRY_TTL_MS.
// A retry of the same script inside the window is free; nothing lives long
// enough to clutter the review list, which only ever reads the top level.
const RETRY_DIR = path.join(CACHE_DIR, 'retry');
const RETRY_TTL_MS = 6 * 60 * 60 * 1000;

const NEVER_CACHED_PREFIXES = ['own-'];
const NEVER_CACHED = new Set(['intro']);
const isEphemeralSegment = (key) =>
  NEVER_CACHED.has(key) || NEVER_CACHED_PREFIXES.some((p) => String(key).startsWith(p));

// How many of Ary's own findings a video will carry. The three-problem ceiling
// is about how much anybody will sit through, and hers count towards it: three
// of her own means the measured findings are not spoken at all, which is a
// choice she is allowed to make by writing three.
const MAX_OWN_FINDINGS = 3;

// Problems in one video, hers and the measured ones together. Mirrors
// MAX_SPOKEN in findings.mjs, which caps the measured side before it gets here;
// this is the total once hers are added, so three of her own means none of the
// measured ones are spoken.
const MAX_SPOKEN_TOTAL = 3;

// Turns verified findings into something worth saying out loud. Deliberately
// a template, not an LLM call: it is deterministic, free, and it can only ever
// say things the capture actually established.
//
// Speaks the real problems and at most one compliment. Everything graded minor
// is recorded in the findings but never said, because a list of things that
// are technically true but do not matter is how an audit stops sounding like
// someone looked and starts sounding like a form letter.
export function buildSegments(facts, findings, { name, team, url, business, formal, ownFindings } = {}) {
  // Prefer the business's name from the page title, fall back to the domain.
  //
  // The domain alone reads badly out loud: askkatiep.com came out as
  // "kay-tee-ehp". Titles usually carry the real name, but in no fixed
  // position: "Dr. Anna Stratis – MD, PCC" leads with it, while
  // "Certified Life Coach, Integrative Cancer Coach - Ask Katie P" ends with
  // it. So the title is split on its separators and the best-looking piece is
  // taken rather than always the first.
  //
  // A name piece has no comma (that is a list of services, not a name), is
  // short, and is not a placeholder or a bot-check page. Cloudflare's
  // "Attention Required!" is in the junk list because a challenge page will
  // otherwise be read out as the prospect's business name.
  const JUNK_TITLE =
    /^(home|welcome|untitled|index|new page|page|site|attention required!?|just a moment|cloudflare|access denied)$/i;
  const domain = (() => {
    try {
      return url ? new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '') : null;
    } catch {
      return null;
    }
  })();
  const titlePieces = (facts.title || '')
    // A regex literal with \u escapes, not a string. As a string the \s became
    // a literal "s" and the pattern silently matched nothing, so every title
    // fell through to the domain.
    .split(/\s+[-–—]\s+|\s*[|·]\s*/)
    // Trailing punctuation stripped before the junk test, or Cloudflare's
    // "Just a moment..." slips past a pattern anchored on "just a moment" and
    // gets read out as the prospect's business name.
    .map((p) => p.trim().replace(/[.…!?\s]+$/, ''))
    .filter((p) => p.length >= 3 && p.length <= 32 && !p.includes(',') && !JUNK_TITLE.test(p));

  // Which piece is the business name cannot be decided by position. Real
  // titles put it last ("Gifts & More | Mary Ann Johnson") and first
  // ("Tranquil Mobile Massage | ... | Phoenix | AZ | 85021") about equally, and
  // guessing wrong opens the video by calling someone's business a postcode.
  //
  // The domain settles it. Whatever they registered is the name they chose, so
  // the piece sharing the longest opening run of letters with it wins. That
  // handles abbreviations too: tranquilmm.com against "Tranquil Mobile
  // Massage" agrees for nine characters, which nothing else in that title
  // comes near. Falls back to the last piece when nothing matches, which is
  // where this started.
  const flatten = (v) => v.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const domainKey = flatten((domain || '').split('.')[0]);
  const runWith = (piece) => {
    const k = flatten(piece);
    let n = 0;
    while (n < k.length && n < domainKey.length && k[n] === domainKey[n]) n++;
    return n;
  };
  const namePiece = (() => {
    if (!titlePieces.length) return null;
    const best = titlePieces
      .map((p) => ({ p, run: domainKey ? runWith(p) : 0 }))
      .filter((x) => x.run >= 4)
      .sort((a, b) => b.run - a.run)[0];
    return best ? best.p : titlePieces[titlePieces.length - 1];
  })();
  // The tracker's own business name wins over anything guessed from the title.
  // All of the above is inference from a page; this is a value that came from
  // the prospect record, so preferring the guess over it was backwards.
  //
  // It matters because the guess has a bad failure mode. Pieces are scored by
  // the opening run of letters they share with the domain, which breaks the
  // moment a domain prepends a word: trainstudio617.com against "Studio 617"
  // agrees on nothing at all, since the domain starts "train". Nothing cleared
  // the bar, so it fell back to the last piece of the title, and the video
  // opened by calling a Boston studio "Boston".
  //
  // Only used when it looks like a name rather than a placeholder, so a row
  // whose business column still mirrors a domain or is a single letter falls
  // through to the old path rather than being read out as-is.
  const given = String(business || '').trim();
  const usableGiven =
    given.length >= 3 && given.length <= 60 && !/^https?:|\.(com|net|org|co|io)\b/i.test(given)
      ? given
      : null;
  const site = usableGiven || (namePiece && namePiece.toLowerCase() !== domain ? namePiece : domain || 'your site');

  const { real, opener, clean: nothingMeasured } = spoken(findings);
  // "Clean" counted measured findings only, so a site where the probe found
  // nothing but Ary typed "the booking form 500s on submit" produced a video
  // that said her problem out loud and then closed with "beyond that I could
  // not find anything actually broken", over a card reading "Nothing broken
  // worth flagging." Her word is the whole reason that video exists.
  const ownSaid = (ownFindings || []).filter((o) => String(o?.text || '').trim()).length;
  const clean = nothingMeasured && ownSaid === 0;
  const segs = [];

  segs.push({
    key: 'intro',
    // Three forms, because a first name is only right when we are sure we have
    // one. Roughly a quarter of the list has the business in the name field, so
    // greeting by it produced "Hey Total" and "Hey MAKO". The team form is
    // Ary's own from her sent mail: "Hi MultiPro Roofing team".
    // A full stop after the name, not a comma. The whole greeting is one clip,
    // so the only pause available is the one the punctuation buys, and a comma
    // ran "Hey Anne" straight into "so I just took a quick look" as a single
    // breath. Nobody greets someone and carries on without waiting. A full stop
    // gives the beat that a person leaves there.
    // "Went through, page by page" rather than "took a quick look": the probe
    // now genuinely visits the enquiry-path pages and scans each one, and the
    // watch page makes the same claim, so the two say the same true thing.
    text: name
      ? `${formal ? 'Hi' : 'Hey'} ${name}. So I just went through ${site}, page by page.`
      : team
        ? // Saying the business name twice in one breath is how a mail merge
          // sounds. Once in the greeting is enough.
          `Hi ${team} team. So I just went through ${
            String(site).toLowerCase() === String(team).toLowerCase() ? 'your site' : site
          }, page by page.`
        : `Hi there. So I just went through ${site}, page by page.`,
  });

  // Every video opens on something true and positive. When the specific
  // compliment was dropped for arguing with a problem the video is about to
  // raise, the generic one stands in rather than the video opening cold on a
  // fault: it says nothing about booking, forms, buttons or the phone, so
  // there is no finding it can collide with.
  if (opener) {
    const g = GOOD[opener.key];
    let text = (typeof g === 'function' ? g(opener) : g) || GOOD._default;
    // Praising the front door and then saying the hallway has collapsed, with
    // nothing joining the two, reads as not having noticed. When the opener is
    // about getting in touch and something in that same path is about to be
    // called broken, the compliment carries the join.
    const PATH_OPENERS = new Set(['cta', 'form', 'form-on-contact-page', 'booking']);
    const PATH_BREAKERS = new Set([
      'mailto-form', 'captcha-broken', 'contact-page-no-form', 'no-contact',
      'calendar-not-loading', 'ctas-collapse', 'long-form', 'quote-form-thin',
    ]);
    if (PATH_OPENERS.has(opener.key) && real.some((f) => PATH_BREAKERS.has(f.key))) {
      text += ` Which is exactly why the next bit is worth a look.`;
    }
    segs.push({ key: `good:${opener.key}`, text });
  }
  else if (!clean) segs.push({ key: 'good:_default', text: GOOD._default });

  // A connector before every problem except the first, so the findings are
  // joined rather than stacked. Counted off the problems actually pushed, not
  // off the loop index: a finding whose wording is missing is skipped, and
  // counting the skip would leave a connector introducing nothing.
  let said = 0;
  const saidKeys = [];

  // Ary's own findings go first, before anything measured.
  //
  // She looked at the site; the checks only ran over it. A hero video that will
  // not play is obvious to a person and invisible to every test here, and a
  // video that discusses the footer while that sits on screen reads as not
  // having looked at all.
  //
  // Spoken exactly as written, with no softening and no verification. That is a
  // different bargain from the rest of this file, where nothing is said unless
  // it was measured, and it is the right one for an override: the person typing
  // it is the one who looked.
  for (const own of (ownFindings || []).slice(0, MAX_OWN_FINDINGS)) {
    const text = String(own?.text || '').trim();
    if (!text) continue;
    if (said > 0) {
      const key = `connector-${said}`;
      if (CONNECTORS[key]) segs.push({ key, text: CONNECTORS[key] });
    }
    // Keyed by position so the walkthrough can find the matching `where` hint,
    // and so two of them never collide in the cue list.
    segs.push({ key: `own-${said}`, text });
    said += 1;
  }
  // The ceiling counts hers too. spoken() already capped the measured findings
  // at three, and adding hers on top would have made a six-problem video out of
  // a rule that exists because nobody sits through more than three.
  //
  // Hers win the slots, because she looked and the checks only ran.
  const roomLeft = () => MAX_SPOKEN_TOTAL - said;
  for (const f of real) {
    if (roomLeft() <= 0) break;
    const say = REAL[f.key];
    if (!say) continue;
    if (said > 0) {
      const key = `connector-${said}`;
      if (CONNECTORS[key]) segs.push({ key, text: CONNECTORS[key] });
    }
    segs.push({ key: f.key, text: typeof say === 'function' ? say(f) : say });
    saidKeys.push(f.key);
    said += 1;
  }

  // Ties the problems together before the video moves on to what we do, but
  // only when they were about the same thing. Counted off what was actually
  // spoken, so a finding dropped for want of wording cannot make the video
  // claim a pattern the viewer never heard.
  if (saidKeys.filter((k) => ENQUIRY_PATH.has(k)).length >= 2) {
    segs.push({ key: 'thread', text: FIXED_SEGMENTS.thread });
  }

  // The escape hatch belongs to guesses, not to things filmed breaking.
  // Saying "any of that might be handled on your end already" after showing
  // four images failing and a form that does not send undercuts her own
  // evidence: none of that MIGHT be handled, it is on camera. So it only
  // fires when at least one thing said was an inference about what happens
  // out of view.
  const INFERRED = new Set([
    'no-hours', 'no-reviews', 'no-booking', 'booking-is-a-form',
    'quote-form-thin', 'no-meta-description', 'stale-stack', 'cta',
    'no-local-schema', 'no-address', 'long-form',
  ]);
  // saidKeys, not real: with her findings in the script the measured ones that
  // got cut must not decide the hedge, the offer or the closing question. The
  // video was choosing its sign-off from findings the viewer never heard.
  const guessed = saidKeys.some((k) => INFERRED.has(k));
  if (!clean && said > 0 && guessed) segs.push({ key: 'hatch', text: FIXED_SEGMENTS.hatch });
  // The comfort line, right after the honesty line: problems raised, the out
  // offered, and then "and fixing these is easy where you are". Only when the
  // probe actually saw GoHighLevel on the page.
  if (!clean && said > 0 && findings.some((f) => f.key === 'on-ghl')) {
    segs.push({ key: 'ghl', text: FIXED_SEGMENTS.ghl });
  }

  if (clean) segs.push({ key: 'clean', text: FIXED_SEGMENTS.clean });

  // Still no ask and no call. This used to close on "happy to walk you through
  // any of it", which is a pitch and duplicates the question the outreach email
  // already ends on.
  //
  // The line about the rest of the work is deliberately an aside rather than an
  // offer: it names what exists, says where to find it, and moves on. Anything
  // stronger turns a video about their site into a video about us, which is the
  // thing that makes these get closed halfway.
  //
  // Its own segment so it lands after a pause instead of running on from the
  // findings. Written for the ear, not the eye, so the domain is said the way a
  // person would say it out loud.
  // "Anyway, that's everything I noticed" followed by an offer followed by a
  // question is three endings in a row, about fifteen seconds of winding
  // down after the content stopped. It stays only when there is nothing else
  // to say, which is the clean-site case.
  if (clean) segs.push({ key: 'outro', text: FIXED_SEGMENTS.outro });
  // No URL. bloomwired.io/offers was a page Ary showed me so I could see what
  // they sell; reading it out to a prospect turns a video about their site
  // into an advert for ours, and a spoken URL is the least likely thing anyone
  // ever types in. The email carries the link if it needs to.
  //
  // What is left is one plain sentence naming the work, in the same register as
  // the rest: this is what we do, said once, with nothing asked for.
  // Two offers, picked on what the video was about. Listing three broken
  // things on a website and then pitching booking automation is a mismatch
  // the listener feels even if they cannot name it.
  const SITE_FAULTS = new Set([
    'broken-images', 'dead-image-host', 'dead-links', 'dead-link-one',
    'nav-dead-link', 'placeholder-text', 'social-stub', 'social-feed-dead',
    'stale-copyright', 'expired-date', 'default-title', 'insecure',
    'mixed-content', 'mobile-overflow', 'viewport', 'noindex', 'no-title',
    'ctas-collapse', 'stale-stack',
  ]);
  const mostlySiteWork = saidKeys.length > 0 && saidKeys.filter((k) => SITE_FAULTS.has(k)).length > saidKeys.length / 2;
  segs.push({
    key: mostlySiteWork ? 'offers-site' : 'offers',
    text: mostlySiteWork ? FIXED_SEGMENTS['offers-site'] : FIXED_SEGMENTS.offers,
  });
  // Singular when the video raised one thing. Counted off what was actually
  // spoken rather than off the findings list, so a problem dropped for want of
  // wording cannot leave the closing line referring to it.
  // One question, chosen to fit the video. A live calendar in the opener gets
  // the reminders ask (moved here out of the compliment, where three sentences
  // of setup sat in front of the first finding). Enquiry-path findings get
  // "how do you handle it". Anything else gets the open door.
  const FOLLOWUP_QUESTION_KEYS = new Set([
    'booking-is-a-form', 'no-booking', 'quote-form-thin', 'lead-magnet-open',
    'contact-page-no-form', 'no-contact', 'long-form', 'captcha-broken',
    'calendar-not-loading', 'two-schedulers', 'mailto-form',
  ]);
  const one = said === 1;
  let qKey;
  if (opener?.key === 'booking') qKey = 'question-booking';
  else if (saidKeys.some((k) => FOLLOWUP_QUESTION_KEYS.has(k))) qKey = one ? 'question-one' : 'question';
  else qKey = 'question-mind';
  // Findings that hedge by asking ("Do you keep them off on purpose?") already
  // put a question in the listener's hands. Following two of those with a
  // third, vaguer one is how a close stops being a close. The open-door
  // variant is the one that adds least, so it is the one that goes.
  const alreadyAsked = segs.filter((x) => /\?\s*$/.test(x.text)).length;
  if (!(qKey === 'question-mind' && alreadyAsked >= 1)) {
    segs.push({ key: qKey, text: FIXED_SEGMENTS[qKey] });
  }

  // Applied per segment rather than to the joined script, because the joined
  // script is not the only consumer: server.mjs builds what it sends to the
  // voice out of these segments directly, and the same segments are what the
  // per-beat cues align to. Fixing it in buildScript alone would have changed
  // nothing about the audio and quietly desynced the cues from it.
  return segs.map((s) => ({ ...s, text: forSpeech(s.text) }));
}

// Turns verified findings into something worth saying out loud. Deliberately
// a template, not an LLM call: deterministic, free, and it can only ever say
// things the capture actually established.
//
// Speaks the real problems and at most one compliment. Everything graded minor
// is recorded in the findings but never said, because a list of things that
// are technically true but do not matter is how an audit stops sounding like
// someone looked and starts sounding like a form letter.
// Acronyms the voice reads as words instead of letters. "NYC" came out as
// "neek", which is the sort of thing a prospect notices immediately and reads
// as nobody having listened to their own video before sending it.
//
// An explicit list rather than a rule about capital letters. A general "spell
// out short uppercase runs" would also spell out the perfectly pronounceable
// ones and mangle real words that happen to be capitalised, and getting a
// business's own name wrong is worse than the problem being fixed. Periods are
// what the voice needs to switch from reading a word to reading letters.
const SPOKEN_ACRONYMS = {
  NYC: 'N.Y.C.', LA: 'L.A.', DC: 'D.C.', SF: 'S.F.', LV: 'L.V.',
  UK: 'U.K.', USA: 'U.S.A.', NZ: 'N.Z.', BC: 'B.C.',
  HVAC: 'H.V.A.C.', SEO: 'S.E.O.', CBD: 'C.B.D.', LLC: 'L.L.C.',
  PT: 'P.T.', MD: 'M.D.', DDS: 'D.D.S.', RMT: 'R.M.T.', NP: 'N.P.',
  // Spelled out deliberately rather than left to the model to guess at. These
  // two sit next to each other in the insecure line, and a take where one is
  // spelled and the other is read as a word is the take that has to be redone.
  HTTP: 'H.T.T.P.', HTTPS: 'H.T.T.P.S.',
};
const ACRONYM_RE = new RegExp(`\\b(${Object.keys(SPOKEN_ACRONYMS).join('|')})\\b`, 'g');

// Case-sensitive on purpose: "us" the pronoun must not become "U.S.", and
// "Md" as part of a name is not the qualification.
export function forSpeech(text) {
  return String(text || '').replace(ACRONYM_RE, (m) => SPOKEN_ACRONYMS[m] || m);
}

export function buildScript(facts, findings, opts = {}) {
  return forSpeech(
    buildSegments(facts, findings, opts)
      .map((s) => s.text)
      .join(' ')
  );
}

const GOOD = {
  // Named exactly when the button text reads well out loud; the generic form
  // otherwise. Ary's sent audits always name the thing she liked, and "your
  // Book a Consultation button" proves a person looked where "the main
  // button" does not.
  cta: (f) => {
    const label = String(f?.detail || '').trim();
    const speakable = label.length >= 3 && label.length <= 26 && /^[\w\s'&-]+$/.test(label);
    return speakable
      ? `Your ${label} button's right there at the top. So someone landing on your site knows exactly what you want them to do.`
      : `The main button's right there at the top. So someone landing on your site knows what you want them to do straight away.`;
  },
  form: `Your contact form's right there on the page, so nobody has to go looking for it.`,
  'form-on-contact-page': `Your contact page has a proper form on it, so there's a clear way in.`,
  phone: `Your number's tappable, so someone on a phone can press it and call you without copying anything out.`,
  booking: (f) => {
    const vendor = String(f?.detail || '').trim();
    const speakable = vendor && vendor !== 'a booking tool' && /^[a-z]+$/i.test(vendor);
    const pretty = speakable ? vendor[0].toUpperCase() + vendor.slice(1).toLowerCase() : null;
    // Compliment only. The reminders/follow-up ask lives in the closing
    // question ('question-booking') now — three sentences of setup in front
    // of the first finding made the opening drag.
    return pretty
      ? `People can book you straight from the site through ${pretty}, which is the main thing, and plenty of the sites I look at don't have that.`
      : `People can book you straight from the site, which is the main thing, and plenty of the sites I look at don't have that.`;
  },
  'followup-tool': `You've got proper email software connected, so people are getting something back after they reach out.`,
  _default: `It's clear what you do and who it's for, which a lot of sites miss.`,
};

// One entry per real problem. Each says only what the check established, and
// each says why it costs them something, because "you are missing a viewport
// meta tag" means nothing to somebody who sells greeting cards.
//
// Written the way it would be said out loud rather than the way it would be
// written down. The earlier copy had no contractions at all ("it is useful",
// "I could not find"), which is nobody's speaking voice, and reading formal
// prose aloud was most of what made the narration sound synthetic.
const REAL = {
  // Was "there's nothing above the fold telling a visitor what to do next",
  // which is jargon wrapped around a vague claim. Ary read it and did not know
  // what it meant, so a prospect will not either. The concrete version names
  // the thing that is missing and how to see it.
  // The worry in these lines is the competitor, never an invented number or a
  // little imagined story. "The next result" is simply where a visitor who
  // gives up on a page goes, so saying it is honest and it stings, which is
  // the combination Ary asked for. A hypothetical customer with a backstory
  // is the thing she asked to never hear again.
  // Rewritten through the ary-voice skill: plain words only, no metaphors or
  // decorated phrases, her verbs (fix, set up, keep track, follow up), short
  // verdict sentences, and questions instead of apologies. Warmth comes from
  // honesty, never from imagery.
  cta: `There's no button on your homepage before you scroll. Just the menu across the top. Someone who lands ready to get in touch has to go looking for how, and people don't look. They go back to the search results and tap the next name on the list.`,
  'no-contact': `I couldn't find a contact form, an email link, or a contact page anywhere. Someone who wants to work with you has nothing to click, and they won't go looking for it. They move on to the next result, and you never find out it happened.`,
  // No "either". The word needs a negative before it, and it had one back when
  // the walkthrough said there was no form on the home page first. It does not
  // say that any more, so the word pointed at nothing and the sentence read as
  // though a line had gone missing.
  'contact-page-no-form': `Your contact page doesn't have a form on it. So reaching you means copying your email address out and switching over to their own mail app, and a fair number of people stop right there. The ones who stop don't come back later. They write to whoever made it easy.`,
  insecure: `Your site's still served over plain HTTP instead of HTTPS. Browsers put a Not Secure warning next to your address because of it, and some people close the tab right there. It's usually a free fix with whoever hosts your site.`,
  'mixed-content': `Your page itself is secure, but a few things on it still load the old insecure way, and browsers block those outright. So parts of your page aren't showing up for some people.`,
  // No pixel counts out loud: the measurement lives on the on-screen card,
  // where a number belongs. Spoken, "340 pixels" is engineer talk.
  'mobile-overflow': `On a phone, your layout runs past the edge of the screen, so people have to scroll sideways just to read it. Open your own site on your phone and you'll see it straight away.`,
  viewport: `There's a line missing that tells phones how to size your page. So a phone shrinks the whole desktop version down instead of laying it out for a small screen. Pull your site up on your phone and you'll see everything tiny. Most people finding you are on a phone, so the tiny version is the one most of them see.`,
  // The slow line is gone from the voice on Ary's call: a seconds figure read
  // aloud invites arguing about the number, the number moves between runs,
  // and one prospect already wrote back to say his site loads fast for him.
  // It stays in the written report as a minor.
  //
  // A dead item in the main menu, dropdowns included. Spoken generic and
  // fixed so it caches; the on-screen card names the item and the path.
  'nav-dead-link': `One of the items in your main menu goes to a page that isn't there any more. The menu is the most clicked part of any site, so this is the error page your visitors are most likely to find. Usually a two minute fix.`,
  'broken-images': (f) => `${f.detail} images on the page aren't loading, so visitors get blank boxes where your photos should be. It makes the site look like nobody's checking on it, and that's the first impression they get of the business.`,
  // Says what happened rather than only what it looks like. The owner did not
  // break these, a service they were being loaded from shut down, and knowing
  // that is the difference between "my site is broken" and one afternoon of
  // re-uploading. The escape hatch is there because a host can also be down for
  // an hour rather than gone.
  'dead-image-host': (f) => {
    const [count, host] = String(f.detail || '').split('|');
    return `${count} of your images are loading from ${host}, and nothing is coming back from it, so they show as empty boxes. That's not something you broke. It's an outside service your site was pointed at, and if it's gone for good those images need re-uploading to your own site.`;
  },
  // Names the page it was actually seen on. Saying "your contact form" was
  // too broad: on doolancoaching.com the error is on a service page while the
  // main contact page is clean, and overstating it is as damaging as missing
  // it.
  'captcha-broken': (f) =>
    `The spam check on ${f.detail ? `your ${f.detail} page` : 'one of your pages'} is showing an error instead of loading, so the form under it can't be sent. If someone found you this week and filled that in, it never reached you, and you wouldn't know it happened. That one I'd fix today.`,
  // Each of these says how to check it, because an SEO claim nobody verifies is
  // a claim nobody believes.
  // No homework ("search site colon...") and no overclaim: a noindexed site
  // can still show on the Google Maps listing, because the business profile
  // is separate from the website's index. The claim stays on what is true.
  noindex: `There's a setting on your site telling Google not to list the site itself. Your business listing can still show up on Maps, but the website under it is set to stay out of search results. It's usually a leftover from a rebuild, and switching it off takes minutes.`,
  // no-local-schema and no-address kept their wording long after both were
  // demoted to minor, so neither could ever be spoken while both still sat in
  // the voice cache being recorded and paid for. The search-listing point is
  // already made once, properly, by no-meta-description; three SEO lines in
  // one video was a lecture anyway. Written report only now.
  'dead-links': (f) =>
    `${f.detail} of the links on your site go to a page that isn't there any more. Someone clicking those gets an error instead of whatever you were sending them to, and you'd never see it happen.`,
  // Names the path so it can be checked in ten seconds. On awakenananda.com
  // the dead link is an image with no text, so "one of your links" was true and
  // impossible to act on.
  // A URL read out loud is a stream of slashes and syllables nobody can write
  // down. The address is put on screen instead, where it can be read, and the
  // line says what is wrong with it.
  'dead-link-one': `One of your links goes to a page that isn't there any more. Whoever clicks it gets an error instead of whatever you meant to show them.`,
  'stale-copyright': (f) =>
    `Your footer still says ${f.detail}. It's on every page, and it's the kind of thing that makes someone wonder whether you're still taking clients.`,
  'no-title': `Your page doesn't have a title set, so search results and browser tabs show a bare web address instead of your name.`,

  // The enquiry path. This is the part worth sending: a site can be technically
  // spotless and still lose every lead that fills in the form.
  // Deliberately does not name the link. Naming it from the crawl produced
  // "your Get in Touch link" on a site whose button says Book Now, and once
  // produced "your c link" from an icon. The claim itself does not need a
  // name, and a wrong one tells the reader this was not written for them.
  // Not framed as a fault. Ary's website-audit skill is explicit that
  // practitioners often skip online booking on purpose, to screen who they
  // take on, and that the angle is the request-to-approval gap rather than the
  // absence of a calendar. Calling it a defect was also why every coaching and
  // wellness prospect got a near-identical script: they all work this way.
  'booking-is-a-form': `You're taking these as requests instead of letting people pick their own time, which I'd guess is on purpose so you can see who you're working with first. The part I'd look at is the gap after that. Every one of those turns into you going back and forth to find a time, and that's usually where people go quiet.`,
  // A claim about the form itself, which they confirm by opening it. What
  // happens after the form is deliberately not said: it cannot be seen from
  // outside, and it is the one line a prospect wrote back to correct.
  // Her sharpest catch, in her words: "the call-now copy says 800-571-3556,
  // while the click-to-call links on that same page point to 408-752-5833."
  // Says how to check it, because tapping it is the whole proof.
  // Both numbers are boxed on screen during this beat, so reading them out was
  // saying aloud what the viewer is already looking at — and two near-identical
  // phone numbers read in sequence is impossible to compare by ear anyway.
  //
  // It also made the line unique per prospect, so it could never be a cache hit
  // and was paid for on every single video.
  // Hedges became questions on Ary's call: "ignore me" three times in one
  // video is apologizing, a question is engaging, and a question is also the
  // thing that gets replied to.
  'phone-mismatch': `The number printed on your page and the number the link actually dials aren't the same. Tap it on your phone and look at what comes up before you connect. Is that second number one you set up on purpose?`,
  // The address is already on screen for this beat. An email address read out
  // loud is a string of letters nobody can follow, and it kept the line out of
  // the cache for no gain.
  'two-schedulers': (f) =>
    `You've got two booking systems linked from the site, ${f.detail}. Whichever one you stopped using is still reachable, so someone can book into the one you're not watching.`,
  'calendar-not-loading': `Your booking page opens, but the calendar itself never loads. Just an empty space where the times should be. You'd probably never see it, because your browser's got it cached from every other time you've looked. Someone new gets the blank version.`,
  'lead-magnet-open': (f) =>
    `Your "${f.detail}" link hands the file straight over, without asking for an email first. There's a version of that which works better for both sides. A small page in front of it, so they still get the file instantly, and you get their email and an automatic follow up in the days after. Same freebie, but your list grows every time someone takes it.`,
  // Two wordings, picked on the count. Naming a number is the stronger line
  // because the owner can go and count them, but "you've got two different
  // buttons" reads as a complaint about having two buttons rather than about
  // where they lead. Only three or more earns the count.
  'ctas-collapse': (f) =>
    Number(f.detail) === 3
      ? `You've got three different buttons on the page, and every one of them goes to the same place. So someone picking the option that fits them ends up in the same general form as everyone else, and you can't tell which one they came for. Click any two and you'll see.`
      : `Every button on the page goes to the same place. So someone picking the option that fits them ends up in the same general form as everyone else, and you can't tell which one they came for. Click any two and you'll see.`,
  'expired-date': (f) =>
    `There's still something dated ${f.detail} up on the site. Anyone finding that now either thinks it's current, or works out that nobody's been here in a while.`,
  'quote-form-thin': `Your quote form asks for a name and an email, but nothing about the actual job. No address, no idea what they need. So every request has to be chased before you can price it, and that's a round trip on every single one. Or is pricing it over the phone how you prefer to work?`,
  'no-booking': `I couldn't find a way to book you from the site. So getting a time with you takes a conversation, and the businesses that let people grab a slot in thirty seconds are where the impatient ones end up. Is that a choice, or has it just never made it to the top of the list?`,
  'long-form': (f) =>
    `Your contact form asks for ${f.detail} separate things. On a phone that's a lot of typing, and every extra field loses a few more people before they hit send.`,
  'placeholder-text': (f) => {
    const [snippet, where] = String(f.detail || '').split('|');
    const place = where ? `on your ${where} page` : 'on the page';
    return `There's still template text sitting ${place}. It says "${String(snippet || '').replace(/"/g, '')}" where your own words should go. It's a two minute fix, and it changes how everything else on the site reads.`;
  },
  // The platform name is a tiny fixed set, so these cache per platform.
  'social-stub': (f) =>
    `The ${f.detail} icon on your site goes to ${f.detail} itself, not to your page. Template leftover. Anyone tapping it lands in their own feed instead of finding you.`,
  // ancient-markup and no-reply-promise are out of the spoken set for good:
  // the first is uncheckable jargon from the owner's chair, and the second
  // guessed at what happens after the form — the one line a prospect ever
  // wrote back to correct: "It's automated. I have a system. Now you know."
  //
  // stale-stack and no-meta-description went out with them and came back on
  // Ary's call, rewritten so the claim is about what it costs rather than
  // what it is called. The platform line names the everyday consequences of
  // an old install; the search line is about the sentence people read before
  // choosing who to click, not about a meta tag.
  'stale-stack': (f) =>
    `Your site's running ${f.detail}, which is years old now. It still works, but it's part of why things look dated, it's why small changes cost more than they should, and versions that old stop getting security fixes. Worth planning for at some point.`,
  'no-meta-description': `One more thing you'd never see from your side: when your site comes up on Google, the grey line under your name is picked at random off your page, because nothing is set. That line is the first thing people read before deciding who to click. It's quick to fix, and it's the one spot where everyone compares you side by side.`,
  //
  // What replaced them is below: a browser tab still reading the template
  // default, and the two absence checks. Both absences say exactly what was
  // looked at and offer the out Ary always writes, because "I couldn't see
  // it" is honest where "you don't have it" is a guess.
  'default-title': (f) =>
    `The name on your browser tab still says "${f.detail}". That's the template default, and it's also the headline Google shows for your site, so your business name belongs there.`,
  'no-hours': `I couldn't find your opening hours anywhere on the site. Not a crisis, but people do check before they call, and having them on the site helps your Google listing too. Do you keep them off on purpose?`,
  'social-feed-dead': `The Instagram feed on your page has stopped loading. Just an empty box where your posts should be. These stop working when the connection expires, and nobody gets told, so it's nothing you did. Reconnecting it usually takes a few minutes.`,
  'mailto-form': `When someone presses send on your contact form, it doesn't actually send anything. It tries to open their own email program with the message in it, and on most phones that goes nowhere. A form that just sends, straight to your inbox, is a small change, and it works for every single person who fills it in.`,
  'no-reviews': `I couldn't see any reviews or testimonials on the site. Right now a stranger has to take your word for it, while the businesses they're comparing you against have their reviews right on the page. Have you got good ones on Google we could pull onto the site?`,
};

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);

// These defaults were chosen by ear across a long day of auditions, on a
// professional clone recorded from natural conversational speech.
//
// eleven_turbo_v2_5, not v3. v3 phrases well but cannot hold a cloned accent:
// it read strongly British on a voice that is not, on the instant clone and on
// the professional one, at every stability, with and without a language code,
// with single and repeated accent tags. That is documented behaviour, not a
// bug to dial out, and turbo was the one model that kept Ary's own accent
// through all of it.
//
// Turbo's known weakness is flat delivery, and style is what breaks the
// monotone. It wrecked the accent on v3 with a thin clone; on turbo with a
// good clone it adds life without moving the accent.
//
// style 0.2 and stability 0.45, and the pairing matters because generation is
// per segment now. Style is re-interpreted on every independent generation, so
// at 0.4 one sentence would come out noticeably faster than the next and the
// intonation wandered between them. Lower style stops it performing; higher
// stability is what makes segment three sound like segment one.
//
// similarity 0.8, not 0.95. High similarity holds the read faithfully to the
// reference recordings, pronunciation included, which meant reproducing "the"
// as "da" and "to" as "tu". Backing off hands those sounds to the model's own
// English. 0.6 went too far the other way and read tonelessly.
//
// segmented, and this is the one that made short auditions stop lying. A
// /say audition is about 150 characters and always sounded right; a full
// script is one generation of 600 or more and would start well and go limp
// by the end. ElevenLabs' own guidance is to break longer text into smaller
// segments to reduce "degradation over longer audio generations", which is
// exactly the symptom. Each sentence group is now its own short generation,
// so no single one runs long enough to degrade, and every one is the length
// that already sounded right in auditions.
//
// speed 0.9 because style raises the pace as well as the expressiveness, and
// at 1.0 it ran too fast to follow. stability 0.3 gives variation on top.
//
// No language_code. It does not affect accent (ElevenLabs' own docs say it
// controls language and text normalisation only), and is unsupported on
// multilingual_v2 anyway.
//
// Everything is overridable from the environment or per request, because how a
// cloned voice lands is a matter of taste that cannot be judged from the code.
// The voice half of a cache key. Kept here so the cache browser and the
// renderer cannot drift on what counts as "the same voice": change the speed
// and every clip is a different key, which is what stops old-sounding audio
// being served after a settings change.
export function voiceKeyFor({ modelId = 'eleven_turbo_v2_5', voiceId, speed = 0.9, stability = 0.45, similarity = 0.8, style = 0.2, languageCode = null, accent = null } = {}) {
  return `${modelId}:${voiceId}:${speed}:${stability}:${similarity}:${style}:${languageCode}:${accent}`;
}

// Drops retry clips past their window. Called once at the top of a render, so
// the holding area cannot grow without bound on a long-lived instance.
export async function sweepRetryCache(now = Date.now()) {
  let dropped = 0;
  try {
    for (const f of await readdir(RETRY_DIR)) {
      const full = path.join(RETRY_DIR, f);
      try {
        const st = await stat(full);
        if (now - st.mtimeMs > RETRY_TTL_MS) { await rm(full).catch(() => {}); dropped += 1; }
      } catch {}
    }
  } catch {
    // No retry directory yet. Nothing to sweep.
  }
  return dropped;
}

export function cacheFileFor(text, settings) {
  return path.join(CACHE_DIR, `${hash(`${voiceKeyFor(settings)}:${text}`)}.mp3`);
}

// Every clip the cache holds, so every clip can be listened to and replaced.
//
// The lines identical for every prospect are listed whether or not they have
// been recorded yet, since the point of showing an empty one is to say the
// cache could hold it.
//
// The lines that bake in a detail were left out of this list on the grounds
// that they can never be a cache hit. That is true of a phone number or a page
// name, and wrong about the rest: a footer year, a jQuery version and a count
// of broken images all come from a handful of values that repeat across sites,
// so they cache exactly like the fixed lines do. Leaving them out meant the
// cache held clips the UI would not show and no button could delete.
//
// The text is passed through forSpeech first, because that is what is actually
// sent to the voice and therefore what the key was built from.
export async function cacheEntries(settings) {
  const out = [];
  const seen = new Set();
  const push = (key, source, text, bytes, id) => {
    seen.add(id);
    out.push({ key, source, text, id, cached: bytes != null, bytes });
  };
  const sizeOf = async (file) => {
    try {
      return (await stat(file)).size;
    } catch {
      return null;
    }
  };

  for (const [source, table] of [['good', GOOD], ['problem', REAL], ['script', FIXED_SEGMENTS], ['connector', CONNECTORS]]) {
    for (const [key, tmpl] of Object.entries(table)) {
      if (typeof tmpl !== 'string') continue;
      const text = forSpeech(tmpl);
      const file = cacheFileFor(text, settings);
      push(key, source, text, await sizeOf(file), path.basename(file, '.mp3'));
    }
  }

  // Detail-carrying lines are not enumerated any more. They used to be listed
  // by hashing every value a line might plausibly hold and looking for a file
  // that matched, which covered years and counts and versions and missed
  // everything with no small set to guess at: a pixel width, a vendor pairing,
  // a page path. Those clips showed as unnamed recordings no matter how many
  // candidates were added, because the approach could not be finished, only
  // extended. The sidecar written at record time carries the wording instead,
  // and the sweep below picks all of them up.

  // Anything still unaccounted for, with its wording read from the sidecar
  // written when it was recorded. Only clips made before sidecars existed have
  // no text, and they age out as their lines are replaced.
  //
  // The 32-hex test also excludes the `<hash>.joined.mp3` assemblies, which is
  // deliberate: those are whole scripts rather than lines, and dropCached already
  // clears them when any line inside one is replaced. Offering them here would be
  // offering to delete a whole video's audio as though it were a sentence.
  try {
    for (const f of await readdir(CACHE_DIR)) {
      if (!f.endsWith('.mp3')) continue;
      const id = f.slice(0, -4);
      if (seen.has(id) || !/^[a-f0-9]{32}$/.test(id)) continue;
      const text = await readFile(path.join(CACHE_DIR, `${id}.txt`), 'utf8').catch(() => null);
      push(null, 'other', text, await sizeOf(path.join(CACHE_DIR, f)), id);
    }
  } catch {
    // No cache directory yet. The fixed lines above still list as uncached.
  }

  return out.sort((a, b) =>
    Number(b.cached) - Number(a.cached)
    || String(a.key || '￿').localeCompare(String(b.key || '￿')));
}

// Forgets one clip. The next render that needs the line records it again, and
// only that line: the loop checks each sentence's file on its own.
export async function dropCached(id) {
  if (!/^[a-f0-9]{32}$/.test(String(id || ''))) return false;
  try {
    await rm(path.join(CACHE_DIR, `${id}.mp3`));
  } catch {
    return false;
  }
  // The wording goes with the clip it described, or the next recording of that
  // line leaves a sidecar for a file nobody can reach.
  await rm(path.join(CACHE_DIR, `${id}.txt`)).catch(() => {});
  // The joined files are keyed on the whole script, so any that contained this
  // line would still replay the old audio. Cheapest correct answer is to drop
  // them all; they are rebuilt from the per-sentence clips on the next render
  // and cost nothing to remake.
  try {
    const names = await readdir(CACHE_DIR);
    await Promise.all(
      names.filter((n) => n.endsWith('.joined.mp3')).map((n) => rm(path.join(CACHE_DIR, n)).catch(() => {}))
    );
  } catch {}
  return true;
}

export async function narrate(
  script,
  segments,
  { apiKey, voiceId, modelId = 'eleven_turbo_v2_5', speed = 0.9, stability = 0.45, similarity = 0.8, style = 0.2, languageCode = null, accent = null, segmented = true }
) {
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID is not set');

  await mkdir(CACHE_DIR, { recursive: true });
  const settings = `${modelId} speed=${speed} stab=${stability} sim=${similarity} style=${style} lang=${languageCode} accent=${accent || 'none'}`;
  const tag = accent ? `[${accent} accent] ` : '';
  const voiceKey = `${modelId}:${voiceId}:${speed}:${stability}:${similarity}:${style}:${languageCode}:${accent}`;

  // One call per sentence group rather than one call for the whole script.
  //
  // ElevenLabs' own guidance is that a voice can drift between accents "within
  // a single generation, especially if that generation is longer in length",
  // and to break longer text into smaller segments. Our scripts run 500 to 900
  // characters in one request, which is squarely in that territory, and the
  // read kept arriving British on a voice that is not.
  //
  // Three things fall out of this beyond the drift. The accent tag is restated
  // at the start of every generation rather than buried mid-paragraph. Each
  // segment's duration is known exactly, so the cues no longer depend on
  // parsing an alignment response. And the cache works per segment, so an
  // edit to one sentence stops re-spending on the whole script.
  // Take 7 was a single generation with no accent tag, and it is the take Ary
  // chose out of a dozen. Segmenting is kept because it is the documented
  // remedy for drift and it gives exact cues and a per-sentence cache, but it
  // is off by default: it changes the sound, and the sound was the thing being
  // chosen. Turn it on per request with segmented: true.
  const pieces =
    segmented && Array.isArray(segments) && segments.length ? segments : [{ key: 'all', text: script }];
  const paths = [];
  const cues = [];
  const gaps = [];
  // Written this run purely so they can be joined, and deleted once they have
  // been. The greeting is the only one: it names the prospect and their site,
  // so its clip could never be hit by anybody else and would sit in the cache
  // forever as one more unidentifiable recording per video.
  const ephemeral = [];
  let cached = true;
  let elapsed = 0;

  for (const seg of pieces) {
    const file = path.join(CACHE_DIR, `${hash(`${voiceKey}:${seg.text}`)}.mp3`);
    if (isEphemeralSegment(seg.key)) {
      ephemeral.push(file);
      // A previous attempt at this exact line, still inside its window. Moving
      // it back is what makes a retry after a failed walkthrough free.
      const held = path.join(RETRY_DIR, path.basename(file));
      try {
        await stat(held);
        await rename(held, file);
        console.log(`reused held audio for ${seg.key}`);
      } catch {
        // Nothing held. It gets generated below, as before.
      }
    }
    // A cached clip has to be readable, not merely present.
    //
    // access() only asks whether the name exists, and on gcsfuse a file can
    // exist and still answer "Stale file handle" when something actually reads
    // it. ffprobe hit exactly that on shirehypnotherapy.com and the render died
    // on a clip that was already paid for.
    //
    // Probing it here settles both questions at once, and a clip that cannot be
    // read is treated as one that is not there: recorded again, at the cost of
    // that one line.
    let cachedDur = null;
    try {
      await access(file);
      cachedDur = await duration(file);
    } catch {
      cachedDur = null;
    }
    if (cachedDur == null) {
      cached = false;
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: tag + seg.text,
          model_id: modelId,
          ...(languageCode ? { language_code: languageCode } : {}),
          voice_settings: { stability, similarity_boost: similarity, style, speed, use_speaker_boost: true },
        }),
      });
      if (!res.ok) {
        const b = await res.text().catch(() => '');
        throw new Error(`ElevenLabs ${res.status}: ${b.slice(0, 300)}`);
      }
      // Written under a temporary name and moved into place, so a second
      // render recording the same line at the same moment cannot be caught
      // reading a half-written file. gcsfuse answers a clash with a stale file
      // handle, and that used to come back as a failed render rather than a
      // missed cache write.
      const bytes = Buffer.from(await res.arrayBuffer());
      const tmp = `${file}.${Math.random().toString(36).slice(2)}.part`;
      try {
        await writeFile(tmp, bytes);
        await rename(tmp, file);
      } catch {
        // The clip is not cached this time round and the next render that needs
        // it will record it again. A cache miss costs credits; a thrown error
        // costs the whole video.
        await rm(tmp).catch(() => {});
        await writeFile(file, bytes).catch(() => {});
      }
      // The words, written down beside the clip.
      //
      // The list used to work the wording back out by hashing every value a
      // line might plausibly carry and looking for a file that matched. That
      // can only ever cover the values somebody thought of: a pixel width, a
      // vendor pairing or a page path has no small set to enumerate, so those
      // clips showed as "recorded line, press play" and stayed that way.
      // Recording the text at the moment it is spoken makes the list complete
      // by construction rather than by guesswork.
      //
      // Not written for the greeting: its mp3 is deleted after the join, and a
      // sidecar naming the prospect would outlive the clip it describes.
      if (!isEphemeralSegment(seg.key)) {
        await writeFile(file.replace(/\.mp3$/, '.txt'), seg.text, 'utf8').catch(() => {});
      }
    }
    cues.push({ key: seg.key, start: elapsed });
    // The gap between segments counts toward the clock, or every cue after the
    // first drifts early by one pause and the last one is out by a second and
    // a half. Which is also why the gap is worked out once, here, and handed to
    // the concat: if the two disagreed by even a tenth the cues would slide
    // against the audio for the rest of the video.
    const gap = gapAfter(seg.key);
    gaps.push(gap);
    // Reuses the length measured on the cache probe above when there was one,
    // so a hit costs one ffprobe rather than two.
    elapsed += (cachedDur ?? (await duration(file))) + gap;
    paths.push(file);
  }

  // Concatenated losslessly; these are all the same codec from the same voice.
  // Written to local disk, not the shared cache.
  //
  // CACHE_DIR is a GCS bucket mounted through gcsfuse, and two renders writing
  // there at once fall over each other: ffmpeg died with "Error writing
  // trailer: Stale file handle" on mirinaad.com and the whole render was lost,
  // and gillianwitter.wixsite.com hit the same thing as system error -116.
  //
  // This file has no business being shared anyway. It is one video's finished
  // audio, keyed on that video's exact script, and nothing else will ever ask
  // for it. The per-line clips are what the cache is for and they stay there.
  const joinedDir = path.join(tmpdir(), 'aud-joined');
  await mkdir(joinedDir, { recursive: true }).catch(() => {});
  const outPath = path.join(joinedDir, `${hash(`${voiceKey}:${script}`)}.joined.mp3`);
  await concatAudio(paths, outPath, gaps);

  // After the join, never before: the concat reads them off disk.
  // Held, not deleted. See RETRY_DIR above: a retry inside the window reuses
  // these instead of buying them again, and the sweep clears them after.
  await mkdir(RETRY_DIR, { recursive: true }).catch(() => {});
  for (const f of ephemeral) {
    await rename(f, path.join(RETRY_DIR, path.basename(f))).catch(() => rm(f).catch(() => {}));
  }

  return { audioPath: outPath, cached, chars: script.length, settings, cues };
}

// Joins the segments with a fixed pause between them.
//
// Generating per segment removed the degradation but butted every sentence
// straight against the next one, so it ran on with no breath. The gap is a
// constant, never randomised: two renders of the same script have to be
// identical, and a pause that moves around is the kind of thing that reads as
// a glitch rather than as someone thinking.
//
// 0.7s, in the middle of the half-second to one-second range that sounded
// right. 0.35 was tried first and still ran on.
//
// Done with the concat filter rather than the demuxer because it pads and
// joins in one pass and does not care whether the parts share encoder
// settings. The last segment is not padded; the mux adds the tail.
const SEGMENT_GAP_SEC = 0.7;
// A connector is a lead-in, not a point of its own, so it runs into the line it
// introduces. With the flat gap it got one before it and another after, which
// left "The other thing I noticed." sitting alone between two pauses and read
// as its own paragraph. The pause belongs before it, where one point ends, and
// the words after it are the same breath.
const CONNECTOR_GAP_SEC = 0.12;
const gapAfter = (key) => (String(key).startsWith('connector-') ? CONNECTOR_GAP_SEC : SEGMENT_GAP_SEC);

// `gaps[i]` is the silence added after segment i, and it has to be the same
// figure the cue clock used or the pictures slide against the words.
async function concatAudio(paths, outPath, gaps = []) {
  if (paths.length === 1) {
    await copyFile(paths[0], outPath);
    return;
  }
  const args = ['-y', '-v', 'error'];
  paths.forEach((p) => args.push('-i', p));
  const parts = paths
    .map((_, i) =>
      i === paths.length - 1
        ? `[${i}:a]anull[a${i}];`
        : `[${i}:a]apad=pad_dur=${gaps[i] ?? SEGMENT_GAP_SEC}[a${i}];`)
    .join('');
  const inputs = paths.map((_, i) => `[a${i}]`).join('');
  args.push('-filter_complex', `${parts}${inputs}concat=n=${paths.length}:v=0:a=1[out]`);
  args.push('-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', outPath);

  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg concat exited ${code}: ${err.slice(-300)}`))));
    ff.on('error', reject);
  });
}

