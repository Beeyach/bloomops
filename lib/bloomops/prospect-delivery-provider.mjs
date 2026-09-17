import {buildMime,encodeMime} from '../gmail-send.mjs';
import {normalizeSender,normalizeOutreach} from './prospect-outreach-values.mjs';
const API='https://gmail.googleapis.com/gmail/v1/users/me/messages';
const providerId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v);
const messageId=v=>typeof v==='string'&&/^<bloomsi-[0-9a-f-]{36}@bloomsi\.invalid>$/.test(v);
export function deliveryMime(receipt,snapshot){
 if(!/^[0-9a-f-]{36}$/.test(receipt.id)||!messageId(receipt.messageId)||normalizeSender({provider:snapshot.sender?.provider,email:snapshot.sender?.email,displayName:snapshot.sender?.displayName??null}).invalid||normalizeOutreach(snapshot.draft).invalid)throw new Error('Invalid approved message.');
 return 'Message-ID: '+receipt.messageId+'\r\n'+buildMime({from:snapshot.sender.email,fromName:snapshot.sender.displayName,to:snapshot.draft.recipient,subject:snapshot.draft.subject,body:snapshot.draft.intro,boundary:'=_bloomsi_'+receipt.id});
}
async function request(fetcher,url,token,options={}){
 const response=await fetcher(url,{...options,headers:{authorization:'Bearer '+token,'content-type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok){try{await response.body?.cancel();}catch{}throw new Error('Provider unavailable.');}
 const reader=response.body?.getReader();if(!reader)throw new Error('Missing response.');const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error('Response too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
// No automatic retry, including 4xx: only positive provider evidence can resolve
// a submitted receipt. Arbitrary provider errors never leave this module.
export async function submitGoogleIntroduction(accessToken,mime,{fetcher=fetch}={}){
 try{const r=await request(fetcher,API+'/send',accessToken,{method:'POST',body:JSON.stringify({raw:encodeMime(mime)})});return providerId(r?.id)&&providerId(r?.threadId)?{accepted:true,messageId:r.id,threadId:r.threadId}:{uncertain:true};}catch{return {uncertain:true};}
}
export function followupMime(attempt,snapshot,identity){
 const body=attempt.messageNumber===2?snapshot.draft.followUp2:attempt.messageNumber===3?snapshot.draft.followUp3:null;
 if(!/^[0-9a-f-]{36}$/.test(attempt.id)||!messageId(attempt.messageId)||!body||!providerId(identity?.providerThreadId)||!/^<[^\r\n<>]+@[^\r\n<>]+>$/.test(identity?.rfcMessageId||'')||normalizeSender({provider:snapshot.sender?.provider,email:snapshot.sender?.email,displayName:snapshot.sender?.displayName??null}).invalid||normalizeOutreach(snapshot.draft).invalid)throw new Error('Invalid approved follow-up.');
 return 'Message-ID: '+attempt.messageId+'\r\n'+buildMime({from:snapshot.sender.email,fromName:snapshot.sender.displayName,to:snapshot.draft.recipient,subject:'Re: '+snapshot.draft.subject,body,inReplyTo:identity.rfcMessageId,references:identity.rfcMessageId,boundary:'=_bloomsi_'+attempt.id});
}
export async function submitGoogleFollowup(accessToken,mime,threadId,{fetcher=fetch}={}){
 if(!providerId(threadId))return {uncertain:true};
 try{const r=await request(fetcher,API+'/send',accessToken,{method:'POST',body:JSON.stringify({raw:encodeMime(mime),threadId})});return providerId(r?.id)&&r?.threadId===threadId?{accepted:true,messageId:r.id,threadId:r.threadId}:{uncertain:true};}catch{return {uncertain:true};}
}
const singleAddress=value=>{
 if(typeof value!=='string'||/[\r\n]/.test(value))return null;
 const match=value.trim().match(/^(?:[^<>]*<)?([^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+)>?$/);
 return match?.[1].toLowerCase()||null;
};
export async function findGoogleIntroduction(accessToken,receipt,snapshot,{fetcher=fetch}={}){
 if(!messageId(receipt.messageId))return {uncertain:true};
 try{
  const query=new URLSearchParams({q:'rfc822msgid:'+receipt.messageId,labelIds:'SENT',maxResults:'2',fields:'messages(id,threadId),nextPageToken'});
  const list=await request(fetcher,API+'?'+query,accessToken);
  if(list.nextPageToken||!Array.isArray(list.messages)||list.messages.length!==1||!providerId(list.messages[0]?.id))return {uncertain:true};
  const queryMeta=new URLSearchParams({format:'metadata',fields:'id,threadId,labelIds,payload/headers'});for(const h of ['Message-ID','From','To','Subject'])queryMeta.append('metadataHeaders',h);
  const r=await request(fetcher,API+'/'+encodeURIComponent(list.messages[0].id)+'?'+queryMeta,accessToken),headers=r?.payload?.headers;
  if(!providerId(r?.id)||!providerId(r?.threadId)||r.id!==list.messages[0].id||!r.labelIds?.includes('SENT')||!Array.isArray(headers))return {uncertain:true};
  const header=name=>{const matches=headers.filter(h=>typeof h?.name==='string'&&h.name.toLowerCase()===name);return matches.length===1?matches[0].value:null;};
  // Subject can be RFC2047 encoded by Gmail. Compare against both the reviewed
  // text and our exact MIME header; unknown transformations remain unresolved.
  const encodedSubject=deliveryMime(receipt,snapshot).match(/^Subject: (.*)$/m)?.[1].replace(/\r$/,'');
  if(header('message-id')?.trim()!==receipt.messageId||singleAddress(header('from'))!==snapshot.sender.email||singleAddress(header('to'))!==snapshot.draft.recipient||![snapshot.draft.subject,encodedSubject].includes(header('subject')))return {uncertain:true};
  return {accepted:true,messageId:r.id,threadId:r.threadId};
 }catch{return {uncertain:true};}
}
export async function findGoogleFollowup(accessToken,attempt,snapshot,identity,{fetcher=fetch}={}){
 if(!messageId(attempt.messageId)||!providerId(identity?.providerThreadId))return {uncertain:true};
 try{
  const query=new URLSearchParams({q:'rfc822msgid:'+attempt.messageId,labelIds:'SENT',maxResults:'2',fields:'messages(id,threadId),nextPageToken'}),list=await request(fetcher,API+'?'+query,accessToken);
  if(list.nextPageToken||!Array.isArray(list.messages)||list.messages.length!==1||list.messages[0]?.threadId!==identity.providerThreadId||!providerId(list.messages[0]?.id))return {uncertain:true};
  const meta=new URLSearchParams({format:'metadata',fields:'id,threadId,labelIds,payload/headers'});for(const h of ['Message-ID','From','To','In-Reply-To','References'])meta.append('metadataHeaders',h);
  const r=await request(fetcher,API+'/'+encodeURIComponent(list.messages[0].id)+'?'+meta,accessToken),headers=r?.payload?.headers;
  if(!providerId(r?.id)||r.threadId!==identity.providerThreadId||!r.labelIds?.includes('SENT')||!Array.isArray(headers))return {uncertain:true};
  const header=name=>{const rows=headers.filter(h=>typeof h?.name==='string'&&h.name.toLowerCase()===name);return rows.length===1?rows[0].value:null;};
  if(header('message-id')?.trim()!==attempt.messageId||singleAddress(header('from'))!==snapshot.sender.email||singleAddress(header('to'))!==snapshot.draft.recipient||header('in-reply-to')?.trim()!==identity.rfcMessageId||!header('references')?.split(/\s+/).includes(identity.rfcMessageId))return {uncertain:true};
  return {accepted:true,messageId:r.id,threadId:r.threadId};
 }catch{return {uncertain:true};}
}
