// Coarse, data-free stage markers. The production Worker has no subscriber,
// logs or endpoint. The local performance wrapper observes these inside its
// own AsyncLocalStorage request; no authorization state is stored here.
import { channel } from 'node:diagnostics_channel';
const timing = channel('bloomops.navigation');
const stages = new Set(['identity', 'membership', 'actor', 'home', 'systems']);
export async function timedNavigation(stage, work) {
  if (!timing.hasSubscribers || !stages.has(stage)) return work();
  timing.publish({ stage, event: 'start' });
  try { return await work(); }
  finally { timing.publish({ stage, event: 'end' }); }
}
