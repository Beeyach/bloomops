// What LTB would write next, without writing it anywhere.
//
//   node scripts/shadow-followups.mjs --remote
//
// Reads production, generates at most three follow-ups, prints them, and stops.
// There is no write path in this file: no flag, no branch, no persistence. The
// drafts exist in this terminal output and nowhere else, so nothing downstream
// can mistake them for approved work. Nothing is queued, no send state is set,
// no sent count moves, and no Gmail id is created.

import { execSync } from 'node:child_process';
import {
  nextFollowupStep, firstEmailOf, buildFollowupParts, parseFollowup,
  validateFollowup, packageShape, FOLLOWUP_V2_VERSION,
} from '../lib/followup-v2.mjs';
import { effectiveBand } from '../lib/priority.mjs';
import { shadowQueue, explainSchedule, UPCOMING_DAYS } from '../lib/followup-schedule.mjs';
import { collectEvidence, evidenceStrength } from '../lib/evidence.mjs';

const REMOTE = process.argv.includes('--remote');
const MAX_SAMPLES = 3;
const MAX_SPEND_USD = 0.05;
const PRICE = { in: 3 / 1e6, out: 15 / 1e6 }; // claude-sonnet-5

// Never, under any circumstance, in a shadow run.
const EXCLUDED = new Set([927, 1317]);

function sql(query) {
  const one = query.replace(/\s+/g, ' ').trim();
  const out = execSync(`npx wrangler d1 execute bloomtrack-pro ${REMOTE ? '--remote' : '--local'} --json --command "${one}"`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results || [];
}

const engine = (() => {
  const row = sql(`SELECT value FROM settings WHERE workspace = 'ary' AND key = 'engine' LIMIT 1`)[0];
  try { return JSON.parse(row?.value || '{}'); } catch { return {}; }
})();
const API_KEY = String(engine.aiKey || '').trim();
const MODEL = String(engine.aiModel || 'claude-sonnet-5').trim();

const rows = sql(`
  SELECT p.id, p.name, p.business_name, p.domain, p.email, p.rating, p.priority_band,
         p.band_was_provisional, p.emails_sent, p.replied, p.do_not_contact, p.unsubscribed,
         p.stage, p.last_contact_date, p.deferred_until, p.site_intel, p.site_intel_at,
         p.site_intel_source, p.email_sequence, p.pending_draft,
         (SELECT state FROM relationship_events re WHERE re.prospect_id = p.id
           ORDER BY occurred_at DESC, id DESC LIMIT 1) latest_state
    FROM prospects p
   WHERE p.deleted_at IS NULL
     AND COALESCE(p.emails_sent,0) > 0 AND COALESCE(p.replied,0) = 0
     AND COALESCE(p.do_not_contact,0) = 0 AND COALESCE(p.unsubscribed,0) = 0
     AND p.email IS NOT NULL AND p.email != ''
     AND p.email_sequence IS NOT NULL AND p.email_sequence != ''
   ORDER BY p.id
`);

// Picked from the SCHEDULE, not from raw eligibility, so a sample proves the
// thing this pass is about: that the right person is due for the right step on
// the right day. Longest overdue first, which is the order Today shows.
const queue = shadowQueue(rows.map((prospect) => ({
  prospect,
  relationship: prospect.latest_state
    ? { state: prospect.latest_state, deferredUntil: prospect.deferred_until }
    : null,
})));

const WANT = [
  { key: 'P1 → Email 2', band: 'P1', step: 2 },
  { key: 'P1 → Email 3', band: 'P1', step: 3 },
  { key: 'P2 → Email 2', band: 'P2', step: 2 },
];
const picked = [];

for (const want of WANT) {
  const hit = queue.due.find(({ prospect, schedule }) => {
    if (EXCLUDED.has(Number(prospect.id))) return false;
    if (picked.some((x) => x.row.id === prospect.id)) return false;
    if (schedule.bandProvisional || schedule.band !== want.band) return false;
    if (schedule.step !== want.step) return false;
    return Boolean(firstEmailOf(prospect).body);
  });
  if (hit) picked.push({ bucket: want.key, row: hit.prospect, schedule: hit.schedule });
}

console.log(`\nschedule: ${queue.due.length} due or overdue, ${queue.upcoming.length} coming up in ${UPCOMING_DAYS} days`);

console.log(`\nSHADOW RUN — nothing written, nothing queued, nothing sent`);
console.log(`generator ${FOLLOWUP_V2_VERSION} · model ${MODEL} · cap $${MAX_SPEND_USD}\n`);

if (!picked.length) {
  console.log('No safe sample exists. Nothing generated.');
  process.exit(0);
}
if (picked.length > MAX_SAMPLES) {
  console.log(`Refusing: ${picked.length} samples exceeds the cap of ${MAX_SAMPLES}.`);
  process.exit(1);
}

async function generate(system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  const text = (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const inTok = json.usage?.input_tokens || 0;
  const outTok = json.usage?.output_tokens || 0;
  return { text, inTok, outTok, cost: inTok * PRICE.in + outTok * PRICE.out };
}

let spent = 0;
let calls = 0;

for (const { bucket, row, schedule } of picked) {
  const next = nextFollowupStep({
    prospect: row,
    relationship: row.latest_state ? { state: row.latest_state, deferredUntil: row.deferred_until } : null,
    strong: null, evidenceFresh: true, contactOk: Boolean(row.email),
  });
  const first = firstEmailOf(row);
  const evidence = collectEvidence(row, { now: new Date() });
  const strength = evidenceStrength(evidence);
  const shape = packageShape(row);

  console.log('─'.repeat(72));
  console.log(`${bucket}`);
  console.log(`  prospect            #${row.id} ${row.name || '(no name)'}${row.business_name ? ` · ${row.business_name}` : ''}`);
  console.log(`  domain              ${row.domain || '(none)'}`);
  console.log(`  rating              ${row.rating || '(unrated)'}`);
  console.log(`  effective band      ${next.band} (${effectiveBand(row).source})`);
  console.log(`  ceiling             ${next.ceiling}`);
  console.log(`  cold sends so far   ${row.emails_sent}`);
  console.log(`  legal next step     Email ${next.step}`);
  console.log(`  steps still legal   ${shape.remaining.join(', ') || 'none'}`);
  console.log(`  why allowed         ${next.why}`);
  console.log(`  due on              ${schedule.dueAt} (${schedule.overdueDays} days overdue)`);
  console.log(`  anchored on         ${schedule.anchor} · ${schedule.anchorSource}`);
  console.log(`  in words            ${explainSchedule(schedule)}`);
  console.log(`  angle of record     from ${first.source}${first.subject ? ` · "${first.subject}"` : ''}`);
  console.log(`  verified evidence   ${strength?.canPersonalise ? `${evidence.length} facts` : 'none, so it may add no new detail about their site'}`);
  console.log(`  old V1 draft        ${row.pending_draft ? 'present, NOT reused' : 'none'}`);
  console.log(`\n  EMAIL 1 AS SENT`);
  console.log(first.body.split('\n').map((l) => `    ${l}`).join('\n'));

  if (spent >= MAX_SPEND_USD) {
    console.log(`\n  SKIPPED — spend cap reached.`);
    continue;
  }

  const { system, user } = buildFollowupParts(engine, row, {
    step: next.step, ceiling: next.ceiling, firstEmail: first, evidence, strength,
  });

  let attempt = 0;
  let result = null;
  const failures = [];

  // Two attempts at most. A draft that fails twice is a prompt problem, and
  // burning calls on it hides that rather than fixing it.
  while (attempt < 2 && !result) {
    attempt += 1;
    const gen = await generate(system, user);
    spent += gen.cost;
    calls += 1;

    const parsed = parseFollowup(gen.text);
    if (!parsed.ok) {
      failures.push({ attempt, problems: [{ code: 'MALFORMED', why: parsed.reason }], raw: gen.text.slice(0, 200) });
      continue;
    }
    const check = validateFollowup(parsed, {
      prospect: row, step: next.step, ceiling: next.ceiling, firstEmail: first,
      eligible: true, canPersonalise: Boolean(strength?.canPersonalise),
    });
    if (check.ok) result = { parsed, check, gen };
    else failures.push({ attempt, problems: check.problems, body: parsed.body });
  }

  for (const f of failures) {
    console.log(`\n  ATTEMPT ${f.attempt} REJECTED`);
    for (const pr of f.problems) console.log(`    ${pr.code}: ${pr.why}`);
    if (f.body) console.log(f.body.split('\n').map((l) => `    | ${l}`).join('\n'));
  }

  if (!result) {
    console.log(`\n  NO USABLE DRAFT after ${attempt} attempts.`);
    continue;
  }

  console.log(`\n  GENERATED EMAIL ${next.step}`);
  console.log(`    Subject: ${result.parsed.subject}`);
  console.log(result.parsed.body.split('\n').map((l) => `    ${l}`).join('\n'));
  console.log(`\n  words               ${result.check.words}`);
  console.log(`  validators          all passed`);
  console.log(`  model               ${MODEL}`);
  console.log(`  prepared_by         shadow (never persisted)`);
  console.log(`  cost                $${result.gen.cost.toFixed(5)}`);
  console.log(`  later step exists   ${shape.remaining.filter((s) => s > next.step).join(', ') || 'no, this is the last one'}`);
}

console.log('─'.repeat(72));
console.log(`\nmodel calls                 ${calls}`);
console.log(`total model cost            $${spent.toFixed(5)}`);
console.log(`app credits charged         0 (no credit path was touched)`);
console.log(`rows written                0`);
console.log(`send jobs created           0`);
console.log(`emails sent                 0`);
