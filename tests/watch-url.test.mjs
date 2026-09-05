import test from 'node:test';
import assert from 'node:assert/strict';
import { watchUrl, videoSeen, lastVideoView } from '../lib/watch-url.mjs';

test('watchUrl maps the stored mp4 link to the branded watch page', () => {
  assert.equal(
    watchUrl('https://file.gobloomwired.com/video/kym.mp4'),
    'https://file.gobloomwired.com/watch/kym',
  );
});

test('watchUrl maps the bare slug form too', () => {
  assert.equal(
    watchUrl('https://file.gobloomwired.com/video/doolancoaching'),
    'https://file.gobloomwired.com/watch/doolancoaching',
  );
});

test('watchUrl passes empty values through untouched', () => {
  assert.equal(watchUrl(null), null);
  assert.equal(watchUrl(''), '');
});

test('videoSeen reads the furthest milestone out of the log', () => {
  const log = JSON.stringify([
    { ts: '2026-08-08T01:00:00Z', tag: 'NOTE', text: 'called them' },
    { ts: '2026-08-08T02:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' },
  ]);
  assert.deepEqual(videoSeen(log), { pct: 75, label: 'Watched 75%' });
});

test('videoSeen reports a full watch and a bare open', () => {
  assert.equal(videoSeen(JSON.stringify([{ tag: 'VIDEOVIEW', text: 'Watched the video to the end' }])).pct, 95);
  assert.equal(videoSeen(JSON.stringify([{ tag: 'VIDEOVIEW', text: 'Opened the video' }])).pct, 1);
});

test('videoSeen is null when the log has no view entry', () => {
  assert.equal(videoSeen(null), null);
  assert.equal(videoSeen(JSON.stringify([{ tag: 'NOTE', text: 'research' }])), null);
});

test('lastVideoView returns the newest view with trimmed wording', () => {
  const log = JSON.stringify([
    { ts: '2026-08-06T10:00:00Z', tag: 'VIDEOVIEW', text: 'Opened the video' },
    { ts: '2026-08-08T09:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' },
    { ts: '2026-08-07T12:00:00Z', tag: 'NOTE', text: 'sent email 2' },
  ]);
  assert.deepEqual(lastVideoView(log), { ts: '2026-08-08T09:00:00Z', text: 'Watched 75%' });
});

test('lastVideoView is null on empty, malformed, or viewless logs', () => {
  assert.equal(lastVideoView(null), null);
  assert.equal(lastVideoView('not json'), null);
  assert.equal(lastVideoView(JSON.stringify([{ tag: 'NOTE', text: 'x' }])), null);
});
