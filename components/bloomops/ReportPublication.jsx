'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
import PublishedReportContent from './PublishedReportContent';
export default function ReportPublication({initial,clientId,reportId,scope}){
 const [data,setData]=useState(initial),[ack,setAck]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[ready,setReady]=useState(false);
 const live=useRef(true),read=useRef(0),write=useRef(0),pending=useRef(null),inFlight=useRef(false);
 const api=`/api/bloomops/clients/${clientId}/reports/${reportId}/publications`;
 useEffect(()=>{live.current=true;setReady(true);async function refresh(){const g=++read.current;setChecking(true);try{const r=await fetch(api,{cache:'no-store'}),b=await r.json();if(!live.current||g!==read.current)return;if(!r.ok||b.scope?.workspaceId!==scope.workspaceId||b.scope?.userId!==scope.userId){write.current++;setData(null);setError('Publication access changed. Reopen the report.');}else if(!inFlight.current&&!pending.current){setData(b);setAck(false);}}catch{if(live.current&&g===read.current){setData(null);setError('Could not verify current access. Reload to retry.');write.current++;}}finally{if(live.current&&g===read.current)setChecking(false);}}
 window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);return()=>{live.current=false;read.current++;write.current++;window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};},[api,scope.userId,scope.workspaceId]);
 async function change(kind){if(!ready||inFlight.current||checking)return;inFlight.current=true;setBusy(true);setError('');const g=++write.current;
 const body=pending.current||{...scope,requestId:crypto.randomUUID(),expectedRevision:data.review.draftRevision,expectedSequence:data.review.current?.sequence||0,kind,acknowledgeUnverified:ack};pending.current=body;
 try{const r=await fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!live.current||g!==write.current)return;if(!r.ok){if(r.status<500)pending.current=null;if([401,403,404].includes(r.status))setData(null);throw Error(b.error||'Publication could not be confirmed. Retry the same operation.');}window.location.reload();}catch(e){if(live.current&&g===write.current)setError(e.message);}finally{if(live.current&&g===write.current){inFlight.current=false;setBusy(false);}}}
 if(!data)return <p role="alert">{error}</p>;
 const {review,history}=data,locked=!ready||busy||checking||!!pending.current;
 return <div className="bo-report"><Button variant="ghost" href={`/clients/${clientId}/reports/${reportId}`}>Back to saved draft</Button><h1>Publication review</h1>
 <p>Review saved draft revision {review.draftRevision}. Publishing freezes the content below. Draft edits never change a published version. Internal commentary and source notes are excluded.</p>
 <p role="status">{busy?'Recording publication change…':checking?'Checking current access…':review.archived?'Archived. Internal history is preserved.':review.hiddenByArchive?'Private after archive. Publish a reviewed new version to restore client access.':review.current?.kind==='publish'?`Published version ${review.current.sequence} is available to the authorized client.`:review.current?'Withdrawn from client access. History is preserved.':'Private draft. No client version exists.'}</p>
 {error&&<div role="alert"><p>{error}</p><Button variant="ghost" href={`/clients/${clientId}/reports/${reportId}/publication`}>Reload publication review</Button></div>}
 {review.canEdit&&<><label><input type="checkbox" checked={ack} disabled={locked} onChange={e=>setAck(e.target.checked)}/>I reviewed this saved content and acknowledge that the manual and CSV observations are unverified.</label>
 {review.comparisonUnavailable&&<p>The comparison is unavailable. Choose another prior publication or remove it and save before publishing. Withdrawal remains available.</p>}
 {!review.hasPortalRecipient&&<p>Complete Client activation and portal invitation acceptance before publishing.</p>}
 <div className="bo-form-actions">{pending.current?<Button disabled={busy||checking} onClick={()=>change(pending.current.kind)}>Retry publication change</Button>:<><Button disabled={locked||!ack||!review.hasPortalRecipient||review.comparisonUnavailable} onClick={()=>change('publish')}>{review.current?'Publish reviewed revision':'Publish reviewed report'}</Button>{review.current?.kind==='publish'&&<Button variant="ghost" disabled={locked} onClick={()=>change('withdraw')}>Withdraw client access</Button>}</>}</div><p>Withdrawal blocks future client views and downloads. Files already downloaded cannot be recalled. Publishing sends no email or notification.</p></>}
 <PublishedReportContent snapshot={review.snapshot}/>
 <h2>Publication history</h2>{history.items.length?<ul>{history.items.map(item=><li key={item.id}>{item.kind==='publish'?<a href={`/clients/${clientId}/reports/${reportId}/versions/${item.id}`}>Published version {item.version}: {item.publishedAt}</a>:<>Client access withdrawn: {item.createdAt}</>}</li>)}</ul>:<p>No publication history yet.</p>}{history.more&&<p>Showing the latest 20 changes.</p>}
 </div>;
}
