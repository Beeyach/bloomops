import { setup as projects } from './_projects.mjs';
import { all,run } from './_bloomops-db.mjs';
import { createContent,getContent,listContent,updateContent } from '../lib/bloomops/content.mjs';
export async function setup(options={}) {
  const t=await projects(options);
  t.add=(input={},extra={})=>createContent(t.db,{actor:t.owner,clientId:'james',requestId:crypto.randomUUID(),input:{title:'A useful idea',type:'reel',...input},...extra});
  t.item=(id,actor=t.owner)=>getContent(t.db,actor,id);
  t.list=(actor=t.owner,query={})=>listContent(t.db,actor,query);
  t.edit=async(id,input,extra={})=>updateContent(t.db,{actor:t.owner,contentId:id,input,expectedRevision:(await t.item(id))?.revision || 1,...extra});
  t.history=()=>all(t.raw,"SELECT * FROM activity_events WHERE subject_type='content' ORDER BY rowid");
  t.snapshot=()=>['content_items','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`));
  t.parents=()=>['bloomops_clients','service_engagements','projects','milestones','actions','deliverables','assets','onboarding_instances','onboarding_items'].map(table=>all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`));
  t.assign=(member='sam',service=null)=>run(t.raw,service?"INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a',?,?)":"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,?)",service||'james',`m-${member}`);
  t.beforeBatch=callback=>{const batch=t.db.batch.bind(t.db);let once=true;t.db.batch=async writes=>{if(once){once=false;await callback();}return batch(writes);};};
  return t;
}
