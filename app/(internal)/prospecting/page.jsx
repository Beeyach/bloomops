import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {PageHeader,Button,Notice} from '@/components/bloomops/Primitives';
import ProspectSheet from '@/components/bloomops/ProspectSheet';
export const dynamic='force-dynamic';
export const metadata={title:'Prospects'};
export default async function ProspectsPage({searchParams}){
 const {access,actor}=await requireShell('internal');if(!evaluate(actor,{action:'prospecting.view'}).allowed)return <div className="bo-prospect-page"><PageHeader title="Prospecting"/><Notice>Prospecting is available to workspace Owners and Admins. Your current role does not include access.</Notice><div className="bo-access-actions"><Button href="/workspaces">Choose workspace</Button><Button href="/" variant="ghost">Back to Home</Button></div></div>;
 if(access.workspace.purpose!=='prospecting')return <div className="bo-prospect-page"><PageHeader title="Prospecting"/><p>Choose your fresh prospecting workspace to begin.</p><Button href="/workspaces">Choose workspace</Button></div>;
 return <ProspectSheet key={JSON.stringify([actor.userId,actor.workspaceId])} workspaceId={actor.workspaceId} userId={actor.userId} workspaceName={access.workspace.name} initialQuery={await searchParams}/>;
}
