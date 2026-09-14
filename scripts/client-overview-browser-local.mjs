// N2A acceptance on an isolated built Worker seeded by client-overview-fixture-local.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.BLOOMOPS_BROWSER_BASE;
const out = process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR;
assert.ok(base && out && ['localhost','127.0.0.1'].includes(new URL(base).hostname));
const health = await (await fetch(base + '/api/health')).json();
assert.equal(health.environment, 'development'); assert.equal(health.auth.mail, 'r2-dev');
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE || '/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const checks = [], errors = [], pages = [];
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('ok ' + name); };
const cli = args => execFileSync('npx', ['--no-install','wrangler',...args], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const sql = command => cli(['d1','execute','DB','--local','--command',command]);
const login = async email => {
  const ctx = await browser.newContext({ viewport:{width:1440,height:1000} });
  await ctx.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const response = await ctx.request.post(base + '/api/auth/sign-in/magic-link', { headers:{origin:base},data:{email,callbackURL:'/clients/james'} });
  assert.equal(response.status(),200);
  const mail = cli(['r2','object','get',`bloomops-files-dev/dev-mail/${createHash('sha256').update(email).digest('hex')}.json`,'--local','--pipe']);
  const url = JSON.parse(mail.slice(mail.indexOf('{'))).text.match(/https?:\/\/\S+/)[0];
  assert.ok(url.startsWith(base + '/api/auth/magic-link/verify?'));
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, {waitUntil:'networkidle'}); pages.push(page);
  return {ctx,page};
};
try {
  const owner = await login('ellen@example.com'), {page,ctx} = owner;
  await page.locator('[data-client-overview]').waitFor();
  check('canonical client overview loads', await page.getByRole('heading',{name:'Garden House Studio',exact:true}).count() === 1);
  const body = await page.locator('main').innerText();
  check('services, work, deadlines and requests precede administrative details', body.indexOf('Purchased services') < body.indexOf('Details') && body.indexOf('Open requests') < body.indexOf('Details'));
  check('multiple service engagements retain independent statuses', body.includes('Monthly content') && body.includes('Website and CRM setup') && body.includes('Active') && body.includes('Onboarding'));
  check('verification and client requests are distinct', body.includes('Needs verification') && body.includes('Client action') && body.includes('1 of 3 required steps satisfied'));
  check('upcoming and overdue work are separate', body.includes('Past due') && body.includes('Website ready for client review'));
  const stream = await (await ctx.request.get(base + '/clients/james')).text();
  check('server streaming includes an honest loading fallback', stream.includes('Loading client overview'));
  for (const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    const layout = await page.locator('[data-client-overview]').evaluate(root => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      invalid:[...root.querySelectorAll('a')].filter(e => {const r=e.getBoundingClientRect();return r.width < 24 || r.height < (innerWidth <= 767 ? 44 : 32) || r.left < 0 || r.right > innerWidth + 1;}).map(e=>e.textContent),
      titleCount:document.querySelectorAll('h1').length
    }));
    if (layout.overflow || layout.invalid.length || layout.titleCount!==1) console.log(JSON.stringify(layout));
    await page.screenshot({path:out+'/overview-'+width+'.png',fullPage:true});
    check('readable layout and touch targets at '+width, !layout.overflow && !layout.invalid.length && layout.titleCount===1);
    await page.screenshot({path:out+'/overview-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  const task = page.locator('[data-client-overview]').getByRole('link',{name:'Review the homepage copy',exact:true}).first();
  await task.focus();
  check('keyboard navigation has a visible focus outline', await task.evaluate(e=>getComputedStyle(e).outlineStyle !== 'none'));
  await task.press('Enter'); await page.waitForURL('**/work/actions/copy');
  check('task opens its canonical full page', await page.getByRole('heading',{name:'Review the homepage copy',exact:true}).count()===1);
  await page.goto(base+'/clients/james',{waitUntil:'networkidle'});
  // Follow the specific milestone deadline (the owner can also see a restricted
  // project with the same date; stable tie order makes milestone precede project).
  await page.locator('[data-client-overview] a[href$="#milestone-launch"]').click();
  await page.waitForURL(url => url.hash === '#milestone-launch');
  check('milestone destination has a real anchor', await page.locator('#milestone-launch').count()===1);
  await page.goto(base+'/clients/james',{waitUntil:'networkidle'});
  await page.getByRole('link',{name:'All projects',exact:true}).click();
  check('All projects stays scoped despite another readable client', new URL(page.url()).pathname==='/clients/james' && new URL(page.url()).searchParams.get('tab')==='projects' && (await page.locator('main').innerText()).includes('Autumn website launch') && !(await page.locator('main').innerText()).includes('Other client project'));
  await page.goto(base+'/clients/james',{waitUntil:'networkidle'});
  await page.getByRole('link',{name:'All services',exact:true}).click();
  check('services navigation stays on this client', new URL(page.url()).searchParams.get('tab')==='services' && (await page.locator('main').innerText()).includes('Monthly content'));
  await page.goto(base+'/clients/james',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Edit details',exact:true}).click();
  const website = 'https://example.test/n2-'+Date.now();
  await page.locator('#edit-website').fill(website);
  await page.getByRole('button',{name:'Save changes',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});
  check('existing detail editing persists after reload', await page.locator('a[href="'+website+'"]').count()===1);
  await page.getByRole('button',{name:'Edit james',exact:true}).click(); await page.getByLabel('Name',{exact:true}).fill('James Garden');
  await page.getByRole('dialog').getByRole('button',{name:'Save contact',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});
  check('contact editing remains available', (await page.locator('main').innerText()).includes('James Garden'));
  const sam = await login('sam@example.com');
  const samText = await sam.page.locator('main').innerText();
  check('assigned Team Member sees work but no restricted project or management controls', samText.includes('Autumn website launch') && !samText.includes('PRIVATE restricted') && !samText.includes('Edit details'));
  sql("DELETE FROM client_assignments WHERE membership_id='m-sam'");
  await sam.page.reload({waitUntil:'networkidle'});
  check('removing an assignment revokes the overview on the next request', await sam.page.locator('[data-client-overview]').count()===0 && !(await sam.page.locator('main').innerText()).includes('Garden House Studio'));
  const foreign = await ctx.request.get(base+'/clients/foreign-client'), missing = await ctx.request.get(base+'/clients/missing');
  check('foreign and missing clients have equal unavailable responses', foreign.status()===404 && missing.status()===404);
  const client = await login('james@example.com');
  check('Client accounts stay on the portal', new URL(client.page.url()).pathname.startsWith('/portal') && await client.page.locator('[data-client-overview]').count()===0);
  await page.goto(base+'/clients/lawrence',{waitUntil:'networkidle'});
  check('empty overview describes absent work and onboarding without claiming completion', (await page.locator('main').innerText()).includes('Onboarding has not been created yet') && (await page.locator('main').innerText()).includes('No upcoming deadline available to you'));
  await page.screenshot({path:out+'/overview-empty.png',fullPage:true});
  await page.goto(base+'/clients/james',{waitUntil:'networkidle'});
  writeFileSync(out+'/storage-state.json',JSON.stringify(await ctx.storageState()),{mode:0o600});
  check('no browser runtime errors', errors.length===0);
  writeFileSync(out+'/browser-results.json',JSON.stringify({checks,errors},null,2));
  console.log(checks.length+' checks passed');
} catch(error) { console.error(String(error.message).replace(/token=[^&\s"']+/g, 'token=[redacted]')); process.exitCode=1; } finally {
  sql("UPDATE client_contacts SET name='james' WHERE workspace_id='a' AND id='c-james'; INSERT OR IGNORE INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam');");
  await browser.close();
}
