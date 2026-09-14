import {testDb,run,one,all} from './_bloomops-db.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
import {createProject} from '../lib/bloomops/projects.mjs';
import {createAction} from '../lib/bloomops/actions.mjs';
import {createProspect} from '../lib/bloomops/prospects.mjs';
import {createWorkspacePage,saveWorkspacePage} from '../lib/bloomops/pages.mjs';
import {uploadFile} from '../lib/bloomops/files.mjs';
import {memoryBucket} from './_files.mjs';
export async function searchFixture(context){
 const t=testDb();context.after(()=>t.raw.close());
 for(const id of ['a','b'])run(t.raw,"INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,'prospecting')",id,id,id);
 for(const [id,role,ws] of [['owner','owner','a'],['admin','admin','a'],['pm','project_manager','a'],['team','team_member','a'],['client','client','a'],['otherclient','client','a'],['foreign','owner','b']]){
  run(t.raw,'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,id+'@example.test');run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",'m-'+id,ws,id,role);
 }
 for(const [id,ws] of [['client','a'],['otherclient','a'],['foreign-client','b']]){run(t.raw,'INSERT INTO bloomops_clients(id,workspace_id,name,slug,company) VALUES(?,?,?,?,?)',id,ws,'Garden '+id,id,'Garden company');if(ws==='a')run(t.raw,'INSERT INTO client_contacts(id,workspace_id,client_id,name,user_id) VALUES(?,?,?,?,?)','c-'+id,ws,id,'PRIVATE_CONTACT',id);}
 t.actor=async id=>{const m=one(t.raw,'SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(t.db,{workspace:{id:m.workspace_id},membership:{id:m.id,workspaceId:m.workspace_id,userId:id,role:m.role,status:m.status}});};
 t.owner=await t.actor('owner');
 t.projectId=(await createProject(t.db,{actor:t.owner,clientId:'client',input:{name:'PRIVATE_PROJECT',clientLabel:'Shared project',visibility:'client'}})).projectId;
 t.actionId=(await createAction(t.db,{actor:t.owner,projectId:t.projectId,requestId:crypto.randomUUID(),input:{title:'Garden task'}})).actionId;
 t.prospectId=(await createProspect(t.db,{actor:t.owner,input:{workspaceId:'a',requestId:crypto.randomUUID(),fields:{businessName:'Garden prospect',observedFacts:'PRIVATE_BODY',publicEmail:'private@example.test'}}})).prospectId;
 t.pageId=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()})).id;
 await saveWorkspacePage(t.db,t.owner,t.pageId,{workspaceId:'a',expectedRevision:1,title:'Garden page',body:'PRIVATE_BODY'});
 t.bucket=memoryBucket();const bytes=new TextEncoder().encode('PRIVATE_BODY');t.fileId=(await uploadFile(t.db,{bucket:t.bucket,actor:t.owner,projectId:t.projectId,bytes,input:{requestId:crypto.randomUUID(),filename:'Garden file.txt',mimeType:'text/plain',byteSize:bytes.length,visibility:'client'}})).fileId;
 t.input=(actor,extra={})=>({userId:actor.userId,workspaceId:actor.workspaceId,q:'Garden',type:'all',page:1,...extra});
 t.snapshot=()=>Object.fromEntries(all(t.raw,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(({name})=>[name,all(t.raw,'SELECT * FROM "'+name+'"')]));
 return t;
}
