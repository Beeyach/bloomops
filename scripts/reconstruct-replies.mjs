// Reconstruct relationship events from replies that already happened.
//
//   node scripts/reconstruct-replies.mjs --remote            (dry run, writes nothing)
//   node scripts/reconstruct-replies.mjs --remote --write    (writes)
//   node scripts/reconstruct-replies.mjs --remote --write --only 1317
//
// A script rather than a route, so there is no privileged migration endpoint
// left exposed on the app afterwards. It reads stored facts, appends history,
// and does nothing else: it cannot send, cannot enqueue, cannot spend.
//
// Safe to run twice. Every write is INSERT OR IGNORE against the unique index
// on (workspace, prospect_id, message_id, state, source), so a second run
// inserts nothing and says so.

import { execSync } from 'node:child_process';
import { planFor, RECONSTRUCTED, NOT_INFERRED } from '../lib/relationship-reconstruct.mjs';

const args = process.argv.slice(2);
const REMOTE = args.includes('--remote');
// BloomOps: the target is the `DB` binding declared in wrangler.jsonc. A remote run
// must name its environment (--env staging or --env production). Nothing here can
// address a database by name, so no Leadsthatbloom database is reachable.
const ENV_FLAG = (() => { const i = process.argv.indexOf('--env'); return i >= 0 ? String(process.argv[i + 1] || '') : ''; })();
if (REMOTE && !ENV_FLAG) { console.error('A remote run needs --env staging or --env production.'); process.exit(2); }
const D1_TARGET = `DB ${REMOTE ? `--remote --env ${ENV_FLAG}` : '--local'}`;
const WRITE = args.includes('--write');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 ? Number(args[i + 1]) : null;
})();

// How many prospects one invocation will touch. Bounded so a run can be stopped
// and resumed rather than being one long transaction nobody can interrupt.
const BATCH = 200;

// Through a shell, because npx resolves differently depending on which one is
// running this and execFile cannot find it on Windows at all.
//
// The SQL is wrapped in double quotes and never contains any, so nothing here
// needs escaping beyond that. Every value interpolated into a query below goes
// through esc().
function sql(query) {
  const one = query.replace(/\s+/g, ' ').trim();
  const cmd = `npx wrangler d1 execute ${D1_TARGET} --json --command "${one}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results || [];
}

const esc = (s) => String(s == null ? '' : s).replace(/'/g, "''");
const val = (s) => (s == null ? 'NULL' : `'${esc(s)}'`);

// ── Who has a history worth reconstructing ───────────────────────────────
//
// Deleted prospects are skipped. They are test records and closed business, and
// writing history onto them would only make the counts look bigger.
const candidates = sql(`
  SELECT DISTINCT r.prospect_id
    FROM reply_events r
    JOIN prospects p ON p.id = r.prospect_id AND p.workspace = r.workspace
   WHERE r.direction = 'inbound'
     AND r.prospect_id IS NOT NULL
     AND p.deleted_at IS NULL
     ${ONLY ? `AND r.prospect_id = ${ONLY}` : ''}
   ORDER BY r.prospect_id
   LIMIT ${BATCH}
`);

const totals = {
  prospectsWithReplies: candidates.length,
  prospectsAlreadyLive: 0,
  prospectsReconstructed: 0,
  eventsWritten: 0,
  eventsSkipped: 0,
  duplicatesAvoided: 0,
  byState: {},
  skipReasons: {},
  stillLegacyOnly: 0,
};

for (const row of candidates) {
  const pid = row.prospect_id;

  const [prospect] = sql(`
    SELECT id, workspace, stage, do_not_contact, unsubscribed, deferred_until,
           offer_accepted_at, first_client_at, updated_at, reply_at
      FROM prospects WHERE id = ${pid} AND deleted_at IS NULL`);
  if (!prospect) continue;

  const replies = sql(`
    SELECT id, direction, classification, confidence, occurred_at, message_id, thread_id
      FROM reply_events WHERE prospect_id = ${pid} AND workspace = '${esc(prospect.workspace)}'
     ORDER BY occurred_at ASC, id ASC`);

  const existing = sql(`
    SELECT message_id, occurred_at, source
      FROM relationship_events WHERE prospect_id = ${pid} AND workspace = '${esc(prospect.workspace)}'`);
  if (existing.length) totals.prospectsAlreadyLive += 1;

  const { events, skipped } = planFor({ prospect, replies, existing });

  totals.eventsSkipped += skipped.length;
  for (const s of skipped) totals.skipReasons[s.why] = (totals.skipReasons[s.why] || 0) + 1;

  if (!events.length) {
    totals.stillLegacyOnly += 1;
    console.log(`  ${pid}: nothing reconstructable (${skipped.map((s) => s.why).join('; ') || 'no inbound replies'})`);
    continue;
  }

  totals.prospectsReconstructed += 1;
  for (const e of events) totals.byState[e.state] = (totals.byState[e.state] || 0) + 1;

  console.log(`  ${pid}: ${events.map((e) => `${String(e.occurredAt).slice(0, 16)} ${e.state}`).join(' → ')}`);

  if (!WRITE) continue;

  for (const e of events) {
    const before = sql(`SELECT COUNT(*) n FROM relationship_events WHERE prospect_id = ${pid}`)[0]?.n || 0;
    sql(`
      INSERT OR IGNORE INTO relationship_events
        (workspace, prospect_id, state, source, confidence, occurred_at, message_id, thread_id, reason, defer_until)
      VALUES ('${esc(prospect.workspace)}', ${pid}, '${esc(e.state)}', '${RECONSTRUCTED}',
              ${val(e.confidence)}, '${esc(e.occurredAt)}', ${val(e.messageId)}, ${val(e.threadId)},
              ${val(e.reason)}, ${val(e.deferUntil)})`);
    const after = sql(`SELECT COUNT(*) n FROM relationship_events WHERE prospect_id = ${pid}`)[0]?.n || 0;
    if (after > before) totals.eventsWritten += 1;
    else totals.duplicatesAvoided += 1;
  }
}

console.log(`\n${WRITE ? 'WROTE' : 'DRY RUN — nothing written'}`);
console.log(`  prospects with inbound replies      ${totals.prospectsWithReplies}`);
console.log(`  already had relationship events     ${totals.prospectsAlreadyLive}`);
console.log(`  reconstructed                       ${totals.prospectsReconstructed}`);
console.log(`  events ${WRITE ? 'written' : 'projected'}                    ${WRITE ? totals.eventsWritten : Object.values(totals.byState).reduce((a, b) => a + b, 0)}`);
console.log(`  duplicates avoided                  ${totals.duplicatesAvoided}`);
console.log(`  events skipped                      ${totals.eventsSkipped}`);
console.log(`  still legacy-only                   ${totals.stillLegacyOnly}`);
console.log(`  by state                            ${JSON.stringify(totals.byState)}`);
console.log(`  skip reasons                        ${JSON.stringify(totals.skipReasons, null, 2)}`);
console.log(`  never inferred                      ${NOT_INFERRED.join(', ')}`);
console.log(`  sends caused                        0`);
console.log(`  credits caused                      0`);
