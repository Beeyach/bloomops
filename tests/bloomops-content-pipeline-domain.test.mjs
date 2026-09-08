import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content.mjs';
import { run } from './_bloomops-db.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { contentNextStages, contentNeedsContext } from '../lib/bloomops/content-pipeline-values.mjs';
import { CONTENT_STAGES } from '../lib/bloomops/content-values.mjs';
const move=async(t,id,stage,extra={})=>transitionContent(t.db,{actor:t.owner,contentId:id,input:{targetStage:stage,expectedRevision:(await t.item(id)).revision,...(contentNeedsContext(stage)?{context:'Needed from James'}:{})},...extra});
for(let mask=0;mask<8;mask++)test(`pipeline flags ${mask}: complete path, conditional skips, terminal timestamp and parent isolation`,async()=>{
 const t=await setup(),flags={recordingRequired:!!(mask&1),internalReviewRequired:!!(mask&2),clientApprovalRequired:!!(mask&4)},id=(await t.add(flags)).contentId,parents=t.parents();
 const expected=['idea','script',...(flags.recordingRequired?['waiting_for_recording']:[]),'editing',...(flags.internalReviewRequired?['internal_review']:[]),...(flags.clientApprovalRequired?['client_review']:[]),'approved','scheduled','published'];
 for(const [index,stage]of expected.entries()){
  const item=await t.item(id);assert.equal(item.stage,stage);assert.equal(item.revision,index+1);
  assert.equal(item.stageContext,stage==='waiting_for_recording'?'Needed from James':null);
  if(stage==='published'){assert.ok(item.publishedAt);const before=t.snapshot();assert.deepEqual(contentNextStages(item),[]);assert.equal((await move(t,id,'idea')).reason,'invalid');assert.deepEqual(t.snapshot(),before);break;}
  assert.equal(item.publishedAt,null);assert.equal(contentNextStages(item)[0],expected[index+1]);assert.ok((await move(t,id,expected[index+1])).ok);
 }
 assert.equal(t.history().filter(e=>e.event_type==='CONTENT_STAGE_CHANGED').length,expected.length-1);assert.deepEqual(t.parents(),parents);
});
for(const source of CONTENT_STAGES)test(`${source}: every target obeys exact default transition graph`,async()=>{
 const t=await setup();const legal={idea:['script'],script:['waiting_for_recording'],waiting_for_recording:['editing'],editing:['internal_review'],internal_review:['client_review','revision_requested'],client_review:['approved','revision_requested'],revision_requested:['editing'],approved:['scheduled'],scheduled:['published'],published:[]};
 for(const target of CONTENT_STAGES){const id=(await t.add({recordingRequired:true})).contentId;run(t.raw,'UPDATE content_items SET stage=?, published_at=? WHERE id=?',source,source==='published'?'2026-09-01T00:00:00.000Z':null,id);const before=t.snapshot(),result=await move(t,id,target);assert.equal(result.ok,legal[source].includes(target),`${source} -> ${target}`);if(!result.ok)assert.deepEqual(t.snapshot(),before);}
});
for(const source of ['internal_review','client_review'])test(`${source} revision context persists, clears on Editing, and repeated passes do not confuse retries`,async()=>{
 const t=await setup(),id=(await t.add()).contentId;run(t.raw,'UPDATE content_items SET stage=? WHERE id=?',source,id);
 const input={targetStage:'revision_requested',expectedRevision:1,context:'  Fix opening\r\nInclude proof  '};assert.ok((await transitionContent(t.db,{actor:t.owner,contentId:id,input})).ok);assert.equal((await t.item(id)).stageContext,'Fix opening\nInclude proof');
 await move(t,id,'editing');assert.equal((await t.item(id)).stageContext,null);await move(t,id,'internal_review');await move(t,id,'revision_requested');const before=t.snapshot();assert.equal((await transitionContent(t.db,{actor:t.owner,contentId:id,input})).unchanged,true);assert.deepEqual(t.snapshot(),before);
});
for(const [stage,flag]of [['waiting_for_recording','recordingRequired'],['internal_review','internalReviewRequired'],['client_review','clientApprovalRequired']])test(`disable ${flag} in current ${stage} preserves current stage and allows forward`,async()=>{
 const t=await setup(),id=(await t.add({recordingRequired:true})).contentId;run(t.raw,'UPDATE content_items SET stage=? WHERE id=?',stage,id);await t.edit(id,{[flag]:false});assert.equal((await t.item(id)).stage,stage);assert.ok((await move(t,id,contentNextStages(await t.item(id))[0])).ok);
});
for(const stage of ['waiting_for_recording','revision_requested'])test(`${stage} exact normalized context bounds and invalid text leave no writes`,async()=>{
 const t=await setup(),id=(await t.add({recordingRequired:true})).contentId;run(t.raw,'UPDATE content_items SET stage=? WHERE id=?',stage==='waiting_for_recording'?'script':'internal_review',id);
 for(const context of [undefined,null,'',' \n ',12,{},[],'x'.repeat(2001),'😀'.repeat(1001),'\x00','\u202e','\ud800']){const before=t.snapshot();assert.equal((await move(t,id,stage,{input:{targetStage:stage,expectedRevision:1,context}})).reason,'invalid');assert.deepEqual(t.snapshot(),before);}
 assert.ok((await move(t,id,stage,{input:{targetStage:stage,expectedRevision:1,context:'é'.repeat(2000)}})).ok);
});
test('exact operation keys/revision/authority reject without writes',async()=>{
 const t=await setup(),id=(await t.add()).contentId,before=t.snapshot();
 for(const input of [null,[],1,...[0,-1,1.5,'1',Number.MAX_SAFE_INTEGER+1].map(expectedRevision=>({targetStage:'script',expectedRevision})),...['stage','publishedAt','stageContext','workspaceId','actor','requestId'].map(k=>({targetStage:'script',expectedRevision:1,[k]:'forged'})),{targetStage:'script',expectedRevision:1,context:'unrelated'}])assert.equal((await move(t,id,'script',{input})).reason,'invalid');assert.deepEqual(t.snapshot(),before);
 for(const k of ['stage','publishedAt','stageContext'])assert.equal((await t.edit(id,{[k]:'forged'})).reason,'invalid');
});
for(const kind of ['identical','different','edit'])test(`concurrent ${kind} transitions consume exactly one revision and event`,async()=>{
 const t=await setup(),id=(await t.add()).contentId;run(t.raw,"UPDATE content_items SET stage='internal_review' WHERE id=?",id);const input={targetStage:'client_review',expectedRevision:1};const first=()=>move(t,id,'client_review',{input});
 const results=await Promise.all([first(),kind==='identical'?first():kind==='edit'?t.edit(id,{caption:'Racing edit'},{expectedRevision:1}):move(t,id,'revision_requested',{input:{targetStage:'revision_requested',context:'Fix intro',expectedRevision:1}})]);
 assert.equal(results.filter(r=>r.ok).length,kind==='identical'?2:1);assert.equal((await t.item(id)).revision,2);assert.equal(t.history().length,2);
 if(kind==='identical')assert.equal(results.filter(r=>r.unchanged).length,1);
});
test('retry survives later edits; different context, edit-consumed revision, and same target without proof conflict',async()=>{
 const t=await setup(),id=(await t.add()).contentId;run(t.raw,"UPDATE content_items SET stage='internal_review' WHERE id=?",id);const input={targetStage:'revision_requested',context:'Fix intro',expectedRevision:1};await move(t,id,'revision_requested',{input});await t.edit(id,{caption:'Later'});const before=t.snapshot();assert.equal((await move(t,id,'revision_requested',{input})).unchanged,true);assert.equal((await move(t,id,'revision_requested',{input:{...input,context:'Another change'}})).reason,'conflict');assert.equal((await move(t,id,'revision_requested',{input:{...input,expectedRevision:2}})).reason,'conflict');assert.deepEqual(t.snapshot(),before);
});
test('Published race timestamp belongs once to winner, retry never rewrites after detail edit',async()=>{
 const t=await setup(),id=(await t.add()).contentId;run(t.raw,"UPDATE content_items SET stage='scheduled' WHERE id=?",id);const input={targetStage:'published',expectedRevision:1},dates=['2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z'];const results=await Promise.all(dates.map(date=>move(t,id,'published',{input,now:new Date(date)})));assert.ok(results.every(r=>r.ok));const winner=results.findIndex(r=>!r.unchanged);assert.equal((await t.item(id)).publishedAt,dates[winner]);await t.edit(id,{caption:'Typo fix'});const before=t.snapshot();assert.equal((await move(t,id,'published',{input,now:new Date('2026-10-01')})).unchanged,true);assert.deepEqual(t.snapshot(),before);
});
for(const fault of ['activity','fact'])test(`${fault} late failure rolls back transition and event`,async()=>{
 const t=await setup(),id=(await t.add()).contentId,before=t.snapshot();run(t.raw,`CREATE TRIGGER fail_c2 BEFORE ${fault==='activity'?'INSERT ON activity_events':'UPDATE ON content_items'} BEGIN SELECT RAISE(ABORT,'injected'); END`);await assert.rejects(move(t,id,'script'));assert.deepEqual(t.snapshot(),before);
});
test('stage filter is exact, canonical and paginated',async()=>{
 const t=await setup();for(let i=0;i<205;i++)run(t.raw,"INSERT INTO content_items(workspace_id,client_id,creation_request_id,title,type,stage) VALUES('a','james',?,'Filtered','reel','editing')",crypto.randomUUID());await t.add();const first=await t.list(t.owner,{stage:'editing'}),second=await t.list(t.owner,{stage:'editing',page:'2'});assert.equal(first.items.length,200);assert.ok(first.hasMore);assert.equal(second.items.length,5);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,205);for(const stage of ['Editing','invalid',[],1])assert.equal((await t.list(t.owner,{stage})).reason,'invalid');
});
test('transition winning between detail read and eligibility check makes edit a conflict',async()=>{
 const t=await setup(),id=(await t.add()).contentId,prepare=t.d1.prepare.bind(t.d1);let fired=false;
 t.d1.prepare=query=>{const statement=prepare(query);if(/^select "id" from "content_items" /.test(query)&&!fired){const bind=statement.bind.bind(statement);statement.bind=(...values)=>{const bound=bind(...values),raw=bound.raw.bind(bound);bound.raw=async()=>{fired=true;assert.ok((await move(t,id,'script')).ok);return raw();};return bound;};}return statement;};
 const result=await t.edit(id,{caption:'Losing detail'},{expectedRevision:1});assert.ok(fired);assert.equal(result.reason,'conflict');assert.equal((await t.item(id)).stage,'script');assert.equal((await t.item(id)).caption,null);assert.equal(t.history().length,2);
});
