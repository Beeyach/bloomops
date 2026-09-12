// Shared real-SQL upgrade/invariant acceptance for Node SQLite and native D1/R2.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent, createAdsContent } from '../lib/bloomops/content.mjs';
import { requestContentApproval, respondContentApproval, withdrawContentApproval, getPortalApproval } from '../lib/bloomops/content-approvals.mjs';
import { uploadContentFile, retryContentFile, changeContentFile, downloadContentFile } from '../lib/bloomops/content-files.mjs';
import { uploadFile } from '../lib/bloomops/files.mjs';
import { getPortalContent } from '../lib/bloomops/portal-content.mjs';
import { seedLegacyContent, seedAdsParents, contentContextTables } from './content-context-fixture.mjs';

export async function reviewMediaAcceptance(binding,bucket,migrations,check,oldApp=null) {
 const run=(q,...p)=>binding.prepare(q).bind(...p).run(),all=async(q,...p)=>(await binding.prepare(q).bind(...p).all()).results.map(row=>({...row}));
 const one=async(q,...p)=>(await all(q,...p))[0],insert=(table,row,verb='INSERT')=>run(`${verb} INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row));
 const denied=async(name,fn)=>{await assert.rejects(fn);check(name,true);};
 for(const statements of migrations.slice(0,23))for(const q of statements)await run(q);
 await seedLegacyContent(run);await seedAdsParents(run);
 const db=drizzle(binding,{schema}),actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
 const owner=await actor('ellen'),client=await actor('james');
 const created=await createAdsContent(db,{actor:owner,projectId:'ads-project',requestId:crypto.randomUUID(),input:{title:'Submitted campaign',script:'Original copy'}});assert.ok(created.ok);const contentId=created.contentId;
 const bytes=new TextEncoder().encode('Exact original creative bytes'),meta={requestId:crypto.randomUUID(),filename:'creative.png',mimeType:'image/png',byteSize:bytes.length,purpose:'asset',visibility:'internal'};
 const upload=extra=>uploadContentFile(db,{actor:owner,bucket,contentId,input:{...meta,requestId:crypto.randomUUID()},bytes,...extra});
 const uploaded=await upload({input:meta});assert.ok(uploaded.ok);const fileId=uploaded.fileId;
 const work=await uploadFile(db,{actor:owner,bucket,projectId:'ads-project',bytes,input:{requestId:crypto.randomUUID(),filename:'work.png',mimeType:'image/png',byteSize:bytes.length,visibility:'internal'}});assert.ok(work.ok);
 const tables=[...contentContextTables,'asset_links','asset_upload_attempts'];
 const before=await Promise.all(tables.map(t=>all(`SELECT * FROM ${t} ORDER BY rowid`))),oldTriggers=await all("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name"),oldIndexes=await all("SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name");
 for(const statements of migrations.slice(23))for(const q of statements)await run(q);
 const after=await Promise.all(tables.map(t=>all(`SELECT * FROM ${t} ORDER BY rowid`)));
 for(let i=0;i<after.length;i++)assert.deepEqual(tables[i]==='content_review_revisions'?after[i].map(({review_scope,media_count,...row})=>{assert.equal(review_scope,'copy_only');assert.equal(media_count,0);return row;}):after[i],before[i].map(row=>({...row})));
 check('populated 23-migration Content, File, platforms, rounds and activity survive unchanged',true);
 const triggers=await all("SELECT name,sql FROM sqlite_master WHERE type='trigger'"),indexes=await all("SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
 for(const t of oldTriggers)assert.ok(triggers.some(n=>n.name===t.name&&(['content_review_revisions_insert_guard','content_approval_rounds_insert_guard'].includes(t.name)||n.sql===t.sql)),t.name);
 for(const i of oldIndexes)assert.ok(indexes.some(n=>n.name===i.name&&n.sql===i.sql),i.name);
 check('all historical trigger names/indexes and unrelated trigger definitions are retained',true);
 check('open pre-migration Social round resolves',(await respondContentApproval(db,{actor:client,roundId:'round-open',input:{decision:'approved'}})).ok);
 if(oldApp){
  const oldDb=drizzle(binding,{schema:oldApp.schema});
  const legacy=await oldApp.createContent(oldDb,{actor:owner,clientId:'james',requestId:crypto.randomUUID(),input:{title:'Accepted E2B application',type:'reel',visibility:'client'}});
  check('accepted E2B application creates Social Content on upgraded D1',legacy.ok);
  await run("UPDATE content_items SET stage='client_review' WHERE id=?",legacy.contentId);
  const args={actor:owner,contentId:legacy.contentId,input:{requestId:crypto.randomUUID(),expectedRevision:1}};
  const requested=await oldApp.requestContentApproval(oldDb,args);
  check('accepted E2B application requests with its original schema and INSERT builder',requested.ok);
  check('accepted E2B application retries its request unchanged',(await oldApp.requestContentApproval(oldDb,args)).unchanged);
  check('accepted E2B application reads its Social approval',!!await oldApp.getPortalApproval(oldDb,client,requested.roundId));
  check('accepted E2B application resolves its Social approval',(await oldApp.respondContentApproval(oldDb,{actor:client,roundId:requested.roundId,input:{decision:'approved'}})).ok);
 }
 const social=await createContent(db,{actor:owner,clientId:'james',requestId:crypto.randomUUID(),input:{title:'New Social request',type:'reel',visibility:'client'}});assert.ok(social.ok);
 await run("UPDATE content_items SET stage='client_review' WHERE id=?",social.contentId);
 const request={actor:owner,contentId:social.contentId,input:{requestId:crypto.randomUUID(),expectedRevision:1}},round=await requestContentApproval(db,request);check('updated all-column Social insert binds copy-only defaults',round.ok);
 check('new Social request retry preserves its receipt',(await requestContentApproval(db,request)).unchanged);
 const dto=await getPortalApproval(db,client,round.roundId);check('Social portal snapshot shape stays copy/platform only',dto&&!Object.hasOwn(dto.snapshot,'reviewScope')&&!Object.hasOwn(dto.snapshot,'media'));
 check('new Social round withdraws',(await withdrawContentApproval(db,{actor:owner,roundId:round.roundId,input:{expectedRevision:2}})).ok);
 // Original compiled C5 INSERT shape excludes the two new columns entirely.
 const priorRevision=before[4][0],oldContent={...before[0].find(c=>c.id==='open'),id:crypto.randomUUID(),creation_request_id:crypto.randomUUID()};await insert('content_items',oldContent);await run("INSERT INTO content_platforms(workspace_id,content_id,platform_key,label) VALUES('a',?,'instagram','Instagram')",oldContent.id);
 const oldRevision={...priorRevision,id:crypto.randomUUID(),content_id:oldContent.id,number:1};await insert('content_review_revisions',oldRevision);
 const oldRound={...before[5].find(r=>r.id==='round-open'),id:crypto.randomUUID(),content_id:oldContent.id,revision_id:oldRevision.id,request_id:crypto.randomUUID()};await insert('content_approval_rounds',oldRound);
 check('old explicit C5 snapshot/round insert shapes remain compatible',(await one('SELECT review_scope,media_count FROM content_review_revisions WHERE id=?',oldRevision.id)).media_count===0);
 // Distinct identities still collide with the partial one-requested index.
 // SQLite REPLACE must never silently delete the original open round.
 const competingRevision={...oldRevision,id:crypto.randomUUID(),number:2};await insert('content_review_revisions',competingRevision);
 await denied('partial requested-round uniqueness cannot replace an open round',()=>insert('content_approval_rounds',{...oldRound,id:crypto.randomUUID(),revision_id:competingRevision.id,number:2,request_id:crypto.randomUUID()},'INSERT OR REPLACE'));
 check('partial-index collision retains original open round provenance',JSON.stringify(await one('SELECT * FROM content_approval_rounds WHERE id=?',oldRound.id))===JSON.stringify({...oldRound}));
 check('old-shape Social round responds through current application',(await respondContentApproval(db,{actor:client,roundId:oldRound.id,input:{decision:'approved'}})).ok);
 await run("UPDATE content_items SET stage='internal_review' WHERE id=?",contentId);
 const revisionRow=async(extra={})=>{const c=await one('SELECT * FROM content_items WHERE id=?',contentId),n=await one('SELECT coalesce(max(number),0)+1 AS n FROM content_review_revisions WHERE content_id=?',contentId);return {id:crypto.randomUUID(),workspace_id:'a',content_id:contentId,number:n.n,...Object.fromEntries(['title','type','hook','script','caption','cta','target_publish_date'].map(k=>[k,c[k]])),platforms_json:'[]',review_scope:'copy_and_media',media_count:1,...extra};};
 const revision=async(extra={})=>{const row=await revisionRow(extra);await insert('content_review_revisions',row);return row;};
 const evidence=async(v,extra={})=>{const f=await one('SELECT * FROM assets WHERE id=?',fileId);return {workspace_id:'a',content_id:contentId,revision_id:v.id,asset_id:fileId,position:1,file_revision:f.revision,...Object.fromEntries(['filename','mime_type','byte_size','sha256','object_key','etag','ready_at'].map(k=>[k,f[k]])),...extra};};
 const roundRow=v=>({id:crypto.randomUUID(),workspace_id:'a',content_id:contentId,revision_id:v.id,number:v.number,request_id:crypto.randomUUID(),request_revision:1,requested_by:owner.membershipId,requested_at:'2026-09-12T12:00:00Z'});
 for(const extra of [{review_scope:'unknown'},{review_scope:null},{media_count:0},{media_count:11},{media_count:1.5},{review_scope:'copy_only',media_count:1},{title:'Forged copy'},{platforms_json:'["Forged"]'},{workspace_id:'b'}])await denied(`revision rejects ${JSON.stringify(extra)}`,async()=>insert('content_review_revisions',await revisionRow(extra)));
 for(const [table,id,column,value] of [['projects','ads-project','visibility','restricted'],['content_items',contentId,'visibility','restricted'],['content_items',contentId,'recording_required',1],['content_items',contentId,'stage','editing'],['service_types','type-ads','department_id','social']]){
  const old=await one(`SELECT ${column} AS value FROM ${table} WHERE id=?`,id);await run(`UPDATE ${table} SET ${column}=? WHERE id=?`,value,id);await denied(`capture rejects ineligible ${table}.${column}`,async()=>insert('content_review_revisions',await revisionRow()));await run(`UPDATE ${table} SET ${column}=? WHERE id=?`,old.value,id);
 }
 const copyOnly=await revision({review_scope:'copy_only',media_count:0});await denied('copy-only cannot attach media',async()=>insert('content_review_assets',await evidence(copyOnly)));
 const v=await revision();
 const workFile=await one('SELECT * FROM assets WHERE id=?',work.fileId);
 await denied('exact Work File generation cannot attach to a Content review',async()=>insert('content_review_assets',await evidence(v,{asset_id:work.fileId,file_revision:workFile.revision,...Object.fromEntries(['filename','mime_type','byte_size','sha256','object_key','etag','ready_at'].map(k=>[k,workFile[k]]))})));
 const rollback=await revisionRow(),rollbackMedia=await evidence(rollback),statement=(table,row)=>binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row));
 await denied('late round failure rolls back revision and selected media in D1 batch',()=>binding.batch([statement('content_review_revisions',rollback),statement('content_review_assets',rollbackMedia),statement('content_approval_rounds',roundRow(rollback))]));
 check('failed seal leaves no orphan evidence',!await one('SELECT id FROM content_review_revisions WHERE id=?',rollback.id)&&!await one('SELECT asset_id FROM content_review_assets WHERE revision_id=?',rollback.id));
 for(const extra of [{workspace_id:'b'},{content_id:'recording'},{asset_id:'legacy-file'},{position:0},{position:2},{position:11},{file_revision:99},{filename:'Forged.png'},{mime_type:'text/html'},{byte_size:bytes.length+1},{sha256:'0'.repeat(64)},{object_key:'other/key'},{etag:'other'},{ready_at:'other'}])await denied(`manifest rejects ${Object.keys(extra).join(',')}`,async()=>insert('content_review_assets',await evidence(v,extra)));
 await run("UPDATE assets SET visibility='restricted',revision=revision+1 WHERE id=?",fileId);await denied('restricted File cannot be selected',async()=>insert('content_review_assets',await evidence(v)));await run("UPDATE assets SET visibility='internal',revision=revision+1 WHERE id=?",fileId);
 await run("UPDATE content_items SET stage='client_review' WHERE id=?",contentId);await denied('round refuses missing declared media',()=>insert('content_approval_rounds',roundRow(v)));await run("UPDATE content_items SET stage='internal_review' WHERE id=?",contentId);
 const e=await evidence(v);await insert('content_review_assets',e);check('exact ready generation is pinned without copying objects',true);
 for(const q of ["UPDATE content_review_assets SET etag='changed'","DELETE FROM content_review_assets","UPDATE content_review_revisions SET media_count=0 WHERE id=?"]){await denied('review evidence cannot be changed or deleted',()=>run(q,...q.includes('?')?[v.id]:[]));}
 await denied('manifest cannot replace its row',()=>insert('content_review_assets',e,'INSERT OR REPLACE'));
 await denied('revision cannot replace its identity',async()=>insert('content_review_revisions',await revisionRow({id:v.id}),'INSERT OR REPLACE'));
 const physical=(await one('SELECT rowid FROM content_review_assets WHERE revision_id=?',v.id)).rowid;await denied('manifest physical identity cannot be replaced',async()=>insert('content_review_assets',{...await evidence(copyOnly),rowid:physical},'INSERT OR REPLACE'));
 // Complete selection at sealing is rechecked against current File revision.
 await run("UPDATE assets SET revision=revision+1 WHERE id=?",fileId);await run("UPDATE content_items SET stage='client_review' WHERE id=?",contentId);await denied('round refuses changed selection revision',()=>insert('content_approval_rounds',roundRow(v)));await run('UPDATE assets SET revision=? WHERE id=?',e.file_revision,fileId);
 const r=roundRow(v);await insert('content_approval_rounds',r);check('round seals a complete contiguous selection',true);
 await denied('sealed selection cannot append',async()=>insert('content_review_assets',await evidence(v,{asset_id:'other',position:2})));
 await denied('open round still freezes reviewed copy',()=>run("UPDATE content_items SET script='Changed' WHERE id=?",contentId));
 check('Ads request remains outside the active API domain',(await requestContentApproval(db,{actor:owner,contentId,input:{requestId:crypto.randomUUID(),expectedRevision:1}})).reason==='not_found');
 check('Ads round remains unavailable to Client GET/response',await getPortalApproval(db,client,r.id)===null&&(await respondContentApproval(db,{actor:client,roundId:r.id,input:{decision:'approved'}})).reason==='not_found');
 check('generic portal Content remains Social-only',await getPortalContent(db,client,contentId)===null);
 const pinned=await one('SELECT * FROM assets WHERE id=?',fileId),storedBefore=await bucket.get(pinned.object_key);assert.deepEqual(new Uint8Array(await new Response(storedBefore.body).arrayBuffer()),bytes);check('pinned original bytes and SHA256 agree',Buffer.from(storedBefore.checksums.sha256).toString('hex')===pinned.sha256&&storedBefore.etag===pinned.etag);
 for(const [column,value] of [['object_key','other/key'],['etag','changed'],['ready_at',null],['filename','other.png'],['sha256','0'.repeat(64)],['rowid',-2]])await denied(`pinned File rejects ${column} rewrite`,()=>run(`UPDATE assets SET ${column}=? WHERE id=?`,value,fileId));
 const pinnedLink=await one('SELECT * FROM content_asset_links WHERE asset_id=?',fileId);
 await denied('pinned Content File attachment cannot be replaced as recording',()=>insert('content_asset_links',{...pinnedLink,purpose:'recording'},'INSERT OR REPLACE'));
 await denied('pinned attachment identity cannot be retargeted',()=>insert('content_asset_links',{...pinnedLink,content_id:'recording'},'INSERT OR REPLACE'));
 await denied('pinned File cannot be deleted',()=>run('DELETE FROM assets WHERE id=?',fileId));
 await denied('pinned File identity cannot be replaced',()=>insert('assets',{...pinned,visibility:'client'},'INSERT OR REPLACE'));
 await denied('pinned request collision cannot replace its File',()=>insert('assets',{...pinned,id:crypto.randomUUID(),object_key:'another-key'},'INSERT OR REPLACE'));
 const loser={...pinned,id:crypto.randomUUID(),object_key:'harmless-new-key'};await run(`INSERT INTO assets(${Object.keys(loser).join(',')}) VALUES(${Object.keys(loser).map(()=>'?').join(',')}) ON CONFLICT(workspace_id,creation_request_id) DO NOTHING`,...Object.values(loser));check('canonical competing upload request no-op preserves retained File',(await one('SELECT id FROM assets WHERE creation_request_id=?',pinned.creation_request_id)).id===fileId);
 // Close the future-only round directly; E3A intentionally has no Ads resolver.
 await run("UPDATE content_approval_rounds SET status='withdrawn',withdrawn_by='m-ellen',withdrawn_at='2026-09-12T13:00:00Z',completion_revision=2,completion_id=? WHERE id=?",crypto.randomUUID(),r.id);
 for(const extra of [{id:r.id,request_id:crypto.randomUUID()},{id:crypto.randomUUID(),request_id:r.request_id},{rowid:(await one('SELECT rowid FROM content_approval_rounds WHERE id=?',r.id)).rowid,id:crypto.randomUUID(),request_id:crypto.randomUUID()}])await denied('terminal round replacement cannot erase completion provenance',()=>insert('content_approval_rounds',{...r,...extra},'INSERT OR REPLACE'));
 await run("UPDATE content_items SET stage='internal_review' WHERE id=?",contentId);
 // The full ten-entry manifest is accepted, with exact ordered identities.
 const ten=await revision({media_count:10});
 for(let position=1;position<=10;position++){
  const next=await upload();assert.ok(next.ok);const f=await one('SELECT * FROM assets WHERE id=?',next.fileId);
  await insert('content_review_assets',await evidence(ten,{asset_id:f.id,position,file_revision:f.revision,...Object.fromEntries(['filename','mime_type','byte_size','sha256','object_key','etag','ready_at'].map(k=>[k,f[k]]))}));
 }
 await run("UPDATE content_items SET stage='client_review' WHERE id=?",contentId);const tenRound=roundRow(ten);await insert('content_approval_rounds',tenRound);check('ten ordered selected media entries seal at the exact bound',(await all('SELECT position FROM content_review_assets WHERE revision_id=? ORDER BY position',ten.id)).map(r=>r.position).join()==='1,2,3,4,5,6,7,8,9,10');
 await run("UPDATE content_approval_rounds SET status='withdrawn',withdrawn_by='m-ellen',withdrawn_at='2026-09-12T13:00:00Z',completion_revision=2,completion_id=? WHERE id=?",crypto.randomUUID(),tenRound.id);await run("UPDATE content_items SET stage='internal_review' WHERE id=?",contentId);
 check('retained File visibility remains revocable',(await changeContentFile(db,{actor:owner,contentId,fileId,operation:'visibility',visibility:'restricted',expectedRevision:pinned.revision})).ok);
 check('retained ready File can be archived',(await changeContentFile(db,{actor:owner,contentId,fileId,operation:'archive',expectedRevision:pinned.revision+1})).ok);
 check('archived working File download is unavailable',await downloadContentFile(db,{actor:owner,bucket,fileId})===null);
 const retained=await bucket.get(pinned.object_key);check('archive retains exact original media bytes',retained&&new TextDecoder().decode(await new Response(retained.body).arrayBuffer())===new TextDecoder().decode(bytes));
 await denied('archived pinned generation cannot be revived',()=>run("UPDATE assets SET status='uploading',object_key='new-generation' WHERE id=?",fileId));
 // Force an interrupted upload; its recovery exercises cleanup with unrelated pins.
 const deletes=[],wrapped={put:async()=>{throw new Error('Interrupted');},head:bucket.head.bind(bucket),get:bucket.get.bind(bucket),delete:async key=>{deletes.push(key);await bucket.delete(key);}};
 const failed=await upload({bucket:wrapped});check('interrupted upload stays recoverable',!failed.ok);
 const failing=await one("SELECT * FROM assets WHERE status='failed' AND id<>? ORDER BY rowid DESC LIMIT 1",fileId);assert.ok(failing);
 const cleanupBucket={put:bucket.put.bind(bucket),head:bucket.head.bind(bucket),get:bucket.get.bind(bucket),delete:async key=>{
  // Once a stale attempt was selected for cleanup, it cannot become evidence.
  const old=await one('SELECT f.* FROM assets f JOIN asset_upload_attempts a ON a.asset_id=f.id AND a.workspace_id=f.workspace_id WHERE a.object_key=?',key);
  assert.ok(old);await denied('cleanup candidate cannot be revived while deletion is pending',()=>run("UPDATE assets SET status='uploading',object_key=? WHERE id=?",key,old.id));
  await denied('cleanup candidate cannot become selected evidence',async()=>insert('content_review_assets',await evidence(await revision(),{asset_id:old.id,object_key:key})));
  deletes.push(key);await bucket.delete(key);
 }};
 const recovered=await retryContentFile(db,{actor:owner,bucket:cleanupBucket,contentId,fileId:failing.id,input:{filename:meta.filename,mimeType:meta.mimeType,byteSize:bytes.length},bytes});check('failed upload recovers through canonical protocol',recovered.ok);
 check('cleanup never deletes a pinned object',!deletes.includes(pinned.object_key)&&!!await bucket.head(pinned.object_key));
 const afterFile=await one('SELECT * FROM assets WHERE id=?',fileId);for(const key of ['object_key','etag','ready_at','sha256','filename','mime_type','byte_size'])assert.equal(afterFile[key],pinned[key]);check('retained evidence survives recovery unchanged',true);
 const cleanupReadsFail={prepare(q){if(q.includes('FROM content_review_assets evidence'))throw new Error('Evidence read unavailable');return binding.prepare(q);},batch:binding.batch.bind(binding)};
 const failingDb=drizzle(cleanupReadsFail,{schema}),unconfirmedKey=[];
 const unconfirmedBucket={put:async(...args)=>{await bucket.put(...args);unconfirmedKey.push(args[0]);throw new Error('Lost PUT response');},head:bucket.head.bind(bucket),get:bucket.get.bind(bucket),delete:async()=>{throw new Error('Cleanup must not run without evidence');}};
 const uncertain=await uploadContentFile(failingDb,{actor:owner,bucket:unconfirmedBucket,contentId,input:{...meta,requestId:crypto.randomUUID()},bytes});
 check('failed retention lookup leaves uncertain object untouched',!uncertain.ok&&unconfirmedKey.length===1&&!!await bucket.head(unconfirmedKey[0]));
 const uncertainFile=await one('SELECT * FROM assets WHERE object_key=?',unconfirmedKey[0]);assert.equal(uncertainFile.status,'failed');
 const recoveredUncertain=await retryContentFile(db,{actor:owner,bucket,contentId,fileId:uncertainFile.id,input:{filename:meta.filename,mimeType:meta.mimeType,byteSize:bytes.length},bytes});
 check('explicit recovery cleans only unpinned uncertain generation',recoveredUncertain.ok&&!await bucket.head(unconfirmedKey[0])&&!!await bucket.head(pinned.object_key));
 check('native foreign keys and integrity pass',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
}
