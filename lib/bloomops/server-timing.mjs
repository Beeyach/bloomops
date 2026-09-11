// PERF4 bounded timing primitive. Local development and the separately gated
// staging Worker adapter may opt in. Production/default calls stay inert.
const routes = new Set(['home', 'clients', 'work', 'social', 'systems', 'team', 'ads']);
const stages = Object.freeze(['identity', 'membership', 'actor', 'home', 'systems',
  'wait1', 'wait2', 'wait3', 'wait4', 'wait5', 'wait6', 'wait7', 'wait8']);
const empty = Object.freeze({});
const off = Object.freeze({
  mark() {}, response: () => empty, firstChunk() {}, finish() {},
  measure: (_stage, work) => work(),
});
const round = value => Number(value.toFixed(1));
const maxElapsed = 120_000;

/**
 * Request-local, bounded elapsed-time collector; accepts no Request, identity or payload.
 * Existing navigation stage events can call mark(stage, event). wait1..8 represent
 * native invocation ordinals, NOT SQL execution time or inferred projection stages.
 * Caller owns honest response/first-read/EOF boundaries and a sanitized output sink.
 * Headers are a snapshot at response availability, never final-stream predictions.
 */
export function createServerTiming(options = {}) {
  try {
    const { enabled, environment, stagingAuthorized, route, now = () => performance.now(), emit } = options;
    const allowedEnvironment = environment === 'development'
      || (environment === 'staging' && stagingAuthorized === true);
    if (enabled !== true || !allowedEnvironment || !routes.has(route)) return off;
    const start = now();
    if (!Number.isFinite(start) || start < 0) return off;
    // Fresh 128-bit randomness. No UUID, timestamp, inbound ID, build or identity input.
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    const allowed = stages.filter(stage => !['home', 'systems'].includes(stage) || stage === route);
    const intervals = new Map();
    let last = start, valid = true, finished = false, responseAt, firstAt, headers;
    let incomplete = false;
    function stamp() {
      if (!valid || finished) return;
      try {
        const value = now();
        if (!Number.isFinite(value) || value < last || value - start > maxElapsed) {
          valid = false;
          return;
        }
        last = value;
        return value - start;
      } catch { valid = false; }
    }
    function mark(stage, event) {
      if (!allowed.includes(stage) || !['start', 'end'].includes(event)) return;
      const at = stamp();
      if (at === undefined) return;
      const interval = intervals.get(stage);
      // Never sum repeated, nested or mismatched starts into a plausible duration.
      if (event === 'start' && !interval) intervals.set(stage, { start: at });
      else if (event === 'end' && interval && interval.end === undefined && !interval.invalid) interval.end = at;
      else { intervals.set(stage, { invalid: true }); incomplete = true; }
    }
    function metrics() {
      const result = {};
      for (const stage of allowed) {
        const span = intervals.get(stage);
        if (span && !span.invalid && span.end !== undefined) result[stage] = round(span.end - span.start);
      }
      return result;
    }
    function response() {
      if (headers) return headers;
      const at = stamp();
      if (at === undefined) return empty;
      responseAt = at;
      const values = { response: round(at), ...metrics() };
      headers = Object.freeze({
        'Server-Timing': Object.entries(values).map(([name, value]) => `${name};dur=${value.toFixed(1)}`).join(', '),
        'X-Bloomops-Timing': id,
      });
      return headers;
    }
    function firstChunk() {
      if (responseAt === undefined || firstAt !== undefined) return;
      firstAt = stamp();
    }
    function finish(event = 'complete') {
      if (!['complete', 'cancel', 'error'].includes(event) || responseAt === undefined) return;
      const at = stamp();
      if (at === undefined) return;
      finished = true;
      const values = { response: round(responseAt), ...metrics() };
      if (firstAt !== undefined) values.first = round(firstAt);
      // Only a caller-observed normal EOF establishes total stream completion.
      values[event === 'complete' ? 'total' : 'elapsed'] = round(at);
      if (event === 'complete' && !incomplete && [...intervals.values()].every(span => span.end !== undefined)) {
        let union = 0, end = 0;
        for (const span of [...intervals.values()].sort((a, b) => a.start - b.start)) {
          union += Math.max(0, span.end - Math.max(end, span.start));
          end = Math.max(end, span.end);
        }
        values.unattributed = round(Math.max(0, at - union));
      }
      // Offsets share the request's monotonic origin, preserving overlap and
      // sequential waits in post-header evidence without a wall-clock timestamp.
      const spans = {};
      for (const stage of allowed) {
        const span = intervals.get(stage);
        if (span && !span.invalid && span.end !== undefined) spans[stage] = Object.freeze({
          start: round(span.start), duration: round(span.end - span.start),
        });
      }
      const record = Object.freeze({ event, id, route, metrics: Object.freeze(values), spans: Object.freeze(spans) });
      // Diagnostics cannot replace the application's return/error, even for async sinks.
      try { Promise.resolve(emit?.(record)).catch(() => {}); } catch { /* drop */ }
      return record;
    }
    return Object.freeze({ mark, response, firstChunk, finish,
      async measure(stage, work) {
        mark(stage, 'start');
        try { return await work(); } finally { mark(stage, 'end'); }
      },
    });
  } catch { return off; }
}
