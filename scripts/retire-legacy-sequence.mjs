// Retiring the work the old sequence left behind.
//
//   node scripts/retire-legacy-sequence.mjs --remote            (plan only)
//   node scripts/retire-legacy-sequence.mjs --remote --write    (execute)
//
// Two different things get retired, and they are deliberately not treated the
// same:
//
//   1. A pending draft. A cold email written under the five-email template for
//      somebody who has since replied, closed, or passed the ceiling. This is
//      the dangerous artifact: it sits in Today labelled ready to approve. It
//      is cleared, and a line is written on the prospect saying why, because a
//      draft that vanishes with no explanation is worse than one that stays.
//
//   2. A next_action_date. Only cleared for people who have NOT replied.
//      On somebody who replied, that date may well be Ary's own reminder to
//      write back, and clearing it would hide the person instead of the
//      obsolete work. Those dates are left exactly as they are.
//
// Nothing here sends, enqueues, spends, or touches send history.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { nextStepFor, dispositionFor, DISPOSITION } from '../lib/cutover.mjs';
import { appendEntry } from '../lib/activity-log.mjs';

const REMOTE = process.argv.includes('--remote');
const WRITE = process.argv.includes('--write');
const PLAN_FILE = process.argv[process.argv.indexOf('--out') + 1] || 'retire-plan.sql';

const wrangler = (args) =>
  execSync(`npx wrangler d1 execute bloomtrack-pro ${REMOTE ? '--remote' : '--local'} ${args}`,
    { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

function sql(query) {
  const out = wrangler(`--json --command "${query.replace(/\s+/g, ' ').trim()}"`);
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
}

// SQLite string literal. Doubling the quote is the whole escape.
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const rows = sql(`
  SELECT p.id, p.workspace, p.name, p.rating, p.emails_sent, p.replied,
         p.do_not_contact, p.unsubscribed, p.last_contact_date, p.email,
         p.deferred_until, p.activity_log,
         p.pending_draft, p.next_action_date,
         (SELECT state FROM relationship_events re WHERE re.prospect_id = p.id
           ORDER BY occurred_at DESC, id DESC LIMIT 1) latest_state
    FROM prospects p
   WHERE p.deleted_at IS NULL AND COALESCE(p.emails_sent, 0) > 0
     AND ((p.pending_draft IS NOT NULL AND p.pending_draft != '') OR p.next_action_date IS NOT NULL)
`);

const now = new Date().toISOString();
const drafts = [];
const dates = [];
const kept = [];

for (const p of rows) {
  const hasDraft = Boolean(p.pending_draft && String(p.pending_draft).trim());
  const hasDate = p.next_action_date != null;
  const decision = nextStepFor({
    prospect: p,
    relationship: p.latest_state ? { state: p.latest_state, deferredUntil: p.deferred_until } : null,
    strong: null,
    evidenceFresh: true,
    contactOk: Boolean(p.email),
  });

  if (dispositionFor(decision, { hasPendingDraft: hasDraft, hasFutureDate: hasDate }) !== DISPOSITION.RETIRE_OBSOLETE) {
    continue;
  }

  if (hasDraft) drafts.push({ p, decision });

  // The one carve-out. A person who replied keeps their date.
  if (hasDate && !p.replied) dates.push({ p, decision });
  else if (hasDate) kept.push({ p, decision });
}

// The line written on the prospect. Plain words, and it says what was removed
// rather than announcing a migration.
const reasonFor = (p) => p.replied
  ? 'Cleared a follow-up draft that was written before they replied. It was never sent.'
  : `Cleared a follow-up draft. ${p.emails_sent} emails have already gone, which is past what the sequence allows. It was never sent.`;

const statements = [
  ...drafts.map(({ p }) => {
    const log = appendEntry(p.activity_log, 'auto', reasonFor(p), now);
    return `UPDATE prospects SET pending_draft = NULL, pending_draft_at = NULL, pending_draft_stale = 0, `
      + `activity_log = ${lit(log)}, updated_at = ${lit(now)} `
      + `WHERE id = ${Number(p.id)} AND workspace = ${lit(p.workspace)} AND pending_draft IS NOT NULL;`;
  }),
  ...dates.map(({ p }) =>
    `UPDATE prospects SET next_action_date = NULL, updated_at = ${lit(now)} `
    + `WHERE id = ${Number(p.id)} AND workspace = ${lit(p.workspace)} AND COALESCE(replied,0) = 0;`),
];

console.log(`\n${WRITE ? 'RETIRING' : 'PLAN ONLY — nothing written'}\n`);
console.log(`rows carrying legacy future work      ${rows.length}`);
console.log(`drafts to clear                       ${drafts.length}`);
console.log(`dates to clear                        ${dates.length}`);
console.log(`dates kept because they replied       ${kept.length}`);
console.log(`statements                            ${statements.length}\n`);

console.log('drafts being cleared');
for (const { p, decision } of drafts) {
  console.log(`  #${p.id} ${String(p.name || '').slice(0, 20).padEnd(20)} ${p.emails_sent} sent · ${decision.next}`);
}
if (kept.length) {
  console.log('\ndates kept (they replied, the date may be yours)');
  for (const { p } of kept.slice(0, 12)) console.log(`  #${p.id} ${String(p.name || '').slice(0, 20)} · ${p.next_action_date}`);
}

writeFileSync(PLAN_FILE, statements.join('\n') + '\n');
console.log(`\nplan written to ${PLAN_FILE}`);

if (!WRITE) {
  console.log('read it, then re-run with --write to execute');
  process.exit(0);
}

wrangler(`--file ${PLAN_FILE}`);
console.log('\nexecuted.');
