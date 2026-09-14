'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Status} from './Primitives';
export default function ProspectGoogleConnection({data,outcome,dirty=false,onChecked}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(false);const pending=useRef(false),notice=useRef(null),latest=useRef({data,dirty});latest.current={data,dirty};
 useEffect(()=>setReady(true),[]);useEffect(()=>{if(error||checked)notice.current?.focus();},[error,checked]);
 useEffect(()=>{setChecked(false);setError('');},[data.workspaceId,data.senderRevision,dirty]);
 async function check(){if(!ready||dirty||pending.current)return;pending.current=true;setBusy(true);setError('');setChecked(false);try{
  const response=await fetch('/api/bloomops/prospecting/google/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:data.workspaceId,senderRevision:data.senderRevision,expectedRevision:data.revision})}),result=await response.json();
  const current=await onChecked();
  if(latest.current.dirty||latest.current.data.senderRevision!==data.senderRevision)return;
  if(!response.ok||result.status!=='healthy')throw new Error(result.error||'Google could not be checked. Try again.');
  if(current.connected)setChecked(true);
 }catch(e){setError(e instanceof TypeError?'Check your connection and retry.':e.message);}finally{pending.current=false;setBusy(false);}}
 async function act(disconnect=false){if(!ready||dirty||pending.current)return;pending.current=true;setBusy(true);setError('');try{const response=await fetch('/api/bloomops/prospecting/google/'+(disconnect?'disconnect':'start'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId:data.workspaceId,expectedRevision:data.revision,...(!disconnect?{senderRevision:data.senderRevision}:{})})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Google connection is unavailable. Try again.');window.location.assign(disconnect?'/prospecting/sender':result.url);}catch(e){setError(e instanceof TypeError?'Check your connection and retry.':e.message);pending.current=false;setBusy(false);}}
 const labels={'checking':'Checking connection','check-failed':'Check unavailable','check-needed':'Check needed','reconnect':'Reconnect needed','not-connected':'Not connected','connected':'Connected'};
 return <section className="bo-google-connection"><h2>Google connection</h2><Status tone={data.connected?'success':data.status==='reconnect'?'warning':'neutral'} label={labels[data.status]||'Not connected'}/>
 {outcome==='connected'&&data.connected&&<p role="status">Google connection verified. Sending is still off.</p>}{outcome==='cancelled'&&<p role="status">Google sign-in was cancelled.</p>}{outcome==='unavailable'&&<p role="alert">Google connection could not be completed. Check the account and permissions, then try again.</p>}
 {data.accountEmail?<p>Connected account: {data.accountEmail}</p>:<p>{data.configured?'Use a Google account that can send from the saved address.':'Google sign-in is not available on this deployment yet.'}</p>}
 {data.checkedAt&&<p className="bo-hint">Last checked <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString('en-US',{timeZone:'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} UTC</time></p>}
 {data.status==='check-needed'&&<p>Check Google access to refresh this connection. Sending is off.</p>}
 {data.status==='check-failed'&&!error&&<p>Google could not be checked. Your saved connection is retained.</p>}
 {data.status==='reconnect'&&!error&&<p>Google access needs to be reconnected before it can be used.</p>}
 {data.status==='checking'&&<p>A check is in progress. Reload this page shortly.</p>}
 {(error||checked)&&<p ref={notice} tabIndex={-1} role={error?'alert':'status'} className="bo-skill-notice">{error||'Google connection checked. Sending is still off.'}</p>}
 {data.hasStoredGrant&&<><div className="bo-google-actions">{data.canCheck&&<Button icon="refresh" disabled={!ready||busy||dirty} loading={busy} onClick={check}>Check connection</Button>}<Button variant="ghost" disabled={!ready||busy||dirty} onClick={()=>act(true)}>Disconnect from workspace</Button></div><p className="bo-hint">Disconnect removes the saved connection here. Other Google grants are unchanged.</p></>}{!data.connected&&!['checking','check-needed','check-failed'].includes(data.status)&&<><Button icon="mail" disabled={!ready||busy||dirty||!data.configured||!data.senderEmail} loading={busy} onClick={()=>act()}>Connect Google</Button><p className="bo-hint">Save sender changes first. Connection checks the address and permissions; it does not enable sending.</p></>}
 </section>;
}
