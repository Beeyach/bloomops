import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {Button,PageHeader,Status} from '@/components/bloomops/Primitives';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
export const dynamic='force-dynamic';
import {listSkillResults} from '@/lib/bloomops/prospect-skill-results.mjs';
import {prospectSkill} from '@/lib/bloomops/prospect-skills.mjs';
export const metadata={title:'Saved skill results'};
export default async function ResultListPage({params,searchParams}){
 const {access,actor}=await requireShell('internal'),{id}=await params,query=await searchParams;
 if(Object.keys(query).some(k=>k!=='page')||query.page!==undefined&&typeof query.page!=='string')notFound();
 const data=await listSkillResults(access.db,actor,id,Number(query.page||1));if(!data)notFound();
 return <div className="bo-prospect-page"><Button href={'/prospecting/'+id} icon="chevron-left" variant="ghost">Back to profile</Button><PageHeader title="Saved skill results" subtitle="Reports and suggestions retained with your review choices."/><div className="bo-skill-prospect"><ProspectAvatar id={id} website={data.profile.website}/><h2>{data.profile.businessName}</h2></div><Button href={'/prospecting/'+id+'/results/review'} variant="primary" icon="upload">Review a result</Button>
 {data.rows.length?<ul className="bo-skill-list" aria-label="Saved results">{data.rows.map(r=><li key={r.id}><div><h2>{prospectSkill(r.skillId)?.title||'Manual skill'}</h2><p><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC</time></p></div><Button href={'/prospecting/'+id+'/results/'+r.id}>View result</Button></li>)}</ul>:<p className="bo-result-empty">No saved results yet.</p>}
 <nav className="bo-prospect-pagination" aria-label="Result pages">{data.page>1&&<Button href={'?page='+(data.page-1)}>Newer results</Button>}{data.more&&<Button href={'?page='+(data.page+1)}>Older results</Button>}</nav></div>;
}
