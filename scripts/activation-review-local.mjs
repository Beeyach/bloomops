#!/usr/bin/env node
// Browser acceptance for the small A9 internal surface. Uses only loopback,
// local D1/R2 mail, and an externally installed Playwright (no app dependency).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg('--url', 'http://localhost:8787'),
  out = resolve(arg('--out', '/tmp/bloomops-a9-review'));
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-a9-browser')), 'package.json'));
const { chromium } = require('playwright');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let checks = 0;
const check = (name, ok) => {
  assert.ok(ok, name);
  checks++;
  console.log(`ok   ${name}`);
};
const wrangler = (args) =>
  execFileSync('npx', ['--no-install', 'wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const health = await (await context.request.get(`${base}/api/health`)).json();
  assert.equal(health.environment, 'development');
  assert.equal(health.auth.mail, 'r2-dev');
  const email = 'smoke-owner@example.com';
  const requested = await context.request.post(`${base}/api/auth/sign-in/magic-link`, {
    headers: { origin: base },
    data: { email, callbackURL: '/', newUserCallbackURL: '/', errorCallbackURL: '/sign-in' },
  });
  assert.equal(requested.status(), 200);
  const key = createHash('sha256').update(email).digest('hex');
  const text = wrangler([
    'r2',
    'object',
    'get',
    `bloomops-files-dev/dev-mail/${key}.json`,
    '--local',
    '--pipe',
  ]);
  const link = JSON.parse(text.slice(text.indexOf('{'))).text.match(/https?:\/\/\S+/)[0];
  await page.goto(link);
  await page.waitForURL(base + '/');
  const api = async (path, data) => {
    const res = await context.request.post(base + path, { headers: { origin: base }, data });
    assert.ok(res.ok(), await res.text());
    return res.json();
  };
  const suffix = randomUUID().slice(0, 8);
  const made = await api('/api/bloomops/clients', {
    name: 'Browser Activation',
    contactName: 'Jamie Client',
    contactEmail: `a9-browser-${suffix}@example.com`,
  });
  const id = made.clientId || made.client?.id;
  assert.ok(id);
  const clientUrl = `${base}/clients/${id}`;
  await page.goto(clientUrl);
  await page.getByRole('button', { name: 'Activate Client', exact: true }).click();
  await page.getByText('Add the client’s purchased services before activating.').waitFor();
  check('missing-service validation is actionable', true);
  await page.screenshot({ path: join(out, 'validation.png'), fullPage: true });
  const raw = wrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '--json',
    '--command',
    "SELECT s.id FROM service_types s JOIN workspaces w ON w.id=s.workspace_id WHERE w.slug='smoke-agency' AND s.slug='content-calendar'",
  ]);
  const type = JSON.parse(raw.slice(raw.indexOf('[')))[0].results[0].id;
  await api(`/api/bloomops/clients/${id}/services`, { serviceTypeId: type });
  const audit = async (label, width) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    check(
      `${label} ${width}px no overflow`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    const form = page.getByRole('form', { name: 'Client activation' });
    check(`${label} ${width}px activation visible`, await form.isVisible());
    if (width < 480) {
      for (const box of await form.locator('button').all())
        check(`${label} ${width}px button touch height`, (await box.boundingBox()).height >= 44);
    }
    await page.screenshot({ path: join(out, `${label}-${width}.png`), fullPage: true });
  };
  await page.reload();
  for (const width of [1440, 1024, 768, 390, 320]) await audit('draft', width);
  await page.getByRole('button', { name: 'Activate Client', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Client activated. The portal invitation has been sent.').waitFor();
  await page.reload();
  check(
    'success persists after reload',
    await page.getByText('Client activated. The portal invitation has been sent.').isVisible(),
  );
  for (const width of [1440, 1024, 768, 390, 320]) await audit('sent', width);
  // An unrelated pending invitation provides a real, recoverable delivery
  // conflict, without mocking the activation response or changing its state.
  const retryEmail = `a9-browser-retry-${suffix}@example.com`;
  const retryClient = await api('/api/bloomops/clients', {
    name: 'Browser Retry',
    contactName: 'Jamie Retry',
    contactEmail: retryEmail,
  });
  const retryId = retryClient.clientId || retryClient.client?.id;
  await api(`/api/bloomops/clients/${retryId}/services`, { serviceTypeId: type });
  const unrelated = await api('/api/bloomops/invitations', { email: retryEmail, role: 'team_member' });
  await page.goto(`${base}/clients/${retryId}`);
  await page.getByRole('button', { name: 'Activate Client', exact: true }).click();
  await page
    .getByText('Client activated. The invitation could not be sent. You can retry it safely.')
    .waitFor();
  await page.reload();
  for (const width of [1440, 1024, 768, 390, 320]) await audit('retry', width);
  await api(`/api/bloomops/invitations/${unrelated.invitation.id}/revoke`, {});
  await page.getByRole('button', { name: 'Retry invitation', exact: true }).click();
  await page.getByText('Client activated. The portal invitation has been sent.').waitFor();
  check('retry button reaches confirmed delivery', true);
  await context.close();
  console.log(`A9 browser review: ${checks} checks passed; screenshots ${out}`);
} finally {
  await browser.close();
}
