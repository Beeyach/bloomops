// P2B2 checks use only additional synthetic rows in the owned local fixture.
import assert from 'node:assert/strict';
import {join} from 'node:path';
export async function checkImportPreview({context,page,base,src,foreign,dest,out,query,lit,snapshot,check}){
 const endpoint=base+'/api/bloomops/prospecting/import-preview',url=base+'/prospecting/import/review';
 const post=(file,origin=base)=>context.request.post(endpoint,{headers:{origin,'content-type':'application/json'},data:file});
 const names=['Rose Mapping','Fern Existing','Iris Invalid','Sage History','Clover Repeat'];
 for(let i=0;i<5;i++)query(`INSERT INTO prospects(workspace,business_name,name,domain,email,country,source,stage,created_at,updated_at) VALUES(${lit(src)},${lit(names[i])},'Maya Example',${lit('mapping'+i+'.example.com')},${lit('mapping'+i+'@example.com')},'Canada','Directory','New','2026-09-12','2026-09-12')`);
 const ids=query(`SELECT id FROM prospects WHERE workspace=${lit(src)} AND business_name IN (${names.map(lit)}) ORDER BY id`).map(row=>row.id);
 const response=await context.request.post(base+'/api/bloomops/prospecting/source-export',{headers:{origin:base},data:{source:src,ids}});assert.equal(response.status(),200);const exported=await response.json();
 query(`INSERT INTO bloomops_prospects(id,workspace_id,creation_request_id,creation_hash,created_by_membership_id,business_name,public_email) VALUES(${lit(src+'-existing')},${lit(dest)},${lit(src+'-request')},${lit('a'.repeat(64))},${lit(dest+'-member')},'Previously saved studio','mapping1@example.com')`);
 query(`INSERT INTO send_events(workspace,prospect_id,sent_at,dedupe_key) VALUES(${lit(src)},${ids[3]},'2026-09-12',${lit(src+'-mapping-send')})`);
 const before=snapshot(),file=structuredClone(exported);file.records[2].fields.publicEmail='invalid';file.records.push(structuredClone(file.records[4]));file.counts={selected:0,eligible:0,blocked:0,exported:0};
 const reviewed=await post(file),result=await reviewed.json();
 check('Native preview recomputes all outcome counts and imports nothing',reviewed.status()===200&&JSON.stringify(result.counts)===JSON.stringify({selected:6,ready:1,duplicate:3,rejected:2,imported:0}));
 check('Native mapping normalizes website and country with provenance',result.rows[0].fields.website==='https://mapping0.example.com/'&&result.rows[0].fields.location==='Canada'&&result.rows[0].provenance.sourceRecordId===ids[0]&&result.rows[0].sourceLabel==='Directory');
 check('Native duplicate and source-work reasons are explicit',result.rows[1].reasons.includes('destination_email')&&result.rows[3].reasons.includes('source_work')&&result.rows[4].reasons.includes('file_duplicate')&&result.rows[5].reasons.includes('file_duplicate'));
 const mixed={...exported,records:[structuredClone(exported.records[0]),structuredClone(exported.records[0])]};mixed.records[1].fields.publicEmail='bad';const mixedResult=await(await post(mixed)).json();check('Invalid copy cannot hide a repeated source ID',mixedResult.counts.ready===0&&mixedResult.counts.duplicate===1&&mixedResult.counts.rejected===1&&mixedResult.rows.every(row=>row.reasons.includes('file_duplicate')));
 check('Preview response is not cached',reviewed.headers()['cache-control']==='no-store');
 const upload=async value=>page.getByLabel('Raw prospect export',{exact:true}).setInputFiles({name:'bloomops-raw-prospects.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
 await page.goto(url,{waitUntil:'networkidle'});check('Preview starts empty and requires a file',await page.getByRole('button',{name:'Preview import',exact:true}).isDisabled());
 await page.getByText('Field mapping',{exact:true}).click();check('Mapping disclosure explains Country to Location',await page.locator('.bo-import-mapping').first().getByText('Location',{exact:true}).isVisible());
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url,{waitUntil:'networkidle'});await upload(file);await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('heading',{name:'Import preview',exact:true}).waitFor();
  check(`Import preview fits ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.waitForFunction(()=>document.activeElement?.classList.contains('bo-import-result'));
  check(`Results and keyboard focus are clear at ${width}px`,await page.locator('.bo-import-result').evaluate(el=>el===document.activeElement)&&await page.locator('[aria-label="Import records"]>li').count()===6);
  check(`File control has a 44px target at ${width}px`,(await page.getByLabel('Raw prospect export',{exact:true}).boundingBox()).height>=44);
  await page.screenshot({path:join(out,`import-${width}.png`),fullPage:false});
 }
 await page.getByText('Mapped fields and source',{exact:true}).first().click();check('Mapped detail displays the canonical URL',await page.getByText('https://mapping0.example.com/',{exact:true}).isVisible());
 check('Possible destination duplicate links to existing prospect search',(await page.getByRole('link',{name:'Review existing prospects',exact:true}).getAttribute('href'))==='/prospecting?q=mapping1%40example.com');
 await upload(file);check('Changing the selected file clears old results',await page.getByRole('heading',{name:'Import preview',exact:true}).count()===0);
 let release,started;const gate=new Promise(resolve=>release=resolve),pending=new Promise(resolve=>started=resolve);
 await page.route('**/api/bloomops/prospecting/import-preview',async route=>{started();await gate;await route.continue();});
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await pending;
 check('Busy preview disables file choice and repeated submission',await page.getByLabel('Raw prospect export',{exact:true}).isDisabled()&&await page.getByRole('button',{name:'Checking records…',exact:true}).isDisabled());
 release();await page.getByRole('heading',{name:'Import preview',exact:true}).waitFor();await page.unroute('**/api/bloomops/prospecting/import-preview');
 await page.route('**/api/bloomops/prospecting/import-preview',route=>route.abort('failed'));await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByText('The preview could not be loaded. Check your connection and try again.',{exact:true}).waitFor();check('Network failure exposes retry without stale results',await page.getByRole('heading',{name:'Import preview',exact:true}).count()===0&&!(await page.getByRole('button',{name:'Preview import',exact:true}).isDisabled()));await page.unroute('**/api/bloomops/prospecting/import-preview');
 await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('heading',{name:'Import preview',exact:true}).waitFor();check('Retry displays current results',await page.locator('[aria-label="Import records"]>li').count()===6);
 await upload('{bad json');await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByText('This file is not valid JSON. Choose a Bloomsi raw export.',{exact:true}).waitFor();check('Malformed JSON has an actionable error',true);await page.screenshot({path:join(out,'import-error-320.png'),fullPage:false});
 await upload(' '.repeat(1048577));await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByText('Choose a JSON export of 1 MiB or less.',{exact:true}).waitFor();check('Oversized file is rejected before preview',true);
 const altered=structuredClone(exported);altered.records[0].fields.businessName='FORGED';const alteredResult=await(await post(altered)).json();check('Edited identity cannot masquerade as source-eligible data',alteredResult.rows[0].reasons.includes('changed'));
 check('Unsupported version and excessive record count are rejected',(await post({...file,version:9})).status()===400&&(await post({...file,records:Array(51).fill(file.records[0])})).status()===400);
 const foreignFile=structuredClone(exported);foreignFile.records.forEach(row=>row.provenance.sourceWorkspaceId=foreign);check('Provenance grants no foreign source access',(await post(foreignFile)).status()===404);
 check('Cross-origin import preview is denied',(await post(file,'https://foreign.example')).status()===403);
 check('Dedicated import reader handles valid JSON larger than 64 KiB',(await post(' '.repeat(70000)+JSON.stringify(file))).status()===200);
 check('Dedicated import reader rejects bodies over 1 MiB',(await post(' '.repeat(1048577)+JSON.stringify(file))).status()===400);
 query(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(src+'-member')}`);check('Source revocation denies file preview',(await post(file)).status()===404);query(`UPDATE workspace_memberships SET status='active' WHERE id=${lit(src+'-member')}`);
 query(`UPDATE workspace_memberships SET role='team_member' WHERE id=${lit(dest+'-member')}`);check('Destination demotion denies file preview',(await post(file)).status()===403);query(`UPDATE workspace_memberships SET role='owner' WHERE id=${lit(dest+'-member')}`);
 check('File previews leave source rows, sends and destination profiles unchanged',snapshot()===before);
}
