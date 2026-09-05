import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapApifyItem, platformFromUrl, itemsToLeads } from '../lib/apify-import.mjs';

test('platformFromUrl detects known social hosts', () => {
  assert.equal(platformFromUrl('https://www.instagram.com/p/abc'), 'Instagram');
  assert.equal(platformFromUrl('https://facebook.com/somepage'), 'Facebook');
  assert.equal(platformFromUrl('https://www.reddit.com/r/x/comments/1'), 'Reddit');
  assert.equal(platformFromUrl('https://twitter.com/user/status/1'), 'X');
  assert.equal(platformFromUrl('https://example.com/thing'), 'Other');
  assert.equal(platformFromUrl(''), 'Other');
  assert.equal(platformFromUrl('not a url'), 'Other');
});

test('maps an Instagram post item (caption + owner) to a lead', () => {
  const lead = mapApifyItem({
    url: 'https://www.instagram.com/p/CxYz/',
    caption: 'anyone know a good social media manager? drowning here',
    ownerUsername: 'janedoe',
    ownerFullName: 'Jane Doe',
    timestamp: '2026-07-15',
  });
  assert.equal(lead.platform, 'Instagram');
  assert.equal(lead.post_url, 'https://www.instagram.com/p/CxYz/');
  assert.match(lead.post_text, /social media manager/);
  assert.equal(lead.author_name, 'Jane Doe');
  assert.equal(lead.author_handle, '@janedoe');
});

test('maps a Facebook page item (title + info) to a lead', () => {
  const lead = mapApifyItem({
    pageUrl: 'https://facebook.com/glowspa',
    title: 'Glow Spa',
    info: 'Day spa in Austin. DM to book.',
  });
  assert.equal(lead.platform, 'Facebook');
  assert.equal(lead.post_url, 'https://facebook.com/glowspa');
  assert.equal(lead.author_name, 'Glow Spa');
  assert.match(lead.post_text, /Day spa/);
});

test('maps a Google Maps place (website host decides platform = Other)', () => {
  const lead = mapApifyItem({
    title: 'Bright Dental',
    website: 'https://brightdental.com',
    address: '1 Main St',
    categoryName: 'Dentist',
  });
  assert.equal(lead.platform, 'Other');
  assert.equal(lead.post_url, 'https://brightdental.com');
  assert.equal(lead.author_name, 'Bright Dental');
});

test('platformOverride wins over url inference', () => {
  const lead = mapApifyItem(
    { url: 'https://example.com/x', text: 'hi' },
    { platformOverride: 'LinkedIn' }
  );
  assert.equal(lead.platform, 'LinkedIn');
});

test('rejects non-http urls but keeps the item if it has text', () => {
  const lead = mapApifyItem({ url: 'javascript:alert(1)', text: 'real ask here' });
  assert.equal(lead.post_url, ''); // unsafe url dropped
  assert.equal(lead.post_text, 'real ask here');
  assert.equal(lead.platform, 'Other');
});

test('returns null when there is neither url nor text', () => {
  assert.equal(mapApifyItem({ ownerUsername: 'ghost' }), null);
  assert.equal(mapApifyItem(null), null);
  assert.equal(mapApifyItem('string'), null);
});

test('itemsToLeads dedupes within batch and against existing urls', () => {
  const items = [
    { url: 'https://instagram.com/p/1', caption: 'need a VA' },
    { url: 'https://instagram.com/p/1', caption: 'dup, same url' },
    { url: 'https://instagram.com/p/2', caption: 'fresh' },
    { url: 'https://instagram.com/p/OLD', caption: 'already have this' },
    { foo: 'bar' }, // empty -> skipped
  ];
  const existingUrls = new Set(['https://instagram.com/p/old']); // lowercased
  const { leads, skippedDuplicate, skippedEmpty } = itemsToLeads(items, { existingUrls });
  assert.deepEqual(leads.map((l) => l.post_url), [
    'https://instagram.com/p/1',
    'https://instagram.com/p/2',
  ]);
  assert.equal(skippedDuplicate, 2); // in-batch dup + existing
  assert.equal(skippedEmpty, 1);
});

test('itemsToLeads respects the limit', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    url: `https://x.com/p/${i}`,
    text: 't',
  }));
  const { leads } = itemsToLeads(items, { limit: 3 });
  assert.equal(leads.length, 3);
});

test('text-only items are never deduped away', () => {
  const items = [
    { text: 'ask one' },
    { text: 'ask two' },
  ];
  const { leads, skippedDuplicate } = itemsToLeads(items);
  assert.equal(leads.length, 2);
  assert.equal(skippedDuplicate, 0);
});
