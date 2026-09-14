'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status} from './Primitives';
import ProspectSkillResultDocument from './ProspectSkillResultDocument';
const LIMIT=512*1024;
export default function ProspectSkillResultReview({prospect}){
 const [text,setText]=useState(''),[preview,setPreview]=useState(null),[choices,setChoices]=useState({}),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(''),[details,setDetails]=useState([]),[saved,setSaved]=useState(null);
 const pending=useRef(false),notice=useRef(null),heading=useRef(null),request=useRef(null);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(error||saved)notice.current?.focus();else if(preview)heading.current?.focus();},[error,saved,preview]);
 const reset=()=>{setPreview(null);setChoices({});setError('');setDetails([]);setSaved(null);request.current=null;};
 async function file(e){if(!ready||pending.current)return;const chosen=e.target.files?.[0];if(!chosen)return;reset();setText('');if(chosen.size>LIMIT){setError('Use a result smaller than 512 KiB.');e.target.value='';return;}pending.current=true;setBusy(true);try{setText(await chosen.text());}catch{setError('The file could not be read. Choose it again.');}finally{pending.current=false;setBusy(false);e.target.value='';}}
 async function submit(apply=false){
  if(!ready||pending.current)return;pending.current=true;setBusy(true);setError('');setDetails([]);
  try{
   let document;if(apply){document=preview.document;}else{if(new TextEncoder().encode(text).byteLength>LIMIT)throw new Error('Use a result smaller than 512 KiB.');try{document=JSON.parse(text);}catch{throw new Error('Paste valid JSON or choose a JSON result file.');}}
   const data={workspaceId:prospect.workspaceId,prospectId:prospect.id,document};
   if(apply){request.current ||= crypto.randomUUID();Object.assign(data,{requestId:request.current,expectedRevision:preview.revision,previewHash:preview.previewHash,choices});}
   const response=await fetch('/api/bloomops/prospecting/'+(apply?'result-apply':'result-preview'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),result=await response.json();
   if(!response.ok){if(response.status===409){setPreview(null);setChoices({});request.current=null;}setDetails(result.errors||[]);throw new Error(result.error||(response.status===404||response.status===403?'This prospect is no longer available. Return to prospects.':'The result could not be reviewed. Try again.'));}
   if(apply){setSaved(result);setPreview(null);}else{setPreview(result);setChoices(Object.fromEntries(result.changes.map(c=>[c.key,'keep'])));request.current=null;}
  }catch(e){setError(e instanceof TypeError?'Check your connection and retry.':e.message);}finally{pending.current=false;setBusy(false);}
 }
 return <div className="bo-result-review">
 {error&&<div ref={notice} tabIndex={-1} role="alert" className="bo-skill-notice"><p>{error}</p>{details.length>0&&<ul>{details.map((s,i)=><li key={i}>{s}</li>)}</ul>}</div>}
 {saved?<div ref={notice} tabIndex={-1} role="status" className="bo-skill-notice"><h2>{saved.unchanged?'Result already saved':'Result saved'}</h2><p>The full report and your field choices are recorded.</p><Button href={`/prospecting/${prospect.id}/results/${saved.resultId}`} variant="primary">View saved result</Button><Button href={'/prospecting/'+prospect.id} variant="ghost">View profile</Button></div>:<>
 {!preview?<div className="bo-result-input"><Field id="result-file" label="Choose a result file" hint="JSON, up to 512 KiB"><input id="result-file" type="file" accept=".json,application/json" className="bo-control" disabled={!ready||busy} onChange={file}/></Field><Field id="result-json" label="Or paste the result"><textarea id="result-json" className="bo-control" rows={10} value={text} disabled={!ready||busy} onChange={e=>{reset();setText(e.target.value);}}/></Field><Button icon="eye" variant="primary" disabled={!ready||busy||!text.trim()} loading={busy} onClick={()=>submit()}>Preview result</Button></div>:<>
 <div ref={heading} tabIndex={-1} className="bo-result-preview-heading"><h2>Review proposed changes</h2><Status tone={preview.document.status==='ready'?'neutral':'warning'} label={preview.document.status==='ready'?'Reported ready':'Needs review'}/><p>Review the evidence before choosing a value. Saving does not verify a claim.</p></div>
 {preview.stale&&<div className="bo-skill-notice" role="note"><strong>This result uses an older profile.</strong><p>Changes may include newer manual edits. Review every proposed value against what is saved now.</p></div>}
 <div className="bo-result-changes">{preview.changes.map(c=><fieldset key={c.key} className="bo-result-change"><legend>{c.label}</legend><div className="bo-result-compare"><div><h3>Current value</h3><p className="bo-result-prose">{c.current??'Unknown'}</p></div><div><h3>Result suggests</h3><p className="bo-result-prose">{c.proposed??'Clear this value'}</p></div></div><div className="bo-result-choices">{[['keep','Keep current'],['apply','Use result']].map(([value,label])=><label key={value}><input type="radio" name={'choice-'+c.key} value={value} checked={choices[c.key]===value} disabled={busy} onChange={()=>{setChoices(v=>({...v,[c.key]:value}));request.current=null;}}/>{label}</label>)}</div></fieldset>)}</div>
 {!preview.changes.length&&<p>No different profile fields were proposed. You can still save the report and suggestions.</p>}
 <ProspectSkillResultDocument document={preview.document}/>
 <div className="bo-result-save"><p>{Object.values(choices).filter(v=>v==='apply').length} profile fields selected. The full report and suggestions will also be saved.</p><div className="bo-result-buttons"><Button variant="primary" icon="check" disabled={busy} loading={busy} onClick={()=>submit(true)}>Save reviewed result</Button><Button disabled={busy} onClick={()=>{setPreview(null);request.current=null;}}>Change result</Button></div></div>
 </>}
 </>}
 </div>;
}
