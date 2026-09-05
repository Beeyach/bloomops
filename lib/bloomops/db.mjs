// BloomOps domain database access: Drizzle over the environment's D1 binding.
//
// Runtime code for the BloomOps domain goes through this module, never through
// hand-written SQL against the domain tables. The inherited Leadsthatbloom
// helper in lib/db.js keeps serving the inherited app until its own phase
// replaces it; the two never touch each other's tables.
import { drizzle } from 'drizzle-orm/d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as schema from './schema.mjs';

export { schema };

// Wrap a D1 binding (a Worker's env.DB) in Drizzle with the BloomOps schema.
export function bloomOpsDb(d1) {
  if (!d1 || typeof d1.prepare !== 'function') {
    throw new Error('bloomOpsDb needs a D1 binding');
  }
  return drizzle(d1, { schema });
}

// The database of whichever environment is serving the current request.
// Bindings come from wrangler.jsonc, so this can only ever reach the D1
// declared for that environment.
export function getBloomOpsDb() {
  const { env } = getCloudflareContext();
  if (!env || !env.DB) {
    throw new Error('D1 binding "DB" not found. Declare it under d1_databases in wrangler.jsonc for the environment being served.');
  }
  return bloomOpsDb(env.DB);
}
