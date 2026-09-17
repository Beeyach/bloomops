// Recovery evidence is separate from operational discovery progress.
import {inspectGoogleReplyBaseline,collectGoogleReplyChanges,collectGoogleReplyCandidates} from './prospect-reply-discovery.mjs';
import {inspectGoogleReplyBackfill} from './prospect-reply-backfill.mjs';
const failed=reason=>({status:'unresolved',reason,observations:[],unassigned:[]});
export async function collectProspectReplyRecovery(token,context,{fetcher=fetch,ready=async()=>true}={}){
 if(collectGoogleReplyCandidates([],{...context,startHistoryId:'1'}).status!=='observed')return failed('invalid_context');
 const earliest=Math.min(...context.deliveries.map(x=>Date.parse(x.receipt.attemptedAt)));
 if(earliest<1000||earliest>Date.now())return failed('invalid_context');
 if(!await ready())return failed('review_changed');
 const baseline=await inspectGoogleReplyBaseline(token,context.accountEmail,{fetcher});
 if(baseline.status!=='observed')return failed(baseline.reason);
 if(!await ready())return failed('review_changed');
 const registry={...context,startHistoryId:baseline.nextHistoryId};
 const collection=await inspectGoogleReplyBackfill(token,registry,{fetcher});
 if(collection.status!=='collected')return failed(collection.reason);
 if(!await ready())return failed('review_changed');
 const changes=await collectGoogleReplyChanges(token,registry,{fetcher});
 const rows=new Map();
 for(const item of [...collection.observations,...collection.unassigned,...(changes.status==='observed'?[...changes.observations,...changes.unassigned]:[])]){
  const value={providerMessageId:item.providerMessageId,providerThreadId:item.providerThreadId,receivedAt:item.receivedAt,kind:item.kind,deliveryId:item.deliveryId||null,prospectId:item.prospectId||null};
  if(rows.has(value.providerMessageId)&&JSON.stringify(rows.get(value.providerMessageId))!==JSON.stringify(value))return failed('recovery_conflict');
  rows.set(value.providerMessageId,value);
 }
 const messages=[...rows.values()].sort((a,b)=>a.providerMessageId.localeCompare(b.providerMessageId));
 return {status:'collected',from:collection.from,startHistoryId:baseline.nextHistoryId,
  catchupHistoryId:changes.status==='observed'?changes.nextHistoryId:null,
  catchupStatus:changes.status==='observed'?'complete':'unresolved',
  reason:changes.status==='observed'?'recovery_collected':changes.reason,
  scope:{intervalFrom:collection.from,listingPages:collection.listingPages,listedCount:collection.listedCount,metadataProcessedCount:collection.metadataProcessedCount,enumerationComplete:collection.enumerationComplete?1:0,includeSpamTrash:collection.includeSpamTrash?1:0,maxMessages:collection.maxMessages,maxPages:collection.maxPages},
  messages,observations:messages.filter(x=>x.deliveryId).map(x=>({...x,match:'reply_chain'})),
  unassigned:messages.filter(x=>!x.deliveryId)};
}
