import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/d1';
import { testDb, run, one, all } from './_bloomops-db.mjs';
import * as schema from '../lib/bloomops/schema.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { DEFAULT_ONBOARDING_TEMPLATES, onboardingDefaultStatements } from '../lib/bloomops/onboarding-defaults.mjs';
import { canonicalJson } from '../lib/bloomops/onboarding-definition.mjs';
import { createOnboardingVersion, currentPublishedVersion, getOnboardingVersion, listOnboardingTemplates, publishOnboardingVersion } from '../lib/bloomops/onboarding-templates.mjs';
import { prepareOnboardingPlan, persistOnboardingPlan } from '../lib/bloomops/onboarding-generation.mjs';

const input = (slug) => ({ workspaceName: `Agency ${slug}`, workspaceSlug: slug, owner: { email: `${slug}-owner@example.com` }, admin: { email: `${slug}-admin@example.com` } });
async function setup() {
  const ctx = testDb();
  for (const slug of ['a', 'b']) await runBootstrap(ctx.d1, input(slug));
  ctx.a = one(ctx.raw, "SELECT id FROM workspaces WHERE slug='a'").id;
  ctx.b = one(ctx.raw, "SELECT id FROM workspaces WHERE slug='b'").id;
  ctx.client = (id, ws = ctx.a) => { run(ctx.raw, 'INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES (?, ?, ?, ?)', id, ws, id, id); return id; };
  ctx.service = (id, client, slug, ws = ctx.a) => {
    const type = one(ctx.raw, 'SELECT id FROM service_types WHERE workspace_id=? AND slug=?', ws, slug).id;
    run(ctx.raw, 'INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id) VALUES (?, ?, ?, ?)', id, ws, client, type); return id;
  };
  ctx.client('james'); ctx.client('next'); ctx.client('foreign', ctx.b);
  ctx.service('social', 'james', 'social-media-management'); ctx.service('ads', 'james', 'ads');
  ctx.service('ghl', 'james', 'ghl'); ctx.service('kajabi', 'james', 'kajabi'); ctx.service('calendar', 'james', 'content-calendar');
  ctx.service('foreign-ads', 'foreign', 'ads', ctx.b);
  ctx.prepare = (serviceEngagementIds = ['social', 'ads'], clientId = 'james') => prepareOnboardingPlan(ctx.db, { workspaceId: ctx.a, clientId, serviceEngagementIds });
  ctx.persist = (plan, db = ctx.db) => persistOnboardingPlan(db, { workspaceId: ctx.a, clientId: plan.clientId, plan });
  ctx.version = (slug, ws = ctx.a) => currentPublishedVersion(ctx.db, ws, slug);
  ctx.edit = async (slug, change = () => {}, ws = ctx.a) => {
    const v = await ctx.version(slug, ws); const d = JSON.parse(v.definitionJson); change(d);
    const r = await createOnboardingVersion(ctx.db, { workspaceId: ws, templateId: v.templateId, definition: d });
    assert.equal(r.ok, true); return r.version;
  };
  ctx.publish = (v) => publishOnboardingVersion(ctx.db, { workspaceId: ctx.a, versionId: v.id });
  return ctx;
}
const runtimeTables = ['onboarding_instances', 'onboarding_instance_templates', 'onboarding_items', 'onboarding_item_services'];
const picture = (raw, tables = runtimeTables) => tables.map((t) => all(raw, `SELECT * FROM ${t} ORDER BY rowid`));
const expectEmpty = (raw) => assert.deepEqual(picture(raw).map((r) => r.length), [0, 0, 0, 0]);
const definitionFields = (v) => [v.definition_json, v.definition_hash, v.template_id, v.version_number];

test('bootstrap creates exactly five published V1 onboarding defaults per workspace, with independent SHA-256 proof', async () => {
  const c = await setup();
  assert.deepEqual(DEFAULT_ONBOARDING_TEMPLATES.map((t) => t.slug), ['common', 'social', 'ads', 'ghl', 'kajabi']);
  for (const ws of [c.a, c.b]) {
    const templates = await listOnboardingTemplates(c.db, ws); assert.equal(templates.length, 5);
    assert.ok(templates.every((t) => t.kind === 'onboarding'));
    for (const t of templates) {
      const v = await c.version(t.slug, ws); const expected = DEFAULT_ONBOARDING_TEMPLATES.find((d) => d.slug === t.slug);
      assert.equal(v.versionNumber, 1); assert.equal(v.status, 'published');
      assert.equal(v.definitionJson, expected.definitionJson);
      assert.equal(createHash('sha256').update(v.definitionJson).digest('hex'), v.definitionHash);
      assert.equal(v.definitionHash, expected.definitionHash);
      assert.deepEqual(Object.keys(JSON.parse(v.definitionJson)).sort(), ['category', 'items', 'schemaVersion']);
    }
  }
  assert.notEqual((await c.version('social', c.a)).id, (await c.version('social', c.b)).id);
});
test('default access instructions use delegated access and never request credentials', () => {
  const access = DEFAULT_ONBOARDING_TEMPLATES.flatMap((t) => JSON.parse(t.definitionJson).items).filter((i) => i.logicalKey.endsWith('_access'));
  for (const i of access) {
    assert.match(i.instructions, /Do not send a password\./);
    assert.match(i.instructions, /Grant|Invite/);
  }
});
test('bootstrap second pass inserts nothing and preserves all metadata and version bytes', async () => {
  const c = await setup();
  run(c.raw, "UPDATE templates SET name='Our social', description='Agency edited', active=0 WHERE workspace_id=? AND slug='social'", c.a);
  const before = picture(c.raw, ['templates', 'template_versions']);
  const changes = one(c.raw, 'SELECT total_changes() AS n').n;
  await runBootstrap(c.d1, input('a')); await runBootstrap(c.d1, input('b'));
  assert.equal(one(c.raw, 'SELECT total_changes() AS n').n, changes);
  assert.deepEqual(picture(c.raw, ['templates', 'template_versions']), before);
  expectEmpty(c.raw);
});
test('existing workspace receives missing defaults without creating clients or runtime samples', async () => {
  const { raw, d1 } = testDb(); run(raw, "INSERT INTO workspaces (id, name, slug) VALUES ('old', 'Old', 'old')");
  for (const statement of onboardingDefaultStatements({ workspaceSlug: 'old' })) await d1.prepare(statement).run();
  assert.equal(all(raw, 'SELECT * FROM templates').length, 5);
  assert.equal(all(raw, 'SELECT * FROM bloomops_clients').length, 0); expectEmpty(raw);
});
test('bootstrap never replaces newer publication or existing V1, including a missing historical V1', async () => {
  const c = await setup(); const old = await c.version('social');
  const v2 = await c.edit('social', (d) => { d.items[0].title = 'Agency wording'; }); await c.publish(v2);
  const before = picture(c.raw, ['templates', 'template_versions']);
  await runBootstrap(c.d1, input('a')); assert.deepEqual(picture(c.raw, ['templates', 'template_versions']), before);
  run(c.raw, 'DELETE FROM template_versions WHERE id=?', old.id);
  await runBootstrap(c.d1, input('a'));
  assert.equal((await c.version('social')).id, v2.id);
  const restored = one(c.raw, 'SELECT status, published_at FROM template_versions WHERE template_id=? AND version_number=1', v2.templateId);
  assert.equal(restored.status, 'retired'); assert.equal(restored.published_at, null, 'bootstrap must not invent a publication date for a backfilled snapshot');
});
test('creating a version validates server-side and cannot store progress or another category', async () => {
  const c = await setup(); const v1 = await c.version('social');
  for (const mutate of [(d) => { d.items[0].status = 'completed'; }, (d) => { d.category = 'ads'; }, (d) => { d.items[0].required = 1; }]) {
    const definition = JSON.parse(v1.definitionJson); mutate(definition);
    assert.deepEqual(await createOnboardingVersion(c.db, { workspaceId: c.a, templateId: v1.templateId, definition }), { ok: false, reason: 'invalid_definition' });
  }
  assert.equal(all(c.raw, 'SELECT * FROM template_versions WHERE template_id=?', v1.templateId).length, 1);
});
test('definition and hash are immutable, edits create sequential rows, and old version stays byte-for-byte unchanged', async () => {
  const c = await setup(); const v1 = await c.version('social');
  const before = one(c.raw, 'SELECT * FROM template_versions WHERE id=?', v1.id);
  for (const [column, value] of [['definition_json', '{}'], ['definition_hash', 'wrong'], ['template_id', 'other'], ['version_number', 7], ['workspace_id', c.b]]) {
    assert.throws(() => run(c.raw, `UPDATE template_versions SET ${column}=? WHERE id=?`, value, v1.id), /immutable/);
  }
  const v2 = await c.edit('social', (d) => { d.items[0].title = 'New title'; }); const v3 = await c.edit('social');
  assert.equal(v2.versionNumber, 2); assert.equal(v3.versionNumber, 3); assert.equal(v2.status, 'draft');
  assert.notEqual(v2.definitionHash, v1.definitionHash);
  assert.equal(createHash('sha256').update(v2.definitionJson).digest('hex'), v2.definitionHash);
  assert.deepEqual(one(c.raw, 'SELECT * FROM template_versions WHERE id=?', v1.id), before);
});
test('concurrent version creation allocates max+1 in the INSERT and never leaks a collision', async () => {
  const c = await setup(); const source = await c.version('social');
  const results = await Promise.all(Array.from({ length: 6 }, () => createOnboardingVersion(c.db, { workspaceId: c.a, templateId: source.templateId, definition: JSON.parse(source.definitionJson) })));
  assert.ok(results.every((r) => r.ok));
  assert.deepEqual(results.map((r) => r.version.versionNumber).sort((a, b) => a - b), [2, 3, 4, 5, 6, 7]);
  assert.throws(() => run(c.raw, 'INSERT INTO template_versions (workspace_id, template_id, version_number, definition_json, definition_hash) VALUES (?, ?, 2, ?, ?)', c.a, source.templateId, source.definitionJson, source.definitionHash), /UNIQUE/);
});
test('version-number authority collisions return a safe conflict, unrelated failures are not swallowed', async () => {
  const c = await setup(); const source = await c.version('social');
  const invoke = () => createOnboardingVersion(c.db, { workspaceId: c.a, templateId: source.templateId, definition: JSON.parse(source.definitionJson) });
  c.raw.exec("CREATE TRIGGER force_collision BEFORE INSERT ON template_versions BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: template_versions.template_id, template_versions.version_number'); END;");
  assert.deepEqual(await invoke(), { ok: false, reason: 'version_conflict' });
  c.raw.exec("DROP TRIGGER force_collision; CREATE TRIGGER broken_insert BEFORE INSERT ON template_versions BEGIN SELECT RAISE(ABORT, 'storage fault'); END;");
  await assert.rejects(invoke());
});
test('publication retires V1 and publishes V2 atomically, preserves definition bytes, and repeat publication is a true no-op', async () => {
  const c = await setup(); const v1 = await c.version('social'); const v2 = await c.edit('social');
  const fields = all(c.raw, 'SELECT * FROM template_versions WHERE template_id=? ORDER BY version_number', v1.templateId).map(definitionFields);
  assert.equal((await c.publish(v2)).ok, true);
  assert.equal((await c.version('social')).id, v2.id);
  assert.equal((await getOnboardingVersion(c.db, c.a, v1.id)).status, 'retired');
  assert.deepEqual(all(c.raw, 'SELECT * FROM template_versions WHERE template_id=? ORDER BY version_number', v1.templateId).map(definitionFields), fields);
  const changes = one(c.raw, 'SELECT total_changes() AS n').n;
  assert.deepEqual(await c.publish(v2), { ok: true, unchanged: true, versionId: v2.id });
  assert.equal(one(c.raw, 'SELECT total_changes() AS n').n, changes);
  assert.deepEqual(await c.publish(v1), { ok: false, reason: 'invalid_transition' });
});
test('database bypass cannot publish two versions, and failed publication restores the previous published version', async () => {
  const c = await setup(); const v1 = await c.version('social'); const v2 = await c.edit('social');
  assert.throws(() => run(c.raw, "UPDATE template_versions SET status='published' WHERE id=?", v2.id), /UNIQUE/);
  c.raw.exec("CREATE TRIGGER publication_failure BEFORE UPDATE OF status ON template_versions WHEN NEW.status='published' BEGIN SELECT RAISE(ABORT, 'late publication failure'); END;");
  const before = picture(c.raw, ['template_versions']); await assert.rejects(c.publish(v2));
  assert.deepEqual(picture(c.raw, ['template_versions']), before);
  assert.equal((await c.version('social')).id, v1.id);
});
// Inject a competing commit after the domain has read, immediately before
// its real D1 batch. The interleaving, schema and both write paths are real.
function beforeBatch(c, action) {
  let fired = false;
  return drizzle({ ...c.d1, async batch(statements) {
    if (!fired) { fired = true; await action(); }
    return c.d1.batch(statements);
  } }, { schema });
}
test('two publishers of the same draft do not retire their own winning publication', async () => {
  const c = await setup(); const v2 = await c.edit('social');
  const db = beforeBatch(c, async () => { assert.equal((await c.publish(v2)).ok, true); });
  assert.equal((await publishOnboardingVersion(db, { workspaceId: c.a, versionId: v2.id })).ok, true);
  assert.equal((await c.version('social')).id, v2.id);
});
test('a target retired by a competing publisher cannot retire the newer publication', async () => {
  const c = await setup(); const v2 = await c.edit('social'); const v3 = await c.edit('social');
  const db = beforeBatch(c, async () => { await c.publish(v2); await c.publish(v3); });
  assert.deepEqual(await publishOnboardingVersion(db, { workspaceId: c.a, versionId: v2.id }), { ok: false, reason: 'invalid_transition' });
  assert.equal((await c.version('social')).id, v3.id);
});
test('different draft publications serialize to one current version', async () => {
  const c = await setup(); const v2 = await c.edit('social'); const v3 = await c.edit('social');
  const db = beforeBatch(c, async () => { await c.publish(v3); });
  assert.equal((await publishOnboardingVersion(db, { workspaceId: c.a, versionId: v2.id })).ok, true);
  assert.equal((await c.version('social')).id, v2.id);
  assert.equal((await getOnboardingVersion(c.db, c.a, v3.id)).status, 'retired');
});
test('malformed or hash-mismatched imported drafts cannot displace current publication', async () => {
  const c = await setup(); const source = await c.version('social');
  run(c.raw, "INSERT INTO template_versions (id, workspace_id, template_id, version_number, definition_json, definition_hash) VALUES ('bad', ?, ?, 2, ?, 'wrong')", c.a, source.templateId, source.definitionJson);
  assert.deepEqual(await c.publish({ id: 'bad' }), { ok: false, reason: 'invalid_definition' });
  assert.equal((await c.version('social')).id, source.id);
});
test('selection uses stable service slugs and required publications only', async () => {
  const c = await setup(); const p = await c.prepare(['ghl', 'ads', 'social']); assert.equal(p.ok, true);
  assert.deepEqual(p.plan.sourceTemplateVersions, await Promise.all(['common', 'social', 'ads', 'ghl'].map(async (s) => (await c.version(s)).id)));
  assert.deepEqual((await c.prepare(['calendar'])).plan.sourceTemplateVersions, [(await c.version('common')).id]);
  expectEmpty(c.raw);
});
test('missing/inactive required publication or corrupted hash fails before runtime writes', async () => {
  for (const mode of ['missing', 'inactive', 'hash']) {
    const c = await setup(); const ads = await c.version('ads');
    if (mode === 'missing') run(c.raw, "UPDATE template_versions SET status='retired' WHERE id=?", ads.id);
    if (mode === 'inactive') run(c.raw, 'UPDATE templates SET active=0 WHERE id=?', ads.templateId);
    if (mode === 'hash') {
      run(c.raw, 'DELETE FROM template_versions WHERE id=?', ads.id);
      run(c.raw, "INSERT INTO template_versions (workspace_id, template_id, version_number, status, definition_json, definition_hash) VALUES (?, ?, 1, 'published', ?, 'bad')", c.a, ads.templateId, ads.definitionJson);
    }
    assert.deepEqual(await c.prepare(), { ok: false, reason: mode === 'hash' ? 'invalid_definition' : 'missing_published_template' }); expectEmpty(c.raw);
  }
});
test('persistence generates relational fields, default states, exact provenance and service unions; no activation side effects', async () => {
  const c = await setup(); const { plan } = await c.prepare(['social', 'ads', 'ghl', 'kajabi']);
  const unaffected = ['bloomops_clients', 'service_engagements', 'client_contacts', 'workspace_invitations', 'activity_events', 'user'];
  const before = picture(c.raw, unaffected);
  const result = await c.persist(plan); assert.equal(result.ok, true);
  const instance = one(c.raw, 'SELECT * FROM onboarding_instances WHERE id=?', result.instanceId);
  assert.equal(instance.status, 'not_started'); assert.equal(instance.template_version_id, null);
  const rows = all(c.raw, 'SELECT * FROM onboarding_items ORDER BY position'); assert.equal(rows.length, 8);
  assert.ok(rows.every((i) => i.status === 'pending' && i.responsible_membership_id === null && i.completed_at === null && i.verified_at === null));
  const fields = rows.map((r) => ({ logicalKey: r.logical_key, title: r.title, instructions: r.instructions, required: !!r.required, verificationRequired: !!r.verification_required, responsibleParty: r.responsible_party, visibility: r.visibility, position: r.position }));
  assert.deepEqual(fields, plan.items.map(({ serviceEngagementIds, ...item }) => item));
  for (const row of rows) {
    const links = all(c.raw, 'SELECT service_engagement_id AS id FROM onboarding_item_services WHERE onboarding_item_id=? ORDER BY service_engagement_id', row.id).map((l) => l.id);
    assert.deepEqual(links, plan.items.find((i) => i.logicalKey === row.logical_key).serviceEngagementIds);
  }
  assert.equal(rows.find((r) => r.logical_key === 'course_videos').required, 0);
  assert.deepEqual(all(c.raw, 'SELECT template_version_id AS id FROM onboarding_instance_templates WHERE onboarding_instance_id=? ORDER BY template_version_id', instance.id).map((r) => r.id), [...plan.sourceTemplateVersions].sort());
  assert.deepEqual(picture(c.raw, unaffected), before);
});
test('publishing changed Social V2 leaves generated records and provenance byte-for-byte unchanged; a new client receives V2', async () => {
  const c = await setup(); const v1 = await c.version('social'); const { plan } = await c.prepare(); await c.persist(plan);
  const old = picture(c.raw);
  const v2 = await c.edit('social', (d) => { Object.assign(d.items[0], { title: 'New Instagram invitation', instructions: 'Invite our new team via business access.', required: false, verificationRequired: false, responsibleParty: 'team', visibility: 'internal' }); });
  await c.publish(v2); assert.deepEqual(picture(c.raw), old);
  c.service('next-social', 'next', 'social-media-management');
  const next = await c.prepare(['next-social'], 'next'); assert.equal(next.ok, true);
  assert.ok(next.plan.sourceTemplateVersions.includes(v2.id)); assert.ok(!next.plan.sourceTemplateVersions.includes(v1.id));
  const r = await c.persist(next.plan); assert.equal(r.ok, true);
  assert.equal(one(c.raw, "SELECT title FROM onboarding_items WHERE onboarding_instance_id=? AND logical_key='instagram_access'", r.instanceId).title, 'New Instagram invitation');
  assert.ok(old[1].some((row) => row.template_version_id === v1.id));
});
test('a previously compiled plan retains exact provenance when publication advances before persistence', async () => {
  const c = await setup(); const { plan } = await c.prepare(); const old = [...plan.sourceTemplateVersions];
  await c.publish(await c.edit('social'));
  assert.equal((await c.persist(plan)).ok, true);
  assert.deepEqual(all(c.raw, 'SELECT template_version_id AS id FROM onboarding_instance_templates ORDER BY template_version_id').map((r) => r.id), old.sort());
});
for (const table of ['onboarding_instance_templates', 'onboarding_items', 'onboarding_item_services']) test(`a failed ${table} insert rolls back the entire generation`, async () => {
  const c = await setup(); const { plan } = await c.prepare();
  c.raw.exec(`CREATE TRIGGER fail_runtime BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'late insert failure'); END;`);
  await assert.rejects(c.persist(plan)); expectEmpty(c.raw);
});
test('a failure on the final service link rolls back even earlier successfully inserted links and items', async () => {
  const c = await setup(); const { plan } = await c.prepare();
  c.raw.exec("CREATE TRIGGER fail_last_link BEFORE INSERT ON onboarding_item_services WHEN (SELECT count(*) FROM onboarding_item_services)=2 BEGIN SELECT RAISE(ABORT, 'last link failure'); END;");
  await assert.rejects(c.persist(plan)); expectEmpty(c.raw);
});
test('an existing open instance returns its safe id and never updates from a newer plan', async () => {
  const c = await setup(); const first = await c.persist((await c.prepare()).plan); const before = picture(c.raw);
  await c.publish(await c.edit('social', (d) => { d.items[0].title = 'Changed'; }));
  assert.deepEqual(await c.persist((await c.prepare()).plan), { ok: false, reason: 'existing_open_instance', instanceId: first.instanceId });
  assert.deepEqual(picture(c.raw), before);
});
test('concurrent generation resolves the unique-index loser to the winning open instance', async () => {
  const c = await setup(); const { plan } = await c.prepare(); let winner;
  const db = beforeBatch(c, async () => { winner = await c.persist(plan); });
  const result = await c.persist(plan, db);
  assert.deepEqual(result, { ok: false, reason: 'existing_open_instance', instanceId: winner.instanceId });
  assert.deepEqual(picture(c.raw).map((r) => r.length), [1, 3, 5, 3]);
});
test('a complete instance permits a new generation without changing its historical rows', async () => {
  const c = await setup(); const { plan } = await c.prepare(); const first = await c.persist(plan);
  run(c.raw, "UPDATE onboarding_instances SET status='complete' WHERE id=?", first.instanceId);
  const second = await c.persist(plan); assert.equal(second.ok, true); assert.notEqual(second.instanceId, first.instanceId);
  assert.equal(one(c.raw, 'SELECT status FROM onboarding_instances WHERE id=?', first.instanceId).status, 'complete');
});
test('generated runtime records remain operationally mutable while source provenance is immutable', async () => {
  const c = await setup(); const { plan } = await c.prepare(); const r = await c.persist(plan);
  run(c.raw, "UPDATE onboarding_items SET status='in_progress', instructions='An operational clarification' WHERE onboarding_instance_id=? AND logical_key='agreement'", r.instanceId);
  assert.equal(one(c.raw, "SELECT status FROM onboarding_items WHERE logical_key='agreement'").status, 'in_progress');
  assert.throws(() => run(c.raw, 'UPDATE onboarding_instance_templates SET template_version_id=? WHERE onboarding_instance_id=?', 'forbidden-rewrite', r.instanceId), /immutable/);
  assert.throws(() => run(c.raw, 'DELETE FROM onboarding_instance_templates WHERE onboarding_instance_id=?', r.instanceId), /immutable/);
  assert.throws(() => run(c.raw, 'DELETE FROM template_versions WHERE id=?', plan.sourceTemplateVersions[0]), /FOREIGN KEY/);
});
test('template version reads, creation, publication, and creator ids are workspace scoped', async () => {
  const c = await setup(); const foreign = await c.version('social', c.b);
  assert.equal(await getOnboardingVersion(c.db, c.a, foreign.id), null);
  assert.deepEqual(await c.publish(foreign), { ok: false, reason: 'not_found' });
  const args = { workspaceId: c.a, templateId: foreign.templateId, definition: JSON.parse(foreign.definitionJson) };
  assert.deepEqual(await createOnboardingVersion(c.db, args), { ok: false, reason: 'not_found' });
  const local = await c.version('social'); const m = one(c.raw, 'SELECT id FROM workspace_memberships WHERE workspace_id=? LIMIT 1', c.b).id;
  assert.deepEqual(await createOnboardingVersion(c.db, { ...args, templateId: local.templateId, createdByMembershipId: m }), { ok: false, reason: 'not_found' });
  expectEmpty(c.raw);
});
test('foreign client, foreign service, and another local client service are safely rejected', async () => {
  const c = await setup(); c.service('next-ads', 'next', 'ads');
  for (const [clientId, serviceEngagementIds] of [['foreign', []], ['missing', []], ['james', ['foreign-ads']], ['james', ['next-ads']], ['james', ['missing']]]) {
    assert.deepEqual(await prepareOnboardingPlan(c.db, { workspaceId: c.a, clientId, serviceEngagementIds }), { ok: false, reason: 'not_found' });
  }
  expectEmpty(c.raw);
});
test('persistence refuses foreign version ids, foreign ownership, draft sources, and tampered fields or links', async () => {
  const c = await setup(); const { plan } = await c.prepare(); const foreign = await c.version('social', c.b); const draft = await c.edit('social');
  const cases = [
    [(p) => { p.sourceTemplateVersions[1] = foreign.id; }, 'not_found'],
    [(p) => { p.workspaceId = c.b; }, 'not_found'],
    [(p) => { p.sourceTemplateVersions[1] = draft.id; }, 'missing_published_template'],
    [(p) => { p.items[0].title = 'Fake title'; }, 'invalid_plan'],
    [(p) => { p.items.at(-1).serviceEngagementIds = ['foreign-ads']; }, 'invalid_plan'],
    [(p) => { p.selectedServiceIds = ['foreign-ads']; }, 'not_found'],
    [(p) => { p.sourceTemplateVersions.pop(); }, 'missing_published_template'],
    [(p) => { p.items[0].status = 'completed'; }, 'invalid_plan'],
  ];
  for (const [mutate, reason] of cases) { const p = structuredClone(plan); mutate(p); assert.deepEqual(await c.persist(p), { ok: false, reason }); }
  assert.deepEqual(await persistOnboardingPlan(c.db, { workspaceId: c.a, clientId: 'foreign', plan }), { ok: false, reason: 'not_found' });
  expectEmpty(c.raw);
});
test('same-workspace FKs reject foreign provenance versions, instances, items, and service links even through direct SQL', async () => {
  const c = await setup(); const result = await c.persist((await c.prepare()).plan);
  const localV = await c.version('social'); const foreignV = await c.version('social', c.b);
  assert.throws(() => run(c.raw, 'INSERT INTO onboarding_instance_templates (workspace_id, onboarding_instance_id, template_version_id) VALUES (?, ?, ?)', c.a, result.instanceId, foreignV.id), /FOREIGN KEY/);
  assert.throws(() => run(c.raw, 'INSERT INTO onboarding_instance_templates (workspace_id, onboarding_instance_id, template_version_id) VALUES (?, ?, ?)', c.b, result.instanceId, foreignV.id), /FOREIGN KEY/);
  assert.throws(() => run(c.raw, 'INSERT INTO onboarding_instance_templates (workspace_id, onboarding_instance_id, template_version_id) VALUES (?, ?, ?)', c.a, result.instanceId, localV.id), /UNIQUE/);
  const item = one(c.raw, "SELECT id FROM onboarding_items WHERE logical_key='agreement'").id;
  assert.throws(() => run(c.raw, 'INSERT INTO onboarding_item_services (workspace_id, onboarding_item_id, service_engagement_id) VALUES (?, ?, ?)', c.a, item, 'foreign-ads'), /FOREIGN KEY/);
  assert.throws(() => run(c.raw, 'INSERT INTO onboarding_item_services (workspace_id, onboarding_item_id, service_engagement_id) VALUES (?, ?, ?)', c.b, item, 'foreign-ads'), /FOREIGN KEY/);
  assert.throws(() => run(c.raw, "INSERT INTO onboarding_items (workspace_id, onboarding_instance_id, logical_key, title) VALUES (?, ?, 'foreign_item', 'No')", c.b, result.instanceId), /FOREIGN KEY/);
  assert.throws(() => run(c.raw, 'INSERT INTO onboarding_instances (workspace_id, client_id) VALUES (?, ?)', c.a, 'foreign'), /FOREIGN KEY/);
});
test('conflicting published instructions fail preparation with no runtime writes', async () => {
  const c = await setup();
  await c.publish(await c.edit('ads', (d) => { d.items[0].instructions = 'Different meaningful instructions'; }));
  assert.deepEqual(await c.prepare(), { ok: false, reason: 'definition_conflict' }); expectEmpty(c.raw);
});
test('oversized service selections fail safely before exceeding D1 parameter limits', async () => {
  const c = await setup();
  assert.deepEqual(await c.prepare(Array.from({ length: 51 }, (_, i) => `service-${i}`)), { ok: false, reason: 'invalid_plan' }); expectEmpty(c.raw);
});
