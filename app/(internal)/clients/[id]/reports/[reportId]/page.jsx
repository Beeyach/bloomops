import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getClientReport} from '@/lib/bloomops/client-reports.mjs';
import ClientReportEditor from '@/components/bloomops/ClientReportEditor';
export const dynamic='force-dynamic';
export default async function Edit({params}){
 const {id,reportId}=await params,{access,actor}=await requireShell('internal');const report=await getClientReport(access.db,actor,id,reportId);if(!report)notFound();
 return <ClientReportEditor key={JSON.stringify([actor.userId,actor.workspaceId,id,reportId])} client={{id,name:report.clientName}} initial={report} scope={{userId:actor.userId,workspaceId:actor.workspaceId}}/>;
}
