import assert from 'node:assert/strict';
import { setup } from './_systems.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import { memoryBucket } from './_files.mjs';
import { configureGhlBlueprint, configureKajabiBlueprint } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { systemsBlueprintOptions } from '../lib/bloomops/systems-blueprint-preparation.mjs';
import { generateSystemsBlueprint } from '../lib/bloomops/systems-blueprint-generation.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
import { portalMilestones } from '../lib/bloomops/milestones.mjs';
import { portalDeliverables } from '../lib/bloomops/deliverables.mjs';
import { listFiles, uploadFile, downloadFile } from '../lib/bloomops/files.mjs';

// Real compiled relational builds in one multi-service Client, plus unrelated
// Client/workspace fixtures. R2 binding behavior is separately exercised in Worker.
export async function deliveryFixture(ctx) {
  const t=await setup();ctx.after(()=>t.raw.close());t.bucket=memoryBucket();t.builds=[];
  run(t.raw,"INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('type-kajabi','a','Kajabi','kajabi','systems')");
  run(t.raw,"INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES('course-service','a','james','type-kajabi')");
  t.project('course',{service_engagement_id:'course-service'});
  for(const [projectId,type,configure,component] of [['ghl','type-systems',configureGhlBlueprint,'funnel'],['course','type-kajabi',configureKajabiBlueprint,'course']]) {
    assert.ok((await configure(t.db,{actor:t.owner,input:{serviceTypeId:type,enabled:true,expectedBinding:null}})).ok);
    const options=await systemsBlueprintOptions(t.db,{actor:t.owner,projectId});
    const input={requestId:crypto.randomUUID(),selectedComponentKeys:[component,'qa','client_review','launch','handoff'],expected:options.expected};
    assert.ok((await generateSystemsBlueprint(t.db,{actor:t.owner,projectId,input})).ok);
    const output=one(t.raw,'SELECT id FROM deliverables WHERE project_id=?',projectId).id;
    run(t.raw,"UPDATE deliverables SET visibility='client',client_label=?,description='PRIVATE_REVIEW_NOTE',status='internal_review' WHERE id=?",`Your ${projectId} output`,output);
    const milestone=one(t.raw,"SELECT id FROM milestones WHERE project_id=? AND name='Handoff'",projectId).id;
    run(t.raw,"UPDATE milestones SET visibility='client',client_label=? WHERE id=?",`Your ${projectId} handoff`,milestone);
    const bytes=new TextEncoder().encode(`${projectId} operating guide`);
    const uploaded=await uploadFile(t.db,{bucket:t.bucket,actor:t.owner,projectId,bytes,input:{requestId:crypto.randomUUID(),filename:`${projectId} handoff.txt`,mimeType:'text/plain',byteSize:bytes.length,visibility:'client',deliverableId:output}});assert.ok(uploaded.ok);
    t.builds.push({projectId,output,milestone,fileId:uploaded.fileId,bytes,input});
  }
  t.client=await t.actor('james');
  t.portal=async(actor=t.client)=>({projects:(await portalProjects(t.db,actor)).filter(p=>t.builds.some(b=>b.projectId===p.id)),children:await Promise.all(t.builds.map(async b=>({milestones:await portalMilestones(t.db,actor,b.projectId),deliverables:await portalDeliverables(t.db,actor,b.projectId),files:await listFiles(t.db,actor,b.projectId,{portal:true})}))) });
  t.download=(build,actor=t.client)=>downloadFile(t.db,{bucket:t.bucket,actor,fileId:build.fileId});
  t.receipts=()=>all(t.raw,'SELECT * FROM systems_blueprint_generations ORDER BY id');
  return t;
}
