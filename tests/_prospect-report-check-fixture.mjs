import assert from 'node:assert/strict';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {one,all} from './_bloomops-db.mjs';
import {recoverProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';
import {checkProspectDeliveryReport} from '../lib/bloomops/prospect-report-checks.mjs';
import {fixture,encode,dsn} from './_prospect-delivery-report-fixture.mjs';
export async function reportCheckFixture(c){
 const t=await mailboxFixture(c),base=Date.now();t.offset=0;t.clock=()=>new Date(base+t.offset);
 const {message}=fixture();message.internalDate=String(base+1000);
 const identity=one(t.raw,'SELECT * FROM prospect_delivery_identities');
 encode(message.payload.parts[1],dsn(t.fields.recipient));
 encode(message.payload.parts[2],`Message-ID: ${identity.rfc_message_id}\r\nFrom: hello@example.test\r\nTo: ${t.fields.recipient}\r\n`);
 t.reportMessage=message;t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 const fetcher=async url=>{
  const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});
  if(u.pathname.endsWith('/messages'))return Response.json({messages:[{id:message.id,threadId:message.threadId}]});
  if(u.pathname.endsWith('/history'))return Response.json({historyId:'101'});
  return Response.json({...message,payload:{headers:message.payload.headers}});
 };
 assert.ok((await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{fetcher,clock:t.clock})).checked);
 const candidate=one(t.raw,'SELECT * FROM prospect_recovery_messages');assert.equal(candidate.kind,'needs_review');
 Object.assign(t.env,{BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED:'true',BLOOMOPS_GOOGLE_REPORT_RUN_ID:candidate.run_id,BLOOMOPS_GOOGLE_REPORT_MESSAGE_ID:candidate.provider_message_id});
 t.reportInput=async()=>({...await t.mailcommand(),recoveryRunId:candidate.run_id,providerMessageId:candidate.provider_message_id});
 t.reportChecks=()=>all(t.raw,'SELECT * FROM prospect_report_checks ORDER BY created_at,id');
 t.reportCheck=async(options={})=>checkProspectDeliveryReport(t.db,t.actor,t.env,t.session,await t.reportInput(),{clock:t.clock,fetcher:async()=>Response.json(t.reportMessage),...options});
 return t;
}
