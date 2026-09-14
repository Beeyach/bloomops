import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {Button,PageHeader,Status} from '@/components/bloomops/Primitives';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
export const dynamic='force-dynamic';
import {getProspect} from '@/lib/bloomops/prospects.mjs';
import ProspectSkillResultReview from '@/components/bloomops/ProspectSkillResultReview';
export const metadata={title:'Review skill result'};
export default async function ResultReviewPage({params}){
 const {access,actor}=await requireShell('internal'),{id}=await params,data=await getProspect(access.db,actor,id);if(!data)notFound();const p=data.profile;
 return <div className="bo-prospect-page"><Button href={'/prospecting/'+id+'/results'} icon="chevron-left" variant="ghost">Back to saved results</Button><PageHeader title="Review a skill result" subtitle="Choose which suggestions belong in the saved profile."/><div className="bo-skill-prospect"><ProspectAvatar id={p.id} website={p.website}/><h2>{p.businessName}</h2></div><ProspectSkillResultReview prospect={{id:p.id,workspaceId:p.workspaceId}}/></div>;
}
