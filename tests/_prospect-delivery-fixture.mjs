import assert from 'node:assert/strict';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {run,one} from './_bloomops-db.mjs';
import {createProspect,updateProspect} from '../lib/bloomops/prospects.mjs';
import {saveProspectSender,saveProspectOutreach,approveProspectOutreach} from '../lib/bloomops/prospect-outreach.mjs';
import {prepareProspectDelivery} from '../lib/bloomops/prospect-delivery.mjs';
import {sealGoogle,googleConfiguration,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
export async function deliveryFixture(context,fieldOverrides={}){
 const t=await sourceFixture(context);
 t.fields={recipient:'inbox@example.test',timeZone:'America/Los_Angeles',subject:'Bloomsi controlled delivery check',intro:'This is a controlled test of Bloomsi email delivery. No reply or action is needed.',followUp2:'Unused test follow-up.',followUp3:'Unused test follow-up.',...fieldOverrides};
 const created=await createProspect(t.db,{actor:t.actor,input:{workspaceId:'fresh',requestId:crypto.randomUUID(),fields:{businessName:'Garden test inbox',publicEmail:t.fields.recipient,timeZone:t.fields.timeZone,fit:'strong',observedFacts:'Synthetic controlled inbox.',evidenceDate:'2026-09-13',evidenceTarget:'https://example.test',proposedWork:'Test the approved introduction.'}}});t.id=created.prospectId;
 await updateProspect(t.db,{actor:t.actor,id:t.id,input:{workspaceId:'fresh',expectedRevision:1,fields:{publicEmail:t.fields.recipient},sources:{publicEmail:{url:'https://example.test/contact',checked:true}}}});
 await saveProspectSender(t.db,t.actor,{workspaceId:'fresh',expectedRevision:0,fields:{provider:'google_workspace',email:'hello@example.test',displayName:'Ary, Bloomwired'}});
 const revisions={workspaceId:'fresh',prospectId:t.id,expectedRevision:0,expectedProfileRevision:2,expectedSenderRevision:1};assert.ok((await saveProspectOutreach(t.db,t.actor,{...revisions,sourceResultId:null,fields:t.fields})).saved);assert.ok((await approveProspectOutreach(t.db,t.actor,{...revisions,expectedRevision:1,reviewed:true})).approved);
 t.approvalId=one(t.raw,'SELECT id FROM prospect_outreach_approvals').id;
 t.prepare={workspaceId:'fresh',prospectId:t.id,approvalId:t.approvalId};
 t.env={BLOOMOPS_ENV:'development',BLOOMOPS_MAIL_TRANSPORT:'r2-dev',BLOOMOPS_APP_URL:'http://localhost:8787',BLOOMOPS_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',BLOOMOPS_GOOGLE_CLIENT_SECRET:'synthetic-secret',BLOOMOPS_GOOGLE_TOKEN_KEY:'12'.repeat(32),BLOOMOPS_GOOGLE_CONNECT_ENABLED:'true',BLOOMOPS_GOOGLE_TEST_SEND_ENABLED:'true',BLOOMOPS_GOOGLE_TEST_RECIPIENT:t.fields.recipient};
 t.session='synthetic-session';run(t.raw,"INSERT INTO session(id,token,user_id,expires_at,created_at,updated_at) VALUES(?,?,'owner',?,?,?)",t.session,'synthetic-session-token',Date.now()+3600000,Date.now(),Date.now());
 const box=await sealGoogle(googleConfiguration(t.env),'fresh:tokens',JSON.stringify({accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:new Date(Date.now()+3600000).toISOString()}));
 run(t.raw,"INSERT INTO prospect_google_connections(workspace_id,revision,sender_email,account_email,token_box,granted_scope,active,authorized_by_membership_id,authorizer_updated_at,check_status) VALUES('fresh',1,'hello@example.test','hello@example.test',?,?,1,'dest',?,'healthy')",box,GOOGLE_SCOPES.join(' '),one(t.raw,"SELECT updated_at FROM workspace_memberships WHERE id='dest'").updated_at);
 t.ready=async()=>{const result=await prepareProspectDelivery(t.db,t.actor,t.prepare);assert.ok(result.prepared);t.env.BLOOMOPS_GOOGLE_TEST_DELIVERY_ID=result.deliveryId;t.input={workspaceId:'fresh',prospectId:t.id,deliveryId:result.deliveryId};return result;};
 return t;
}
