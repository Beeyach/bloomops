import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkSetup,compileWorkSetup,offsetWorkDate,workSetupDate,WorkSetupError} from '../lib/bloomops/work-setup-values.mjs';
const fixture=()=>({schemaVersion:1,name:'Auction campaign',description:'Synthetic repeatable work, without audience or sending state.',project:{startOffset:-14,targetOffset:1},
 milestones:[{key:'preparation',name:'Prepare {{event}}',startOffset:-14,targetOffset:-1}],
 actions:[{key:'brief',title:'Review {{event}} brief',instructions:'Check the supplied details for {{event}}.',milestoneKey:'preparation',dueOffset:-14,dependsOn:[]},{key:'review',title:'Review campaign',instructions:'',milestoneKey:'preparation',dueOffset:-1,dependsOn:['brief']}],
 deliverables:[{key:'campaign',title:'{{event}} campaign',instructions:'Prepared output, not an approval or live send.',targetOffset:0}]});
test('a saved definition produces independently dated canonical initial Work proposals',()=>{
 const definition=fixture(),before=structuredClone(definition),plan=compileWorkSetup({definition,eventName:'May auction',eventDate:'2026-05-15'});
 assert.deepEqual(plan.project,{name:'May auction',status:'planned',health:'on_track',visibility:'internal',startDate:'2026-05-01',targetDate:'2026-05-16'});
 assert.equal(plan.milestones[0].name,'Prepare May auction');assert.equal(plan.milestones[0].targetDate,'2026-05-14');
 assert.equal(plan.actions[0].dueDate,'2026-05-01');assert.equal(plan.actions[1].dueDate,'2026-05-14');assert.equal(plan.actions[0].description,'Check the supplied details for May auction.');
 assert.equal(plan.deliverables[0].targetDate,'2026-05-15');assert.deepEqual(plan.dependencies,[{actionKey:'review',dependsOnKey:'brief'}]);assert.deepEqual(definition,before);
 const next=compileWorkSetup({definition,eventName:'June auction',eventDate:'2026-06-15'});assert.equal(next.actions[0].dueDate,'2026-06-01');assert.equal(plan.actions[0].dueDate,'2026-05-01');assert.deepEqual(definition,before);
 for(const row of [...plan.milestones,...plan.actions,...plan.deliverables]){assert.equal(row.visibility,'internal');for(const forbidden of ['ownerMembershipId','assignees','approval','credentials','audience','connection','sendAt','completedAt'])assert.equal(Object.hasOwn(row,forbidden),false);}
 assert.equal(plan.actions[0].status,'to_do');assert.equal(plan.actions[0].priority,'normal');assert.equal(plan.milestones[0].status,'upcoming');assert.equal(plan.deliverables[0].status,'planned');
});
test('undated, event day and signed calendar offsets remain distinct',()=>{
 assert.equal(offsetWorkDate('2026-05-15',null),null);assert.equal(offsetWorkDate('2026-05-15',0),'2026-05-15');assert.equal(offsetWorkDate('2026-05-15',-1),'2026-05-14');assert.equal(offsetWorkDate('2026-05-15',1),'2026-05-16');
 for(const invalid of ['',undefined,NaN,Infinity,0.5,3661,-3661])assert.throws(()=>offsetWorkDate('2026-05-15',invalid),WorkSetupError);
});
test('calendar arithmetic handles leap years, year boundaries and DST dates without clock shifts',()=>{
 for(const [start,days,expected] of [['2024-03-01',-1,'2024-02-29'],['2025-03-01',-1,'2025-02-28'],['2026-01-01',-1,'2025-12-31'],['2026-03-08',1,'2026-03-09'],['2026-11-01',-1,'2026-10-31'],['2026-10-04',1,'2026-10-05']])assert.equal(offsetWorkDate(start,days),expected);
 for(const v of ['2023-02-29','2026-04-31','2026-5-15','0099-12-31','2026-05-15T00:00:00Z',null])assert.equal(workSetupDate(v),false);
 assert.throws(()=>offsetWorkDate('0100-01-01',-1),WorkSetupError);assert.throws(()=>offsetWorkDate('9999-12-31',1),WorkSetupError);
});
test('literal event substitution is bounded and never executable',()=>{
 const definition=fixture(),plan=compileWorkSetup({definition,eventName:'$& ${process.exit()} <script>',eventDate:'2026-05-15'});
 assert.equal(plan.actions[0].title,'Review $& ${process.exit()} <script> brief');assert.throws(()=>compileWorkSetup({definition,eventName:'X'.repeat(120),eventDate:'2026-05-15'}),/expanded/);
});
test('definition validation preserves complete optional instructions and rejects hidden operational fields',()=>{
 assert.equal(validateWorkSetup(fixture()).actions[0].instructions,'Check the supplied details for {{event}}.');
 for(const field of ['assignees','approval','credentials','audiences','sendAt','status','visibility']){const d=fixture();d.actions[0][field]='copied';assert.throws(()=>validateWorkSetup(d),WorkSetupError,field);}
 const d=fixture();Object.defineProperty(d.actions[0],'title',{enumerable:true,get(){throw Error('getter executed');}});assert.throws(()=>validateWorkSetup(d),WorkSetupError);
});
test('unique keys and complete same-setup references are mandatory',()=>{
 for(const mutate of [d=>d.actions[0].key='preparation',d=>d.actions[0].key='bad key',d=>d.actions[0].milestoneKey='foreign',d=>d.actions[1].dependsOn=['foreign'],d=>d.actions[1].dependsOn=['brief','brief']]){const d=fixture();mutate(d);assert.throws(()=>validateWorkSetup(d),WorkSetupError);}
});
test('cycles are rejected; multiple independent dependency edges remain supported',()=>{
 for(const self of [true,false]){const d=fixture();d.actions[0].dependsOn=[self?'brief':'review'];assert.throws(()=>validateWorkSetup(d),/cycle/);}
 const d=fixture();d.actions.push({key:'finish',title:'Final check',instructions:'',milestoneKey:null,dueOffset:1,dependsOn:['review','brief']});const valid=validateWorkSetup(d);assert.deepEqual(valid.actions[2].dependsOn,['brief','review']);assert.deepEqual(d.actions[2].dependsOn,['review','brief']);
});
test('bounds, unsupported versions, sparse rows and reversed date ranges reject before generation',()=>{
 for(const mutate of [d=>d.schemaVersion=2,d=>d.project.targetOffset=-15,d=>d.milestones[0].targetOffset=-15,d=>d.actions=Array(1),d=>d.actions=Array.from({length:61},(_,i)=>({...d.actions[0],key:'a_'+i})),d=>{d.actions=[];d.deliverables=[];},d=>d.actions[0].title=' ',d=>d.actions[0].instructions='x'.repeat(5001)]){const d=fixture();mutate(d);assert.throws(()=>validateWorkSetup(d),WorkSetupError);}
 const d=fixture();d.milestones=[];d.actions=d.actions.map(r=>({...r,milestoneKey:null}));assert.equal(validateWorkSetup(d).milestones.length,0);
});
