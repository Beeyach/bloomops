import { test } from 'node:test';
import assert from 'node:assert/strict';
import { and, desc, eq, sql } from 'drizzle-orm';
import { testDb, run } from './_bloomops-db.mjs';
import { schema } from '../lib/bloomops/db.mjs';
import { readTogether } from '../lib/bloomops/read-batch.mjs';

test('native read batch preserves duplicate column names, decoders, null joins, CTE order and limits', async t => {
  const { db, raw, d1 } = testDb(); t.after(() => raw.close());
  run(raw, "INSERT INTO workspaces(id,name,slug) VALUES('w','Workspace','w')");
  for (const [id, name] of [['a', 'Alice'], ['b', 'Bob']]) {
    run(raw, 'INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)', id, 'w', name, id);
  }
  run(raw, "INSERT INTO client_contacts(workspace_id,client_id,name,is_primary) VALUES('w','a','Contact',1)");
  const c = schema.clients, co = schema.clientContacts;
  const read = db => db.select({ client: { id: c.id, name: c.name }, contact: { id: co.id, name: co.name, primary: co.isPrimary },
    decoded: sql`json_object('count', 3)`.mapWith(JSON.parse) }).from(c)
    .leftJoin(co, and(eq(co.clientId, c.id), eq(co.workspaceId, c.workspaceId)))
    .where(eq(c.workspaceId, 'w')).orderBy(desc(c.name)).limit(2);
  const expected = await read(db), counts = [], original = d1.batch;
  const bindingCounts = [];
  db.session.logger = { logQuery(_query, params) { bindingCounts.push(params.length); } };
  d1.batch = statements => { counts.push(statements.length); return original(statements); };
  const results = await readTogether(db, db => Promise.all([read(db), read(db)]));
  assert.deepEqual(results, [expected, expected]);
  assert.equal(results[0][0].contact, null);
  assert.equal(results[0][1].contact.primary, true);
  assert.deepEqual(counts, [2]);
  assert.deepEqual(bindingCounts, [2, 2], 'numeric query-limit instrumentation is preserved');
  const cte = db => { const q = db.$with('selected_clients').as(db.select({ id: c.id, name: c.name }).from(c));
    return db.with(q).select().from(q).orderBy(desc(q.name)).limit(1).offset(1); };
  assert.deepEqual(await readTogether(db, cte), await cte(db));
  const selected = await readTogether(db, async db => {
    const q = db.select({ name: c.name }).from(c).where(eq(c.id, sql.placeholder('client'))).prepare();
    return Promise.all([q.all({ client: 'a' }), q.all({ client: 'b' })]);
  });
  assert.deepEqual(selected, [[{ name: 'Alice' }], [{ name: 'Bob' }]]);
});

test('dependent reads form separate invocations and separate compositions never share data or a queue', async t => {
  const { db, raw, d1 } = testDb(); t.after(() => raw.close());
  const c = schema.clients, counts = [], original = d1.batch;
  d1.batch = statements => { counts.push(statements.length); return original(statements); };
  const query = db => db.select({ id: c.id }).from(c).limit(1);
  await Promise.all([readTogether(db, async db => { await query(db); await query(db); }), readTogether(db, query)]);
  assert.deepEqual(counts, [1, 1, 1]);
  counts.length = 0;
  await readTogether(db, db => readTogether(db, db => Promise.all([query(db), query(db)])));
  assert.deepEqual(counts, [2]);
  counts.length = 0;
  await readTogether(db, db => Promise.all(Array.from({ length: 65 }, () => query(db))));
  assert.deepEqual(counts, [32, 32, 1]);
});

test('batch failures reject every reader without a silent retry; non-D1 fallback is deterministic', async t => {
  const { db, raw, d1 } = testDb(); t.after(() => raw.close());
  let calls = 0;
  d1.batch = async () => { calls++; throw new Error('Synthetic failure'); };
  const results = await readTogether(db, db => Promise.allSettled([
    db.select().from(schema.clients), db.select().from(schema.projects),
  ]));
  assert.deepEqual(results.map(r => r.status), ['rejected', 'rejected']); assert.equal(calls, 1);
  const fallback = { select: () => Promise.resolve([1]) };
  assert.deepEqual(await readTogether(fallback, db => db.select()), [1]);
});
