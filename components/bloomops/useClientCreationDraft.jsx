'use client';
import { useEffect, useRef, useState } from 'react';
import { createClientDraftStore, emptyClientFields, clientDraftDirty, CLIENT_DRAFT_FIELDS } from '@/lib/bloomops/client-draft-store.mjs';
import { CLIENT_DRAFT_PREFIX, DRAFT_CONTEXT_KEY } from '@/lib/bloomops/draft-context.mjs';
const cancelled = () => new DOMException('This form is no longer active.', 'AbortError');
const same = (a,b) => CLIENT_DRAFT_FIELDS.every(key=>a[key]===b[key]);

export default function useClientCreationDraft({userId,workspaceId,onCreated}) {
  const control=useRef(null),createdCallback=useRef(onCreated);createdCallback.current=onCreated;
  const [view,setView]=useState({fields:emptyClientFields(),pending:null,client:null,busy:false,checking:false,message:'',errors:{}});
  const [ready,setReady]=useState(false),[lost,setLost]=useState(false),[copies,setCopies]=useState([]),[storageError,setStorageError]=useState('');
  useEffect(()=>{
    let active=true,store=null,source=null,flight=null,generation=0;
    let state={fields:emptyClientFields(),pending:null,requestId:crypto.randomUUID(),client:null,busy:false,checking:false,message:'',errors:{}};
    const valid=()=>{try{return active&&(!store||store.valid());}catch{return false;}};
    const emit=()=>{if(valid())setView({...state});};
    const list=()=>{if(!valid()||!store)return;try{setCopies(store.list().filter(c=>c.key!==store.own).map(c=>({key:c.key,at:c.value.updatedAt,count:CLIENT_DRAFT_FIELDS.filter(k=>c.value.fields[k]!=='').length})));}catch{setStorageError('Recovery copies could not be read. Keep this tab open until saved.');}};
    const persist=()=>{
      if(!valid())return false;
      try{if(!store)throw Error('This browser could not keep a recovery copy. Keep this tab open until saved.');
        if(!store.write(state))return false;
        // Transfer only after a replacement copy is safely stored. A full or
        // unavailable store leaves the original source available for recovery.
        if(source&&clientDraftDirty(state)){store.remove(source.key,source.raw);source=null;list();}
        setStorageError('');return true;
      }catch(e){setStorageError(e.message);return false;}
    };
    const retire=()=>{try{store?.write(null);if(source)store?.remove(source.key,source.raw);source=null;setStorageError('');list();}catch{setStorageError('The saved recovery copy could not be removed from this browser.');}};
    const invalidate=(clear=false)=>{if(!active)return;if(clear)try{store?.clearScope();}catch{}active=false;flight?.abort();store?.dispose();setLost(true);setCopies([]);};
    async function request(path,body){
      if(!valid())throw cancelled();const controller=new AbortController();flight=controller;
      const response=await fetch(path,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({...body,userId,workspaceId})});
      let data;try{data=await response.json();}catch{data={};}
      if(!valid())throw cancelled();
      if([401,403,404].includes(response.status)){invalidate(true);throw cancelled();}
      return {response,data};
    }
    async function read(requestId){
      const {response,data}=await request('/api/bloomops/clients/recovery',{requestId});
      if(!response.ok)throw Error(data.error||'The saved client could not be checked. Try again.');
      if(data.userId!==userId||data.workspaceId!==workspaceId||data.requestId!==requestId||!(data.client===null||typeof data.client?.id==='string')){invalidate(true);throw cancelled();}
      return data.client;
    }
    async function submit(){
      if(!valid()||state.busy||state.checking||state.client)return;
      state.busy=true;state.message='';state.errors={};emit();
      try{
        // Every retry first reconciles the same request identity. Receipt
        // existence never turns later edits into a second client creation.
        if(state.pending){const client=await read(state.requestId);if(client){state.client=client;state.message='This client was already saved. Your entered details are kept below.';persist();return;}}
        const attempted={...state.fields};state.pending=attempted;persist();
        const {response,data}=await request('/api/bloomops/clients',{...attempted,requestId:state.requestId});
        if(!response.ok){state.errors=data.errors||{};state.message=data.error||'That did not work. Check your connection and try again.';return;}
        if(typeof data.client?.id!=='string')throw Error('The save reply could not be confirmed. Retry to check the saved client.');
        state.client=data.client;
        if(same(state.fields,attempted)){
          retire();state.fields=emptyClientFields();state.pending=null;emit();createdCallback.current?.(data.client.id,attempted.name.trim());
        }else{state.message='Client saved. You entered more details while it was saving; those details are kept here.';persist();}
      }catch(e){if(valid()&&e.name!=='AbortError')state.message=e.message||'That did not work. Check your connection and try again.';}
      finally{if(valid()){state.busy=false;emit();}}
    }
    async function recover(key){
      if(!valid()||state.busy||state.checking)return;
      if(clientDraftDirty(state)&&!confirm('Replace this form with the recovery copy? Your current recovery copy will remain available.'))return;
      const stamp=generation;state.checking=true;state.message='';emit();
      try{
        const copy=store?.snapshot(key);if(!copy)throw Error('This recovery copy is no longer available.');
        const client=await read(copy.value.requestId);
        if(generation!==stamp)throw Error('You changed this form while recovery was being checked. Review the copy again when ready.');
        // Keep a distinct copy of current edits before replacing this writer.
        // The UI keeps fields disabled during recovery, and existing values
        // already have this writer's copy. Refuse replacement if retaining it
        // cannot be confirmed rather than silently discarding it.
        if(clientDraftDirty(state)){
          if(!persist())throw Error('Keep or download this form before replacing it.');
          store=createClientDraftStore(localStorage,{userId,workspaceId},crypto.randomUUID());
        }
        source={key,raw:copy.raw};state={...state,fields:copy.value.fields,pending:copy.value.pending,requestId:copy.value.requestId,client,errors:{},message:client?'This client was already saved. Your entered details are kept below.':'Recovered details are ready to review. Add the client when you are ready.'};generation++;persist();list();
      }catch(e){if(valid()&&e.name!=='AbortError')state.message=e.message;}
      finally{if(valid()){state.checking=false;emit();}}
    }
    async function download(){
      if(!valid()||state.busy||state.checking)return;state.checking=true;state.message='';emit();
      try{await read(state.requestId);if(!valid())return;const url=URL.createObjectURL(new Blob([JSON.stringify({fields:state.fields},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='bloomsi-client-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      catch(e){if(valid()&&e.name!=='AbortError')state.message=e.message;}
      finally{if(valid()){state.checking=false;emit();}}
    }
    try{store=createClientDraftStore(localStorage,{userId,workspaceId},crypto.randomUUID());list();}catch{setStorageError('This browser could not keep a recovery copy. Keep this tab open until saved.');}
    control.current={submit,recover,download,
      edit:(key,value)=>{if(!valid()||state.checking||!CLIENT_DRAFT_FIELDS.includes(key))return;state.fields={...state.fields,[key]:value};generation++;persist();emit();},
      discard:key=>{if(!valid()||state.busy||state.checking||!confirm('Discard this recovery copy?'))return;try{const copy=store?.snapshot(key);if(copy)store.remove(key,copy.raw);list();}catch{setStorageError('The recovery copy could not be removed.');}},
      reset:()=>{if(!valid()||state.busy||state.checking||!confirm('Discard this form and start another client? Download your input first to keep a separate copy.'))return;retire();state={fields:emptyClientFields(),pending:null,requestId:crypto.randomUUID(),client:null,busy:false,checking:false,message:'',errors:{}};generation++;emit();},
      errors:errors=>{if(valid()){state.errors=errors;emit();}},
    };
    const context=()=>invalidate(),storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();else if(e.key?.startsWith(CLIENT_DRAFT_PREFIX))list();};
    let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=context;}catch{}
    const hide=()=>{persist();invalidate();},beforeUnload=e=>{if(valid()&&clientDraftDirty(state)){e.preventDefault();e.returnValue='';}};
    const leaving=e=>{const link=e.target.closest?.('a[href]');if(valid()&&clientDraftDirty(state)&&link&&link.origin===location.origin&&link.pathname!==location.pathname&&!confirm('Leave this form? Unsaved details will remain in this browser when recovery storage is available.')){e.preventDefault();e.stopPropagation();}};
    addEventListener(DRAFT_CONTEXT_KEY,context);addEventListener('storage',storage);addEventListener('pagehide',hide);addEventListener('beforeunload',beforeUnload);document.addEventListener('click',leaving,true);
    setReady(true);emit();
    return()=>{persist();active=false;flight?.abort();store?.dispose();channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,context);removeEventListener('storage',storage);removeEventListener('pagehide',hide);removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',leaving,true);};
  },[userId,workspaceId]);
  return {view,ready,lost,copies,storageError,edit:(key,value)=>control.current?.edit(key,value),submit:()=>control.current?.submit(),recover:key=>control.current?.recover(key),discard:key=>control.current?.discard(key),download:()=>control.current?.download(),reset:()=>control.current?.reset(),setErrors:errors=>control.current?.errors(errors)};
}
