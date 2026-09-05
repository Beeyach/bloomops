import { test } from 'node:test';
import assert from 'node:assert/strict';
import { richEmailFlavours, linkedImageHtml } from '../lib/thumb-client.mjs';

const VIDEO = 'https://file.gobloomwired.com/video/kym.mp4';
const WATCH = 'https://file.gobloomwired.com/watch/kym';
const THUMB = 'https://file.gobloomwired.com/thumb/kym';

test('richEmailFlavours swaps the appended raw link for the image block', () => {
  const body = 'Hi Kym,\n\nMade you a video.\n\n' + VIDEO;
  const { html, plain } = richEmailFlavours(body, VIDEO, THUMB);
  assert.ok(html.includes(`<img src="${THUMB}"`));
  assert.ok(html.includes(`<a href="${WATCH}">`));
  assert.ok(!html.includes(VIDEO), 'raw mp4 link must not survive');
  assert.ok(html.startsWith('Hi Kym,<br>'));
  assert.equal(plain, 'Hi Kym,\n\nMade you a video.\n\n' + WATCH);
});

test('richEmailFlavours handles a watch link written inside the body', () => {
  const body = `Watch it here: ${WATCH} and tell me.`;
  const { html } = richEmailFlavours(body, VIDEO, THUMB);
  assert.ok(html.includes('<img'));
  assert.ok(html.includes('Watch it here: '));
  assert.ok(html.includes(' and tell me.'));
});

test('richEmailFlavours appends the image when the text carried no link', () => {
  const { html, plain } = richEmailFlavours('Short note.', VIDEO, THUMB);
  assert.ok(html.startsWith('Short note.<br><br>'));
  assert.ok(html.includes('<img'));
  assert.ok(plain.endsWith(WATCH));
});

test('richEmailFlavours escapes html in the wording', () => {
  const { html } = richEmailFlavours('a <b> & "c"\n' + VIDEO, VIDEO, THUMB);
  assert.ok(html.includes('a &lt;b&gt; &amp; &quot;c&quot;'));
});

test('linkedImageHtml carries both the image link and the text fallback', () => {
  const html = linkedImageHtml(WATCH, THUMB);
  assert.ok(html.includes(`<a href="${WATCH}"><img`));
  assert.ok(html.includes('>Watch the video</a>'));
});
