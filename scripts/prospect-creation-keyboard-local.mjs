// Keyboard acceptance against the isolated synthetic Worker only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const arg=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const root=arg('--evidence','/home/ary/Developer/bloomops-n1e-new-prospect-recovery-evidence'),base=arg('--url','http://localhost:8798');
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/);
const {chromium}=createRequire(arg('--playwright','/tmp/bloomops-pilot-tools')+'/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),checks=[];
try{
 const ctx=await browser.newContext({storageState:JSON.parse(readFileSync(root+'/storage-state.json')),viewport:{width:1440,height:1000}});
 await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 const health=await(await ctx.request.get(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
 const page=await ctx.newPage();let writes=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/bloomops/prospecting')writes++;});page.on('dialog',d=>d.accept());await page.goto(base+'/prospecting/new',{waitUntil:'networkidle'});
 await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('bloomsi:profile-draft:')&&k.includes(',"new"]:'))localStorage.removeItem(k);});await page.reload({waitUntil:'networkidle'});
 async function tabTo(locator){for(let n=0;n<65;n++){await page.keyboard.press('Tab');if(await locator.evaluate(e=>document.activeElement===e))return;}throw Error('Control not reached by Tab');}
 const name=page.getByLabel('Business name',{exact:true});await tabTo(name);await page.keyboard.insertText('Keyboard garden');await page.keyboard.press('Tab');
 assert.equal(await name.inputValue(),'Keyboard garden');assert.equal(await page.evaluate(()=>document.activeElement.id),'prospect-personName');checks.push('Keyboard reaches labelled fields in reading order and retains typed input');
 await page.reload({waitUntil:'networkidle'});assert.equal(await name.inputValue(),'');const review=page.getByRole('button',{name:'Review recovered fields',exact:true});await tabTo(review);const focus=await review.evaluate(e=>{const s=getComputedStyle(e);return {visible:e.matches(':focus-visible'),width:s.outlineWidth,style:s.outlineStyle,color:s.outlineColor};});assert.ok(focus.visible&&parseFloat(focus.width)>=2&&focus.style==='solid'&&focus.color!=='rgba(0, 0, 0, 0)');await page.screenshot({path:root+'/browser/keyboard-focus.png'});checks.push('Recovery button shows a visible keyboard focus outline');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#prospect-businessName')?.value==='Keyboard garden');checks.push('Tab and Enter explicitly recover fields after the authority read');
 await tabTo(name);await page.keyboard.press('Enter');await page.waitForURL(u=>/^\/prospecting\/[a-f0-9-]+$/.test(u.pathname));await page.getByRole('heading',{name:'Keyboard garden',exact:true}).waitFor();assert.equal(writes,1);checks.push('Keyboard submission opens the real saved profile with exactly one creation request');
 assert.equal(JSON.parse(readFileSync(root+'/provider-log.json')).length,0);checks.push('Keyboard path makes no provider request');writeFileSync(root+'/browser/keyboard.json',JSON.stringify({checks},null,2));console.log('PASS '+checks.length);
}finally{await browser.close();}
