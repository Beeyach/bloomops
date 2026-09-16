'use client';
import PageComments from './PageComments';
import PageRecordContext from './PageRecordContext';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {usePages,PageBreadcrumbs,PageChildren} from './PagesWorkspace';
import {PageIconPicker,PageShareButton} from './PageSharing';
import {Button} from './Primitives';
import usePageDraft from './usePageDraft';
const RichEditor=dynamic(()=>import('../RichEditor'),{ssr:false,loading:()=> <p className="bo-hint">Opening editor…</p>});
export default function PageEditor({initial,userId}){
 const pages=usePages(),titleField=useRef(null);
 const recovery=usePageDraft({initial,userId,onTitle:title=>pages?.updateTitle(initial.id,title)}),{view,ready,editorKey}=recovery;
 const [latest,setLatest]=useState(null),[latestError,setLatestError]=useState('');
 const dirty=useRef(false);dirty.current=view.dirty&&!recovery.lost;
 useEffect(()=>{
  if(pages)pages.canLeave.current=()=>!dirty.current||confirm('This page has unsaved changes. Leave anyway?');
  const beforeUnload=e=>{if(dirty.current){e.preventDefault();e.returnValue='';}};
  const leaving=e=>{const a=e.target.closest?.('a[href]');if(a&&a.origin===location.origin&&a.pathname!==location.pathname&&dirty.current&&!confirm('This page has unsaved changes. Leave anyway?')){e.preventDefault();e.stopPropagation();}};
  addEventListener('beforeunload',beforeUnload);document.addEventListener('click',leaving,true);
  return()=>{if(pages)pages.canLeave.current=()=>true;removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',leaving,true);};
 },[initial.id]);
 useEffect(()=>{const fit=()=>{const field=titleField.current;if(field){field.style.height='auto';field.style.height=field.scrollHeight+'px';}};fit();addEventListener('resize',fit);return()=>removeEventListener('resize',fit);},[view.draft.title]);
 async function download(){setLatestError('');try{await recovery.read();const snapshot=recovery.snapshot();if(!snapshot)return;const blob=new Blob([JSON.stringify(snapshot.draft,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bloomsi-page-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(recovery.valid()&&e.name!=='AbortError')setLatestError('Your draft could not be downloaded. Check your connection and retry.');}}
 async function reviewLatest(){setLatestError('');try{const page=await recovery.read();if(!recovery.valid())return;const template=document.createElement('template');template.innerHTML=page.body;template.content.querySelectorAll('script,style,noscript,template').forEach(n=>n.remove());setLatest({...page,text:template.content.textContent});}catch(e){if(recovery.valid()&&e.name!=='AbortError')setLatestError('The saved version could not load. Your draft is still here.');}}
 async function useLatest(){if(!latest||view.busy||!confirm('Replace this draft with the saved version? Download your draft first if you want to keep both.'))return;const generation=recovery.snapshot()?.generation;if(generation===undefined)return;try{const current=await recovery.read();if(!recovery.valid())return;if(current.revision!==latest.revision){setLatestError('The saved page changed again. Review the latest version before replacing your draft.');return;}if(!recovery.useSaved(current,generation)){setLatestError('Your draft changed while checking. Review it before replacing any input.');return;}setLatest(null);}catch(e){if(recovery.valid()&&e.name!=='AbortError')setLatestError('The saved version could not be checked. Your draft is still here.');}}
 if(recovery.lost)return <div className="bo-page-editor"><p role="alert">Your account, workspace or page access changed. Reload to continue.</p><Button onClick={()=>location.reload()}>Reload</Button></div>;
 return <div className="bo-page-editor"><div className="bo-page-toolbar"><PageBreadcrumbs id={initial.id}/><PageComments id={initial.id} workspaceId={initial.workspaceId}/><span role="status" className={view.error?'bo-page-save-error':''}>{view.busy?'Saving…':view.error?.kind==='recovered'?'Recovered draft':view.error?'Save failed':view.dirty?'Unsaved changes':'Saved'}</span>{Boolean(initial.canManage)&&<PageShareButton id={initial.id} workspaceId={initial.workspaceId}/>}</div>
  {recovery.copies.length>0&&<section className="bo-page-recovery" aria-label="Page recovery copies"><h2>Recovery copies</h2>{recovery.copies.map(copy=><div key={copy.key}><span>{copy.legacy?'Earlier copy from this tab':<time dateTime={new Date(copy.at).toISOString()}>{new Date(copy.at).toLocaleString()}</time>}</span><Button icon="refresh" disabled={view.busy||recovery.checking} onClick={()=>{setLatest(null);recovery.recover(copy.key);}}>Review recovered draft</Button><Button variant="ghost" disabled={view.busy||recovery.checking} onClick={()=>{if(confirm('Discard this recovery copy?'))recovery.discard(copy.key);}}>Discard copy</Button></div>)}</section>}
  {recovery.checking&&<p role="status">Checking current page access…</p>}{recovery.error&&<p role="alert">{recovery.error}</p>}
  {recovery.storageError&&<p role="alert">{recovery.storageError}</p>}
  {view.error&&<div className="bo-page-save-notice" role="alert"><p>{view.error.message}</p><div>{view.error.kind!=='conflict'&&<Button icon="refresh" onClick={()=>recovery.retry()} disabled={view.busy||recovery.checking}>{view.error.kind==='recovered'?'Save recovered draft':'Retry save'}</Button>}<Button icon="download" onClick={download} disabled={view.busy||recovery.checking}>Download draft</Button><Button icon="eye" onClick={reviewLatest} disabled={view.busy||recovery.checking}>Review latest</Button></div></div>}
  {recovery.storageError&&!view.error&&<Button icon="download" onClick={download} disabled={view.busy||recovery.checking}>Download draft</Button>}
  {latestError&&<p role="alert">{latestError}</p>}
  {latest&&<section className="bo-page-latest"><h2>Latest saved version</h2><h3>{latest.title}</h3><p>{latest.text||'This page is empty.'}</p><Button onClick={useLatest} disabled={view.busy}>Use saved version</Button><Button variant="ghost" onClick={()=>setLatest(null)}>Keep editing my draft</Button></section>}
  <div className="bo-page-title"><PageIconPicker id={initial.id} initialIcon={initial.icon} workspaceId={initial.workspaceId} canManage={Boolean(initial.canManage)}/><textarea ref={titleField} rows={1} aria-label="Page title" value={view.draft.title} maxLength={200} disabled={!ready||recovery.checking} onChange={e=>recovery.edit({title:e.target.value.replace(/[\r\n]+/g,' ')})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.closest('.bo-page-editor').querySelector('.ProseMirror')?.focus();}}} placeholder="Untitled"/></div>
  {ready&&!recovery.checking&&<RichEditor key={editorKey} value={view.draft.body} onSave={body=>{if(view.draft.body!==body)recovery.edit({body});recovery.flush();}} onChange={body=>recovery.edit({body})} allowDatabaseViews={false} workViewContext={{pageId:initial.id,workspaceId:initial.workspaceId,canReadWork:initial.canReadWork}} allPages={pages?.tree.rows||[]} pageLinkWorkspaceId={initial.workspaceId} allowBlockMovement placeholder="Start writing, or type / to add a block."/>}
  <PageRecordContext key={JSON.stringify([userId,initial.workspaceId,initial.id])} pageId={initial.id} workspaceId={initial.workspaceId} userId={userId}/>
  <PageChildren id={initial.id}/>
 </div>;
}
