-- Strategy V2.
--
-- Five reconstructed forensic passes said the same three things: two emails
-- carry the business, the close is the largest verified effect in the database,
-- and money was being spent before anybody checked whether the prospect could
-- be written to at all. This migration is the state those decisions need.
--
-- Nothing here is backfilled. Legacy rows keep their unknowns, because
-- rewriting history to make it agree is what produced two withdrawn findings.

-- ── Contactability, as its own axis ──────────────────────────────────────
--
-- Kept separate from qualification on purpose. A prospect who bounces after
-- being verified, vetted, found Strong and approved has not become unqualified:
-- their address stopped working. Folding the two together would have rewound
-- real work every time an inbox filled up.
--
-- OK | NONE | NEEDS_CONTACT_RECOVERY
ALTER TABLE prospects ADD COLUMN contact_state TEXT;
ALTER TABLE prospects ADD COLUMN contact_state_at TEXT;
ALTER TABLE prospects ADD COLUMN contact_state_reason TEXT;

-- ── Verification eligibility, and the budget queue ───────────────────────
--
-- Eligibility is a semantic question: is this prospect allowed and appropriate
-- to verify. Budget is a separate execution gate, and this separation is the
-- whole point of the column. An earlier draft folded the two together, which
-- would have permanently parked good prospects on the days the allowance ran
-- out, with no way to tell them apart from prospects that were genuinely
-- refused.
--
-- ELIGIBLE | NOT_ELIGIBLE | WAITING_FOR_BUDGET | VERIFIED | REUSED
ALTER TABLE prospects ADD COLUMN verification_state TEXT;
ALTER TABLE prospects ADD COLUMN verification_reason TEXT;
ALTER TABLE prospects ADD COLUMN verification_state_at TEXT;

-- ── Priority band ────────────────────────────────────────────────────────
--
-- P1 | P2 | P3, and only ever assigned after the Strong gate. Before Strong a
-- rating is a rating, not a band. `band_was_provisional` records that the work
-- was done under the unrated default, so later analysis can tell a real P2 from
-- a prospect nobody had looked at yet.
ALTER TABLE prospects ADD COLUMN priority_band TEXT;
ALTER TABLE prospects ADD COLUMN band_was_provisional INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN band_at TEXT;

-- ── Acquisition provenance ───────────────────────────────────────────────
--
-- Distinct from `source_provider` (043), which records where the record
-- entered, and from evidence SOURCE, which records what a claim rests on.
-- "We found them on a map listing" and "the claim rests on a map listing" are
-- different facts and blurring them is how the coaching question became
-- unanswerable.
--
-- MAP_LISTING | SOCIAL_POST | DIRECTORY | MANUAL | REFERRAL | REACTIVATION
-- | OTHER | UNKNOWN (legacy only)
ALTER TABLE prospects ADD COLUMN origin_class TEXT;
ALTER TABLE prospects ADD COLUMN origin_subtype TEXT;
-- The import run. This is the field that separates "coaches convert badly"
-- from "one batch was bad", which report 5 could not do because they were the
-- same rows.
ALTER TABLE prospects ADD COLUMN origin_batch TEXT;
ALTER TABLE prospects ADD COLUMN origin_query TEXT;
ALTER TABLE prospects ADD COLUMN origin_at TEXT;

CREATE INDEX IF NOT EXISTS idx_prospect_origin ON prospects(workspace, origin_class, origin_batch);
CREATE INDEX IF NOT EXISTS idx_prospect_contact_state ON prospects(workspace, contact_state);
CREATE INDEX IF NOT EXISTS idx_prospect_verification ON prospects(workspace, verification_state);

-- ── Structured deferrals ─────────────────────────────────────────────────
--
-- `next_action_date` stays the operational date the outbound guard reads, and
-- nothing here changes that. These record what was actually agreed, so a
-- reactivation three weeks later is not a cold restart written from a blank
-- record. Their words, not a paraphrase.
ALTER TABLE prospects ADD COLUMN deferred_until TEXT;
ALTER TABLE prospects ADD COLUMN deferral_reason TEXT;
ALTER TABLE prospects ADD COLUMN deferral_promise TEXT;
ALTER TABLE prospects ADD COLUMN deferral_context TEXT;
ALTER TABLE prospects ADD COLUMN deferral_source TEXT;

-- ── The package ──────────────────────────────────────────────────────────

-- MICRO_OFFER | OPEN_QUESTION | OTHER. Classified semantically: a concrete
-- yes/no offer is usually a question, and a validator that rejected question
-- marks would have rejected the best-performing close in the database.
ALTER TABLE outreach_packages ADD COLUMN cta_class TEXT;
-- What was actually offered, recorded at send time so fulfilling it later is a
-- lookup rather than a guess.
ALTER TABLE outreach_packages ADD COLUMN promise_made TEXT;
-- The app's answer, copied onto the package so a sender cannot exceed it by
-- reading a stale policy.
ALTER TABLE outreach_packages ADD COLUMN allowed_length INTEGER;
-- The exact prepared copy of every permitted follow-up, as JSON.
--
-- This exists so that one approval can authorise a whole sequence honestly.
-- A follow-up may only send automatically if its exact words were here when
-- Ary approved, and the fingerprint covers them. Copy generated afterwards is
-- copy she never read.
ALTER TABLE outreach_packages ADD COLUMN followups TEXT;
-- native | skill. Both modes are first-class and validated identically; this
-- exists to measure them, not to privilege either.
ALTER TABLE outreach_packages ADD COLUMN prepared_by TEXT DEFAULT 'native';
ALTER TABLE outreach_packages ADD COLUMN priority_band TEXT;
ALTER TABLE outreach_packages ADD COLUMN band_was_provisional INTEGER DEFAULT 0;
ALTER TABLE outreach_packages ADD COLUMN rating_at_prepare TEXT;

-- ── The measurement row ──────────────────────────────────────────────────
--
-- Report 5 could answer the sequence question only after reconstructing 4,592
-- messages out of a mailbox, because the database had counters instead of
-- facts. These columns are so the next question costs a query.
ALTER TABLE send_events ADD COLUMN cta_class TEXT;
ALTER TABLE send_events ADD COLUMN promise_made TEXT;
ALTER TABLE send_events ADD COLUMN allowed_length INTEGER;
ALTER TABLE send_events ADD COLUMN interval_days INTEGER;
ALTER TABLE send_events ADD COLUMN asset TEXT;
-- human-approved | auto-followup
ALTER TABLE send_events ADD COLUMN sent_by TEXT;
ALTER TABLE send_events ADD COLUMN prepared_by TEXT;
ALTER TABLE send_events ADD COLUMN priority_band TEXT;
ALTER TABLE send_events ADD COLUMN band_was_provisional INTEGER;
ALTER TABLE send_events ADD COLUMN rating_at_send TEXT;
-- pre-existing | approval | none. Which tells later analysis whether the rating
-- governed the work or merely followed it.
ALTER TABLE send_events ADD COLUMN rating_source TEXT;
ALTER TABLE send_events ADD COLUMN evidence_type TEXT;
ALTER TABLE send_events ADD COLUMN evidence_sufficiency TEXT;
ALTER TABLE send_events ADD COLUMN evidence_age_days INTEGER;
ALTER TABLE send_events ADD COLUMN verification_state TEXT;
ALTER TABLE send_events ADD COLUMN vet_state TEXT;
ALTER TABLE send_events ADD COLUMN vet_version TEXT;
ALTER TABLE send_events ADD COLUMN qualification_snapshot_version INTEGER;
ALTER TABLE send_events ADD COLUMN origin_class TEXT;
ALTER TABLE send_events ADD COLUMN origin_subtype TEXT;
ALTER TABLE send_events ADD COLUMN origin_batch TEXT;
ALTER TABLE send_events ADD COLUMN region_scope TEXT;
ALTER TABLE send_events ADD COLUMN send_window TEXT;
ALTER TABLE send_events ADD COLUMN approval_fingerprint TEXT;
ALTER TABLE send_events ADD COLUMN cost_usd REAL;

CREATE INDEX IF NOT EXISTS idx_send_cta ON send_events(workspace, cta_class, sequence_step);
CREATE INDEX IF NOT EXISTS idx_send_band ON send_events(workspace, priority_band);

-- Did they take the offer. A leading diagnostic, never the objective: a system
-- optimised for "yes, send it" produces more of those and fewer clients, so
-- this is always read next to what share of them became a real conversation.
ALTER TABLE prospects ADD COLUMN offer_accepted_at TEXT;
ALTER TABLE prospects ADD COLUMN offer_accepted_step INTEGER;

-- ── Stage B shadow log ───────────────────────────────────────────────────
--
-- Automatic follow-up sending ships off. Before it can be turned on, the guard
-- has to be watched deciding, with the exact reason recorded, because an
-- unexpected block is a bug to fix rather than a rule to relax.
CREATE TABLE IF NOT EXISTS send_shadow_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,
  package_id INTEGER,
  package_version INTEGER,
  sequence_step INTEGER,
  -- WOULD_SEND | WOULD_BLOCK
  decision TEXT NOT NULL,
  -- The named block from lib/send-guard.mjs, so a pattern is countable rather
  -- than a paragraph to read.
  block TEXT,
  reason TEXT,
  fingerprint_ok INTEGER,
  evaluated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shadow_ws ON send_shadow_log(workspace, evaluated_at);
CREATE INDEX IF NOT EXISTS idx_shadow_block ON send_shadow_log(workspace, decision, block);
