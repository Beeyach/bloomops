'use client';
import {useEffect,useRef,useState} from 'react';
import {createClientEditStore} from '@/lib/bloomops/client-edit-store.mjs';
import {CLIENT_EDIT_DRAFT_PREFIX,DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
import {CLIENT_DETAIL_FIELDS,clientDetailInput,validClientSnapshot} from '@/lib/bloomops/client-edit-values.mjs';
const initial={fields:null,expected:null,pending:null,busy:false,checking:true,ready:false,message:'',errors:{},conflict:false};
const cancelled=()=>new DOMException('This editor is no longer active.','AbortError');
export default function useClientEditDraft({scope,clientId,onSaved}){
 const controls=useRef(null),saved=useRef(onSaved);saved.current=onSaved;
 const [view,setView]=useState(initial),[lost,setLost]=useState(false),[copies,setCopies]=useState([]),[storageError,setStorageError]=useState('');
 const {userId,workspaceId}=scope;
 useEffect(()=>{
  let active=true,store=null,source=null,state={...initial},dirty=false,checkingFlight=false;const flights=new Set();
  const valid=()=>{try{return active&&(!store||store.valid());}catch{return false;}};
  const emit=()=>{if(valid())setView({...state});};
  const list=()=>{if(!valid()||!store||!state.ready)return;try{setCopies(store.list().filter(c=>c.key!==store.own).map(c=>({key:c.key,at:c.value.at})));}catch{setStorageError('Recovery copies could not be read. Keep this tab open.');}};
  function invalidate(clear=false){if(!active)return;if(clear)try{store?.clearClient();}catch{}active=false;for(const f of flights)f.abort();store?.dispose();setLost(true);setCopies([]);setView(initial);}
  function persist(){
   if(!valid()||!dirty)return false;
   try{if(!store)throw Error('This browser cannot keep a recovery copy. Keep this tab open.');if(!store.write(state))return false;
    if(source){store.remove(source.key,source.raw);source=null;}setStorageError('');return true;
   }catch(e){setStorageError(e.message);return false;}
  }
  function retire(){try{store?.write(null);if(source)store?.remove(source.key,source.raw);source=null;setStorageError('');}catch{setStorageError('The saved recovery copy could not be removed from this browser.');}}
  async function request(body){
   if(!valid())throw cancelled();const controller=new AbortController();flights.add(controller);
   try{
    const response=await fetch(`/api/bloomops/clients/${encodeURIComponent(clientId)}`,{method:body?'PATCH':'GET',cache:'no-store',signal:controller.signal,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify({...body,editorScope:{userId,workspaceId}}):undefined});
    let data;try{data=await response.json();}catch{data={};}if(!valid())throw cancelled();
    if([401,403,404].includes(response.status)){invalidate(true);throw cancelled();}
    if(response.ok&&(data.scope?.userId!==userId||data.scope?.workspaceId!==workspaceId||data.clientId!==clientId)){invalidate(true);throw cancelled();}
    return {response,data};
   }finally{flights.delete(controller);}
  }
  async function read(){const {response,data}=await request();if(!response.ok||!validClientSnapshot(data.snapshot))throw Error('Current Client access could not be checked. Try again.');return data.snapshot;}
  async function check(){
   if(!valid()||state.busy||state.checking&&state.ready||checkingFlight)return;checkingFlight=true;state.checking=true;emit();
   try{const snapshot=await read();if(!state.ready){state.expected=snapshot;state.fields=clientDetailInput(snapshot);state.ready=true;state.message='';}list();}
   catch(e){if(valid()&&e.name!=='AbortError')state.message=e.message;}
   finally{checkingFlight=false;if(valid()){state.checking=false;emit();}}
  }
  async function submit(){
   if(!valid()||!state.ready||state.busy||state.checking||state.conflict)return;
   state.busy=true;state.message='';state.errors={};state.pending=state.pending||{...state.fields};dirty=true;persist();emit();
   try{
    const {response,data}=await request({...state.pending,expected:state.expected});
    if(!response.ok){
     if(response.status===409){state.conflict=true;state.pending=null;state.message='The saved Client changed. Your edits are kept. Compare the saved Client, then reload its details before reapplying your changes.';}
     else if(response.status===400){state.pending=null;state.errors=data.errors||{};state.message=data.error||'Check the entered details.';}
     else state.message='The save could not be confirmed. Retry the same save before changing these details.';
     persist();return;
    }
    retire();dirty=false;state.pending=null;emit();saved.current?.(data);
   }catch(e){if(valid()&&e.name!=='AbortError')state.message='The save reply was lost. Your entered details are kept. Retry the same save; if it already succeeded, the saved Client will be protected from overwriting.';}
   finally{if(valid()){state.busy=false;emit();}}
  }
  async function recover(key){
   if(!valid()||!state.ready||state.busy||state.checking)return;
   if(dirty&&!confirm('Replace these fields with the recovery copy? The current copy will remain available.'))return;
   state.checking=true;state.message='';emit();
   try{
    await read();const copy=store?.snapshot(key);if(!copy)throw Error('This recovery copy is no longer available.');
    if(dirty){if(!persist())throw Error('Keep these fields before replacing them.');store=createClientEditStore(localStorage,{userId,workspaceId,clientId},crypto.randomUUID());}
    source={key,raw:copy.raw};state={...state,fields:copy.value.fields,expected:copy.value.expected,pending:copy.value.pending,errors:{},conflict:false,message:'Recovery copy restored for review. Nothing has been saved to the Client.'};dirty=true;persist();list();
   }catch(e){if(valid()&&e.name!=='AbortError')state.message=e.message;}
   finally{if(valid()){state.checking=false;emit();}}
  }
  async function reload(){
   if(!valid()||state.busy||state.checking||!confirm('Reload the saved Client? Your current recovery copy will remain available.'))return;
   state.checking=true;emit();
   try{const snapshot=await read();if(dirty){if(!persist())throw Error('Keep these fields before reloading.');store=createClientEditStore(localStorage,{userId,workspaceId,clientId},crypto.randomUUID());source=null;}
    state={...initial,ready:true,checking:true,fields:clientDetailInput(snapshot),expected:snapshot};dirty=false;list();
   }catch(e){if(valid()&&e.name!=='AbortError')state.message=e.message;}
   finally{if(valid()){state.checking=false;emit();}}
  }
  try{store=createClientEditStore(localStorage,{userId,workspaceId,clientId},crypto.randomUUID());}catch{setStorageError('This browser cannot keep a recovery copy. Keep this tab open.');}
  controls.current={submit,recover,reload,check,
   close(){return !dirty||persist()||confirm('Recovery storage is unavailable. Close and lose these unsaved fields?');},
   edit(key,value){if(!valid()||!state.ready||state.busy||state.checking||state.pending||!CLIENT_DETAIL_FIELDS.includes(key))return;state.fields={...state.fields,[key]:value};dirty=true;persist();emit();},
   discard(key){if(!valid()||state.busy||state.checking||!confirm('Discard this recovery copy?'))return;try{const copy=store?.snapshot(key);if(copy)store.remove(key,copy.raw);list();}catch{setStorageError('This recovery copy could not be removed.');}},
   errors(errors){if(valid()){state.errors=errors;emit();}},
  };
  const context=()=>invalidate(),storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();else if(e.key?.startsWith(CLIENT_EDIT_DRAFT_PREFIX))list();};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=context;}catch{}
  const hide=()=>{persist();invalidate();},beforeUnload=e=>{if(valid()&&dirty){e.preventDefault();e.returnValue='';}};
  const leaving=e=>{const a=e.target.closest?.('a[href]');if(valid()&&dirty&&a&&a.target!=='_blank'&&a.origin===location.origin&&a.pathname!==location.pathname&&!confirm('Leave this editor? Unsaved details remain in this browser only when recovery storage is available.')){e.preventDefault();e.stopPropagation();}};
  document.addEventListener('click',leaving,true);
  addEventListener(DRAFT_CONTEXT_KEY,context);addEventListener('storage',storage);addEventListener('pagehide',hide);addEventListener('beforeunload',beforeUnload);addEventListener('focus',check);addEventListener('pageshow',check);
  void check();
  return()=>{persist();active=false;for(const f of flights)f.abort();store?.dispose();channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,context);removeEventListener('storage',storage);removeEventListener('pagehide',hide);removeEventListener('beforeunload',beforeUnload);removeEventListener('focus',check);removeEventListener('pageshow',check);document.removeEventListener('click',leaving,true);};
 },[userId,workspaceId,clientId]);
 return {view,lost,copies,storageError,close:()=>controls.current?.close()??true,edit:(k,v)=>controls.current?.edit(k,v),submit:()=>controls.current?.submit(),recover:k=>controls.current?.recover(k),discard:k=>controls.current?.discard(k),reload:()=>controls.current?.reload(),check:()=>controls.current?.check(),setErrors:e=>controls.current?.errors(e)};
}
