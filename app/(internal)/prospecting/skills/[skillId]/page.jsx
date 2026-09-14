import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {evaluate} from '@/lib/bloomops/authorization.mjs';
import {getProspect} from '@/lib/bloomops/prospects.mjs';
import {prospectSkill,skillInstructions} from '@/lib/bloomops/prospect-skills.mjs';
import {Button,PageHeader} from '@/components/bloomops/Primitives';
import ProspectSkillActions from '@/components/bloomops/ProspectSkillActions';
import ProspectAvatar from '@/components/bloomops/ProspectAvatar';
export const dynamic='force-dynamic';
export const metadata={title:'Manual skill'};
export default async function SkillPage({params,searchParams}){
 const {access,actor}=await requireShell('internal');if(access.workspace.purpose!=='prospecting'||!evaluate(actor,{action:'prospecting.view'}).allowed)notFound();
 const skill=prospectSkill((await params).skillId);if(!skill)notFound();
 const query=await searchParams;if(Object.keys(query).some(k=>k!=='prospect')||query.prospect!==undefined&&(typeof query.prospect!=='string'||!query.prospect||query.prospect.length>200))notFound();
 const data=query.prospect?await getProspect(access.db,actor,query.prospect):null;if(query.prospect&&!data)notFound();
 const p=data?.profile,prospect=p?{id:p.id,workspaceId:p.workspaceId,revision:p.revision}:null,selected=p?'?prospect='+encodeURIComponent(p.id):'';
 return <div className="bo-prospect-page bo-skills-page"><Button href={'/prospecting/skills'+selected} variant="ghost" icon="chevron-left">Back to skills</Button><PageHeader title={skill.title} subtitle={skill.summary}/>
 <dl className="bo-skill-version"><div><dt>Version</dt><dd>{skill.version}</dd></div><div><dt>Mode</dt><dd>Manual review</dd></div></dl>
 {p&&<div className="bo-skill-prospect"><ProspectAvatar id={p.id} website={p.website}/><div><span className="bo-hint">Saved context for</span><h2>{p.businessName}</h2><Button href={'/prospecting/'+p.id} variant="ghost">View profile</Button></div></div>}
 <ProspectSkillActions key={skill.id+':'+(p?.id||'')+':'+(p?.revision||'')} skillId={skill.id} version={skill.version} instructions={skillInstructions(skill)} prospect={prospect}/>
 {p&&<Button href={'/prospecting/'+p.id+'/results/review'} icon="upload">Review a result</Button>}
 <div className="bo-skill-outline"><section><h2>Uses</h2><ul>{skill.inputs.map(s=><li key={s}>{s}</li>)}</ul></section><section><h2>Produces</h2><ul>{skill.outputs.map(s=><li key={s}>{s}</li>)}</ul></section></div>
 <details className="bo-prospect-evidence"><summary>Read the instructions</summary><div className="bo-skill-instructions">{skill.instructions.split('\n').map((s,i)=><p key={i}>{s}</p>)}</div></details>
 <details className="bo-prospect-evidence"><summary>Output schema</summary><label className="bo-sr-only" htmlFor="skill-schema">JSON output schema</label><textarea id="skill-schema" className="bo-control bo-skill-schema" readOnly rows={12} value={JSON.stringify(skill.resultSchema,null,2)}/></details>
 </div>;
}
