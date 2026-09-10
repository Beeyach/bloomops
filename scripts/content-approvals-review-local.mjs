#!/usr/bin/env node
// Built Worker C5 acceptance; loopback, local D1/R2 mail, example.com only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const base = arg('--url', 'http://localhost:8787'), out = resolve(arg('--out', '/tmp/bloomops-c5-review'));
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-a11-browser')), 'package.json'));
const { chromium } = require('playwright'), browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
mkdirSync(out, { recursive: true });
let checks = 0, screenshots = 0;
const widths = [1440,1024,768,390,320], check = (name, ok) => { assert.ok(ok, name); checks++; console.log(`ok   ${name}`); };
const wrangler = args => execFileSync('npx', ['--no-install','wrangler',...args], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const lit = value => `'${String(value).replace(/'/g,"''")}'`;
const sql = query => { const text = wrangler(['d1','execute','DB','--local','--json','--command',query]); return JSON.parse(text.slice(text.indexOf('[')))[0].results; };
const login = async email => {
  const context = await browser.newContext(), page = await context.newPage();
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await context.request.post(base+'/api/auth/sign-in/magic-link', { headers:{origin:base}, data:{email,callbackURL:'/',newUserCallbackURL:'/',errorCallbackURL:'/sign-in'} });
    if (r.status() !== 429 || attempt === 5) { assert.equal(r.status(),200); break; }
    console.log('Local sign-in limit reached; retrying in 15 seconds.'); await new Promise(resolve=>setTimeout(resolve,15000));
  }
  const key = createHash('sha256').update(email).digest('hex'), raw = wrangler(['r2','object','get',`bloomops-files-dev/dev-mail/${key}.json`,'--local','--pipe']);
  const url = JSON.parse(raw.slice(raw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0]; assert.ok(url.startsWith(base+'/api/auth/magic-link/verify?'));
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await page.goto(url);
    if (r?.status() !== 429 || attempt === 5) { assert.ok(r?.ok()); break; }
    await new Promise(resolve=>setTimeout(resolve,15000));
  }
  return { context, page };
};
const activate = async (page, control) => { await control.waitFor(); await page.waitForFunction(n=>n.isConnected&&!n.disabled,await control.elementHandle()); await control.focus(); await page.keyboard.press('Enter'); };
const layout = async (label,page,width) => {
  await page.setViewportSize({width,height:900});
  if (await page.getByRole('dialog').count() === 0) await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  const result = await page.evaluate(()=>({ width:innerWidth, document:document.documentElement.scrollWidth, headings:document.querySelectorAll('h1').length,
    rows:[...document.querySelectorAll('.bo-file')].filter(n=>n.scrollWidth>n.clientWidth).length,
    bad:[...document.querySelectorAll('button,input,select,textarea')].filter(n=>n.checkVisibility()&&n.type!=='checkbox').map(n=>n.getBoundingClientRect()).filter(r=>r.left<0||r.right>innerWidth||r.width<=0||(innerWidth<=390&&r.height<44)).length }));
  check(`${label} ${width}px: no overflow, readable controls and one heading`,result.document<=result.width&&result.headings===1&&result.rows===0&&result.bad===0);
  await page.screenshot({path:join(out,`${label}-${width}.png`),fullPage:await page.getByRole('dialog').count()===0,animations:'disabled'});screenshots++;
};

try {
  const health=await(await fetch(base+'/api/health')).json();check('development only, configured identity and local R2 mail',health.environment==='development'&&health.auth.mail==='r2-dev'&&health.auth.configured);
  const suffix=randomUUID().slice(0,8),ws=`c5-${suffix}`,members={};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Garden Studio',${lit(ws)})`);
  for(const [name,role] of [['owner','owner'],['pm','project_manager'],['team','team_member'],['client','client'],['other','client']]){
    const id=`${ws}-${name}`,email=`${id}@example.com`,membership=`m-${id}`;members[name]={id,email,membership};
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
  }
  const cl=`${ws}-james`,otherClient=`${ws}-other-client`,dept=`${ws}-social`,service=`${ws}-service`;
  for(const [id,name,user] of [[cl,'James · Garden Studio',members.client.id],[otherClient,'Other Studio',members.other.id]]){
    sql(`INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(id)})`);
    sql(`INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(${lit(ws)},${lit(id)},${lit(name)},${lit(user)})`);
  }
  sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(dept)},${lit(ws)},'Social','social')`);
  sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(dept)},${lit(ws)},'Social','social',${lit(dept)})`);
  sql(`INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(service)},${lit(ws)},${lit(cl)},${lit(dept)})`);
  const owner=await login(members.owner.email),client=await login(members.client.email),pm=await login(members.pm.email),team=await login(members.team.email),other=await login(members.other.email);
  const post=async(path,data,who=owner,expected=200)=>{const r=await who.context.request.post(base+path,{headers:{origin:base},data});assert.equal(r.status(),expected,await r.text());return r.json();};
  const title='A thoughtful garden update · '+ 'seasonal ideas '.repeat(9),script='An opening for a calm and useful garden update.\n'+ 'Explain the simple step, why it matters, and what to try next. '.repeat(55)+'\n<script>Not executable</script>',feedback=('Please make the opening more direct.\n'+ 'Keep the useful example, shorten the introduction, and end with one clear invitation. '.repeat(17)).trim();
  const id=(await post(`/api/bloomops/clients/${cl}/services/${service}/content`,{requestId:randomUUID(),title,type:'reel',visibility:'client',recordingRequired:true,pillar:'C5_PRIVATE_PILLAR',script,caption:'A short seasonal story.',cta:'Save this for the weekend.',platforms:['Instagram','TikTok'],targetPublishDate:'2026-09-22'},owner,201)).contentId;
  const itemPath=`/api/bloomops/content/${id}`,ui=`/social/${id}`,get=async()=>(await(await owner.context.request.get(base+itemPath)).json()).item;
  const rounds=()=>sql(`SELECT * FROM content_approval_rounds WHERE content_id=${lit(id)} ORDER BY number`),revisions=()=>sql(`SELECT * FROM content_review_revisions WHERE content_id=${lit(id)} ORDER BY number`);
  const events=()=>sql(`SELECT * FROM activity_events WHERE subject_type='content' AND subject_id=${lit(id)} ORDER BY rowid`);
  const move=async targetStage=>post(itemPath+'/transition',{targetStage,expectedRevision:(await get()).revision,...targetStage==='waiting_for_recording'?{context:'C5_PRIVATE_WAITING'}:{}});
  for(const stage of ['script','waiting_for_recording'])await move(stage);
  const bytes=Buffer.from('Browser acceptance recording'),fileInput={requestId:randomUUID(),filename:'C5_PRIVATE_RECORDING.mp4',mimeType:'video/mp4',byteSize:bytes.length,purpose:'recording'};
  const upload=await client.context.request.post(base+`/api/bloomops/portal/recordings/${id}/files`,{headers:{origin:base,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify(fileInput))},data:bytes});assert.equal(upload.status(),201);const fileId=(await upload.json()).fileId;
  const fileFacts=()=>JSON.stringify(sql(`SELECT assets.* FROM assets JOIN content_asset_links ON asset_id=assets.id WHERE content_id=${lit(id)}`)),originalFiles=fileFacts();
  for(const stage of ['editing','internal_review','client_review'])await move(stage);
  await owner.page.goto(base+ui);await client.page.goto(base+'/portal');
  check('no empty approval module before an explicit request',await client.page.getByRole('heading',{name:'Approval needed',exact:true}).count()===0);
  for(const width of widths)await layout('before-request',owner.page,width);
  const approvalSection=()=>owner.page.getByRole('region',{name:'Client approval',exact:true});
  await activate(owner.page,approvalSection().getByRole('button',{name:'Request Client approval',exact:true}));let dialog=owner.page.getByRole('dialog');
  await owner.page.waitForFunction(()=>document.activeElement?.id==='approval-confirm');
  for(const width of widths)await layout('request-confirmation',owner.page,width);
  await dialog.getByRole('button',{name:'Request approval',exact:true}).focus();await owner.page.keyboard.press('Tab');check('request dialog traps keyboard focus',await dialog.evaluate(n=>n.contains(document.activeElement)));await owner.page.keyboard.press('Escape');
  check('Escape restores the request opener',await approvalSection().getByRole('button',{name:'Request Client approval',exact:true}).evaluate(n=>n===document.activeElement));
  await activate(owner.page,approvalSection().getByRole('button',{name:'Request Client approval',exact:true}));dialog=owner.page.getByRole('dialog');
  const requested=owner.page.waitForResponse(r=>r.url()===base+itemPath+'/approvals'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Request approval',exact:true}).evaluate(n=>{n.click();n.click();});assert.equal((await requested).status(),201);
  await dialog.waitFor({state:'hidden'});await approvalSection().getByRole('button',{name:'Withdraw request',exact:true}).waitFor();
  const first=rounds()[0],firstRevision=revisions()[0];check('double click creates one requested round, revision and event',rounds().length===1&&revisions().length===1&&events().filter(e=>e.event_type==='CONTENT_APPROVAL_REQUESTED').length===1);
  await owner.page.waitForFunction(()=>document.activeElement?.id==='approval-status-focus');check('successful request restores focus to surviving approval status',true);
  const portalPath=`/portal/approvals/${first.id}`,apiPortal=`/api/bloomops/portal/approvals/${first.id}`;
  await client.page.reload();check('linked Client Home retains the narrow approval link alongside Content',await client.page.locator(`a[href="${portalPath}"]`).count()===1&&await client.page.locator('a[href="/social"],a[href="/portal/approvals"]').count()===0);
  await client.page.goto(base+portalPath);await other.page.goto(base+'/portal');check('another linked Client sees no approval module or guessed DTO',await other.page.getByRole('heading',{name:'Approval needed',exact:true}).count()===0&&(await other.context.request.get(base+apiPortal)).status()===404);
  check('Client HTML excludes internal copy and all storage authority',!/C5_PRIVATE|objectKey|sha256|ownerMembershipId|stageContext|completionRevision|requestRevision/.test(await client.page.content()));
  const dto=await(await client.context.request.get(base+apiPortal)).json();check('exact Client API envelope and immutable snapshot allowlist',Object.keys(dto.item).sort().join()==='id,number,requestedAt,snapshot'&&Object.keys(dto.item.snapshot).sort().join()==='caption,cta,hook,platforms,script,targetPublishDate,title,type');
  for(const width of widths){await layout('client-review-round-1',client.page,width);await layout('internal-requested',owner.page,width);}
  await owner.page.goto(base+ui+'/edit');check('edit controls freeze review fields while visibility remains active',await owner.page.locator('#content-script').isDisabled()&&await owner.page.locator('#content-targetPublishDate').isDisabled()&&!await owner.page.locator('#content-visibility').isDisabled());
  for(const width of widths)await layout('frozen-edit',owner.page,width);
  const current=await get();for(const patch of [{script:'Bypass'},{targetPublishDate:'2026-09-28'}]){const response=await owner.context.request.patch(base+itemPath,{headers:{origin:base},data:{...patch,expectedRevision:current.revision}});check('server refuses frozen review detail/date edit',response.status()===409);}
  check('server refuses frozen C3 platform and C2 revision bypass',(await owner.context.request.put(base+itemPath+'/platforms',{headers:{origin:base},data:{platforms:['YouTube'],expectedRevision:current.revision}})).status()===409&&(await owner.context.request.post(base+itemPath+'/transition',{headers:{origin:base},data:{targetStage:'revision_requested',context:'Bypass',expectedRevision:current.revision}})).status()===409);
  check('generic Client C2 transition remains unavailable',(await client.context.request.post(base+itemPath+'/transition',{headers:{origin:base},data:{targetStage:'approved',expectedRevision:current.revision}})).status()===404);
  await activate(client.page,client.page.getByRole('button',{name:'Request changes',exact:true}));dialog=client.page.getByRole('dialog');await client.page.waitForFunction(()=>document.activeElement?.id==='approval-feedback');
  check('empty feedback cannot submit',await dialog.getByRole('button',{name:'Send requested changes',exact:true}).isDisabled());await dialog.getByLabel('Your requested changes',{exact:true}).fill(feedback);
  for(const width of widths)await layout('client-long-feedback',client.page,width);
  const changes=client.page.waitForResponse(r=>r.url()===base+apiPortal&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Send requested changes',exact:true}).evaluate(n=>{n.click();n.click();});assert.equal((await changes).status(),200);await dialog.waitFor({state:'hidden'});
  await client.page.waitForFunction(()=>document.activeElement?.textContent.includes('Your requested changes have been shared'));check('response confirmation receives focus and has no stale decision controls',await client.page.getByRole('button',{name:'Approve',exact:true}).count()===0);
  const round1Final=JSON.stringify(rounds()[0]),revision1Final=JSON.stringify(revisions()[0]);check('Client feedback is durable and stage changed once',rounds()[0].status==='changes_requested'&&rounds()[0].feedback===feedback&&(await get()).stage==='revision_requested'&&(await get()).stageContext===feedback&&JSON.stringify(revisions()[0])===JSON.stringify(firstRevision));
  const beforeRetry=events().length;check('HTTP identical response retry acknowledges without duplicate stage/history',(await post(apiPortal,{decision:'changes_requested',feedback},client)).unchanged&&events().length===beforeRetry);
  await move('editing');const secondScript='A more direct opening.\n'+ 'A practical example with one clear next step. '.repeat(70);
  assert.equal((await owner.context.request.patch(base+itemPath,{headers:{origin:base},data:{script:secondScript,targetPublishDate:'2026-09-23',expectedRevision:(await get()).revision}})).status(),200);
  assert.equal((await owner.context.request.put(base+itemPath+'/platforms',{headers:{origin:base},data:{platforms:['LinkedIn'],expectedRevision:(await get()).revision}})).status(),200);
  for(const stage of ['internal_review','client_review'])await move(stage);
  const secondRequest=await post(itemPath+'/approvals',{requestId:randomUUID(),expectedRevision:(await get()).revision},owner,201),second=rounds()[1];
  check('round two has its own immutable revision and preserves prior feedback',secondRequest.roundId===second.id&&second.number===2&&second.revision_id!==first.revision_id&&JSON.stringify(rounds()[0])===round1Final&&JSON.stringify(revisions()[0])===revision1Final);
  await owner.page.goto(base+ui);await owner.page.locator('.bo-review-details > summary').first().click();await owner.page.locator('.bo-review-details > summary').last().click();
  for(const width of widths)await layout('two-round-history',owner.page,width);
  await client.page.goto(base+`/portal/approvals/${second.id}`);check('round two shows only revised submitted copy and platforms',await client.page.getByText('LinkedIn',{exact:true}).count()===1&&(await client.page.textContent('main')).includes('A more direct opening.')&&!(await client.page.textContent('main')).includes(feedback));
  await activate(client.page,client.page.getByRole('button',{name:'Approve',exact:true}));dialog=client.page.getByRole('dialog');await client.page.waitForFunction(()=>document.activeElement?.id==='approval-response-confirm');
  for(const width of widths)await layout('client-approve-confirmation',client.page,width);
  await activate(client.page,dialog.getByRole('button',{name:'Approve this round',exact:true}));await dialog.waitFor({state:'hidden'});
  check('round two approval changes Content once and keeps round one intact',rounds()[1].status==='approved'&&(await get()).stage==='approved'&&JSON.stringify(rounds()[0])===round1Final&&JSON.stringify(revisions()[0])===revision1Final);
  const beforeApproveRetry=events().length;check('approval retry is unchanged',(await post(`/api/bloomops/portal/approvals/${second.id}`,{decision:'approved'},client)).unchanged&&events().length===beforeApproveRetry);
  for(const width of widths)await layout('client-confirmation',client.page,width);
  await client.page.goto(base+'/portal');check('completed rounds vanish from actionable Home and GET',await client.page.getByRole('heading',{name:'Approval needed',exact:true}).count()===0&&(await client.context.request.get(base+apiPortal)).status()===404);
  const fileResponse=await owner.context.request.get(base+`/api/bloomops/files/${fileId}/download`);check('C4 canonical File metadata and bytes survive two rounds',fileFacts()===originalFiles&&fileResponse.status()===200&&(await fileResponse.body()).equals(bytes));
  const calendar=await(await owner.context.request.get(base+`/api/bloomops/content/calendar?start=2026-09-01&end=2026-09-30&platform=linkedin`)).json();check('C3 calendar still reads revised canonical date/platform',calendar.items.some(row=>row.id===id&&row.targetPublishDate==='2026-09-23'));
  const fresh=(await post(`/api/bloomops/clients/${cl}/services/${service}/content`,{requestId:randomUUID(),title:'A second review for withdrawal',type:'reel',visibility:'client'},owner,201)).contentId;
  sql(`UPDATE content_items SET stage='client_review' WHERE id=${lit(fresh)}`);const third=(await post(`/api/bloomops/content/${fresh}/approvals`,{requestId:randomUUID(),expectedRevision:1},owner,201)).roundId;
  sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.team.membership)})`);
  await team.page.goto(base+`/social/${fresh}`);check('assigned Team reads history without request/withdraw controls',await team.page.getByText('Round 1',{exact:true}).count()===1&&await team.page.getByRole('button',{name:'Withdraw request',exact:true}).count()===0);
  check('Team formal withdrawal is forbidden',(await team.context.request.post(base+`/api/bloomops/approvals/${third}/withdraw`,{headers:{origin:base},data:{expectedRevision:2}})).status()===403);
  await owner.page.goto(base+`/social/${fresh}`);await activate(owner.page,owner.page.getByRole('button',{name:'Withdraw request',exact:true}));dialog=owner.page.getByRole('dialog');await dialog.locator('#approval-withdrawal-reason').fill('One more internal check.');
  for(const width of widths)await layout('withdrawal',owner.page,width);
  await activate(owner.page,dialog.getByRole('button',{name:'Withdraw request',exact:true}));await dialog.waitFor({state:'hidden'});check('withdrawal preserves history and reopens editing at Client Review',sql(`SELECT status FROM content_approval_rounds WHERE id=${lit(third)}`)[0].status==='withdrawn'&&sql(`SELECT stage FROM content_items WHERE id=${lit(fresh)}`)[0].stage==='client_review');
  const reopened=(await post(`/api/bloomops/content/${fresh}/approvals`,{requestId:randomUUID(),expectedRevision:3},owner,201)).roundId;
  const pendingPath=`/api/bloomops/portal/approvals/${reopened}`;check('issued Client reaches new open round',(await client.context.request.get(base+pendingPath)).status()===200);
  sql(`UPDATE content_items SET visibility='restricted' WHERE id=${lit(fresh)}`);check('live visibility revokes issued Client read/write and PM history',(await client.context.request.get(base+pendingPath)).status()===404&&(await client.context.request.post(base+pendingPath,{headers:{origin:base},data:{decision:'approved'}})).status()===404&&(await pm.page.goto(base+`/social/${fresh}`)).status()===404);
  sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.pm.membership)})`);await pm.page.goto(base+`/social/${fresh}`);check('exact Social assignment grants restricted coordinator history',await pm.page.getByRole('button',{name:'Withdraw request',exact:true}).count()===1);
  sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.pm.membership)}`);check('issued coordinator assignment revocation fences withdrawal',(await pm.context.request.post(base+`/api/bloomops/approvals/${reopened}/withdraw`,{headers:{origin:base},data:{expectedRevision:4}})).status()===404);
  sql(`UPDATE content_items SET visibility='client' WHERE id=${lit(fresh)}`);sql(`UPDATE client_contacts SET user_id=NULL WHERE client_id=${lit(cl)}`);check('issued Client contact revocation fences response',(await client.context.request.post(base+pendingPath,{headers:{origin:base},data:{decision:'approved'}})).status()===404);
  sql(`UPDATE client_contacts SET user_id=${lit(members.client.id)} WHERE client_id=${lit(cl)}`);sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.client.membership)}`);check('issued Client suspended membership is refused',(await client.context.request.get(base+pendingPath)).status()===403);
  await owner.page.emulateMedia({reducedMotion:'reduce'});await owner.page.goto(base+`/social/${fresh}`);await layout('reduced-motion',owner.page,320);check('reduced motion is respected',await owner.page.locator('.bo-btn').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(base+`/social/${fresh}`);const withdrawControl=touchPage.getByRole('button',{name:'Withdraw request',exact:true});await touchPage.waitForFunction(n=>n&&!n.disabled,await withdrawControl.elementHandle());await withdrawControl.tap();check('touch opens coordinator withdrawal dialog',await touchPage.getByRole('dialog').isVisible());await layout('touch',touchPage,390);await touch.close();
  sql(`UPDATE workspace_memberships SET status='active' WHERE id=${lit(members.client.membership)}`);
  const clientTouch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await client.context.storageState()}),clientTouchPage=await clientTouch.newPage();await clientTouchPage.goto(base+`/portal/approvals/${reopened}`);const changesControl=clientTouchPage.getByRole('button',{name:'Request changes',exact:true});await clientTouchPage.waitForFunction(n=>n&&!n.disabled,await changesControl.elementHandle());await changesControl.tap();check('touch opens the narrow Client feedback dialog',await clientTouchPage.getByRole('dialog').isVisible());await layout('client-touch',clientTouchPage,390);await clientTouch.close();
  console.log(`C5 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px. Exit 0.`);
}catch(error){console.error('C5 browser acceptance failed:',String(error.message).split('\n').filter(l=>!/cookie:|authorization:|token=/i.test(l)).join('\n'));process.exitCode=1;}
finally{await browser.close();}
