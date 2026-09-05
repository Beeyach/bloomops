import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePublicHtml } from '../lib/sanitize-public-html.mjs';

const clean = (s) => sanitizePublicHtml(s);

test('keeps ordinary document content', () => {
  const html = '<h2>Heading</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ul><li>one</li></ul>';
  assert.equal(clean(html), html);
});

test('drops a script tag and its contents', () => {
  const out = clean('<p>before</p><script>fetch("/api/prospects").then(r=>r.text()).then(steal)</script><p>after</p>');
  assert.equal(out, '<p>before</p><p>after</p>');
  assert.ok(!out.includes('fetch'));
});

test('drops event handler attributes but keeps the element', () => {
  const out = clean('<p onclick="steal()" onmouseover="alert(1)">hi</p>');
  assert.equal(out, '<p>hi</p>');
});

test('refuses javascript: urls', () => {
  const out = clean('<a href="javascript:alert(1)">click</a>');
  assert.ok(!out.includes('javascript'));
  assert.ok(out.startsWith('<a'));
});

test('refuses javascript: smuggled with control characters', () => {
  const out = clean('<a href="java\tscript:alert(1)">x</a>');
  assert.ok(!/script:/i.test(out));
});

test('refuses data: urls', () => {
  const out = clean('<img src="data:text/html;base64,PHNjcmlwdD4=">');
  assert.ok(!out.includes('data:'));
});

test('keeps ordinary links and adds rel', () => {
  const out = clean('<a href="https://example.com">x</a>');
  assert.ok(out.includes('href="https://example.com"'));
  assert.ok(out.includes('noopener'));
});

test('drops an iframe entirely', () => {
  const out = clean('<p>a</p><iframe src="https://evil.test"></iframe><p>b</p>');
  assert.equal(out, '<p>a</p><p>b</p>');
});

test('drops style blocks, which can hide an overlay over the page', () => {
  const out = clean('<style>body{display:none}</style><p>hi</p>');
  assert.equal(out, '<p>hi</p>');
});

test('drops inline style attributes', () => {
  const out = clean('<div style="position:fixed;inset:0">x</div>');
  assert.equal(out, '<div>x</div>');
});

test('unwraps unknown tags but keeps their text', () => {
  assert.equal(clean('<marquee>still readable</marquee>'), 'still readable');
});

test('svg is dropped with contents, including nested handlers', () => {
  const out = clean('<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg><p>safe</p>');
  assert.equal(out, '<p>safe</p>');
});

test('nested same-name tags inside a dropped element do not end the skip early', () => {
  const out = clean('<svg><svg></svg><script>bad()</script></svg><p>after</p>');
  assert.equal(out, '<p>after</p>');
  assert.ok(!out.includes('bad'));
});

test('keeps data attributes so embeds and equations still resolve', () => {
  const out = clean('<div data-embed data-embed-url="https://youtube.com/watch?v=x">link</div>');
  assert.ok(out.includes('data-embed'));
  assert.ok(out.includes('data-embed-url'));
});

test('task list checkboxes survive but are disabled', () => {
  const out = clean('<li><label><input type="checkbox" checked></label><div>task</div></li>');
  assert.ok(out.includes('type="checkbox"'));
  assert.ok(out.includes('disabled'));
  assert.ok(out.includes('checked'));
});

test('non-checkbox inputs are dropped', () => {
  const out = clean('<input type="text" name="password">');
  assert.equal(out, '');
});

test('form elements are dropped whole, so no credential phishing', () => {
  const out = clean('<form action="https://evil.test"><input type="text"></form><p>x</p>');
  assert.equal(out, '<p>x</p>');
});

test('comments are removed', () => {
  assert.equal(clean('<p>a</p><!-- <script>x</script> --><p>b</p>'), '<p>a</p><p>b</p>');
});

test('an unterminated tag cannot leak raw markup', () => {
  const out = clean('<p>ok</p><script src="x"');
  assert.equal(out, '<p>ok</p>');
});

test('empty and non-string input is safe', () => {
  assert.equal(clean(''), '');
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
});

test('text is left alone, including already-escaped entities', () => {
  assert.equal(clean('<p>a &amp; b &lt; c</p>'), '<p>a &amp; b &lt; c</p>');
});
