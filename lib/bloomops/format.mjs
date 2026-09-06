// Dates for people, deterministic between server and browser: calendar
// dates are shown in UTC so the same markup renders on both sides.
const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? dateFormat.format(new Date(t)) : '';
}

// Whole days from `now` until `iso`; negative when past.
export function daysUntil(iso, now = new Date()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY_MS);
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
