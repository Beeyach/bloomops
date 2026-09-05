// Today as a dashboard, and rows that read like a person wrote them.
//
// Two problems, one screen. Sections that rendered as nothing when empty, so
// "there is none" and "you have not scrolled far enough" looked identical. And
// rows that flattened person, business, country and waiting age into one strip
// with a raw browser error on top.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUCKETS, BUCKET_BY_ID, ORDER, PREVIEW, rankOf,
  sectionView, shouldRender, viewAllLabel, loadedLabel, bucketForView,
} from '../lib/today-buckets.mjs';
import { BUCKET, buildExceptionQueue } from '../lib/exceptions.mjs';
import { FAIL, friendlyError, looksTechnical, canRetry, failureCard } from '../lib/friendly-errors.mjs';
import { listIdentity, waitingLabel, waitingIsOld, locationLabel } from '../lib/row-identity.mjs';
import { SEND_DEFAULTS } from '../lib/send-policy.mjs';

const rows = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, ...over }));

// ── 1, 2. Important sections render at zero, and say so ──────────────────

test('ready for approval renders even when there is nothing', () => {
  const def = BUCKET_BY_ID.approvals;
  const s = sectionView(def, { items: [], total: 0 });
  assert.equal(s.isEmpty, true);
  assert.equal(s.showWhenEmpty, true);
  assert.equal(shouldRender(s), true, 'an empty important section still renders');
  assert.match(s.emptyText, /^No new outreach is ready right now\./);
});

test('every section Ary acts on survives being empty', () => {
  for (const id of ['replies', 'approvals', 'decisions', 'deferrals']) {
    const s = sectionView(BUCKET_BY_ID[id], { items: [], total: 0 });
    assert.equal(shouldRender(s), true, `${id} must not vanish at zero`);
    assert.ok(s.emptyText, `${id} needs something to say`);
  }
});

test('the quieter sections may stay hidden when empty', () => {
  for (const id of ['held', 'legacy', 'blocked']) {
    const s = sectionView(BUCKET_BY_ID[id], { items: [], total: 0 });
    assert.equal(shouldRender(s), false, `${id} is not today's job when it is empty`);
  }
});

// ── 3, 4. Preview, and a count that tells the truth ──────────────────────

test('a section with 26 items shows only the preview', () => {
  const s = sectionView(BUCKET_BY_ID.approvals, { items: rows(26), total: 26 });
  assert.equal(PREVIEW, 5);
  assert.equal(s.preview.length, 5);
  assert.equal(s.shown, 5);
  assert.equal(s.hasMore, true);
});

test('view all reports the total, never the preview size', () => {
  const s = sectionView(BUCKET_BY_ID.approvals, { items: rows(26), total: 26 });
  assert.equal(s.total, 26);
  assert.equal(viewAllLabel(s), 'View all 26');
  assert.equal(viewAllLabel(s).includes('5'), false);
});

test('a count comes from the real total even when few rows are loaded', () => {
  // The held bucket loads 25 and the job is 702. The header says 702.
  const s = sectionView(BUCKET_BY_ID.held, { items: rows(25), total: 702 });
  assert.equal(s.total, 702);
  assert.equal(viewAllLabel(s), 'View all 702');
  assert.equal(s.remaining, 697);
});

test('nothing offers to view all when everything already fits', () => {
  const s = sectionView(BUCKET_BY_ID.approvals, { items: rows(3), total: 3 });
  assert.equal(s.hasMore, false);
  assert.equal(viewAllLabel(s), null);
  assert.equal(s.preview.length, 3);
});

test('a bucket page says how much of the pile is on screen', () => {
  assert.equal(loadedLabel({ returned: 25, total: 702 }), 'Showing 25 of 702.');
  assert.equal(loadedLabel({ returned: 702, total: 702 }), '702 in total.');
  // Never "all 200" when there are 702.
  assert.equal(loadedLabel({ returned: 200, total: 702 }).includes('all'), false);
});

// ── 5, 11, 12. Bucket pages, and section order ───────────────────────────

test('every bucket has its own page, reachable by view', () => {
  for (const b of BUCKETS) {
    assert.ok(b.view, `${b.id} needs a page`);
    assert.equal(bucketForView(b.view)?.id, b.id, 'the route resolves back to the bucket');
  }
  assert.equal(bucketForView('today/approvals').id, 'approvals');
  assert.equal(bucketForView('nonsense'), null);
});

test('replies and approvals stay above held and old drafts', () => {
  assert.ok(rankOf('replies') < rankOf('approvals'));
  assert.ok(rankOf('approvals') < rankOf('held'), 'approvals must never sit below the held pile');
  assert.ok(rankOf('approvals') < rankOf('legacy'));
  assert.ok(rankOf('decisions') < rankOf('held'));
  assert.deepEqual(ORDER.slice(0, 4), ['replies', 'approvals', 'decisions', 'deferrals']);
});

// ── 6. Legacy drafts never enter the approval count ──────────────────────

test('an old draft cannot be counted as ready for approval', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const q = buildExceptionQueue([{
    id: 1, name: 'Kym', email: 'k@x.com', stage: 'Email 2',
    pending_draft: 'old copy', pending_draft_at: '2026-08-01 09:00:00',
  }], { now });

  assert.equal(q.totals[BUCKET.LEGACY_DRAFT], 1);
  assert.equal(q.totals[BUCKET.READY_FOR_APPROVAL], undefined);

  // And the approvals section reads its own source, which is packages.
  assert.equal(BUCKET_BY_ID.approvals.bucket, null);
});

test('bucket totals are counted before any page limit', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const many = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1, name: `P${i}`, email: `p${i}@x.com`, stage: 'Email 2',
    pending_draft: 'old', pending_draft_at: '2026-08-01 09:00:00',
  }));
  const q = buildExceptionQueue(many, { now, limit: 5 });
  assert.equal(q.totals[BUCKET.LEGACY_DRAFT], 30, 'the total is the job, not the page');
  assert.ok(q.shown <= 5);
});

// ── Friendly errors ──────────────────────────────────────────────────────

test('a DNS failure reads like a sentence', () => {
  const f = friendlyError('page.goto: net::ERR_NAME_NOT_RESOLVED at https://example.com');
  assert.equal(f.kind, FAIL.DNS);
  assert.equal(f.title, 'Their website could not be reached');
  assert.match(f.detail, /not resolving/);
  assert.equal(f.retry, true);
  // The raw text is kept, not thrown away.
  assert.match(f.raw, /ERR_NAME_NOT_RESOLVED/);
});

test('a timeout reads like a sentence', () => {
  const f = friendlyError('Timeout 45000ms exceeded.\nCall log: navigating to "https://x.com"');
  assert.equal(f.kind, FAIL.TIMEOUT);
  assert.equal(f.title, 'Their website took too long to load');
  assert.match(f.detail, /Nothing was changed/);
});

test('the raw text is never the headline', () => {
  for (const raw of [
    'page.goto: net::ERR_NAME_NOT_RESOLVED',
    'Timeout 45000ms exceeded',
    'Call log: navigating to https://x.com',
    'Error: ECONNREFUSED 1.2.3.4:443',
  ]) {
    const f = friendlyError(raw);
    assert.equal(f.title.includes(raw), false);
    assert.equal(looksTechnical(f.title), false, `"${f.title}" still reads like a log line`);
    assert.equal(looksTechnical(raw), true, 'and the raw text is correctly recognised as technical');
  }
});

test('an unknown failure is not given an invented diagnosis', () => {
  const f = friendlyError('something nobody has seen before');
  assert.equal(f.kind, FAIL.UNKNOWN);
  assert.equal(f.title, 'The check could not finish');
  assert.match(f.detail, /Nothing was sent or changed/);
});

test('a blocked site says so, and is not offered a pointless retry', () => {
  const f = friendlyError('Cloudflare challenge: just a moment...');
  assert.equal(f.kind, FAIL.BLOCKED);
  assert.equal(f.retry, false);
});

test('the queue classification beats whatever the text says', () => {
  const f = friendlyError('page.goto: net::ERR_NAME_NOT_RESOLVED', { errorKind: 'budget' });
  assert.equal(f.kind, FAIL.CREDITS);
  assert.equal(f.retry, false);
});

test('a retryable failure offers Try again, and a closed prospect does not', () => {
  const dns = friendlyError('ERR_NAME_NOT_RESOLVED');
  assert.equal(canRetry(dns, { stage: 'Email 1' }), true);
  assert.equal(canRetry(dns, { stage: 'Email 1', do_not_contact: 1 }), false);
  assert.equal(canRetry(dns, { stage: 'Email 1', unsubscribed: 1 }), false);
  assert.equal(canRetry(dns, { stage: 'Email 1', reply_type: 'decline' }), false);
  assert.equal(canRetry(dns, { stage: 'Client' }), false);
  assert.equal(canRetry(friendlyError('captcha'), { stage: 'Email 1' }), false);
});

test('a failure card carries the friendly copy and the raw text separately', () => {
  const card = failureCard({
    detail: 'page.goto: net::ERR_NAME_NOT_RESOLVED',
    stage: 'Email 1',
    name: 'A Merry Mind',
  });
  assert.equal(card.title, 'Their website could not be reached');
  assert.equal(card.canRetry, true);
  assert.equal(card.hasTechnical, true);
  assert.match(card.technical, /ERR_NAME_NOT_RESOLVED/);
  // Never "A background job failed".
  assert.equal(/background job/i.test(card.title), false);
});

test('nothing about error presentation calls a model', async () => {
  const src = await (await import('node:fs/promises')).readFile('lib/friendly-errors.mjs', 'utf8');
  for (const forbidden of ['fetch(', 'aiCall', 'anthropic', '/api/ai']) {
    assert.equal(src.includes(forbidden), false, `error copy must not reach for ${forbidden}`);
  }
});

// ── Row hierarchy ────────────────────────────────────────────────────────

test('the business is primary and the person is secondary', () => {
  const id = listIdentity({ name: 'Dennis', business_name: 'Doolan Coaching' });
  assert.equal(id.primary, 'Doolan Coaching');
  assert.equal(id.secondary, 'Dennis');
});

test('a person is promoted when there is no business', () => {
  const id = listIdentity({ name: 'Dennis' });
  assert.equal(id.primary, 'Dennis');
  assert.equal(id.secondary, null, 'nothing repeats underneath it');
});

test('a name that matches the business is said once', () => {
  // The failure cards were rendering "A Merry Mind · A Merry Mind".
  const id = listIdentity({ name: 'A Merry Mind', business_name: 'A Merry Mind' });
  assert.equal(id.primary, 'A Merry Mind');
  assert.equal(id.secondary, null);
});

test('a row with nothing but an id still identifies itself', () => {
  assert.equal(listIdentity({ id: 42 }).primary, '#42');
  assert.equal(listIdentity({ id: 42, email: 'a@b.com' }).primary, 'a@b.com');
});

test('the country sits on the second line and never in the title', () => {
  const id = listIdentity({ name: 'Dennis', business_name: 'Doolan Coaching', country: 'US' });
  assert.equal(id.place, 'US');
  assert.equal(id.primary.includes('US'), false);
  assert.equal(id.secondary, 'Dennis · US');
  assert.equal(locationLabel({ country: 'gb' }), 'UK');
  assert.equal(locationLabel({ country: 'United States' }), 'United States');
  assert.equal(locationLabel({}), null);
});

test('waiting age is its own phrase, and old waits are marked', () => {
  assert.equal(waitingLabel(36), 'Waiting 36 days');
  assert.equal(waitingLabel(1), 'Waiting 1 day');
  assert.equal(waitingLabel(0), 'Waiting since today');
  assert.equal(waitingLabel(null), null);
  assert.equal(waitingIsOld(36), true);
  assert.equal(waitingIsOld(3), false);
});

test('the queue hands rows the raw identity fields, not a flattened string', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const q = buildExceptionQueue([{
    id: 1, name: 'Dennis', business_name: 'Doolan Coaching', country: 'US',
    email: 'd@x.com', stage: 'Snoozed', reply_type: 'interested',
    last_contact_date: '2026-07-05', replied: 1, reply_date: '2026-08-09',
  }], { now });
  const r = q.rows[0];
  assert.equal(r.person, 'Dennis');
  assert.equal(r.businessName, 'Doolan Coaching');
  assert.equal(r.country, 'US');
  assert.ok(Number.isFinite(r.waitingDays));
  // The row component decides the hierarchy from these.
  assert.equal(listIdentity(r).primary, 'Doolan Coaching');
  // And the stage never reaches the headline. It used to BE the headline:
  // "Snoozed, and it is a conversation".
  assert.ok(!/Snoozed/.test(r.headline), 'the stage is not what a card says');
});

// ── Nothing about behaviour moved ────────────────────────────────────────

test('this pass changed no send switch', () => {
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});

test('bucket meanings are unchanged, only their presentation', () => {
  assert.equal(BUCKET_BY_ID.replies.bucket, BUCKET.NEEDS_REPLY);
  assert.equal(BUCKET_BY_ID.decisions.bucket, BUCKET.NEEDS_DECISION);
  assert.equal(BUCKET_BY_ID.deferrals.bucket, BUCKET.RESURFACED);
  assert.equal(BUCKET_BY_ID.blocked.bucket, BUCKET.BLOCKED);
  assert.equal(BUCKET_BY_ID.legacy.bucket, BUCKET.LEGACY_DRAFT);
});

test('the preview and the full page describe the same bucket', () => {
  // Same definition object drives both, so the title, the blurb and the empty
  // wording cannot drift between the two screens.
  for (const b of BUCKETS) {
    const preview = sectionView(b, { items: rows(10), total: 10, limit: PREVIEW });
    const fullPage = sectionView(b, { items: rows(10), total: 10, limit: 25 });
    assert.equal(preview.title, fullPage.title);
    assert.equal(preview.blurb, fullPage.blurb);
    assert.equal(preview.total, fullPage.total);
    assert.equal(preview.shown, 5);
    assert.equal(fullPage.shown, 10);
  }
});
