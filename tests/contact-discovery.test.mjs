import test from 'node:test';
import assert from 'node:assert/strict';
import { associate, adoptable, candidatesFrom, choosePrimary, ASSOCIATION, CONFIDENCE } from '../lib/contact-discovery.mjs';

// Every case below came out of a live pilot over fifty real 💚 prospects.
// The extractor found fourteen addresses and about half belonged to somebody
// else, which is the reason this module exists.

test('the addresses the pilot got wrong are all refused', () => {
  const wrong = [
    // A Square template's placeholder, on two different prospects' sites.
    ['hi@mystore.com', 'skylarsmassagesanctuary.square.site'],
    ['hi@mystore.com', 'summerlinbodytherapeutics.square.site'],
    // The foundry that made the site's font, out of a licence comment.
    ['info@indiantypefoundry.com', 'www.5280nativelawnmaintenance.com'],
    // A roofer in Dallas, on a San Jose roofer's site. Same template, and the
    // designer never changed the footer.
    ['info@starroofersdallas.com', 'swiftrooferssanjose.com'],
    // Two businesses that simply are not this business.
    ['contact@sansoxygen.com', 'vidanaturopathics.com'],
    ['cori@marsholisticwellness.com', 'slclifecoaching.com'],
  ];
  for (const [email, site] of wrong) {
    const a = associate(email, site);
    assert.equal(adoptable(a.association), false, `${email} on ${site} would have been emailed`);
  }
});

test('the addresses the pilot got right are all kept', () => {
  const right = [
    ['danika@softissue.site', 'softissue.site', ASSOCIATION.SAME_DOMAIN],
    ['info@thefastfitness.com', 'thefastfitness.com', ASSOCIATION.SAME_DOMAIN],
    ['allison@true2al.com', 'true2al.com', ASSOCIATION.SAME_DOMAIN],
    // Personal inboxes the owners published on their own sites. Discarding
    // these would throw away the most contactable prospects there are.
    ['owariman@gmail.com', 'kubolifecoaching.com.au', ASSOCIATION.OWNER_EXTERNAL],
    ['milenabbrandao@gmail.com', 'wecareassistedliving.com', ASSOCIATION.OWNER_EXTERNAL],
  ];
  for (const [email, site, expected] of right) {
    const a = associate(email, site);
    assert.equal(a.association, expected, `${email} on ${site}`);
    assert.equal(adoptable(a.association), true);
  }
});

test('a platform subdomain is UNKNOWN, not a match and not a rejection', () => {
  // hello@skinbyliz.com on skinwaxspecialist.glossgenius.com is probably
  // theirs: GlossGenius is a booking platform and skinbyliz is likely their
  // real domain. Probably is not good enough to email automatically, and it is
  // far too good to throw away.
  const a = associate('hello@skinbyliz.com', 'skinwaxspecialist.glossgenius.com');
  assert.equal(a.association, ASSOCIATION.UNKNOWN);
  assert.equal(adoptable(a.association), false);
  assert.match(a.why, /no domain of their own/);
});

test('a subdomain of their own site still counts as theirs', () => {
  // Not example.com: "hello@example.com" is the canonical placeholder and is
  // refused as junk, which is correct and makes it a bad fixture.
  assert.equal(associate('hello@bloomstudio.com', 'shop.bloomstudio.com').association, ASSOCIATION.SAME_DOMAIN);
  assert.equal(associate('hello@mail.bloomstudio.co.uk', 'www.bloomstudio.co.uk').association, ASSOCIATION.SAME_DOMAIN);
});

test('candidates are ranked, not first-come', () => {
  // The bug in one line: the old extractor returned whichever address appeared
  // first in the HTML, and a designer's credit is usually above the footer.
  const html = `
    <a href="mailto:studio@webdesigner.example">site by us</a>
    <p>Reach us at hello@realbusiness.com</p>`;
  const c = candidatesFrom(html, 'realbusiness.com');
  assert.equal(c[0].value, 'hello@realbusiness.com');
  assert.equal(c[0].association, ASSOCIATION.SAME_DOMAIN);
  assert.equal(c[0].confidence, CONFIDENCE.SOURCE_CONFIRMED);
  // The designer is kept as a candidate, not silently dropped.
  assert.ok(c.some((x) => x.value === 'studio@webdesigner.example'));
});

test('published is not verified', () => {
  // Native extraction proves the business printed the address on their site.
  // It proves nothing about whether the mailbox exists.
  const c = candidatesFrom('<a href="mailto:hi@example.com">hi</a>', 'example.com');
  assert.equal(c[0].confidence, CONFIDENCE.SOURCE_CONFIRMED);
  assert.notEqual(c[0].confidence, CONFIDENCE.VERIFIED);
});

test('obfuscated addresses are decoded, invented ones are not', () => {
  const c = candidatesFrom('<p>jane [at] bloomstudio [dot] com</p>', 'bloomstudio.com');
  assert.equal(c[0]?.value, 'jane@bloomstudio.com');
  // Nothing that is not actually an address becomes one.
  assert.equal(candidatesFrom('<p>call us on 555 1234</p>', 'bloomstudio.com').length, 0);
});

test('role noise never becomes a contact', () => {
  const html = ['postmaster', 'abuse', 'privacy', 'dpo', 'no-reply', 'webmaster']
    .map((r) => `<a href="mailto:${r}@example.com">x</a>`).join('');
  assert.equal(candidatesFrom(html, 'example.com').length, 0);
});

test('a general inbox is a real contact for a solo business', () => {
  // "info@ is low quality" is agency thinking. For one person running a
  // massage practice, info@ is where they read their email.
  const c = candidatesFrom('<a href="mailto:info@example.com">contact</a>', 'example.com');
  assert.equal(choosePrimary(c).primary.value, 'info@example.com');
});

test('nothing adoptable produces a null primary and asks for a person', () => {
  const c = candidatesFrom('<a href="mailto:info@someoneelse.com">x</a>', 'realbusiness.com');
  const p = choosePrimary(c);
  assert.equal(p.primary, null);
  assert.equal(p.needsHuman, true);
  assert.match(p.reason, /none of them can be shown to belong/);
});

test('an empty page asks for nobody', () => {
  const p = choosePrimary([]);
  assert.equal(p.primary, null);
  assert.equal(p.needsHuman, false, 'no address is a finished search, not a decision');
});
