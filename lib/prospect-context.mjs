// The one context builder every bee reads from. A bee is only as good as
// what it knows, so this assembles EVERYTHING the tracker holds on a
// prospect into one plain-text block: identity, the parsed audit profile,
// video and watch state, reply state, the sequence position, and the
// activity timeline with Ary's own notes. Pure function, unit-tested;
// server routes call it so no client ever ships a half-context.

import { parseAuditNotes } from './audit-profile.mjs';
import { lastVideoView, videoSeen } from './watch-url.mjs';
import { parseSiteIntel, intelLines, freshnessLabel } from './site-intel.mjs';
import { evidenceBlock } from './evidence.mjs';
import { collectSignals, signalLines } from './signals.mjs';

const line = (label, value) => (value ? `${label}: ${value}` : null);

const parseJson = (raw, fallback) => {
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) return raw;
  try {
    const v = JSON.parse(raw || '');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

export function buildProspectContext(p = {}) {
  const parts = [];

  parts.push('== WHO ==');
  [
    line('Name', p.name),
    line('Business', p.business_name),
    line('Niche', p.niche),
    line('Website', p.domain),
    line('Country', p.country),
    line('Stage', p.stage),
    line('Rating', p.rating),
    line('Source', p.source),
  ].filter(Boolean).forEach((l) => parts.push(l));

  const prof = parseAuditNotes(p.audit_notes);
  if (prof.rating || prof.fields.length || prof.sections.length) {
    parts.push('', '== SITE AUDIT PROFILE ==');
    if (prof.rating) parts.push(`Audit rating: ${prof.rating}`);
    prof.fields.forEach((f) => parts.push(`${f.label}: ${f.value}`));
    prof.sections.forEach((s) => {
      parts.push(`${s.title}:`);
      s.items.forEach((it) => {
        const mark = it.status === 'good' ? '[ok] ' : it.status === 'bad' ? '[broken] ' : it.status === 'warn' ? '[unclear] ' : '';
        parts.push(`- ${mark}${it.label ? `${it.label}: ` : ''}${it.text}`);
      });
    });
    if (prof.leftover) parts.push(`Other audit notes: ${prof.leftover.slice(0, 600)}`);
  }

  // The evidence block: manual findings, verified measurements and inferred
  // context, kept apart and labelled, plus what we do not know.
  //
  // Before this every bee received the same undifferentiated prose, so a guess
  // parsed out of audit notes written months ago and a problem measured in a
  // browser this morning arrived looking identical. That is how an outreach
  // email ends up asserting something nobody checked. Ary's own findings — the
  // highest-confidence evidence in the system, because she had the page open —
  // were not in here at all.
  parts.push('', evidenceBlock(p));

  const signals = collectSignals(p);
  if (signals.length) {
    parts.push('', '== SIGNALS ==');
    parts.push(...signalLines(signals));
  }

  const reasons = parseJson(p.video_reasons, []);
  const view = lastVideoView(p.activity_log);
  const seen = videoSeen(p.activity_log);
  if (p.video_url || reasons.length || view) {
    parts.push('', '== AUDIT VIDEO ==');
    if (reasons.length) parts.push(`What the video shows broken: ${reasons.join('; ')}`);
    if (p.video_sent_at) parts.push(`Video sent: ${p.video_sent_at}`);
    else if (p.video_url) parts.push('Video recorded, not sent yet.');
    if (view) parts.push(`THEY WATCHED IT: ${seen ? seen.label : view.text} at ${view.ts}. This is the strongest interest signal on record.`);
  }

  parts.push('', '== CONVERSATION STATE ==');
  parts.push(`Emails sent: ${p.emails_sent || 0}`);
  if (p.replied) {
    parts.push(`They replied: ${p.reply_type || 'yes'}${p.reply_date ? ` on ${p.reply_date}` : ''}`);
  } else {
    parts.push('No reply yet.');
  }
  if (p.last_contact_date) parts.push(`Last contact: ${p.last_contact_date}`);
  if (p.next_action_date) parts.push(`Next follow-up planned: ${p.next_action_date}`);
  if (p.call_booked) parts.push('A call is booked.');
  if (p.proposal_sent) parts.push('A proposal has been sent.');

  const log = parseJson(p.activity_log, []);
  if (Array.isArray(log) && log.length) {
    parts.push('', '== TIMELINE (newest last) ==');
    log.slice(-15).forEach((e) => {
      if (!e || !e.text) return;
      const day = String(e.ts || '').slice(0, 10);
      parts.push(`${day} [${e.tag || 'note'}] ${String(e.text).slice(0, 200)}`);
    });
  }

  if (p.info) {
    parts.push('', '== ARY\'S OWN NOTES ==', String(p.info).slice(0, 1200));
  }

  return parts.join('\n');
}
