'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import {Icon} from './Icons';
import ThreadMute from './ThreadMute';
import UserAvatar from './UserAvatar';
import styles from './RecordDiscussion.module.css';
const typeLabels={client:'Client',project:'Project',action:'Task',deliverable:'Deliverable'};
// Keep SSR and first hydration identical; localize only after mount.
const date=(value,local=false)=>local?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):value.slice(0,16).replace('T',' ')+' UTC';
async function request(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options});let result;try{result=await response.json();}catch{}
  if(!response.ok){const error=Error(result?.error||'This could not be saved. Your writing is still here.');error.status=response.status;throw error;}
  return result;
}
export default function RecordDiscussion({initial,workspaceId,api,returnHref,portal=false,readOnly=false}){
  const [ready,setReady]=useState(false),[data,setData]=useState(initial),[threadId,setThreadId]=useState(initial.thread?.id||null),[resolved,setResolved]=useState(Boolean(initial.thread?.resolved||initial.resolved)),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null);
  const draftCopies=useRef({}),version=useRef(0),pending=useRef(false),heading=useRef(null),stateRequest=useRef(null),removeRequests=useRef({});
  function query(thread=threadId,page=1,filter=resolved){const q=new URLSearchParams({page:String(page),resolved:String(filter)});if(thread)q.set('threadId',thread);return q;}
  async function load(thread=threadId,page=1,filter=resolved,{navigate=false}={}){
    const revision=++version.current;setLoading(true);setError('');
    try{const next=await request(`${api}?${query(thread,page,filter)}`);if(revision!==version.current)return;setData(next);setThreadId(thread);setResolved(filter);
      if(navigate){setEditing(null);setNotice('');window.history.replaceState(null,'',`${location.pathname}?${query(thread,page,filter)}`);heading.current?.focus();}
    }catch(err){if(revision===version.current){setError(err.status===404||err.status===403?'This discussion is no longer available.':err.message);if([401,403,404].includes(err.status))setData(null);}}
    finally{if(revision===version.current)setLoading(false);}
  }
  useEffect(()=>{
    const check=async()=>{if(pending.current||document.hidden)return;const revision=version.current;
      try{await request(`${api}?access=true${threadId?`&threadId=${threadId}`:''}`);}catch{if(revision===version.current){version.current++;setData(null);setLoading(false);setError('Access could not be verified. Refresh to continue. Your unsent writing is kept on this screen.');}}};
    const timer=setInterval(check,10000);window.addEventListener('focus',check);window.addEventListener('pageshow',check);
    return()=>{clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);};
  },[api,threadId]);
  useEffect(()=>{setReady(true);const leaving=e=>{if(pending.current||Object.values(draftCopies.current).some(d=>d.body?.trim())){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',leaving);return()=>{version.current++;window.removeEventListener('beforeunload',leaving);};},[]);
  async function mutate(method,payload){if(pending.current)return null;pending.current=true;setBusy(true);setError('');try{return await request(api,{method,headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,...payload})});}catch(err){if([401,403,404].includes(err.status)){version.current++;setData(null);}throw err;}finally{pending.current=false;setBusy(false);}}
  async function toggle(){const target=!data.thread.resolved;const signature=`${threadId}:${data.thread.revision}:${target}`;
    if(stateRequest.current?.signature!==signature)stateRequest.current={signature,requestId:crypto.randomUUID()};
    try{const result=await mutate('PUT',{requestId:stateRequest.current.requestId,threadId,expectedRevision:data.thread.revision,resolved:target});if(!result)return;setNotice(target?'Discussion resolved.':'Discussion reopened.');await load(threadId);}catch(err){setError(err.message);}}
  async function remove(message){const key=`${message.id}:${message.revision}`;removeRequests.current[key]||=crypto.randomUUID();try{const result=await mutate('PATCH',{requestId:removeRequests.current[key],threadId,commentId:message.id,expectedRevision:message.revision,remove:true});if(result){setEditing(null);delete draftCopies.current[`edit:${message.id}`];setNotice('Comment removed. Replies are kept.');await load(threadId,data.page);}}catch(err){setError(err.message);}}
  const canWrite=!readOnly&&data?.canComment;
  return <article className={styles.page}>
    <Button href={returnHref} variant="ghost" icon="chevron-left">{portal?'Back to home':`Back to ${typeLabels[initial.parent.type].toLowerCase()}`}</Button>
    <header className={styles.header}><span className={styles.recordIcon}><Icon name={initial.parent.type==='client'?'clients':initial.parent.type==='action'?'check':'message'} size={21}/></span><div><p className={styles.recordType}>{typeLabels[initial.parent.type]}</p><h1 ref={heading} tabIndex={-1}>{data?.parent.name||'Discussion unavailable'}</h1><p className={styles.subtitle}>Discussion</p></div></header>
    <div className={styles.toolbar}>
      {threadId?<Button variant="ghost" icon="chevron-left" disabled={busy||loading||!ready} onClick={()=>load(null,1,false,{navigate:true})}>All discussions</Button>:<div className={styles.tabs} aria-label="Discussion status"><button aria-pressed={!resolved} disabled={busy||loading||!ready} onClick={()=>load(null,1,false,{navigate:true})}>Open</button><button aria-pressed={resolved} disabled={busy||loading||!ready} onClick={()=>load(null,1,true,{navigate:true})}>Resolved</button></div>}
      <Button variant="ghost" icon="refresh" disabled={busy||loading||!ready} onClick={()=>load(threadId,data?.page||1)}>Refresh</Button>
    </div>
    <div className={styles.feedback} aria-live="polite">{loading?<span role="status">Loading discussion…</span>:notice&&<span role="status">{notice}</span>}</div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {data&&!threadId&&<>
      <ul className={styles.threads}>{data.threads.map(thread=><li key={thread.id}><button disabled={busy||loading||!ready} onClick={()=>load(thread.id,1,false,{navigate:true})}>
        <UserAvatar seed={thread.author} src={`${api}/photos/${thread.id}`} size={32}/><div className={styles.threadText}><strong>{thread.author}</strong><p>{thread.preview}</p><time dateTime={thread.createdAt}>{date(thread.createdAt,ready)}</time></div>
        {!portal&&<Audience value={thread.audience}/>}<Icon name="chevron-right" size={18}/>
      </button></li>)}</ul>
      {!data.threads.length&&<div className={styles.empty}><Icon name="message" size={25}/><div><h2>{resolved?'No resolved discussions':'Start a discussion'}</h2><p>{resolved?'Resolved threads will appear here.':readOnly?'No shared discussions yet.':'Ask a question or leave an update about this record.'}</p></div></div>}
    </>}
    {data&&threadId&&<>
      <div className={styles.threadState}>{!readOnly&&<ThreadMute key={threadId} threadId={threadId} workspaceId={workspaceId}/>}<div className={styles.audienceGroup}>{!portal&&<Audience value={data.thread.audience}/>}<span className={data.thread.resolved?styles.resolved:styles.open}><Icon name={data.thread.resolved?'check':'message'} size={15}/>{data.thread.resolved?'Resolved':'Open'}</span></div>
        {!readOnly&&Boolean(data.thread.canResolve)&&<Button variant="ghost" icon={data.thread.resolved?'refresh':'check'} disabled={busy||loading||!ready} onClick={toggle}>{data.thread.resolved?'Reopen':'Resolve'}</Button>}
      </div>
      <ol className={styles.messages}>{data.messages.map(message=><li key={message.id} className={styles.message}>
        <UserAvatar seed={message.author} src={message.removedAt?null:`${api}/photos/${message.id}`} size={32}/><div className={styles.messageContent}>
          <div className={styles.messageHead}><strong>{message.author}</strong><div className={styles.messageActions}>{!readOnly&&Boolean(message.canEdit)&&<><button type="button" title="Edit comment" aria-label={`Edit comment by ${message.author}`} disabled={busy||loading||!ready} onClick={()=>setEditing(editing===message.id?null:message.id)}><Icon name="edit" size={16}/></button><button type="button" title="Remove comment" aria-label={`Remove comment by ${message.author}`} disabled={busy||loading||!ready} onClick={()=>remove(message)}><Icon name="trash" size={16}/></button></>}</div></div>
          <div className={styles.messageMeta}><time dateTime={message.createdAt}>{date(message.createdAt,ready)}</time>{message.editedAt&&!message.removedAt&&<span>Edited</span>}</div>
          {editing===message.id?<Composer key={`edit:${message.id}`} draftKey={`edit:${message.id}`} copies={draftCopies} message={message} threadId={threadId} audience={data.thread.audience} api={api} saving={busy} busy={busy||loading||!ready} mutate={mutate} onConflict={()=>load(threadId,data.page)} onCancel={()=>{delete draftCopies.current[`edit:${message.id}`];setEditing(null);}} onSaved={async()=>{setEditing(null);setNotice('Comment saved.');await load(threadId,data.page);}}/>:<>
            <p className={message.removedAt?styles.removed:styles.body}>{message.removedAt?'Comment removed':message.body}</p>
            {message.mentions.length>0&&<ul className={styles.mentions} aria-label="Mentioned people">{message.mentions.map(person=><li key={person.id}><span aria-hidden="true">@</span>{person.name}</li>)}</ul>}
          </>}
        </div>
      </li>)}</ol>
    </>}
    {data&&(data.page>1||data.more)&&<nav className={styles.pagination} aria-label={threadId?'Comment pages':'Discussion pages'}><Button disabled={busy||loading||!ready||data.page===1} onClick={()=>load(threadId,data.page-1)}>Previous</Button><span>Page {data.page}</span><Button disabled={busy||loading||!ready||!data.more} onClick={()=>load(threadId,data.page+1)}>Next</Button></nav>}
    {canWrite&&!editing&&(!threadId&&!resolved||threadId&&!data.thread.resolved)&&<Composer key={threadId||'new'} draftKey={threadId||'new'} copies={draftCopies} threadId={threadId} api={api} saving={busy} busy={busy||loading||!ready} mutate={mutate} audience={data.thread?.audience||(portal?'client':'internal')} allowClient={!portal&&!threadId&&data.canStartClient} portal={portal} onSaved={async result=>{setNotice('Comment posted.');await load(result.threadId,1,false,{navigate:true});setNotice('Comment posted.');}}/>}
    {readOnly&&<p className={styles.readOnly}><Icon name="eye" size={16}/>Read-only client preview</p>}
  </article>;
}
function Audience({value}){return <span className={`${styles.audience} ${value==='client'?styles.clientAudience:''}`}><Icon name={value==='client'?'clients':'lock'} size={14}/>{value==='client'?'Shared with client':'Internal'}</span>;}
function Composer({draftKey,copies,message=null,threadId,api,busy,saving=false,mutate,audience,allowClient=false,portal=false,onSaved,onCancel,onConflict}){
  const cached=copies.current[draftKey],defaults=cached||{body:message?.body||'',mentions:message?.mentions||[],audience};
  const [body,setBody]=useState(defaults.body),[selected,setSelected]=useState(defaults.mentions),[visibility,setVisibility]=useState(defaults.audience),[picker,setPicker]=useState(false),[search,setSearch]=useState(''),[options,setOptions]=useState(null),[peopleError,setPeopleError]=useState(''),[error,setError]=useState(''),[conflicted,setConflicted]=useState(false);
  const requestId=useRef(cached?.requestId||null),field=useRef(null),expectedRevision=useRef(cached?.expectedRevision||message?.revision);
  function changed(next){requestId.current=null;const draft={body,mentions:selected,audience:visibility,expectedRevision:expectedRevision.current,...next};copies.current[draftKey]=draft;}
  useEffect(()=>{if(!picker)return;const abort=new AbortController();setOptions(null);setPeopleError('');const timer=setTimeout(async()=>{
    try{const q=new URLSearchParams({people:'true',audience:visibility,search});if(threadId)q.set('threadId',threadId);const result=await request(`${api}?${q}`,{signal:abort.signal});setOptions(result);}catch(err){if(err.name!=='AbortError')setPeopleError('People could not load. Try reopening Mention.');}
  },180);return()=>{clearTimeout(timer);abort.abort();};},[picker,search,visibility,threadId,api]);
  async function submit(e){e.preventDefault();if(busy||!body.trim()||message?.removedAt)return;setError('');if(conflicted&&message){expectedRevision.current=message.revision;requestId.current=null;setConflicted(false);}requestId.current||=crypto.randomUUID();copies.current[draftKey]={body,mentions:selected,audience:visibility,requestId:requestId.current,expectedRevision:expectedRevision.current};
    try{const result=await mutate(message?'PATCH':'POST',{requestId:requestId.current,threadId,body,mentions:selected.map(p=>p.id),...(message?{commentId:message.id,expectedRevision:expectedRevision.current,remove:false}:{audience:visibility})});
      if(result){delete copies.current[draftKey];setBody('');setSelected([]);requestId.current=null;await onSaved(result);}
    }catch(err){setError(err.message);if(err.status===409&&message){setConflicted(true);await onConflict?.();}field.current?.focus();}}
  return <form className={styles.composer} onSubmit={submit}>
    <div className={styles.composerHead}><label htmlFor={`discussion-writing-${draftKey}`}>{message?'Edit comment':threadId?'Reply':'New discussion'}</label>{!portal&&!message&&(allowClient?<label className={styles.visibility}>Audience<select aria-label="Discussion audience" value={visibility} disabled={busy} onChange={e=>{setVisibility(e.target.value);setSelected([]);changed({audience:e.target.value,mentions:[]});}}><option value="internal">Internal</option><option value="client">Shared with client</option></select></label>:<Audience value={visibility}/>)}</div>
    <textarea ref={field} id={`discussion-writing-${draftKey}`} rows={3} maxLength={8000} value={body} disabled={busy} placeholder="Write a message…" onChange={e=>{setBody(e.target.value);changed({body:e.target.value});}}/>
    {conflicted&&message&&<div className={styles.conflict}><strong>{message.removedAt?'Comment was removed':'Current saved comment'}</strong><p>{message.removedAt?'Copy your writing before cancelling.':message.body}</p></div>}
    {selected.length>0&&<ul className={styles.mentions} aria-label="Selected mentions">{selected.map(person=><li key={person.id}>@{person.name}<button type="button" aria-label={`Remove mention of ${person.name}`} disabled={busy} onClick={()=>{const next=selected.filter(p=>p.id!==person.id);setSelected(next);changed({mentions:next});}}><Icon name="x" size={14}/></button></li>)}</ul>}
    <div className={styles.composerActions}><Button variant="ghost" disabled={busy} aria-expanded={picker} onClick={()=>setPicker(!picker)}>@ Mention</Button><div>{onCancel&&<Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>}<Button type="submit" variant="primary" icon={message?'check':'send'} disabled={busy||!body.trim()||Boolean(message?.removedAt)}>{saving?'Saving…':message?(conflicted?'Save my version':'Save comment'):threadId?'Post reply':'Post comment'}</Button></div></div>
    {picker&&<div className={styles.picker}><label htmlFor={`discussion-people-${draftKey}`}>Find a person</label><input id={`discussion-people-${draftKey}`} value={search} onChange={e=>setSearch(e.target.value)} maxLength={80} placeholder="Search by name"/>
      {peopleError?<p role="alert">{peopleError}</p>:!options?<p role="status">Loading people…</p>:<><ul>{options.people.map(person=><li key={person.id}><button type="button" disabled={busy||selected.length>=8||selected.some(p=>p.id===person.id)} onClick={()=>{const next=[...selected,person];setSelected(next);changed({mentions:next});setPicker(false);field.current?.focus();}}><span aria-hidden="true">@</span>{person.name}</button></li>)}</ul>{!options.people.length&&<p>No available people.</p>}{options.more&&<p>Type a name to narrow the list.</p>}</>}
    </div>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </form>;
}
