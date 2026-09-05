import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRenderability, shouldProbe, visibleTextOf, RENDER, MIN_TEXT } from '../lib/renderability.mjs';

// Deciding whether a browser can learn anything, before paying for one.
//
// Every threshold here comes from measuring the three sites production had
// already rejected as unreadable. All three were real businesses with real
// websites, carrying 5,397, 8,844 and 10,157 characters of visible text. The
// failure was ours. These tests exist so a check meant to save money never
// again throws away the prospects it was supposed to protect.

const page = (body, opts = {}) =>
  `<!doctype html><html><head><title>${opts.title || 'A Real Business'}</title></head><body>${body}</body></html>`;

const realSite = page(
  `<nav>${Array.from({ length: 12 }, (_, i) => `<a href="/p${i}">Page ${i}</a>`).join('')}</nav>` +
  `<h1>Melbourne based clinic</h1><p>${'Personalised treatment plans, no referral needed. '.repeat(20)}</p>`
);

test('a real business page is renderable', () => {
  const r = classifyRenderability({ status: 200, html: realSite });
  assert.equal(r.verdict, RENDER.RENDERABLE);
  assert.equal(shouldProbe(r.verdict), true);
  assert.ok(r.textLength > MIN_TEXT);
});

test('a parking page is not their website', () => {
  const r = classifyRenderability({ status: 200, html: page('<h1>This domain is parked</h1><p>Buy this domain</p>') });
  assert.equal(r.verdict, RENDER.PLACEHOLDER);
  assert.equal(shouldProbe(r.verdict), false, 'never worth twenty credits');
});

test('a dead address stops before anything is spent', () => {
  assert.equal(classifyRenderability({ status: 404, html: '' }).verdict, RENDER.DEAD);
  assert.equal(classifyRenderability({ status: null, error: 'ENOTFOUND' }).verdict, RENDER.DEAD);
  assert.equal(shouldProbe(RENDER.DEAD), false);
});

test('a genuinely blank page is empty', () => {
  const r = classifyRenderability({ status: 200, html: page('<div id="app"></div>') });
  assert.equal(r.verdict, RENDER.EMPTY);
  assert.equal(shouldProbe(r.verdict), false);
});

// ── The false positives that cost real money ─────────────────────────────

test('a bot check is not a dead site, and still gets a browser', () => {
  // Getting past a challenge is exactly what a real browser is for, so this
  // must never be treated as unreadable.
  const r = classifyRenderability({ status: 503, html: page('Checking your browser before accessing', { title: 'Just a moment...' }) });
  assert.equal(r.verdict, RENDER.CHALLENGE);
  assert.equal(shouldProbe(r.verdict), true, 'pay for it: the browser may well get through');
});

test('a 403 is worth a browser too', () => {
  const r = classifyRenderability({ status: 403, html: '' });
  assert.equal(r.verdict, RENDER.BLOCKED);
  assert.equal(shouldProbe(r.verdict), true);
});

test('an ordinary site behind Cloudflare is not a challenge', () => {
  // The first version of this matched `__cf_bm` and `recaptcha` anywhere in
  // the source, which fires on any site with a contact form or a CDN. Both
  // real sites tested tripped it while being perfectly readable.
  const html = realSite.replace('</body>', '<script src="https://www.google.com/recaptcha/api.js"></script><script>__cf_bm=1</script></body>');
  const r = classifyRenderability({ status: 200, html });
  assert.equal(r.verdict, RENDER.RENDERABLE, 'a script tag is not an interstitial');
});

test('lots of links with little text is still worth looking at', () => {
  // Both signals are required. A page can be nav-heavy and thin on copy and
  // still be a real site a browser will render fine.
  const html = page(`<nav>${Array.from({ length: 20 }, (_, i) => `<a href="/x${i}">x</a>`).join('')}</nav>`);
  const r = classifyRenderability({ status: 200, html });
  assert.notEqual(r.verdict, RENDER.EMPTY);
});

test('the three sites production wrongly rejected all pass', () => {
  // Reconstructed at their measured sizes. Every one of these cost 20 credits
  // and returned nothing.
  const measured = [
    { name: 'centertruehealth.com', chars: 8844, links: 97 },
    { name: 'thelotushealingcentre.com.au', chars: 10157, links: 40 },
    { name: 'sites.google.com/view/oliviamassagedoreen', chars: 5397, links: 12 },
  ];
  for (const m of measured) {
    const html = page(
      `<nav>${Array.from({ length: m.links }, (_, i) => `<a href="/n${i}">n</a>`).join('')}</nav><p>${'x'.repeat(m.chars)}</p>`
    );
    const r = classifyRenderability({ status: 200, html });
    assert.equal(r.verdict, RENDER.RENDERABLE, `${m.name} must be probed, not skipped`);
  }
});

test('visible text ignores scripts, styles and markup', () => {
  const t = visibleTextOf('<style>.a{color:red}</style><script>var x="hello world hello"</script><p>Real words here</p>');
  assert.equal(t, 'Real words here');
});

test('every verdict carries a reason a person can read', () => {
  const cases = [
    { status: 404, html: '' },
    { status: 200, html: page('<h1>This domain is parked</h1>') },
    { status: 200, html: page('') },
    { status: 403, html: '' },
    { status: 200, html: realSite },
  ];
  for (const c of cases) {
    const r = classifyRenderability(c);
    assert.ok(r.reason && r.reason.length > 12, `${r.verdict} needs a readable reason`);
  }
});
