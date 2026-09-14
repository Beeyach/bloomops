import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {getProspect} from '@/lib/bloomops/prospects.mjs';
import {PROSPECT_SKILLS} from '@/lib/bloomops/prospect-skills.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import {Icon} from '@/components/bloomops/Icons';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
export const dynamic='force-dynamic';
export const metadata={title:'Skills Library'};
export default async function SkillsLibrary({searchParams}){
 const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting'||!evaluate(actor,{action:'prospecting.view'}).allowed)notFound();
 const query=await searchParams;if(Object.keys(query).some(k=>k!=='prospect')||query.prospect!==undefined&&(typeof query.prospect!=='string'||!query.prospect||query.prospect.length>200))notFound();
 const data=query.prospect?await getProspect(access.db,actor,query.prospect):null;if(query.prospect&&!data)notFound();
 const profile=data?.profile,selected=profile?'?prospect='+encodeURIComponent(profile.id):'';
 return <div className="bo-prospect-page bo-skills-page"><PageHeader title="Skills Library" subtitle="Prepare a manual audit or draft from the prospect’s saved context."/>
 {profile&&<div className="bo-skill-prospect"><ProspectAvatar id={profile.id} website={profile.website}/><div><span className="bo-hint">Selected prospect</span><h2>{profile.businessName}</h2><Button href={'/prospecting/'+profile.id} variant="ghost">Back to profile</Button></div></div>}
 <ul className="bo-skill-list" aria-label="Manual skills">{PROSPECT_SKILLS.map(skill=><li key={skill.id}><span className={'bo-skill-icon bo-skill-icon-'+skill.id}><Icon name={skill.icon}/></span><div><h2>{skill.title}</h2><p>{skill.summary}</p></div><Button href={'/prospecting/skills/'+skill.id+selected} icon="chevron-right">Open {skill.title.toLowerCase()}</Button></li>)}</ul>
 </div>;
}
