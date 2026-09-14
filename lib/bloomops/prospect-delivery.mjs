import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {getProspectOutreach} from './prospect-outreach.mjs';
import {exact} from './prospect-outreach-values.mjs';
import {getProspectGoogle} from './prospect-google.mjs';
import {googleConfiguration,openGoogle,storedGoogleTokens,GOOGLE_SCOPES} from './prospect-google-provider.mjs';
import {deliveryMime,submitGoogleIntroduction,findGoogleIntroduction} from './prospect-delivery-provider.mjs';
import {getRecipientProtection,recipientUnrestricted} from './prospect-recipient-protection.mjs';
const d=schema.prospectDeliveries,a=schema.prospectOutreachApprovals,p=schema.prospects,c=schema.prospectGoogleConnections,m=schema.workspaceMemberships;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const auth=actor=>administratorCondition(actor,{purpose:'prospecting'});
const conflict=()=>({conflict:true,error:'This delivery or its approval changed. Reload before continuing.'});
const protectedRecipient=()=>({conflict:true,error:'A conversation using this email needs review. Reload the delivery to see its protection.'});
const scope=(actor,id)=>and(eq(d.workspaceId,actor.workspaceId),eq(d.prospectId,id),auth(actor));
const liveSession=(actor,id)=>sql`EXISTS(SELECT 1 FROM session WHERE id=${id} AND user_id=${actor.userId} AND expires_at>${Date.now()})`;
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200;
// This is also checked inside each claim transaction, including source status.
const currentApproval=(actor,id)=>sql`EXISTS(SELECT 1 FROM prospect_outreach_approvals da
 JOIN prospect_outreach_drafts dq ON dq.workspace_id=da.workspace_id AND dq.id=da.draft_id
 JOIN bloomops_prospects dp ON dp.workspace_id=dq.workspace_id AND dp.id=dq.prospect_id
 JOIN prospect_senders ds ON ds.workspace_id=dq.workspace_id
 JOIN workspace_memberships dm ON dm.workspace_id=da.workspace_id AND dm.id=da.approved_by_membership_id
 WHERE da.workspace_id=${actor.workspaceId} AND da.id=${id}
 AND da.draft_revision=dq.revision AND da.profile_revision=dp.revision AND dq.profile_revision=dp.revision AND da.sender_revision=ds.revision
 AND dm.status='active' AND dm.role IN ('owner','admin') AND dm.updated_at=da.approver_updated_at
 AND dp.fit='strong' AND dp.public_email=dq.recipient AND dp.observed_facts IS NOT NULL AND dp.evidence_date IS NOT NULL AND dp.evidence_target IS NOT NULL AND dp.proposed_work IS NOT NULL
 AND EXISTS(SELECT 1 FROM prospect_field_sources df WHERE df.workspace_id=dp.workspace_id AND df.prospect_id=dp.id AND df.field_key='publicEmail' AND df.verification='checked'))`;
export function controlledDeliveryEnabled(env,receipt,snapshot){
 if(!receipt||!snapshot||!googleConfiguration(env)||env.BLOOMOPS_ENV!=='development'||env.BLOOMOPS_MAIL_TRANSPORT!=='r2-dev'||env.BLOOMOPS_GOOGLE_TEST_SEND_ENABLED!=='true'||env.BLOOMOPS_GOOGLE_TEST_DELIVERY_ID!==receipt.id||env.BLOOMOPS_GOOGLE_TEST_RECIPIENT!==snapshot.draft.recipient)return false;
 try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(env.BLOOMOPS_APP_URL).hostname);}catch{return false;}
}
async function readReceipt(db,actor,id){
 const [row]=await db.select({receipt:d,snapshotJson:a.snapshotJson,approvalCurrent:currentApproval(actor,d.approvalId)}).from(d).innerJoin(a,and(eq(a.id,d.approvalId),eq(a.workspaceId,d.workspaceId))).where(scope(actor,id)).limit(1);
 return row?{receipt:row.receipt,snapshot:JSON.parse(row.snapshotJson),approvalCurrent:Boolean(row.approvalCurrent)}:null;
}
export async function getProspectDelivery(db,actor,env,id){
 if(!allowed(actor)||!validId(id))return null;
 const outreach=await getProspectOutreach(db,actor,id);if(!outreach||outreach.conflict)return outreach;
 const row=await readReceipt(db,actor,id);
 const [approval]=outreach.approved?await db.select({id:a.id}).from(a).where(and(eq(a.workspaceId,actor.workspaceId),eq(a.draftId,outreach.draft.id),currentApproval(actor,a.id),auth(actor))).limit(1):[];
 const google=await getProspectGoogle(db,actor,env);if(!google)return null;
 const enabled=Boolean(row&&controlledDeliveryEnabled(env,row.receipt,row.snapshot));
 const recipientProtection=await getRecipientProtection(db,actor,row?.snapshot.draft.recipient||outreach.draft?.recipient,id);
 const [currentActor]=await db.select({id:p.id}).from(p).where(and(eq(p.id,id),eq(p.workspaceId,actor.workspaceId),auth(actor))).limit(1);if(!currentActor)return null;
 return {workspaceId:actor.workspaceId,prospectId:id,businessName:outreach.profile.businessName,website:outreach.profile.website,approvalId:approval?.id||null,receipt:row?.receipt||null,message:row?{sender:row.snapshot.sender.email,displayName:row.snapshot.sender.displayName,recipient:row.snapshot.draft.recipient,subject:row.snapshot.draft.subject,body:row.snapshot.draft.intro}:outreach.draft?{sender:outreach.sender?.email,displayName:outreach.sender?.displayName,recipient:outreach.draft.recipient,subject:outreach.draft.subject,body:outreach.draft.intro}:null,approvalCurrent:row?.approvalCurrent||false,enabled,recipientProtection,googleConnected:google.connected,canSend:enabled&&!recipientProtection&&row.receipt.state==='prepared'&&row.approvalCurrent&&google.connected};
}
export async function prepareProspectDelivery(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','prospectId','approvalId'])||input.workspaceId!==actor.workspaceId||!validId(input.prospectId)||!validId(input.approvalId))return conflict();
 const outreach=await getProspectOutreach(db,actor,input.prospectId);if(!outreach||outreach.conflict)return outreach;if(!outreach.approved)return conflict();
 if(await getRecipientProtection(db,actor,outreach.draft.recipient,input.prospectId))return protectedRecipient();
 const id=crypto.randomUUID(),iso=now.toISOString();
 const condition=and(eq(p.id,input.prospectId),eq(p.workspaceId,actor.workspaceId),auth(actor),currentApproval(actor,input.approvalId),recipientUnrestricted(actor.workspaceId,outreach.draft.recipient,input.prospectId),sql`EXISTS(SELECT 1 FROM prospect_outreach_approvals da JOIN prospect_outreach_drafts dq ON dq.workspace_id=da.workspace_id AND dq.id=da.draft_id WHERE da.id=${input.approvalId} AND dq.prospect_id=${input.prospectId} AND dq.workspace_id=${actor.workspaceId})`);
 const saved=and(eq(d.id,id),eq(d.workspaceId,actor.workspaceId));
 await db.batch([insertSelected(db,d,{id,workspaceId:actor.workspaceId,prospectId:input.prospectId,approvalId:input.approvalId,messageId:'<bloomsi-'+id+'@bloomsi.invalid>',state:'prepared',createdByMembershipId:actor.membershipId,createdAt:iso,updatedAt:iso},p,condition).onConflictDoNothing(),activityForMutation(db,d,saved,{workspaceId:actor.workspaceId,eventType:'PROSPECT_DELIVERY_PREPARED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{deliveryId:id},occurredAt:iso})]);
 const row=await readReceipt(db,actor,input.prospectId);if(await getRecipientProtection(db,actor,outreach.draft.recipient,input.prospectId))return protectedRecipient();return row&&row.receipt.approvalId===input.approvalId?{prepared:true,deliveryId:row.receipt.id}:conflict();
}
function validInput(actor,input,send=false){return exact(input,['workspaceId','prospectId','deliveryId',...(send?['reviewed']:[])])&&input.workspaceId===actor.workspaceId&&validId(input.prospectId)&&validId(input.deliveryId)&&(!send||input.reviewed===true);}
async function transition(db,actor,receipt,condition,values,eventType,now){
 const iso=now.toISOString();
 const result=await db.batch([activityForMutation(db,d,condition,{workspaceId:actor.workspaceId,eventType,subjectType:'prospect',subjectId:receipt.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{deliveryId:receipt.id},occurredAt:iso}),db.update(d).set({...values,updatedAt:iso}).where(condition).returning({id:d.id})]);
 return Boolean(result.at(-1).length);
}
export async function cancelProspectDelivery(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;if(!validInput(actor,input))return conflict();
 const condition=and(scope(actor,input.prospectId),eq(d.id,input.deliveryId),eq(d.state,'prepared'));
 const changed=await transition(db,actor,{id:input.deliveryId,prospectId:input.prospectId},condition,{state:'cancelled'},'PROSPECT_DELIVERY_CANCELLED',now);
 const row=await readReceipt(db,actor,input.prospectId);
 return changed||row?.receipt.id===input.deliveryId&&row.receipt.state==='cancelled'?{cancelled:true}:conflict();
}
async function accessForSend(db,actor,env,sessionId,row){
 const config=googleConfiguration(env);if(!config||!controlledDeliveryEnabled(env,row.receipt,row.snapshot)||!validId(sessionId))return null;
 const [member]=await db.select({updatedAt:m.updatedAt}).from(m).where(and(eq(m.id,actor.membershipId),eq(m.workspaceId,actor.workspaceId),auth(actor),liveSession(actor,sessionId))).limit(1);if(!member)return null;
 const [grant]=await db.select().from(c).where(and(eq(c.workspaceId,actor.workspaceId),eq(c.active,1),eq(c.senderEmail,row.snapshot.sender.email),eq(c.checkStatus,'healthy'),sql`${c.checkId} IS NULL`,sql`EXISTS(SELECT 1 FROM workspace_memberships cm WHERE cm.id=${c.authorizedByMembershipId} AND cm.workspace_id=${c.workspaceId} AND cm.updated_at=${c.authorizerUpdatedAt} AND cm.status='active' AND cm.role IN ('owner','admin'))`)).limit(1);
 if(!grant||!GOOGLE_SCOPES.every(scope=>grant.grantedScope?.split(/\s+/).includes(scope)))return null;
 const tokens=storedGoogleTokens(await openGoogle(config,actor.workspaceId+':tokens',grant.tokenBox));if(!tokens||Date.parse(tokens.expiresAt)<=Date.now()+60000)return null;
 return {grant,tokens,member};
}
const liveAccess=(actor,sessionId,access)=>and(auth(actor),liveSession(actor,sessionId),sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND workspace_id=${actor.workspaceId} AND updated_at=${access.member.updatedAt})`,sql`EXISTS(SELECT 1 FROM prospect_google_connections gc JOIN workspace_memberships gm ON gm.workspace_id=gc.workspace_id AND gm.id=gc.authorized_by_membership_id WHERE gc.workspace_id=${actor.workspaceId} AND gc.revision=${access.grant.revision} AND gc.active=1 AND gc.check_status='healthy' AND gc.check_id IS NULL AND gm.updated_at=gc.authorizer_updated_at AND gm.status='active' AND gm.role IN ('owner','admin'))`);
export async function sendProspectIntroduction(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!allowed(actor))return null;if(!validInput(actor,input,true))return conflict();
 const row=await readReceipt(db,actor,input.prospectId);if(!row)return null;
 if(row.receipt.id!==input.deliveryId||row.receipt.state!=='prepared'||!row.approvalCurrent)return conflict();
 if(await getRecipientProtection(db,actor,row.snapshot.draft.recipient,input.prospectId))return protectedRecipient();
 const access=await accessForSend(db,actor,env,sessionId,row);if(!access)return {unavailable:true,error:'Test delivery is disabled or Google needs a connection check.'};
 let mime;try{mime=deliveryMime(row.receipt,row.snapshot);}catch{return conflict();}
 const current=()=>and(scope(actor,input.prospectId),eq(d.id,input.deliveryId),currentApproval(actor,d.approvalId),liveAccess(actor,sessionId,access),recipientUnrestricted(actor.workspaceId,row.snapshot.draft.recipient,input.prospectId));
 const claimed=await transition(db,actor,row.receipt,and(current(),eq(d.state,'prepared')),{state:'submitting',attemptedAt:clock().toISOString(),accountEmail:access.grant.accountEmail},'PROSPECT_DELIVERY_ATTEMPTED',clock());if(!claimed)return conflict();
 const [final]=await db.select({id:d.id}).from(d).where(and(current(),eq(d.state,'submitting'))).limit(1);
 const outcomeCondition=and(eq(d.workspaceId,actor.workspaceId),eq(d.id,input.deliveryId),eq(d.state,'submitting'));
 if(!final||Date.parse(access.tokens.expiresAt)<=Date.now()+30000){await transition(db,actor,row.receipt,outcomeCondition,{state:'cancelled'},'PROSPECT_DELIVERY_CANCELLED',clock());return conflict();}
 const outcome=await submitGoogleIntroduction(access.tokens.accessToken,mime,{fetcher});
 // Persist the truth after an external effect even if the initiating authority
 // changed in flight. Only this claimed ID can complete; no user data is read.
 await transition(db,actor,row.receipt,outcomeCondition,outcome.accepted?{state:'accepted',providerMessageId:outcome.messageId,providerThreadId:outcome.threadId,acceptedAt:clock().toISOString()}:{state:'uncertain'},outcome.accepted?'PROSPECT_DELIVERY_ACCEPTED':'PROSPECT_DELIVERY_UNCERTAIN',clock());
 return await readReceipt(db,actor,input.prospectId)?{processed:true}:null;
}
export async function reconcileProspectDelivery(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!allowed(actor))return null;if(!validInput(actor,input))return conflict();
 const row=await readReceipt(db,actor,input.prospectId);if(!row)return null;
 if(row.receipt.id!==input.deliveryId||!['submitting','uncertain'].includes(row.receipt.state)||row.receipt.state==='submitting'&&clock().getTime()-Date.parse(row.receipt.attemptedAt)<90000)return conflict();
 const access=await accessForSend(db,actor,env,sessionId,row);if(!access||access.grant.accountEmail!==row.receipt.accountEmail)return {unavailable:true,error:'Use the original Google account and check its connection before checking this receipt.'};
 const [current]=await db.select({id:d.id}).from(d).where(and(scope(actor,input.prospectId),eq(d.id,input.deliveryId),liveAccess(actor,sessionId,access))).limit(1);if(!current)return conflict();
 const outcome=await findGoogleIntroduction(access.tokens.accessToken,row.receipt,row.snapshot,{fetcher});
 if(outcome.accepted)await transition(db,actor,row.receipt,and(eq(d.id,input.deliveryId),eq(d.workspaceId,actor.workspaceId),sql`${d.state} IN ('submitting','uncertain')`),{state:'accepted',providerMessageId:outcome.messageId,providerThreadId:outcome.threadId,acceptedAt:clock().toISOString()},'PROSPECT_DELIVERY_ACCEPTED',clock());
 return await readReceipt(db,actor,input.prospectId)?{checked:true,accepted:Boolean(outcome.accepted)}:null;
}
