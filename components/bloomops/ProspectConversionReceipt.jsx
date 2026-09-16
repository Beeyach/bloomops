import {Button,Status} from './Primitives';
export default function ProspectConversionReceipt({receipt,compact=false}){
 if(!receipt)return null;
 return <section className="bo-handoff-receipt" aria-label="Recorded client conversion">
  <div className="bo-handoff-result-head"><h2>Client conversion recorded</h2><Status tone="success" label="Cold outreach stopped"/></div>
  {compact?<p>{receipt.clientName} is linked to this prospect.</p>:<>
   <dl className="bo-handoff-facts"><div><dt>Client</dt><dd>{receipt.clientName}</dd></div><div><dt>Client record</dt><dd>{receipt.clientCreated?'Created as Draft':'Existing client linked'}</dd></div><div><dt>{receipt.services?'First purchased service':'Purchased service'}</dt><dd>{receipt.serviceName}</dd></div><div><dt>Service engagement</dt><dd>{receipt.serviceCreated?'Created as Planned':'Existing engagement retained'}</dd></div>{receipt.packageName&&<div><dt>Package</dt><dd>{receipt.packageName}</dd></div>}<div><dt>Recorded sale scope</dt><dd>{receipt.scopeNotes}</dd></div><div><dt>Recorded date</dt><dd><time dateTime={receipt.convertedAt}>{new Date(receipt.convertedAt).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})}</time></dd></div></dl>
   {receipt.services&&<ul className="bo-handoff-service-summary">{receipt.services.map(service=><li key={service.serviceTypeId}><h3>{service.serviceName}</h3><p>{service.serviceCreated?'Created as Planned':'Existing engagement retained'}</p>{service.packageName&&<p>Package: {service.packageName}</p>}<p>Recorded scope: {service.scopeNotes}</p></li>)}</ul>}
   <p>Cold outreach is permanently stopped for this prospect and its recorded email addresses. Prospect and conversation history remain available.</p>
   {!receipt.serviceCreated&&<p>The existing engagement keeps its original scope. This sale’s scope is recorded separately above.</p>}
   <p>Review the client’s onboarding separately. Invitations are not sent by this handoff.</p>
  </>}
  <Button href={'/clients/'+receipt.clientId} icon="clients">Open client</Button>
  <Button href={'/prospecting/'+receipt.prospectId+'/conversion/onboarding'} icon="onboarding">Review onboarding</Button>
 </section>;
}
