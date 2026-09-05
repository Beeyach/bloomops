import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProspectContext } from '../lib/prospect-context.mjs';
import {
  buildReplyCoachParts,
  buildCallPrepParts,
  buildProposalParts,
  buildBestFiveParts,
  buildVoiceNoteParts,
  VOICE_RULES,
} from '../lib/bee-prompts.mjs';

const PROSPECT = {
  name: 'Maya Chen',
  business_name: 'Bloom Salon',
  niche: 'hair salon',
  domain: 'bloomsalon.com',
  country: 'US',
  stage: 'Interested',
  rating: 'Strong',
  emails_sent: 3,
  replied: 1,
  reply_type: 'interested',
  reply_date: '2026-08-06',
  video_url: 'https://file.gobloomwired.com/video/bloomsalon',
  video_reasons: JSON.stringify(['contact form 404s', 'stale copyright']),
  audit_notes: 'RATING: STRONG\n\nBusiness: Bloom Salon, Portland OR\nPlatform: Wix\n\nSITE AUDIT\n- Booking: ✅ VERIFIED VISIBLE',
  activity_log: JSON.stringify([
    { ts: '2026-08-07T10:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' },
    { ts: '2026-08-07T18:00:00Z', tag: 'REPLY', text: 'They said: asked about pricing' },
  ]),
  info: 'Owner is Maya, two chairs, books via DMs mostly.',
};

test('context block carries every layer of the record', () => {
  const c = buildProspectContext(PROSPECT);
  for (const expected of [
    'Bloom Salon', 'Stage: Interested', 'Audit rating: STRONG', 'Platform: Wix',
    '[ok] Booking', 'contact form 404s', 'THEY WATCHED IT', 'Watched 75%',
    'They replied: interested', 'asked about pricing', "ARY'S OWN NOTES", 'two chairs',
  ]) {
    assert.ok(c.includes(expected), `context missing: ${expected}`);
  }
});

test('context stays calm on an empty record', () => {
  const c = buildProspectContext({ name: 'X' });
  assert.ok(c.includes('No reply yet.'));
  assert.ok(!c.includes('SITE AUDIT PROFILE'));
});

test('reply coach: voice rules cached in system, reply text only in user', () => {
  const ctx = buildProspectContext(PROSPECT);
  const p = buildReplyCoachParts({ offer: 'booking systems' }, ctx, 'How much is this going to cost me?');
  assert.ok(p.system.includes('VOICE RULES'));
  assert.ok(p.system.includes('booking systems'));
  assert.ok(!p.system.includes('How much is this going to cost me?'));
  assert.ok(p.user.includes('How much is this going to cost me?'));
  assert.ok(p.user.includes('Bloom Salon'));
});

test('call prep demands the five sections and forbids invention', () => {
  const p = buildCallPrepParts({}, 'CTX');
  for (const h of ['## Who', "## What's broken", '## Signals', '## Ask these', '## Open with']) {
    assert.ok(p.system.includes(h), `missing ${h}`);
  }
  assert.ok(p.system.includes('Never invent'));
});

test('proposal keeps prices sacred and carries the template only in user', () => {
  const p = buildProposalParts({}, 'CTX', 'Tier 1: $297');
  assert.ok(p.system.includes('Never change a price'));
  assert.ok(p.user.includes('Tier 1: $297'));
  assert.ok(!p.system.includes('$297'));
});

test('best five ranks watchers first and bans declined', () => {
  const p = buildBestFiveParts({}, '12 | Maya | Bloom Salon | Interested | Strong | yes | 2026-08-01 | watched 75%');
  assert.ok(p.system.includes('watched the audit video'));
  assert.ok(p.system.includes('declined'));
  assert.ok(p.user.includes('Bloom Salon'));
});

test('voice note is JSON-only, conservative, with an allowed-stage whitelist', () => {
  const p = buildVoiceNoteParts({ today: '2026-08-08' }, 'CTX', 'she said call her tuesday');
  assert.ok(p.system.includes('ONLY a JSON object'));
  assert.ok(p.system.includes('"Interested"'));
  assert.ok(p.system.includes('conservative'));
  assert.ok(p.user.includes('TODAY: 2026-08-08'));
  assert.ok(p.user.includes('call her tuesday'));
});

test('the voice rules ban the banned', () => {
  for (const banned of ['em dashes', 'exclamation', 'streamline', 'I hope this email finds you well']) {
    assert.ok(VOICE_RULES.includes(banned), `rules missing ban: ${banned}`);
  }
});
