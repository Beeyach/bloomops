import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_systems.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import { memoryBucket } from './_files.mjs';
import { configureGhlBlueprint, configureKajabiBlueprint } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { systemsBlueprintOptions } from '../lib/bloomops/systems-blueprint-preparation.mjs';
import { generateSystemsBlueprint } from '../lib/bloomops/systems-blueprint-generation.mjs';
import { getAction, transitionAction } from '../lib/bloomops/actions.mjs';
import { transitionMilestone } from '../lib/bloomops/milestones.mjs';
import { createDeliverable, getDeliverable, transitionDeliverable, updateDeliverable, portalDeliverables } from '../lib/bloomops/deliverables.mjs';
import { uploadFile, getFile, changeFile, downloadFile } from '../lib/bloomops/files.mjs';

const now = new Date('2026-09-12T08:00:00Z');
for (const [platform, configure, component] of [['GHL',configureGhlBlueprint,'funnel'],['Kajabi',configureKajabiBlueprint,'course']]) {
  async function fixture(ctx) {
    const t = await setup(); ctx.after(()=>t.raw.close()); t.projectId='ghl';
    assert.ok((await configure(t.db,{actor:t.owner,input:{serviceTypeId:'type-systems',enabled:true,expectedBinding:null},now})).ok);
    const options=await systemsBlueprintOptions(t.db,{actor:t.owner,projectId:t.projectId});
    t.packet={requestId:crypto.randomUUID(),selectedComponentKeys:[component,'qa','client_review','launch','handoff'],expected:options.expected};
    t.generate=()=>generateSystemsBlueprint(t.db,{actor:t.owner,projectId:t.projectId,input:t.packet,now});
    assert.ok((await t.generate()).ok);
    t.actions=all(t.raw,"SELECT * FROM actions WHERE project_id='ghl' ORDER BY rowid");
    t.output=one(t.raw,"SELECT id FROM deliverables WHERE project_id='ghl'").id;
    t.moveOutput=async (toStatus,extra={})=>transitionDeliverable(t.db,{actor:t.owner,projectId:t.projectId,deliverableId:t.output,toStatus,expectedRevision:(await getDeliverable(t.db,t.owner,t.projectId,t.output)).revision,now,...extra});
    t.moveAction=async (action,toStatus)=>transitionAction(t.db,{actor:t.owner,actionId:action.id,toStatus,expectedRevision:(await getAction(t.db,t.owner,action.id)).revision,now});
    t.bucket=memoryBucket(); t.bytes=new TextEncoder().encode(`${platform} handoff\nOperating instructions and delegated access contact. No credentials.\n`);
    t.upload=()=>uploadFile(t.db,{bucket:t.bucket,actor:t.owner,projectId:t.projectId,input:{requestId:crypto.randomUUID(),filename:'Handoff.txt',mimeType:'text/plain',byteSize:t.bytes.length,deliverableId:t.output,visibility:'internal'},bytes:t.bytes,now});
    return t;
  }
  test(`${platform}: QA, review/rework, approval, launch and handoff preserve separate canonical lifecycles`,async ctx=>{
    const t=await fixture(ctx), receipt=all(t.raw,'SELECT * FROM systems_blueprint_generations'), project=await t.get(t.projectId);
    assert.equal((await t.moveOutput('delivered')).reason,'invalid_transition');
    for(const action of t.actions.slice(0,2)) for(const status of ['in_progress','done']) assert.ok((await t.moveAction(action,status)).ok);
    assert.equal((await getDeliverable(t.db,t.owner,t.projectId,t.output)).status,'planned');
    const launch=t.actions.find(a=>a.title==='Coordinate approved launch'), handoff=t.actions.find(a=>a.title==='Prepare handoff');
    assert.ok((await getAction(t.db,t.owner,launch.id)).dependencyBlocked);
    for(const status of ['in_progress','internal_review','client_review','in_progress','internal_review','client_review','approved']) assert.ok((await t.moveOutput(status)).ok);
    const approved=await getDeliverable(t.db,t.owner,t.projectId,t.output);
    assert.equal(approved.deliveredAt,null); assert.equal((await getAction(t.db,t.owner,launch.id)).status,'to_do');
    assert.equal((await t.moveOutput('delivered',{expectedRevision:approved.revision-1})).reason,'conflict');
    const review=t.actions.find(a=>a.title==='Coordinate client review');
    for(const action of [review,launch,handoff]) {
      assert.equal((await getAction(t.db,t.owner,action.id)).dependencyBlocked,false);
      for(const status of ['in_progress','done']) assert.ok((await t.moveAction(action,status)).ok);
    }
    for(const milestone of all(t.raw,"SELECT * FROM milestones WHERE project_id='ghl' ORDER BY position")) {
      for(const [i,toStatus] of ['in_progress','completed'].entries()) assert.ok((await transitionMilestone(t.db,{actor:t.owner,projectId:t.projectId,milestoneId:milestone.id,toStatus,expectedRevision:milestone.revision+i,now})).ok);
    }
    assert.ok((await t.moveOutput('delivered')).ok);
    const delivered=await getDeliverable(t.db,t.owner,t.projectId,t.output); assert.equal(delivered.deliveredAt,now.toISOString());
    assert.equal((await t.get(t.projectId)).status,project.status);
    const uploaded=await t.upload(); assert.ok(uploaded.ok,JSON.stringify(uploaded));
    const before=t.snapshot(), calls=t.bucket.calls.length;
    assert.ok((await t.generate()).replayed); assert.ok((await t.moveOutput('delivered',{expectedRevision:approved.revision})).unchanged);
    assert.deepEqual(t.snapshot(),before); assert.deepEqual(all(t.raw,'SELECT * FROM systems_blueprint_generations'),receipt); assert.equal(t.bucket.calls.length,calls);
    assert.equal((await getFile(t.db,t.owner,uploaded.fileId)).visibility,'internal');
  });
  test(`${platform}: a handoff file requires every current visibility boundary and exact bytes`,async ctx=>{
    const t=await fixture(ctx), client=await t.actor('james'), uploaded=await t.upload(); assert.ok(uploaded.ok);
    const fileId=uploaded.fileId, download=actor=>downloadFile(t.db,{bucket:t.bucket,actor,fileId});
    assert.equal(await download(client),null);
    let file=await getFile(t.db,t.owner,fileId);
    assert.ok((await changeFile(t.db,{bucket:t.bucket,actor:t.owner,fileId,operation:'visibility',visibility:'client',expectedRevision:file.revision,now})).ok);
    assert.equal(await download(client),null);
    let output=await getDeliverable(t.db,t.owner,t.projectId,t.output);
    assert.ok((await updateDeliverable(t.db,{actor:t.owner,projectId:t.projectId,deliverableId:t.output,input:{visibility:'client',clientLabel:'Your handoff'},expectedRevision:output.revision,now})).ok);
    const downloaded=await download(client); assert.ok(downloaded);
    assert.deepEqual(new Uint8Array(await new Response(downloaded.body).arrayBuffer()),t.bytes);
    assert.deepEqual((await portalDeliverables(t.db,client,t.projectId)).items.map(x=>x.label),['Your handoff']);
    assert.equal(await download(await t.actor('lawrence')),null); assert.equal(await download(await t.actor('foreign')),null);
    const calls=t.bucket.calls.length;
    run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'");
    assert.equal(await download(client),null); assert.equal(t.bucket.calls.length,calls);
  });
  test(`${platform}: a separately added handoff output and attachment survive the original generation retry`,async ctx=>{
    const t=await fixture(ctx);
    const added=await createDeliverable(t.db,{actor:t.owner,projectId:t.projectId,requestId:crypto.randomUUID(),input:{title:'Handoff guide',clientLabel:'Your operating guide'},now});
    assert.ok(added.ok);t.output=added.deliverableId;
    assert.ok((await t.upload()).ok);
    const before=t.snapshot();assert.ok((await t.generate()).replayed);assert.deepEqual(t.snapshot(),before);
    assert.equal(all(t.raw,"SELECT id FROM deliverables WHERE project_id='ghl'").length,2);
  });
  test(`${platform}: issued actors lose handoff mutation authority immediately`,async ctx=>{
    const t=await fixture(ctx), pm=await t.actor('pm'), client=await t.actor('james');
    for(const actor of [client,await t.actor('sam'),await t.actor('foreign')]) assert.equal((await t.moveOutput('in_progress',{actor})).ok,false);
    run(t.raw,"UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'");
    const before=t.snapshot(); assert.equal((await t.moveOutput('in_progress',{actor:pm})).ok,false); assert.deepEqual(t.snapshot(),before);
  });
}
