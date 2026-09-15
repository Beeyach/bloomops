import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getClientReport} from '@/lib/bloomops/client-reports.mjs';
import ClientReportPreview from '@/components/bloomops/ClientReportPreview';
export const dynamic='force-dynamic';
export default async function Preview({params}){
 const {id,reportId}=await params,{access,actor}=await requireShell('internal');const report=await getClientReport(access.db,actor,id,reportId);if(!report)notFound();
 return <ClientReportPreview key={JSON.stringify([actor.userId,actor.workspaceId,id,reportId])} initial={report} scope={{userId:actor.userId,workspaceId:actor.workspaceId}}/>;
}
