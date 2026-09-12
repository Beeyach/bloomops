import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {listProspects} from '@/lib/bloomops/prospects.mjs';
import {PROSPECT_FIT,safeProspectUrl} from '@/lib/bloomops/prospect-values.mjs';
import {PageHeader,Button,Field,Status,EmptyState} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export const metadata={title:'Prospects'};
export default async function ProspectsPage({searchParams}){
 const {access,actor}=await requireShell('internal');if(!evaluate(actor,{action:'prospecting.view'}).allowed)notFound();
 if(access.workspace.purpose!=='prospecting')return <div className="bo-prospect-page"><PageHeader title="Prospecting" subtitle="A focused place for your next client relationships."/><section className="bo-prospect-setup"><h2>Start with a fresh workspace</h2><p className="bo-body">Keep prospecting separate from your existing agency work. Choose or create a prospecting workspace to begin.</p><Button href="/workspaces" variant="primary">Choose workspace</Button></section></div>;
 const result=await listProspects(access.db,actor,await searchParams);
 const link=page=>'/prospecting?'+new URLSearchParams({q:result.q||'',fit:result.fit||'',page:String(page)});
 return <div className="bo-prospect-page"><PageHeader title="Prospects" subtitle="People and businesses you’re considering." actions={<Button href="/prospecting/new" variant="primary" icon="plus">New prospect</Button>}/>
  <form method="get" className="bo-prospect-search" role="search"><Field id="prospect-search" label="Search prospects"><input id="prospect-search" name="q" className="bo-control" type="search" maxLength={160} defaultValue={result.q||''}/></Field><Button type="submit">Search</Button>
   <details className="bo-prospect-filters"><summary>Filters</summary><Field id="prospect-fit-filter" label="Fit"><select id="prospect-fit-filter" name="fit" className="bo-control" defaultValue={result.fit||''}><option value="">Any fit</option>{Object.entries(PROSPECT_FIT).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Button type="submit">Apply filters</Button></details>
  </form>
  {result.invalid?<div className="bo-prospect-notice" role="alert">These filters are unavailable. <a href="/prospecting">Reset filters</a></div>:result.rows.length?<ul className="bo-prospect-list" aria-label="Prospects">{result.rows.map(row=><li key={row.id}>
   <div className="bo-prospect-list-identity"><h2><a href={`/prospecting/${row.id}`}>{row.businessName}</a></h2><span className="bo-prospect-label">Person</span><p>{row.personName||'Not recorded'}</p></div>
   <dl><div><dt>Website</dt><dd>{safeProspectUrl(row.website)?<a href={safeProspectUrl(row.website)} target="_blank" rel="noreferrer">{new URL(row.website).hostname}</a>:'Unknown'}</dd></div><div><dt>Platform</dt><dd>{row.platform||'Unknown'}</dd></div></dl>
   <div className="bo-prospect-list-fit"><span className="bo-prospect-label">Fit</span><Status tone={row.fit==='strong'?'success':row.fit==='hold'?'warning':'neutral'} label={PROSPECT_FIT[row.fit]}/>{row.fitReason&&<p>{row.fitReason.length>160?row.fitReason.slice(0,157)+'…':row.fitReason}</p>}</div>
   <Button href={`/prospecting/${row.id}`} aria-label={`Open ${row.businessName}`} icon="chevron-right">Open</Button>
  </li>)}</ul>:<EmptyState title={result.q||result.fit?'No matching prospects':'Your prospect list is empty'} actions={<Button href={result.q||result.fit?'/prospecting':'/prospecting/new'}>{result.q||result.fit?'Reset filters':'Add your first prospect'}</Button>}>{result.q||result.fit?'Try a different search or fit filter.':'Add a prospect manually to start a structured profile.'}</EmptyState>}
  {!result.invalid&&<nav aria-label="Prospect pages" className="bo-prospect-pagination">{result.page>1&&<Button href={link(result.page-1)}>Previous page</Button>}<span>Page {result.page}</span>{result.more&&<Button href={link(result.page+1)}>Next page</Button>}</nav>}
 </div>;
}
