import {sheetScope} from './prospect-sheet.mjs';
import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {PROSPECT_FIELDS} from './prospect-values.mjs';
import {exportProspectSkill} from './prospect-skill-export.mjs';
import {prospectSkill} from './prospect-skills.mjs';
import {evaluate} from './authorization.mjs';
export async function exportSheetSelection(db,actor,input){
 if(!actor||!evaluate(actor,{action:'prospecting.view'}).allowed)return null;
 if(!input||Object.keys(input).some(k=>!['workspaceId','kind','rows','query'].includes(k))||input.workspaceId!==actor.workspaceId||!['records','audit'].includes(input.kind)||!Array.isArray(input.rows)||!input.rows.length||input.rows.length>(input.kind==='audit'?50:200)||new Set(input.rows.map(r=>r?.id)).size!==input.rows.length||input.rows.some(r=>!r||Object.keys(r).some(k=>!['id','revision'].includes(k))||typeof r.id!=='string'||r.id.length>128||!Number.isInteger(r.revision)||r.revision<1))return {invalid:true,error:'Select up to 50 records per audit batch or 200 per export.'};
 const scoped=sheetScope(actor,input.query||{});if(!scoped)return {invalid:true,error:'Invalid selection scope.'};
 const p=schema.prospects,condition=and(scoped.where,sql`EXISTS(SELECT 1 FROM json_each(${JSON.stringify(input.rows)}) x WHERE json_extract(x.value,'$.id')=${p.id} AND json_extract(x.value,'$.revision')=${p.revision})`);
 const read=()=>db.select({id:p.id,revision:p.revision}).from(p).where(condition).limit(200);
 if((await read()).length!==input.rows.length)return {conflict:true,error:'Selected records changed or are no longer accessible. Refresh the sheet and select again.'};
 let records;
 if(input.kind==='audit'){records=[];for(const row of input.rows){const task=await exportProspectSkill(db,actor,{workspaceId:actor.workspaceId,prospectId:row.id,expectedRevision:row.revision,skillId:'audit',skillVersion:prospectSkill('audit').version});if(!task||task.invalid||task.conflict)return {conflict:true,error:'A selected record changed. Refresh and prepare the batch again.'};records.push(task);}}
 else records=await db.select({id:p.id,workspaceId:p.workspaceId,revision:p.revision,...Object.fromEntries(Object.keys(PROSPECT_FIELDS).map(k=>[k,p[k]])),createdAt:p.createdAt}).from(p).where(condition).limit(200);
 if((await read()).length!==input.rows.length)return {conflict:true,error:'Selection changed during export. Refresh and try again.'};
 return {format:input.kind==='audit'?'bloomsi.manual-audit-batch':'bloomsi.prospect-sheet-export',version:1,workspaceId:actor.workspaceId,exportedAt:new Date().toISOString(),instructions:input.kind==='audit'?'Run each task manually in ChatGPT. Return each original skill-result JSON with its exact workspaceId, prospectId and revision. Upload results to Review returned audits; review every proposed change. No automatic audit or outreach is connected.':undefined,records};
}
