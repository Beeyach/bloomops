import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSequenceTemplate, fillSequenceTemplate } from '../lib/sequence-template.mjs';

test('[video] fills with the watch-page link, and with nothing when no video exists', () => {
  const tpl = [{ number: 2, subject: 'Made you something', body: 'Here it is: [video]' }];
  const withVideo = fillSequenceTemplate(tpl, { video_url: 'https://file.gobloomwired.com/video/kym.mp4' });
  assert.equal(withVideo[0].body, 'Here it is: https://file.gobloomwired.com/watch/kym');
  const without = fillSequenceTemplate(tpl, {});
  assert.equal(without[0].body, 'Here it is: ');
});

test('sanitize keeps well-formed entries, clamps numbers, drops blanks and junk', () => {
  const out = sanitizeSequenceTemplate([
    { number: 1, subject: 'Hi', body: 'Body 1' },
    { number: 9, subject: 'Clamped', body: 'x' },
    { number: 2, subject: '   ', body: '   ' }, // blank → dropped
    null,
    'nope',
    { number: 3, subject: 'Three', body: 'y' },
  ]);
  assert.deepEqual(out.map((e) => [e.number, e.subject]), [[1, 'Hi'], [5, 'Clamped'], [3, 'Three']]);
  assert.deepEqual(sanitizeSequenceTemplate('garbage'), []);
  assert.deepEqual(sanitizeSequenceTemplate(null), []);
});

test('fill replaces placeholders case-insensitively with prospect fields', () => {
  const t = [{ number: 1, subject: 'For [Business]', body: 'Hi [name], saw [website]. [Full Name], right?' }];
  const out = fillSequenceTemplate(t, { name: 'Laura Cowell', business_name: 'Heart and Soul', domain: 'heartandsoul.com' });
  assert.equal(out[0].subject, 'For Heart and Soul');
  assert.equal(out[0].body, 'Hi Laura, saw heartandsoul.com. Laura Cowell, right?');
});

test('fill falls back gracefully when fields are missing', () => {
  const t = [{ number: 1, subject: '[business]', body: 'Hey [name], [keepme]' }];
  const out = fillSequenceTemplate(t, { name: 'Sam' });
  assert.equal(out[0].subject, 'Sam');          // business falls back to first name
  assert.equal(out[0].body, 'Hey Sam, [keepme]'); // unknown brackets untouched
});
