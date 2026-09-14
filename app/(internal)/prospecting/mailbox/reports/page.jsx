import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectReportReview} from '@/lib/bloomops/prospect-report-review.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectReportReview from '@/components/bloomops/ProspectReportReview';
export const dynamic='force-dynamic';
export const metadata={title:'Delivery reports'};
export default async function ReportPage(){
 const {access,actor}=await requireShell('internal'),data=await getProspectReportReview(access.db,actor,access.env);if(!data)notFound();
 return <div className="bo-prospect-page"><Button href="/prospecting/mailbox" icon="chevron-left" variant="ghost">Back to Mailbox review</Button><PageHeader title="Delivery reports" subtitle="Review saved reports while outreach stays on hold."/><ProspectReportReview initial={data}/></div>;
}
