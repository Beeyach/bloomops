// Per-prospect activity log: a JSON array of { ts, tag, text } stored in the
// activity_log TEXT column (D1 has no JSON type — same convention as
// email_sequence and video_reasons).
//
// The info field was quietly becoming a log before this existed: automations
// prepended PRESCREEN / REPLYSYNC:<id> / VIDTEST:A|B / DECLINED lines above
// Ary's research notes. Those markers keep working — infoTimeline() lifts the
// ones the UI recognizes into the same timeline shape — but info itself is
// never rewritten here. Reading and writing info stays exactly as it was.

// Parse the stored column. Accepts a JSON string, an already-parsed array, or
// null/garbage (→ []). Never throws, and always returns an array so callers
// can map without guards.
export function parseLog(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(isEntry);
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function isEntry(e) {
  return !!e && typeof e === 'object' && typeof e.tag === 'string' && typeof e.text === 'string';
}

// Append one entry, returning the new JSON string to store. Entries stay in
// chronological order (oldest first); the UI reverses for display. `ts` is
// injectable for tests; defaults to now, ISO UTC.
export function appendEntry(raw, tag, text, ts = new Date().toISOString()) {
  if (typeof tag !== 'string' || !tag.trim()) {
    throw new Error('addLog: tag must be a non-empty string');
  }
  if (typeof text !== 'string') {
    throw new Error('addLog: text must be a string');
  }
  const log = parseLog(raw);
  return JSON.stringify([...log, { ts, tag: tag.trim(), text }]);
}

// The info-field markers the UI understands, line-anchored because they sit
// prepended above free-form notes. Each match becomes a timeline entry with
// ts: null (the info field never carried timestamps).
const INFO_MARKERS = [
  { re: /^PRESCREEN\b\s*(.*)$/, tag: 'prescreen' },
  { re: /^REPLYSYNC:(\S+)\s*(.*)$/, tag: 'replysync' },
  { re: /^VIDTEST:([AB])\b\s*(.*)$/, tag: 'vidtest' },
  { re: /^DECLINED\b\s*(.*)$/, tag: 'declined' },
];

export function infoTimeline(info) {
  if (typeof info !== 'string' || !info) return [];
  const out = [];
  for (const line of info.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const { re, tag } of INFO_MARKERS) {
      const m = trimmed.match(re);
      if (!m) continue;
      // For markers carrying a value (REPLYSYNC's id, VIDTEST's arm), keep it
      // in the text so nothing is lost in the lift.
      const text = m.slice(1).filter(Boolean).join(' ').trim() || trimmed;
      out.push({ ts: null, tag, text, fromInfo: true });
      break;
    }
  }
  return out;
}

// Auto-log: the timeline should fill itself. Given the row being written
// and the patch about to be sent, returns the patch with an activity_log
// entry appended for the changes worth remembering — a stage move, a reply
// logged, the audit video going out. Same single PUT, no extra request.
// A patch that already carries activity_log (the addLog path) is returned
// untouched so nothing double-logs.
export function withAutoLog(prevRow, patch, ts = new Date().toISOString()) {
  if (!prevRow || !patch || patch.activity_log !== undefined) return patch;
  const notes = [];
  if (patch.stage && patch.stage !== prevRow.stage) {
    notes.push({ tag: 'stage', text: `${prevRow.stage || 'New'} → ${patch.stage}` });
  }
  if (patch.reply_type && patch.reply_type !== prevRow.reply_type) {
    notes.push({ tag: 'reply', text: patch.reply_type });
  }
  if (patch.video_sent_at && !prevRow.video_sent_at) {
    notes.push({ tag: 'video', text: 'audit video sent' });
  }
  if (notes.length === 0) return patch;
  let raw = prevRow.activity_log;
  for (const n of notes) raw = appendEntry(raw, n.tag, n.text, ts);
  return { ...patch, activity_log: raw };
}

// One list for the drawer: dated entries newest-first, then the undated
// info markers (they have no ts to sort by, so they trail, oldest-known
// ordering preserved).
export function mergedTimeline(activityRaw, info) {
  const dated = parseLog(activityRaw)
    .slice()
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return [...dated, ...infoTimeline(info)];
}

// What they actually wrote back, wherever it was recorded. Two places hold
// it for historical reasons: the reply-sync skill has been prepending a
// REPLYSYNC: line to `info` for months, and the drawer's "what did they say"
// box writes a REPLY entry to the activity log. The bees should not care
// which, and neither should Ary.
export function lastReplyText(prospect = {}) {
  const log = parseLog(prospect.activity_log);
  const fromLog = [...log]
    .filter((e) => e && e.tag === 'REPLY' && e.text)
    .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')))
    .pop();
  if (fromLog) return String(fromLog.text).replace(/^They said:\s*/i, '').trim();

  // REPLYSYNC:<id> <TYPE> <date>: <summary, quoting the key phrase>
  const line = String(prospect.info || '')
    .split('\n')
    .find((l) => /^REPLYSYNC:/i.test(l.trim()));
  if (!line) return '';
  const colon = line.indexOf(':', line.indexOf(' '));
  return (colon > -1 ? line.slice(colon + 1) : line).trim();
}
