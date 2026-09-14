// Supplied Gmail MIME evidence only. Association is not report authentication.
// The caller owns current authority, the saved candidate and complete registry.
import {registeredReplyIdentities} from './prospect-reply-discovery.mjs';
import {parseProspectDeliveryStatus} from './prospect-delivery-status.mjs';
import {address,providerId,rfcId,readMessage} from './prospect-reply-observations.mjs';
const failed=reason=>({status:'unresolved',authenticity:'unverified',hold:true,reason,proposal:null});
const important=new Set(['message-id','from','to','cc','bcc','in-reply-to','references','content-type','content-transfer-encoding']);
const token="[!#$%&'*+.^_`|~0-9A-Za-z-]+";
function headers(values,budget){
 if(!Array.isArray(values)||values.length>64)throw Error();
 const result=new Map();
 for(const h of values){
  if(!h||typeof h.name!=='string'||! /^[a-zA-Z0-9-]{1,100}$/.test(h.name)||typeof h.value!=='string'||h.value.length>8192)throw Error();
  budget.left-=h.name.length+h.value.length;if(budget.left<0)throw Error();
  const name=h.name.toLowerCase(),value=h.value.replace(/\r?\n[ \t]+/g,' ').trim();
  if(/[^\x09\x20-\x7e]/.test(value)||important.has(name)&&result.has(name)||name.startsWith('resent-'))throw Error();
  result.set(name,value);
 }
 return result;
}
function contentType(value){
 if(typeof value!=='string')throw Error();
 const type=new RegExp('^('+token+'/'+token+')').exec(value);if(!type)throw Error();
 let rest=value.slice(type[0].length).trim();const params=new Map();
 const parameter=new RegExp('^;[ \\t]*('+token+')[ \\t]*=[ \\t]*(?:"([^"\\\\]*)"|('+token+'))');
 while(rest){const m=parameter.exec(rest);if(!m||params.has(m[1].toLowerCase()))throw Error();params.set(m[1].toLowerCase(),m[2]??m[3]);rest=rest.slice(m[0].length).trim();}
 return {type:type[1].toLowerCase(),params};
}
function tree(root){
 const budget={left:256*1024},seen=new Set(),info=new Map();let count=0;
 function walk(p,depth){
  if(!p||typeof p!=='object'||Array.isArray(p)||seen.has(p)||++count>16||depth>4)throw Error();seen.add(p);
  const hs=headers(p.headers,budget),ct=contentType(hs.get('content-type'));
  if(typeof p.mimeType!=='string'||p.mimeType.length>127||p.mimeType.toLowerCase()!==ct.type||p.filename!==undefined&&(typeof p.filename!=='string'||p.filename.length>256))throw Error();
  const b=p.body;if(!b||typeof b!=='object'||Array.isArray(b)||!Number.isSafeInteger(b.size)||b.size<0||b.size>256*1024)throw Error();
  if(b.data!==undefined){if(typeof b.data!=='string')throw Error();budget.left-=b.data.length;if(budget.left<0)throw Error();}
  if(b.attachmentId!==undefined&&!providerId(b.attachmentId))throw Error();
  if(p.parts!==undefined&&(!Array.isArray(p.parts)||p.parts.length>16))throw Error();
  const transfer=hs.get('content-transfer-encoding');if(transfer&&!['7bit','8bit','binary','base64','quoted-printable'].includes(transfer.toLowerCase()))throw Error();
  info.set(p,{...ct,headers:hs});for(const child of p.parts||[])walk(child,depth+1);
 }
 walk(root,1);return info;
}
function leaf(p){if(p.parts?.length)throw Error();}
function container(p){if(p.body.attachmentId!==undefined||p.body.data||p.body.size!==0)throw Error();}
function decode(p){
 leaf(p);const {data,size,attachmentId}=p.body;
 if(attachmentId!==undefined||typeof data!=='string'||size>65536||data.length>87384||! /^[A-Za-z0-9_-]*={0,2}$/.test(data))throw Error();
 const bare=data.replace(/=+$/,'');if(bare.length%4===1)throw Error();
 const binary=atob(bare.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-bare.length%4)%4));
 const canonical=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_');
 if(data!==canonical&&data!==canonical.replace(/=+$/,'')||binary.length!==size)throw Error();
 return binary;
}
function originalHeaders(text,full){
 let value=text;
 if(full){const end=/\r?\n\r?\n/.exec(value);if(!end)throw Error();value=value.slice(0,end.index);}
 else {value=value.replace(/(?:\r?\n)+$/,'');if(/\r?\n\r?\n/.test(value))throw Error();}
 if(!value.length||value.length>16384||/[^\x09\x0a\x0d\x20-\x7e]/.test(value)||/\r(?!\n)/.test(value))throw Error();
 const result=[];let current;
 for(const line of value.replaceAll('\r\n','\n').split('\n')){
  if(line.length>998)throw Error();
  if(/^[ \t]/.test(line)){if(!current)throw Error();current.value+=line;}
  else {const match=/^([a-zA-Z0-9-]{1,100}):(.*)$/.exec(line);if(!match||result.length>=64)throw Error();current={name:match[1],value:match[2]};result.push(current);}
  if(current.value.length>8192)throw Error();
 }
 return headers(result,{left:16384});
}
function human(p,info){
 const {type,params}=info.get(p);
 if([...params.keys()].some(k=>!['charset','boundary'].includes(k)))throw Error();
 if(['text/plain','text/html'].includes(type)){leaf(p);return;}
 if(type!=='multipart/alternative'||!p.parts?.length)throw Error();container(p);for(const child of p.parts)human(child,info);
}
function extract(root,info){
 const {type,params}=info.get(root);
 if(type!=='multipart/report'||params.size!==2||params.get('report-type')?.toLowerCase()!=='delivery-status'
   ||! /^[0-9A-Za-z'()+_,\-./:=? ]{1,70}$/.test(params.get('boundary')||'')||params.get('boundary').endsWith(' ')||root.parts?.length!==3)throw Error();
 container(root);const [description,status,original]=root.parts;human(description,info);
 const s=info.get(status),o=info.get(original);
 if(s.type!=='message/delivery-status'||s.params.size||!['text/rfc822-headers','message/rfc822'].includes(o.type)||o.params.size)throw Error();
 const report=parseProspectDeliveryStatus(decode(status));if(report.status!=='parsed')throw Error();
 return {report,original:originalHeaders(decode(original),o.type==='message/rfc822')};
}
export function deliveryReportContext(context){
 const roots=registeredReplyIdentities(context),candidate=context?.candidate;
 if(!roots||!candidate||candidate.workspaceId!==context.workspaceId||candidate.accountEmail!==context.accountEmail
  ||!providerId(candidate.providerMessageId)||!providerId(candidate.providerThreadId)
  ||!['delivery_report','needs_review'].includes(candidate.kind)||typeof candidate.receivedAt!=='string'
  ||!Number.isFinite(Date.parse(candidate.receivedAt))||new Date(candidate.receivedAt).toISOString()!==candidate.receivedAt
  ||roots.byProvider.has(candidate.providerMessageId))return null;
 return {roots,candidate};
}
export function associateGoogleDeliveryReport(message,context){
 const expected=deliveryReportContext(context);if(!expected)return failed('invalid_context');
 const {roots,candidate}=expected;
 try{
  if(message?.id!==candidate.providerMessageId||message.threadId!==candidate.providerThreadId||roots.byProvider.has(message.id))return failed('invalid_message');
  const info=tree(message.payload),outer=readMessage(message,message.threadId);
  if(outer.receivedAt!==candidate.receivedAt||outer.labels.includes('SENT')||outer.labels.includes('DRAFT')||!outer.rfcMessageId||roots.byRfc.has(outer.rfcMessageId)||!outer.parents||!outer.from)return failed('invalid_message');
  const {report,original}=extract(message.payload,info),id=original.get('message-id');
  const entry=rfcId(id)&&roots.byRfc.get(id);if(!entry)return failed('unmatched_original');
  const {receipt,snapshot}=entry,sender=snapshot.sender.email,recipient=snapshot.draft.recipient;
  if(address(original.get('from'))!==sender||address(original.get('to'))!==recipient||original.has('cc')||original.has('bcc')
   ||outer.date<Date.parse(receipt.attemptedAt)||[sender,roots.accountEmail].includes(outer.from)
   ||![sender,roots.accountEmail].includes(address(outer.headers.get('to'))))return failed('conflicting_evidence');
  if(outer.parents.some(parent=>roots.byRfc.has(parent)&&roots.byRfc.get(parent)!==entry))return failed('conflicting_evidence');
  if(report.recipients.length!==1||report.recipients[0].finalRecipient!==recipient||report.recipients[0].originalRecipient!==null&&report.recipients[0].originalRecipient!==recipient)return failed('recipient_mismatch');
  const {action,statusCode}=report.recipients[0];
  return {status:'associated',authenticity:'unverified',hold:true,proposal:{deliveryId:receipt.id,prospectId:receipt.prospectId,
   providerMessageId:message.id,providerThreadId:message.threadId,receivedAt:outer.receivedAt,kind:'delivery_report',match:'returned_message',action,statusCode}};
 }catch{return failed('invalid_report');}
}
