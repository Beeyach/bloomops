import { setup as work, NOW } from './_work-projections.mjs';
import { run } from './_bloomops-db.mjs';
import { adsProjection } from '../lib/bloomops/ads.mjs';

export async function setup(options = {}) {
  const t = await work(options);
  run(t.raw, "INSERT INTO departments(id,workspace_id,name,slug) VALUES('ads','a','Paid campaigns','ads')");
  run(t.raw, "INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('type-ads','a','Campaign delivery','paid-campaigns','ads')");
  for (const [id, client] of [['launch-service','james'], ['retargeting-service','lawrence']]) {
    run(t.raw, "INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a',?,'type-ads')", id, client);
  }
  t.project('launch', { service_engagement_id: 'launch-service', name: 'Campaign launch' });
  t.project('retargeting', { client_id: 'lawrence', service_engagement_id: 'retargeting-service', name: 'Retargeting delivery' });
  t.ads = (actor = t.owner, filters = {}, options = {}) => adsProjection(t.db, actor, filters, { now: NOW, ...options });
  return t;
}
