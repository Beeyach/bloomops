// One AI call, for work that runs without a person watching.
//
// /api/ai is the transport for everything a person clicks: it checks the daily
// call limit, charges credits, and answers an HTTP request. Background jobs
// need none of that shape and cannot use it anyway, because there is no request
// to authenticate. What they do need is the same key, the same model routing,
// and the same usage ledger, so the cost of automatic work shows up in exactly
// the place the manual work does.
//
// Deliberately small. Anything that grows a second responsibility here belongs
// in the handler that called it.

import { modelForTask, recordUsage } from './ai-cost.mjs';
import { openSecret } from './secret-box.mjs';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export async function loadAiKey(db, workspace, env) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`)
    .bind(workspace)
    .first();
  if (!row?.value) return { key: '', model: '' };
  let stored = {};
  try { stored = JSON.parse(row.value); } catch { return { key: '', model: '' }; }
  const key = (await openSecret(env || {}, String(stored.aiKey || '').trim()).catch(() => '')).trim();
  // `aiModel`, not `model`. The HTTP route has always read `aiModel`; this
  // read `stored.model`, which does not exist, so every background job
  // silently ignored the workspace's configured model and fell back to the
  // hardcoded default inside modelForTask. One setting, two paths, two
  // behaviours, and nothing failed loudly enough to notice.
  return { key, model: String(stored.aiModel || '').trim() };
}

// Returns { text, usage, model }. Throws with a readable message on failure,
// and marks the error permanent when retrying could not possibly help: a
// missing key and a rejected key are settings problems, not transient ones.
export async function askBackground(db, {
  workspace, task, system = null, prompt, maxTokens = 500, apiKey, configuredModel,
  // Pictures the model should look at, as bytes: `{ data, mediaType }` where
  // `data` is base64.
  //
  // This used to hand Anthropic a public URL and let it fetch the image, which
  // was cheaper and never worked. The first real production run came back
  // "Unable to download the file" on both screenshots while those exact URLs
  // returned 200 and the right byte count from everywhere else that was tried.
  // Whatever refuses that fetch is on a side of the connection nobody here can
  // see or fix, so the argument for URLs — that the pictures are already
  // fetchable — turned out to rest on the one fetch that mattered.
  //
  // Sending the bytes removes the third party from the loop entirely. A
  // screenshot of one screen is tens of kilobytes; base64 adds a third. That is
  // a real cost, and it buys a step that actually happens.
  images = [],
}) {
  if (!apiKey) {
    const e = new Error('No AI key is set for this workspace.');
    e.permanent = true;
    throw e;
  }
  if (!apiKey.startsWith('sk-ant-')) {
    // The background tasks are all routed to a specific Anthropic tier by
    // ai-cost. Sending them somewhere else would silently ignore that routing
    // and bill at whatever the other provider charges.
    const e = new Error('Background work needs an Anthropic key.');
    e.permanent = true;
    throw e;
  }

  const model = modelForTask(task, configuredModel);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{
        role: 'user',
        content: images.length
          ? [
            ...images.map((img) => ({
              type: 'image',
              source: { type: 'base64', media_type: img.mediaType || 'image/png', data: img.data },
            })),
            { type: 'text', text: prompt },
          ]
          : prompt,
      }],
    }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.error?.message || `HTTP ${res.status}`;
    const e = new Error(detail);
    // 401/403 is the key. 400 is the request, which will be identical next
    // time. Neither gets better by trying again.
    if (res.status === 400 || res.status === 401 || res.status === 403) e.permanent = true;
    await recordUsage(db, { workspace, task, model, usage: data?.usage || {}, ok: false });
    throw e;
  }

  const text = (Array.isArray(data?.content) ? data.content : [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const truncated = data?.stop_reason === 'max_tokens';
  await recordUsage(db, { workspace, task, model, usage: data?.usage || {}, ok: true, truncated });

  return { text, model, truncated, usage: data?.usage || {} };
}
