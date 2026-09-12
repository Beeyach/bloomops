'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field,Status,fieldAria} from './Primitives';
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
function ReadFields({section,profile}){return <dl className={`bo-prospect-facts bo-prospect-facts-${section}`}>{entries(section).map(([key,spec])=><div key={key} className={spec.type==='textarea'?'bo-prospect-field-wide':undefined}><dt>{spec.label}</dt><dd>{key==='fit'?<Status tone={tone(profile.fit)} label={PROSPECT_FIT[profile.fit]}/>:key==='website'&&safeProspectUrl(profile.website)?<a href={safeProspectUrl(profile.website)} target="_blank" rel="noreferrer">{profile.website}</a>:profile[key]||<span className="bo-prospect-unknown">{key==='draftBody'||key==='draftSubject'?'No draft yet':'Not recorded'}</span>}</dd></div>)}</dl>;}
function EditableSection({section,title,data,onSave,children}){
 const ready=useReady(),[editing,setEditing]=useState(false),[values,setValues]=useState({}),[sources,setSources]=useState({}),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[message,setMessage]=useState(''),[saved,setSaved]=useState(false);
 const editButton=useRef(null),form=useRef(null);useUnsaved(editing);
 useEffect(()=>{if(editing)form.current?.querySelector('input,select,textarea')?.focus();},[editing]);
 function begin(){setValues(Object.fromEntries(entries(section).map(([k])=>[k,data.profile[k]])));setSources(Object.fromEntries(data.sources.map(s=>[s.fieldKey,{url:s.sourceUrl||'',checked:false}])));setRevision(data.profile.revision);setErrors({});setMessage('');setSaved(false);setEditing(true);}
 function close(){setEditing(false);requestAnimationFrame(()=>editButton.current?.focus());}
 async function save(e){e.preventDefault();if(busy||!ready)return;setBusy(true);setErrors({});setMessage('');try{
  // Existing checks are not reasserted by merely opening an editor. Only
  // explicitly selected source controls are submitted with a changed field.
  const chosen=Object.fromEntries(Object.entries(sources).filter(([key,value])=>Object.hasOwn(values,key)&&(value.touched||value.checked||value.url!==(data.sources.find(s=>s.fieldKey===key)?.sourceUrl||''))).map(([key,value])=>[key,{url:value.url,checked:value.checked}]));
  await onSave({expectedRevision:revision,fields:values,sources:chosen});setSaved(true);close();
 }catch(e){setErrors(e.fields||{});setMessage(e.message);}finally{setBusy(false);}}
 return <section id={section} className="bo-prospect-section" aria-labelledby={`${section}-title`}>
  <div className="bo-prospect-section-head"><h2 id={`${section}-title`}>{title}</h2>{!editing&&<div className="bo-prospect-edit-action">{saved&&<span role="status">Saved</span>}<button ref={editButton} className="bo-btn bo-btn-ghost" type="button" disabled={!ready} onClick={begin}>Edit {title.toLowerCase()}</button></div>}</div>
  {children}
  {editing?<form ref={form} onSubmit={save} aria-label={`Edit ${title.toLowerCase()}`}><fieldset disabled={busy}>
   {message&&<div className="bo-prospect-notice" role="alert"><p>{message}</p><Button href={'/prospecting/'+data.profile.id} variant="ghost">Reload profile</Button></div>}
   <EditFields section={section} values={values} setValues={setValues} sources={sources} setSources={setSources} errors={errors} withSources/>
   <div className="bo-prospect-form-actions"><Button type="submit" variant="primary" loading={busy}>Save {title.toLowerCase()}</Button><Button disabled={busy} onClick={close}>Cancel</Button></div>
  </fieldset></form>:<ReadFields section={section} profile={data.profile}/>}
 </section>;
}
export function NewProspect({workspaceId}){
 const ready=useReady(),[requestId,setRequestId]=useState(''),[values,setValues]=useState({}),[busy,setBusy]=useState(false),[errors,setErrors]=useState({}),[message,setMessage]=useState('');
 useEffect(()=>setRequestId(crypto.randomUUID()),[]);useUnsaved(Object.values(values).some(Boolean)&&!busy);
 async function create(e){e.preventDefault();if(!ready||busy)return;setBusy(true);setMessage('');setErrors({});try{
  const response=await fetch('/api/bloomops/prospecting',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,requestId,fields:values})});const result=await response.json();
  if(!response.ok){setErrors(result.errors||{});throw new Error(result.error||'The prospect could not be saved.');}
  window.location.assign('/prospecting/'+result.prospectId);
 }catch(e){setMessage(e.message);setBusy(false);}}
 return <form onSubmit={create} className="bo-prospect-create" aria-label="New prospect"><fieldset disabled={!ready||busy}>
  {message&&<p className="bo-prospect-notice" role="alert">{message}</p>}
  <EditFields section="identity" values={values} setValues={setValues} errors={errors}/>
  <div className="bo-prospect-form-actions"><Button type="submit" variant="primary" loading={busy}>Create prospect</Button><Button href="/prospecting">Cancel</Button></div>
 </fieldset></form>;
}
export default function ProspectProfile({initial}){
 const [data,setData]=useState(initial),profile=data.profile;
 async function save(input){
  const response=await fetch('/api/bloomops/prospecting/'+profile.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:profile.workspaceId,...input})});const result=await response.json();
  if(!response.ok){const error=new Error(result.error||'Your changes could not be saved.');error.fields=result.errors;throw error;}
  const fresh=await fetch('/api/bloomops/prospecting/'+profile.id,{cache:'no-store'});if(!fresh.ok)throw new Error('The save completed, but this profile could not be reloaded. Reload to check its current state.');setData(await fresh.json());
 }
 const website=safeProspectUrl(profile.website),anchors=[['identity','Identity & contact'],['provenance','Provenance'],['assessment','Assessment'],['evidence','Audit evidence'],['draft','Outreach draft'],['activity','Activity']];
 return <article className="bo-prospect-page bo-prospect-profile">
  <Button href="/prospecting" variant="ghost" icon="chevron-left">Back to prospects</Button>
  <header className="bo-profile-header"><div><h1 className="bo-display">{profile.businessName}</h1><div className="bo-profile-fit"><span>Fit</span><Status tone={tone(profile.fit)} label={PROSPECT_FIT[profile.fit]}/></div></div><div className="bo-profile-actions">{website&&<Button href={website} target="_blank" rel="noreferrer" icon="external-link">Open website</Button>}<Button href="#draft">View draft</Button></div></header>
  <details className="bo-profile-jump"><summary>On this profile</summary><nav aria-label="Profile sections">{anchors.map(([id,label])=><a key={id} href={'#'+id}>{label}</a>)}</nav></details>
  <EditableSection section="identity" title="Identity & contact" data={data} onSave={save}/>
  <section id="provenance" className="bo-prospect-section" aria-labelledby="provenance-title"><h2 id="provenance-title">Provenance</h2><dl className="bo-prospect-facts"><div><dt>Record source</dt><dd>Added manually</dd></div><div><dt>External source record</dt><dd>None linked</dd></div><div><dt>Added</dt><dd><time dateTime={profile.createdAt}>{time(profile.createdAt)}</time></dd></div></dl>
   <details className="bo-prospect-evidence"><summary>Field sources and checks</summary><ul className="bo-prospect-sources">{data.sources.map(source=><li key={source.fieldKey}><h3>{PROSPECT_FIELDS[source.fieldKey]?.label||'Field'}</h3><dl><div><dt>Source</dt><dd>{safeProspectUrl(source.sourceUrl)?<a href={safeProspectUrl(source.sourceUrl)} target="_blank" rel="noreferrer">{source.sourceUrl}</a>:'Entered manually'}</dd></div><div><dt>Verification</dt><dd>{source.verification==='checked'?'Checked against source':'Not checked'}</dd></div><div><dt>Checked time</dt><dd>{time(source.checkedAt)}</dd></div><div><dt>Last edited by</dt><dd>{source.actorName||'Workspace member'}</dd></div></dl></li>)}</ul>{!data.sources.length&&<p>No field sources recorded.</p>}</details>
  </section>
  <EditableSection section="assessment" title="Assessment" data={data} onSave={save}><p className="bo-prospect-section-note">Separate observed facts from possible improvements. Strong means a relevant opportunity, not a confirmed buyer.</p></EditableSection>
  <details className="bo-prospect-evidence"><summary>Audit evidence</summary><EditableSection section="evidence" title="Audit evidence" data={data} onSave={save}><p className="bo-prospect-section-note">Record what you inspected, when you checked it and what remains uncertain. Saving evidence does not run an audit.</p></EditableSection></details>
  <EditableSection section="draft" title="Outreach draft" data={data} onSave={save}><dl className="bo-prospect-outreach-facts"><div><dt>Last contact</dt><dd>Not recorded</dd></div><div><dt>Next scheduled action</dt><dd>None</dd></div><div><dt>Reply or stop event</dt><dd>None recorded</dd></div><div><dt>Automation</dt><dd>Inactive</dd></div></dl><p className="bo-prospect-section-note">Draft only. Saving does not send a message or schedule outreach.</p></EditableSection>
  <section id="activity" className="bo-prospect-section" aria-labelledby="activity-title"><h2 id="activity-title">Activity</h2><ol className="bo-prospect-activity">{data.activity.slice(0,5).map(event=><Activity key={event.id} event={event}/>)}</ol>
   {data.activity.length>5&&<details className="bo-prospect-evidence"><summary>Earlier activity on this page</summary><ol className="bo-prospect-activity">{data.activity.slice(5).map(event=><Activity key={event.id} event={event}/>)}</ol></details>}
   {(data.moreActivity||data.activityPage>1)&&<nav aria-label="Activity pages" className="bo-prospect-pagination">{data.activityPage>1&&<Button href={`?activityPage=${data.activityPage-1}#activity`}>Newer activity</Button>}{data.moreActivity&&<Button href={`?activityPage=${data.activityPage+1}#activity`}>Older activity</Button>}</nav>}
  </section>
 </article>;
}
function Activity({event}){return <li><div><strong>{event.eventType==='PROSPECT_CREATED'?'Prospect added':'Profile updated'}</strong><p>{event.actorName||'Workspace member'}</p>{event.metadata?.fields?.length>0&&<details><summary>Changed fields</summary><ul>{event.metadata.fields.map(key=><li key={key}>{PROSPECT_FIELDS[key]?.label||'Profile field'}</li>)}</ul></details>}</div><time dateTime={event.occurredAt}>{time(event.occurredAt)}</time></li>;}
