// The app runs on one fixed clock — Pacific — no matter what timezone the
// device is set to. Ary opens Leads That Bloom from a Manila MacBook (UTC+8)
// and a Pacific Windows box (UTC-8); without this, "today", the due dates, and
// "sent today" all shift by up to a day between machines. America/Los_Angeles
// is Pacific with daylight saving handled (PST in winter, PDT in summer), so
// it's never an hour off either.
export const APP_TZ = 'America/Los_Angeles';

// Constructing an Intl.DateTimeFormat is the expensive part, and daysBetween
// runs thousands of times per render at 5k+ rows — so the formatter is built
// once per timezone and reused. formatToParts on a cached formatter is cheap.
const _fmtCache = new Map();
function partsFormatter(tz) {
  let f = _fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    _fmtCache.set(tz, f);
  }
  return f;
}

// Calendar/clock parts for an instant, read in the app timezone. en-CA gives
// ISO-style numeric fields. Injecting `date` keeps every caller testable.
export function tzParts(date = new Date(), tz = APP_TZ) {
  const f = partsFormatter(tz);
  const out = {};
  for (const p of f.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  // Intl can emit "24" for midnight in some engines; normalize to 0.
  const hour = out.hour === '24' ? 0 : Number(out.hour);
  return { year: Number(out.year), month: Number(out.month), day: Number(out.day), hour, minute: Number(out.minute) };
}

function isoFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Today's calendar date in the app timezone, as YYYY-MM-DD.
export function tzToday(date = new Date(), tz = APP_TZ) {
  const { year, month, day } = tzParts(date, tz);
  return isoFromParts(year, month, day);
}

// The hour (0-23) in the app timezone — for the greeting.
export function tzHour(date = new Date(), tz = APP_TZ) {
  return tzParts(date, tz).hour;
}

// Today ± N calendar days in the app timezone, as YYYY-MM-DD. UTC arithmetic
// on the tz-local date, so a DST change never adds or drops a day.
export function tzShift(days, date = new Date(), tz = APP_TZ) {
  const { year, month, day } = tzParts(date, tz);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86400000);
  return isoFromParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

// today − dateStr in whole calendar days. `now` is read in the app timezone;
// dateStr is a stored calendar date (YYYY-MM-DD), read as its literal date, so
// a date-only value is never shifted across midnight. Positive = in the past,
// null = empty/unparseable. Matches the old daysBetween except "today" is now
// Pacific instead of the machine's local day.
export function tzDaysBetween(dateStr, now = new Date(), tz = APP_TZ) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const then = new Date(t);
  const b = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const today = tzParts(now, tz);
  const a = Date.UTC(today.year, today.month - 1, today.day);
  return Math.floor((a - b) / 86400000);
}

// Format a stored date for display in the app timezone. Accepts a
// YYYY-MM-DD string or a Date; date-only strings are pinned to noon UTC first
// so the tz conversion can't roll them back to the previous day.
export function tzFormat(value, opts = {}, tz = APP_TZ) {
  if (!value) return '';
  let date;
  if (value instanceof Date) {
    date = value;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    date = new Date(`${value}T12:00:00Z`);
  } else {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return '';
    date = new Date(t);
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(date);
}

// SQLite's datetime('now') gives "YYYY-MM-DD HH:MM:SS" with no zone, and
// everything written from JavaScript gives an ISO string ending in Z. Both are
// real, both are UTC, and appending "Z" to the second one produces "ZZ" and a
// NaN. Parsed in one place so a timestamp comparison cannot silently become a
// comparison against NaN, which is false and therefore looks like "not stale".
export function parseUtc(value) {
  const s = String(value || '').trim();
  if (!s) return NaN;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s.replace(' ', 'T'));
  return Date.parse(`${s.replace(' ', 'T')}Z`);
}
