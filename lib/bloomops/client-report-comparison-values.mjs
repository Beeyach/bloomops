import {reportDate,reportTemplate} from './client-report-values.mjs';
const DAY=86400000;
export function reportingPeriod(start,end){
 if(!reportDate(start)||!reportDate(end)||start>end)return null;
 const first=new Date(start+'T00:00:00Z'),last=new Date(end+'T00:00:00Z');
 const next=new Date(last);next.setUTCDate(last.getUTCDate()+1);
 return {start,end,days:(last-first)/DAY+1,wholeMonth:first.getUTCDate()===1&&next.getUTCDate()===1&&start.slice(0,7)===end.slice(0,7)};
}
export function comparableReportSnapshot(report,snapshot){
 const template=reportTemplate(report.templateId,report.templateVersion),now=reportingPeriod(report.periodStart,report.periodEnd),prior=reportingPeriod(snapshot?.periodStart,snapshot?.periodEnd);
 if(!template||!now||!prior||prior.end>=now.start||!(now.wholeMonth&&prior.wholeMonth||now.days===prior.days))return false;
 for(const field of ['templateId','templateVersion','channel','accountLabel','scopeLabel','timezone'])if(!report[field]||report[field]!==snapshot[field])return false;
 return Array.isArray(snapshot.metrics)&&snapshot.metrics.length===template.metrics.length&&template.metrics.every(m=>{const value=snapshot.metrics.find(v=>v.key===m.key);return value?.unit===m.unit&&value.definition===m.definition&&['value','missing','unavailable','not_tracked'].includes(value.state)&&(value.state==='value'?Number.isSafeInteger(value.value)&&value.value>=0&&value.value<=m.max:value.value===null);});
}
export function reportComparison(report,entry){
 if(!comparableReportSnapshot(report,entry.snapshot))return null;
 const template=reportTemplate(report.templateId,report.templateVersion),previous=reportingPeriod(entry.snapshot.periodStart,entry.snapshot.periodEnd),current=reportingPeriod(report.periodStart,report.periodEnd);
 const metrics=template.metrics.map(m=>{const prior=entry.snapshot.metrics.find(v=>v.key===m.key),now=report.metrics[m.key];return {key:m.key,label:m.label,definition:m.definition,unit:m.unit,previous:{state:prior.state,value:prior.value},current:{state:now.state,value:now.value},difference:prior.state==='value'&&now.state==='value'?now.value-prior.value:null};});
 const preferred=template.id==='ghl_campaign'?['sent','delivered','clicked']:['published','views','interactions'];
 return {publicationId:entry.id,version:entry.sequence,snapshotHash:entry.snapshotHash,previous,current,
  periodKind:previous.wholeMonth&&current.wholeMonth?'Complete calendar months':'Equal-duration custom periods',
  metrics,chartKeys:preferred.filter(key=>metrics.find(m=>m.key===key).difference!==null),
  note:'Count differences are current minus previous. Values remain unverified. No growth percentage or cross-metric total is inferred.'};
}
