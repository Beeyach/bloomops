import { setup } from './_projects.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import { provisionGhlBlueprint, saveSystemsBlueprintBinding } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { systemsBlueprintOptions, prepareSystemsBlueprint } from '../lib/bloomops/systems-blueprint-preparation.mjs';
import { generateSystemsBlueprint } from '../lib/bloomops/systems-blueprint-generation.mjs';
export const NOW=new Date('2026-09-12T08:00:00.000Z');
export async function fixture(ctx, options = {}) {
  const t=await setup(options);ctx.after(()=>t.raw.close());
  const installed=await provisionGhlBlueprint(t.db,{actor:t.owner,now:NOW});
  t.templateId=installed.templateId;t.versionId=installed.versionId;
  const binding=await saveSystemsBlueprintBinding(t.db,{actor:t.owner,serviceTypeId:'type-systems',templateId:t.templateId,enabled:true,expectedBinding:null,now:NOW});
  t.binding=binding.binding;
  t.projectId=(await t.create({serviceEngagementId:'ghl-service'})).projectId;
  t.options=(actor=t.owner,projectId=t.projectId)=>systemsBlueprintOptions(t.db,{actor,projectId});
  t.preview=(selectedComponentKeys=['funnel'],actor=t.owner)=>prepareSystemsBlueprint(t.db,{actor,projectId:t.projectId,selectedComponentKeys});
  t.input={requestId:crypto.randomUUID(),selectedComponentKeys:['funnel'],expected:(await t.options()).expected};
  t.generate=(patch={},options={})=>generateSystemsBlueprint(t.db,{actor:t.owner,projectId:t.projectId,input:{...t.input,...patch},now:NOW,...options});
  t.state=()=>['projects','milestones','actions','action_dependencies','deliverables','systems_blueprint_generations','systems_blueprint_generation_items','activity_events']
    .map(table=>all(t.raw,`SELECT * FROM ${table} ORDER BY id`));
  t.beforeCommit=fn=>{const original=t.db.batch.bind(t.db);t.db.batch=async queries=>{fn();t.db.batch=original;return original(queries);};};
  t.corrupt=(triggerName,sql,...args)=>{const trigger=one(t.raw,'SELECT sql FROM sqlite_master WHERE name=?',triggerName).sql;
    t.raw.exec(`DROP TRIGGER ${triggerName}`);run(t.raw,sql,...args);t.raw.exec(trigger);};
  return t;
}
