#!/usr/bin/env node
// Built-Worker HTTP + browser B6 Home/Work acceptance. Loopback and development
// R2 mail only. Uses a separate local workspace and example.com identities.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("--url", "http://localhost:8787"),
  out = resolve(arg("--out", "/tmp/bloomops-b6-review"));
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
    const response = await page.goto(url);
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
  const health = await (await fetch(base + '/api/health')).json();
  check('built Worker uses development and local R2 mail', health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
  // Only identity, workspace and catalog fixture setup uses local SQL. Every
  // operational fact below is created by its existing canonical HTTP API.
  const suffix = randomUUID().slice(0,8), ws = `b6-review-${suffix}`, members = {};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Bloom Studio',${lit(ws)})`);
  for (const [name, role] of [['owner','owner'], ['pm','project_manager'], ['sam','team_member'], ['james','client']]) {
    const id = `b6-${name}-${suffix}`, membership = `m-${id}`, email = `${id}@example.com`;
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name==='sam' ? 'Sam Contractor' : name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
    members[name] = { id, membership, email };
  }
  const types = {};
  for (const name of ['Social', 'Systems']) {
    const id = `${ws}-${name.toLowerCase()}`; types[name] = id;
    sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(name.toLowerCase())})`);
    sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(id)},${lit(ws)},${lit(name==='Social'?'Social Media':'GHL Systems')},${lit(name.toLowerCase())},${lit(id)})`);
  }
  const owner = await login(members.owner.email), sam = await login(members.sam.email), pm = await login(members.pm.email);
  check('empty internal Home has one calm state and no empty modules', await owner.page.getByRole('heading', { name:'Nothing needs attention here right now' }).isVisible() && await owner.page.locator('.bo-home section').count()===0);
  for (const width of widths) await layout('home-empty', owner.page, width);
  const clientId = (await api(owner.context, '/api/bloomops/clients', { name:'James · The Garden Studio', contactName:'James', contactEmail:members.james.email, timezone:'Etc/UTC' }, 201)).client.id;
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE workspace_id=${lit(ws)} AND client_id=${lit(clientId)} AND is_primary=1`);
  const services = {};
  for (const name of ['Social','Systems']) services[name] = (await api(owner.context, `/api/bloomops/clients/${clientId}/services`, { serviceTypeId:types[name] }, 201)).service.id;
  const projectNames = ['Website launch', 'September content', 'Welcome email sequence', 'Course delivery', 'Monthly reporting', 'Client onboarding automation'];
  const projects = [];
  for (let i=0;i<projectNames.length;i++) projects.push((await api(owner.context, `/api/bloomops/clients/${clientId}/projects`, {
    name:projectNames[i], clientLabel:`Your ${projectNames[i].toLowerCase()}`, visibility:'client', health:'at_risk', serviceEngagementId:services[i%2?'Social':'Systems'], targetDate:i===0?new Date().toISOString().slice(0,10):null,
  }, 201)).projectId);
  const projectId = projects[0], projectPath = `/api/bloomops/projects/${projectId}`;
  const get = async (path, who=owner) => { const response=await who.context.request.get(base+path); assert.equal(response.status(),200,await response.text()); return response.json(); };
  const patch = async (path, data) => { const response=await owner.context.request.patch(base+path,{headers:{origin:base},data}); assert.equal(response.status(),200,await response.text()); return response.json(); };
  const actionPath = id => `/api/bloomops/actions/${id}`, deliverablePath = id => `${projectPath}/deliverables/${id}`;
  const moveAction = async (id,toStatus,extra={}) => api(owner.context,actionPath(id)+'/transition',{toStatus,expectedRevision:(await get(actionPath(id))).action.revision,...extra});
  const moveDeliverable = async (id,toStatus) => api(owner.context,deliverablePath(id)+'/transition',{toStatus,expectedRevision:(await get(deliverablePath(id))).deliverable.revision});
  const milestoneIds=[];
  for(const [name,visibility] of [['B6_PRIVATE Discovery','client'],['B6_PRIVATE Build','internal'],['B6_RESTRICTED QA','restricted']]) {
    milestoneIds.push((await api(owner.context,projectPath+'/milestones',{name,clientLabel:'Your project stage',visibility,requestId:randomUUID()},201)).milestoneId);
  }
  let milestoneRevision=1;
  for(const toStatus of ['in_progress','completed']) await api(owner.context,`${projectPath}/milestones/${milestoneIds[0]}/transition`,{toStatus,expectedRevision:milestoneRevision++});
  const dates = [-2,0,2].map(offset => { const now=new Date(); now.setUTCDate(now.getUTCDate()+offset); return now.toISOString().slice(0,10); });
  const actionIds=[];
  for(let i=0;i<10;i++) actionIds.push((await api(owner.context,projectPath+'/actions',{
    title: ['Confirm the website copy','Review the landing page','Prepare the launch checklist','Check mobile navigation','Update the contact form','Publish the welcome page','Prepare next week’s handoff','Receive brand assets','Review launch quality','Build the dependent automation'][i],
    requestId:randomUUID(), dueDate:i<5||i===9?dates[0]:i===5?dates[1]:i===6?dates[2]:null,
    assigneeMembershipId:i===0?members.sam.membership:i===5?members.owner.membership:null,
    priority:i===0?'urgent':'normal', milestoneId:milestoneIds[0],
  },201)).actionId);
  await moveAction(actionIds[7],'waiting',{waitingType:'client',waitingReason:'Waiting for the approved brand assets'});
  await moveAction(actionIds[8],'in_progress'); await moveAction(actionIds[8],'review');
  await api(owner.context,actionPath(actionIds[9])+'/dependencies',{dependsOnActionId:actionIds[6],expectedRevision:1});
  const deliverables=[];
  for(let i=0;i<8;i++) {
    const id=(await api(owner.context,projectPath+'/deliverables',{title:`B6_PRIVATE ${['Website handoff','Launch guide','Email sequence','Brand asset pack','Monthly report','Automation handoff','Course welcome page','Delivered setup'][i]}`,clientLabel:`Your ${i===0?'website':'delivery '+(i+1)}`,description:'B6_PRIVATE_QA_DETAILS',visibility:'client',targetDate:dates[2],requestId:randomUUID()},201)).deliverableId;
    deliverables.push(id);
    for(const toStatus of ['in_progress','internal_review',...(i<6?['client_review']:['approved']),...(i===7?['delivered']:[])]) await moveDeliverable(id,toStatus);
  }
  const bytes=Buffer.from('BloomOps B6 handoff: original local file bytes.\n'), fileIds=[];
  for(let i=0;i<7;i++) {
    const metadata={requestId:randomUUID(),filename:`Launch handoff ${i+1}.txt`,mimeType:'text/plain',byteSize:bytes.length,visibility:'client',deliverableId:deliverables[0]};
    const response=await owner.context.request.post(base+projectPath+'/files',{headers:{origin:base,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify(metadata))},data:bytes});
    assert.equal(response.status(),201,await response.text()); fileIds.push((await response.json()).fileId);
  }
  // A second delivered output follows uploads so both kinds appear among six.
  await moveDeliverable(deliverables[6],'delivered');
  const client=await login(members.james.email,'/portal');
  const snapshot = () => {
    const command=['projects','milestones','actions','action_dependencies','deliverables','assets','asset_links','asset_upload_attempts','activity_events','bloomops_clients','service_engagements','onboarding_instances','onboarding_items'].map(table=>`SELECT * FROM ${table} WHERE workspace_id=${lit(ws)} ORDER BY rowid`).join(';');
    const raw=wrangler(['d1','execute','DB','--local','--json','--command',command]);
    return JSON.stringify(JSON.parse(raw.slice(raw.indexOf('['))).map(result=>result.results));
  };
  const before=snapshot(), pageErrors=[];
  for(const who of [owner,pm,sam,client]) who.page.on('pageerror',error=>pageErrors.push(error.message));
  for(const path of ['/','/work?tab=projects','/work?view=all']) {
    const response=await owner.context.request.get(base+path);
    check(`${path} is a fresh uncached protected server read`,response.status()===200 && noStore(response));
  }
  await owner.page.goto(base+'/');
  check('Home is useful and bounded across all seven operational sections', await owner.page.locator('[aria-labelledby="home-overdue-title"] [data-action-id]').count()===4 && await owner.page.locator('[aria-labelledby="home-today-title"] [data-action-id]').count()===1 && await owner.page.locator('[aria-labelledby="home-waiting-title"] [data-action-id]').count()===1 && await owner.page.locator('[aria-labelledby="home-review-title"] [data-action-id]').count()===1 && await owner.page.locator('[aria-labelledby="home-projects-title"] [data-project-id]').count()===5 && await owner.page.locator('[aria-labelledby="home-deliverables-title"] [data-deliverable-id]').count()===6 && await owner.page.locator('[aria-labelledby="home-recent-title"] [data-output-id]').count()===6);
  check('Home distinguishes Delivered outputs from Ready File uploads', await owner.page.locator('[aria-labelledby="home-recent-title"]').getByText('File uploaded',{exact:true}).count()===5 && await owner.page.locator('[aria-labelledby="home-recent-title"]').getByText('Deliverable delivered',{exact:true}).count()===1);
  check('Home summaries contain navigation and no management controls', await owner.page.locator('.bo-home button,.bo-home input,.bo-home select').count()===0);
  for(const width of widths) await layout('home-coordinator',owner.page,width);
  // Exercise actual tab order and visible focus, then activate a canonical link.
  await owner.page.setViewportSize({width:1440,height:900}); await owner.page.reload();
  await owner.page.keyboard.press('Tab');
  check('keyboard starts at the visible skip link', await owner.page.getByRole('link',{name:/Skip to/}).evaluate(n=>n===document.activeElement && getComputedStyle(n).visibility==='visible'));
  await owner.page.keyboard.press('Enter');
  check('skip link moves keyboard focus into main content', await owner.page.locator('main').evaluate(n=>n===document.activeElement || n.contains(document.activeElement)));
  const overdueLink=owner.page.getByRole('link',{name:'View overdue Actions',exact:true}); await overdueLink.focus();
  await owner.page.keyboard.press('Tab'); await owner.page.keyboard.press('Shift+Tab');
  check('dashboard link has a visible keyboard focus treatment', await overdueLink.evaluate(n=>n.matches(':focus-visible') && (getComputedStyle(n).outlineStyle!=='none' || getComputedStyle(n).boxShadow!=='none')));
  await owner.page.keyboard.press('Enter'); await owner.page.waitForURL(/view=overdue/);
  check('keyboard opens canonical Work with all five overdue Actions and excludes dependency blocking', await owner.page.locator('[data-action-id]').count()===5 && await owner.page.locator(`[data-action-id="${actionIds[9]}"]`).count()===0);
  for(const view of ['mine','today','upcoming','waiting','review','overdue','all']) {
    const query=new URLSearchParams({view,projectId});
    const canonical=(await get('/api/bloomops/actions?'+query)).items;
    await owner.page.goto(base+'/work?'+query);
    check(`${view} Work HTML exactly matches the canonical Action API`, JSON.stringify(await owner.page.locator('[data-action-id]').evaluateAll(rows=>rows.map(n=>n.dataset.actionId)))===JSON.stringify(canonical.map(row=>row.id)));
  }
  for(const width of widths) await layout('work-actions',owner.page,width);
  await keyboardActivate(owner.page,owner.page.locator('.bo-action-filter-panel > summary'));
  for(const label of ['Client','Department','Service','Project','Assignee','Status','Priority']) check(`${label} Action filter remains labelled`,await owner.page.getByLabel(label,{exact:true}).count()===1);
  for(const width of widths) await layout('work-filters',owner.page,width);
  await owner.page.getByLabel('Assignee',{exact:true}).selectOption(members.sam.membership); await owner.page.getByLabel('Priority',{exact:true}).selectOption('urgent');
  await owner.page.getByRole('button',{name:'Apply filters',exact:true}).click(); await owner.page.waitForURL(/assigneeMembershipId=/);
  check('combined filters narrow the canonical view',await owner.page.locator('[data-action-id]').count()===1 && await owner.page.locator(`[data-action-id="${actionIds[0]}"]`).count()===1);
  await owner.page.goto(base+'/work?tab=projects');
  const summary=owner.page.getByRole('list',{name:'Summary for Website launch',exact:true});
  check('Work summary matches canonical Milestones, open Actions, Deliverables and Ready Files', (await summary.innerText()).includes('1 of 3 milestones finished · 33%') && (await summary.innerText()).includes('10 open Actions') && (await summary.innerText()).includes('8 Deliverables') && (await summary.innerText()).includes('7 Ready files'));
  check('one Client retains both independent Service contexts', (await owner.page.locator('main').innerText()).includes('Social Media') && (await owner.page.locator('main').innerText()).includes('GHL Systems'));
  for(const width of widths) await layout('work-projects',owner.page,width);
  await keyboardActivate(owner.page,summary.getByRole('link',{name:'7 Ready files',exact:true})); await owner.page.waitForURL(/#project-files-title$/);
  check('Project summary opens the canonical Files heading below the mobile header',await owner.page.locator('#project-files-title').evaluate(n=>{const r=n.getBoundingClientRect(),bar=document.querySelector('.bo-topbar-internal'),ceiling=bar?.checkVisibility()?bar.getBoundingClientRect().bottom:0;return r.top>=ceiling && r.top<innerHeight && location.hash==='#project-files-title';}));
  await sam.page.goto(base+'/');
  check('Action-only Team Home contains its Action and no parent or output sections',await sam.page.locator('[data-action-id]').count()===1 && await sam.page.locator('[aria-labelledby="home-projects-title"],[aria-labelledby="home-deliverables-title"],[aria-labelledby="home-recent-title"]').count()===0 && await sam.page.locator('.bo-home a[href^="/work/projects/"]').count()===0);
  for(const width of widths) await layout('home-action-only',sam.page,width);
  check('Action-only guessed Project/File routes remain denied',(await sam.context.request.get(base+projectPath)).status()===404 && (await sam.context.request.get(base+`/api/bloomops/files/${fileIds[0]}`)).status()===404);
  check('initial Home and Work reads preserve every canonical fact and event',snapshot()===before);
  await api(owner.context,projectPath+'/assignments',{membershipId:members.sam.membership}); await sam.page.reload();
  check('explicit Project assignment adds exactly its summaries and current outputs',await sam.page.locator('[aria-labelledby="home-projects-title"] [data-project-id]').count()===1 && await sam.page.locator(`[aria-labelledby="home-projects-title"] [data-project-id="${projectId}"]`).count()===1 && await sam.page.locator('[aria-labelledby="home-recent-title"] [data-output-id]').count()===6);
  for(const width of widths) await layout('home-project-team',sam.page,width);
  await pm.page.goto(base+'/work?tab=projects');
  check('PM visible Milestone percentage excludes a restricted sibling', (await pm.page.getByRole('list',{name:'Summary for Website launch',exact:true}).innerText()).includes('1 of 2 milestones finished · 50%'));
  const deliveredId=deliverables[6], secretTitle=(await get(deliverablePath(deliveredId))).deliverable.title;
  await patch(deliverablePath(deliveredId),{visibility:'restricted',expectedRevision:(await get(deliverablePath(deliveredId))).deliverable.revision});
  const fileId=fileIds[6];
  await patch(`/api/bloomops/files/${fileId}`,{operation:'visibility',visibility:'restricted',expectedRevision:(await get(`/api/bloomops/files/${fileId}`)).file.revision});
  await pm.page.goto(base+'/');
  check('restriction removes current and historical output names from PM Home',!(await pm.page.content()).includes(secretTitle) && !(await pm.page.content()).includes('Launch handoff 7.txt'));
  for(const width of widths) await layout('home-pm-visible',pm.page,width);
  // Read preservation is checked before and after each authorized mutation,
  // so a legitimate visibility/assignment change cannot mask a read write.
  const afterMutations=snapshot();
  for(const who of [owner,pm,sam,client]) { await who.page.reload(); if(who!==client) await who.context.request.get(base+'/work?tab=projects'); }
  check('Home, Work and portal reads preserve every canonical row and history event',snapshot()===afterMutations);
  const portalPath=`/api/bloomops/portal/projects/${projectId}`, portalFiles=await get(portalPath+'/files',client), portalDeliverables=await get(portalPath+'/deliverables',client);
  check('portal File DTO stays exactly six safe fields',portalFiles.items.length===6 && portalFiles.items.every(row=>Object.keys(row).sort().join(',')==='attachmentLabel,byteSize,filename,id,mimeType,readyAt'));
  check('portal Deliverable DTO stays exactly five safe fields',portalDeliverables.items.length===7 && portalDeliverables.items.every(row=>Object.keys(row).sort().join(',')==='deliveredAt,id,label,statusLabel,targetDate'));
  check('Client HTML omits internal Actions, titles, QA, contractor and storage fields',!/B6_PRIVATE|B6_RESTRICTED|Sam Contractor|Confirm the website copy|sha256|objectKey|bloomops-files\//.test(await client.page.content()));
  for(const width of widths) await layout('portal-safe',client.page,width);
  check('Client cannot request internal Actions or activity',(await client.context.request.get(base+'/api/bloomops/actions')).status()===403 && (await client.context.request.get(base+projectPath+'/activity')).status()===404);
  const downloaded=await client.context.request.get(base+`/api/bloomops/files/${fileIds[0]}/download`);
  check('canonical authenticated File download still returns original bytes',downloaded.status()===200 && noStore(downloaded) && (await downloaded.body()).equals(bytes));
  sql(`DELETE FROM project_assignments WHERE workspace_id=${lit(ws)} AND membership_id=${lit(members.sam.membership)}`);
  await sam.page.goto(base+'/');
  check('issued Team session loses rows, counts and recent names immediately on unassignment',await sam.page.locator('[data-action-id]').count()===1 && await sam.page.locator('[aria-labelledby="home-projects-title"],[aria-labelledby="home-deliverables-title"],[aria-labelledby="home-recent-title"]').count()===0 && !(await sam.page.content()).includes('Launch handoff'));
  sql(`UPDATE actions SET assignee_membership_id=NULL WHERE id=${lit(actionIds[0])} AND workspace_id=${lit(ws)}`);
  await sam.page.reload(); check('removing its final Action assignment restores the honest empty Home',await sam.page.getByRole('heading',{name:'Nothing needs attention here right now'}).isVisible());
  sql(`UPDATE client_contacts SET user_id=NULL WHERE workspace_id=${lit(ws)} AND client_id=${lit(clientId)}`); await client.page.reload();
  check('issued Client contact unlink removes portal output and byte access',await client.page.getByRole('list',{name:'Shared files',exact:true}).count()===0 && (await client.context.request.get(base+portalPath+'/files')).status()===404 && (await client.context.request.get(base+`/api/bloomops/files/${fileIds[0]}/download`)).status()===404);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.sam.membership)}`); await sam.page.goto(base+'/');
  check('suspension revokes the existing identity session at Home and Work',!(await sam.page.content()).includes('Confirm the website copy') && !(await sam.context.request.get(base+'/work?tab=projects')).url().endsWith('/work?tab=projects') && (await sam.context.request.get(base+'/api/bloomops/actions')).status()===403);
  const unhydrated=await browser.newContext({javaScriptEnabled:false,storageState:await owner.context.storageState()}), plain=await unhydrated.newPage(); await plain.goto(base+'/');
  check('Home has useful server-rendered navigation without JavaScript',await plain.locator('[aria-labelledby="home-overdue-title"] [data-action-id]').count()===4 && await plain.getByRole('link',{name:'View overdue Actions',exact:true}).isVisible()); await unhydrated.close();
  await owner.page.goto(base+'/'); await owner.page.emulateMedia({reducedMotion:'reduce'}); await layout('home-reduced-motion',owner.page,320);
  check('reduced motion disables dashboard button transitions',await owner.page.locator('.bo-home .bo-btn').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}), touchPage=await touch.newPage(); await touchPage.goto(base+'/');
  await touchPage.getByRole('link',{name:'View Projects',exact:true}).tap(); await touchPage.waitForURL(/tab=projects/); check('touch navigation opens canonical Projects',await touchPage.getByRole('heading',{name:'Projects',exact:true}).isVisible()); await layout('work-touch',touchPage,390); await touch.close();
  check('no browser hydration or runtime errors',pageErrors.length===0);
  console.log(`B6 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px.`);
} catch(error) {
  console.error('B6 browser acceptance failed:',String(error?.message || error).split('\n').filter(line=>!/cookie:|authorization:|token=/i.test(line)).join('\n')); process.exitCode=1;
} finally { await browser.close(); }
