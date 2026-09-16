// Pure saved-setup language and calendar-date proposal. No identity or authority.
export const WORK_SETUP_LIMITS=Object.freeze({milestones:20,actions:60,deliverables:20,edges:180,offset:3660,bytes:131072});
export class WorkSetupError extends Error{constructor(message){super(message);this.name='WorkSetupError';}}
const fail=message=>{throw new WorkSetupError(message);};
const object=(v,keys)=>v&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.getOwnPropertyDescriptor(v,k)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const text=(value,max,label,optional=false)=>{if(typeof value!=='string'||value.length>max||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)||!optional&&!value.trim())fail(`Check ${label}.`);return value.trim();};
const label=(v,name)=>{const s=text(v,120,name);if(/[\n\r\t]/.test(s))fail(`Use one line for ${name}.`);return s;};
const offset=v=>{if(v!==null&&(!Number.isSafeInteger(v)||Math.abs(v)>WORK_SETUP_LIMITS.offset))fail('Date offsets must be whole calendar days between -3660 and 3660, or undated.');return v;};
export function workSetupDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0100-01-01')return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
export function offsetWorkDate(anchor,days){if(!workSetupDate(anchor))fail('Choose a valid event date.');offset(days);if(days===null)return null;const d=new Date(anchor+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);const result=d.toISOString().slice(0,10);if(!workSetupDate(result))fail('A generated date is outside the supported calendar range.');return result;}
const dates=(start,target)=>{if(start!==null&&target!==null&&start>target)fail('A start offset cannot follow its target offset.');};
function list(value,max,name){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Object.keys(value).length!==value.length)fail(`Check the ${name} list.`);return value;}
export function validateWorkSetup(input){
 if(!object(input,['schemaVersion','name','description','project','milestones','actions','deliverables'])||input.schemaVersion!==1)fail('Unsupported setup definition.');
 if(!object(input.project,['startOffset','targetOffset']))fail('Check the project dates.');
 const project={startOffset:offset(input.project.startOffset),targetOffset:offset(input.project.targetOffset)};dates(project.startOffset,project.targetOffset);
 const keys=new Set();function key(value){if(typeof value!=='string'||value.length>64||! /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)||keys.has(value))fail('Use unique stable work keys.');keys.add(value);return value;}
 const milestones=list(input.milestones,WORK_SETUP_LIMITS.milestones,'Milestones').map(r=>{if(!object(r,['key','name','startOffset','targetOffset']))fail('Check the Milestone fields.');const row={key:key(r.key),name:label(r.name,'Milestone name'),startOffset:offset(r.startOffset),targetOffset:offset(r.targetOffset)};dates(row.startOffset,row.targetOffset);return row;});
 const actions=list(input.actions,WORK_SETUP_LIMITS.actions,'Actions').map(r=>{if(!object(r,['key','title','instructions','milestoneKey','dueOffset','dependsOn']))fail('Check the Action fields.');return {key:key(r.key),title:label(r.title,'Action title'),instructions:text(r.instructions,5000,'Action instructions',true),milestoneKey:r.milestoneKey,dueOffset:offset(r.dueOffset),dependsOn:[...list(r.dependsOn,WORK_SETUP_LIMITS.actions,'dependencies')]};});
 const deliverables=list(input.deliverables,WORK_SETUP_LIMITS.deliverables,'Deliverables').map(r=>{if(!object(r,['key','title','instructions','targetOffset']))fail('Check the Deliverable fields.');return {key:key(r.key),title:label(r.title,'Deliverable title'),instructions:text(r.instructions,5000,'Deliverable instructions',true),targetOffset:offset(r.targetOffset)};});
 if(!actions.length&&!deliverables.length)fail('Include at least one Action or Deliverable.');
 const milestoneKeys=new Set(milestones.map(r=>r.key)),actionKeys=new Set(actions.map(r=>r.key));let edges=0;
 for(const row of actions){if(row.milestoneKey!==null&&!milestoneKeys.has(row.milestoneKey))fail('Choose a Milestone from this setup.');if(new Set(row.dependsOn).size!==row.dependsOn.length||row.dependsOn.some(k=>!actionKeys.has(k)))fail('Choose distinct Actions from this setup as dependencies.');edges+=row.dependsOn.length;row.dependsOn.sort();}
 if(edges>WORK_SETUP_LIMITS.edges)fail('This setup has too many dependencies.');
 const graph=new Map(actions.map(r=>[r.key,r.dependsOn])),visiting=new Set(),visited=new Set();function visit(key){if(visiting.has(key))fail('Action dependencies cannot contain a cycle.');if(visited.has(key))return;visiting.add(key);for(const parent of graph.get(key))visit(parent);visiting.delete(key);visited.add(key);}for(const key of actionKeys)visit(key);
 const definition={schemaVersion:1,name:label(input.name,'setup name'),description:text(input.description,2000,'setup description',true),project,milestones,actions,deliverables};
 if(new TextEncoder().encode(JSON.stringify(definition)).byteLength>WORK_SETUP_LIMITS.bytes)fail('This setup is too large.');return definition;
}
export function compileWorkSetup({definition,eventName,eventDate}){
 const d=validateWorkSetup(definition),name=label(eventName,'event name');if(!workSetupDate(eventDate))fail('Choose a valid event date.');
 const expand=(value,max,field)=>text(value.replaceAll('{{event}}',()=>name),max,field,true);
 return {schemaVersion:1,eventName:name,eventDate,project:{name,status:'planned',health:'on_track',visibility:'internal',startDate:offsetWorkDate(eventDate,d.project.startOffset),targetDate:offsetWorkDate(eventDate,d.project.targetOffset)},
  milestones:d.milestones.map((r,i)=>({key:r.key,name:expand(r.name,120,'expanded Milestone name'),position:(i+1)*10,status:'upcoming',visibility:'internal',startDate:offsetWorkDate(eventDate,r.startOffset),targetDate:offsetWorkDate(eventDate,r.targetOffset)})),
  actions:d.actions.map(r=>({key:r.key,title:expand(r.title,120,'expanded Action title'),description:expand(r.instructions,5000,'expanded Action instructions')||null,milestoneKey:r.milestoneKey,status:'to_do',priority:'normal',visibility:'internal',dueDate:offsetWorkDate(eventDate,r.dueOffset)})),
  deliverables:d.deliverables.map(r=>({key:r.key,title:expand(r.title,120,'expanded Deliverable title'),description:expand(r.instructions,5000,'expanded Deliverable instructions')||null,status:'planned',visibility:'internal',targetDate:offsetWorkDate(eventDate,r.targetOffset)})),
  dependencies:d.actions.flatMap(r=>r.dependsOn.map(dependsOnKey=>({actionKey:r.key,dependsOnKey})))};
}
