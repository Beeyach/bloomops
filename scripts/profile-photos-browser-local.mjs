// Actual built-Worker N2C acceptance. Task-only synthetic DB/R2 and local captured mail.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const base=process.env.BLOOMOPS_BROWSER_BASE,out=process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR;
assert.ok(base&&out&&['localhost','127.0.0.1'].includes(new URL(base).hostname));
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const fixture=JSON.parse(readFileSync('.task-tmp/preview-fixture.json'));
const {chromium}=createRequire('/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});mkdirSync(out,{recursive:true});
const checks=[],errors=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
const cli=args=>execFileSync('npx',['--no-install','wrangler',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const sql=command=>cli(['d1','execute','DB','--local','--command',command]);
async function login(email){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/clients/james'}})).status(),200);
 const mail=cli(['r2','object','get',`bloomops-files-dev/dev-mail/${createHash('sha256').update(email).digest('hex')}.json`,'--local','--pipe']);
 const url=JSON.parse(mail.slice(mail.indexOf('{'))).text.match(/https?:\/\/\S+/)[0];assert.ok(url.startsWith(base+'/api/auth/magic-link/verify?'));
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});return{ctx,page};
}
const loaded=async page=>{await page.locator('main[aria-busy="true"]').waitFor({state:'hidden'});await page.locator('main').waitFor();};
const photo='/api/bloomops/profile/photo';
try{
 const {ctx,page}=await login('ellen@example.com');
 let releaseInfo;const infoHold=new Promise(resolve=>{releaseInfo=resolve;});
 await page.route('**/api/bloomops/profile/photo?info=1',async route=>{await infoHold;await route.continue();});
 await page.goto(base+'/profile',{waitUntil:'domcontentloaded'});await page.getByText('Loading your photo…',{exact:true}).waitFor();check('loading keeps controls visibly unavailable',await page.getByRole('button',{name:'Upload photo',exact:true}).isDisabled());releaseInfo();await page.unroute('**/api/bloomops/profile/photo?info=1');await page.getByRole('button',{name:'Upload photo',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Upload photo'&&!e.disabled));
 check('personal profile is accessible without workspace settings',await page.getByRole('heading',{name:'Your profile',exact:true}).count()===1);
 const empty=await ctx.request.get(base+photo+'?info=1');check('empty account has a safe garden fallback',empty.ok()&&!(await empty.json()).hasPhoto&&await page.locator('.bo-profile-identity svg').count()===1);
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');g.fillStyle='#eeeafb';g.fillRect(0,0,640,480);g.fillStyle='#56bfa1';g.fillRect(60,90,220,320);g.fillStyle='#ff82c8';g.beginPath();g.arc(440,210,130,0,Math.PI*2);g.fill();return c.toDataURL('image/png').split(',')[1];});
 const png=Buffer.from(image,'base64');
 await page.locator('#profile-photo-file').setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')});
 await page.locator('.bo-photo-error [role=alert]').waitFor();check('unsupported input shows a readable error without a crop',await page.locator('canvas').count()===0);
 await page.locator('#profile-photo-file').setInputFiles({name:'local-test.png',mimeType:'image/png',buffer:png});await page.locator('canvas').waitFor();
 const zoom=page.getByLabel('Zoom',{exact:true});await zoom.focus();await page.keyboard.press('ArrowRight');check('crop controls work from the keyboard',Number(await zoom.inputValue())>1);
 await page.getByLabel('Horizontal position',{exact:true}).fill('30');
 for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+`/crop-${width}.png`,fullPage:true});
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('canvas').getBoundingClientRect().width,targets:[...document.querySelectorAll('.bo-photo-actions button,.bo-photo-adjustments input')].map(e=>e.getBoundingClientRect().height)}));
   check(`crop ${width}: readable layout and touch targets`,!geometry.overflow&&geometry.canvas<=256&&geometry.canvas>=200&&geometry.targets.every(h=>h>=43));
   if(width<=390){const save=page.getByRole('button',{name:'Save photo',exact:true});await save.scrollIntoViewIfNeeded();check(`crop ${width}: Save remains reachable above navigation`,await save.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));}
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.route('**/api/bloomops/profile/photo',async route=>{if(route.request().method()==='PUT')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary storage failure. Please retry.'})});else await route.continue();});
 await page.getByRole('button',{name:'Save photo',exact:true}).click();await page.locator('.bo-photo-error [role=alert]').waitFor();check('failed save preserves the selected crop',await page.locator('canvas').count()===1);
 await page.unroute('**/api/bloomops/profile/photo');
 await page.getByRole('button',{name:'Save photo',exact:true}).click();await page.getByText('Photo saved.',{exact:true}).waitFor();
 check('real Worker/R2 upload saves and closes the crop',await page.locator('canvas').count()===0);
 const binary=await ctx.request.get(base+photo);check('photo is a protected thumbnail',binary.ok()&&binary.headers()['content-type']==='image/png'&&binary.headers()['cache-control'].includes('no-store')&&(await binary.body()).length<300*1024);
 check('stored thumbnail is exactly 256 square',await page.locator('.bo-profile-identity img').evaluate(async e=>{await e.decode();return e.naturalWidth===256&&e.naturalHeight===256;}));
 await page.screenshot({path:out+'/saved-desktop.png',fullPage:true});
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Replace photo',exact:true}).waitFor();check('saved photo survives reload',await page.locator('.bo-profile-identity img').evaluate(async e=>{await e.decode();return e.naturalWidth===256;}));
 const blocked=await ctx.request.post(base+'/api/auth/update-user',{headers:{origin:base},data:{image:'https://example.invalid/unsafe.png'}});check('generic identity endpoint cannot bypass photo storage',blocked.status()===400);
 const comment=await ctx.request.post(base+`/api/bloomops/pages/${fixture.root}/comments`,{data:{workspaceId:'a',requestId:randomUUID(),threadId:null,expectedRevision:null,body:'Profile photo QA discussion'}});check('existing Page comment uses a real author',comment.ok());const commentId=(await comment.json()).id;
 const commentPhoto=`/api/bloomops/pages/${fixture.root}/comments/${commentId}/photo`;
 check('authorized staff Page author photo works',(await ctx.request.get(base+commentPhoto)).ok());
 check('Team photo honors the existing directory',(await ctx.request.get(base+'/api/bloomops/members/m-ellen/photo')).ok());
 const client=await login('james@example.com');
 check('client can see an authorized Page author photo',(await client.ctx.request.get(base+commentPhoto)).ok());
 check('client cannot enumerate Team photos',(await client.ctx.request.get(base+'/api/bloomops/members/m-ellen/photo')).status()===404);
 check('preview uses selected-contact photo authority',(await ctx.request.get(base+`/api/bloomops/client-preview/james/c-james/pages/${fixture.root}/photos/${commentId}`)).ok());
 check('foreign Page cannot borrow a comment photo',(await client.ctx.request.get(base+`/api/bloomops/pages/${fixture.secret}/comments/${commentId}/photo`)).status()===404);
 await page.goto(base+`/client-preview/james/c-james/pages/${fixture.root}`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Client welcome guide',exact:true}).waitFor();
 const previewImage=page.locator('main .bo-user-avatar img').first();await previewImage.waitFor();await previewImage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('main .bo-user-avatar img')].every(e=>e.naturalWidth===256&&getComputedStyle(e).opacity==='1'));check('preview discussion renders a visibly loaded protected author thumbnail',await previewImage.evaluate(e=>e.naturalWidth===256&&getComputedStyle(e).opacity==='1'));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+'/discussion-desktop.png',fullPage:true});
 await page.goto(base+'/profile',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Replace photo',exact:true}).waitFor();
 await client.page.goto(base+'/profile',{waitUntil:'domcontentloaded'});await client.page.getByRole('heading',{name:'Your profile',exact:true}).waitFor();check('Client has personal profile without internal navigation',await client.page.locator('.bo-sidebar').count()===0);
 const old=await(await ctx.request.get(base+photo+'?info=1')).json();
 await page.locator('#profile-photo-file').setInputFiles({name:'replace.png',mimeType:'image/png',buffer:png});await page.locator('canvas').waitFor();
 await page.route('**/api/bloomops/profile/photo',async route=>{if(route.request().method()==='PUT'){await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'Save photo',exact:true}).click();await page.locator('.bo-photo-error [role=alert]').waitFor();await page.unroute('**/api/bloomops/profile/photo');
 await page.getByRole('button',{name:'Save photo',exact:true}).click();await page.getByText('Photo saved.',{exact:true}).waitFor();check('lost response retries the same immutable upload',await page.locator('canvas').count()===0);
 check('stale removal cannot replace a later photo',(await ctx.request.delete(base+photo,{data:{expectedVersion:old.version,requestId:randomUUID()}})).status()===409);
 await page.getByRole('button',{name:'Remove photo',exact:true}).click();await page.getByText('Photo removed.',{exact:true}).waitFor();check('removal makes existing author URL unavailable',(await client.ctx.request.get(base+commentPhoto)).status()===404);
 check('removal restores the garden fallback',(await ctx.request.get(base+photo)).status()===404&&await page.locator('.bo-profile-identity svg').count()===1);
 for(const mime of ['image/jpeg','image/webp']){
   const encoded=await page.evaluate(type=>{const c=document.createElement('canvas');c.width=500;c.height=300;c.getContext('2d').fillRect(0,0,500,300);return c.toDataURL(type).split(',')[1];},mime);
   await page.locator('#profile-photo-file').setInputFiles({name:'sample.'+(mime==='image/jpeg'?'jpg':'webp'),mimeType:mime,buffer:Buffer.from(encoded,'base64')});await page.locator('canvas').waitFor();check(`${mime} source opens a safe crop`,await page.locator('canvas').count()===1);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 await page.screenshot({path:out+'/profile-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:1000});await page.screenshot({path:out+'/profile-phone.png',fullPage:true});
 const anonymous=await browser.newContext();check('unauthenticated photo reads are refused',(await anonymous.request.get(base+photo)).status()===401);
 check('no browser runtime errors',errors.length===0);
 writeFileSync(out+'/browser-results.json',JSON.stringify({checks,errors},null,2));console.log(checks.length+' checks passed');
}catch(error){console.error(String(error.message).replace(/https?:\/\/\S*magic-link\S*/g,'[local auth URL]'));process.exitCode=1;}
finally{await browser.close();}
