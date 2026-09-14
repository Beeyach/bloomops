import {and,eq,isNull,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition,insertSelected} from './workspaces.mjs';
import {evaluate} from './authorization.mjs';
import {activityForMutation} from './activity.mjs';
import {googleConfiguration,randomSecret,digest,sealGoogle,openGoogle,googleAuthUrl,verifyGoogleGrant,googleFailureCode,googleNeedsConsent,storedGoogleTokens,refreshGoogleGrant,googleRefreshedTokens} from './prospect-google-provider.mjs';
const w=schema.workspaces,s=schema.prospectSenders,c=schema.prospectGoogleConnections,n=schema.prospectGoogleAttempts,m=schema.workspaceMemberships;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const authority=actor=>and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}));
const connectionRevision=actor=>sql`COALESCE((SELECT revision FROM prospect_google_connections WHERE workspace_id=${actor.workspaceId}),0)`;
const liveSession=(actor,id)=>sql`EXISTS(SELECT 1 FROM session WHERE id=${id} AND user_id=${actor.userId} AND expires_at>${Date.now()})`;
const denied=()=>({conflict:true,error:'This connection request expired or changed. Return to sender setup and try again.'});
const unavailable=()=>({unavailable:true,error:'Google sign-in is not available on this deployment yet.'});
const validRevision=v=>Number.isSafeInteger(v)&&v>=0;
const liveAuthorizer=()=>sql`EXISTS(SELECT 1 FROM workspace_memberships am WHERE am.workspace_id=${c.workspaceId} AND am.id=${c.authorizedByMembershipId} AND am.updated_at=${c.authorizerUpdatedAt} AND am.status='active' AND am.role IN ('owner','admin'))`;
export async function getProspectGoogle(db,actor,env={}){
 if(!allowed(actor))return null;
 const [row]=await db.select({senderEmail:s.email,senderRevision:s.revision,memberUpdatedAt:m.updatedAt,revision:c.revision,accountEmail:c.accountEmail,connectionSender:c.senderEmail,active:c.active,tokenBox:c.tokenBox,valid:liveAuthorizer(),checkId:c.checkId,checkExpiresAt:c.checkExpiresAt,checkedAt:c.checkedAt,checkStatus:c.checkStatus}).from(w).innerJoin(m,and(eq(m.id,actor.membershipId),eq(m.workspaceId,w.id))).leftJoin(s,eq(s.workspaceId,w.id)).leftJoin(c,eq(c.workspaceId,w.id)).where(authority(actor)).limit(1);
 if(!row)return null;
 const config=googleConfiguration(env),configured=Boolean(config);
 const tokens=config&&row.active?storedGoogleTokens(await openGoogle(config,actor.workspaceId+':tokens',row.tokenBox)):null;
 const usable=Boolean(config&&row.active&&row.valid&&row.senderEmail===row.connectionSender&&tokens&&['unchecked','healthy','temporary'].includes(row.checkStatus));
 const checking=Boolean(row.checkId&&Date.parse(row.checkExpiresAt)>Date.now()),expired=Boolean(tokens&&Date.parse(tokens.expiresAt)<=Date.now()+30000);
 const connected=Boolean(usable&&!checking&&!expired&&row.checkStatus!=='temporary');
 const status=checking?'checking':connected?'connected':!row.active?'not-connected':!usable?'reconnect':row.checkStatus==='temporary'?'check-failed':'check-needed';
 return {workspaceId:actor.workspaceId,senderEmail:row.senderEmail,senderRevision:row.senderRevision||0,memberUpdatedAt:row.memberUpdatedAt,revision:row.revision||0,connected,configured,hasStoredGrant:Boolean(row.active),accountEmail:usable?row.accountEmail:null,status,canCheck:usable&&!checking,checkedAt:row.checkedAt||null};
}
export async function beginProspectGoogle(db,actor,env,sessionId,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!input||Object.keys(input).some(k=>!['workspaceId','senderRevision','expectedRevision'].includes(k))||input.workspaceId!==actor.workspaceId||!validRevision(input.senderRevision)||!validRevision(input.expectedRevision)||typeof sessionId!=='string'||!sessionId)return denied();
 const config=googleConfiguration(env);if(!config)return unavailable();
 const data=await getProspectGoogle(db,actor,env);if(!data)return null;if(!data.senderEmail||data.senderRevision!==input.senderRevision||data.revision!==input.expectedRevision)return denied();
 const state=randomSecret(),stateHash=await digest(state),verifier=randomSecret(),sessionHash=await digest(sessionId),iso=now.toISOString();
 const condition=and(authority(actor),liveSession(actor,sessionId),sql`EXISTS(SELECT 1 FROM prospect_senders WHERE workspace_id=${actor.workspaceId} AND revision=${data.senderRevision})`,sql`${connectionRevision(actor)}=${data.revision}`,sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND updated_at=${data.memberUpdatedAt})`,sql`(SELECT count(*) FROM prospect_google_attempts WHERE workspace_id=${actor.workspaceId} AND membership_id=${actor.membershipId} AND expires_at>${iso} AND consumed_at IS NULL)<5`);
 const rows=await insertSelected(db,n,{stateHash,workspaceId:actor.workspaceId,membershipId:actor.membershipId,memberUpdatedAt:data.memberUpdatedAt,sessionHash,senderRevision:data.senderRevision,connectionRevision:data.revision,senderEmail:data.senderEmail,verifierBox:await sealGoogle(config,actor.workspaceId+':attempt:'+stateHash,verifier),createdAt:iso,expiresAt:new Date(now.getTime()+600000).toISOString(),consumedAt:null},w,condition).returning({hash:n.stateHash});
 return rows.length?{url:await googleAuthUrl(config,{state,verifier,email:data.senderEmail})}:denied();
}
export async function finishProspectGoogle(db,actor,env,sessionId,{state,code,error}, {now=new Date(),fetcher=fetch}={}){
 if(!allowed(actor))return null;
 const config=googleConfiguration(env);if(!config)return unavailable();
 if(typeof state!=='string'||!/^[0-9a-f]{64}$/.test(state)||typeof sessionId!=='string'||!sessionId||(!error&&(typeof code!=='string'||!code||code.length>4096)))return denied();
 const stateHash=await digest(state),sessionHash=await digest(sessionId),iso=now.toISOString();
 const condition=and(eq(n.stateHash,stateHash),eq(n.workspaceId,actor.workspaceId),eq(n.membershipId,actor.membershipId),eq(n.sessionHash,sessionHash),isNull(n.consumedAt),sql`${n.expiresAt}>${iso}`,administratorCondition(actor,{purpose:'prospecting'}),liveSession(actor,sessionId),sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND updated_at=${n.memberUpdatedAt})`,sql`EXISTS(SELECT 1 FROM prospect_senders WHERE workspace_id=${actor.workspaceId} AND revision=${n.senderRevision})`,sql`${connectionRevision(actor)}=${n.connectionRevision}`);
 // Claim once before contacting Google. A failed exchange requires a new
 // consent request; a replay/concurrent callback never reuses the code.
 const [attempt]=await db.update(n).set({consumedAt:iso}).where(condition).returning();if(!attempt)return denied();if(error)return {cancelled:true};
 const verifier=await openGoogle(config,actor.workspaceId+':attempt:'+stateHash,attempt.verifierBox);if(!verifier)return denied();
 let grant;try{grant=await verifyGoogleGrant(config,{code,verifier,senderEmail:attempt.senderEmail,fetcher});}catch(error){console.warn('Bloomsi Google verification failed:',googleFailureCode(error));return {unavailable:true,error:'Google connection could not be verified. Check the account and permissions, then try again.'};}
 const tokenBox=await sealGoogle(config,actor.workspaceId+':tokens',JSON.stringify(grant.tokens));
 const current=and(authority(actor),liveSession(actor,sessionId),sql`EXISTS(SELECT 1 FROM prospect_senders WHERE workspace_id=${actor.workspaceId} AND revision=${attempt.senderRevision})`,sql`${connectionRevision(actor)}=${attempt.connectionRevision}`,sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND updated_at=${attempt.memberUpdatedAt})`);
 const values={workspaceId:actor.workspaceId,revision:1,senderEmail:attempt.senderEmail,accountEmail:grant.accountEmail,tokenBox,grantedScope:grant.scope,active:1,authorizedByMembershipId:actor.membershipId,authorizerUpdatedAt:attempt.memberUpdatedAt,createdAt:iso,updatedAt:iso,checkId:null,checkExpiresAt:null,checkedAt:iso,checkStatus:'healthy'};
 const results=await db.batch([activityForMutation(db,w,current,{workspaceId:actor.workspaceId,eventType:'PROSPECT_GOOGLE_CONNECTED',subjectType:'workspace',subjectId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{},occurredAt:iso}),insertSelected(db,c,values,w,current).onConflictDoUpdate({target:c.workspaceId,set:{...values,revision:sql`${c.revision}+1`,createdAt:c.createdAt}}).returning({revision:c.revision})]);
 return results.at(-1).length?{connected:true}:denied();
}
export async function disconnectProspectGoogle(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;if(!input||Object.keys(input).some(k=>!['workspaceId','expectedRevision'].includes(k))||input.workspaceId!==actor.workspaceId||!validRevision(input.expectedRevision)||input.expectedRevision<1)return denied();
 const iso=now.toISOString(),condition=and(eq(c.workspaceId,actor.workspaceId),eq(c.revision,input.expectedRevision),administratorCondition(actor,{purpose:'prospecting'}));
 const results=await db.batch([activityForMutation(db,c,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_GOOGLE_DISCONNECTED',subjectType:'workspace',subjectId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{},occurredAt:iso}),db.update(c).set({active:0,tokenBox:null,grantedScope:null,accountEmail:null,revision:sql`${c.revision}+1`,updatedAt:iso,checkId:null,checkExpiresAt:null,checkedAt:null,checkStatus:'unchecked'}).where(condition).returning({revision:c.revision})]);return results.at(-1).length?{disconnected:true}:denied();
}

export async function checkProspectGoogle(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!allowed(actor))return null;
 if(!input||Object.keys(input).some(k=>!['workspaceId','senderRevision','expectedRevision'].includes(k))||input.workspaceId!==actor.workspaceId||!validRevision(input.senderRevision)||!validRevision(input.expectedRevision)||input.expectedRevision<1||typeof sessionId!=='string'||!sessionId)return denied();
 const config=googleConfiguration(env);if(!config)return unavailable();
 const data=await getProspectGoogle(db,actor,env);if(!data)return null;
 if(!data.canCheck||data.revision!==input.expectedRevision||data.senderRevision!==input.senderRevision)return denied();
 const now=clock(),iso=now.toISOString(),checkId=randomSecret(),leaseUntil=new Date(now.getTime()+90000).toISOString();
 const current=()=>and(eq(c.workspaceId,actor.workspaceId),eq(c.active,1),administratorCondition(actor,{purpose:'prospecting'}),liveSession(actor,sessionId),liveAuthorizer(),sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND updated_at=${data.memberUpdatedAt})`,sql`EXISTS(SELECT 1 FROM prospect_senders WHERE workspace_id=${actor.workspaceId} AND revision=${input.senderRevision} AND email=${c.senderEmail})`);
 const [claimed]=await db.update(c).set({revision:sql`${c.revision}+1`,checkId,checkExpiresAt:leaseUntil,updatedAt:iso}).where(and(current(),eq(c.revision,input.expectedRevision),sql`(${c.checkExpiresAt} IS NULL OR ${c.checkExpiresAt}<=${iso})`,sql`(${c.checkedAt} IS NULL OR ${c.checkedAt}<=${new Date(now.getTime()-30000).toISOString()})`)).returning();
 if(!claimed)return {conflict:true,error:'A connection check is already running or was just completed. Reload and try again shortly.'};
 const tokens=storedGoogleTokens(await openGoogle(config,actor.workspaceId+':tokens',claimed.tokenBox));
 let grant,refreshedTokens,status='healthy';
 try{if(!tokens)status='reconnect';else grant=await refreshGoogleGrant(config,{tokens,scope:claimed.grantedScope,senderEmail:claimed.senderEmail,accountEmail:claimed.accountEmail,fetcher});}
 catch(error){status=googleNeedsConsent(error)?'reconnect':'temporary';refreshedTokens=googleRefreshedTokens(error);console.warn('Bloomsi Google check failed:',googleFailureCode(error));}
 const completed=clock().toISOString(),condition=and(current(),eq(c.revision,claimed.revision),eq(c.checkId,checkId),sql`${c.checkExpiresAt}>${completed}`);
 // Keep a rotated refresh token even if the later identity probe was
 // unavailable. The failed check still prevents reporting usable access.
 const refreshed=grant?.tokens||refreshedTokens;
 const values={checkId:null,checkExpiresAt:null,checkedAt:completed,checkStatus:status,updatedAt:completed,...(refreshed?{tokenBox:await sealGoogle(config,actor.workspaceId+':tokens',JSON.stringify(refreshed))}:{}),...(grant?{grantedScope:grant.scope}:{})};
 const results=await db.batch([activityForMutation(db,c,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_GOOGLE_CHECKED',subjectType:'workspace',subjectId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{status},occurredAt:completed}),db.update(c).set(values).where(condition).returning({revision:c.revision})]);
 if(!results.at(-1).length)return denied();
 return {checked:true,status,...(status==='reconnect'?{error:'Google access needs to be reconnected. Connect Google again.'}:status==='temporary'?{error:'Google could not be checked right now. Your saved connection is retained. Try again shortly.'}:{})};
}
