import {and,eq,desc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition} from './workspaces.mjs';
import {getProspectGoogle} from './prospect-google.mjs';
import {replyAccountAccess} from './prospect-replies.mjs';
import {discoveryEnabled,getProspectDiscoveryState,getProspectRecovery,checkpointSourceGuard,checkpointProspectMailbox} from './prospect-mailbox.mjs';
import {historicalCoverageEligible,latestHistoricalCoverage,verifyProspectHistoricalCoverage} from './prospect-historical-coverage.mjs';
import {exact} from './prospect-outreach-values.mjs';
async function checkpointSelection(actor,email,id){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actor.workspaceId,email,id])));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function historicalSelection(actor,email,source,checkpoint){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['historical',actor.workspaceId,email,source,checkpoint])));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function checkpointCandidate(db,actor,email){
 const q=schema.prospectDiscoveryRuns,c=schema.prospectRecoveryCollections;
 const [source]=await db.select({id:q.id,finishedAt:q.finishedAt,catchupStatus:c.catchupStatus,unassigned:c.unassignedCount}).from(q).leftJoin(c,and(eq(c.workspaceId,q.workspaceId),eq(c.runId,q.id))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,email),eq(q.kind,'recovery'),administratorCondition(actor,{purpose:'prospecting'}))).orderBy(desc(q.createdAt),desc(q.id)).limit(1);return source||null;
}
async function checkpointView(db,actor,env,connection,access){
 const email=connection.accountEmail;if(!email)return {selection:null,sourceAt:null,savedAt:null,canSave:false,reason:'collection'};
 const source=await checkpointCandidate(db,actor,email),q=schema.prospectDiscoveryRuns,k=schema.prospectMonitoringCheckpoints,auth=administratorCondition(actor,{purpose:'prospecting'});
 const [saved]=await db.select({at:q.finishedAt,source:k.sourceRunId,status:q.status}).from(k).innerJoin(q,and(eq(q.workspaceId,k.workspaceId),eq(q.id,k.runId))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,email),auth)).orderBy(desc(q.createdAt),desc(q.id)).limit(1);
 const [completed]=await db.select({at:q.finishedAt}).from(k).innerJoin(q,and(eq(q.workspaceId,k.workspaceId),eq(q.id,k.runId))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,email),eq(q.status,'checked'),auth)).orderBy(desc(q.createdAt),desc(q.id)).limit(1);
 const [eligible]=source?await db.select({id:q.id}).from(q).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.id,source.id),auth,checkpointSourceGuard(actor,email,source.id,connection.revision,connection.senderRevision,new Date().toISOString()))).limit(1):[];
 const reason=!source?.finishedAt||!source.catchupStatus?'collection':saved?.source===source.id?'used':source.catchupStatus!=='complete'?'incomplete':source.unassigned>0?'unassigned':!access?'connection':Date.parse(source.finishedAt)<Date.now()-300000?'expired':!eligible?'changed':!discoveryEnabled(env,actor,email)||env.BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED!=='true'?'disabled':null;
 return {selection:source?await checkpointSelection(actor,email,source.id):null,sourceAt:source?.finishedAt||null,savedAt:completed?.at||null,incomplete:Boolean(saved&&saved.status!=='checked'&&saved.source===source?.id),canSave:reason===null,reason};
}
async function historicalView(db,actor,env,connection,state,access){
 const email=connection.accountEmail;if(!email)return {status:'unknown',selection:null,from:null,through:null,canVerify:false,reason:'checkpoint'};
 const verified=await latestHistoricalCoverage(db,actor,email);if(verified)return {status:'verified',selection:null,...verified,canVerify:false,reason:'verified'};
 const q=schema.prospectDiscoveryRuns,k=schema.prospectMonitoringCheckpoints,c=schema.prospectRecoveryCollections,x=schema.prospectRecoveryScopes,auth=administratorCondition(actor,{purpose:'prospecting'});
 const [candidate]=await db.select({checkpoint:q.id,source:k.sourceRunId,through:sql`(SELECT created_at FROM prospect_discovery_runs source WHERE source.workspace_id=${k.workspaceId} AND source.id=${k.sourceRunId})`,from:c.from,catchupStatus:c.catchupStatus,unassigned:c.unassignedCount,scopeRun:x.runId}).from(k).innerJoin(q,and(eq(q.workspaceId,k.workspaceId),eq(q.id,k.runId))).innerJoin(c,and(eq(c.workspaceId,k.workspaceId),eq(c.runId,k.sourceRunId))).leftJoin(x,and(eq(x.workspaceId,c.workspaceId),eq(x.runId,c.runId))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,email),eq(q.status,'checked'),auth)).orderBy(desc(q.createdAt),desc(q.id)).limit(1);
 // The candidate read above is authority-scoped. Keep the bounded evidence
 // queries separate so D1 stays below SQLite's expression-depth limit.
 const eligible=Boolean(candidate&&state&&await historicalCoverageEligible(db,actor,email,candidate.source,candidate.checkpoint,connection.revision,connection.senderRevision,state.revision));
 const enabled=discoveryEnabled(env,actor,email)&&env.BLOOMOPS_HISTORICAL_COVERAGE_ENABLED==='true';
 const reason=!candidate?'checkpoint':!candidate.scopeRun?'evidence':candidate.catchupStatus!=='complete'?'incomplete':candidate.unassigned>0?'unassigned':!access?'connection':!eligible?'changed':!enabled?'disabled':null;
 return {status:'unverified',selection:candidate?await historicalSelection(actor,email,candidate.source,candidate.checkpoint):null,from:candidate?.from||null,through:candidate?.through||null,canVerify:reason===null,reason};
}
export async function getProspectMailboxReview(db,actor,env){
 const connection=await getProspectGoogle(db,actor,env);if(!connection)return null;
 const accountEmail=connection.accountEmail;
 let state=null,latest=null,history=[],total=0,registered=0,access=false;
 if(accountEmail){
  const d=schema.prospectDeliveries,h=schema.prospectDeliveryIdentities,c=schema.prospectRecoveryCollections,q=schema.prospectDiscoveryRuns;
  const auth=()=>administratorCondition(actor,{purpose:'prospecting'});
  const [counts]=await db.select({total:sql`count(*)`,registered:sql`count(${h.id})`}).from(d).leftJoin(h,and(eq(h.workspaceId,d.workspaceId),eq(h.deliveryId,d.id))).where(and(eq(d.workspaceId,actor.workspaceId),eq(d.accountEmail,accountEmail),eq(d.state,'accepted'),auth()));
  total=Number(counts.total);registered=Number(counts.registered);
  state=await getProspectDiscoveryState(db,actor,accountEmail);latest=await getProspectRecovery(db,actor,accountEmail);
  history=await db.select({checkedAt:q.finishedAt,from:c.from,catchupStatus:c.catchupStatus,matchedCount:c.matchedCount,unassignedCount:c.unassignedCount}).from(c).innerJoin(q,and(eq(q.workspaceId,c.workspaceId),eq(q.id,c.runId))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,accountEmail),auth())).orderBy(desc(q.createdAt),desc(q.id)).limit(5);
  access=connection.connected&&Boolean(await replyAccountAccess(db,actor,env,accountEmail));
 }
 const checkpoint=await checkpointView(db,actor,env,connection,access),historical=await historicalView(db,actor,env,connection,state,access);
 // Revalidate authority and the exact connection after all asynchronous reads
 // and token decryption. A changed account must not receive the old summary.
 const w=schema.workspaces,g=schema.prospectGoogleConnections,s=schema.prospectSenders;
 const [current]=await db.select({id:w.id}).from(w).leftJoin(g,eq(g.workspaceId,w.id)).leftJoin(s,eq(s.workspaceId,w.id)).where(and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}),sql`coalesce(${g.revision},0)=${connection.revision}`,sql`coalesce(${s.revision},0)=${connection.senderRevision}`,accountEmail?and(eq(g.active,1),eq(g.accountEmail,accountEmail),eq(g.senderEmail,s.email),sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${g.authorizedByMembershipId} AND workspace_id=${g.workspaceId} AND updated_at=${g.authorizerUpdatedAt} AND status='active' AND role IN ('owner','admin'))`):undefined)).limit(1);
 if(!current)return null;
 const enabled=accountEmail&&discoveryEnabled(env,actor,accountEmail)&&env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED==='true';
 const cooldown=Boolean(state?.checkedAt&&Date.parse(state.checkedAt)>Date.now()-30000);
 const reason=!accountEmail?'connect':!access?'connection':!total?'no_deliveries':total>100?'limit':registered!==total?'thread_checks':!enabled?'disabled':state?.busy?'busy':cooldown?'cooldown':null;
 return {workspaceId:actor.workspaceId,accountEmail,connectionRevision:connection.revision,senderRevision:connection.senderRevision,expectedRevision:state?.revision||0,total,registered,canRecover:reason===null,reason,latest,history,checkpoint,historical,coverage:historical.status==='verified'?'verified':state?.coverageStatus||'unverified'};
}

export async function saveProspectHistoricalCoverage(db,actor,env,sessionId,input){
 if(!actor)return null;
 if(!exact(input,['workspaceId','selection','requestId','expectedRevision','connectionRevision','senderRevision','reviewed'])||input.reviewed!==true||typeof input.selection!=='string'||! /^[a-f0-9]{64}$/.test(input.selection)||typeof input.requestId!=='string')return {conflict:true,error:'Reload the mailbox review before verifying coverage.'};
 const z=schema.prospectHistoricalCoverages,auth=administratorCondition(actor,{purpose:'prospecting'}),[prior]=await db.select({account:z.accountEmail,source:z.sourceRunId,checkpoint:z.checkpointRunId,discoveryRevision:z.discoveryRevision,connectionRevision:z.connectionRevision,senderRevision:z.senderRevision}).from(z).where(and(eq(z.workspaceId,actor.workspaceId),eq(z.id,input.requestId),auth)).limit(1);
 if(prior){if(input.selection!==await historicalSelection(actor,prior.account,prior.source,prior.checkpoint)||input.expectedRevision!==prior.discoveryRevision||input.connectionRevision!==prior.connectionRevision||input.senderRevision!==prior.senderRevision||input.workspaceId!==actor.workspaceId)return {conflict:true,error:'This request already verified different evidence.'};return verifyProspectHistoricalCoverage(db,actor,sessionId,{workspaceId:input.workspaceId,requestId:input.requestId,accountEmail:prior.account,sourceRunId:prior.source,checkpointRunId:prior.checkpoint,expectedRevision:input.expectedRevision,connectionRevision:input.connectionRevision,senderRevision:input.senderRevision,reviewed:true});}
 input={...input};const data=await getProspectMailboxReview(db,actor,env);if(!data)return null;
 if(!data.historical.canVerify||data.historical.selection!==input.selection||['workspaceId','expectedRevision','connectionRevision','senderRevision'].some(k=>input[k]!==data[k]))return {conflict:true,error:'This historical evidence changed. Reload the mailbox review.'};
 const q=schema.prospectDiscoveryRuns,k=schema.prospectMonitoringCheckpoints;const [candidate]=await db.select({checkpoint:q.id,source:k.sourceRunId}).from(k).innerJoin(q,and(eq(q.workspaceId,k.workspaceId),eq(q.id,k.runId))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,data.accountEmail),eq(q.status,'checked'),auth)).orderBy(desc(q.createdAt),desc(q.id)).limit(1);
 if(!candidate||await historicalSelection(actor,data.accountEmail,candidate.source,candidate.checkpoint)!==input.selection)return {conflict:true,error:'Reload the mailbox review before continuing.'};
 return verifyProspectHistoricalCoverage(db,actor,sessionId,{workspaceId:data.workspaceId,requestId:input.requestId,accountEmail:data.accountEmail,sourceRunId:candidate.source,checkpointRunId:candidate.checkpoint,expectedRevision:input.expectedRevision,connectionRevision:input.connectionRevision,senderRevision:input.senderRevision,reviewed:true});
}

export async function saveProspectMonitoringCheckpoint(db,actor,env,sessionId,input){
 if(!exact(input,['workspaceId','selection','expectedRevision','connectionRevision','senderRevision','reviewed'])||input.reviewed!==true||typeof input.selection!=='string'||! /^[a-f0-9]{64}$/.test(input.selection))return {conflict:true,error:'Reload the mailbox review before saving a starting point.'};
 input={...input};const data=await getProspectMailboxReview(db,actor,env);if(!data)return null;
 if(!data.checkpoint.canSave||data.checkpoint.selection!==input.selection||['workspaceId','expectedRevision','connectionRevision','senderRevision'].some(k=>input[k]!==data[k]))return {conflict:true,error:'This collection changed or expired. Reload the mailbox review.'};
 const source=await checkpointCandidate(db,actor,data.accountEmail);if(!source||await checkpointSelection(actor,data.accountEmail,source.id)!==input.selection)return {conflict:true,error:'Reload the mailbox review before continuing.'};
 return checkpointProspectMailbox(db,actor,env,sessionId,{workspaceId:data.workspaceId,accountEmail:data.accountEmail,sourceRunId:source.id,expectedRevision:input.expectedRevision,connectionRevision:input.connectionRevision,senderRevision:input.senderRevision,reviewed:true});
}
