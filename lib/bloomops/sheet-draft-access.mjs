import {and,eq,or} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {prospectCondition} from './prospects.mjs';
import {SHEET_EDITABLE} from './prospect-sheet-values.mjs';
const p=schema.prospects;
export async function readSheetDraftRecords(db,actor,input){
 if(!actor||!evaluate(actor,{action:'prospecting.view'}).allowed)return {status:403};
 if(!input||input.userId!==actor.userId||input.workspaceId!==actor.workspaceId)return {status:403};
 if(Object.keys(input).some(k=>!['userId','workspaceId','ids'].includes(k))||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>200||input.ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(id))||new Set(input.ids).size!==input.ids.length)return {status:400};
 // Chunk ID predicates below D1's binding limit. Every chunk repeats live authority.
 const rows=[];
 for(let i=0;i<input.ids.length;i+=50){
  const selected={id:p.id,revision:p.revision,...Object.fromEntries(SHEET_EDITABLE.map(key=>[key,p[key]]))};
  rows.push(...await db.select(selected).from(p).where(and(prospectCondition(actor),or(...input.ids.slice(i,i+50).map(id=>eq(p.id,id))))));
 }
 if(rows.length!==input.ids.length)return {status:404};
 // Recheck current scope after the last chunk, including revocation during a long read.
 const live=await db.select({id:p.id}).from(p).where(and(prospectCondition(actor),eq(p.id,input.ids[0]))).limit(1);if(!live.length)return {status:403};
 return {status:200,userId:actor.userId,workspaceId:actor.workspaceId,rows};
}
