#!/usr/bin/env node
// D2 2B storage only in disposable workerd/D1. No application writer, remote
// binding, R2, credentials or deployed configuration is loaded.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { generationTable as G, itemTable as I, receipt, seedStatements, liveRows, item, insertStatement } from '../tests/_blueprint-generation-fixture.mjs';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const temp = mkdtempSync(join(tmpdir(), 'bloomops-d2-2b-smoke-'));
const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
const migrations = journal.entries.flatMap(({ tag }) => readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean));
let checks = 0;
let mf;
try {
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'bloomops-d2-2b-disposable', modules: true,
    script: 'export default { fetch() { return new Response("Local storage smoke"); } };',
    compatibilityDate: '2025-05-01', cf: false, d1Databases: { OFF: 'off', ON: 'on' }, resourcePersistencePath: temp }));
  for (const [binding, recursive] of [['OFF',0],['ON',1]]) {
    const db = await mf.getD1Database(binding);
    for (const sql of migrations) await db.prepare(sql).run();
    await db.prepare(`PRAGMA recursive_triggers=${recursive}`).run();
    assert.equal((await db.prepare('PRAGMA recursive_triggers').first()).recursive_triggers,recursive); checks++;
    const statement = s => db.prepare(s.sql).bind(...s.params);
    const ins = (t,v,verb) => statement(insertStatement(t,v,verb));
    const history = async () => Promise.all([G,I].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY id`).all().then(r=>r.results)));
    async function denied(s) {
      const before=await history(); await assert.rejects(()=>s.run(),/blueprint|FOREIGN KEY|CHECK/);
      assert.deepEqual(await history(),before);checks++;
    }
    await db.batch(seedStatements.map(statement));
    await denied(ins(G,{...receipt,workspace_id:'other'}));
    await denied(ins(G,{...receipt,created_by_membership_id:'foreign-member'}));
    await denied(ins(G,{...receipt,request_id:receipt.request_id+'\0suffix'}));
    await denied(ins(G,{...receipt,plan_hash:receipt.plan_hash+'\0suffix'}));
    await db.batch([ins(G,receipt),...Object.entries(liveRows).flatMap(([kind,row])=>[ins(`${kind}s`,row),ins(I,item(kind))])]);checks++;
    const original=await history();assert.equal(original[0].length,1);assert.equal(original[1].length,3);checks++;
    for(const t of [G,I]) {
      await denied(db.prepare(`UPDATE ${t} SET id=id`));
      await denied(db.prepare(`DELETE FROM ${t}`));
      await denied(ins(t,t===G?receipt:item('action'),'INSERT OR REPLACE'));
    }
    for(const [kind,row] of Object.entries(liveRows)) {
      const t=`${kind}s`;
      await denied(ins(t,{...row,id:'replacement'},'INSERT OR REPLACE'));
      await denied(db.prepare(`UPDATE ${t} SET project_id='second' WHERE id=?`).bind(kind));
      await db.prepare(`UPDATE ${t} SET ${kind==='milestone'?'name':'title'}='Edited',revision=2 WHERE id=?`).bind(kind).run();checks++;
      await db.prepare(`DELETE FROM ${t} WHERE id=?`).bind(kind).run();checks++;
      assert.deepEqual(await history(),original);checks++;
      await denied(ins(t,row));
    }
    await db.prepare("DELETE FROM projects WHERE id='project'").run();checks++;
    assert.deepEqual(await history(),original);checks++;
    await denied(ins('projects',{id:'project',workspace_id:'w',client_id:'client',name:'Recreated'}));
    await denied(ins(G,{...receipt,id:'retry'}));
    await db.prepare("DELETE FROM service_type_blueprint_bindings WHERE id='binding'").run();
    await db.prepare("INSERT INTO service_type_blueprint_bindings(id,workspace_id,service_type_id,template_id) VALUES ('new-binding','w','type','template')").run();
    assert.deepEqual(await history(),original);checks++;
    // Competing storage transactions: exactly one complete batch wins the
    // same Project, without confusing a resolved call with generation success.
    const attempts=['a','b'].map((suffix,n)=> {
      const id=`race-${suffix}`,rid=`${n+2}`.repeat(8)+'-2222-4222-8222-222222222222';
      return db.batch([
        ins(G,{...receipt,id,project_id:'second',request_id:rid,binding_id:'new-binding'}),
        ins('actions',{...liveRows.action,id:`action-${suffix}`,project_id:'second'}),
        ins(I,{...item('action'),id:`mapping-${suffix}`,generation_id:id,record_id:`action-${suffix}`}),
      ]);
    });
    const results=await Promise.allSettled(attempts);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    assert.match(String(results.find(r=>r.status==='rejected').reason),/blueprint/);checks++;
    assert.equal((await db.prepare(`SELECT count(*) n FROM ${G} WHERE project_id='second'`).first()).n,1);
    assert.equal((await db.prepare("SELECT count(*) n FROM actions WHERE project_id='second'").first()).n,1);
    assert.equal((await db.prepare(`SELECT count(*) n FROM ${I} WHERE generation_id LIKE 'race-%'`).first()).n,1);checks++;
    // Prove a late mapping failure rolls the new receipt and child back.
    const before=await history();
    await assert.rejects(()=>db.batch([
      ins(G,{...receipt,id:'rollback',workspace_id:'other',project_id:'foreign-project',client_id:'foreign-client',service_engagement_id:'foreign-service',service_type_id:'foreign-type',binding_id:'foreign-binding',template_id:'foreign-template',template_version_id:'foreign-version',created_by_membership_id:'foreign-member'}),
      ins('actions',{...liveRows.action,id:'rollback-action',workspace_id:'other',project_id:'foreign-project'}),
      ins(I,{...item('action'),id:'rollback-mapping',workspace_id:'other',generation_id:'rollback',record_id:'missing'}),
    ]),/blueprint/);
    assert.deepEqual(await history(),before);
    assert.equal(await db.prepare("SELECT id FROM actions WHERE id='rollback-action'").first(),null);checks++;
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);checks++;
    console.log(`ok   recursive_triggers=${recursive}: retention, denied writes, identity reservation, concurrent batches and rollback`);
  }
  console.log(`D2 2B disposable workerd/D1: ${checks} checks passed.`);
} finally { await mf?.dispose(); rmSync(temp,{recursive:true,force:true}); }
