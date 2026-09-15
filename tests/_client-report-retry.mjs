import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {schema} from '../lib/bloomops/db.mjs';
import {saveClientReport, getClientReport} from '../lib/bloomops/client-reports.mjs';
import {draft, input, observation} from './_client-report-fixture.mjs';

const reverse = object => Object.fromEntries(Object.entries(object).reverse());
function command(templateId) {
  const keys = templateId === 'social'
    ? ['published','views','reach','interactions','link_clicks','followers_start','followers_end']
    : ['sent','delivered','failed','clicked','replied','opt_outs'];
  return input({templateId, draft:draft({
    channel:templateId === 'social' ? 'instagram' : 'email',
    metrics:Object.fromEntries(keys.map(key => [key, observation(10)])),
  })});
}
function reordered(v) {
  return {...v, draft:reverse({...v.draft, metrics:reverse(Object.fromEntries(
    Object.entries(v.draft.metrics).map(([key,value]) => [key, reverse(value)]),
  ))})};
}
async function snapshot(db, id) {
  return {
    header:await db.select().from(schema.clientReportDrafts).where(eq(schema.clientReportDrafts.id,id)),
    metrics:await db.select().from(schema.clientReportMetrics).where(eq(schema.clientReportMetrics.reportId,id)).orderBy(schema.clientReportMetrics.metricKey),
  };
}

// Shared behavioral assertions run against both migrated SQLite and native D1.
export async function checkEquivalentRetries(db, actor, templateId) {
  const v = command(templateId);
  const saved = await saveClientReport(db,actor,'james',null,v);
  assert.equal(saved.ok,true);
  const before = await snapshot(db,saved.id);
  const variants = [
    {...v,draft:reverse(v.draft)},
    {...v,draft:{...v.draft,metrics:reverse(v.draft.metrics)}},
    {...v,draft:{...v.draft,metrics:Object.fromEntries(Object.entries(v.draft.metrics).map(([key,value]) => [key,reverse(value)]))}},
    reordered(v),
    {...v,draft:{...v.draft,title:'  '+v.draft.title+'  ',accountLabel:' '+v.draft.accountLabel+' ',scopeLabel:' '+v.draft.scopeLabel+' ',commentary:' '+v.draft.commentary+' ',metrics:Object.fromEntries(Object.entries(v.draft.metrics).map(([key,value])=>[key,{...value,sourceNote:' '+value.sourceNote+' '}]))}},
  ];
  for (const [index,variant] of variants.entries()) {
    assert.deepEqual(await saveClientReport(db,actor,'james',null,variant),saved,`${templateId} equivalent retry variant ${index}`);
    assert.deepEqual(await snapshot(db,saved.id),before,'retry must not rewrite the header or metric rows');
  }
  const fields = {title:'Changed',periodStart:'2026-08-02',periodEnd:'2026-08-30',timezone:'UTC',channel:templateId==='social'?'facebook':'sms',accountLabel:'Different account',scopeLabel:'Different scope',commentary:'Different commentary'};
  const key = templateId === 'social' ? 'views' : 'clicked';
  const metricChanges = [{value:11},{state:'missing',value:null},{state:'unavailable',value:null},{state:'not_tracked',value:null},{sourceNote:'Different provenance'},{collectedAt:'2026-09-02T00:00:00.000Z'}];
  for (const [field,value] of Object.entries(fields)) {
    assert.equal((await saveClientReport(db,actor,'james',null,{...v,draft:{...v.draft,[field]:value}})).reason,'conflict',field);
  }
  for (const change of metricChanges) {
    assert.equal((await saveClientReport(db,actor,'james',null,{...v,draft:{...v.draft,metrics:{...v.draft.metrics,[key]:{...v.draft.metrics[key],...change}}}})).reason,'conflict',JSON.stringify(change));
  }
  assert.deepEqual(await snapshot(db,saved.id),before);
  const separate = await saveClientReport(db,actor,'james',null,{...reordered(v),requestId:crypto.randomUUID()});
  assert.equal(separate.ok,true);
  assert.notEqual(separate.id,saved.id,'different UUID remains a separate creation');
  assert.equal((await snapshot(db,separate.id)).metrics.length,Object.keys(v.draft.metrics).length);
  assert.equal((await saveClientReport(db,actor,'james',saved.id,{...v,expectedRevision:1,draft:{...v.draft,commentary:'Later saved revision'}})).ok,true);
  const edited = await snapshot(db,saved.id);
  assert.deepEqual(await saveClientReport(db,actor,'james',null,reordered(v)),saved);
  assert.deepEqual(await snapshot(db,saved.id),edited,'creation retry cannot overwrite a later saved edit');
  assert.equal((await getClientReport(db,actor,'james',saved.id)).commentary,'Later saved revision');
}

export async function checkConcurrentRetries(db, actor, templateId) {
  const v=command(templateId);
  let arrivals=0,release;
  const bothAtBatch=new Promise(resolve=>{release=resolve;});
  const concurrentDb=new Proxy(db,{get(target,key){
    if(key==='batch')return async statements=>{
      arrivals++;
      if(arrivals===2)release();
      await bothAtBatch;
      return target.batch(statements);
    };
    const value=Reflect.get(target,key);
    return typeof value==='function'?value.bind(target):value;
  }});
  const results=await Promise.all([
    saveClientReport(concurrentDb,actor,'james',null,v),
    saveClientReport(concurrentDb,actor,'james',null,reordered(v)),
  ]);
  assert.equal(arrivals,2,'both writers reached the transaction before either committed');
  assert.equal(results[0].ok,true);
  assert.deepEqual(results[1],results[0]);
  const rows=await db.select().from(schema.clientReportDrafts).where(eq(schema.clientReportDrafts.requestId,v.requestId));
  assert.equal(rows.length,1);
  const stored=await snapshot(db,results[0].id);
  assert.equal(stored.metrics.length,Object.keys(v.draft.metrics).length);
  assert.equal(stored.header[0].revision,1);
  assert.equal((await getClientReport(db,actor,'james',results[0].id)).title,v.draft.title);
}
