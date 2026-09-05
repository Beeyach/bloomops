import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuditNotes } from '../lib/audit-profile.mjs';

const EMOJI_NOTE = `🏷️ RATING: STRONG

📍 Business: Elisa the Coach (Elisa Dibble Coaching, LLC)
🌐 Platform: Wix one-page site at elisathecoach.com + a second GoHighLevel site
🔧 Tools detected: GoHighLevel (LeadConnector assets), a Google Calendar link
💱 Likely currency: USD - Denver, Colorado address

📊 ACTIVITY SIGNALS
- Google reviews: Google Business Profile exists; count not verifiable
- Social media: Instagram @elisathecoach and LinkedIn linked from the site

🔎 SITE AUDIT
- Booking: ✅ VERIFIED VISIBLE - BOOK A CONSULT links to go.elisathecoach.com
- Contact form: ❌ BROKEN - submit answers 404`;

test('parses the emoji-headed template into rating, fields and sections', () => {
  const p = parseAuditNotes(EMOJI_NOTE);
  assert.equal(p.rating, 'STRONG');
  assert.deepEqual(p.fields.map((f) => f.label), ['Business', 'Platform', 'Tools', 'Currency']);
  assert.ok(p.fields[1].value.startsWith('Wix one-page site'));
  assert.equal(p.sections.length, 2);
  assert.equal(p.sections[0].title, 'Activity signals');
  assert.equal(p.sections[0].items[0].label, 'Google reviews');
  assert.equal(p.sections[1].items[0].status, 'good');
  assert.equal(p.sections[1].items[1].status, 'bad');
  assert.equal(p.leftover, '');
});

const PLAIN_NOTE = `RATING: STRONG

Business: Results Hypnotherapy (Amy Koford), Farmington UT
Platform: Framer (both amykoford.com and bookamyk.com)
Likely currency: USD. Farmington, UT address,
+1 801-425-3362, .com domain.

DEAD-ADDRESS CHECK: Not dead. Real business site, full nav, services.

ACTIVITY SIGNALS
- Google reviews: 62, 5.0 average (via Birdeye aggregation)
- Site freshness: no copyright year visible`;

test('parses the plain variant, with wrapped field continuations', () => {
  const p = parseAuditNotes(PLAIN_NOTE);
  assert.equal(p.rating, 'STRONG');
  const currency = p.fields.find((f) => f.label === 'Currency');
  assert.ok(currency.value.includes('801-425-3362'));
  const dead = p.fields.find((f) => f.label === 'Dead-address check');
  assert.ok(dead.value.startsWith('Not dead'));
  assert.equal(p.sections[0].items.length, 2);
});

test('unrecognized prose lands in leftover, never dropped', () => {
  const p = parseAuditNotes('Some hand-written aside about the owner.\n\nRATING: MAYBE');
  assert.equal(p.rating, 'MAYBE');
  assert.equal(p.leftover, 'Some hand-written aside about the owner.');
});

test('empty and null notes return an empty profile', () => {
  assert.deepEqual(parseAuditNotes(null), { rating: null, fields: [], sections: [], leftover: '' });
});
