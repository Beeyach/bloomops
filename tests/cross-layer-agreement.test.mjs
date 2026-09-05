// The list, the card, the route and the send guard must agree.
//
// They did not, and that is the whole story of this chapter. A package becomes
// SENT when its FIRST email goes out, and five places each decided
// independently what that meant. The guard refused the step, the queue dropped
// the row, the card sorted it into the problem pile, and the route rejected it
// twice — so no native follow-up could be sent by anyone, through any screen,
// while every test passed.
//
// Every check below runs the SAME package through every layer at the same
// moment and asserts they say the same thing. A layer that disagrees is a bug
// even when it is the one that happens to be right, because a screen offering a
// send the guard will refuse is a lie told to a person.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canSendNow, approvalFingerprint, BLOCK } from '../lib/send-guard.mjs';
import { GMAIL_SEND_SCOPE } from '../lib/gmail.mjs';
import { nextFollowupSchedule, DUE } from '../lib/followup-schedule.mjs';
import {
  mayOfferSendFor, isSequenceInFlight, isSequenceComplete, approvedSteps,
} from '../lib/sequence-state.mjs';
import { STATUS, LIVE } from '../lib/outreach.mjs';

const NOW = new Date('2026-08-20T16:00:00Z');
const ANCHOR = '2026-08-14T09:00:00Z';

const basePkg = {
  id: 1, version: 1, status: STATUS.APPROVED, reviewed_at: '2026-08-13T10:00:00Z',
  playbook: 'own-finding', playbook_version: 2, generator_version: 'g1',
  evidence_hash: 'e1', workspace_context_hash: 'w1', priority_band: 'P2',
  contact_email: 'pat@x.com', email_subject: 'your booking form', email_body: 'Hi Pat.',
  sequence_approved: 1, sequence_max_step: 2, allowed_length: 2,
  followups: [{ step: 2, subject: 'your booking form', body: 'Hi Pat, just checking.' }],
};
const sealed = (over = {}) => {
  const p = { ...basePkg, ...over };
  return { ...p, approved_fingerprint: approvalFingerprint(p) };
};

const baseProspect = {
  id: 1, name: 'Pat', business_name: 'Pat Physio', email: 'pat@x.com', stage: 'New',
  rating: '💛', emails_sent: 0, replied: 0, reply_type: null, reply_date: null,
  last_contact_date: null, next_action_date: null, do_not_contact: 0, unsubscribed: 0,
};

const account = {
  id: 1, email_address: 'me@x.com', status: 'connected',
  scope: `x ${GMAIL_SEND_SCOPE}`, last_sync_at: '2026-08-20 15:55:00',
};
const SETTINGS = { autoSendApprovedFirstEmails: false, autoSendApprovedFollowups: false };

// Every layer, asked at once about the same package.
function layers({ pkg, prospect, sends = [], step = null, replies = [] }) {
  const sent = Number(prospect.emails_sent) || 0;
  const schedule = sends.length ? nextFollowupSchedule(prospect, { sendEvents: sends, now: NOW }) : null;
  const useStep = step ?? schedule?.step ?? 1;
  const isFollowup = useStep > 1;

  const args = {
    pkg, prospect, events: replies, settings: SETTINGS, account,
    sentToday: 0, sentThisHour: 0, existingSends: sends.length, now: NOW,
    isFollowup, step: useStep, schedule: isFollowup ? schedule : null,
  };

  return {
    // The queue's WHERE clause, in the same terms.
    listed: LIVE.has(pkg.status) || isSequenceInFlight(pkg, { sent }),
    // The card's Send button.
    card: mayOfferSendFor(pkg, prospect, { sent }),
    schedule,
    manual: canSendNow({ ...args, manual: true }),
    auto: canSendNow({ ...args, manual: false }),
  };
}

// ── A two-step sequence, all the way through ─────────────────────────────

test('before Email 1: every layer offers it, and automation still cannot', () => {
  const pkg = sealed();
  const l = layers({ pkg, prospect: baseProspect });
  assert.equal(l.listed, true, 'on the queue');
  assert.equal(l.card, true, 'card offers the send');
  assert.equal(l.manual.ok, true, `guard agrees: ${l.manual.reason || ''}`);
  assert.equal(l.auto.block, BLOCK.AUTOMATION_OFF, 'and a timer still cannot');
});

test('after Email 1: the sequence is visible, Email 2 is owed, Email 1 is not resendable', () => {
  // This is the state that used to be invisible everywhere at once.
  const pkg = sealed({ status: STATUS.SENT });
  const prospect = { ...baseProspect, emails_sent: 1, last_contact_date: '2026-08-14' };
  const sends = [{ prospect_id: 1, sequence_step: 1, sent_at: ANCHOR }];

  const l = layers({ pkg, prospect, sends });
  assert.equal(isSequenceInFlight(pkg, { sent: 1 }), true);
  assert.equal(l.listed, true, 'still on the queue');
  assert.equal(l.card, true, 'card still offers a send');
  assert.equal(l.schedule.step, 2, 'and it is Email 2 that is owed');
  assert.equal(l.manual.ok, true, `guard agrees: ${l.manual.reason || ''}`);
  assert.equal(l.auto.block, BLOCK.AUTOMATION_OFF);

  // Email 1 itself is finished business.
  const again = layers({ pkg, prospect, sends, step: 1 });
  assert.equal(again.manual.ok, false, 'Email 1 is not resendable');
});

test('after Email 2: the sequence is complete and nothing offers a third', () => {
  const pkg = sealed({ status: STATUS.SENT });
  const prospect = { ...baseProspect, emails_sent: 2, last_contact_date: '2026-08-18' };
  const sends = [
    { prospect_id: 1, sequence_step: 1, sent_at: ANCHOR },
    { prospect_id: 1, sequence_step: 2, sent_at: '2026-08-18T09:00:00Z' },
  ];

  assert.equal(isSequenceComplete(pkg, { sent: 2 }), true);
  const l = layers({ pkg, prospect, sends });
  assert.equal(l.listed, false, 'drops off the queue');
  assert.equal(l.card, false, 'no card, no button');
  assert.equal(l.manual.ok, false, 'and the guard would refuse anyway');
  assert.ok(!approvedSteps(pkg).includes(3), 'there is no step 3 to reach for');
});

// ── The reply branch ─────────────────────────────────────────────────────

test('a reply stops every layer at once', () => {
  const pkg = sealed({ status: STATUS.SENT });
  const prospect = {
    ...baseProspect, emails_sent: 1, replied: 1, reply_type: 'interested',
    reply_date: '2026-08-16', last_contact_date: '2026-08-14',
  };
  const sends = [{ prospect_id: 1, sequence_step: 1, sent_at: ANCHOR }];
  const replies = [{ direction: 'inbound', occurred_at: '2026-08-16T10:00:00Z', classification: 'interested' }];

  const l = layers({ pkg, prospect, sends, replies });
  // The card is the one that used to disagree: the guard refused and the screen
  // still drew a Send button over a person who had written back.
  assert.equal(l.card, false, 'no send is offered');
  assert.equal(l.manual.ok, false, 'and none is permitted');
  assert.equal(l.auto.ok, false);
  assert.equal(l.schedule.step, null, 'the scheduler has no next step');
  assert.equal(l.schedule.status, DUE.NEEDS_HUMAN);
});

test('a stopped sequence cannot be restarted by timing', () => {
  // There is no force-due mechanism left in the runtime, and a schedule handed
  // in as due does not overrule a reply.
  const pkg = sealed({ status: STATUS.SENT });
  const prospect = { ...baseProspect, emails_sent: 1, replied: 1, reply_date: '2026-08-16' };
  const forced = { status: DUE.DUE_NOW, step: 2, dueAt: '2026-08-18' };
  const r = canSendNow({
    pkg, prospect, events: [{ direction: 'inbound', occurred_at: '2026-08-16T10:00:00Z' }],
    settings: SETTINGS, account, now: NOW, manual: true,
    isFollowup: true, step: 2, schedule: forced, existingSends: 1,
  });
  assert.equal(r.ok, false);
});

// ── The fingerprint branch ───────────────────────────────────────────────

test('a missing fingerprint blocks the guard, and the card must not promise otherwise', () => {
  const pkg = { ...basePkg, approved_fingerprint: null };
  const l = layers({ pkg, prospect: baseProspect });
  assert.equal(l.manual.block, BLOCK.APPROVAL_INCOMPLETE);
  // The card does still offer it, because the package is APPROVED — and that is
  // the one disagreement left standing on purpose. It is recorded in the
  // stabilization report as a known, guard-blocked case rather than papered
  // over here, because the honest fix is re-approval, not hiding the row.
  assert.equal(l.card, true);
});

test('an edit after approval blocks the guard on the exact step', () => {
  const pkg = sealed({ status: STATUS.SENT });
  const edited = { ...pkg, followups: [{ step: 2, subject: 'your booking form', body: 'different now' }] };
  const prospect = { ...baseProspect, emails_sent: 1, last_contact_date: '2026-08-14' };
  const sends = [{ prospect_id: 1, sequence_step: 1, sent_at: ANCHOR }];
  const l = layers({ pkg: edited, prospect, sends });
  assert.equal(l.manual.block, BLOCK.STALE_APPROVAL);
});

// ── The invariant itself ─────────────────────────────────────────────────

test('across the whole lifecycle, the card never offers what the guard forbids', () => {
  // The one exception is a missing fingerprint, which is asserted above and
  // recorded in the report. Everything else must agree.
  const states = [
    { label: 'before Email 1', pkg: sealed(), prospect: baseProspect, sends: [] },
    {
      label: 'after Email 1',
      pkg: sealed({ status: STATUS.SENT }),
      prospect: { ...baseProspect, emails_sent: 1, last_contact_date: '2026-08-14' },
      sends: [{ prospect_id: 1, sequence_step: 1, sent_at: ANCHOR }],
    },
    {
      label: 'after Email 2',
      pkg: sealed({ status: STATUS.SENT }),
      prospect: { ...baseProspect, emails_sent: 2, last_contact_date: '2026-08-18' },
      sends: [
        { prospect_id: 1, sequence_step: 1, sent_at: ANCHOR },
        { prospect_id: 1, sequence_step: 2, sent_at: '2026-08-18T09:00:00Z' },
      ],
    },
    {
      label: 'replied',
      pkg: sealed({ status: STATUS.SENT }),
      prospect: { ...baseProspect, emails_sent: 1, replied: 1, reply_date: '2026-08-16' },
      sends: [{ prospect_id: 1, sequence_step: 1, sent_at: ANCHOR }],
      replies: [{ direction: 'inbound', occurred_at: '2026-08-16T10:00:00Z' }],
    },
    {
      label: 'unsubscribed',
      pkg: sealed({ status: STATUS.SENT }),
      prospect: { ...baseProspect, emails_sent: 1, unsubscribed: 1 },
      sends: [{ prospect_id: 1, sequence_step: 1, sent_at: ANCHOR }],
    },
  ];

  for (const s of states) {
    const l = layers(s);
    if (l.card && !l.manual.ok) {
      // Timing is allowed to differ: a card may be listed while the step is not
      // yet due, and the guard says so with its own reason.
      assert.ok(
        [BLOCK.TOO_SOON, BLOCK.OUTSIDE_WINDOW, BLOCK.RATE_LIMIT].includes(l.manual.block),
        `${s.label}: card offers a send the guard refuses with ${l.manual.block}`
      );
    }
  }
});
