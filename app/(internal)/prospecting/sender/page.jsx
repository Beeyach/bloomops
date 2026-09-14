import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectSender} from '@/lib/bloomops/prospect-outreach.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import {getProspectGoogle} from '@/lib/bloomops/prospect-google.mjs';
import ProspectSenderSetup from '@/components/bloomops/ProspectSenderSetup';
export const dynamic='force-dynamic';
export const metadata={title:'Sender setup'};
export default async function SenderPage({searchParams}){
 const {access,actor}=await requireShell('internal'),data=await getProspectSender(access.db,actor);if(!data)notFound();const connection=await getProspectGoogle(access.db,actor,access.env);if(!connection)notFound();const query=await searchParams;
 return <div className="bo-prospect-page"><Button href="/prospecting/overview" icon="chevron-left" variant="ghost">Back to Overview</Button><PageHeader title="Sender setup"/><Button href="/prospecting/mailbox" icon="history" variant="ghost">Mailbox review</Button><ProspectSenderSetup initial={data} connection={connection} outcome={query.google}/></div>;
}
