#!/usr/bin/env node
// Synthetic local Worker acceptance only. Captured R2 mail never leaves this
// process or appears in logs. External destination is an intercepted fixture.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const base=arg('--url','http://localhost:8787'),out=resolve(arg('--out','/tmp/bloomops-pilot-onboarding/browser'));
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const require=createRequire(join(resolve(arg('--playwright','/tmp/bloomops-c6-tools')),'package.json'));
const {chromium}=require('playwright');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});let checks=0,captures=0;const errors=[];
const check=(label,value)=>{assert.ok(value,label);checks++;console.log('ok '+label);};
const wrangler=(args)=>execFileSync('npx',['--no-install','wrangler',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
const mail=email=>{
 const raw=wrangler(['r2','object','get',`bloomops-files-dev/dev-mail/${createHash('sha256').update(email).digest('hex')}.json`,'--local','--pipe']);
 return JSON.parse(raw.slice(raw.indexOf('{')));
};
const request=async(context,path,body,status=200)=>{
 const res=await context.request.post(base+path,{headers:{origin:base},data:body});
 assert.equal(res.status(),status,`POST ${path}: ${await res.text()}`);return res.json();
};
async function login(email,next='/'){
 const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await request(context,'/api/auth/sign-in/magic-link',{email,callbackURL:next,newUserCallbackURL:next,errorCallbackURL:'/sign-in'});
 const url=mail(email).text.match(/https?:\/\/\S+/)[0];assert.ok(url.startsWith(base+'/api/auth/magic-link/verify?'));
 await page.goto(url);return{context,page};
}
async function capture(label,page,width){
 await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);
 check(`${label} ${width}px has no overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check(`${label} ${width}px controls fit`,await page.locator('button,input,textarea,select,a.bo-btn').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth&&(innerWidth>390||r.height>=44);}))); 
 await page.screenshot({path:join(out,`${label}-${width}.png`),animations:'disabled',fullPage:await page.getByRole('dialog').count()===0});captures++;
}
try{
 const reference=await browser.newPage();
 try{await reference.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design',{waitUntil:'domcontentloaded',timeout:15000});await reference.getByText('Palette',{exact:true}).first().waitFor({timeout:15000});await reference.screenshot({path:join(out,'reference.png'),fullPage:true});console.log('Design reference fetched for visual inspection.');}catch{console.log('Design reference unavailable; repository tokens used.');}finally{await reference.close();}
 const owner=await login('pilot-owner@example.test');const p=owner.page; owner.context.setDefaultTimeout(20000);
 await p.goto(base+'/clients/new');
 const email=`pilot-client-${randomUUID()}@example.test`;
 await p.getByLabel('Client or company name').fill('Pilot — Guidance Review');await p.getByLabel('Primary contact name').fill('Demo Contact');await p.getByLabel('Primary contact email').fill(email);
 await p.getByRole('button',{name:'Add client',exact:true}).click();await p.waitForURL(url => /^\/clients\/[^/]+$/.test(url.pathname) && url.pathname !== '/clients/new');const clientId=new URL(p.url()).pathname.split('/').at(-1);
 await p.getByRole('link',{name:'Services',exact:true}).click();await p.getByRole('button',{name:'Add service',exact:true}).click();
 const dialog=p.getByRole('dialog');await dialog.getByLabel('Service',{exact:true}).selectOption({label:'Kajabi · Systems'});await dialog.getByRole('button',{name:'Add service',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await p.getByRole('button',{name:'Add service',exact:true}).click();
 const socialOption=dialog.getByLabel('Service',{exact:true}).locator('option').filter({hasText:/^Social(?: Media(?: Management)?)? · Social$/});
 await dialog.getByLabel('Service',{exact:true}).selectOption(await socialOption.getAttribute('value'));await dialog.getByRole('button',{name:'Add service',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await p.getByRole('button',{name:'Activate Client',exact:true}).click();await p.getByText('Client activated. The portal invitation has been sent.',{exact:true}).waitFor();
 const token=mail(email).text.match(/\/invite\/([A-Za-z0-9_-]+)/)[1];const client=await login(email,'/invite/'+token);const c=client.page; client.context.setDefaultTimeout(20000);
 await c.getByRole('button',{name:'Accept and continue'}).click();await c.waitForURL('**/portal');
 check('unconfigured steps explain agency setup',await c.getByText('Your team is preparing the instructions and destination for this step.').count()>0);
 check('unconfigured steps offer no misleading confirmation',await c.getByRole('button',{name:'Confirm completed'}).count()===0);
 await capture('waiting',c,390);
 await p.goto(base+`/clients/${clientId}?tab=onboarding`);
 const row=(page,title)=>page.locator('li.bo-onboarding-item').filter({has:page.getByRole('heading',{name:title,exact:true})});
 check('responsibility, audience and verification are separate readable badges',await row(p,'Instagram access').getByRole('list',{name:'Step details'}).innerText().then(text=>['Client task','Client-visible','Verification required'].every(label=>text.includes(label))&&!text.includes('·')));
 check('metadata badge colors distinguish their meanings',await row(p,'Instagram access').locator('.bo-onboarding-badge').evaluateAll(nodes=>new Set(nodes.map(n=>getComputedStyle(n).backgroundColor)).size===3));
 check('Instagram access uses the Instagram mark',await row(p,'Instagram access').locator('.bo-onboarding-art-instagram svg').count()===1);
 check('course videos use a video icon',await row(p,'Course videos').locator('.bo-onboarding-art-video svg').count()===1);
 for(const width of [1440,1024,768,390,320])await capture('agency-badges',p,width);
 await p.setViewportSize({width:1440,height:900});
 async function configure(title,type,url,instructions){
  console.log(`Configuring ${title}`);
  await row(p,title).getByRole('button',{name:/Set up step|Edit instructions/}).click();
  const d=p.getByRole('dialog');await d.getByLabel('Client instructions').fill(instructions);await d.getByLabel('Client action').selectOption(type);
  if(url)await d.getByLabel('Destination link').fill(url);
  await d.getByRole('button',{name:'Save instructions'}).click();await d.waitFor({state:'hidden'});await row(p,title).getByRole('button',{name:'Edit instructions'}).waitFor();
 }
 await configure('Brand assets','upload','https://uploads.example.com/pilot','Upload your logo files and brand guide to this private folder.');
 await configure('Agreement','agreement','https://agreements.example.com/pilot','Review and sign the agreement at this link.');
 await configure('Kajabi access','confirmation',null,'Invite pilot-agency@example.test to your demo site, then submit for our review.');
 // Exercise the stale-open-editor case with a second request changing guidance.
 await row(p,'Brand assets').getByRole('button',{name:'Edit instructions'}).click();
 const apiPath=`/api/bloomops/clients/${clientId}/onboarding`;
 const getItems=async()=> (await(await owner.context.request.get(base+apiPath)).json()).onboarding.items;
 let assets=(await getItems()).find(i=>i.title==='Brand assets');
 await request(owner.context,`${apiPath}/items/${assets.id}/configure`,{revision:assets.guidanceRevision,instructions:'Upload your current logo and brand guide to this private folder.',actionType:'upload',actionUrl:assets.actionUrl});
 await p.getByRole('dialog').getByRole('button',{name:'Save instructions'}).click();await p.getByRole('dialog').getByText(/This step has changed/).waitFor();check('stale open editor cannot overwrite current guidance',true);
 await p.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await p.reload();await c.reload();
 await client.context.route('https://uploads.example.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Demo upload destination</h1>'}));
 const newPage=client.context.waitForEvent('page');await row(c,'Brand assets').getByRole('link',{name:/Open upload folder/}).click();const upload=await newPage;await upload.getByRole('heading',{name:'Demo upload destination'}).waitFor();
 check('asset action opens the configured destination',true);await upload.close();
 check('opening a destination does not complete the step',await row(c,'Brand assets').getByRole('button',{name:'Confirm completed'}).isVisible());
 const link=row(c,'Agreement').getByRole('link',{name:/Open agreement/});check('external agreement link suppresses referrer and opener',await link.getAttribute('rel')==='noopener noreferrer'&&await link.getAttribute('referrerpolicy')==='no-referrer');
 check('essential actions have line icons',await c.locator('.bo-onboarding-controls .bo-btn svg').count()>0);
 check('portal excludes agency metadata badges',await c.getByRole('list',{name:'Step details'}).count()===0);
 check('portal retains Instagram and video identities before setup',await row(c,'Instagram access').locator('.bo-onboarding-art-instagram').count()===1&&await row(c,'Course videos').locator('.bo-onboarding-art-video').count()===1);
 check('repeated Your steps heading removed',await c.getByRole('heading',{name:'Your steps',exact:true}).count()===0);
 for(const width of [1440,1024,768,390,320])await capture('actionable',c,width);
 await c.emulateMedia({reducedMotion:'reduce'});await capture('reduced-motion',c,390);
 await row(c,'Brand assets').getByRole('button',{name:'Confirm completed'}).click();await c.getByRole('button',{name:'Show completed (1)'}).waitFor();await c.reload();
 check('completed confirmation persists and collapses',await row(c,'Brand assets').count()===0);
 await c.getByRole('button',{name:'Show completed (1)'}).click();await row(c,'Brand assets').getByText('Complete',{exact:true}).waitFor();check('completed history remains accessible',true);
 check('completion retains the asset icon and shows a separate success status',await row(c,'Brand assets').locator('.bo-onboarding-art-assets').count()===1&&await row(c,'Brand assets').getByText('Complete',{exact:true}).getAttribute('class').then(value=>value.includes('bo-status-success')));
 await row(c,'Kajabi access').getByRole('button',{name:'Submit for verification'}).click();await c.getByText('Thank you. We’ll check this step and confirm it for you.').waitFor();await p.reload();
 await row(p,'Kajabi access').getByRole('button',{name:'Verify step'}).click();await row(p,'Kajabi access').getByText('Completed',{exact:true}).waitFor();await c.reload();
 check('team verification remains separate from Client submission',await c.getByRole('button',{name:'Show completed (2)'}).isVisible());
 await p.setViewportSize({width:390,height:900});await row(p,'Agreement').getByRole('button',{name:'Edit instructions'}).click();
 check('editor starts with keyboard focus on instructions',await p.getByRole('dialog').getByLabel('Client instructions').evaluate(e=>e===document.activeElement));
 for(const width of [1440,1024,768,390,320])await capture('setup',p,width);
 await p.keyboard.press('Escape');check('editor closes with Escape',await p.getByRole('dialog').count()===0);
 // Internal identity cannot reuse its session on the Client-only endpoint.
 const forbidden=await owner.context.request.get(base+`/api/bloomops/portal/onboarding/${clientId}`);check('internal session cannot read Client-only endpoint',forbidden.status()===403);
 const literals = value => "'" + value.replaceAll("'", "''") + "'";
 wrangler(['d1','execute','DB','--local','--command',`UPDATE client_contacts SET user_id=NULL WHERE client_id=${literals(clientId)}`]);
 const revoked=await client.context.request.get(base+`/api/bloomops/portal/onboarding/${clientId}`);
 check('issued Client session loses onboarding after contact unlink',revoked.status()===404);
 const denied=await client.context.request.post(base+`/api/bloomops/portal/onboarding/${clientId}/items/${assets.id}/submit`,{headers:{origin:base},data:{guidanceRevision:assets.guidanceRevision}});
 check('revoked Client cannot confirm a known step',denied.status()===404);
 await c.reload();check('revoked portal no longer exposes configured destinations',await c.getByRole('link',{name:/Open agreement|Open upload folder/}).count()===0);
 check('no page errors',errors.length===0);
 console.log(`Pilot onboarding browser: ${checks} checks passed; ${captures} captures. Synthetic local mail only; external destination intercepted, no actual upload claimed.`);
}finally{await browser.close();}
