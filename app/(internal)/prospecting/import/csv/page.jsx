import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import ProspectCsvImport from '@/components/bloomops/ProspectCsvImport';
export const metadata={title:'Import prospects'};
export default async function Page(){const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting'||!evaluate(actor,{action:'prospecting.manage'}).allowed)notFound();return <ProspectCsvImport workspaceId={actor.workspaceId}/>;}
