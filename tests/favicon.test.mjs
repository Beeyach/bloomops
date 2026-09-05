import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faviconHost, faviconUrl } from '../lib/favicon.mjs';

test('extracts the bare host from the messy shapes the domain field holds', () => {
  assert.equal(faviconHost('example.com'), 'example.com');
  assert.equal(faviconHost('https://example.com'), 'example.com');
  assert.equal(faviconHost('http://www.example.com/services?q=1#top'), 'example.com');
  assert.equal(faviconHost('  Example.COM/page  '), 'example.com');
  assert.equal(faviconHost('example.com:8080/x'), 'example.com');
  assert.equal(faviconHost('heartandsoulwoman.com'), 'heartandsoulwoman.com');
});

test('rejects placeholders and non-hosts instead of making broken images', () => {
  assert.equal(faviconHost(null), null);
  assert.equal(faviconHost(''), null);
  assert.equal(faviconHost('   '), null);
  assert.equal(faviconHost('pending'), null);
  assert.equal(faviconHost('no website'), null);
  assert.equal(faviconHost('n/a'), null);
});

test('faviconUrl builds the sized service URL, null when no host', () => {
  assert.equal(faviconUrl('https://example.com/x'), 'https://www.google.com/s2/favicons?domain=example.com&sz=32');
  assert.equal(faviconUrl('example.com', 64), 'https://www.google.com/s2/favicons?domain=example.com&sz=64');
  assert.equal(faviconUrl('pending'), null);
});
