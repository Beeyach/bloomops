// Numeric-only local instrumentation. Depth is the longest observed chain of
// non-overlapping binding invocations, not a reconstructed causal dependency.
export function beginInvocation(sample, statements, startMs) {
  const invocation = { statements, count: statements.length, startMs,
    depth: 1 + Math.max(0, ...sample.queries.filter(q => q.durationMs !== undefined).map(q => q.depth)) };
  sample.queries.push(invocation);
  return invocation;
}

export function completeSample(sample, completeMs) {
  sample.completeMs = completeMs;
  sample.statements = sample.queries.reduce((n, q) => n + q.count, 0);
  sample.invocations = sample.queries.length;
  sample.depth = Math.max(0, ...sample.queries.map(q => q.depth));
  let end = 0, wait = 0;
  for (const q of [...sample.queries].sort((a, b) => a.startMs - b.startMs)) {
    const until = q.startMs + q.durationMs;
    wait += Math.max(0, until - Math.max(end, q.startMs)); end = Math.max(end, until);
  }
  sample.d1WaitMs = wait;
  // Elapsed outside binding intervals, including scheduling/serialization;
  // never label this CPU time, nor sum overlapping waits as elapsed time.
  sample.nonD1ElapsedMs = completeMs - wait;
  return sample;
}
