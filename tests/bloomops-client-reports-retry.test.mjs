import {test} from 'node:test';
import {setup} from './_work-projections.mjs';
import {checkEquivalentRetries,checkConcurrentRetries} from './_client-report-retry.mjs';

for(const template of ['ghl_campaign','social']) {
  test(`${template}: reordered creation intent retries without changing saved data`,async ctx=>{
    const t=await setup();ctx.after(()=>t.raw.close());
    await checkEquivalentRetries(t.db,t.owner,template);
  });
  test(`${template}: concurrent reordered creation intents persist one draft`,{timeout:10000},async ctx=>{
    const t=await setup();ctx.after(()=>t.raw.close());
    await checkConcurrentRetries(t.db,t.owner,template);
  });
}
