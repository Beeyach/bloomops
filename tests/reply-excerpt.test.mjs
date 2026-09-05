// The excerpt rules, tested against the actual strings sitting in
// reply_events. Every input below is a real stored snippet from the
// hello@bloomwired.io mailbox, truncated the way the sync truncates it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { replyExcerpt, decodeEntities, isRealReply } from '../lib/reply-excerpt.mjs';

test('HTML entities are decoded, because every stored snippet has them', () => {
  assert.equal(decodeEntities('It&#39;s gotten'), "It's gotten");
  assert.equal(decodeEntities('&lt;hello@bloomwired.io&gt;'), '<hello@bloomwired.io>');
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('&quot;quoted&quot;'), '"quoted"');
  assert.equal(decodeEntities('&#8217;'), '’');
});

test('the quoted thread is cut, keeping only what they wrote', () => {
  // reply_events id 21, the canary reply.
  const stored = 'Interested — test reply On Tue, Aug 11, 2026 at 10:12 AM Ary at Bloomwired &lt;hello@bloom';
  assert.equal(replyExcerpt(stored), 'Interested — test reply');
});

test('a signature is trimmed once real words precede it', () => {
  // reply_events id 31, Cynthia Criss.
  const stored = 'Yes, I prefer it this way. --- Cynthia A. Criss, LPC, CSAT Open Hearts Open Minds Counseli';
  assert.equal(replyExcerpt(stored), 'Yes, I prefer it this way.');
});

test('a real sentence survives intact', () => {
  // reply_events id 23, Steinman Coaching.
  const stored = 'Hi Ary, Thanks for reaching out. I&#39;ll definitely keep Bloomwired in mind if I decide t';
  assert.equal(
    replyExcerpt(stored),
    "Hi Ary, Thanks for reaching out. I'll definitely keep Bloomwired in mind if I decide t"
  );
});

test('lines that are purely quoted material are dropped', () => {
  assert.equal(replyExcerpt('Sounds good.\n> what did you have in mind?\n> - Ary'), 'Sounds good.');
});

test('nothing in, nothing out — never an empty pair of quotes', () => {
  assert.equal(replyExcerpt(''), '');
  assert.equal(replyExcerpt(null), '');
  assert.equal(replyExcerpt(undefined), '');
  assert.equal(replyExcerpt('   '), '');
  // A snippet that is nothing but the quoted thread leaves nothing behind,
  // and the caller must say "not synced yet" rather than draw "".
  assert.equal(replyExcerpt('On Tue, Aug 11, 2026 at 10:12 AM Ary wrote: hello'), '');
});

test('long text is clipped on a word and marked as clipped', () => {
  const long = 'word '.repeat(80).trim();
  const out = replyExcerpt(long, { maxChars: 40 });
  assert.ok(out.length <= 41, `got ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('wor…'), 'must not cut mid-word');
});

test('short text is never given an ellipsis it did not earn', () => {
  assert.equal(replyExcerpt('Thank you!'), 'Thank you!');
});

test('a threaded message is a real reply; a domain-matched blast is not', () => {
  // The nine genuine replies in the mailbox all look like this.
  assert.equal(isRealReply({ direction: 'inbound', in_reply_to: '<abc@mail>', refs: '<x>', matched_by: 'thread' }), true);
  assert.equal(isRealReply({ direction: 'inbound', in_reply_to: null, refs: null, matched_by: 'thread' }), true);

  // Good Energy Coach's newsletter: no threading headers, matched on domain.
  assert.equal(isRealReply({ direction: 'inbound', in_reply_to: null, refs: null, matched_by: 'domain' }), false);

  // An exact-address match with no threading is KEPT. People do answer by
  // composing a fresh email, and dropping those loses a real reply — the one
  // failure worth avoiding here.
  assert.equal(isRealReply({ direction: 'inbound', in_reply_to: '', refs: '', matched_by: 'from' }), true);

  // Our own sends are not replies to us.
  assert.equal(isRealReply({ direction: 'outbound', in_reply_to: '<a>', matched_by: 'thread' }), false);
  assert.equal(isRealReply(null), false);
});
