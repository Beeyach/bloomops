// Disposable native D1/R2 acceptance only; never included in the application.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { seedLegacyContent, seedAdsParents } from './content-context-fixture.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createAdsContent, getContent, updateContent } from '../lib/bloomops/content.mjs';
import { getAdsContent, listAdsCreative, adsCreativeOptions, adsCreativeFacets, adsCreativeHistory } from '../lib/bloomops/ads-creative.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { uploadContentFile, changeContentFile, downloadContentFile, retryContentFile } from '../lib/bloomops/content-files.mjs';
import { getPortalContent } from '../lib/bloomops/portal-content.mjs';
import { requestContentApproval } from '../lib/bloomops/content-approvals.mjs';
export default {async fetch(request,env){
 if(env.E2B_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
 const messages=[],check=(name,ok)=>{assert.ok(ok,name);messages.push(name);};let maxBindings=0,maxSqlBytes=0;
 try{
  const run=(q,...p)=>env.DB.prepare(q).bind(...p).run(),one=(q,...p)=>env.DB.prepare(q).bind(...p).first();
  for(const sql of E2B_MIGRATIONS)await run(sql);
  await seedLegacyContent(run);await seedAdsParents(run);
  const binding={prepare(q){maxSqlBytes=Math.max(maxSqlBytes,q.length);const stmt=env.DB.prepare(q);return new Proxy(stmt,{get(target,key){if(key==='bind')return(...p)=>{maxBindings=Math.max(maxBindings,p.length);assert.ok(p.length<=100,`D1 bindings ${p.length}`);return target.bind(...p);};const v=target[key];return typeof v==='function'?v.bind(target):v;}});},batch:env.DB.batch.bind(env.DB)};
  const db=drizzle(binding,{schema}),actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
  for(let i=0;i<240;i++){await run("INSERT INTO projects(id,workspace_id,client_id,service_engagement_id,name) VALUES(?,'a','james','ads-service',?)",`many-${i}`,`Project ${i}`);await run("INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);}
  await run("INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a','ads-project','m-sam')");
  const owner=await actor('ellen'),team=await actor('sam'),pm=await actor('pm'),client=await actor('james');
  const create=(input={},extra={})=>createAdsContent(db,{actor:team,projectId:'ads-project',requestId:crypto.randomUUID(),input:{title:'Native creative',platforms:['Instagram'],...input},...extra});
  const key=crypto.randomUUID(),made=await create({}, {requestId:key}),id=made.contentId;check('Project-only Team creates canonical Ads Content with 240 assignments',made.ok);
  check('current PM ordinary Project access remains broad',!!await getAdsContent(db,pm,id));check('Social and portal detail remain isolated',await getContent(db,owner,id)===null&&await getPortalContent(db,client,id)===null);
  check('creation retry is idempotent',(await create({}, {requestId:key})).unchanged);check('different Project receipt conflicts',(await create({}, {actor:owner,projectId:'ads-other-project',requestId:key})).reason==='conflict');
  for(const input of [{productionArea:'social'},{recordingRequired:false},{visibility:'client'}])check('server rejects caller-owned routing/workflow/client visibility',!(await create(input)).ok);
  check('scoped list and all facets run within native bindings',(await listAdsCreative(db,team)).items.length===1&&(await adsCreativeFacets(db,team)).projectId.items.length===1);
  const options=await adsCreativeOptions(db,team,{projectId:'many-99'});check('bounded picker resolves selected Project beyond 200',options.parentsOverflow&&options.parents.some(p=>p.projectId==='many-99'));
  check('editor changes canonical copy',(await updateContent(db,{actor:team,contentId:id,expectedRevision:1,input:{caption:'Native caption'}})).ok);
  check('platform replacement uses current revision',(await setContentPlatforms(db,{actor:team,contentId:id,input:{expectedRevision:2,platforms:['Instagram','YouTube']}})).ok);
  for(const stage of ['script','editing','internal_review','revision_requested','editing']){const item=await getAdsContent(db,team,id),input={targetStage:stage,expectedRevision:item.revision,...stage==='revision_requested'?{context:'Improve the first frame'}:{}};check(`internal edge ${stage}`,(await transitionContent(db,{actor:team,contentId:id,input})).ok);check(`current authorized retry ${stage}`,(await transitionContent(db,{actor:team,contentId:id,input})).unchanged);}
  check('approval API remains unavailable',(await requestContentApproval(db,{actor:owner,contentId:id,input:{}})).reason==='not_found');
  for(const stage of ['client_review','approved','scheduled','published'])check(`forbidden stage ${stage}`,!(await transitionContent(db,{actor:team,contentId:id,input:{targetStage:stage,expectedRevision:(await getAdsContent(db,team,id)).revision}})).ok);
  const bytes=new TextEncoder().encode('Native creative image bytes'),meta={requestId:crypto.randomUUID(),filename:'creative.png',mimeType:'image/png',byteSize:bytes.length,purpose:'asset',visibility:'internal'};
  const upload=(input=meta,extra={})=>uploadContentFile(db,{actor:team,bucket:env.FILES,contentId:id,input,bytes,...extra});
  const uploaded=await upload();check('Ads asset reaches Ready in actual R2',uploaded.ok);const fileId=uploaded.fileId;
  check('actual download bytes match',await new Response((await downloadContentFile(db,{actor:team,bucket:env.FILES,fileId})).body).text()==='Native creative image bytes');
  check('upload response-loss retry converges',(await upload()).unchanged);
  const file=await one('SELECT * FROM assets WHERE id=?',fileId),object=await env.FILES.head(file.object_key);
  check('actual R2 hash/etag/size match metadata',Buffer.from(object.checksums.sha256).toString('hex')===file.sha256&&object.etag===file.etag&&object.size===bytes.length);
  check('restricted File mutation uses native live Project grant',(await changeContentFile(db,{actor:team,contentId:id,fileId,operation:'visibility',visibility:'restricted',expectedRevision:file.revision})).ok);
  check('PM ordinary parent cannot read restricted asset',await downloadContentFile(db,{actor:pm,bucket:env.FILES,fileId})===null);
  check('client File visibility rejected',!(await changeContentFile(db,{actor:team,contentId:id,fileId,operation:'visibility',visibility:'client',expectedRevision:file.revision+1})).ok);
  check('Ads recording purpose rejected',!(await upload({...meta,requestId:crypto.randomUUID(),purpose:'recording'})).ok);
  check('history uses current Content and File scope',(await adsCreativeHistory(db,team,id)).items.length>5);
  const bucket=overrides=>({put:env.FILES.put.bind(env.FILES),head:env.FILES.head.bind(env.FILES),get:env.FILES.get.bind(env.FILES),delete:env.FILES.delete.bind(env.FILES),...overrides});
  const revoke=()=>run("DELETE FROM project_assignments WHERE membership_id='m-sam'");
  const revoked=await upload({...meta,requestId:crypto.randomUUID()},{bucket:bucket({put:async(...args)=>{const result=await env.FILES.put(...args);await revoke();return result;}})});
  check('revocation after R2 put cannot finalize Ready',!revoked.ok);
  check('stale actor loses detail, history and generic download',await getAdsContent(db,team,id)===null&&(await adsCreativeHistory(db,team,id)).items.length===0&&await downloadContentFile(db,{actor:team,bucket:env.FILES,fileId})===null);
  check('stale upload retry denied',!(await retryContentFile(db,{actor:team,bucket:env.FILES,contentId:id,fileId,input:{filename:meta.filename,mimeType:meta.mimeType,byteSize:meta.byteSize},bytes})).ok);
  await run("INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a','ads-project','m-sam')");
  const denied=await downloadContentFile(db,{actor:team,fileId,bucket:bucket({get:async(...args)=>{const result=await env.FILES.get(...args);await revoke();return result;}})});check('revocation after R2 get prevents response bytes',denied===null);
  await run("UPDATE service_types SET department_id='social' WHERE id='type-ads'");check('department reassignment denies Ads and never reclassifies to Social',await getAdsContent(db,owner,id)===null&&await getContent(db,owner,id)===null&&await getPortalContent(db,client,id)===null);
  check(`native query bounds: ${maxBindings} bindings, ${maxSqlBytes} SQL bytes`,maxBindings<=100&&maxSqlBytes<100000);
  return Response.json({checks:messages.length,messages,maxBindings,maxSqlBytes});
 }catch(error){return Response.json({error:error.stack,messages,maxBindings,maxSqlBytes},{status:500});}
}};
