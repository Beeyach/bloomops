'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from './Primitives';
export default function ReportArchive({report,clientId,scope,disabled}){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[blocked,setBlocked]=useState(false);
 const pending=useRef(null),live=useRef(true),flight=useRef(false);
 useEffect(()=>{live.current=true;setReady(true);return()=>{live.current=false;};},[]);
 async function change(){
  if(!ready||disabled||blocked||flight.current)return;
  if(!pending.current&&!window.confirm(report.archivedAt?'Restore this report privately? Previous published versions will remain unavailable to the client.':'Archive this report and remove client access? Saved data and internal publication history will be preserved.'))return;
  flight.current=true;setBusy(true);setError('');
  pending.current||={...scope,requestId:crypto.randomUUID(),expectedRevision:report.revision,archived:!report.archivedAt};
  try{const response=await fetch(`/api/bloomops/clients/${clientId}/reports/${report.id}/archive`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current)}),body=await response.json();if(!live.current)return;
   if(!response.ok){if(response.status<500){pending.current=null;setBlocked(true);}throw Error(body.error||'Archive change could not be confirmed. Retry the same action.');}
   window.location.reload();
  }catch(e){if(live.current)setError(e.message);}finally{if(live.current){flight.current=false;setBusy(false);}}
 }
 return <section aria-label="Report archive"><Button variant="ghost" disabled={!ready||disabled||busy||blocked} onClick={change}>{busy?'Updating report status…':pending.current?'Retry archive change':report.archivedAt?'Restore private draft':'Archive report'}</Button>
 {disabled&&<p>Save or reopen the saved draft before changing archive status.</p>}
 {error&&<div role="alert"><p>{error}</p><Button variant="ghost" href={`/clients/${clientId}/reports/${report.id}`}>Reopen saved report</Button></div>}</section>;
}
