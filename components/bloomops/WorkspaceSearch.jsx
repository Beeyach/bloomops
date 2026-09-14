'use client';
import {useEffect,useRef,useState} from 'react';
import {SEARCH_TYPES,searchTypes} from '@/lib/bloomops/search-values.mjs';
import {DRAFT_CONTEXT_KEY} from '@/lib/bloomops/draft-context.mjs';
import {PageHeader,Button} from './Primitives';
import {Icon} from './Icons';
import ProspectAvatar from './ProspectAvatar';

export default function WorkspaceSearch({userId,workspaceId,workspaceName,portal=false}) {
  const [q,setQ]=useState(''),[type,setType]=useState('all'),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[lost,setLost]=useState(false);
  const pending=useRef(null),sequence=useRef(0),mounted=useRef(false),report=useRef(null);
  function clear(){sequence.current++;pending.current?.abort();pending.current=null;setData(null);setBusy(false);}
  useEffect(()=>{
    mounted.current=true;
    const invalidate=()=>{clear();setLost(true);};
    const storage=e=>{if(e.key===DRAFT_CONTEXT_KEY||e.key===null)invalidate();};
    const hide=()=>{if(document.hidden)clear();};
    const show=e=>{if(e.persisted)clear();};
    let channel;try{channel=new BroadcastChannel(DRAFT_CONTEXT_KEY);channel.onmessage=invalidate;}catch{}
    window.addEventListener(DRAFT_CONTEXT_KEY,invalidate);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',clear);window.addEventListener('pageshow',show);
    return()=>{mounted.current=false;sequence.current++;pending.current?.abort();channel?.close();window.removeEventListener(DRAFT_CONTEXT_KEY,invalidate);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',clear);window.removeEventListener('pageshow',show);};
  },[userId,workspaceId]);
  async function search(nextType=type,page=1){
    if(lost)return;clear();setError('');setType(nextType);
    const text=q.trim();if(text.length<2||text.length>120){setError('Enter at least 2 characters.');return;}
    const stamp=sequence.current,controller=new AbortController();pending.current=controller;setBusy(true);
    try{
      const r=await fetch('/api/bloomops/search',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({userId,workspaceId,q:text,type:nextType,page})});
      const body=await r.json();if(!mounted.current||stamp!==sequence.current)return;
      if([401,403].includes(r.status)){setLost(true);throw Error('Your account or workspace access changed. Reload to continue.');}
      if(!r.ok)throw Error(body.error||'Search could not load. Try again.');
      if(body.userId!==userId||body.workspaceId!==workspaceId){setLost(true);throw Error('Your account or workspace access changed. Reload to continue.');}
      setData(body);requestAnimationFrame(()=>report.current?.focus());
    }catch(e){if(mounted.current&&stamp===sequence.current&&e.name!=='AbortError')setError(e.message==='Failed to fetch'?'Search could not connect. Try again.':e.message);}
    finally{if(mounted.current&&stamp===sequence.current)setBusy(false);}
  }
  const total=data?.groups.reduce((n,g)=>n+g.rows.length,0)||0;
  return <div className="bo-workspace-search">
    <PageHeader title="Search" subtitle={workspaceName}/>
    {lost?<div role="alert"><p>Your account or workspace access changed.</p><Button onClick={()=>window.location.reload()}>Reload</Button></div>:<>
      <form role="search" aria-label="Workspace search" className="bo-search-form" onSubmit={e=>{e.preventDefault();search();}}>
        <label htmlFor="workspace-search-query">{portal?'Find a shared page or file':'Find a record'}<span className="bo-search-input"><Icon name="search" size={20}/><input id="workspace-search-query" type="search" value={q} maxLength={120} autoComplete="off" placeholder="Search by name or title" onChange={e=>{clear();setError('');setQ(e.target.value);}}/></span></label>
        <label htmlFor="workspace-search-type">Record type<select id="workspace-search-type" className="bo-control" value={type} onChange={e=>{clear();setError('');setType(e.target.value);}}><option value="all">All types</option>{searchTypes(portal).map(t=><option key={t} value={t}>{SEARCH_TYPES[t].label}</option>)}</select></label>
        <Button type="submit" variant="primary" loading={busy}>Search</Button>
      </form>
      {error&&<p className="bo-search-error" role="alert">{error}</p>}
      {busy?<div role="status" className="bo-search-loading"><span>Searching…</span><div aria-hidden="true">{[0,1,2].map(n=><div key={n} className="bo-search-skeleton"/>)}</div></div>:data?<section ref={report} tabIndex={-1} aria-label="Search results" className="bo-search-results">
        <p className="bo-search-summary" role="status">{total?`${total} results shown for “${data.q}”`:`No matching records for “${data.q}”`}</p>
        {!total&&<p>Try another name or a different record type.</p>}
        {data.groups.filter(g=>g.rows.length).map(group=>{const meta=SEARCH_TYPES[group.type];return <section key={group.type} aria-labelledby={'search-group-'+group.type} className="bo-search-group">
          <div className="bo-search-group-head"><span className={'bo-search-type-icon '+meta.tone}><Icon name={meta.icon} size={20}/></span><h2 id={'search-group-'+group.type}>{meta.label}</h2></div>
          <ul>{group.rows.map(row=><li key={row.id}><a className="bo-search-result" href={row.href}>
            {group.type==='prospects'?<ProspectAvatar id={row.id} website={row.website}/>:<span className={'bo-search-record-icon '+meta.tone}><Icon name={meta.icon} size={18}/></span>}
            <span className="bo-search-record-text"><strong>{row.title}</strong>{row.detail&&row.detail!==row.title&&<span>{row.detail}</span>}{group.rows.filter(r=>r.title===row.title).length>1&&<small>Reference {row.id.slice(-8)}</small>}</span>
            <Icon name={group.type==='files'?'download':'chevron-right'} size={18}/>{group.type==='files'&&<span className="sr-only">Download file</span>}
          </a></li>)}</ul>
          {data.type==='all'&&group.more&&<Button onClick={()=>search(group.type,1)}>More {meta.label.toLowerCase()}</Button>}
        </section>;})}
        {data.type!=='all'&&<nav aria-label="Search result pages" className="bo-search-pagination"><Button disabled={data.page===1} onClick={()=>search(data.type,data.page-1)}>Previous</Button><span>Page {data.page}</span><Button disabled={!data.groups[0]?.more||data.page===100} onClick={()=>search(data.type,data.page+1)}>Next</Button></nav>}
      </section>:!error&&<div className="bo-search-empty"><Icon name="search" size={28}/><h2>{portal?'Your shared pages and files':'One place to find your work'}</h2><p>{portal?'Search the names of pages and files shared with you.':'Search prospects, clients, tasks, pages and files in this workspace.'}</p></div>}
    </>}
  </div>;
}
