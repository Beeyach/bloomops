import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createMailer } from '../lib/bloomops/mail.mjs';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const check = (cfg) => {
  const dir = mkdtempSync(join(tmpdir(), 'bloomops-a11-config-'));
  try {
    writeFileSync(join(dir, 'wrangler.jsonc'), JSON.stringify(cfg));
    return spawnSync(process.execPath, [resolve('.github/scripts/ensure-staging-resources.mjs'), '--check'], {
      cwd: dir,
      encoding: 'utf8',
    }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
test('committed staging resources, origins and mail are explicit and isolated from production and development', () => {
  assert.equal(check(config), 0);
  const envs = [config, config.env.staging, config.env.production];
  for (const value of [
    envs.map((e) => e.name),
    envs.map((e) => e.d1_databases[0].database_id),
    envs.map((e) => e.d1_databases[0].database_name),
    envs.map((e) => e.r2_buckets[0].bucket_name),
  ])
    assert.equal(new Set(value).size, 3);
  assert.equal(config.vars.BLOOMOPS_MAIL_TRANSPORT, 'r2-dev');
  assert.equal(config.env.staging.vars.BLOOMOPS_ENV, 'staging');
  assert.equal(config.env.staging.vars.BLOOMOPS_APP_URL, 'https://staging.ops.gobloomwired.com');
  assert.equal(config.env.production.vars.BLOOMOPS_APP_URL, undefined);
});
for (const corruption of [
  'worker',
  'database',
  'bucket',
  'shared-id',
  'extra-d1',
  'extra-r2',
  'origin',
  'environment',
])
  test(`staging pre-provisioning guard refuses ${corruption}`, () => {
    const c = structuredClone(config),
      s = c.env.staging,
      p = c.env.production;
    if (corruption === 'worker') s.name = p.name;
    if (corruption === 'database') s.d1_databases[0].database_name = p.d1_databases[0].database_name;
    if (corruption === 'bucket') s.r2_buckets[0].bucket_name = p.r2_buckets[0].bucket_name;
    if (corruption === 'shared-id') s.d1_databases[0].database_id = p.d1_databases[0].database_id;
    if (corruption === 'extra-d1') s.d1_databases.push({ ...p.d1_databases[0], binding: 'OTHER_DB' });
    if (corruption === 'extra-r2') s.r2_buckets.push({ ...p.r2_buckets[0], binding: 'OTHER_FILES' });
    if (corruption === 'origin') s.vars.BLOOMOPS_APP_URL = 'https://production.example.com';
    if (corruption === 'environment') s.vars.BLOOMOPS_ENV = 'development';
    assert.notEqual(check(c), 0);
  });
test('development R2 mail cannot run in deployed environments', () => {
  for (const BLOOMOPS_ENV of ['staging', 'production'])
    assert.throws(() => createMailer({ BLOOMOPS_ENV, BLOOMOPS_MAIL_TRANSPORT: 'r2-dev' }));
});
test('staging workflow invokes only staging deploy/bootstrap/migrations and zero-verifier has exact-inventory cleanup', () => {
  const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
  assert.doesNotMatch(workflow, /--env production|run:.*production|secrets\.PRODUCTION_/);
  for (const step of [
    'db:schema:staging',
    'db:migrate:staging',
    'db:domain:migrate:staging',
    'deploy:staging',
    '--env staging --remote',
  ])
    assert.ok(workflow.includes(step));
  const zero = readFileSync('.github/scripts/verify-zero-remote.mjs', 'utf8');
  assert.match(zero, /assertDisposableIdentity\(info, createdId, DB_NAME\)/);
  assert.match(zero, /sameDatabaseInventory\(before, after\)/);
  const staging = readFileSync('.github/scripts/verify-staging.mjs', 'utf8');
  assert.match(staging, /env\?\.staging\?\.vars\?\.BLOOMOPS_APP_URL/);
});

test('resolved Worker configurations cannot persist invitation URLs in invocation logs or traces', async () => {
  const {unstable_readConfig}=await import('wrangler');
  for(const env of [undefined,'staging','production']) {
    const resolved=unstable_readConfig({config:resolve('wrangler.jsonc'),env});
    assert.equal(resolved.observability.enabled,false,env||'development');
    assert.equal(resolved.observability.logs?.enabled,false,env||'development');
    assert.equal(resolved.observability.logs?.invocation_logs,false,env||'development');
    assert.equal(resolved.observability.traces?.enabled,false,env||'development');
  }
});
