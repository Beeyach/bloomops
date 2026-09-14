import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {Button,PageHeader,Status} from '@/components/bloomops/Primitives';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
export const dynamic='force-dynamic';
import {getSkillResult} from '@/lib/bloomops/prospect-skill-results.mjs';
import {prospectSkill} from '@/lib/bloomops/prospect-skills.mjs';
import {PROSPECT_FIELDS} from '@/lib/bloomops/prospect-values.mjs';
import ProspectSkillResultDocument from '@/components/bloomops/ProspectSkillResultDocument';
export const metadata={title:'Saved skill result'};
export default async function ResultPage({params}){
 const {access,actor}=await requireShell('internal'),{id,resultId}=await params,r=await getSkillResult(access.db,actor,id,resultId);if(!r)notFound();
 return <div className="bo-prospect-page"><Button href={'/prospecting/'+id+'/results'} icon="chevron-left" variant="ghost">Back to saved results</Button><PageHeader title={prospectSkill(r.skillId)?.title||'Manual skill result'} subtitle="Saved report and review choices."/><div className="bo-skill-prospect"><ProspectAvatar id={id} website={r.website}/><div><h2>{r.businessName}</h2><Button href={'/prospecting/'+id} variant="ghost">View profile</Button></div></div>
 <Status tone={r.document.status==='ready'?'neutral':'warning'} label={r.document.status==='ready'?'Reported ready':'Needs review'}/><p>Saved by a workspace member. Claims remain unverified until checked.</p>
 <dl className="bo-skill-version"><div><dt>Skill version</dt><dd>{r.skillVersion}</dd></div><div><dt>Saved</dt><dd>{new Date(r.createdAt).toLocaleString('en-US',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} UTC</dd></div></dl>
 <section className="bo-result-applied"><h2>Applied to the profile</h2>{Object.keys(r.acceptedFields).length?<dl>{Object.entries(r.acceptedFields).map(([key,value])=><div key={key}><dt>{PROSPECT_FIELDS[key].label}</dt><dd className="bo-result-prose">{value??'Cleared'}</dd></div>)}</dl>:<p>All existing fields were kept.</p>}<p className="bo-hint">Values shown are the saved review choices. The profile may have changed since.</p></section>
 {['outreach','follow-up'].includes(r.skillId)&&r.document.followUps.length===2&&<div className="bo-outreach-source"><Button href={'/prospecting/'+id+'/outreach?result='+encodeURIComponent(r.id)} icon="mail">Use these follow-ups</Button><p className="bo-hint">Opens the draft for review before saving.</p></div>}
 <ProspectSkillResultDocument document={r.document}/></div>;
}
