import assert from 'node:assert/strict';
import {repliesFixture} from './_prospect-replies-fixture.mjs';
import {one} from './_bloomops-db.mjs';
import {getProspectDiscoveryState,checkProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';
export async function mailboxFixture(c,{registered=true}={}){
 const t=await repliesFixture(c);if(registered)assert.ok((await t.check({fetcher:async()=>Response.json(t.thread([]))})).checked);
 Object.assign(t.env,{BLOOMOPS_GOOGLE_DISCOVERY_ENABLED:'true',BLOOMOPS_GOOGLE_DISCOVERY_WORKSPACE_ID:t.actor.workspaceId,BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL:'hello@example.test'});
 t.mailstate=()=>one(t.raw,'SELECT * FROM prospect_discovery_states');
 t.mailget=()=>getProspectDiscoveryState(t.db,t.actor,'hello@example.test');
 t.mailcommand=async()=>({workspaceId:t.actor.workspaceId,accountEmail:'hello@example.test',expectedRevision:(await t.mailget())?.revision||0,connectionRevision:one(t.raw,'SELECT revision FROM prospect_google_connections').revision,senderRevision:one(t.raw,'SELECT revision FROM prospect_senders').revision,reviewed:true});
 t.mailfetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'9'});if(u.pathname.endsWith('/history')){const start=BigInt(u.searchParams.get('startHistoryId'));return Response.json({history:[{id:String(start+1n),messagesAdded:[{message:{id:'mailbox-reply',threadId:'separate-thread'}}]}],historyId:String(start+2n)});}return Response.json({...t.message('mailbox-reply'),threadId:'separate-thread'});};
 t.mailcheck=async(options={})=>checkProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{fetcher:t.mailfetch,...options});
 return t;
}
