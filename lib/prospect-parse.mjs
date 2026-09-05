// Parsers for the JSON-in-TEXT prospect columns (D1 has no JSON type).
// All of them accept a string (parse it), an already-parsed value (pass it
// through), or null/garbage (safe default) — and never throw. Extracted
// verbatim from ProspectsApp.jsx (split step 2).

import { todayIso, getLastSentNumber } from './due.mjs';

// email_sequence: [{ number, subject, body, ... }] or null.
export function parseEmailSequence(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// video_reasons is a JSON array of short strings. Unlike the sequence, an
// empty list is the useful default (nothing found), so this never returns
// null — the worklist and drawer can map over it without a guard.
export function parseVideoReasons(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The one-off sends (video / playbook emails), each stored as
// { subject, body, sent_at }. Null when nothing was sent, so the UI can
// just check for the object rather than for empty strings.
export function parseSentEmail(raw) {
  if (raw == null) return null;
  const obj =
    typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return {
    subject: typeof obj.subject === 'string' ? obj.subject : '',
    body: typeof obj.body === 'string' ? obj.body : '',
    sent_at: typeof obj.sent_at === 'string' ? obj.sent_at : null,
  };
}

// Shared by the two one-off-send setters so both store the identical shape.
export function buildSentEmail(method, subject, body, sentAt) {
  if (typeof subject !== 'string' || typeof body !== 'string') {
    throw new Error(`${method}: subject and body must be strings`);
  }
  return JSON.stringify({ subject, body, sent_at: sentAt });
}

// Build the patch for setting/clearing a reply. Mirrors
// window.bloom.setReplyType: a type implies replied=1 and stamps the
// reply date + the email number they were on; null clears the reply.
export function replyPatch(p, type) {
  if (type == null) return { reply_type: null, replied: 0 };
  return {
    reply_type: type,
    replied: 1,
    reply_date: p.reply_date || todayIso(),
    // Alongside the date, so time-to-reply is measurable. A reply forty minutes
    // after the send says something different about that send than one three
    // days later, and a date cannot tell them apart.
    reply_at: p.reply_at || new Date().toISOString(),
    replied_at_email: p.replied_at_email ?? getLastSentNumber(p),
  };
}
