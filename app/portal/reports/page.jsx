import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listPublishedReports} from '@/lib/bloomops/client-report-publications.mjs';
import {Button} from '@/components/bloomops/Primitives';
export const dynamic='force-dynamic';
export default async function Page({searchParams}){const {access,actor}=await requireShell('portal'),q=await searchParams,view=await listPublishedReports(access.db,actor,{portal:true,page:Number(q?.page||1)});if(!view)notFound();return <div className="bo-report"><h1>Your reports</h1><p>Published reports for your authorized accounts.</p>{view.items.length?<ul className="bo-rows">{view.items.map(r=><li key={r.id}><a href={`/portal/reports/${r.id}`}>{r.snapshot.title}</a><p>{r.snapshot.clientName}</p><p>{r.snapshot.periodStart} to {r.snapshot.periodEnd}</p><p>Published version {r.version}</p></li>)}</ul>:<p>No published reports available.</p>}<nav aria-label="Report pages">{view.page>1&&<Button href={`?page=${view.page-1}`}>Previous page</Button>}{view.more&&<Button href={`?page=${view.page+1}`}>Next page</Button>}</nav></div>;}
