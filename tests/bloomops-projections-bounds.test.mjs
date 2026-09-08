import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, NOW } from './_work-projections.mjs';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '../lib/bloomops/db.mjs';
import { homeProjection, listProjectSummaries } from '../lib/bloomops/work-projections.mjs';
import { listActions } from '../lib/bloomops/actions.mjs';

test('hundreds of assignments keep Home/Work bounded and every SQL statement within D1 limits', async () => {
  const t = await setup();
  for (let i=0;i<240;i++) {
    const id = `project-${String(i).padStart(3,'0')}`;
    t.project(id, { health: 'at_risk' }); t.assign('project','sam',id); t.tree(id);
  }
  const actor = await t.actor('sam'), queries = [];
  const db = drizzle(t.d1, { schema, logger: { logQuery(query, params) {
    queries.push({ sqlBytes: Buffer.byteLength(query), bindings: params.length });
    assert.ok(params.length<=100, `D1 supports 100 bindings; received ${params.length}`);
    assert.ok(Buffer.byteLength(query)<=100000, 'D1 SQL statement length');
    assert.doesNotMatch(query, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
  } } });
  const home = await homeProjection(db,actor,{now:NOW});
  assert.equal(home.projects.items.length,5); assert.equal(home.projects.hasMore,true);
  assert.equal(home.actions.overdue.items.length,4); assert.equal(home.actions.overdue.hasMore,true);
  assert.equal(home.deliverables.items.length,6); assert.equal(home.deliverables.hasMore,true);
  assert.equal(home.recent.items.length,6); assert.equal(home.recent.hasMore,true);
  assert.ok(queries.length<=16, `bounded Home query count: ${queries.length}`);
  const work = await listProjectSummaries(db,actor,{now:NOW}); assert.equal(work.items.length,200); assert.equal(work.hasMore,true);
  assert.ok(work.items.every(row=>row.milestones.total===1 && row.actions.open===1 && row.deliverables.total===2 && row.readyFiles===1));
  const actions = await listActions(db,actor,{view:'all'},{now:NOW}), next = await listActions(db,actor,{view:'all',page:2},{now:NOW});
  assert.equal(actions.items.length,200); assert.equal(next.items.length,40);
  assert.equal(new Set([...actions.items,...next.items].map(i=>i.id)).size,240);
});

test('hidden rows never turn an exact visible limit into a false overflow notice', async () => {
  const t = await setup(); t.assign('client');
  for (let i=0;i<6;i++) { t.file(`visible-${i}`); t.event('file',`visible-${i}`); }
  for (let i=0;i<20;i++) { t.file(`hidden-${i}`, { visibility:'restricted' }); t.event('file',`hidden-${i}`); }
  const actor=await t.actor('sam'), home=await t.home(actor);
  assert.equal(home.recent.items.length,6); assert.equal(home.recent.hasMore,false);
  assert.equal((await t.summary(actor)).readyFiles,6);
});

test('Work preserves its limit and filters while server-only smaller Action pages remain bounded', async () => {
  const t = await setup(); for(let i=0;i<12;i++) t.action(`action-${String(i).padStart(2,'0')}`);
  for(const limit of [0,-5,NaN,500,'all']) {
    const result=await listActions(t.db,t.owner,{view:'all'},{now:NOW,limit});
    assert.ok(result.items.length>=1 && result.items.length<=200);
  }
  const first=await listActions(t.db,t.owner,{view:'all'},{now:NOW,limit:4}), next=await listActions(t.db,t.owner,{view:'all',page:2},{now:NOW,limit:4});
  assert.equal(new Set([...first.items,...next.items].map(i=>i.id)).size,8);
  assert.equal((await listActions(t.db,t.owner,{view:'all',limit:4},{now:NOW})).reason,'invalid','HTTP filter allowlist does not acquire a new limit field');
});
