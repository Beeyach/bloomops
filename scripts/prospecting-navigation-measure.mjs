// P0/P1 comparison: accepted full-content/two-frame method and local D1 wrapper.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {completedContent,navigationRoutes} from './navigation-content.mjs';
const arg=(k,d)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:d;
const out=resolve(arg('--out','/tmp/prospecting-navigation')),base='http://localhost:8787';
const require=createRequire(join(resolve(arg('--playwright','/tmp/bloomops-pilot-tools')),'package.json'));
const {chromium}=require('playwright'),browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const storage=arg('--storage-state');assert.ok(storage);mkdirSync(out,{recursive:true});
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const routes=navigationRoutes('unused').slice(0,3),samples=[],bundles=[];
try{
 for(const width of [1440,390]){
  // Cold documents show the relevant route's actual JS transfer, including shell.
  for(const route of routes){
   const context=await browser.newContext({storageState:storage,viewport:{width,height:900}}),page=await context.newPage(),files=[];
   page.on('response',r=>{if(new URL(r.url()).origin===base&&r.request().resourceType()==='script')files.push(r);});
   await page.goto(base+route.path,{waitUntil:'networkidle'});await completedContent(page,route);
   const sizes=await Promise.all(files.map(async r=>({path:new URL(r.url()).pathname,bytes:(await r.body()).length})));
   bundles.push({width,route:route.label,scriptRequests:sizes.length,scriptBytes:sizes.reduce((n,s)=>n+s.bytes,0),scripts:sizes});await context.close();
  }
  const context=await browser.newContext({storageState:storage,viewport:{width,height:900}}),page=await context.newPage();await page.goto(base+'/settings',{waitUntil:'networkidle'});
  let clicked;await page.exposeFunction('prospectingMeasuredClick',value=>{clicked=value;});
  for(let round=0;round<7;round++)for(const route of routes){
   if(width===390&&route.label==='Work')await page.getByRole('button',{name:'More',exact:true}).click();
   const nav=width===390&&route.label==='Work'?page.getByRole('dialog'):page.locator('nav[aria-label="Main"]');
   const responses=[],record=r=>{const q=r.request();if(new URL(r.url()).origin===base&&['document','fetch'].includes(q.resourceType())&&!q.headers()['next-router-prefetch'])responses.push(r);};
   page.on('response',record);clicked=null;
   await page.evaluate(()=>document.addEventListener('click',()=>window.prospectingMeasuredClick(performance.timeOrigin+performance.now()),{capture:true,once:true}));
   await nav.locator(`a[href="${route.path}"]`).filter({visible:true}).first().click();
   const content=await completedContent(page,route);assert.ok(clicked);page.off('response',record);
   // Chromium can omit requestfinished for a fully rendered RSC stream.
   // The accepted server wrapper records stream completion independently.
   const traces=[];for(const response of responses){const h=await response.allHeaders();if(h['x-perf1-sample']){
    let trace;for(let retry=0;retry<20;retry++){trace=await(await fetch(base+'/__perf1?id='+h['x-perf1-sample'])).json();if(trace?.completeMs!==undefined)break;await new Promise(r=>setTimeout(r,50));}assert.ok(trace?.completeMs!==undefined);assert.ok(!trace.queries.some(q=>q.statements.some(s=>s.kind==='prospecting')),'Unrelated route queried prospects');traces.push(trace);
   }}
   samples.push({width,round,route:route.label,visibleMs:content.visibleAt-clicked,requests:responses.length,
    statements:traces.reduce((n,t)=>n+t.statements,0),invocations:traces.reduce((n,t)=>n+t.invocations,0),serverMs:traces.map(t=>t.completeMs),delayMs:traces.map(t=>t.delayMs)});
   console.log(JSON.stringify(samples.at(-1)));
  }
  await context.close();
 }
 const distribution=values=>{values.sort((a,b)=>a-b);return {median:values[Math.floor(values.length/2)],p95:values[Math.ceil(values.length*.95)-1],min:values[0],max:values.at(-1)};};
 const summary=[1440,390].flatMap(width=>routes.map(route=>{const rows=samples.filter(s=>s.width===width&&s.route===route.label&&s.round>=2);return {width,route:route.label,samples:rows.length,visibleMs:distribution(rows.map(r=>r.visibleMs)),requests:rows.map(r=>r.requests),statements:rows.map(r=>r.statements),invocations:rows.map(r=>r.invocations)};}));
 writeFileSync(join(out,'measurement.json'),JSON.stringify({method:'Local built Worker, 40ms synthetic D1 latency per call; seven rounds, two warmups; full destination plus two frames. Cold JS decoded bytes measured separately.',summary,bundles,samples},null,2)+'\n');console.log(JSON.stringify(summary));
}finally{await browser.close();}
