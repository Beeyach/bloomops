// Provider-only recovery proposals. No caller, persistence, cursor reset or send grant.
// Listing available mail is not a transactional historical-coverage guarantee.
import {collectGoogleReplyCandidates} from './prospect-reply-discovery.mjs';
import {providerId,REPLY_METADATA_HEADERS,readGoogleReplyJson} from './prospect-reply-observations.mjs';
const API='https://gmail.googleapis.com/gmail/v1/users/me/';
const unresolved=reason=>({status:'unresolved',hold:true,coverage:'unverified',reason,observations:[],unassigned:[],nextHistoryId:null});
const pageToken=value=>typeof value==='string'&&/^[\x20-\x7e]{1,2048}$/.test(value);
export async function inspectGoogleReplyBackfill(accessToken,context,{fetcher=fetch}={}){
 // Reuse the complete registry validation; an empty candidate set attributes nothing.
 if(collectGoogleReplyCandidates([],context).status!=='observed'||typeof accessToken!=='string'||!accessToken||accessToken.length>16384||/[\x00-\x20\x7f]/.test(accessToken))return unresolved('invalid_context');
 const earliest=Math.min(...context.deliveries.map(x=>Date.parse(x.receipt.attemptedAt)));
 if(earliest<1000||earliest>Date.now())return unresolved('invalid_context');
 const after=Math.floor(earliest/1000)-1;
 const signal=AbortSignal.timeout(15000),byteBudget={remaining:1024*1024};
 const read=(path,query)=>readGoogleReplyJson(fetcher,API+path+'?'+query,accessToken,{signal,byteBudget,maxBytes:64*1024});
 try{
  const listed=new Map(),tokens=new Set();let token,complete=false,listingPages=0;
  for(let page=0;page<3;page++){
   const query=new URLSearchParams({q:'after:'+after,includeSpamTrash:'true',maxResults:'40',fields:'messages(id,threadId),nextPageToken'});
   if(token)query.set('pageToken',token);
   const response=await read('messages',query);
   if(response.status!==200)return unresolved('provider_unavailable');
   const data=response.data;
   if(!data||typeof data!=='object'||Array.isArray(data)||data.messages!==undefined&&!Array.isArray(data.messages))return unresolved('invalid_listing');
   listingPages=page+1;
   for(const message of data.messages||[]){
    if(!providerId(message?.id)||!providerId(message.threadId)||listed.has(message.id)&&listed.get(message.id)!==message.threadId)return unresolved('invalid_listing');
    listed.set(message.id,message.threadId);
    if(listed.size>40)return unresolved('candidate_limit');
   }
   if(data.nextPageToken===undefined){complete=true;break;}
   if(!pageToken(data.nextPageToken)||tokens.has(data.nextPageToken))return unresolved('invalid_pagination');
   token=data.nextPageToken;tokens.add(token);
  }
  if(!complete)return unresolved('incomplete_listing');
  const messages=[];let metadataProcessedCount=0;
  for(const [id,threadId] of listed){
   const query=new URLSearchParams({format:'metadata',fields:'id,threadId,labelIds,internalDate,payload/headers'});
   for(const name of REPLY_METADATA_HEADERS)query.append('metadataHeaders',name);
   const response=await read('messages/'+encodeURIComponent(id),query);
   if(response.status!==200)return unresolved('message_unavailable');
   if(response.data?.id!==id||response.data.threadId!==threadId)return unresolved('message_identity_changed');
   messages.push(response.data);metadataProcessedCount++;
  }
  const result=collectGoogleReplyCandidates(messages,context);
  if(result.status!=='observed')return unresolved(result.reason);
  return {status:'collected',hold:true,coverage:'unverified',from:new Date(after*1000).toISOString(),
   enumerationComplete:true,listingPages,listedCount:listed.size,metadataProcessedCount,includeSpamTrash:true,maxMessages:40,maxPages:3,
   historyCaughtUp:false,observations:result.observations,unassigned:result.unassigned,nextHistoryId:null};
 }catch{return unresolved('provider_unavailable');}
}
