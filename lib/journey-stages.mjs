// The journey: five places a prospect can be, in the order Ary thinks.
//
// The old surface answered app questions — which lens, which bucket, which
// stage string — and Ary's verdict was "I can't use it at all". The journey
// answers her question: where is this person in the relationship? Nobody has
// looked at them yet; work is staged and waiting on me; they are mid-sequence;
// they are talking to me; they pay me. Every non-deleted prospect is in
// exactly one of those places, and a test counts it.
//
// This module is the whole description, in the shape lib/today-tabs.mjs
// proved out: the definition list, the priority order, the opening-tab rule,
// the classifier, and the partition. The component reads it; it does not
// carry its own idea of any of it.
//
// The second half of the design is the accounting model. A tab never hides a
// row silently: journeyPartition() returns, per stage, the rows worth showing
// AND every group it chose not to show, each with a name and a count, and
// shown + hidden always sums to the stage total. The day this file was
// designed, Ary was looking at "3 due" with no way to learn that 26 more were
// between days and 14 were hidden by a counter bug. A count that cannot
// explain itself is the bug this file exists to end.

import { CLOSED_STAGES, videoOwed } from './today.mjs';
import { coldSequenceExhausted } from './sequence-ceiling.mjs';
import { isDueProspect, daysUntilDue } from './due.mjs';

export const JOURNEY_TABS = [
  {
    id: 'unprocessed',
    label: 'Unprocessed',
    question: 'Who has nobody looked at yet?',
    blurb: 'Raw rows. Say prescreen in Cowork and this pile shrinks.',
    empty: 'Everyone has been looked at.',
  },
  {
    id: 'ready',
    label: 'Ready',
    question: 'What is staged and waiting on you?',
    blurb: 'Sequences to approve, videos to record, recordings to send. Nothing here leaves without you.',
    empty: 'Nothing is staged. Say start prospecting to fill this.',
  },
  {
    id: 'following',
    label: 'Following up',
    question: 'Who is mid-sequence, and what goes next?',
    blurb: 'People in a cold sequence. Each row says which email is next and when.',
    empty: 'Nobody is mid-sequence.',
  },
  {
    id: 'warm',
    label: 'Warm',
    question: 'Who is talking to you?',
    blurb: 'Real replies. The close move is the proposal PDF.',
    empty: 'Nobody is waiting on you.',
  },
  {
    id: 'clients',
    label: 'Clients',
    question: 'Who pays you, and is their setup done?',
    blurb: 'Won. Onboarding lives here.',
    empty: 'No clients yet in this view.',
  },
];

// A person talking to you outranks staged work; staged work outranks the
// sequence machine; raw rows outrank the finished business.
export const JOURNEY_PRIORITY = ['warm', 'ready', 'following', 'unprocessed', 'clients'];

// The tab choice survives a refresh, not a new session — same reasoning as
// TODAY_TAB_KEY. The region choice (lib/regions.mjs) is deliberately the
// opposite: which half of the world you work is a standing fact.
export const JOURNEY_TAB_KEY = 'ltb_journey_tab_v1';

const ID = new Set(JOURNEY_TABS.map((t) => t.id));
export const isJourneyTab = (id) => ID.has(id);

export function openingJourneyTab(counts = {}, remembered = null) {
  if (remembered && ID.has(remembered)) return remembered;
  for (const id of JOURNEY_PRIORITY) {
    if ((counts[id] || 0) > 0) return id;
  }
  return JOURNEY_PRIORITY[0];
}

// ── The classifier ────────────────────────────────────────────────────────
//
// First match wins, and the order is the meaning:
//
//   clients    the clients table says so, or the row claims it. The clients
//              table is the authority (the stage string drifts — Good Energy
//              Coach spent a month as a client with a row reading
//              Interested); a row claiming Client without a card still lands
//              here, as the drift group, so the claim and the card are
//              reconciled in one place instead of a client leaking into Warm.
//   warm       reply evidence exists. Closed conversations count — a no is
//              still a conversation that happened, and it lands in the
//              declined group rather than vanishing.
//   following  at least one cold email went and nobody has written back.
//   ready      nothing sent yet, but staged work exists: a live package, a
//              stored sequence, a video owed or a recording earned.
//   unprocessed  everything else.
//
// ctx:
//   clientIds       Set of prospect ids with a clients-table card
//   livePackageIds  Set of prospect ids with a live outreach package
//                   (PREPARING / READY_FOR_APPROVAL / NEEDS_DECISION /
//                   APPROVED) — from /api/journey/context
export function journeyStage(p = {}, ctx = {}) {
  const clientIds = ctx.clientIds || EMPTY_SET;
  const livePackageIds = ctx.livePackageIds || EMPTY_SET;

  if (clientIds.has(p.id) || p.first_client_at || String(p.stage || '') === 'Client') return 'clients';

  if (hasReplyEvidence(p)) return 'warm';

  if ((Number(p.emails_sent) || 0) >= 1) return 'following';

  if (stagedWorkExists(p, livePackageIds)) return 'ready';

  return 'unprocessed';
}

const EMPTY_SET = new Set();

const WARM_STAGES = new Set(['Replied', 'Interested', 'Setup Check', 'Proposal Sent', 'Engaged', 'Rekindled']);

function hasReplyEvidence(p) {
  if (p.replied) return true;
  if (p.reply_type) return true;
  // Engaged/Rekindled without a reply flag are still a live thread of some
  // kind; a stage that only exists because somebody responded counts.
  const stage = String(p.stage || '');
  if (WARM_STAGES.has(stage) && (Number(p.emails_sent) || 0) >= 1) return true;
  return false;
}

const DEAD_RATINGS = new Set(['✖️', '🥀']);

function stagedWorkExists(p, livePackageIds) {
  if (DEAD_RATINGS.has(String(p.rating || ''))) return false;
  if (livePackageIds.has(p.id)) return true;
  if (hasStoredSequence(p)) return true;
  if (videoOwed(p)) return true;
  if (recordingEarned(p)) return true;
  return false;
}

export function hasStoredSequence(p) {
  const raw = p.email_sequence;
  if (!raw) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') return raw.trim().length > 2; // "[]" is not a sequence
  return false;
}

// The recording worklist: the audit earned a video and nobody has recorded
// it. SEND is a confirmed earn; MAYBE means look before recording.
export function recordingEarned(p) {
  const tier = String(p.video_tier || '');
  if (tier !== 'SEND' && tier !== 'MAYBE') return false;
  if (p.video_url) return false;
  if (String(p.rating || '') === '✖️') return false;
  return true;
}

// ── The partition ─────────────────────────────────────────────────────────
//
// Per stage: what to show, and every group deliberately not shown, named and
// counted. shown.length + Σ hidden[].count === total, always — the test
// walks it. Hidden groups with a count of zero are dropped.
//
// Group keys are stable identifiers; labels are sentences for the strip:
// "Not shown: 214 — 180 finished without a reply · 20 waiting on a date".

const UPCOMING_DAYS = 7;

export function journeyPartition(prospects = [], ctx = {}) {
  const stages = {};
  for (const t of JOURNEY_TABS) stages[t.id] = { shown: [], hidden: new Map(), total: 0 };

  const hide = (stageId, key, label, p) => {
    const g = stages[stageId].hidden;
    if (!g.has(key)) g.set(key, { key, label, count: 0, rows: [] });
    const entry = g.get(key);
    entry.count += 1;
    entry.rows.push(p);
  };

  for (const p of prospects) {
    if (!p || p.deleted_at) continue;
    const stageId = journeyStage(p, ctx);
    const s = stages[stageId];
    s.total += 1;

    if (stageId === 'clients') {
      const carded = (ctx.clientIds || EMPTY_SET).has(p.id) || Boolean(p.first_client_at);
      if (carded) s.shown.push(p);
      else hide('clients', 'drift', 'say Client but have no client card', p);
      continue;
    }

    if (stageId === 'warm') {
      const rt = String(p.reply_type || '');
      const stage = String(p.stage || '');
      if (rt === 'decline' || stage === 'Rejected' || stage === 'Lost' || p.do_not_contact || p.unsubscribed) {
        hide('warm', 'declined', 'said no, or asked to be left alone', p);
      } else if (stage === 'Not This Offer') {
        hide('warm', 'resting', 'no to this offer, relationship open', p);
      } else if (rt === 'defer' || stage === 'Snoozed') {
        // A deferral whose date has arrived is today's work; one still in the
        // future is parked and says so.
        const d = daysUntilDue(p);
        if (d != null && d <= 0) s.shown.push(p);
        else hide('warm', 'deferred', 'deferred to a later date', p);
      } else {
        s.shown.push(p);
      }
      continue;
    }

    if (stageId === 'following') {
      const stage = String(p.stage || '');
      if (stage === 'Invalid Email') {
        hide('following', 'bounced', 'address bounced, needs a fix first', p);
      } else if (stage === 'Finished' || coldSequenceExhausted(p)) {
        hide('following', 'finished', 'finished their sequence without a reply', p);
      } else if (CLOSED_STAGES.has(stage)) {
        hide('following', 'closed', 'closed for another reason', p);
      } else if (isDueProspect(p)) {
        s.shown.push(p);
      } else {
        const d = daysUntilDue(p);
        if (d != null && d > 0 && d <= UPCOMING_DAYS) s.shown.push(p);
        else if (d != null && d > UPCOMING_DAYS) hide('following', 'waiting', 'waiting until later this month', p);
        else hide('following', 'timing-unknown', 'timing unknown, worth a review', p);
      }
      continue;
    }

    if (stageId === 'ready') {
      // Everything staged is worth seeing; the sections inside the tab do
      // the grouping (approvals, to record, recorded-not-sent).
      s.shown.push(p);
      continue;
    }

    // unprocessed
    const rating = String(p.rating || '');
    if (DEAD_RATINGS.has(rating)) hide('unprocessed', 'ruled-out', 'ruled out (dead site or skip)', p);
    else if (!p.email && !p.domain) hide('unprocessed', 'no-address', 'have no email or website to work with', p);
    else s.shown.push(p);
  }

  const out = { stages: {}, counts: {} };
  for (const t of JOURNEY_TABS) {
    const s = stages[t.id];
    out.stages[t.id] = { shown: s.shown, hidden: [...s.hidden.values()], total: s.total };
    // The tab's number is what needs eyes, not the stage population — the
    // accounting line carries the rest. Warm's count is people waiting on
    // you; Following's is due or imminent; Unprocessed's is workable rows.
    out.counts[t.id] = s.shown.length;
  }
  return out;
}

// The strip under a tab: "Not shown: 214 — 180 finished without a reply ·
// 20 waiting on a date". Returns null when nothing is hidden.
export function hiddenSummary(stage) {
  const hidden = stage?.hidden || [];
  const total = hidden.reduce((n, g) => n + g.count, 0);
  if (!total) return null;
  return {
    total,
    parts: hidden.map((g) => ({ key: g.key, text: `${g.count.toLocaleString()} ${g.label}` })),
  };
}
