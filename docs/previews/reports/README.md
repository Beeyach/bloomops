# N3A private report drafts — implementation evidence

Task-selected scope and frozen v1 catalogues: [N3/N3A](../../phases/N3.md).
This records implementation verification, not independent acceptance or an N3 release.

## Revisions and storage

Base: `2c0e649303f5c9a28a09e9c442f9478fefd07258`.
Completed locally tested source: `62fb5355603359678e2a60cf71fcd1169ed26fa7`.
Later handoff edits are documentation only; the review packet exports the exact delta.
Additive generated migration: `0047_gigantic_famine.sql` (48 domain migrations).
`client_report_drafts` and `client_report_metrics` use real Client/Service composite
keys, fixed template identity, current permission checks and atomic revision-guarded
D1 batches. No shared database is touched. No prospect report storage is reused.

## Local results, 15 September 2026

| Check | Result |
| --- | --- |
| `node --test tests/bloomops-client-reports*.test.mjs` | 23/23, exit 0 |
| `node scripts/client-reports-native-local.mjs` | 16 checks, exit 0; populated base upgrade and fresh schema, rollback, zero-row updates, concurrent saves, FK checks |
| `npm test` | 7258/7258, exit 0; no failures, skips or waivers |
| `npm run cf:build` | exit 0, completed 16:15:37Z before final browser start |
| `node scripts/client-reports-browser-local.mjs` | 54 checks, exit 0; zero runtime errors |
| `node .github/scripts/verify-zero-remote.mjs --local` | PASS on identical migration inputs; empty-to-current and idempotent second run |
| `node scripts/notifications-native-local.mjs` | 29 retained checks pass; now upgrades its exact N2E fixture before advancing to current schema |
| Shell/schema focused regressions | 36/36, exit 0 |
| `actionlint .github/workflows/pr-validation.yml`; `git diff --check` | exit 0 |

Commands ran through `.github/scripts/pr-validation.py run <evidence-prefix> <command>`
where available, preserving raw command exit codes and sanitized logs/receipts.
Runtime: Linux, Node22.23.2, npm10.9.8, Next15.5.25, OpenNext Cloudflare1.20.6,
Playwright1.58.2. Full suite used `TZ=UTC` and an isolated PATH alias from `python`
to `/usr/bin/python3`, following AI_WORKING_AGREEMENTS. No global configuration change.
The temporary directory was isolated outside the shared `/tmp` after a diagnostic
browser crash with `/tmp` at99%; no shared browser cache was modified.

## Build and browser attribution

Build source was committed and tracked-clean. `WORKERS_CI_COMMIT_SHA` and
`WORKERS_CI_BRANCH` stamped the completed artifact. Then:

```sh
node scripts/notification-build-evidence.mjs /absolute/evidence/final-build-identity.json
BLOOMOPS_BUILD_IDENTITY=/absolute/evidence/final-build-identity.json \
BLOOMOPS_BROWSER_EVIDENCE_DIR=/absolute/evidence/final-browser \
BLOOMOPS_PLAYWRIGHT_PACKAGE=/absolute/tools/package.json \
node scripts/client-reports-browser-local.mjs
```

Local installed browser tooling also used its `PLAYWRIGHT_BROWSERS_PATH` and
`LD_LIBRARY_PATH`; `TMPDIR` pointed to this task's isolated temporary directory.
The fresh local Worker served `/api/version.sha=62fb535`, port46139, controller
PID143278. Its generated bundle, process tree, complete Worker/client artifact
hashes and seven fetched JavaScript hashes are recorded. Artifacts remained unchanged;
no build ran during the browser checks. These identifiers describe the completed
local run, not a persistent server. Fixtures and temporary Worker were disposed.

The browser bootstraps isolated Owner/Admin and another-workspace Owner, authenticates
separate genuine captured-mail sessions, and creates Clients/purchased Services
through existing API writers. Both catalogue forms save, reopen, edit and preview
persisted values. It verifies 3.13% half-up rounding, missing/zero values, script-like
text rendered safely, conflict preservation/reopen, failed-save retry, direct IDs,
origin/workspace boundaries and actual membership suspension/restoration. Screenshots
cover both editors/previews at1440,1024,768,390,320; keyboard save and reduced motion
are exercised. Portal rejection and assigned-Team read-only/revocation use real
session HTTP tests; no portal associations were created.

## Corrections and limits

The required selective Sol High internal review found two P2s: valid multilingual
input exceeded the original32KiB envelope, and catalogue prose omitted frozen
interpretation cautions. Both were corrected (64KiB cap, maximum-text HTTP regression,
verbatim catalogue and invariant regression). Its one focused re-review found no
material residuals. This is not the owner-requested independent-audit handoff verdict.

Initial verification failures are preserved in the packet: missing local `python`
alias, the Reports layout missing its direct shell guard, browser fixture timezone/
ambiguous label selectors, and one temporary-filesystem browser crash. Final checks
above supersede these exploratory attempts; no test protection was removed.

PR validation now explicitly runs report Node/native/browser checks alongside the
existing notification/access/full-suite checks. It remains read-only-token,
draft-compatible, non-deploying, using disposable local resources. Remote receipts,
exact candidate identity and completed results are recorded in the PR and external
review packet after execution, rather than assumed from these local results.

No merge, deployment, live performance acceptance or publication occurred. Issue80
remains a future portal setup dependency; it does not block private internal drafts.
CSV, charts/comparisons, publication snapshots/revisions/withdrawal, portal delivery,
PDF and providers remain outside N3A. PERF3 remains separate and unclosed.
