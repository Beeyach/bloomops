'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import {reportCsv,reviewReportCsv,applyReportCsv} from '@/lib/bloomops/client-report-csv.mjs';

export default function ClientReportCsv({report,disabled,onApply}){
 const [review,setReview]=useState(null),[selected,setSelected]=useState([]),[error,setError]=useState(''),[reading,setReading]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0),live=useRef(true),identity=JSON.stringify(report);
 useEffect(()=>{live.current=true;return()=>{live.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;setReview(null);setReading(false);},[identity,disabled]);
 const show=v=>`${v.state==='value'?v.value:v.state}${v.sourceNote?' — '+v.sourceNote:''}`;
 async function read(file){if(!file||disabled)return;const g=++generation.current;setReading(true);setReview(null);setError('');setMessage('');try{
  if(file.size>65536)throw Error('Choose a CSV of 64 KiB or less.');const text=await file.text();if(!live.current||g!==generation.current)return;
  const value=reviewReportCsv(text,report);setReview({...value,identity,importId:crypto.randomUUID()});setSelected(value.rows.filter(r=>!r.conflict&&!r.identical).map(r=>r.key));
 }catch(e){if(live.current&&g===generation.current)setError(e.message);}finally{if(live.current&&g===generation.current)setReading(false);}}
 function download(){try{const csv=reportCsv(report),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='bloomsi-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e.message);}}
 function apply(){try{if(review.identity!==identity)throw Error('Report changed. Review the CSV again.');onApply(applyReportCsv(review,report,selected,review.importId));setReview(null);setMessage('Selected CSV rows applied to the form. Save draft to persist them.');}catch(e){setError(e.message);}}
 return <section aria-label="Reviewed CSV import"><h2>Review a CSV import</h2><p>Use the generic template for this report. Review values and source notes before applying. Imported numbers remain unverified.</p>
 <Button type="button" onClick={download} disabled={disabled}>Download report CSV</Button>
 <label>Choose report CSV<input type="file" accept=".csv,text/csv" disabled={disabled||reading} onChange={e=>{read(e.target.files?.[0]);e.target.value='';}}/></label>
 {reading&&<p role="status">Reading CSV…</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 {review&&<><p>{report.periodStart} to {report.periodEnd}; {report.timezone}. Account: {report.accountLabel||'Not supplied'}. Channel: {report.channel}. Scope: {report.scopeLabel||'Not supplied'}.</p>
 <details><summary>CSV field mapping</summary><ul>{review.mapping.map(h=><li key={h}>{h} → {h.replaceAll('_',' ')}</li>)}</ul></details>
 {review.rows.map(row=><div className="bo-report-metric" key={row.key}><label><input type="checkbox" disabled={disabled||row.identical} checked={selected.includes(row.key)} onChange={e=>setSelected(s=>e.target.checked?[...s,row.key]:s.filter(k=>k!==row.key))}/>Import {row.label}</label><p>Current: {show(row.current)}</p><p>CSV: {show(row.incoming)}</p><p>{row.identical?'Unchanged — no replacement needed.':row.conflict?'Existing value or source will be replaced only if you select this row.':'New observation.'}</p><p>Unit: count. Collected: {row.incoming.collectedAt||'Not supplied'}.</p></div>)}
 <Button type="button" disabled={disabled||!selected.length} onClick={apply}>Apply selected CSV rows</Button><Button type="button" onClick={()=>setReview(null)}>Cancel import review</Button></>}
 </section>;
}
