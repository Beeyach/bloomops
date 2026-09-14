// Conservative RFC3464 ASCII field parser, not message attribution or a bounce verdict.
// Input must already be the decoded message/delivery-status part, never raw MIME.
import {address} from './prospect-reply-observations.mjs';
const messageFields=new Set(['reporting-mta','original-envelope-id','dsn-gateway','received-from-mta','arrival-date']);
const recipientFields=new Set(['original-recipient','final-recipient','action','status','remote-mta','diagnostic-code','last-attempt-date','final-log-id','will-retry-until']);
const actions=new Set(['failed','delayed','delivered','relayed','expanded']);
const dnsName=value=>typeof value==='string'&&value.length<=253&&value.replace(/\.$/,'').split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
const unresolved=()=>({status:'unresolved',recipients:[]});
function fields(block,forbidden){
 const result=new Map();let current;
 for(const line of block.split('\n')){
  if(line.length>998)throw Error();
  if(/^[ \t]/.test(line)){
   if(!current)throw Error();
   const value=result.get(current)+line;if(value.length>8192)throw Error();result.set(current,value);continue;
  }
  const match=/^([A-Za-z0-9-]+):(.*)$/.exec(line);if(!match)throw Error();
  current=match[1].toLowerCase();const value=match[2];
  if(value.length>8192||result.has(current)||forbidden.has(current)||result.size>=64)throw Error();
  result.set(current,value);
 }
 for(const [name,raw] of result){const value=raw.replace(/[ \t]+/g,' ').trim();if(!value)throw Error();result.set(name,value);}
 return result;
}
function recipient(value){
 const match=typeof value==='string'&&/^rfc822\s*;\s*([^\s<>()",;]+)$/i.exec(value);
 const email=match&&address(match[1]);if(!email)throw Error();
 const [local,domain]=email.split('@');if(local.length>64||local.split('.').some(x=>!x)||!dnsName(domain))throw Error();return email;
}
function mta(value){const match=/^dns\s*;\s*(\S+)$/i.exec(value||'');return Boolean(match&&dnsName(match[1]));}
// Deliberate numeric-zone date subset; unsupported comments/named zones stay unresolved.
function date(value){
 const match=/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2})(?::(\d{2}))? ([+-])(\d{2})(\d{2})$/i.exec(value);
 if(!match)return false;
 const [,dayName,day,month,year,hour,minute,second='0',,zoneHour,zoneMinute]=match;
 const monthIndex='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ').indexOf(month.toLowerCase());
 if(+year<1900||+hour>23||+minute>59||+second>59||+zoneHour>23||+zoneMinute>59)return false;
 const result=new Date(Date.UTC(+year,monthIndex,+day,+hour,+minute,+second));
 return result.getUTCFullYear()===+year&&result.getUTCMonth()===monthIndex&&result.getUTCDate()===+day&&(!dayName||['sun','mon','tue','wed','thu','fri','sat'][result.getUTCDay()]===dayName.toLowerCase());
}
function optionalFields(values){
 for(const [name,value] of values){
  if(['dsn-gateway','received-from-mta','remote-mta'].includes(name)&&!mta(value))throw Error();
  if(['arrival-date','last-attempt-date','will-retry-until'].includes(name)&&!date(value))throw Error();
  if(name==='diagnostic-code'&&!/^smtp\s*;\s*\S.*$/i.test(value))throw Error();
 }
 // Original-Envelope-Id and Final-Log-Id are bounded opaque text, never identities.
}
export function parseProspectDeliveryStatus(text){
 if(typeof text!=='string'||!text.length||text.length>65536||/[^\x09\x0a\x0d\x20-\x7e]/.test(text)||/\r(?!\n)/.test(text))return unresolved();
 try{
  const blocks=text.replaceAll('\r\n','\n').replace(/\n+$/,'').split('\n\n');
  if(blocks.length<2||blocks.length>21||blocks.some(x=>!x))return unresolved();
  const report=fields(blocks[0],recipientFields);
  // Other MTA/address syntaxes need a separately supported parser.
  if(!mta(report.get('reporting-mta')))return unresolved();
  optionalFields(report);
  const seen=new Set(),recipients=[];
  for(const block of blocks.slice(1)){
   const values=fields(block,messageFields);optionalFields(values);
   const finalRecipient=recipient(values.get('final-recipient'));
   const originalRecipient=values.has('original-recipient')?recipient(values.get('original-recipient')):null;
   const action=values.get('action')?.toLowerCase(),statusCode=values.get('status');
   if(!actions.has(action)||! /^[245]\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/.test(statusCode||'')||seen.has(finalRecipient))return unresolved();
   seen.add(finalRecipient);recipients.push({finalRecipient,originalRecipient,action,statusCode});
  }
  // These are untrusted reported fields; no address-only association is allowed.
  return {status:'parsed',recipients};
 }catch{return unresolved();}
}
