import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeEmbedsForPublic, SANDBOX } from '../lib/public-embeds.mjs';

const SELF = 'leadsthatbloom.com';

// The shape the Embed node's renderHTML writes into pages.body.
function block(provider, url) {
  return (
    `<div data-provider="${provider}" data-url="${url}" data-embed class="ltb-embed">` +
    `<a href="${url}" rel="noopener nofollow" target="_blank">link</a>` +
    `</div>`
  );
}

test('leaves a body with no embeds untouched', () => {
  const html = '<p>Nothing to do here.</p>';
  assert.equal(upgradeEmbedsForPublic(html, SELF), html);
});

test('upgrades an allowlisted provider to a sandboxed iframe', () => {
  const out = upgradeEmbedsForPublic(block('loom', 'https://www.loom.com/share/abc123'), SELF);
  assert.match(out, /<iframe /);
  assert.match(out, /src="https:\/\/www\.loom\.com\/embed\/abc123"/);
  assert.ok(out.includes(`sandbox="${SANDBOX}"`), 'sandbox must be present');
  assert.match(out, /referrerpolicy="no-referrer"/);
  assert.match(out, /loading="lazy"/);
  // Provenance survives the upgrade.
  assert.match(out, /ltb-embed-caption/);
});

test('Instagram and Facebook upgrade with a fixed height', () => {
  const ig = upgradeEmbedsForPublic(block('instagram', 'https://www.instagram.com/p/CxYz123/'), SELF);
  assert.match(ig, /src="https:\/\/www\.instagram\.com\/p\/CxYz123\/embed"/);
  assert.match(ig, /style="height:640px"/);

  const fb = upgradeEmbedsForPublic(
    block('facebook', 'https://www.facebook.com/bloomwired/posts/12345'),
    SELF
  );
  assert.match(fb, /plugins\/post\.php/);
  assert.match(fb, /style="height:640px"/);
});

// The point of the whole design.
test('never frames a provider that is not public safe', () => {
  for (const [provider, url] of [
    ['generic', 'https://example.com/dashboard'],
    ['x', 'https://x.com/someone/status/12345'],
  ]) {
    const input = block(provider, url);
    const out = upgradeEmbedsForPublic(input, SELF);
    assert.equal(out, input, `${provider} must pass through untouched`);
    assert.ok(!out.includes('<iframe'), `${provider} must never produce an iframe`);
  }
});

test('refuses when the stored provider disagrees with the stored URL', () => {
  // A hand-edited body claiming loom on someone else's host.
  const input = block('loom', 'https://evil.test/share/abc');
  const out = upgradeEmbedsForPublic(input, SELF);
  assert.equal(out, input);
  assert.ok(!out.includes('<iframe'));
});

test('refuses to frame our own origin', () => {
  const input = block('generic', `https://${SELF}/p/abc`);
  assert.ok(!upgradeEmbedsForPublic(input, SELF).includes('<iframe'));
});

test('non-https stored URLs never produce a frame', () => {
  for (const url of ['http://www.loom.com/share/abc', 'javascript:alert(1)']) {
    const out = upgradeEmbedsForPublic(block('loom', url), SELF);
    assert.ok(!out.includes('<iframe'), `${url} must not be framed`);
  }
});

// Scope note: this function's job is that anything it GENERATES is safe. It
// deliberately passes non-allowlisted blocks through byte-for-byte, so it is
// not a sanitizer for arbitrary stored body HTML — PublicReader's
// dangerouslySetInnerHTML is a separate, pre-existing concern.
test('markup in a stored URL cannot escape into generated output', () => {
  // What actually reaches storage: matchEmbed keeps URL.href, and the URL
  // constructor percent-encodes < > and " in the path, so this is the real
  // worst case rather than a hand-written one.
  const stored = new URL('https://www.loom.com/share/abc"><script>alert(1)</script>').href;
  const out = upgradeEmbedsForPublic(block('loom', stored), SELF);
  const src = (out.match(/<iframe src="([^"]*)"/) || [])[1] || '';
  assert.ok(src.startsWith('https://www.loom.com/embed/'), `src stayed on host: ${src}`);
  assert.ok(!/[<>"]/.test(src), 'src carries no raw markup characters');
  assert.ok(!out.includes('<script'), 'no script tag in generated output');
});

// Documents the one place the attribute parse gives up. A literal > inside a
// stored attribute value truncates it, which yields no upgrade and therefore
// the fallback link. Unreachable from anything this app writes, and safe when
// it does happen.
test('a malformed stored block degrades to its link rather than upgrading', () => {
  const malformed =
    '<div data-embed data-provider="loom" data-url="https://www.loom.com/a>b">' +
    '<a href="#">link</a></div>';
  assert.ok(!upgradeEmbedsForPublic(malformed, SELF).includes('<iframe'));
});

test('handles several embeds in one body independently', () => {
  const html =
    '<p>Intro</p>' +
    block('loom', 'https://www.loom.com/share/abc123') +
    '<p>Between</p>' +
    block('generic', 'https://example.com/dashboard') +
    block('instagram', 'https://www.instagram.com/p/CxYz123/');
  const out = upgradeEmbedsForPublic(html, SELF);
  assert.equal((out.match(/<iframe/g) || []).length, 2, 'only the two allowlisted ones');
  assert.match(out, /<p>Between<\/p>/, 'surrounding content is preserved');
  assert.match(out, /example\.com\/dashboard/, 'the generic block still renders its link');
});

test('stored entities are decoded before the URL is re-validated', () => {
  // renderHTML escapes & in a query string; the provider match has to see the
  // real URL or a legitimate embed would silently fall back to a link.
  const stored = block('facebookvideo', 'https://www.facebook.com/watch/?v=1&amp;t=2');
  const out = upgradeEmbedsForPublic(stored, SELF);
  assert.match(out, /<iframe /, 'escaped ampersand must not break the match');
});
