import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import { completionMetrics, distribution } from '../scripts/navigation-completion-metrics.mjs';
import { timedNavigation } from '../lib/bloomops/navigation-timing.mjs';

test('completion phases split first response, body EOF, DOM commit and two frames', () => {
  const result = completionMetrics({ requestAt: 1010, headersAt: 1100, firstChunkAt: 1102, lastChunkAt: 1500, bodyEndAt: 1505 },
    { clickAt: 1000, domAt: 1530, framesAt: 1560, body: { endAt: 1506, bytes: 2000 } });
  assert.equal(result.clickToRequestMs, 10); assert.equal(result.requestToHeadersMs, 90);
  assert.equal(result.headersMs, 100); assert.equal(result.headersToBodyMs, 405);
  assert.equal(result.bodyToDomMs, 25); assert.equal(result.domToFramesMs, 30);
  assert.equal(result.finalBodyMs, 505); assert.equal(result.visibleMs, 560);
  assert.equal(result.readerEndMs, 506); assert.equal(result.readerBytes, 2000);
});

test('missing body EOF remains unknown and early DOM completion is not clamped', () => {
  const dom = { clickAt: 1000, domAt: 1100, framesAt: 1120 };
  const missing = completionMetrics({ requestAt: 1001, headersAt: 1010 }, dom);
  assert.equal(missing.finalBodyMs, null); assert.equal(missing.headersToBodyMs, null);
  assert.equal(missing.bodyToDomMs, null); assert.equal(missing.readerEndMs, null);
  assert.equal(completionMetrics({ requestAt: 1001, headersAt: 1010, bodyEndAt: 1110 }, dom).bodyToDomMs, -10);
  assert.deepEqual(distribution([null, undefined, NaN]), null);
  assert.deepEqual(distribution([10, -10, 30, 20, null]), { samples: 4, median: 15, min: -10, p95: 30, max: 30 });
});

test('diagnostic markers expose only fixed stage/event vocabulary and preserve results/errors', async () => {
  const events = [], timing = channel('bloomops.navigation'), receive = value => events.push(value);
  timing.subscribe(receive);
  try {
    const privateValue = { content: 'not diagnostic data' };
    assert.equal(await timedNavigation('home', async () => privateValue), privateValue);
    const failure = new Error('not diagnostic data');
    await assert.rejects(timedNavigation('identity', async () => { throw failure; }), error => error === failure);
    await timedNavigation('private-unknown', async () => privateValue);
    assert.deepEqual(events, [ { stage: 'home', event: 'start' }, { stage: 'home', event: 'end' },
      { stage: 'identity', event: 'start' }, { stage: 'identity', event: 'end' } ]);
  } finally { timing.unsubscribe(receive); }
  assert.equal(await timedNavigation('systems', async () => 7), 7);
});
