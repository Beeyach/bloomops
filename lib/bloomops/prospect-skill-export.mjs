import {and,eq} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {getProspect,prospectCondition} from './prospects.mjs';
import {PROSPECT_FIELDS} from './prospect-values.mjs';
import {prospectSkill,skillTask} from './prospect-skills.mjs';
export async function exportProspectSkill(db,actor,input,now=new Date()){
 if(!actor||!evaluate(actor,{action:'prospecting.view'}).allowed)return null;
 const keys=['workspaceId','prospectId','expectedRevision','skillId','skillVersion'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k))||input.workspaceId!==actor.workspaceId||typeof input.prospectId!=='string'||!input.prospectId||input.prospectId.length>200||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.skillVersion!=='string'||!prospectSkill(input.skillId))return {invalid:true,error:'Choose a skill from the saved prospect profile.'};
 if(input.skillVersion!==prospectSkill(input.skillId).version)return {conflict:true,error:'This skill version changed. Reload the skill page before preparing a task.'};
 const data=await getProspect(db,actor,input.prospectId);if(!data)return null;
 const conflict=()=>({conflict:true,error:'This prospect changed. Reload the skill page to use its latest saved fields.'});
 if(data.profile.revision!==input.expectedRevision)return conflict();
 const context={format:'bloomsi.prospect-context',version:1,exportedAt:now.toISOString(),prospect:{id:data.profile.id,workspaceId:data.profile.workspaceId,revision:data.profile.revision,updatedAt:data.profile.updatedAt,fields:Object.fromEntries(Object.keys(PROSPECT_FIELDS).map(k=>[k,data.profile[k]??null]))},
 fieldSources:data.sources.map(s=>({fieldKey:s.fieldKey,sourceKind:s.sourceKind,sourceUrl:s.sourceUrl,verification:s.verification,checkedAt:s.checkedAt,updatedAt:s.updatedAt})),
 importSource:data.importSource?{sourceWorkspaceId:data.importSource.sourceWorkspaceId,sourceRecordId:data.importSource.sourceRecordId,sourceLabel:data.importSource.sourceLabel,importedAt:data.importSource.importedAt}:null,
 offerApproval:{status:'not_provided',source:null,price:null,claims:[]},outreachState:{status:'not_provided',sendingAuthorized:false}};
 const skill=prospectSkill(input.skillId),task=skillTask(skill,context);
 // A profile edit also revises its field sources. Recheck after their reads so
 // mixed revisions and a revoked membership cannot leave as a coherent export.
 const [current]=await db.select({revision:schema.prospects.revision}).from(schema.prospects).where(and(prospectCondition(actor),eq(schema.prospects.id,input.prospectId))).limit(1);
 if(!current)return null;if(current.revision!==data.profile.revision)return conflict();
 return {skill:{id:skill.id,version:skill.version},context,task};
}
