'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status} from './Primitives';
import ProspectSchedulePreview from './ProspectSchedulePreview';
import {OUTREACH_FIELDS} from '@/lib/bloomops/prospect-outreach-values.mjs';
const strings=values=>Object.fromEntries(Object.keys(OUTREACH_FIELDS).map(k=>[k,values[k]||'']));
export default function ProspectOutreachForm({initial}){
 const [data,setData]=useState(initial),[fields,setFields]=useState(()=>strings(initial.seed)),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
 const pending=useRef(false),notice=useRef(null);
 const dirty=!data.draft||Object.keys(OUTREACH_FIELDS).some(k=>fields[k]!== (data.draft[k]||''))||data.sourceResultId!==data.draft.sourceResultId;
 const stale=data.draft&&data.profile.revision!==data.draft.profileRevision;
 const approved=data.approved&&!dirty;
 const edited=Object.keys(OUTREACH_FIELDS).some(k=>fields[k]!== (data.seed[k]||''));
 useEffect(()=>{if(!edited)return;const leave=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[edited]);
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(message)notice.current?.focus();},[message]);
 const update=(k,v)=>{setFields(f=>({...f,[k]:v}));setReviewed(false);setMessage('');};
 async function submit(approve=false){
  if(!ready||pending.current)return;pending.current=true;setBusy(true);setMessage('');setError(false);
  try{
   const body={workspaceId:data.profile.workspaceId,prospectId:data.profile.id,expectedRevision:data.draft?.revision||0,expectedProfileRevision:data.profile.revision,expectedSenderRevision:data.sender?.revision||0};
   if(approve)body.reviewed=reviewed;else Object.assign(body,{fields,sourceResultId:data.sourceResultId});
   const response=await fetch('/api/bloomops/prospecting/'+(approve?'outreach-approve':'outreach'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),result=await response.json();
   if(!response.ok)throw new Error(result.error||'This draft is unavailable. Reload and try again.');
   const refreshed=await fetch('/api/bloomops/prospecting/outreach?prospectId='+encodeURIComponent(data.profile.id),{cache:'no-store'}),next=await refreshed.json();
   if(!refreshed.ok)throw new Error('The change was saved, but the latest draft could not be loaded. Copy your text and reload.');
   setData(next);setFields(strings(next.seed));setReviewed(false);
   window.history.replaceState(null,'','/prospecting/'+data.profile.id+'/outreach');
   setMessage(approve?'Content approved. Sending is still off.':'Draft saved. Nothing is sent or scheduled.');
  }catch(e){setError(true);setMessage(e instanceof TypeError?'Check your connection and retry. Your text is still here.':e.message+' Copy any unsaved changes before reloading.');}finally{pending.current=false;setBusy(false);}
 }
 const input=(key,rows)=>{const spec=OUTREACH_FIELDS[key],props={id:'outreach-'+key,className:'bo-control',value:fields[key],maxLength:spec.max,onChange:e=>update(key,e.target.value)};return <Field key={key} id={props.id} label={spec.label}>{rows?<textarea {...props} rows={rows}/>:<input {...props} type={spec.type||'text'}/>}</Field>;};
 return <div className="bo-outreach-form">
 <div className="bo-outreach-review-status"><Status tone={approved?'success':'neutral'} label={approved?'Content approved':dirty?'Unsaved changes':stale?'Profile changed':'Draft'}/><Status tone="warning" label="Sending off"/></div>
 {message&&<p ref={notice} tabIndex={-1} role={error?'alert':'status'} className="bo-skill-notice">{message}</p>}
 {data.selectedResult&&<div className="bo-outreach-source"><p>Follow-ups from <a href={'/prospecting/'+data.profile.id+'/results/'+data.selectedResult.id}>{data.selectedResult.title}</a> are ready to review. Save to keep your changes.</p></div>}
 <div className="bo-outreach-layout"><form onSubmit={e=>{e.preventDefault();submit();}}>
 <fieldset disabled={!ready||busy} className="bo-outreach-fields">
 <section className="bo-outreach-address"><h2>Recipient</h2><div className="bo-outreach-field-pair">{input('recipient')}{input('timeZone')}</div><p className="bo-hint">Use an IANA timezone, such as Australia/Melbourne.</p></section>
 <section className="bo-outreach-message"><div className="bo-outreach-message-heading"><span aria-hidden="true">1</span><h2>Introduction</h2></div>{input('subject')}{input('intro',9)}</section>
 <section className="bo-outreach-message"><div className="bo-outreach-message-heading"><span aria-hidden="true">2</span><h2>First follow-up <small>(optional)</small></h2></div>{input('followUp2',6)}</section>
 <section className="bo-outreach-message"><div className="bo-outreach-message-heading"><span aria-hidden="true">3</span><h2>Second follow-up <small>(optional)</small></h2></div>{input('followUp3',6)}</section>
 <Button type="submit" variant="primary" icon="check" loading={busy} disabled={!dirty&&!stale}>Save draft</Button>
 </fieldset></form>
 <aside className="bo-outreach-review" aria-label="Content review"><h2>Before approval</h2>
 <dl><div><dt>Sender</dt><dd>{data.sender?.displayName&&<strong>{data.sender.displayName}</strong>}{data.sender?.email||'Not set up'}</dd></div></dl><Button href="/prospecting/sender" variant="ghost" icon="settings">Sender setup</Button>
 <details><summary>Evidence and offer</summary><dl>{[['Observed',data.profile.observedFacts],['Evidence date',data.profile.evidenceDate],['Proposed work',data.profile.proposedWork],['Unknowns',data.profile.unknowns]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not recorded'}</dd></div>)}</dl></details>
 <Button href={'/prospecting/'+data.profile.id} variant="ghost" icon="eye">Review profile</Button>
 {data.blockers.length>0?<ul className="bo-outreach-blockers">{data.blockers.map(b=><li key={b}>{b}</li>)}</ul>:<p className="bo-hint">Required profile checks are recorded. Review every message included in this sequence.</p>}
 {(dirty||stale)&&<p className="bo-hint">Save the draft before approving.</p>}
 <label className="bo-prospect-check"><input type="checkbox" checked={reviewed} disabled={!ready||busy||dirty||stale||!!data.blockers.length||approved} onChange={e=>setReviewed(e.target.checked)}/><span>I reviewed the recipient, every included message, evidence and offer.</span></label>
 <Button variant="primary" icon="shield-check" disabled={!ready||busy||!reviewed||dirty||stale||!!data.blockers.length||approved} loading={busy} onClick={()=>submit(true)}>Approve content</Button>
 <p className="bo-hint">Approval records your review. It does not send or schedule email.</p>
 </aside></div><ProspectSchedulePreview data={data} dirty={dirty||!!stale}/>
 <Button href={'/prospecting/'+data.profile.id+'/delivery'} variant="ghost" icon="mail">Controlled test delivery</Button>
 </div>;
}
