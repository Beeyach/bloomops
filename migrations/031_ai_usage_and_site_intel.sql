-- Two things the app has never had: what its AI actually costs, and a place to
-- keep what it already learned about a prospect's site.

-- ── 1. One row per model call ─────────────────────────────────────────────
-- Every credit price in lib/credits.mjs was set from an estimate written in a
-- comment ("work out what it costs, multiply by a thousand") that has never
-- once been checked against a real invoice. callAI read the usage block off
-- every Anthropic response and threw it away, so nothing in the app knew what
-- a single run cost, whether the prompt cache ever hit, or which task was
-- being sold at a loss. This is that missing row.
--
-- cost_usd is stored as a REAL rather than derived on read: model prices
-- change, and a ledger that silently reprices history is not a ledger.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  task TEXT NOT NULL,            -- 'score', 'best5', 'voice-note', …
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,      -- billed at 0.1x input
  cache_write_tokens INTEGER DEFAULT 0,     -- billed at 1.25x input
  cost_usd REAL DEFAULT 0,
  credits_charged INTEGER DEFAULT 0,
  ok INTEGER DEFAULT 1,          -- 0 when the call failed and was refunded
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_date ON ai_usage(workspace, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_task ON ai_usage(task);

-- ── 2. What the probe found, kept ─────────────────────────────────────────
-- services/audit-render runs a full headless browser over a prospect's site:
-- it visits subpages, checks the contact form, follows dead links, measures
-- load time, reads the platform, and returns facts, checks, pages and keyed
-- findings. The app stored three columns of that (video_tier, video_score,
-- video_reasons) and dropped the rest on the floor.
--
-- Two costs came out of that. Nothing knew WHEN a site was last looked at, so
-- the only safe assumption was "never", and re-running a 20-credit precheck on
-- a site checked an hour ago was indistinguishable from checking a new one.
-- And every bee that wanted to know something about the site had to be told
-- again in its prompt, from audit_notes free text, instead of reading a fact.
--
-- site_intel is that record. It is deliberately a JSON blob plus the few
-- fields worth indexing: the shape of what the probe returns is the render
-- service's business, and pinning it into columns here would mean a migration
-- every time a check is added.
ALTER TABLE prospects ADD COLUMN site_intel TEXT;

-- When the probe last ran, as an ISO timestamp. The whole point: a fact with
-- no date is not evidence, it is a rumour.
ALTER TABLE prospects ADD COLUMN site_intel_at TEXT;

-- Where it came from, so a finding can be traced. 'precheck' | 'render'.
ALTER TABLE prospects ADD COLUMN site_intel_source TEXT;
