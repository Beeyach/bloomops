export const time = Date.parse('2026-09-13T08:00:00Z');
export function delivery(number = 1) {
 const id='12345678-1234-1234-1234-'+String(number).padStart(12,'0');
 const receipt={id,workspaceId:'workspace-a',prospectId:'prospect-'+number,state:'accepted',accountEmail:'primary@example.test',providerMessageId:'sent-'+number,providerThreadId:'thread-'+number,messageId:'<bloomsi-'+id+'@bloomsi.invalid>',attemptedAt:new Date(time).toISOString()};
 return {receipt,snapshot:{sender:{email:'hello@example.test'},draft:{recipient:'person'+number+'@example.test'}},identity:{id:'identity-'+number,workspaceId:receipt.workspaceId,prospectId:receipt.prospectId,deliveryId:id,accountEmail:receipt.accountEmail,providerMessageId:receipt.providerMessageId,providerThreadId:receipt.providerThreadId,rfcMessageId:'<returned-'+number+'@example.test>',verifiedByMembershipId:'owner',connectionRevision:1,senderRevision:1,createdAt:new Date(time+500).toISOString()}};
}
export const context = {workspaceId:'workspace-a',accountEmail:'primary@example.test',startHistoryId:'9',deliveries:[delivery()]};
export function message(id='reply',headers={},patch={}) {
 return {id,threadId:'separate-thread',labelIds:['INBOX'],internalDate:String(time+1000),payload:{headers:Object.entries({'Message-ID':'<'+id+'@example.test>',From:'someone@elsewhere.test',To:'hello@example.test','In-Reply-To':context.deliveries[0].identity.rfcMessageId,...headers}).map(([name,value])=>({name,value}))},...patch};
}
export function sent(entry=delivery()) {
 return message(entry.identity.providerMessageId,{'Message-ID':entry.identity.rfcMessageId,From:entry.snapshot.sender.email,To:entry.snapshot.draft.recipient},{threadId:entry.identity.providerThreadId,labelIds:['SENT'],internalDate:String(time)});
}
export const history=(messages=[message()],extra={})=>({history:[{id:'10',messagesAdded:messages.map(m=>({message:{id:m.id,threadId:m.threadId}}))}],historyId:'11',...extra});
