#!/usr/bin/env node
// D1 Systems acceptance against the actual built Worker. Loopback and development
// R2 mail only. Uses a separate local workspace and example.com identities.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("--url", "http://localhost:8787"),
  out = resolve(arg("--out", "/tmp/bloomops-d1-review"));
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const require = createRequire(
  join(
    resolve(arg("--playwright", "/tmp/bloomops-a11-browser")),
    "package.json",
  ),
);
const { chromium } = require("playwright");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
let checks = 0,
  screenshots = 0;
const widths = [1440, 1024, 768, 390, 320];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks++;
  console.log(`ok   ${name}`);
};
const noStore = response => /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers()['cache-control'] || '');
const wrangler = (args, { retrySafe = false } = {}) => {
  const command = args[args.indexOf("--command") + 1] || "";
  const readOnly =
    args.includes("--command") && /^\s*(SELECT|PRAGMA)\b/i.test(command);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync("npx", ["--no-install", "wrangler", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // A standalone local Wrangler connection can briefly collide with the
      // live Worker. Replay only reads or explicitly idempotent fixture writes;
      // application mutations and uncertain failures are never retried here.
      if (
        (!readOnly && !retrySafe) ||
        attempt === 2 ||
        !/SQLITE_BUSY|database is locked/.test(String(error.stderr))
      )
        throw error;
    }
  }
};
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sql = (command, options) => {
  const text = wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--json",
    "--command",
    command,
  ], options);
  return JSON.parse(text.slice(text.indexOf("[")))[0].results;
};
const mail = (email) => {
  const key = createHash("sha256").update(email).digest("hex");
  const raw = wrangler([
    "r2",
    "object",
    "get",
    `bloomops-files-dev/dev-mail/${key}.json`,
    "--local",
    "--pipe",
  ]);
  return JSON.parse(raw.slice(raw.indexOf("{")));
};
const api = async (context, path, data, expected = 200) => {
  const response = await context.request.post(base + path, {
    headers: { origin: base },
    data,
  });
  assert.equal(response.status(), expected, await response.text());
  return response.json();
};
const login = async (email, next = "/") => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await context.request.post(base + '/api/auth/sign-in/magic-link', {
      headers: { origin: base }, data: { email, callbackURL: next, newUserCallbackURL: next, errorCallbackURL: '/sign-in' },
    });
    if (response.status() !== 429 || attempt === 5) { assert.equal(response.status(), 200); break; }
    console.log('Local sign-in rate limit reached; waiting 15 seconds.');
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  const url = mail(email).text.match(/https?:\/\/\S+/)[0];
  assert.ok(url.startsWith(base + "/api/auth/magic-link/verify?"));
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await page.goto(url, {waitUntil:'networkidle'});
    if (response?.status() !== 429 || attempt === 5) { assert.ok(response?.ok(), 'magic link reaches the authenticated page'); break; }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  return { context, page };
};
const keyboardActivate = async (page, control) => {
  await control.waitFor({ state: 'visible' });
  await page.waitForFunction(element => element.isConnected && !element.disabled, await control.elementHandle());
  await control.focus();
  await page.keyboard.press('Enter');
};
const layout = async (label, page, width) => {
  await page.setViewportSize({ width, height: 900 });
  if (await page.getByRole('dialog').count() === 0) await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await page.evaluate(() => document.fonts.ready);
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    overflowingRows: [...document.querySelectorAll('.bo-action-row, .bo-home-projects > li, .bo-home-outputs > li, .bo-work-summary, .bo-project-row')]
      .map(row => ({ width: row.clientWidth, content: row.scrollWidth })).filter(row => row.content > row.width) }));
  if (bounds.document > bounds.viewport || bounds.overflowingRows.length) console.error('Overflow diagnostic:', JSON.stringify(bounds));
  check(`${label} ${width}px fits the viewport and operational rows`, bounds.document <= bounds.viewport && bounds.overflowingRows.length === 0);
  const geometry = await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length,
    invalidControls: [...document.querySelectorAll('button,input,textarea,select')].filter(n => n.checkVisibility()).map(n => {
      const r = n.getBoundingClientRect();
      return { label: n.getAttribute('aria-label') || n.id || n.textContent, x: r.x, right: r.right, width: r.width, height: r.height };
    }).filter(r => !(r.width > 0 && r.x >= 0 && r.right <= innerWidth && (innerWidth > 390 || r.height >= 44))) }));
  if (geometry.headings !== 1 || geometry.invalidControls.length) console.error('Layout diagnostic:', JSON.stringify(geometry));
  check(`${label} ${width}px heading and controls are readable`, geometry.headings === 1 && geometry.invalidControls.length === 0);
  await page.screenshot({
    path: join(out, `${label}-${width}.png`),
    fullPage: await page.getByRole('dialog').count() === 0,
    animations: 'disabled',
  });
  screenshots++;
};
try {
  const health=await(await fetch(base+'/api/health')).json();
  check('development Worker with local mail only',health.environment==='development'&&health.auth.mail==='r2-dev'&&health.auth.configured);
  const reference=await browser.newPage({viewport:{width:1440,height:900}});
  const referenceResponse=await reference.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design', {waitUntil:'networkidle'});
  check('live Bloom design reference loads',referenceResponse.status()===200);
  await reference.screenshot({path:join(out,'design-reference.png'),fullPage:true}); screenshots++; await reference.close();
  const suffix=randomUUID().slice(0,8),ws=`d1-review-${suffix}`,members={};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Bloom Studio',${lit(ws)})`);
  for(const [name,role] of [['owner','owner'],['pm','project_manager'],['team','team_member'],['client','client']]) {
    const id=`${ws}-${name}`,membership=`m-${id}`,email=`${id}@example.com`; members[name]={id,membership,email};
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
  }
  const types={};
  for(const [key,department,name] of [['build','systems','Website delivery'],['course','systems','Learning delivery'],['social','social','Social media']]) {
    const dept=`${ws}-${department}`,id=`${ws}-${key}`; types[key]=id;
    sql(`INSERT OR IGNORE INTO departments(id,workspace_id,name,slug) VALUES(${lit(dept)},${lit(ws)},${lit(department)},${lit(department)})`);
    sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(key)},${lit(dept)})`);
  }
  const owner=await login(members.owner.email,'/systems'),team=await login(members.team.email,'/systems'),pm=await login(members.pm.email,'/systems');
  const errors=[]; for(const who of [owner,team,pm])who.page.on('pageerror',e=>errors.push(e.message));
  await owner.page.goto(base+'/systems', {waitUntil:'networkidle'});
  check('empty Systems is a real work destination',await owner.page.getByRole('heading',{name:'No Systems projects in this view'}).isVisible());
  for(const width of widths)await layout('systems-empty',owner.page,width);
  const clients=[];
  for(const name of ['James · Garden Studio','Lawrence · Learning Studio'])clients.push((await api(owner.context,'/api/bloomops/clients',{name,contactName:name,contactEmail:members.client.email,timezone:'Etc/UTC'},201)).client.id);
  sql(`UPDATE client_contacts SET user_id=${lit(members.client.id)} WHERE workspace_id=${lit(ws)} AND client_id=${lit(clients[0])}`);
  const services={};
  for(const [type,client] of [['build',clients[0]],['social',clients[0]],['course',clients[1]]])services[type]=(await api(owner.context,`/api/bloomops/clients/${client}/services`,{serviceTypeId:types[type]},201)).service.id;
  const projects={};
  const longName='A considered website launch · '+ 'A'.repeat(80);
  for(const [key,client,name,service,visibility] of [['build',clients[0],longName,services.build,'client'],['social',clients[0],'NOT_SYSTEMS_GHL_KAJABI',services.social,'internal'],['course',clients[1],'Course welcome and checkout',services.course,'client'],['unlinked',clients[0],'UNLINKED_SYSTEMS_PROJECT',null,'internal'],['secret',clients[1],'RESTRICTED_PROJECT_SECRET',services.course,'restricted']]) {
    projects[key]=(await api(owner.context,`/api/bloomops/clients/${client}/projects`,{name,serviceEngagementId:service,visibility,clientLabel:key==='build'?'Your website':null},201)).projectId;
  }
  const projectPath=`/api/bloomops/projects/${projects.build}`;
  const get=async path=>{const r=await owner.context.request.get(base+path);assert.equal(r.status(),200);return r.json();};
  const milestone=(await api(owner.context,projectPath+'/milestones',{name:'Build foundations',visibility:'client',requestId:randomUUID()},201)).milestoneId;
  await api(owner.context,projectPath+`/milestones/${milestone}/transition`,{toStatus:'in_progress',expectedRevision:1});
  await api(owner.context,projectPath+`/milestones/${milestone}/transition`,{toStatus:'completed',expectedRevision:2});
  const action=(await api(owner.context,projectPath+'/actions',{title:'Confirm the access invitation',assigneeMembershipId:members.team.membership,requestId:randomUUID()},201)).actionId;
  await api(owner.context,`/api/bloomops/actions/${action}/transition`,{toStatus:'waiting',expectedRevision:1,waitingType:'client',waitingReason:'Waiting for the delegated access invitation'});
  const deliverable=(await api(owner.context,projectPath+'/deliverables',{title:'Website handoff and welcome guide',clientLabel:'Your welcome guide',visibility:'client',requestId:randomUUID()},201)).deliverableId;
  let revision=1;
  for(const toStatus of ['in_progress','internal_review','client_review'])await api(owner.context,projectPath+`/deliverables/${deliverable}/transition`,{toStatus,expectedRevision:revision++});
  const bytes=Buffer.from('Synthetic Systems handoff.\n');
  const metadata={requestId:randomUUID(),filename:'Systems handoff.txt',mimeType:'text/plain',byteSize:bytes.length,visibility:'client',deliverableId:deliverable};
  const upload=await owner.context.request.post(base+projectPath+'/files',{headers:{origin:base,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify(metadata))},data:bytes});
  assert.equal(upload.status(),201,await upload.text());
  const client=await login(members.client.email,'/portal');
  await owner.page.goto(base+'/systems', {waitUntil:'networkidle'});
  check('Systems lists relational projects and omits free-text impostors',await owner.page.locator('[data-project-id]').count()===3&&!/NOT_SYSTEMS_GHL_KAJABI|UNLINKED_SYSTEMS_PROJECT/.test(await owner.page.locator('main').innerText()));
  check('Systems HTTP is protected and uncached',noStore(await owner.context.request.get(base+'/systems')));
  const summary=owner.page.getByRole('list',{name:`Summary for ${longName}`,exact:true});
  check('canonical summary presents progress, waiting Action, review Deliverable and ready File',/1 of 1 milestones finished · 100%/.test(await summary.innerText())&&/1 open Action/.test(await summary.innerText())&&/1 waiting/.test(await summary.innerText())&&/1 in Client Review/.test(await summary.innerText())&&/1 Ready file/.test(await summary.innerText()));
  check('forward Deliverable links to canonical Project delivery',await owner.page.locator(`[data-deliverable-id="${deliverable}"] a`).getAttribute('href')===`/work/projects/${projects.build}#project-deliverables-title`);
  for(const width of widths)await layout('systems-populated-long-name',owner.page,width);
  await owner.page.setViewportSize({width:1440,height:900}); await owner.page.reload({waitUntil:'networkidle'});
  await owner.page.keyboard.press('Tab'); await owner.page.keyboard.press('Enter');
  check('skip navigation reaches main content',await owner.page.locator('main').evaluate(n=>n===document.activeElement||n.contains(document.activeElement)));
  const filter=owner.page.getByLabel('Client',{exact:true});await filter.focus();await owner.page.keyboard.press('Tab');await owner.page.keyboard.press('Shift+Tab');
  check('filter has visible keyboard focus',await filter.evaluate(n=>n.matches(':focus-visible')&&getComputedStyle(n).outlineStyle!=='none'));
  await filter.selectOption(clients[0]); await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Apply filters',exact:true}));await owner.page.waitForURL(/clientId=/);await owner.page.waitForLoadState('networkidle');
  check('Client filter narrows Projects and Service choices',await owner.page.locator('[data-project-id]').count()===1&&await owner.page.locator('#systems-service option').count()===2);
  await owner.page.getByLabel('Service',{exact:true}).selectOption(services.build);await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Apply filters',exact:true}));await owner.page.waitForURL(new RegExp('serviceEngagementId='+services.build));await owner.page.waitForLoadState('networkidle');
  check('combined Client/Service filter retains exact Project',await owner.page.locator(`[data-project-id="${projects.build}"]`).count()===1);
  await owner.page.getByLabel('Project status').selectOption('review');await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Apply filters',exact:true}));await owner.page.waitForURL(/status=review/);await owner.page.waitForLoadState('networkidle');
  check('status filters both Projects and Deliverables',await owner.page.locator('[data-project-id],[data-deliverable-id]').count()===0);
  await owner.page.goto(base+'/systems?status=forged', {waitUntil:'networkidle'});
  check('invalid filters retain heading, announced error and no data',await owner.page.getByRole('heading',{name:'Systems',exact:true}).isVisible()&&await owner.page.locator('main [role="alert"]').count()===1&&await owner.page.locator('[data-project-id]').count()===0);
  for(const width of widths)await layout('systems-invalid-filters',owner.page,width);
  await keyboardActivate(owner.page,owner.page.getByRole('link',{name:'Reset filters',exact:true}));await owner.page.waitForURL(base+'/systems');await owner.page.waitForLoadState('networkidle');
  check('reset recovers populated view',await owner.page.locator('[data-project-id]').count()===3);
  await keyboardActivate(owner.page,owner.page.getByRole('link',{name:'Create project in Work',exact:true}));await owner.page.waitForURL(base+'/work/projects/new');await owner.page.waitForLoadState('networkidle');
  check('creation uses the canonical Work form',await owner.page.locator('main form').count()>0);
  await owner.page.goto(base+'/systems', {waitUntil:'networkidle'});await keyboardActivate(owner.page,owner.page.getByRole('link',{name:'1 waiting',exact:true}));await owner.page.waitForURL(/view=waiting/);await owner.page.waitForLoadState('networkidle');
  check('summary Action link opens canonical filtered Work',await owner.page.locator(`[data-action-id="${action}"]`).count()===1);
  await team.page.goto(base+'/systems', {waitUntil:'networkidle'});
  check('Action-only Team gets empty Systems with no parent or sibling summaries',await team.page.locator('[data-project-id],[data-deliverable-id]').count()===0&&!/Garden Studio|Learning Studio/.test(await team.page.locator('main').innerText()));
  for(const width of widths)await layout('systems-action-only',team.page,width);
  await api(owner.context,projectPath+'/assignments',{membershipId:members.team.membership});await team.page.reload({waitUntil:'networkidle'});
  check('explicit Project assignment grants exactly its Systems tree',await team.page.locator('[data-project-id]').count()===1&&await team.page.locator(`[data-project-id="${projects.build}"]`).count()===1);
  for(const width of widths)await layout('systems-assigned-team',team.page,width);
  await pm.page.goto(base+'/systems', {waitUntil:'networkidle'});
  check('PM restricted Projects never enter rows or HTML',await pm.page.locator('[data-project-id]').count()===2&&!(await pm.page.content()).includes('RESTRICTED_PROJECT_SECRET'));
  const detail=await get(projectPath+`/deliverables/${deliverable}`);
  const restricted=await owner.context.request.patch(base+projectPath+`/deliverables/${deliverable}`,{headers:{origin:base},data:{visibility:'restricted',expectedRevision:detail.deliverable.revision}});assert.equal(restricted.status(),200);
  await pm.page.reload({waitUntil:'networkidle'});
  check('restricting Deliverable removes it and its File from PM summary',await pm.page.locator('[data-deliverable-id]').count()===0&&!(await pm.page.locator('main').innerText()).includes('Ready file')&&!(await pm.page.content()).includes('Website handoff and welcome guide'));
  for(const width of widths)await layout('systems-pm-restricted-child',pm.page,width);
  await client.page.goto(base+'/systems', {waitUntil:'networkidle'});await client.page.waitForURL(/\/portal/);await client.page.waitForLoadState('networkidle');
  check('Client route redirects to portal without Systems navigation or internal work',!(await client.page.content()).includes('Confirm the access invitation')&&await client.page.locator('a[href="/systems"],a[href="/portal/systems"]').count()===0);
  const nojs=await browser.newContext({javaScriptEnabled:false,storageState:await owner.context.storageState()}),plain=await nojs.newPage();await plain.goto(base+'/systems', {waitUntil:'networkidle'});
  // Streamed HTML can contain hidden rows and controls while the user sees
  // only a fallback. Prove completed, visible HTML without hydration, then
  // submit the real GET form instead of navigating to a constructed URL.
  const nojsView=async(label,expectedProjects)=>{
    for(const width of widths){
      await plain.setViewportSize({width,height:900});
      check(`${label} ${width}px completed heading and filters are visible without JavaScript`,
        await plain.locator('h1').count()===1&&await plain.getByRole('heading',{name:'Systems',level:1,exact:true}).isVisible()
        &&(await Promise.all(['Client','Service','Project status'].map(name=>plain.getByLabel(name,{exact:true}).isVisible()))).every(Boolean)
        &&!(await plain.locator('main').innerText()).includes('Loading Systems projects…'));
      check(`${label} ${width}px exact readable Projects are visible without JavaScript`,
        await plain.locator('[data-project-id]').count()===expectedProjects.length
        &&(await Promise.all(expectedProjects.map(id=>plain.locator(`[data-project-id="${id}"]`).isVisible()))).every(Boolean));
      await plain.screenshot({path:join(out,`${label}-${width}.png`),fullPage:true});screenshots++;
    }
  };
  await nojsView('systems-nojs',[projects.build,projects.course,projects.secret]);
  await plain.getByLabel('Client',{exact:true}).selectOption(clients[0]);
  const [filteredResponse]=await Promise.all([
    plain.waitForNavigation({waitUntil:'networkidle'}),
    plain.getByRole('button',{name:'Apply filters',exact:true}).click(),
  ]);
  const filteredURL=new URL(plain.url());
  check('no-JavaScript native filter submits GET and preserves the selected query',filteredResponse?.status()===200
    &&filteredResponse.request().method()==='GET'&&filteredURL.pathname==='/systems'
    &&filteredURL.searchParams.get('clientId')===clients[0]&&filteredURL.searchParams.get('serviceEngagementId')===''
    &&filteredURL.searchParams.get('status')==='active');
  await nojsView('systems-nojs-filtered',[projects.build]);
  check('no-JavaScript filtered result retains Client selection and narrows Service choices',
    await plain.getByLabel('Client',{exact:true}).inputValue()===clients[0]&&await plain.locator('#systems-service option').count()===2);
  await nojs.close();
  // Valid local fixtures pressure the page boundary after the API-created story.
  sql('INSERT INTO projects(id,workspace_id,client_id,service_engagement_id,name) VALUES '+Array.from({length:48},(_,i)=>`(${lit(`${ws}-bound-${i}`)},${lit(ws)},${lit(clients[0])},${lit(services.build)},${lit(`Bounded delivery ${String(i).padStart(2,'0')}`)})`).join(','));
  await owner.page.goto(base+'/systems', {waitUntil:'networkidle'});
  check('50-row bound exposes an accessible next-page link',await owner.page.locator('[data-project-id]').count()===50&&await owner.page.getByRole('link',{name:'Next projects',exact:true}).isVisible());
  await keyboardActivate(owner.page,owner.page.getByRole('link',{name:'Next projects',exact:true}));await owner.page.waitForURL(/page=2/);await owner.page.waitForLoadState('networkidle');
  check('next page preserves filters and has no false overflow',await owner.page.locator('[data-project-id]').count()===1&&await owner.page.getByRole('link',{name:'Next projects',exact:true}).count()===0&&await owner.page.getByRole('link',{name:'Previous projects',exact:true}).isVisible());
  for(const width of widths)await layout('systems-last-page',owner.page,width);
  sql(`DELETE FROM project_assignments WHERE workspace_id=${lit(ws)} AND membership_id=${lit(members.team.membership)}`);await team.page.reload({waitUntil:'networkidle'});
  check('issued Team session loses its Project summaries immediately',await team.page.locator('[data-project-id],[data-deliverable-id]').count()===0);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.team.membership)}`);await team.page.goto(base+'/systems', {waitUntil:'networkidle'});await team.page.waitForURL(/\/sign-in/);await team.page.waitForLoadState('networkidle');
  check('suspension revokes the existing Systems session',!await team.page.getByRole('heading',{name:'Systems',exact:true}).count());
  await owner.page.goto(base+'/systems?clientId='+clients[1], {waitUntil:'networkidle'});await owner.page.emulateMedia({reducedMotion:'reduce'});await layout('systems-reduced-motion',owner.page,320);
  check('reduced motion disables filter button transitions',await owner.page.locator('main .bo-btn').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(base+'/systems', {waitUntil:'networkidle'});
  await touchPage.locator(`[data-project-id="${projects.build}"] > .bo-row-text a`).tap();await touchPage.waitForURL(base+`/work/projects/${projects.build}`);await touchPage.waitForLoadState('networkidle');
  check('touch opens the canonical Project',await touchPage.getByRole('heading',{name:longName,exact:true}).isVisible());await touch.close();
  check('no browser runtime or hydration errors',errors.length===0);
  console.log(`D1 Systems browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px.`);
} catch(error) {
  let index=0;for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:join(out,`failure-${index++}.png`),fullPage:true}).catch(()=>{});
  console.error('D1 Systems browser acceptance failed:',String(error?.message||error).split('\n').filter(line=>!/cookie:|authorization:|token=/i.test(line)).join('\n'));process.exitCode=1;
} finally { await browser.close(); }
