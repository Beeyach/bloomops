-- Bloomtrack · D1 schema
-- One-time setup for the production database.
-- Run with: npx wrangler d1 execute bloomtrack --file=schema.sql --remote

-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Add country column (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN country TEXT;" --remote
--
-- Migration: Add email sequence storage (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN email_sequence TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN audit_notes TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN pdf_filename TEXT;" --remote
--
-- Migration: Add info column (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN info TEXT;" --remote
--
-- Migration: Add review_url column (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN review_url TEXT;" --remote
--
-- Migration: Reply tracking, next action, and source (run once on existing DBs)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN replied INTEGER DEFAULT 0;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN reply_date TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN reply_type TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN next_action_date TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN source TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN replied_at_email INTEGER;" --remote
--
-- Data migration: Instagram was a stage; make it a source and reset the stage.
-- npx wrangler d1 execute bloomtrack --command="UPDATE prospects SET source='Instagram', stage='New' WHERE stage='Instagram';" --remote
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  business_name TEXT,
  email TEXT,
  domain TEXT,
  rating TEXT,
  stage TEXT,
  emails_sent INTEGER DEFAULT 0,
  last_contact_date TEXT,
  claude_chat_link TEXT,
  gmail_labels TEXT,
  is_read INTEGER DEFAULT 0,
  country TEXT,
  -- JSON string: [{"number":1,"subject":"...","body":"..."}, ...] up to 5 entries.
  -- D1 has no native JSON type, so this is stored/read as TEXT and parsed in JS.
  email_sequence TEXT,
  -- Plain text audit summary / rating from the website review.
  audit_notes TEXT,
  -- Filename only (not a path) of the Email 5 PDF in ./prospect-pdfs/
  pdf_filename TEXT,
  -- Freeform notes from the website audit: niche, location, services, findings.
  -- Plain text (not JSON); line breaks preserved.
  info TEXT,
  -- Public URL of the review PDF served from R2, e.g.
  -- https://gobloomwired.com/review/renee-zaia
  review_url TEXT,
  -- Reply tracking. A reply is an attribute of the lead, independent of stage.
  replied INTEGER DEFAULT 0,        -- 0/1
  reply_date TEXT,                  -- ISO date the reply landed
  reply_type TEXT,                  -- 'interested' | 'defer' | 'decline' | null
  replied_at_email INTEGER,         -- email number last sent when they replied (1-5)
  -- Intended recontact / next-touch date. When set, drives "due" instead of
  -- the stage-based window.
  next_action_date TEXT,
  -- Where the lead came from (Cold email / Instagram / Referral / …).
  source TEXT,
  -- Cold-email / DM outreach tracker columns (see migration 006).
  -- niche: free text segment. call_booked/proposal_sent: NULL undecided, 1 Yes, 0 No.
  niche TEXT,
  call_booked INTEGER,
  proposal_sent INTEGER,
  -- Audit video (migration 020). video_url mirrors review_url: a branded link
  -- to an asset in R2, here the narrated walkthrough at
  -- https://file.gobloomwired.com/video/{slug}. tier and score come from the
  -- triage pass that decides whether rendering one is worth the credits:
  -- SEND, MAYBE, SKIP, or BLOCKED when the site refused to load for us.
  video_url TEXT,
  video_tier TEXT,
  video_score INTEGER,
  -- video_reasons: JSON array of what the scan found worth recording, the
  -- worklist's "why". video_sent_at: date the video email variant went out,
  -- stamped by the sweep so a video is never sent twice (migration 021).
  video_reasons TEXT,
  video_sent_at TEXT,
  -- The two emails built fresh by the sweep instead of stored in the sequence:
  -- the standalone video email and the playbook reactivation email. Each holds
  -- { subject, body, sent_at } so what went out is on the record (migration 022).
  video_sent_email TEXT,
  playbook_sent_email TEXT,
  -- Per-prospect activity log: JSON array of { ts, tag, text } appended by
  -- window.bloom.addLog (migration 028). The legacy info-field markers keep
  -- working alongside it; the drawer renders both into one timeline.
  activity_log TEXT,
  workspace TEXT NOT NULL DEFAULT 'ary',
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospects_deleted ON prospects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
-- Matches the list query's exact filter (workspace = ? AND deleted_at IS
-- NULL) so loads stop walking rows they won't return (migration 029).
CREATE INDEX IF NOT EXISTS idx_prospects_ws_deleted ON prospects(workspace, deleted_at);
CREATE INDEX IF NOT EXISTS idx_prospects_ws ON prospects(workspace);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_last_contact ON prospects(last_contact_date);

-- ─────────────────────────────────────────────────────────────────────────
-- Lead Engine Phase A (2026-07-16)
-- Migration for existing databases (schema.sql is idempotent, so running the
-- whole file with --remote also works):
-- npx wrangler d1 execute bloomtrack-pro --file=schema.sql --remote
-- ─────────────────────────────────────────────────────────────────────────

-- Candidate leads found on social platforms. Triage happens here; only
-- qualified leads get promoted into `prospects`.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT,              -- 'Facebook' | 'Threads' | 'Instagram' | 'LinkedIn' | 'Upwork' | 'Reddit' | 'X' | 'Other'
  post_url TEXT,
  post_text TEXT,             -- the pasted post/comment, verbatim
  author_name TEXT,
  author_handle TEXT,         -- profile URL or @handle
  verdict TEXT,               -- 'green' | 'red' | NULL (= unscored)
  verdict_reasons TEXT,       -- JSON array of strings: which rules fired
  notes TEXT,                 -- free text; scoring appends suggested_first_line here
  status TEXT DEFAULT 'new',  -- 'new' | 'qualified' | 'skipped' | 'promoted'
  promoted_prospect_id INTEGER,
  avatar_url TEXT,            -- page/author picture from scans; may expire

  workspace TEXT NOT NULL DEFAULT 'ary',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_ws ON leads(workspace);
-- The list query's real shape (workspace + created_at sort) and the
-- un-promote lookup (migration 030).
CREATE INDEX IF NOT EXISTS idx_leads_ws_created ON leads(workspace, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_promoted ON leads(promoted_prospect_id);

-- Single-row-per-key JSON settings store. Key 'engine' holds the lead-engine
-- profile: {offer, audience, greenRules, redRules, platforms}.
CREATE TABLE IF NOT EXISTS settings (
  workspace TEXT NOT NULL DEFAULT 'ary',
  key TEXT NOT NULL,
  value TEXT,                 -- JSON blob, parsed in JS
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workspace, key)
);

-- Clients + onboarding checklists (spec §3b). Checklist is a JSON column:
-- [{id, label, done, doneDate}] — never queried per-step.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  prospect_id INTEGER,
  name TEXT NOT NULL,
  handle TEXT DEFAULT '',
  platforms TEXT DEFAULT '[]',
  monthly_rate TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  onboarding TEXT DEFAULT '[]',
  workspace TEXT NOT NULL DEFAULT 'ary',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_prospect ON clients(prospect_id);
CREATE INDEX IF NOT EXISTS idx_clients_ws ON clients(workspace);
-- Workspace library (spec §3c + amendment A5). Groups of copyable, editable
-- text blocks: DM scripts, SOPs, templates. Items are a JSON column:
-- [{id, title, body}] — never queried per-item.
CREATE TABLE IF NOT EXISTS library_groups (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  items TEXT DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'workspace',
  workspace TEXT NOT NULL DEFAULT 'ary'
);
CREATE INDEX IF NOT EXISTS idx_library_ws ON library_groups(workspace);
CREATE INDEX IF NOT EXISTS idx_library_ws_category ON library_groups(workspace, category);
-- Notion-style custom pages: user-created sidebar entries with an emoji
-- icon and a freeform text body.
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT DEFAULT '📄',
  body TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  workspace TEXT NOT NULL DEFAULT 'ary',
  deleted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pages_ws ON pages(workspace);
CREATE INDEX IF NOT EXISTS idx_pages_ws_deleted ON pages(workspace, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pages_deleted ON pages(deleted_at);

-- Daily outreach log, adopted from Ellen's spreadsheet. One row per
-- workspace per day: how many touches went out on each channel and how many
-- replies came back per channel. The Stats tab renders this and computes
-- totals/gap against the daily target (stored in the 'targets' settings key).
CREATE TABLE IF NOT EXISTS daily_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  date TEXT NOT NULL,             -- YYYY-MM-DD
  pe_sent INTEGER DEFAULT 0,      -- Personal email
  li_sent INTEGER DEFAULT 0,      -- LinkedIn
  ig_sent INTEGER DEFAULT 0,      -- Instagram
  ce_sent INTEGER DEFAULT 0,      -- Cold email
  pe_replies INTEGER DEFAULT 0,
  li_replies INTEGER DEFAULT 0,
  ig_replies INTEGER DEFAULT 0,
  ce_replies INTEGER DEFAULT 0,
  misc_replies INTEGER DEFAULT 0, -- replies not attributed to a channel
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(workspace, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_log_ws_date ON daily_log(workspace, date);
-- In-app Facebook ad scans (Apify runs the scrape server-side on a shared
-- token; users never touch Apify). One row per scan; the weekly per-workspace
-- allowance is enforced by counting recent rows against the 'limits' settings
-- key (admin-set).
CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  type TEXT DEFAULT 'fb-ads',   -- 'fb-ads' | 'fb-posts' | 'maps'
  query TEXT,
  country TEXT,               -- country code (ads) or free-text location (maps)
  apify_run_id TEXT,
  status TEXT DEFAULT 'running',   -- running | done | failed
  items_found INTEGER,
  leads_added INTEGER,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scan_runs_ws ON scan_runs(workspace, created_at);

-- Daily counter behind the /api/ai spend cap (migration 030).
CREATE TABLE IF NOT EXISTS ai_calls (
  workspace TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace, day)
);
-- Maps scans became review-first: results wait in the scan row until the
-- user picks which to import (see /api/scan/import). The column is added by
-- migration 010 on existing DBs; ALTER has no IF NOT EXISTS in SQLite, so a
-- raw ALTER here broke this file's "run the whole thing, idempotent"
-- promise. Fresh databases get it from the CREATE TABLE above instead.
