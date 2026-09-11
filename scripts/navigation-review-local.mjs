#!/usr/bin/env node
// PERF1 browser acceptance using a synthetic navigation-perf-fixture workspace.
// All mutations are local test revocations; never accepts a remote origin.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { navigationRoutes, completedContent } from './navigation-content.mjs';
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const base='http://localhost:8787', fixtureDir=resolve(arg('--fixture','/tmp/bloomops-perf1-fixture')), out=resolve(arg('--out','/tmp/bloomops-perf1-review'));
const fixture=JSON.parse(readFileSync(join(fixtureDir,'fixture.json')));
assert.match(fixture.ws,/^perf1-[0-9a-f]{8}$/);
const require=createRequire(join(resolve(arg('--playwright','/tmp/bloomops-c6-tools')),'package.json'));
const {chromium}=require('playwright'),browser=await chromium.launch({headless:true,args:['--no-sandbox']});
mkdirSync(out,{recursive:true});
let checks=0,screenshots=0;const check=(label,ok)=>{assert.ok(ok,label);checks++;console.log(`ok ${label}`);};
const sql=command=>execFileSync('npx',['--no-install','wrangler','d1','execute','DB','--local','--command',command],{stdio:'pipe'});
const lit=s=>"'"+String(s).replaceAll("'","''")+"'";
try {
 const health=await(await fetch(base+'/api/health')).json();assert.ok(health.environment==='development'&&health.auth.mail==='r2-dev');
 const errors=[];
 for(const javaScriptEnabled of [true,false]) {
  const context=await browser.newContext({storageState:join(fixtureDir,'owner-state.json'),javaScriptEnabled}),page=await context.newPage();
  page.on('pageerror',()=>errors.push('runtime error'));
  for(const route of [...navigationRoutes(fixture.projects[0]), { label: 'Ads', path: '/ads', heading: 'Ads', content: '.bo-preview-list' }]) {
   const { path } = route;
   const response=await page.goto(base+path,{waitUntil:'networkidle'});check('protected page responds without caching',response.status()===200&&/no-store/.test(response.headers()['cache-control']||''));
   for(const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:900});
    await completedContent(page, route, { animationFrames: javaScriptEnabled });
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    check(`${javaScriptEnabled?'JS':'no-JS'} ${path.includes('/projects/')?'Project':path} ${width}: completed destination visible and viewport fits`,await page.locator('main h1').count()===1&&await page.locator('main h1').isVisible()&&fits);
    const label=path.includes('/projects/')?'project':path.replace('/','')||'home';
    await page.screenshot({path:join(out,`${label}-${javaScriptEnabled?'js':'nojs'}-${width}.png`),fullPage:true});screenshots++;
   }
  }
  await context.close();
 }
 const team=await browser.newContext({storageState:join(fixtureDir,'team_member-state.json')}),page=await team.newPage(),project=fixture.projects[0];
 await page.goto(base+`/work/projects/${project}`,{waitUntil:'networkidle'});
 check('issued Team session reads its assigned Project',await page.locator('#project-details-title').isVisible());
 sql(`DELETE FROM project_assignments WHERE workspace_id=${lit(fixture.ws)} AND project_id=${lit(project)} AND membership_id=${lit(fixture.members.team_member.membership)}`);
 const denied=await page.goto(base+`/work/projects/${project}`,{waitUntil:'networkidle'});
 check('the next Project page request revokes metadata and body after unassignment',denied.status()===404&&!await page.locator('#project-details-title').count()&&!await page.title().then(t=>t.includes('systems project')));
 // Restore this synthetic assignment so performance comparisons can reuse it.
 sql(`INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES(${lit(fixture.ws)},${lit(project)},${lit(fixture.members.team_member.membership)})`);
 await team.close();
 check('no browser runtime or hydration errors',errors.length===0);
 console.log(`PERF1 browser: ${checks} checks; ${screenshots} screenshots at five widths with and without JavaScript.`);
} finally {await browser.close();}
