# Owner UI cleanup verification

Contract: [complete owner brief](../../bloomsi-ui-cleanup-brief.md).
This is the owner-requested implementation pass. Independent review remains deferred
until consolidated stabilization. No migration, dependency or authorization-model change.

## Visible changes

- Compact original logo, labeled workspace switcher and one notification bell.
- Work / Projects and Systems: separate record context, aligned lifecycle/date/owner,
  actual progress and individually labeled shortcuts. Archived/completed/cancelled
  records keep their stored status without active health emphasis.
- Prospecting: centered workspace-empty and filtered-empty recovery, with a bounded
  existence read only when empty filtered results need disambiguation.
- Pages: fluid canvas, bounded readable prose, named Move control, and a keyboard
  accessible Page tools disclosure containing existing template/context operations.
- Skills task region and semantic lists; Social/Ads filter surfaces; Team navigation;
  Finance table/mobile records and separate per-currency invoice/payment summaries.
- Authored metadata separators become separate elements or labeled native options.
  User content and immutable report data are not rewritten. Report calculation,
  publication and PDF code is unchanged; authored HTML labels receive punctuation fixes.

## Measured cause and method

Windows staging baseline `52dacbf` loaded the actual Inter/Bricolage assets. The Work
strip measured43px client height and44px scroll height. Its tab's -1px bottom margin
caused the tiny vertical scroll area. Removing that margin and leaving focus inset
space fixes sizing without hiding scrollbars or disabling horizontal tab access.

Prospecting's explicit disabled prefetch put the authenticated route response,
page JavaScript and then authorized sheet API in the click path. Queries were not
the dominant observed bottleneck. Full prefetch of that one route removes route/JS
loading from the warm click path; every sheet API read still authorizes current access.
Partial prefetch was measured and rejected because it introduced a ~300ms fallback
delay. No cross-user data cache or query engine rewrite was added.

Matching local Chromium, synthetic0/25 records,10ms delay per D1 invocation:
base/document-only `a117f69` versus application `d9bfbd5`, three repeated samples.
Empty usable median117ms →112ms; populated143ms →126ms. First observed empty189ms
→142ms, populated139ms →131ms. These are small local route samples, not PERF3 acceptance.
Windows staging before/after measurements remain separately attributed in the
external evidence directory; do not substitute local results for live results.

## Repeatable commands

Use Node22, root lockfile and the existing isolated Playwright installation.
No shared database or real mailbox is used by these harnesses.

```sh
npm test
npm run cf:build
node scripts/notification-build-evidence.mjs /absolute/evidence/build-identity.json
# Set BLOOMOPS_BUILD_IDENTITY to that completed artifact receipt.
# Set BLOOMOPS_PLAYWRIGHT_PACKAGE / PLAYWRIGHT_BROWSERS_PATH to installed tooling.
# Set BLOOMOPS_BROWSER_EVIDENCE_DIR separately for each command below.
node scripts/ui-cleanup-browser-local.mjs
node scripts/notifications-browser-local.mjs --skip-performance
node scripts/notifications-browser-local.mjs --preferences-only
node scripts/page-context-browser-local.mjs
node scripts/page-templates-browser-local.mjs
node scripts/finance-browser-local.mjs
node scripts/client-reports-browser-local.mjs
git diff --check
```

The UI harness records Worker PID/port, version, artifact hashes, served JavaScript
hashes and unchanged artifacts at exit. It creates synthetic records through normal
APIs, authenticates through local captured magic links, measures navigation, and
checks1440/1280/1024/768/390px. Its native200% zoom uses Chromium appearance settings
in a separate disposable profile, verifies720 CSS px/device ratio2 in a1440px window,
and closes/removes that profile. CSS `zoom:2` was rejected as an invalid substitute
because it does not apply browser-zoom media-query reflow. No shared browser profile
or browser cache is modified. The new harness runs in the existing isolated PR job.

Local full suite at `8e7166c`:7384/7384, exit0, no skips. The initial three failures
were assertions requiring removed middle-dot strings; replacements verify the same
content in separate labeled elements. Intermediate build/harness failures remain
in external logs; they are not represented as passing executions.

Prior to final release, complete the final artifact-bound browsers, remote validation,
Windows staging geometry and matched screenshots. PR93 remains separate; its only
additional source overlap is the owner-role option label in ClientOverview, not its
save/recovery implementation. Keep the product completion list in BUILD_STATE.
