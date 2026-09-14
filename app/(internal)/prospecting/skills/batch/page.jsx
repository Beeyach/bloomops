import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import ProspectAuditBatch from '@/components/bloomops/ProspectAuditBatch';
export const metadata={title:'Review returned audits'};
export default async function Page(){const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting'||!evaluate(actor,{action:'prospecting.manage'}).allowed)notFound();return <ProspectAuditBatch workspaceId={actor.workspaceId}/>;}
