// Turning a browser's complaint into a sentence.
//
// Today was showing Ary things like `page.goto: net::ERR_NAME_NOT_RESOLVED`
// and `Timeout 45000ms exceeded` as the headline of a card. Both are true and
// neither is useful: they say what a library felt, not what happened to her
// prospect, and a working dashboard that reads like a stack trace teaches you
// to stop reading it.
//
// So the raw text is kept, untouched, and translated for display.
//
// Deliberately a lookup table and not a model. Asking a language model to
// rewrite an error would cost money per failure, take a second, and sometimes
// invent a diagnosis. A regex either matches or it does not, and when nothing
// matches the honest answer is "something interrupted it", not a guess.

export const FAIL = {
  DNS: 'DNS',
  TIMEOUT: 'TIMEOUT',
  REFUSED: 'REFUSED',
  BLOCKED: 'BLOCKED',
  NOT_FOUND: 'NOT_FOUND',
  SERVER: 'SERVER',
  CREDITS: 'CREDITS',
  MAILBOX: 'MAILBOX',
  UNKNOWN: 'UNKNOWN',
};

// Ordered. First match wins, so the specific patterns sit above the general
// ones and "connection refused" never gets read as a plain network wobble.
const RULES = [
  {
    kind: FAIL.DNS,
    re: /ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS/i,
    title: 'Their website could not be reached',
    short: 'Domain does not resolve',
    detail: 'The address is not resolving. The site may be offline, expired, or having a bad day.',
    retry: true,
  },
  {
    kind: FAIL.TIMEOUT,
    re: /timeout|timed out|ETIMEDOUT|ERR_TIMED_OUT|exceeded.*ms/i,
    title: 'Their website took too long to load',
    short: 'Website timed out',
    detail: 'It did not finish loading before the check gave up. Nothing was changed.',
    retry: true,
  },
  {
    kind: FAIL.REFUSED,
    re: /ECONNREFUSED|ECONNRESET|ERR_CONNECTION|EPIPE|socket hang up|network error/i,
    title: 'Their website is not responding',
    short: 'Website refused the connection',
    detail: 'We could not connect to it just now.',
    retry: true,
  },
  {
    // A challenge page is not a refusal — the site would let a person in. It
    // sits above the plain-403 rule because "just a moment" pages usually
    // mention Cloudflare AND a status code, and the challenge is the more
    // actionable of the two readings.
    kind: FAIL.BLOCKED,
    re: /captcha|cloudflare|challenge|bot detection|just a moment/i,
    title: 'The site showed a bot challenge',
    short: 'Website showed a bot challenge',
    detail: 'It served a protection page instead of the real one, so the check could not finish on its own. Opening it yourself usually works.',
    retry: false,
    review: true,
  },
  {
    kind: FAIL.BLOCKED,
    re: /\b403\b|forbidden|access denied/i,
    title: 'The site blocked the automatic check',
    short: 'Website blocked the check',
    detail: 'It refused the request outright rather than showing a page.',
    retry: false,
    review: true,
  },
  {
    kind: FAIL.NOT_FOUND,
    re: /\b404\b|not found/i,
    title: 'That page is not there any more',
    short: 'Page is gone',
    detail: 'The address we have for them returns nothing.',
    retry: true,
  },
  {
    kind: FAIL.SERVER,
    re: /\b5\d\d\b|internal server error|bad gateway|service unavailable/i,
    title: 'Their website had an error',
    short: 'Website returned an error',
    detail: 'The site answered with an error of its own. Usually worth another go later.',
    retry: true,
  },
  {
    kind: FAIL.CREDITS,
    re: /credit|out of credits|budget|allowance/i,
    title: 'Waiting on credits',
    short: 'Out of credits',
    detail: 'There was not enough left to finish this one.',
    retry: false,
  },
  {
    kind: FAIL.MAILBOX,
    re: /gmail|mailbox|oauth|token|reconnect/i,
    title: 'The mailbox needs attention',
    short: 'Mailbox needs attention',
    detail: 'The connection to Gmail could not be used for this.',
    retry: false,
  },
];

const GENERIC = {
  kind: FAIL.UNKNOWN,
  title: 'The check could not finish',
  short: 'Stopped part way',
  detail: 'Something interrupted it. Nothing was sent or changed, and you can try again.',
  retry: true,
};

// Translate one raw error.
//
// Returns { kind, title, short, detail, retry, raw }. `title` is the sentence
// for a card that has room; `short` is the two-or-three-word version for a
// list line. Both are plain words — the raw text is always carried along in
// `raw` so nothing is lost, and it belongs behind a disclosure.
//
// `errorKind` is the queue's own classification and is trusted over the text
// where it is decisive: a budget stop is a budget stop whatever the message
// says. Everything else falls to the patterns.
export function friendlyError(raw, { errorKind = null } = {}) {
  const text = String(raw ?? '');

  if (errorKind === 'budget') {
    return { ...RULES.find((r) => r.kind === FAIL.CREDITS), raw: text, retry: false };
  }
  if (errorKind === 'human') {
    return {
      kind: FAIL.UNKNOWN,
      title: 'This one needs your eyes',
      short: 'Needs your eyes',
      detail: 'The background work stopped rather than guess.',
      retry: false,
      raw: text,
    };
  }

  for (const r of RULES) {
    if (r.re.test(text)) {
      const { re, ...rest } = r;
      return { ...rest, raw: text };
    }
  }
  // No guessing. An unrecognised failure gets the safe wording, and the real
  // text is one click away for whoever wants it.
  return { ...GENERIC, raw: text };
}

// Does this raw string look like something only a developer should read?
//
// Used to decide whether a detail line is safe to show as-is. Anything matching
// gets replaced by the friendly version and tucked behind the disclosure.
// `\d+\s*ms` rather than `\bms exceeded\b`: in "45000ms exceeded" there is no
// word boundary between the digits and the unit, so the obvious pattern never
// matched the single most common error on the screen.
export const looksTechnical = (raw) => /(?:page\.goto|net::|Call log:|at\s+\w+\s*\(|Error:|ERR_[A-Z_]+|\d+\s*ms\b|[A-Z]{3,}_[A-Z_]{3,})/.test(String(raw ?? ''));

// Is this failure safe to run again?
//
// A prospect who became do-not-contact, unsubscribed or a client is not a
// failed check, and offering "try again" there would offer to do something the
// guards would refuse anyway.
export function canRetry(fail, prospect = {}) {
  if (!fail?.retry) return false;
  if (prospect.do_not_contact || prospect.unsubscribed) return false;
  if (prospect.reply_type === 'decline') return false;
  if (['Client', 'Rejected', 'Not This Offer', 'Lost', 'Finished'].includes(String(prospect.stage || ''))) return false;
  return true;
}

// Everything a failure card needs, in one call.
export function failureCard(row = {}) {
  const fail = friendlyError(row.detail ?? row.last_error, { errorKind: row.errorKind ?? row.error_kind });
  return {
    ...fail,
    canRetry: canRetry(fail, row),
    // Kept whole. Truncating a raw error is how the useful half gets lost.
    technical: fail.raw || null,
    hasTechnical: Boolean(fail.raw && looksTechnical(fail.raw)),
  };
}
