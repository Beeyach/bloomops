import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_files.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { releaseBRaces } from '../scripts/release-b-races.mjs';

test('B7 overlapping cross-domain operations preserve canonical facts and semantic history', async t => {
  const fixture = await setup();
  t.after(() => fixture.raw.close());
  let checks = 0;
  await releaseBRaces({ ...fixture, team: await fixture.actor('sam'), clientId: 'james',
    run: (query, ...args) => run(fixture.raw, query, ...args),
    one: (query, ...args) => one(fixture.raw, query, ...args),
    all: (query, ...args) => all(fixture.raw, query, ...args),
    check: (name, ok) => { assert.ok(ok, name); checks++; },
  });
  t.diagnostic(`${checks} overlapping-operation invariant checks; also executed on real workerd D1/R2 by release-b-smoke-local.`);
});
