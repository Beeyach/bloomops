import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition} from './workspaces.mjs';

const w=schema.workspaces;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const percent=(numerator,denominator)=>denominator?Math.round(numerator/denominator*1000)/10:null;

// P3 Results is deliberately receipt/event backed. Drafts, profile labels and
// onboarding state never establish a send, reply, positive outcome or sale.
export async function getProspectResults(db,actor,{now=new Date()}={}){
 if(!allowed(actor)||!(now instanceof Date)||Number.isNaN(now.valueOf()))return null;
 const asOf=now.toISOString(),scope=and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}));
 const [row]=await db.select({
  peopleContacted:sql`(SELECT count(DISTINCT d.prospect_id) FROM prospect_deliveries d WHERE d.workspace_id=${actor.workspaceId} AND d.state='accepted' AND d.provider_message_id IS NOT NULL AND d.accepted_at<=${asOf})`,
  emailsSent:sql`(SELECT count(DISTINCT sent.account_email||char(0)||sent.provider_message_id) FROM (SELECT d.account_email account_email,d.provider_message_id provider_message_id,d.accepted_at accepted_at FROM prospect_deliveries d WHERE d.workspace_id=${actor.workspaceId} AND d.state='accepted' UNION ALL SELECT f.account_email,f.provider_message_id,f.accepted_at FROM prospect_followup_attempts f WHERE f.workspace_id=${actor.workspaceId} AND f.state='accepted') sent WHERE sent.account_email IS NOT NULL AND sent.provider_message_id IS NOT NULL AND sent.accepted_at<=${asOf})`,
  peopleReplied:sql`(SELECT count(DISTINCT r.prospect_id) FROM prospect_reply_observations r WHERE r.workspace_id=${actor.workspaceId} AND r.kind='reply_unreviewed' AND r.match='reply_chain' AND r.received_at<=${asOf} AND EXISTS(SELECT 1 FROM prospect_deliveries d WHERE d.workspace_id=r.workspace_id AND d.prospect_id=r.prospect_id AND d.id=r.delivery_id AND d.state='accepted' AND d.accepted_at<=${asOf}))`,
  interested:sql`(SELECT count(DISTINCT e.subject_id) FROM activity_events e WHERE e.workspace_id=${actor.workspaceId} AND e.subject_type='prospect' AND e.event_type='PROSPECT_INTEREST_RECORDED' AND e.occurred_at<=${asOf})`,
  clients:sql`(SELECT count(DISTINCT c.prospect_id) FROM prospect_conversions c WHERE c.workspace_id=${actor.workspaceId} AND c.created_at<=${asOf} AND EXISTS(SELECT 1 FROM activity_events e WHERE e.workspace_id=c.workspace_id AND e.subject_type='prospect' AND e.subject_id=c.prospect_id AND e.event_type='PROSPECT_CONVERTED' AND e.occurred_at<=${asOf}))`,
 }).from(w).where(scope).limit(1);
 if(!row)return null;
 const values=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Number(value)]));
 return {...values,replyRate:percent(values.peopleReplied,values.peopleContacted),asOf,
  reportingBasis:'All recorded prospect activity in this workspace',
  replyCohort:'All provider-confirmed introductions in this workspace'};
}
