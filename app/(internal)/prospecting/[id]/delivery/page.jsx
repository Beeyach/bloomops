import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectDelivery} from '@/lib/bloomops/prospect-delivery.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
import ProspectDeliveryReview from '@/components/bloomops/ProspectDeliveryReview';
export const dynamic='force-dynamic';
export const metadata={title:'Controlled test delivery'};
export default async function DeliveryPage({params}){
 const {access,actor}=await requireShell('internal'),{id}=await params,data=await getProspectDelivery(access.db,actor,access.env,id);if(!data)notFound();
 if(data.conflict)return <div className="bo-prospect-page"><PageHeader title="Draft changed"/><p>{data.error}</p><Button href={'/prospecting/'+id+'/delivery'}>Reload review</Button></div>;
 return <div className="bo-prospect-page"><Button href={'/prospecting/'+id+'/outreach'} icon="chevron-left" variant="ghost">Back to draft</Button><PageHeader title="Controlled test delivery" subtitle="One introduction to an inbox you control. No follow-ups."/><div className="bo-outreach-prospect"><ProspectAvatar id={id} website={data.website}/><h2>{data.businessName}</h2></div><ProspectDeliveryReview initial={data}/></div>;
}
