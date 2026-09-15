import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listClientReports} from '@/lib/bloomops/client-reports.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import {reportTemplate} from '@/lib/bloomops/client-report-values.mjs';
export const dynamic='force-dynamic';
export default async function Reports({params,searchParams}){
 const {id}=await params,{access,actor}=await requireShell('internal'),q=await searchParams;
 const view=await listClientReports(access.db,actor,id,{page:Number(q?.page||1)});if(!view)notFound();
 return <div className="bo-report"><PageHeader title={`Reports for ${view.client.name}`} subtitle="Private manual drafts. Only authorized internal team members can read these reports."/>
 <div className="bo-form-actions"><Button href={`/clients/${id}`} variant="ghost">Back to client</Button>{view.canEdit&&<Button href={`/clients/${id}/reports/new`}>New report</Button>}</div>
 {!view.items.length?<p>No report drafts yet.</p>:<ul className="bo-rows">{view.items.map(r=><li key={r.id}><a href={`/clients/${id}/reports/${r.id}`}>{r.title}</a><p>{reportTemplate(r.templateId,r.templateVersion)?.label} — {r.periodStart} to {r.periodEnd}</p><p>Private draft</p></li>)}</ul>}
 <nav aria-label="Report pages">{view.page>1&&<Button variant="ghost" href={`?page=${view.page-1}`}>Previous page</Button>}{view.more&&<Button variant="ghost" href={`?page=${view.page+1}`}>Next page</Button>}</nav></div>;
}
