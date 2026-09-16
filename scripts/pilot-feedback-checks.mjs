import assert from 'node:assert/strict';
import {multiServiceChecks} from './pilot-multi-service-checks.mjs';
export async function pilotFeedbackChecks({page,ctx,base,check,out}){
 await page.setViewportSize({width:1440,height:1000});
 const headers={origin:base};
 // Supported workspace creation isolates this workflow from all earlier fixtures.
 const made=await ctx.request.post(base+'/api/bloomops/workspaces',{headers,data:{name:'Synthetic pilot feedback',requestId:crypto.randomUUID(),sourceWorkspaceId:'a'}});
 assert.equal(made.status(),201);const workspaceId=(await made.json()).workspaceId;
 assert.equal((await ctx.request.post(base+'/api/bloomops/workspaces/select',{headers,data:{workspaceId}})).status(),200);
 await page.goto(base+'/prospecting/new',{waitUntil:'networkidle'});
 await page.screenshot({path:out+'/new-prospect-setup.png',fullPage:true});
 await page.getByLabel('Business name',{exact:true}).fill('Synthetic handoff fern');await page.getByLabel('Public contact email',{exact:false}).fill('fern@example.test');
 await page.getByRole('button',{name:'Create prospect',exact:true}).click();await page.waitForURL(u=>/^\/prospecting\/[a-f0-9-]+$/.test(u.pathname));
 const id=new URL(page.url()).pathname.split('/').pop();
 await page.getByRole('button',{name:'Edit identity & contact',exact:true}).click();
 await page.getByText('Source details for public contact email',{exact:true}).click();await page.locator('#prospect-publicEmail-source').fill('https://example.test/synthetic-contact-source');
 await page.getByRole('button',{name:'Save identity & contact',exact:true}).click();await page.getByRole('button',{name:'Edit identity & contact',exact:true}).waitFor();
 const provenance=page.locator('#provenance');await provenance.locator('summary').click();
 check('Provenance labels have matching icons without invented verification',await provenance.locator('.bo-prospect-sources dt').count()>0&&await provenance.locator('.bo-prospect-sources dt:not(:has(svg))').count()===0&&await provenance.getByText('Not checked',{exact:true}).count()>0);
 const typography=await provenance.locator('.bo-prospect-sources li').first().evaluate(e=>({label:parseFloat(getComputedStyle(e.querySelector('dt')).fontSize),weight:Number(getComputedStyle(e.querySelector('dt')).fontWeight),value:parseFloat(getComputedStyle(e.querySelector('dd')).fontSize)}));check('Shared provenance labels are distinct from readable values',typography.label===13&&typography.weight>=600&&typography.value>=14);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});check('Profile provenance fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/profile-provenance-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 check('Evidence and draft actions preserve real destinations',await page.getByRole('link',{name:'View audit evidence',exact:true}).getAttribute('href')==='#evidence'&&await page.getByRole('link',{name:'View draft',exact:true}).getAttribute('href')==='#draft');
 await page.getByRole('link',{name:'Review client handoff',exact:true}).click();
 await page.getByRole('button',{name:'New client',exact:true}).click();await page.getByRole('group',{name:'Service choices'}).getByRole('button').filter({has:page.getByText('Service reference: kajabi',{exact:true})}).click();
 await page.getByLabel('Package name',{exact:true}).fill('Synthetic course setup');await page.getByLabel('Agreed scope',{exact:true}).fill('Prepare synthetic course pages. No provider or invitation.');
 await page.getByRole('button',{name:'Review handoff',exact:true}).click();await page.getByRole('region',{name:'Handoff preview'}).waitFor();
 await page.screenshot({path:out+'/handoff-missing-contact.png',fullPage:true});
 check('Missing contact cannot be confirmed as a sale',await page.getByRole('button',{name:'Convert to client',exact:true}).count()===0);
 const repair=page.getByRole('link',{name:'Edit prospect contact',exact:true});
 check('Missing contact has an actionable in-page repair',await repair.count()===1);await repair.click();
 await page.getByRole('button',{name:'Edit identity & contact',exact:true}).click();await page.getByLabel(/^Person\s*\(optional\)$/).fill('Synthetic Fern Contact');
 let rejectedSave=false;
 await page.route('**/api/bloomops/prospecting/'+id,async route=>{if(route.request().method()==='PATCH'&&!rejectedSave){rejectedSave=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Synthetic unavailable response'})});}else await route.continue();});
 await page.getByRole('button',{name:'Save identity & contact',exact:true}).click();await page.getByText(/Save failed. Your draft is still here/).waitFor();
 check('Contact save error retains entered values',await page.getByLabel(/^Person\s*\(optional\)$/).inputValue()==='Synthetic Fern Contact');
 await page.getByRole('button',{name:'Save identity & contact',exact:true}).click();await page.getByRole('button',{name:'Edit identity & contact',exact:true}).waitFor();
 check('Contact repair preserves selected service and package',await page.getByText('Selected: Kajabi',{exact:true}).isVisible()&&await page.getByLabel('Package name',{exact:true}).inputValue()==='Synthetic course setup');
 check('Contact repair persists through the real profile writer',(await (await ctx.request.get(base+'/api/bloomops/prospecting/'+id)).json()).profile.personName==='Synthetic Fern Contact');
 await page.getByRole('button',{name:'Review handoff',exact:true}).click();const confirmation=page.getByRole('checkbox',{name:'Confirm this sale and permanently stop cold outreach.',exact:true});await confirmation.waitFor();
 check('Missing onboarding templates do not block recording the sale',await page.getByText('Publish the kajabi onboarding template.',{exact:true}).isVisible()&&await confirmation.isVisible());
 const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'Review onboarding setup in a new tab',exact:true}).click();const setup=await popupPromise;await setup.waitForLoadState('networkidle');
 check('Setup opens the authorized real onboarding route',new URL(setup.url()).pathname==='/settings/onboarding');
 await setup.getByRole('checkbox',{name:/Install missing.*Common/i}).check();await setup.getByRole('checkbox',{name:/Install missing.*Kajabi/i}).check();await setup.getByRole('button',{name:'Install selected defaults',exact:true}).click();await setup.getByText('Selected onboarding categories are ready. No client was activated or contacted.',{exact:true}).waitFor();await setup.close();
 check('Setup return retains scope text',await page.getByLabel('Agreed scope',{exact:true}).inputValue()==='Prepare synthetic course pages. No provider or invitation.');
 await page.getByRole('button',{name:'Review handoff',exact:true}).click();await page.getByText(/steps in the current template preview/).waitFor();await confirmation.check();
 let releaseConversion,enteredConversion;const conversionPending=new Promise(resolve=>enteredConversion=resolve),conversionRelease=new Promise(resolve=>releaseConversion=resolve);
 await page.route('**/api/bloomops/prospecting/'+id+'/conversion',async route=>{enteredConversion();await conversionRelease;await route.continue();});
 await page.getByRole('button',{name:'Convert to client',exact:true}).click();await conversionPending;
 check('Contact cannot be edited during conversion',await page.getByRole('button',{name:'Edit identity & contact',exact:true}).isDisabled());releaseConversion();
 await page.getByRole('region',{name:'Recorded client conversion'}).waitFor();
 await page.reload({waitUntil:'networkidle'});check('Confirmed conversion receipt survives reload',await page.getByRole('region',{name:'Recorded client conversion'}).isVisible());
 await page.getByRole('link',{name:'Open client',exact:true}).click();await page.waitForURL(/\/clients\//);check('Conversion destination has the saved client',await page.getByRole('heading',{name:'Synthetic handoff fern',exact:true}).isVisible());
 await page.goto(base+'/pages',{waitUntil:'networkidle'});await page.getByRole('button',{name:'New page',exact:true}).click();await page.waitForURL(u=>/^\/pages\/[a-f0-9-]+$/.test(u.pathname));
 const editor=page.locator('.ProseMirror');await editor.waitFor();await page.getByLabel('Page title',{exact:true}).fill('Synthetic feedback writing');
 check('One empty block does not lead with inapplicable movement buttons',await page.getByRole('button',{name:'Move block up',exact:true}).count()===0);
 await editor.click();await page.keyboard.insertText('First synthetic block');await page.keyboard.press('Enter');await page.keyboard.insertText('Middle synthetic block');await page.keyboard.press('Enter');await page.keyboard.insertText('Last synthetic block');
 await page.waitForFunction(()=>document.querySelector('.bo-page-toolbar [role="status"]')?.textContent==='Saved');
 await editor.getByText('Middle synthetic block',{exact:true}).click();await page.getByRole('button',{name:'Move block up',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ProseMirror').firstElementChild.textContent==='Middle synthetic block');
 check('Middle block moves on a normal button click',true);await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('.ProseMirror').firstElementChild.textContent==='First synthetic block');
 check('Move undo preserves original blocks',await editor.locator(':scope > *').count()===3);
 await page.waitForFunction(()=>document.querySelector('.bo-page-toolbar [role="status"]')?.textContent==='Saved');await page.reload({waitUntil:'networkidle'});await editor.waitFor();
 check('Writing and restored block order survive reload',await editor.locator(':scope > *').first().textContent()==='First synthetic block');
 await editor.getByText('Middle synthetic block',{exact:true}).click();await page.getByRole('button',{name:'Move block down',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.ProseMirror').lastElementChild.textContent==='Middle synthetic block');await page.waitForFunction(()=>document.querySelector('.bo-page-toolbar [role="status"]')?.textContent==='Saved');await page.reload({waitUntil:'networkidle'});await editor.waitFor();
 check('Moved block order persists after saved reload',await editor.locator(':scope > *').last().textContent()==='Middle synthetic block');
 await editor.getByText('Middle synthetic block',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Move block down"]').disabled);check('Last block cannot move down',await page.getByRole('button',{name:'Move block down',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Move block up',exact:true}).click();await editor.getByText('First synthetic block',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Move block up"]').disabled);check('First block cannot move up',await page.getByRole('button',{name:'Move block up',exact:true}).isDisabled());
 await page.waitForFunction(()=>document.querySelector('.bo-page-toolbar [role="status"]')?.textContent==='Saved');

 for(const width of [1920,1440,768,390]){
  await page.setViewportSize({width,height:1000});const before=await editor.innerHTML();
  const summary=page.locator('.bo-page-tools>summary');await summary.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Edit record context',exact:true}).waitFor();
  check('Page tools open from toolbar without replacing writing '+width,await editor.innerHTML()===before);
  const geometry=await page.locator('.bo-page-tools-panel').evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};});check('Tools stay within viewport '+width,geometry.left>=0&&geometry.right<=geometry.width);
  await page.screenshot({path:out+'/page-tools-'+width+'.png',fullPage:true});await page.keyboard.press('Escape');check('Tools Escape closes and returns focus '+width,await summary.evaluate(e=>!e.parentElement.open&&document.activeElement===e));
 }
 await page.setViewportSize({width:1440,height:1000});await editor.getByText('Middle synthetic block',{exact:true}).hover();const add=page.getByRole('button',{name:'Add a block',exact:true});await add.waitFor();await add.click();
 check('One non-forced pointer click opens block insertion',await page.getByText('Press Esc to close.',{exact:true}).isVisible());await page.keyboard.press('Escape');
 // Workspace controls use the existing server selection, no optimistic rename.
 await page.getByRole('button',{name:/Switch workspace:/}).click();await page.getByRole('region',{name:'Switch workspace',exact:true}).waitFor();
 check('Workspace dropdown has the full chooser',await page.getByRole('link',{name:'View all workspaces',exact:true}).isVisible());await page.keyboard.press('Escape');
 check('Workspace Escape returns focus',await page.getByRole('button',{name:/Switch workspace:/}).evaluate(e=>document.activeElement===e));
 // Dirty an existing guarded profile form. Native navigation cancellation must
 // happen before the server cookie changes; a confirmed leave has one prompt.
 await page.goto(base+'/prospecting/'+id,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Edit identity & contact',exact:true}).click();await page.getByLabel(/^Person\s*\(optional\)$/).fill('Unsaved synthetic contact');
 let selections=0;page.on('request',request=>{if(request.url().endsWith('/api/bloomops/workspaces/select')&&request.method()==='POST')selections++;});
 await page.getByRole('button',{name:/Switch workspace:/}).click();const denied=page.waitForEvent('dialog');const clickDenied=page.getByRole('region',{name:'Switch workspace',exact:true}).getByRole('button',{name:'Finance Synthetic QA',exact:true}).click();
 const firstDialog=await denied;check('Dirty switch uses native leaving guard',firstDialog.type()==='beforeunload');await firstDialog.dismiss();await clickDenied;
 check('Cancelled switch sends no selection mutation',selections===0);
 check('Cancelled switch preserves original scope and draft',new URL(page.url()).pathname==='/prospecting/'+id&&await page.getByLabel(/^Person\s*\(optional\)$/).inputValue()==='Unsaved synthetic contact');
 const dialogs=[];const accept=async dialog=>{dialogs.push(dialog.type());await dialog.accept();};page.on('dialog',accept);
 await page.getByRole('region',{name:'Switch workspace',exact:true}).getByRole('button',{name:'Finance Synthetic QA',exact:true}).click();await page.waitForURL(base+'/');page.off('dialog',accept);
 check('Confirmed switch prompts once before one selection',dialogs.length===1&&dialogs[0]==='beforeunload'&&selections===1);
 check('Supported workspace switch reloads correct scope',await page.getByRole('button',{name:'Switch workspace: Finance Synthetic QA',exact:true}).isVisible());
 await page.goto(base+'/workspaces',{waitUntil:'networkidle'});const account=page.getByRole('region',{name:'Signed-in account',exact:true});
 check('Full workspace chooser preserves identity and secondary sign-out',await account.getByText('ellen@example.com',{exact:true}).isVisible()&&await account.getByRole('button',{name:'Sign out',exact:true}).isVisible());
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});check('Workspace identity fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/workspace-account-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 for(const path of ['/work','/team','/team/workload','/team/departments']){
  await page.goto(base+path,{waitUntil:'networkidle'});
  const nav=page.locator(path==='/work'?'nav[aria-label="Work sections"]':'nav[aria-label="Team views"]');
  check(path+' uses compact bounded controls',await nav.locator('.bo-btn').count()>=2&&await nav.locator('[aria-current="page"]').count()===1);
 }
 await page.goto(base+'/settings',{waitUntil:'networkidle'});
 const setupGeometry=await page.getByRole('region',{name:'Service delivery setup',exact:true}).evaluate(section=>{const description=section.querySelector('p').getBoundingClientRect(),button=section.querySelector('a.bo-btn').getBoundingClientRect();return {left:button.left-description.left,gap:button.top-description.bottom};});
 check('Settings setup actions align with their explanation and have a real gap',Math.abs(setupGeometry.left)<=1&&setupGeometry.gap>=16);
 await page.screenshot({path:out+'/settings-aligned.png',fullPage:true});
 await page.goto(base+'/social',{waitUntil:'networkidle'});const selector=page.getByLabel('Platform',{exact:true});await selector.selectOption('custom');await page.getByLabel('Platform label',{exact:true}).fill('Legacy private channel');await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('platform')==='Legacy private channel');
 check('Custom platform survives explicit filter navigation',await page.getByLabel('Platform',{exact:true}).inputValue()==='platform:Legacy private channel');await page.getByRole('link',{name:'Clear filters',exact:true}).first().click();await page.waitForURL(base+'/social');
 check('Platform All restored by Clear',await page.getByLabel('Platform',{exact:true}).inputValue()==='platform:');
 await multiServiceChecks({page,ctx,base,workspaceId,check,out});
}
