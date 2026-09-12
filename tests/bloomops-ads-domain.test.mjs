import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { setup } from './_ads.mjs';
import { NOW } from './_work-projections.mjs';
import { run } from './_bloomops-db.mjs';
import { schema } from '../lib/bloomops/db.mjs';
import { normalizeAdsFilters, adsProjection } from '../lib/bloomops/ads.mjs';
const ids = result => result.projects.items.map(row => row.id);

test('Ads follows relational service department truth, never display text or Project department', async context => {
  const t = await setup(); context.after(() => t.raw.close());
  t.project('systems-work', { service_engagement_id: 'ghl-service', name: 'Ads campaign' });
  t.project('client-level', { department_id: 'ads', name: 'GHL Ads Kajabi' });
  run(t.raw, "UPDATE projects SET name='GHL Ads Kajabi' WHERE id='website'");
  run(t.raw, "UPDATE service_types SET name='Ads GHL' WHERE id='type-social'");
  run(t.raw, "UPDATE service_types SET name='Unrelated display name' WHERE id='type-ads'");
  run(t.raw, "UPDATE departments SET name='Renamed delivery department' WHERE id='ads'");
  assert.deepEqual(ids(await t.ads()), ['launch', 'retargeting']);
  run(t.raw, "UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  assert.deepEqual(ids(await t.ads()), []);
  run(t.raw, "UPDATE service_types SET department_id='ads' WHERE id='type-social'");
  assert.deepEqual(ids(await t.ads()), ['website']);
});

test('read-only Ads summaries and forward delivery are exact canonical Work projections', async context => {
  const t = await setup(); context.after(() => t.raw.close()); t.tree('launch'); t.tree('retargeting'); t.tree();
  const before = t.snapshot(), result = await t.ads();
  for (const project of result.projects.items) assert.deepEqual(project, (await t.summaries(t.owner, { projectId: project.id, execution: true })).items[0]);
  assert.deepEqual(result.deliverables.items.map(i => i.id), ['launch-deliverable','retargeting-deliverable']);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_KEY|sha256|objectKey|OLD_|website/);
  assert.deepEqual(t.snapshot(), before);
});

test('Client, Service and lifecycle filters narrow both Projects and delivery independently of parent lifecycle', async context => {
  const t = await setup(); context.after(() => t.raw.close()); t.tree('launch'); t.tree('retargeting');
  run(t.raw, "UPDATE projects SET status='completed',completed_at=? WHERE id='launch'", NOW.toISOString());
  assert.deepEqual(ids(await t.ads()), ['retargeting']);
  assert.deepEqual(ids(await t.ads(t.owner, { status: 'all', clientId: 'james' })), ['launch']);
  const result = await t.ads(t.owner, { status: 'completed', serviceEngagementId: 'launch-service' });
  assert.deepEqual(ids(result), ['launch']); assert.equal(result.deliverables.items.length, 1);
  assert.deepEqual(ids(await t.ads(t.owner, { clientId: 'james', status: 'review' })), []);
  assert.deepEqual(await t.ads(t.owner, { clientId: 'lawrence', serviceEngagementId: 'launch-service' }), { ok: false });
  run(t.raw, "UPDATE service_engagements SET status='completed' WHERE id='retargeting-service'");
  run(t.raw, "UPDATE service_types SET active=0 WHERE id='type-ads'");
  assert.deepEqual(ids(await t.ads()), ['retargeting'], 'catalog archival and Service lifecycle never silently close an active Project');
});

test('attention ordering uses readable facts, then target date/name/id; closed Projects have no attention reason', async context => {
  const t = await setup(); context.after(() => t.raw.close());
  run(t.raw, "UPDATE projects SET health='at_risk' WHERE id='launch'");
  assert.deepEqual(ids(await t.ads()), ['launch','retargeting']);
  run(t.raw, "UPDATE projects SET health='on_track',name='Same',target_date='2026-09-10' WHERE id IN ('launch','retargeting')");
  assert.deepEqual(ids(await t.ads()), ['launch','retargeting']);
  run(t.raw, "UPDATE projects SET status='archived',health='at_risk' WHERE id='launch'");
  assert.equal((await t.ads(t.owner, { status:'all' })).projects.items.find(p => p.id === 'launch').attentionReason, null);
});

for (const input of [null, [], 'x', { nope: 'x' }, { page:'0' }, { page:'01' }, { page:'10001' }, { page:'1.5' }, { page:1 }, { status:'bogus' }, { status:['active','all'] }, { clientId:'x'.repeat(201) }, { serviceEngagementId:'a\nb' }, { clientId:{} }, { platform:'GHL' }]) {
  test(`strict filters reject ${JSON.stringify(input)}`, () => assert.deepEqual(normalizeAdsFilters(input), { ok:false }));
}
for (const filters of [{ clientId:'missing' }, { clientId:'foreign-client' }, { serviceEngagementId:'foreign-service' }, { serviceEngagementId:'social-service' }]) {
  test(`unavailable filters expose no names, counts or fallback work: ${JSON.stringify(filters)}`, async context => {
    const t = await setup(); context.after(() => t.raw.close());
    assert.deepEqual(await t.ads(t.owner, filters), { ok:false });
  });
}

test('240 assignments: paged Projects, capped facets/outputs and a fixed number of bounded read queries', async context => {
  const t = await setup(); context.after(() => t.raw.close());
  for (let i=0; i<240; i++) {
    const id = `bounded-${String(i).padStart(3,'0')}`;
    t.project(id, { service_engagement_id:'launch-service', name:'Same' }); t.assign('project','sam',id);
    if (i<6) t.deliverable(`d-${id}`, { project_id:id, status:'client_review' });
  }
  for (let i=0; i<20; i++) { t.project(`hidden-${i}`, { service_engagement_id:'launch-service', visibility:'restricted', health:'at_risk' }); }
  const actor=await t.actor('sam'), queries=[];
  const db=drizzle(t.d1, { schema, logger:{ logQuery(query, params) {
    queries.push(query); assert.ok(params.length<=100); assert.ok(Buffer.byteLength(query)<=100000);
    assert.doesNotMatch(query,/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)/i);
  } } });
  const all=[];
  for (let page=1;page<=5;page++) {
    queries.length=0;
    const result=await adsProjection(db,actor,{ page:String(page) },{ now:NOW });
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
    run(t.raw,"INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a',?,'type-ads')",id,id);
    t.project(id,{client_id:id,service_engagement_id:id}); t.assign('project','sam',id);
  }
  const actor=await t.actor('sam'), first=await t.ads(actor);
  assert.equal(first.options.clients.items.length,200); assert.equal(first.options.clients.hasMore,true);
  assert.equal(first.options.services.items.length,200); assert.equal(first.options.services.hasMore,true);
  const selected=await t.ads(actor,{clientId:'facet-204',serviceEngagementId:'facet-204'});
  assert.deepEqual(ids(selected),['facet-204']); assert.equal(selected.options.clients.items.at(-1).id,'facet-204');
  assert.equal(selected.options.services.items.length,1);
});

test('each canonical Project status filters delivery work; forward outputs are independent of the Project page', async context => {
  const t=await setup(); context.after(()=>t.raw.close());
  const { PROJECT_STATUSES }=await import('../lib/bloomops/project-values.mjs');
  for (const status of PROJECT_STATUSES) {
    t.project(`state-${status}`, { service_engagement_id:'launch-service',status,
      completed_at:status==='completed'?NOW.toISOString():null,
      status_reason:['waiting','blocked'].includes(status)?'Waiting on delivery':null });
    const result=await t.ads(t.owner,{status});
    assert.ok(result.projects.items.some(p=>p.id===`state-${status}`));
    assert.ok(result.projects.items.every(p=>p.status===status));
  }
  for(let i=0;i<55;i++)t.project(`page-${i}`,{service_engagement_id:'launch-service',health:'at_risk'});
  t.deliverable('off-page-output',{project_id:'retargeting',status:'client_review'});
  const first=await t.ads(),second=await t.ads(t.owner,{page:'2'});
  assert.deepEqual(first.deliverables,second.deliverables);
  assert.equal(first.deliverables.items[0].id,'off-page-output');
  assert.ok(!first.projects.items.some(p=>p.id==='retargeting'));
});
