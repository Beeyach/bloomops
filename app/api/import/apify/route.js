import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DEFAULT_ENGINE_SETTINGS, LEAD_PLATFORMS } from '@/lib/engine-prompts.mjs';
import { itemsToLeads } from '@/lib/apify-import.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { openSecret } from '@/lib/secret-box.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function secretEnv() {
  try {
    const { env } = getCloudflareContext();
    if (env) return env;
  } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

// Force-dynamic: this route reads per-request state from D1 and must never be prerendered.
export const dynamic = 'force-dynamic';

// Pull a finished Apify dataset into the inbox as leads. The user runs any
// scraper in their Apify console, then hands us the dataset id + their token.
// We fetch the items server-side (Apify's servers did the scraping, not the
// user's social account — nothing that risks a ban), map to leads, dedupe by
// url, and batch insert. Scoring/drafting are separate hive steps.

const APIFY_LIMIT = 200;

async function loadEngineSettings(db, workspace) {
  const row = await db.prepare(`SELECT value FROM settings WHERE workspace = ? AND key = ?`).bind(workspace, 'engine').first();
  let stored = {};
  if (row && row.value) {
    try { stored = JSON.parse(row.value); } catch { stored = {}; }
  }
  return { ...DEFAULT_ENGINE_SETTINGS, ...stored };
}

// Accept a raw dataset id or a full console/api URL and return the id.
function parseDatasetId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  // https://api.apify.com/v2/datasets/<id>/items or console storage links
  const m = s.match(/datasets?\/([a-zA-Z0-9]+)/);
  if (m) return m[1];
  // bare id (Apify ids are alphanumeric)
  if (/^[a-zA-Z0-9]+$/.test(s)) return s;
  return '';
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

  const db = getDb();
  const settings = await loadEngineSettings(db, ctx.workspace);
  const storedToken = await openSecret(secretEnv(), String(settings.apifyToken || '').trim());
  const token = String(body.token || storedToken || '').trim();
  if (!token) {
    return NextResponse.json(
      { error: 'No Apify token saved. Add your Apify API token in Settings → Sourcing, or pass one with the import.' },
      { status: 400 }
    );
  }

  const datasetId = parseDatasetId(body.datasetId);
  if (!datasetId) {
    return NextResponse.json(
      { error: 'Provide an Apify dataset id (or the dataset URL) to import.' },
      { status: 400 }
    );
  }

  const platformOverride =
    body.platform && LEAD_PLATFORMS.includes(body.platform) ? body.platform : 'auto';

  // Fetch the finished dataset. clean=true drops Apify's internal fields.
  let items;
  try {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&limit=${APIFY_LIMIT}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const detail = res.status === 401 || res.status === 403
        ? 'Apify rejected the token. Check it in Settings → Sourcing.'
        : res.status === 404
          ? 'Apify could not find that dataset. Check the id.'
          : `Apify returned HTTP ${res.status}.`;
      return NextResponse.json({ error: detail }, { status: 424 });
    }
    items = await res.json();
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Apify: ${err.message}` }, { status: 424 });
  }

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'Apify returned an unexpected shape (expected a list of items).' }, { status: 424 });
  }

  // Dedupe against existing lead urls in this workspace.
  const { results: existing } = await db.prepare('SELECT post_url FROM leads WHERE workspace = ?').bind(ctx.workspace).all();
  const existingUrls = new Set(
    (existing || []).map((r) => (r.post_url || '').toLowerCase()).filter(Boolean)
  );

  const { leads, skippedDuplicate, skippedEmpty } = itemsToLeads(items, {
    existingUrls,
    platformOverride,
    limit: APIFY_LIMIT,
  });

  if (!leads.length) {
    return NextResponse.json({
      added: 0, skippedDuplicate, skippedEmpty, scanned: items.length,
      message: 'Nothing new to add. Everything was already in the inbox or had no usable content.',
    });
  }

  const stmt = db.prepare(
    `INSERT INTO leads (platform, post_url, post_text, author_name, author_handle, notes, workspace)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  await db.batch(
    leads.map((l) =>
      stmt.bind(
        l.platform,
        l.post_url || null,
        l.post_text || null,
        l.author_name || null,
        l.author_handle || null,
        'imported from Apify',
        ctx.workspace
      )
    )
  );

  return NextResponse.json({
    added: leads.length,
    skippedDuplicate,
    skippedEmpty,
    scanned: items.length,
  });
}
