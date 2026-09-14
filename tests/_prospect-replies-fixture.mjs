import assert from 'node:assert/strict';
import {deliveryFixture} from './_prospect-delivery-fixture.mjs';
import {one} from './_bloomops-db.mjs';
import {sendProspectIntroduction} from '../lib/bloomops/prospect-delivery.mjs';
import {getProspectReplies,checkProspectReplies,stopProspectOutreach} from '../lib/bloomops/prospect-replies.mjs';
export async function repliesFixture(context){
 const t=await deliveryFixture(context);await t.ready();
 assert.ok((await sendProspectIntroduction(t.db,t.actor,t.env,t.session,{...t.input,reviewed:true},{fetcher:async()=>Response.json({id:'sent-message',threadId:'sent-thread'})})).processed);
 t.env.BLOOMOPS_GOOGLE_REPLY_CHECK_ENABLED='true';t.env.BLOOMOPS_GOOGLE_REPLY_DELIVERY_ID=t.input.deliveryId;
 t.row=()=>one(t.raw,'SELECT * FROM prospect_reply_states');
 t.message=(id='reply',extra={})=>({id,threadId:'sent-thread',labelIds:['INBOX'],internalDate:String(Date.now()),payload:{headers:Object.entries({'Message-ID':'<'+id+'@example.test>',From:t.fields.recipient,To:'hello@example.test','In-Reply-To':one(t.raw,'SELECT message_id FROM prospect_deliveries WHERE id=?',t.input.deliveryId).message_id,...extra}).map(([name,value])=>({name,value}))}});
 t.thread=(messages=[t.message()])=>({id:'sent-thread',messages:[{id:'sent-message',threadId:'sent-thread',labelIds:['SENT'],internalDate:String(Date.now()-1000),payload:{headers:[{name:'Message-ID',value:one(t.raw,'SELECT message_id FROM prospect_deliveries WHERE id=?',t.input.deliveryId).message_id},{name:'From',value:'hello@example.test'},{name:'To',value:t.fields.recipient}]}},...messages]});
 t.get=()=>getProspectReplies(t.db,t.actor,t.env,t.id);
 t.command=async()=>{const data=await t.get();return {...t.input,expectedRevision:data.revision,senderRevision:data.senderRevision,connectionRevision:data.connectionRevision,reviewed:true};};
 t.check=async(options={})=>checkProspectReplies(t.db,t.actor,t.env,t.session,await t.command(),{fetcher:async()=>Response.json(t.thread()),...options});
 t.stop=async(note='Owner reviewed the recipient request.',reason='opt_out')=>stopProspectOutreach(t.db,t.actor,t.session,{...t.input,expectedRevision:(await t.get()).revision,reason,note,reviewed:true});
 return t;
}
