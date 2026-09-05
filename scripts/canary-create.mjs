// Build the one canary record, approved and ready, and send nothing.
//
//   node scripts/canary-create.mjs            (plan)
//   node scripts/canary-create.mjs --write    (create)
//
// There is no send in this file. The email leaves only when a person presses
// Send in the app, which is the canonical native path: name guard, ceiling,
// step derivation, send window, send attempt, provider, send event.

import { execSync } from 'node:child_process';

const WRITE = process.argv.includes('--write');
const WS = 'ary';
const TO = 'arylombres@gmail.com';
const DAY0 = '2026-08-06';
const NOW = new Date().toISOString();

const lit = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const run = (q) => {
  const out = execSync(`npx wrangler d1 execute bloomtrack-pro --remote --json --command "${q.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
};

const EMAIL_1 = {
  subject: 'your booking form',
  body: ['Hi Ary,', '',
    'I had a look at the booking form on the test site and it asks for a phone number before it asks what someone actually wants.', '',
    'Want me to send you a short rundown of what I would change about the order? If that is already sorted, ignore me.', '',
    'Thanks,', 'Ary'].join('\n'),
};
const EMAIL_2 = {
  step: 2,
  subject: 'quick note on that booking form',
  body: ['Hi Ary,', '',
    'Just checking on this. If you want that short rundown of what I would change about the order on the booking form, say the word and I will send it over.', '',
    'Thanks,', 'Ary'].join('\n'),
};

const existing = run(`SELECT id FROM prospects WHERE workspace = ${lit(WS)} AND business_name = 'LTB Canary (internal test)'`);
if (existing.length) {
  console.log(`\nCanary already exists: prospect ${existing[0].id}. Nothing created.`);
  process.exit(0);
}

console.log(`\n${WRITE ? 'CREATING' : 'PLAN ONLY — nothing written'}\n`);
console.log(`recipient        ${TO}`);
console.log(`record           LTB Canary (internal test)`);
console.log(`email 1          ${DAY0}, recorded as a step 1 send event`);
console.log(`email 2          the step under test, approved copy in the package`);
console.log(`sends by this    0`);

if (!WRITE) { console.log('\nRe-run with --write to create. It still sends nothing.'); process.exit(0); }

// 1. The record. Marked internal in its own name so it cannot be mistaken for
//    a real prospect in any list.
run(`INSERT INTO prospects (workspace, name, business_name, email, domain, rating, stage,
      emails_sent, replied, do_not_contact, unsubscribed, last_contact_date, last_contact_at,
      email_sequence, source, created_at, updated_at)
     VALUES (${lit(WS)}, 'Ary', 'LTB Canary (internal test)', ${lit(TO)}, 'example.invalid',
      '💚', 'Email 1', 1, 0, 0, 0, ${lit(DAY0)}, ${lit(`${DAY0}T09:00:00.000Z`)},
      ${lit(JSON.stringify([{ number: 1, day: 0, subject: EMAIL_1.subject, body: EMAIL_1.body }]))},
      'canary', ${lit(NOW)}, ${lit(NOW)})`);

const pid = run(`SELECT id FROM prospects WHERE workspace = ${lit(WS)} AND business_name = 'LTB Canary (internal test)'`)[0].id;

// 2. The step-1 send event. Synthetic, and only ever for this internal record:
//    no real prospect's history is invented anywhere.
run(`INSERT OR IGNORE INTO send_events
      (workspace, prospect_id, sequence_step, channel, provider, provider_message_id,
       subject, sent_at, recorded_via, dedupe_key, identity, needs_reconciliation)
     VALUES (${lit(WS)}, ${pid}, 1, 'email', 'gmail', ${lit(`canary-e1-${pid}`)},
       ${lit(EMAIL_1.subject)}, ${lit(`${DAY0}T09:00:00.000Z`)}, 'native',
       ${lit(`msg:canary-e1-${pid}`)}, 'provider-message-id', 0)`);

// 3. The package, approved, with Email 2's exact words in it. The send guard
//    refuses any step whose copy was not in the package at approval, so this is
//    what makes the canary sendable at all.
run(`INSERT INTO outreach_packages
      (workspace, prospect_id, version, status, email_subject, email_body, followups,
       priority_band, allowed_length, prepared_by, reviewed_at, sequence_approved,
       sequence_max_step, created_at, updated_at)
     VALUES (${lit(WS)}, ${pid}, 1, 'APPROVED', ${lit(EMAIL_1.subject)}, ${lit(EMAIL_1.body)},
       ${lit(JSON.stringify([EMAIL_2]))}, 'P1', 3, 'canary', ${lit(NOW)}, 1, 3,
       ${lit(NOW)}, ${lit(NOW)})`);

const pkg = run(`SELECT id, status FROM outreach_packages WHERE workspace = ${lit(WS)} AND prospect_id = ${pid}`)[0];

console.log(`\ncreated`);
console.log(`  prospect id    ${pid}`);
console.log(`  package id     ${pkg.id} (${pkg.status})`);
console.log(`  send events    1 (step 1, ${DAY0})`);
console.log(`  emails sent    0 by this script`);
console.log(`\nNothing has been sent. The email leaves only when a person presses Send.`);
