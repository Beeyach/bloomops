// Owner feedback S05: small workspace catalogue administration, not pricing or
// provider setup. Reusable types stay distinct from purchased engagements.
import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
const t=schema.serviceTypes,w=schema.workspaces;
const denied=()=>({ok:false,reason:'not_found'}),conflict=()=>({ok:false,reason:'conflict',error:'This offering changed. Reload its saved name before editing.'});
function fields(input){
 if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>120||/[\x00-\x1f\x7f]/.test(input.name))return null;
 return {name:input.name.trim()};
}
const view=row=>({id:row.id,name:row.name,slug:row.slug,updatedAt:row.updatedAt});
async function own(db,actor){return (await db.select({id:w.id}).from(w).where(and(eq(w.id,actor?.workspaceId||''),administratorCondition(actor))).limit(1))[0];}
export async function saveServiceOffering(db,actor,input,now=new Date()){
 if(!await own(db,actor)||input?.workspaceId!==actor.workspaceId||input?.userId!==actor.userId)return denied();
 const value=fields(input);if(!value||Object.keys(input).some(k=>!['workspaceId','userId','requestId','id','expectedUpdatedAt','name'].includes(k)))return {ok:false,reason:'invalid',error:'Enter an offering name of up to 120 characters.'};
 const creating=!input.id,id=creating?input.requestId:input.id;
 if(typeof id!=='string'||!REQUEST_ID.test(id)||creating&&(input.expectedUpdatedAt!==undefined)||!creating&&(input.requestId!==undefined||typeof input.expectedUpdatedAt!=='string'))return {ok:false,reason:'invalid',error:'Reload the offering and try again.'};
 const condition=and(eq(t.id,id),eq(t.workspaceId,actor.workspaceId),administratorCondition(actor));
 const read=async()=> (await db.select().from(t).where(condition).limit(1))[0];
 if(creating){
  const slug='custom-'+id,iso=now.toISOString();
  await insertSelected(db,t,{id,workspaceId:actor.workspaceId,name:value.name,slug,departmentId:null,description:null,active:1,createdAt:iso,updatedAt:iso},w,and(eq(w.id,actor.workspaceId),administratorCondition(actor))).onConflictDoNothing();
  const saved=await read();return saved&&saved.slug===slug&&saved.name===value.name?{ok:true,offering:view(saved)}:conflict();
 }
 const prior=await read();if(!prior)return denied();
 // This UI edits only owner-created offerings. Default slugs retain their
 // template semantics and are not renamed through the handoff dialog.
 if(prior.slug!=='custom-'+id)return {ok:false,reason:'invalid',error:'Choose a custom offering to edit.'};
 if(prior.updatedAt!==input.expectedUpdatedAt)return conflict();
 if(prior.name===value.name)return {ok:true,offering:view(prior)};
 const iso=new Date(Math.max(now.getTime(),Date.parse(prior.updatedAt)+1)).toISOString();
 const changed=await db.update(t).set({name:value.name,updatedAt:iso}).where(and(condition,eq(t.updatedAt,input.expectedUpdatedAt))).returning({id:t.id});
 if(!changed.length)return conflict();const saved=await read();return saved?{ok:true,offering:view(saved)}:denied();
}
