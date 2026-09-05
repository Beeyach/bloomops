import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { enrichBusinessSite } from '@/lib/booking-search.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function env() {
  try { return getCloudflareContext().env || {}; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

// Finds the real website for booking-search rows, on demand.
//
// A booking search returns a name and a scheduling link, and nothing else: the
// booking page carries no link to the business's own site, so the site has to
// be searched for separately, one paid search per business.
//
// Import already does that, but only for the rows picked, which left the
// picking itself blind — there is no way to judge which of fifty coaches is
// worth taking without seeing what they have. This does the same lookup for a
// chosen handful BEFORE picking, so the spend is a deliberate act rather than
// either a tax on every scan or a thing that happens after the decision.
//
// The results are written back onto the stored scan, so a lookup is paid for
// once and survives reopening the list.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const scanId = Number(body?.scanId);
  const indices = Array.isArray(body?.indices) ? body.indices.map(Number).filter(Number.isInteger) : [];
  if (!scanId || indices.length === 0) {
    return NextResponse.json({ error: 'Pick which rows to look up first.' }, { status: 400 });
  }
  // A ceiling on one click. Fifty lookups is fifty paid searches, and a
  // mis-click should not be able to spend that.
  if (indices.length > 25) {
    return NextResponse.json(
      { error: 'That is more than 25 lookups in one go. Narrow the list down first.' },
      { status: 400 }
    );
  }

  const scan = await db
    .prepare(`SELECT * FROM scan_runs WHERE id = ? AND workspace = ? AND type = 'booking-search'`)
    .bind(scanId, ctx.workspace)
    .first();
  if (!scan || !scan.results) {
    return NextResponse.json({ error: 'Scan not found (or has no results).' }, { status: 404 });
  }
  let places = [];
  try { places = JSON.parse(scan.results); } catch {}

  const e = env();
  let looked = 0;
  let found = 0;
  for (const i of indices) {
    const p = places[i];
    if (!p || !p.name) continue;
    // Already known, or already looked for and not there. Neither is worth
    // paying for twice.
    if (p.website || p.siteChecked) continue;
    looked += 1;
    const site = await enrichBusinessSite(p.name, e);
    if (site?.url) {
      p.website = site.url;
      found += 1;
    }
    // Remembered either way, so a second click does not re-buy the misses.
    p.siteChecked = true;
  }

  if (looked > 0) {
    await db
      .prepare(`UPDATE scan_runs SET results = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(JSON.stringify(places), scanId)
      .run();
  }

  return NextResponse.json({ looked, found, results: places });
}
