import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageSlug, pageHash } from '../lib/page-url.mjs';

test('slugifies a normal title', () => {
  assert.equal(pageSlug('Pipeline report'), 'pipeline-report');
});

test('strips punctuation and collapses separators', () => {
  assert.equal(pageSlug('Ellen’s  Dream — Client Checklist!'), 'ellen-s-dream-client-checklist');
});

test('falls back for a title with nothing usable', () => {
  assert.equal(pageSlug('***'), 'page');
  assert.equal(pageSlug(''), 'page');
  assert.equal(pageSlug(null), 'page');
});

test('never ends on a dangling separator when truncated', () => {
  const slug = pageSlug('a'.repeat(58) + ' bb');
  assert.ok(!slug.endsWith('-'), slug);
  assert.ok(slug.length <= 60);
});

test('builds a hash carrying the id prefix', () => {
  const hash = pageHash({ id: 'b959d454-ba91-486a-b1a1-6baedf03d680', title: 'Pipeline report' });
  assert.equal(hash, 'page/pipeline-report-b959d454');
});

test('two same-titled pages get different hashes', () => {
  const a = pageHash({ id: '11111111-aaaa', title: 'Untitled' });
  const b = pageHash({ id: '22222222-bbbb', title: 'Untitled' });
  assert.notEqual(a, b);
});

test('the id suffix is recoverable from the hash', () => {
  const id = 'b959d454-ba91-486a-b1a1-6baedf03d680';
  const hash = pageHash({ id, title: 'Weekly Pipeline Report' });
  assert.equal(hash.slice(-8), id.slice(0, 8));
});
