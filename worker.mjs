// OpenNext documents this custom-Worker seam for wrapping its generated fetch
// handler. The generated file exists after `opennextjs-cloudflare build`.
// @ts-ignore generated at build time
import app from './.open-next/worker.js';
import { handlePerf4Request } from './lib/bloomops/perf4-worker.mjs';

export default {
  fetch(request, env, ctx) {
    return handlePerf4Request(request, env, ctx, (nextRequest, nextEnv, nextCtx) =>
      app.fetch(nextRequest, nextEnv, nextCtx));
  },
};
