'use client';
import {useRef,useState} from 'react';
import {Button,Status} from './Primitives';
import {Icon} from './Icons';
import ProspectAvatar from './ProspectAvatar';
import ProspectConversionReceipt from './ProspectConversionReceipt';

export default function ProspectConversionPreview({initial}){
 const [options,setOptions]=useState(initial),[mode,setMode]=useState(''),[chosenClient,setChosenClient]=useState(null),[chosenService,setChosenService]=useState(null);
 const [clientQuery,setClientQuery]=useState(''),[serviceQuery,setServiceQuery]=useState(''),[packageName,setPackageName]=useState(''),[scopeNotes,setScopeNotes]=useState('');
 const [result,setResult]=useState(null),[errors,setErrors]=useState({}),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[message,setMessage]=useState('');
 const [receipt,setReceipt]=useState(initial.receipt||null),[saving,setSaving]=useState(false),[confirmed,setConfirmed]=useState(false),[saveError,setSaveError]=useState('');
 const pending=useRef(null),saveLock=useRef(false);
 const sequence=useRef(0),report=useRef(null),profile=initial.profile,endpoint='/api/bloomops/prospecting/'+profile.id+'/conversion-preview';
 const invalidate=()=>{if(saveLock.current)return;pending.current=null;setConfirmed(false);setSaveError('');sequence.current++;setResult(null);setErrors({});setMessage('');};
 async function search(kind,page=1){if(searching||busy||saving)return;setConfirmed(false);setSaveError('');pending.current=null;setSearching(true);setMessage('');const stamp=++sequence.current;setResult(null);
  try{const query=new URLSearchParams({clientQuery:kind==='client'?clientQuery:options.clientQuery,serviceQuery:kind==='service'?serviceQuery:options.serviceQuery,clientPage:String(kind==='client'?page:options.clientPage),servicePage:String(kind==='service'?page:options.servicePage)});const response=await fetch(endpoint+'?'+query,{cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw Error();if(stamp===sequence.current)setOptions(data);}catch{if(stamp===sequence.current)setMessage('Couldn’t load the choices. Try searching again.');}finally{setSearching(false);}
 }
 async function preview(event){event.preventDefault();if(busy||searching||saving)return;setConfirmed(false);setSaveError('');pending.current=null;setBusy(true);setMessage('');setErrors({});setResult(null);const stamp=++sequence.current;
  try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:profile.workspaceId,mode,clientId:mode==='existing'?chosenClient?.id:null,serviceTypeId:chosenService?.id,packageName,scopeNotes})}),data=await response.json();if(stamp!==sequence.current)return;if(!response.ok||!data.ok){setErrors(data.errors||{});setMessage(data.errors?.form||'Check the selections and try again.');return;}setResult(data);requestAnimationFrame(()=>report.current?.focus());}catch{if(stamp===sequence.current)setMessage('Couldn’t check this handoff. Your selections are still here.');}finally{setBusy(false);}
 }
 async function saveConversion(){
  if(saveLock.current||!confirmed||!result?.conversionReview||result.conversionReview.blockers.length)return;
  saveLock.current=true;setSaving(true);setSaveError('');
  pending.current ||= {workspaceId:profile.workspaceId,mode,clientId:mode==='existing'?chosenClient?.id:null,serviceTypeId:chosenService?.id,packageName,scopeNotes,requestId:crypto.randomUUID(),reviewHash:result.conversionReview.hash,confirmed:true};
  try{const response=await fetch('/api/bloomops/prospecting/'+profile.id+'/conversion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current)}),data=await response.json();
   if(!response.ok||!data.ok){setSaveError(data.errors?.form||'Couldn’t confirm the saved result. Retry or reload this handoff to check it.');if(response.status<500){setConfirmed(false);setResult(null);setMessage(data.errors?.form||'Review the handoff again.');pending.current=null;}return;}
   setReceipt(data.receipt);setResult(null);requestAnimationFrame(()=>report.current?.focus());
  }catch{setSaveError('Couldn’t confirm the saved result. Retry with the same selections, or reload this handoff to check it.');}finally{saveLock.current=false;setSaving(false);}
 }
 const choices=(kind,rows,chosen,choose)=>{const isClient=kind==='client',page=isClient?options.clientPage:options.servicePage,more=isClient?options.moreClients:options.moreServices;return <div className="bo-handoff-picker">
  <div className="bo-handoff-search"><label htmlFor={kind+'-search'}>{isClient?'Find a client':'Find a service'}</label><div><input id={kind+'-search'} value={isClient?clientQuery:serviceQuery} onChange={e=>{invalidate();(isClient?setClientQuery:setServiceQuery)(e.target.value);}} maxLength={120}/><Button disabled={searching||busy} onClick={()=>search(kind)}>Search</Button></div></div>
  {chosen&&<div className="bo-handoff-selected"><Icon name="check" size={16}/><div><strong>Selected: {chosen.name}</strong><span>{isClient?'Client reference':'Service reference'}: {chosen.slug}</span></div></div>}
  <div className="bo-handoff-options" role="group" aria-label={isClient?'Client choices':'Service choices'}>{rows.map(row=><button type="button" key={row.id} aria-pressed={chosen?.id===row.id} disabled={busy||searching} onClick={()=>{invalidate();choose(row);}}><Icon name={isClient?'clients':'onboarding'} size={18}/><span><strong>{row.name}</strong>{isClient&&<small>{row.statusLabel}</small>}{isClient&&row.company&&<small>Company: {row.company}</small>}<small>{isClient?'Client reference':'Service reference'}: {row.slug}</small></span>{chosen?.id===row.id&&<Icon name="check" size={18}/>}</button>)}{!rows.length&&<p>No {isClient?'clients':'active services'} found.</p>}</div>
  <div className="bo-handoff-pagination"><span>Page {page}</span><Button disabled={page===1||searching||busy} onClick={()=>search(kind,page-1)}>Previous</Button><Button disabled={!more||searching||busy} onClick={()=>search(kind,page+1)}>Next</Button></div>
 </div>;};
 return <div className="bo-prospect-page bo-handoff"><Button href={'/prospecting/'+profile.id} variant="ghost" icon="chevron-left">Back to prospect</Button>
  <header className="bo-handoff-header"><ProspectAvatar id={profile.id} website={profile.website}/><div><h1>Client handoff review</h1><p>{profile.businessName}</p></div></header>
  {receipt?<div ref={report} tabIndex={-1}><ProspectConversionReceipt receipt={receipt}/></div>:<>
  <p className="bo-handoff-intro">Review the client, agreed service and onboarding needs. This preview saves nothing and sends no invitation.</p>
  <form onSubmit={preview} aria-label="Client handoff review"><fieldset disabled={busy||saving}>
   <section><h2>Client</h2><div className="bo-handoff-mode" role="group" aria-label="Client destination">{[['new','New client'],['existing','Existing client']].map(([value,label])=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>{invalidate();setMode(value);}}><Icon name={value==='new'?'plus':'clients'} size={18}/>{label}</button>)}</div>{errors.mode&&<p className="bo-handoff-error">{errors.mode}</p>}
    {mode==='new'&&<dl className="bo-handoff-facts"><div><dt>Proposed client name</dt><dd>{profile.businessName}</dd></div><div><dt>Contact from prospect profile</dt><dd>{profile.personName||'Not recorded'}</dd></div><div><dt>Contact email to confirm</dt><dd>{profile.publicEmail||'Not recorded'}</dd></div></dl>}
    {mode==='existing'&&choices('client',options.clients,chosenClient,setChosenClient)}{errors.clientId&&<p className="bo-handoff-error">{errors.clientId}</p>}
   </section>
   <section><h2>Purchased service</h2>{choices('service',options.services,chosenService,setChosenService)}{errors.serviceTypeId&&<p className="bo-handoff-error">{errors.serviceTypeId}</p>}
    <div className="bo-handoff-field"><label htmlFor="handoff-package">Package name</label><span>Optional</span><input id="handoff-package" value={packageName} maxLength={120} onChange={e=>{invalidate();setPackageName(e.target.value);}}/></div>{errors.packageName&&<p className="bo-handoff-error">{errors.packageName}</p>}
    <div className="bo-handoff-field"><label htmlFor="handoff-scope">Agreed scope</label><textarea id="handoff-scope" rows={4} value={scopeNotes} maxLength={2000} onChange={e=>{invalidate();setScopeNotes(e.target.value);}}/></div>{errors.scopeNotes&&<p className="bo-handoff-error">{errors.scopeNotes}</p>}
   </section>
   {message&&<p role="alert" className="bo-prospect-notice">{message}</p>}{searching&&<p role="status">Loading choices…</p>}
   <Button type="submit" variant="primary" icon="check" loading={busy} disabled={searching}>Review handoff</Button>
  </fieldset></form>
  {result&&<section ref={report} tabIndex={-1} className="bo-handoff-result" aria-label="Handoff preview"><div className="bo-handoff-result-head"><h2>Handoff preview</h2><Status tone={result.issues.length?'warning':'info'} label={result.issues.length?'Needs attention':'Preview checked'}/></div>
   <dl className="bo-handoff-facts"><div><dt>Client</dt><dd>{result.client.name}</dd></div><div><dt>Current lifecycle</dt><dd>{result.client.id?result.client.statusLabel:'New draft proposed'}</dd></div><div><dt>Primary contact</dt><dd>{result.contact?.name||'Not recorded'}</dd></div><div><dt>Contact email</dt><dd>{result.contact?.email||'Not recorded'}</dd></div><div><dt>Service</dt><dd>{result.service.name}</dd></div><div><dt>Service engagement</dt><dd>{result.service.existing?'An open engagement already exists':'A new engagement is proposed'}</dd></div><div><dt>Agreed scope</dt><dd>{result.service.scopeNotes}</dd></div><div><dt>Onboarding</dt><dd>{result.onboarding.status==='compiled'?result.onboarding.steps+' steps in the current template preview':'Requires review'}</dd></div></dl>
   {result.onboarding.status==='compiled'&&!result.service.serviceSpecific&&<p>Only the common onboarding template applies to this service.</p>}
   {result.service.existing&&<p>The existing engagement and its scope will remain unchanged.</p>}
   {result.issues.length>0&&<ul className="bo-handoff-issues">{result.issues.map((issue,i)=><li key={i}><Icon name="alert" size={18}/><span>{issue.message}</span></li>)}</ul>}
   <p className="bo-handoff-note">Recording this sale permanently stops cold outreach. Onboarding and invitations remain separate.</p>
   {result.conversionReview?.blockers.length>0?<div className="bo-handoff-blockers"><h3>Before conversion</h3><ul>{result.conversionReview.blockers.map(item=><li key={item}>{item}</li>)}</ul></div>:<div className="bo-handoff-confirm"><label><input type="checkbox" checked={confirmed} disabled={saving} onChange={event=>setConfirmed(event.target.checked)}/><span>Confirm this sale and permanently stop cold outreach.</span></label>{saveError&&<p role="alert">{saveError}</p>}<Button variant="primary" icon="clients" disabled={!confirmed} loading={saving} onClick={saveConversion}>Convert to client</Button></div>}
  </section>}
  </>}
 </div>;
}
