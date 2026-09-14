'use client';
import {useEffect,useRef,useState} from 'react';
import {createPageDraftSession} from '@/lib/bloomops/page-drafts.mjs';
import {createPageDraftStore,syncLegacyPageLogout} from '@/lib/bloomops/page-draft-store.mjs';
import {DRAFT_CONTEXT_KEY,PAGE_DRAFT_PREFIX} from '@/lib/bloomops/draft-context.mjs';
const cancelled=()=>new DOMException('This editor is no longer active.','AbortError');
export default function usePageDraft({initial,userId,onTitle}){
 const control=useRef(null),titleCallback=useRef(onTitle);titleCallback.current=onTitle;
 const [view,setView]=useState({draft:{title:initial.title,body:initial.body},revision:initial.revision,dirty:false,busy:false,error:null});
 const [ready,setReady]=useState(false),[lost,setLost]=useState(false),[copies,setCopies]=useState([]),[storageError,setStorageError]=useState(''),[checking,setChecking]=useState(false),[error,setError]=useState(''),[editorKey,setEditorKey]=useState(0);
 useEffect(()=>{
  let active=true,store=null,source=null,reader=null,sequence=0,reading=false;const requests=new Set(),api='/api/bloomops/pages/'+initial.id;
  const valid=()=>{try{return active&&(!store||store.valid());}catch{return false;}};
  const list=()=>{if(!valid()||!store)return;try{setCopies(store.list().filter(c=>c.key!==store.own).map(c=>({key:c.key,at:c.at,legacy:c.legacy})));}catch{setStorageError('Recovery copies could not be read. Keep this tab open until saved.');}};
  const invalidate=(clear=false)=>{if(!active)return;if(clear)try{store?.clearScope();}catch{}active=false;sequence++;reader?.abort();for(const request of requests)request.abort();draftSession.dispose();store?.dispose();setLost(true);setCopies([]);};
  async function read(){
   if(!valid())throw cancelled();const stamp=++sequence;reader?.abort();const controller=new AbortController();reader=controller;
   const response=await fetch(api+'/recovery',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({userId,workspaceId:initial.workspaceId})});
   const body=await response.json();if(!valid()||stamp!==sequence)throw cancelled();
   if([401,403,404].includes(response.status)){invalidate(true);throw cancelled();}
   if(!response.ok)throw Error(body.error||'The saved page could not be checked. Try again.');
   if(body.userId!==userId||body.workspaceId!==initial.workspaceId||body.page?.id!==initial.id||body.page?.workspaceId!==initial.workspaceId||!body.page.canEdit){invalidate(true);throw cancelled();}return body.page;
  }
  const draftSession=createPageDraftSession({initial,read,onState:s=>{if(valid())setView(s);},persist:value=>{
   if(!valid())return;try{if(!store)throw Error('This browser could not keep a recovery copy. Keep this tab open until saved, or download your draft.');store.write(value);setStorageError('');}catch(e){setStorageError(e.message);}
  },clear:()=>{
   if(!valid())return;try{store?.write(null);if(source)store?.remove(source.key,source.raw);source=null;setStorageError('');list();}catch{setStorageError('The recovery copy could not be removed from this browser.');}
  },save:async input=>{
   if(!valid())throw cancelled();if(!input.title.trim())return {ok:false,reason:'invalid',error:'Add a title before saving.'};
   const controller=new AbortController();requests.add(controller);
   try{const response=await fetch(api,{method:'PUT',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({...input,userId,workspaceId:initial.workspaceId})});const result=await response.json();if(!valid())throw cancelled();if([401,403,404].includes(response.status)){invalidate(true);throw cancelled();}if(response.ok)titleCallback.current?.(input.title.trim());return response.ok?result:{ok:false,reason:response.status===409?'conflict':response.status===400?'invalid':'network',error:result.error};}finally{requests.delete(controller);}
  }});
  try{store=createPageDraftStore(localStorage,sessionStorage,{userId,workspaceId:initial.workspaceId,pageId:initial.id},crypto.randomUUID());list();}catch{setStorageError('This browser could not keep a recovery copy. Keep this tab open until saved, or download your draft.');}
  async function recover(key){
   if(!valid()||reading||draftSession.snapshot().busy)return;
   if(draftSession.snapshot().dirty&&!confirm('Replace your unsaved input with this recovery copy?'))return;
   draftSession.pause();reading=true;setChecking(true);setError('');
   try{const copy=store?.snapshot(key);if(!copy)throw Error('This recovery copy is no longer available.');const current=await read();if(!valid())return;source=copy;if(!draftSession.restore(copy.value,current))throw Error('This recovery copy could not be opened.');setEditorKey(n=>n+1);}
   catch(e){if(valid()&&e.name!=='AbortError')setError(e.message);}finally{reading=false;if(active)setChecking(false);}
  }
  control.current={session:draftSession,valid,read,recover,
   discard:key=>{if(!valid()||reading||draftSession.snapshot().busy)return;try{const copy=store?.snapshot(key);if(copy)store.remove(key,copy.raw);list();}catch{setStorageError('This recovery copy could not be removed.');}},
   useSaved:(page,generation)=>{if(valid()&&draftSession.useSaved(page,generation)){setEditorKey(n=>n+1);return true;}return false;},
  };
  setReady(true);
  const context=e=>{try{if(e?.detail?.logout||e?.data?.logout)for(const key of Object.keys(sessionStorage))if(key.startsWith('bloomsi:page-draft:'))sessionStorage.removeItem(key);syncLegacyPageLogout(localStorage,sessionStorage);}catch{}invalidate();};
  const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)context();else if(e.key?.startsWith(PAGE_DRAFT_PREFIX))list();};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=context;}catch{}
  const hide=()=>invalidate();
  addEventListener(DRAFT_CONTEXT_KEY,context);addEventListener('storage',storage);addEventListener('pagehide',hide);
  return()=>{active=false;sequence++;reader?.abort();for(const request of requests)request.abort();draftSession.dispose();store?.dispose();channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,context);removeEventListener('storage',storage);removeEventListener('pagehide',hide);};
 },[userId,initial.workspaceId,initial.id]);
 return {view,ready,lost,copies,storageError,checking,error,editorKey,
  valid:()=>Boolean(control.current?.valid()),snapshot:()=>control.current?.valid()?control.current.session.snapshot():null,read:()=>control.current?.read()||Promise.reject(cancelled()),
  edit:patch=>{if(!checking)control.current?.session.edit(patch);},flush:()=>control.current?.session.flush(),retry:()=>control.current?.session.retry(),
  recover:key=>control.current?.recover(key),discard:key=>control.current?.discard(key),useSaved:(page,generation)=>control.current?.useSaved(page,generation),
 };
}
