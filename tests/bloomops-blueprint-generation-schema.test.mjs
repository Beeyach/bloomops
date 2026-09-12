import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshSqlite, run, one, all } from './_bloomops-db.mjs';
import { generationTable as G, itemTable as I, receipt, plan, seedStatements, liveRows, item, insertStatement, requestId, hash } from './_blueprint-generation-fixture.mjs';

const insert = (db, table, values, verb) => { const s = insertStatement(table, values, verb); return run(db, s.sql, ...s.params); };
const tables = [G, I, 'projects', 'milestones', 'actions', 'deliverables', 'templates', 'template_versions', 'service_type_blueprint_bindings'];
const state = db => Object.fromEntries(tables.map(t => [t, all(db, `SELECT CAST(rowid AS TEXT) physical_rowid, * FROM ${t} ORDER BY rowid`)]));
function refused(db, fn, pattern = /blueprint|CHECK|NOT NULL|FOREIGN KEY|UNIQUE/) {
  const before = state(db); assert.throws(fn, pattern); assert.deepEqual(state(db), before, 'refused statement preserves full history and live rows');
}
function fixture(t, recursive) {
  const db = freshSqlite(); t.after(() => db.close()); db.exec(`PRAGMA recursive_triggers=${recursive}`);
  for (const s of seedStatements) run(db, s.sql, ...s.params);
  return db;
}
function generated(db, kinds = ['milestone', 'action', 'deliverable']) {
  insert(db, G, receipt);
  for (const kind of kinds) { insert(db, `${kind}s`, liveRows[kind]); insert(db, I, item(kind)); }
}

for (const recursive of [0, 1]) {
  const check = (name, fn) => test(`2B recursive=${recursive}: ${name}`, t => fn(fixture(t, recursive)));
  check('fresh empty provenance; exactly two new tables and retained history FKs only', db => {
    assert.equal(one(db, `SELECT count(*) n FROM ${G}`).n, 0);
    assert.equal(one(db, `SELECT count(*) n FROM ${I}`).n, 0);
    assert.equal(all(db, `PRAGMA table_info(${G})`).length, 21);
    assert.equal(all(db, `PRAGMA table_info(${I})`).length, 7);
    for (const t of [G, I]) for (const col of all(db, `PRAGMA table_info(${t})`)) assert.equal(col.notnull, 1);
    assert.deepEqual([...new Set(all(db, `PRAGMA foreign_key_list(${G})`).map(r => r.table))], ['workspaces']);
    assert.deepEqual([...new Set(all(db, `PRAGMA foreign_key_list(${I})`).map(r => r.table))].sort(), [G, 'workspaces'].sort());
    assert.equal(all(db, `PRAGMA index_list(${G})`).filter(i => i.origin !== 'pk').length, 3);
    assert.equal(all(db, `PRAGMA index_list(${I})`).filter(i => i.origin !== 'pk').length, 2);
    const old = JSON.parse(readFileSync(new URL('../drizzle/meta/0018_snapshot.json', import.meta.url)));
    const current = JSON.parse(readFileSync(new URL('../drizzle/meta/0019_snapshot.json', import.meta.url)));
    for (const [name, table] of Object.entries(old.tables)) assert.deepEqual(current.tables[name], table, name);
    assert.equal(Object.keys(current.tables).length - Object.keys(old.tables).length, 2);
    assert.equal(current.prevId, old.id);
  });
  check('live relationships accept storage without conferring eligibility, permissions or generated completion', db => {
    run(db, "UPDATE service_type_blueprint_bindings SET enabled=0,revision=2 WHERE id='binding'");
    run(db, "UPDATE templates SET active=0 WHERE id='template'");
    insert(db, G, { ...receipt, binding_revision: 2 });
    assert.equal(one(db, `SELECT count(*) n FROM ${I}`).n, 0, 'storage alone does not claim complete generation');
    for (const t of ['project_assignments', 'client_assignments', 'service_assignments', 'member_capabilities', 'activity_events']) assert.equal(one(db, `SELECT count(*) n FROM ${t}`).n, 0);
  });
  for (const column of Object.keys(receipt)) for (const verb of ['INSERT', 'INSERT OR REPLACE']) {
    check(`required receipt ${column}, ${verb}`, db => refused(db, () => insert(db, G, { ...receipt, [column]: null }, verb)));
  }
  for (const column of ['id', 'workspace_id', 'project_id', 'client_id', 'service_engagement_id', 'service_type_id', 'binding_id', 'template_id', 'template_version_id', 'created_by_membership_id', 'created_at']) {
    for (const [name, value] of [['empty',''], ['NUL','a\0b'], ['blob',new Uint8Array([1,2])]]) {
      check(`receipt ${column} rejects ${name}`, db => refused(db, () => insert(db, G, { ...receipt, [column]: value })));
    }
  }
  for (const [column, value] of [
    ['workspace_id','other'], ['project_id','foreign-project'], ['project_id','missing'], ['client_id','foreign-client'],
    ['service_engagement_id','foreign-service'], ['service_type_id','foreign-type'], ['binding_id','foreign-binding'],
    ['template_id','foreign-template'], ['template_version_id','foreign-version'], ['template_version_id','missing'],
    ['created_by_membership_id','foreign-member'], ['created_by_membership_id','missing'], ['binding_revision',2],
    ['template_version_number',2], ['definition_hash','a'.repeat(64)], ['definition_json','{}'],
  ]) check(`reject mismatched live source ${column}=${value}`, db => refused(db, () => insert(db, G, { ...receipt, [column]: value })));
  for (const status of ['suspended', 'removed', 'invited']) check(`actor ${status} cannot attribute insertion`, db => {
    run(db, 'UPDATE workspace_memberships SET status=? WHERE id=?', status, 'member');
    refused(db, () => insert(db, G, receipt));
  });
  for (const value of [0,-1,1.5,9007199254740992,'bad']) for (const column of ['binding_revision','template_version_number']) {
    check(`invalid ${column} ${value}`, db => refused(db, () => insert(db, G, { ...receipt, [column]: value })));
  }
  for (const value of [requestId.toUpperCase().replace('11111111','AAAAAAAA'), requestId.replace('-4','-3'), requestId.replace('-8','-7'), 'bad', 'x'.repeat(36)]) {
    check(`invalid request ${value}`, db => refused(db, () => insert(db, G, { ...receipt, request_id: value })));
  }
  for (const column of ['request_id','plan_hash']) check(`NUL-suffixed ${column} is rejected`,db => {
    refused(db,()=>insert(db,G,{...receipt,[column]:receipt[column]+'\0suffix'}));
  });
  for (const column of ['definition_hash','blueprint_key']) check(`NUL-suffixed source ${column} is rejected even with matching Version`,db => {
    const definition=JSON.parse(receipt.definition_json);
    const nextPlan=JSON.parse(receipt.plan_json);
    if(column==='blueprint_key') { definition.blueprintKey+='\0suffix';nextPlan.blueprintKey=definition.blueprintKey; }
    const definition_json=JSON.stringify(definition);
    const definition_hash=hash(definition_json)+(column==='definition_hash'?'\0suffix':'');
    insert(db,'template_versions',{id:'nul-version',workspace_id:'w',template_id:'template',version_number:2,definition_json,definition_hash});
    refused(db,()=>insert(db,G,{...receipt,template_version_id:'nul-version',template_version_number:2,
      definition_json,definition_hash,blueprint_key:definition.blueprintKey,plan_json:JSON.stringify(nextPlan)}));
  });
  for (const value of ['', 'A'.repeat(64), 'g'.repeat(64), '0'.repeat(63)]) {
    check(`invalid plan hash ${value.length}/${value[0]}`, db => refused(db, () => insert(db, G, { ...receipt, plan_hash: value })));
  }
  for (const value of ['{', 'null', '[]', '"text"', '{}', JSON.stringify({ ...plan, padding: 'é'.repeat(32768) })]) {
    check(`invalid plan envelope ${value.slice(0,15)}`, db => refused(db, () => insert(db, G, { ...receipt, plan_json: value })));
  }
  for (const change of [
    { schemaVersion:2 }, { compilerVersion:2 }, { blueprintKey:'other' }, { selectedComponentKeys:[] },
    { selectedComponentKeys:['funnel','funnel'] }, { selectedComponentKeys:[null] }, { milestones:[] },
    { milestones:null }, { milestones:[null] }, { actions:['bad'] }, { deliverables:{} },
    { milestones:[{ logicalKey:null }] }, { milestones:[{ logicalKey:'a\0b' }] },
    { milestones:[plan.milestones[0],plan.milestones[0]] }, { dependencies:Array.from({length:50},()=>({})) },
  ]) check(`invalid plan shape ${JSON.stringify(change)}`, db => refused(db, () => insert(db, G, { ...receipt, plan_json:JSON.stringify({...plan,...change}) })));
  check('receipt workspace request and global Project identity are unique; different workspace can reuse request', db => {
    insert(db, G, receipt);
    refused(db, () => insert(db, G, { ...receipt, id:'next', project_id:'second' }));
    refused(db, () => insert(db, G, { ...receipt, id:'next', request_id:'22222222-2222-4222-8222-222222222222' }));
    insert(db, G, { ...receipt, id:'foreign-generation', workspace_id:'other', project_id:'foreign-project', client_id:'foreign-client', service_engagement_id:'foreign-service', service_type_id:'foreign-type', binding_id:'foreign-binding', template_id:'foreign-template', template_version_id:'foreign-version', created_by_membership_id:'foreign-member' });
  });
  for (const t of [G,I]) check(`${t} immutable every column, delete, logical/physical replacement and UPSERT`, db => {
    generated(db);
    for (const col of all(db, `PRAGMA table_info(${t})`)) {
      refused(db, () => run(db, `UPDATE ${t} SET ${col.name}=${col.name}`), /immutable/);
      refused(db, () => run(db, `UPDATE OR REPLACE ${t} SET ${col.name}=NULL`), /immutable/);
    }
    refused(db, () => run(db, `DELETE FROM ${t}`), /immutable/);
    const value = t===G ? receipt : item('action');
    refused(db, () => insert(db, t, value, 'INSERT OR REPLACE'), /collision/);
    const s = insertStatement(t, value);
    refused(db, () => run(db, s.sql+' ON CONFLICT(id) DO UPDATE SET id=excluded.id', ...s.params), /collision/);
    for (const alias of ['rowid','_rowid_','oid']) {
      const rowid=one(db, `SELECT rowid FROM ${t} WHERE id=?`,value.id).rowid;
      refused(db, () => insert(db, t, { ...value, id:'new', [alias]:rowid }, 'INSERT OR REPLACE'), /collision/);
    }
  });
  for (const kind of Object.keys(liveRows)) {
    for (const column of Object.keys(item(kind))) check(`required ${kind} mapping ${column}`, db => {
      insert(db,G,receipt);insert(db,`${kind}s`,liveRows[kind]);
      refused(db, () => insert(db,I,{...item(kind),[column]:null},'INSERT OR REPLACE'));
    });
    check(`${kind} mapping requires live exact Project/workspace/kind/key and unique identity`, db => {
      insert(db,G,receipt);insert(db,`${kind}s`,liveRows[kind]);
      for (const fields of [{workspace_id:'other'},{generation_id:'missing'},{kind:'file'},{record_id:'missing'},{logical_key:'not_selected'}]) {
        refused(db, () => insert(db,I,{...item(kind),...fields}));
      }
      insert(db,`${kind}s`,{...liveRows[kind],id:'wrong-project',project_id:'second'});
      refused(db, () => insert(db,I,{...item(kind),record_id:'wrong-project'}));
      insert(db,I,item(kind));
      refused(db, () => insert(db,I,{...item(kind),id:'another'}));
      refused(db, () => insert(db,I,{...item(kind),id:'another',logical_key:'another'}));
    });
    check(`${kind} may evolve/delete; history survives; ID cannot be recreated or moved`, db => {
      generated(db,[kind]);const original=all(db,`SELECT * FROM ${I}`);
      run(db, `UPDATE ${kind}s SET ${kind==='milestone'?'name':'title'}='Edited',revision=revision+1 WHERE id=?`,kind);
      assert.deepEqual(all(db,`SELECT * FROM ${I}`),original);
      for (const set of ["id='changed'","workspace_id='other'","project_id='second'"]) refused(db,()=>run(db,`UPDATE ${kind}s SET ${set} WHERE id=?`,kind),/immutable/);
      run(db,`DELETE FROM ${kind}s WHERE id=?`,kind);
      assert.deepEqual(all(db,`SELECT * FROM ${I}`),original);
      refused(db,()=>insert(db,`${kind}s`,liveRows[kind]),/historical identity/);
      insert(db,`${kind}s`,{...liveRows[kind],id:'fresh',project_id:'second'});
      refused(db,()=>run(db,`UPDATE ${kind}s SET id=? WHERE id='fresh'`,kind),/historical identity/);
      // The same old ID in another tenant must not resurrect the historical item.
      refused(db,()=>insert(db,`${kind}s`,{...liveRows[kind],workspace_id:'other',project_id:'foreign-project'}),/historical identity/);
    });
    check(`${kind} incoming replacement by every live unique identity is refused`, db => {
      generated(db,[kind]);const t=`${kind}s`;const rowid=one(db,`SELECT rowid FROM ${t} WHERE id=?`,kind).rowid;
      const fresh={...liveRows[kind],id:'fresh',project_id:'second'};insert(db,t,fresh);
      for (const fields of [{id:kind}, ...['rowid','_rowid_','oid'].map(alias=>({[alias]:rowid})),{project_id:'project',creation_request_id:requestId}, ...(kind==='milestone'?[{project_id:'project',creation_request_id:'22222222-2222-4222-8222-222222222222',position:10}]:[])]) {
        refused(db,()=>insert(db,t,{...fresh,id:'replacement',...fields},'INSERT OR REPLACE'),/identity|collision/);
        const columns=Object.keys(fields);refused(db,()=>run(db,`UPDATE OR REPLACE ${t} SET ${columns.map(c=>`${c}=?`).join(',')} WHERE id='fresh'`,...Object.values(fields)),/identity|collision/);
      }
    });
  }
  check('Project deletion retains history, cannot regenerate/recreate; source/actor edits or deletion do not freeze history', db => {
    generated(db);const original=state(db);
    for(const t of ['actions','deliverables','milestones']) run(db,`DELETE FROM ${t}`);
    run(db,"DELETE FROM projects WHERE id='project'");
    assert.deepEqual(state(db)[G],original[G]);assert.deepEqual(state(db)[I],original[I]);
    refused(db,()=>insert(db,'projects',{id:'project',workspace_id:'w',client_id:'client',name:'Replacement'}),/historical identity/);
    refused(db,()=>run(db,"UPDATE projects SET id='project' WHERE id='second'"),/historical identity/);
    refused(db,()=>insert(db,G,{...receipt,id:'second-generation'}));
    run(db,"DELETE FROM service_type_blueprint_bindings WHERE id='binding'");
    // Existing Template Version immutability remains in force; 2B adds no FK to it.
    run(db,"UPDATE templates SET name='Renamed',active=0 WHERE id='template'");
    run(db,"DELETE FROM workspace_memberships WHERE id='member'");
    assert.deepEqual(state(db)[G],original[G]);assert.deepEqual(state(db)[I],original[I]);
  });
  check('Project live identity/physical replacement guards; ordinary edits still succeed', db => {
    insert(db,G,receipt);run(db,"UPDATE projects SET name='Edited',revision=2 WHERE id='project'");
    for(const set of ["id='new'","workspace_id='other'","client_id='foreign-client'","service_engagement_id=NULL"]) refused(db,()=>run(db,`UPDATE projects SET ${set} WHERE id='project'`),/immutable/);
    const rowid=one(db,"SELECT rowid FROM projects WHERE id='project'").rowid;
    for(const alias of ['rowid','_rowid_','oid']) {
      refused(db,()=>insert(db,'projects',{[alias]:rowid,id:'replacement',workspace_id:'w',client_id:'client',name:'Replacement'},'INSERT OR REPLACE'),/collision/);
      refused(db,()=>run(db,`UPDATE OR REPLACE projects SET ${alias}=? WHERE id='second'`,rowid),/collision/);
    }
  });
  check('multi-row receipt/item/live writes abort prior rows in the same statement', db => {
    generated(db,['milestone']);
    const s=insertStatement(G,{...receipt,id:'g2',project_id:'second',request_id:'22222222-2222-4222-8222-222222222222'});
    const tail=s.sql.slice(s.sql.indexOf('VALUES ')+7);
    refused(db,()=>run(db,s.sql+','+tail,...s.params,...Object.values({...receipt,id:'g3'})),/collision/);
    insert(db,'actions',liveRows.action);insert(db,'deliverables',liveRows.deliverable);
    const a=insertStatement(I,item('action')),b=item('milestone');
    refused(db,()=>run(db,a.sql+','+a.sql.slice(a.sql.indexOf('VALUES ')+7),...a.params,...Object.values(b)),/collision/);
    run(db,"UPDATE projects SET name='Before' WHERE id='second'");
    refused(db,()=>run(db,"UPDATE projects SET name='Changed',id=CASE WHEN id='project' THEN 'new' ELSE id END"),/immutable/);
  });
  for(const rowid of [-1,-2,0,9223372036854775807n]) check(`history protects explicit physical identity ${rowid}`,db=>{
    insert(db,G,{...receipt,rowid});
    for(const alias of ['rowid','_rowid_','oid']) refused(db,()=>insert(db,G,{...receipt,id:'new',project_id:'second',request_id:'22222222-2222-4222-8222-222222222222',[alias]:rowid},'INSERT OR REPLACE'),/collision/);
    insert(db,'actions',liveRows.action);insert(db,I,{...item('action'),rowid});
    refused(db,()=>insert(db,I,{...item('deliverable'),rowid},'INSERT OR REPLACE'),/collision/);
  });
}
