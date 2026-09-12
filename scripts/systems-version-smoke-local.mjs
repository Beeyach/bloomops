// Synthetic, disposable local D1 only. No Cloudflare account or remote binding.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { seedStatements, version, publicationTime as at, insertStatement } from '../tests/_systems-version-fixture.mjs';
import { generationTable as G, receipt } from '../tests/_blueprint-generation-fixture.mjs';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
const migrations=journal.entries.flatMap(({tag})=>readFileSync(new URL(`../drizzle/${tag}.sql`,import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean));
const temp=mkdtempSync(join(tmpdir(),'bloomops-d2-2c-smoke-'));let mf,checks=0;
try {
  mf=new Miniflare(convertV4MiniflareOptions({name:'bloomops-d2-2c-disposable',modules:true,script:'export default { fetch() { return new Response("Local Systems versions"); } };',compatibilityDate:'2025-05-01',cf:false,d1Databases:{OFF:'off',ON:'on'},resourcePersistencePath:temp}));
  for(const [binding,recursive] of [['OFF',0],['ON',1]]) {
    const db=await mf.getD1Database(binding);
    for(const sql of migrations)await db.prepare(sql).run();
    await db.prepare(`PRAGMA recursive_triggers=${recursive}`).run();
    assert.equal((await db.prepare('PRAGMA recursive_triggers').first()).recursive_triggers,recursive);checks++;
    const statement=s=>db.prepare(s.sql).bind(...s.params);
    const ins=(table,values,verb)=>statement(insertStatement(table,values,verb));
    await db.batch(seedStatements.map(statement));
    const state=()=>Promise.all(['templates','template_versions',G].map(t=>db.prepare(`SELECT CAST(rowid AS TEXT) physical_rowid,* FROM ${t} ORDER BY rowid`).all().then(r=>r.results)));
    async function denied(s) {const before=await state();await assert.rejects(()=>s.run(),/Systems|immutable|FOREIGN KEY|CHECK/);assert.deepEqual(await state(),before);checks++;}
    for(const [i,id] of ['', 'bad\0actor'].entries()) {
      await ins('user',{id:`bad-actor-user-${i}`,name:'Synthetic actor',email:`bad-actor-${i}@example.test`}).run();
      await ins('workspace_memberships',{id,workspace_id:'w',user_id:`bad-actor-user-${i}`,role:'team_member',status:'active'}).run();
      await denied(ins('template_versions',{...version,id:'fresh',rowid:102,version_number:3,created_by_membership_id:id}));
    }
    await denied(ins('template_versions',{...version,id:'fresh',rowid:102,version_number:3,status:'published',published_at:at}));
    await denied(ins('template_versions',{...version,id:'fresh',rowid:102,version_number:9007199254740992}));
    await denied(db.prepare("UPDATE template_versions SET status='retired' WHERE id='sys-v1'"));
    await denied(db.prepare("UPDATE OR REPLACE template_versions SET status=NULL WHERE id='sys-v1'"));
    await denied(db.prepare("UPDATE template_versions SET status='published' WHERE id='sys-v1'"));
    await denied(db.prepare("UPDATE template_versions SET notes='changed' WHERE id='sys-v1'"));
    await denied(ins('template_versions',{...version,id:'fresh',rowid:102},'INSERT OR REPLACE'));
    await denied(ins('template_versions',{...version,template_id:'other-template'},'INSERT OR REPLACE'));
    await denied(db.prepare("UPDATE OR REPLACE template_versions SET rowid=100 WHERE id='other-v1'"));
    await denied(db.prepare("UPDATE OR REPLACE template_versions SET id='sys-v1' WHERE id='other-v1'"));
    await denied(db.prepare("UPDATE templates SET kind='onboarding' WHERE id='sys-template'"));
    await denied(db.prepare("UPDATE templates SET kind='systems' WHERE id='other-template'"));
    await denied(ins('templates',{id:'sys-template',workspace_id:'w',kind:'onboarding',name:'Replacement',slug:'replacement'},'INSERT OR REPLACE'));
    await denied(ins('templates',{id:'fresh-parent',rowid:1000,workspace_id:'w',kind:'onboarding',name:'Replacement',slug:'replacement'},'INSERT OR REPLACE'));
    await denied(db.prepare("UPDATE OR REPLACE templates SET slug='unbound-systems' WHERE id='empty-template'"));
    await db.prepare("UPDATE templates SET name='Renamed',active=0,slug='renamed' WHERE id='sys-template'").run();checks++;
    // Concurrent candidates contend for the real partial unique published slot.
    const outcomes=await Promise.allSettled(['sys-v1','sys-v2'].map(id=>db.batch([db.prepare("UPDATE template_versions SET status='published',published_at=? WHERE id=?").bind(at,id)])));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);checks++;
    const published=await db.prepare("SELECT id,published_at FROM template_versions WHERE template_id='sys-template' AND status='published'").all();
    assert.equal(published.results.length,1);assert.equal(published.results[0].published_at,at);checks++;
    const winner=published.results[0].id,loser=winner==='sys-v1'?'sys-v2':'sys-v1';
    await denied(db.prepare('DELETE FROM template_versions WHERE id=?').bind(winner));
    await denied(db.prepare('UPDATE OR REPLACE template_versions SET status=NULL WHERE id=?').bind(winner));
    await denied(db.prepare("UPDATE template_versions SET status='draft' WHERE id=?").bind(winner));
    await denied(db.prepare('UPDATE template_versions SET published_at=NULL WHERE id=?').bind(winner));
    const before=await state();
    await assert.rejects(()=>db.batch([
      db.prepare("UPDATE template_versions SET status='retired' WHERE id=?").bind(winner),
      db.prepare("UPDATE template_versions SET status='published',published_at=? WHERE id=?").bind(at,loser),
      db.prepare("UPDATE template_versions SET notes='late failure' WHERE id=?").bind(loser),
    ]),/Systems/);assert.deepEqual(await state(),before);checks++;
    await db.batch([
      db.prepare("UPDATE template_versions SET status='retired' WHERE id=?").bind(winner),
      db.prepare("UPDATE template_versions SET status='published',published_at=? WHERE id=?").bind(at,loser),
    ]);checks++;
    await denied(db.prepare("UPDATE template_versions SET status='published' WHERE id=?").bind(winner));
    await denied(db.prepare('UPDATE OR REPLACE template_versions SET status=NULL WHERE id=?').bind(winner));
    await denied(db.prepare('DELETE FROM template_versions WHERE id=?').bind(winner));
    await ins('template_versions',{...version,id:'discard',rowid:102,version_number:3}).run();
    await db.prepare("DELETE FROM template_versions WHERE id='discard'").run();
    assert.equal(await db.prepare("SELECT id FROM template_versions WHERE id='discard'").first(),null);checks++;
    await ins(G,receipt).run();await db.prepare("DELETE FROM projects WHERE id='project'").run();
    await denied(db.prepare("DELETE FROM template_versions WHERE id='version'"));
    await db.prepare("UPDATE template_versions SET status='retired',notes='Onboarding notes' WHERE id='other-v1'").run();
    await db.prepare("DELETE FROM template_versions WHERE id='other-v1'").run();
    await ins('template_versions',{...version,id:'other-v1',rowid:200,template_id:'other-template',status:'retired',published_at:null}).run();checks++;
    await ins('template_versions',{...version,id:'delete-race',rowid:103,template_id:'empty-template'}).run();
    const deletionRace=await Promise.allSettled([
      db.prepare("UPDATE template_versions SET status='published',published_at=? WHERE id='delete-race'").bind(at).run(),
      db.prepare("DELETE FROM template_versions WHERE id='delete-race'").run(),
    ]);
    const survivor=await db.prepare("SELECT status,published_at FROM template_versions WHERE id='delete-race'").first();
    if(survivor) {
      assert.equal(survivor.status,'published');assert.equal(survivor.published_at,at);
      assert.equal(deletionRace[0].status,'fulfilled');assert.equal(deletionRace[1].status,'rejected');
    } else {
      // Resolving an UPDATE that matched no draft is not publication success.
      assert.equal(deletionRace[0].status,'fulfilled');assert.equal(deletionRace[0].value.meta.changes,0);
      assert.equal(deletionRace[1].status,'fulfilled');assert.equal(deletionRace[1].value.meta.changes,1);
    }
    checks++;
    await denied(db.prepare("UPDATE OR REPLACE template_versions SET _rowid_=100 WHERE id='other-v1'"));
    await denied(db.prepare("INSERT OR FAIL INTO template_versions(id,workspace_id,template_id,version_number,definition_json,definition_hash) VALUES ('batch-new','w','sys-template',5,'{}','hash'),('batch-collision','w','sys-template',1,'{}','hash')"));
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);checks++;
    console.log(`ok recursive_triggers=${recursive}: lifecycle, retained history, replacement protection, one publication winner and batch rollback`);
  }
  console.log(`D2 2C disposable workerd/D1: ${checks} checks passed.`);
} finally {await mf?.dispose();rmSync(temp,{recursive:true,force:true});}
