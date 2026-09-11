// D2 2A: actual journal-migrated SQLite, never mocked constraint outcomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshSqlite, run, one, all } from './_bloomops-db.mjs';

const TABLE = 'service_type_blueprint_bindings';
function fixture(t, recursive) {
  const db = freshSqlite();
  t.after(() => db.close());
  db.exec(`PRAGMA recursive_triggers = ${recursive}`);
  assert.equal(one(db, `SELECT count(*) n FROM ${TABLE}`).n, 0);
  db.exec(`
    INSERT INTO workspaces(id,name,slug) VALUES ('w','W','w'),('other','Other','other');
    INSERT INTO user(id,name,email) VALUES ('u','U','u@example.test'),('v','V','v@example.test');
    INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES
      ('creator','w','u','team_member','active'),('updater','w','v','admin','active'),
      ('foreign','other','u','owner','active');
    INSERT INTO service_types(id,workspace_id,name,slug) VALUES
      ('s','w','ghl','ghl'),('s2','w','Second','second'),('s3','w','Third','third'),
      ('foreign-s','other','Foreign','foreign');
    INSERT INTO templates(rowid,id,workspace_id,kind,name,slug,active) VALUES
      (10,'template','w','systems','Systems','systems',1),
      (20,'alternate','w','systems','Inactive','inactive',0),
      (30,'onboarding','w','onboarding','Onboarding','onboarding',1),
      (40,'foreign-t','other','systems','Foreign','foreign',1);
  `);
  return db;
}
function insert(db, fields = {}, verb = 'INSERT') {
  const values = { workspace_id: 'w', service_type_id: 's', template_id: 'template', ...fields };
  return run(db, `${verb} INTO ${TABLE} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`, ...Object.values(values));
}
const binding = db => one(db, `SELECT rowid, * FROM ${TABLE} WHERE service_type_id='s'`);
const state = db => ({
  // Preserve the full SQLite rowid range without lossy JS-number conversion.
  bindings: all(db, `SELECT CAST(rowid AS TEXT) physical_rowid, * FROM ${TABLE} ORDER BY rowid`),
  templates: all(db, 'SELECT CAST(rowid AS TEXT) physical_rowid, * FROM templates ORDER BY rowid'),
});
function refused(db, fn, pattern = /blueprint|CHECK|NOT NULL|FOREIGN KEY|UNIQUE/) {
  const before = state(db);
  assert.throws(fn, pattern);
  assert.deepEqual(state(db), before, 'entire statement leaves bindings and Templates unchanged');
}

for (const recursive of [0, 1]) {
  const check = (name, fn) => test(`2A recursive=${recursive}: ${name}`, t => fn(fixture(t, recursive)));

  check('31–32: migration/catalogue names create no configuration or work', db => {
    assert.equal(one(db, `SELECT count(*) n FROM ${TABLE}`).n, 0);
    for (const table of ['projects', 'milestones', 'actions', 'deliverables', 'template_versions']) {
      assert.equal(one(db, `SELECT count(*) n FROM ${table}`).n, 0);
    }
  });

  check('schema inventory, explicit NOT NULL, five restricted FKs, four indexes', db => {
    const columns = all(db, `PRAGMA table_info(${TABLE})`);
    assert.deepEqual(columns.map(c => c.name), ['id', 'workspace_id', 'service_type_id', 'template_id', 'enabled', 'revision', 'created_by_membership_id', 'updated_by_membership_id', 'created_at', 'updated_at']);
    for (const c of columns) assert.equal(c.notnull, c.name.endsWith('_membership_id') ? 0 : 1, c.name);
    assert.equal(columns[0].pk, 1);
    const fks = all(db, `PRAGMA foreign_key_list(${TABLE})`);
    assert.equal(new Set(fks.map(fk => fk.id)).size, 5);
    for (const fk of fks) { assert.equal(fk.on_delete, 'RESTRICT'); assert.equal(fk.on_update, 'NO ACTION'); }
    const groups = [...new Set(fks.map(fk => fk.id))].map(id => {
      const rows = fks.filter(fk => fk.id === id).sort((a, b) => a.seq - b.seq);
      return `${rows[0].table}:${rows.map(r => r.from).join(',')}->${rows.map(r => r.to).join(',')}`;
    }).sort();
    assert.deepEqual(groups, [
      'workspaces:workspace_id->id', 'service_types:workspace_id,service_type_id->workspace_id,id',
      'templates:workspace_id,template_id->workspace_id,id',
      'workspace_memberships:workspace_id,created_by_membership_id->workspace_id,id',
      'workspace_memberships:workspace_id,updated_by_membership_id->workspace_id,id',
    ].sort());
    const indexes = all(db, `PRAGMA index_list(${TABLE})`).filter(i => i.origin !== 'pk');
    assert.equal(indexes.length, 4);
    for (const [suffix, names, unique] of [
      ['service_uq', ['workspace_id','service_type_id'], 1],
      ['template_idx', ['workspace_id','template_id'], 0],
      ['creator_idx', ['workspace_id','created_by_membership_id'], 0],
      ['updater_idx', ['workspace_id','updated_by_membership_id'], 0],
    ]) {
      const idx = indexes.find(i => i.name.endsWith(suffix));
      assert.equal(idx.unique, unique);
      assert.deepEqual(all(db, `PRAGMA index_info(${idx.name})`).map(c => c.name), names);
    }
    assert.deepEqual(all(db, "SELECT name FROM sqlite_master WHERE type='trigger' AND (tbl_name=? OR name LIKE 'templates_bound_blueprint_%') ORDER BY name", TABLE).map(r => r.name), [
      'service_type_blueprint_bindings_insert_guard', 'service_type_blueprint_bindings_update_guard',
      'templates_bound_blueprint_insert_guard', 'templates_bound_blueprint_update_guard',
    ]);
  });

  for (const verb of ['INSERT', 'INSERT OR REPLACE']) {
    for (const column of ['id','workspace_id','service_type_id','template_id','enabled','revision','created_at','updated_at']) {
      check(`1: ${verb} explicitly NULL ${column}`, db => refused(db, () => insert(db, { [column]: null }, verb)));
    }
    for (const column of ['id','workspace_id','service_type_id','template_id']) {
      for (const [label, value] of [['empty',''], ['NUL','x\0y'], ['blob',new Uint8Array([1,2])]]) {
        check(`2: ${verb} ${label} ${column}`, db => refused(db, () => insert(db, { [column]: value }, verb)));
      }
    }
  }

  for (const [name, fields] of [
    ['3 missing Service Type', { service_type_id: 'missing' }],
    ['4 missing Template', { template_id: 'missing' }],
    ['5 foreign Service Type', { service_type_id: 'foreign-s' }],
    ['6 foreign Template', { template_id: 'foreign-t' }],
    ['7 non-Systems', { template_id: 'onboarding' }],
    ['missing workspace', { workspace_id: 'missing' }],
  ]) check(name, db => refused(db, () => insert(db, fields)));

  check('8: duplicate workspace/Service Type preserves original', db => {
    insert(db); refused(db, () => insert(db, { template_id: 'alternate' }));
  });
  for (const [column, value] of [
    ['id','new-id'],['workspace_id','other'],['service_type_id','s2'],
    ['created_by_membership_id','updater'],['created_at','changed'],
  ]) check(`9–10: immutable ${column}`, db => {
    insert(db, { created_by_membership_id: 'creator' });
    refused(db, () => run(db, `UPDATE ${TABLE} SET ${column}=?,revision=revision+1`, value), /immutable/);
    refused(db, () => run(db, `UPDATE OR REPLACE ${TABLE} SET ${column}=NULL,revision=revision+1`), /immutable/);
  });

  check('11–12: toggle and repoint to inactive unpublished same-workspace Systems Template', db => {
    insert(db, { created_by_membership_id: 'creator' });
    const initial = binding(db);
    for (const [enabled, target, revision] of [[0,'alternate',2],[1,'template',3]]) {
      run(db, `UPDATE ${TABLE} SET enabled=?,template_id=?,revision=?,updated_by_membership_id='updater',updated_at='later'`, enabled, target, revision);
      assert.deepEqual({ ...binding(db) }, { ...initial, enabled, template_id: target, revision, updated_by_membership_id: 'updater', updated_at: 'later' });
    }
    assert.equal(one(db, 'SELECT count(*) n FROM template_versions').n, 0);
  });
  for (const target of ['foreign-t','onboarding','missing',null,'']) {
    check(`13: invalid repoint ${target}`, db => {
      insert(db); refused(db, () => run(db, `UPDATE OR REPLACE ${TABLE} SET template_id=?,enabled=0,revision=2`, target));
    });
  }
  for (const value of [null,-1,2,0.5,'true',new Uint8Array([1])]) {
    check(`14: invalid boolean ${String(value)}`, db => {
      refused(db, () => insert(db, { enabled: value }, 'INSERT OR REPLACE'));
      insert(db); refused(db, () => run(db, `UPDATE OR REPLACE ${TABLE} SET enabled=?,revision=2`, value));
    });
  }
  for (const value of [null,0,-1,1.5,2,9007199254740991,9007199254740992,'bad']) {
    check(`15: initial revision ${value} is not integer 1`, db => refused(db, () => insert(db, { revision: value }, 'INSERT OR REPLACE')));
  }
  for (const value of [null,0,-1,1,1.5,3,9007199254740992,'bad']) {
    check(`16: update revision ${value} is not exactly next`, db => {
      insert(db); refused(db, () => run(db, `UPDATE OR REPLACE ${TABLE} SET revision=?,enabled=0`, value));
    });
  }
  check('16: safe-integer last increment succeeds; exhausted revision cannot overflow', db => {
    insert(db);
    // Reach the boundary without 9 quadrillion legitimate updates. Only test
    // setup bypasses the update guard; restore its exact migrated SQL before
    // exercising the boundary. CHECK constraints stay active throughout.
    const sql = one(db, "SELECT sql FROM sqlite_master WHERE name='service_type_blueprint_bindings_update_guard'").sql;
    db.exec('DROP TRIGGER service_type_blueprint_bindings_update_guard');
    run(db, `UPDATE ${TABLE} SET revision=9007199254740990`);
    assert.throws(() => run(db, `UPDATE ${TABLE} SET revision=9007199254740992`), /CHECK/);
    db.exec(sql);
    run(db, `UPDATE ${TABLE} SET revision=revision+1`);
    assert.equal(binding(db).revision, Number.MAX_SAFE_INTEGER);
    refused(db, () => run(db, `UPDATE ${TABLE} SET revision=revision+1`), /overflow/);
  });
  check('17: stale CAS is zero rows, never mutation/success', db => {
    insert(db);
    assert.equal(run(db, `UPDATE ${TABLE} SET enabled=0,revision=revision+1 WHERE workspace_id='w' AND service_type_id='s' AND revision=1`).changes, 1);
    const before = state(db);
    assert.equal(run(db, `UPDATE ${TABLE} SET enabled=1,revision=revision+1 WHERE workspace_id='w' AND service_type_id='s' AND revision=1`).changes, 0);
    assert.deepEqual(state(db), before);
  });

  for (const actor of ['missing','foreign','','creator']) {
    check(`18: invalid attribution ${actor}`, db => {
      run(db, "UPDATE workspace_memberships SET status='suspended' WHERE id='creator'");
      for (const column of ['created_by_membership_id','updated_by_membership_id']) {
        refused(db, () => insert(db, { [column]: actor }));
      }
      insert(db); refused(db, () => run(db, `UPDATE ${TABLE} SET updated_by_membership_id=?,revision=2`, actor));
    });
  }
  check('19: historical revocation grants no authority and does not freeze binding', db => {
    insert(db, { created_by_membership_id:'creator', updated_by_membership_id:'creator' });
    const before = state(db);
    run(db, "UPDATE workspace_memberships SET status='suspended' WHERE id='creator'");
    assert.deepEqual(state(db), before);
    refused(db, () => run(db, `UPDATE ${TABLE} SET enabled=0,revision=2`), /actor/);
    run(db, `UPDATE ${TABLE} SET enabled=0,revision=2,updated_by_membership_id='updater'`);
    assert.equal(binding(db).created_by_membership_id, 'creator');
    assert.equal(one(db, "SELECT status FROM workspace_memberships WHERE id='creator'").status, 'suspended');
    for (const table of ['client_assignments','service_assignments','project_assignments','member_capabilities']) {
      assert.equal(one(db, `SELECT count(*) n FROM ${table}`).n, 0);
    }
    run(db, `UPDATE ${TABLE} SET revision=3,updated_by_membership_id=NULL`);
  });

  check('20–23,34: binding REPLACE by every identity; both rows survive', db => {
    insert(db, { rowid:100, id:'binding-a' });
    insert(db, { rowid:200, id:'binding-b', service_type_id:'s2' });
    for (const fields of [
      { id:'binding-a',service_type_id:'s3' },
      { id:'new',service_type_id:'s' },
      { rowid:100,id:'new',service_type_id:'s3' },
      { _rowid_:100,id:'new',service_type_id:'s3' },
      { oid:100,id:'new',service_type_id:'s3' },
    ]) refused(db, () => insert(db, fields, 'INSERT OR REPLACE'), /collision/);
    for (const set of ["id='binding-a'", "service_type_id='s'", 'rowid=100','_rowid_=100','oid=100']) {
      refused(db, () => run(db, `UPDATE OR REPLACE ${TABLE} SET ${set},revision=2 WHERE id='binding-b'`), /immutable|collision/);
    }
    // UPSERT must not become an undocumented alternative update mechanism.
    refused(db, () => db.exec(`INSERT INTO ${TABLE}(id,workspace_id,service_type_id,template_id)
      VALUES ('binding-a','w','s','alternate') ON CONFLICT(id) DO UPDATE SET revision=revision+1`), /collision/);
  });

  for (const enabled of [0,1]) {
    check(`24–25,34: bound Template outgoing/incoming identity, enabled=${enabled}`, db => {
      insert(db, { enabled });
      for (const set of ["id='changed'","workspace_id='other'","kind='onboarding'","slug='changed'","id=NULL","kind=NULL"]) {
        refused(db, () => run(db, `UPDATE OR REPLACE templates SET ${set} WHERE id='template'`), /immutable/);
      }
      for (const set of ["id='template'", "slug='systems'", 'rowid=10','_rowid_=10','oid=10']) {
        refused(db, () => run(db, `UPDATE OR REPLACE templates SET ${set} WHERE id='alternate'`), /collision/);
      }
      refused(db, () => run(db, "UPDATE OR REPLACE templates SET workspace_id='w',kind='systems',slug='systems' WHERE id='foreign-t'"), /collision/);
      for (const values of [
        "50,'template','w','onboarding','Replacement','different'", // global PK, changed kind
        "50,'template','other','systems','Replacement','different'", // global PK, other tenant
        "50,'new','w','systems','Replacement','systems'", // family identity
        "10,'new','other','onboarding','Replacement','different'", // rowid alone
      ]) refused(db, () => db.exec(`INSERT OR REPLACE INTO templates(rowid,id,workspace_id,kind,name,slug) VALUES (${values})`), /collision/);
    });
  }
  for (const rowid of [-1,-2,0,9223372036854775807n]) {
    check(`23,34: explicit atypical physical rowid ${rowid}`, db => {
      run(db, 'UPDATE templates SET rowid=? WHERE id=?', rowid, 'template');
      insert(db, { rowid, id:'binding-a' });
      refused(db, () => insert(db, { rowid, id:'new',service_type_id:'s2' }, 'INSERT OR REPLACE'), /collision/);
      refused(db, () => run(db, "INSERT OR REPLACE INTO templates(rowid,id,workspace_id,kind,name,slug) VALUES (?,'new','w','onboarding','New','new')", rowid), /collision/);
    });
  }
  check('compatibility: nonpositive protected rowid makes unrelated implicit insert fail closed', db => {
    // Physical rowids are not application input. This records conservative
    // BEFORE INSERT behavior only; it does not make negative rowids supported.
    insert(db, { rowid:-1, id:'protected' });
    refused(db, () => insert(db, { id:'unrelated',service_type_id:'s2',template_id:'alternate' }), /collision/);
    assert.equal(binding(db).id, 'protected');
  });
  check('26–27: allowed Template metadata/activity edits leave binding unchanged', db => {
    insert(db); const before = binding(db);
    for (const active of [0,1]) {
      run(db, "UPDATE templates SET name='Renamed',description='New description',active=?,updated_at='later' WHERE id='template'", active);
      assert.equal(one(db, "SELECT active FROM templates WHERE id='template'").active, active);
      assert.equal(one(db, "SELECT name FROM templates WHERE id='template'").name, 'Renamed');
      assert.deepEqual(binding(db), before);
    }
    assert.equal(one(db, 'SELECT count(*) n FROM actions').n, 0);
  });
  check('28: referenced Template, Service Type, workspace and actors cannot be deleted', db => {
    insert(db, { created_by_membership_id:'creator',updated_by_membership_id:'updater' });
    for (const [table,id] of [['templates','template'],['service_types','s'],['workspaces','w'],['workspace_memberships','creator'],['workspace_memberships','updater']]) {
      refused(db, () => run(db, `DELETE FROM ${table} WHERE id=?`, id), /FOREIGN KEY/);
    }
  });
  check('29–30: physical delete permits fresh identity/revision; no parent tombstone', db => {
    insert(db); const initial = binding(db);
    assert.match(initial.id, /^[a-f0-9]{32}$/);
    assert.equal(initial.revision, 1); assert.equal(initial.enabled, 1);
    assert.match(initial.created_at, /^\d{4}-\d\d-\d\dT.*Z$/);
    run(db, `DELETE FROM ${TABLE}`);
    assert.ok(one(db, "SELECT id FROM templates WHERE id='template'"));
    run(db, "UPDATE templates SET kind='onboarding',slug='changed' WHERE id='template'");
    run(db, "DELETE FROM templates WHERE id='template'");
    insert(db, { template_id:'alternate' });
    assert.notEqual(binding(db).id, initial.id);
    assert.equal(binding(db).revision, 1);
    const recreated = state(db);
    assert.equal(run(db, `UPDATE ${TABLE} SET revision=2,enabled=0 WHERE workspace_id='w' AND id=? AND revision=1`, initial.id).changes, 0);
    assert.deepEqual(state(db), recreated, 'stale identity cannot update recreated revision 1');
  });
  check('shared parent stays protected until its last binding is removed/repointed', db => {
    insert(db);
    insert(db, { service_type_id:'s2' });
    run(db, `DELETE FROM ${TABLE} WHERE service_type_id='s'`);
    refused(db, () => run(db, "UPDATE templates SET slug='renamed' WHERE id='template'"), /immutable/);
    run(db, `UPDATE ${TABLE} SET template_id='alternate',revision=2`);
    run(db, "UPDATE templates SET slug='renamed' WHERE id='template'");
    assert.equal(one(db, "SELECT slug FROM templates WHERE id='template'").slug, 'renamed');
    refused(db, () => run(db, "UPDATE templates SET slug='changed' WHERE id='alternate'"), /immutable/);
  });
  check('unbound Template identities retain existing mutation/replacement behavior', db => {
    run(db, "UPDATE templates SET kind='ads',slug='renamed',workspace_id='other',id='renamed' WHERE id='onboarding'");
    run(db, "INSERT OR REPLACE INTO templates(id,workspace_id,kind,name,slug) VALUES ('renamed','other','ads','Replacement','renamed')");
    assert.equal(one(db, "SELECT name FROM templates WHERE id='renamed'").name, 'Replacement');
  });
  check('33: multi-row binding INSERT/UPDATE aborts all earlier rows', db => {
    insert(db, { id:'binding-a' });
    refused(db, () => db.exec(`INSERT OR REPLACE INTO ${TABLE}(id,workspace_id,service_type_id,template_id)
      VALUES ('new','w','s2','alternate'),('replacement','w','s','alternate')`), /collision/);
    insert(db, { id:'binding-b',service_type_id:'s2' });
    refused(db, () => db.exec(`UPDATE ${TABLE} SET enabled=0,
      revision=CASE WHEN service_type_id='s' THEN 2 ELSE 3 END`), /revision/);
    refused(db, () => db.exec(`UPDATE OR REPLACE ${TABLE} SET revision=2,
      template_id=CASE WHEN service_type_id='s' THEN 'alternate' ELSE 'foreign-t' END`), /Systems/);
  });
  check('33: multi-row Template INSERT/UPDATE aborts earlier unbound changes', db => {
    insert(db, { template_id:'alternate' }); // rowid 20: rowid 10 is updated first
    refused(db, () => db.exec("UPDATE OR REPLACE templates SET name='Changed',slug='inactive' WHERE rowid IN (10,20)"), /collision/);
    refused(db, () => db.exec("UPDATE templates SET name='Changed',kind='ads' WHERE rowid IN (10,20)"), /immutable/);
    refused(db, () => db.exec(`INSERT OR REPLACE INTO templates(id,workspace_id,kind,name,slug) VALUES
      ('new','w','systems','New','new'),('replacer','w','systems','Bad','inactive')`), /collision/);
  });
}
