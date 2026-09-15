# N2E P2 correction — ready for focused re-review

Tested source: `83c4cf18611253bd90a6a1841d8143ed25ab0ed0`. Reviewed HEAD: `259bb5927320b3cd790970fe864d6263dd5108f1`. Recorded base: `f989428ccc6150befb457860b21c468b2ba656ab`. This report follows the initial independent audit; it is not a re-review verdict or release acceptance.

## Correction

`NotificationInbox.jsx` now separates inbox, settings and mutation request generations/loading state. Settings errors survive unrelated inbox reads. Closing preferences invalidates its request; unmount invalidates all requests. Authenticated scope changes remount the scoped component, and an observed server scope mismatch/access loss invalidates outstanding responses before clearing private state. Every asynchronous catch/finally checks that its request still owns its state. Existing scope guards remain. No producer, server authorization, persistence, migration, dependency, recipient rule or canonical contract changed.

The browser regression controls individual fetch promises after real synthetic-server settings responses arrive. It releases the inbox refresh first, then settings, and exercises focus, pageshow and the registered30-second interval callback without waiting30seconds. It proves usable preference saves, independent errors/retry, dismissal/reopen with overlapping responses, and real workspace/user switches while old settings responses are held.

## Before and after

A disposable `git archive` of reviewed259bb59 was built separately with confirmed exit0 and build stamp259bb59. The final committed regression harness fails there after confirming the focus refresh completed before the settings response was released: the Mentions checkbox never appears (exit1). Artifact/version evidence is exported.

On corrected source83c4cf1, the focused built-Worker browser run passes23/23 and the complete notification suite passes60/60, with zero page errors. The60 include the21 new checks plus the existing39. These are overlapping suites, not83 unique checks.

During test development, Chromium completed two identical routed GETs when only one response was released. Request-identity tracing established this test-control limitation. The final harness independently gates each fetch promise; the obsolete-response assertion was retained. Diagnostic failures are preserved separately and are not final verification results.

## Completed build and served artifact

The tracked tree was clean before `npm run cf:build` on83c4cf1. Build started2026-09-15T07:27:52.407518Z and completed with exit0 at07:30:04.846900Z. There was no rebuild during either final browser run.

The full browser run began after completion, at2026-09-15T07:31:30.493Z. It started its own in-memory D1/R2 Miniflare Worker at port35061, Node PID56060; child process identities and generated wrapper entrypoint/hash are exported. The existing navigation wrapper imports the completed `.open-next/worker.js`; Wrangler `deploy --dry-run` only bundles that local wrapper and never deploys. The harness disposes its Worker/browser after checking.

`/api/version` returned sha`83c4cf1`, builtAt`2026-09-15T07:27:59.232Z`, branch`feat/n2-in-app-notifications`. All generated `.open-next` files were hashed before startup and checked unchanged afterward. Manifest digest: `ee96c57328cb8348899f7fe36f2105a9ff68281a4a257a5b5484ad743688b7b5`. Nine served JavaScript assets were independently fetched and matched against those local hashes. Full/focused browser identity files record exact ports, processes, configuration, bundle hash, timestamps and served assets. Identity therefore rests on the served version plus completed artifact/process evidence, not Git HEAD alone.

Environment: Linux/WSL; Node22.23.2, npm10.9.8, Next15.5.25, OpenNext1.20.6, Wrangler4.129.0, React18.3.1, Playwright1.58.2, Chromium145.0.7632.6. Existing isolated browser tooling was reused; no shared Playwright cache was modified or pruned.

## Commands and outcomes

From `/home/ary/Developer/bloomops-n2-notifications`:

```sh
node --test tests/bloomops-notifications.test.mjs
# exit0,22/22 on83c4cf1
PATH=/tmp/bloomops-n2e-verification/bin:$PATH npm test
# exit1,7193/7198 on83c4cf1; inherited Python3 wrapper
WORKERS_CI_COMMIT_SHA=83c4cf18611253bd90a6a1841d8143ed25ab0ed0 WORKERS_CI_BRANCH=feat/n2-in-app-notifications npm run cf:build
# exit0
node scripts/notification-build-evidence.mjs /tmp/bloomops-n2e-correction-1gkzptlv/final-build-identity.json
git diff --check
# exit0
```

Build/test subprocess exit codes and UTC timestamps are in separate JSON receipts; the Python runner's own exit is not substituted for the child result. No dedicated existing Node test directly mounts NotificationInbox; the real-browser checks above cover the changed UI, and the full suite retains existing UI regressions.

Browser commands use these explicit local-only settings:

```sh
export BLOOMOPS_BUILD_IDENTITY=/tmp/bloomops-n2e-correction-1gkzptlv/final-build-identity.json
export LD_LIBRARY_PATH=/tmp/bloomops-n2e-browser-tools/libs/usr/lib/x86_64-linux-gnu
export PLAYWRIGHT_BROWSERS_PATH=/tmp/bloomops-n2e-browser-tools/browsers
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
BLOOMOPS_BROWSER_EVIDENCE_DIR=/tmp/bloomops-n2e-correction-1gkzptlv/final-focused-browser node scripts/notifications-browser-local.mjs --preferences-only
# exit0,23/23
BLOOMOPS_BROWSER_EVIDENCE_DIR=/tmp/bloomops-n2e-correction-1gkzptlv/final-browser node scripts/notifications-browser-local.mjs --skip-performance
# exit0,60/60
```

For the pre-fix run, omit BLOOMOPS_BUILD_IDENTITY, set BLOOMOPS_N2E_SOURCE to the separately built `/tmp/bloomops-n2e-correction-1gkzptlv/reviewed`, and use the same committed harness with `--preferences-only`. Its expected result is exit1 at the missing preference control. All setup data and authentication are synthetic/local; no credentials are exported.

## Five retained full-suite failures

Each current test identifier, assertion and cause matches the independent audit; there are no additional failures:

| Test | Current cause |
| --- | --- |
| `multi-client portal keeps each Project under its own named account` | Expected `James · Projects`; actual `Projects for James`. |
| `every business table carries workspace_id and a workspace foreign key` | Existing `record_discussion_mentions` lacks a direct workspace FK. |
| `the portal shell is not the internal shell with parts hidden: no navigation, no internal path, no internal vocabulary` | Existing `bo-prospect-garden` class matches forbidden `Prospect`. |
| `P1 email 2 is due four days after the first email` | Expected step2; actualnull after stale-evidence cutoff. |
| `P2 email 2 is due five days after the first email` | Expected2026-08-06; actualnull after the same cutoff. |

The four test files and relevant behavior are unchanged by this correction. The September15 run still places the fixed August1 contact beyond45days, with no cutoff crossing from the audited comparison. Audited baseline comparison is retained; it was not rerun or presented as newly executed. No unrelated repairs or weakened tests.

## Revision evidence and retained gates

The exact1754750→259bb59 binary diff and `git show --format=fuller --stat259bb59` output are exported. Application and build/dependency inputs did not change. The browser harness did change, adding three assignment/open/revocation assertions; the remaining paths are documentation/evidence. The earlier commit was not documentation-only. This confirms historical application-source equivalence, but does not retroactively prove the old browser artifact identity. The new recorded runs replace that uncertainty for the corrected source.

The packet exports both reviewed→final and complete recorded-base→final diffs, plus the exact tested83c4cf1→final delta. Only this evidence report, README link and BUILD_STATE follow the tested source; no later application, build, dependency or executed-harness edits.

Unchanged migration/native-D1 and performance inputs retain their earlier evidence and were not rerun. Browser fixture setup necessarily applies migrations locally but is not a renewed migration acceptance claim. LIVE PERFORMANCE NOT VERIFIED. No push, PR, merge, deployment, shared-data action or additional milestone work. `.task-tmp/`, the original dirty D2 checkout and other worktrees remain untouched.

Packet: `/home/ary/Developer/bloomops-n2e-correction-20260915-1gkzptlv.tar.gz`. Next: focused independent re-review of this correction and revision/artifact evidence. No independent acceptance is claimed.
