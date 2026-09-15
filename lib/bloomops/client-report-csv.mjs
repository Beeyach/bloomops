import {reportTemplate,reportInput} from './client-report-values.mjs';

export const REPORT_CSV_FIELDS=['text_encoding','template_id','template_version','period_start','period_end','timezone','channel','account','scope','metric_key','unit','state','value','source_note','collected_at'];
const empty=()=>({state:'missing',value:null,sourceNote:'',collectedAt:null,sourceKind:'manual',importId:null});
const context=r=>[r.templateId,String(r.templateVersion),r.periodStart,r.periodEnd,r.timezone,r.channel,r.accountLabel.trim(),r.scopeLabel.trim()];
const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
export function reportCsv(report){
 const template=reportTemplate(report.templateId,report.templateVersion);if(!template)throw Error('Unsupported template version.');
 return [REPORT_CSV_FIELDS,...template.metrics.map(m=>{const v=report.metrics[m.key]||empty();return ['apostrophe-v1',...context(report),m.key,'count',v.state,v.value??'',v.sourceNote,v.collectedAt??''].map((v,i)=>i?"'"+v:v);})].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
function cells(text,maxRows){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>65536)throw Error('Choose a CSV of 64 KiB or less.');
 const rows=[];let row=[],value='',quoted=false,ended=false;
 const cell=()=>{row.push(value);value='';ended=false;};
 const line=()=>{cell();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>maxRows+1)throw Error('Use at most one row per metric.');};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else {quoted=false;ended=true;}}else value+=c;}else if(c==='"'){if(value||ended)throw Error('Invalid CSV quotation.');quoted=true;}else if(c===',')cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}else{if(ended)throw Error('Unexpected text after a quoted CSV field.');value+=c;}}
 if(quoted)throw Error('Unclosed CSV quotation.');if(value||row.length||ended)line();if(rows.length<2)throw Error('Include headings and at least one metric row.');return rows;
}
const same=(a,b)=>['state','value','sourceNote','collectedAt'].every(k=>a[k]===b[k]);
export function reviewReportCsv(text,report){
 const template=reportTemplate(report.templateId,report.templateVersion);if(!template)throw Error('Unsupported template version.');
 const rows=cells(text,template.metrics.length),headers=rows.shift();
 if(headers.length!==REPORT_CSV_FIELDS.length||new Set(headers).size!==headers.length||headers.some(h=>!REPORT_CSV_FIELDS.includes(h)))throw Error('Use the downloaded generic CSV headings. Unknown or duplicate columns are not supported.');
 const seen=new Set(),expected=context(report);
 return {mapping:headers,rows:rows.map((row,index)=>{
  if(row.length!==headers.length)throw Error(`Row ${index+2}: cell count does not match headings.`);
  const raw=Object.fromEntries(headers.map((h,i)=>[h,row[i]]));
  if(!['plain','apostrophe-v1'].includes(raw.text_encoding))throw Error('Unsupported text encoding.');
  if(raw.text_encoding==='apostrophe-v1')for(const h of headers.filter(h=>h!=='text_encoding')){if(!raw[h].startsWith("'"))throw Error('Encoded CSV cells require their leading apostrophe.');raw[h]=raw[h].slice(1);}
  if(['template_id','template_version','period_start','period_end','timezone','channel','account','scope'].some((h,i)=>raw[h]!==expected[i]))throw Error(`Row ${index+2}: template, period, timezone, account, channel and scope must match this report.`);
  const m=template.metrics.find(m=>m.key===raw.metric_key);if(!m||seen.has(m.key))throw Error('Unknown or duplicate metric.');seen.add(m.key);
  if(raw.unit!=='count')throw Error('Use count units for these template metrics.');
  if(raw.state==='value'?!/^(0|[1-9]\d*)$/.test(raw.value):raw.value!=='')throw Error('Counts must be whole nonnegative numbers; non-value states need a blank value.');
  const value={state:raw.state,value:raw.state==='value'?Number(raw.value):null,sourceNote:raw.source_note,collectedAt:raw.collected_at||null};
  const validated=reportInput({...Object.fromEntries(['title','periodStart','periodEnd','timezone','channel','accountLabel','scopeLabel','commentary'].map(k=>[k,report[k]])),metrics:{[m.key]:value}},template);
  if(!validated.value)throw Error(`Row ${index+2}: ${validated.error}`);
  const incoming=validated.value.metrics[m.key],current=report.metrics[m.key]||empty(),identical=same(incoming,current);
  return {key:m.key,label:m.label,current,incoming,identical,conflict:!identical&&(current.state!=='missing'||!!current.sourceNote||!!current.collectedAt)};
 })};
}
export function applyReportCsv(review,report,selected,importId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(importId))throw Error('Invalid import identity.');
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(key=>!review.rows.some(r=>r.key===key)))throw Error('Select valid import rows.');
 const metrics={...report.metrics};
 for(const row of review.rows.filter(r=>selected.includes(r.key))){if(!same(metrics[row.key]||empty(),row.current))throw Error('Report changed after review. Review the CSV again.');if(!row.identical)metrics[row.key]={...row.incoming,sourceKind:'csv',importId};}
 const next={...report,metrics};const validated=reportInput(Object.fromEntries(['title','periodStart','periodEnd','timezone','channel','accountLabel','scopeLabel','commentary','metrics'].map(k=>[k,next[k]])),reportTemplate(report.templateId,report.templateVersion));
 if(!validated.value)throw Error(validated.error);return validated.value.metrics;
}
