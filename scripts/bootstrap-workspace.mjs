#!/usr/bin/env node
// Bootstrap the first BloomOps workspace: one workspace, its Owner, and its
// Admin. Safe to run again: existing rows are left as they are.
//
//   node scripts/bootstrap-workspace.mjs --local                # wrangler's local D1
//   node scripts/bootstrap-workspace.mjs --env staging --remote # the staging D1
//   node scripts/bootstrap-workspace.mjs --print                # show the SQL, run nothing
//
// Inputs, as flags or environment variables (flags win):
//   --workspace-name  BLOOMOPS_BOOTSTRAP_WORKSPACE_NAME   required
//   --workspace-slug  BLOOMOPS_BOOTSTRAP_WORKSPACE_SLUG   optional, derived from the name
//   --owner-email     BLOOMOPS_BOOTSTRAP_OWNER_EMAIL      required
//   --owner-name      BLOOMOPS_BOOTSTRAP_OWNER_NAME       optional
//   --admin-email     BLOOMOPS_BOOTSTRAP_ADMIN_EMAIL      required
//   --admin-name      BLOOMOPS_BOOTSTRAP_ADMIN_NAME       optional
//
// The SQL is written to a private temporary file, handed to
// `wrangler d1 execute DB --file`, and deleted. `--remote` needs `--env`, so
// this can never reach a remote database that was not named on purpose.
// Logs show masked addresses only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessReport, bootstrapPlan, maskEmail } from '../lib/bloomops/bootstrap.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] ?? '') : '';
};
const has = (name) => args.includes(name);

const input = {
  workspaceName: flag('--workspace-name') || process.env.BLOOMOPS_BOOTSTRAP_WORKSPACE_NAME || '',
  workspaceSlug: flag('--workspace-slug') || process.env.BLOOMOPS_BOOTSTRAP_WORKSPACE_SLUG || '',
  owner: {
    email: flag('--owner-email') || process.env.BLOOMOPS_BOOTSTRAP_OWNER_EMAIL || '',
    name: flag('--owner-name') || process.env.BLOOMOPS_BOOTSTRAP_OWNER_NAME || '',
  },
  admin: {
    email: flag('--admin-email') || process.env.BLOOMOPS_BOOTSTRAP_ADMIN_EMAIL || '',
    name: flag('--admin-name') || process.env.BLOOMOPS_BOOTSTRAP_ADMIN_NAME || '',
  },
};

let plan;
try {
  plan = bootstrapPlan(input);
} catch (err) {
  console.error(`bootstrap: ${err.message}`);
  process.exit(2);
}

if (has('--print')) {
  console.log(plan.statements.join('\n'));
  process.exit(0);
}

const remote = has('--remote');
const local = has('--local');
const env = flag('--env');
if (remote === local) {
  console.error('bootstrap: pass exactly one of --local or --remote.');
  process.exit(2);
}
if (remote && !env) {
  console.error('bootstrap: --remote needs --env <staging|production>.');
  process.exit(2);
}

const wranglerArgs = ['--no-install', 'wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local'];
if (env) wranglerArgs.push('--env', env);

function wrangler(extra, { json = false } = {}) {
  const out = execFileSync('npx', [...wranglerArgs, ...extra, ...(json ? ['--json'] : [])], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  if (!json) return out;
  const text = out.replace(/\x1b\[[0-9;]*m/g, '');
  const start = text.indexOf('[');
  if (start < 0) throw new Error('wrangler returned no JSON');
  return JSON.parse(text.slice(start));
}

const dir = mkdtempSync(join(tmpdir(), 'bloomops-bootstrap-'));
const file = join(dir, 'bootstrap.sql');
try {
  writeFileSync(file, plan.statements.join('\n') + '\n', { mode: 0o600 });
  console.log(`bootstrap: applying ${plan.statements.length} idempotent statements to ${env || 'development'} (${remote ? 'remote' : 'local'})`);
  wrangler(['--file', file]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const result = wrangler(['--command', plan.reportSql], { json: true });
const rows = result?.[0]?.results || [];
const report = assessReport(plan.input, rows);
for (const m of report.memberships) {
  const state = m.role ? `${m.role} / ${m.status}` : 'missing';
  console.log(`bootstrap: ${m.label.padEnd(5)} ${maskEmail(m.email).padEnd(28)} ${state}${m.ok ? '' : `  (expected ${m.expectedRole} / active)`}`);
}
if (report.otherMembers > 0) console.log(`bootstrap: ${report.otherMembers} other membership(s) already in workspace "${report.workspace}"`);
console.log(report.ok ? `bootstrap: workspace "${report.workspace}" is ready` : `bootstrap: workspace "${report.workspace}" differs from the intended memberships (nothing was overwritten)`);
process.exit(report.ok ? 0 : 1);
