import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { freshSqlite, migrationFiles, run, one, all, d1Binding } from './_bloomops-db.mjs';
import { seedStatements, version, publicationTime as at, insertStatement } from './_systems-version-fixture.mjs';
import { receipt, generationTable as G } from './_blueprint-generation-fixture.mjs';
const migration = readFileSync(new URL('../drizzle/0020_d2_slice2c_version_guards.sql',import.meta.url),'utf8');
const insert = (db,table,values,verb) => {const s=insertStatement(table,values,verb);return run(db,s.sql,...s.params);};
const state = db => Object.fromEntries(['templates','template_versions',G,'service_type_blueprint_bindings'].map(t=>[t,all(db,`SELECT CAST(rowid AS TEXT) physical_rowid,* FROM ${t} ORDER BY rowid`)]));
function refused(db,fn) {const before=state(db);assert.throws(fn,/Systems|immutable|FOREIGN KEY|NOT NULL|CHECK|UNIQUE/);assert.deepEqual(state(db),before);}
function fixture(t,recursive,before=false) {
  const db=before?new DatabaseSync(':memory:'):freshSqlite();t.after(()=>db.close());
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=${recursive};`);
  if(before) for(const {tag,url} of migrationFiles()) if(!tag.startsWith('0020_')) db.exec(readFileSync(url,'utf8'));
  for(const s of seedStatements) run(db,s.sql,...s.params);
  return db;
}
const row=(db,id='sys-v1')=>one(db,'SELECT * FROM template_versions WHERE id=?',id);
const publish=(db,id='sys-v1')=>run(db,"UPDATE template_versions SET status='published',published_at=?,updated_at=? WHERE id=?",at,at,id);
for(const recursive of [0,1]) {
  const check=(name,fn)=>test(`2C recursive=${recursive}: ${name}`,t=>fn(fixture(t,recursive),t));
  check('draft → published → retired; timestamp and snapshot retained',db=>{
    assert.equal(row(db).status,'draft');assert.equal(row(db).published_at,null);
    publish(db);assert.equal(row(db).published_at,at);
    run(db,"UPDATE template_versions SET status='published',updated_at=? WHERE id='sys-v1'",at);
    run(db,"UPDATE template_versions SET status='retired',updated_at=? WHERE id='sys-v1'",at);
    assert.equal(row(db).status,'retired');assert.equal(row(db).published_at,at);
    assert.equal(row(db).definition_json,version.definition_json);
    run(db,"UPDATE template_versions SET status='retired',updated_at=? WHERE id='sys-v1'",at);
  });
  for(const status of ['published','retired']) check(`cannot insert directly ${status}`,db=>refused(db,()=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:3,status,published_at:at})));
  for(const stamp of [at,'', 'bad\0stamp']) check(`draft cannot carry publication timestamp ${JSON.stringify(stamp)}`,db=>refused(db,()=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:3,published_at:stamp})));
  for(const number of [0,-1,1.5,9007199254740992,'bad',null]) check(`invalid version number ${number}`,db=>refused(db,()=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:number})));
  for(const field of ['id','created_at','updated_at']) for(const value of [null,'','bad\0value']) check(`invalid ${field} ${JSON.stringify(value)}`,db=>refused(db,()=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:3,[field]:value})));
  check('nullable attribution and maximum safe number remain supported',db=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:9007199254740991,created_by_membership_id:null}));
  for(const id of ['', 'bad\0actor']) check(`supplied creator ID must be nonempty and NUL-free ${JSON.stringify(id)}`,db=>{
    insert(db,'user',{id:'bad-actor-user',name:'Synthetic actor',email:'bad-actor@example.test'});
    insert(db,'workspace_memberships',{id,workspace_id:'w',user_id:'bad-actor-user',role:'team_member',status:'active'});
    refused(db,()=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:3,created_by_membership_id:id}));
  });
  for(const change of [{workspace_id:'other'},{template_id:'foreign-template'},{created_by_membership_id:'foreign-member'}]) check(`same-workspace FK ${JSON.stringify(change)}`,db=>refused(db,()=>insert(db,'template_versions',{...version,rowid:102,id:'fresh',version_number:3,...change})));
  for(const status of ['retired',null,'bad']) check(`draft cannot transition to ${status}`,db=>refused(db,()=>run(db,"UPDATE template_versions SET status=? WHERE id='sys-v1'",status)));
  for(const stamp of [null,'','bad\0stamp']) check(`publication requires timestamp ${JSON.stringify(stamp)}`,db=>refused(db,()=>run(db,"UPDATE template_versions SET status='published',published_at=? WHERE id='sys-v1'",stamp)));
  for(const [from,to] of [['published','draft'],['retired','draft'],['retired','published']]) check(`reject ${from} → ${to}`,db=>{
    publish(db);if(from==='retired')run(db,"UPDATE template_versions SET status='retired' WHERE id='sys-v1'");
    refused(db,()=>run(db,"UPDATE template_versions SET status=? WHERE id='sys-v1'",to));
  });
  for(const status of ['draft','published','retired']) for(const verb of ['UPDATE OR REPLACE','UPDATE OR IGNORE']) check(`${verb} NULL status cannot invoke draft default from ${status}`,db=>{
    if(status!=='draft')publish(db);if(status==='retired')run(db,"UPDATE template_versions SET status='retired' WHERE id='sys-v1'");
    refused(db,()=>run(db,`${verb} template_versions SET status=NULL WHERE id='sys-v1'`));
  });
  for(const status of ['draft','published','retired']) for(const stamp of [null,at,'2026-09-13T00:00:00.000Z']) check(`${status} publication timestamp cannot be reassigned ${stamp}`,db=>{
    if(status!=='draft')publish(db);if(status==='retired')run(db,"UPDATE template_versions SET status='retired' WHERE id='sys-v1'");
    if(stamp===row(db).published_at)run(db,"UPDATE template_versions SET published_at=? WHERE id='sys-v1'",stamp);
    else refused(db,()=>run(db,"UPDATE template_versions SET published_at=? WHERE id='sys-v1'",stamp));
  });
  for(const [field,value] of Object.entries({id:'renamed',rowid:999,workspace_id:'other',template_id:'empty-template',version_number:9,definition_json:'{"changed":true}',definition_hash:'1'.repeat(64),notes:'New notes',created_by_membership_id:null,created_at:at})) {
    for(const verb of ['UPDATE','UPDATE OR REPLACE'])check(`${verb} cannot change ${field}`,db=>refused(db,()=>run(db,`${verb} template_versions SET ${field}=? WHERE id='sys-v1'`,value)));
  }
  for(const value of [null,'','bad\0stamp'])check(`invalid updated_at ${JSON.stringify(value)}`,db=>refused(db,()=>run(db,"UPDATE template_versions SET updated_at=? WHERE id='sys-v1'",value)));
  check('unused draft deletion permits explicit replacement and eventual parent deletion',db=>{
    run(db,"DELETE FROM template_versions WHERE id='sys-v1'");
    insert(db,'template_versions',{...version,definition_json:'{"new":true}'});
    run(db,"DELETE FROM template_versions WHERE template_id='sys-template'");
    run(db,"DELETE FROM templates WHERE id='sys-template'");
  });
  for(const status of ['published','retired'])check(`${status} deletion is refused`,db=>{publish(db);if(status==='retired')run(db,"UPDATE template_versions SET status='retired' WHERE id='sys-v1'");refused(db,()=>run(db,"DELETE FROM template_versions WHERE id='sys-v1'"));});
  check('generation-referenced draft is retained even after the live Project is deleted',db=>{
    insert(db,G,receipt);run(db,"DELETE FROM projects WHERE id='project'");
    refused(db,()=>run(db,"DELETE FROM template_versions WHERE id='version'"));
  });
  for(const verb of ['INSERT','INSERT OR REPLACE','INSERT OR IGNORE','INSERT OR FAIL','INSERT OR ABORT']) for(const collision of ['id','number','rowid'])check(`${verb} snapshot collision by ${collision}`,db=>{
    const values={...version,id:'fresh',rowid:102,version_number:3};
    if(collision==='id'){values.id=version.id;values.template_id='other-template';}
    if(collision==='number')values.version_number=1;
    if(collision==='rowid'){values.rowid=100;values.template_id='other-template';}
    refused(db,()=>insert(db,'template_versions',values,verb));
  });
  for(const conflict of ['DO NOTHING','DO UPDATE SET notes=excluded.notes'])check(`UPSERT cannot replace an existing draft: ${conflict}`,db=>{
    const s=insertStatement('template_versions',{...version,notes:'Replacement'});
    refused(db,()=>run(db,`${s.sql} ON CONFLICT(id) ${conflict}`,...s.params));
  });
  for(const target of ['id','rowid'])check(`non-Systems UPDATE OR REPLACE cannot evict Systems ${target}`,db=>refused(db,()=>run(db,`UPDATE OR REPLACE template_versions SET ${target}=? WHERE id='other-v1'`,target==='id'?'sys-v1':100)));
  check('published-slot collision cannot replace the current version',db=>{
    publish(db);refused(db,()=>publish(db,'sys-v2'));
    refused(db,()=>insert(db,'template_versions',{...version,id:'fresh',rowid:102,version_number:3,status:'published',published_at:at},'INSERT OR REPLACE'));
  });
  check('parent name/description/active and unbound slug can change',db=>{
    run(db,"UPDATE templates SET name='Renamed',description='Notes',active=0,slug='renamed',updated_at=? WHERE id='sys-template'",at);
    assert.equal(row(db).template_id,'sys-template');
  });
  for(const [field,value] of Object.entries({id:'renamed',workspace_id:'other',kind:'onboarding'}))check(`parent cannot change ${field}`,db=>refused(db,()=>run(db,`UPDATE templates SET ${field}=? WHERE id='sys-template'`,value)));
  check('non-Systems parent with versions cannot be reclassified into Systems',db=>refused(db,()=>run(db,"UPDATE templates SET kind='systems' WHERE id='other-template'")));
  check('empty parent may be reclassified',db=>{run(db,"UPDATE templates SET kind='onboarding' WHERE id='empty-template'");run(db,"UPDATE templates SET kind='systems' WHERE id='empty-template'");});
  for(const collision of ['id','slug','rowid']) for(const verb of ['INSERT OR REPLACE','INSERT OR IGNORE'])check(`${verb} parent collision ${collision}`,db=>{
    const values={id:'fresh-parent',workspace_id:'w',kind:'systems',name:'Replacement',slug:'fresh',rowid:4000};
    if(collision==='id'){values.id='sys-template';values.kind='onboarding';}
    if(collision==='slug')values.slug='unbound-systems';
    if(collision==='rowid'){values.rowid=1000;values.kind='onboarding';}
    refused(db,()=>insert(db,'templates',values,verb));
  });
  for(const collision of ['id','rowid','slug'])check(`incoming parent UPDATE OR REPLACE collision ${collision}`,db=>{
    const assignment=collision==='id'?"id='sys-template'":collision==='rowid'?'rowid=1000':"slug='unbound-systems'";
    refused(db,()=>run(db,`UPDATE OR REPLACE templates SET ${assignment} WHERE id='empty-template'`));
  });
  check('Systems replacement cannot adopt existing onboarding snapshots',db=>refused(db,()=>insert(db,'templates',{id:'other-template',workspace_id:'w',kind:'systems',name:'Replacement',slug:'new'},'INSERT OR REPLACE')));
  for(const physical of ['-1','0','9223372036854775807'])check(`physical rowid ${physical} cannot be reused across kind`,db=>{
    run(db,"DELETE FROM template_versions WHERE id='sys-v1'");insert(db,'template_versions',{...version,rowid:BigInt(physical)});
    refused(db,()=>insert(db,'template_versions',{...version,id:'fresh',template_id:'other-template',version_number:2,rowid:BigInt(physical)},'INSERT OR REPLACE'));
    refused(db,()=>run(db,`UPDATE OR REPLACE template_versions SET rowid=${physical} WHERE id='other-v1'`));
  });
  check('non-Systems draft/retired bootstrap and notes behavior remain unchanged',db=>{
    run(db,"UPDATE template_versions SET notes='Edited',status='retired' WHERE id='other-v1'");
    run(db,"DELETE FROM template_versions WHERE id='other-v1'");
    insert(db,'template_versions',{...version,id:'other-v1',rowid:200,template_id:'other-template',status:'retired',published_at:null});
    run(db,"UPDATE template_versions SET status='published',published_at=? WHERE id='other-v1'",at);
  });
  test(`2C recursive=${recursive}: migration preserves existing versions and retired null timestamps`,t=>{
    const db=fixture(t,recursive,true);publish(db);run(db,"UPDATE template_versions SET status='retired' WHERE id='sys-v2'");
    const before=state(db);db.exec(migration);assert.deepEqual(state(db),before);
    run(db,"UPDATE template_versions SET updated_at=? WHERE id='sys-v2'",at);assert.equal(row(db,'sys-v2').published_at,null);
    refused(db,()=>run(db,"UPDATE template_versions SET published_at=? WHERE id='sys-v2'",at));
  });
  test(`2C recursive=${recursive}: missing historical source identity stays reserved`,t=>{
    const db=fixture(t,recursive,true);insert(db,G,receipt);run(db,"DELETE FROM template_versions WHERE id='version'");db.exec(migration);
    for(const values of [{id:'version',template_id:'other-template',version_number:4},{id:'new-source',template_id:'template',version_number:1}])refused(db,()=>insert(db,'template_versions',{...version,rowid:500,...values}));
    refused(db,()=>run(db,"UPDATE OR REPLACE template_versions SET id='version' WHERE id='other-v1'"));
  });
  check('multi-row INSERT OR FAIL rolls back earlier rows on replacement refusal',db=>refused(db,()=>db.exec(`
    INSERT OR FAIL INTO template_versions(id,workspace_id,template_id,version_number,definition_json,definition_hash)
    VALUES ('batch-new','w','sys-template',3,'{}','hash'),('batch-collision','w','sys-template',1,'{}','hash');
  `)));
  check('multi-row UPDATE OR FAIL rolls back an earlier valid retirement',db=>{
    publish(db);refused(db,()=>db.exec("UPDATE OR FAIL template_versions SET status='retired' WHERE template_id='sys-template'"));
    assert.equal(row(db).status,'published');
  });
  for(const alias of ['_rowid_','oid'])check(`rowid alias ${alias} cannot evict a Systems snapshot`,db=>refused(db,()=>run(db,`UPDATE OR REPLACE template_versions SET ${alias}=100 WHERE id='other-v1'`)));
  check('publication batch rolls back retirement on a late failure',async db=>{
    publish(db);const before=state(db),d1=d1Binding(db);
    await assert.rejects(()=>d1.batch([
      d1.prepare("UPDATE template_versions SET status='retired' WHERE id='sys-v1'"),
      d1.prepare("UPDATE template_versions SET status='published',published_at=? WHERE id='sys-v2'").bind(at),
      d1.prepare("UPDATE template_versions SET notes='forbidden' WHERE id='sys-v2'"),
    ]),/Systems/);assert.deepEqual(state(db),before);
  });
}
test('2C migration adds only five guards; all 44 table definitions and previous snapshot are unchanged',t=>{
  const db=fixture(t,0,true);const before=all(db,"SELECT type,name,sql FROM sqlite_master WHERE type <> 'trigger' ORDER BY type,name");
  db.exec(migration);assert.deepEqual(all(db,"SELECT type,name,sql FROM sqlite_master WHERE type <> 'trigger' ORDER BY type,name"),before);
  assert.equal(all(db,"SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'systems_template_versions_%' OR name LIKE 'systems_version_templates_%')").length,5);
  const old=JSON.parse(readFileSync(new URL('../drizzle/meta/0019_snapshot.json',import.meta.url)));
  const current=JSON.parse(readFileSync(new URL('../drizzle/meta/0020_snapshot.json',import.meta.url)));
  assert.deepEqual(current.tables,old.tables);assert.equal(Object.keys(current.tables).length,44);assert.equal(current.prevId,old.id);
});
