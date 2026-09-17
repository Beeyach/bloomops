import {and,desc,eq} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition} from './workspaces.mjs';

const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;

export async function prospectCoverageOverview(db,actor,accountEmail){
 if(!allowed(actor))return null;
 if(!accountEmail)return {status:'unknown',checkStatus:null,lastReason:null};
 const s=schema.prospectDiscoveryStates,z=schema.prospectHistoricalCoverages;
 const [verified]=await db.select({from:z.intervalFrom,through:z.intervalThrough}).from(z).where(and(eq(z.workspaceId,actor.workspaceId),eq(z.accountEmail,accountEmail),administratorCondition(actor,{purpose:'prospecting'}))).orderBy(desc(z.createdAt),desc(z.id)).limit(1);
 if(verified)return {status:'verified',checkStatus:'checked',lastReason:null,...verified};
 const [row]=await db.select({status:s.coverageStatus,checkStatus:s.checkStatus,lastReason:s.lastReason}).from(s)
  .where(and(eq(s.workspaceId,actor.workspaceId),eq(s.accountEmail,accountEmail),administratorCondition(actor,{purpose:'prospecting'}))).limit(1);
 return row||{status:'unknown',checkStatus:null,lastReason:null};
}

export function prospectAutomationState({sender,connection}){
 if(!sender||!connection.configured||!connection.hasStoredGrant)return {state:'unconfigured',label:'Automation is unconfigured'};
 return {state:'inactive',label:'Automation is inactive'};
}

export function prospectExceptionCopy(row){
 if(row.holdState==='stopped'){
  const labels={opt_out:'Recipient opted out',declined:'Recipient declined',hard_bounce:'Hard bounce confirmed',manual:'Stopped after manual review'};
  return {key:'stopped:'+row.stopReason,label:labels[row.stopReason]||'Outreach stopped',detail:row.stopNote||'A recorded stop prevents further outreach.'};
 }
 const labels={unresolved:'Conversation check could not be resolved',checking:'Conversation check is still in progress',checked:'Reply or delivery evidence needs review',never:'Conversation is held for review'};
 return {key:'held:'+row.checkStatus,label:labels[row.checkStatus]||'Conversation is held for review',detail:'Review the recorded conversation before deciding what happens next.'};
}

export function prospectCoverageCopy(coverage){
 if(coverage.status==='verified'){const format=value=>new Date(value).toLocaleString('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' UTC';return {label:'Historical interval verified',detail:`Verified for ${format(coverage.from)} through ${format(coverage.through)}. Earlier mail and current monitoring are not included.`};}
 if(coverage.status==='gap')return {label:'Mailbox coverage has a recorded gap',detail:coverage.lastReason?`Recorded reason: ${coverage.lastReason.replaceAll('_',' ')}.`:'The last mailbox check did not complete coverage.'};
 if(coverage.status==='unverified')return {label:'Historical mailbox coverage is unverified',detail:'Saved checks do not prove that older mail was completely reviewed.'};
 return {label:'Mailbox coverage is unknown',detail:'No saved monitoring coverage record exists for this account.'};
}
