// Shared semantic field vocabulary; no database/editor/provider dependencies.
export const PROSPECT_FIT={unknown:'Not assessed',strong:'Strong',hold:'Hold',skip:'Skip'};
export const PROSPECT_FIELDS={
 businessName:{label:'Business name',max:180,section:'identity',required:true},
 personName:{label:'Person',max:120,section:'identity'},
 website:{label:'Website',max:2048,section:'identity',type:'url'},
 platform:{label:'Current platform',max:120,section:'identity'},
 niche:{label:'Niche',max:180,section:'identity'},
 services:{label:'Services',max:1200,section:'identity',type:'textarea'},
 publicEmail:{label:'Public contact email',max:254,section:'identity',type:'email'},
 location:{label:'Location',max:180,section:'identity'},
 timeZone:{label:'Timezone',max:100,section:'identity',hint:'An IANA timezone, such as America/Los_Angeles. Leave unknown if unconfirmed.'},
 fit:{label:'Fit',section:'assessment',type:'fit'},
 fitReason:{label:'Assessment reason',max:2000,section:'assessment',type:'textarea'},
 observedFacts:{label:'Observed facts',max:6000,section:'assessment',type:'textarea'},
 unknowns:{label:'Unknowns',max:4000,section:'assessment',type:'textarea'},
 proposedWork:{label:'Proposed work',max:4000,section:'assessment',type:'textarea'},
 evidenceDate:{label:'Audit date',max:10,section:'evidence',type:'date'},
 evidenceTarget:{label:'Page or target URL',max:2048,section:'evidence',type:'url'},
 evidenceReport:{label:'Audit report',max:12000,section:'evidence',type:'textarea'},
 evidenceInteraction:{label:'Tested interaction',max:4000,section:'evidence',type:'textarea'},
 evidenceLimitations:{label:'Inspection limitations',max:4000,section:'evidence',type:'textarea'},
 draftSubject:{label:'Draft subject',max:250,section:'draft'},
 draftBody:{label:'Draft message',max:12000,section:'draft',type:'textarea'},
};
export function safeProspectUrl(raw){
 if(raw==null||raw==='')return null;
 try{const u=new URL(raw);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function normalizeProspectFields(input,{creating=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(PROSPECT_FIELDS,k)))return {ok:false,errors:{form:'Use the labelled profile fields.'}};
 const fields={},errors={};
 for(const [key,raw] of Object.entries(input)){
  const spec=PROSPECT_FIELDS[key];
  if(key==='fit'){if(!Object.hasOwn(PROSPECT_FIT,raw))errors[key]='Choose a fit assessment.';else fields[key]=raw;continue;}
  if(raw!==null&&typeof raw!=='string'){errors[key]='Enter text.';continue;}
  let value=raw?.trim()||null;
  if((spec.required&&!value)||(value&&(value.length>spec.max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)))){errors[key]=spec.required&&!value?'Enter the business name.':`Use at most ${spec.max} readable characters.`;continue;}
  if(value&&spec.type==='url'){value=safeProspectUrl(value);if(!value){errors[key]='Enter a complete http or https URL.';continue;}}
  if(value&&spec.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)){errors[key]='Enter a valid audit date.';continue;}
  if(value&&spec.type==='email'){if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)){errors[key]='Enter a public contact email or leave it unknown.';continue;}value=value.toLowerCase();}
  if(value&&key==='timeZone')try{new Intl.DateTimeFormat('en',{timeZone:value}).format();}catch{errors[key]='Enter a valid IANA timezone or leave it unknown.';continue;}
  fields[key]=value;
 }
 if(creating&&!fields.businessName)errors.businessName='Enter the business name.';
 return Object.keys(errors).length?{ok:false,errors}:{ok:true,fields};
}
