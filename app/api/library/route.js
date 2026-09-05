import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  DEFAULT_LIBRARY,
  DEFAULT_PROMPTS,
  DEFAULT_PROMPTS_EXTRA,
  DEFAULT_HANDSOFF,
  DEFAULT_GUIDE_AGENTS,
  DEFAULT_GUIDE_SOURCING,
  DEFAULT_GUIDE_AUTOMATION,
} from '@/lib/library-seed.mjs';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';

// Guide categories ship with the app: read-only for user codes, editable
// by admin codes. Enforced here, not just hidden in the UI.
export const LOCKED_CATEGORIES = new Set(['guide-agents', 'guide-sourcing', 'guide-automation']);

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, title, note, position, items, category';

const SEEDS = {
  workspace: DEFAULT_LIBRARY,
  prompts: [...DEFAULT_PROMPTS, ...DEFAULT_PROMPTS_EXTRA],
  handsoff: DEFAULT_HANDSOFF,
  'guide-agents': DEFAULT_GUIDE_AGENTS,
  'guide-sourcing': DEFAULT_GUIDE_SOURCING,
  'guide-automation': DEFAULT_GUIDE_AUTOMATION,
};

const CATEGORIES = Object.keys(SEEDS);

function parseGroup(row) {
  let items;
  try {
    items = JSON.parse(row.items);
  } catch {
    items = [];
  }
  return { ...row, items };
}

async function seedIfEmpty(db, category, workspace) {
  const seed = SEEDS[category];
  if (!seed) return;
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM library_groups WHERE category = ? AND workspace = ?')
    .bind(category, workspace)
    .first();
  if (row && row.n > 0) return;
  const stmt = db.prepare(
    'INSERT INTO library_groups (id, title, note, position, items, category, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  await db.batch(
    seed.map((g, i) =>
      stmt.bind(
        crypto.randomUUID(),
        g.title,
        g.note,
        i,
        JSON.stringify(
          g.items.map((it, j) => ({
            id: `it-${i}-${j}`,
            title: it.title,
            body: it.body,
            notes: it.notes || '',
          }))
        ),
        category,
        workspace
      )
    )
  );
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const raw = new URL(req.url).searchParams.get('category');
  const category = CATEGORIES.includes(raw) ? raw : 'workspace';
  const db = getDb();
  await seedIfEmpty(db, category, ctx.workspace);
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM library_groups WHERE category = ? AND workspace = ? ORDER BY position ASC, title ASC`)
    .bind(category, ctx.workspace)
    .all();
  return NextResponse.json({ groups: (results || []).map(parseGroup) });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const title = String(body?.title || '').trim().slice(0, 200);
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  const note = String(body?.note || '').slice(0, 500);
  const category = CATEGORIES.includes(body?.category) ? body.category : 'workspace';
  if (LOCKED_CATEGORIES.has(category) && ctx.role !== 'admin') return forbidden();
  const db = getDb();
  const posRow = await db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM library_groups WHERE category = ? AND workspace = ?')
    .bind(category, ctx.workspace)
    .first();
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO library_groups (id, title, note, position, items, category, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, title, note, posRow?.next ?? 0, '[]', category, ctx.workspace)
    .run();
  const row = await db.prepare(`SELECT ${COLUMNS} FROM library_groups WHERE id = ?`).bind(id).first();
  return NextResponse.json({ group: parseGroup(row) }, { status: 201 });
}
