// What a workspace has actually allowed the product to send, and when.
//
// Deliberately not one Autopilot switch. A single toggle would mean the first
// person to want automatic follow-ups also gets automatic first contact, and
// those are different amounts of trust: a follow-up continues something a
// person already approved, and a first email starts a relationship.
//
// Everything defaults off. A workspace that upgrades and reads none of this
// keeps sending exactly the way it did yesterday, which is the only acceptable
// default for a feature that emails strangers.

import { tzToday } from './tz.mjs';

export const SEND_DEFAULTS = {
  // Send an approved first email without anybody opening Gmail.
  autoSendApprovedFirstEmails: false,
  // Progress an approved sequence into its no-response follow-ups.
  autoSendApprovedFollowups: false,

  // Ceilings, both applied. The hourly one is what stops a backlog draining
  // in ninety seconds and looking exactly like a compromised mailbox.
  dailySendLimit: 20,
  hourlySendLimit: 5,

  // Local hours, inclusive start, exclusive end.
  sendWindowStartHour: 8,
  sendWindowEndHour: 17,
  // Days of the week sending is allowed. 1 = Monday.
  sendDays: [1, 2, 3, 4, 5],
  workspaceTimezone: 'America/Los_Angeles',

  // A pause between approving and sending, so a mistake noticed thirty seconds
  // later is still recoverable. Not a deliverability theory: nothing here
  // claims a send hour changes a reply rate, because nothing measured that.
  minimumDelayAfterApprovalMinutes: 15,

  // How stale the mailbox may be and still permit a send. Stricter than the
  // ninety minutes that gates preparation: preparing from stale reply state
  // wastes a draft, sending from it writes to somebody who already answered.
  maxReplyStalenessMinutes: 30,

  // How old the evidence behind a package may be before a follow-up has to
  // re-check the page.
  //
  // A CHOSEN POLICY, NOT A MEASUREMENT. Nothing is known about how fast these
  // pages actually change, and ninety days is a guess. It lives here as
  // configuration precisely so that nobody six months from now reads it as a
  // finding, and so that changing it costs a settings edit rather than a
  // migration.
  evidenceStaleDays: 90,

  // Which countries this workspace sends to, and the local window each one
  // gets. This used to live only in the follow-up sweep skill, which meant the
  // app and the skill each had an opinion about when it was reasonable to email
  // somebody and neither knew about the other. The app owns send policy; the
  // skill reads this.
  // Each scope carries its own timezone, because 9am has to mean 9am where the
  // RECIPIENT is. Without one, an AU prospect was judged on California hours:
  // 8am Pacific is 1am in Sydney, so the whole AU cohort could only ever be
  // mailed in the middle of their night. The hours were configured here from
  // the start; the zone was the missing half.
  //
  // One zone per scope is a simplification and an honest one. UK/EU spans two
  // offsets and AU spans three, so the zone named is the one most of that
  // scope's list sits in. An hour either side of a business day is a far
  // smaller error than fourteen.
  regionScopes: [
    { name: 'US/CA', countries: ['US', 'CA'], startHour: 8, endHour: 17, timeZone: 'America/Los_Angeles' },
    { name: 'UK/EU', countries: ['GB', 'IE', 'DE', 'FR', 'NL', 'ES', 'IT'], startHour: 8, endHour: 17, timeZone: 'Europe/London' },
    { name: 'AU/NZ', countries: ['AU', 'NZ'], startHour: 8, endHour: 17, timeZone: 'Australia/Sydney' },
  ],
};

export function sendPolicy(settings = {}) {
  const s = { ...SEND_DEFAULTS, ...(settings || {}) };
  const int = (v, d, lo, hi) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    autoSendApprovedFirstEmails: s.autoSendApprovedFirstEmails === true,
    autoSendApprovedFollowups: s.autoSendApprovedFollowups === true,
    dailySendLimit: int(s.dailySendLimit, SEND_DEFAULTS.dailySendLimit, 0, 500),
    hourlySendLimit: int(s.hourlySendLimit, SEND_DEFAULTS.hourlySendLimit, 0, 100),
    sendWindowStartHour: int(s.sendWindowStartHour, SEND_DEFAULTS.sendWindowStartHour, 0, 23),
    sendWindowEndHour: int(s.sendWindowEndHour, SEND_DEFAULTS.sendWindowEndHour, 1, 24),
    sendDays: Array.isArray(s.sendDays) && s.sendDays.length
      ? [...new Set(s.sendDays.map(Number).filter((d) => d >= 0 && d <= 6))]
      : SEND_DEFAULTS.sendDays,
    workspaceTimezone: String(s.workspaceTimezone || SEND_DEFAULTS.workspaceTimezone),
    minimumDelayAfterApprovalMinutes: int(s.minimumDelayAfterApprovalMinutes, SEND_DEFAULTS.minimumDelayAfterApprovalMinutes, 0, 1440),
    maxReplyStalenessMinutes: int(s.maxReplyStalenessMinutes, SEND_DEFAULTS.maxReplyStalenessMinutes, 5, 720),
    evidenceStaleDays: int(s.evidenceStaleDays, SEND_DEFAULTS.evidenceStaleDays, 1, 3650),
    regionScopes: Array.isArray(s.regionScopes) && s.regionScopes.length
      ? s.regionScopes
      : SEND_DEFAULTS.regionScopes,
  };
}

// Which region scope a prospect falls in.
//
// The app's answer, so a skill asking "may I send to this AU prospect now"
// gets the same answer the app would have given itself.
export function regionScopeFor(policy, prospect = {}) {
  const country = String(prospect.country || '').trim().toUpperCase();
  if (!country) return null;
  return (policy.regionScopes || []).find((r) => (r.countries || []).includes(country)) || null;
}

// The local hour and weekday in a given zone, rather than the server's. A
// Cloudflare worker has no meaningful local time, and "9am" has to mean 9am
// somewhere real.
export function localClock(policy, now = new Date(), timeZone = null) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || policy.workspaceTimezone,
    hour: 'numeric', hour12: false, weekday: 'short',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  return { hour: hour === 24 ? 0 : hour, day };
}

/**
 * Which window governs this send, and in whose day.
 *
 * With a prospect whose country matches a region scope, that scope's hours and
 * timezone win: a Sydney business is asked at Sydney breakfast, not at hers.
 * Without one, the workspace window applies exactly as before, so every
 * existing caller and every prospect with no country keeps today's behaviour.
 */
export function windowFor(policy, prospect = null) {
  const scope = prospect ? regionScopeFor(policy, prospect) : null;
  if (!scope) {
    return {
      startHour: policy.sendWindowStartHour,
      endHour: policy.sendWindowEndHour,
      timeZone: policy.workspaceTimezone,
      scope: null,
    };
  }
  return {
    startHour: Number.isFinite(scope.startHour) ? scope.startHour : policy.sendWindowStartHour,
    endHour: Number.isFinite(scope.endHour) ? scope.endHour : policy.sendWindowEndHour,
    // A scope with no zone falls back rather than silently meaning Pacific.
    timeZone: scope.timeZone || policy.workspaceTimezone,
    scope: scope.name || null,
  };
}

export function insideSendWindow(policy, now = new Date(), prospect = null) {
  const w = windowFor(policy, prospect);
  const { hour, day } = localClock(policy, now, w.timeZone);
  // The weekday is read in the same zone as the hour. Judging a Sydney
  // recipient's Saturday morning against California's Friday afternoon is the
  // same class of mistake as the hours were.
  if (!policy.sendDays.includes(day)) {
    return {
      ok: false,
      reason: w.scope
        ? `Not a sending day in ${w.scope} (${w.timeZone}).`
        : 'Not a sending day for this workspace.',
    };
  }
  if (hour < w.startHour || hour >= w.endHour) {
    return {
      ok: false,
      reason: `Outside the send window (${w.startHour}:00 to ${w.endHour}:00 ${w.timeZone}).`,
    };
  }
  return { ok: true };
}

// The next moment sending would be allowed. Used to schedule rather than to
// fail: a message approved at 9pm should go out tomorrow morning, not be
// rejected.
export function nextWindowOpen(policy, now = new Date(), prospect = null) {
  for (let i = 0; i < 24 * 8; i += 1) {
    const t = new Date(now.getTime() + i * 3600_000);
    if (insideSendWindow(policy, t, prospect).ok) {
      // Round to the top of that hour so scheduled times are tidy.
      const at = new Date(t);
      at.setUTCMinutes(0, 0, 0);
      return at > now ? at : new Date(now.getTime() + 60_000);
    }
  }
  return null;
}

// Room left under both ceilings.
export function remainingAllowance(policy, { sentToday = 0, sentThisHour = 0 } = {}) {
  const day = Math.max(0, policy.dailySendLimit - Number(sentToday || 0));
  const hour = Math.max(0, policy.hourlySendLimit - Number(sentThisHour || 0));
  return { day, hour, allowed: Math.min(day, hour) };
}

// The date key the daily limit counts against: the workspace's day, not UTC's.
export const workspaceDay = (policy, now = new Date()) => tzToday(now, policy.workspaceTimezone);
