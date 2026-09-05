// When may LTB say a site's booking is only a request form?
//
// Only when it found a booking flow and looked at it. Never from the absence
// of one.
//
// The bug: the emitter's chain of conditions ended in a catch-all that read
// "the site has a form and nothing above matched, therefore booking is a
// request form, not a calendar". Reaching that line means no booking control
// was found and none was followed — so the claim was made from a booking flow
// nobody had located, which is not the same as one that does not exist.
//
// James Pearson Coaching has a live Wix Bookings page at /book-online with a
// service list and a "Book your Free Discovery Call" action. The crawl never
// visited it. LTB was one approval away from telling him his booking was only
// a form, and he would have opened the email, looked at his own site, and
// known we had not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../services/audit-render/findings.mjs', import.meta.url), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The emission chain, isolated from the rest of the file.
const chain = code.slice(code.indexOf('if (anyBooking)'), code.indexOf("'no-booking'"));

test('a form alone no longer produces the claim', () => {
  // The exact shape of the false positive: form present, nothing else matched.
  assert.match(chain, /facts\.form \|\| contact\?\.form\) add\('minor', 'booking-unknown'\)/);
  assert.ok(
    !/facts\.form \|\| contact\?\.form\) addIf\(add, quoteFinding\([^)]*'booking-is-a-form'/.test(chain),
    'a form with no located booking flow must not claim the booking is a form'
  );
});

test('the claim still fires where the flow was actually inspected', () => {
  // These are the branches that earned it: the booking control was clicked and
  // no calendar appeared, or the form asks the visitor to type a time, or the
  // booking link led to the very page carrying the form.
  assert.match(chain, /bookish\?\.clicked && !bookish\.clicked\.failed/);
  assert.match(chain, /bookish\?\.asksForTime/);
  assert.match(chain, /samePath\(bookish\.href, facts\.bookingLink\.href\)/);
  // And a same-page Book button that scrolls to a form is still the claim.
  assert.match(chain, /facts\.bookingLink\?\.samePage && facts\.form && !facts\.homeCalendar/);
});

test('a real calendar still wins outright', () => {
  // Broadened by the third pass: it is no longer only the booking page's own
  // calendar that wins, but one seen anywhere the crawl looked. Behaviour for
  // all of it is covered by fixtures in booking-intent.test.mjs.
  assert.match(chain, /realBooking\) add\('good', 'booking'\)/);
});

test('an undiscovered booking flow is recorded, not spoken', () => {
  // booking-unknown exists precisely for "we could not tell". It keeps the
  // prospect on its other findings and makes no claim about booking, which is
  // the fail-closed behaviour: under-claim rather than over-claim.
  const spoken = readFileSync(new URL('../services/audit-render/capture.mjs', import.meta.url), 'utf8');
  assert.ok(
    !/'booking-unknown':\s*'[^']*calendar/i.test(spoken),
    'booking-unknown must not carry a spoken line that asserts anything about a calendar'
  );
});

test('every not-settled path reports the same verdict, not several', () => {
  // A booking control we could not follow, a link we could not resolve, and a
  // form with no located flow all mean the same thing: we do not know.
  // Four now: a control we could not follow, a link we could not resolve, a
  // flow with a further step still ahead of it, and a form with no located
  // flow. All mean the same thing — we do not know.
  const unknowns = (chain.match(/add\('minor', 'booking-unknown'\)/g) || []).length;
  assert.equal(unknowns, 4, 'all not-settled paths report not-settled');
});

test('nothing here invents a replacement reason', () => {
  // The fix removes a claim. It must not quietly add a different one in its
  // place — a prospect that loses booking-is-a-form keeps only what it
  // already had.
  const i = chain.indexOf('facts.form || contact?.form');
  const branch = chain.slice(i, i + 80);
  assert.ok(!branch.includes('quoteFinding'), 'the fallback makes no finding of its own');
  assert.match(branch, /booking-unknown/);
});

test('a booking flow with a further step is not called a request form', () => {
  // The case that survived the first fix. James Pearson Coaching: the Book
  // control was followed, the page it landed on had no calendar, and the
  // crawler recorded furtherStep TRUE — the flow continues. A service list
  // where you choose what you want before you choose when has no times on its
  // first screen by design, and that is not evidence of a request form.
  assert.match(chain, /&& !bookish\?\.furtherStep/);
  assert.match(chain, /else if \(bookish\?\.furtherStep\) add\('minor', 'booking-unknown'\)/);
});

test('typing a preferred time is still the claim, whatever comes next', () => {
  // asksForTime is positive evidence of request-form behaviour, so it must not
  // be gated behind furtherStep — a form that asks the visitor to name a time
  // is the thing being described, not a step on the way to a calendar.
  const i = chain.indexOf('bookish?.asksForTime');
  const j = chain.indexOf('!bookish?.furtherStep');
  assert.ok(i !== -1 && j !== -1 && i < j, 'asksForTime is evaluated on its own');
  assert.match(chain, /bookish\?\.asksForTime \|\|/);
});
