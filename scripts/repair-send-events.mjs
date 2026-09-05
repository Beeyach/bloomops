// Sends that succeeded and left no event.
//
//   node scripts/repair-send-events.mjs --remote            (plan only)
//   node scripts/repair-send-events.mjs --remote --write    (execute)
//
// Only from facts the attempt already holds: the provider id Gmail returned,
// the step that was claimed before the call, and when the attempt finished.
// Nothing is inferred, no timestamp is reconstructed from an offset, and no
// message is ever re-sent. A step or a time that is not on record makes the row
// unrepairable rather than guessable.

import { execSync } from 'node:child_process';
import { repairMissingEvents } from '../lib/send-events.mjs';

const REMOTE = process.argv.includes('--remote');
const WRITE = process.argv.includes('--write');
const WORKSPACE = 'ary';

function sql(query) {
  const one = query.replace(/\s+/g, ' ').trim();
  const out = execSync(`npx wrangler d1 execute bloomtrack-pro ${REMOTE ? '--remote' : '--local'} --json --command "${one.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
}

// A read-through shim so the same helper the app uses runs here unchanged.
const db = {
  prepare(query) {
    let binds = [];
    const fill = () => {
      let i = 0;
      return query.replace(/\?/g, () => {
        const v = binds[i++];
        return v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
      });
    };
    const api = {
      bind: (...b) => { binds = b; return api; },
      async all() { return { results: sql(fill()) }; },
      async first() { return sql(fill())[0] || null; },
      async run() {
        if (!WRITE) return { meta: { changes: 0 } };
        const before = sql(`SELECT COUNT(*) n FROM send_events`)[0]?.n || 0;
        sql(fill());
        const after = sql(`SELECT COUNT(*) n FROM send_events`)[0]?.n || 0;
        return { meta: { changes: after - before } };
      },
    };
    return api;
  },
};

const before = sql(`SELECT (SELECT COUNT(*) FROM send_events) e, (SELECT COUNT(*) FROM send_attempts WHERE state='succeeded') a`)[0];

const r = await repairMissingEvents(db, WORKSPACE, { write: WRITE });

console.log(`\n${WRITE ? 'REPAIRING' : 'PLAN ONLY — nothing written'}\n`);
console.log(`successful send attempts        ${before?.a ?? '?'}`);
console.log(`send events before              ${before?.e ?? '?'}`);
console.log(`succeeded with no event         ${r.found}`);
console.log(`repairable from stored facts    ${r.repaired.length}`);
console.log(`not repairable                  ${r.unrepairable.length}`);

for (const x of r.repaired) {
  console.log(`  attempt ${x.attemptId} · prospect ${x.prospectId} · step ${x.step} · ${x.sentAt} · ${x.written ? 'written' : 'planned'}`);
}
for (const x of r.unrepairable) {
  console.log(`  attempt ${x.attemptId} · prospect ${x.prospectId} · SKIPPED: ${x.why}`);
}

const after = sql(`SELECT COUNT(*) n FROM send_events`)[0]?.n;
console.log(`\nsend events after               ${after}`);
console.log(`emails sent by this script      0`);
console.log(`\nNothing here re-sends a message. A missing event is repaired, never replayed.`);
