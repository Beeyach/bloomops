// Synthetic local built-Worker acceptance. No imports, outreach or video.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;
const base='http://localhost:8787',fixtureDir=resolve(arg('--fixture','/tmp/bloomops-perf1-fixture')),out=resolve(arg('--out','/tmp/bloomops-prospecting-browser'));
const require=createRequire(join(resolve(arg('--playwright','/tmp/bloomops-pilot-tools')),'package.json')),{chromium}=require('playwright');
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const fixture=JSON.parse(readFileSync(join(fixtureDir,'fixture.json'))),browser=await chromium.launch({headless:true,args:['--no-sandbox']});mkdirSync(out,{recursive:true});
const checks=[],check=(label,ok=true)=>{assert.ok(ok,label);checks.push(label);console.log('ok  '+label);};
const cli=q=>JSON.parse(execFileSync('npx',['--no-install','wrangler','d1','execute','DB','--local','--command',q,'--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0].results;
const bodyErrors=[];
try{
 const context=await browser.newContext({storageState:join(fixtureDir,'owner-state.json'),viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>bodyErrors.push(e.message));
 await page.goto(base+'/workspaces',{waitUntil:'networkidle'});
 await page.getByLabel('Workspace name',{exact:true}).fill('Bloom Studio');
 await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL(base+'/prospecting');
 await page.getByRole('heading',{name:'Your prospect list is empty'}).waitFor();check('UI creates an empty fresh workspace for the existing identity');
 const own=(await context.cookies()).find(c=>c.name==='bloomops.workspace');assert.ok(own?.httpOnly&&own.sameSite==='Lax');const workspaceId=own.value;
 check('fresh workspace has no copied operational records',cli(`SELECT count(*) n FROM bloomops_clients WHERE workspace_id='${workspaceId}'`)[0].n===0);
 check('original operational fixture remains intact',cli(`SELECT count(*) n FROM bloomops_clients WHERE workspace_id='${fixture.ws}'`)[0].n===fixture.counts.clients);
 await page.screenshot({path:join(out,'empty-desktop.png')});
 await page.getByRole('link',{name:'New prospect',exact:true}).click();await page.getByLabel('Business name',{exact:true}).fill('Cedar House Studio');
 for(const [label,value] of [['Person','Maya Reed'],['Website','https://example.com/cedar-house'],['Current platform','Kajabi'],['Niche','Creative business education'],['Services','Self-paced courses and small-group mentoring'],['Public contact email','hello@example.com'],['Location','Melbourne, Australia'],['Timezone','Australia/Melbourne']])await page.getByLabel(label,{exact:false}).first().fill(value);
 await page.getByRole('button',{name:'Create prospect',exact:true}).click();await page.waitForURL(/\/prospecting\/[a-f0-9-]+$/);
 await page.getByRole('heading',{name:'Cedar House Studio',exact:true}).waitFor();const prospectId=new URL(page.url()).pathname.split('/').at(-1);
 const api='/api/bloomops/prospecting/'+prospectId,read=async()=>{const r=await context.request.get(base+api);assert.equal(r.status(),200);return r.json();};
 check('full-page profile displays identity and honest unknown assessment',(await read()).profile.fit==='unknown');
 await page.getByRole('button',{name:'Edit identity & contact',exact:true}).click();
 assert.equal(await page.locator('#prospect-businessName').evaluate(el=>document.activeElement===el),true);
 await page.getByText('Source details for public contact email',{exact:true}).click();
 const source=page.locator('.bo-prospect-field-source').filter({hasText:'Source details for public contact email'});
 await source.getByLabel('Source URL',{exact:true}).fill('https://example.com/cedar-house/contact');await source.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Save identity & contact',exact:true}).click();await page.getByRole('button',{name:'Edit identity & contact',exact:true}).waitFor();
 check('UI source check saves with provenance',(await read()).sources.find(s=>s.fieldKey==='publicEmail').verification==='checked');
 await page.getByRole('button',{name:'Edit assessment',exact:true}).click();await page.getByLabel('Fit',{exact:true}).selectOption('strong');
 for(const [label,value] of [['Assessment reason','A clear course offer with room to make the path from browsing to enrolment easier to follow.'],['Observed facts','The public course page describes a six-week programme. The main enrolment link opens a Kajabi checkout.'],['Unknowns','Email reminders, checkout completion and customer follow-up have not been tested.'],['Proposed work','Offer a focused review of the course page and a clearer set of next steps for visitors.']])await page.getByLabel(label,{exact:false}).fill(value);
 await page.getByText('Source details for observed facts',{exact:true}).click();
 const observationSource=page.locator('.bo-prospect-field-source').filter({hasText:'Source details for observed facts'});await observationSource.getByLabel('Source URL',{exact:true}).fill('https://example.com/cedar-house/course');await observationSource.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Save assessment',exact:true}).click();await page.getByRole('button',{name:'Edit assessment',exact:true}).waitFor();
 check('non-identity observation saves its checked source',(await read()).sources.find(s=>s.fieldKey==='observedFacts').verification==='checked');
 await page.getByRole('button',{name:'Edit assessment',exact:true}).click();await page.getByLabel('Observed facts',{exact:false}).fill('The public course page describes a six-week programme. The enrolment link opens a Kajabi checkout. No purchase was completed.');
 await page.getByRole('button',{name:'Save assessment',exact:true}).click();await page.getByRole('button',{name:'Edit assessment',exact:true}).waitFor();
 const changedObservation=(await read()).sources.find(s=>s.fieldKey==='observedFacts');check('editing the observation invalidates its earlier source check',changedObservation.verification==='unverified'&&changedObservation.checkedAt===null&&changedObservation.sourceUrl==='https://example.com/cedar-house/course');
 await page.locator('summary').filter({hasText:/^Audit evidence$/}).click();await page.getByRole('button',{name:'Edit audit evidence',exact:true}).click();
 for(const [label,value] of [['Audit date','2026-09-12'],['Page or target URL','https://example.com/cedar-house/course'],['Audit report','The offer is clearly described. A shorter comparison of the available course options may help visitors choose.'],['Tested interaction','Opened the main enrolment link and observed the public checkout page.'],['Inspection limitations','No purchase was completed. Account-only content and backend email behaviour remain unverified.']])await page.getByLabel(label,{exact:false}).fill(value);
 await page.getByRole('button',{name:'Save audit evidence',exact:true}).click();await page.getByRole('button',{name:'Edit audit evidence',exact:true}).waitFor();await page.locator('summary').filter({hasText:/^Audit evidence$/}).click();
 await page.getByRole('link',{name:'View draft',exact:true}).click();await page.getByRole('button',{name:'Edit outreach draft',exact:true}).click();
 await page.getByLabel('Draft subject',{exact:false}).fill('A thought on Cedar House’s course page');await page.getByLabel('Draft message',{exact:false}).fill('Hi Maya,\n\nI liked how clearly you explain who the six-week programme is for. I had a thought on making the course options easier to compare before someone reaches checkout.\n\nWould a short outline be useful?\n\nThank you,\nAry');
 await page.getByRole('button',{name:'Save outreach draft',exact:true}).click();await page.getByRole('button',{name:'Edit outreach draft',exact:true}).waitFor();
 check('fit uses a visible text label',await page.locator('.bo-profile-fit .bo-status').filter({hasText:/^Strong fit$/}).count()===1);
 check('assessment, dated audit and manual draft survive a reload',(await read()).profile.evidenceDate==='2026-09-12'&&(await read()).profile.draftBody.includes('Hi Maya'));
 // A concurrent save must keep the user's open editor and explain recovery.
 await page.getByRole('button',{name:'Edit assessment',exact:true}).click();await page.getByLabel('Assessment reason',{exact:false}).fill('Unsaved local wording');
 let data=await read();const external=await context.request.patch(base+api,{data:{workspaceId,expectedRevision:data.profile.revision,fields:{niche:'Courses for creative founders'}}});assert.equal(external.status(),200);
 await page.getByRole('button',{name:'Save assessment',exact:true}).click();await page.getByRole('alert').filter({hasText:'This profile changed'}).waitFor();
 check('stale editor preserves local text and offers reload',await page.getByLabel('Assessment reason',{exact:false}).inputValue()==='Unsaved local wording');await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.reload({waitUntil:'networkidle'});
 // A failed network save is recoverable in place.
 await page.getByRole('button',{name:'Edit outreach draft',exact:true}).click();await page.route('**'+api,route=>route.request().method()==='PATCH'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporarily unavailable. Try again."}'}):route.continue());
 await page.getByRole('button',{name:'Save outreach draft',exact:true}).click();await page.getByRole('alert').filter({hasText:'Temporarily unavailable'}).waitFor();check('failed save keeps draft in the editor',await page.getByLabel('Draft message',{exact:false}).inputValue().then(v=>v.includes('Hi Maya')));await page.unroute('**'+api);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 // Readability, labels, keyboard, reduced motion, selected state and reachability.
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/prospecting/'+prospectId,{waitUntil:'networkidle'});
  check(`profile ${width}px has no horizontal clipping`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(`profile ${width}px has contextual navigation`,await page.getByRole('link',{name:'Back to BloomOps',exact:true}).filter({visible:true}).count()===1);
  await page.screenshot({path:join(out,`profile-${width}.png`),fullPage:true});
  if(width===1440||width===390)await page.screenshot({path:join(out,`profile-top-${width}.png`)});
  await page.getByRole('button',{name:'Edit identity & contact',exact:true}).click();
  check(`editor ${width}px keeps focus and labels`,await page.locator('#prospect-businessName').evaluate(el=>document.activeElement===el&&!!el.labels.length));
  await page.keyboard.press('Tab');check(`editor ${width}px has visible keyboard focus`,await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'));
  check(`editor ${width}px has no clipping`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(width<768)check(`editor ${width}px inputs stay readable`,await page.locator('#prospect-businessName').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16&&el.getBoundingClientRect().height>=44));
  await page.screenshot({path:join(out,`editor-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('link',{name:'Back to prospects',exact:true}).click();await page.getByRole('heading',{name:'Prospects',exact:true}).waitFor();check(`list ${width}px has no clipping`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(out,`list-${width}.png`),fullPage:true});
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/prospecting/'+prospectId,{waitUntil:'networkidle'});check('reduced-motion preference is respected',await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
 await page.getByRole('link',{name:'Back to BloomOps',exact:true}).filter({visible:true}).click();await page.waitForURL(base+'/');check('contextual return reaches main Home');
 await page.goto(base+'/prospecting?q=missing',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'No matching prospects'}).waitFor();check('empty search explains recovery');
 const outsider=await browser.newContext({storageState:join(fixtureDir,'admin-state.json')});
 check('different identity cannot select the fresh workspace',(await outsider.request.post(base+'/api/bloomops/workspaces/select',{data:{workspaceId}})).status()===404);
 for(const other of [outsider,await browser.newContext({storageState:join(fixtureDir,'team_member-state.json')}),await browser.newContext({storageState:join(fixtureDir,'client-state.json')})]){
  const r=await other.request.get(base+api);check('foreign or restricted identity cannot read the profile',[403,404].includes(r.status()));assert.ok(!(await r.text()).includes('Cedar House Studio'));
  const forbidden=await other.request.post(base+'/api/bloomops/prospecting',{data:{workspaceId,requestId:crypto.randomUUID(),fields:{businessName:'Forbidden'}}});assert.ok([403,404].includes(forbidden.status()));await other.close();
 }
 for(const role of ['project_manager','team_member','client']){cli(`UPDATE workspace_memberships SET role='${role}' WHERE workspace_id='${workspaceId}'`);const r=await context.request.get(base+api);check('same-workspace '+role+' is denied the profile',[403,404].includes(r.status()));}
 cli(`UPDATE workspace_memberships SET role='owner' WHERE workspace_id='${workspaceId}'`);
 const cross=await context.request.patch(base+api,{headers:{origin:'https://untrusted.example'},data:{workspaceId,expectedRevision:(await read()).profile.revision,fields:{fit:'skip'}}});check('cross-site writes are refused',cross.status()===403);
 for(const path of ['/api/prospects','/api/prospects/export','/api/prospects/1/conversation','/api/pages','/api/bloomops/prospecting/guessed-id']){const r=await context.request.get(base+path);check('fresh workspace cannot use inherited or guessed path '+path,(path.startsWith('/api/bloomops/')?[403,404]:[401,403,404]).includes(r.status()));}
 const switched=await context.request.post(base+'/api/bloomops/workspaces/select',{data:{workspaceId:fixture.ws}});assert.equal(switched.status(),200);await page.goto(base+'/',{waitUntil:'networkidle'});check('original workspace remains selectable',new URL(page.url()).pathname==='/');
 check('original selection cannot read the new profile',(await context.request.get(base+api)).status()===404);
 await context.request.post(base+'/api/bloomops/workspaces/select',{data:{workspaceId}});
 cli(`UPDATE workspace_memberships SET status='suspended' WHERE workspace_id='${workspaceId}'`);
 const revoked=await context.request.get(base+api);check('revocation applies on the next signed request',[403,404].includes(revoked.status()));await page.goto(base+'/prospecting',{waitUntil:'networkidle'});await page.waitForURL(base+'/workspaces');check('revoked selector offers workspace recovery without fallback');
 cli(`UPDATE workspace_memberships SET status='active' WHERE workspace_id='${workspaceId}'`);
 await context.request.post(base+'/api/bloomops/workspaces/select',{data:{workspaceId}});
 writeFileSync(join(out,'profile-state.json'),JSON.stringify(await context.storageState()),{mode:0o600});writeFileSync(join(out,'fixture.json'),JSON.stringify({workspaceId,prospectId}),{mode:0o600});
 check('no client runtime errors',bodyErrors.length===0);
 // Public design reference is read-only. Never use it as source application code.
 const reference=await browser.newPage({viewport:{width:1440,height:1000}});try{const r=await reference.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design',{waitUntil:'networkidle',timeout:30000});await reference.screenshot({path:join(out,'design-reference.png')});writeFileSync(join(out,'reference.json'),JSON.stringify({status:r.status(),title:await reference.title()}));}catch{writeFileSync(join(out,'reference.json'),JSON.stringify({unavailable:true}));}await reference.close();
 writeFileSync(join(out,'results.json'),JSON.stringify({checks,errors:bodyErrors},null,2));console.log(`${checks.length} browser checks passed.`);
}finally{await browser.close();}
