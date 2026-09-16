import {normalizeConversionInput,loadConversionSelection,conversionReview,previewProspectConversion} from './prospect-conversion-preview.mjs';
import {hashDefinitionJson} from './onboarding-definition.mjs';
const invalid=()=>({ok:false,reason:'invalid',errors:{form:'Choose one to ten distinct services, each with its agreed scope.'}});
export function normalizeMultiHandoff(raw,workspaceId){
 if(!raw||Object.keys(raw).some(k=>!['workspaceId','mode','clientId','services'].includes(k))||!Array.isArray(raw.services)||!raw.services.length||raw.services.length>10)return invalid();
 const inputs=[];
 for(const item of raw.services){
  if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['serviceTypeId','packageName','scopeNotes'].includes(k)))return invalid();
  const checked=normalizeConversionInput({workspaceId:raw.workspaceId,mode:raw.mode,clientId:raw.clientId,...item},workspaceId);if(!checked.ok)return checked;inputs.push(checked.input);
 }
 if(new Set(inputs.map(x=>x.serviceTypeId)).size!==inputs.length)return invalid();
 inputs.sort((a,b)=>a.serviceTypeId.localeCompare(b.serviceTypeId));
 return {ok:true,inputs,input:{workspaceId,mode:inputs[0].mode,clientId:inputs[0].clientId,services:inputs.map(({serviceTypeId,packageName,scopeNotes})=>({serviceTypeId,packageName,scopeNotes}))}};
}
export async function loadMultiHandoff(db,actor,id,raw){
 const checked=normalizeMultiHandoff(raw,actor?.workspaceId);if(!checked.ok)return checked;
 const selections=[];
 for(const input of checked.inputs){const s=await loadConversionSelection(db,actor,id,input);if(!s.ok)return s;selections.push(s);}
 const common=s=>JSON.stringify([s.profile,s.client,s.primary,s.engagements,s.delivery,s.recipientEmails]);
 if(selections.some(s=>common(s)!==common(selections[0])))return {ok:false,reason:'conflict',errors:{form:'The handoff changed while loading. Review it again.'}};
 const reviews=await Promise.all(selections.map(conversionReview));
 const blockers=[...new Set(reviews.flatMap(r=>r.blockers))],first=selections[0];
 if(first.engagements.length+selections.filter(s=>!first.engagements.some(e=>e.serviceTypeId===s.type.id)).length>50)blockers.push('Review existing services before adding more.');
 return {...checked,selections,review:{hash:await hashDefinitionJson(JSON.stringify([checked.input,reviews.map(r=>r.hash)])),profileRevision:first.profile.revision,blockers}};
}
export async function previewMultiHandoff(db,actor,id,raw){
 const loaded=await loadMultiHandoff(db,actor,id,raw);if(!loaded.ok)return loaded;
 const first=await previewProspectConversion(db,actor,id,loaded.inputs[0],loaded.selections.slice(1).map(s=>s.type));if(!first.ok)return first;
 return {...first,conversionReview:loaded.review,services:loaded.selections.map(s=>({id:s.type.id,name:s.type.name,slug:s.type.slug,existing:s.engagements.some(e=>e.serviceTypeId===s.type.id),packageName:s.input.packageName,scopeNotes:s.input.scopeNotes}))};
}
