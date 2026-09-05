import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStage, normalizeFiles, parseFiles, CLIENT_STAGES } from '../lib/client-profile.mjs';

test('known stages survive', () => {
  for (const s of CLIENT_STAGES) assert.equal(normalizeStage(s), s);
});

test('an unknown stage falls back to Onboarding', () => {
  assert.equal(normalizeStage('Nonsense'), 'Onboarding');
  assert.equal(normalizeStage(undefined), 'Onboarding');
});

test('http and https links are kept', () => {
  const out = normalizeFiles([{ label: 'Contract', url: 'https://drive.google.com/file/abc' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'Contract');
});

test('a link with no label is named after its host', () => {
  const out = normalizeFiles([{ url: 'https://drive.google.com/file/abc' }]);
  assert.equal(out[0].label, 'drive.google.com');
});

test('javascript and data URLs are dropped', () => {
  // These render as clickable links, so anything but http(s) is a script
  // waiting for a click.
  const out = normalizeFiles([
    { label: 'x', url: 'javascript:alert(1)' },
    { label: 'y', url: 'data:text/html,<script>' },
    { label: 'ok', url: 'https://example.com' },
  ]);
  assert.deepEqual(out.map((f) => f.label), ['ok']);
});

test('junk input yields an empty list, never a crash', () => {
  assert.deepEqual(normalizeFiles(null), []);
  assert.deepEqual(normalizeFiles('nope'), []);
  assert.deepEqual(parseFiles('not json'), []);
  assert.deepEqual(parseFiles(null), []);
});

test('parseFiles reads a stored JSON string', () => {
  const out = parseFiles('[{"label":"Contract","url":"https://a.com/x.pdf"}]');
  assert.equal(out[0].url, 'https://a.com/x.pdf');
});

test('the list is capped so one client cannot carry a thousand links', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ label: 'f' + i, url: 'https://a.com/' + i }));
  assert.equal(normalizeFiles(many).length, 30);
});
