import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, loadEngineSettings } from '@/lib/workspace.mjs';
import { PROSPECT_COLUMNS } from '@/lib/columns.mjs';
import { prescreen, buildVetResult, VERDICT } from '@/lib/vet.mjs';
import { recordOutcome, snapshot, KIND } from '@/lib/outcomes.mjs';

export const dynamic = 'force-dynamic';

// Vet Bee, staged.
//
// Stage A is free and runs here: deterministic rules over what the row already
// holds. It answers SKIP on its own for a closed stage, a decline, a missing
// website, or a links page, and it answers STRONG on its own when Ary has
// already written down what she saw or a fresh probe is on file.
//
// Stage B — paying for a browser probe — is NOT run here. This route reports
// whether one is needed and what it would cost; the caller decides. That split
// is the whole point: the old Vet Bee's only move was to probe everybody, so
// dismissing a prospect with no website cost exactly as much as confirming a
// good one.
//
// Nothing here writes to the prospect. It reads, judges, and records that the
// judgement happened.

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ids = Array.isArray(body?.prospectIds)
    ? body.prospectIds.map(Number).filter(Number.isFinite).slice(0, 200)
    : [Number(body?.prospectId)].filter(Number.isFinite);
  if (!ids.length) {
    return NextResponse.json({ error: 'Give me at least one prospect to look at.' }, { status: 400 });
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT ${PROSPECT_COLUMNS}
         FROM prospects
        WHERE workspace = ? AND deleted_at IS NULL AND id IN (${placeholders})`
    )
    .bind(ctx.workspace, ...ids)
    .all();

  const rows = results || [];
  if (!rows.length) {
    return NextResponse.json({ error: 'None of those prospects are in this workspace.' }, { status: 404 });
  }

  const now = new Date();
  const settings = await loadEngineSettings(db, ctx.workspace);
  const verdicts = rows.map((p) => {
    const pre = prescreen(p, { now, settings });
    const result = buildVetResult(p, { prescreenResult: pre, now, settings });
    return {
      prospectId: p.id,
      name: p.name || p.business_name || p.email || `#${p.id}`,
      stage: pre.rule,
      ...result,
    };
  });

  // Recorded so that in six months "how did the Vet verdicts actually perform"
  // is a question that can be asked. No conclusion is drawn from it today.
  for (const v of verdicts) {
    const p = rows.find((r) => r.id === v.prospectId);
    await recordOutcome(db, {
      workspace: ctx.workspace,
      prospectId: v.prospectId,
      kind: KIND.VET,
      value: v.verdict,
      context: snapshot(p, {
        rule: v.stage,
        opportunity: v.opportunity.level,
        evidenceQuality: v.evidenceQuality.level,
        timing: v.timing.level,
        confidence: v.confidence,
        probeNeeded: v.probeNeeded,
      }),
    });
  }

  const needProbe = verdicts.filter((v) => v.probeNeeded);
  return NextResponse.json({
    verdicts,
    summary: {
      strong: verdicts.filter((v) => v.verdict === VERDICT.STRONG).length,
      maybe: verdicts.filter((v) => v.verdict === VERDICT.MAYBE).length,
      skip: verdicts.filter((v) => v.verdict === VERDICT.SKIP).length,
      // The number that matters: how many of these still need paying for.
      probesNeeded: needProbe.length,
      probeIds: needProbe.map((v) => v.prospectId),
      // Stage A answered for everyone else, free.
      answeredFree: verdicts.length - needProbe.length,
    },
  });
}
