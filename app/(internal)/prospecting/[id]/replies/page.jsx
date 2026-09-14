import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getProspectReplies} from '@/lib/bloomops/prospect-replies.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
import ProspectReplyReview from '@/components/bloomops/ProspectReplyReview';
export const dynamic='force-dynamic';
export const metadata={title:'Replies and stop review'};
export default async function RepliesPage({params}){
 const {access,actor}=await requireShell('internal'),{id}=await params,data=await getProspectReplies(access.db,actor,access.env,id);if(!data)notFound();
 return <div className="bo-prospect-page"><Button href={'/prospecting/'+id+'/delivery'} icon="chevron-left" variant="ghost">Back to delivery</Button><PageHeader title="Replies and stop review" subtitle="Review this conversation before any further outreach."/><div className="bo-outreach-prospect"><ProspectAvatar id={id} website={data.website}/><h2>{data.businessName}</h2></div><ProspectReplyReview initial={data}/></div>;
}
