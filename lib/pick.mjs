// Pick Bee: who should I spend my attention on next, and why?
//
// It used to send 400 rows of name/stage/date to the model and ask it to
// choose five. That is asking a language model to do arithmetic on dates and
// then trusting the result, and it could not see the one thing that decides
// the answer: whether there is a verified reason to contact anybody.
//
// The ordering is deterministic now. "Someone replied yesterday and you have
// not answered" outranks "cold prospect with a good site audit" every single
// time, and that is a rule, not a judgement — so it is written as a rule and
// cannot come out differently on a Tuesday.
//
// The model is still used, for the one thing it is better at: turning the
// chosen five into a sentence each that reads like a person wrote it. If that
// call fails, the picks and their reasons still stand.

import { collectEvidence, groupEvidence, evidenceStrength, CONFIDENCE } from './evidence.mjs';
import { qualificationFlags } from './qual-rules.mjs';
import { parseSiteIntel, isFresh } from './site-intel.mjs';
import { lastVideoView, videoSeen } from './watch-url.mjs';

// Bands, not a score. Everything in band 100 outranks everything in band 90,
// and within a band the tie-break is how long they have been waiting. The
// numbers exist to sort; they are never shown, and nothing is ever "87/100".
export const BAND = {
  ANSWER_THEM: 100,      // they spoke, we have not
  WATCHED: 90,           // they watched the video and went quiet
  VIDEO_UNSENT: 80,      // work already paid for, sitting there
  DUE_WARM: 70,          // a warm lead's follow-up date has arrived
  DUE_COLD: 60,          // a cold row's follow-up date has arrived
  STRONG_EVIDENCE: 50,   // never contacted, but there is something real to say
  THIN_EVIDENCE: 30,     // one finding
  NOTHING_TO_SAY: 10,    // no reason yet
};

const CLOSED = new Set(['Client', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished']);
const WARM = new Set(['Interested', 'Proposal Sent', 'Setup Check', 'Engaged', 'Replied']);

const daysBetween = (iso, now) => {
  if (!iso) return null;
  const t = Date.parse(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
};

// One prospect's priority, with the reason that produced it.
// One prospect's priority, plus the workspace's own green rules as a tie-break
// and nothing more.
//
// A green rule cannot lift anybody into a higher band, which is the guarantee
// that matters here: "they replied and you have not answered" is band 100 and
// stays there whatever anybody's post said. Green rules only decide who goes
// first among prospects the bands have already called equal, which in practice
// means the never-contacted pile, where every row's wait is identical.
export function rankOne(p = {}, { now = new Date(), settings = null } = {}) {
  const base = rankCore(p, { now });
  if (!base) return null;
  const qual = settings ? qualificationFlags(p, settings) : null;
  return {
    ...base,
    greenWeight: qual?.greenWeight || 0,
    matchedGreen: (qual?.matchedGreen || []).map((r) => r.text),
  };
}

function rankCore(p = {}, { now = new Date() } = {}) {
  const stage = p.stage || 'New';
  if (CLOSED.has(stage)) return null;

  const today = now.toISOString().slice(0, 10);
  const ev = collectEvidence(p);
  const g = groupEvidence(ev);
  const strength = evidenceStrength(ev);
  const intel = parseSiteIntel(p.site_intel);
  const view = lastVideoView(p.activity_log);
  const seen = videoSeen(p.activity_log);

  const sinceContact = daysBetween(p.last_contact_date, now);
  const dueIn = p.next_action_date ? -(daysBetween(p.next_action_date, now) ?? 0) : null;

  // ── The rules, hardest first ────────────────────────────────────────────

  // They replied and nothing has gone back. Nothing outranks this. A person
  // is waiting on an answer, and every hour it sits there costs more than any
  // amount of research on a stranger.
  if (p.replied && p.reply_type !== 'decline') {
    const replyDay = String(p.reply_date || '').slice(0, 10);
    const contactDay = String(p.last_contact_date || '').slice(0, 10);
    const unanswered = !contactDay || (replyDay && contactDay <= replyDay);
    if (unanswered) {
      const waited = daysBetween(p.reply_date, now);
      return {
        band: BAND.ANSWER_THEM,
        waiting: waited ?? 0,
        reason: `Replied ${reply(p.reply_type)}${waited != null ? ` ${ago(waited)}` : ''} and nothing has gone back yet.`,
        headline: 'Active conversation',
        evidence: g,
        strength,
      };
    }
  }

  // They watched the video and we have not written since. Measured interest,
  // and it decays in days.
  if (view) {
    const viewDay = String(view.ts).slice(0, 10);
    const contactDay = String(p.last_contact_date || '').slice(0, 10);
    if (!contactDay || contactDay < viewDay) {
      const age = daysBetween(view.ts, now);
      return {
        band: BAND.WATCHED,
        waiting: age ?? 0,
        reason: `Watched the audit video${seen ? ` (${seen.label.toLowerCase()})` : ''}${age != null ? ` ${ago(age)}` : ''} and you have not written since.`,
        headline: 'Watched, went quiet',
        evidence: g,
        strength,
      };
    }
  }

  // A recorded video nobody sent. The money is already spent.
  if (p.video_url && !p.video_sent_at) {
    return {
      band: BAND.VIDEO_UNSENT,
      waiting: sinceContact ?? 0,
      reason: 'A recorded audit video is sitting unsent.',
      headline: 'Video ready to send',
      evidence: g,
      strength,
    };
  }

  // A follow-up date that has arrived. Warm beats cold.
  if (p.next_action_date && p.next_action_date <= today) {
    const warm = WARM.has(stage) || p.reply_type === 'defer';
    const overdue = dueIn ?? 0;
    return {
      band: warm ? BAND.DUE_WARM : BAND.DUE_COLD,
      waiting: overdue,
      reason: warm
        ? `${p.reply_type === 'defer' ? 'Deferred' : stage} and the follow-up window opened${overdue > 0 ? ` ${overdue} days ago` : ' today'}.`
        : `Follow-up due${overdue > 0 ? ` ${overdue} days ago` : ' today'}.`,
      headline: warm ? 'Follow-up window open' : 'Follow-up due',
      evidence: g,
      strength,
    };
  }

  // Never contacted, but there is a real reason to. This is where evidence
  // finally decides the order, and only after every conversation already in
  // flight has been handled.
  if (strength.level === 'strong') {
    const first = g.manual[0] || g.verified[0];
    return {
      band: BAND.STRONG_EVIDENCE,
      waiting: sinceContact ?? 999,
      reason: `${strength.strong} verified problems to point at${first ? `, starting with: ${first.text}` : ''}.`,
      headline: g.manual.length ? 'You found something here' : 'Verified problems',
      evidence: g,
      strength,
    };
  }
  if (strength.level === 'thin') {
    const first = g.manual[0] || g.verified[0];
    return {
      band: BAND.THIN_EVIDENCE,
      waiting: sinceContact ?? 999,
      reason: `One verified thing to mention: ${first ? first.text : 'a finding on their site'}.`,
      headline: 'One finding',
      evidence: g,
      strength,
    };
  }

  return {
    band: BAND.NOTHING_TO_SAY,
    waiting: sinceContact ?? 999,
    // The injected clock, like everything else in this function.
    reason: intel && isFresh(intel, { now })
      ? 'Their site was checked and nothing was found worth raising.'
      : 'Nothing verified about them yet. Run the site check or look yourself.',
    headline: 'No reason yet',
    evidence: g,
    strength,
  };
}

// The ordered list. Deterministic end to end: same rows in, same order out.
export function rankProspects(prospects = [], { now = new Date(), limit = 5, settings = null } = {}) {
  const scored = [];
  for (const p of prospects) {
    const r = rankOne(p, { now, settings });
    if (!r) continue;
    scored.push({ prospect: p, ...r });
  }
  scored.sort((a, b) => {
    if (b.band !== a.band) return b.band - a.band;
    // Longer wait first inside a band.
    if ((b.waiting || 0) !== (a.waiting || 0)) return (b.waiting || 0) - (a.waiting || 0);
    // Only now do the workspace's own rules get a say, and only among rows
    // that are otherwise indistinguishable. That is almost exactly the
    // never-contacted pile, where every wait is the same placeholder number
    // and the alternative tie-break is row id, which is meaningless.
    if ((b.greenWeight || 0) !== (a.greenWeight || 0)) return (b.greenWeight || 0) - (a.greenWeight || 0);
    // Stable final tie-break so the same list never reshuffles between runs.
    return (a.prospect.id || 0) - (b.prospect.id || 0);
  });
  return scored.slice(0, limit);
}

// What the picks look like before the model touches them. This is the
// fallback: if the AI call fails, this is still a complete, useful answer.
export function renderPicks(picks = []) {
  return picks.map((x, i) => {
    const p = x.prospect;
    const who = p.name || p.business_name || p.email || `#${p.id}`;
    const lines = [`${i + 1}. ${who}${p.business_name && p.business_name !== p.name ? ` (${p.business_name})` : ''}`];
    lines.push(`   ${x.headline}: ${x.reason}`);
    if (x.evidence.manual.length) {
      lines.push(`   You noted: ${x.evidence.manual.map((e) => e.text).join('; ')}`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

// The compact form handed to the model when it is asked to write the sentences.
// Only the five that were already chosen: the ordering decision is not the
// model's to make.
export function picksForPrompt(picks = []) {
  return picks.map((x, i) => {
    const p = x.prospect;
    const bits = [
      `${i + 1}. ${p.name || p.business_name || `#${p.id}`}`,
      `   why they are here: ${x.reason}`,
      `   stage: ${p.stage || 'New'}, emails sent: ${p.emails_sent || 0}`,
    ];
    if (x.evidence.manual.length) bits.push(`   MANUAL findings: ${x.evidence.manual.map((e) => e.text).join('; ')}`);
    if (x.evidence.verified.length) bits.push(`   VERIFIED findings: ${x.evidence.verified.map((e) => e.text).join('; ')}`);
    if (!x.evidence.manual.length && !x.evidence.verified.length) bits.push('   NOTHING verified about this one. Do not invent a reason.');
    return bits.join('\n');
  }).join('\n\n');
}

const reply = (t) => (t === 'interested' ? 'interested' : t === 'defer' ? 'not right now' : t || 'yes');
const ago = (d) => (d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);
