import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { setup, NOW } from './_work-projections.mjs';
import { testDb } from './_bloomops-db.mjs';
import { actionTodayCondition, listActions } from '../lib/bloomops/actions.mjs';

test('Home scalar date lookup matches canonical Client days, aliases and null across midnight and DST', async () => {
  const t = testDb();
  try {
    const zones = [...Intl.supportedValuesOf('timeZone'), 'US/Pacific', 'Etc/GMT+5', 'Etc/UTC', null];
    for (const instant of ['2026-09-09T00:30:00Z', '2026-09-09T20:00:00Z', '2026-03-08T10:01:00Z', '2026-11-01T09:30:00Z']) {
      const now = new Date(instant), rows = zones.map(timezone => ({ timezone }));
      const result = await t.db.select({ timezone: sql`zones.value`,
        before: actionTodayCondition(now, rows, sql`zones.value`),
        after: actionTodayCondition(now, rows, sql`zones.value`, { directLookup: true }),
      }).from(sql`json_each(${JSON.stringify(zones)}) AS zones`);
      for (const row of result) assert.equal(row.after, row.before, `${instant}: ${row.timezone}`);
      assert.equal(result.length, zones.length);
    }
  } finally { t.raw.close(); }
});

test('Home retains timezone alias fallback, canonical Action prefixes and fourteen-day delivery boundary', async () => {
  const t = await setup();
  try {
    t.action('local-today', { due_date: '2026-09-08' });
    t.action('local-late', { due_date: '2026-09-07' });
    t.deliverable('edge', { target_date: '2026-09-22' });
    t.deliverable('outside', { target_date: '2026-09-23' });
    for (const timezone of ['America/Los_Angeles', 'US/Pacific', null]) {
      t.raw.prepare("UPDATE bloomops_clients SET timezone=? WHERE id='james'").run(timezone);
      const home = await t.home();
      for (const view of ['overdue','today','waiting','review']) {
        const canonical = await listActions(t.db, t.owner, { view }, { now: NOW });
        assert.deepEqual(home.actions[view].items, canonical.items.slice(0, 4));
      }
      assert.deepEqual(home.deliverables.items.map(row=>row.id), timezone ? ['edge'] : ['edge','outside']);
      assert.equal(home.projects.items[0].actions.overdue, timezone ? 1 : 2);
    }
  } finally { t.raw.close(); }
});
