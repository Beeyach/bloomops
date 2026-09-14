'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import useProfileDraft from './useProfileDraft';
import {profileRetryPlan} from '@/lib/bloomops/profile-retry.mjs';
import {profileDraftDirty} from '@/lib/bloomops/profile-drafts.mjs';
import {Button,PageHeader,Field,Status,fieldAria} from './Primitives';
import {ProspectIdentity,ProspectAssessment,ProspectSocialLinks,ProfileIcon} from './ProspectPresentation';
import {verifiedProspectSocials} from '@/lib/bloomops/prospect-socials.mjs';
import ProspectAvatar from './ProspectAvatar';
import ProspectConversionReceipt from './ProspectConversionReceipt';
import ProspectContactFacts from './ProspectContactFacts';
import {PROSPECT_FIELDS,PROSPECT_FIT,safeProspectUrl} from '@/lib/bloomops/prospect-values.mjs';
const entries=section=>Object.entries(PROSPECT_FIELDS).filter(([,v])=>v.section===section);
const time=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Not checked';
const tone=fit=>fit==='strong'?'success':fit==='hold'?'warning':'neutral';
function useReady(){const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);return ready;}
function useUnsaved(active){useEffect(()=>{if(!active)return;const leave=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[active]);}
function EditFields({section,values,setValues,sources,setSources,errors={},withSources=false}){
 return <div className={`bo-prospect-fields bo-prospect-fields-${section}`}>{entries(section).map(([key,spec])=>{
  const id=`prospect-${key}`,aria=fieldAria({id,hint:spec.hint,error:errors[key]}),value=values[key]??(key==='fit'?'unknown':'');
  const change=e=>setValues(v=>({...v,[key]:e.target.value}));
  return <div key={key} className={spec.type==='textarea'?'bo-prospect-field-wide':undefined}><Field id={id} label={spec.label} hint={spec.hint} error={errors[key]} optional={!spec.required&&key!=='fit'}>
   {spec.type==='fit'?<select {...aria} className="bo-control" value={value} onChange={change}>{Object.entries(PROSPECT_FIT).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>:spec.type==='textarea'?<textarea {...aria} className="bo-control" rows={key==='draftBody'?10:4} maxLength={spec.max} value={value} onChange={change}/>:<input {...aria} className="bo-control" type={spec.type||'text'} required={spec.required} maxLength={spec.max} value={value} onChange={change} autoComplete="off"/>}
  </Field>
  {withSources&&<details className="bo-prospect-field-source"><summary>Source details for {spec.label.toLowerCase()}</summary>
   <Field id={id+'-source'} label="Source URL"><input id={id+'-source'} className="bo-control" type="url" maxLength={2048} value={sources[key]?.url||''} onChange={e=>setSources(v=>({...v,[key]:{...v[key],url:e.target.value,checked:false,touched:true}}))}/></Field>
   <label className="bo-prospect-check"><input type="checkbox" checked={sources[key]?.checked===true} onChange={e=>setSources(v=>({...v,[key]:{...v[key],checked:e.target.checked,touched:true}}))}/>I checked this field against its source</label>
   {key==='publicEmail'&&<p className="bo-hint">A source check does not verify email delivery.</p>}
  </details>}
  </div>;
 })}</div>;
}
function ReadFields({section,profile}){if(section==='identity')return <ProspectIdentity profile={profile}/>;if(section==='assessment')return <ProspectAssessment profile={profile}/>;return <dl className={`bo-prospect-facts bo-prospect-facts-${section}`}>{entries(section).map(([key,spec])=><div key={key} className={spec.type==='textarea'?'bo-prospect-field-wide':undefined}><dt>{spec.label}</dt><dd>{key==='fit'?<Status tone={tone(profile.fit)} label={PROSPECT_FIT[profile.fit]}/>:key==='website'&&safeProspectUrl(profile.website)?<a href={safeProspectUrl(profile.website)} target="_blank" rel="noreferrer">{profile.website}</a>:profile[key]||<span className="bo-prospect-unknown">{key==='draftBody'||key==='draftSubject'?'No draft yet':'Not recorded'}</span>}</dd></div>)}</dl>;}
function EditableSection({section,title,displayTitle=title,icon,data,userId,onSave,onCurrent,onLost,children,footer}){
 const ready=useReady(),[editing,setEditing]=useState(false),[values,setValues]=useState({}),[sources,setSources]=useState({}),[baseline,setBaseline]=useState(null),[busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[latest,setLatest]=useState(null);
 const editButton=useRef(null),form=useRef(null);
 const draft=useMemo(()=>editing&&baseline?{...baseline,fields:values,sources}:null,[editing,baseline,values,sources]);
 const recovery=useProfileDraft({userId,workspaceId:data.profile.workspaceId,prospectId:data.profile.id,section,draft,onLost,onRecover:(copy,current)=>{setValues(copy.fields);setSources(copy.sources);setBaseline(copy);setErrors({});setMessage('Review your recovered fields before saving.');setLatest(current.profile.revision!==copy.revision?current:null);setSaved(false);setEditing(true);}});
 useUnsaved(!!draft&&profileDraftDirty(draft));
 useEffect(()=>{if(editing)form.current?.querySelector('input,select,textarea')?.focus();},[editing]);
 function begin(){
  const fields=Object.fromEntries(entries(section).map(([k])=>[k,data.profile[k]])),original=Object.fromEntries(data.sources.filter(s=>Object.hasOwn(fields,s.fieldKey)).map(s=>[s.fieldKey,{url:s.sourceUrl||'',verification:s.verification,checkedAt:s.checkedAt||null,updatedAt:s.updatedAt||null}]));
  setValues(fields);setSources(Object.fromEntries(Object.entries(original).map(([k,s])=>[k,{url:s.url,checked:false,touched:false}])));setBaseline({section,revision:data.profile.revision,before:fields,sourceBefore:original});setErrors({});setMessage('');setLatest(null);setSaved(false);setEditing(true);
 }
 function close(){recovery.retire();setEditing(false);setBaseline(null);setLatest(null);requestAnimationFrame(()=>editButton.current?.focus());}
 async function save(e){e.preventDefault();if(busy||!ready||!recovery.valid())return;setBusy(true);setErrors({});setMessage('');try{
  const current=await recovery.read(),plan=profileRetryPlan(draft,current);
  if(plan.state==='invalid'){setErrors(plan.errors);setMessage('Check the highlighted fields.');return;}
  if(plan.state==='conflict'){setLatest(current);setMessage('The saved profile changed. Your draft is still here. Review the saved values before replacing anything.');return;}
  if(plan.state==='ready')await onSave(plan.input);
  if(!recovery.valid())return;const fresh=plan.state==='saved'?current:await recovery.read();if(!recovery.valid())return;onCurrent(fresh);setSaved(true);close();
 }catch(e){if(!recovery.valid()||e.name==='AbortError')return;if(e.accessLost){recovery.invalidate(true);return;}setErrors(e.fields||{});setMessage('Save failed. Your draft is still here.'+(e.message?' '+e.message:''));}finally{setBusy(false);}}
 async function downloadDraft(){try{await recovery.read();if(!recovery.valid())return;const url=URL.createObjectURL(new Blob([JSON.stringify({section,fields:values,sources},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='bloomsi-prospect-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(recovery.valid()&&e.name!=='AbortError')setMessage(e.message);}}
 return <section id={section} className="bo-prospect-section" aria-labelledby={`${section}-title`}>
  <div className="bo-prospect-section-head"><h2 id={`${section}-title`}>{icon&&<ProfileIcon name={icon} size={22}/>}<span>{displayTitle}</span></h2>{!editing&&<div className="bo-prospect-edit-action">{saved&&<span role="status">Saved</span>}<button ref={editButton} className="bo-btn bo-btn-ghost bo-profile-edit" type="button" aria-label={`Edit ${title.toLowerCase()}`} title={`Edit ${title.toLowerCase()}`} disabled={!ready||recovery.recovering} onClick={begin}><ProfileIcon name="edit" size={20}/></button></div>}</div>
  {children}
  {recovery.storageError&&<p role="alert" className="bo-prospect-notice">{recovery.storageError}</p>}
  {!editing&&recovery.copies.length>0&&<div className="bo-profile-recovery" aria-label={`Recovery copies for ${title.toLowerCase()}`}><h3>Unsaved edits</h3>{recovery.copies.map(copy=><div key={copy.key}><span>{copy.count} fields <time dateTime={new Date(copy.at).toISOString()}>{new Date(copy.at).toLocaleString()}</time></span><Button disabled={recovery.recovering} onClick={()=>recovery.recover(copy.key)}>Review recovered fields</Button><Button disabled={recovery.recovering} variant="ghost" onClick={()=>{if(confirm('Discard this recovery copy?'))recovery.discard(copy.key);}}>Discard copy</Button></div>)}</div>}
  {recovery.recovering&&<p role="status">Checking current profile access…</p>}{recovery.error&&<p role="alert">{recovery.error}</p>}
  {editing?<form ref={form} onSubmit={save} aria-label={`Edit ${title.toLowerCase()}`}><fieldset disabled={busy}>
   {message&&<div className="bo-prospect-notice" role="alert"><p>{message}</p>{latest&&<><h3>Latest saved values</h3><ReadFields section={section} profile={latest.profile}/><div className="bo-prospect-form-actions"><Button onClick={downloadDraft}>Download my draft</Button><Button onClick={()=>{if(confirm('Replace your unsaved edits with the latest saved values? Download your draft first to keep a separate copy.')){onCurrent(latest);close();}}}>Use saved values</Button><Button variant="ghost" onClick={()=>setLatest(null)}>Keep my draft</Button></div></>}</div>}
   <EditFields section={section} values={values} setValues={setValues} sources={sources} setSources={setSources} errors={errors} withSources/>
   <div className="bo-prospect-form-actions"><Button type="submit" variant="primary" loading={busy}>Save {title.toLowerCase()}</Button><Button disabled={busy} onClick={()=>{if(!profileDraftDirty(draft)||confirm('Discard these unsaved edits?'))close();}}>Cancel</Button>{busy&&<span role="status">Saving…</span>}</div>
  </fieldset></form>:<ReadFields section={section} profile={data.profile}/>}
  {footer}
 </section>;
}
const blankProspect=()=>Object.fromEntries(entries('identity').map(([key])=>[key,null]));
export function NewProspect({workspaceId,userId}){
 const ready=useReady(),[requestId,setRequestId]=useState(''),[values,setValues]=useState(blankProspect),[busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[message,setMessage]=useState(''),[created,setCreated]=useState(null),[lost,setLost]=useState(false),lock=useRef(false);
 useEffect(()=>setRequestId(crypto.randomUUID()),[]);
 const draft=useMemo(()=>requestId?{section:'identity',revision:1,creationRequestId:requestId,before:blankProspect(),fields:values,sources:{},sourceBefore:{}}:null,[requestId,values]);
 const recovery=useProfileDraft({userId,workspaceId,prospectId:'new',section:'identity',creating:true,draft,onLost:()=>setLost(true),onRecover:(copy,current)=>{setValues(copy.fields);setRequestId(copy.creationRequestId);setErrors({});setCreated(current.state==='created'?current.prospect:null);setMessage(current.state==='created'?'':'Review your recovered fields before creating the prospect.');}});
 useUnsaved(!!draft&&profileDraftDirty(draft)&&!created);
 async function create(e){e.preventDefault();if(!ready||!requestId||lock.current||!recovery.valid())return;lock.current=true;setBusy(true);setMessage('');setErrors({});try{
  const current=await recovery.read(requestId);if(current.state==='created'){setCreated(current.prospect);setMessage('');return;}
  const response=await fetch('/api/bloomops/prospecting',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,userId,requestId,fields:Object.fromEntries(Object.entries(values).filter(([,value])=>value!==null))})});const result=await response.json();if(!recovery.valid())return;
  if([401,403,404].includes(response.status)){recovery.invalidate(true);return;}
  if(!response.ok){setErrors(result.errors||{});throw new Error(result.error||'The prospect could not be saved.');}
  recovery.retire();setValues(blankProspect());window.location.assign('/prospecting/'+result.prospectId);
 }catch(e){if(recovery.valid()&&e.name!=='AbortError')setMessage('Create failed. Your input is still here.'+(e.message?' '+e.message:''));}finally{lock.current=false;setBusy(false);}}
 async function download(){try{await recovery.read(requestId);if(!recovery.valid())return;const url=URL.createObjectURL(new Blob([JSON.stringify({fields:values},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='bloomsi-new-prospect-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(recovery.valid()&&e.name!=='AbortError')setMessage(e.message);}}
 function reset(){if(draft&&profileDraftDirty(draft)&&!confirm('Discard this form and start another prospect?'))return;recovery.retire();setValues(blankProspect());setRequestId(crypto.randomUUID());setErrors({});setCreated(null);setMessage('');}
 if(lost)return <div><p role="alert">Your account or workspace access changed.</p><Button onClick={()=>window.location.reload()}>Reload</Button></div>;
 return <div className="bo-prospect-create">
  {recovery.storageError&&<p className="bo-prospect-notice" role="alert">{recovery.storageError}</p>}
  {recovery.copies.length>0&&!busy&&<div className="bo-profile-recovery" aria-label="New prospect recovery copies"><h2>Recovery copies</h2>{recovery.copies.map(copy=><div key={copy.key}><span>{copy.count} {copy.count===1?'field':'fields'}<time dateTime={new Date(copy.at).toISOString()}>{new Date(copy.at).toLocaleString()}</time></span><Button disabled={recovery.recovering} onClick={()=>{if(!draft||!profileDraftDirty(draft)||confirm('Replace the current unsaved input with this recovery copy?'))recovery.recover(copy.key);}}>Review recovered fields</Button><Button disabled={recovery.recovering} variant="ghost" onClick={()=>{if(confirm('Discard this recovery copy?'))recovery.discard(copy.key);}}>Discard copy</Button></div>)}</div>}
  {recovery.recovering&&<p role="status">Checking current workspace access…</p>}{recovery.error&&<p role="alert">{recovery.error}</p>}
  {message&&<p className="bo-prospect-notice" role="alert">{message}</p>}
  {created&&<div className="bo-prospect-notice bo-prospect-creation-result"><h2>Prospect already created</h2><p>{created.businessName}</p><div className="bo-prospect-form-actions"><Button href={'/prospecting/'+created.id} variant="primary">Open saved prospect</Button><Button onClick={download}>Download my input</Button><Button onClick={reset}>Start another prospect</Button></div></div>}
  {created&&<h2>Your input</h2>}
  <form onSubmit={create} aria-label="New prospect"><fieldset disabled={!ready||!requestId||busy||recovery.recovering||!!created}>
   <EditFields section="identity" values={values} setValues={setValues} errors={errors}/>
   {!created&&<div className="bo-prospect-form-actions"><Button type="submit" variant="primary" loading={busy}>Create prospect</Button><Button href="/prospecting">Cancel</Button>{busy&&<span role="status">Creating…</span>}</div>}
  </fieldset></form>
 </div>;
}
export default function ProspectProfile({initial,userId,contactEvent=null}){
 const [data,setData]=useState(initial),[accessLost,setAccessLost]=useState(false),profile=data.profile,evidence=useRef(null);
 const recoveryProps={userId,onCurrent:current=>setData(v=>({...v,...current})),onLost:()=>setAccessLost(true)};
 async function save(input){
  const response=await fetch('/api/bloomops/prospecting/'+profile.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:profile.workspaceId,userId,...input})});const result=await response.json();
  if(!response.ok){const error=new Error(result.error||'Your changes could not be saved.');error.fields=result.errors;error.accessLost=[401,403,404].includes(response.status);throw error;}

 }
 if(accessLost)return <div className="bo-prospect-page"><PageHeader title="Prospect profile"/><p role="alert">Your account, workspace or prospect access changed.</p><Button onClick={()=>window.location.reload()}>Reload</Button></div>;
 const website=safeProspectUrl(profile.website),socials=verifiedProspectSocials(data.sources);
 const sources=<details id="provenance" className="bo-prospect-evidence bo-profile-sources"><summary>Sources & verification</summary>
  <dl className="bo-prospect-facts"><div><dt>Record source</dt><dd>{data.importSource?'Raw import':'Added manually'}</dd></div><div><dt>Added</dt><dd><time dateTime={profile.createdAt}>{time(profile.createdAt)}</time></dd></div></dl>
  {data.importSource&&<div className="bo-import-provenance"><h3>Imported raw record</h3><dl className="bo-prospect-facts"><div><dt>Source label</dt><dd>{data.importSource.sourceLabel||'Not recorded'}</dd></div><div><dt>Source workspace</dt><dd>{data.importSource.sourceWorkspaceId}</dd></div><div><dt>Source record</dt><dd>{data.importSource.sourceRecordId}</dd></div><div><dt>Imported</dt><dd>{time(data.importSource.importedAt)}</dd></div></dl><p>Import does not verify fields. Later checks and edits are recorded separately.</p><Button href={'/prospecting/import/receipts/'+data.importSource.receiptId} variant="ghost" icon="history">View import receipt</Button></div>}
  <ul className="bo-prospect-sources">{data.sources.map(source=><li key={source.fieldKey}><h3>{PROSPECT_FIELDS[source.fieldKey]?.label||'Field'}</h3><dl><div><dt>Source</dt><dd>{safeProspectUrl(source.sourceUrl)?<a href={safeProspectUrl(source.sourceUrl)} target="_blank" rel="noreferrer">{source.sourceUrl}</a>:'Entered manually'}</dd></div><div><dt>Verification</dt><dd>{source.verification==='checked'?'Checked against source':'Not checked'}</dd></div><div><dt>Checked time</dt><dd>{time(source.checkedAt)}</dd></div><div><dt>Last edited by</dt><dd>{source.actorName||'Workspace member'}</dd></div></dl></li>)}</ul>{!data.sources.length&&<p>No field sources recorded.</p>}
 </details>;
 return <article className="bo-prospect-page bo-prospect-profile">
  <Button href="/prospecting" variant="ghost" icon="chevron-left">Back to prospects</Button>
  <header className="bo-profile-header"><div className="bo-profile-heading"><ProspectAvatar id={profile.id} website={profile.website}/><div><h1 className="bo-display">{profile.businessName}</h1>{profile.niche&&<p className="bo-profile-subtitle">{profile.niche}</p>}<div className="bo-profile-fit"><Status tone={tone(profile.fit)} label={profile.fit==='strong'?'Strong fit':PROSPECT_FIT[profile.fit]}/><Status tone="neutral" label={initial.sheetFacts?.outreach||'Not contacted'}/></div></div></div><div className="bo-profile-actions"><Button href={'/prospecting/'+profile.id+'/conversion'} icon="clients">Review client handoff</Button><Button href={'/prospecting/skills?prospect='+encodeURIComponent(profile.id)} icon="skills">Use a skill</Button>{website&&<Button href={website} target="_blank" rel="noreferrer" icon="external-link">Open website</Button>}<ProspectSocialLinks links={socials}/></div></header>
  <ProspectConversionReceipt receipt={initial.conversion} compact/>
  <ProspectContactFacts key={contactEvent||'default'} profile={profile} facts={initial.sheetFacts} initialKind={contactEvent||'contact'} initiallyOpen={!!contactEvent}/>
  {initial.csvSource&&<details className="bo-prospect-evidence"><summary>CSV import source</summary><p>{initial.csvSource.fileName}</p><Button href={'/prospecting?batch='+initial.csvSource.batchId}>Open import batch</Button>{['instagram','linkedin'].map(k=>safeProspectUrl(initial.csvSource.raw[k])?<p key={k}><a href={safeProspectUrl(initial.csvSource.raw[k])} target="_blank" rel="noreferrer">{k==='instagram'?'Instagram':'LinkedIn'} source</a> (unverified)</p>:null)}</details>}
  <div className="bo-profile-layout">
   <div className="bo-profile-main">
    <EditableSection {...recoveryProps} section="assessment" title="Assessment" displayTitle="Opportunity" icon="opportunity" data={data} onSave={save} footer={<div className="bo-profile-section-links"><a href="#evidence" className="bo-btn bo-btn-ghost" onClick={()=>{if(evidence.current)evidence.current.open=true;}}>View audit evidence</a><Button href="#draft" variant="ghost">View draft</Button></div>}/>
    <EditableSection {...recoveryProps} section="draft" title="Outreach draft" icon="mail" data={data} onSave={save} footer={<div className="bo-profile-draft-note"><Button href={'/prospecting/'+data.profile.id+'/outreach'} icon="mail">Review outreach</Button><p>Draft only. Nothing is sent or scheduled.</p></div>}/>
    <details ref={evidence} className="bo-prospect-evidence bo-profile-audit"><summary>Audit evidence</summary><Button href={'/prospecting/'+encodeURIComponent(profile.id)+'/results'} icon="skills">Saved skill results</Button><EditableSection {...recoveryProps} section="evidence" title="Audit evidence" data={data} onSave={save}><p className="bo-prospect-section-note">Record what you tested and what remains unverified.</p></EditableSection></details>
   </div>
   <div className="bo-profile-support">
    <EditableSection {...recoveryProps} section="identity" title="Identity & contact" displayTitle="Contact" icon="user" data={data} onSave={save} footer={sources}/>
    <section id="activity" className="bo-prospect-section" aria-labelledby="activity-title"><div className="bo-prospect-section-head"><h2 id="activity-title"><ProfileIcon name="history" size={22}/><span>Recent activity</span></h2></div>
     {data.activity[0]?<div className="bo-profile-latest"><strong>{activityLabel(data.activity[0].eventType)}</strong><time dateTime={data.activity[0].occurredAt}>{time(data.activity[0].occurredAt)}</time></div>:<p>No activity recorded.</p>}
     <details className="bo-prospect-evidence" open={data.activityPage>1||undefined}><summary>View history</summary><ol className="bo-prospect-activity">{data.activity.map(event=><Activity key={event.id} event={event}/>)}</ol>
     {(data.moreActivity||data.activityPage>1)&&<nav aria-label="Activity pages" className="bo-prospect-pagination">{data.activityPage>1&&<Button href={`?activityPage=${data.activityPage-1}#activity`}>Newer activity</Button>}{data.moreActivity&&<Button href={`?activityPage=${data.activityPage+1}#activity`}>Older activity</Button>}</nav>}
     </details>
    </section>
   </div>
  </div>
 </article>;
}

function Activity({event}){return <li><div><strong>{activityLabel(event.eventType)}</strong><p>{event.actorName||'Workspace member'}</p>{event.metadata?.note&&<p className="bo-profile-history-note bo-result-prose">{event.metadata.note}</p>}{event.metadata?.fields?.length>0&&<details><summary>Changed fields</summary><ul>{event.metadata.fields.map(key=><li key={key}>{PROSPECT_FIELDS[key]?.label||'Profile field'}</li>)}</ul></details>}</div><time dateTime={event.occurredAt}>{time(event.occurredAt)}</time></li>;}

function activityLabel(type){return ({PROSPECT_MANUAL_CONTACT:'Manual contact logged',PROSPECT_INTEREST_RECORDED:'Interest recorded',PROSPECT_REPLY_RESOLVED:'Reply resolved',PROSPECT_CONVERTED:'Converted to client',PROSPECT_OUTREACH_STOPPED:'Cold outreach stopped',PROSPECT_CREATED:'Prospect added',PROSPECT_SKILL_RESULT_SAVED:'Skill result saved',PROSPECT_DRAFT_SAVED:'Outreach draft saved',PROSPECT_DRAFT_APPROVED:'Outreach content approved'})[type]||'Profile updated';}
