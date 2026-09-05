// What counts as an appointment-booking control, and what merely says "book".
//
// This exists because the word was treated as the intent three separate times
// and produced three separate false claims about real businesses:
//
//   • `/book` matched a literal book an author was writing
//   • `mindbody` matched a MindBodyGreen press link
//   • the nav item "The Book" matched a book, and the book's waitlist form was
//     then reported as her booking being a request form and not a calendar
//
// Each was fixed where it was found, which is why there were three. The rule
// underneath all of them is one rule, so it lives in one file: intent has to be
// stated, never inferred from a token. An appointment verb needs something to
// book. An imperative needs to be unmistakably an imperative. A noun qualifies
// only when it cannot mean anything else. And a link into a scheduling tool is
// a booking link whatever its text says.
//
// Everything not matched here is left unknown rather than claimed. That is the
// deliberate direction: under-claiming costs nothing, and telling somebody
// their booking is broken when it is not costs the reply.

// The thing being booked. "Book a call", not "book".
const OBJECT =
  '(call|session|appointment|appt|consult|consultation|meeting|meet|class|slot|time|visit|demo|chat|discovery|intake|assessment|treatment|tour|fitting)';

// Verbs that can take an appointment as their object. None of them is enough
// on its own, which is the entire point.
const VERB = '(book|schedule|reserve|arrange|request)';

export const APPOINTMENT_TEXT = [
  // Book a call. Schedule your free session. Reserve a time.
  new RegExp(`\\b${VERB}\\b[^.]{0,24}\\b${OBJECT}\\b`, 'i'),
  // Book now. Schedule online. Book with me. An imperative with nowhere else
  // to go: nobody writes "the book now" about a book.
  new RegExp(`\\b${VERB}\\s+(now|online|today|here|with)\\b`, 'i'),
  /\bmake\s+an?\s+appointment\b/i,
  // Nouns that are appointments and cannot be anything else. "Book" is
  // deliberately absent from this list; that absence is the fix.
  /\b(appointments?|consultations?|complimentary call|free (call|consult|consultation|session))\b/i,
  /\b(check availability|see times|view availability)\b/i,
];

// Hosts that only exist to schedule appointments or take intake. `.as.me` is
// Acuity's short host, and its absence is how a site with a live Acuity
// calendar reached the request-form branch at all.
//
// `clientsecure.me` is SimplePractice's client portal, and its absence is how
// resilientintimacy.com was told it had no way to take an enquiry while a
// "Request an Appointment" button pointed straight at one. Anchored on a dot or
// a slash so a host merely containing the string cannot match.
export const SCHEDULER_URL =
  /calendly|acuityscheduling|\.as\.me|(?:\/\/|\.)clientsecure\.me|squareup\.com\/appointments|square\.site\/book|setmore|vagaro|mindbodyonline|booksy|schedulicity|simplybook|fresha|gettimely|janeapp|cliniko|practicebetter|appointlet|youcanbook\.me|picktime|bookeo|checkfront|tidycal|savvycal|(?:\/\/|\.)cal\.com|koalendar|zcal\.co|oncehub|scheduleonce|timetap|hubspot\.com\/meetings|meetings\.hubspot|book\.stripe\.com/i;

// The same question asked of a URL rather than a string, which is a different
// question and the one that matters when the answer suppresses a finding.
//
// `somemagazine.com/best-calendly-alternatives` matches the pattern above,
// because the provider's name is in the path of a press article. Read as
// evidence that a business has a working intake path, that is the MindBodyGreen
// mistake again: a magazine link standing in for a booking tool.
//
// So the host is what counts, anchored at a label boundary so a subdomain like
// `kori-hennessy.clientsecure.me` matches and `notclientsecure.me.evil.com`
// does not. The handful of providers that live on a path of a shared domain are
// listed separately, because for those the host alone says nothing.
const SCHEDULER_HOST = /(^|\.)(calendly\.com|acuityscheduling\.com|as\.me|clientsecure\.me|setmore\.com|vagaro\.com|mindbodyonline\.com|booksy\.com|schedulicity\.com|simplybook\.(me|it)|fresha\.com|gettimely\.com|janeapp\.com|cliniko\.com|practicebetter\.io|appointlet\.com|youcanbook\.me|picktime\.com|bookeo\.com|checkfront\.com|tidycal\.com|savvycal\.com|cal\.com|koalendar\.com|zcal\.co|oncehub\.com|scheduleonce\.com|timetap\.com|book\.stripe\.com)$/i;

const SCHEDULER_PATH = /squareup\.com\/appointments|square\.site\/book|hubspot\.com\/meetings|meetings\.hubspot\.com/i;

export function isSchedulerUrl(u) {
  const s = String(u || '').trim();
  if (!s) return false;
  let host = '';
  try { host = new URL(s).hostname; } catch { return false; }
  return SCHEDULER_HOST.test(host) || SCHEDULER_PATH.test(s);
}

// Does this control offer to book an appointment?
//
// `href` wins when it points at a scheduling tool, because a link into Acuity
// is a booking link however the button is labelled. Otherwise the visible text
// has to say so.
export function appointmentIntent(text, href) {
  if (href && SCHEDULER_URL.test(String(href))) return true;
  const t = String(text || '').trim();
  if (!t) return false;
  return APPOINTMENT_TEXT.some((re) => re.test(t));
}

// The sources, for the two places that run this inside page.evaluate and
// cannot close over a module import. Rebuilt browser-side from these strings so
// there is still only one set of patterns.
export const INTENT_SOURCES = {
  text: APPOINTMENT_TEXT.map((re) => re.source),
  scheduler: SCHEDULER_URL.source,
};
