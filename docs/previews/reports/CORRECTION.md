# N3A creation-intent ordering correction

The independent audit of `68340df1689d7e8f6f90030bff6d53f1855aee44`
found one P2: a same-UUID retry with equivalent normalized draft properties in a
different insertion order returned conflict. Original evidence remains in README.md.

The creation hash now serializes an explicit tuple: Client, Service engagement,
pinned template ID/version, title, period start/end, timezone, channel, account
label, scope label, commentary, and catalogue-ordered metric tuples. Each metric
tuple contains its stable key, state, value, source note and collection timestamp.
Only normalized scalars and arrays enter the hash. SHA-256, authorization, UUID
ownership, database uniqueness, updates, schema and migration inputs are unchanged.

The actual-writer regression failed 4/4 before the product correction and passes
4/4 afterward. Both templates cover reordered headers, metric maps and nested
metric properties, existing whitespace normalization, individual changed-intent
conflicts, distinct UUIDs and retries after a later edit. Native D1 runs the same
assertions plus a barrier that puts both writers at the real batch boundary before
either transaction commits; exactly one report and its metric rows persist.

Verification commands (receipts and exact revisions accompany the focused addendum):

```sh
node --test tests/bloomops-client-reports*.test.mjs
node scripts/client-reports-native-local.mjs
npm test
npm run cf:build
node scripts/notification-build-evidence.mjs /absolute/evidence/build-identity.json
node scripts/client-reports-browser-local.mjs
git diff --check
```

The browser uses the existing README environment variables and isolated installed
tooling, after a completed revision-stamped build. No unrelated browser suite is
manually repeated. The unchanged PR workflow runs its configured complete checks.
Full-suite/build/browser and remote completion remain pending until the addendum
records their actual results. No merge, deployment or independent acceptance is claimed.
