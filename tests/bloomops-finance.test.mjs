import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {run,one,all} from './_bloomops-db.mjs';
import {financeInput,financeAmount} from '../lib/bloomops/finance-values.mjs';
import {saveFinanceRecord,getFinanceRecord,listFinanceRecords,financeParents,setFinanceAccess,financeAccessMembers} from '../lib/bloomops/finance.mjs';
const record=(extra={})=>({title:'Synthetic invoice',amount:'10.25',currency:'USD',status:'sent',dueDate:'2026-01-01',paidDate:null,renewalDate:null,provider:'Manual',reference:'QA',notes:'Private note',archived:false,...extra});
const body=(t,extra={})=>({workspaceId:'a',userId:t.owner.userId,clientId:'james',serviceEngagementId:'ghl-service',kind:'invoice',requestId:crypto.randomUUID(),record:record(),...extra});
const grant=(t,who,mode,actor=t.owner)=>setFinanceAccess(t.db,actor,'m-'+who,{workspaceId:actor.workspaceId,userId:actor.userId,targetUserId:who,mode});

test('exact minor units, zero, ISO precision and missing/invalid distinction',()=>{
 for(const [currency,amount,minor,digits] of [['USD','0',0,2],['USD','0.10',10,2],['JPY','150',150,0],['KWD','1.005',1005,3]]){
  const v=financeInput(record({currency,amount}),'invoice').value;assert.equal(v.amountMinor,minor);assert.equal(v.currencyDigits,digits);assert.equal(financeAmount(minor,digits),({USD:amount==='0'?'0.00':'0.10',JPY:'150',KWD:'1.005',CLF:'1.0001'})[currency]);
 }
 for(const amount of ['',null,0,'-1','NaN','Infinity','1e2','0.001','1000000000000.01'])assert.ok(financeInput(record({amount}),'invoice').error,String(amount));
 assert.ok(financeInput(record({currency:'JPY',amount:'0.1'}),'invoice').error);
 assert.equal(financeAmount('90071992547409930',2),'900719925474099.30');
});

test('ISO minor units are independent of locale display rounding',()=>{
 for(const currency of ['AFN','ALL','COP','HUF','IDR','IRR','KPW','LAK','LBP','MGA','MMK','PKR','SOS','SYP','YER']){
  const v=financeInput(record({currency,amount:'1.25'}),'invoice').value;
  assert.equal(v.amountMinor,125,currency);assert.equal(v.currencyDigits,2,currency);
  assert.equal(financeAmount(v.amountMinor,v.currencyDigits),'1.25');
 }
 const iq=financeInput(record({currency:'IQD',amount:'1.005'}),'invoice').value;
 assert.equal(iq.amountMinor,1005);assert.equal(iq.currencyDigits,3);
 assert.ok(financeInput(record({currency:'IQD',amount:'1.0005'}),'invoice').error);
 for(const currency of ['XDR','XSU','SLL'])assert.ok(financeInput(record({currency}),'invoice').error);
 // Existing pinned precision is not silently reinterpreted by a catalogue update.
 assert.equal(financeInput(record({currency:'HUF',amount:'125'}),'invoice',0).value.amountMinor,125);
});

test('dates and invoice/payment vocabulary validate without silently processing money',()=>{
 for(const dueDate of ['2026-02-29','2026-13-01','2026-01-00','2026-01-01T00:00:00Z'])assert.ok(financeInput(record({dueDate}),'invoice').error);
 assert.equal(financeInput(record({dueDate:'2028-02-29'}),'invoice').value.dueDate,'2028-02-29');
 assert.ok(financeInput(record({status:'paid'}),'invoice').error);assert.ok(financeInput(record({paidDate:'2026-01-01'}),'invoice').error);
 assert.ok(financeInput(record({status:'overdue',dueDate:null}),'invoice').error);
 for(const status of ['completed','refunded'])assert.ok(financeInput(record({status,paidDate:'2026-01-01'}),'payment').value);
 assert.ok(financeInput(record({status:'sent'}),'payment').error);
});

test('real creation, canonical intent retries, distinct request IDs and reopen preserve data',async()=>{
 const t=await setup(),input=body(t),a=await saveFinanceRecord(t.db,t.owner,null,input);assert.equal(a.ok,true);
 const retry=await saveFinanceRecord(t.db,t.owner,null,{...input,record:Object.fromEntries(Object.entries(input.record).reverse())});assert.equal(retry.id,a.id);
 assert.equal((await saveFinanceRecord(t.db,t.owner,null,{...input,record:record({notes:'Different'})})).reason,'conflict');
 const b=await saveFinanceRecord(t.db,t.owner,null,{...input,requestId:crypto.randomUUID()});assert.notEqual(a.id,b.id);
 const saved=await getFinanceRecord(t.db,t.owner,a.id);assert.equal(saved.amount,'10.25');assert.equal(saved.serviceName,'systems');assert.equal(saved.notes,'Private note');assert.equal(saved.revision,1);assert.equal(saved.creationHash,undefined);assert.deepEqual((await listFinanceRecords(t.db,t.owner)).items.find(x=>x.id===a.id),saved);
 assert.equal(one(t.raw,'SELECT count(*) n FROM finance_records').n,2);
});

test('concurrent creates deduplicate and stale edits cannot overwrite; archive/restore retains receipt',async()=>{
 const t=await setup(),input=body(t);const writes=await Promise.all([saveFinanceRecord(t.db,t.owner,null,input),saveFinanceRecord(t.db,t.owner,null,input)]);assert.equal(writes[0].id,writes[1].id);
 const id=writes[0].id,update={...input,expectedRevision:1,record:record({amount:'11.00'})};
 const changes=await Promise.all([saveFinanceRecord(t.db,t.owner,id,update),saveFinanceRecord(t.db,t.owner,id,{...update,record:record({amount:'22.00'})})]);assert.equal(changes.filter(x=>x.ok).length,1);assert.equal(changes.filter(x=>x.reason==='conflict').length,1);
 let saved=await getFinanceRecord(t.db,t.owner,id);assert.equal(saved.amount,'11.00');
 assert.equal((await saveFinanceRecord(t.db,t.owner,id,{...input,expectedRevision:2,record:record({archived:true})})).ok,true);
 assert.equal((await listFinanceRecords(t.db,t.owner)).items.length,0);assert.equal((await listFinanceRecords(t.db,t.owner,{archived:'true'})).items.length,1);
 assert.equal((await saveFinanceRecord(t.db,t.owner,null,input)).id,id,'retry does not overwrite archived record');
 assert.equal((await saveFinanceRecord(t.db,t.owner,id,{...input,expectedRevision:3,record:record()})).ok,true);
 assert.equal((await listFinanceRecords(t.db,t.owner)).items.length,1);
});

test('capability management respects canonical manager policy, target identity and inherent Owner grants',async()=>{
 const t=await setup(),admin=await t.actor('ary'),sam=await t.actor('sam');
 assert.equal(await financeAccessMembers(t.db,sam),null);assert.ok(await financeAccessMembers(t.db,admin));
 assert.equal((await grant(t,'sam','edit',admin)).ok,true);assert.equal((await grant(t,'other','edit',sam)).reason,'not_found');
 assert.equal((await grant(t,'james','edit')).reason,'not_found');assert.equal((await grant(t,'foreign','edit')).reason,'not_found');assert.equal((await grant(t,'ellen','none')).reason,'not_found');
 assert.equal((await setFinanceAccess(t.db,t.owner,'m-sam',{workspaceId:'a',userId:'ellen',targetUserId:'other',mode:'none'})).reason,'not_found');
 assert.equal(all(t.raw,"SELECT capability FROM member_capabilities WHERE membership_id='m-sam'").length,2);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ary'");assert.equal((await grant(t,'sam','none',admin)).reason,'not_found');
});

test('Finance and parent scope remain independent; Service-only grants cannot read Client-level or sibling records',async()=>{
 const t=await setup(),own=await saveFinanceRecord(t.db,t.owner,null,body(t)),other=await saveFinanceRecord(t.db,t.owner,null,body(t,{serviceEngagementId:'social-service'})),client=await saveFinanceRecord(t.db,t.owner,null,body(t,{serviceEngagementId:null}));
 const sam=await t.actor('sam');assert.equal((await listFinanceRecords(t.db,sam)).reason,'not_found');await grant(t,'sam','edit');assert.equal((await listFinanceRecords(t.db,sam)).items.length,0);
 run(t.raw,"INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','ghl-service','m-sam')");
 assert.deepEqual((await listFinanceRecords(t.db,sam)).items.map(x=>x.id),[own.id]);assert.equal(await getFinanceRecord(t.db,sam,other.id),null);assert.equal(await getFinanceRecord(t.db,sam,client.id),null);
 assert.deepEqual((await financeParents(t.db,sam)).items.map(x=>x.serviceEngagementId),['ghl-service']);
 const created=await saveFinanceRecord(t.db,sam,null,body(t,{userId:'sam'}));assert.equal(created.ok,true);
 run(t.raw,"DELETE FROM service_assignments WHERE membership_id='m-sam'");assert.equal(await getFinanceRecord(t.db,sam,created.id),null);
 run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");assert.equal((await listFinanceRecords(t.db,sam)).items.length,4);
 await grant(t,'sam','view');assert.equal((await saveFinanceRecord(t.db,sam,null,body(t,{userId:'sam'}))).reason,'not_found');await grant(t,'sam','none');assert.equal(await getFinanceRecord(t.db,sam,own.id),null);
});

test('foreign parents, portal, preview, swapped identity and stale authority are denied without writes',async()=>{
 const t=await setup(),input=body(t),made=await saveFinanceRecord(t.db,t.owner,null,input);
 for(const actor of [await t.actor('james'),await t.actor('foreign'),{...t.owner,preview:{clientId:'james'}},{...t.owner,userId:'other'}]){assert.equal(await getFinanceRecord(t.db,actor,made.id),null);assert.equal((await saveFinanceRecord(t.db,actor,null,{...input,userId:actor.userId,workspaceId:actor.workspaceId})).ok,false);}
 for(const serviceEngagementId of ['kajabi-service','foreign-service','missing'])assert.equal((await saveFinanceRecord(t.db,t.owner,null,body(t,{serviceEngagementId}))).ok,false);
 assert.equal(one(t.raw,'SELECT count(*) n FROM finance_records').n,1);
 run(t.raw,"UPDATE workspace_memberships SET role='client' WHERE id='m-ellen'");assert.equal(await getFinanceRecord(t.db,t.owner,made.id),null);assert.equal((await saveFinanceRecord(t.db,t.owner,made.id,{...input,expectedRevision:1})).ok,false);
});

test('summaries cover all authorized filtered rows before paging and never net invoices against payments',async()=>{
 const t=await setup();for(let i=0;i<27;i++)assert.equal((await saveFinanceRecord(t.db,t.owner,null,body(t,{record:record({amount:'0.10'})}))).ok,true);
 await saveFinanceRecord(t.db,t.owner,null,body(t,{kind:'payment',record:record({status:'completed',paidDate:'2026-01-01',amount:'1.25'})}));
 await saveFinanceRecord(t.db,t.owner,null,body(t,{record:record({currency:'JPY',amount:'100'})}));
 const view=await listFinanceRecords(t.db,t.owner);assert.equal(view.items.length,25);assert.equal(view.more,true);assert.equal((await listFinanceRecords(t.db,t.owner,{page:'2'})).items.length,4);
 assert.deepEqual(view.totals.map(x=>[x.currency,x.kind,x.amount,x.count]),[['JPY','invoice','100',1],['USD','invoice','2.70',27],['USD','payment','1.25',1]]);
 assert.equal((await listFinanceRecords(t.db,t.owner,{kind:'payment'})).totals.length,1);assert.equal((await listFinanceRecords(t.db,t.owner,{overdue:'true'})).totals.length,2);
 for(const q of [{page:'0'},{kind:'constructor'},{foo:'bar'},{status:'unknown'},{archived:'false'}])assert.equal((await listFinanceRecords(t.db,t.owner,q)).reason,'invalid');
});

test('database constraints independently reject invalid relationships/amounts and preserve parents on deletion',async()=>{
 const t=await setup(),made=await saveFinanceRecord(t.db,t.owner,null,body(t));
 for(const sql of ["UPDATE finance_records SET service_engagement_id='kajabi-service'","UPDATE finance_records SET workspace_id='b'","UPDATE finance_records SET amount_minor=-1","UPDATE finance_records SET amount_minor=1.5","UPDATE finance_records SET status='failed'","DELETE FROM service_engagements WHERE id='ghl-service'","DELETE FROM bloomops_clients WHERE id='james'"])assert.throws(()=>run(t.raw,sql));
 assert.equal((await getFinanceRecord(t.db,t.owner,made.id)).amount,'10.25');assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
