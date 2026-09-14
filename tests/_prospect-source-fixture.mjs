import {readFileSync,readdirSync} from 'node:fs';
import {testDb,run,all} from './_bloomops-db.mjs';
import {runMigrations,LIVE_SCHEMA_SQL,schemaFromRows} from '../scripts/migrate.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
import {resolveWorkspaceAccess} from '../lib/bloomops/membership.mjs';
export async function sourceFixture(context){
 const t=testDb();context?.after(()=>t.raw.close());
 t.raw.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 await runMigrations({files:readdirSync(new URL('../migrations',import.meta.url)).filter(n=>n.endsWith('.sql')),
  exec:async({command,file,rows})=>rows?all(t.raw,command):t.raw.exec(command||readFileSync(new URL('../'+file,import.meta.url),'utf8')),
  schema:async()=>schemaFromRows(all(t.raw,LIVE_SCHEMA_SQL)),readSql:name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8')});
 for(const [id,purpose] of [['fresh','prospecting'],['source','operations'],['foreign','operations']])run(t.raw,'INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,?)',id,id,id,purpose);
 for(const id of ['owner','stranger'])run(t.raw,'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,id+'@example.test');
 for(const [id,workspace,user] of [['dest','fresh','owner'],['src','source','owner'],['other','foreign','stranger']])run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')",id,workspace,user);
 t.actor=await loadActor(t.db,await resolveWorkspaceAccess(t.db,'owner',{workspaceId:'fresh'}));
 t.add=(values={})=>{const row={workspace:'source',business_name:'Raw Studio',name:'Maya Example',domain:'example.com',email:null,stage:'New',created_at:'2026-09-12 00:00:00',updated_at:'2026-09-12 00:00:00',...values};return Number(run(t.raw,`INSERT INTO prospects(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row)).lastInsertRowid);};
 return t;
}
