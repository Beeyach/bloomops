import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {reportClient,reportServices,canEditReports} from '@/lib/bloomops/client-reports.mjs';
import ClientReportEditor from '@/components/bloomops/ClientReportEditor';
export const dynamic='force-dynamic';
export default async function New({params}){
 const {id}=await params,{access,actor}=await requireShell('internal');const client=await reportClient(access.db,actor,id);if(!client||!canEditReports(actor))notFound();
 const services=await reportServices(access.db,actor,id);if(!services)notFound();
 return <ClientReportEditor key={JSON.stringify([actor.userId,actor.workspaceId,id])} client={client} services={services} scope={{userId:actor.userId,workspaceId:actor.workspaceId}}/>;
}
