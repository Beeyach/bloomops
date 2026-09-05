// The third booking-friction pass, tested on behaviour rather than on source.
//
// The first two passes were guarded by assertions about the shape of the code,
// which is how both of them shipped while still being wrong: the chain matched
// the expected text and produced the wrong answer on a real site. These run the
// real functions over the real data those sites returned.
//
// Two rules are under test.
//
//   1. The token "book" is not appointment intent. "The Book" is a book.
//   2. Positive evidence of a real calendar, from anywhere the crawl looked,
//      beats the negative inference that booking is only a request form.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentIntent } from '../services/audit-render/booking-intent.mjs';
import { deriveFindings } from '../services/audit-render/findings.mjs';

// Enough of a page for the booking chain to run. Everything it does not read is
// left out on purpose, so a fixture says only what it means.
const derive = ({ facts = {}, pages = [], checks = {} } = {}) =>
  deriveFindings(
    { form: null, homeCalendar: false, bookingLink: null, ...facts },
    pages,
    { bodyChars: 900, quoteLed: false, booking: null, ...checks }
  ).map((f) => f.key);

// ── 1. A literal book is not an appointment ──────────────────────────────

test('the nav item "The Book" is not a booking control', () => {
  // laraschilken.com. The book she is writing, matched as a way to book her.
  assert.equal(appointmentIntent('The Book', 'https://www.laraschilken.com/'), false);
});

test('other ways of naming a book are not booking controls either', () => {
  for (const t of ['My Book', 'New Book', 'Support my Book', 'Book launch',
    'Book waitlist', 'Join the book waitlist', 'Pre-order the book', 'Book Club']) {
    assert.equal(appointmentIntent(t, '/'), false, `"${t}" is not appointment intent`);
  }
});

test('a literal /book route is not a booking control', () => {
  assert.equal(appointmentIntent('Read an excerpt', 'https://example.com/book'), false);
});

test('an appointment verb with something to book is intent', () => {
  for (const t of ['Book a Call', 'Book a Session', 'Book an Appointment',
    'Book Your Consultation', 'Schedule a Call', 'Reserve a Session',
    'Book your free discovery call', 'Request a consultation']) {
    assert.equal(appointmentIntent(t, '/'), true, `"${t}" is appointment intent`);
  }
});

test('an unmistakable imperative is intent', () => {
  for (const t of ['Book Now', 'Book Online', 'Schedule Now', 'Book with me']) {
    assert.equal(appointmentIntent(t, '/'), true, `"${t}" is appointment intent`);
  }
});

test('a link into a scheduling tool is intent whatever it says', () => {
  assert.equal(appointmentIntent('Start here', 'https://sabinelehnhardt.as.me/?appointmentType=1'), true);
  assert.equal(appointmentIntent('Get going', 'https://calendly.com/someone/30min'), true);
});

test('a bare ambiguous "Book" claims nothing', () => {
  // Not a booking control, and therefore not a request form either. The site
  // ends up with booking unknown, which is the honest answer.
  assert.equal(appointmentIntent('Book', '/'), false);
  assert.equal(appointmentIntent('Books', '/books'), false);
});

test('a MindBodyGreen press link is not a Mindbody booking tool', () => {
  // The host is what matters. mindbodygreen.com is a magazine.
  assert.equal(appointmentIntent('As seen in MindBodyGreen', 'https://www.mindbodygreen.com/articles/x'), false);
  assert.equal(appointmentIntent('Book', 'https://clients.mindbodyonline.com/classic/ws'), true);
});

// ── 2. A real calendar outranks a form ───────────────────────────────────

const REQUEST_FORM = 'booking-is-a-form';

test('a calendar on a followed page kills the negative claim', () => {
  // sabinelehnhardt.com, reduced to the fields the chain reads. The home page
  // has no calendar and has a form; four crawled pages all have one.
  const keys = derive({
    facts: {
      form: { sel: 'f', asksAboutJob: true },
      homeCalendar: false,
      bookingLink: { text: 'Book your free Session', samePage: true, href: 'https://sabinelehnhardt.as.me/?appointmentType=77702267' },
    },
    pages: [
      { kind: 'contact', href: 'https://x.com/contact-me', hasCalendar: true, furtherStep: true, form: { fields: 6 } },
      { kind: 'page', href: 'https://x.com/podcast', hasCalendar: true, furtherStep: true },
    ],
  });
  assert.ok(!keys.includes(REQUEST_FORM), 'a site with a live calendar is not a request form');
  assert.ok(keys.includes('booking'), 'the calendar is recognised as real booking');
});

test('a contact form elsewhere does not outrank a followed calendar', () => {
  const keys = derive({
    facts: { form: { sel: 'f' }, homeCalendar: false, bookingLink: { samePage: true, href: '/x' } },
    pages: [{ kind: 'contact', href: 'https://x.com/contact', hasCalendar: true, form: { fields: 5 } }],
  });
  assert.ok(!keys.includes(REQUEST_FORM));
});

test('any one booking-relevant page with a calendar is enough', () => {
  const keys = derive({
    facts: { form: { sel: 'f' }, homeCalendar: false, bookingLink: { samePage: true, href: '/x' } },
    pages: [
      { kind: 'page', href: 'https://x.com/a', hasCalendar: false },
      { kind: 'page', href: 'https://x.com/b', hasCalendar: false },
      { kind: 'page', href: 'https://x.com/c', hasCalendar: true },
    ],
  });
  assert.ok(!keys.includes(REQUEST_FORM));
});

test('landing on a scheduling tool is a real booking flow', () => {
  // hasCalendar can be false if the calendar renders late. Where the click
  // actually landed still settles it.
  const keys = derive({
    facts: { form: { sel: 'f' }, homeCalendar: false, bookingLink: { samePage: true, href: '/x' } },
    pages: [{
      kind: 'page', href: 'https://x.com/a', hasCalendar: false, furtherStep: true,
      clicked: { text: 'Book your free Session', landedOn: 'https://sabinelehnhardt.as.me/schedule/0fef2bbe/appointment/71713895/calendar/8731280' },
    }],
  });
  assert.ok(!keys.includes(REQUEST_FORM));
});

test('a booking link straight into a scheduler is a real booking flow', () => {
  const keys = derive({
    facts: {
      form: { sel: 'f' }, homeCalendar: false,
      bookingLink: { samePage: true, href: 'https://calendly.com/her/intro' },
    },
    pages: [{ kind: 'page', href: 'https://x.com/a', hasCalendar: false }],
  });
  assert.ok(!keys.includes(REQUEST_FORM));
});

// ── 3. Genuine request forms must survive all of that ────────────────────

test('Player One Start still gets the claim', () => {
  // The control case, and the only one of the thirteen that ever earned it.
  // "Book a Call" leads to a contact page with a four-field form, no calendar
  // anywhere, and no further step.
  const keys = derive({
    facts: {
      form: null, homeCalendar: false,
      bookingLink: { text: 'Book a Call', samePage: false, href: 'https://playeronestart.io/contact' },
    },
    pages: [{
      kind: 'contact', href: 'https://playeronestart.io/contact', hasCalendar: false,
      asksForTime: false, furtherStep: false, clicked: null, form: { fields: 4 },
    }],
  });
  assert.ok(keys.includes(REQUEST_FORM), 'a followed booking path ending at a form is still the claim');
});

test('a form that asks the visitor to type a time is still the claim', () => {
  const keys = derive({
    facts: { form: null, homeCalendar: false, bookingLink: { samePage: false, href: 'https://x.com/book-now' } },
    pages: [{
      kind: 'contact', href: 'https://x.com/book-now', hasCalendar: false,
      asksForTime: true, furtherStep: false, form: { fields: 5 },
    }],
  });
  assert.ok(keys.includes(REQUEST_FORM));
});

test('a same-page booking CTA scrolling to a form is still the claim', () => {
  const keys = derive({
    facts: {
      form: { sel: 'f' }, homeCalendar: false,
      bookingLink: { text: 'Book a Conversation', samePage: true, href: 'https://x.com/' },
    },
    pages: [],
  });
  assert.ok(keys.includes(REQUEST_FORM));
});

// ── 4. What the first two passes fixed stays fixed ───────────────────────

test('a booking flow with a further step is still not a request form', () => {
  // James Pearson Coaching.
  const keys = derive({
    facts: { form: { sel: 'f' }, homeCalendar: false, bookingLink: { samePage: false, href: 'https://x.com/book-online' } },
    pages: [{
      kind: 'page', href: 'https://x.com/book-online', hasCalendar: false, furtherStep: true,
      clicked: { text: 'Book your Free Discovery Call', landedOn: 'https://go.x.coach/discoverycall' },
    }],
  });
  assert.ok(!keys.includes(REQUEST_FORM));
});

test('a form alone still claims nothing about booking', () => {
  const keys = derive({ facts: { form: { sel: 'f' } }, pages: [] });
  assert.ok(!keys.includes(REQUEST_FORM));
  assert.ok(keys.includes('booking-unknown'));
});

test('unknown is recorded and never spoken', () => {
  const keys = derive({ facts: { form: { sel: 'f' } }, pages: [] });
  const unknown = deriveFindings({ form: { sel: 'f' } }, [], { bodyChars: 900 })
    .find((f) => f.key === 'booking-unknown');
  assert.equal(unknown.severity, 'minor', 'minor findings are never narrated');
  assert.ok(!keys.includes('no-booking'), 'and it is not replaced by a different claim');
});
