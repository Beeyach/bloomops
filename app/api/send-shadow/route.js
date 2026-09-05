import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';
import { getAccount } from '@/lib/gmail-store.mjs';
import { shadowDecision, preparedFollowups } from '@/lib/send-guard.mjs';
import { guardView } from '@/lib/prospect-view.mjs';
import { loadEngineSettings } from '@/lib/runner.mjs';

export const dynamic = 'force-dynamic';

// Stage B, watched rather than trusted.
//
// Automatic follow-up sending ships off. Before that switch can be flipped the
// guard has to be seen deciding on real packages, with the exact reason
// recorded, because an unexpected block is a bug to fix rather than a rule to
// relax.
//
// This route cannot send. It evaluates and writes a log line. There is no code
// path from here to Gmail, which is the property that makes it safe to run
// against production data.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const db = getDb();
  const ws = ctx.workspace;
  const now = new Date();
  const settings = await loadEngineSettings(db, ws).catch(() => ({}));
  const account = await getAccount(db, ws).catch(() => null);

  const { results: pkgs } = await db
    .prepare(
      `SELECT * FROM outreach_packages
        WHERE workspace = ? AND status = 'APPROVED'
        ORDER BY reviewed_at ASC
        LIMIT 50`
    ).bind(ws).all().catch(() => ({ results: [] }));

  const out = [];
  for (const pkg of pkgs || []) {
    const row = await db
      .prepare(
        `SELECT id, name, business_name, email, stage, replied, reply_type, reply_date,
                next_action_date, do_not_contact, unsubscribed, emails_sent
           FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`
      ).bind(pkg.prospect_id, ws).first().catch(() => null);
    if (!row) continue;

    const { results: events } = await db
      .prepare(`SELECT direction, occurred_at, classification FROM reply_events WHERE workspace = ? AND prospect_id = ?`)
      .bind(ws, pkg.prospect_id).all().catch(() => ({ results: [] }));

    // Every follow-up the package prepared. A package with none authorises one
    // email and nothing else, which is a real and common answer.
    const steps = preparedFollowups(pkg).map((f) => f.step);
    for (const step of steps.length ? steps : [(Number(row.emails_sent) || 1) + 1]) {
      let d;
      try {
        d = shadowDecision({
          pkg,
          prospect: guardView(row, { where: 'send shadow' }),
          events: events || [],
          settings,
          account,
          now,
          step,
        });
      } catch (e) {
        d = { decision: 'WOULD_BLOCK', block: 'incomplete-prospect', reason: e.message, step, fingerprintOk: null, send: false };
      }

      await db.prepare(
        `INSERT INTO send_shadow_log
           (workspace, prospect_id, package_id, package_version, sequence_step, decision, block, reason, fingerprint_ok)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        ws, pkg.prospect_id, pkg.id, pkg.version, step,
        d.decision, d.block || null, (d.reason || '').slice(0, 500),
        d.fingerprintOk === null ? null : (d.fingerprintOk ? 1 : 0)
      ).run().catch(() => {});

      out.push({ prospectId: pkg.prospect_id, name: row.name || row.business_name, step, ...d });
    }
  }

  const wouldSend = out.filter((r) => r.decision === 'WOULD_SEND').length;
  const blocks = {};
  for (const r of out) if (r.block) blocks[r.block] = (blocks[r.block] || 0) + 1;

  return NextResponse.json({
    evaluated: out.length,
    wouldSend,
    wouldBlock: out.length - wouldSend,
    blocks,
    // Stated in the response so nobody reading a log has to infer it.
    sent: 0,
    autoSendFollowups: false,
    results: out,
  });
}

// What the shadow run has learned so far.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const db = getDb();
  const { results } = await db
    .prepare(
      `SELECT decision, block, COUNT(*) n, MAX(evaluated_at) last_at
         FROM send_shadow_log WHERE workspace = ?
        GROUP BY decision, block
        ORDER BY n DESC`
    ).bind(ctx.workspace).all().catch(() => ({ results: [] }));

  const rows = results || [];
  const total = rows.reduce((a, r) => a + Number(r.n || 0), 0);
  return NextResponse.json({
    total,
    wouldSend: rows.filter((r) => r.decision === 'WOULD_SEND').reduce((a, r) => a + Number(r.n), 0),
    byBlock: rows.filter((r) => r.decision === 'WOULD_BLOCK').map((r) => ({ block: r.block, n: Number(r.n), lastAt: r.last_at })),
    sent: 0,
  });
}
