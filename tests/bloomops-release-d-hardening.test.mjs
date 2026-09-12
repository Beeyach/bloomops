import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliveryFixture} from './_systems-delivery.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {systemsBlueprintOptions} from '../lib/bloomops/systems-blueprint-preparation.mjs';
import {generateSystemsBlueprint} from '../lib/bloomops/systems-blueprint-generation.mjs';

for(const projectId of ['ghl','course'])for(const revoke of ['file','parent','contact','membership'])test(`${projectId} handoff rechecks ${revoke} authority after the object read`,async ctx=>{
 const t=await deliveryFixture(ctx),b=t.builds.find(b=>b.projectId===projectId),receipts=t.receipts();
 t.bucket.beforeGet=()=>{t.bucket.beforeGet=null;run(t.raw,{file:"UPDATE assets SET visibility='internal' WHERE id=?",parent:"UPDATE projects SET visibility='internal' WHERE id=?",contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id=?",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id=?"}[revoke],{file:b.fileId,parent:projectId,contact:'james',membership:'m-james'}[revoke]);};
 assert.equal(await t.download(b),null);assert.ok(t.bucket.calls.some(c=>c[0]==='get'));
 assert.equal(one(t.raw,'SELECT status FROM assets WHERE id=?',b.fileId).status,'ready');assert.deepEqual(t.receipts(),receipts);
 const before=t.snapshot();assert.ok((await generateSystemsBlueprint(t.db,{actor:t.owner,projectId,input:b.input})).replayed);assert.deepEqual(t.snapshot(),before);
});

test('a concurrent cross-platform request UUID has one workspace winner and cannot cross receipts',async ctx=>{
 const t=await deliveryFixture(ctx),requestId=crypto.randomUUID(),packets=[];
 for(const [projectId,service,component] of [['new-ghl','ghl-service','funnel'],['new-kajabi','course-service','course']]){
  t.project(projectId,{service_engagement_id:service});const o=await systemsBlueprintOptions(t.db,{actor:t.owner,projectId});packets.push({projectId,input:{requestId,selectedComponentKeys:[component,'qa'],expected:o.expected}});
 }
 const generate=p=>generateSystemsBlueprint(t.db,{actor:t.owner,...p});const result=await Promise.all(packets.map(generate));
 // D2's request identity is workspace-wide: a copied request cannot silently
 // instantiate another Project. The loser remains empty and can use a fresh key.
 assert.equal(result.filter(r=>r.ok).length,1);assert.equal(result.filter(r=>r.reason==='conflict').length,1);
 const winner=result.findIndex(r=>r.ok),loser=1-winner;
 assert.equal(one(t.raw,'SELECT count(*) AS n FROM actions WHERE project_id=?',packets[loser].projectId).n,0);
 assert.equal(one(t.raw,'SELECT revision FROM projects WHERE id=?',packets[loser].projectId).revision,1);
 const before=t.snapshot(),receipts=t.receipts();const repeats=await Promise.all(Array.from({length:8},()=>generate(packets[winner])));assert.ok(repeats.every(r=>r.replayed));
 assert.deepEqual(t.snapshot(),before);assert.deepEqual(t.receipts(),receipts);
 packets[loser].input.requestId=crypto.randomUUID();const recovered=await generate(packets[loser]);assert.ok(recovered.ok);assert.notEqual(recovered.generationId,result[winner].generationId);
 const after=t.snapshot();assert.equal((await generate({projectId:packets[loser].projectId,input:packets[winner].input})).ok,false);assert.deepEqual(t.snapshot(),after);
 const ids=all(t.raw,"SELECT record_id FROM systems_blueprint_generation_items WHERE generation_id IN (?,?)",result[winner].generationId,recovered.generationId).map(r=>r.record_id);assert.equal(new Set(ids).size,ids.length);

});
for(const projectId of ['ghl','course'])test(`${projectId} hidden prerequisite multiplicity never changes mixed Systems readable counts`,async ctx=>{
 const t=await deliveryFixture(ctx),actor=await t.actor('sam');t.assign('service','sam',projectId==='ghl'?'ghl-service':'course-service');
 const first=one(t.raw,'SELECT id FROM actions WHERE project_id=? ORDER BY rowid LIMIT 1',projectId),qa=one(t.raw,"SELECT id FROM actions WHERE project_id=? AND title='Perform internal QA'",projectId);
 run(t.raw,"UPDATE actions SET visibility='restricted',title='PRIVATE_FIRST' WHERE id=?",first.id);
 const before=await t.systems(actor);t.action('hidden-extra',{project_id:projectId,visibility:'restricted',title:'PRIVATE_EXTRA'});
 run(t.raw,"INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a',?,?,'hidden-extra')",projectId,qa.id);
 assert.deepEqual(await t.systems(actor),before);assert.doesNotMatch(JSON.stringify(before),/PRIVATE_FIRST|PRIVATE_EXTRA|dependsOn/);
});
