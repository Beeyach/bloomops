#!/usr/bin/env node
// Exercise A8 through real local D1/workerd, without adding any app route.
// A disposable, in-memory binding: no account, existing workspace, or mail.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import * as schema from '../lib/bloomops/schema.mjs';
import { prepareOnboardingPlan, persistOnboardingPlan } from '../lib/bloomops/onboarding-generation.mjs';
import { createOnboardingVersion, currentPublishedVersion, publishOnboardingVersion } from '../lib/bloomops/onboarding-templates.mjs';

const temp = mkdtempSync(join(tmpdir(), 'bloomops-a8-smoke-'));
let proxy;
let checks = 0;
function check(name, predicate) { assert.ok(predicate, name); checks++; console.log(`ok   ${name}`); }
try {
  const configPath = join(temp, 'wrangler.json');
  writeFileSync(configPath, JSON.stringify({ name: 'bloomops-a8-local-smoke', compatibility_date: '2025-05-01', d1_databases: [{ binding: 'DB', database_name: 'a8-disposable-local', database_id: 'a8-disposable-local' }] }));
  proxy = await getPlatformProxy({ configPath, persist: false, remoteBindings: false, envFiles: [] });
  const d1 = proxy.env.DB;
  const db = drizzle(d1, { schema });
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
  for (const { tag } of journal.entries) {
    for (const chunk of readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint')) {
      if (chunk.trim()) await d1.prepare(chunk.trim()).run();
    }
  }
  check('all current domain migrations, including A8, apply to disposable workerd D1', journal.entries.some(e => e.tag === '0005_a8_onboarding_templates'));
  const input = { workspaceName: 'A8 Local', workspaceSlug: 'a8-local', owner: { email: 'a8-owner@example.com' }, admin: { email: 'a8-admin@example.com' } };
  await runBootstrap(d1, input);
  const before = (await d1.prepare('SELECT * FROM template_versions ORDER BY id').all()).results;
  await runBootstrap(d1, input);
  assert.deepEqual((await d1.prepare('SELECT * FROM template_versions ORDER BY id').all()).results, before);
  check('bootstrap is idempotent on D1', before.length === 5);
  const ws = (await d1.prepare("SELECT id FROM workspaces WHERE slug='a8-local'").first()).id;
  await d1.prepare("INSERT INTO bloomops_clients (id,workspace_id,name,slug) VALUES ('a8-client',?,'A8 Client','a8-client')").bind(ws).run();
  for (const [id, slug] of [['a8-social', 'social-media-management'], ['a8-ads', 'ads']]) {
    await d1.prepare('INSERT INTO service_engagements (id,workspace_id,client_id,service_type_id) SELECT ?,workspace_id,?,id FROM service_types WHERE workspace_id=? AND slug=?').bind(id, 'a8-client', ws, slug).run();
  }
  const prepared = await prepareOnboardingPlan(db, { workspaceId: ws, clientId: 'a8-client', serviceEngagementIds: ['a8-social', 'a8-ads'] });
  check('Social + Ads compile on D1', prepared.ok && prepared.plan.items.length === 5);
  const result = await persistOnboardingPlan(db, { workspaceId: ws, clientId: 'a8-client', plan: prepared.plan });
  check('atomic generation succeeds on D1', result.ok);
  const meta = await d1.prepare("SELECT id FROM onboarding_items WHERE logical_key='meta_business_access'").first();
  check('one Meta item has both service links', (await d1.prepare('SELECT count(*) AS n FROM onboarding_item_services WHERE onboarding_item_id=?').bind(meta.id).first()).n === 2);
  check('three exact source versions are relational', (await d1.prepare('SELECT count(*) AS n FROM onboarding_instance_templates WHERE onboarding_instance_id=?').bind(result.instanceId).first()).n === 3);
  const runtime = (await d1.prepare('SELECT * FROM onboarding_items ORDER BY id').all()).results;
  const source = await currentPublishedVersion(db, ws, 'social');
  const definition = JSON.parse(source.definitionJson); definition.items[0].title = 'Updated invitation';
  const v2 = await createOnboardingVersion(db, { workspaceId: ws, templateId: source.templateId, definition });
  check('MAX+1 version creation returns V2 on D1', v2.ok && v2.version.versionNumber === 2);
  check('publish/retire batch succeeds on D1', (await publishOnboardingVersion(db, { workspaceId: ws, versionId: v2.version.id })).ok);
  check('current publication is V2', (await currentPublishedVersion(db, ws, 'social')).id === v2.version.id);
  assert.deepEqual((await d1.prepare('SELECT * FROM onboarding_items ORDER BY id').all()).results, runtime);
  check('old runtime fields and source version stay unchanged', !!await d1.prepare('SELECT 1 FROM onboarding_instance_templates WHERE template_version_id=?').bind(source.id).first());
  const repeat = await persistOnboardingPlan(db, { workspaceId: ws, clientId: 'a8-client', plan: prepared.plan });
  check('existing open instance is a safe result on D1', repeat.reason === 'existing_open_instance' && repeat.instanceId === result.instanceId);
  await d1.prepare("INSERT INTO bloomops_clients (id,workspace_id,name,slug) VALUES ('a8-rollback',?,'Rollback','rollback')").bind(ws).run();
  const rollback = await prepareOnboardingPlan(db, { workspaceId: ws, clientId: 'a8-rollback', serviceEngagementIds: [] });
  await d1.prepare("CREATE TRIGGER a8_late_failure BEFORE INSERT ON onboarding_items WHEN NEW.logical_key='kickoff_booking' BEGIN SELECT RAISE(ABORT, 'forced late failure'); END").run();
  const counts = async () => Promise.all(['onboarding_instances', 'onboarding_instance_templates', 'onboarding_items', 'onboarding_item_services'].map((t) => d1.prepare(`SELECT count(*) AS n FROM ${t}`).first('n')));
  const savedCounts = await counts();
  await assert.rejects(persistOnboardingPlan(db, { workspaceId: ws, clientId: 'a8-rollback', plan: rollback.plan }));
  assert.deepEqual(await counts(), savedCounts);
  check('late insert failure rolls back all runtime tables on actual D1', true);
  console.log(`A8 local D1 smoke: ${checks} checks passed`);
} finally {
  await proxy?.dispose();
  rmSync(temp, { recursive: true, force: true });
}
