import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverContact, candidatesOnPage, otherContactsOnPage, contactLinks, visibleHtml,
  ownerContext, nextRefresh, activityLine, RESULT, CONTACT_TYPE, PAGE_BUDGET, REFRESH_DAYS,
} from '../lib/contact-job.mjs';
import { ASSOCIATION } from '../lib/contact-discovery.mjs';

const page = (html) => ({ ok: true, status: 200, html });
const fetcher = (map) => async (url) => map[url] || { ok: false, status: 404 };

// ── The context rule ─────────────────────────────────────────────────────

test('a personal address is only the owner when the page says so', () => {
  // The gap the first version had: any free-provider address anywhere on the
  // site was adopted. A designer's own Gmail in a footer credit and the
  // owner's Gmail under "Email me:" are the same string.
  const published = candidatesOnPage(
    '<p>Email me: jane@gmail.com</p>', { domain: 'clinic.com', url: 'https://clinic.com' }
  );
  assert.equal(published[0].relationship, ASSOCIATION.OWNER_EXTERNAL);

  const credit = candidatesOnPage(
    '<footer>Site designed by Pixel Studio, jane@gmail.com</footer>', { domain: 'clinic.com', url: 'https://clinic.com' }
  );
  assert.equal(credit[0].relationship, ASSOCIATION.UNKNOWN, 'a designer credit is not an owner contact');
  assert.match(credit[0].why, /designer|licence|vendor/i);

  const bare = candidatesOnPage(
    '<div>jane@gmail.com</div>', { domain: 'clinic.com', url: 'https://clinic.com' }
  );
  assert.equal(bare[0].relationship, ASSOCIATION.UNKNOWN, 'no context is not enough');
});

test('addresses hidden in scripts, styles and comments are not published', () => {
  // Every third-party address the pilot found came from one of these three.
  const html = `
    <!-- old contact: ghost@previousclient.com -->
    <script>var support = "dev@agency.com";</script>
    <style>/* font licence: info@typefoundry.com */</style>
    <p>Contact us: hello@clinic.com</p>`;
  const c = candidatesOnPage(html, { domain: 'clinic.com', url: 'https://clinic.com' });
  assert.deepEqual(c.map((x) => x.value), ['hello@clinic.com']);
});

test('the same-domain address needs no context to be theirs', () => {
  const c = candidatesOnPage('<div>hello@clinic.com</div>', { domain: 'clinic.com', url: 'https://clinic.com' });
  assert.equal(c[0].relationship, ASSOCIATION.SAME_DOMAIN);
});

test('a platform-hosted site can still prove ownership from the page', () => {
  // skinbyliz.com on a glossgenius.com booking page was UNKNOWN on hostname
  // alone. Under "Email me:" it is not a guess any more.
  const c = candidatesOnPage(
    '<p>Email me: hello@skinbyliz.com</p>',
    { domain: 'skinwaxspecialist.glossgenius.com', url: 'https://skinwaxspecialist.glossgenius.com' }
  );
  assert.equal(c[0].relationship, ASSOCIATION.OWNER_EXTERNAL);
  const bare = candidatesOnPage(
    '<div>hello@skinbyliz.com</div>',
    { domain: 'skinwaxspecialist.glossgenius.com', url: 'https://skinwaxspecialist.glossgenius.com' }
  );
  assert.equal(bare[0].relationship, ASSOCIATION.UNKNOWN, 'plausible is not proven');
});

test('a name beside the address is captured', () => {
  const c = candidatesOnPage(
    '<div class="card"><h3>Danika Rowe</h3><p>Contact: danika@softissue.site</p></div>',
    { domain: 'softissue.site', url: 'https://softissue.site/team', pageType: 'team' }
  );
  assert.equal(c[0].personName, 'Danika Rowe');
});

// ── Bounded discovery ────────────────────────────────────────────────────

test('only real internal links that look like contact pages are followed', () => {
  const html = `
    <a href="/contact">Contact</a>
    <a href="/about">About us</a>
    <a href="/blog/post-1">A blog post</a>
    <a href="https://facebook.com/them">Facebook</a>
    <a href="/pricing">Pricing</a>`;
  const links = contactLinks(html, 'https://clinic.com');
  const urls = links.map((l) => l.url);
  assert.ok(urls.includes('https://clinic.com/contact'));
  assert.ok(urls.includes('https://clinic.com/about'));
  assert.ok(!urls.some((u) => u.includes('/blog/')), 'a blog post is not a contact page');
  assert.ok(!urls.some((u) => u.includes('facebook')), 'external links are not crawled');
  assert.equal(links[0].pageType, 'contact', 'the contact page is tried first');
});

test('the page budget is real', async () => {
  // Guessing paths would burst 404s across somebody's small business hosting.
  let fetched = 0;
  const many = Array.from({ length: 20 }, (_, i) => `<a href="/contact-${i}">Contact ${i}</a>`).join('');
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: async (url) => { fetched += 1; return url.endsWith('clinic.com') ? page(many) : page('<p>nothing</p>'); },
  });
  assert.ok(fetched <= PAGE_BUDGET, `fetched ${fetched}, budget ${PAGE_BUDGET}`);
  assert.equal(r.result, RESULT.NO_CONTACT_FOUND);
});

test('a homepage that answers stops the crawl', async () => {
  let fetched = 0;
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: async () => { fetched += 1; return page('<a href="/contact">Contact</a><p>hello@clinic.com</p>'); },
  });
  assert.equal(fetched, 1, 'no reason to fetch the contact page');
  assert.equal(r.result, RESULT.SAFE_EMAIL);
});

test('a homepage with nothing sends it to the contact page', async () => {
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: fetcher({
      'https://clinic.com': page('<a href="/contact">Contact</a><p>welcome</p>'),
      'https://clinic.com/contact': page('<p>Email us: hello@clinic.com</p>'),
    }),
  });
  assert.equal(r.result, RESULT.SAFE_EMAIL);
  assert.equal(r.primary.value, 'hello@clinic.com');
  assert.equal(r.primary.sourcePageType, 'contact');
  assert.equal(r.pagesChecked, 2);
});

// ── Results are distinct ─────────────────────────────────────────────────

test('could not look and looked and found nothing are different answers', async () => {
  const dead = await discoverContact({ id: 1, domain: 'gone.com' }, {
    fetchPage: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(dead.result, RESULT.SITE_DEAD);

  const blocked = await discoverContact({ id: 1, domain: 'walled.com' }, {
    fetchPage: async () => ({ ok: false, status: 403 }),
  });
  assert.equal(blocked.result, RESULT.BLOCKED);

  const timeout = await discoverContact({ id: 1, domain: 'slow.com' }, {
    fetchPage: async () => ({ ok: false, error: 'The operation was aborted due to timeout' }),
  });
  assert.equal(timeout.result, RESULT.TIMEOUT);

  const empty = await discoverContact({ id: 1, domain: 'quiet.com' }, {
    fetchPage: async () => page('<p>Just a homepage.</p>'),
  });
  assert.equal(empty.result, RESULT.NO_CONTACT_FOUND, 'and this one is a finished search');
});

test('an unproven address is held, not adopted and not discarded', async () => {
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: async () => page('<div>jane@gmail.com</div>'),
  });
  assert.equal(r.result, RESULT.UNKNOWN_EMAIL);
  assert.equal(r.primary, null);
  assert.equal(r.candidates[0].value, 'jane@gmail.com', 'kept for a person to judge');
});

test('a form or a phone means they are contactable', async () => {
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: async () => page('<a href="tel:+14155551234">Call</a><form><input name="name"><textarea></textarea></form>'),
  });
  assert.equal(r.result, RESULT.OTHER_CONTACT_ONLY);
  const types = r.other.map((o) => o.contactType);
  assert.ok(types.includes(CONTACT_TYPE.PHONE));
  assert.ok(types.includes(CONTACT_TYPE.FORM));
  assert.match(activityLine(r), /but there is a/);
});

test('socials are captured once each', () => {
  const html = `
    <a href="https://instagram.com/theclinic">ig</a>
    <a href="https://instagram.com/theclinic">ig again</a>
    <a href="https://www.facebook.com/theclinic?ref=x">fb</a>
    <a href="https://uk.linkedin.com/company/theclinic">li</a>`;
  const o = otherContactsOnPage(html, { url: 'https://clinic.com' });
  const types = o.map((x) => x.contactType);
  assert.equal(types.filter((t) => t === CONTACT_TYPE.INSTAGRAM).length, 1);
  assert.ok(o.find((x) => x.contactType === CONTACT_TYPE.FACEBOOK).value.endsWith('/theclinic'), 'query stripped');
  assert.ok(types.includes(CONTACT_TYPE.LINKEDIN));
});

// ── Choosing ─────────────────────────────────────────────────────────────

test('a general inbox at their own domain beats a personal one elsewhere', async () => {
  // Confidence first, not prestige. info@ at their domain is provably theirs;
  // a Gmail is only theirs because a sentence nearby said so.
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: async () => page('<p>Email me: jane@gmail.com</p><p>Contact: info@clinic.com</p>'),
  });
  assert.equal(r.primary.value, 'info@clinic.com');
  assert.match(r.primaryReason, /their own domain/);
  assert.equal(r.candidates.length, 2, 'the other one is kept');
});

test('the adopted candidate is the only one marked adopted', async () => {
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: async () => page('<p>Contact: hello@clinic.com or bookings@clinic.com</p>'),
  });
  assert.equal(r.candidates.filter((c) => c.adopted).length, 1);
});

// ── Caching and repeatability ────────────────────────────────────────────

test('a finished search is remembered longer than a broken one', () => {
  const at = '2026-08-09T00:00:00.000Z';
  const days = (iso) => Math.round((Date.parse(iso) - Date.parse(at)) / 86400000);
  assert.equal(days(nextRefresh(RESULT.SAFE_EMAIL, at)), REFRESH_DAYS.found);
  assert.equal(days(nextRefresh(RESULT.NO_CONTACT_FOUND, at)), REFRESH_DAYS.none);
  assert.equal(days(nextRefresh(RESULT.TIMEOUT, at)), REFRESH_DAYS.failed);
  assert.ok(REFRESH_DAYS.failed < REFRESH_DAYS.none, 'a network problem is not a fact about the site');
});

test('running it twice converges to the same answer', async () => {
  const f = async () => page('<p>Contact: hello@clinic.com</p>');
  const a = await discoverContact({ id: 1, domain: 'clinic.com' }, { fetchPage: f });
  const b = await discoverContact({ id: 1, domain: 'clinic.com' }, { fetchPage: f });
  assert.equal(a.primary.value, b.primary.value);
  assert.equal(a.candidates.length, b.candidates.length);
  assert.equal(a.result, b.result);
});

test('the same address on two pages is one candidate', async () => {
  const r = await discoverContact({ id: 1, domain: 'clinic.com' }, {
    fetchPage: fetcher({
      'https://clinic.com': page('<a href="/contact">Contact</a><div>hi@other.com</div>'),
      'https://clinic.com/contact': page('<div>hi@other.com</div><p>Contact: hello@clinic.com</p>'),
    }),
  });
  assert.equal(r.candidates.filter((c) => c.value === 'hi@other.com').length, 1);
});

test('visibleHtml is what everything else is judged on', () => {
  const s = visibleHtml('<!--x--><script>a</script><style>b</style><p>keep</p>');
  assert.ok(!/x|a|b/.test(s.replace(/keep/, '')));
  assert.match(s, /keep/);
});

test('owner context refuses vendor language outright', () => {
  assert.equal(ownerContext('Contact us: reach out any time').strong, true);
  assert.equal(ownerContext('Website designed and built by Pixel Studio').strong, false);
  assert.equal(ownerContext('Font licence, all rights reserved').strong, false);
  assert.equal(ownerContext('Some unrelated sentence about pricing').strong, false);
});
