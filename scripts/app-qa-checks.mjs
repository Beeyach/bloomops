// Interaction/geometry regressions shared by the existing isolated UI Worker harness.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
export async function qaOperationalLayout(page,check){
 const d=await page.evaluate(()=>{
  const box=e=>{const r=e?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}:null;};
  const main=document.querySelector('.bo-main'),content=document.querySelector('.bo-page'),views=document.querySelector('.bo-view-nav'),filters=document.querySelector('.bo-content-filters,.bo-action-filters');
  const empty=document.querySelector('.bo-empty'),description=document.querySelector('.bo-section-description');
  const padding=content?parseFloat(getComputedStyle(content).paddingLeft):0;
  return {path:location.pathname,width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,main:box(main),content:box(content),views:box(views),filters:box(filters),empty:box(empty),description:box(description),padding};
 });
 check(d.path+' uses the full operational column',Math.abs(d.main.width-d.content.width)<2);
 check(d.path+' has no page-wide horizontal overflow',d.scrollWidth<=d.clientWidth);
 if(d.views&&d.filters)check(d.path+' view controls have16–24px separation from filters',d.filters.top-d.views.bottom>=16&&d.filters.top-d.views.bottom<=24);
 if(d.empty)check(d.path+' empty state occupies its results region',Math.abs(d.empty.width-(d.content.width-2*d.padding))<2);
 if(d.empty&&d.description)check(d.path+' section description is separated from results',d.empty.top-d.description.bottom>=12);
 if(d.views){const active=page.locator('.bo-view-nav [aria-current="page"]');check(d.path+' has one current view',await active.count()===1);check(d.path+' current view has visible selection',await active.evaluate(e=>getComputedStyle(e).backgroundColor!=='rgb(255, 255, 255)'));}
 return d;
}
export async function qaRestrictedSidebar({browser,base,bucket,owner,check,hashEmail,out}){
 const email='restricted-qa@example.test';
 const invitation=await owner.ctx.request.post(base+'/api/bloomops/invitations',{headers:{origin:base},data:{email,name:'Restricted QA',role:'team_member'}});assert.equal(invitation.status(),201,await invitation.text());
 const mail=JSON.parse(await(await bucket.get('dev-mail/'+hashEmail(email)+'.json')).text());const invitationUrl=mail.text.match(/https?:\/\/\S+/)[0];assert.equal(new URL(invitationUrl).origin,base);
 const ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:new URL(invitationUrl).pathname}})).status(),200);
  const auth=JSON.parse(await(await bucket.get('dev-mail/'+hashEmail(email)+'.json')).text());const url=auth.text.match(/https?:\/\/\S+/)[0];assert.equal(new URL(url).origin,base);await page.goto(url,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Accept and continue',exact:true}).click();await page.waitForURL(base+'/');
  await page.locator('nav[aria-label="Main"]').getByRole('link',{name:'Prospecting',exact:true}).click();
  await page.waitForURL(base+'/prospecting');await page.waitForLoadState('networkidle');
  writeFileSync(out+'/restricted-sidebar.json',JSON.stringify({path:new URL(page.url()).pathname,heading:await page.locator('h1').innerText(),main:await page.locator('main').innerText()},null,2));
  await page.screenshot({path:out+'/restricted-sidebar.png',fullPage:true});
  check('restricted sidebar explains the denied role',await page.getByText('Your current role does not include access.',{exact:false}).count()===1);
  check('restricted sidebar preserves shell with explicit denial rather than missing page',await page.getByRole('heading',{name:'Prospecting',exact:true}).count()===1&&await page.getByRole('link',{name:'Choose workspace',exact:true}).count()===1);
  check('restricted sidebar never mounts or reveals prospect data',await page.locator('.bo-sheet').count()===0);
  const denied=await ctx.request.get(base+'/api/bloomops/prospecting/sheet');
  check('direct sheet API retains explicit permission denial',denied.status()===403&&(await denied.json()).error==='You do not have permission to do that.');
  await page.reload({waitUntil:'networkidle'});check('restricted reload retains explicit denial',await page.getByText('Your current role does not include access.',{exact:false}).count()===1);
 }finally{await ctx.close();}
}
