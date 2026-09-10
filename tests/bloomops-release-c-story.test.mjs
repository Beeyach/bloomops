import test from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './_bloomops-db.mjs';
import { memoryBucket } from './_files.mjs';
import { releaseCStory } from '../scripts/release-c-story.mjs';

test('C7 integrated C1–C6 story preserves current authority, immutable history and canonical lifecycle', async t => {
  const fixture = testDb();
  t.after(() => fixture.raw.close());
  let checks = 0;
  await releaseCStory({ ...fixture, bucket: memoryBucket(), check: (name, ok) => { assert.ok(ok, name); checks++; } });
  t.diagnostic(`${checks} integrated invariants; the same story also runs on disposable workerd/D1/R2.`);
});
