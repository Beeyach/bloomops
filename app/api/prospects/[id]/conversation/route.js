import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { standingOf, correctTo } from '@/lib/relationship-store.mjs';
import { REL, LABEL, explain, describeEvent } from '@/lib/relationship.mjs';
import { defer, DEFERRAL_SOURCE } from '@/lib/deferral.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Where this prospect stands, and how they got there.
//
// Separate from the prospect record on purpose. The record holds what is true
// now; this holds what happened, and the two answer different questions. A
// prospect who said no in July and yes in August has one current state and two
// events, and collapsing them is exactly what buried a customer.
//
// GET is a read. POST records Ary disagreeing with the classifier, which is
// itself an event rather than an edit: the original guess stays on the record
// and the correction wins by being newer.

export async function GET(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const id = Number(params?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Which prospect?' }, { status: 400 });

  const db = getDb();
  const prospect = await db
    .prepare(`SELECT id, name, business_name, stage, do_not_contact, unsubscribed, first_client_at,
                     deferred_until, next_action_date
                FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(id, ctx.workspace).first().catch(() => null);
  if (!prospect) return NextResponse.json({ error: 'That prospect is not here.' }, { status: 404 });

  const { current, timeline } = await standingOf(db, { workspace: ctx.workspace, prospect });

  return NextResponse.json({
    current: {
      ...current,
      // The words, decided in one place so the page cannot invent its own.
      label: current.state ? LABEL[current.state] : null,
      supersededLabel: current.supersedes ? LABEL[current.supersedes] : null,
      explain: explain(current),
    },
    timeline: timeline.map((e) => ({ ...describeEvent(e), state: e.state, id: e.id, deferUntil: e.deferUntil })),
    // The vocabulary, so the correction menu cannot drift from the model.
    options: Object.values(REL)
      .filter((s) => s !== REL.WON && s !== REL.LOST)
      .map((s) => ({ state: s, label: LABEL[s] })),
  });
}

// Ary saying what it really was.
export async function POST(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const id = Number(params?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Which prospect?' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const state = String(body.state || '');
  if (!Object.values(REL).includes(state)) {
    return NextResponse.json({ error: 'That is not one of the states.' }, { status: 400 });
  }

  // "Come back to me on the 24th."
  //
  // A date is only meaningful on a deferral, and a deferral without one is what
  // left three prospects on Today with nothing that could ever move them. So
  // the date is validated by lib/deferral.mjs — the one place that owns what a
  // deferral date is — and written to both of the fields it owns, alongside the
  // event that carries it. Two records of one promise, kept in step by one
  // call, which is why this lives here rather than in a second endpoint.
  const wantsDate = state === REL.DEFERRED && body.deferUntil;
  let patch = null;
  if (wantsDate) {
    const d = defer({ until: body.deferUntil, source: DEFERRAL_SOURCE.ARY });
    if (!d.ok) return NextResponse.json({ error: d.error }, { status: 400 });
    patch = d.patch;
  }

  const db = getDb();
  // Recorded, never an edit of what the classifier said. Silently rewriting
  // history would make the timeline a story rather than a record.
  await correctTo(db, {
    workspace: ctx.workspace, prospectId: id, state,
    note: String(body.note || '').slice(0, 200) || null,
    deferUntil: patch ? patch.deferred_until : null,
  });

  if (patch) {
    await db
      .prepare(
        `UPDATE prospects
            SET deferred_until = ?, next_action_date = ?, deferral_source = ?, updated_at = datetime('now')
          WHERE id = ? AND workspace = ?`
      )
      .bind(patch.deferred_until, patch.next_action_date, patch.deferral_source, id, ctx.workspace)
      .run()
      .catch(() => null);
  }

  const prospect = await db
    .prepare(`SELECT id, stage, do_not_contact, unsubscribed, first_client_at, deferred_until, next_action_date
                FROM prospects WHERE id = ? AND workspace = ?`)
    .bind(id, ctx.workspace).first().catch(() => null);
  const { current } = await standingOf(db, {
    workspace: ctx.workspace,
    prospect,
    legacyDeferUntil: prospect?.deferred_until || prospect?.next_action_date || null,
  });

  return NextResponse.json({
    current: { ...current, label: current.state ? LABEL[current.state] : null, explain: explain(current) },
    // What the row now says, so the caller can update its copy without a
    // second write. Nothing else about the prospect changed.
    patch: patch ? { deferred_until: patch.deferred_until, next_action_date: patch.next_action_date } : null,
  });
}
