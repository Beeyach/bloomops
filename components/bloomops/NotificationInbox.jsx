'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import {Icon} from './Icons';
import styles from './NotificationInbox.module.css';
const api='/api/bloomops/notifications';
const labels={mentions:'Mentions',replies:'Replies',assignments:'Assignments'};
const icons={mentions:'at-sign',replies:'message',assignments:'check'};
import {notificationRequest} from '@/lib/bloomops/notification-client.mjs';

// A new authenticated scope owns fresh state and invalidates the old instance.
export default function NotificationInbox(props){
 const {workspaceId,userId,membershipId}=props.scope;
 return <ScopedNotificationInbox key={JSON.stringify([workspaceId,userId,membershipId])} {...props}/>;
}
function ScopedNotificationInbox({initial,scope}){
 const [data,setData]=useState(initial),[category,setCategory]=useState('all'),[unread,setUnread]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[settings,setSettings]=useState(null),[showSettings,setShowSettings]=useState(false),[ready,setReady]=useState(false);
 const [settingsBusy,setSettingsBusy]=useState(false),[settingsError,setSettingsError]=useState(''),[mutationBusy,setMutationBusy]=useState(false);
 const version=useRef(0),settingsVersion=useRef(0),mutationVersion=useRef(0),alive=useRef(true),lost=useRef(false),pending=useRef(false),current=useRef({category,unread,page:data?.page||1});current.current={category,unread,page:data?.page||1};
 const active=()=>alive.current&&!lost.current;
 const sameScope=value=>value?.scope?.workspaceId===scope.workspaceId&&value.scope.userId===scope.userId&&value.scope.membershipId===scope.membershipId;
 function loseScope(){
  lost.current=true;version.current++;settingsVersion.current++;mutationVersion.current++;
  setData(null);setSettings(null);setBusy(false);setSettingsBusy(false);setMutationBusy(false);setReady(false);
  setError('Your account or workspace changed. Reload this page.');setSettingsError('');
 }
 async function load(nextCategory=category,nextUnread=unread,page=1,{quiet=false}={}){
  if(!active())return;const run=++version.current;setBusy(!quiet);setError('');
  const valid=()=>active()&&run===version.current;
  try{const next=await notificationRequest(`${api}?${new URLSearchParams({category:nextCategory,unread:String(nextUnread),page:String(page)})}`);if(!valid())return;
   if(!sameScope(next)){loseScope();return;}
   setData(next);setCategory(nextCategory);setUnread(nextUnread);
  }catch(e){if(valid()){if([401,403,404].includes(e.status))loseScope();else{setError(e.message);if(quiet)setData(null);}}}finally{if(valid())setBusy(false);}
 }
 useEffect(()=>{alive.current=true;setReady(true);const refresh=()=>{if(document.hidden||pending.current||!active())return;const s=current.current;load(s.category,s.unread,s.page,{quiet:true});};
  const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);
  return()=>{alive.current=false;version.current++;settingsVersion.current++;mutationVersion.current++;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};},[]);
 async function mutate(payload){
  if(pending.current||!active())return;pending.current=true;const run=++mutationVersion.current;version.current++;setBusy(false);setMutationBusy(true);setNotice('');
  const preference=payload.action==='preferences',setFailure=preference?setSettingsError:setError;setFailure('');
  if(preference){settingsVersion.current++;setSettingsBusy(false);}
  const valid=()=>active()&&run===mutationVersion.current;
  try{const result=await notificationRequest(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...scope,...payload})});if(!valid())return;
   if(payload.action==='open'){window.location.assign(result.href);return;}
   if(preference)setSettings(old=>({...old,[payload.category]:payload.enabled}));
   setNotice(preference?'Preference saved.':payload.action==='markAll'?'Notifications marked read.':'Notification updated.');await load(category,unread,data?.page||1);
  }catch(e){if(valid()){if([401,403,404].includes(e.status))loseScope();else setFailure(e.message);}}finally{if(valid()){pending.current=false;setMutationBusy(false);}}
 }
 async function preferences(){
  if(!active())return;const run=++settingsVersion.current;setShowSettings(!showSettings);setSettingsError('');
  if(showSettings){setSettingsBusy(false);setSettings(null);return;}
  setSettingsBusy(true);setSettings(null);const valid=()=>active()&&run===settingsVersion.current;
  try{const next=await notificationRequest(api+'?settings=true');if(!valid())return;if(!sameScope(next)){loseScope();return;}setSettings(next);
  }catch(e){if(valid()){if([401,403,404].includes(e.status))loseScope();else setSettingsError(e.message);}}finally{if(valid())setSettingsBusy(false);}
 }
 const disabled=busy||mutationBusy||!ready;
 return <article className={styles.page}>
  <header className={styles.header}><span className={styles.headingIcon}><Icon name="bell" size={23}/></span><div><h1>Notifications</h1><p>{data?`${data.unread} unread${category==='all'?'':` in ${labels[category].toLowerCase()}`}`:'Inbox unavailable'}</p></div><Button variant="ghost" icon="settings" onClick={preferences} disabled={mutationBusy||!ready} aria-expanded={showSettings}>Preferences</Button></header>
  {showSettings&&<section className={styles.preferences} aria-label="Notification preferences"><h2>Notify me about</h2><p>Applies to new notifications in this workspace.</p>{settings?Object.entries(labels).map(([key,label])=><label key={key}><Icon name={icons[key]} size={18}/><span>{label}</span><input type="checkbox" checked={settings[key]} disabled={settingsBusy||mutationBusy||!ready} onChange={e=>mutate({action:'preferences',category:key,enabled:e.target.checked})}/></label>):<p role="status">{settingsBusy?'Loading preferences…':'Preferences unavailable.'}</p>}{settingsError&&<p role="alert">{settingsError}</p>}</section>}
  <div className={styles.toolbar}><div className={styles.tabs} aria-label="Notification status"><button aria-pressed={!unread} disabled={disabled} onClick={()=>load(category,false)}>All</button><button aria-pressed={unread} disabled={disabled} onClick={()=>load(category,true)}>Unread</button></div><label className={styles.filter}>Type<select value={category} disabled={disabled} onChange={e=>load(e.target.value,unread)}><option value="all">All types</option>{Object.entries(labels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><Button variant="ghost" icon="refresh" disabled={disabled} onClick={()=>load(category,unread,data?.page||1)}>Refresh</Button></div>
  <div className={styles.listTools}><span>{category==='all'?'This workspace':labels[category]}</span><Button variant="ghost" icon="check" disabled={disabled||!data?.unread} onClick={()=>mutate({action:'markAll',category,cutoff:data.cutoff})}>Mark all read</Button></div>
  <div className={styles.feedback} role="status">{busy||mutationBusy?'Updating…':notice}</div>{error&&<p className={styles.error} role="alert">{error}</p>}
  {data&&<><ul className={styles.list}>{data.items.map(item=><li key={item.id} className={item.readAt?'':styles.unread}>
   <span className={`${styles.categoryIcon} ${styles[item.category]}`}><Icon name={icons[item.category]} size={19}/></span>
   <button className={styles.destination} disabled={disabled} onClick={()=>mutate({action:'open',id:item.id})}><span className={styles.event}><strong>{item.author}</strong> {item.category==='mentions'?'mentioned you':item.category==='assignments'?'assigned you a task':'replied to your conversation'}</span><span className={styles.target}>{item.title}</span><span className={styles.meta}><span>{labels[item.category]}</span><time dateTime={item.createdAt}>{ready?new Date(item.createdAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):item.createdAt.slice(0,10)}</time></span></button>
   <button className={styles.readButton} disabled={disabled} aria-label={`${item.readAt?'Mark unread':'Mark read'}: ${item.title}`} title={item.readAt?'Mark unread':'Mark read'} onClick={()=>mutate({action:'read',id:item.id,read:!item.readAt})}><Icon name={item.readAt?'mail':'check'} size={18}/><span className={styles.readText}>{item.readAt?'Read':'Unread'}</span></button>
  </li>)}</ul>{!data.items.length&&<div className={styles.empty}><Icon name="bell" size={26}/><h2>{unread?'You’re all caught up':'No notifications yet'}</h2><p>{unread?'New notifications will appear here.':'Mentions, replies and task assignments will appear here.'}</p></div>}
  {(data.page>1||data.more)&&<nav className={styles.pagination} aria-label="Notification pages"><Button disabled={disabled||data.page===1} onClick={()=>load(category,unread,data.page-1)}>Previous</Button><span>Page {data.page}</span><Button disabled={disabled||!data.more} onClick={()=>load(category,unread,data.page+1)}>Next</Button></nav>}</>}
 </article>;
}
