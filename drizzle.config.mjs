// Drizzle Kit configuration for the BloomOps domain schema.
//
// Only `generate` is used: it turns lib/bloomops/schema.mjs into SQL
// migrations under ./drizzle, which `wrangler d1 migrations apply` then runs
// against the D1 database of the chosen environment (wrangler.jsonc names
// ./drizzle as each environment's migrations_dir). No `push` and no database
// credentials live here, so this file can never reach a remote database.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/bloomops/schema.mjs',
  out: './drizzle',
  strict: true,
  verbose: true,
});
