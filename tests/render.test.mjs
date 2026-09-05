// Render smoke tests: the 285-test suite was all pure logic, which is how
// a cells-under-wrong-headers bug shipped invisibly. These render REAL
// components server-side (react-dom/server, no browser, no new deps) and
// assert on the markup. Components load via dynamic import AFTER the JSX
// hooks register (static imports would hoist past the register call).
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

const WARM_PROSPECT = {
  id: 7,
  name: 'Kym Stewart',
  business_name: 'Heart and Soul Woman',
  email: 'kym@heartandsoulwoman.com',
  domain: 'heartandsoulwoman.com',
  stage: 'Interested',
  rating: '💚',
  emails_sent: 3,
  last_contact_date: '2026-07-30',
  reply_type: 'interested',
  replied: 1,
  info: 'Speaker and celebrant.\nPRESCREEN 3 Aug 2026: STRONG',
  activity_log: JSON.stringify([{ ts: '2026-08-06T17:00:00Z', tag: 'reply', text: 'she said yes' }]),
  audit_notes: 'WordPress site, contact form only.',
  created_at: '2026-07-29T00:00:00Z',
};

test('TodayView renders the warm list with quick actions', async () => {
  const { default: TodayView } = await import('../components/TodayView.jsx');
  const html = renderToString(
    React.createElement(TodayView, {
      prospects: [WARM_PROSPECT],
      dueFn: () => null,
      daysSinceFn: () => 9,
      pastDueFn: () => null,
      onOpen: () => {},
      onNavigate: () => {},
      onNudged: () => {},
      onSnooze: () => {},
    })
  );
  // Chapter 9: Today is a tab strip, and the tab that owns a warm lead is
  // Replies. The section title comes from the tab, not from a fixed heading.
  assert.ok(html.includes('Replies'), 'the tab that owns her own work renders');
  assert.ok(html.includes('role="tablist"'), 'and it is a real tab strip');

  // One-source-of-truth pass: this fixture is `replied = 1` with no message
  // behind it, which is precisely the shape that made Replies say 17 and
  // prove 1. Replies is owned by the evidence-backed bucket now, so a flag
  // with no reply behind it no longer draws a row there — and the block that
  // used to draw it is gone with it.
  assert.ok(!html.includes('Waiting on your reply'), 'the prospect-column pile no longer renders under Replies');
  assert.ok(!html.includes('Email 3'), 'no raw stage on the row');
});

test('TodayView shows a prospect in exactly one pile', async () => {
  // The shipped bug: the "Watched your video" pile was built independently of
  // every other pile, so one prospect could be told about three times on one
  // screen. Worse than the repetition, two of those piles contradicted each
  // other: "write to them today" above "the sweep sends this one itself".
  const { default: TodayView } = await import('../components/TodayView.jsx');
  const ts = new Date(Date.now() - 3600_000).toISOString();
  const watcher = {
    id: 21,
    name: 'Dale Ridgeway',
    business_name: 'Ridgeway Physio',
    email: 'dale@ridgewayphysio.com',
    // An Email-3 row is in the sweep's cadence AND warm enough for Needs you,
    // so before the fix this one rendered in all three.
    stage: 'Email 3',
    replied: 1,
    emails_sent: 3,
    last_contact_date: '2026-07-01',
    activity_log: JSON.stringify([
      { ts, tag: 'VIDEOVIEW', text: 'Watched 75% of the video' },
    ]),
  };
  const html = renderToString(
    React.createElement(TodayView, {
      prospects: [watcher],
      dueFn: () => -4, // overdue, so the cadence group wants it too
      daysSinceFn: () => 30, // long silence, so Needs you wants it too
      pastDueFn: () => 4,
      onOpen: () => {},
      onNavigate: () => {},
      onNudged: () => {},
      onSnooze: () => {},
    })
  );
  assert.ok(html.includes('Watched your video'), 'the hot pile renders');
  const appearances = html.split('Dale Ridgeway').length - 1;
  assert.equal(appearances, 1, `named ${appearances} times, should be once`);
});

test('TodayView leads with what only she can do', async () => {
  // The summary opened with the cadence counts, which are the rows the sweep
  // sends without her. People actually waiting on her were not in the sentence.
  const { default: TodayView } = await import('../components/TodayView.jsx');
  const html = renderToString(
    React.createElement(TodayView, {
      prospects: [WARM_PROSPECT],
      dueFn: () => null,
      daysSinceFn: () => 9,
      pastDueFn: () => null,
      onOpen: () => {},
      onNavigate: () => {},
      onNudged: () => {},
      onSnooze: () => {},
    })
  );
  // Chapter 9 replaced the prose summary with a count line, because the old
  // sentence re-explained "nothing sends on its own" at the top of a page
  // that says it again inside Follow-ups. The guarantee it was protecting —
  // her own work is what the headline counts, and the plural is not broken —
  // still holds.
  // Chapter 12: the five per-tab figures WERE the tab strip, printed again
  // as a sentence and in a different order. One total now; the tabs carry
  // the breakdown, each with its own icon.
  // One total, in words — but only once the counts are real. The first
  // server paint runs before the queue fetch, and the deep-QA batch pinned
  // the failure this used to allow: "Replies 0" flashing over a morning
  // that had work. The honest first paint says it is still counting, and
  // never names a number it cannot support.
  assert.ok(html.includes('Adding up what needs you'), 'the first paint admits it is still counting');
  assert.ok(!/\b0 things waiting on you\./.test(html), 'no false zero headline');
  assert.ok(!html.includes('1 things'), 'no broken plural');
  assert.ok(!html.includes('0 approvals'), 'empty tabs are still not named');
  assert.ok(!html.includes('clear for today'), 'the all-clear card cannot fire before the counts resolve');
});

test('TodayView surfaces a video-owed prospect on a non-email stage', async () => {
  // The shipped bug: isAutoDue calls this row the sweep's job (video owed),
  // so Needs-you excluded it, but the cadence groups only held Email 1-5 —
  // it appeared on NEITHER list. It must render under "Video ready to send".
  const { default: TodayView } = await import('../components/TodayView.jsx');
  const owed = {
    id: 9,
    name: 'Bo Vine',
    email: 'bo@x.com',
    stage: 'Interested',
    video_url: 'https://file.gobloomwired.com/video/bo.mp4',
    video_sent_at: null,
    last_contact_date: '2026-08-07',
  };
  const html = renderToString(
    React.createElement(TodayView, {
      prospects: [owed],
      dueFn: () => null,
      daysSinceFn: () => 1,
      pastDueFn: () => null,
      onOpen: () => {},
      onNavigate: () => {},
      onNudged: () => {},
      onSnooze: () => {},
    })
  );
  const visible = html.replace(/<!--.*?-->/g, '');
  assert.ok(visible.includes('Video recorded, not sent'), 'the group renders');
  assert.ok(visible.includes('Bo Vine'), 'the owed row renders');
});

test('StatsView renders the full analytics page from a live list', async () => {
  const { default: StatsView } = await import('../components/prospects/StatsView.jsx');
  const html = renderToString(
    React.createElement(StatsView, {
      prospects: [WARM_PROSPECT, { id: 8, stage: 'Client', call_booked: 1, replied: 1, emails_sent: 5, last_contact_date: '2026-07-01' }],
      stages: ['New', 'Interested', 'Client'],
      onShowMissingCountry: () => {},
      onShowWarm: () => {},
      onShowDueAuto: () => {},
      onShowStage: () => {},
    })
  );
  const visible = html.replace(/<!--.*?-->/g, '');
  for (const expected of ['Response rate', 'Pipeline', 'Interested']) {
    assert.ok(visible.includes(expected), `stats renders "${expected}"`);
  }
});

// Chapter 8 put the drawer's sections behind five tabs, so a single render
// only ever contains one panel. `initialTab` is the seam that lets a test
// open on a given one; renderAllTabs concatenates all five, which is what
// these assertions have always been about.
const DRAWER_TABS = ['overview', 'email', 'evidence', 'activity', 'more'];
function renderAllTabs(ProspectDrawer, props) {
  return DRAWER_TABS
    .map((initialTab) => renderToString(React.createElement(ProspectDrawer, { ...props, initialTab })))
    .join('');
}

test('ProspectDrawer renders every section for a full prospect', async () => {
  const { default: ProspectDrawer } = await import('../components/ProspectDrawer.jsx');
  // React SSR interleaves <!-- --> separators between adjacent text nodes;
  // strip them so assertions read like what a person sees.
  const html = renderAllTabs(ProspectDrawer, {
      prospect: WARM_PROSPECT,
      stages: ['New', 'Interested', 'Client'],
      ratings: ['💚', '💙'],
      ratingMeta: { '💚': { icon: 'heart', filled: true, color: 'green', label: 'Strong' } },
      sources: ['Cold email'],
      replyTypes: ['interested', 'defer', 'decline'],
      onPatch: () => {},
      onLogTouch: () => {},
      onSetReply: () => {},
      onShowInTable: () => {},
      onOpenSequence: () => {},
      onSnooze: () => {},
      onClose: () => {},
      position: { at: 2, of: 5 },
      onPrev: () => {},
      onNext: () => {},
  });
  const visible = html.replace(/<!--.*?-->/g, '');
  for (const expected of ['Kym Stewart', 'The record', 'Contact', 'Notes', 'Activity', 'Audit profile', 'she said yes', '2 / 5', 'Emails', 'Snooze 7d']) {
    assert.ok(visible.includes(expected), `drawer renders "${expected}"`);
  }
  // Who / what happened / what next, in that order, before anything editable.
  // "They wrote back" is the router's own Next sentence for a replied
  // prospect, so finding it proves the Next block is drawn from the same
  // answer the list row carries.
  // Chapter 8: identity and the next action are pinned above the tab strip,
  // so they are in every one of the five renders; the sections follow in tab
  // order. What this still proves is that nothing disappeared and that the
  // editable record and the technical dump come last.
  // "They wrote back" is the router's own Next sentence for a replied
  // prospect, so finding it proves the Next block is drawn from the same
  // answer the list row carries. Chapter 8 pins it above the tab strip, so it
  // appears in every one of the five renders and its offset in a
  // concatenation of them says nothing — it is asserted present, not placed.
  assert.ok(visible.includes('They wrote back'), 'the Next sentence comes from the router');
  const order = [
    'Heart and Soul Woman',
    'Outreach history',
    'The record',
    'System details',
  ].map((needle) => visible.indexOf(needle));
  assert.ok(order.every((i) => i > -1), 'every top-level section renders');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'and they are in reading order');
  // The rating menu shows the word, not the raw emoji glyph, in the trigger.
  assert.ok(html.includes('Strong'), 'rating renders as its label');
});

test('the drawer answers why-contact from evidence, not from prose', async () => {
  const { default: ProspectDrawer } = await import('../components/ProspectDrawer.jsx');
  const p = {
    id: 44,
    name: 'Kym Stewart',
    business_name: 'Heart and Soul',
    domain: 'heartandsoul.com',
    stage: 'New',
    own_findings: JSON.stringify([{ text: 'The header video does not play, it just sits black' }]),
    site_intel: JSON.stringify({
      worth: true, score: 11,
      reasons: ['Booking form returns a 500 on submit'],
      keys: ['form-broken'],
      platform: 'WordPress', hasForm: true, hasBooking: false,
      checkedAt: new Date().toISOString(), source: 'precheck',
    }),
  };
  const html = renderAllTabs(ProspectDrawer, {
      prospect: p, stages: ['New'], ratings: [], ratingMeta: () => ({}),
      sources: [], replyTypes: [], onPatch: () => {}, onLogTouch: () => {},
      onSetReply: () => {}, onShowInTable: () => {}, onOpenSequence: () => {},
      onSnooze: () => {}, onClose: () => {}, position: null,
  });
  // The headings changed with the detail pass; the behaviour under test did
  // not. What matters is still that the drawer separates what Ary saw from
  // what the probe measured, and that it admits the gaps.
  assert.ok(html.includes('Why they are worth contacting'), 'states the verdict');
  assert.ok(html.includes('You confirmed'), "labels Ary's own finding as hers");
  assert.ok(html.includes('header video'), 'shows the manual finding');
  assert.ok(html.includes('Checked and confirmed'), 'labels the probe finding as checked');
  assert.ok(html.includes('What we do not know'), 'shows the gaps');

  // This fixture has no address, and that is the point: the two questions are
  // answered in two places. The record is worth contacting AND there is no way
  // to reach them, and neither sentence cancels the other.
  assert.ok(html.includes('Waiting for a safe contact'), 'says what is actually blocking');
  assert.ok(html.includes('How we can reach them'), 'and keeps contact separate from qualification');
});

test('a prospect with no evidence says so instead of looking confident', async () => {
  const { default: ProspectDrawer } = await import('../components/ProspectDrawer.jsx');
  const html = renderAllTabs(ProspectDrawer, {
      prospect: { id: 45, name: 'Nobody', domain: 'nobody.com', stage: 'New' },
      stages: ['New'], ratings: [], ratingMeta: () => ({}), sources: [], replyTypes: [],
      onPatch: () => {}, onLogTouch: () => {}, onSetReply: () => {}, onShowInTable: () => {},
      onOpenSequence: () => {}, onSnooze: () => {}, onClose: () => {}, position: null,
  });
  // The deep-QA batch collapsed the six "nothing" paragraphs into one
  // sentence; this fixture's blocking fact is the missing address, so the
  // situation card carries that, and the knowledge block says its one line.
  assert.ok(html.includes('Nothing yet. The site check has not run.'));
  assert.ok(html.includes('Waiting for a safe contact'), 'the blocking fact stays the headline');
  assert.ok(!html.includes('never been run on this prospect'), 'the old repeats are gone');
  assert.ok(!html.includes('Nothing has been looked at here'), 'the old repeats are gone');
  assert.ok(!html.includes('Nothing has been checked about this one yet'), 'the old repeats are gone');
});
