import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectMailboxReview} from '@/lib/bloomops/prospect-mailbox-review.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectMailboxReview from '@/components/bloomops/ProspectMailboxReview';
export const dynamic='force-dynamic';
export const metadata={title:'Mailbox review'};
export default async function MailboxPage(){
 const {access,actor}=await requireShell('internal'),data=await getProspectMailboxReview(access.db,actor,access.env);if(!data)notFound();
 return <div className="bo-prospect-page"><Button href="/prospecting/overview" icon="chevron-left" variant="ghost">Back to Overview</Button><PageHeader title="Mailbox review" subtitle="Collect available replies without sending email."/><ProspectMailboxReview initial={data}/></div>;
}
