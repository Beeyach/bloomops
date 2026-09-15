import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync,inflateSync} from 'node:zlib';
import {crc32} from '../lib/zip.mjs';
import {normalizeProfilePng} from '../lib/bloomops/profile-png.mjs';
import {photoSourceInfo} from '../lib/bloomops/photo-source.mjs';
import {changeProfilePhoto,getProfilePhoto,downloadProfilePhoto,ownedPhotoKey} from '../lib/bloomops/profile-photos.mjs';
import {setup} from './_work-projections.mjs';
import {run,one} from './_bloomops-db.mjs';
import {createWorkspacePage} from '../lib/bloomops/pages.mjs';
import {postPageComment} from '../lib/bloomops/page-comments.mjs';
import {updatePageSharing} from '../lib/bloomops/page-sharing.mjs';
import {getWorkspacePageTree} from '../lib/bloomops/page-hierarchy.mjs';
import {createClientPreview} from '../lib/bloomops/client-preview.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';

function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);b.set(data,8);b.writeUInt32BE(crc32(b.subarray(4,-4)),b.length-4);return b;}
function png({width=256,color=6,pixels=null,extra=[],end=true}={}){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(256,4);h[8]=8;h[9]=color;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),...extra,chunk('IDAT',deflateSync(pixels||Buffer.alloc(256*(1+256*(color===6?4:3))))),...(end?[chunk('IEND',Buffer.alloc(0))]:[])]);}
function bucket(){const objects=new Map();return {objects,put:async(key,bytes,options)=>{if(objects.has(key))return null;const object={key,size:bytes.length,bytes,httpMetadata:options.httpMetadata,checksums:{sha256:Uint8Array.from(Buffer.from(options.sha256,'hex')).buffer}};objects.set(key,object);return object;},head:async key=>objects.get(key)||null,get:async key=>{const o=objects.get(key);return o?{...o,body:new Blob([o.bytes]).stream()}:null;}};}
async function save(t,b,actor=t.owner,bytes=png(),info=null,id=crypto.randomUUID()){return changeProfilePhoto(t.db,{bucket:b,actor,bytes,input:{requestId:id,expectedVersion:(info||await getProfilePhoto(t.db,actor)).version}});}
const download=(t,b,actor=t.owner,context={kind:'self'})=>downloadProfilePhoto(t.db,{bucket:b,actor,context});

test('RGB and RGBA thumbnails preserve pixels and strip ancillary metadata',async()=>{
  for(const color of [2,6]){const input=png({color,extra:[chunk('tEXt',Buffer.from('private location'))]}),output=await normalizeProfilePng(input);assert.equal(Buffer.from(output).includes(Buffer.from('private location')),false);assert.equal(photoSourceInfo(output).width,256);assert.deepEqual(inflateSync(Buffer.from(output).subarray(41,-16)),Buffer.alloc(256*(1+256*(color===6?4:3))));}
});
for(const [name,make] of Object.entries({svg:()=>Buffer.from('<svg onload="evil"/>'),dimensions:()=>png({width:8192}),palette:()=>png({color:3}),animated:()=>png({extra:[chunk('acTL',Buffer.alloc(8))]}),missingEnd:()=>png({end:false}),shortPixels:()=>png({pixels:Buffer.alloc(8)}),bomb:()=>png({pixels:Buffer.alloc(2000000)}),filter:()=>png({pixels:Buffer.alloc(256*1025,5)}),crc:()=>{const b=png();b[29]^=1;return b;},trailing:()=>Buffer.concat([png(),Buffer.from('<script>')]),oversized:()=>Buffer.alloc(400000)}))test('rejects '+name,async()=>{await assert.rejects(normalizeProfilePng(make()));});
test('source selection rejects animation, oversized dimensions and executable bytes',()=>{
  assert.throws(()=>photoSourceInfo(png({width:8193})));assert.throws(()=>photoSourceInfo(png({extra:[chunk('acTL',Buffer.alloc(8))]})));assert.throws(()=>photoSourceInfo(Buffer.alloc(50)));assert.equal(photoSourceInfo(png()).type,'image/png');
});
test('own upload, immutable retry, replacement, stale save, removal and stale empty retry',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket(),empty=await getProfilePhoto(t.db,t.owner),id=crypto.randomUUID();
  const first=await save(t,b,t.owner,png(),empty,id);assert.equal(first.ok,true);assert.ok(await download(t,b));assert.equal((await save(t,b,t.owner,png(),empty,id)).ok,true);assert.equal(b.objects.size,1);
  const next=await save(t,b);assert.equal(next.ok,true);assert.notEqual(next.version,first.version);assert.equal((await save(t,b,t.owner,png(),first)).reason,'conflict');
  const remove=await changeProfilePhoto(t.db,{bucket:b,actor:t.owner,input:{requestId:crypto.randomUUID(),expectedVersion:next.version}});assert.equal(remove.ok,true);assert.equal(remove.hasPhoto,false);assert.equal(await download(t,b),null);assert.equal(b.objects.size,2);assert.equal((await save(t,b,t.owner,png(),empty,id)).reason,'conflict');
});
test('cross-account pointers, external URLs and preview self-writes never deliver',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket();await save(t,b);const key=one(t.raw,"SELECT image FROM user WHERE id='ellen'").image;
  assert.equal(ownedPhotoKey('james',key),null);run(t.raw,"UPDATE user SET image=? WHERE id='james'",key);assert.equal(await download(t,b,await t.actor('james')),null);
  run(t.raw,"UPDATE user SET image='https://example.com/track.svg' WHERE id='ellen'");assert.equal(await download(t,b),null);
  const {actor}=await createClientPreview(t.db,t.owner,'james','c-james');assert.equal(await getProfilePhoto(t.db,actor),null);assert.equal((await changeProfilePhoto(t.db,{bucket:b,actor,input:{}})).reason,'not_found');
});
test('two simultaneous saves cannot silently overwrite one another',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket(),before=await getProfilePhoto(t.db,t.owner);
  const results=await Promise.all([save(t,b,t.owner,png(),before),save(t,b,t.owner,png(),before)]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='conflict').length,1);assert.equal(b.objects.size,2);
});
test('uncertain R2 write is recoverable with the same request without duplicate bytes',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket(),put=b.put,before=await getProfilePhoto(t.db,t.owner),id=crypto.randomUUID();
  b.put=async(...args)=>{await put(...args);throw Error('lost storage response');};await assert.rejects(save(t,b,t.owner,png(),before,id));
  assert.equal(one(t.raw,"SELECT image FROM user WHERE id='ellen'").image,null);b.put=put;
  assert.equal((await save(t,b,t.owner,png(),before,id)).ok,true);assert.equal(b.objects.size,1);
});
for(const change of ["UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'","UPDATE workspaces SET status='archived' WHERE id='a'","UPDATE user SET image=NULL WHERE id='ellen'"])test('download rechecks after R2: '+change,async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket();await save(t,b);const get=b.get;b.get=async key=>{const value=await get(key);run(t.raw,change);return value;};assert.equal(await download(t,b),null);
});
test('upload rechecks live membership after storage, leaving unavailable bytes retained',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket(),put=b.put;b.put=async(...args)=>{const value=await put(...args);run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");return value;};assert.equal((await save(t,b)).reason,'not_found');assert.equal(one(t.raw,"SELECT image FROM user WHERE id='ellen'").image,null);assert.equal(b.objects.size,1);
});
test('Team delivery honors current capability and workspace; Client has no directory',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket();await save(t,b);const context={kind:'member',membershipId:'m-ellen'};
  assert.ok(await download(t,b,t.owner,context));for(const user of ['sam','james','foreign'])assert.equal(await download(t,b,await t.actor(user),context),null);
  run(t.raw,"INSERT INTO member_capabilities(id,workspace_id,membership_id,capability) VALUES('photo-cap','a','m-sam','members.manage')");const sam=await t.actor('sam');assert.ok(await download(t,b,sam,context));run(t.raw,"DELETE FROM member_capabilities WHERE id='photo-cap'");assert.equal(await download(t,b,sam,context),null);
});
test('Page-author photo requires the actual current readable comment, also in preview',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket();await save(t,b);
  const pageId=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()})).id,commentId=crypto.randomUUID();
  assert.equal((await postPageComment(t.db,t.owner,pageId,{workspaceId:'a',requestId:commentId,threadId:null,expectedRevision:null,body:'Shared discussion'})).ok,true);
  const context={kind:'comment',pageId,commentId},james=await t.actor('james');assert.ok(await download(t,b,t.owner,context));assert.equal(await download(t,b,james,context),null);
  const tree=await getWorkspacePageTree(t.db,t.owner);await updatePageSharing(t.db,t.owner,pageId,{workspaceId:'a',expectedTreeRevision:tree.revision,kind:'grant',membershipId:'m-james',permission:'view'});
  assert.ok(await download(t,b,james,context));const {actor}=await createClientPreview(t.db,t.owner,'james','c-james');assert.ok(await download(t,b,actor,context));assert.equal(await download(t,b,james,{...context,commentId:'missing'}),null);
  run(t.raw,"DELETE FROM bloomops_page_grants WHERE membership_id='m-james'");assert.equal(await download(t,b,james,context),null);assert.equal(await download(t,b,actor,context),null);
});
test('thumbnail reads stay two bounded domain queries with a large member directory',async ctx=>{
  const t=await setup();ctx.after(()=>t.raw.close());const b=bucket();await save(t,b);
  let count=0;const measured=bloomOpsDb({...t.d1,prepare:query=>{count++;return t.d1.prepare(query);}});
  const read=()=>downloadProfilePhoto(measured,{bucket:b,actor:t.owner,context:{kind:'member',membershipId:'m-ellen'}});
  assert.ok(await read());assert.equal(count,2);
  for(let i=0;i<250;i++){run(t.raw,"INSERT INTO user(id,name,email) VALUES(?,?,?)",'photo-extra-'+i,'Other member','photo-extra-'+i+'@example.invalid');run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'a',?,'team_member','active')",'photo-member-'+i,'photo-extra-'+i);}
  count=0;assert.ok(await read());assert.equal(count,2);
});
test('record discussion photos require the current parent, audience and nonremoved comment, including after storage',async ctx=>{
 const t=await setup();ctx.after(()=>t.raw.close());const b=bucket();await save(t,b);
 const {postRecordDiscussion,editRecordDiscussion}=await import('../lib/bloomops/record-discussions.mjs');const parent={type:'project',id:'website'},id=crypto.randomUUID();
 assert.equal((await postRecordDiscussion(t.db,t.owner,parent,{workspaceId:'a',requestId:id,threadId:null,audience:'client',body:'Shared record discussion',mentions:[]})).ok,true);
 const context={kind:'record-comment',parent,commentId:id},james=await t.actor('james');assert.ok(await download(t,b,james,context));
 assert.equal(await download(t,b,await t.actor('lawrence'),context),null);assert.equal(await download(t,b,james,{...context,parent:{type:'client',id:'james'}}),null);
 const {actor}=await createClientPreview(t.db,t.owner,'james','c-james');assert.ok(await download(t,b,actor,context));
 const get=b.get;b.get=async key=>{const result=await get(key);run(t.raw,"UPDATE projects SET visibility='internal' WHERE id='website'");return result;};assert.equal(await download(t,b,james,context),null);b.get=get;
 run(t.raw,"UPDATE projects SET visibility='client' WHERE id='website'");await editRecordDiscussion(t.db,t.owner,parent,{workspaceId:'a',requestId:crypto.randomUUID(),threadId:id,commentId:id,expectedRevision:1,remove:true});assert.equal(await download(t,b,t.owner,context),null);
});
