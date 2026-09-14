import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectOutreach} from '@/lib/bloomops/prospect-outreach.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
import ProspectOutreachForm from '@/components/bloomops/ProspectOutreachForm';
export const dynamic='force-dynamic';
export const metadata={title:'Outreach draft'};
export default async function OutreachPage({params,searchParams}){
 const {access,actor}=await requireShell('internal'),{id}=await params,query=await searchParams,data=await getProspectOutreach(access.db,actor,id,{resultId:query.result??null});if(!data)notFound();
 if(data.conflict)return <div className="bo-prospect-page"><PageHeader title="Draft changed"/><p>{data.error}</p><Button href={'/prospecting/'+id+'/outreach'}>Reload draft</Button></div>;
 return <div className="bo-prospect-page"><Button href={'/prospecting/'+id} icon="chevron-left" variant="ghost">Back to profile</Button><PageHeader title="Outreach draft" subtitle="Review an introduction and two follow-ups."/><div className="bo-outreach-prospect"><ProspectAvatar id={id} website={data.profile.website}/><h2>{data.profile.businessName}</h2></div><ProspectOutreachForm initial={data}/></div>;
}
