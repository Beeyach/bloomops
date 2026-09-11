// Explicit request-local READ composition, not a database/auth cache. Awaited
// independent Drizzle SELECTs in one callback share a native D1 invocation.
// Dependencies still await earlier results; writes are never intercepted.
import { drizzle } from 'drizzle-orm/d1';
import { fillPlaceholders } from 'drizzle-orm';
import * as schema from './schema.mjs';

const scope = Symbol('BloomOps read batch');
const MAX_STATEMENTS = 32;

export async function readTogether(db, work) {
  if (db[scope] || typeof db.$client?.batch !== 'function') return work(db);
  // Never patch a shared database/session (Better Auth factories can outlive a
  // request). This session and queue exist only for the awaited composition.
  const reads = drizzle(db.$client, { schema, logger: db.session?.logger });
  reads[scope] = true;
  const prepare = reads.session.prepareQuery.bind(reads.session);
  let pending = [], scheduled = false, closed = false;
  async function flush() {
    const group = pending; pending = []; scheduled = false;
    for (let start = 0; start < group.length; start += MAX_STATEMENTS) {
      const chunk = group.slice(start, start + MAX_STATEMENTS);
      try {
        const results = await db.$client.batch(chunk.map(item => item.statement));
        if (results.length !== chunk.length) throw new Error('Incomplete D1 read batch');
        // Map by explicit positional names, never Object.keys() order. Native
        // D1 batch() collapses duplicate SQL column names in joined SELECTs.
        // The CTE preserves the original predicates, ordering, bounds and binds.
        const values = results.map((result, i) => {
          if (!result.success) throw new Error('D1 read batch failed');
          const item = chunk[i];
          return item.prepared.mapAllResult(result.results.map(row => item.names.map(name => row[name])));
        });
        chunk.forEach((item, i) => item.resolve(values[i]));
      } catch (error) { chunk.forEach(item => item.reject(error)); }
    }
  }
  // Deliberately small Drizzle 0.45 adapter seam. Integration tests cover
  // decoder mapping, null joins, CTEs, order/limits, errors and real D1. Recheck
  // this seam when upgrading Drizzle. Unsupported queries execute normally;
  // database failures are never silently retried outside a batch.
  reads.session.prepareQuery = (...args) => {
    const prepared = prepare(...args), [, fields, method, , customMapper, metadata] = args;
    if (method !== 'all' || !fields?.length || customMapper || metadata?.type !== 'select') return prepared;
    prepared.all = (placeholderValues = {}) => {
      if (closed) return Promise.reject(new Error('Read composition already completed'));
      const { sql, params } = prepared.getQuery();
      const names = fields.map((_, i) => `bo_c${i}`);
      const batchedSql = `WITH bo_read(${names.join(',')}) AS (${sql}) SELECT * FROM bo_read`;
      const bindings = fillPlaceholders(params, placeholderValues);
      // Preserve the caller's Drizzle logger (production uses NoopLogger;
      // local regression harnesses use it only for numeric limit checks).
      reads.session.logger.logQuery(batchedSql, bindings);
      const statement = db.$client.prepare(batchedSql).bind(...bindings);
      return new Promise((resolve, reject) => {
        pending.push({ statement, prepared, names, resolve, reject });
        if (!scheduled) { scheduled = true; queueMicrotask(flush); }
      });
    };
    return prepared;
  };
  try { return await work(reads); }
  finally { closed = true; }
}
