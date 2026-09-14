'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status} from './Primitives';
import {IMPORT_FILE_LIMIT,IMPORT_FIELDS,IMPORT_MAPPING,IMPORT_STATUS,IMPORT_REASONS} from '@/lib/bloomops/prospect-import-values.mjs';
export default function ProspectImportPreview({workspaceId}){
 const [ready,setReady]=useState(false),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(null),output=useRef(null),documentRef=useRef(null),requestRef=useRef(null);
 const [receipt,setReceipt]=useState(null),[importing,setImporting]=useState(false);
 useEffect(()=>setReady(true),[]);
 useEffect(()=>{if(result||error||receipt)output.current?.focus();},[result,error,receipt]);
 async function preview(e){
  e.preventDefault();if(busy||!file)return;setBusy(true);setError(null);setResult(null);setReceipt(null);
  try{
   if(file.size>IMPORT_FILE_LIMIT){setError('Choose a JSON export of 1 MiB or less.');return;}
   let document;try{document=JSON.parse(await file.text());}catch{setError('This file is not valid JSON. Choose a Bloomsi raw export.');return;}
   const response=await fetch('/api/bloomops/prospecting/import-preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(document)});
   const data=await response.json().catch(()=>null);
   if(!response.ok){setError(response.status===403||response.status===404||response.status===401?'Access to this workspace or source is unavailable.':response.status===503?'Source history or duplicate checks are unavailable. Try again.':data?.error||'This export could not be checked. Try again.');return;}
   documentRef.current=document;requestRef.current=crypto.randomUUID();setResult(data);
  }catch{setError('The preview could not be loaded. Check your connection and try again.');}
  finally{setBusy(false);}
 }
 async function commit(){
  if(busy||!ready||!result?.counts.ready||!documentRef.current||!requestRef.current)return;
  setBusy(true);setImporting(true);setError(null);
  try{
   const response=await fetch('/api/bloomops/prospecting/import-commit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,requestId:requestRef.current,document:documentRef.current,previewHash:result.previewHash,selected:result.rows.filter(row=>row.status==='ready').map(row=>row.index)})});
   const data=await response.json().catch(()=>null);
   if(response.ok&&data?.receiptId){setReceipt(data);setResult(null);return;}
   if(response.status===409&&data?.preview){setResult(data.preview);requestRef.current=crypto.randomUUID();}
   setError(response.status===401||response.status===403||response.status===404?'Access to this workspace or source is unavailable. Check import history if a previous request lost its response.':data?.error||'The result could not be confirmed. Retry this request or check import history.');
  }catch{setError('The result could not be confirmed. Retry this request or check import history.');}
  finally{setBusy(false);setImporting(false);}
 }
 return <>
  <form className="bo-import-file" onSubmit={preview}><Field id="import-file" label="Raw prospect export" hint="JSON from Download selected. Up to 50 records and 1 MiB."><input id="import-file" aria-describedby="import-file-hint" className="bo-control" type="file" accept=".json,application/json" disabled={!ready||busy} onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null);setError(null);setReceipt(null);documentRef.current=null;requestRef.current=null;}}/></Field><Button type="submit" icon="eye" variant="primary" loading={busy} disabled={!ready||busy||!file}>{busy&&!importing?'Checking records…':'Preview import'}</Button></form>
  <details className="bo-prospect-evidence bo-import-mapping"><summary>Field mapping</summary><dl className="bo-prospect-facts">{Object.entries(IMPORT_MAPPING).map(([key,label])=><div key={key}><dt>{IMPORT_FIELDS[key]}</dt><dd>{label}</dd></div>)}</dl><p>Names and text are trimmed, website domains become complete URLs, and emails are lowercased. Unrecorded profile fields stay unknown. Source labels and IDs remain provenance.</p></details>
  {receipt&&<section ref={output} tabIndex={-1} className="bo-import-result" role="status"><h2>Import complete</h2><p>{receipt.unchanged?'This request was already completed. Its original receipt is ready.':'The ready prospects were added. Duplicates and rejected records were left out.'}</p><Button href={'/prospecting/import/receipts/'+receipt.receiptId} variant="primary" icon="check">View import receipt</Button></section>}
  {error&&<div ref={output} tabIndex={-1} className="bo-prospect-notice bo-import-result" role="alert">{error}</div>}
  {result&&<section ref={output} tabIndex={-1} className="bo-import-result" aria-labelledby="import-result-title">
   <div className="bo-source-summary"><h2 id="import-result-title">Import preview</h2><p>Nothing imported</p></div>
   <dl className="bo-source-counts" aria-label="Import preview counts">{[['selected','Selected'],['ready','Ready'],['duplicate','Possible duplicates'],['rejected','Rejected']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{result.counts[key]}</dd></div>)}</dl>
   <p className="bo-hint">Checked <time dateTime={result.asOf}>{new Date(result.asOf).toLocaleString()}</time>. Preview only; records and history stay unchanged.</p>
   {result.counts.ready>0&&<div className="bo-import-commit"><p>Import the {result.counts.ready} ready {result.counts.ready===1?'prospect':'prospects'} shown below. Duplicates and rejected records stay out. Nothing sends automatically.</p><Button variant="primary" icon="plus" disabled={!ready||busy} loading={importing} onClick={commit}>{importing?'Importing…':`Import ${result.counts.ready} ready ${result.counts.ready===1?'prospect':'prospects'}`}</Button></div>}
   <ul className="bo-source-rows" aria-label="Import records">{result.rows.map(row=><li key={row.index}>
    <div className="bo-source-row-head"><div><h3>{row.businessName||`Record ${row.index}`}</h3>{row.fields?.personName&&<p>{row.fields.personName}</p>}</div><Status label={IMPORT_STATUS[row.status]} tone={row.status==='ready'?'success':row.status==='duplicate'?'warning':'error'}/></div>
    {(row.reasons.length>0||row.errors.length>0)&&<ul className="bo-source-reasons">{[...row.reasons.map(reason=>IMPORT_REASONS[reason]),...row.errors].filter((text,i,all)=>text&&all.indexOf(text)===i).map(text=><li key={text}>{text}</li>)}</ul>}
    {row.reasons.some(reason=>reason.startsWith('destination_'))&&<Button href={'/prospecting?q='+encodeURIComponent(row.reasons.includes('destination_email')?row.fields.publicEmail:row.reasons.includes('destination_name')?row.fields.businessName:row.fields.website)} variant="ghost" icon="prospecting">Review existing prospects</Button>}
    <details className="bo-prospect-evidence"><summary>Mapped fields and source</summary><dl className="bo-prospect-facts">{[['Business name',row.fields?.businessName],['Person',row.fields?.personName],['Website',row.fields?.website],['Public email',row.fields?.publicEmail],['Niche',row.fields?.niche],['Location',row.fields?.location],['Source label',row.sourceLabel],['Source workspace',row.provenance?.sourceWorkspaceId],['Source record',row.provenance?.sourceRecordId]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'Not available'}</dd></div>)}</dl></details>
   </li>)}</ul>
   <details className="bo-prospect-evidence bo-import-mapping"><summary>How duplicate checks work</summary><p>Matching source IDs, emails, business names or exact website URLs flag possible duplicates in the file. Existing-workspace checks compare email, business name and exact website. These are review signals; nothing is merged or overwritten. Import rechecks current records and permissions before writing. Each completed import has a durable receipt.</p></details>
  </section>}
 </>;
}
