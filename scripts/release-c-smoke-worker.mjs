// Disposable acceptance entry, never part of the deployed app.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { releaseCStory } from './release-c-story.mjs';

export default { async fetch(request, env) {
  if (env.C7_DISPOSABLE !== 'local-only' || new URL(request.url).hostname !== 'localhost') return new Response(null, { status: 403 });
  const messages = [];
  try {
    for (const statement of C7_MIGRATIONS) await env.DB.prepare(statement).run();
    await releaseCStory({ db: drizzle(env.DB, { schema }), d1: env.DB, bucket: env.FILES,
      check: (name, ok) => { assert.ok(ok, name); messages.push(name); } });
    return Response.json({ messages, checks: messages.length });
  } catch (error) {
    return Response.json({ messages, error: String(error.stack || error) }, { status: 500 });
  }
} };
