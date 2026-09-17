import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDisposableName, assertDisposableIdentity, guardWranglerCommand,
  protectedIdsAreDistinct, sameDatabaseInventory, stagingIdentityUnchanged,
} from '../.github/scripts/zero-verify-safety.mjs';

const staging = { uuid: 'staging-id', name: 'bloomops-staging', created_at: '2026-09-05T00:00:00Z', version: 'production', num_tables: 58 };
const disposable = { uuid: 'created-id', name: 'bloomops-a2-zero-verify', created_at: '2026-09-07T00:00:00Z', version: 'production' };
const context = { configPath: '/tmp/verifier/wrangler.jsonc', mode: '--remote', databaseName: disposable.name, stagingName: staging.name };
const scoped = ['--config', context.configPath, '--remote'];

test('the observed concurrent staging migration from 58 to 59 tables preserves identity', () => {
  const after = { ...staging, num_tables: 59 };
  assert.equal(stagingIdentityUnchanged(staging, after), true);
  assert.equal(sameDatabaseInventory([staging], [after]), true);
  assert.equal(stagingIdentityUnchanged(staging, { ...staging }), true);
});
for (const field of ['uuid', 'created_at']) test(`staging cleanup rejects a changed ${field} even with unchanged table counts`, () => {
  assert.equal(stagingIdentityUnchanged(staging, { ...staging, [field]: 'unexpected' }), false);
});
test('missing staging identity metadata fails closed', () => {
  for (const missing of [null, {}, { uuid: 'staging-id' }, { created_at: staging.created_at }]) {
    assert.equal(stagingIdentityUnchanged(missing, missing), false);
    assert.equal(stagingIdentityUnchanged(staging, missing), false);
  }
});
test('the disposable deletion guard accepts only the exact id created by this run', () => {
  assert.doesNotThrow(() => assertDisposableIdentity(disposable, disposable.uuid, disposable.name));
  for (const info of [staging, { ...disposable, uuid: 'replacement-id' }, {...disposable,name:'renamed'}, {}, null]) {
    assert.throws(() => assertDisposableIdentity(info, disposable.uuid, disposable.name), /leaving it alone/);
  }
  assert.throws(() => assertDisposableIdentity({}, '', disposable.name), /leaving it alone/);
});
test('cleanup inventory tolerates API order and mutable table metadata, without mutating inputs', () => {
  const production = { uuid: 'prod-id', name: 'production', version: 'production', created_at: '2026-01-01' };
  const before = [staging, production]; const copy = structuredClone(before);
  assert.equal(sameDatabaseInventory(before, [production, { ...staging, num_tables: 59 }]), true);
  assert.deepEqual(before, copy);
});
for (const [name, after] of [
  ['extra database', [staging, disposable]], ['missing database', []],
  ['changed database UUID', [{ ...staging, uuid: 'other-id' }]],
  ['renamed database', [{ ...staging, name: 'other' }]],
  ['changed creation time', [{ ...staging, created_at: 'other' }]],
  ['changed database version', [{ ...staging, version: 'other' }]],
]) test(`cleanup inventory rejects ${name}`, () => assert.equal(sameDatabaseInventory([staging], after), false));

test('disposable names cannot collide with any protected product or environment', () => {
  assert.doesNotThrow(() => assertDisposableName(disposable.name));
  for (const name of ['', 'bloomtrack-pro', 'Leadsthatbloom', 'bloomwired-results', '412a33ad-copy', 'bloomops-staging', 'bloomops-production']) {
    assert.throws(() => assertDisposableName(name), /protected name/);
  }
});
test('both protected ids must be present and distinct', () => {
  assert.equal(protectedIdsAreDistinct('staging-id', 'production-id'), true);
  for (const ids of [['', 'prod'], ['stage', ''], ['', ''], ['same', 'same']]) assert.equal(protectedIdsAreDistinct(...ids), false);
});
test('the command guard permits only the actual scoped migration/query commands and account operations', () => {
  const accepted = [
    ['d1', 'execute', 'DB', ...scoped, '--command', 'SELECT 1', '--json'],
    ['d1', 'execute', 'DB', ...scoped, '--file', 'schema.sql', '--json'],
    ['d1', 'migrations', 'apply', 'DB', ...scoped],
    ['d1', 'migrations', 'list', 'DB', ...scoped],
    ['d1', 'list', '--json'], ['d1', 'info', staging.name, '--json'],
    ['d1', 'info', disposable.name, '--json'], ['d1', 'create', disposable.name],
    ['d1', 'delete', 'DB', '--config', context.configPath, '--skip-confirmation'],
  ];
  for (const args of accepted) assert.doesNotThrow(() => guardWranglerCommand(args, context));
  assert.doesNotThrow(() => guardWranglerCommand(['d1', 'execute', 'DB', '--config', context.configPath, '--local', '--command', 'SELECT 1'], { ...context, mode: '--local' }));
});
for (const target of ['bloomops-staging', 'staging-id', 'production-id', 'bloomtrack-pro']) test(`the command guard refuses writes to protected target ${target}`, () => {
  for (const args of [
    ['d1', 'delete', target, '--skip-confirmation'],
    ['d1', 'create', target],
    ['d1', 'execute', target, ...scoped, '--command', 'DROP TABLE clients'],
    ['d1', 'migrations', 'apply', target, ...scoped],
    ['d1', 'delete', target, ...scoped, '--skip-confirmation'],
  ]) assert.throws(() => guardWranglerCommand(args, context), /refusing/);
});
test('an alternate, repeated, missing, or environment-overridden config cannot bypass the command guard', () => {
  const query = ['d1', 'execute', 'DB'];
  const rejected = [
    [...query, '--remote', '--command', 'SELECT 1'],
    [...query, '--config', 'wrangler.jsonc', '--remote', '--command', 'SELECT 1'],
    [...query, ...scoped, '--config', 'wrangler.jsonc', '--command', 'SELECT 1'],
    [...query, ...scoped, '--env', 'production', '--command', 'SELECT 1'],
    [...query, ...scoped, '--local', '--command', 'SELECT 1'],
    [...query, ...scoped, '--command', 'SELECT 1', '--file', 'schema.sql'],
    [...query, ...scoped, '--command'],
    ['d1', 'delete', disposable.name, '--config', context.configPath],
    ['d1', 'delete', disposable.name, '--skip-confirmation'],
    ['d1', 'delete', 'DB', '--config', 'wrangler.jsonc', '--skip-confirmation'],
    ['d1', 'export', 'DB', ...scoped],
    ['d1', 'list', staging.name], ['d1', 'info', 'production-id'],
    ['deploy', ...scoped],
  ];
  for (const args of rejected) assert.throws(() => guardWranglerCommand(args, context), /refusing/);
  assert.throws(() => guardWranglerCommand([...query, ...scoped, '--command', 'SELECT 1'], { ...context, configPath: '' }), /refusing/);
});

test('every main push triggers the disposable verifier while preserving manual dispatch', async () => {
  const { readFileSync } = await import('node:fs');
  const { parse } = await import('yaml');
  const workflow=parse(readFileSync(new URL('../.github/workflows/verify-zero-remote.yml',import.meta.url),'utf8'));
  assert.ok(Object.hasOwn(workflow.on,'workflow_dispatch'));
  assert.ok(workflow.on.push.branches.includes('main'));
  assert.equal(Object.hasOwn(workflow.on.push,'paths'), false);
  assert.deepEqual(workflow.concurrency,{group:'bloomops-a2-zero-verify','cancel-in-progress':false});
  assert.equal(workflow.on.workflow_dispatch.inputs.diagnose_bytecode.default,false);
  const step=workflow.jobs['zero-to-current'].steps.find(s=>s.env?.ZERO_VERIFY_DIAGNOSTIC);
  assert.match(step.env.ZERO_VERIFY_DIAGNOSTIC,/github.event_name == 'workflow_dispatch' && inputs.diagnose_bytecode/);
  assert.match(step.run,/if \[ "\$ZERO_VERIFY_DIAGNOSTIC" = true \]; then\s+node .* --diagnose-bytecode\s+else\s+node .github\/scripts\/verify-zero-remote.mjs\s+fi/);
  assert.equal(workflow.jobs['zero-to-current'].steps.at(-1).if,'always()');
});
