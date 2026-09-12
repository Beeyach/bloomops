import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_projects.mjs';
import { APP_URL, all, one, run } from './_bloomops-db.mjs';
import { KAJABI_BUILD_BLUEPRINT_V1 as definition } from '../lib/bloomops/systems-blueprint-kajabi.mjs';
import { GHL_BUILD_BLUEPRINT_V1 } from '../lib/bloomops/systems-blueprint-defaults.mjs';
import { compileSystemsBlueprint } from '../lib/bloomops/systems-blueprint-compiler.mjs';
import { encodeSystemsBlueprintDefinition } from '../lib/bloomops/systems-blueprint-definition.mjs';
import { systemsBlueprintDefault } from '../lib/bloomops/systems-blueprint-catalog.mjs';
import { configureGhlBlueprint, configureKajabiBlueprint, provisionKajabiBlueprint, systemsBlueprintSetupOptions } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { systemsBlueprintOptions, prepareSystemsBlueprint, verifiedBlueprintDefinition } from '../lib/bloomops/systems-blueprint-preparation.mjs';
import { generateSystemsBlueprint } from '../lib/bloomops/systems-blueprint-generation.mjs';
const now = new Date('2026-09-12T12:00:00.000Z');
const keys = ['access_assets','architecture','course','funnel','checkout','email','qa','client_review','launch','handoff'];
const compile = selection => compileSystemsBlueprint({ definition, selectedComponentKeys: selection });
const expected = b => ({ id: b.id, revision: b.revision });
async function fixture(ctx, auth = false) {
  const t = await setup({ auth }); ctx.after(() => t.raw.close());
  run(t.raw, "INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('type-kajabi','a','Unrelated label','unrelated','systems')");
  run(t.raw, "UPDATE service_engagements SET service_type_id='type-kajabi',client_id='james' WHERE id='kajabi-service'");
  t.input = { serviceTypeId: 'type-kajabi', enabled: true, expectedBinding: null };
  t.configure = (patch = {}, actor = t.owner) => configureKajabiBlueprint(t.db, { actor, input: { ...t.input, ...patch }, now });
  t.install = async () => { const result = await t.configure(); assert.ok(result.ok); t.binding = result.binding; return result; };
  t.projectId = (await t.create({ serviceEngagementId: 'kajabi-service' })).projectId;
  t.options = (actor = t.owner, projectId = t.projectId) => systemsBlueprintOptions(t.db, { actor, projectId });
  t.request = async (selection = ['course']) => ({ requestId: crypto.randomUUID(), selectedComponentKeys: selection, expected: (await t.options()).expected });
  t.generate = (input, actor = t.owner, projectId = t.projectId) => generateSystemsBlueprint(t.db, { actor, projectId, input, now });
  t.state = () => ['templates','template_versions','service_type_blueprint_bindings','projects','milestones','actions','deliverables','action_dependencies','systems_blueprint_generations','systems_blueprint_generation_items','activity_events'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY id`));
  return t;
}
test('Kajabi manifest has the agreed phases, outputs and graph; GHL canonical hash is unchanged', async () => {
  const plan = compile(keys);
  assert.deepEqual(plan.selectedComponentKeys, keys);
  assert.deepEqual(plan.milestones.map(m => m.name), ['Access / Assets','Architecture','Course Build','Funnel / Checkout','Email / Nurture','QA','Client Review','Launch','Handoff']);
  assert.deepEqual(plan.actions.map(a => a.title), ['Verify delegated Kajabi access and assets','Confirm course and offer architecture','Build course','Build funnel','Configure offer and checkout','Build nurture sequence','Perform internal QA','Coordinate client review','Coordinate approved launch','Prepare handoff']);
  assert.deepEqual(plan.deliverables.map(d => d.title), ['Kajabi course','Kajabi funnel','Offer and checkout','Nurture sequence']);
  assert.equal(plan.dependencies.length, 12);
  assert.ok([...plan.actions,...plan.milestones,...plan.deliverables].every(r => r.visibility === 'internal'));
  assert.equal((await encodeSystemsBlueprintDefinition(GHL_BUILD_BLUEPRINT_V1)).definitionHash, '338d87435f8ccd439d418684ff8c585c1db3a1087605c4bc961c8d30a0b97ded');
  assert.ok(Object.isFrozen(definition.components[0])); assert.ok(Object.isFrozen(definition.dependencyGroups[2]));
});
for (const key of keys) test(`Kajabi conditional ${key} creates no unselected work`, () => {
  const p = compile([key]); assert.equal(p.milestones.length, 1); assert.equal(p.actions.length, 1);
  assert.equal(p.deliverables.length, ['course','funnel','checkout','email'].includes(key) ? 1 : 0);
  assert.deepEqual(p.dependencies, []); assert.deepEqual(p.selectedComponentKeys, [key]);
});
test('shared checkout/funnel phase and omitted phases retain the exact parallel graph', () => {
  const p = compile(['handoff','checkout','funnel','architecture']);
  assert.equal(p.milestones.length, 3); assert.equal(p.deliverables.length, 2);
  assert.deepEqual(p.dependencies, [
    { actionKey: 'kajabi_checkout_configure', dependsOnActionKey: 'kajabi_architecture_confirm' },
    { actionKey: 'kajabi_funnel_build', dependsOnActionKey: 'kajabi_architecture_confirm' },
    { actionKey: 'kajabi_handoff_prepare', dependsOnActionKey: 'kajabi_checkout_configure' },
    { actionKey: 'kajabi_handoff_prepare', dependsOnActionKey: 'kajabi_funnel_build' },
  ]);
});
test('the closed catalog refuses unknown/prototype blueprint keys and tampered snapshots', async () => {
  for (const key of ['unknown','toString','__proto__',null,{}]) assert.equal(systemsBlueprintDefault(key), null);
  const encoded = await encodeSystemsBlueprintDefinition(definition);
  assert.equal((await verifiedBlueprintDefinition(encoded.definitionJson, encoded.definitionHash)).blueprintKey, 'kajabi_build');
  await assert.rejects(verifiedBlueprintDefinition(encoded.definitionJson, 'f'.repeat(64)));
  const other = await encodeSystemsBlueprintDefinition({ ...definition, blueprintKey: 'other_build' });
  await assert.rejects(verifiedBlueprintDefinition(other.definitionJson, other.definitionHash));
});
test('both defaults coexist; explicit bindings cannot replace each other or follow display names', async ctx => {
  const t = await fixture(ctx); await t.install();
  const ghl = await configureGhlBlueprint(t.db, { actor: t.owner, input: { ...t.input, serviceTypeId: 'type-systems' }, now }); assert.ok(ghl.ok);
  const before = t.state();
  assert.equal((await configureGhlBlueprint(t.db, { actor: t.owner, input: { ...t.input, expectedBinding: expected(t.binding) }, now })).reason, 'other_blueprint');
  assert.equal((await t.configure({ serviceTypeId: 'type-systems', expectedBinding: expected(ghl.binding) })).reason, 'other_blueprint');
  assert.deepEqual(t.state(), before);
  assert.equal((await t.options()).blueprintKey, 'kajabi_build');
  const choices = await systemsBlueprintSetupOptions(t.db, { actor: t.owner, blueprintKey: 'kajabi_build' });
  assert.equal(choices.serviceTypes.find(r => r.id === 'type-systems').available, false);
  assert.equal((await systemsBlueprintSetupOptions(t.db, { actor: t.owner, blueprintKey: '__proto__' })).reason, 'invalid');
});
test('Kajabi default concurrent provisioning converges and only exactly matching history replays', async ctx => {
  const t = await fixture(ctx), results = await Promise.all([provisionKajabiBlueprint(t.db, { actor: t.owner, now }), provisionKajabiBlueprint(t.db, { actor: t.owner, now })]);
  assert.ok(results.every(r => r.ok)); assert.equal(new Set(results.map(r => r.versionId)).size, 1);
  const row = one(t.raw, 'SELECT * FROM template_versions'); const encoded = await encodeSystemsBlueprintDefinition(definition);
  assert.equal(row.definition_json, encoded.definitionJson); assert.equal(row.definition_hash, encoded.definitionHash);
  run(t.raw, "UPDATE template_versions SET status='retired'"); const before = t.state();
  assert.equal((await t.configure()).reason, 'conflict'); assert.deepEqual(t.state(), before);
});
for (const who of ['ary','pm','sam','james','foreign']) test(`Kajabi setup and generation enforce distinct ${who} authority`, async ctx => {
  const t = await fixture(ctx); const actor = await t.actor(who);
  assert.equal((await t.configure({}, actor)).ok, who === 'ary');
  if (['pm','sam','james'].includes(who)) {
    run(t.raw, "INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES('a',?,'templates.manage')", actor.membershipId);
    assert.equal((await t.configure({}, actor)).ok, who !== 'james');
    run(t.raw, 'DELETE FROM member_capabilities WHERE membership_id=?', actor.membershipId);
    assert.equal((await systemsBlueprintSetupOptions(t.db, { actor, blueprintKey: 'kajabi_build' })).ok, false);
  }
  if (!(await t.options()).ok) await t.install();
  const before = t.state(); const r = await t.generate(await t.request(), actor);
  assert.equal(r.ok, ['ary','pm'].includes(who)); if (!r.ok) assert.deepEqual(t.state(), before);
});
test('all Kajabi components use the canonical receipt, graph, internal work and event', async ctx => {
  const t = await fixture(ctx); await t.install(); const before = t.state();
  const preview = await prepareSystemsBlueprint(t.db, { actor: t.owner, projectId: t.projectId, selectedComponentKeys: keys }); assert.equal(preview.ok, true); assert.deepEqual(t.state(), before);
  const input = await t.request(keys), first = await t.generate(input); assert.ok(first.ok);
  assert.deepEqual(first.counts, { milestones: 9, actions: 10, deliverables: 4, dependencies: 12 });
  assert.equal(one(t.raw,'SELECT blueprint_key FROM systems_blueprint_generations').blueprint_key, 'kajabi_build');
  assert.equal(all(t.raw,'SELECT * FROM systems_blueprint_generation_items').length, 23);
  assert.equal(all(t.raw,"SELECT * FROM activity_events WHERE event_type='PROJECT_BLUEPRINT_GENERATED'").length, 1);
  assert.equal(one(t.raw,'SELECT revision FROM projects WHERE id=?',t.projectId).revision, 2);
  for (const table of ['milestones','actions','deliverables']) assert.ok(all(t.raw, `SELECT * FROM ${table}`).every(r => r.visibility === 'internal'));
  const committed = t.state(); assert.deepEqual(await t.generate({ ...input, selectedComponentKeys: [...keys].reverse() }), { ...first, replayed: true }); assert.deepEqual(t.state(), committed);
});
for (const race of ['same','different']) test(`Kajabi concurrent ${race} request creates one winner`, async ctx => {
  const t = await fixture(ctx); await t.install(); const input = await t.request(['course','checkout']);
  const other = race === 'same' ? input : { ...input, requestId: crypto.randomUUID() };
  const results = await Promise.all([t.generate(input), t.generate(other)]);
  assert.equal(results.filter(r => r.ok && !r.replayed).length, 1);
  assert.equal(results.filter(r => r.ok).length, race === 'same' ? 2 : 1);
  assert.equal(all(t.raw, 'SELECT * FROM actions').length, 2);
  assert.equal(all(t.raw, 'SELECT * FROM systems_blueprint_generations').length, 1);
});
test('Kajabi stale preview, late binding change and cross-Project replay refuse without stray work', async ctx => {
  const t = await fixture(ctx); await t.install(); const input = await t.request();
  assert.equal((await t.generate({ ...input, expected: { ...input.expected, definitionHash: 'f'.repeat(64) } })).reason, 'conflict');
  const batch = t.db.batch.bind(t.db); t.db.batch = async statements => { run(t.raw, 'UPDATE service_type_blueprint_bindings SET enabled=0,revision=revision+1'); t.db.batch = batch; return batch(statements); };
  assert.equal((await t.generate(input)).reason, 'conflict'); assert.equal(all(t.raw, 'SELECT * FROM actions').length, 0);
  const b = one(t.raw,'SELECT * FROM service_type_blueprint_bindings'); await t.configure({ expectedBinding: { id: b.id, revision: b.revision } });
  const fresh = await t.request(); assert.ok((await t.generate(fresh)).ok);
  const next = (await t.create({ serviceEngagementId: 'kajabi-service' })).projectId;
  assert.equal((await t.generate(fresh, t.owner, next)).reason, 'conflict');
  assert.equal((await t.generate(fresh, await t.actor('foreign'))).ok, false);
});
test('Kajabi lost-response retry preserves edits/deletions and survives disabled/retired setup', async ctx => {
  const t = await fixture(ctx); await t.install(); const input = await t.request(['course','qa']); const batch = t.db.batch.bind(t.db);
  t.db.batch = async statements => { await batch(statements); throw new Error('lost response'); };
  await assert.rejects(t.generate(input), /lost response/); t.db.batch = batch;
  run(t.raw,"UPDATE actions SET title='Edited live work',revision=revision+1");
  run(t.raw,'DELETE FROM deliverables'); run(t.raw,"UPDATE template_versions SET status='retired'");
  assert.ok((await t.configure({ enabled: false, expectedBinding: expected(t.binding) })).ok);
  const before = t.state(); assert.equal((await t.generate(input)).replayed, true); assert.deepEqual(t.state(), before);
  run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'"); assert.equal((await t.generate(input)).ok, false);
});
test('Kajabi late failure rolls back receipt and canonical work', async ctx => {
  const t = await fixture(ctx); await t.install(); const input = await t.request(['architecture','course']), before = t.state();
  run(t.raw,"CREATE TRIGGER kajabi_abort BEFORE INSERT ON action_dependencies BEGIN SELECT RAISE(ABORT,'late Kajabi failure'); END");
  await assert.rejects(t.generate(input), /late Kajabi failure/); assert.deepEqual(t.state(), before);
});
test('Kajabi HTTP setup enforces identity, origin, strict input and current capability', async ctx => {
  const t = await fixture(ctx, true), cookies = {};
  const call = async (method, user, body = t.input, origin = APP_URL, query = '') => {
    if (user && !cookies[user]) cookies[user] = (await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const route = await import('../app/api/bloomops/systems/kajabi-setup/route.js');
    return route[method](new Request(`${APP_URL}/api/bloomops/systems/kajabi-setup${query}`, { method, headers: { origin, 'content-type':'application/json', ...(user ? { cookie: cookies[user] } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  };
  for (const method of ['GET','POST']) for (const [user,status] of [[null,401],['pm',403],['sam',403],['james',403]]) {
    const r = await call(method,user); assert.equal(r.status,status); assert.equal(r.headers.get('cache-control'),'no-store');
  }
  assert.equal((await call('POST','ellen',t.input,'https://evil.example')).status,403);
  assert.equal((await call('POST','ellen',{ ...t.input, blueprintKey:'ghl_build' })).status,400);
  assert.equal((await call('GET','ellen',t.input,APP_URL,'?workspaceId=b')).status,400);
  const saved = await call('POST','ellen'); assert.equal(saved.status,200); assert.equal(saved.headers.get('cache-control'),'no-store');
  const dto = await (await call('GET','ellen')).json(); assert.ok(dto.serviceTypes.find(r => r.id === 'type-kajabi').binding.enabled);
  assert.equal(JSON.stringify(dto).includes('definition'),false);
  assert.equal((await call('POST','ellen')).status,409);
});
