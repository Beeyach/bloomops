// SSR smoke for every extracted cell component: server-rendering each one
// flushes out identifiers the compiler happily leaves unimported (the
// parseSentEmail failure class). Interaction behavior is unchanged code and
// is not re-tested here.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

const P = {
  id: 1,
  name: 'Kym',
  email: 'kym@hsw.com',
  domain: 'heartandsoulwoman.com',
  stage: 'Email 2',
  rating: '💚',
  emails_sent: 2,
  email_sequence: JSON.stringify([
    { number: 1, subject: 'S1', body: 'B1' },
    { number: 2, subject: 'S2', body: 'B2' },
    { number: 3, subject: 'S3', body: 'B3' },
  ]),
  video_tier: 'SEND',
  video_score: 7,
  video_reasons: JSON.stringify(['slow']),
  video_url: 'https://file.gobloomwired.com/video/kym.mp4',
  reply_type: 'interested',
  reply_date: '2026-08-01',
  last_contact_date: '2026-08-05',
};

test('every cell component server-renders with a full prospect', async () => {
  const cells = await import('../components/prospects/cells.jsx');
  const cases = [
    ['StagePicker', { value: 'Email 2', stages: ['New', 'Email 1', 'Email 2'], onChange: () => {} }],
    ['CountryPicker', { value: 'AU', options: ['US', 'CA', 'AU', 'NZ', 'UK'], onChange: () => {} }],
    ['RepliedCell', { prospect: P, replyTypes: ['interested', 'defer', 'decline'], onSet: () => {} }],
    ['SeqCell', { prospect: P, onOpen: () => {} }],
    ['EditableCell', { value: 'Kym', onSave: () => {} }],
    ['CellPicker', { value: 'Cold email', options: ['Cold email'], onChange: () => {} }],
    ['MustHavesCell', { value: 1, onChange: () => {} }],
    ['RevenueScoreCell', { value: 5, onChange: () => {} }],
    ['YesNoCell', { value: 1, onChange: () => {}, title: 'Call?' }],
    ['RatingCell', { value: '💚', options: ['💚', '💙', '✖️'], onChange: () => {} }],
    ['VideoCell', { prospect: P, onOpenProfile: () => {} }],
    ['DomainCell', { value: 'heartandsoulwoman.com', onSave: () => {} }],
    ['ColResizer', { onMouseDown: () => {} }],
  ];
  for (const [name, props] of cases) {
    const Comp = cells[name];
    assert.equal(typeof Comp, 'function', `${name} is exported`);
    const html = renderToString(React.createElement(Comp, props));
    assert.ok(html.length > 0, `${name} renders`);
  }
});

test('the style helpers survived the move', async () => {
  const { stageStyle, daysAgoColor, stripProtocol } = await import('../components/prospects/cells.jsx');
  assert.ok(stageStyle('Email 1').bg);
  assert.ok(stageStyle('NotAStage').bg, 'unknown stage falls back to New');
  assert.equal(daysAgoColor(1), 'var(--age-fresh)');
  assert.equal(stripProtocol('https://x.com/a/'), 'x.com/a');
});
