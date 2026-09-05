// An enquiry does not have to start on their website.
//
// resilientintimacy.com has no HTML form on its contact page, so the enquiry
// chain reached "contact page has no form" and the planner turned that into a
// lead-capture gap. Her home page carries "Request an Appointment" pointing at
// kori-hennessy.clientsecure.me, a SimplePractice client portal. The intake
// path exists, it is deliberate, and it is off her site.
//
// The chain that produced it consulted facts.form, contact.form, facts.email
// and contact.email, and nothing else. No link, no destination, no scheduler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveFindings } from '../services/audit-render/findings.mjs';
import { SCHEDULER_URL } from '../services/audit-render/booking-intent.mjs';

const keys = ({ facts = {}, pages = [], checks = {} } = {}) =>
  deriveFindings(
    { form: null, email: null, contactPage: null, bookingLink: null, links: [], navLinks: [], ...facts },
    pages,
    { bodyChars: 900, quoteLed: false, booking: null, ...checks }
  ).map((f) => f.key);

// A contact page that was opened and has neither a form nor an address on it.
const CONTACT_PAGE = { kind: 'contact', href: 'https://x.com/contact', form: null, email: null };
const link = (href, text = 'Request an Appointment') => ({ href, text });

const NO_FORM = 'contact-page-no-form';
const OFFSITE = 'enquiry-offsite';

// ── the site that caused this ────────────────────────────────────────────

test('Resilient Intimacy: a SimplePractice portal is an enquiry path', () => {
  const k = keys({
    facts: { links: [link('https://kori-hennessy.clientsecure.me/')] },
    pages: [CONTACT_PAGE],
  });
  assert.ok(!k.includes(NO_FORM), 'the false claim is gone');
  assert.ok(k.includes(OFFSITE), 'and the real path is recorded instead');
});

test('the same site without the portal link still reports the missing form', () => {
  // The rule has to be doing work, not blanket-suppressing.
  const k = keys({ facts: { links: [link('https://instagram.com/her', 'Instagram')] }, pages: [CONTACT_PAGE] });
  assert.ok(k.includes(NO_FORM));
});

test('clientsecure.me is recognised on a subdomain and not by substring', () => {
  assert.ok(SCHEDULER_URL.test('https://kori-hennessy.clientsecure.me/'), 'subdomain matches');
  assert.ok(SCHEDULER_URL.test('https://clientsecure.me/x'), 'bare host matches');
  assert.ok(!SCHEDULER_URL.test('https://notclientsecure.me.example.com/'), 'a host merely containing it does not');
});

// ── the other supported intake hosts ─────────────────────────────────────

test('the known scheduling hosts all count as an enquiry path', () => {
  const hosts = [
    'https://calendly.com/her/intro',
    'https://her.as.me/schedule',
    'https://app.acuityscheduling.com/schedule.php?owner=1',
    'https://her.janeapp.com/',
    'https://www.practicebetter.io/#/x/booking',
    'https://her.clientsecure.me/',
  ];
  for (const href of hosts) {
    const k = keys({ facts: { links: [link(href)] }, pages: [CONTACT_PAGE] });
    assert.ok(!k.includes(NO_FORM), href);
    assert.ok(k.includes(OFFSITE), href);
  }
});

test('a booking link straight to a scheduler counts', () => {
  const k = keys({
    facts: { bookingLink: { text: 'Book a Call', href: 'https://calendly.com/her/30min', samePage: false } },
    pages: [CONTACT_PAGE],
  });
  assert.ok(!k.includes(NO_FORM));
});

test('a click that landed on a scheduler counts', () => {
  const k = keys({
    pages: [CONTACT_PAGE, { kind: 'page', href: 'https://x.com/a', clicked: { text: 'Book', landedOn: 'https://her.as.me/schedule/1' } }],
  });
  assert.ok(!k.includes(NO_FORM));
});

// ── what must NOT count ──────────────────────────────────────────────────

test('unrelated external links are not an enquiry path', () => {
  const notPaths = [
    ['https://instagram.com/her', 'Instagram'],
    ['https://facebook.com/her', 'Facebook'],
    ['https://www.mindbodygreen.com/articles/x', 'As seen in MindBodyGreen'],
    ['https://example.com/blog/how-to-book-a-therapist', 'How to book a therapist'],
    ['https://x.com/login', 'Client login'],
  ];
  for (const [href, text] of notPaths) {
    const k = keys({ facts: { links: [link(href, text)] }, pages: [CONTACT_PAGE] });
    assert.ok(k.includes(NO_FORM), `${text} must not suppress the finding`);
  }
});

test('a press mention of a scheduling provider by name does not count', () => {
  // The words are in the link text, not the host. Only the destination counts.
  const k = keys({
    facts: { links: [link('https://www.somemagazine.com/best-calendly-alternatives', 'We were featured: Calendly alternatives')] },
    pages: [CONTACT_PAGE],
  });
  assert.ok(k.includes(NO_FORM));
});

// ── the branches above it are untouched ──────────────────────────────────

test('a real form still wins outright', () => {
  const k = keys({ facts: { form: { sel: 'f' }, links: [link('https://calendly.com/her')] }, pages: [CONTACT_PAGE] });
  assert.ok(k.includes('form'));
  assert.ok(!k.includes(NO_FORM));
  assert.ok(!k.includes(OFFSITE), 'the stronger positive finding is the one reported');
});

test('an email address on the contact page still reports email-only', () => {
  const k = keys({ pages: [{ ...CONTACT_PAGE, email: { text: 'her@x.com' } }] });
  assert.ok(k.includes('contact-page-email-only'));
  assert.ok(!k.includes(NO_FORM));
});

test('"no way to contact them" cannot survive a working intake link', () => {
  // The strongest wording on the list, and the worst one to be wrong about.
  const withPortal = keys({ facts: { links: [link('https://her.clientsecure.me/')] }, pages: [] });
  assert.ok(!withPortal.includes('no-contact'), 'a portal means there is a way');
  const without = keys({ facts: { links: [] }, pages: [] });
  assert.ok(without.includes('no-contact'), 'and without one the claim still stands');
});

// ── Cynthia must not regress ─────────────────────────────────────────────

test('Cynthia: no form, no scheduling link, so the finding stands', () => {
  // openheartsopenmindscounseling.com, reduced to what the crawl returned:
  // a contact page with no form, no inputs, no iframes and no scheduling link.
  // Her approved package rests on this finding and it must survive.
  const k = keys({
    facts: {
      form: null, email: null, links: [], navLinks: [],
      bookingLink: null,
    },
    pages: [{ kind: 'contact', href: 'https://www.openheartsopenmindscounseling.com/information-contact-request', form: null, email: null, hasCalendar: true }],
  });
  assert.ok(k.includes(NO_FORM), 'Cynthia keeps her verified finding');
  assert.ok(!k.includes(OFFSITE));
});

// ── the finding stays silent ─────────────────────────────────────────────

test('enquiry-offsite is recorded and never spoken', () => {
  const found = deriveFindings(
    { form: null, email: null, links: [link('https://her.clientsecure.me/')], navLinks: [], bookingLink: null },
    [CONTACT_PAGE],
    { bodyChars: 900 }
  );
  const f = found.find((x) => x.key === OFFSITE);
  assert.equal(f.severity, 'minor', 'minor findings are never narrated');
  assert.equal(f.ok, false, 'and it is not a compliment either');
});
