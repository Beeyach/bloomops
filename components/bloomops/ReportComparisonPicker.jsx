'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
export default function ReportComparisonPicker({report,scope,value,onChange,disabled,contextChanged}){
 const [options,setOptions]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0),live=useRef(true);
 async function load(page=1){const g=++generation.current;setBusy(true);setError('');try{const r=await fetch(`/api/bloomops/clients/${report.clientId}/reports/${report.id}/comparisons?page=${page}`,{cache:'no-store'}),body=await r.json();if(!live.current||g!==generation.current)return;if(!r.ok||body.scope?.userId!==scope.userId||body.scope?.workspaceId!==scope.workspaceId)throw Error('Could not load currently authorized comparison reports.');setOptions(body);}catch(e){if(live.current&&g===generation.current){setOptions(null);setError(e.message);}}finally{if(live.current&&g===generation.current)setBusy(false);}}
 useEffect(()=>{live.current=true;load();return()=>{live.current=false;generation.current++;};},[report.id,scope.userId,scope.workspaceId]);
 return <section aria-label="Previous-period comparison"><h2>Previous-period comparison</h2><p>Choose an earlier published version for the same account and scope. Both full calendar months or equal-duration custom periods are comparable. Selection is saved with the draft.</p>
 {contextChanged&&<p>Save period or account changes, then choose a compatible prior publication. Remove an old selection if it no longer matches.</p>}
 {report.comparisonUnavailable&&<p role="alert">The saved comparison is no longer available. Choose another publication or remove it and save.</p>}
 <label>Compare with previous published report<select value={value} disabled={disabled||busy||contextChanged} onChange={e=>onChange(e.target.value)}><option value="">No comparison</option>{value&&!options?.items.some(r=>r.id===value)&&<option value={value} disabled>Saved comparison — not in this list</option>}{options?.items.map(r=><option key={r.id} value={r.id}>{r.title} — {r.periodStart} to {r.periodEnd}, version {r.version}</option>)}</select></label>
 {value&&<Button variant="ghost" disabled={disabled} onClick={()=>onChange('')}>Remove comparison</Button>}
 {busy&&<p role="status">Loading compatible reports…</p>}{error&&<p role="alert">{error}</p>}
 {!busy&&options?.items.length===0&&<p>No compatible earlier publication is available for this saved period and scope.</p>}
 <div className="bo-form-actions">{error&&<Button variant="ghost" disabled={busy||disabled} onClick={()=>load()}>Retry comparison list</Button>}{options?.page>1&&<Button variant="ghost" disabled={busy||disabled} onClick={()=>load(options.page-1)}>Previous comparisons</Button>}{options?.more&&<Button variant="ghost" disabled={busy||disabled} onClick={()=>load(options.page+1)}>More comparisons</Button>}</div></section>;
}
