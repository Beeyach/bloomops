import { test } from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { renderWith, hasRenderError, KATEX_OPTIONS } from '../lib/equations.mjs';
import { renderEquationsForPublic } from '../lib/public-equations.mjs';

test('renders a formula to self-contained markup', () => {
  const { ok, html } = renderWith(katex, 'E = mc^2');
  assert.equal(ok, true);
  assert.match(html, /class="katex/);
  // No script tag, no external reference: a public page gets the CSS and
  // nothing else has to run for the formula to appear.
  assert.ok(!/<script/i.test(html), 'rendered output must not need JS');
  assert.ok(!/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, '')), 'no external URLs');
});

test('an empty equation is not an error, just empty', () => {
  const r = renderWith(katex, '   ');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Empty equation');
});

test('a missing library reports loading rather than failing', () => {
  // The client fetches KaTeX lazily, so "not here yet" has to be
  // distinguishable from "this formula is wrong".
  const r = renderWith(null, 'E = mc^2');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'loading');
});

test('a broken formula renders in place and is detectable', () => {
  const { ok, html } = renderWith(katex, '\\frac{1}{');
  assert.equal(ok, true, 'throwOnError:false means it still returns markup');
  assert.equal(hasRenderError(html), true, 'and the error is detectable');
});

test('external-resource commands are refused', () => {
  // trust:false. \href would put a third-party link, and \includegraphics a
  // network fetch, inside a page shared with a client.
  assert.equal(KATEX_OPTIONS.trust, false);
  const { html } = renderWith(katex, '\\href{https://evil.test}{click}');
  assert.ok(!/evil\.test/.test(html), 'href target must not survive');
});

test('public rendering upgrades a stored equation', () => {
  const stored = '<p>Before</p><div data-equation data-latex="E = mc^2"><code>E = mc^2</code></div>';
  const out = renderEquationsForPublic(stored);
  assert.match(out, /class="katex/);
  assert.match(out, /<p>Before<\/p>/);
});

test('public rendering leaves an unrenderable equation as its source', () => {
  const stored = '<div data-equation data-latex=""><code></code></div>';
  const out = renderEquationsForPublic(stored);
  assert.equal(out, stored, 'degrades to what was stored');
});

test('escaped latex is decoded before rendering', () => {
  // renderHTML escapes & and <, so a stored formula using them has to be
  // decoded or it renders as literal entities.
  const stored = '<div data-equation data-latex="a &lt; b"><code>a &lt; b</code></div>';
  const out = renderEquationsForPublic(stored);
  assert.match(out, /class="katex/);
  assert.ok(!/&amp;lt;/.test(out), 'must not double-escape');
});

test('a body with no equations is returned untouched', () => {
  const html = '<p>Nothing here.</p>';
  assert.equal(renderEquationsForPublic(html), html);
});
