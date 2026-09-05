import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealSecret, openSecret, isEncrypted } from '../lib/secret-box.mjs';

const ENV = { LTB_SESSION_SECRET: 'test-secret' };

test('seal then open round-trips', async () => {
  const sealed = await sealSecret(ENV, 'sk-ant-abc123');
  assert.ok(isEncrypted(sealed));
  assert.notEqual(sealed, 'sk-ant-abc123');
  assert.equal(await openSecret(ENV, sealed), 'sk-ant-abc123');
});

test('empty stays empty both ways', async () => {
  assert.equal(await sealSecret(ENV, ''), '');
  assert.equal(await openSecret(ENV, ''), '');
});

test('legacy plaintext passes through open unchanged', async () => {
  assert.equal(await openSecret(ENV, 'sk-ant-legacy'), 'sk-ant-legacy');
});

test('two seals of the same value differ (fresh IV) but both open', async () => {
  const a = await sealSecret(ENV, 'token');
  const b = await sealSecret(ENV, 'token');
  assert.notEqual(a, b);
  assert.equal(await openSecret(ENV, a), 'token');
  assert.equal(await openSecret(ENV, b), 'token');
});

test('wrong secret opens to empty string, never junk or a throw', async () => {
  const sealed = await sealSecret(ENV, 'sk-ant-abc123');
  assert.equal(await openSecret({ LTB_SESSION_SECRET: 'different' }, sealed), '');
});

test('tampered ciphertext opens to empty string', async () => {
  const sealed = await sealSecret(ENV, 'sk-ant-abc123');
  const tampered = sealed.slice(0, -4) + 'AAAA';
  assert.equal(await openSecret(ENV, tampered), '');
});
