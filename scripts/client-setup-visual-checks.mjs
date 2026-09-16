// Geometry is measured on the same completed Worker as the setup workflow.
// Viewport screenshots are reviewed by a person, not treated as visual proof alone.
export async function clientSetupVisualChecks({page,ctx,base,clientId,check,out,workspaceId}){
 const fit=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
 for(const width of [1440,1920,768,390]){
  await page.setViewportSize({width,height:width===1920?1080:900});
  await page.goto(base+'/systems',{waitUntil:'networkidle'});
  check('Systems filters fit '+width,await fit());
  if(width>=1440)check('Systems actions align beside fields '+width,await page.locator('.bo-action-filters').evaluate(e=>{const select=e.querySelector('select').getBoundingClientRect(),actions=e.querySelector('.bo-action-filter-buttons').getBoundingClientRect();return Math.abs(select.bottom-actions.bottom)<2&&actions.left>select.right;}));
  const workspace=page.getByRole('button',{name:/^Switch workspace:/});
  check('Workspace identity stays left aligned '+width,await workspace.evaluate(e=>getComputedStyle(e).textAlign==='left'&&e.querySelector('span').getBoundingClientRect().left>e.querySelector('svg').getBoundingClientRect().right));
  await page.screenshot({path:out+'/systems-'+width+'.png'});
  await page.goto(base+'/social/calendar',{waitUntil:'networkidle'});
  check('Calendar uses a human-readable month '+width,await page.locator('nav[aria-label="Calendar months"] strong').textContent().then(s=>/^[A-Z][a-z]+ \d{4}$/.test(s)));
  check('Calendar note is separated from month navigation '+width,await page.locator('.bo-content-pagination').first().evaluate(e=>e.nextElementSibling.getBoundingClientRect().top-e.getBoundingClientRect().bottom>=15));
  check('Calendar layout fits '+width,await fit());await page.screenshot({path:out+'/calendar-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto(base+'/work/setups',{waitUntil:'networkidle'});check('Work templates has a genuine Back destination',await page.getByRole('link',{name:'Back to Work',exact:true}).getAttribute('href')==='/work?tab=projects');
 check('Work template current status is explicit',await page.getByRole('link',{name:'Active templates',exact:true}).getAttribute('aria-current')==='page');await page.screenshot({path:out+'/work-templates-1440.png'});
 await page.goto(base+'/clients/'+clientId+'/reports',{waitUntil:'networkidle'});check('Reports describe real draft and publication behavior',await page.getByText('Manage private drafts and explicitly published client versions.',{exact:true}).isVisible());await page.screenshot({path:out+'/reports-1440.png'});
 await page.getByRole('link',{name:'New report',exact:true}).click();await page.getByLabel('Report template').selectOption({index:1});
 const metric=page.locator('.bo-report-metric').first();await metric.scrollIntoViewIfNeeded();
 check('Metric explanation and controls have deliberate gaps',await metric.evaluate(e=>{const p=e.querySelector(':scope > p'),grid=e.querySelector('.bo-report-grid');return parseFloat(getComputedStyle(p).marginTop)>=12&&grid.getBoundingClientRect().top-p.getBoundingClientRect().bottom>=19;}));
 await page.screenshot({path:out+'/report-metrics-1440.png'});page.once('dialog',d=>d.accept());await page.goto(base+'/prospecting',{waitUntil:'networkidle'});
 await page.locator('.bo-sheet-toolbar').waitFor();const view=page.getByRole('button',{name:'All prospects',exact:true});await view.focus();await page.keyboard.press('Enter');check('Prospect view opens through the keyboard',await page.locator('.bo-sheet-menu').isVisible());await page.keyboard.press('Escape');
 check('Prospect view/count/search align',await page.locator('.bo-sheet-toolbar').evaluate(e=>{const boxes=['.bo-sheet-menu-anchor','.bo-sheet-count','.bo-sheet-search'].map(s=>e.querySelector(s).getBoundingClientRect());return Math.max(...boxes.map(r=>r.top+r.height/2))-Math.min(...boxes.map(r=>r.top+r.height/2))<2;}));await page.screenshot({path:out+'/prospect-controls-1440.png'});
 const changed=await ctx.request.post(base+'/api/bloomops/workspaces/select',{headers:{origin:base},data:{workspaceId:'a'}});check('Choose a supported operations workspace',changed.status()===200);await page.goto(base+'/prospecting',{waitUntil:'networkidle'});
 check('Wrong-workspace recovery remains an explicit choice',await page.getByRole('link',{name:'Choose workspace',exact:true}).getAttribute('href')==='/workspaces'&&await page.getByText('Prospects belong to a prospecting workspace.',{exact:false}).isVisible());check('Recovery action has a real text gap',await page.locator('.bo-access-actions').evaluate(e=>e.getBoundingClientRect().top-e.previousElementSibling.getBoundingClientRect().bottom>=16));await page.screenshot({path:out+'/workspace-recovery-1440.png'});
 check('Restore the synthetic workflow workspace',(await ctx.request.post(base+'/api/bloomops/workspaces/select',{headers:{origin:base},data:{workspaceId}})).status()===200);
}
