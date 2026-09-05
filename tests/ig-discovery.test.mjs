import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRelatedProfile, dedupeHandles } from '../lib/ig-discovery.mjs';
import { scoreProfile, engagementOf } from '../lib/ig-checklist.mjs';

test('normalizes the camelCase shape', () => {
  const p = normalizeRelatedProfile({
    username: 'dreamcoach',
    fullName: 'Dream Coach',
    biography: 'Business coach. Founder of the Scale Method.',
    followersCount: 4200,
    externalUrl: 'https://dreamcoach.com',
    businessCategoryName: 'Coach',
  });
  assert.equal(p.handle, 'dreamcoach');
  assert.equal(p.followersCount, 4200);
  assert.equal(p.externalUrl, 'https://dreamcoach.com');
});

test('accepts alternate field spellings', () => {
  const p = normalizeRelatedProfile({ userName: 'x', bio: 'coach', followers: '12,500', website: 'https://a.com' });
  assert.equal(p.biography, 'coach');
  assert.equal(p.followersCount, 12500, 'comma-formatted follower counts must parse');
  assert.equal(p.externalUrl, 'https://a.com');
});

test('recovers the handle from a profile URL', () => {
  const p = normalizeRelatedProfile({ url: 'https://www.instagram.com/somecoach/' });
  assert.equal(p.handle, 'somecoach');
});

test('strips a leading @', () => {
  assert.equal(normalizeRelatedProfile({ username: '@coach' }).handle, 'coach');
});

test('returns null for junk', () => {
  assert.equal(normalizeRelatedProfile(null), null);
  assert.equal(normalizeRelatedProfile({}), null);
});

test('captions as plain strings still become posts', () => {
  const p = normalizeRelatedProfile({ username: 'a', captions: ['my mastermind', 'client results'] });
  assert.equal(p.latestPosts.length, 2);
  assert.equal(p.latestPosts[0].caption, 'my mastermind');
});

test('the normalized shape feeds scoreProfile without adaptation', () => {
  const p = normalizeRelatedProfile({
    username: 'coachjane',
    biography: 'Business coach helping founders scale. Join my mastermind.',
    followersCount: 5000,
    externalUrl: 'https://coachjane.com',
    posts: [{ caption: 'client results', likesCount: 120 }, { caption: 'six figure launch', likesCount: 90 }],
  });
  const v = scoreProfile(p);
  assert.ok(v);
  assert.equal(typeof v.revenueScore, 'number');
  assert.equal(v.mustHavesPass, true, 'coach bio + real site + named offer + live engagement should pass');
});

test('engagement uses the actor avgLikes when posts carry no like counts', () => {
  // The discovery actor returns captions without per-post likes, but gives an
  // avgLikes of its own. Without this the account reads as dead.
  const p = normalizeRelatedProfile({
    username: 'a',
    followersCount: 3000,
    avgLikes: 140,
    captions: ['a', 'b'],
  });
  const eng = engagementOf(p);
  assert.equal(eng.alive, true);
  assert.equal(eng.avgLikes, 140);
});

test('dedupe splits fresh from already-seen', () => {
  const { fresh, repeats } = dedupeHandles(
    [{ handle: 'newone' }, { handle: 'OldOne' }, { handle: 'another' }],
    ['oldone']
  );
  assert.deepEqual(fresh.map((p) => p.handle), ['newone', 'another']);
  assert.deepEqual(repeats.map((p) => p.handle), ['OldOne']);
});

test('dedupe is case insensitive and drops in-batch duplicates', () => {
  const { fresh } = dedupeHandles([{ handle: 'Same' }, { handle: 'same' }], []);
  assert.equal(fresh.length, 1);
});
