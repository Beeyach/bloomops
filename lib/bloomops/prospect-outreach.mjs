import {and,desc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {readTogether} from './read-batch.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {getProspect,prospectCondition} from './prospects.mjs';
import {getSkillResult} from './prospect-skill-results.mjs';
import {OUTREACH_FIELDS,exact,normalizeSender,normalizeOutreach,outreachBlockers} from './prospect-outreach-values.mjs';
const w=schema.workspaces,p=schema.prospects,s=schema.prospectSenders,q=schema.prospectOutreachDrafts,a=schema.prospectOutreachApprovals,m=schema.workspaceMemberships;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const scope=actor=>and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}));
const ps=(actor,id)=>and(prospectCondition(actor),eq(p.id,id));
const conflict=()=>({conflict:true,error:'This workspace, profile or draft changed. Reload the latest version before saving.'});
const version=n=>Number.isSafeInteger(n)&&n>=0;
const senderRevision=actor=>sql`COALESCE((SELECT revision FROM prospect_senders WHERE workspace_id=${actor.workspaceId}),0)`;
const draftRevision=(actor,id)=>sql`COALESCE((SELECT revision FROM prospect_outreach_drafts WHERE workspace_id=${actor.workspaceId} AND prospect_id=${id}),0)`;
const draftColumns={id:q.id,workspaceId:q.workspaceId,prospectId:q.prospectId,revision:q.revision,profileRevision:q.profileRevision,sourceResultId:q.sourceResultId,...Object.fromEntries(Object.keys(OUTREACH_FIELDS).map(k=>[k,q[k]])),updatedAt:q.updatedAt};
export async function getProspectSender(db,actor){
 if(!allowed(actor))return null;
 const [row]=await db.select({workspaceId:w.id,provider:s.provider,email:s.email,displayName:s.displayName,revision:s.revision}).from(w).leftJoin(s,eq(s.workspaceId,w.id)).where(scope(actor)).limit(1);
 return row?{workspaceId:row.workspaceId,sender:row.revision?{provider:row.provider,email:row.email,displayName:row.displayName,revision:row.revision}:null}:null;
}
export async function saveProspectSender(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','expectedRevision','fields'])||input.workspaceId!==actor.workspaceId||!version(input.expectedRevision))return {invalid:true,error:'Reload sender setup before saving.'};
 const normalized=normalizeSender(input.fields);if(normalized.invalid)return normalized;
 const current=await getProspectSender(db,actor);if(!current)return null;
 if(Object.entries(normalized.fields).every(([k,v])=>current.sender?.[k]===v))return {saved:true,unchanged:true,revision:current.sender.revision};
 if((current.sender?.revision||0)!==input.expectedRevision)return conflict();
 const iso=now.toISOString(),condition=and(scope(actor),sql`${senderRevision(actor)}=${input.expectedRevision}`);
 const result=await db.batch([
  activityForMutation(db,w,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_SENDER_UPDATED',subjectType:'workspace',subjectId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{fields:['provider','email','displayName']},occurredAt:iso}),
  insertSelected(db,s,{workspaceId:actor.workspaceId,...normalized.fields,revision:1,updatedByMembershipId:actor.membershipId,createdAt:iso,updatedAt:iso},w,condition).onConflictDoUpdate({target:s.workspaceId,set:{...normalized.fields,revision:sql`${s.revision}+1`,updatedByMembershipId:actor.membershipId,updatedAt:iso}}).returning({revision:s.revision}),
 ]);
 if(result.at(-1)[0])return {saved:true,revision:result.at(-1)[0].revision};
 const latest=await getProspectSender(db,actor);if(!latest)return null;
 return Object.entries(normalized.fields).every(([k,v])=>latest.sender?.[k]===v)?{saved:true,unchanged:true,revision:latest.sender.revision}:conflict();
}
function activeApproval(){return sql`EXISTS(SELECT 1 FROM prospect_outreach_approvals oa JOIN workspace_memberships am ON am.id=oa.approved_by_membership_id AND am.workspace_id=oa.workspace_id
 WHERE oa.workspace_id=${q.workspaceId} AND oa.draft_id=${q.id} AND oa.draft_revision=${q.revision} AND oa.profile_revision=${p.revision} AND oa.sender_revision=${s.revision}
 AND am.status='active' AND am.role IN ('owner','admin') AND am.updated_at=oa.approver_updated_at)`;}
export async function getProspectOutreach(db,actor,id,{resultId=null}={}){
 if(!allowed(actor)||typeof id!=='string'||!id||id.length>200)return null;
 const data=await getProspect(db,actor,id);if(!data)return null;
 const senderData=await getProspectSender(db,actor);if(!senderData)return null;
 const [row]=await db.select({...draftColumns,approved:activeApproval()}).from(q).innerJoin(p,and(eq(p.id,q.prospectId),eq(p.workspaceId,q.workspaceId))).leftJoin(s,eq(s.workspaceId,q.workspaceId)).where(ps(actor,id)).limit(1);
 let source=null;if(resultId!==null){if(typeof resultId!=='string'||!resultId||resultId.length>200)return null;source=await getSkillResult(db,actor,id,resultId);if(!source||source.document.followUps.length!==2||!['outreach','follow-up'].includes(source.skillId))return null;}
 const [current]=await db.select({id:p.id,approved:activeApproval()}).from(p).leftJoin(q,and(eq(q.prospectId,p.id),eq(q.workspaceId,p.workspaceId))).leftJoin(s,eq(s.workspaceId,p.workspaceId)).where(and(ps(actor,id),eq(p.revision,data.profile.revision),sql`${senderRevision(actor)}=${senderData.sender?.revision||0}`,sql`${draftRevision(actor,id)}=${row?.revision||0}`)).limit(1);if(!current){const still=await getProspectSender(db,actor);return still?conflict():null;}
 const draft=row?{...row,approved:undefined}:null,recipientChecked=data.sources.some(source=>source.fieldKey==='publicEmail'&&source.verification==='checked');
 const blockers=outreachBlockers({profile:data.profile,sender:senderData.sender,draft,recipientChecked});
 const seed=draft?Object.fromEntries(Object.keys(OUTREACH_FIELDS).map(k=>[k,draft[k]??null])):{recipient:data.profile.publicEmail,timeZone:data.profile.timeZone,subject:data.profile.draftSubject,intro:data.profile.draftBody,followUp2:null,followUp3:null};
 if(source){seed.followUp2=source.document.followUps[0].body;seed.followUp3=source.document.followUps[1].body;}
 return {profile:data.profile,sender:senderData.sender,draft,seed,sourceResultId:source?.id||draft?.sourceResultId||null,selectedResult:source?{id:source.id,title:source.skillId==='outreach'?'Outreach draft':'Follow-up refinement'}:null,blockers,approved:Boolean(current.approved)&&!blockers.length};
}
export async function saveProspectOutreach(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 const keys=['workspaceId','prospectId','expectedRevision','expectedProfileRevision','expectedSenderRevision','sourceResultId','fields'];
 if(!exact(input,keys)||input.workspaceId!==actor.workspaceId||typeof input.prospectId!=='string'||!input.prospectId||input.prospectId.length>200||!version(input.expectedRevision)||!version(input.expectedProfileRevision)||input.expectedProfileRevision<1||!version(input.expectedSenderRevision)||(input.sourceResultId!==null&&(typeof input.sourceResultId!=='string'||!input.sourceResultId||input.sourceResultId.length>200)))return {invalid:true,error:'Reload the draft before saving.'};
 const normalized=normalizeOutreach(input.fields);if(normalized.invalid)return normalized;
 const data=await getProspectOutreach(db,actor,input.prospectId,{resultId:input.sourceResultId});if(!data||data.conflict)return data;
 if(data.profile.revision!==input.expectedProfileRevision||(data.sender?.revision||0)!==input.expectedSenderRevision)return conflict();
 const same=draft=>draft&&draft.profileRevision===input.expectedProfileRevision&&draft.sourceResultId===input.sourceResultId&&Object.entries(normalized.fields).every(([k,v])=>draft[k]===v);
 if(same(data.draft))return {saved:true,unchanged:true,revision:data.draft.revision};
 if((data.draft?.revision||0)!==input.expectedRevision)return conflict();
 const iso=now.toISOString(),id=data.draft?.id||crypto.randomUUID(),condition=and(ps(actor,input.prospectId),eq(p.revision,input.expectedProfileRevision),sql`${senderRevision(actor)}=${input.expectedSenderRevision}`,sql`${draftRevision(actor,input.prospectId)}=${input.expectedRevision}`);
 const values={id,workspaceId:actor.workspaceId,prospectId:input.prospectId,revision:1,profileRevision:input.expectedProfileRevision,sourceResultId:input.sourceResultId,...normalized.fields,updatedByMembershipId:actor.membershipId,createdAt:iso,updatedAt:iso};
 const result=await db.batch([
  activityForMutation(db,p,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_DRAFT_SAVED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{draftRevision:input.expectedRevision+1},occurredAt:iso}),
  insertSelected(db,q,values,p,condition).onConflictDoUpdate({target:[q.workspaceId,q.prospectId],set:{...normalized.fields,profileRevision:input.expectedProfileRevision,sourceResultId:input.sourceResultId,revision:sql`${q.revision}+1`,updatedByMembershipId:actor.membershipId,updatedAt:iso}}).returning({revision:q.revision}),
 ]);
 if(result.at(-1)[0])return {saved:true,revision:result.at(-1)[0].revision};
 const latest=await getProspectOutreach(db,actor,input.prospectId);return latest===null?null:same(latest.draft)?{saved:true,unchanged:true,revision:latest.draft.revision}:conflict();
}
export async function approveProspectOutreach(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','prospectId','expectedRevision','expectedProfileRevision','expectedSenderRevision','reviewed'])||input.workspaceId!==actor.workspaceId||typeof input.prospectId!=='string'||!input.prospectId||input.prospectId.length>200||[input.expectedRevision,input.expectedProfileRevision,input.expectedSenderRevision].some(n=>!version(n)||n<1)||input.reviewed!==true)return {invalid:true,error:'Review this draft and acknowledge the recipient, evidence and offer.'};
 const data=await getProspectOutreach(db,actor,input.prospectId);if(!data||data.conflict)return data;
 if(data.draft?.revision!==input.expectedRevision||data.profile.revision!==input.expectedProfileRevision||data.sender?.revision!==input.expectedSenderRevision)return conflict();
 if(data.blockers.length)return {invalid:true,error:'Complete these checks before approving.',errors:data.blockers};
 if(data.approved)return {approved:true,unchanged:true};
 const [approver]=await db.select({updatedAt:m.updatedAt}).from(m).where(and(eq(m.id,actor.membershipId),administratorCondition(actor,{purpose:'prospecting'}))).limit(1);if(!approver)return null;
 const id=crypto.randomUUID(),iso=now.toISOString(),condition=and(ps(actor,input.prospectId),eq(p.revision,input.expectedProfileRevision),sql`${senderRevision(actor)}=${input.expectedSenderRevision}`,eq(q.revision,input.expectedRevision),sql`NOT ${activeApproval()}`,sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND workspace_id=${actor.workspaceId} AND updated_at=${approver.updatedAt})`);
 const snapshot={sender:data.sender,draft:Object.fromEntries(Object.keys(OUTREACH_FIELDS).map(k=>[k,data.draft[k]])),profile:{revision:data.profile.revision,fit:data.profile.fit,publicEmail:data.profile.publicEmail,observedFacts:data.profile.observedFacts,unknowns:data.profile.unknowns,evidenceDate:data.profile.evidenceDate,evidenceTarget:data.profile.evidenceTarget,proposedWork:data.profile.proposedWork},sourceResultId:data.draft.sourceResultId};
 // The same joined read establishes current draft/sender/profile and authority
 // inside the transaction; neither a stale view nor approval enables sending.
 const select=db.select({id:sql`${id}`.as('id'),workspaceId:sql`${actor.workspaceId}`.as('workspaceId'),draftId:q.id,draftRevision:q.revision,profileRevision:p.revision,senderRevision:s.revision,approvedByMembershipId:sql`${actor.membershipId}`.as('approvedByMembershipId'),approverUpdatedAt:sql`${approver.updatedAt}`.as('approverUpdatedAt'),snapshotJson:sql`${JSON.stringify(snapshot)}`.as('snapshotJson'),createdAt:sql`${iso}`.as('createdAt')}).from(q).innerJoin(p,and(eq(p.id,q.prospectId),eq(p.workspaceId,q.workspaceId))).innerJoin(s,eq(s.workspaceId,q.workspaceId)).where(condition);
 const saved=and(ps(actor,input.prospectId),sql`EXISTS(SELECT 1 FROM prospect_outreach_approvals WHERE id=${id} AND workspace_id=${actor.workspaceId})`);
 await db.batch([db.insert(a).select(select),activityForMutation(db,p,saved,{workspaceId:actor.workspaceId,eventType:'PROSPECT_DRAFT_APPROVED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{approvalId:id,draftRevision:input.expectedRevision},occurredAt:iso})]);
 const latest=await getProspectOutreach(db,actor,input.prospectId);return latest===null?null:latest.approved?{approved:true}:conflict();
}
export async function prospectOutreachOverview(db,actor,page=1){
 if(!allowed(actor)||!Number.isInteger(page)||page<1||page>10000)return null;
 const [data,rows]=await readTogether(db,db=>Promise.all([getProspectSender(db,actor),db.select({id:p.id,businessName:p.businessName,website:p.website,draftRevision:q.revision,profileRevision:p.revision,sourceProfileRevision:q.profileRevision,approved:activeApproval(),updatedAt:q.updatedAt}).from(q).innerJoin(p,and(eq(p.id,q.prospectId),eq(p.workspaceId,q.workspaceId))).leftJoin(s,eq(s.workspaceId,q.workspaceId)).where(prospectCondition(actor)).orderBy(desc(q.updatedAt),desc(q.id)).limit(21).offset((page-1)*20)]));
 if(!data)return null;
 return {...data,rows:rows.slice(0,20).map(row=>({...row,approved:Boolean(row.approved)})),page,more:rows.length>20};
}
