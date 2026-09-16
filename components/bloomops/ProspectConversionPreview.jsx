'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Status} from './Primitives';
import {Icon} from './Icons';
import ProspectAvatar from './ProspectAvatar';
import ServiceOfferingEditor from './ServiceOfferingEditor';
import ProspectConversionReceipt from './ProspectConversionReceipt';
import {EditableSection} from './ProspectProfile';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';

export default function ProspectConversionPreview({initial,userId,initialProfile}){
 const [options,setOptions]=useState(initial),[mode,setMode]=useState(''),[chosenClient,setChosenClient]=useState(null),[chosenServices,setChosenServices]=useState([]),[offeringEditor,setOfferingEditor]=useState(null);
 const [clientQuery,setClientQuery]=useState(''),[serviceQuery,setServiceQuery]=useState('');
 const [result,setResult]=useState(null),[errors,setErrors]=useState({}),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[message,setMessage]=useState('');
 const [receipt,setReceipt]=useState(initial.receipt||null),[saving,setSaving]=useState(false),[confirmed,setConfirmed]=useState(false),[saveError,setSaveError]=useState('');
 const pending=useRef(null),saveLock=useRef(false);
 const [identityEditing,setIdentityEditing]=useState(false);
 const [profileData,setProfileData]=useState(initialProfile),[accessLost,setAccessLost]=useState(false);
 const sequence=useRef(0),report=useRef(null),profile=options.profile,endpoint='/api/bloomops/prospecting/'+profile.id+'/conversion-preview';
 const alive=useRef(true);
 useEffect(()=>{
  alive.current=true;
  const lost=()=>{alive.current=false;sequence.current++;setAccessLost(true);};
  const storage=event=>{if(event.key===DRAFT_CONTEXT_KEY||event.key===null)lost();};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=lost;}catch{}
  addEventListener(DRAFT_CONTEXT_KEY,lost);addEventListener('storage',storage);
  return()=>{alive.current=false;sequence.current++;channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,lost);removeEventListener('storage',storage);};
 },[]);
 const invalidate=()=>{if(saveLock.current)return;pending.current=null;setConfirmed(false);setSaveError('');sequence.current++;setSearching(false);setBusy(false);setResult(null);setErrors({});setMessage('');};
 async function search(kind,page=1){if(searching||busy||saving)return;setConfirmed(false);setSaveError('');pending.current=null;setSearching(true);setMessage('');const stamp=++sequence.current;setResult(null);
  try{const query=new URLSearchParams({clientQuery:kind==='client'?clientQuery:options.clientQuery,serviceQuery:kind==='service'?serviceQuery:options.serviceQuery,clientPage:String(kind==='client'?page:options.clientPage),servicePage:String(kind==='service'?page:options.servicePage)});const response=await fetch(endpoint+'?'+query,{cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw Error();if(alive.current&&stamp===sequence.current)setOptions(data);}catch{if(alive.current&&stamp===sequence.current)setMessage('Couldn’t load the choices. Try searching again.');}finally{if(alive.current&&stamp===sequence.current)setSearching(false);}
 }
 async function preview(event){event.preventDefault();if(busy||searching||saving)return;setConfirmed(false);setSaveError('');pending.current=null;setBusy(true);setMessage('');setErrors({});setResult(null);const stamp=++sequence.current;
  try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:profile.workspaceId,mode,clientId:mode==='existing'?chosenClient?.id:null,services:chosenServices.map(({id,packageName,scopeNotes})=>({serviceTypeId:id,packageName,scopeNotes}))})}),data=await response.json();if(!alive.current||stamp!==sequence.current)return;if(!response.ok||!data.ok){setErrors(data.errors||{});setMessage(data.errors?.form||'Check the selections and try again.');return;}setResult(data);requestAnimationFrame(()=>report.current?.focus());}catch{if(alive.current&&stamp===sequence.current)setMessage('Couldn’t check this handoff. Your selections are still here.');}finally{if(alive.current&&stamp===sequence.current)setBusy(false);}
 }
 async function saveConversion(){
  if(!alive.current||identityEditing||offeringEditor||saveLock.current||!confirmed||!result?.conversionReview||result.conversionReview.blockers.length)return;
  saveLock.current=true;setSaving(true);setSaveError('');
  pending.current ||= {workspaceId:profile.workspaceId,mode,clientId:mode==='existing'?chosenClient?.id:null,services:chosenServices.map(({id,packageName,scopeNotes})=>({serviceTypeId:id,packageName,scopeNotes})),requestId:crypto.randomUUID(),reviewHash:result.conversionReview.hash,confirmed:true};
  try{const response=await fetch('/api/bloomops/prospecting/'+profile.id+'/conversion',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current)}),data=await response.json();
   if(!alive.current)return;
   if(!response.ok||!data.ok){setSaveError(data.errors?.form||'Couldn’t confirm the saved result. Retry or reload this handoff to check it.');if(response.status<500){setConfirmed(false);setResult(null);setMessage(data.errors?.form||'Review the handoff again.');pending.current=null;}return;}
   setReceipt(data.receipt);setResult(null);requestAnimationFrame(()=>report.current?.focus());
  }catch{if(alive.current)setSaveError('Couldn’t confirm the saved result. Retry with the same selections, or reload this handoff to check it.');}finally{saveLock.current=false;if(alive.current)setSaving(false);}
 }
 async function saveIdentity(input){
  invalidate();
  const response=await fetch('/api/bloomops/prospecting/'+profile.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:profile.workspaceId,userId,...input})}),data=await response.json();
  if(!response.ok||!data.ok){const error=new Error(response.status===409?'The prospect changed. Review its latest saved values.':data.errors?.form||'Could not save the contact.');error.fields=data.errors;error.accessLost=[401,403,404].includes(response.status);throw error;}
 }
 function currentIdentity(current){invalidate();setProfileData(current);setOptions(value=>({...value,profile:current.profile}));setMessage('Profile refreshed. Review the handoff again before confirming the sale.');}
 if(accessLost)return <p role="alert">Your account, workspace or prospect access changed. Reload to continue.</p>;
 const choices=(kind,rows,chosen,choose)=>{const isClient=kind==='client',selectedRows=isClient?(chosen?[chosen]:[]):chosenServices,page=isClient?options.clientPage:options.servicePage,more=isClient?options.moreClients:options.moreServices;return <div className="bo-handoff-picker">
  <div className="bo-handoff-search"><label htmlFor={kind+'-search'}>{isClient?'Find a client':'Find a service'}</label><div><input id={kind+'-search'} value={isClient?clientQuery:serviceQuery} onChange={e=>{invalidate();(isClient?setClientQuery:setServiceQuery)(e.target.value);}} maxLength={120}/><Button disabled={searching||busy} onClick={()=>search(kind)}>Search</Button></div></div>
  {selectedRows.map(chosen=><div key={chosen.id} className="bo-handoff-selected"><Icon name="check" size={16}/><div><strong>Selected: {chosen.name}</strong><span>{isClient?'Client reference':'Service reference'}: {chosen.slug}</span></div></div>)}
  <div className="bo-handoff-options" role="group" aria-label={isClient?'Client choices':'Service choices'}>{rows.map(row=><button type="button" key={row.id} aria-pressed={selectedRows.some(x=>x.id===row.id)} disabled={busy||searching} onClick={()=>{invalidate();choose(row);}}><Icon name={isClient?'clients':({'ads':'ads','content-calendar':'calendar','ghl':'systems','kajabi':'onboarding','social-media-management':'social'}[row.slug]||'settings')} size={18}/><span><strong>{row.name}</strong>{isClient&&<small>{row.statusLabel}</small>}{isClient&&row.company&&<small>Company: {row.company}</small>}<small>{isClient?'Client reference':'Service reference'}: {row.slug}</small></span>{selectedRows.some(x=>x.id===row.id)&&<Icon name="check" size={18}/>}</button>)}{!rows.length&&<p>No {isClient?'clients':'active services'} found.</p>}</div>
  {(page>1||more)&&<div className="bo-handoff-pagination"><span>Page {page}</span><Button disabled={page===1||searching||busy} onClick={()=>search(kind,page-1)}>Previous</Button><Button disabled={!more||searching||busy} onClick={()=>search(kind,page+1)}>Next</Button></div>}
 </div>;};
 return <div className="bo-prospect-page bo-handoff"><Button href={'/prospecting/'+profile.id} variant="ghost" icon="chevron-left">Back to prospect</Button>
  <header className="bo-handoff-header"><ProspectAvatar id={profile.id} website={profile.website}/><div><h1>Client handoff review</h1><p>{profile.businessName}</p></div></header>
  {receipt?<div ref={report} tabIndex={-1}><ProspectConversionReceipt receipt={receipt}/></div>:<>
  <p className="bo-handoff-intro">Review the client, agreed service and onboarding needs. This preview saves nothing and sends no invitation.</p>
  <form onSubmit={preview} aria-label="Client handoff review"><fieldset disabled={busy||saving||!!offeringEditor}>
   <section><h2>Client</h2><div className="bo-handoff-mode" role="group" aria-label="Client destination">{[['new','New client'],['existing','Existing client']].map(([value,label])=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>{invalidate();setMode(value);}}><Icon name={value==='new'?'plus':'clients'} size={18}/>{label}</button>)}</div>{errors.mode&&<p className="bo-handoff-error">{errors.mode}</p>}
    {mode==='new'&&<dl className="bo-handoff-facts"><div><dt><Icon name="clients" size={16}/>Proposed client name</dt><dd>{profile.businessName}</dd></div><div><dt><Icon name="user" size={16}/>Contact from prospect profile</dt><dd>{profile.personName||'Not recorded'}</dd></div><div><dt><Icon name="mail" size={16}/>Contact email to confirm</dt><dd>{profile.publicEmail||'Not recorded'}</dd></div><div><dt>Correct missing details</dt><dd><a href="#identity">Edit prospect contact below</a></dd></div></dl>}
    {mode==='existing'&&choices('client',options.clients,chosenClient,setChosenClient)}{errors.clientId&&<p className="bo-handoff-error">{errors.clientId}</p>}
   </section>
   <section><h2>Purchased services</h2>{choices('service',options.services,null,row=>setChosenServices(values=>values.some(v=>v.id===row.id)?values.filter(v=>v.id!==row.id):[...values,{...row,packageName:'',scopeNotes:''}]))}{errors.serviceTypeId&&<p className="bo-handoff-error">{errors.serviceTypeId}</p>}
    {chosenServices.map(service=><fieldset key={service.id} className="bo-handoff-purchased"><legend>{service.name}</legend>
     <div className="bo-handoff-field"><label htmlFor={'handoff-package-'+service.id}>Package name</label><span>Optional</span><input id={'handoff-package-'+service.id} value={service.packageName} maxLength={120} onChange={e=>{invalidate();setChosenServices(values=>values.map(v=>v.id===service.id?{...v,packageName:e.target.value}:v));}}/></div>
     <div className="bo-handoff-field"><label htmlFor={'handoff-scope-'+service.id}>Agreed scope</label><textarea id={'handoff-scope-'+service.id} rows={3} value={service.scopeNotes} maxLength={2000} onChange={e=>{invalidate();setChosenServices(values=>values.map(v=>v.id===service.id?{...v,scopeNotes:e.target.value}:v));}}/></div>
     <Button onClick={()=>{invalidate();setChosenServices(values=>values.filter(v=>v.id!==service.id));}}>Remove {service.name}</Button>
     {initial.canManageOfferings&&service.slug.startsWith('custom-')&&<Button onClick={()=>{invalidate();setOfferingEditor({initial:service});}}>Edit offering name</Button>}
    </fieldset>)}
    {errors.scopeNotes&&<p role="alert">{errors.scopeNotes}</p>}{errors.packageName&&<p role="alert">{errors.packageName}</p>}
    {initial.canManageOfferings&&<Button icon="plus" onClick={()=>{invalidate();setOfferingEditor({initial:null});}}>Add a custom service</Button>}
   </section>
   {message&&<p role="alert" className="bo-prospect-notice">{message}</p>}{searching&&<p role="status">Loading choices…</p>}
   <Button type="submit" variant="primary" icon="check" loading={busy} disabled={searching||!!offeringEditor||identityEditing}>Review handoff</Button>
  </fieldset></form>
  {offeringEditor&&<ServiceOfferingEditor key={offeringEditor.initial?.id||'new'} initial={offeringEditor.initial} workspaceId={profile.workspaceId} userId={userId} onCancel={()=>setOfferingEditor(null)} onSaved={offering=>{invalidate();setOptions(value=>({...value,services:[...value.services.filter(v=>v.id!==offering.id),offering]}));setChosenServices(values=>values.some(v=>v.id===offering.id)?values.map(v=>v.id===offering.id?{...v,...offering}:v):[...values,{...offering,packageName:'',scopeNotes:''}]);setOfferingEditor(null);}}/>}
  {mode==='new'&&profileData&&<EditableSection section="identity" title="Identity & contact" displayTitle="Confirm prospect contact" data={profileData} userId={userId} disabled={saving} onEditingChange={setIdentityEditing} onEdit={invalidate} onSave={saveIdentity} onCurrent={currentIdentity} onLost={()=>{alive.current=false;sequence.current++;setAccessLost(true);}}></EditableSection>}
  {result&&<section ref={report} tabIndex={-1} className="bo-handoff-result" aria-label="Handoff preview"><div className="bo-handoff-result-head"><h2>Handoff preview</h2><Status tone={result.issues.length?'warning':'info'} label={result.issues.length?'Needs attention':'Preview checked'}/></div>
   <dl className="bo-handoff-facts"><div><dt>Client</dt><dd>{result.client.name}</dd></div><div><dt>Current lifecycle</dt><dd>{result.client.id?result.client.statusLabel:'New draft proposed'}</dd></div><div><dt>Primary contact</dt><dd>{result.contact?.name||'Not recorded'}</dd></div><div><dt>Contact email</dt><dd>{result.contact?.email||'Not recorded'}</dd></div><div><dt>{result.services?'First service':'Service'}</dt><dd>{result.service.name}</dd></div><div><dt>Service engagement</dt><dd>{result.service.existing?'An open engagement already exists':'A new engagement is proposed'}</dd></div><div><dt>Agreed scope</dt><dd>{result.service.scopeNotes}</dd></div><div><dt>Onboarding</dt><dd>{result.onboarding.status==='compiled'?result.onboarding.steps+' steps in the current template preview':'Requires review'}</dd></div></dl>
   {!result.services&&result.onboarding.status==='compiled'&&!result.service.serviceSpecific&&<p>Only the common onboarding template applies to this service.</p>}
   {result.services&&<ul className="bo-handoff-service-summary">{result.services.map(service=><li key={service.id}><h3>{service.name}</h3><p>{service.existing?'Existing engagement retained':'New planned engagement'}</p>{service.packageName&&<p>Package: {service.packageName}</p>}<p>Agreed scope: {service.scopeNotes}</p></li>)}</ul>}
   {result.service.existing&&<p>The existing engagement and its scope will remain unchanged.</p>}
   {result.issues.length>0&&<ul className="bo-handoff-issues">{result.issues.map((issue,i)=><li key={i}><Icon name="alert" size={18}/><span>{issue.message}{['contact_name','contact_email','client_name'].includes(issue.code)&&<div>{mode==='new'?<a href="#identity">Edit prospect contact</a>:<a href={'/clients/'+chosenClient.id} target="_blank" rel="noopener noreferrer">Review client contact in a new tab</a>}</div>}</span></li>)}</ul>}
   {result.issues.some(issue=>['template_missing','template_invalid'].includes(issue.code))&&<div className="bo-handoff-setup"><h3>Before onboarding activation</h3><p>Templates are separate from recording the sale. You can save the draft client and purchased service first.</p><p>Needed categories: {result.onboarding.categories.join(', ')}.</p>{initial.canManageTemplates?<Button href="/settings/onboarding" target="_blank" rel="noopener noreferrer" icon="settings">Review onboarding setup in a new tab</Button>:<p>Ask an administrator with template-management access to review these categories.</p>}<p>Keep this handoff open to preserve your selections. After setup, return here and choose Review handoff for a fresh check.</p></div>}
   <p className="bo-handoff-note">Recording this sale permanently stops cold outreach. Onboarding and invitations remain separate.</p>
   {result.conversionReview?.blockers.length>0?<div className="bo-handoff-blockers"><h3>Before recording the sale</h3><ul>{result.conversionReview.blockers.map(item=><li key={item}>{item}</li>)}</ul>{mode==='new'&&<a href="#identity">Edit prospect contact, then review the handoff again</a>}</div>:<div className="bo-handoff-confirm"><p>Next: save this sale as a client with its purchased service. Activation and invitations are separate steps.</p><label><input type="checkbox" checked={confirmed} disabled={saving} onChange={event=>setConfirmed(event.target.checked)}/><span>Confirm this sale and permanently stop cold outreach.</span></label>{saveError&&<p role="alert">{saveError}</p>}<Button variant="primary" icon="clients" disabled={!confirmed||identityEditing||!!offeringEditor} loading={saving} onClick={saveConversion}>Convert to client</Button></div>}
  </section>}
  </>}
 </div>;
}
