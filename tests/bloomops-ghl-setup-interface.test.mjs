import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { setup } from './_projects.mjs';
import { APP_URL, all, one, run } from './_bloomops-db.mjs';
import { configureGhlBlueprint, configureKajabiBlueprint, systemsBlueprintSetupOptions, provisionGhlBlueprint, provisionKajabiBlueprint, saveSystemsBlueprintBinding } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { systemsBlueprintOptions } from '../lib/bloomops/systems-blueprint-preparation.mjs';
import { generateSystemsBlueprint } from '../lib/bloomops/systems-blueprint-generation.mjs';
const now = new Date('2026-09-12T10:00:00.000Z');
const state = t => ['templates', 'template_versions', 'service_type_blueprint_bindings'].map(table => all(t.raw, `SELECT * FROM ${table} ORDER BY id`));
async function fixture(ctx, auth = false, blueprint = 'ghl') {
  const t = await setup({ auth }); ctx.after(() => t.raw.close());
  t.input = { serviceTypeId: 'type-systems', enabled: true, expectedBinding: null };
  t.configure = (patch = {}, actor = t.owner) => (blueprint === 'kajabi' ? configureKajabiBlueprint : configureGhlBlueprint)(t.db, { actor, input: { ...t.input, ...patch }, now });
  t.options = (actor = t.owner) => systemsBlueprintSetupOptions(t.db, { actor });
  t.grant = user => run(t.raw, "INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES('a',?,'templates.manage')", `m-${user}`);
  const cookies = {};
  t.call = async (method = 'GET', { user = 'ellen', body = t.input, raw, origin = APP_URL, query = '' } = {}) => {
    if (user && !cookies[user]) cookies[user] = (await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const route = await import('../app/api/bloomops/systems/ghl-setup/route.js');
    return route[method](new Request(`${APP_URL}/api/bloomops/systems/ghl-setup${query}`, { method,
      headers: { ...(user ? { cookie: cookies[user] } : {}), origin, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: raw ?? JSON.stringify(body) } : {}),
    }));
  };
  return t;
}
const expected = binding => ({ id: binding.id, revision: binding.revision });
test('setup options are a scoped exact DTO and make no writes', async ctx => {
  const t = await fixture(ctx), before = state(t), result = await t.options();
  assert.deepEqual(result, { ok: true, serviceTypes: [{ id: 'type-systems', name: 'systems', binding: null, available: true }] });
  assert.deepEqual(state(t), before);
  run(t.raw, "UPDATE service_types SET name='Not a platform hint',slug='unrelated' WHERE id='type-systems'");
  assert.equal((await t.configure()).ok, true);
  const dto = (await t.options()).serviceTypes[0]; assert.deepEqual(Object.keys(dto.binding).sort(), ['enabled','id','revision']);
});
for (const who of ['ellen','ary','pm','sam','james','foreign']) test(`setup follows actual role/capability for ${who}`, async ctx => {
  const t = await fixture(ctx), actor = await t.actor(who);
  const allowed = ['ellen','ary'].includes(who);
  assert.equal((await t.configure({}, actor)).ok, allowed);
  if (['pm','sam','james'].includes(who)) {
    t.grant(who); const granted = await t.actor(who);
    assert.equal((await t.configure({}, granted)).ok, who !== 'james');
    assert.equal((await t.options(granted)).ok, who !== 'james');
    run(t.raw, 'DELETE FROM member_capabilities WHERE membership_id=?', `m-${who}`);
    assert.equal((await t.options(granted)).reason, 'forbidden');
  }
});
for (const target of ['missing','type-social','type-foreign-dept']) test(`unavailable ${target} is rejected before provisioning`, async ctx => {
  const t = await fixture(ctx); assert.equal((await t.configure({ serviceTypeId: target })).reason, 'not_found'); assert.deepEqual(state(t), [[],[],[]]);
});
for (const change of ["UPDATE service_types SET active=0 WHERE id='type-systems'", "UPDATE departments SET active=0 WHERE id='systems'", "UPDATE departments SET slug='other' WHERE id='systems'"]) test(`inactive or non-Systems catalogue refuses setup: ${change}`, async ctx => {
  const t = await fixture(ctx); run(t.raw, change); assert.deepEqual((await t.options()).serviceTypes, []); assert.equal((await t.configure()).reason, 'not_found'); assert.deepEqual(state(t), [[],[],[]]);
});
test('unbound disable is an authorized no-op; enable/no-op/disable preserve the canonical default', async ctx => {
  const t = await fixture(ctx); assert.deepEqual(await t.configure({ enabled: false }), { ok: true, binding: null, unchanged: true }); assert.deepEqual(state(t), [[],[],[]]);
  const first = await t.configure(); assert.ok(first.ok); assert.equal(first.binding.enabled, true); const before = state(t);
  assert.deepEqual(await t.configure({ expectedBinding: expected(first.binding) }), { ...first, unchanged: true }); assert.deepEqual(state(t), before);
  const disabled = await t.configure({ enabled: false, expectedBinding: expected(first.binding) }); assert.equal(disabled.binding.enabled, false); assert.equal(disabled.binding.revision, 2);
  assert.deepEqual(state(t).slice(0, 2), before.slice(0, 2));
});
test('stale revisions and invalid fields reject before provisioning or changing configuration', async ctx => {
  const t = await fixture(ctx);
  for (const patch of [{ expectedBinding: { id: 'missing', revision: 1 } }, { expectedBinding: {} }, { enabled: 1 }, { templateId: 'hidden' }, { workspaceId: 'b' }]) assert.equal((await t.configure(patch)).ok, false);
  assert.deepEqual(state(t), [[],[],[]]);
  const first = await t.configure(), before = state(t); assert.equal((await t.configure({ enabled: false })).reason, 'conflict');
  assert.equal((await t.configure({ enabled: false, expectedBinding: { id: first.binding.id, revision: 99 } })).reason, 'conflict'); assert.deepEqual(state(t), before);
});
test('another blueprint binding is reported and never replaced or disabled', async ctx => {
  const t = await fixture(ctx);
  run(t.raw, "INSERT INTO templates(id,workspace_id,kind,name,slug) VALUES('other-template','a','systems','Other build','other-build')");
  const existing = await saveSystemsBlueprintBinding(t.db, { actor: t.owner, serviceTypeId: 'type-systems', templateId: 'other-template', enabled: true, expectedBinding: null });
  const before = state(t); assert.equal((await t.options()).serviceTypes[0].available, false);
  for (const enabled of [true, false]) assert.equal((await t.configure({ enabled, expectedBinding: expected(existing.binding) })).reason, 'other_blueprint');
  assert.deepEqual(state(t), before);
});
test('canonical default conflicts refuse enabling; disabling never repairs or provisions versions', async ctx => {
  const t = await fixture(ctx), installed = await provisionGhlBlueprint(t.db, { actor: t.owner, now });
  run(t.raw, 'UPDATE templates SET active=0 WHERE id=?', installed.templateId);
  const before = state(t); assert.equal((await t.configure()).reason, 'conflict'); assert.deepEqual(state(t), before);
  run(t.raw, 'UPDATE templates SET active=1 WHERE id=?', installed.templateId);
  const configured = await t.configure(); run(t.raw, 'UPDATE templates SET active=0 WHERE id=?', installed.templateId);
  run(t.raw, "UPDATE template_versions SET status='retired' WHERE id=?", installed.versionId);
  const historical = state(t).slice(0, 2); const disabled = await t.configure({ enabled: false, expectedBinding: expected(configured.binding) });
  assert.equal(disabled.binding.enabled, false); assert.deepEqual(state(t).slice(0, 2), historical);
});
test('concurrent setup converges on one default and binding without replacing history', async ctx => {
  const t = await fixture(ctx), results = await Promise.all([t.configure(), t.configure()]);
  assert.ok(results.some(r => r.ok)); assert.ok(results.every(r => r.ok || r.reason === 'conflict'));
  assert.deepEqual(state(t).map(rows => rows.length), [1,1,1]);
});
for (const blueprint of ['ghl', 'kajabi']) for (const mode of ['insert', 'update', 'no-op']) for (const change of ['retire', 'deactivate', 'extra-version']) {
  test(`${blueprint} enable ${mode} rejects ${change} after canonical preflight`, async ctx => {
    const t = await fixture(ctx, false, blueprint), installed = await (blueprint === 'kajabi' ? provisionKajabiBlueprint : provisionGhlBlueprint)(t.db, { actor: t.owner, now });
    let binding = null;
    if (mode !== 'insert') {
      const saved = await saveSystemsBlueprintBinding(t.db, { actor: t.owner, serviceTypeId: t.input.serviceTypeId,
        templateId: installed.templateId, enabled: mode === 'no-op', expectedBinding: null, now });
      assert.ok(saved.ok); binding = saved.binding;
    }
    const before = state(t)[2];
    let fired = false, preflightPassed = false;
    const d1 = { ...t.d1, prepare(query) {
      const wrap = statement => new Proxy(statement, { get(target, key) {
        if (key === 'bind') return (...args) => wrap(statement.bind(...args));
        if (['all', 'raw', 'run'].includes(key)) return (...args) => {
          const boundary = mode === 'no-op'
            ? /^select /i.test(query) && query.includes('inner join "service_type_blueprint_bindings"')
            : new RegExp(`^${mode === 'insert' ? 'insert into' : 'update'} "service_type_blueprint_bindings"`, 'i').test(query);
          if (!fired && boundary) {
            assert.ok(preflightPassed, 'interleave after target preflight'); fired = true;
            if (change === 'retire') run(t.raw, "UPDATE template_versions SET status='retired' WHERE id=?", installed.versionId);
            if (change === 'deactivate') run(t.raw, 'UPDATE templates SET active=0 WHERE id=?', installed.templateId);
            if (change === 'extra-version') run(t.raw, `INSERT INTO template_versions
              (id,workspace_id,template_id,version_number,status,definition_json,definition_hash,created_by_membership_id)
              SELECT 'extra-version',workspace_id,template_id,2,'draft',definition_json,definition_hash,created_by_membership_id
              FROM template_versions WHERE id=?`, installed.versionId);
          }
          const result = statement[key](...args);
          if (/^select "id" from "service_types"/i.test(query) && query.includes('templates target')) preflightPassed = true;
          return result;
        };
        return target[key];
      } });
      return wrap(t.d1.prepare(query));
    } };
    t.db = drizzle(d1, { schema });
    assert.deepEqual(await t.configure({ expectedBinding: binding ? expected(binding) : null }), { ok: false, reason: 'conflict' });
    assert.ok(fired, 'final binding boundary exercised');
    assert.deepEqual(state(t)[2], before, 'refusal preserves binding, revision and attribution');
  });
}
test('late binding failure may leave a valid default but never reports enabled setup', async ctx => {
  const t = await fixture(ctx); run(t.raw, "CREATE TRIGGER fail_setup_binding BEFORE INSERT ON service_type_blueprint_bindings BEGIN SELECT RAISE(ABORT,'late binding failure'); END");
  await assert.rejects(t.configure(), error => /late binding failure/.test(error.cause?.message || error.message)); assert.deepEqual(state(t).map(rows => rows.length), [1,1,0]);
  assert.equal(state(t)[1][0].status, 'published');
});
test('disabling configuration retains exact generation replay and rejects a new build', async ctx => {
  const t = await fixture(ctx), configured = await t.configure();
  const projectId = (await t.create({ serviceEngagementId: 'ghl-service' })).projectId;
  const input = { requestId: crypto.randomUUID(), selectedComponentKeys: ['funnel'], expected: (await systemsBlueprintOptions(t.db, { actor: t.owner, projectId })).expected };
  const generate = () => generateSystemsBlueprint(t.db, { actor: t.owner, projectId, input, now });
  const first = await generate(); assert.ok(first.ok);
  const work = all(t.raw, 'SELECT * FROM actions');
  assert.ok((await t.configure({ enabled: false, expectedBinding: expected(configured.binding) })).ok);
  assert.deepEqual(await generate(), { ...first, replayed: true }); assert.deepEqual(all(t.raw, 'SELECT * FROM actions'), work);
  const nextId = (await t.create({ serviceEngagementId: 'ghl-service' })).projectId;
  assert.equal((await systemsBlueprintOptions(t.db, { actor: t.owner, projectId: nextId })).reason, 'not_eligible');
});
for (const method of ['GET','POST']) test(`HTTP ${method} enforces identity, capability, origin and strict query input`, async ctx => {
  const t = await fixture(ctx, true);
  for (const [user, status] of [[null,401], ['pm',403], ['sam',403], ['james',403]]) { const r = await t.call(method, { user }); assert.equal(r.status, status); assert.equal(r.headers.get('cache-control'), 'no-store'); }
  if (method === 'POST') assert.equal((await t.call(method, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await t.call(method, { query: '?workspaceId=b' })).status, 400);
  assert.deepEqual(state(t), [[],[],[]]);
});
test('HTTP malformed/unknown/foreign input is safe and cannot provision defaults', async ctx => {
  const t = await fixture(ctx, true);
  for (const raw of ['{','null','[]','true']) assert.equal((await t.call('POST', { raw })).status, 400);
  assert.equal((await t.call('POST', { body: { ...t.input, templateId: 'other' } })).status, 400);
  assert.equal((await t.call('POST', { body: { ...t.input, serviceTypeId: 'type-foreign-dept' } })).status, 404);
  assert.deepEqual(state(t), [[],[],[]]);
});
test('HTTP capability grant and revocation apply to existing sessions; refresh reveals committed setup', async ctx => {
  const t = await fixture(ctx, true); assert.equal((await t.call('GET', { user: 'pm' })).status, 403); t.grant('pm');
  const first = await t.call('POST', { user: 'pm' }); assert.equal(first.status, 200);
  const config = await (await t.call('GET', { user: 'pm' })).json(); assert.equal(config.serviceTypes[0].binding.enabled, true);
  const stale = await t.call('POST', { user: 'pm' }); assert.equal(stale.status, 409);
  run(t.raw, "DELETE FROM member_capabilities WHERE membership_id='m-pm'"); assert.equal((await t.call('GET', { user: 'pm' })).status, 403);
});
test('HTTP unexpected binding failure is sanitized and does not claim success', async ctx => {
  const t = await fixture(ctx, true); run(t.raw, "CREATE TRIGGER fail_setup_http BEFORE INSERT ON service_type_blueprint_bindings BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL constraint INTERNAL_ID'); END");
  const r = await t.call('POST'); assert.equal(r.status, 500); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await r.text(), /PRIVATE|SQL|INTERNAL|constraint|stack/);
  assert.equal(one(t.raw, 'SELECT count(*) n FROM service_type_blueprint_bindings').n, 0);
});

test('revocation after default commit cannot enable a binding', async ctx => {
  const t = await fixture(ctx); t.grant('pm'); const actor = await t.actor('pm');
  const batch = t.db.batch.bind(t.db);
  t.db.batch = async queries => { const result = await batch(queries); run(t.raw, "DELETE FROM member_capabilities WHERE membership_id='m-pm'"); return result; };
  assert.equal((await t.configure({}, actor)).reason, 'forbidden');
  assert.deepEqual(state(t).map(rows => rows.length), [1,1,0]);
});
test('a competing non-GHL binding between provisioning and save is preserved', async ctx => {
  const t = await fixture(ctx), batch = t.db.batch.bind(t.db);
  t.db.batch = async queries => {
    const result = await batch(queries);
    run(t.raw, "INSERT INTO templates(id,workspace_id,kind,name,slug) VALUES('racer','a','systems','Other build','racer')");
    run(t.raw, "INSERT INTO service_type_blueprint_bindings(id,workspace_id,service_type_id,template_id,enabled) VALUES('race-binding','a','type-systems','racer',1)");
    t.db.batch = batch; return result;
  };
  assert.equal((await t.configure()).reason, 'conflict');
  assert.equal(one(t.raw, "SELECT template_id FROM service_type_blueprint_bindings WHERE id='race-binding'").template_id, 'racer');
});
