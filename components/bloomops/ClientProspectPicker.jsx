'use client';
import {useEffect,useRef,useState} from 'react';
import {Button,Field} from './Primitives';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
export default function ClientProspectPicker({workspaceId,userId}){
 const [query,setQuery]=useState(''),[strong,setStrong]=useState(false),[rows,setRows]=useState(null),[page,setPage]=useState(1),[more,setMore]=useState(false),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[lost,setLost]=useState(false);
 const live=useRef(false),generation=useRef(0),request=useRef(null);
 useEffect(()=>{
  live.current=true;const invalidate=()=>{live.current=false;generation.current++;request.current?.abort();setRows(null);setSelected(null);setLost(true);setBusy(false);};
  const storage=event=>{if(event.key===DRAFT_CONTEXT_KEY||event.key===null)invalidate();};let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
  addEventListener(DRAFT_CONTEXT_KEY,invalidate);addEventListener('storage',storage);
  return()=>{live.current=false;generation.current++;request.current?.abort();channel?.close();removeEventListener(DRAFT_CONTEXT_KEY,invalidate);removeEventListener('storage',storage);};
 },[workspaceId,userId]);
 async function read(url,signal){const response=await fetch(url,{cache:'no-store',signal}),body=await response.json();if(!response.ok)throw Error('Prospects could not be loaded. Check your access and try again.');return body;}
 async function run(work){
  if(!live.current)return;const stamp=++generation.current;request.current?.abort();request.current=new AbortController();setBusy(true);setError('');
  try{const result=await work(request.current.signal);if(!live.current||stamp!==generation.current)return;result();}
  catch(e){if(live.current&&stamp===generation.current&&e.name!=='AbortError')setError(e.message);}
  finally{if(live.current&&stamp===generation.current)setBusy(false);}
 }
 function search(next=1){setSelected(null);setRows(null);run(async signal=>{const data=await read('/api/bloomops/prospecting?'+new URLSearchParams({q:query,fit:strong?'strong':'',page:String(next)}),signal);if(!Array.isArray(data.rows))throw Error('Prospects could not be loaded. Try again.');return()=>{setRows(data.rows);setPage(next);setMore(data.more);};});}
 function choose(id){setSelected(null);run(async signal=>{
  const [data,conversion]=await Promise.all([read('/api/bloomops/prospecting/'+encodeURIComponent(id),signal),read('/api/bloomops/prospecting/'+encodeURIComponent(id)+'/conversion',signal)]);
  if(data.profile?.workspaceId!==workspaceId||data.profile.id!==id)throw Error('Your workspace changed. Reload before choosing a prospect.');
  return()=>setSelected({profile:data.profile,receipt:conversion.receipt});
 });}
 return <section className="bo-client-prospect-picker" aria-label="Create from a prospect"><h2>Start from an existing prospect</h2><p>Review saved identity and contact details, then use the client handoff to confirm a sale. Searching and choosing save nothing and stop no outreach. Manual entry below stays separate.</p>
 {lost?<p role="alert">Your account or workspace changed. Reload to continue.</p>:<>
 <form onSubmit={event=>{event.preventDefault();search();}}><Field id="client-prospect-search" label="Find a prospect"><input id="client-prospect-search" className="bo-control" value={query} maxLength={160} onChange={e=>setQuery(e.target.value)}/></Field><label><input type="checkbox" checked={strong} onChange={e=>setStrong(e.target.checked)}/>Strong fit only</label><Button type="submit" disabled={busy} icon="search">Search prospects</Button></form>
 {busy&&<p role="status">Loading prospect choices…</p>}{error&&<p role="alert">{error}</p>}
 {rows&&<ul aria-label="Prospect choices">{rows.map(row=><li key={row.id}><Button disabled={busy} onClick={()=>choose(row.id)} aria-pressed={selected?.profile.id===row.id}>{row.businessName}{row.personName?' ('+row.personName+')':''}</Button></li>)}</ul>}
 {rows?.length===0&&<p>No prospects match this search. Change the search or continue with manual entry.</p>}
 {rows&&(page>1||more)&&<div className="bo-form-actions"><Button disabled={busy||page===1} onClick={()=>search(page-1)}>Previous prospects</Button><span>Page {page}</span><Button disabled={busy||!more} onClick={()=>search(page+1)}>More prospects</Button></div>}
 {selected&&<section aria-label="Selected prospect details"><h3>Review saved prospect details</h3><dl className="bo-facts">{[['Client name',selected.profile.businessName],['Contact name',selected.profile.personName],['Contact email',selected.profile.publicEmail],['Website',selected.profile.website],['Timezone',selected.profile.timeZone]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not recorded'}</dd></div>)}</dl>
 {selected.receipt?<><p>This prospect already has a recorded client conversion. Open that client instead of creating it again.</p><Button href={'/clients/'+selected.receipt.clientId} icon="clients">Open existing client</Button></>:<Button href={'/prospecting/'+selected.profile.id+'/conversion'} variant="primary" icon="clients">Review this prospect’s client handoff</Button>}
 <Button href={'/prospecting/'+selected.profile.id} target="_blank" rel="noopener noreferrer" variant="ghost">Review prospect in a new tab</Button>
 </section>}
 </>}
 </section>;
}
