# N2E local verification and independent-audit handoff

Runtime: `1754750705af9175825a4467af5c1673b748c197`, based on `f989428ccc6150befb457860b21c468b2ba656ab`. Later changes concern this evidence, status/index, and three additional browser assertions only. The canonical contract remains [N2E in N2](../../phases/N2.md#n2e-bounded-contract--useful-in-app-notifications). This is an implementation handoff, not independent approval or phase closure.

Worktree `/home/ary/Developer/bloomops-n2-notifications`, branch `feat/n2-in-app-notifications`. Sole-writer ownership was explicitly handed over. Before editing, recovery patches and allowed untracked source copies were saved at `/tmp/bloomops-n2e-recovery-ZQVBRH`. The existing `.task-tmp/` state was preserved and excluded from commits/exports. No other worktree was modified; the original D2 checkout remains on `74cc2efd2420c76053cab145de792eb54dd83a1c` with its unrelated changes. Authenticated fetches still find main at the recorded base; migration0046 does not collide with main's history through0045.

## Retained and corrected

Retained the prepared record/Page/Action producers, relational storage, current-access inbox queries, internal/Client inbox, preferences, thread mute and read controls. Preserved prior nonremoved record participants and prior Page participants; no new nested reply model or Page mention editor.

Corrected preference precedence (an enabled reply survives disabled mentions), recipient user binding when a membership is reassigned, source-success proof for nonthrowing zero-row task updates, cascading deletion cleanup, an AUTOINCREMENT cutoff that survives deletion, settings response races, initial mute-settings retry, and malformed query validation. Migration0046 was regenerated from main snapshots; no applied migration was rewritten. Manual Actions use their original writers, not a new assignment system. New recipient rows copy no title/body data.

## Acceptance matrix

| Status | Acceptance | Evidence |
| --- | --- | --- |
| PASS | Validated mentions, all four record types, prior participants, overlap/no self/retry dedup, quiet edits |22 notification tests;273 combined regressions |
| PASS | Page replies, inherited permissions, explicit deny, same Page/thread validation, mutes |Page regressions; native D1; browser Page open/mute/revocation |
| PASS | Task create/new assignee, no-op, concurrent retry, reassignment back, removed assignee hidden |Node/native writer tests; real create/PATCH/open browser routes |
| PASS | Source-write failure, rollback, conflicting and zero-row UPDATE, uniqueness and foreign keys |29 native D1 checks; ignored-UPDATE regression originally failed, now passes |
| PASS | Current workspace/member/user/role/contact/parent authority; deletion, preview and recipient isolation |Notification/access regressions; Client/Page/task stale links deny in built Worker |
| PASS | Preferences/mutes apply to future candidates; read/unread/cutoff isolated across users/workspaces |Node/native tests and real preferences/mute/read browser flows |
| PASS | Inaccessible candidates filtered before paging/counting; bounded response/query count |Mixed visible/hidden22+22 fixture; native120-extra-member/45-extra-message fixture;20-row response,3 statements/batch, max80 binds |
| PASS | Empty→current and populated main→N2E migrations; no backfill; second application no-op |Native compares unchanged project/Action/record/Page fixtures; zero verifier preserves schema and both ledgers |
| PASS | Desktop1440/tablet1024/768/phone390/320, keyboard/touch, loading/empty/error/retry |39 built-Worker/browser assertions, zero page runtime errors; five captures inspected |
| PASS | Matching Home/Clients/Work local regression and build |Numeric comparison below; confirmed build process exit0 |
| FAIL (baseline) | Full `npm test` |7193 pass /7198 total; five unchanged baseline failures below |
| NOT RUN | Independent audit, remote CI, staging/live acceptance, merge/deploy |Explicit stop line; no push or remote mutation |

### Commands and environment

Linux x86_64, Node22.23.2, npm10.9.8, Wrangler4.129.0, Next15.5.25, OpenNext Cloudflare1.20.6, Playwright1.58.2, Chromium145.0.7632.6. Verification occurred September14–15,2026 (America/Los_Angeles / UTC). Raw logs and numeric results are in the exported review packet with completion timestamps and hashes.

```sh
node --test tests/bloomops-notifications.test.mjs
# 22/22
node --test tests/bloomops-notifications.test.mjs tests/bloomops-record-discussions.test.mjs tests/bloomops-page-comments.test.mjs tests/bloomops-page-sharing.test.mjs tests/bloomops-actions-access.test.mjs tests/bloomops-actions-domain.test.mjs tests/bloomops-actions-http.test.mjs tests/bloomops-actions-schema.test.mjs tests/bloomops-actions-dependencies.test.mjs
# 273/273
node scripts/notifications-native-local.mjs
# 29/29; real disposable D1, fresh + upgrade + constraints + mutation consistency
PATH=/tmp/bloomops-n2e-verification/bin:$PATH npm test
# 7193/7198; external python -> /usr/bin/python3 wrapper for inherited fixtures
WORKERS_CI_COMMIT_SHA=1754750705af9175825a4467af5c1673b748c197 npm run cf:build
# exit0; no source/config/dependency workarounds
node .github/scripts/verify-zero-remote.mjs --local
# exit0; inspected local-only branch, disposable D1, both passes
git diff --check
# pass
```

The direct command runner initially reported signal143 after both builds logged completion. Repeating the identical npm command with Python `subprocess.run(..., start_new_session=True)` confirms both candidate and base exit0; the exported `build-exit.json` records that result. No failed command was hidden by a trailing `tail` command.

Browser command (the harness itself starts/disposes in-memory local D1/R2 and the actual built Worker, blocks external browser requests, and never persists authentication state):

```sh
LD_LIBRARY_PATH=/tmp/bloomops-n2e-browser-tools/libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/tmp/bloomops-n2e-browser-tools/browsers \
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 \
node scripts/notifications-browser-local.mjs
```

Playwright was installed outside the repository with `npm install --prefix /tmp/bloomops-n2e-browser-tools --no-audit --no-fund playwright@1.58.2`. Chromium and missing libnspr4/libnss3/libasound2t64 were downloaded/extracted into that temporary tools directory; no project lockfile or system package configuration changed. The first, unsuccessful default-cache browser install removed two unreferenced shared Playwright browser cache entries; subsequent installation and execution used the isolated path above. No source worktree files were affected.

### Baseline failures

All seven original full-suite failures reproduced in a clean `git archive` of main with:

```sh
node --test tests/bloomops-projects-ui.test.mjs tests/bloomops-schema.test.mjs tests/bloomops-shell.test.mjs tests/followup-schedule.test.mjs
# baseline:71/78
```

The two schema table/migration inventory assertions were updated for actual N2D/N2E additions (85 tables,47 migrations). The remaining five were preserved: portal account-heading expectation (`James · Projects` versus current `Projects for James`); schema assertion requiring a direct workspace FK on existing `record_discussion_mentions` (its tenant FKs are composite through parents); shell test matching “Prospect” in an existing avatar CSS class; two inherited date-sensitive P1/P2 follow-up schedule assertions. No production behavior or unrelated tests were weakened to make this suite green.

### Matching performance

Main was exported to `/tmp/bloomops-n2e-base-f989428` and built with the same installed dependency versions (independent copy; an initial symlink build could not run correctly and was replaced). The same synthetic fixture, in-memory native D1, browser version, viewport and no injected latency were used sequentially after other checks finished. For baseline, use the browser command above with `BLOOMOPS_N2E_SOURCE=/tmp/bloomops-n2e-base-f989428 BLOOMOPS_BROWSER_EVIDENCE_DIR=/tmp/bloomops-n2e-verification/base-browser` and `--performance-only`.

Seven rounds, first two warmups discarded. Existing `navigation-content.mjs` defines completed destination sections plus two animation frames; driver overhead is included. Desktop1440×1000 SPA medians:

| Route | Base→N2E visible ms | Base→N2E server ms | Statements / invocations |
| --- | --- | --- | --- |
| Home |62.4→62.8 |18→18 |11 /2 unchanged |
| Clients |62.4→62.4 |9→11 |3 /2 unchanged |
| Work |62.4→62.2 |12→13 |7 /2 unchanged |

Document-navigation measurements at1440/390 are also exported; their browser elapsed time includes Playwright's network-idle wait and is not an interactive latency target. Home/Clients/Work first-load JS estimates remain103/103/108kB; inbox routes109kB. No unrelated shell notification fetches were added. This small local sample shows no route-query regression; it does not prove a live latency target. **LIVE PERFORMANCE NOT VERIFIED.** The existing performance integration closed the earlier phase with remaining target work deferred; this packet does not reopen it.

## Visuals

[Desktop1440](inbox-1440.png), [tablet1024](inbox-1024.png), [tablet768](inbox-768.png), [phone390](inbox-390.png), [phone320](inbox-320.png). Synthetic local fixtures only. [Browser assertions](browser-results.json), [raw baseline](performance-base.json), [raw candidate](performance-candidate.json), [comparison](performance-comparison.json).

## Stop line

Next is an independent Sol High audit of the complete base-to-head packet. No independent audit, push, PR, merge, deployment, production/DNS/shared-data action, outreach, N3/N4, prospecting or external notification transport occurred. Full milestone acceptance remains pending audit and any separately authorized external gates.
