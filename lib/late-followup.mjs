// One last short email for the cohort the mailbox proved was left mid-sequence.
//
// The situation this exists for is specific and already happened: 💚-rated
// prospects (first the Australian batch, then the US one) got Email 1 and
// Email 2 by hand from Gmail in early August, nobody replied, and the
// sequence stopped there. Under the V2 policy
// a P1 prospect may receive up to three cold touches (days 0, 4, 10), so one
// final close is owed — and its day-10 date has already come round.
//
// This module COMPOSES. It never sends, never schedules a send, and never
// touches either automation switch. The draft lands as an ordinary
// READY_FOR_APPROVAL package in Today's approval queue, and everything after
// that is the existing machinery unchanged: Ary approves the sequence, the
// approval fingerprint pins the copy, and a send only ever happens through
// sendApproved with every refusal in canSendNow intact — including the one
// that cancels the follow-up when a reply arrives first.
//
// The strategy rules this enforces, from PROSPECTING-STRATEGY-V2.md:
//   - P1 only. A third touch exists for no other band, so a prospect whose
//     band cannot be established as P1 with confidence is excluded, not guessed.
//   - emails_sent must be exactly 2, agreeing with exactly 2 outbound messages
//     observed in the mailbox. A counter the mailbox disagrees with is an
//     uncertain history, and uncertain histories are excluded.
//   - Any reply of any kind ends cold outreach forever. Checked here, checked
//     at approval, and checked again in the last instant before a send.
//   - Emails 4 and 5 do not exist. The package records allowed_length 3 and
//     the send guard refuses anything past it.

import { effectiveBand, PRIORITY as BAND, allowedTouches } from './priority.mjs';
import { isInternalTest } from './canary.mjs';
import { canProgressOutbound, STOP } from './outbound.mjs';
import { validateFollowup } from './followup-v2.mjs';
import { STATUS } from './outreach.mjs';
import { identity } from './hive-context.mjs';
import { enqueue, KIND, PRIORITY } from './queue.mjs';

// Bumped when the prompt or the validator changes in a way a reviewer could
// notice. Also the marker that counts pilot drafts: every package this module
// writes carries it, so the cap is a COUNT(*) on a column that already exists.
export const LATE_FOLLOWUP_GENERATOR_VERSION = 'late-followup-2026-08.2';

export const LATE_FOLLOWUP_PLAYBOOK = 'late-followup-close';

// The pilot's bounds. At most this many drafts ever exist until somebody
// deliberately lifts the cap, and at most this many are composed per drain so
// a bad prompt is noticed after five emails, not fifty.
export const LATE_FOLLOWUP_PILOT_CAP = 15;
export const LATE_FOLLOWUP_PER_DRAIN = 5;

// The setting that lifts the pilot cap, by name, so lifting it is a decision
// somebody records in workspace settings rather than a code edit. Stored in
// the same 'engine' settings blob everything else reads.
export const LATE_FOLLOWUP_CAP_SETTING = 'lateFollowupPilotCap';

// Nobody whose contact history ended before this date is touched. Ary's
// explicit boundary for this pilot.
export const LATE_FOLLOWUP_WINDOW_START = '2026-08-05';

// The step being written. These prospects had two emails under the old
// strategy; this writes their third. P1 now allows four under V3, so this
// step is well within the ceiling.
export const LATE_FOLLOWUP_STEP = 3;

// The shape, written once, in Ary's own register. The prompt hands it to the
// model and the batch review panel shows it to Ary, so the two can never
// drift into describing different emails. The first cut said "Closing the
// loop", and the model paraphrased that into "circling back" and worse; Ary
// read the drafts and said she does not talk like that. She doesn't.
export const LATE_FOLLOWUP_SHAPE =
  '"Hi [name]. Just one last note about [the specific thing from my earlier emails]. '
  + 'If you ever want help with it, I\'m around. '
  + 'If that\'s already handled, ignore me, I won\'t email you about it again. Thanks, Ary"';

export function lateFollowupPilotCap(settings = {}) {
  const n = Number(settings?.[LATE_FOLLOWUP_CAP_SETTING]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : LATE_FOLLOWUP_PILOT_CAP;
}

// How many compositions this drain may start. Pure, so the arithmetic that
// bounds spend is testable without a database: packages already written and
// jobs already in flight both count against the cap, because each one is a
// composition that exists or is about to.
export function composeBudget({ cap = LATE_FOLLOWUP_PILOT_CAP, existing = 0, inFlight = 0, perDrain = LATE_FOLLOWUP_PER_DRAIN } = {}) {
  const remaining = Math.max(0, Number(cap) - Number(existing) - Number(inFlight));
  const thisDrain = Math.max(0, Number(perDrain) - Number(inFlight));
  return Math.min(remaining, thisDrain);
}

// ── Eligibility ──────────────────────────────────────────────────────────
//
// Two layers on purpose. The SQL selector below applies the cheap row filters
// so a drain costs almost nothing; this function is the authority, re-run by
// the handler at composition time on the live row, because between the
// selector and the worker a reply can land, a rating can change, and the whole
// point of re-checking is that the state that matters is the state now.

const CLOSED_STAGES = new Set(['Client', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished']);
const CONVERSATION_STAGES = new Set(['Interested', 'Proposal Sent', 'Setup Check']);

const PILOT_COUNTRIES = new Set(['AU', 'Australia', 'US', 'USA', 'United States']);

export function eligibleLateFollowup(prospect = {}, { outbound = [], events = null, now = new Date() } = {}) {
  const no = (reason) => ({ ok: false, reason });
  const p = prospect || {};

  if (!p.id) return no('No prospect.');
  if (p.deleted_at) return no('The prospect is deleted.');
  if (isInternalTest(p)) return no('Internal test record. Never part of real outreach.');
  if (!PILOT_COUNTRIES.has(String(p.country || '').trim())) return no('Outside the pilot countries (AU and US).');

  // The boundaries that end cold outreach, asked of the canonical gate so this
  // file cannot grow its own opinion about what a reply means. NOT_DUE is the
  // one stop that does not apply: composing is not sending, and these
  // prospects mostly carry no legacy follow-up date at all.
  const gate = canProgressOutbound(p, { now, events: events?.length ? events : null });
  if (!gate.ok && gate.stop !== STOP.NOT_DUE) return no(gate.reason);

  if (Number(p.replied)) return no('They replied. Cold outreach is over for good.');
  if (Number(p.unsubscribed)) return no('They unsubscribed.');
  if (Number(p.do_not_contact)) return no('Marked do not contact.');
  if (CLOSED_STAGES.has(String(p.stage || ''))) return no(`Stage is ${p.stage}. The relationship is closed to cold outreach.`);
  if (CONVERSATION_STAGES.has(String(p.stage || ''))) return no(`Stage is ${p.stage}. That is a conversation, not a sequence.`);
  if (String(p.reply_type || '') === 'decline') return no('They declined.');
  if (String(p.reply_type || '') === 'defer') return no('They asked for later. Reactivation is a different email.');
  if (!String(p.email || '').trim()) return no('No address to write to.');

  const sent = Number(p.emails_sent);
  if (sent !== 2) {
    return no(sent >= 3
      ? `${sent} emails already sent. Anything past that is a manual override, never this.`
      : `${Number.isFinite(sent) ? sent : 0} emails sent, and this exists only for the two-sent cohort.`);
  }

  if (String(p.last_contact_date || '').slice(0, 10) < LATE_FOLLOWUP_WINDOW_START) {
    return no(`Last contacted before ${LATE_FOLLOWUP_WINDOW_START}, which is outside this pilot.`);
  }

  // The band, from the one helper that owns it. Only a confident,
  // non-provisional P1 allows a third touch; a provisional band means nobody
  // has rated them, and a third email is not sent on a guess.
  const band = effectiveBand(p);
  if (band.band !== BAND.P1 || band.provisional) {
    return no(band.provisional
      ? 'The band is provisional, so a third touch is not confidently allowed. Excluded rather than guessed.'
      : `Band is ${band.band || 'none'}, which does not allow a third touch.`);
  }
  if (allowedTouches(band.band) < LATE_FOLLOWUP_STEP) {
    return no(`${band.band} allows ${allowedTouches(band.band)} touches, so there is no email ${LATE_FOLLOWUP_STEP}.`);
  }

  // The mailbox's account of what actually went out has to agree with the
  // counter exactly. Two observed sends, each with the provider's own message
  // and thread ids, each to the address on the record, the latest inside the
  // pilot window. Anything else is a history too uncertain to write into.
  const obs = (outbound || []).filter((r) => r && r.direction === 'outbound');
  if (obs.length !== 2) {
    return no(`The mailbox shows ${obs.length} outbound message${obs.length === 1 ? '' : 's'} and the counter says 2. Histories that disagree are excluded.`);
  }
  const ordered = [...obs].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  for (const [i, r] of ordered.entries()) {
    if (!String(r.message_id || '').trim()) return no(`Observed email ${i + 1} has no Gmail message id, so its identity cannot be pinned.`);
    if (!String(r.thread_id || '').trim()) return no(`Observed email ${i + 1} has no Gmail thread, so there is nothing to reply into.`);
    const to = String(r.to_address || '').trim().toLowerCase();
    if (to && to !== String(p.email).trim().toLowerCase()) {
      return no('The observed sends went to a different address than the record holds now. The thread belongs to the old address.');
    }
  }
  if (String(ordered[1].occurred_at || '').slice(0, 10) < LATE_FOLLOWUP_WINDOW_START) {
    return no(`The last observed send predates ${LATE_FOLLOWUP_WINDOW_START}.`);
  }

  return { ok: true, outbound: ordered, band: band.band };
}

// ── The selector, run on the five-minute drain ───────────────────────────
//
// Cheap by construction: pure SQL row filters, a cap check that is one COUNT,
// and nothing paid. The deep checks — the mailbox agreement, the live band,
// the reply gate — belong to the handler, which re-asks everything at
// composition time.

const SELECTOR_WHERE = `
      p.deleted_at IS NULL
  AND p.country IN ('AU','Australia','US','USA','United States')
  AND COALESCE(p.replied, 0) = 0
  AND COALESCE(p.do_not_contact, 0) = 0
  AND COALESCE(p.unsubscribed, 0) = 0
  AND p.emails_sent = 2
  AND p.last_contact_date >= '${LATE_FOLLOWUP_WINDOW_START}'
  AND COALESCE(p.rating, '') = '💚'
  AND COALESCE(p.stage, '') NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished','Interested','Proposal Sent','Setup Check')
  AND COALESCE(p.reply_type, '') NOT IN ('decline','defer')
  AND lower(COALESCE(p.source, '')) != 'canary'
  AND lower(COALESCE(p.domain, '')) != 'example.invalid'
  AND NOT EXISTS (
        SELECT 1 FROM outreach_packages k
         WHERE k.workspace = p.workspace AND k.prospect_id = p.id
           AND k.status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')
      )
  AND NOT EXISTS (
        -- One composition per prospect, ever. A pilot draft Ary discarded is a
        -- decision about that prospect, not an invitation to write another;
        -- without this, skipping a draft would free the live slot and the next
        -- drain would spend money recreating the thing she just declined.
        SELECT 1 FROM outreach_packages k2
         WHERE k2.workspace = p.workspace AND k2.prospect_id = p.id
           AND k2.generator_version = '${LATE_FOLLOWUP_GENERATOR_VERSION}'
      )`;

export async function pilotDraftCount(db, workspace) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM outreach_packages WHERE workspace = ? AND generator_version = ?`)
    .bind(workspace, LATE_FOLLOWUP_GENERATOR_VERSION)
    .first()
    .catch(() => null);
  return Number(row?.n) || 0;
}

// Finds due prospects and enqueues composition jobs, inside the caps.
// Called from the drain the way the sent-mail observer is: bounded, cheap when
// there is nothing to do, and silent about workspaces with no cohort.
export async function enqueueLateFollowups(db, { loadSettings = null, now = new Date() } = {}) {
  const out = { queued: 0, considered: 0, capReached: [], workspaces: {} };

  // Which workspaces even have candidates. One grouped query; a workspace
  // without this cohort costs a scan of an index and nothing else.
  const { results: spaces } = await db
    .prepare(`SELECT p.workspace, COUNT(*) AS n FROM prospects p WHERE ${SELECTOR_WHERE} GROUP BY p.workspace`)
    .all()
    .catch(() => ({ results: [] }));

  for (const s of spaces || []) {
    const ws = s.workspace;
    out.considered += Number(s.n) || 0;

    const settings = loadSettings ? await loadSettings(db, ws).catch(() => ({})) : {};
    const cap = lateFollowupPilotCap(settings);
    const existing = await pilotDraftCount(db, ws);

    // Compositions already on their way count against both caps, or fifteen
    // packages plus five in-flight jobs would make twenty.
    const inflightRow = await db
      .prepare(`SELECT COUNT(*) AS n FROM jobs WHERE workspace = ? AND kind = ? AND status IN ('queued','running','waiting')`)
      .bind(ws, KIND.LATE_FOLLOWUP)
      .first()
      .catch(() => null);
    const inFlight = Number(inflightRow?.n) || 0;

    const budget = composeBudget({ cap, existing, inFlight });
    out.workspaces[ws] = { cap, existing, inFlight, budget };
    if (budget <= 0) {
      if (existing + inFlight >= cap) out.capReached.push(ws);
      continue;
    }

    // Oldest last-contact first, so whoever has waited longest is written
    // first.
    //
    // Anyone whose composition job finished recently rests half a day rather
    // than being retried every five minutes. 'done' matters as much as
    // 'failed' here: the handler answers "not eligible" as a clean completion
    // — the mailbox disagreeing with the counter, for instance — and without
    // this clause those prospects would be re-enqueued on every drain forever,
    // each time consuming a slot the cap meant for a real composition. A job
    // that actually composed leaves a package, which the package clause above
    // already excludes for good, so this only paces the refusals.
    const { results: due } = await db
      .prepare(
        `SELECT p.id FROM prospects p
          WHERE p.workspace = ? AND ${SELECTOR_WHERE}
            AND NOT EXISTS (
                  SELECT 1 FROM jobs j
                   WHERE j.workspace = p.workspace AND j.kind = ? AND j.prospect_id = p.id
                     AND j.status IN ('failed', 'done')
                     AND datetime(j.updated_at) > datetime('now', '-12 hours')
                )
          ORDER BY p.last_contact_date ASC, p.id ASC
          LIMIT ?`
      )
      .bind(ws, KIND.LATE_FOLLOWUP, budget)
      .all()
      .catch(() => ({ results: [] }));

    for (const r of due || []) {
      const q = await enqueue(db, {
        workspace: ws, kind: KIND.LATE_FOLLOWUP, prospectId: r.id, priority: PRIORITY.LATE_FOLLOWUP,
      });
      if (q.queued) out.queued += 1;
    }
  }

  return out;
}

// ── The prompt ───────────────────────────────────────────────────────────
//
// The REPLY_SYSTEM register — plain, warm, short, no exclamation marks, no em
// dashes, closes "Thanks, Ary" — applied to the one email that register was
// never written for: a final note on a thread nobody answered. The model is
// handed both sent emails verbatim and asked for forty words that name the
// original observation without repeating or re-pitching it.

export function buildLateFollowupParts(settings = {}, prospect = {}, { email1 = {}, email2 = {} } = {}) {
  const ws = identity(settings || {});

  const system = [
    `You write one short final follow-up email for ${ws.who}.`,
    '',
    'Two cold emails have already gone to this person and they have not replied.',
    'This is the third and last email they will ever receive about it. One short, plain last note.',
    '',
    'The shape, which Ary approved. Follow it, grounded in the real emails below, never copied word for word:',
    LATE_FOLLOWUP_SHAPE,
    '',
    'The rules, and they are rules:',
    '- Name the specific thing the first email noticed, in a few plain words. It must come from the emails below and nowhere else.',
    '- Do not repeat the observation in detail, do not restate the pitch, and do not argue the case again. They read it.',
    '- Do not add a new observation, a new offer, a link, an attachment, a price, or a meeting request.',
    '- Include an escape hatch in Ary\'s manner, like "if that\'s already handled, ignore me".',
    '- Make clear this is the last note about it, without pressure. No "last chance", no urgency, no guilt.',
    '- 30 to 60 words. Two or three sentences.',
    '- Open with "Hi [their first name]." and go straight in.',
    '- Plain English, warm, like a person, not a company.',
    '- Never "closing the loop", "circling back", "touching base", "bumping this", "final follow-up", "on your radar", or anything in that family. Ary does not talk like that. She says "one last note about", "help with it", "I\'m around".',
    '- No exclamation marks. No em dashes. No semicolons. No emojis. No numbered lists.',
    '- Her verbs: fix, clean up, set up, check, follow up. Never: streamline, elevate, optimize, unlock, empower.',
    '- Never claim anything is broken, losing them business, or costing them enquiries. Nothing measured that.',
    '- Never mention other businesses, industries, statistics, or what "most" people do.',
    '',
    'Output only the email body. No subject line, no preamble, no quotes around it.',
    '',
    'END WITH EXACTLY:',
    'Thanks,',
    'Ary',
  ].join('\n');

  const user = [
    `Their name: ${prospect.name || 'there'}`,
    prospect.business_name && prospect.business_name !== prospect.name ? `Business: ${prospect.business_name}` : null,
    '',
    'EMAIL 1, as it was sent:',
    email1.subject ? `Subject: ${email1.subject}` : null,
    email1.body || '(body not available)',
    '',
    'EMAIL 2, as it was sent:',
    email2.subject ? `Subject: ${email2.subject}` : null,
    email2.body || '(body not available)',
    '',
    'Write the final follow-up now.',
  ].filter((x) => x !== null).join('\n');

  return { system, user };
}

// The model was asked for a bare body, so parsing is mostly refusing wrappers.
export function parseLateFollowup(text) {
  let body = String(text || '').trim();
  // A model that quotes its own answer anyway.
  body = body.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  body = body.replace(/^SUBJECT:.*\n+/i, '').replace(/^BODY:\s*\n?/i, '').trim();
  if (!body) return { ok: false, reason: 'The draft came back empty.' };
  return { ok: true, body };
}

// ── Validation ───────────────────────────────────────────────────────────
//
// The shared V2 follow-up validator carries most of the weight: word bounds,
// the never-write list, unsupported claims, industry and third-party claims,
// asset promises the first email never made, the greeting-name guard, and the
// two checks that matter most here — the draft must share real words with
// Email 1 (it references the original observation) and must not simply be
// Email 1 again. This adds the register rules the final note owes on top.

export const LATE_REJECT = {
  EM_DASH: 'EM_DASH',
  EXCLAMATION: 'EXCLAMATION',
  SEMICOLON: 'SEMICOLON',
  NO_SIGN_OFF: 'NO_SIGN_OFF',
  NO_ESCAPE_HATCH: 'NO_ESCAPE_HATCH',
  LINK: 'LINK',
  CORPORATE: 'CORPORATE',
};

// The register Ary rejected by name, plus its nearest siblings. The shared
// never-write list catches "circling back" and "bumping this"; these are the
// synonyms the first pilot's drafts actually reached for.
const CORPORATE_PHRASES = /clos(?:e|ing) the loop|circl\w* back|touch(?:ing|es|ed)? base|on your radar|per my (?:last|previous)/i;

const ESCAPE_HATCH = [
  /ignore (me|this|it)/i,
  /no need to (reply|respond|answer|write back)/i,
  /last (you'?ll|you will) hear/i,
  /won'?t (email|write|message|bother|chase)/i,
  /leave (it|you) (there|be|alone|in peace)/i,
  /already (handled|sorted|covered|taken care of|looked after)/i,
  /if not[,.]? (that'?s|this is)/i,
];

export function validateLateFollowup(body, { prospect = {}, email1 = {} } = {}) {
  const text = String(body || '');
  const problems = [];

  // Everything the V2 follow-up validator enforces, at step 3 of a ceiling of
  // 3, against the real Email 1. canPersonalise false: this note stands on the
  // sent emails alone, never on site evidence.
  const shared = validateFollowup({ subject: '', body: text }, {
    prospect,
    step: LATE_FOLLOWUP_STEP,
    ceiling: allowedTouches(BAND.P1),
    firstEmail: { subject: email1.subject || '', body: email1.body || '' },
    eligible: true,
    canPersonalise: false,
  });
  problems.push(...shared.problems);

  {
    const m = text.match(CORPORATE_PHRASES);
    if (m) problems.push({ code: LATE_REJECT.CORPORATE, why: `"${m[0]}" is corporate speak Ary never uses.` });
  }
  if (/[—–]/.test(text)) problems.push({ code: LATE_REJECT.EM_DASH, why: 'It uses an em dash, which Ary never does.' });
  if (/!/.test(text)) problems.push({ code: LATE_REJECT.EXCLAMATION, why: 'It uses an exclamation mark.' });
  if (/;/.test(text)) problems.push({ code: LATE_REJECT.SEMICOLON, why: 'It uses a semicolon.' });
  if (/https?:\/\/|www\./i.test(text)) problems.push({ code: LATE_REJECT.LINK, why: 'It adds a link, and a final note offers nothing new.' });
  if (!/thanks,\s*\n\s*ary\s*$/i.test(text.trim())) {
    problems.push({ code: LATE_REJECT.NO_SIGN_OFF, why: 'It does not end with "Thanks, Ary" on its own lines.' });
  }
  if (!ESCAPE_HATCH.some((re) => re.test(text))) {
    problems.push({ code: LATE_REJECT.NO_ESCAPE_HATCH, why: 'It has no escape hatch. The reader must be told it is fine to do nothing.' });
  }

  return { ok: problems.length === 0, problems, words: shared.words };
}

// ── The package ──────────────────────────────────────────────────────────
//
// The canonical shape, not a parallel one. Email 1 and Email 2 are the real
// sent copy, verbatim from the mailbox, so the approval screen shows the whole
// sequence honestly and reconcileForApproval finds every step of the P1
// ceiling present. Only Email 3 is new, and only Email 3 can ever leave: the
// recorded sends make nextColdStep answer 3, and the send guard refuses
// anything the schedule does not say is due.
export function lateFollowupPackageFields(prospect = {}, { email1 = {}, email2 = {}, draft = '', model = null } = {}) {
  const firstDay = String(email1.at || '').slice(0, 10);
  return {
    status: STATUS.READY,
    statusReason: 'Final follow-up drafted. Emails 1 and 2 below are the ones Gmail already sent; only Email 3 is new, and approving the sequence is what allows it to be sent.',
    playbook: LATE_FOLLOWUP_PLAYBOOK,
    whyContact: `Two notes${firstDay ? ` since ${firstDay}` : ''} went unanswered. P1 allows one final touch, and its day-10 date has come round.`,
    contactEmail: String(prospect.email || '').trim(),
    contactSource: 'observed-outbound',
    emailSubject: String(email1.subject || ''),
    emailBody: String(email1.body || ''),
    followups: [
      { step: 2, subject: String(email2.subject || ''), body: String(email2.body || ''), approved: true },
      { step: LATE_FOLLOWUP_STEP, subject: String(email1.subject || ''), body: String(draft || ''), approved: true },
    ],
    allowedLength: allowedTouches(BAND.P1),
    priorityBand: BAND.P1,
    bandWasProvisional: 0,
    generatorVersion: LATE_FOLLOWUP_GENERATOR_VERSION,
    model: model || null,
  };
}
