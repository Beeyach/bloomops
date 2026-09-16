// N3A: reuse the completed-Worker wrapper, isolated resources and build attribution.
// Starts its own built Worker, in-memory D1/R2 and synthetic identities. No .dev.vars.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildArtifacts,hash,localProcesses} from './notification-build-evidence.mjs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {unstable_getMiniflareWorkerOptions} from 'wrangler';
import {runBootstrap} from '../lib/bloomops/bootstrap.mjs';
import {reportBrowserError} from './client-reports-evidence.mjs';
import {reportCsv} from '../lib/bloomops/client-report-csv.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=resolve(process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR||'/tmp/bloomops-n3a-verification/browser');mkdirSync(out,{recursive:true});
const port=await new Promise((resolve,reject)=>{const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base=`http://localhost:${port}`;
const require=createRequire(import.meta.url),wranglerRoot=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wranglerRoot]}));
const {chromium}=createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE||'/tmp/bloomops-n2e-browser-tools/package.json')('playwright');
const tmp=mkdtempSync(join(tmpdir(),'bloomops-n3a-browser-')),configPath=join(tmp,'wrangler.jsonc');
const artifacts=buildArtifacts(root);
const expected=process.env.BLOOMOPS_BUILD_IDENTITY?JSON.parse(readFileSync(process.env.BLOOMOPS_BUILD_IDENTITY,'utf8')):null;
if(expected)assert.deepEqual(artifacts,expected.files,'Completed build matches recorded artifacts');
const identity={root,startedAt:new Date().toISOString(),command:[process.execPath,...process.argv.slice(1)],pid:process.pid,port,entrypoint:join(root,'.open-next/worker.js'),wrapper:join(root,'scripts/navigation-perf-worker.mjs'),artifactDigest:hash(JSON.stringify(artifacts)),expectedRevision:expected?.revision||null};
writeFileSync(out+'/artifact-files.json',JSON.stringify(artifacts,null,2));
const source=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
assert.equal(source.vars.BLOOMOPS_ENV,'development');assert.equal(source.vars.BLOOMOPS_MAIL_TRANSPORT,'r2-dev');
const config={name:'bloomops-dev',main:join(root,'scripts/navigation-perf-worker.mjs'),compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags,
 assets:{directory:join(root,'.open-next/assets'),binding:'ASSETS'},vars:{BLOOMOPS_ENV:'development',BLOOMOPS_MAIL_TRANSPORT:'r2-dev',BLOOMOPS_APP_URL:base,PERF1_LOCAL_ONLY:'synthetic-local',PERF1_D1_DELAY_MS:'0'},
 d1_databases:[{binding:'DB',database_name:'n2e-disposable',database_id:'n2e-browser-isolated'}],r2_buckets:[{binding:'FILES',bucket_name:'n2e-browser-files'}],observability:{enabled:false}};
writeFileSync(configPath,JSON.stringify(config));
execFileSync(process.execPath,[join(wranglerRoot,'bin/wrangler.js'),'deploy','--dry-run','--no-autoconfig','--config',configPath,'--outdir',join(tmp,'bundle')],{cwd:root,env:{...process.env,WRANGLER_LOG:'error'},stdio:'pipe',maxBuffer:32*1024*1024});
const options=unstable_getMiniflareWorkerOptions(configPath).workerOptions;delete options.modulesRules;
const mf=new Miniflare(convertV4MiniflareOptions({...options,modules:true,script:readFileSync(join(tmp,'bundle/navigation-perf-worker.js'),'utf8'),host:'127.0.0.1',port,cf:false,logRequests:false}));
let browser;const checks=[],errors=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
try{
 await mf.ready;identity.readyAt=new Date().toISOString();identity.processes=localProcesses();identity.bundle={path:join(tmp,'bundle/navigation-perf-worker.js'),sha256:hash(readFileSync(join(tmp,'bundle/navigation-perf-worker.js')))};identity.configuration=config;identity.version=await(await fetch(base+'/api/version')).json();if(expected)assert.equal(identity.version.sha,expected.revision.slice(0,7),'Served build revision');writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));
 const binding=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
 const journal=JSON.parse(readFileSync(join(root,'drizzle/meta/_journal.json'),'utf8'));
 await binding.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT)').run();
 for(const entry of journal.entries){for(const stmt of readFileSync(join(root,`drizzle/${entry.tag}.sql`),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await binding.prepare(stmt).run();await binding.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(entry.tag+'.sql').run();}
 await runBootstrap(binding,{workspaceName:'N3A Synthetic QA',workspaceSlug:'n3a-qa',owner:{email:'ellen@example.com',name:'QA Owner'},admin:{email:'ary@example.com',name:'QA Admin'}},{ids:{workspaceId:'a',ownerUserId:'ellen',ownerMembershipId:'m-ellen',adminUserId:'ary',adminMembershipId:'m-ary'}});
 await runBootstrap(binding,{workspaceName:'N3A Other QA',workspaceSlug:'n3a-other',owner:{email:'foreign@example.com',name:'Other Owner'},admin:{email:'other-admin@example.com',name:'Other Admin'}},{ids:{workspaceId:'b',ownerUserId:'foreign',ownerMembershipId:'m-foreign'}});
 // The legacy QA workspace lacks common/GHL versions. Reproduce that initial
 // state only in this disposable database; every subsequent setup uses the UI.
 await binding.prepare("DELETE FROM template_versions WHERE workspace_id='a' AND template_id IN (SELECT id FROM templates WHERE workspace_id='a' AND kind='onboarding' AND slug IN ('common','ghl'))").run();
 check('isolated built Worker is healthy', (await(await fetch(base+'/api/health')).json()).ok);
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu']});
 async function login(user){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const email=user+'@example.com';assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/'}})).status(),200);
  const mail=await bucket.get('dev-mail/'+createHash('sha256').update(email).digest('hex')+'.json');assert.ok(mail);const url=JSON.parse(await mail.text()).text.match(/https?:\/\/\S+/)[0];const parsed=new URL(url);assert.ok(parsed.origin===base&&parsed.pathname==='/api/auth/magic-link/verify',`local auth host/path: ${parsed.host} ${parsed.pathname}`);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(reportBrowserError(e)));await page.goto(url,{waitUntil:'networkidle'});return {ctx,page};}
 const owner=await login('ellen');
 identity.servedAssets=[];for(const url of await owner.page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src))){const path=new URL(url).pathname,file=artifacts.find(f=>f.path==='.open-next/assets'+decodeURIComponent(path));assert.ok(file,'served script belongs to completed build');const response=await owner.ctx.request.get(url);assert.equal(response.status(),200);const sha256=hash(await response.body());assert.equal(sha256,file.sha256);identity.servedAssets.push({path,sha256});}
 assert.ok(identity.servedAssets.length);writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));
 const admin=await login('ary'),foreign=await login('foreign');
 await owner.page.bringToFront();
 await owner.page.goto(base+'/settings/onboarding',{waitUntil:'networkidle'});
 await owner.page.getByText('Review Common default instructions',{exact:true}).click();check('canonical onboarding instructions can be reviewed',await owner.page.getByText('Brand assets',{exact:true}).count()===1);
 await owner.page.getByLabel('Install missing Common defaults',{exact:true}).check();await owner.page.getByLabel('Install missing GHL defaults',{exact:true}).check();
 await owner.page.getByRole('button',{name:'Install selected defaults',exact:true}).click();await owner.page.getByRole('status').filter({hasText:'Selected onboarding categories are ready'}).waitFor();check('supported setup installs selected onboarding categories and preserves other defaults',await owner.page.getByText('Published version 1',{exact:true}).count()===5);
 await owner.page.reload({waitUntil:'networkidle'});check('onboarding publication persists on reload',await owner.page.getByLabel('Install missing Common defaults',{exact:true}).isDisabled());
 await owner.page.setViewportSize({width:320,height:1000});check('onboarding setup at320 has no overflow',await owner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await owner.page.screenshot({path:out+'/onboarding-setup-320.png',fullPage:true});await owner.page.setViewportSize({width:1440,height:1000});
 const get=async(ctx,path)=>{const r=await ctx.request.get(base+path);return {status:r.status(),data:await r.json()};};
 const post=async(ctx,path,data,method='POST')=>{const r=await ctx.request.fetch(base+path,{method,headers:{origin:base},data});return {status:r.status(),data:await r.json()};};
 const ownerSession=await get(owner.ctx,'/api/auth/get-session'),adminSession=await get(admin.ctx,'/api/auth/get-session');check('independent actual owner/admin identities',ownerSession.data.user.id==='ellen'&&adminSession.data.user.id==='ary');
 const makeClient=async name=>{const r=await post(owner.ctx,'/api/bloomops/clients',{name,contactName:'Synthetic contact',contactEmail:'contact@example.test',timezone:'Australia/Sydney',requestId:randomUUID(),userId:'ellen',workspaceId:'a'});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.client.id;};
 const clientId=await makeClient('N3A Synthetic Reports'),otherClient=await makeClient('N3A Different Client');
 const types=(await binding.prepare("SELECT id,slug FROM service_types WHERE workspace_id='a'").all()).results;
 const addService=async(client,slug)=>{const r=await post(owner.ctx,`/api/bloomops/clients/${client}/services`,{serviceTypeId:types.find(t=>t.slug===slug).id,packageName:'Synthetic QA service'});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.service.id;};
 const ghl=await addService(clientId,'ghl'),social=await addService(clientId,'social-media-management'),foreignService=await addService(otherClient,'ghl');
 check('supported Client and purchased Service writers create fixture',!!ghl&&!!social);
 // Exercise the supported contact-specific activation path, not an injected
 // contact association. The invitation and magic link remain only in memory.
 const activation=await post(owner.ctx,`/api/bloomops/clients/${clientId}/activate`,{});
 check('published defaults enable real Client activation',activation.status===200&&activation.data.activated&&activation.data.deliveryStatus==='sent');
 const contactEmail='contact@example.test';
 const invitationMail=JSON.parse(await(await bucket.get('dev-mail/'+createHash('sha256').update(contactEmail).digest('hex')+'.json')).text());
 const invitationUrl=invitationMail.text.match(/https?:\/\/\S+/)[0];
 assert.equal(new URL(invitationUrl).origin,base);assert.ok(new URL(invitationUrl).pathname.startsWith('/invite/'));
 const portalContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await portalContext.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 const portalPage=await portalContext.newPage();portalPage.on('pageerror',e=>errors.push(reportBrowserError(e)));
 await portalPage.goto(invitationUrl,{waitUntil:'networkidle'});
 const signIn=await portalContext.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email:contactEmail,callbackURL:new URL(invitationUrl).pathname}});assert.equal(signIn.status(),200);
 const loginMail=JSON.parse(await(await bucket.get('dev-mail/'+createHash('sha256').update(contactEmail).digest('hex')+'.json')).text());
 await portalPage.goto(loginMail.text.match(/https?:\/\/\S+/)[0],{waitUntil:'networkidle'});
 await portalPage.getByRole('button',{name:'Accept and continue',exact:true}).click();await portalPage.waitForURL('**/portal');
 check('genuine portal identity authenticates independently',(await get(portalContext,'/api/auth/get-session')).data.user.id!=='ellen');
 await portalPage.getByRole('heading',{name:'Your onboarding',exact:true}).waitFor();
 const portalAccounts=await get(portalContext,'/api/bloomops/portal/onboarding');
 check('activation contact link exposes only its Client',portalAccounts.status===200&&portalAccounts.data.clients.length===1&&portalAccounts.data.clients[0].id===clientId&&await portalPage.locator(`a[href="/portal/discussions/client/${clientId}"]`).count()===1&&await portalPage.locator(`a[href="/portal/discussions/client/${otherClient}"]`).count()===0);
 check('portal identity cannot administer onboarding defaults',(await get(portalContext,'/api/bloomops/onboarding/setup')).status===404);
 check('portal identity cannot read internal report drafts',(await get(portalContext,`/api/bloomops/clients/${otherClient}/reports`)).status===404);
 await portalPage.screenshot({path:out+'/supported-portal-activation.png',fullPage:true});
 const path=`/clients/${clientId}/reports`,api=`/api/bloomops/clients/${clientId}/reports`;
 await owner.page.goto(base+`/clients/${clientId}`,{waitUntil:'networkidle'});await owner.page.getByRole('link',{name:'Reports',exact:true}).click();await owner.page.getByText('No report drafts yet.',{exact:true}).waitFor();check('Client Reports destination and empty state',true);
 const metric=async(page,label,value)=>{await page.getByLabel(label+' availability').selectOption('value');await page.getByLabel(label+' count').fill(String(value));};
 const created=[];
 for(const [template,service,channel,title] of [['ghl_campaign',ghl,'email','N3A GHL persisted draft'],['social',social,'instagram','N3A Social persisted draft']]){
  await owner.page.goto(base+path+'/new',{waitUntil:'networkidle'});await owner.page.screenshot({path:out+'/new-form.png',fullPage:true});await owner.page.getByRole('combobox',{name:/^Purchased service/}).selectOption(service);await owner.page.getByLabel('Report template').selectOption(template);
  await owner.page.getByLabel('Report title').fill(title);await owner.page.getByLabel('Channel').selectOption(channel);await owner.page.getByLabel('Period start',{exact:true}).fill('2026-08-01');await owner.page.getByLabel('Period end',{exact:true}).fill('2026-08-31');await owner.page.getByLabel('Timezone').fill('Australia/Sydney');await owner.page.getByLabel('Account',{exact:true}).fill('Synthetic source account');await owner.page.getByLabel('Campaign or content scope').fill('One synthetic campaign');
  await owner.page.getByLabel('Report commentary').fill('Synthetic narrative <script>window.n3aUnsafe=true</script>');
  if(template==='ghl_campaign'){await metric(owner.page,'Sent messages',32);await metric(owner.page,'Delivered messages',1);await owner.page.getByLabel('Sent messages source note').fill('<img src=x onerror=alert(1)> synthetic source');}else{await metric(owner.page,'Followers at period start',100);await metric(owner.page,'Followers at period end',95);await metric(owner.page,'Views',0);}
  await owner.page.getByRole('button',{name:'Save draft',exact:true}).focus();await owner.page.keyboard.press('Enter');await owner.page.waitForURL(new RegExp('/reports/[a-z0-9-]+$'));await owner.page.getByRole('heading',{name:'Edit report draft',exact:true}).waitFor();const id=new URL(owner.page.url()).pathname.split('/').at(-1);created.push(id);
  const persisted=await get(owner.ctx,api+'/'+id);check(template+' real API persists typed observations',persisted.status===200&&persisted.data.report.title===title&&persisted.data.report.templateVersion===1);
  check(template+' saved form reopens',await owner.page.getByLabel('Report title').inputValue()===title);
  const csvKey=template==='social'?'published':'failed',csvLabel=template==='social'?'Published content':'Failed messages';
  const csvSource={...persisted.data.report,metrics:{...persisted.data.report.metrics,[csvKey]:{state:'value',value:17,sourceNote:'Synthetic reviewed CSV source',collectedAt:null}}};
  const csv=reportCsv(csvSource),upload=()=>owner.page.getByLabel('Choose report CSV').setInputFiles({name:'synthetic-report.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  const downloadWait=owner.page.waitForEvent('download');await owner.page.getByRole('button',{name:'Download report CSV',exact:true}).click();const downloaded=await downloadWait;await downloaded.saveAs(out+'/'+template+'-download.csv');check(template+' downloads real generic report CSV',readFileSync(out+'/'+template+'-download.csv','utf8').includes('text_encoding'));
  await owner.page.getByLabel('Choose report CSV').setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('bad,header\n1,2')});await owner.page.getByRole('alert').filter({hasText:'generic CSV headings'}).waitFor();check(template+' invalid CSV gives recoverable error',true);
  await upload();await owner.page.getByRole('button',{name:'Apply selected CSV rows',exact:true}).waitFor();check(template+' CSV review leaves persisted data unchanged',(await get(owner.ctx,api+'/'+id)).data.report.metrics[csvKey].state==='missing');
  await owner.page.getByRole('button',{name:'Apply selected CSV rows',exact:true}).focus();await owner.page.keyboard.press('Enter');check(template+' keyboard applies reviewed row to form',await owner.page.getByLabel(csvLabel+' count').inputValue()==='17');
  await Promise.all([owner.page.waitForNavigation({waitUntil:'networkidle'}),owner.page.getByRole('button',{name:'Save draft',exact:true}).click()]);
  const imported=(await get(owner.ctx,api+'/'+id)).data.report.metrics[csvKey];check(template+' imported value and provenance persist',imported.value===17&&imported.sourceKind==='csv'&&!!imported.importId);
  await upload();await owner.page.getByText('Unchanged — no replacement needed.',{exact:true}).first().waitFor();check(template+' identical reimport makes no replacements',await owner.page.getByRole('button',{name:'Apply selected CSV rows',exact:true}).isDisabled());await owner.page.getByRole('button',{name:'Cancel import review',exact:true}).click();
  await owner.page.getByLabel(csvLabel+' count').fill('18');await Promise.all([owner.page.waitForNavigation({waitUntil:'networkidle'}),owner.page.getByRole('button',{name:'Save draft',exact:true}).click()]);
  await upload();await owner.page.getByLabel('Import '+csvLabel,{exact:true}).waitFor();check(template+' reimport flags manual correction without selecting it',!await owner.page.getByLabel('Import '+csvLabel,{exact:true}).isChecked()&&(await get(owner.ctx,api+'/'+id)).data.report.metrics[csvKey].value===18);
  await owner.page.getByLabel('Report commentary').fill('Edit invalidates review');check(template+' editing invalidates pending CSV review',await owner.page.getByRole('button',{name:'Apply selected CSV rows',exact:true}).count()===0);
  await owner.page.getByLabel('Report commentary').fill('Updated synthetic narrative <script>window.n3aUnsafe=true</script>');await Promise.all([owner.page.waitForNavigation({waitUntil:'networkidle'}),owner.page.getByRole('button',{name:'Save draft',exact:true}).click()]);await owner.page.getByRole('link',{name:'Preview saved draft',exact:true}).waitFor();
  for(const width of [1440,1024,768,390,320]){await owner.page.setViewportSize({width,height:1000});check(`${template} editor ${width} no overflow`,await owner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await owner.page.screenshot({path:out+`/${template}-editor-${width}.png`,fullPage:true});}
  await owner.page.getByRole('link',{name:'Preview saved draft',exact:true}).click();await owner.page.getByRole('heading',{name:title,exact:true}).waitFor();
  check(template+' private persisted preview calculation',await owner.page.getByText(template==='ghl_campaign'?'3.13%':'-5',{exact:true}).count()===1);
  check(template+' commentary escaped',await owner.page.getByText('Updated synthetic narrative <script>window.n3aUnsafe=true</script>',{exact:true}).count()===1&&await owner.page.evaluate(()=>!window.n3aUnsafe));
  check(template+' missing values identified',await owner.page.getByText('Not supplied',{exact:true}).count()>0);
  if(template==='social')check('zero remains zero in preview',await owner.page.locator('dd strong').getByText('0',{exact:true}).count()===1);
  for(const width of [1440,1024,768,390,320]){await owner.page.setViewportSize({width,height:1000});check(`${template} preview ${width} no overflow`,await owner.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await owner.page.screenshot({path:out+`/${template}-preview-${width}.png`,fullPage:true});}
 }
 await owner.page.setViewportSize({width:1440,height:1000});
 const id=created[0];let current=(await get(owner.ctx,api+'/'+id)).data.report;
 check('CSV import, manual correction and commentary each increment persisted revision',current.revision===4);
 const draft=r=>Object.fromEntries(['title','periodStart','periodEnd','timezone','channel','accountLabel','scopeLabel','commentary','metrics'].map(k=>[k,r[k]]));
 const body=r=>({workspaceId:'a',userId:'ellen',serviceEngagementId:r.serviceEngagementId,templateId:r.templateId,templateVersion:r.templateVersion,expectedRevision:r.revision,draft:draft(r)});
 check('other workspace guessed draft denied',(await get(foreign.ctx,api+'/'+id)).status===404);
 check('wrong Client draft pair denied',(await get(owner.ctx,`/api/bloomops/clients/${otherClient}/reports/${id}`)).status===404);
 check('wrong Client Service pair refused',(await post(owner.ctx,api,{...body(current),serviceEngagementId:foreignService,requestId:randomUUID()})).status===404);
 check('wrong initiating workspace refused',(await post(owner.ctx,api+'/'+id,{...body(current),workspaceId:'b'},'PUT')).status===404);
 check('invalid period refused',(await post(owner.ctx,api+'/'+id,{...body(current),draft:{...draft(current),periodEnd:'2026-01-01'}},'PUT')).status===400);
 check('invalid timezone refused',(await post(owner.ctx,api+'/'+id,{...body(current),draft:{...draft(current),timezone:'Unknown/Zone'}},'PUT')).status===400);
 check('foreign origin refused',(await owner.ctx.request.put(base+api+'/'+id,{headers:{origin:'https://foreign.invalid'},data:body(current)})).status()===403);
 const anonymous=await browser.newContext();check('anonymous guessed API denied',(await anonymous.request.get(base+api+'/'+id)).status()===401);await anonymous.close();
 await admin.page.goto(base+path+'/'+id,{waitUntil:'networkidle'});await admin.page.getByLabel('Report commentary').fill('Do not lose this conflicting edit');
 const saved=await post(owner.ctx,api+'/'+id,{...body(current),draft:{...draft(current),commentary:'Winning saved version'}},'PUT');assert.equal(saved.status,200);
 await admin.page.getByRole('button',{name:'Save draft',exact:true}).click();await admin.page.getByRole('alert').filter({hasText:'saved draft changed'}).waitFor();check('concurrent browser edit reports conflict and preserves input',await admin.page.getByLabel('Report commentary').inputValue()==='Do not lose this conflicting edit');
 check('conflict leaves winning persisted draft unchanged',(await get(owner.ctx,api+'/'+id)).data.report.commentary==='Winning saved version');
 admin.page.once('dialog',d=>d.accept());await Promise.all([admin.page.waitForNavigation({waitUntil:'networkidle'}),admin.page.getByRole('link',{name:'Reopen saved draft',exact:true}).click()]);check('explicit conflict recovery loads saved draft',await admin.page.getByLabel('Report commentary').inputValue()==='Winning saved version');
 await owner.page.goto(base+path+'/'+id,{waitUntil:'networkidle'});await owner.page.getByLabel('Report commentary').fill('Recovered network edit');let fail=true;await owner.page.route('**/api/bloomops/clients/*/reports/*',route=>{if(route.request().method()==='PUT'&&fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic temporary failure"}'});}return route.continue();});
 await owner.page.getByRole('button',{name:'Save draft',exact:true}).click();await owner.page.getByRole('alert').filter({hasText:'Synthetic temporary failure'}).waitFor();check('failed save retains attempted input',await owner.page.getByLabel('Report commentary').inputValue()==='Recovered network edit');await Promise.all([owner.page.waitForNavigation({waitUntil:'networkidle'}),owner.page.getByRole('button',{name:'Retry save',exact:true}).click()]);await owner.page.unroute('**/api/bloomops/clients/*/reports/*');check('exact retry saves after network error',(await get(owner.ctx,api+'/'+id)).data.report.commentary==='Recovered network edit');
 await admin.page.goto(base+path+'/'+id+'/preview',{waitUntil:'networkidle'});check('authorized second actor opens saved preview',await admin.page.getByRole('heading',{name:'N3A GHL persisted draft',exact:true}).count()===1);
 assert.equal((await post(owner.ctx,'/api/bloomops/members/m-ary',{status:'suspended'},'PATCH')).status,200);await admin.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await admin.page.getByRole('alert').filter({hasText:'no longer available'}).waitFor();check('revocation removes mounted private preview',await admin.page.getByRole('heading',{name:'N3A GHL persisted draft',exact:true}).count()===0);check('revocation denies guessed API',[403,404].includes((await get(admin.ctx,api+'/'+id)).status));
 assert.equal((await post(owner.ctx,'/api/bloomops/members/m-ary',{status:'active'},'PATCH')).status,200);
 await owner.page.emulateMedia({reducedMotion:'reduce'});await owner.page.goto(base+path+'/'+id+'/preview',{waitUntil:'networkidle'});check('reduced motion preview healthy',await owner.page.getByRole('heading',{name:'N3A GHL persisted draft',exact:true}).count()===1);
 // Wait for the actual publication mutation, not a preceding route navigation.
 async function publishAction(label,{keyboard=false}={}){
  const button=owner.page.getByRole('button',{name:label,exact:true});
  await owner.page.waitForFunction(name=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===name&&!b.disabled),label);
  const response=owner.page.waitForResponse(r=>r.url().endsWith('/publications')&&r.request().method()==='POST');
  const navigation=owner.page.waitForNavigation({waitUntil:'networkidle'});
  if(keyboard){await button.focus();await owner.page.keyboard.press('Enter');}else await button.click();
  const result=await response;assert.equal(result.status(),200,'publication mutation succeeds');await navigation;
 }
 const published=[];
 for(const reportId of created){
  await owner.page.bringToFront();await owner.page.goto(base+path+'/'+reportId,{waitUntil:'networkidle'});
  await owner.page.getByRole('textbox',{name:'Client summary',exact:true}).fill('Client-safe summary for '+reportId);await owner.page.getByRole('textbox',{name:'Work completed',exact:true}).fill('Synthetic work completed');await owner.page.getByRole('textbox',{name:'Limits and context',exact:true}).fill('Manual observations, not provider verified');await owner.page.getByRole('textbox',{name:'Next actions',exact:true}).fill('Review next reporting period');
  await Promise.all([owner.page.waitForNavigation({waitUntil:'networkidle'}),owner.page.getByRole('button',{name:'Save draft',exact:true}).click()]);
  await owner.page.getByRole('link',{name:'Review publication and history',exact:true}).click();await owner.page.getByRole('heading',{name:'Publication review',exact:true}).waitFor();
  check('publication review excludes private source text '+reportId,!((await owner.page.locator('main').innerText()).includes('synthetic source')));
  await owner.page.getByRole('checkbox').check();await publishAction('Publish reviewed report',{keyboard:true});
  const release=(await get(owner.ctx,api+'/'+reportId+'/publications')).data.review.current;published.push(release.id);check('explicit publish creates version one '+reportId,release.sequence===1&&release.kind==='publish');
  await portalPage.bringToFront();await portalPage.goto(base+'/portal/reports',{waitUntil:'networkidle'});const entry=(await get(portalContext,'/api/bloomops/portal/reports/'+release.id)).data.report;
  await portalPage.getByRole('link',{name:entry.snapshot.title,exact:true}).click();await portalPage.getByText('Client-safe summary for '+reportId,{exact:true}).waitFor();
  check('portal renders frozen calculations '+reportId,await portalPage.getByText(entry.snapshot.templateId==='social'?'-5':'3.13%',{exact:true}).count()===1);
  const download=portalPage.waitForEvent('download');await portalPage.getByRole('button',{name:'Download this published PDF',exact:true}).click();const pdf=await download;await pdf.saveAs(out+'/'+entry.snapshot.templateId+'-published-v1.pdf');check('real authorized published PDF downloaded '+reportId,readFileSync(out+'/'+entry.snapshot.templateId+'-published-v1.pdf').subarray(0,5).toString()==='%PDF-');
  const pdfResponse=await portalContext.request.get(base+'/api/bloomops/portal/reports/'+release.id+'/pdf');check('PDF identifies exact snapshot '+reportId,pdfResponse.status()===200&&pdfResponse.headers()['x-bloomsi-snapshot-hash']===entry.snapshotHash&&pdfResponse.headers()['x-bloomsi-published-version']==='1');
  await portalPage.setViewportSize({width:320,height:1000});check('published client report narrow layout '+reportId,await portalPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await portalPage.screenshot({path:out+'/'+entry.snapshot.templateId+'-published-320.png',fullPage:true});await portalPage.setViewportSize({width:1440,height:1000});
  await owner.page.bringToFront();await owner.page.goto(base+path+'/'+reportId,{waitUntil:'networkidle'});await owner.page.getByRole('textbox',{name:'Client summary',exact:true}).fill('Revised client-safe summary');await Promise.all([owner.page.waitForNavigation({waitUntil:'networkidle'}),owner.page.getByRole('button',{name:'Save draft',exact:true}).click()]);
  check('editor keeps draft and publication status distinct '+reportId,await owner.page.getByRole('status').filter({hasText:'Published versions remain separate.'}).count()===1);
  check('draft edit leaves released snapshot unchanged '+reportId,(await get(portalContext,'/api/bloomops/portal/reports/'+release.id)).data.report.snapshot.clientSummary==='Client-safe summary for '+reportId);
  await owner.page.getByRole('link',{name:'Review publication and history',exact:true}).click();await owner.page.getByRole('checkbox').check();await publishAction('Publish reviewed revision');
  const revised=(await get(owner.ctx,api+'/'+reportId+'/publications')).data.review.current;check('revision preserves earlier internal history '+reportId,(await get(owner.ctx,api+'/'+reportId+'/versions/'+release.id)).data.report.snapshot.clientSummary==='Client-safe summary for '+reportId&&revised.sequence===2);
  check('replaced client link and PDF are denied '+reportId,(await get(portalContext,'/api/bloomops/portal/reports/'+release.id)).status===404&&(await portalContext.request.get(base+'/api/bloomops/portal/reports/'+release.id+'/pdf')).status()===404);
  await publishAction('Withdraw client access');check('withdrawal denies latest portal/PDF while retaining history '+reportId,(await get(portalContext,'/api/bloomops/portal/reports/'+revised.id)).status===404&&(await portalContext.request.get(base+'/api/bloomops/portal/reports/'+revised.id+'/pdf')).status()===404&&(await get(owner.ctx,api+'/'+reportId+'/versions/'+revised.id)).status===200);
 }
 check('withdrawn reports disappear from client list',(await get(portalContext,'/api/bloomops/portal/reports')).data.items.length===0);
 await portalContext.close();
 check('browser has no runtime errors',errors.length===0);writeFileSync(out+'/results.json',JSON.stringify({checks,errors,fixtures:{clientId,otherClient,ghl,social,reports:created},sourceRevision:identity.expectedRevision},null,2));
}catch(error){if(browser){let i=0;for(const ctx of browser.contexts())for(const page of ctx.pages())await page.screenshot({path:out+'/failure-'+(++i)+'.png',fullPage:true}).catch(()=>{});}writeFileSync(out+'/results.json',JSON.stringify({checks,errors,failure:reportBrowserError(error)},null,2));console.error(reportBrowserError(error));process.exitCode=1;}finally{identity.finishedAt=new Date().toISOString();identity.artifactsUnchanged=hash(JSON.stringify(buildArtifacts(root)))===identity.artifactDigest;writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));if(!identity.artifactsUnchanged)process.exitCode=1;await browser?.close();await mf.dispose();rmSync(tmp,{recursive:true,force:true});}
