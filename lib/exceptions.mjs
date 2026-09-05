// What Today shows once the machine is doing the routine work.
//
// The old Today listed work. This lists exceptions: the things automation
// cannot safely finish. Routine background progress does not appear at all,
// because a list that reports the machine doing its job is a list nobody reads.
//
// One prospect, one row. Several reasons can apply at once — somebody who
// replied yesterday and also watched the video — and showing them twice makes
// a queue of nine feel like a queue of fourteen. The strongest reason decides
// where they sit; the rest become a second line.

import { replyExcerpt, isRealReply, isBareAcknowledgment } from './reply-excerpt.mjs';

// Replies that close a thread rather than open one. Each is a complete
// message: it tells us where we stand and asks nothing. They still belong to
// the prospect's history and still stop cold outreach — they simply are not
// somebody waiting on an answer, which is the only thing Replies claims.
const TERMINAL_REPLY = new Set([
  'decline', 'not-now', 'unsubscribe', 'out-of-office', 'bounce', 'wrong-person',
]);
import { canProgressOutbound, isReadyToReconsider, STOP } from './outbound.mjs';
import { currentState, REL } from './relationship.mjs';
import { lastVideoView, videoSeen } from './watch-url.mjs';
import { evidenceStrength, collectEvidence } from './evidence.mjs';

export const BUCKET = {
  NEEDS_REPLY: 'needs-reply',
  NEEDS_DECISION: 'needs-decision',
  READY_FOR_APPROVAL: 'ready-for-approval',
  // Drafts written before Strategy V2, in the old copy-and-paste-into-Gmail
  // way. They used to land in READY_FOR_APPROVAL, which put two different
  // systems in one pile and left Ary guessing which card belonged to which.
  LEGACY_DRAFT: 'legacy-draft',
  RESURFACED: 'resurfaced',
  BLOCKED: 'automation-blocked',
  ENGAGEMENT: 'engagement',
};

// Rank, highest first. A person waiting on an answer beats everything: the
// video-watch pile used to sit at the top of Today, and a watch is a signal
// while a reply is a person.
export const BUCKET_RANK = {
  [BUCKET.NEEDS_REPLY]: 100,
  [BUCKET.NEEDS_DECISION]: 80,
  [BUCKET.READY_FOR_APPROVAL]: 60,
  [BUCKET.RESURFACED]: 50,
  // Below everything current. It is old work, and it should read as old work.
  [BUCKET.LEGACY_DRAFT]: 5,
  [BUCKET.BLOCKED]: 40,
  [BUCKET.ENGAGEMENT]: 30,
};

export const BUCKET_LABEL = {
  [BUCKET.NEEDS_REPLY]: 'Needs your reply',
  [BUCKET.NEEDS_DECISION]: 'Needs your decision',
  [BUCKET.READY_FOR_APPROVAL]: 'Ready for approval',
  [BUCKET.LEGACY_DRAFT]: 'Old drafts',
  [BUCKET.RESURFACED]: 'Ready to reconsider',
  [BUCKET.BLOCKED]: 'Automation stopped',
  [BUCKET.ENGAGEMENT]: 'Worth a look',
};

const hours = (iso, now) => (iso ? (now.getTime() - Date.parse(iso)) / 3600000 : null);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'} ago`;

export function ago(iso, now = new Date()) {
  const h = hours(iso, now);
  if (h == null || !Number.isFinite(h)) return '';
  if (h < 1) return plural(Math.max(1, Math.round(h * 60)), 'minute');
  if (h < 24) return plural(Math.round(h), 'hour');
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : plural(d, 'day');
}

// Everything true about one prospect, strongest first. `replies` is that
// prospect's reply_events; `job` is any waiting queue row for them.
export function reasonsFor(p, opts = {}) {
  return reasonsAndStanding(p, opts).reasons;
}

// The reasons, and where the two of them stand, from one pass.
//
// Kept together because the standing is what decides whether a reply is owed,
// and the row needs it too: a wait with no date is the one exception the card
// can actually resolve, and it cannot offer that without knowing it is one.
export function reasonsAndStanding(p, { now = new Date(), replies = [], job = null, relationshipEvents = [], isClientRow = false } = {}) {
  const out = [];
  const inbound = replies
    .filter((r) => r.direction === 'inbound')
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

  // The newest message they actually WROTE to us, not simply the newest thing
  // that arrived from their address.
  //
  // Taking inbound[0] blindly loses people. Good Energy Coach replied "Thank
  // you!" and is marked interested — and then her company's marketing list
  // mailed the same address three times. Judged on the newest arrival she is a
  // newsletter and drops off Today entirely, taking a real interested reply
  // with her. Judged on the newest real reply she stays, correctly.
  //
  // The blast is still kept in `inbound` so history and the conversation view
  // remain complete. It just does not get to speak for her.
  const latest = inbound.find(isRealReply) || inbound[0] || null;
  const gate = canProgressOutbound(p, { now, events: replies.length ? replies : null, isClient: isClientRow });

  // Where the two of them actually stand. Asked, never decided here.
  const standing = currentState({
    events: relationshipEvents,
    doNotContact: Boolean(p.do_not_contact),
    unsubscribed: Boolean(p.unsubscribed),
    // Client status, from the clients table first.
    //
    // This read the prospect row alone. Good Energy Coach has been a client
    // since 2026-07-17 and her prospect row still said Interested, so Today
    // treated a client as a cold prospect: her client-work threads ("Little
    // Black Dress campaign quote") were counted as prospecting, and she
    // carried emails_sent = 12 because of it.
    //
    // Two records, one of which can drift, and the safety check was reading
    // the one that drifted. Membership of the clients table is the fact. The
    // prospect fields stay as a denormalised convenience, but they no longer
    // get to be the only thing standing between a client and cold outreach.
    isClient: isClientRow || String(p.stage || '') === 'Client' || Boolean(p.first_client_at),
    legacyStage: p.stage,
    legacyDeferUntil: p.deferred_until || p.next_action_date || null,
    now,
  });

  // A message somebody flagged for a human, still unanswered. That is a fact
  // about a specific message and it outranks any older reading of the
  // relationship — the classifier looked at this one and asked for a person.
  // ...but only when it is a reply to us at all. A prospect's own marketing
  // list mails the same address, arrives from a domain we know, matches on
  // that domain, and gets flagged for a human like anything else. Three such
  // broadcasts are in the queue right now, one of them opening "Hey Audit" —
  // the name the address signed up under. Nobody owes a newsletter an answer.
  // The one question: is there a message from them, to us, still open?
  //
  // This lived inside `flagged` and was therefore bypassable. A reply that was
  // already answered, or that asked nothing, or that was a newsletter, still
  // reached Replies through the date-column route below, because that route
  // only asked "did they reply and has nothing gone back". Terminal classes
  // and thank-yous satisfy that trivially.
  //
  // One predicate now, consulted by both routes.
  const awaitingAnswer = Boolean(
    latest && !latest.answered_at && isRealReply(latest)
    // ...and only when the message actually asks for something. "I'll keep you
    // in mind if I decide to look into that down the track" is a complete
    // thought, not an open question, and Pablo sat in Replies for six days
    // waiting for an answer he had not asked for. A tab that says "people who
    // wrote back and are waiting on you" has to mean it, or Ary has to read
    // every row to find out which ones are true.
    && !TERMINAL_REPLY.has(latest.classification)
    // A thank-you is the end of an exchange, not a question in it.
    && !isBareAcknowledgment(replyExcerpt(latest.snippet))
  );

  // Somebody looked at this specific message and asked for a person.
  const flagged = awaitingAnswer && Boolean(latest.requires_human);

  // The other route in is the date columns: they replied, and nothing has gone
  // back. True, and not the same claim. It says a reply exists, not that one is
  // owed — a deferral three weeks out and a "no to this offer" both satisfy it,
  // and both were being drawn on Today as people waiting to hear back.
  //
  // So where there is no flagged message, the relationship model decides. An
  // unread reply (no state at all) still counts: nobody has read it yet.
  const dateOnly = gate.stop === STOP.UNANSWERED_REPLY && !flagged;

  // `unread` used to be "the row says replied and nobody has read it", which
  // on this database is twenty-odd records from before the Gmail sync existed:
  // replied = 1, a reply date, and no message anywhere. They drew as people
  // waiting on Ary for ever, and the only honest thing the row could print was
  // "Reply text not synced yet" — twenty times, above the three people who
  // actually wrote.
  //
  // A reply nobody can produce is not work. It is a historical flag. So the
  // claim now needs a message behind it; without one the prospect keeps its
  // history and simply stops being today's business.
  // Only the `unread` route is tightened. `standing.needsPerson` is a real
  // reading of the relationship — a dateless deferral still needs a date, and
  // that is work whether or not a message survives — so it keeps its row.
  const unread = !standing.state && Boolean(p.replied) && Boolean(latest);
  // Replies needs a message, not a flag.
  //
  // Sixteen of the seventeen rows in Replies were prospects carrying
  // replied = 1 and reply_type = 'interested', set by hand months ago, with
  // nothing in Gmail behind them. The tab claims "people who wrote back and
  // are waiting on you" and could not produce a word any of them wrote.
  //
  // The relationship reading (`needsPerson`) is still what decides WHETHER a
  // response is owed. It just no longer gets to assert that somebody wrote
  // when no message exists. A dateless deferral is unaffected: it returns
  // above this, as a Decision, before `owed` is consulted.
  const owed = awaitingAnswer && (flagged || (dateOnly && (standing.needsPerson || unread)));

  // A "later" with no date is a DECISION, not a reply.
  //
  // Twenty of the twenty-two rows in Replies were this. Ary owes these people
  // nothing — she owes the record a date — and the row already carries the
  // resolver that sets one. Sitting in Replies they made a tab that means
  // "people are waiting on you" mostly false, which cost her the ability to
  // trust any of it.
  //
  // Checked before `owed` so it wins: the same prospect satisfies both, and
  // the deferral is the more specific truth.
  const datelessDeferral = standing.state === REL.DEFERRED && !standing.deferredUntil;

  if (datelessDeferral) {
    out.push({
      bucket: BUCKET.NEEDS_DECISION,
      headline: 'Waiting on a date',
      // Not "Reply text not synced yet". On this row that line is simply
      // false: there is no missing reply, there is a missing date.
      detail: 'They asked for later, but no date was recorded.',
      quote: false,
      at: p.last_contact_date || latest?.occurred_at || null,
    });
  } else if (owed) {
    const excerpt = replyExcerpt(latest?.snippet);
    const label = latest?.classification && latest.classification !== 'unknown'
      ? `Replied ${latest.classification.replace('-', ' ')}`
      : 'Replied';
    out.push({
      bucket: BUCKET.NEEDS_REPLY,
      headline: `${label} ${ago(latest?.occurred_at, now)}`.trim(),
      // What they said, which is the only thing on this row Ary cannot
      // already guess. The subject line used to sit here — "Re: <our own
      // subject>", our words quoted back at us, on every row.
      //
      // An old record with no stored text says so rather than showing an
      // empty quote. A blank pair of quotation marks reads as "they sent
      // nothing", and that is a claim the record cannot support.
      // No stored text says so. Most rows in this tab predate the Gmail sync
      // and have `replied = 1` with no message behind it at all — drawing
      // nothing there leaves a person looking at a row that appears broken,
      // next to rows that quote. Saying it repeats a sentence down the tab,
      // which Chapter 9 spent a while removing; the difference is that this
      // one is not the tab's meaning restated, it is a fact about THIS record
      // that the neighbouring rows do not share.
      detail: excerpt || 'Reply text not synced yet',
      quote: Boolean(excerpt),
      at: latest?.occurred_at || p.reply_date || null,
    });
  } else if (gate.stop === STOP.ACTIVE_CONVERSATION && awaitingAnswer) {
    out.push({
      bucket: BUCKET.NEEDS_REPLY,
      // Not "Interested, and it is a conversation". The stage is the
      // database's word for where the row sits, and printing it as the
      // headline of a card about a person is how the screens came to read
      // like a schema.
      // Chapter 9: the detail line was "Cold outreach stopped here. What
      // happens next is a message from you." on EVERY row of the Replies
      // tab. The tab's own blurb says it once; a row that repeats it is
      // twenty copies of a sentence between you and the person's name.
      headline: 'A conversation is open',
      detail: null,
      at: p.last_contact_date || null,
    });
  }

  // 2. Something the machine will not decide.
  if (latest && latest.classification === 'unknown') {
    out.push({
      bucket: BUCKET.NEEDS_DECISION,
      headline: 'A reply nobody could read',
      detail: 'Automation stopped. Read it and say what it was.',
      at: latest.occurred_at,
    });
  }
  if (job && job.error_kind === 'human') {
    out.push({
      bucket: BUCKET.NEEDS_DECISION,
      // Chapter 9: was "Vet could not decide", which names a bee and a
      // failure rather than the thing being asked of a person. Every row in
      // this bucket said a version of it, so the tab read as one repeated
      // complaint instead of a list of decisions.
      headline: 'Needs your call',
      detail: String(job.last_error || '').replace(/^Ambiguous:\s*/, '')
        || 'The checks disagreed, so nothing was decided.',
      at: job.updated_at,
    });
  }

  // 3. Work prepared and waiting. A stale draft is a decision, not an
  // approval: the conversation moved after it was written.
  //
  // These are the OLD drafts, from before Strategy V2: plain text meant for
  // copying into Gmail by hand. They are not outreach packages and cannot go
  // through the new approval, so they get their own bucket at the bottom
  // rather than sitting in "Ready for approval" pretending to be current.
  if (p.pending_draft && !p.pending_draft_dismissed_at) {
    if (p.pending_draft_stale) {
      out.push({
        bucket: BUCKET.NEEDS_DECISION,
        headline: 'Draft is out of date',
        detail: 'A reply came in after this was prepared. Read the conversation before using it.',
        at: p.pending_draft_at,
      });
    } else {
      out.push({
        bucket: BUCKET.LEGACY_DRAFT,
        headline: 'Old draft',
        detail: 'Written before the new outreach flow. Redo it to use the new approval.',
        at: p.pending_draft_at,
      });
    }
  }

  // 4. A parked prospect whose window opened.
  if (isReadyToReconsider(p, { now })) {
    out.push({
      bucket: BUCKET.RESURFACED,
      headline: 'Deferred window opened',
      detail: `They asked for later, and later is now (${String(p.next_action_date).slice(0, 10)}).`,
      at: p.next_action_date,
    });
  }

  // 5. Automation that stopped and needs something.
  if (job && (job.status === 'failed' || job.error_kind === 'budget')) {
    out.push({
      bucket: BUCKET.BLOCKED,
      headline: job.error_kind === 'budget' ? 'Waiting on credits' : 'A background job failed',
      detail: String(job.last_error || '').slice(0, 140),
      at: job.updated_at,
    });
  }
  // Deliberately NOT surfaced: a prospect with no email address.
  //
  // It is a correct outbound stop and a wrong Today card. Nothing was
  // attempted and nothing failed; the row simply has a blank field, and the
  // table already has a "Needs email" view for sourcing those.
  //
  // Measured on 2026-08-09: this one rule put 371 rows into the exception
  // queue, under a heading that says something is stuck. An exception queue
  // that opens with three hundred non-problems is a queue nobody reads, which
  // costs exactly the reply this whole screen exists to surface.

  // 6. Engagement. Real, and deliberately below a reply: a watch is a signal,
  // a reply is a person.
  const view = lastVideoView(p.activity_log);
  if (view) {
    const seen = videoSeen(p.activity_log);
    const h = hours(view.ts, now);
    const contactDay = String(p.last_contact_date || '').slice(0, 10);
    const fresh = h != null && h <= 72;
    const sinceContact = !contactDay || contactDay < String(view.ts).slice(0, 10);
    if (fresh && sinceContact) {
      out.push({
        bucket: BUCKET.ENGAGEMENT,
        headline: `Watched the video${seen ? ` (${seen.label.toLowerCase()})` : ''} ${ago(view.ts, now)}`,
        detail: 'Measured interest, and it goes cold fast.',
        at: view.ts,
      });
    }
  }

  return {
    reasons: out.sort((a, b) => BUCKET_RANK[b.bucket] - BUCKET_RANK[a.bucket]),
    standing,
  };
}

// How long this prospect has been sitting. Used for the one piece of metadata
// on a row that is genuinely urgent, so it gets its own field rather than being
// appended to a sentence.
function daysWaiting(p, now) {
  const src = p.last_contact_date || p.updated_at || p.created_at;
  const t = Date.parse(String(src || '').replace(' ', 'T'));
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

// The whole queue. One entry per prospect, sorted by their strongest reason
// and then by how long it has been waiting.
export function buildExceptionQueue(prospects = [], {
  now = new Date(), repliesByProspect = new Map(), jobsByProspect = new Map(),
  relationshipByProspect = new Map(), limit = 50,
  // Prospect ids that are active clients, read from the clients table. The
  // authority on whether somebody is a client; see reasonsAndStanding.
  clientIds = new Set(),
} = {}) {
  const rows = [];
  for (const p of prospects) {
    const { reasons, standing } = reasonsAndStanding(p, {
      now,
      replies: repliesByProspect.get(p.id) || [],
      job: jobsByProspect.get(p.id) || null,
      relationshipEvents: relationshipByProspect.get(p.id) || [],
      isClientRow: clientIds.has(p.id),
    });
    if (!reasons.length) continue;
    const primary = reasons[0];
    rows.push({
      id: p.id,
      name: p.name || p.business_name || p.email || `#${p.id}`,
      business: p.business_name && p.business_name !== p.name ? p.business_name : null,
      // The raw identity fields, so the row component can decide the hierarchy
      // rather than receiving a pre-flattened string. `name` above already
      // falls back to the business, which is exactly the flattening that left
      // the person's name off the card.
      person: p.name || null,
      businessName: p.business_name || null,
      country: p.country || null,
      // Enough for the shared list row to draw its mark and Ary's own verdict.
      domain: p.domain || null,
      rating: p.rating || null,
      reply_type: p.reply_type || null,
      do_not_contact: p.do_not_contact ? 1 : 0,
      unsubscribed: p.unsubscribed ? 1 : 0,
      waitingDays: daysWaiting(p, now),
      // The queue's own classification, so the display layer can trust it over
      // whatever the error text happens to say.
      errorKind: (jobsByProspect.get(p.id) || null)?.error_kind || null,
      stage: p.stage || 'New',
      bucket: primary.bucket,
      bucketLabel: BUCKET_LABEL[primary.bucket],
      headline: primary.headline,
      detail: primary.detail,
      // Whether `detail` is the person's own words. The display layer draws
      // those as a quote at body weight instead of folding them into the
      // context line, which is styled to recede.
      quote: Boolean(primary.quote),
      at: primary.at,
      // The other true things, so a person sees the whole picture without the
      // prospect appearing in four places.
      also: reasons.slice(1).map((r) => r.headline),
      rank: BUCKET_RANK[primary.bucket],
      // The prepared draft, only where the answer is "read this and decide".
      // A draft attached to a row about an unanswered reply would be a green
      // send button next to a person who is waiting.
      draft: primary.bucket === BUCKET.LEGACY_DRAFT ? String(p.pending_draft || '') || null : null,
      legacy: primary.bucket === BUCKET.LEGACY_DRAFT,
      email: p.email || null,
      // The one exception a card can resolve on the spot: they asked for later
      // and nobody wrote down when.
      datelessDeferral: standing.state === REL.DEFERRED && !standing.deferredUntil,
    });
  }

  rows.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    // Longest wait first inside a bucket.
    const at = String(a.at || '9999');
    const bt = String(b.at || '9999');
    if (at !== bt) return at.localeCompare(bt);
    return (a.id || 0) - (b.id || 0);
  });

  // Counted over every matching row, not the page. The headline and the cards
  // are the same query answered once: Today has already shipped a bug where
  // the number at the top contradicted the work underneath it, and the fix is
  // structural rather than careful arithmetic in two places.
  const counts = {};
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;
  const shown = rows.slice(0, limit);
  return {
    rows: shown,
    counts,
    total: rows.length,
    // Real totals per bucket, counted before the page limit. A section header
    // that reported the loaded rows would understate the size of the job every
    // time the list was long, which is precisely when it matters.
    totals: rows.reduce((a, r) => { a[r.bucket] = (a[r.bucket] || 0) + 1; return a; }, {}),
    // Stated rather than implied. A list silently cut at fifty reads as "that
    // is all of it".
    shown: shown.length,
    truncated: Math.max(0, rows.length - shown.length),
  };
}

// The one line at the top of Today. Leads with people, because that is what a
// person came to the screen for.
export function summarise(counts = {}, total = 0) {
  const bits = [];
  const n = (k) => counts[k] || 0;
  if (n(BUCKET.NEEDS_REPLY)) bits.push(`${n(BUCKET.NEEDS_REPLY)} ${n(BUCKET.NEEDS_REPLY) === 1 ? 'person needs' : 'people need'} your reply`);
  if (n(BUCKET.NEEDS_DECISION)) bits.push(`${n(BUCKET.NEEDS_DECISION)} ${n(BUCKET.NEEDS_DECISION) === 1 ? 'needs' : 'need'} a decision`);
  if (n(BUCKET.READY_FOR_APPROVAL)) bits.push(`${n(BUCKET.READY_FOR_APPROVAL)} ready to approve`);
  // Counted separately and last: an old draft is not work waiting on approval.
  if (n(BUCKET.LEGACY_DRAFT)) bits.push(`${n(BUCKET.LEGACY_DRAFT)} old ${n(BUCKET.LEGACY_DRAFT) === 1 ? 'draft' : 'drafts'}`);
  if (n(BUCKET.RESURFACED)) bits.push(`${n(BUCKET.RESURFACED)} ready to reconsider`);
  if (n(BUCKET.BLOCKED)) bits.push(`${n(BUCKET.BLOCKED)} stuck`);
  // Every bucket that produced a card is in the sentence, including the soft
  // one. A headline reading "4 people need your reply" above five cards is the
  // same class of bug as a count that disagrees with the list: the reader has
  // to work out which number is lying.
  if (n(BUCKET.ENGAGEMENT)) bits.push(`${n(BUCKET.ENGAGEMENT)} worth a look`);
  if (!bits.length) return 'Nothing needs you. The machine is handling what is left.';
  return bits.join(', ') + '.';
}
