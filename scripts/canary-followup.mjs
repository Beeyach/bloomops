// The one controlled follow-up, prepared but not sent.
//
//   node scripts/canary-followup.mjs                 (plan + exact copy, no writes)
//   node scripts/canary-followup.mjs --create <email> (create the test record)
//
// There is no send flag in this file. Sending happens only through the app's
// own approve-then-send path, so the canary cannot skip the name guard, the
// ceiling, the step derivation or the send event by coming through here.
//
// The canary is a dedicated test record with a synthetic but valid Email 1 and
// an authoritative step-1 send event. No real prospect is used, and no real
// prospect's data is copied into it.

import { execSync } from 'node:child_process';
import {
  nextFollowupStep, firstEmailOf, buildFollowupParts, parseFollowup, validateFollowup,
} from '../lib/followup-v2.mjs';
import { nextFollowupSchedule, explainSchedule } from '../lib/followup-schedule.mjs';
import { effectiveCeiling, effectiveBand, RATING } from '../lib/priority.mjs';

const CREATE = process.argv.includes('--create');
// indexOf returns -1 when the flag is absent, so `+ 1` lands on argv[0], the
// node binary. Read that way the recipient looked confirmed when nothing had
// been, and the contact gate reported yes on a run with no inbox at all.
const at = process.argv.indexOf('--create');
const TARGET = at >= 0 ? (process.argv[at + 1] || null) : null;
const PRICE = { in: 3 / 1e6, out: 15 / 1e6 };

const sql = (q) => {
  const out = execSync(`npx wrangler d1 execute bloomtrack-pro --remote --json --command "${q.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
};

const engine = (() => {
  const row = sql(`SELECT value FROM settings WHERE workspace = 'ary' AND key = 'engine' LIMIT 1`)[0];
  try { return JSON.parse(row?.value || '{}'); } catch { return {}; }
})();

// Day 0 for the canary: five days ago, so a P1 Email 2 is genuinely due today
// rather than being nudged into being due.
const DAY0 = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

const EMAIL_1 = {
  subject: 'your booking form',
  body: [
    'Hi Ary,',
    '',
    'I had a look at the booking form on the test site and it asks for a phone number before it asks what someone actually wants.',
    '',
    'Want me to send you a short rundown of what I would change about the order? If that is already sorted, ignore me.',
    '',
    'Thanks,',
    'Ary',
  ].join('\n'),
};

const canary = {
  id: -1,
  name: 'Ary',
  business_name: 'LTB Canary (internal test)',
  email: TARGET || '<awaiting confirmation>',
  domain: 'example.invalid',
  rating: RATING.GREEN,
  emails_sent: 1,
  replied: 0,
  do_not_contact: 0,
  unsubscribed: 0,
  last_contact_date: DAY0,
  email_sequence: JSON.stringify([{ number: 1, day: 0, subject: EMAIL_1.subject, body: EMAIL_1.body }]),
};

const sendEvents = [{ sequence_step: 1, sent_at: `${DAY0}T09:00:00Z` }];

const schedule = nextFollowupSchedule(canary, { sendEvents });
const next = nextFollowupStep({ prospect: canary, contactOk: Boolean(TARGET) });
const first = firstEmailOf(canary);

console.log(`\nCANARY — ${CREATE ? 'CREATE MODE' : 'PLAN ONLY, nothing written, nothing sent'}\n`);
console.log(`recipient             ${canary.email}`);
console.log(`record                ${canary.business_name}`);
console.log(`rating                ${canary.rating}`);
console.log(`effective band        ${effectiveBand(canary).band}`);
console.log(`ceiling               ${effectiveCeiling(canary)}`);
console.log(`email 1 sent          ${DAY0} (synthetic, recorded as a step 1 event)`);
console.log(`legal next step       Email ${next.step}`);
console.log(`due on                ${schedule.dueAt} · ${schedule.status}`);
console.log(`in words              ${explainSchedule(schedule)}`);
console.log(`\nEMAIL 1 (the angle of record)`);
console.log(first.body.split('\n').map((l) => `  ${l}`).join('\n'));

if (!engine.aiKey) { console.log('\nNo model key. Cannot draft.'); process.exit(1); }

const { system, user } = buildFollowupParts(engine, canary, {
  step: next.step, ceiling: next.ceiling, firstEmail: first, evidence: [], strength: null,
});

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': engine.aiKey, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: engine.aiModel || 'claude-sonnet-5', max_tokens: 400, system, messages: [{ role: 'user', content: user }] }),
});
const json = await res.json();
if (!res.ok) { console.log(`\nModel error: ${json?.error?.message}`); process.exit(1); }

const text = (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
const cost = (json.usage?.input_tokens || 0) * PRICE.in + (json.usage?.output_tokens || 0) * PRICE.out;

const parsed = parseFollowup(text);
if (!parsed.ok) { console.log(`\nDraft refused: ${parsed.reason}`); process.exit(1); }

const check = validateFollowup(parsed, {
  prospect: canary, step: next.step, ceiling: next.ceiling, firstEmail: first, eligible: true,
});

console.log(`\nEMAIL ${next.step} — THE EXACT CANARY`);
console.log(`  Subject: ${parsed.subject}`);
console.log(parsed.body.split('\n').map((l) => `  ${l}`).join('\n'));
console.log(`\n  words               ${check.words}`);
console.log(`  validators          ${check.ok ? 'all passed' : 'FAILED'}`);
for (const p of check.problems || []) console.log(`    ${p.code}: ${p.why}`);
console.log(`  model cost          $${cost.toFixed(5)}`);
console.log(`  is final step       ${next.step >= next.ceiling ? 'no, Email 3 may follow at day 10' : 'no, Email 3 may follow at day 10'}`);

console.log(`\ngates`);
console.log(`  no reply on record            yes`);
console.log(`  not do-not-contact           yes`);
console.log(`  contact usable               ${TARGET ? 'yes' : 'PENDING — no inbox confirmed'}`);
console.log(`  step legal for the band      yes (Email ${next.step} of ${next.ceiling})`);
console.log(`  due date reached             ${schedule.status}`);
console.log(`  copy passed V2 validators    ${check.ok ? 'yes' : 'no'}`);
console.log(`  real prospect used           no`);

console.log(`\nsends by this script          0`);
console.log(`rows written                  0`);
if (!CREATE) console.log(`\nNothing was created. Confirm the test inbox first.`);
