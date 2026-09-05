// A read-only audit: does every layer agree about the same step?
//
// The follow-up bug was not that any one check was wrong. It was that the list,
// the card, the route, the scheduler and the send guard each answered "may this
// go?" their own way, and disagreed. This runs them all against real production
// rows and reports every disagreement.
//
// It sends nothing, calls no provider, and writes nothing. It takes JSON dumps
// on disk so it cannot touch the database even by accident.
//
//   node scripts/shadow-audit.mjs <dir-with-dumps>

import { readFileSync } from 'node:fs';
import { canSendNow, approvalFingerprint, BLOCK } from '../lib/send-guard.mjs';
import { nextFollowupSchedule, DUE } from '../lib/followup-schedule.mjs';
import { mayOfferSendFor, isSequenceInFlight, isSequenceComplete, approvedSteps, approvedLength } from '../lib/sequence-state.mjs';
import { STATUS } from '../lib/outreach.mjs';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/shadow-audit.mjs <dump-dir>'); process.exit(2); }

const load = (f) => {
  const raw = readFileSync(`${dir}/${f}`, 'utf8');
  return JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1))[0].results;
};

const packages = load('audit-pkgs.json');
const prospects = new Map(load('audit-prospects.json').map((p) => [p.id, p]));
const events = load('audit-events.json');
const replies = load('audit-replies.json');
const account = load('acct.json')[0];
const settings = JSON.parse(load('eng.json')[0].value);

const sendsFor = (id) => events.filter((e) => e.prospect_id === id);
const repliesFor = (id) => replies.filter((r) => r.prospect_id === id);

const now = new Date();
const findings = [];
const skipped = [];
const flag = (cat, pkg, detail) => findings.push({ cat, pkg: pkg.id, prospect: pkg.prospect_id, detail });

console.log(`Auditing ${packages.length} packages against ${events.length} send events.\n`);

for (const pkg of packages) {
  const prospect = prospects.get(pkg.prospect_id);
  // Prospects in the trash are excluded from the dump by design, so a package
  // without one here is a trashed record rather than a fault.
  if (!prospect) { skipped.push(pkg.id); continue; }

  const sends = sendsFor(prospect.id);
  const sent = Number(prospect.emails_sent) || 0;
  const inbound = repliesFor(prospect.id).filter((r) => r.direction === 'inbound');

  // 1. What the list/card would do.
  const listed = ['READY_FOR_APPROVAL', 'NEEDS_DECISION', STATUS.APPROVED].includes(pkg.status)
    || isSequenceInFlight(pkg, { sent });
  // The same predicate the API uses. Re-deriving it here would recreate the
  // very drift this audit exists to catch.
  const cardOffersSend = mayOfferSendFor(pkg, prospect, { sent });

  // 2. What the scheduler says.
  const schedule = nextFollowupSchedule(prospect, { sendEvents: sends, now });
  const step = schedule.step;

  // 3. What the guard says, manual and automatic.
  const args = {
    pkg, prospect, events: repliesFor(prospect.id), settings, account,
    sentToday: 0, sentThisHour: 0, existingSends: sends.length, now,
    isFollowup: Boolean(step && step > 1), step: step || 1, schedule: step > 1 ? schedule : null,
  };
  const manual = canSendNow({ ...args, manual: true });
  const auto = canSendNow({ ...args, manual: false });

  // ── Disagreements ──────────────────────────────────────────────────────
  if (cardOffersSend && !manual.ok && manual.block !== BLOCK.TOO_SOON && schedule.status !== DUE.NOT_DUE_YET) {
    flag('ui-offers-guard-refuses', pkg, `card would offer send; guard says ${manual.block}`);
  }
  if (!listed && manual.ok) {
    flag('guard-allows-ui-hides', pkg, 'guard would send but the row is not listed');
  }
  if (isSequenceInFlight(pkg, { sent }) && !listed) {
    flag('inflight-hidden', pkg, 'sequence part way through and not on any queue');
  }
  if (inbound.length && cardOffersSend) {
    flag('replied-still-offered', pkg, `${inbound.length} inbound reply, card still offers send`);
  }
  if (!pkg.approved_fingerprint && pkg.status === STATUS.APPROVED) {
    flag('approved-without-fingerprint', pkg, 'presented as ready, would block at send');
  }
  if (pkg.approved_fingerprint && pkg.approved_fingerprint !== approvalFingerprint(pkg)) {
    flag('fingerprint-mismatch', pkg, 'copy changed after approval');
  }
  // Not a disagreement. The scheduler works from the prospect's band, which
  // may permit a touch the approval never covered; the guard then refuses it
  // with past-allowed-length or copy-not-approved. Two layers answering two
  // different questions correctly. It is only a fault if the send is ALLOWED.
  if (step && step > approvedLength(pkg) && manual.ok) {
    flag('step-past-allowed-length-ALLOWED', pkg, `step ${step} allowed while approval covers ${approvedLength(pkg)}`);
  }
  if (step && !approvedSteps(pkg).includes(step) && manual.ok) {
    flag('unapproved-step-allowed', pkg, `step ${step} not in ${JSON.stringify(approvedSteps(pkg))}`);
  }
  if (prospect.next_action_date && step) {
    flag('legacy-next-action-date', pkg, `next_action_date=${prospect.next_action_date} while V2 owns step ${step}`);
  }
  if (auto.ok) {
    flag('automatic-would-send', pkg, 'AUTOMATION IS SUPPOSED TO BE OFF');
  }
  if (isSequenceComplete(pkg, { sent }) && cardOffersSend) {
    flag('complete-still-offered', pkg, 'every approved step sent, card still offers one');
  }

  const band = schedule.band;
  if (band === 'P3' && step === 2) flag('p3-offered-email-2', pkg, 'P3 allows one touch');
  if (band === 'P2' && step === 3) flag('p2-offered-email-3', pkg, 'P2 allows two touches');
  if (step >= 4) flag('email-4-plus', pkg, `step ${step}`);

  console.log(
    `pkg ${String(pkg.id).padEnd(3)} p${String(prospect.id).padEnd(5)} ${String(pkg.status).padEnd(18)}`
    + ` sent=${sent} step=${step ?? '-'} ${String(schedule.status).padEnd(12)}`
    + ` listed=${listed ? 'Y' : 'n'} card=${cardOffersSend ? 'Y' : 'n'}`
    + ` manual=${manual.ok ? 'ALLOW' : manual.block} auto=${auto.ok ? 'ALLOW' : auto.block}`
    + `  ${(prospect.business_name || prospect.name || '').slice(0, 30)}`
  );
}

console.log(`\n── findings ──`);
if (!findings.length) {
  console.log('None. Every layer agreed on every package.');
} else {
  const byCat = findings.reduce((a, f) => { (a[f.cat] ||= []).push(f); return a; }, {});
  for (const [cat, list] of Object.entries(byCat)) {
    console.log(`\n${cat} (${list.length})`);
    for (const f of list) console.log(`  pkg ${f.pkg} / prospect ${f.prospect}: ${f.detail}`);
  }
}
console.log('\nRead-only. Nothing was sent, called or written.');
