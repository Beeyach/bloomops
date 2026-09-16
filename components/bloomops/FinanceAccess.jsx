'use client';
import {useState,useRef,useEffect} from 'react';
import {Button} from './Primitives';
export default function FinanceAccess({member,scope}){
 const [ready,setReady]=useState(false);
 const [mode,setMode]=useState(member.mode),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),live=useRef(true);
 useEffect(()=>{live.current=true;setReady(true);return()=>{live.current=false;};},[]);
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const res=await fetch('/api/bloomops/finance-access/'+member.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...scope,targetUserId:member.userId,mode})});if(!live.current)return;if(!res.ok)throw Error('Could not update access. Check your current permissions and retry.');setMessage('Finance access saved.');}catch(e){if(live.current)setMessage(e.message);}finally{if(live.current)setBusy(false);}}
 return <form onSubmit={save} className="bo-finance-row" aria-label={member.name+' Finance access'}><h2 className="bo-h3">{member.name}</h2><p>{member.role.replaceAll('_',' ')}</p>{member.role==='owner'?<p>Owner: view and edit (inherent access).</p>:<><label>Finance access for {member.name}<select aria-label={'Finance access for '+member.name} disabled={!ready||busy} value={mode} onChange={e=>setMode(e.target.value)}><option value="none">None</option><option value="view">View</option><option value="edit">View and edit</option></select></label><Button type="submit" loading={busy} disabled={!ready||busy}>Save access</Button></>}<p role="status">{ready?message:'Loading access controls…'}</p></form>;
}
