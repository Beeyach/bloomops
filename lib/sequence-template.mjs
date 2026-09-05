// The workspace email template: one place to write the 5-email sequence,
// instead of editing five emails on every prospect row. Stored in engine
// settings as sequenceTemplate; applied per prospect by filling the
// placeholders below. Applying COPIES — editing the template later never
// rewrites sequences already stored on rows.

import { watchUrl } from './watch-url.mjs';

// What the API accepts and stores: up to 5 entries of { number, subject,
// body }, numbers clamped to 1-5, blanks dropped. Never throws.
export function sanitizeSequenceTemplate(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({
      number: Math.min(5, Math.max(1, Math.round(Number(e.number) || 0))),
      subject: String(e.subject || '').slice(0, 300),
      body: String(e.body || '').slice(0, 5000),
    }))
    .filter((e) => e.number >= 1 && (e.subject.trim() || e.body.trim()))
    .slice(0, 5);
}

// Placeholders, case-insensitive: [name] (first name), [full name],
// [business], [website], [video] (the branded watch-page link). Unknown
// bracket-words are left alone — they may be deliberate copy.
export function fillSequenceTemplate(template, prospect = {}) {
  const fullName = String(prospect.name || '').trim();
  const first = fullName.split(/\s+/)[0] || '';
  const business = String(prospect.business_name || '').trim();
  const site = String(prospect.domain || '').trim();
  // The watch page, never the raw mp4. A row with no video yet fills with
  // nothing rather than a placeholder token leaking into a sent email —
  // the draft simply reads without the link until the video exists.
  const video = prospect.video_url ? watchUrl(prospect.video_url) : '';
  const fill = (s) =>
    String(s || '')
      .replace(/\[first name\]/gi, first)
      .replace(/\[full name\]/gi, fullName)
      .replace(/\[name\]/gi, first)
      .replace(/\[business\]/gi, business || first)
      .replace(/\[website\]/gi, site)
      .replace(/\[video\]/gi, video);
  return sanitizeSequenceTemplate(template).map((e) => ({
    number: e.number,
    subject: fill(e.subject),
    body: fill(e.body),
  }));
}
