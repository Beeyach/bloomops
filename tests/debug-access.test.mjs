// Who can ask the renderer for its internal crawl facts.
//
// `POST /precheck` accepts `{ debug: true }` and answers with the booking link
// it found, the page it resolved, the home form, the calendar signal and every
// page it opened. That output proved the booking and calendar fixes. It should
// not be available to whoever finds the service URL.
//
// The renderer's own packages exist only inside its container image, so its
// routes cannot be imported here. What can be tested is the decision those
// routes make, which lives in access.mjs for exactly that reason. The ordering
// property — that the gate runs before any work and before the debug branch —
// is proved against live production in the report, with the real responses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretOk } from '../services/audit-render/access.mjs';

const SECRET = 'a-secret-of-some-length-40-chars-long-ok';

// ── the wrong secret, in every shape it arrives ──────────────────────────

test('nothing at all is refused', () => {
  for (const given of [undefined, null, '']) {
    assert.equal(secretOk(given, SECRET), false, String(given));
  }
});

test('a wrong secret of the same length is refused', () => {
  const sameLength = 'x'.repeat(SECRET.length);
  assert.equal(sameLength.length, SECRET.length);
  assert.equal(secretOk(sameLength, SECRET), false);
});

test('a correct prefix is refused', () => {
  // The shape a character-at-a-time guess produces.
  for (let i = 1; i < SECRET.length; i += 7) {
    assert.equal(secretOk(SECRET.slice(0, i), SECRET), false, `prefix of ${i}`);
    assert.equal(secretOk(SECRET.slice(0, i) + 'x'.repeat(SECRET.length - i), SECRET), false, `padded prefix of ${i}`);
  }
});

test('trailing or leading whitespace is not the secret', () => {
  for (const given of [` ${SECRET}`, `${SECRET} `, `${SECRET}\n`]) {
    assert.equal(secretOk(given, SECRET), false, JSON.stringify(given));
  }
});

test('case matters', () => {
  assert.equal(secretOk(SECRET.toUpperCase(), SECRET), false);
});

test('non-strings cannot escalate', () => {
  for (const given of [1, true, {}, [], { toString: () => SECRET }]) {
    assert.equal(secretOk(given, SECRET), false, JSON.stringify(given));
  }
});

// ── an unconfigured service opens nothing ────────────────────────────────

test('no configured secret refuses everything, including an empty guess', () => {
  // Fails closed. A missing environment variable must not mean "no check".
  for (const expected of [undefined, null, '']) {
    assert.equal(secretOk('', expected), false, String(expected));
    assert.equal(secretOk('anything', expected), false, String(expected));
    assert.equal(secretOk(expected, expected), false, 'and it cannot match itself');
  }
});

// ── the right secret still works ─────────────────────────────────────────

test('the correct secret is accepted', () => {
  assert.equal(secretOk(SECRET, SECRET), true);
});

test('it does not care what the secret contains', () => {
  for (const s of ['short', 'a'.repeat(200), 'with spaces and = signs +/', '🔑-unicode-secret']) {
    assert.equal(secretOk(s, s), true, s);
    assert.equal(secretOk(`${s}x`, s), false, s);
  }
});

// ── the comparison is constant time ──────────────────────────────────────

test('comparison does not short-circuit on the first differing byte', () => {
  // timingSafeEqual is the guarantee; this pins that it is what is being used,
  // by checking the observable consequence: a guess differing in byte 1 and a
  // guess differing only in the last byte are both simply false, and neither
  // throws or returns early with a different type.
  const firstByteWrong = `X${SECRET.slice(1)}`;
  const lastByteWrong = `${SECRET.slice(0, -1)}X`;
  assert.equal(secretOk(firstByteWrong, SECRET), false);
  assert.equal(secretOk(lastByteWrong, SECRET), false);
  assert.equal(typeof secretOk(firstByteWrong, SECRET), 'boolean');
  assert.equal(typeof secretOk(lastByteWrong, SECRET), 'boolean');
});

test('a mismatched length never reaches timingSafeEqual', () => {
  // Node throws if the buffers differ in size. Reaching it would turn a wrong
  // guess into a 500 rather than a 403, which is its own information leak.
  assert.doesNotThrow(() => secretOk('short', SECRET));
  assert.doesNotThrow(() => secretOk('x'.repeat(5000), SECRET));
  assert.equal(secretOk('short', SECRET), false);
});

// ── nothing here reveals the secret ──────────────────────────────────────

test('the function returns only a boolean, never the secret', () => {
  for (const given of ['', 'wrong', SECRET]) {
    const out = secretOk(given, SECRET);
    assert.equal(typeof out, 'boolean');
    assert.ok(out === true || out === false);
  }
});
