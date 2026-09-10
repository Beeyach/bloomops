import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { setup } from './_systems.mjs';
import { NOW } from './_work-projections.mjs';
import { run } from './_bloomops-db.mjs';
import { schema } from '../lib/bloomops/db.mjs';
import { normalizeSystemsFilters, systemsProjection } from '../lib/bloomops/systems.mjs';
const ids = result => result.projects.items.map(row => row.id);

test('Systems follows relational service department truth, never display text or Project department', async context => {
  const t = await setup(); context.after(() => t.raw.close());
  t.project('client-level', { department_id: 'systems', name: 'GHL Systems Kajabi' });
  run(t.raw, "UPDATE projects SET name='GHL Systems Kajabi' WHERE id='website'");
  run(t.raw, "UPDATE service_types SET name='Systems GHL' WHERE id='type-social'");
  run(t.raw, "UPDATE service_types SET name='Unrelated display name' WHERE id='type-systems'");
  run(t.raw, "UPDATE departments SET name='Renamed delivery department' WHERE id='systems'");
  assert.deepEqual(ids(await t.systems()), ['kajabi', 'ghl']);
  run(t.raw, "UPDATE service_types SET department_id='social' WHERE id='type-systems'");
  assert.deepEqual(ids(await t.systems()), []);
  run(t.raw, "UPDATE service_types SET department_id='systems' WHERE id='type-social'");
  assert.deepEqual(ids(await t.systems()), ['website']);
});

test('read-only Systems summaries and forward delivery are exact canonical Work projections', async context => {
  const t = await setup(); context.after(() => t.raw.close()); t.tree('ghl'); t.tree('kajabi'); t.tree();
  const before = t.snapshot(), result = await t.systems();
  for (const project of result.projects.items) assert.deepEqual(project, (await t.summaries(t.owner, { projectId: project.id })).items[0]);
  assert.deepEqual(result.deliverables.items.map(i => i.id), ['ghl-deliverable','kajabi-deliverable']);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_KEY|sha256|objectKey|OLD_|website/);
  assert.deepEqual(t.snapshot(), before);
});

test('Client, Service and lifecycle filters narrow both Projects and delivery independently of parent lifecycle', async context => {
  const t = await setup(); context.after(() => t.raw.close()); t.tree('ghl'); t.tree('kajabi');
  run(t.raw, "UPDATE projects SET status='completed',completed_at=? WHERE id='ghl'", NOW.toISOString());
  assert.deepEqual(ids(await t.systems()), ['kajabi']);
  assert.deepEqual(ids(await t.systems(t.owner, { status: 'all', clientId: 'james' })), ['ghl']);
  const result = await t.systems(t.owner, { status: 'completed', serviceEngagementId: 'ghl-service' });
  assert.deepEqual(ids(result), ['ghl']); assert.equal(result.deliverables.items.length, 1);
  assert.deepEqual(ids(await t.systems(t.owner, { clientId: 'james', status: 'review' })), []);
  assert.deepEqual(await t.systems(t.owner, { clientId: 'lawrence', serviceEngagementId: 'ghl-service' }), { ok: false });
  run(t.raw, "UPDATE service_engagements SET status='completed' WHERE id='kajabi-service'");
  run(t.raw, "UPDATE service_types SET active=0 WHERE id='type-systems'");
  assert.deepEqual(ids(await t.systems()), ['kajabi'], 'catalog archival and Service lifecycle never silently close an active Project');
});

test('attention ordering uses readable facts, then target date/name/id; closed Projects have no attention reason', async context => {
  const t = await setup(); context.after(() => t.raw.close());
  run(t.raw, "UPDATE projects SET health='at_risk' WHERE id='ghl'");
  assert.deepEqual(ids(await t.systems()), ['ghl','kajabi']);
  run(t.raw, "UPDATE projects SET health='on_track',name='Same',target_date='2026-09-10' WHERE id IN ('ghl','kajabi')");
  assert.deepEqual(ids(await t.systems()), ['ghl','kajabi']);
  run(t.raw, "UPDATE projects SET status='archived',health='at_risk' WHERE id='ghl'");
  assert.equal((await t.systems(t.owner, { status:'all' })).projects.items.find(p => p.id === 'ghl').attentionReason, null);
});

for (const input of [null, [], 'x', { nope: 'x' }, { page:'0' }, { page:'01' }, { page:'10001' }, { page:'1.5' }, { page:1 }, { status:'bogus' }, { status:['active','all'] }, { clientId:'x'.repeat(201) }, { serviceEngagementId:'a\nb' }, { clientId:{} }, { platform:'GHL' }]) {
  test(`strict filters reject ${JSON.stringify(input)}`, () => assert.deepEqual(normalizeSystemsFilters(input), { ok:false }));
}
for (const filters of [{ clientId:'missing' }, { clientId:'foreign-client' }, { serviceEngagementId:'foreign-service' }, { serviceEngagementId:'social-service' }]) {
  test(`unavailable filters expose no names, counts or fallback work: ${JSON.stringify(filters)}`, async context => {
    const t = await setup(); context.after(() => t.raw.close());
    assert.deepEqual(await t.systems(t.owner, filters), { ok:false });
  });
}

test('240 assignments: paged Projects, capped facets/outputs and a fixed number of bounded read queries', async context => {
  const t = await setup(); context.after(() => t.raw.close());
  for (let i=0; i<240; i++) {
    const id = `bounded-${String(i).padStart(3,'0')}`;
    t.project(id, { service_engagement_id:'ghl-service', name:'Same' }); t.assign('project','sam',id);
    if (i<6) t.deliverable(`d-${id}`, { project_id:id, status:'client_review' });
  }
  for (let i=0; i<20; i++) { t.project(`hidden-${i}`, { service_engagement_id:'ghl-service', visibility:'restricted', health:'at_risk' }); }
  const actor=await t.actor('sam'), queries=[];
  const db=drizzle(t.d1, { schema, logger:{ logQuery(query, params) {
    queries.push(query); assert.ok(params.length<=100); assert.ok(Buffer.byteLength(query)<=100000);
    assert.doesNotMatch(query,/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/i);
  } } });
  const all=[];
  for (let page=1;page<=5;page++) {
    queries.length=0;
    const result=await systemsProjection(db,actor,{ page:String(page) },{ now:NOW });
    assert.equal(result.projects.items.length,page===5?40:50); assert.equal(result.projects.hasMore,page<5);
    assert.equal(result.deliverables.hasMore,false); assert.equal(result.options.services.items.length,1);
    assert.ok(queries.length<=6, `fixed query count ${queries.length}`);
    all.push(...ids(result));
  }
  assert.equal(new Set(all).size,240); assert.deepEqual(all,[...all].sort());
});

test('bounded facets retain a selected readable Client/Service beyond the first 200; hidden Projects do not add options', async context => {
  const t=await setup(); context.after(()=>t.raw.close());
  for(let i=0;i<205;i++) {
    const id=`facet-${String(i).padStart(3,'0')}`;
    run(t.raw,"INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",id,id,id);
    run(t.raw,"INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a',?,'type-systems')",id,id);
    t.project(id,{client_id:id,service_engagement_id:id}); t.assign('project','sam',id);
  }
  const actor=await t.actor('sam'), first=await t.systems(actor);
  assert.equal(first.options.clients.items.length,200); assert.equal(first.options.clients.hasMore,true);
  assert.equal(first.options.services.items.length,200); assert.equal(first.options.services.hasMore,true);
  const selected=await t.systems(actor,{clientId:'facet-204',serviceEngagementId:'facet-204'});
  assert.deepEqual(ids(selected),['facet-204']); assert.equal(selected.options.clients.items.at(-1).id,'facet-204');
  assert.equal(selected.options.services.items.length,1);
});
