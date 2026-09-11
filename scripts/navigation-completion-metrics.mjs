// Browser epochs share performance.timeOrigin/CDP wallTime. Server intervals
// use their own monotonic clock and are not subtracted from browser epochs.
export function completionMetrics(request, dom) {
  const relative = at => Number.isFinite(at) ? at - dom.clickAt : null;
  const bodyEnd = Number.isFinite(request.bodyEndAt) ? request.bodyEndAt : null;
  return {
    clickToRequestMs: relative(request.requestAt), headersMs: relative(request.headersAt),
    firstChunkMs: relative(request.firstChunkAt), lastChunkMs: relative(request.lastChunkAt), finalBodyMs: relative(bodyEnd),
    domMs: relative(dom.domAt), visibleMs: relative(dom.framesAt),
    requestToHeadersMs: request.headersAt - request.requestAt,
    headersToBodyMs: bodyEnd === null ? null : bodyEnd - request.headersAt,
    // This may be negative: a complete DOM can commit before network EOF.
    // Retain that observation instead of clamping it or substituting TTFB.
    bodyToDomMs: bodyEnd === null ? null : dom.domAt - bodyEnd,
    domToFramesMs: dom.framesAt - dom.domAt,
    readerEndMs: relative(dom.body?.endAt), readerBytes: dom.body?.bytes ?? null,
    encodedBytes: request.encodedBytes ?? null, decodedBytes: request.decodedBytes ?? null,
  };
}

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b), n = sorted.length;
  return n ? { samples: n, median: (sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)])/2,
    min: sorted[0], p95: sorted[Math.ceil(n*.95)-1], max: sorted.at(-1) } : null;
}
