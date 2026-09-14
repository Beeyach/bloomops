'use client';
import PageComments from './PageComments';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {usePages,PageBreadcrumbs,PageChildren} from './PagesWorkspace';
import {PageIconPicker,PageShareButton} from './PageSharing';
import {Button} from './Primitives';
import {Icon} from './Icons';
import {createPageDraftSession,pageDraftKey} from '@/lib/bloomops/page-drafts.mjs';
const RichEditor=dynamic(()=>import('../RichEditor'),{ssr:false,loading:()=> <p className="bo-hint">Opening editor…</p>});
export default function PageEditor({initial,userId}){
 const pages=usePages(),titleField=useRef(null);
 const session=useRef(null),[view,setView]=useState({draft:{title:initial.title,body:initial.body},revision:initial.revision,dirty:false,busy:false,error:null}),[editorKey,setEditorKey]=useState(0),[ready,setReady]=useState(false),[recovered,setRecovered]=useState(false),[storageFailed,setStorageFailed]=useState(false),[latest,setLatest]=useState(null),[latestError,setLatestError]=useState('');
 const key=pageDraftKey(userId,initial.workspaceId,initial.id),api='/api/bloomops/pages/'+initial.id;
 useEffect(()=>{
  const draftSession=createPageDraftSession({initial,onState:setView,persist:value=>{try{sessionStorage.setItem(key,JSON.stringify(value));}catch{setStorageFailed(true);}},clear:()=>sessionStorage.removeItem(key),save:async input=>{
   if(!input.title.trim())return {ok:false,reason:'invalid',error:'Add a title before saving.'};
   const response=await fetch(api,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...input,workspaceId:initial.workspaceId})});const result=await response.json();if(response.ok)pages?.updateTitle(initial.id,input.title.trim());return response.ok?result:{ok:false,reason:response.status===409?'conflict':response.status===400?'invalid':'network',error:result.error};
  }});session.current=draftSession;
  try{const saved=sessionStorage.getItem(key);if(saved&&draftSession.restore(JSON.parse(saved))){setRecovered(draftSession.snapshot().dirty);setEditorKey(n=>n+1);}}catch{setStorageFailed(true);}
  setReady(true);
  if(pages)pages.canLeave.current=()=>!draftSession.snapshot().dirty||confirm('This page has unsaved changes. Leave anyway?');
  const beforeUnload=e=>{if(draftSession.snapshot().dirty){e.preventDefault();e.returnValue='';}};
  const leaving=e=>{const a=e.target.closest?.('a[href]');if(a&&a.origin===location.origin&&a.pathname!==location.pathname&&draftSession.snapshot().dirty&&!confirm('This page has unsaved changes. Leave anyway?')){e.preventDefault();e.stopPropagation();}};
  addEventListener('beforeunload',beforeUnload);document.addEventListener('click',leaving,true);
  return()=>{if(pages)pages.canLeave.current=()=>true;draftSession.dispose();removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',leaving,true);};
 },[key]);
 useEffect(()=>{const fit=()=>{const field=titleField.current;if(field){field.style.height='auto';field.style.height=field.scrollHeight+'px';}};fit();addEventListener('resize',fit);return()=>removeEventListener('resize',fit);},[view.draft.title]);
 function download(){const blob=new Blob([JSON.stringify({title:view.draft.title,body:view.draft.body},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bloomsi-page-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function reviewLatest(){setLatestError('');try{const response=await fetch(api,{cache:'no-store'});if(!response.ok)throw Error();const {page}=await response.json();const template=document.createElement('template');template.innerHTML=page.body;template.content.querySelectorAll('script,style,noscript,template').forEach(n=>n.remove());setLatest({...page,text:template.content.textContent});}catch{setLatestError('The saved version could not load. Your draft is still here.');}}
 function useLatest(){if(!latest||view.busy||!confirm('Replace this draft with the saved version? Download your draft first if you want to keep both.'))return;session.current.useSaved(latest);setEditorKey(n=>n+1);setLatest(null);setRecovered(false);}
 return <div className="bo-page-editor"><div className="bo-page-toolbar"><PageBreadcrumbs id={initial.id}/><PageComments id={initial.id} workspaceId={initial.workspaceId}/><span role="status" className={view.error?'bo-page-save-error':''}>{view.error?'Not saved':view.busy?'Saving…':view.dirty?'Unsaved changes':'Saved'}</span>{Boolean(initial.canManage)&&<PageShareButton id={initial.id} workspaceId={initial.workspaceId}/>}</div>
  {recovered&&<p className="bo-hint">Your draft from this tab was recovered.</p>}
  {storageFailed&&<p role="alert">This browser could not keep a recovery copy. Keep this tab open until saved, or download your draft.</p>}
  {view.error&&<div className="bo-page-save-notice" role="alert"><p>{view.error.message}</p><div>{view.error.kind!=='conflict'&&<Button icon="refresh" onClick={()=>session.current.retry()} disabled={view.busy}>Retry save</Button>}<Button icon="download" onClick={download}>Download draft</Button><Button icon="eye" onClick={reviewLatest} disabled={view.busy}>Review latest</Button></div></div>}
  {storageFailed&&!view.error&&<Button icon="download" onClick={download}>Download draft</Button>}
  {latestError&&<p role="alert">{latestError}</p>}
  {latest&&<section className="bo-page-latest"><h2>Latest saved version</h2><h3>{latest.title}</h3><p>{latest.text||'This page is empty.'}</p><Button onClick={useLatest} disabled={view.busy}>Use saved version</Button><Button variant="ghost" onClick={()=>setLatest(null)}>Keep editing my draft</Button></section>}
  <div className="bo-page-title"><PageIconPicker id={initial.id} initialIcon={initial.icon} workspaceId={initial.workspaceId} canManage={Boolean(initial.canManage)}/><textarea ref={titleField} rows={1} aria-label="Page title" value={view.draft.title} maxLength={200} disabled={!ready} onChange={e=>session.current.edit({title:e.target.value.replace(/[\r\n]+/g,' ')})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.closest('.bo-page-editor').querySelector('.ProseMirror')?.focus();}}} placeholder="Untitled"/></div>
  {ready&&<RichEditor key={editorKey} value={view.draft.body} onSave={body=>{if(session.current.snapshot().draft.body!==body)session.current.edit({body});session.current.flush();}} onChange={body=>session.current.edit({body})} allowDatabaseViews={false} workViewContext={{pageId:initial.id,workspaceId:initial.workspaceId,canReadWork:initial.canReadWork}} allPages={pages?.tree.rows||[]} pageLinkWorkspaceId={initial.workspaceId} allowBlockMovement placeholder="Start writing, or type / to add a block."/>}
  <PageChildren id={initial.id}/>
 </div>;
}
