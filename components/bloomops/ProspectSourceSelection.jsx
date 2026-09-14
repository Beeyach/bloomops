'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Status} from './Primitives';
import {ELIGIBILITY,REASONS} from '@/lib/bloomops/prospect-eligibility.mjs';
export default function ProspectSourceSelection({source,rows}){
 const [ready,setReady]=useState(false),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState(null);
 const urls=useRef([]),all=useRef(null),eligible=rows.filter(row=>row.status==='ready').map(row=>row.id);
 useEffect(()=>{setReady(true);return()=>urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
 useEffect(()=>{if(all.current)all.current.indeterminate=selected.length>0&&selected.length<eligible.length;},[selected.length,eligible.length]);
 const select=(id,checked)=>{setFeedback(null);setSelected(ids=>checked?[...ids,id]:ids.filter(value=>value!==id));};
 async function download(){
  if(busy||!selected.length)return;setBusy(true);setFeedback(null);
  try{
   const response=await fetch('/api/bloomops/prospecting/source-export',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source,ids:selected})});
   if(!response.ok){
    const result=await response.json().catch(()=>({}));
    setFeedback({error:true,message:response.status===409?'Some selected records are no longer eligible. No file was downloaded.':response.status===503?'Source history could not be checked. No file was downloaded. Try again.':response.status===403||response.status===404||response.status===401?'Access is no longer available. No file was downloaded.':'The download could not be prepared. Try again.',rejections:result.rejections||[]});return;
   }
   const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');urls.current.push(url);
   link.href=url;link.download='bloomops-raw-prospects.json';document.body.appendChild(link);link.click();link.remove();
   setFeedback({message:`Download started for ${selected.length} ${selected.length===1?'record':'records'}. Nothing was imported.`});
  }catch{setFeedback({error:true,message:'The download could not be prepared. Check your connection and try again.'});}
  finally{setBusy(false);}
 }
 return <>
  <div className="bo-source-export">
   <div><label className="bo-source-select-all"><input ref={all} type="checkbox" checked={eligible.length>0&&selected.length===eligible.length} disabled={!ready||busy||!eligible.length} onChange={e=>{setSelected(e.target.checked?eligible:[]);setFeedback(null);}}/>Select eligible on this page</label><p className="bo-hint" aria-live="polite">{selected.length} selected. Changing pages clears the selection.</p></div>
   <Button variant="primary" icon="download" loading={busy} disabled={!ready||busy||!selected.length} onClick={download}>{busy?'Checking eligibility…':'Download selected'}</Button>
  </div>
  <details className="bo-prospect-evidence bo-source-export-fields"><summary>Included in the download</summary><p>Business and person names, website, public email, niche, country and source label, with source workspace and record IDs. History is checked again before download. Old audits, messages and schedules are excluded.</p></details>
  {feedback&&<div className="bo-prospect-notice" role={feedback.error?'alert':'status'}><p>{feedback.message}</p>{feedback.rejections?.length>0&&<ul>{feedback.rejections.map(rejection=><li key={rejection.id}><strong>{rows.find(row=>row.id===rejection.id)?.businessName||'Selected record'}:</strong> {rejection.reasons.map(reason=>REASONS[reason]||'The source record is unavailable.').join(' ')}</li>)}</ul>}{feedback.error&&<Button variant="ghost" onClick={()=>window.location.reload()}>Reload source records</Button>}</div>}
  <ul className="bo-source-rows" aria-label="Source prospects">{rows.map(row=><li key={row.id}>
   <div className="bo-source-row-head"><div className="bo-source-row-identity"><label className="bo-source-select"><input type="checkbox" aria-label={`Select ${row.businessName||'source record '+row.id}`} checked={selected.includes(row.id)} disabled={!ready||busy||row.status!=='ready'} onChange={e=>select(row.id,e.target.checked)}/></label><div><h3>{row.businessName||'Business name not recorded'}</h3>{row.personName&&<p>{row.personName}</p>}</div></div><Status label={ELIGIBILITY[row.status]} tone={row.status==='ready'?'success':row.status==='review'?'warning':'neutral'}/></div>
   {row.reasons.length>0&&<ul className="bo-source-reasons">{row.reasons.map(reason=><li key={reason}>{REASONS[reason]}</li>)}</ul>}
   <details className="bo-prospect-evidence"><summary>Raw identity fields</summary><dl className="bo-prospect-facts">{[['Website',row.website],['Public email',row.publicEmail],['Niche',row.niche],['Country',row.country],['Source',row.source],['Source record',String(row.id)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not recorded'}</dd></div>)}</dl></details>
  </li>)}</ul>
 </>;
}
