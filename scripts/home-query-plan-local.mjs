#!/usr/bin/env node
// Local-only SQL inspection using the existing migrated SQLite/D1 test adapter.
// No live database, browser, request hooks, credentials or remote telemetry.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { setup, NOW } from '../tests/_work-projections.mjs';
import * as schema from '../lib/bloomops/schema.mjs';
import { homeProjection } from '../lib/bloomops/work-projections.mjs';

const direct = 'json_extract(?, \'$.\' || json_quote("bloomops_clients"."timezone"))';
const previous = '(SELECT value FROM json_each(?) WHERE key="bloomops_clients"."timezone")';
const labels = ['overdue-actions','today-actions','waiting-actions','review-actions',
  'attention-projects','forward-deliverables','recent-deliveries','recent-files','action-timezones','project-timezones'];
const distribution = values => {
  const a = values.sort((a,b)=>a-b), round = n => Number(n.toFixed(3));
  return { median: round((a[4]+a[5])/2), min: round(a[0]), max: round(a.at(-1)) };
};
const scales = [];
for (const count of [100, 300]) {
  const t = await setup();
  try {
    t.raw.exec("UPDATE bloomops_clients SET timezone='America/Los_Angeles' WHERE workspace_id='a'");
    for (let i=0; i<count; i++) {
      const id = `query-project-${i}`;
      t.project(id, { service_engagement_id: 'social-service' }); t.tree(id, id);
      for (let j=0; j<9; j++) t.action(`${id}-${j}`, { project_id:id, due_date:'2026-09-07',
        status:['to_do','in_progress','waiting','review'][j%4] });
    }
    const queries = [];
    const db = drizzle(t.d1, { schema, logger: { logQuery(sql, params) { queries.push({sql,params}); } } });
    await homeProjection(db, t.owner, {now:NOW});
    assert.equal(queries.length, 10);
    const statements = queries.map(({sql,params}, i) => {
      const baselineSql = sql.replaceAll(direct, previous), changed = baselineSql !== sql;
      const before = t.raw.prepare(baselineSql), after = t.raw.prepare(sql);
      assert.deepEqual(after.all(...params), before.all(...params));
      const times = {before:[],after:[]};
      // Paired alternating order, two discarded pairs and ten retained pairs.
      for (let cycle=0; cycle<12; cycle++) for (const key of cycle%2 ? ['after','before'] : ['before','after']) {
        const start = performance.now(); (key==='before' ? before : after).all(...params);
        if (cycle>=2) times[key].push(performance.now()-start);
      }
      const beforePlan = t.raw.prepare('EXPLAIN QUERY PLAN '+baselineSql).all(...params);
      const afterPlan = t.raw.prepare('EXPLAIN QUERY PLAN '+sql).all(...params);
      return { label:labels[i], changed, ...(count===100 ? {sql} : {}), bindings:params.length,
        returnedRows:after.all(...params).length,
        beforePlan:[...new Set(beforePlan.map(row=>row.detail))],
        afterPlan:[...new Set(afterPlan.map(row=>row.detail))],
        timezoneScans:{before:beforePlan.filter(row=>/SCAN json_each/.test(row.detail)).length,
          after:afterPlan.filter(row=>/SCAN json_each/.test(row.detail)).length},
        beforeMs:distribution(times.before), afterMs:distribution(times.after) };
    });
    assert.equal(statements.filter(row=>row.changed).length, 4);
    scales.push({ sqliteVersion:t.raw.prepare('SELECT sqlite_version() AS version').get().version,
      counts:{projects:count+1,actions:count*10,milestones:count,deliverables:count*2,files:count,events:count*2}, statements });
  } finally { t.raw.close(); }
}
console.log(JSON.stringify({ kind:'Home-local-SQL-query-plans', baselineApplicationSha:'137773bc2b70b322694c33a0c756714c00003833',
  baselineExpression:previous, candidateExpression:direct,
  method:'Actual Home SQL with identical synthetic binds; baseline restores only the prior Client-day expression. All rows compared; no binding values or business payloads retained. Two discarded and ten retained alternating pairs per statement.',
  limitations:'In-memory SQLite/D1 adapter, synthetic Owner workload. Execution timings exclude preparation, network, identity and rendering; query plans are not live D1 plans.', scales }, null, 2));
