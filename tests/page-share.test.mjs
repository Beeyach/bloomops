import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicPagesFor, sharePreview, makeShareToken } from '../lib/page-share.mjs';

// These are the tests that matter. Getting sharing wrong does not leak one
// page, it leaks a workspace — so each of these asserts something is NOT
// reachable, not just that the happy path works.

const pages = [
  { id: 'root', title: 'Clients', parent_id: null },
  { id: 'jm', title: 'James Morgan', parent_id: 'root', share_token: 'tok-jm' },
  { id: 'jm-onb', title: 'Onboarding', parent_id: 'jm' },
  { id: 'jm-cal', title: 'Content Calendar', parent_id: 'jm' },
  { id: 'jm-deep', title: 'Week 1', parent_id: 'jm-onb' },
  { id: 'other', title: 'Other Client', parent_id: 'root' },
  { id: 'private', title: 'My rates', parent_id: null },
];

test('a token reaches its own page', () => {
  const r = publicPagesFor('tok-jm', pages);
  assert.ok(r.pages.some((p) => p.id === 'jm'));
});

test('subpages come with it, at any depth', () => {
  const ids = publicPagesFor('tok-jm', pages).pages.map((p) => p.id).sort();
  assert.deepEqual(ids, ['jm', 'jm-cal', 'jm-deep', 'jm-onb']);
});

test('the PARENT is never reachable', () => {
  // Sharing a client page must not expose the Clients page above it.
  const ids = publicPagesFor('tok-jm', pages).pages.map((p) => p.id);
  assert.ok(!ids.includes('root'), 'ancestor leaked');
});

test('siblings are never reachable', () => {
  const ids = publicPagesFor('tok-jm', pages).pages.map((p) => p.id);
  assert.ok(!ids.includes('other'), 'sibling leaked');
});

test('unrelated top-level pages are never reachable', () => {
  const ids = publicPagesFor('tok-jm', pages).pages.map((p) => p.id);
  assert.ok(!ids.includes('private'), 'unrelated page leaked');
});

test('an unknown token resolves to nothing', () => {
  assert.equal(publicPagesFor('not-a-real-token', pages), null);
});

test('an empty or missing token resolves to nothing', () => {
  assert.equal(publicPagesFor('', pages), null);
  assert.equal(publicPagesFor(null, pages), null);
  assert.equal(publicPagesFor(undefined, pages), null);
});

test('revoking a token makes the link dead immediately', () => {
  const revoked = pages.map((p) => (p.id === 'jm' ? { ...p, share_token: null } : p));
  assert.equal(publicPagesFor('tok-jm', revoked), null);
});

test('a page id is not a valid token', () => {
  // The URL carries a token, never the id — otherwise anyone could walk them.
  assert.equal(publicPagesFor('jm', pages), null);
});

test('trashed pages are excluded from a live share', () => {
  const withTrash = pages.map((p) => (p.id === 'jm-cal' ? { ...p, deleted_at: '2026-07-19' } : p));
  const ids = publicPagesFor('tok-jm', withTrash).pages.map((p) => p.id);
  assert.ok(!ids.includes('jm-cal'), 'trashed subpage still served');
});

test('trashing the shared page itself kills the link', () => {
  const withTrash = pages.map((p) => (p.id === 'jm' ? { ...p, deleted_at: '2026-07-19' } : p));
  assert.equal(publicPagesFor('tok-jm', withTrash), null);
});

test('the preview names every subpage that will go public', () => {
  const { page, subpages } = sharePreview('jm', pages);
  assert.equal(page.id, 'jm');
  assert.deepEqual(subpages.map((p) => p.id).sort(), ['jm-cal', 'jm-deep', 'jm-onb']);
});

test('tokens are long, unguessable and unique', () => {
  const a = makeShareToken();
  const b = makeShareToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32, 'token too short to resist guessing');
  assert.match(a, /^[0-9a-f]+$/);
});
