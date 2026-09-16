'use client';
import {useEffect,useRef,useState} from 'react';
import {createProfileDraftStore,profileDraftDirty,chosenProfileSources} from '@/lib/bloomops/profile-drafts.mjs';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
const cancelled=()=>new DOMException('This editor is no longer active.','AbortError');
export default function useProfileDraft({userId,workspaceId,prospectId,section,draft,onRecover,onLost,creating=false,fieldKeys=null}){
 const store=useRef(null),source=useRef(null),latest=useRef(null),callbacks=useRef(null),alive=useRef(false),invalid=useRef(false),pending=useRef(null),sequence=useRef(0);
 latest.current=draft;callbacks.current={onRecover,onLost};
 const [copies,setCopies]=useState([]),[storageError,setStorageError]=useState(''),[recovering,setRecovering]=useState(false),[error,setError]=useState('');
 function valid(){try{return alive.current&&!invalid.current&&(!store.current||store.current.valid());}catch{return false;}}
 function list(){if(!store.current||!valid())return;try{setCopies(store.current.list().filter(c=>c.key!==store.current.own&&c.value.section===section&&(fieldKeys?c.value.fieldSet==='primary_contact':!c.value.fieldSet)).map(c=>({key:c.key,at:c.value.updatedAt,count:new Set([...Object.keys(c.value.fields).filter(k=>(c.value.fields[k]??'')!==(c.value.before[k]??'')),...Object.keys(chosenProfileSources(c.value))]).size})));}catch{setStorageError('Recovery copies could not be read. Keep this tab open until saved.');}}
 function persist(){if(!valid()||!store.current)return;try{const value=latest.current&&profileDraftDirty(latest.current)?latest.current:null;store.current.write(value);if(creating&&value&&source.current){store.current.remove(source.current.key,source.current.raw);source.current=null;list();}setStorageError('');}catch(e){if(alive.current)setStorageError(e.message);}}
 function invalidate(clear=false){if(clear)try{store.current?.clearScope();}catch{}invalid.current=true;sequence.current++;pending.current?.abort();store.current?.dispose();callbacks.current.onLost();}
 useEffect(()=>{
  alive.current=true;invalid.current=false;
  try{store.current=createProfileDraftStore(localStorage,{userId,workspaceId,prospectId},crypto.randomUUID());list();}catch{setStorageError('This browser could not keep a recovery copy. Keep this tab open until saved.');}
  const context=()=>invalidate(),storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();else if(e.key?.startsWith('bloomsi:profile-draft:'))list();};
  let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=context;}catch{}
  const hide=()=>{persist();sequence.current++;pending.current?.abort();};
  addEventListener(DRAFT_CONTEXT_KEY,context);addEventListener('storage',storage);addEventListener('pagehide',hide);
  return()=>{persist();alive.current=false;sequence.current++;pending.current?.abort();store.current?.dispose();channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,context);removeEventListener('storage',storage);removeEventListener('pagehide',hide);};
 },[userId,workspaceId,prospectId,section,creating]);
 useEffect(()=>{persist();},[draft]);
 async function read(creationRequestId){
  if(!valid())throw cancelled();const stamp=++sequence.current;pending.current?.abort();const controller=new AbortController();pending.current=controller;
  const path=creating?'/api/bloomops/prospecting/creation-recovery':'/api/bloomops/prospecting/'+prospectId+'/recovery';
  const response=await fetch(path,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({userId,workspaceId,...(creating?{requestId:creationRequestId}:{})})});
  const body=await response.json();if(!valid()||stamp!==sequence.current)throw cancelled();
  if([401,403,404].includes(response.status)){invalidate(true);throw cancelled();}
  if(!response.ok)throw Error(body.error||'The saved profile could not be checked. Try again.');
  if(body.userId!==userId||body.workspaceId!==workspaceId||(creating?(body.requestId!==creationRequestId||!['ready','created'].includes(body.state)):body.profile?.id!==prospectId)){invalidate(true);throw cancelled();}return body;
 }
 async function recover(key){
  if(recovering||!valid())return;setRecovering(true);setError('');
  try{const checked=store.current?.snapshot(key);if(!checked)throw Error('This recovery copy is no longer available.');const current=await read(checked.value.creationRequestId);if(!valid())return;source.current={key,raw:checked.raw};callbacks.current.onRecover(checked.value,current);}
  catch(e){if(valid()&&e.name!=='AbortError')setError(e.message);}finally{if(alive.current)setRecovering(false);}
 }
 function retire(){if(!valid())return;latest.current=null;try{store.current?.write(null);if(source.current)store.current?.remove(source.current.key,source.current.raw);source.current=null;setStorageError('');list();}catch{setStorageError('The recovery copy could not be removed from this browser.');}}
 function discard(key){if(!valid())return;try{const checked=store.current?.snapshot(key);if(checked)store.current.remove(key,checked.raw);list();}catch{setStorageError('The recovery copy could not be removed.');}}
 return {copies,storageError,recovering,error,read,recover,retire,discard,valid,invalidate};
}
