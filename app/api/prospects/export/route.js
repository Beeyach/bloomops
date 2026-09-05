import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

// Match the other routes: keep this a dynamic Function, never a static asset.
export const dynamic = 'force-dynamic';

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').trim();
  const stageFilter = searchParams.getAll('stage');
  const ratingFilter = searchParams.getAll('rating');

  const where = ['workspace = ?', 'deleted_at IS NULL'];
  const values = [ctx.workspace];
  if (search) {
    where.push(`(
      COALESCE(name,'') LIKE ? OR
      COALESCE(business_name,'') LIKE ? OR
      COALESCE(email,'') LIKE ? OR
      COALESCE(domain,'') LIKE ? OR
      COALESCE(stage,'') LIKE ? OR
      COALESCE(rating,'') LIKE ?
    )`);
    const q = `%${search}%`;
    values.push(q, q, q, q, q, q);
  }
  // Kept in step with /api/prospects, which owns the same two sentinels.
  // Without them an export silently dropped every unrated row while the
  // table on screen was showing them.
  if (stageFilter.length > 0) {
    if (stageFilter.length === 1 && stageFilter[0] === '__nomatch__') {
      where.push('1 = 0');
    } else {
      const placeholders = stageFilter.map(() => '?').join(',');
      where.push(`stage IN (${placeholders})`);
      stageFilter.forEach((s) => values.push(s));
    }
  }
  if (ratingFilter.length > 0) {
    // `__none__` is the sentinel for rows with NULL rating.
    const includeNull = ratingFilter.includes('__none__');
    const concrete = ratingFilter.filter((r) => r !== '__none__');
    const clauses = [];
    if (concrete.length > 0) {
      const placeholders = concrete.map(() => '?').join(',');
      clauses.push(`rating IN (${placeholders})`);
      concrete.forEach((s) => values.push(s));
    }
    if (includeNull) clauses.push(`(rating IS NULL OR rating = '')`);
    where.push(clauses.length > 0 ? `(${clauses.join(' OR ')})` : '1 = 0');
  }

  const headers = [
    'name',
    'business_name',
    'niche',
    'email',
    'domain',
    'rating',
    'stage',
    'call_booked',
    'proposal_sent',
    'emails_sent',
    'last_contact_date',
    'claude_chat_link',
    'gmail_labels',
    'country',
  ];

  const sql = `SELECT ${headers.join(', ')}
               FROM prospects ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY id ASC`;
  const { results } = await db.prepare(sql).bind(...values).all();
  const rows = results || [];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  const csv = lines.join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-that-bloom-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
