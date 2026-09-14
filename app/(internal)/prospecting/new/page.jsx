import {notFound,redirect} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import {NewProspect} from '@/components/bloomops/ProspectProfile';
export const dynamic='force-dynamic';
export const metadata={title:'New prospect'};
export default async function NewProspectPage(){const {access,actor}=await requireShell('internal');if(!evaluate(actor,{action:'prospecting.manage'}).allowed)notFound();if(access.workspace.purpose!=='prospecting')redirect('/prospecting');return <div className="bo-prospect-page"><Button href="/prospecting" variant="ghost" icon="chevron-left">Back to prospects</Button><PageHeader title="New prospect" subtitle="Start with what you know. Unknown fields can stay empty."/><NewProspect key={JSON.stringify([actor.userId,access.workspace.id])} userId={actor.userId} workspaceId={access.workspace.id}/></div>;}
