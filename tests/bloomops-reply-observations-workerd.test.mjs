import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {thread, message} from './_prospect-reply-thread.mjs';
const require = createRequire(import.meta.url), wrangler = dirname(require.resolve('wrangler/package.json'));
const {Miniflare, convertV4MiniflareOptions} = require(require.resolve('miniflare', {paths: [wrangler]}));
const failed = {status: 'unresolved', hold: true, observations: []};

test('real workerd exact-thread reader rejects redirects, partial data and stalled streams without forwarding credentials', {timeout: 35000}, async () => {
  const bundle = await build({bundle: true, write: false, format: 'esm', platform: 'neutral', stdin: {
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), contents: `
      import {inspectGoogleReplyThread} from './lib/bloomops/prospect-reply-observations.mjs';
      import {context} from './tests/_prospect-reply-thread.mjs';
      export default {async fetch(){return Response.json(await inspectGoogleReplyThread('synthetic-token', context));}};
    `,
  }});
  let status = 200, mode = 'valid', calls = 0;
  const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-05-01', cf: false, logRequests: false,
    // Synthetic in-memory egress only. No credentials, D1, app session, or live mailbox.
    outboundService: async request => {
      calls++;
      const url = new URL(request.url);
      assert.equal(url.origin + url.pathname, 'https://gmail.googleapis.com/gmail/v1/users/me/threads/sent-thread');
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-token');
      assert.equal(url.searchParams.get('format'), 'metadata');
      if (status !== 200) return new Response(null, {status, headers: {location: 'https://untrusted.example.test/collect'}});
      if (mode === 'oversized') return new Response('x'.repeat(256 * 1024 + 1));
      if (mode === 'malformed') return new Response('{"messages":');
      if (mode === 'wrong-anchor') {const value = thread(message('reply')); value.messages.shift(); return Response.json(value);}
      if (mode === 'returned-rfc') {const value=thread(message('reply',{'In-Reply-To':'<returned-google-id@example.test>'}));value.messages[0].payload.headers.find(h=>h.name==='Message-ID').value='<returned-google-id@example.test>';return Response.json(value);}
      if (mode === 'stalled-stream') return new Response(new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode('{'));}}));
      return Response.json(thread(message('reply')));
    },
  }));
  try {
    const invoke = async () => (await mf.dispatchFetch('http://localhost')).json();
    assert.equal((await invoke()).observations[0].kind, 'reply_unreviewed');
    mode='returned-rfc';assert.equal((await invoke()).observations[0].match,'reply_chain');mode='valid';
    for (status of [204, 206, 301, 302, 303, 307, 308, 400, 401, 403, 404, 429, 503]) {
      const before = calls; assert.deepEqual(await invoke(), failed); assert.equal(calls, before + 1);
    }
    status = 200;
    for (mode of ['oversized', 'malformed', 'wrong-anchor']) assert.deepEqual(await invoke(), failed);
    mode = 'stalled-stream';
    const start = Date.now(); assert.deepEqual(await invoke(), failed);
    assert.ok(Date.now() - start >= 14000, 'real deadline was exercised');
    assert.ok(Date.now() - start < 25000, 'stream body is covered by the request deadline');
    assert.equal(calls, 19);
  } finally {await mf.dispose();}
});
