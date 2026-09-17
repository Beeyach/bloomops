// Evidence-bound historical intervals. This never reads a provider, changes a hold, or starts monitoring.
import {and,desc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {actorStamp,liveActor} from './prospect-replies.mjs';
import {exact} from './prospect-outreach-values.mjs';

const z=schema.prospectHistoricalCoverages,q=schema.prospectDiscoveryRuns,k=schema.prospectMonitoringCheckpoints;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const valid=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const revision=value=>Number.isSafeInteger(value)&&value>=1;
const auth=actor=>administratorCondition(actor,{purpose:'prospecting'});
const conflict=()=>({conflict:true,error:'This historical evidence changed. Reload the mailbox review.'});

export async function historicalCoverageEligible(db,actor,email,sourceRunId,checkpointRunId,connectionRevision,senderRevision,discoveryRevision){
 const core=await db.get(sql`SELECT 1 AS ok
  FROM prospect_monitoring_checkpoints point
  JOIN prospect_discovery_runs checkpoint ON checkpoint.workspace_id=point.workspace_id AND checkpoint.id=point.run_id
  JOIN prospect_discovery_runs source ON source.workspace_id=point.workspace_id AND source.id=point.source_run_id
  JOIN prospect_recovery_collections collection ON collection.workspace_id=source.workspace_id AND collection.run_id=source.id
  JOIN prospect_recovery_scopes scope ON scope.workspace_id=collection.workspace_id AND scope.run_id=collection.run_id
  WHERE point.workspace_id=${actor.workspaceId} AND source.account_email=${email} AND point.source_run_id=${sourceRunId} AND point.run_id=${checkpointRunId}
  AND source.kind='recovery' AND source.status='unresolved' AND source.reason='recovery_collected'
  AND checkpoint.kind='checkpoint' AND checkpoint.status='checked' AND checkpoint.reason='checkpoint_saved' AND checkpoint.result_history_id=collection.catchup_history_id
  AND source.connection_revision=${connectionRevision} AND source.sender_revision=${senderRevision} AND checkpoint.connection_revision=${connectionRevision} AND checkpoint.sender_revision=${senderRevision}
  AND collection.catchup_status='complete' AND collection.catchup_history_id IS NOT NULL AND collection.unassigned_count=0
  AND scope.interval_from=collection.from_at AND scope.enumeration_complete=1 AND scope.include_spam_trash=1 AND scope.max_messages=40 AND scope.max_pages=3
  AND scope.listing_pages BETWEEN 1 AND 3 AND scope.listed_count BETWEEN 0 AND 40 AND scope.metadata_processed_count=scope.listed_count`);
 if(!core)return false;
 const [account,counts,invalid,fresh]=await Promise.all([
  db.get(sql`SELECT 1 AS ok FROM prospect_discovery_states state
   JOIN prospect_google_connections connection ON connection.workspace_id=state.workspace_id AND connection.account_email=state.account_email
   JOIN prospect_senders sender ON sender.workspace_id=connection.workspace_id AND sender.email=connection.sender_email
   JOIN workspace_memberships grantor ON grantor.workspace_id=connection.workspace_id AND grantor.id=connection.authorized_by_membership_id
   WHERE state.workspace_id=${actor.workspaceId} AND state.account_email=${email} AND state.revision=${discoveryRevision}
   AND state.check_status='checked' AND state.check_id IS NULL
   AND state.history_id=(SELECT catchup_history_id FROM prospect_recovery_collections WHERE workspace_id=${actor.workspaceId} AND run_id=${sourceRunId})
   AND connection.revision=${connectionRevision} AND connection.active=1 AND connection.check_status='healthy' AND connection.check_id IS NULL
   AND sender.revision=${senderRevision} AND grantor.status='active' AND grantor.role IN ('owner','admin') AND grantor.updated_at=connection.authorizer_updated_at`),
  db.get(sql`SELECT
   (SELECT count(*) FROM prospect_discovery_targets WHERE workspace_id=${actor.workspaceId} AND run_id=${sourceRunId}) AS source_count,
   (SELECT count(*) FROM prospect_discovery_targets WHERE workspace_id=${actor.workspaceId} AND run_id=${checkpointRunId}) AS checkpoint_count,
   (SELECT count(*) FROM prospect_deliveries WHERE workspace_id=${actor.workspaceId} AND account_email=${email} AND state='accepted') AS accepted_count`),
  db.get(sql`SELECT 1 AS bad FROM prospect_discovery_targets target
   LEFT JOIN prospect_deliveries delivery ON delivery.workspace_id=target.workspace_id AND delivery.id=target.delivery_id AND delivery.prospect_id=target.prospect_id AND delivery.account_email=${email} AND delivery.state='accepted'
   LEFT JOIN prospect_delivery_identities identity ON identity.workspace_id=delivery.workspace_id AND identity.delivery_id=delivery.id
   WHERE target.workspace_id=${actor.workspaceId} AND target.run_id=${checkpointRunId}
   AND (delivery.id IS NULL OR target.identity_id IS NULL OR identity.id IS NOT target.identity_id OR delivery.attempted_at<(SELECT interval_from FROM prospect_recovery_scopes WHERE workspace_id=${actor.workspaceId} AND run_id=${sourceRunId})) LIMIT 1`),
  db.get(sql`SELECT 1 AS ok WHERE
   NOT EXISTS(SELECT 1 FROM prospect_discovery_runs checkpoint JOIN prospect_discovery_runs newer ON newer.workspace_id=checkpoint.workspace_id AND newer.account_email=checkpoint.account_email AND (newer.created_at>checkpoint.created_at OR newer.created_at=checkpoint.created_at AND newer.id>checkpoint.id) WHERE checkpoint.workspace_id=${actor.workspaceId} AND checkpoint.id=${checkpointRunId})
   AND NOT EXISTS(SELECT 1 FROM prospect_historical_coverages WHERE workspace_id=${actor.workspaceId} AND checkpoint_run_id=${checkpointRunId})`)
 ]);
 const sourceCount=Number(counts?.source_count),checkpointCount=Number(counts?.checkpoint_count),acceptedCount=Number(counts?.accepted_count);
 return Boolean(account&&fresh&&!invalid&&sourceCount>=1&&sourceCount<=100&&sourceCount===checkpointCount&&checkpointCount===acceptedCount);
}

export async function latestHistoricalCoverage(db,actor,email){
 if(!allowed(actor)||!valid(email))return null;
 const [row]=await db.select({from:z.intervalFrom,through:z.intervalThrough,verifiedAt:z.createdAt}).from(z).where(and(eq(z.workspaceId,actor.workspaceId),eq(z.accountEmail,email),auth(actor))).orderBy(desc(z.createdAt),desc(z.id)).limit(1);
 return row||null;
}

export async function verifyProspectHistoricalCoverage(db,actor,sessionId,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','requestId','accountEmail','sourceRunId','checkpointRunId','expectedRevision','connectionRevision','senderRevision','reviewed'])||input.workspaceId!==actor.workspaceId||!REQUEST_ID.test(input.requestId||'')||!valid(input.accountEmail)||!valid(input.sourceRunId)||!valid(input.checkpointRunId)||!revision(input.expectedRevision)||!revision(input.connectionRevision)||!revision(input.senderRevision)||input.reviewed!==true)return conflict();
 input={...input};actor={...actor};const stamp=await actorStamp(db,actor,sessionId);if(!stamp)return conflict();
 const prior=await db.select({source:z.sourceRunId,checkpoint:z.checkpointRunId,account:z.accountEmail}).from(z).where(and(eq(z.id,input.requestId),eq(z.workspaceId,actor.workspaceId),auth(actor))).limit(1);
 if(prior[0])return prior[0].source===input.sourceRunId&&prior[0].checkpoint===input.checkpointRunId&&prior[0].account===input.accountEmail?{ok:true,unchanged:true}:conflict();
 // The immutable database trigger performs the exact evidence check in the
 // same statement. The SELECT side is limited to live actor authority and the
 // requested checkpoint so D1 stays below SQLite's expression-depth limit.
 const iso=now.toISOString(),guard=and(eq(k.workspaceId,actor.workspaceId),eq(k.runId,input.checkpointRunId),eq(k.sourceRunId,input.sourceRunId),liveActor(actor,sessionId,stamp));
 const intervalFrom=sql`(SELECT interval_from FROM prospect_recovery_scopes WHERE workspace_id=${actor.workspaceId} AND run_id=${input.sourceRunId})`,intervalThrough=sql`(SELECT created_at FROM prospect_discovery_runs WHERE workspace_id=${actor.workspaceId} AND id=${input.sourceRunId})`;
 const inserted=insertSelected(db,z,{id:input.requestId,workspaceId:actor.workspaceId,accountEmail:input.accountEmail,sourceRunId:input.sourceRunId,checkpointRunId:input.checkpointRunId,intervalFrom,intervalThrough,actorMembershipId:actor.membershipId,actorStamp:stamp,connectionRevision:input.connectionRevision,senderRevision:input.senderRevision,discoveryRevision:input.expectedRevision,createdAt:iso},k,guard);
 const event=activityForMutation(db,z,and(eq(z.id,input.requestId),eq(z.workspaceId,actor.workspaceId)),{workspaceId:actor.workspaceId,eventType:'PROSPECT_HISTORICAL_COVERAGE_VERIFIED',subjectType:'workspace',subjectId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sourceRunId:input.sourceRunId,checkpointRunId:input.checkpointRunId},occurredAt:iso});
 try{await db.batch([inserted,event]);}catch{return conflict();}const [saved]=await db.select({id:z.id}).from(z).where(and(eq(z.id,input.requestId),eq(z.workspaceId,actor.workspaceId),auth(actor))).limit(1);return saved?{ok:true}:conflict();
}
