// Real same-route account changes against an isolated synthetic Worker only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';

const arg=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const root=arg('--evidence','/home/ary/Developer/bloomops-n1-release-evidence');
const base=arg('--url','http://localhost:8801');
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/);
const fixture=JSON.parse(readFileSync(root+'/browser-fixture.json'));
const {chromium}=createRequire('/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const checks=[],check=(name,pass)=>{assert.ok(pass,name);checks.push(name);console.log('ok '+name);};
const vulnerable=process.argv.includes('--expect-vulnerable');
async function context(state){
  const ctx=await browser.newContext({storageState:state,viewport:{width:1440,height:1000}});
  await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  const page=await ctx.newPage();page.on('dialog',d=>d.accept());return {ctx,page};
}
async function login(email){
  assert.ok(email.endsWith('.test'));
  const statePath=root+'/search-session-'+createHash('sha256').update(email).digest('hex')+'.json';
  try{
    const cached=await context(JSON.parse(readFileSync(statePath)));
    const session=await(await cached.ctx.request.get(base+'/api/auth/get-session')).json();
    if(session?.user?.email===email)return cached;
    await cached.ctx.close();
  }catch{}
  const result=await context();
  const r=await result.ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/'}});
  assert.equal(r.status(),200);
  const raw=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','r2','object','get','bloomops-files-p3c1-isolated/dev-mail/'+createHash('sha256').update(email).digest('hex')+'.json','--local','--pipe','--persist-to',root+'/isolated/.wrangler/state','--config',root+'/local-r2.json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  await result.page.goto(JSON.parse(raw.slice(raw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0],{waitUntil:'networkidle'});
  assert.equal((await result.ctx.request.post(base+'/api/bloomops/workspaces/select',{data:{workspaceId:fixture.workspaceId}})).status(),200);
  writeFileSync(statePath,JSON.stringify(await result.ctx.storageState()),{mode:0o600});
  return result;
}
async function identity(ctx){return (await(await ctx.request.get(base+'/api/auth/get-session')).json()).user.id;}
async function replaceAccount(a,b,path,label){
  const input=a.page.getByRole('searchbox');
  await a.page.goto(base+path,{waitUntil:'networkidle'});
  await input.fill('N1R');await a.page.getByRole('button',{name:'Search',exact:true}).click();
  await a.page.getByRole('region',{name:'Search results',exact:true}).waitFor();
  check(label+' original account has authorized results',await a.page.locator('.bo-search-result').count()>0);
  const oldTitles=await a.page.locator('.bo-search-result strong').allTextContents();
  const userId=await identity(b.ctx);
  const before=await b.ctx.request.post(base+'/api/bloomops/search',{data:{userId,workspaceId:fixture.workspaceId,q:'N1R',type:'all',page:1}});
  assert.equal(before.status(),200);
  const allowed=(await before.json()).groups.flatMap(g=>g.rows.map(r=>r.title));
  const privateTitles=oldTitles.filter(t=>!allowed.includes(t));
  check(label+' replacement account lacks at least one original result',privateTitles.length>0);
  await a.page.evaluate(()=>window.n1SameDocument='retained');
  await a.ctx.clearCookies();await a.ctx.addCookies(await b.ctx.cookies());
  check(label+' identity really changed',await identity(a.ctx)===userId);
  let documents=0;a.page.on('request',r=>{if(r.isNavigationRequest()&&r.resourceType()==='document')documents++;});
  const refreshed=a.page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().headers().rsc==='1');
  await a.page.evaluate(()=>window.next.router.refresh());assert.equal((await refreshed).status(),200);
  await a.page.waitForTimeout(250);
  check(label+' real RSC refresh preserves the document',documents===0&&await a.page.evaluate(()=>window.n1SameDocument)==='retained');
  if(vulnerable){
    const retained=await a.page.locator('.bo-search-result strong').allTextContents();
    check(label+' unfixed build retains inaccessible results',privateTitles.some(t=>retained.includes(t)));
  }else{
    check(label+' account replacement clears old query and results',await input.inputValue()===''&&await a.page.locator('.bo-search-result').count()===0);
    await input.fill('N1R');await a.page.getByRole('button',{name:'Search',exact:true}).click();
    await a.page.getByRole('region',{name:'Search results',exact:true}).waitFor();
    const nextTitles=await a.page.locator('.bo-search-result strong').allTextContents();
    check(label+' deliberate search uses replacement permissions',nextTitles.every(t=>allowed.includes(t))&&!nextTitles.some(t=>privateTitles.includes(t)));
  }
  await a.ctx.close();await b.ctx.close();
}
try{
  const h=await(await fetch(base+'/api/health')).json();assert.equal(h.environment,'development');assert.equal(h.auth.mail,'r2-dev');
  const owner=await context(root+'/storage-state.json'),member=await login(fixture.people.member.email);
  await replaceAccount(owner,member,'/search','Internal');
  const client=await login(fixture.people.client.email),other=await login(fixture.people.otherclient.email);
  await replaceAccount(client,other,'/portal/search','Portal');
  check('No provider egress',JSON.parse(readFileSync(root+'/provider-log.json')).length===0);
  writeFileSync(root+'/browser/search-scope-'+(vulnerable?'before':'after')+'.json',JSON.stringify({checks},null,2));
  console.log('PASS '+checks.length);
}finally{await browser.close();}
