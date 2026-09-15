// N3A manual definitions: immutable version 1, never provider compatibility claims.
const metric = (key, label, definition) => Object.freeze({key, label, definition, unit:'count', max:1_000_000_000, required:false});
export const REPORT_TEMPLATES = Object.freeze([
 Object.freeze({id:'ghl_campaign',version:1,label:'GHL campaign report',channels:Object.freeze(['email','sms']),metrics:Object.freeze([
  metric('sent','Sent messages','Messages submitted in this account, channel, campaign and reporting period.'),
  metric('delivered','Delivered messages','The subset of submitted messages recorded as delivered.'),
  metric('failed','Failed messages','Source-recorded failures. Explain in the source note whether bounces are included.'),
  metric('clicked','Messages with clicks','Submitted messages with at least one click; not total click events or unique people.'),
  metric('replied','Messages with replies','Submitted messages with at least one reply.'),
  metric('opt_outs','Opt-outs','Source-recorded opt-out events in the scoped period; not inferred from replies.'),
 ])}),
 Object.freeze({id:'social',version:1,label:'Social media report',channels:Object.freeze(['facebook','instagram','linkedin','tiktok','youtube','other']),metrics:Object.freeze([
  metric('published','Published content','Posts/content published for this account, channel and period.'),
  metric('views','Views','Source-native views; explain the definition in the source note. Not reach.'),
  metric('reach','Reach','Source-native reach for the whole scope and period; never a sum of overlapping post reach.'),
  metric('interactions','Interactions','Source-native interactions; explain which actions are included in the source note.'),
  metric('link_clicks','Link clicks','Source-native click events; not unique people.'),
  metric('followers_start','Followers at period start','Same-account follower count at the beginning of the period.'),
  metric('followers_end','Followers at period end','Same-account follower count at the end of the period.'),
 ])}),
]);
export const reportTemplate=(id,version)=>REPORT_TEMPLATES.find(t=>t.id===id&&t.version===version)||null;
export const reportId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
export const exactKeys=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function reportDate(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'0100-01-01')return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}
const safeText=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(v)&&(!required||v.trim().length>0)&&v.isWellFormed();
export function reportInput(input,template){
 if(!template||!exactKeys(input,['title','periodStart','periodEnd','timezone','channel','accountLabel','scopeLabel','commentary','metrics']))return {error:'Unsupported report fields or template version.'};
 for(const [key,max,required] of [['title',180,true],['accountLabel',180,false],['scopeLabel',300,false],['commentary',8000,false]])if(!safeText(input[key],max,required))return {error:`Check ${key}.`};
 if(!reportDate(input.periodStart)||!reportDate(input.periodEnd)||input.periodStart>input.periodEnd)return {error:'Enter a valid start and end date in order.'};
 if(typeof input.timezone!=='string'||input.timezone.length>80)return {error:'Choose a valid timezone.'};
 try{new Intl.DateTimeFormat('en',{timeZone:input.timezone}).format();}catch{return {error:'Choose a valid timezone.'};}
 if(!template.channels.includes(input.channel))return {error:'Choose a channel supported by this template.'};
 if(!exactKeys(input.metrics,template.metrics.map(m=>m.key)))return {error:'Unsupported metric.'};
 const metrics={};
 for(const m of template.metrics){
  const v=input.metrics[m.key]??{state:'missing',value:null,sourceNote:'',collectedAt:null};
  if(!exactKeys(v,['state','value','sourceNote','collectedAt'])||!['value','missing','unavailable','not_tracked'].includes(v.state)||!safeText(v.sourceNote,1000)||
    (v.state==='value'? !Number.isSafeInteger(v.value)||v.value<0||v.value>m.max : v.value!==null)||
    (v.collectedAt!==null&&(typeof v.collectedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.collectedAt)||!Number.isFinite(Date.parse(v.collectedAt))||new Date(v.collectedAt).toISOString()!==v.collectedAt)))return {error:`Check ${m.label}, source note and collection time.`};
  metrics[m.key]={state:v.state,value:v.value,sourceNote:v.sourceNote.trim(),collectedAt:v.collectedAt};
 }
 if(template.id==='ghl_campaign'&&metrics.sent.state==='value'&&metrics.delivered.state==='value'&&metrics.delivered.value>metrics.sent.value)return {error:'Delivered messages cannot exceed sent messages in the same scope.'};
 return {value:{...input,title:input.title.trim(),accountLabel:input.accountLabel.trim(),scopeLabel:input.scopeLabel.trim(),commentary:input.commentary.trim(),metrics}};
}
export function reportCalculations(report){
 const value=key=>report.metrics[key]?.state==='value'?report.metrics[key].value:null;
 const context=!!report.accountLabel?.trim()&&!!report.scopeLabel?.trim();
 if(report.templateId==='ghl_campaign'){
  const sent=value('sent'),delivered=value('delivered');let display='Not available';
  if(context&&sent!==null&&sent>0&&delivered!==null&&delivered<=sent){const n=BigInt(delivered)*10000n,d=BigInt(sent);const hundredths=(n*2n+d)/(d*2n);display=`${hundredths/100n}.${String(hundredths%100n).padStart(2,'0')}%`;}
  return [{key:'delivery_rate',label:'Delivery rate',display,definition:'Delivered ÷ sent × 100. Rounded half up to two decimal places.'}];
 }
 const start=value('followers_start'),end=value('followers_end');return [{key:'follower_change',label:'Follower change',display:context&&start!==null&&end!==null?String(end-start):'Not available',definition:'Followers at period end minus followers at period start.'}];
}
