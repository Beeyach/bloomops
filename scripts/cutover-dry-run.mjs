// What V2 would do with the list the old sequence left behind.
//
//   node scripts/cutover-dry-run.mjs --remote
//
// Reads only. There is no --write and no mutation path in this file at all:
// the decision and the doing are kept apart so the plan can be read before
// anybody runs it. It sends nothing, enqueues nothing, and spends nothing.

import { execSync } from 'node:child_process';
import { nextStepFor, dispositionFor, NEXT, DISPOSITION, STALE_CUTOVER_DAYS } from '../lib/cutover.mjs';

const REMOTE = process.argv.includes('--remote');

function sql(query) {
  const one = query.replace(/\s+/g, ' ').trim();
  const cmd = `npx wrangler d1 execute bloomtrack-pro ${REMOTE ? '--remote' : '--local'} --json --command "${one}"`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
}

// Everybody who has ever been contacted, plus anybody Strong who has not.
// Deleted records are excluded: they are test rows and closed business.
const rows = sql(`
  SELECT p.id, p.name, p.rating, p.stage, p.emails_sent, p.replied,
         p.do_not_contact, p.unsubscribed, p.last_contact_date, p.last_contact_at,
         p.email, p.contact_state, p.deferred_until,
         p.pending_draft IS NOT NULL AND p.pending_draft != '' AS has_draft,
         p.next_action_date IS NOT NULL AS has_future_date,
         (SELECT COUNT(*) FROM relationship_events re WHERE re.prospect_id = p.id) rel_events,
         (SELECT state FROM relationship_events re WHERE re.prospect_id = p.id
           ORDER BY occurred_at DESC, id DESC LIMIT 1) latest_state
    FROM prospects p
   WHERE p.deleted_at IS NULL AND COALESCE(p.emails_sent, 0) > 0
`);

const buckets = new Map();
const samples = new Map();
const dispositions = new Map();
let futureWork = 0;
let repliedCarryingFuture = 0;

for (const p of rows) {
  // The relationship state as the model already derived it. Only the latest
  // stored event is needed here; the full precedence lives in currentState()
  // and is not re-implemented.
  const relationship = p.latest_state
    ? { state: p.latest_state, deferredUntil: p.deferred_until }
    : null;

  const decision = nextStepFor({
    prospect: p,
    relationship,
    // Strong is unknown from this query alone. Passing null lets bandFor use
    // the rating, which is what decides the ceiling; a prospect who is not
    // Strong is caught by the no-band branch.
    strong: null,
    evidenceFresh: true,
    contactOk: Boolean(p.email),
  });

  buckets.set(decision.next, (buckets.get(decision.next) || 0) + 1);
  if (!samples.has(decision.next)) samples.set(decision.next, []);
  if (samples.get(decision.next).length < 3) {
    samples.get(decision.next).push(`#${p.id} ${String(p.name || '').slice(0, 22)} · ${p.emails_sent} sent · ${decision.band || 'no band'}`);
  }

  const hasFuture = Boolean(p.has_draft) || Boolean(p.has_future_date);
  if (hasFuture) {
    futureWork += 1;
    if (p.replied) repliedCarryingFuture += 1;
    const d = dispositionFor(decision, { hasPendingDraft: Boolean(p.has_draft), hasFutureDate: Boolean(p.has_future_date) });
    dispositions.set(d, (dispositions.get(d) || 0) + 1);
  }
}

const n = (k) => buckets.get(k) || 0;

console.log(`\nDRY RUN — nothing written, nothing sent, nothing queued\n`);
console.log(`contacted prospects examined        ${rows.length}`);
console.log(`carrying legacy future work         ${futureWork}`);
console.log(`  of those, already replied         ${repliedCarryingFuture}`);
console.log(`stale cutover boundary              ${STALE_CUTOVER_DAYS} days\n`);

console.log('| bucket | count | action |');
console.log('|---|---:|---|');
const table = [
  [NEXT.NEEDS_HUMAN, 'no cold followup, a person owes them a reply'],
  [NEXT.CLOSED, 'closed'],
  [NEXT.ELIGIBLE_EMAIL_1, 'shadow eligible'],
  [NEXT.ELIGIBLE_EMAIL_2, 'shadow eligible'],
  [NEXT.ELIGIBLE_EMAIL_3, 'shadow eligible'],
  [NEXT.NO_ACTION_COMPLETE, 'stop, ceiling reached'],
  [NEXT.MANUAL_OVERRIDE_ONLY, 'manual only, never automated'],
  [NEXT.HOLD_STALE_EVIDENCE, 'hold'],
  [NEXT.HOLD_CONTACT_RECOVERY, 'hold'],
  [NEXT.HOLD_DEFERRED, 'hold'],
  [NEXT.UNCLEAR, 'human review'],
];
for (const [k, action] of table) console.log(`| ${k} | ${n(k)} | ${action} |`);

console.log(`\nlegacy future work disposition`);
for (const d of Object.values(DISPOSITION)) console.log(`  ${d.padEnd(20)} ${dispositions.get(d) || 0}`);

console.log(`\nsamples`);
for (const [k, list] of samples) {
  if (!list.length) continue;
  console.log(`  ${k}`);
  for (const s of list) console.log(`    ${s}`);
}

console.log(`\nprojected model calls               0 (dry run makes none)`);
console.log(`projected sends                     0`);
console.log(`projected credit spend              0`);
