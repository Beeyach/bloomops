// BloomOps · D1 database helper for Cloudflare Workers.
//
// Each request gets the D1 binding "DB" from the Worker context that OpenNext
// exposes through getCloudflareContext(). In `next dev` and `npm run preview`
// that binding is wrangler's local simulation; a deployed environment gets
// the database declared for it in wrangler.jsonc, never anything else.
//
// Schema is created once via wrangler (see schema.sql and scripts/migrate.mjs),
// not on every connect like the old SQLite version did.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export function getDb() {
  const { env } = getCloudflareContext();
  if (!env || !env.DB) {
    throw new Error(
      'D1 binding "DB" not found. Declare it under d1_databases in wrangler.jsonc ' +
      'for the environment being served (see docs/BUILD_STATE.md).'
    );
  }
  return env.DB;
}

// Linear pipeline only. Channel/source labels (Instagram, Facebook, …) moved
// to the `source` field — a source is where a lead came from, not a pipeline
// position. Reply status lives in the `replied` field, not a "Replied" stage.
// Removed stages (all empty except Instagram, which migrates to source='Instagram'):
// Instagram, Facebook, LinkedIn, Contact Form, Rekindled, Replied, Potential,
// Nudge, Re-warm, Booked, Payment Awaiting, Lost.
export const STAGES = [
  'New',
  // Fresh scan finds WITH an email but not yet vetted — the review queue.
  // A human (or the prescreen agent) rates each strong/skip; strong ones
  // move on to Validated.
  'Prescreen',
  // Prescreened strong + contact confirmed (has an email) — the
  // auto-prospect queue. Raw finds without an email stay at New.
  'Validated',
  // The social track. Warm-up first (you are visible to them but haven't
  // said anything yet), then the actual messages. Runs parallel to the
  // Email track below — a lead travels one or the other, not both.
  'Followed',
  'Engaged',
  'Connected',
  'Story Reply',
  'DM 1',
  'DM 2',
  'DM 3',
  'Voice Note',
  'Email 1',
  'Email 2',
  'Email 3',
  'Email 4',
  'Email 5',
  'Snoozed',
  // A snoozed/cold lead you reached back out to. Picking it stamps today as
  // last contact and bumps the touch count (AUTO_EMAIL_STAGES).
  'Rekindled',
  'Interested',
  // Proposal is out, decision pending — sits between Interested and Client.
  // Adopted from Ellen's tracker; pairs with the proposal_sent column.
  'Proposal Sent',
  'Setup Check',
  'Client',
  'Finished',
  // They answered a specific offer with no, and said nothing about us.
  //
  // Split out of 'Rejected', which carried both meanings and was terminal for
  // both. Somebody who prefers their contact page the way it is has not
  // rejected Bloomwired, and filing her beside the people who asked to be
  // removed was the app saying something untrue about a person.
  //
  // Nothing automated goes to this stage either: it is out of every selection
  // and sweep below. The difference is that the door is shut rather than
  // bolted, and only a person can open it.
  'Not This Offer',
  'Rejected',
  // Went dark / gave up — distinct from Rejected (they said no).
  'Lost',
  'Invalid Email',
];

// Where a lead came from. Distinct from pipeline stage. null = unset.
export const SOURCES = [
  'Cold email',
  'Personal email',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Contact Form',
  'Referral',
];

// A reply's disposition, independent of stage. null = no reply.
export const REPLY_TYPES = ['interested', 'defer', 'decline'];

// Trimmed to the three actually in use. 💚 Strong · 💙 Client/won · ✖️ Skip.
// 🥀 = dead website — the lead may be fine, the site is not.
// 📭 = looked for an email and there wasn't one. It drops them out of the queue
// the way a skip does, but records WHY they are out: nothing was wrong with the
// prospect, there was just no way to reach them.
export const RATINGS = ['💚', '💙', '✖️', '🥀', '📭'];

// Countries you send to. Stored in the DB as the short code (e.g. 'AU').
// The flag + representative IANA timezone live in the UI layer
// (COUNTRY_META in ProspectsApp) and are echoed on window.bloom so the
// follow-up automation can time sends per prospect (e.g. AU midnight).
export const COUNTRIES = ['US', 'CA', 'AU', 'NZ', 'UK'];
