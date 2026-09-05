// SSR smoke for the two step-8 extractions: EmailSequenceModal and
// FilterPanel. Same purpose as the other render tests — flush out
// unimported identifiers the compiler can't catch.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';

test('EmailSequenceModal renders a stored sequence with day labels', async () => {
  const { default: Modal } = await import('../components/prospects/EmailSequenceModal.jsx');
  const html = renderToString(
    React.createElement(Modal, {
      prospect: {
        id: 1,
        name: 'Kym',
        email: 'kym@hsw.com',
        stage: 'Email 2',
        emails_sent: 2,
        email_sequence: JSON.stringify([
          { number: 1, subject: 'First hello', body: 'Body one' },
          { number: 2, subject: 'Second', body: 'Body two' },
        ]),
        video_url: 'https://file.gobloomwired.com/video/kym.mp4',
        video_reasons: JSON.stringify(['slow']),
        review_url: 'https://file.gobloomwired.com/review/kym',
      },
      onClose: () => {},
      onSaveSequence: () => {},
      onOpened: () => {},
    })
  );
  const visible = html.replace(/<!--.*?-->/g, '');
  assert.ok(visible.includes('First hello'), 'subject renders');
  assert.ok(visible.includes('Email 1. Day 1'), 'day label renders');
});

test('FilterPanel renders rating + grouped stage checklists', async () => {
  const { default: FilterPanel, NO_RATING } = await import('../components/prospects/FilterPanel.jsx');
  assert.equal(NO_RATING, '__none__');
  const html = renderToString(
    React.createElement(FilterPanel, {
      ratings: ['💚', '💙', '✖️'],
      stages: ['New', 'Email 1', 'Interested', 'Client'],
      ratingChecked: new Set(['💚']),
      stageChecked: new Set(['New']),
      toggleRating: () => {},
      toggleStage: () => {},
      dueOnly: false,
      onToggleDue: () => {},
      onlyRating: null,
      onOnlyRating: () => {},
      onClear: () => {},
      onAllStages: () => {},
      onNoStages: () => {},
    })
  );
  const visible = html.replace(/<!--.*?-->/g, '');
  assert.ok(visible.includes('Interested'), 'stage list renders');
  assert.ok(visible.toLowerCase().includes('due'), 'due toggle renders');
});
