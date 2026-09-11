#!/usr/bin/env node
// Manual staging sign-in only. Never submits an email or reads a mailbox.
// No traces/screenshots/browser console/request URLs; the bearer state stays
// outside Git, newly created with exclusive mode 0600 in a mode-0700 folder.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const output = resolve(arg('--out', join(process.env.XDG_CACHE_HOME || join(process.env.HOME, '.cache'), 'bloomops-perf2-session', 'staging-state.json')));
const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const rel = relative(root, realpathSync(dirname(output)));
assert.ok(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel), 'Session output must be outside the repository.');
let inGit = false;
try { inGit = execFileSync('git', ['-C', dirname(output), 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', stdio: 'pipe' }).trim() === 'true'; } catch {}
assert.equal(inGit, false, 'Session output must be outside every Git worktree.');
assert.equal(statSync(dirname(output)).mode & 0o077, 0, 'Use a dedicated private mode-0700 directory.');
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-c6-tools')), 'package.json'));
const { chromium } = require('playwright');
let browser;
try {
  browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext(), page = await context.newPage();
  const origin = 'https://bloomops-staging.cool-sunset-2169.workers.dev';
  await page.goto(origin + '/sign-in');
  console.log('Sign in manually in the opened browser. Use the magic link in this browser, then open Systems. No email is sent automatically.');
  await page.waitForURL(url => url.origin === origin && url.pathname === '/systems', { timeout: 1800000 });
  const response = await context.request.get(origin + '/api/bloomops/me');
  assert.equal(response.status(), 200);
  const me = await response.json();
  assert.equal(me.membership?.role, 'owner', 'An Owner session is required.');
  writeFileSync(output, JSON.stringify(await context.storageState()), { mode: 0o600, flag: 'wx' });
  console.log('Owner storage state captured outside Git with mode 0600. Close/delete it after the measurements.');
} catch {
  console.error('Capture did not complete. Check the interactive display, Owner sign-in, and a new output path. No credentials are logged.');
  process.exitCode = 1;
} finally { await browser?.close(); }
