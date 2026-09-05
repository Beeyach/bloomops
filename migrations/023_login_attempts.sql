-- Failed access-code attempts, per address, so the gate cannot be guessed at
-- indefinitely.
--
-- An access code IS the account here: there is no second factor and no
-- username to also get right, so an unlimited number of guesses is the whole
-- attack. Codes normalise to lowercase letters and digits, which makes a
-- patient script plausible where a password policy would not.
--
-- Only failures are recorded, and a success clears the row, so this table
-- stays near-empty in normal use and holds nothing about who logged in.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
