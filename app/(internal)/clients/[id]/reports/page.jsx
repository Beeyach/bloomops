import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listClientReports} from '@/lib/bloomops/client-reports.mjs';
import {PageHeader,Button,EmptyState} from '@/components/bloomops/Primitives';
import {reportTemplate} from '@/lib/bloomops/client-report-values.mjs';
export const dynamic='force-dynamic';
export default async function Reports({params,searchParams}){
 const {id}=await params,{access,actor}=await requireShell('internal'),q=await searchParams;
 if(q&&Object.keys(q).some(k=>!['page','archived'].includes(k))||q?.archived&&q.archived!=='true')notFound();
 const view=await listClientReports(access.db,actor,id,{page:Number(q?.page||1),archived:q?.archived==='true'});if(!view)notFound();
 return <div className="bo-report"><Button href={`/clients/${id}`} variant="ghost" icon="chevron-left">Back to client</Button><PageHeader title={`Reports for ${view.client.name}`} subtitle="Manage private drafts and explicitly published client versions." actions={view.canEdit&&<Button variant="primary" href={`/clients/${id}/reports/new`}>New report</Button>}/>
 <nav className="bo-view-nav" aria-label="Report status"><Button variant="ghost" href={`/clients/${id}/reports`} aria-current={!view.archived?'page':undefined}>Active reports</Button><Button variant="ghost" href={`/clients/${id}/reports?archived=true`} aria-current={view.archived?'page':undefined}>Archived reports</Button></nav>
 {!view.items.length?<EmptyState title={view.archived?'No archived reports':'No report drafts yet'}><p>{view.archived?'Archived drafts appear here.':'Create a private draft, review saved values, then choose whether to publish a client version.'}</p></EmptyState>:<ul className="bo-rows">{view.items.map(r=><li key={r.id}><a href={`/clients/${id}/reports/${r.id}`}>{r.title}</a><p className="bo-record-subtitle"><span>{reportTemplate(r.templateId,r.templateVersion)?.label}</span><span>{r.periodStart} to {r.periodEnd}</span></p><p>{view.archived?'Archived (internal only)':'Private draft'}</p></li>)}</ul>}
 <nav aria-label="Report pages">{view.page>1&&<Button variant="ghost" href={`?page=${view.page-1}${view.archived?'&archived=true':''}`}>Previous page</Button>}{view.more&&<Button variant="ghost" href={`?page=${view.page+1}${view.archived?'&archived=true':''}`}>Next page</Button>}</nav></div>;
}
