import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { LEAD_COLUMNS, PROSPECT_COLUMNS } from '@/lib/columns.mjs';
import { readRules, matchRules, buildSnapshot } from '@/lib/qual-rules.mjs';
import { SOURCE, PROVIDER, PROVIDER_YIELDS } from '@/lib/sources.mjs';
import { loadEngineSettings } from '@/lib/workspace.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The client replaces its whole lead object with this response, so any column
// missing here is a column the UI loses until the next reload.
const LEAD_COLS = LEAD_COLUMNS;
const PROSPECT_COLS = PROSPECT_COLUMNS;

export async function POST(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();

  const lead = await db.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).first();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (lead.status === 'promoted') {
    return NextResponse.json({ error: 'Lead already promoted' }, { status: 409 });
  }

  let reasons = [];
  try {
    reasons = JSON.parse(lead.verdict_reasons || '[]');
  } catch {
    reasons = [];
  }
  const infoParts = [
    lead.post_text ? `Post (${lead.platform || 'unknown platform'}):\n${lead.post_text}` : null,
    lead.post_url ? `Link: ${lead.post_url}` : null,
    lead.author_handle ? `Profile: ${lead.author_handle}` : null,
    lead.verdict ? `Verdict: ${lead.verdict}${reasons.length ? ` — ${reasons.join('; ')}` : ''}` : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
  ].filter(Boolean);

  // The qualification that already happened, kept as structure rather than
  // melted into the notes field. It was scored against this workspace's own
  // green and red rules, and re-deriving it later would answer a different
  // question: the rules may have been edited since.
  const settings = await loadEngineSettings(db, ctx.workspace);
  const rules = readRules(settings);

  // An ad and a post are both things a business put out, and they are not the
  // same evidence. An ad proves spend; a post carries a statement. Scoring one
  // with the other's rules is the impersonation the source model exists to
  // prevent, and the lead already knows which it is.
  const sourceType = lead.lead_kind === 'ad' ? SOURCE.AD : SOURCE.POST_TEXT;
  const provider = lead.lead_kind === 'ad' ? PROVIDER.AD_LIBRARY : PROVIDER.SOCIAL_POST;
  const possible = new Set(PROVIDER_YIELDS[provider] || []);
  const matched = matchRules(rules, {
    postText: lead.post_text || '',
    leadReasons: reasons,
    possible,
    available: new Set([sourceType]),
  });

  const snapshot = buildSnapshot({
    rules,
    matched,
    sourceType,
    provider,
    sourceRef: lead.post_url || lead.author_handle || `lead:${id}`,
    sourceAt: lead.created_at || null,
    verdict: lead.verdict || null,
    confidence: lead.confidence || null,
    scorerVersion: lead.verdict_source === 'you' ? 'human' : 'lead-scorer',
    postText: lead.post_text || '',
  });
  const qualification = JSON.stringify({ ...snapshot, leadId: Number(id), reasons });

  const insert = await db
    .prepare(
      `INSERT INTO prospects (name, stage, source, info, qualification, source_provider, source_ref, source_at, workspace)
       VALUES (?, 'New', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      lead.author_name || 'Unknown', lead.platform || 'Other', infoParts.join('\n\n') || null,
      qualification, provider, snapshot.sourceRef, snapshot.sourceAt, ctx.workspace
    )
    .run();
  const prospectId = insert.meta.last_row_id;

  // The append-only history. `prospects.qualification` is the latest snapshot
  // for cheap reads; this table is the record that later research may add to
  // and must never overwrite.
  await db
    .prepare(
      `INSERT INTO qualification_snapshots
        (workspace, prospect_id, source_type, provider, source_ref, source_at,
         scorer_version, rules_version, verdict, confidence,
         matched_green, matched_red, unknown_rules, not_applicable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      ctx.workspace, prospectId, sourceType, provider, snapshot.sourceRef, snapshot.sourceAt,
      snapshot.scorerVersion, snapshot.rulesVersion, snapshot.verdict, snapshot.confidence,
      JSON.stringify(snapshot.matchedGreen.map((r) => r.id)),
      JSON.stringify(snapshot.matchedRed.map((r) => r.id)),
      JSON.stringify(snapshot.unknown),
      JSON.stringify(snapshot.notApplicable)
    )
    .run()
    .catch(() => {});

  try {
    const update = await db
      .prepare(
        `UPDATE leads SET status = 'promoted', promoted_prospect_id = ?, updated_at = datetime('now') WHERE id = ? AND workspace = ? AND status <> 'promoted'`
      )
      .bind(prospectId, id, ctx.workspace)
      .run();
    if (!update.meta.changes) {
      // Another request promoted this lead first — undo our insert.
      await db.prepare(`DELETE FROM prospects WHERE id = ?`).bind(prospectId).run();
      return NextResponse.json({ error: 'Lead already promoted' }, { status: 409 });
    }
  } catch (err) {
    console.error('promote: lead update failed', err);
    // Compensate: don't leave an orphan prospect if the lead update failed.
    await db.prepare(`DELETE FROM prospects WHERE id = ?`).bind(prospectId).run();
    return NextResponse.json({ error: 'Promotion failed — no changes were saved' }, { status: 500 });
  }

  const prospect = await db
    .prepare(`SELECT ${PROSPECT_COLS} FROM prospects WHERE id = ?`)
    .bind(prospectId)
    .first();
  const updatedLead = await db.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE id = ?`).bind(id).first();
  return NextResponse.json({ prospect, lead: updatedLead });
}

// Undo an accidental promote: the created prospect goes to Trash (not a
// hard delete — recoverable), and the lead returns to its pre-promote
// standing (green verdict → qualified, otherwise new).
export async function DELETE(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();

  const lead = await db.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).first();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (lead.status !== 'promoted' || !lead.promoted_prospect_id) {
    return NextResponse.json({ error: 'Lead is not promoted' }, { status: 409 });
  }

  await db
    .prepare(`UPDATE prospects SET deleted_at = datetime('now') WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(lead.promoted_prospect_id, ctx.workspace)
    .run();
  const backTo = lead.verdict === 'green' ? 'qualified' : 'new';
  await db
    .prepare(`UPDATE leads SET status = ?, promoted_prospect_id = NULL, updated_at = datetime('now') WHERE id = ?`)
    .bind(backTo, id)
    .run();

  const updatedLead = await db.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE id = ?`).bind(id).first();
  return NextResponse.json({ lead: updatedLead });
}
