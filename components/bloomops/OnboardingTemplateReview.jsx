'use client';
import {useState} from 'react';
import {Button,Field} from './Primitives';
export default function OnboardingTemplateReview({item,busy,onAction}){
 const [editing,setEditing]=useState(null);
 const latest=item.versions[0];
 return <div className="bo-template-review">
  {item.state==='inactive'&&<><p>This template is inactive. Enabling it is a separate, explicit action; its versions and existing client progress stay unchanged.</p><Button disabled={busy} onClick={()=>onAction(item,{action:'enable'})}>Enable {item.name} template</Button></>}
  {item.versions.map(version=><details key={version.id}><summary>Review {item.name} version {version.number} ({version.status})</summary>
   {!version.valid&&<p role="alert">This version is invalid and cannot be published. Create a repaired draft, leaving this version unchanged.</p>}
   {Array.isArray(version.definition?.items)&&<ol>{version.definition.items.map((entry,index)=><li key={index}><strong>{entry.title||'Untitled requirement'}</strong><p>{entry.instructions}</p><p>{entry.required?'Required':'Optional'}; {entry.verificationRequired?'verification required':'no additional verification'}; {entry.visibility} visibility; responsible: {entry.responsibleParty}.</p></li>)}</ol>}
   {version.status==='draft'&&version.valid&&item.state!=='inactive'&&<Button disabled={busy} onClick={()=>onAction(item,{action:'publish',versionId:version.id})}>Publish {item.name} version {version.number}</Button>}
  </details>)}
  {!editing&&item.templateId&&<Button disabled={busy} onClick={()=>setEditing(structuredClone(latest?.valid?latest.definition:item.definition))}>Create a revised {item.name} draft</Button>}
  {editing&&<form className="bo-template-editor" onSubmit={async e=>{e.preventDefault();if(await onAction(item,{action:'save_version',definition:editing}))setEditing(null);}}>
   <h3>New {item.name} version</h3><p>{latest?.valid?'Based on the latest stored version.':'Starting from built-in instructions because the stored definition cannot be safely edited.'} Saving creates a draft. Publication requires a separate review and action.</p>
   {editing.items.map((entry,index)=><fieldset key={entry.logicalKey}><legend>Requirement {index+1}</legend>
    <Field id={item.slug+'-title-'+index} label="Title"><input className="bo-control" id={item.slug+'-title-'+index} required maxLength={200} value={entry.title} onChange={e=>setEditing(v=>({...v,items:v.items.map((x,i)=>i===index?{...x,title:e.target.value}:x)}))}/></Field>
    <Field id={item.slug+'-instructions-'+index} label="Instructions"><textarea className="bo-control" id={item.slug+'-instructions-'+index} rows={3} maxLength={10000} value={entry.instructions||''} onChange={e=>setEditing(v=>({...v,items:v.items.map((x,i)=>i===index?{...x,instructions:e.target.value}:x)}))}/></Field>
    <p className="bo-small">{entry.required?'Required':'Optional'}; {entry.verificationRequired?'team verification required':'no additional verification'}. Existing responsibility, visibility and logical identity are retained.</p>
   </fieldset>)}
   <div className="bo-form-actions"><Button type="submit" disabled={busy} variant="primary">Save new {item.name} draft</Button><Button disabled={busy} onClick={()=>setEditing(null)}>Cancel revision</Button></div>
  </form>}
 </div>;
}
