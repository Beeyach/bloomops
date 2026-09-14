import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
export async function checkImportCommit({context,page,base,src,foreign,dest,out,query,lit,check}){
 const prefix='Receipt '+randomUUID().slice(0,8),url=base+'/prospecting/import/review',headers={origin:base};
 for(let i=0;i<3;i++)query(`INSERT INTO prospects(workspace,business_name,name,domain,email,country,source,stage,created_at,updated_at) VALUES(${lit(src)},${lit(prefix+' '+i)},'Maya Example',${lit('receipt'+i+'.example.com')},${lit(prefix.replaceAll(' ','').toLowerCase()+i+'@example.com')},'Canada','Public directory','New','2026-09-12 00:00:00','2026-09-12 00:00:00')`);
 const ids=query(`SELECT id FROM prospects WHERE workspace=${lit(src)} AND business_name LIKE ${lit(prefix+'%')} ORDER BY id`).map(row=>row.id);
 const exported=await(await context.request.post(base+'/api/bloomops/prospecting/source-export',{headers,data:{source:src,ids}})).json();
 const dupe=await context.request.post(base+'/api/bloomops/prospecting',{headers,data:{workspaceId:dest,requestId:randomUUID(),fields:{businessName:prefix+' existing',publicEmail:exported.records[1].fields.publicEmail}}});check('Existing destination fixture uses canonical create',dupe.status()===200||dupe.status()===201);
 const file=structuredClone(exported);file.records[2].fields.publicEmail='invalid';
 const post=body=>context.request.post(base+'/api/bloomops/prospecting/import-commit',{headers,data:body});
 const sourceSnapshot=()=>JSON.stringify(query(`SELECT * FROM prospects WHERE workspace=${lit(src)} ORDER BY id`));
 const counts=()=>query(`SELECT (SELECT count(*) FROM bloomops_prospects WHERE workspace_id=${lit(dest)}) profiles,(SELECT count(*) FROM prospect_import_receipts WHERE workspace_id=${lit(dest)}) receipts,(SELECT count(*) FROM activity_events WHERE workspace_id=${lit(dest)} AND subject_type='prospect') events`)[0];
 const beforeSource=sourceSnapshot(),before=counts();
 const upload=async doc=>page.getByLabel('Raw prospect export',{exact:true}).setInputFiles({name:'raw-prospects.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
 await page.goto(url,{waitUntil:'networkidle'});await upload(file);await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('heading',{name:'Import preview',exact:true}).waitFor();
 check('Only ready rows are offered for explicit import',await page.getByRole('button',{name:'Import 1 ready prospect',exact:true}).isVisible());
 let release,started,firstBody,receiptId;
 const gate=new Promise(r=>release=r),pending=new Promise(r=>started=r);
 await page.route('**/api/bloomops/prospecting/import-commit',async route=>{
  firstBody=route.request().postDataJSON();const response=await route.fetch();const data=await response.json();receiptId=data.receiptId;started();await gate;await route.abort('failed');
 });
 await page.getByRole('button',{name:'Import 1 ready prospect',exact:true}).click();await pending;
 check('Import locks file and repeat controls while pending',await page.getByLabel('Raw prospect export',{exact:true}).isDisabled()&&await page.getByRole('button',{name:'Importing…',exact:true}).isDisabled());
 release();await page.getByRole('alert').filter({hasText:'The result could not be confirmed.'}).waitFor();await page.unroute('**/api/bloomops/prospecting/import-commit');
 check('Lost response committed exactly one profile, receipt and event',!!receiptId&&counts().profiles===before.profiles+1&&counts().receipts===before.receipts+1&&counts().events===before.events+1);
 let retryBody;
 const retry=page.waitForRequest(r=>r.url().endsWith('/api/bloomops/prospecting/import-commit'));
 await page.getByRole('button',{name:'Import 1 ready prospect',exact:true}).click();retryBody=(await retry).postDataJSON();await page.getByRole('heading',{name:'Import complete',exact:true}).waitFor();
 check('Lost-response retry preserves exact request identity',JSON.stringify(retryBody)===JSON.stringify(firstBody));
 check('Retry returns original receipt and no duplicate writes',(await page.getByRole('link',{name:'View import receipt',exact:true}).getAttribute('href')).endsWith(receiptId)&&counts().profiles===before.profiles+1&&counts().events===before.events+1);
 check('Completion receives keyboard focus',await page.locator('.bo-import-result[role="status"]').evaluate(el=>document.activeElement===el));
 check('Import preserves source fields and history',sourceSnapshot()===beforeSource);
 await page.getByRole('link',{name:'View import receipt',exact:true}).click();await page.waitForLoadState('networkidle');
 const receiptUrl=base+'/prospecting/import/receipts/'+receiptId;
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.goto(receiptUrl,{waitUntil:'networkidle'});
  check(`Durable receipt reconciles all outcomes at ${width}px`,(await page.locator('[aria-label="Import receipt counts"] dd').allTextContents()).join(',')==='3,1,1,1'&&await page.locator('[aria-label="Import outcomes"]>li').count()===3);
  check(`Receipt fits viewport and retains Bloomsi at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await page.getByRole('img',{name:'Bloomsi',exact:true}).evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility()).length)===1);
  await page.screenshot({path:join(out,`receipt-${width}.png`)});
 }
 await page.getByRole('link',{name:'Open prospect',exact:true}).click();await page.waitForLoadState('networkidle');
 await page.getByText('Sources & verification',{exact:true}).click();check('Imported profile exposes persistent source provenance',await page.getByRole('heading',{name:'Imported raw record',exact:true}).isVisible()&&await page.locator('.bo-import-provenance').getByText('Public directory',{exact:true}).isVisible());
 check('Imported profile has an accurate record source',await page.getByText('Raw import',{exact:true}).isVisible()&&await page.getByText('Added manually',{exact:true}).count()===0);
 await page.locator('.bo-import-provenance').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'imported-profile-320.png')});
 await page.goto(base+'/prospecting/import/receipts',{waitUntil:'networkidle'});check('Receipt is recoverable from import history after reload',await page.locator(`a[href="/prospecting/import/receipts/${receiptId}"]`).count()===1);
 check('New request for already-imported source conflicts',(await post({...firstBody,requestId:randomUUID()})).status()===409);
 check('Changed payload cannot reuse completed request ID',(await post({...firstBody,document:{...firstBody.document,exportedAt:'2026-09-01'}})).status()===409);
 query(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(src+'-member')}`);
 check('Source revocation blocks commit retries',(await post(firstBody)).status()===404);
 check('Destination still owns its imported receipt after source revocation',(await context.request.get(receiptUrl)).status()===200);
 query(`UPDATE workspace_memberships SET status='active' WHERE id=${lit(src+'-member')}`);
 await context.request.post(base+'/api/bloomops/workspaces/select',{headers,data:{workspaceId:src}});
 await page.goto(receiptUrl,{waitUntil:'networkidle'});check('Receipt cannot be read from another selected workspace',await page.getByRole('heading',{name:'There is nothing here',exact:true}).isVisible()&&await page.getByText(prefix+' 0',{exact:true}).count()===0);
 await context.request.post(base+'/api/bloomops/workspaces/select',{headers,data:{workspaceId:dest}});
 check('Cross-origin commits are denied',(await context.request.post(base+'/api/bloomops/prospecting/import-commit',{headers:{origin:'https://foreign.example'},data:firstBody})).status()===403);
 const freshFile={...exported,records:[exported.records[2]]};
 await page.goto(url,{waitUntil:'networkidle'});await upload(freshFile);await page.getByRole('button',{name:'Preview import',exact:true}).click();await page.getByRole('button',{name:'Import 1 ready prospect',exact:true}).waitFor();
 const beforeConflict=counts();query(`UPDATE prospects SET do_not_contact=1 WHERE id=${ids[2]}`);
 await page.getByRole('button',{name:'Import 1 ready prospect',exact:true}).click();await page.getByRole('alert').filter({hasText:'Records changed since preview.'}).waitFor();
 check('Source change produces refreshed rejection without partial import',JSON.stringify(counts())===JSON.stringify(beforeConflict)&&await page.getByRole('button',{name:'Import 1 ready prospect',exact:true}).count()===0);
 await page.screenshot({path:join(out,'commit-conflict-320.png')});
 // Native maximum-size commit, followed by simultaneous retries of one new request.
 const largeStatements=[];for(let i=0;i<50;i++){largeStatements.push(`INSERT INTO prospects(workspace,business_name,domain,email,stage,created_at,updated_at) VALUES(${lit(src)},${lit(prefix+' large '+i)},${lit('bulk'+i+'.example.com')},${lit('bulk'+i+'@example.com')},'New','2026-09-12 00:00:00','2026-09-12 00:00:00')`);}
 query(largeStatements.join(';'));const largeIds=query(`SELECT id FROM prospects WHERE workspace=${lit(src)} AND business_name LIKE ${lit(prefix+' large %')} ORDER BY id`).map(row=>row.id);
 const bigResponse=await context.request.post(base+'/api/bloomops/prospecting/source-export',{headers,data:{source:src,ids:largeIds}}),big=await bigResponse.json();check('Native maximum source export returns 50 raw records',bigResponse.status()===200&&big.records?.length===50);
 const previewResponse=await context.request.post(base+'/api/bloomops/prospecting/import-preview',{headers,data:big}),preview=await previewResponse.json();check('Native maximum preview checks all 50 rows',previewResponse.status()===200&&preview.counts?.ready===50);
 const body={workspaceId:dest,requestId:randomUUID(),document:big,previewHash:preview.previewHash,selected:preview.rows.filter(r=>r.status==='ready').map(r=>r.index)},old=counts(),beforeBulkSource=sourceSnapshot();
 const responses=await Promise.all([post(body),post(body)]),results=await Promise.all(responses.map(r=>r.json()));
 check('Native 50-record concurrent retries return one receipt',responses.every(r=>r.status()===200)&&!!results[0].receiptId&&results[0].receiptId===results[1].receiptId);
 check('Native maximum import creates exactly50 profiles/events and one receipt',counts().profiles===old.profiles+50&&counts().events===old.events+50&&counts().receipts===old.receipts+1&&sourceSnapshot()===beforeBulkSource);
}
