import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { showable } from '@/lib/contact-discovery.mjs';

export const dynamic = 'force-dynamic';

// Every way in we found for one prospect.
//
// Read only, and deliberately so. The prospect drawer needed the alternate
// routes the held bucket already shows, and the candidates live in their own
// table rather than on the prospect row, so there was no way to render them
// without asking for them.
//
// It changes no contact policy. The one rule it applies is `showable`, the
// same function the held bucket now calls, which keeps a third party's inbox
// off the screen. Nothing here decides what may be adopted or sent to.

export async function GET(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Not a prospect id.' }, { status: 400 });

  const db = getDb();
  // Scoped to the workspace as well as the id: an id from another workspace
  // must come back empty rather than come back.
  const { results } = await db
    .prepare(
      `SELECT contact_type, value, relationship, source_url, created_at
         FROM contact_candidates
        WHERE workspace = ? AND prospect_id = ?
        ORDER BY id ASC
        LIMIT 50`
    )
    .bind(ctx.workspace, id)
    .all()
    .catch(() => ({ results: [] }));

  const candidates = (results || [])
    .filter((c) => showable(c.relationship))
    .map((c) => ({
      type: c.contact_type,
      value: c.value,
      association: c.relationship,
      source: c.source_url || null,
      foundAt: c.created_at || null,
    }));

  return NextResponse.json({ candidates });
}
