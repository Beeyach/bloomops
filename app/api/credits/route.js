import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { loadCredits, setCredits, PRICE_LABELS } from '@/lib/credits.mjs';

export const dynamic = 'force-dynamic';

// The workspace's credit balance. Everyone may read their own; only an admin
// may set one, and an admin may set anybody's. That is the whole model: Ary
// keeps her own topped up and decides what Ellen gets.

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { balance, spentAllTime } = await loadCredits(db, ctx.workspace);
  return NextResponse.json({
    balance,
    spentAllTime,
    prices: PRICE_LABELS.map(([label, price]) => ({ label, price })),
    isAdmin: ctx.role === 'admin',
  });
}

export async function PUT(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can set credits.' }, { status: 403 });
  }
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const target = String(body?.workspace || ctx.workspace).trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(target)) {
    return NextResponse.json({ error: 'Provide a workspace name.' }, { status: 400 });
  }
  // The name has to belong to a workspace somebody can actually sign into.
  // Any string matching the shape used to be accepted, so one typo in the
  // top-up box wrote 20,000 credits to a workspace that does not exist and
  // said "ellenn now has 20,000 credits" as though it had worked. Ellen would
  // then open the app and find nothing had changed. Since A3 a workspace is a
  // BloomOps workspace row, so the slug is checked against those.
  const db = getDb();
  const { results } = await db.prepare('SELECT slug FROM workspaces').all();
  const known = new Set((results || []).map((r) => String(r.slug).toLowerCase()));
  if (known.size && !known.has(target)) {
    return NextResponse.json(
      { error: `There is no workspace called "${target}". Check the spelling, or leave the box empty for this one.` },
      { status: 404 }
    );
  }

  const balance = await setCredits(db, target, body?.balance);
  return NextResponse.json({ workspace: target, balance });
}
