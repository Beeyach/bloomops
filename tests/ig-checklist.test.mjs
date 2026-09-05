import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreProfile, engagementOf } from '../lib/ig-checklist.mjs';

// A profile that passes everything, as a base to mutate per case.
function P(over = {}) {
  return {
    username: 'dreamclient',
    fullName: 'Jane Doe',
    biography: 'Business coach. Founder of the Scale Society mastermind. 6-figure launches. My team helps you.',
    externalUrl: 'https://janedoe.com/apply',
    followersCount: 4200,
    postsCount: 340,
    highlightReelCount: 5,
    latestPosts: Array.from({ length: 6 }, () => ({ likesCount: 120, caption: 'client results' })),
    ...over,
  };
}

test('a full dream client passes must-haves and qualifies', () => {
  const r = scoreProfile(P());
  assert.equal(r.mustHavesPass, true);
  assert.ok(r.revenueScore >= 2);
  assert.equal(r.qualifies, true);
});

test('under 1,000 followers fails the audience must-have', () => {
  const r = scoreProfile(P({ followersCount: 800 }));
  assert.equal(r.mustHaves.audience.pass, false);
  assert.equal(r.qualifies, false);
});

test('her exact example fails: 5k followers with 3 likes a post', () => {
  const r = scoreProfile(P({
    followersCount: 5000,
    latestPosts: Array.from({ length: 6 }, () => ({ likesCount: 3, caption: '' })),
  }));
  assert.equal(r.mustHaves.audience.pass, false);
  assert.match(r.mustHaves.audience.detail, /only ~3 likes/);
});

test('a small but lively account passes on the average-likes floor', () => {
  const r = scoreProfile(P({
    followersCount: 1200,
    latestPosts: Array.from({ length: 5 }, () => ({ likesCount: 40, caption: '' })),
  }));
  assert.equal(r.mustHaves.audience.pass, true);
});

test('a linktree bio link fails the identity must-have', () => {
  const r = scoreProfile(P({ externalUrl: 'https://linktr.ee/janedoe' }));
  assert.equal(r.mustHaves.identity.pass, false);
  assert.match(r.mustHaves.identity.detail, /linktree/i);
});

test('no link at all fails the identity must-have', () => {
  const r = scoreProfile(P({ externalUrl: '' }));
  assert.equal(r.mustHaves.identity.pass, false);
  assert.match(r.mustHaves.identity.detail, /No link/i);
});

test('no named offer fails the offer must-have', () => {
  const r = scoreProfile(P({
    biography: 'Business coach. DM me to chat.',
    latestPosts: [{ likesCount: 120, caption: 'hello' }],
  }));
  assert.equal(r.mustHaves.offer.pass, false);
});

test('revenue signals are counted individually', () => {
  const r = scoreProfile(P({
    biography: 'Coach. Founder of the Reset program.',
    highlightReelCount: 0,
    postsCount: 10,
    latestPosts: [{ likesCount: 200, caption: 'plain post' }],
  }));
  // no income, no pricing, no proof, no production, no team, few posts
  assert.equal(r.revenueScore, 0);
  assert.equal(r.qualifies, false, 'must-haves can pass and still not qualify under 2 signals');
  assert.equal(r.mustHavesPass, true);
});

test('paid ads stays a human check, never auto-scored', () => {
  const r = scoreProfile(P());
  assert.ok(r.manualChecks.some((m) => /Ad Library/i.test(m)));
  assert.ok(!r.signals.some((s) => /ads/i.test(s.label)));
});

test('engagement is null, not false, when there are no posts to judge', () => {
  const e = engagementOf(P({ latestPosts: [] }));
  assert.equal(e.alive, null);
  const r = scoreProfile(P({ latestPosts: [] }));
  assert.match(r.mustHaves.audience.detail, /no recent posts/i);
});

test('handles a junk or empty profile without throwing', () => {
  assert.doesNotThrow(() => scoreProfile({}));
  assert.doesNotThrow(() => scoreProfile(null));
  assert.equal(scoreProfile({}).qualifies, false);
});
