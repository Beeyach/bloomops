// Actual built-Worker N2B checks on isolated synthetic development data.
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
const preview='/client-preview/james/c-james',api='/api/bloomops/client-preview/james/c-james';
try{
 const {ctx,page}=await login('ellen@example.com');
 sql("INSERT OR IGNORE INTO client_contacts(id,workspace_id,client_id,name,user_id) VALUES('preview-second','a','james','Second contact','lawrence')");
 const bytes=Buffer.from('Preview QA file');
 const upload=await ctx.request.post(base+'/api/bloomops/projects/website/files',{headers:{origin:base,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify({requestId:randomUUID(),filename:'Shared preview brief.txt',mimeType:'text/plain',byteSize:bytes.length,visibility:'client',deliverableId:null}))},data:bytes});
 assert.equal(upload.status(),201);const file=(await upload.json()).fileId;
 await page.getByRole('link',{name:'Preview as client',exact:true}).click();
 check('client entry opens a connected-contact picker',await page.getByRole('heading',{name:'Preview as client',exact:true}).count()===1);
 await page.getByRole('link',{name:/Preview as James/i}).click();
 await page.getByRole('heading',{name:/Hello/}).waitFor();
 const cookies=await ctx.cookies();
 const stream=await(await ctx.request.get(base+preview)).text();
 check('loading state honestly checks current access',stream.includes('Checking access and loading shared work'));
 const exit=page.getByRole('link',{name:'Exit preview',exact:true});await exit.focus();
 check('keyboard exit has a visible focus indicator',await exit.evaluate(e=>getComputedStyle(e).outlineStyle!=='none'));
 check('preview uses separate chrome and selected contact',page.url().endsWith(preview)&&(await page.locator('body').innerText()).includes('Client preview')&&await page.locator('.bo-sidebar').count()===0);
 const text=await page.locator('main').innerText();
 check('only client-visible work and onboarding are rendered',text.includes('Autumn website launch')&&!text.includes('PRIVATE')&&!text.includes('Other client project')&&!text.includes('Review the homepage copy'));
 check('no onboarding or approval mutation controls',await page.getByRole('button',{name:/Confirm completed|Submit for verification|Approve|Request changes/}).count()===0);
 check('ready shared file downloads through current preview authority',(await ctx.request.get(base+api+'/files/'+file)).status()===200);
 check('missing/direct private file remains unavailable',(await ctx.request.get(base+api+'/files/private-file')).status()===404);
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('.bo-portal-content-nav a,button,.bo-btn')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&innerWidth<=767&&r.height<43;}).map(e=>e.textContent)}));
  check('preview layout and targets at '+width,!geometry.overflow&&!geometry.small.length);
  await page.screenshot({path:`${out}/home-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:'Content',exact:true}).click();await page.getByRole('heading',{name:'Your content',exact:true}).waitFor();
 check('content listing reuses client eligibility',await page.getByRole('heading',{name:'Your content'}).count()===1);
 await page.goto(base+preview+'/content/'+fixture.content,{waitUntil:'domcontentloaded'});await loaded(page);await page.getByRole('heading',{name:'A useful idea',exact:true}).waitFor();
 check('content detail is functional and private copy absent',(await page.locator('main').innerText()).includes('A useful idea')&&!(await page.locator('main').innerText()).includes('PRIVATE_PILLAR'));
 await page.getByRole('link',{name:'Approval needed',exact:true}).click();await page.getByRole('heading',{name:'Approval needed',exact:true}).waitFor();
 check('approval snapshot can be read but cannot be submitted',(await page.locator('main').innerText()).includes('Review this caption')&&await page.getByRole('button',{name:'Approve',exact:true}).count()===0);
 await page.goto(base+preview+'/pages/'+fixture.root,{waitUntil:'domcontentloaded'});await loaded(page);
 check('shared Page document and subpage links render',await page.getByRole('heading',{name:'Client welcome guide'}).count()===1&&await page.getByRole('link',{name:'brand checklist',exact:true}).count()===1);
 check('Page editing/comments/actions stay inert',await page.locator('[contenteditable="true"],textarea').count()===0&&await page.locator('a[href="/api/auth/sign-out"]').count()===0&&await page.locator('input:not(:disabled)').count()===0);
 check('authored file URLs use preview endpoint',await page.locator('a[href="'+api+'/files/private-file"]').count()===1&&await page.locator('img[src="/api/bloomops/files/private-file/download"]').count()===0);
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,glyphs:[...document.querySelectorAll('.bo-page-glyph')].every(e=>{const r=e.getBoundingClientRect();return r.width<=24&&r.height<=24;}),heading:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize)}));
  check('Page typography and compact icons at '+width,!layout.overflow&&layout.glyphs&&layout.heading>=24);
 }
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:out+'/page-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'brand checklist',exact:true}).click();await page.getByRole('heading',{name:'Shared brand checklist',exact:true}).waitFor();
 check('nested Page destination rechecks inherited sharing',await page.getByRole('heading',{name:'Shared brand checklist'}).count()===1);
 await page.setViewportSize({width:390,height:1000});await page.screenshot({path:out+'/page-phone.png',fullPage:true});
 await page.goto(base+preview+'/pages/'+fixture.secret,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'There is nothing here',exact:true}).waitFor();
 check('private Page cannot be opened directly',!(await page.locator('body').innerText()).includes('PRIVATE agency notes'));
 check('preview routes reject POST',(await ctx.request.post(base+api,{headers:{origin:base},data:{action:'approve'}})).status()===405);
 check('ordinary portal action still uses staff identity and is denied',(await ctx.request.post(base+'/api/bloomops/portal/approvals/'+fixture.round,{headers:{origin:base},data:{decision:'approved',feedback:null}})).status()!==200);
 await page.goto(base+preview,{waitUntil:'domcontentloaded'});await loaded(page);
 await page.getByRole('link',{name:'Change contact',exact:true}).click();await page.getByRole('heading',{name:'Preview as client',exact:true}).waitFor();
 await page.getByRole('link',{name:'Preview as Second contact',exact:true}).click();await page.getByRole('heading',{name:/Hello/}).waitFor();
 check('switching contact changes person-specific Page eligibility',page.url().endsWith('/client-preview/james/preview-second')&&await page.getByRole('link',{name:'Pages',exact:true}).count()===0);
 sql("UPDATE client_contacts SET user_id=NULL WHERE id='c-lawrence'");
 await page.goto(base+'/clients/lawrence/preview',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'No connected client account',exact:true}).waitFor();
 check('unconnected client has an honest empty preview picker',await page.getByRole('link',{name:/Preview as /}).count()===0);
 sql("UPDATE client_contacts SET user_id='lawrence' WHERE id='c-lawrence'");
 await page.goto(base+preview+'/content?view=invalid',{waitUntil:'domcontentloaded'});await page.getByText('Choose an available content view and page.',{exact:false}).waitFor();
 check('invalid content filter offers a working reset',await page.getByRole('link',{name:'Reset view',exact:true}).count()===1);
 check('preview never replaces session cookies',JSON.stringify(await ctx.cookies())===JSON.stringify(cookies));
 const staff=await login('sam@example.com');check('client-assigned staff may preview',(await staff.ctx.request.get(base+api)).status()===200);
 sql("DELETE FROM client_assignments WHERE membership_id='m-sam' AND client_id='james'");
 check('removed assignment rejects the next request',(await staff.ctx.request.get(base+api)).status()===404);
 const client=await login('james@example.com');check('client session cannot enter internal preview',(await client.ctx.request.get(base+api)).status()===404);
 const other=await login('other@example.com');check('unassigned member cannot enumerate contacts',(await other.ctx.request.get(base+'/clients/james/preview')).status()===404);
 await page.goto(base+preview,{waitUntil:'domcontentloaded'});await loaded(page);
 sql("UPDATE client_contacts SET user_id=NULL WHERE id='c-james'");
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByText('Preview is unavailable. Access changed or could not be checked.').waitFor();
 check('open preview removes content when access check fails',await page.getByRole('heading',{name:/Hello/}).count()===0);
 check('revoked contact loses file access',(await ctx.request.get(base+api+'/files/'+file)).status()===404);
 await page.goto(base+preview+'/pages/'+fixture.root,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'There is nothing here',exact:true}).waitFor();
 check('revoked contact loses direct Page access',await page.getByRole('heading',{name:'Client welcome guide',exact:true}).count()===0);
 sql("UPDATE client_contacts SET user_id='james' WHERE id='c-james'");
 sql("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
 await page.goto(base+preview,{waitUntil:'domcontentloaded'});await loaded(page);await page.getByRole('link',{name:'Exit preview',exact:true}).click();await page.locator('[data-client-overview]').waitFor();
 check('exit returns to unchanged staff client view',await page.locator('[data-client-overview]').count()===1);
 check('no browser runtime errors',errors.length===0);
 writeFileSync(out+'/browser-results.json',JSON.stringify({checks,errors},null,2));console.log(checks.length+' checks passed');
}catch(error){console.error(String(error.message).replace(/https?:\/\/\S*magic-link\S*/g,'[local auth URL]'));process.exitCode=1;}
finally{await browser.close();}
