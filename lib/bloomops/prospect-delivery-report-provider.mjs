// Provider-only foundation: no route, live enablement, persistence or verdict.
// The guarded caller owns current authority, the original account's token,
// saved candidate provenance and the complete accepted-delivery registry.
import {associateGoogleDeliveryReport,deliveryReportContext} from './prospect-delivery-report.mjs';
import {readGoogleReplyJson} from './prospect-reply-observations.mjs';
const unresolved=reason=>({status:'unresolved',authenticity:'unverified',hold:true,reason,proposal:null});

export async function inspectGoogleDeliveryReport(accessToken,context,{fetcher=fetch}={}){
 let snapshot;
 try{
  if(typeof accessToken!=='string'||!accessToken||accessToken.length>16384||/[\x00-\x20\x7f-\uffff]/.test(accessToken)
   ||!deliveryReportContext(context))return unresolved('invalid_context');
  // Do not let an asynchronous caller edit the identity being checked in flight.
  snapshot=structuredClone(context);
 }catch{return unresolved('invalid_context');}
 const signal=AbortSignal.timeout(15000);
 const query=new URLSearchParams({format:'full',fields:'id,threadId,labelIds,internalDate,payload'});
 const url='https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(snapshot.candidate.providerMessageId)+'?'+query;
 try{
  const response=await readGoogleReplyJson(fetcher,url,accessToken,{signal,maxBytes:256*1024});
  signal.throwIfAborted();
  if(response.status!==200)return unresolved('provider_unavailable');
  return associateGoogleDeliveryReport(response.data,snapshot);
 }catch{return unresolved('provider_unavailable');}
}
