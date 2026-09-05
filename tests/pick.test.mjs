import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOne, rankProspects, renderPicks, picksForPrompt, BAND } from '../lib/pick.mjs';
import { buildSiteIntel } from '../lib/site-intel.mjs';

// Pick Bee used to send 400 rows of name/stage/date to the model and ask it to
// choose five: date arithmetic by language model, with the one thing that
// decides the answer — whether there is a verified reason to contact anybody —
// not even in the prompt.

const NOW = new Date('2026-08-09T12:00:00Z');
const iso = (d) => d;

const strongIntel = JSON.stringify(buildSiteIntel({
  worth: true, score: 12,
  reasons: ['Booking form returns a 500', 'Four images not loading'],
  facts: { platform: 'WordPress', booking: false },
}, { at: '2026-08-08T12:00:00Z' }));

const REPLIED_UNANSWERED = {
  id: 1, name: 'Sarah', stage: 'Interested', replied: 1, reply_type: 'interested',
  reply_date: '2026-08-08', last_contact_date: '2026-08-01', domain: 'sarah.com',
};
const COLD_WITH_EVIDENCE = {
  id: 2, name: 'Example Business', stage: 'New', domain: 'example.com',
  site_intel: strongIntel,
};
const WATCHED = {
  id: 3, name: 'Otis', stage: 'Email 2', domain: 'otis.com',
  last_contact_date: '2026-08-05',
  activity_log: JSON.stringify([{ ts: '2026-08-08T09:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' }]),
};
const DEFERRED_DUE = {
  id: 4, name: 'Judy', stage: 'Snoozed', reply_type: 'defer', replied: 1,
  reply_date: '2026-06-08', last_contact_date: '2026-06-09',
  next_action_date: '2026-08-09', domain: 'judy.com',
};

test('an active positive reply outranks the best cold research', () => {
  const ranked = rankProspects([COLD_WITH_EVIDENCE, REPLIED_UNANSWERED], { now: NOW });
  assert.equal(ranked[0].prospect.id, REPLIED_UNANSWERED.id);
  assert.equal(ranked[0].band, BAND.ANSWER_THEM);
  assert.match(ranked[0].reason, /nothing has gone back yet/);
});

test('the full order puts conversations before research', () => {
  const ranked = rankProspects([COLD_WITH_EVIDENCE, DEFERRED_DUE, WATCHED, REPLIED_UNANSWERED], { now: NOW, limit: 10 });
  assert.deepEqual(ranked.map((r) => r.prospect.name), ['Sarah', 'Otis', 'Judy', 'Example Business']);
});

test('a reply that was already answered stops being top priority', () => {
  const answered = { ...REPLIED_UNANSWERED, last_contact_date: '2026-08-09' };
  const r = rankOne(answered, { now: NOW });
  assert.notEqual(r.band, BAND.ANSWER_THEM);
});

test('a decline never becomes an active conversation', () => {
  const declined = { ...REPLIED_UNANSWERED, reply_type: 'decline' };
  const r = rankOne(declined, { now: NOW });
  assert.notEqual(r.band, BAND.ANSWER_THEM);
});

test('watching the video and going quiet ranks above unsent work', () => {
  const unsent = { id: 9, name: 'Vic', stage: 'Email 1', domain: 'v.com', video_url: 'https://x/video/v', video_sent_at: null };
  const ranked = rankProspects([unsent, WATCHED], { now: NOW });
  assert.equal(ranked[0].prospect.name, 'Otis');
  assert.equal(ranked[1].band, BAND.VIDEO_UNSENT);
});

test('a closed stage is never picked', () => {
  for (const stage of ['Client', 'Rejected', 'Lost', 'Finished', 'Invalid Email']) {
    assert.equal(rankOne({ id: 1, stage, domain: 'x.com' }, { now: NOW }), null, stage);
  }
});

test('a cold prospect with nothing verified ranks last and says why', () => {
  const bare = { id: 5, name: 'Nobody', stage: 'New', domain: 'n.com' };
  const r = rankOne(bare, { now: NOW });
  assert.equal(r.band, BAND.NOTHING_TO_SAY);
  assert.match(r.reason, /Nothing verified about them yet/);
});

test("Ary's own findings drive the reason text when they exist", () => {
  const p = {
    id: 6, name: 'Kym', stage: 'New', domain: 'k.com',
    own_findings: JSON.stringify([{ text: 'Header video is black' }, { text: 'Booking button goes nowhere' }]),
  };
  const r = rankOne(p, { now: NOW });
  assert.equal(r.band, BAND.STRONG_EVIDENCE);
  assert.equal(r.headline, 'You found something here');
  assert.match(r.reason, /Header video is black/);
});

test('the same input always produces the same order', () => {
  const rows = [COLD_WITH_EVIDENCE, WATCHED, DEFERRED_DUE, REPLIED_UNANSWERED];
  const a = rankProspects(rows, { now: NOW, limit: 10 }).map((r) => r.prospect.id);
  const b = rankProspects([...rows].reverse(), { now: NOW, limit: 10 }).map((r) => r.prospect.id);
  assert.deepEqual(a, b, 'ordering must not depend on input order');
});

test('ties inside a band break by who has waited longest', () => {
  const older = { id: 10, name: 'Old', stage: 'New', domain: 'o.com', site_intel: strongIntel, last_contact_date: '2026-01-01' };
  const newer = { id: 11, name: 'New', stage: 'New', domain: 'n.com', site_intel: strongIntel, last_contact_date: '2026-08-01' };
  const ranked = rankProspects([newer, older], { now: NOW });
  assert.equal(ranked[0].prospect.name, 'Old');
});

test('the deterministic render is a complete answer on its own', () => {
  // This is the fallback when the model call fails. It must stand alone.
  const ranked = rankProspects([REPLIED_UNANSWERED, COLD_WITH_EVIDENCE], { now: NOW });
  const text = renderPicks(ranked);
  assert.match(text, /1\. Sarah/);
  assert.match(text, /Active conversation/);
  assert.match(text, /2\. Example Business/);
  assert.ok(text.length > 60);
});

test('the prompt tells the model not to invent a reason for an empty prospect', () => {
  const bare = { id: 7, name: 'Nobody', stage: 'New', domain: 'n.com' };
  const prompt = picksForPrompt(rankProspects([bare], { now: NOW }));
  assert.match(prompt, /NOTHING verified about this one\. Do not invent a reason\./);
});

test('the prompt carries manual and verified findings separately', () => {
  const p = {
    id: 8, name: 'Kym', stage: 'New', domain: 'k.com',
    site_intel: strongIntel,
    own_findings: JSON.stringify([{ text: 'Header video is black' }]),
  };
  const prompt = picksForPrompt(rankProspects([p], { now: NOW }));
  assert.match(prompt, /MANUAL findings: Header video is black/);
  assert.match(prompt, /VERIFIED findings:.*Booking form/);
});
