import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { loadLimits, sanitizeLimits, scansUsedThisWeek } from '@/lib/limits.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Per-workspace feature allowances, set by an admin, stored in the settings
// table under key 'limits'. Regular users can READ their own limits (the UI
// needs them); only admins can WRITE, and admins may write any workspace's
// limits — that's the point: Ary hands Ellen an allowance without Ellen ever
// touching Apify or billing.

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const limits = await loadLimits(db, ctx.workspace);
  const used = await scansUsedThisWeek(db, ctx.workspace);
  return NextResponse.json({
    limits,
    usage: { adScansThisWeek: used },
    isAdmin: ctx.role === 'admin',
  });
}

// PUT { workspace, limits: { adScansPerWeek } } — admin only, any workspace.
export async function PUT(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can set limits.' }, { status: 403 });
  }
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const target = String(body?.workspace || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(target)) {
    return NextResponse.json({ error: 'Provide a workspace name (letters/numbers).' }, { status: 400 });
  }
  const db = getDb();
  // Merge onto what's stored, so a PUT naming only one allowance leaves the
  // others alone. Before this, saving a scan allowance silently reset
  // aiCallsPerDay to its default.
  const current = await loadLimits(db, target);
  const limits = sanitizeLimits({ ...current, ...(body?.limits && typeof body.limits === 'object' ? body.limits : {}) });
  await db
    .prepare(
      `INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, 'limits', ?, datetime('now'))
       ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(target, JSON.stringify(limits))
    .run();
  return NextResponse.json({ workspace: target, limits });
}
