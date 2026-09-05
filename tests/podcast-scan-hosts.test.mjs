import test from 'node:test';
import assert from 'node:assert/strict';
import { isFetchableFeedUrl, parseFeedUrls } from '../lib/podcast-scan.mjs';

// The podcast scan fetches whatever URL is pasted into the box, and it does it
// from the server. Anything the server can reach, that box could reach: the
// cloud metadata address, a service on localhost, a name that only resolves
// inside the network. The status and the page title came back to whoever
// pasted it, which turns a lead scanner into a port scanner.

test('real podcast feeds are still fetchable', () => {
  for (const u of [
    'https://feeds.megaphone.fm/thing',
    'https://anchor.fm/s/abc123/podcast/rss',
    'http://feeds.captivate.fm/my-show/',
  ]) {
    assert.ok(isFetchableFeedUrl(u), `${u} should be allowed`);
  }
});

test('private and loopback addresses are refused', () => {
  for (const u of [
    'http://localhost:8080/admin',
    'http://127.0.0.1:5000/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/x',
    'http://192.168.1.1/',
    'http://172.20.1.1/x',
    'http://[::1]/x',
    'http://box.local/feed',
    'http://metadata.internal/x',
  ]) {
    assert.equal(isFetchableFeedUrl(u), false, `${u} should be refused`);
  }
});

test('non-http schemes and embedded credentials are refused', () => {
  assert.equal(isFetchableFeedUrl('file:///etc/passwd'), false);
  assert.equal(isFetchableFeedUrl('gopher://example.com/'), false);
  assert.equal(isFetchableFeedUrl('https://user:pw@example.com/f'), false);
});

test('parseFeedUrls drops the refused ones and keeps the rest', () => {
  const out = parseFeedUrls(
    'https://feeds.megaphone.fm/a\nhttp://localhost/b, https://anchor.fm/s/x/podcast/rss'
  );
  assert.deepEqual(out, ['https://feeds.megaphone.fm/a', 'https://anchor.fm/s/x/podcast/rss']);
});
