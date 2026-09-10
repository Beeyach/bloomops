import { setup as work, NOW } from './_work-projections.mjs';
import { systemsProjection } from '../lib/bloomops/systems.mjs';

export async function setup(options = {}) {
  const t = await work(options);
  t.project('ghl', { service_engagement_id: 'ghl-service', name: 'Website delivery' });
  t.project('kajabi', { client_id: 'lawrence', service_engagement_id: 'kajabi-service', name: 'Course delivery' });
  t.systems = (actor = t.owner, filters = {}, options = {}) => systemsProjection(t.db, actor, filters, { now: NOW, ...options });
  return t;
}
