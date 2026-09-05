import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS,
  matchEmbed,
  embedUrlFor,
  isPublicSafe,
  embedLabel,
  isFacebookShare,
  canonicalFacebookPost,
} from '../lib/embeds.mjs';

const SELF = 'leadsthatbloom.com';

test('recognises each named provider', () => {
  const cases = [
    ['https://www.loom.com/share/abc123', 'loom'],
    ['https://docs.google.com/document/d/1AbC-dEf/edit', 'googledocs'],
    ['https://docs.google.com/spreadsheets/d/1AbC-dEf/edit#gid=0', 'googledocs'],
    ['https://www.google.com/maps/place/Somewhere', 'googlemaps'],
    ['https://www.figma.com/design/xyz/Board', 'figma'],
    ['https://calendly.com/ary/intro', 'calendly'],
    ['https://www.instagram.com/p/CxYz123/', 'instagram'],
    ['https://www.instagram.com/reel/CxYz123/', 'instagram'],
    ['https://www.facebook.com/watch/?v=12345', 'facebookvideo'],
    ['https://www.facebook.com/bloomwired/posts/12345', 'facebook'],
    ['https://x.com/someone/status/12345', 'x'],
    ['https://twitter.com/someone/status/12345', 'x'],
    ['https://example.com/whatever', 'generic'],
  ];
  for (const [url, expected] of cases) {
    const m = matchEmbed(url, SELF);
    assert.ok(m, `${url} should match something`);
    assert.equal(m.provider, expected, `${url} → ${expected}`);
  }
});

test('near misses fall through to generic rather than a named provider', () => {
  const cases = [
    'https://loom.com.evil.test/share/abc',
    'https://notinstagram.com/p/abc',
    'https://docs.google.com/forms/d/abc/viewform',
    'https://x.com/someone',
  ];
  for (const url of cases) {
    const m = matchEmbed(url, SELF);
    assert.equal(m.provider, 'generic', `${url} must not match a named provider`);
  }
});

test('rejects anything that is not an https URL', () => {
  assert.equal(matchEmbed('http://www.loom.com/share/abc', SELF), null);
  assert.equal(matchEmbed('javascript:alert(1)', SELF), null);
  assert.equal(matchEmbed('data:text/html,<script>alert(1)</script>', SELF), null);
  assert.equal(matchEmbed('not a url', SELF), null);
  assert.equal(matchEmbed('', SELF), null);
  assert.equal(matchEmbed(null, SELF), null);
});

test('refuses to embed our own origin', () => {
  // allow-same-origin is only dangerous when the framed page shares our
  // origin, so this rejection is what makes the sandbox posture sound.
  assert.equal(matchEmbed(`https://${SELF}/p/abc`, SELF), null);
  assert.equal(matchEmbed(`https://${SELF}/`, SELF), null);
  // Still embeddable when we are not the host.
  assert.ok(matchEmbed(`https://${SELF}/p/abc`, 'other.example'));
});

test('X is recognised but never framed', () => {
  const m = matchEmbed('https://x.com/someone/status/12345', SELF);
  assert.equal(m.provider, 'x');
  assert.equal(m.embedUrl, null, 'X has no iframe endpoint');
  assert.equal(isPublicSafe('x'), false);
});

test('generic is never public safe', () => {
  assert.equal(isPublicSafe('generic'), false);
});

test('public-safe providers all produce an embed URL', () => {
  for (const p of PROVIDERS) {
    if (!p.publicSafe) continue;
    assert.equal(typeof p.toEmbedUrl, 'function', `${p.id} is publicSafe but cannot be framed`);
    assert.equal(isPublicSafe(p.id), true, `${p.id} should report public safe`);
  }
});

test('every provider carries exactly one of aspect or height', () => {
  for (const p of PROVIDERS) {
    const has = Number(Boolean(p.aspect)) + Number(Boolean(p.height));
    assert.equal(has, 1, `${p.id} must set exactly one of aspect or height`);
  }
});

// The security regression test. If someone later edits a provider template
// into something that echoes user input straight into src, this fails.
test('every embed URL is https and lands on its provider host', () => {
  const expected = {
    loom: 'https://www.loom.com/embed/',
    googledocs: 'https://docs.google.com/',
    googlemaps: 'https://maps.google.com/maps?',
    figma: 'https://www.figma.com/embed?',
    calendly: 'https://calendly.com/',
    instagram: 'https://www.instagram.com/',
    facebookvideo: 'https://www.facebook.com/plugins/video.php?',
    facebook: 'https://www.facebook.com/plugins/post.php?',
  };
  const samples = {
    loom: 'https://www.loom.com/share/abc123',
    googledocs: 'https://docs.google.com/document/d/1AbC-dEf/edit',
    googlemaps: 'https://www.google.com/maps/place/Somewhere',
    figma: 'https://www.figma.com/design/xyz/Board',
    calendly: 'https://calendly.com/ary/intro',
    instagram: 'https://www.instagram.com/p/CxYz123/',
    facebookvideo: 'https://www.facebook.com/watch/?v=12345',
    facebook: 'https://www.facebook.com/bloomwired/posts/12345',
  };
  for (const [id, sample] of Object.entries(samples)) {
    const url = embedUrlFor(id, sample, SELF);
    assert.ok(url, `${id} should build an embed URL`);
    assert.ok(url.startsWith('https://'), `${id} embed URL must be https`);
    assert.ok(url.startsWith(expected[id]), `${id} embed URL must stay on its own host: ${url}`);
  }
});

test('embedUrlFor refuses when the stored provider disagrees with the URL', () => {
  // A hand-edited body claiming a loom provider on some other host must not
  // produce a src.
  assert.equal(embedUrlFor('loom', 'https://example.com/share/abc', SELF), null);
  assert.equal(embedUrlFor('instagram', 'https://example.com/p/abc', SELF), null);
  assert.equal(embedUrlFor('nosuchprovider', 'https://www.loom.com/share/abc', SELF), null);
  assert.equal(embedUrlFor('loom', 'javascript:alert(1)', SELF), null);
});

test('embedLabel is short and readable', () => {
  assert.equal(embedLabel('https://www.loom.com/share/abc'), 'loom.com/share/abc');
  assert.equal(embedLabel('https://example.com/'), 'example.com');
  assert.ok(embedLabel('https://example.com/' + 'x'.repeat(200)).length <= 58);
  assert.equal(embedLabel('nonsense'), 'nonsense');
});

test('Facebook share links are recognised as needing resolution', () => {
  assert.equal(isFacebookShare('https://www.facebook.com/share/p/1D89Ta9Fes/'), true);
  assert.equal(isFacebookShare('https://facebook.com/share/v/AbC123'), true);
  assert.equal(isFacebookShare('https://www.facebook.com/bloomwired/posts/12345'), false);
  assert.equal(isFacebookShare('https://example.com/share/p/abc'), false);
});

test('an unresolved share link never becomes a facebook post embed', () => {
  // post.php cannot resolve these, so matching them as `facebook` would build
  // an embed that renders "no longer available" for a live public post.
  const m = matchEmbed('https://www.facebook.com/share/p/1D89Ta9Fes/', SELF);
  assert.notEqual(m.provider, 'facebook');
});

test('canonicalFacebookPost reduces a slugged permalink to the embeddable form', () => {
  assert.equal(
    canonicalFacebookPost(
      'https://www.facebook.com/61572080146823/posts/im-ary-i-help-service-businesses/122106587666736004/'
    ),
    'https://www.facebook.com/61572080146823/posts/122106587666736004/'
  );
  assert.equal(
    canonicalFacebookPost('https://www.facebook.com/61572080146823/posts/122106587666736004/'),
    'https://www.facebook.com/61572080146823/posts/122106587666736004/'
  );
  assert.equal(canonicalFacebookPost('https://example.com/x'), null);
});
