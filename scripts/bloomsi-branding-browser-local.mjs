#!/usr/bin/env node
// Built-Worker branding acceptance. Synthetic fixture, local D1/R2 only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const base = 'http://localhost:8787', out = resolve(process.argv[2] || '/tmp/bloomsi-branding');
const health = await (await fetch(base + '/api/health')).json();
assert.equal(health.environment, 'development'); assert.equal(health.auth.mail, 'r2-dev');
mkdirSync(out, { recursive: true });
const cli = args => execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const query = sql => JSON.parse(cli(['d1', 'execute', 'DB', '--local', '--command', sql, '--json']))[0].results;
const id = 'brand-' + randomUUID().slice(0, 8), wsName = 'Bloom Studio Garden', owner = id + '@example.com', client = id + '-client@example.com';
query(`INSERT INTO workspaces(id,slug,name) VALUES('${id}','${id}','${wsName}');
INSERT INTO user(id,name,email,email_verified) VALUES('${id}','Garden Owner','${owner}',1),('${id}-client','Garden Client','${client}',1);
INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('${id}','${id}','${id}','owner','active'),('${id}-client','${id}','${id}-client','client','active');
INSERT INTO bloomops_clients(id,workspace_id,name,slug,relationship_status) VALUES('${id}','${id}','Garden Client','garden-client','active');
INSERT INTO client_contacts(id,workspace_id,client_id,name,email,user_id,is_primary) VALUES('${id}','${id}','${id}','Garden Client','${client}','${id}-client',1);`);
const snapshot = () => JSON.stringify(query(`SELECT id,name,slug FROM workspaces ORDER BY id`));
const before = snapshot(), checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
const { chromium } = createRequire('/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' }), page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const asset = await context.request.get(base + '/brand/bloomsi-lockup-charcoal.png');
  check('Served logo is byte-identical to approved PNG', asset.status() === 200 && (await asset.body()).equals(readFileSync('public/brand/bloomsi-lockup-charcoal.png')));
  async function capture(name, path, workspace = false) {
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + path, { waitUntil: 'networkidle' });
      const logos = page.getByRole('img', { name: 'Bloomsi', exact: true });
      const visible = await logos.evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().width && n.closest('.bo-sidebar')?.getBoundingClientRect().width !== 0).filter(n => n.checkVisibility()).map(n => ({ loaded: n.complete && n.naturalWidth === 2172, width: n.parentElement.getBoundingClientRect().width, height: n.parentElement.getBoundingClientRect().height })));
      check(`${name} exact logo loads legibly at ${width}px`, visible.length === 1 && visible[0].loaded && visible[0].width >= 112 && Math.abs(visible[0].width / visible[0].height - 1800 / 610) < .02);
      const artwork = await logos.evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(img => {
        const box = img.getBoundingClientRect(), clip = img.parentElement.getBoundingClientRect();
        const art = { left: box.left + 223 / 2172 * box.width, right: box.left + 1953 / 2172 * box.width, top: box.top + 399 / 1134 * box.height, bottom: box.top + 929 / 1134 * box.height };
        const label = img.closest('.bo-topbar-title')?.querySelector('.bo-workspace-name')?.getBoundingClientRect();
        return { contained: art.left >= clip.left && art.right <= clip.right && art.top >= clip.top && art.bottom <= clip.bottom, gap: label ? label.left - art.right : null, width: art.right - art.left };
      }));
      check(`${name} entire artwork has clear space at ${width}px`, artwork.length === 1 && artwork[0].contained && artwork[0].width >= 107 && (artwork[0].gap === null || artwork[0].gap >= 12));
      check(`${name} title and layout at ${width}px`, (await page.title()).includes('Bloomsi') && !(await page.title()).includes('BloomOps') && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (workspace) check(`${name} preserves workspace name at ${width}px`, await page.locator('.bo-workspace-name:visible').filter({ hasText: wsName }).count() === 1);
      await page.screenshot({ path: join(out, `${name}-${width}.png`) });
    }
  }
  await capture('sign-in', '/sign-in');
  await page.getByLabel('Email address').focus();
  await page.keyboard.press('Tab');
  check('Sign-in keyboard reaches submit', await page.getByRole('button', { name: 'Email me a sign-in link', exact: true }).evaluate(el => el === document.activeElement));
  async function login(email) {
    const response = await context.request.post(base + '/api/auth/sign-in/magic-link', { headers: { origin: base }, data: { email, callbackURL: '/' } });
    assert.equal(response.status(), 200);
    const raw = cli(['r2', 'object', 'get', `bloomops-files-dev/dev-mail/${createHash('sha256').update(email).digest('hex')}.json`, '--local', '--pipe']);
    const mail = JSON.parse(raw.slice(raw.indexOf('{')));
    check('Local sign-in email uses Bloomsi', mail.subject === 'Your Bloomsi sign-in link');
    const link = mail.text.match(/https?:\/\/\S+/)[0]; assert.ok(link.startsWith(base + '/api/auth/magic-link/verify?'));
    await page.goto(link, { waitUntil: 'networkidle' });
  }
  await login(owner);
  await capture('internal', '/', true);
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    // Stress only rendered text, preserving stored workspace names.
    await page.locator('.bo-sidebar .bo-workspace-name').evaluate(el => { el.textContent = 'Bloom Studio Garden with a very long original workspace name'; });
    check(`Long workspace name remains inside sidebar at ${width}px`, await page.locator('.bo-sidebar .bo-workspace-name').evaluate(el => {
      const name = el.getBoundingClientRect(), sidebar = el.closest('.bo-sidebar').getBoundingClientRect();
      return name.right <= sidebar.right - 15 && el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis';
    }));
    await page.screenshot({ path: join(out, `internal-long-${width}.png`) });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Account/ }).click();
  check('Account menu remains usable', await page.getByRole('menuitem', { name: 'Sign out', exact: true }).isVisible());
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click(); await page.waitForURL('**/sign-in');
  await login(client);
  await capture('portal', '/portal', true);
  await page.locator('.bo-topbar').screenshot({ path: join(out, 'portal-header-320.png') });
  check('Workspace names remain unchanged', before === snapshot());
  check('No browser runtime errors', errors.length === 0);
  writeFileSync(join(out, 'results.json'), JSON.stringify({ checks, widths: [1440, 1024, 768, 390, 320], nativeD1: true, originalAsset: true }, null, 2));
  console.log(JSON.stringify({ passed: checks.length }));
} catch (e) { console.error(e.message.replace(/https?:\/\/\S+/g, '[redacted URL]')); process.exitCode = 1; }
finally { await browser.close(); }
