// N2D actual Worker/browser acceptance. Fictional local DB and r2-dev only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.BLOOMOPS_BROWSER_BASE,out=process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR;
assert.ok(base&&out&&['localhost','127.0.0.1'].includes(new URL(base).hostname));
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const {chromium}=createRequire('/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});mkdirSync(out,{recursive:true});
const checks=[],errors=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
const cli=args=>execFileSync('npx',['--no-install','wrangler',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
async function login(email){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/'}})).status(),200);
 const mail=cli(['r2','object','get',`bloomops-files-dev/dev-mail/${createHash('sha256').update(email).digest('hex')}.json`,'--local','--pipe']);const url=JSON.parse(mail.slice(mail.indexOf('{'))).text.match(/https?:\/\/\S+/)[0];assert.ok(url.startsWith(base+'/api/auth/magic-link/verify?'));
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push({path:new URL(page.url()).pathname,message:e.message}));await page.goto(url,{waitUntil:'domcontentloaded'});return {ctx,page};}
const api='/api/bloomops/discussions/project/website';
const input=(patch={})=>({workspaceId:'a',requestId:randomUUID(),threadId:null,audience:'internal',body:'Local discussion QA '+randomUUID(),mentions:[],...patch});
async function post(ctx,path,payload){const response=await ctx.request.post(base+path,{headers:{origin:base},data:payload});return {status:response.status(),data:await response.json()};}
if(process.env.BLOOMOPS_DISCUSSION_VISUAL_ONLY==='true'){
 try{
  const row=JSON.parse(cli(['d1','execute','DB','--local','--command',"SELECT id FROM record_discussion_threads WHERE parent_type='project' AND parent_id='website' AND audience='client' ORDER BY created_at DESC,id DESC LIMIT 1",'--json']))[0].results[0];assert.ok(row);
  const {page}=await login('ellen@example.com');await page.goto(base+'/discussions/project/website?threadId='+row.id,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Refresh'&&!e.disabled));
  for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
   check(`heading ${width}: Bloomsi font and no overflow`,await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily.includes('Bricolage')&&document.documentElement.scrollWidth<=innerWidth));
   if(width===1440)await page.screenshot({path:out+'/thread-1440.png',fullPage:true});
   const reply=page.getByLabel('Reply',{exact:true});await reply.fill('Layout check');const button=page.getByRole('button',{name:'Post reply',exact:true});await button.evaluate(e=>e.scrollIntoView({block:'center'}));
   check(`heading ${width}: reply target remains reachable`,await button.evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=43&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
   if(width===390)await page.screenshot({path:out+'/composer-390.png'});await reply.fill('');
  }
  check('typography pass has no runtime errors',errors.length===0);writeFileSync(out+'/visual-results.json',JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
 process.exit(0);
}
try{
 const {ctx,page}=await login('ellen@example.com');
 await page.goto(base+'/discussions/project/website',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Autumn website launch',exact:true}).waitFor();
 check('full-page parent identity and return link',await page.getByRole('link',{name:'Back to project',exact:true}).getAttribute('href')==='/work/projects/website');
 const writing=page.getByLabel('New discussion',{exact:true});await writing.fill('Please review the homepage direction before Friday.');
 await page.getByRole('button',{name:'@ Mention',exact:true}).focus();await page.keyboard.press('Enter');await page.getByLabel('Find a person',{exact:true}).waitFor();check('mention control opens from the keyboard',true);await page.getByLabel('Find a person',{exact:true}).fill('ary');await page.getByRole('button',{name:/^ary$/i}).click();
 check('mention picker uses actual permitted people',await page.getByRole('list',{name:'Selected mentions'}).innerText().then(t=>/ary/i.test(t)));
 let lost=false;
 await page.route('**/api/bloomops/discussions/project/website',async route=>{if(route.request().method()==='POST'&&!lost){lost=true;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Response interrupted. Retry your comment.'})});}else await route.continue();});
 await page.getByRole('button',{name:'Post comment',exact:true}).click();await page.getByRole('alert').filter({hasText:'Response interrupted'}).waitFor();check('lost response preserves body and selected mentions',await writing.inputValue()==='Please review the homepage direction before Friday.'&&await page.getByRole('list',{name:'Selected mentions'}).count()===1);
 await page.getByRole('button',{name:'Post comment',exact:true}).click();await page.getByLabel('Reply',{exact:true}).waitFor();await page.unroute('**/api/bloomops/discussions/project/website');
 const root=new URL(page.url()).searchParams.get('threadId');assert.ok(root);let data=await(await ctx.request.get(base+api+'?threadId='+root)).json();check('same request retry posts once with a real stored mention',data.messages.length===1&&data.messages[0].mentions.length===1);
 await page.getByLabel('Reply',{exact:true}).fill('The revised copy is ready for review.');await page.getByRole('button',{name:'Post reply',exact:true}).click();await page.getByText('The revised copy is ready for review.',{exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Refresh'&&!e.disabled));
 check('reply appears without shell navigation',new URL(page.url()).searchParams.get('threadId')===root);
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:out+`/thread-${width}.png`,fullPage:true});
  check(`thread ${width}: no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const reply=page.getByLabel('Reply',{exact:true});await reply.fill('Layout check');const save=page.getByRole('button',{name:'Post reply',exact:true});await save.evaluate(e=>e.scrollIntoView({block:"center"}));
  const target=await save.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {height:r.height,top:r.top,hit:hit?.outerHTML,reachable:r.height>=43&&e.contains(hit),scroll:document.scrollingElement.scrollTop,max:document.scrollingElement.scrollHeight-innerHeight};});if(!target.reachable)console.log(JSON.stringify({width,target}));check(`thread ${width}: Post target reachable`,target.reachable);if(width===390)await page.screenshot({path:out+'/composer-390.png'});await reply.fill('');
 }
 await page.setViewportSize({width:1440,height:1000});
 let releaseRead;const heldRead=new Promise(resolve=>{releaseRead=resolve;});await page.route('**/api/bloomops/discussions/project/website?*',async route=>{if(!route.request().url().includes('access=true'))await heldRead;await route.continue();});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Loading discussion…',{exact:true}).waitFor();check('refresh keeps visible messages and exposes a loading state',await page.getByText('The revised copy is ready for review.',{exact:true}).count()===1);releaseRead();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Refresh'&&!e.disabled));await page.unroute('**/api/bloomops/discussions/project/website?*');
 await page.getByRole('button',{name:'Edit comment by ellen',exact:true}).first().click();const edit=page.getByLabel('Edit comment',{exact:true});await edit.fill('Please review the updated homepage direction.');
 await page.route('**/api/bloomops/discussions/project/website',async route=>route.request().method()==='PATCH'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary edit failure.'})}):route.continue());
 await page.getByRole('button',{name:'Save comment',exact:true}).click();await page.getByRole('alert').filter({hasText:'Temporary edit failure.'}).waitFor();check('failed edit preserves writing and explicit Save',await edit.inputValue()==='Please review the updated homepage direction.');await page.unroute('**/api/bloomops/discussions/project/website');
 await page.getByRole('button',{name:'Save comment',exact:true}).click();await page.getByText('Please review the updated homepage direction.',{exact:true}).waitFor();await page.getByText('Edited',{exact:true}).waitFor();check('own edit persists and shows Edited',await page.getByText('Edited',{exact:true}).count()===1);
 await page.getByRole('button',{name:'Edit comment by ellen',exact:true}).first().click();await page.getByLabel('Edit comment',{exact:true}).fill('My final homepage feedback.');
 const current=(await(await ctx.request.get(base+api+'?threadId='+root)).json()).messages[0];const intervening=await ctx.request.patch(base+api,{headers:{origin:base},data:{workspaceId:'a',requestId:randomUUID(),threadId:root,commentId:current.id,expectedRevision:current.revision,body:'A newer saved comment from another tab.',mentions:[],remove:false}});assert.ok(intervening.ok());
 await page.getByRole('button',{name:'Save comment',exact:true}).click();await page.getByText('A newer saved comment from another tab.',{exact:true}).waitFor();check('edit conflict retains writing and displays the newer saved comment',await page.getByLabel('Edit comment',{exact:true}).inputValue()==='My final homepage feedback.');await page.getByRole('button',{name:'Save my version',exact:true}).click();await page.getByLabel('Edit comment',{exact:true}).waitFor({state:'hidden'});check('explicit conflict save uses the displayed newer revision',(await(await ctx.request.get(base+api+'?threadId='+root)).json()).messages[0].body==='My final homepage feedback.');
 await page.getByRole('button',{name:'Resolve',exact:true}).click();await page.getByRole('button',{name:'Reopen',exact:true}).waitFor();check('resolved discussion disables new replies',await page.getByLabel('Reply',{exact:true}).count()===0);await page.getByRole('button',{name:'Reopen',exact:true}).click();await page.getByLabel('Reply',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Remove comment by ellen',exact:true}).first().click();await page.getByText('Comment removed',{exact:true}).waitFor();check('removal keeps replies and a placeholder',await page.getByText('The revised copy is ready for review.',{exact:true}).count()===1);
 const shared=await post(ctx,api,input({audience:'client',body:'Your website preview is ready. What do you think?',mentions:['m-james']}));check('client-visible thread stores selected contact mention',shared.status===200);const sharedId=shared.data.threadId;
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#c8e7db';g.fillRect(0,0,256,256);g.fillStyle='#745983';g.beginPath();g.arc(128,128,72,0,Math.PI*2);g.fill();return c.toDataURL('image/png').split(',')[1];});
 const info=await(await ctx.request.get(base+'/api/bloomops/profile/photo?info=1')).json();const saved=await ctx.request.put(base+'/api/bloomops/profile/photo',{headers:{origin:base,'content-type':'image/png','if-match':info.version,'x-request-id':randomUUID()},data:Buffer.from(png,'base64')});check('real local author thumbnail is saved',saved.ok());
 const {ctx:client,page:clientPage}=await login('james@example.com');
 check('client cannot read internal thread', (await client.request.get(base+api+'?threadId='+root)).status()===404);
 await clientPage.goto(base+'/portal/discussions/project/website?threadId='+sharedId,{waitUntil:'domcontentloaded'});await clientPage.getByText('Your website preview is ready. What do you think?',{exact:true}).waitFor();
 check('client can read the shared discussion and reply',await clientPage.getByLabel('Reply',{exact:true}).count()===1);
 await clientPage.waitForFunction(()=>[...document.querySelectorAll('img')].some(i=>i.src.includes('/discussions/')&&i.complete&&i.naturalWidth===256));check('authorized author thumbnail renders visibly',await clientPage.locator('img[src*="/discussions/"]').evaluate(e=>Number(getComputedStyle(e).opacity)===1));
 await clientPage.getByRole('button',{name:'@ Mention',exact:true}).click();await clientPage.getByLabel('Find a person').fill('ary');await clientPage.getByText('No available people.',{exact:true}).waitFor();check('client mention search does not expose a staff directory',true);await clientPage.getByRole('button',{name:'@ Mention',exact:true}).click();
 await clientPage.getByLabel('Reply',{exact:true}).fill('The direction looks good. Please use the green version.');await clientPage.getByRole('button',{name:'Post reply',exact:true}).click();await clientPage.getByText('The direction looks good. Please use the green version.',{exact:true}).waitFor();
 await clientPage.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent==='Refresh'&&!e.disabled));
 await clientPage.setViewportSize({width:390,height:1000});await clientPage.screenshot({path:out+'/portal-390.png',fullPage:true});check('client phone layout fits',await clientPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(base+`/client-preview/james/c-james/discussions/project/website?threadId=${sharedId}`,{waitUntil:'domcontentloaded'});await page.getByText('Read-only client preview',{exact:true}).waitFor();
 check('preview preserves readable thread with no editor',await page.locator('textarea').count()===0&&await page.getByText('Your website preview is ready. What do you think?',{exact:true}).count()===1);
 const previewApi='/api/bloomops/client-preview/james/c-james/discussions/project/website';check('preview route has no mutation method',(await ctx.request.post(base+previewApi,{headers:{origin:base},data:input()})).status()===405);
 check('preview author photo uses contact authority',(await ctx.request.get(base+previewApi+'/photos/'+sharedId)).ok());
 await page.screenshot({path:out+'/preview-1440.png',fullPage:true});
 for(const [type,id] of [['client','james'],['action','copy'],['deliverable','guide']]){const result=await post(ctx,`/api/bloomops/discussions/${type}/${id}`,input());check(`${type}: canonical parent write and full page`,result.status===200);await page.goto(base+`/discussions/${type}/${id}?threadId=${result.data.threadId}`,{waitUntil:'domcontentloaded'});await page.getByLabel('Reply',{exact:true}).waitFor();}
 check('client cannot open task discussion',(await client.request.get(base+'/api/bloomops/discussions/action/copy')).status()===404);
 check('cross-origin mutation is refused',(await ctx.request.post(base+api,{headers:{origin:'https://other.example.invalid'},data:input()})).status()===403);
 const anonymous=await browser.newContext();check('anonymous direct read is refused',(await anonymous.request.get(base+api)).status()===401);await anonymous.close();
 await page.goto(base+'/discussions/project/website',{waitUntil:'domcontentloaded'});await page.getByLabel('New discussion',{exact:true}).waitFor();await page.screenshot({path:out+'/list-1440.png',fullPage:true});
 await page.route('**/api/bloomops/discussions/project/website?access=true*',route=>route.fulfill({status:403,contentType:'application/json',body:'{}'}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'Discussion unavailable',exact:true}).waitFor();check('failed access check clears displayed identity and comments',await page.getByRole('list').filter({hasText:'Your website preview is ready.'}).count()===0);await page.unroute('**/api/bloomops/discussions/project/website?access=true*');
 const touch=await browser.newContext({viewport:{width:390,height:900},isMobile:true,hasTouch:true});await touch.addCookies(await client.cookies());const touchPage=await touch.newPage();await touchPage.goto(base+'/portal/discussions/project/website?threadId='+sharedId,{waitUntil:'domcontentloaded'});await touchPage.getByRole('button',{name:'@ Mention',exact:true}).tap();await touchPage.getByLabel('Find a person').waitFor();check('real touch opens the mention picker',true);await touch.close();
 const absent='/api/bloomops/discussions/project/missing';check('missing parent is unavailable',(await ctx.request.get(base+absent)).status()===404);
 const report={checks,errors,health};writeFileSync(out+'/browser-results.json',JSON.stringify(report,null,2));check('no browser runtime errors',errors.length===0);writeFileSync(out+'/browser-results.json',JSON.stringify({checks,errors,health},null,2));
}finally{await browser.close();}
