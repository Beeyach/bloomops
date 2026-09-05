import { test } from 'node:test';
import assert from 'node:assert/strict';
import { okResult, errResult, isEnvelope, wrapSetter, finalizeWriteApi } from '../lib/bloom-result.mjs';

test('okResult builds a success envelope keeping the prospect', () => {
  const p = { id: 1, email: 'a@b.c' };
  assert.deepEqual(okResult('stage', 'Email 1', p), { ok: true, field: 'stage', value: 'Email 1', prospect: p });
});

test('okResult passes an existing envelope through unchanged (no double-wrap)', () => {
  const inner = { ok: true, field: 'email_sequence', value: [], prospect: { id: 2 } };
  assert.equal(okResult('stage', 'x', inner), inner);
});

test('okResult normalizes undefined value to null', () => {
  assert.deepEqual(okResult('replied', undefined, null), { ok: true, field: 'replied', value: null, prospect: null });
});

test('errResult carries the error message', () => {
  assert.deepEqual(errResult(new Error('Prospect not found: z@z.z')), { ok: false, error: 'Prospect not found: z@z.z' });
  assert.deepEqual(errResult('boom'), { ok: false, error: 'boom' });
});

test('isEnvelope only matches objects with an ok key', () => {
  assert.equal(isEnvelope({ ok: false }), true);
  assert.equal(isEnvelope({ id: 1 }), false);
  assert.equal(isEnvelope(null), false);
});

test('wrapSetter returns a success envelope and reports value from args[1]', async () => {
  const raw = async (email, stage) => ({ id: 1, email, stage });
  const wrapped = wrapSetter(raw, 'stage');
  const r = await wrapped('A@B.c', 'Email 2');
  assert.deepEqual(r, { ok: true, field: 'stage', value: 'Email 2', prospect: { id: 1, email: 'A@B.c', stage: 'Email 2' } });
});

test('wrapSetter catches throws, warns, and returns a failure envelope', async () => {
  const warnings = [];
  const raw = async () => { throw new Error('Prospect not found: z'); };
  const wrapped = wrapSetter(raw, 'rating', (m) => warnings.push(m));
  const r = await wrapped('z', '💚');
  assert.deepEqual(r, { ok: false, error: 'Prospect not found: z' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /rating write failed/);
});

test('finalizeWriteApi wraps only the named setters, leaving reads untouched', async () => {
  const api = {
    getInfo: () => 'read',                 // not a setter → untouched
    setInfo: async (email, text) => ({ id: 1, info: text }),
    notListed: async () => ({ id: 9 }),    // not in SETTER_FIELDS → untouched
  };
  const out = finalizeWriteApi(api, () => {});
  assert.equal(out.getInfo(), 'read');
  assert.equal(await out.notListed().then((v) => v.id), 9); // still returns raw
  const r = await out.setInfo('a@b.c', 'niche: florist');
  assert.deepEqual(r, { ok: true, field: 'info', value: 'niche: florist', prospect: { id: 1, info: 'niche: florist' } });
});

test('finalizeWriteApi: a setter delegating to another does not double-wrap', async () => {
  const api = {
    setEmailSequence: async (email, seq) => ({ id: 1, email_sequence: seq }),
    async updateEmail(email, n, patch) {
      // delegates to the (now wrapped) sibling, like the real updateEmail
      return this.setEmailSequence(email, [{ number: n, ...patch }]);
    },
  };
  const out = finalizeWriteApi(api, () => {});
  const r = await out.updateEmail('a@b.c', 3, { subject: 'hi' });
  // Envelope from setEmailSequence, passed straight through — not wrapped twice.
  assert.equal(r.ok, true);
  assert.equal(r.field, 'email_sequence');
  assert.equal(isEnvelope(r.prospect), false);
  assert.deepEqual(r.prospect, { id: 1, email_sequence: [{ number: 3, subject: 'hi' }] });
});
