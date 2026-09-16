import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {reportClient,reportServices,canEditReports,newPeriodReportSetup} from '@/lib/bloomops/client-reports.mjs';
import ClientReportEditor from '@/components/bloomops/ClientReportEditor';
export const dynamic='force-dynamic';
export default async function New({params,searchParams}){
 const {id}=await params,{access,actor}=await requireShell('internal');const client=await reportClient(access.db,actor,id);if(!client||!canEditReports(actor))notFound();
 const q=await searchParams;
 if(q&&Object.keys(q).some(k=>k!=='source'))notFound();
 const reuse=q?.source?typeof q.source==='string'?await newPeriodReportSetup(access.db,actor,id,q.source):null:null;
 if(q&&Object.hasOwn(q,'source')&&!reuse)notFound();
 const services=await reportServices(access.db,actor,id);if(!services)notFound();
 return <ClientReportEditor key={JSON.stringify([actor.userId,actor.workspaceId,id,reuse?.sourceId])} client={client} services={services} reuse={reuse} scope={{userId:actor.userId,workspaceId:actor.workspaceId}}/>;
}
