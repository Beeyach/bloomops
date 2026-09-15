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
## Completed local verification

Tested source: `d4e16707ab8d9ebe26dbe198ad56b9aac8071ff1`, tracked-clean before
the build. Reporting tests passed 29/29, native D1 passed 20 named checks, and
`npm test` passed 7264/7264 with no failures, skips or cancellations. Each command
exited 0. The full suite used Node22.23.2, npm10.9.8, TZ=UTC and the existing
isolated Python3 PATH alias. The build exited 0 at 2026-09-15T18:46:54Z.

The reporting browser then passed all 54 checks with zero runtime errors, exit 0.
Its fresh local Worker served version `d4e1670` on port35633, controller PID167152.
The receipt records source/configuration/artifact hashes, process identity and
served JavaScript hashes; artifacts remained unchanged through the browser run.
No rebuild ran during browser verification. Disposable fixtures were removed by
the existing harness. No shared browser cache or database was changed.

The required selective Sol High internal review found no material findings. It
inspected the focused diff and supplied stateful-test evidence, without rerunning
those tests. This does not substitute for the requested external focused re-review.

The exact tested-source-to-final delta contains documentation/evidence only; the
addendum exports it. Remote completion is recorded separately in retrieved run
receipts and PR evidence after the normal push-triggered validation. Original
migration and unrelated local browser evidence is retained for unchanged inputs;
the PR workflow reruns its configured checks. No merge, deployment or independent
acceptance is claimed.
