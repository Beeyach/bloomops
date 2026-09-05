// What will actually send something, in words.
//
// Ary has asked "will this button send an email?" more times than any other
// question about this app, and every previous answer lived in a sentence
// somebody typed into a component. A typed sentence is a claim about a setting
// it cannot see: the day automatic first sending is switched on, a page that
// says "approving never sends" becomes a lie that looks like documentation.
//
// So the explanation is derived from the same settings the send policy reads.
// One function, one vocabulary, and both the help page and Settings say the
// same thing because they ask the same question.
//
// The words are deliberately not the switch names. AUTO_SEND_FIRST tells you
// nothing unless you already know what it does; "Manual" tells you what will
// happen when you press the button.

import { sendPolicy } from './send-policy.mjs';

export const MODE = {
  // A person presses send. Nothing leaves on a timer.
  MANUAL: 'Manual',
  // The app sends it without anybody pressing anything.
  AUTOMATIC: 'Automatic',
  // It works out what it would have done and sends nothing.
  WATCHING: 'Watching only',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A 24-hour number as a person would say it.
const clock = (h) => {
  const n = Number(h);
  if (!Number.isFinite(n)) return '';
  const hour = ((n % 24) + 24) % 24;
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
};

// "Monday to Friday", or the actual list when it is not a run.
function daysPhrase(days = []) {
  const sorted = [...new Set(days.map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!sorted.length) return 'no days';
  const isRun = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isRun && sorted.length > 2) return `${DAY_NAMES[sorted[0]]} to ${DAY_NAMES[sorted[sorted.length - 1]]}`;
  if (sorted.length === 1) return DAY_NAMES[sorted[0]];
  return sorted.map((d) => DAY_NAMES[d]).slice(0, -1).join(', ') + ' and ' + DAY_NAMES[sorted[sorted.length - 1]];
}

// The whole sending picture for one workspace.
//
// Takes the stored engine settings, not a switch name, so a caller cannot
// accidentally answer for a different workspace than the one on screen.
export function sendingState(settings = {}) {
  const policy = sendPolicy(settings);

  const first = policy.autoSendApprovedFirstEmails
    ? {
      mode: MODE.AUTOMATIC,
      detail: 'Approving a draft schedules it. It goes out on its own inside the sending hours below, without you pressing anything else.',
      // True in both modes, and worth saying in both: approving is the
      // consent, and it is the last point at which the copy can change.
      approvalSends: true,
    }
    : {
      mode: MODE.MANUAL,
      detail: 'Reviewing and approving a draft does not send it. The card then offers Send now, and that is the press that sends it.',
      approvalSends: false,
    };

  const followups = policy.autoSendApprovedFollowups
    ? {
      mode: MODE.AUTOMATIC,
      detail: 'Later emails in an approved sequence go out on their own, using only the words that were in the package when you approved it.',
      approvalSends: true,
    }
    : {
      mode: MODE.WATCHING,
      detail: 'Follow-ups are worked out but not sent. You can see what would have gone, and what stopped it, without anything leaving.',
      approvalSends: false,
    };

  return {
    first,
    followups,
    // Applies to both, and to a press of Send now: it is about the person
    // receiving the email rather than about who started it.
    window: {
      text: `${clock(policy.sendWindowStartHour)} to ${clock(policy.sendWindowEndHour)}, ${daysPhrase(policy.sendDays)}`,
      timezone: policy.workspaceTimezone,
    },
    caps: {
      daily: policy.dailySendLimit,
      hourly: policy.hourlySendLimit,
      text: `${policy.dailySendLimit} a day, ${policy.hourlySendLimit} an hour`,
    },
    // Anything true here means something can leave without a person. Used to
    // decide how loudly the panel has to say so.
    anythingAutomatic: policy.autoSendApprovedFirstEmails || policy.autoSendApprovedFollowups,
  };
}

// The one-line answer to "will pressing this send an email?".
export function willApprovingSend(settings = {}) {
  return sendingState(settings).first.approvalSends;
}
