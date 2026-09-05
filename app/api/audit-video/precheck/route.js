import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { OUT_OF_CREDITS } from '@/lib/credits.mjs';
import { runPrecheck, PRECHECK_OUTCOME } from '@/lib/precheck.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Does this prospect actually need a video? Asked of the render service,
// which probes the site the same way it would before recording and applies
// the same rule, then answers without spending a cent: no narration, no
// recording, no upload.
//
// The answer overwrites video_tier, video_score and video_reasons, because
// the recorder's reading is the one that matters. The tracker's original
// numbers came from a separate audit that reads the site another way, and a
// prospect rated 8 there whose site the recorder cannot fault produced a
// video that complimented them and asked for money.
//
// The checking itself lives in lib/precheck.mjs. It moved out of here when the
// Hive's loop moved to the server: a queue worker and this route now run the
// same function rather than two versions of it that would eventually disagree
// about what gets charged and what gets written.

function env() {
  try {
    return { ...process.env, ...(getRequestContext().env || {}) };
  } catch {
    return process.env || {};
  }
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const id = Number(body?.prospectId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });
  }

  const e = env();
  const service = String(e.RENDER_URL || '').replace(/\/+$/, '');
  const secret = e.RENDER_SECRET;
  if (!service || !secret) {
    return NextResponse.json({ error: 'Video rendering is not configured on this deployment.' }, { status: 500 });
  }

  const out = await runPrecheck(getDb(), {
    workspace: ctx.workspace,
    prospectId: id,
    service,
    secret,
    // A site checked recently does not need checking again. `force` is there
    // for the times she knows it has changed.
    force: Boolean(body?.force),
    // A person pressed a button, so this is the credit balance and not the
    // unattended daily allowance.
    actor: 'human',
  });

  if (out.outcome === PRECHECK_OUTCOME.SKIPPED) {
    const status = out.error?.includes('not here any more') ? 404 : 400;
    return NextResponse.json({ error: out.error }, { status });
  }
  if (out.outcome === PRECHECK_OUTCOME.FAILED) {
    if (out.outOfCredits) return NextResponse.json({ error: OUT_OF_CREDITS, outOfCredits: true }, { status: 402 });
    return NextResponse.json({ error: out.error }, { status: 502 });
  }
  if (out.outcome === PRECHECK_OUTCOME.BLOCKED) {
    return NextResponse.json({ prospectId: id, tier: out.tier, worth: false, why: out.why });
  }

  return NextResponse.json({
    prospectId: id,
    tier: out.tier,
    worth: out.worth,
    score: out.score,
    why: out.why,
    reasons: out.reasons,
    pagesChecked: out.pagesChecked,
    cached: out.outcome === PRECHECK_OUTCOME.CACHED,
    checkedAt: out.checkedAt,
    ...(out.freshness ? { freshness: out.freshness } : {}),
  });
}
