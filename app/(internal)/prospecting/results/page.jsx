import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectResults} from '@/lib/bloomops/prospect-results.mjs';
import {PageHeader} from '@/components/bloomops/Primitives';

export const dynamic='force-dynamic';
export const metadata={title:'Prospecting Results'};

const metric=(label,value,note)=><div><dt>{label}</dt><dd>{value}</dd><p>{note}</p></div>;

export default async function ProspectResultsPage(){
 const {access,actor}=await requireShell('internal'),data=await getProspectResults(access.db,actor);if(!data)notFound();
 const replyRate=data.replyRate===null?'Not enough data':data.replyRate+'%';
 return <div className="bo-prospect-page bo-results-page"><PageHeader title="Results" subtitle="Recorded outcomes in this prospecting workspace."/>
  <section className="bo-results-ledger" aria-labelledby="results-ledger-title"><div className="bo-results-heading"><h2 id="results-ledger-title">All-time recorded results</h2><p>As of <time dateTime={data.asOf}>{new Date(data.asOf).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC</time></p></div>
   <dl className="bo-results-metrics">
    {metric('People contacted',data.peopleContacted,'Distinct prospects with a provider-confirmed introduction.')}
    {metric('Emails sent',data.emailsSent,'Distinct messages accepted by the provider.')}
    {metric('People replied',data.peopleReplied,'Distinct human repliers from the contacted cohort.')}
    {metric('Interested',data.interested,'Distinct prospects with a recorded positive outcome, with or without a prior send.')}
    {metric('Clients',data.clients,'Distinct durable client conversions, with or without a prior send; onboarding is separate.')}
   </dl>
  </section>
  <section className="bo-results-rate" aria-labelledby="reply-rate-title"><div><h2 id="reply-rate-title">Reply rate</h2><p>Human replies divided by people contacted.</p></div><strong>{replyRate}</strong><p>{data.peopleReplied} of {data.peopleContacted}</p></section>
  <section className="bo-results-basis" aria-labelledby="results-basis-title"><h2 id="results-basis-title">What these numbers mean</h2><dl><div><dt>Reporting basis</dt><dd>{data.reportingBasis}</dd></div><div><dt>Reply cohort</dt><dd>{data.replyCohort}</dd></div><div><dt>Not counted as contact</dt><dd>Drafts, approvals, retries, uncertain sends and button clicks.</dd></div><div><dt>Not counted as a reply</dt><dd>Automatic responses, delivery reports and unresolved messages.</dd></div><div><dt>Not counted as a client</dt><dd>Interest, proposals, client lifecycle labels and onboarding completion.</dd></div></dl></section>
 </div>;
}
