import { NextResponse } from 'next/server';
import { providerFor } from '@/lib/sources.mjs';
import { getDb, STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { PROSPECT_COLUMNS, SLIM_PROSPECT_COLUMNS } from '@/lib/columns.mjs';
import { resolveOrigin, originValues } from '@/lib/origin.mjs';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
// Without it the route can be prerendered as a static asset — GET then works
// but POST/PUT/DELETE hit the static bucket and return a bare 405. That was
// the "can't add / edits don't save" bug on the deployed site.
export const dynamic = 'force-dynamic';

const SELECT_COLS = PROSPECT_COLUMNS;

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').trim();
  const stageFilter = searchParams.getAll('stage');
  const ratingFilter = searchParams.getAll('rating');
  const readFilter = searchParams.getAll('read'); // values: 'read' | 'unread'
  const sort = searchParams.get('sort') || 'default';
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';

  // D1 uses positional `?` placeholders, not named `@name` params like
  // better-sqlite3. We collect bind values in order as we build the WHERE.
  // The workspace clause is always first so a request only ever sees its own.
  // Trashed rows (deleted_at set) are hidden here — they live in /api/trash.
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
  if (readFilter.length > 0) {
    const vals = [];
    if (readFilter.includes('unread')) vals.push(0);
    if (readFilter.includes('read')) vals.push(1);
    if (vals.length > 0) {
      const placeholders = vals.map(() => '?').join(',');
      where.push(`COALESCE(is_read, 0) IN (${placeholders})`);
      vals.forEach((v) => values.push(v));
    }
  }

  let orderBy;
  switch (sort) {
    case 'name':
    case 'business_name':
    case 'email':
    case 'domain':
    case 'rating':
    case 'stage':
    case 'emails_sent':
    case 'last_contact_date':
    case 'claude_chat_link':
    case 'is_read':
      orderBy = `${sort} ${dir} NULLS LAST`;
      break;
    case 'days_ago':
      // Days Ago sorts by last_contact_date (fresher = smaller days). Asc = freshest first.
      orderBy = `CASE WHEN last_contact_date IS NULL OR last_contact_date = '' THEN 1 ELSE 0 END,
                 last_contact_date ${dir === 'DESC' ? 'ASC' : 'DESC'}`;
      break;
    default:
      // 'New' stage floats to the top (so freshly added prospects are visible
      // without scrolling). Within each group: most recent contact first,
      // then highest id (newest insert) as the tiebreaker.
      orderBy = `CASE WHEN stage = 'New' THEN 0 ELSE 1 END,
                 CASE WHEN last_contact_date IS NULL OR last_contact_date = '' THEN 1 ELSE 0 END,
                 last_contact_date DESC,
                 id DESC`;
  }

  // ?slim=1: the fast first paint — all columns except the five heavy TEXT
  // blobs (~88% of the payload) the table never renders. The client follows
  // up with a full fetch and swaps the store. See SLIM_PROSPECT_COLUMNS.
  const cols = searchParams.get('slim') === '1' ? SLIM_PROSPECT_COLUMNS : SELECT_COLS;
  const sql = `SELECT ${cols} FROM prospects ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`;
  const { results } = await db.prepare(sql).bind(...values).all();

  // Null fields are left out of the response entirely. Measured on the real
  // list, 38% of a 5.7MB payload was the word "null": every row carries every
  // column, and several of them — call_booked, proposal_sent, must_haves,
  // revenue_score — are null on all four thousand seven hundred rows, so the
  // response spent two megabytes saying nothing four thousand times.
  //
  // It was also enough to trip the Worker's CPU ceiling and return 1102s once
  // the list got past a few thousand rows.
  //
  // Safe because a missing key reads as undefined, and enrichProspect turns the
  // row into the same shape either way. Done with a replacer rather than by
  // rebuilding each row, so it costs one pass instead of an object per row —
  // which matters when CPU time is the thing that was running out.
  // What Ary has said by hand about a conversation.
  //
  // Deliberately only her corrections — `source = 'human'`. The classifier's
  // guesses and the legacy reconstruction stay server-side, because reading
  // those here would re-route thousands of rows and that is a separate,
  // measured decision. This is narrower and it is the one thing the list
  // cannot currently see: when Ary files a wait as "not this offer" from
  // Today, the row has no way of knowing, so it comes straight back.
  //
  // One query over a table with eighteen rows in it.
  const { results: corrections } = await db
    .prepare(
      `SELECT prospect_id, state, occurred_at, defer_until
         FROM relationship_events
        WHERE workspace = ? AND source = 'human'
        ORDER BY occurred_at ASC, id ASC`
    )
    .bind(ctx.workspace)
    .all()
    .catch(() => ({ results: [] }));
  const saidByHand = new Map();
  for (const c of corrections || []) saidByHand.set(c.prospect_id, c); // last wins

  const withCorrections = (results || []).map((p) => {
    const c = saidByHand.get(p.id);
    if (!c) return p;
    return {
      ...p,
      corrected_state: c.state,
      corrected_at: c.occurred_at,
      corrected_defer_until: c.defer_until,
    };
  });

  const body = JSON.stringify(
    { prospects: withCorrections, stages: STAGES, ratings: RATINGS },
    (_k, v) => (v === null ? undefined : v)
  );
  return new NextResponse(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const {
    name = '',
    business_name = null,
    email = '',
    domain = '',
    rating = null,
    stage = 'New',
    emails_sent = 0,
    last_contact_date = null,
    claude_chat_link = null,
    gmail_labels = null,
    is_read = 0,
    country = null,
    email_sequence = null,
    audit_notes = null,
    pdf_filename = null,
    info = null,
    review_url = null,
    replied = 0,
    reply_date = null,
    reply_type = null,
    replied_at_email = null,
    next_action_date = null,
    source = null,
    niche = null,
    call_booked = null,
    proposal_sent = null,
  } = body || {};

  // NULL undecided / 1 Yes / 0 No — preserve the three states, don't coerce.
  const yn = (v) => (v === '' || v == null ? null : v ? 1 : 0);

  if (stage && !STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  }
  if (rating && !RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
  }
  if (country && !COUNTRIES.includes(country)) {
    return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
  }
  if (source && !SOURCES.includes(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }
  if (reply_type && !REPLY_TYPES.includes(reply_type)) {
    return NextResponse.json({ error: 'Invalid reply_type' }, { status: 400 });
  }

  // Where the business was found, which is a different fact from where the
  // record entered (source_provider) and from what a claim rests on (evidence
  // SOURCE). Report 5 could not answer one acquisition question because 4,787
  // rows have none of this, so new rows have to say.
  //
  // Never inferred, and no default.
  //
  // An earlier version defaulted this route to MANUAL on the grounds that
  // somebody was typing into a form. That was wrong: origin_class means where
  // the business was FOUND, and typing in a business you saw on Facebook is a
  // SOCIAL_POST however manual the keystrokes were. Defaulting would have
  // quietly filled the acquisition data with a value that means nothing, which
  // is the exact hole report 5 could not climb out of. The form asks.
  const originIn = resolveOrigin(body);
  if (!originIn.ok) {
    return NextResponse.json({ error: originIn.error }, { status: 400 });
  }
  const origin = originIn.origin;

  // Named `result` (not `info`) — `info` is now a bound column value above.
  const result = await db
    .prepare(
      `INSERT INTO prospects (name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, is_read, country, email_sequence, audit_notes, pdf_filename, info, review_url, replied, reply_date, reply_type, replied_at_email, next_action_date, source, source_provider, niche, call_booked, proposal_sent, origin_class, origin_subtype, origin_batch, origin_query, origin_at, workspace, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(
      name,
      business_name,
      email,
      domain,
      rating,
      stage,
      Number(emails_sent) || 0,
      last_contact_date,
      claude_chat_link,
      gmail_labels,
      is_read ? 1 : 0,
      country,
      email_sequence,
      audit_notes,
      pdf_filename,
      info,
      review_url,
      replied ? 1 : 0,
      reply_date,
      reply_type,
      replied_at_email == null ? null : Number(replied_at_email),
      next_action_date,
      source,
      // Read from the source string at creation, so a row added today carries
      // the same provenance as the 5,492 backfilled ones. Without it a new
      // prospect reads as UNKNOWN origin and every post rule against it comes
      // back unanswered rather than inapplicable.
      providerFor(source),
      niche,
      yn(call_booked),
      yn(proposal_sent),
      ...originValues(origin),
      ctx.workspace
    )
    .run();

  // D1's run() returns { meta: { last_row_id, changes, ... } }. We need
  // last_row_id to fetch the fresh row back.
  const newId = result?.meta?.last_row_id;
  const row = await db
    .prepare(`SELECT ${SELECT_COLS} FROM prospects WHERE id = ?`)
    .bind(newId)
    .first();
  return NextResponse.json({ prospect: row }, { status: 201 });
}
