// What a reply does to the prospect record.
//
// Two callers need this and they must agree. The ingest route applies it the
// moment a message lands and the rules recognised it; the classify job applies
// it later, when the cheap model has read something the rules would not touch.
// A second copy of these rules would be two prospecting brains disagreeing
// about whether somebody unsubscribed, which is the exact failure the
// app-and-skills ownership work exists to prevent.
//
// Conservative throughout: an out-of-office never sets `replied`, and a
// low-confidence label never writes a stage.

import { appendEntry } from './activity-log.mjs';
import { recordOutcome, KIND as OUTCOME } from './outcomes.mjs';
import { DEFERRAL_SOURCE } from './deferral.mjs';
import { onBounce } from './contact-state.mjs';
import { recordReply } from './relationship-store.mjs';

// Replies that accept a micro-offer.
//
// The whole point of the CTA change: the cold email offers one specific thing,
// and this is the moment somebody takes it. Recorded so fulfilment is a lookup
// against the promise stored at send time rather than a guess about which of
// five things we offered.
//
// A leading diagnostic and never the objective. A system optimised for more
// "yes, send it" produces more of those and fewer clients, so this number is
// only ever read next to what share of them became a real conversation.
const ACCEPTS_OFFER = new Set(['interested', 'question']);

export async function applyReplyToProspect(db, ws, prospectId, {
  cls, action, isReal, needsHuman, occurredAt,
  // What they actually wrote, for the relationship half below.
  //
  // This used to be the ingest route's job, called separately right after this
  // function. The classify job called this function and not that one, so every
  // reply the rules would not touch — which is every reply a person actually
  // wrote in their own words — updated the stage and left the relationship
  // timeline empty. Cynthia 4860 is the proof: model-classified `decline`,
  // stage `Rejected`, zero relationship events.
  //
  // Moving it in here means the two halves cannot come apart again.
  message = null,
}) {
  const p = await db
    .prepare('SELECT id, stage, activity_log, pending_draft, pending_draft_at, pending_draft_stale, offer_accepted_at, emails_sent FROM prospects WHERE id = ? AND workspace = ?')
    .bind(prospectId, ws).first();
  if (!p) return { stopped: false, staleDraft: false };

  const sets = [];
  const binds = [];
  const day = String(occurredAt).slice(0, 10);

  if (isReal) {
    sets.push('replied = 1', 'reply_date = ?');
    binds.push(day);
    if (action.replyType) { sets.push('reply_type = ?'); binds.push(action.replyType); }
  }
  // Only a confident label moves a stage. An unknown reply stops outbound —
  // which the guard does from `replied` alone — without relabelling anybody.
  if (action.stage && cls.confidence !== 'low') { sets.push('stage = ?'); binds.push(action.stage); }
  if (action.nextActionDate) { sets.push('next_action_date = ?'); binds.push(action.nextActionDate); }
  if (action.doNotContact) sets.push('do_not_contact = 1');
  if (action.unsubscribed) sets.push('unsubscribed = 1');

  // A deferral is a small contract, not a date. Their words go in unparaphrased,
  // because the paraphrase is where the meaning goes, and three weeks later the
  // reactivation has to refer to what was actually said rather than restart cold.
  if (cls.classification === 'defer' && action.nextActionDate) {
    sets.push('deferred_until = ?', 'deferral_source = ?');
    binds.push(action.nextActionDate, DEFERRAL_SOURCE.REPLY);
    if (cls.quote || cls.snippet) {
      sets.push('deferral_reason = ?');
      binds.push(String(cls.quote || cls.snippet).slice(0, 500));
    }
  }

  // They took the offer. Fulfilment reads the promise recorded at send time.
  if (ACCEPTS_OFFER.has(cls.classification) && cls.confidence !== 'low' && !p.offer_accepted_at) {
    sets.push('offer_accepted_at = ?', 'offer_accepted_step = ?');
    binds.push(String(occurredAt), Number(p.emails_sent) || null);
  }

  // A bounce is a fact about the address, never about the business.
  //
  // It stops outbound and invalidates the contact. It does not touch evidence,
  // the Vet result, the Strong verdict, the band or any package: those were
  // true before the inbox filled up and they are true after.
  if (cls.classification === 'bounce') {
    const patch = onBounce({ at: String(occurredAt) });
    sets.push('contact_state = ?', 'contact_state_at = ?', 'contact_state_reason = ?');
    binds.push(patch.contact_state, patch.contact_state_at, patch.contact_state_reason);
  }

  // THE RACE. A follow-up prepared at 9am and a reply at 9:05 is exactly how
  // the worst email in the sequence gets sent. The draft is not deleted —
  // there may be work in it worth reading — but it is marked stale so no
  // interface can offer a green Send on something written before the
  // conversation moved.
  let staleDraft = false;
  if (p.pending_draft && !p.pending_draft_stale) {
    const preparedBefore = !p.pending_draft_at || String(p.pending_draft_at) <= String(occurredAt);
    if (preparedBefore) { sets.push('pending_draft_stale = 1'); staleDraft = true; }
  }

  const noteText = staleDraft
    ? `${action.note} The follow-up draft prepared earlier is now stale.`
    : action.note;
  sets.push('activity_log = ?');
  binds.push(appendEntry(p.activity_log, 'reply', noteText));
  sets.push('updated_at = ?');
  binds.push(new Date().toISOString());

  await db
    .prepare(`UPDATE prospects SET ${sets.join(', ')} WHERE id = ? AND workspace = ?`)
    .bind(...binds, prospectId, ws)
    .run();

  await recordOutcome(db, {
    workspace: ws, prospectId, kind: OUTCOME.REPLY, value: cls.classification,
    context: { confidence: cls.confidence, by: cls.by, isRealReply: isReal, needsHuman, staleDraft },
  });

  // What this message meant for the relationship, beside what it did to the
  // record. `relationshipFromReply` reads their words: "no thanks" is
  // NO_TO_THIS_OFFER and the relationship stays open, "don't contact me again"
  // is NO_TO_US and it does not. A generic decline is never upgraded into a
  // permanent rejection by this path.
  if (message) {
    await recordReply(db, {
      workspace: ws,
      prospectId,
      classification: cls.classification,
      text: message.text || '',
      occurredAt,
      messageId: message.id || null,
      threadId: message.threadId || null,
      confidence: cls.confidence,
      isRealReply: isReal,
      deferUntil: action.nextActionDate || null,
    }).catch(() => {});
  }

  return { stopped: Boolean(action.stopOutbound), staleDraft };
}
