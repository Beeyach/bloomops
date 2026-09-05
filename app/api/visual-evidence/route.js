import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';
import { loadAiKey } from '@/lib/ai-call.mjs';
import { artifactFrom, asEvidence, normalizeUrl } from '@/lib/visual-capture.mjs';
import { reviewArtifact, questionFor } from '@/lib/visual-review.mjs';
import { VIEWPORT } from '@/lib/visual-evidence.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The real path: photograph a page, keep the picture, and ask a model what is
// in it.
//
// This exists because the previous pass could prove everything except the one
// thing that matters. The contract was tested, the renderer was deployed, the
// pictures were real — and no model had ever looked at one, because the
// workspace's Anthropic key is encrypted at rest and only this Worker can
// decrypt it. Proving the chain from a shell would have meant extracting a
// secret, which is not a thing to do to prove a feature works.
//
// So the chain runs here, where the key already lives. Nothing about the key
// leaves this process: loadAiKey decrypts it, askBackground uses it, and it is
// never returned, logged or echoed.
//
// Admin only. It spends money and renders third-party sites, which is the same
// bar the audit video sits behind.

const RUN_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function runId() {
  // Not crypto. A label so a set of captures taken together can be read
  // together afterwards.
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (const b of bytes) s += RUN_ID_ALPHABET[b % RUN_ID_ALPHABET.length];
  return `vis-${s}`;
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const body = await req.json().catch(() => ({}));
  const url = String(body?.url || '').trim();
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  // Which findings to ask about. Given explicitly rather than guessed: this
  // route proves a claim, it does not go looking for problems.
  const keys = Array.isArray(body?.keys) && body.keys.length ? body.keys.map(String) : ['cta'];
  const unknown = keys.filter((k) => !questionFor(k));
  if (unknown.length) {
    return NextResponse.json({ error: `no visual question is defined for: ${unknown.join(', ')}` }, { status: 400 });
  }

  const viewports = Array.isArray(body?.viewports) && body.viewports.length
    ? body.viewports.filter((v) => v === VIEWPORT.DESKTOP || v === VIEWPORT.MOBILE)
    : [VIEWPORT.DESKTOP];
  const prospectId = Number.isFinite(Number(body?.prospectId)) ? Number(body.prospectId) : null;

  let env = {};
  try { env = (await import('@cloudflare/next-on-pages')).getRequestContext().env || {}; } catch {}
  const service = String(env.RENDER_URL || '').replace(/\/+$/, '');
  const secret = env.RENDER_SECRET;
  if (!service || !secret) {
    return NextResponse.json({ error: 'The render service is not configured on this deployment.' }, { status: 500 });
  }

  const db = getDb();
  const ws = ctx.workspace;
  const run = runId();

  // ── 1. Photograph it ───────────────────────────────────────────────────
  let shots;
  try {
    const res = await fetch(`${service}/shots`, {
      method: 'POST',
      headers: { 'x-render-secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url], viewports }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ error: json?.error || `the renderer answered ${res.status}` }, { status: 502 });
    }
    shots = Array.isArray(json?.artifacts) ? json.artifacts : [];
  } catch (e) {
    return NextResponse.json({ error: `the renderer could not be reached: ${String(e.message).slice(0, 160)}` }, { status: 502 });
  }

  const { key: apiKey, model: configuredModel } = await loadAiKey(db, ws, env);

  const out = [];
  for (const shot of shots) {
    const artifact = artifactFrom(shot, { workspace: ws, prospectId, runId: run });

    // ── 2. Keep it ───────────────────────────────────────────────────────
    //
    // Written before the model is asked, so a picture that was taken is
    // recorded even if the look fails. An artifact with no verdict supports no
    // claim, which is the correct failure: the enforcement reads the verdict,
    // not the existence of the row.
    const stored = await db
      .prepare(
        `INSERT INTO visual_artifacts
           (workspace, prospect_id, run_id, url, normalized_url, viewport,
            viewport_width, viewport_height, captured_at, http_status, blocked,
            overlay, page_title, stored_at, store_error, sha256, bytes)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
         ON CONFLICT(workspace, normalized_url, viewport, sha256)
         DO UPDATE SET run_id = ?3, captured_at = ?9, stored_at = ?14
         RETURNING id`
      )
      .bind(
        ws, prospectId, run, artifact.url, artifact.normalizedUrl, artifact.viewport,
        artifact.viewportWidth, artifact.viewportHeight, artifact.capturedAt,
        artifact.httpStatus, artifact.blocked ? 1 : 0, artifact.overlay ? 1 : 0,
        artifact.pageTitle, artifact.storedAt, artifact.storeError, artifact.sha256, artifact.bytes
      )
      .first()
      .catch(() => null);

    const withId = { ...artifact, id: stored?.id ?? null };

    // ── 3. Ask what is in it ─────────────────────────────────────────────
    const looks = [];
    const supportsKeys = [];
    const unclearKeys = [];
    for (const key of keys) {
      // The question is per viewport: a phone question against a desktop frame
      // is a different question and would be answered confidently and wrongly.
      const q = questionFor(key);
      if (!q) continue;

      let review;
      try {
        review = await reviewArtifact(db, { workspace: ws, apiKey, configuredModel, artifact: withId, key });
      } catch (e) {
        review = { key, error: String(e.message).slice(0, 200) };
      }

      if (review?.supported) supportsKeys.push(key);
      else if (review?.verdict && (review.verdict.answer === 'unclear' || review.verdict.confidence === 'low')) {
        unclearKeys.push(key);
      }
      looks.push(review);
    }

    if (looks.length && withId.id) {
      const first = looks.find((l) => l?.verdict) || null;
      await db
        .prepare(
          `UPDATE visual_artifacts
              SET observation = ?, vision_model = ?, vision_at = ?, vision_json = ?
            WHERE id = ? AND workspace = ?`
        )
        .bind(
          first?.verdict?.observation || null,
          first?.model || null,
          new Date().toISOString(),
          JSON.stringify(looks),
          withId.id, ws
        )
        .run()
        .catch(() => null);
    }

    out.push({
      artifact: withId,
      // Exactly the shape the claim validator reads, so what comes back here
      // and what the writer screening uses are the same object.
      evidence: { ...asEvidence(withId), supportsKeys, unclearKeys },
      looks,
    });
  }

  return NextResponse.json({
    runId: run,
    url,
    normalizedUrl: normalizeUrl(url),
    keys,
    viewports,
    results: out,
  });
}
