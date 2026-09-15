# Five baseline test failures — bounded maintenance

Base: `c33370772d444d140f7c21761b498fc769e87840` (current main at start).
Branch: `fix/baseline-test-maintenance-20260915`. N2E remains accepted on staging;
this batch changes test assertions/helpers and local verification only. No
application, schema, migration, dependency or CI configuration change.

## Causes and corrections

1. **Multi-client portal heading:** accepted `PortalHome` uses “Projects for
   James” (introduced in `00f540b`, included in accepted N2B/N2E). Inspect each
   actual client section with the existing zeed-dom renderer utility; require
   its own heading and Project, and exclude the other account's Project.
2. **Mentions workspace invariant:** the old test required a *direct* FK, while
   A2 requires correct workspace isolation and N2D explicitly permits workspace
   composite FKs (`docs/phases/A2.md`, `docs/phases/N2.md`). Migration 0045 and
   canonical schema already enforce two mandatory paths:
   `mentions(workspace_id,thread_id,comment_id)` → `comments(workspace_id,thread_id,id)`
   → workspaces, and `mentions(workspace_id,membership_id)` →
   `workspace_memberships(workspace_id,id)` → workspaces. All tuple components
   are NOT NULL. A nonexistent workspace or mismatched tuple cannot satisfy
   either path. The generic invariant now proves an anchored mandatory FK path,
   without a table exemption. Negative fixtures reject missing/unrelated FKs,
   nullable tuples/scopes and unanchored cycles. Real SQLite and native D1 checks
   reject foreign workspaces, mismatched comments/threads/memberships, missing
   users, NULLs, duplicate recipients and invalid updates, and retain the
   recipient index and existing NO ACTION / explicit cleanup behavior.
   **No schema defect or migration is required.** No historical SQL/snapshot is
   rewritten; fresh/populated-upgrade migration work is unnecessary for unchanged
   schema. Native proof still installs all 47 current migrations from empty.
3. **Portal vocabulary:** inspect rendered text plus accessible/visible
   attributes, not CSS/id/data identifiers. Keep the existing navigation,
   internal URL, control and content protections. Paired regressions accept
   `bo-prospect-garden` but reject forbidden text, split/encoded text, accessible
   names/descriptions, image alt, titles, placeholders and input values.
   Once this earlier assertion passed, the same test exposed another stale
   expectation for “James Ltd” in the accepted single-account view. It now
   asserts the actual agency copy and exact client-specific section/link.
   The original failed run and this intermediate failure remain in evidence.
4–5. **P1/P2:** inject the existing `now` option into the two fixed-date fixtures.
   Additional P1/P2 cases span 2024 (leap day), 2026 and 2034, checking due date,
   step, fresh evidence, explicitly stale findings, and the exact 45-day boundary
   (minus 1ms, exactly, plus 1ms). The production cutoff and scheduling code are
   unchanged; fixture dates are controlled inputs, not rolling postponements.

## Verification commands

Node 22.23.2 / npm 10.9.8. `npm ci` uses the unchanged root lockfile. The host has
Python 3 but no `python` alias; the full suite uses an external temporary PATH
directory containing only `python` → `/usr/bin/python3`, per working agreements.
No global configuration is changed.

```sh
node --test tests/bloomops-projects-ui.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-schema.test.mjs tests/followup-schedule.test.mjs tests/portal-vocabulary.test.mjs tests/workspace-fk-invariant.test.mjs tests/mention-workspace.test.mjs
node --test tests/bloomops-portal-*.test.mjs tests/bloomops-record-discussions.test.mjs tests/bloomops-notifications.test.mjs tests/bloomops-actions-access.test.mjs tests/bloomops-page-comments.test.mjs tests/bloomops-page-sharing.test.mjs tests/followup*.test.mjs tests/cutover.test.mjs
node scripts/mention-workspace-native-local.mjs
npm test
npm run cf:build
git diff --check
```

Original focused reproduction: 73/78, exit 1, exactly the five recorded failures.
Final tested source: `d9880712f2dd19ab7960ae9120c9890d111eccb4`.

- Focused: 98/98, exit 0, including six controlled P1/P2 calendar/boundary cases.
- Related portal/discussion/Page/notification/follow-up regressions: 386/386,
  exit 0 (before the isolated fixture correction; all rerun by the final suite).
- Native mentions: 22 checks on 47 existing migrations, exit 0.
- `npm test`: 7,218/7,218, zero failures/skips/cancellations, exit 0; twenty tests
  added relative to main. Temporary Python alias points to Python 3.14.4.
- `npm run cf:build`: exit 0 on the same exact tested source.
- Syntax and `git diff --check`: exit 0.

One Sol High bounded read-only review found a test-fixture gap: the mentioned
membership also authored comments, so unrelated author FKs could mask a deletion
regression. A recipient-only membership now isolates the actual FK. A disposable
SQLite mutation changes only its delete action to CASCADE and proves the verifier
fails. The single focused re-review confirmed the finding resolved with no
material issue remaining. Final runs above followed the committed fix. This
review concerns only maintenance, not the accepted N2E application.

Only documentation follows the tested source. Actual remote receipts accompany
the separate draft PR/review packet; this document records the local checkpoint.
CI is unchanged: a clean candidate skips the failure-only base rerun; historical
base failures remain in reproduction and previous accepted-release evidence,
not represented as a candidate waiver. No failing-base comparison is forced onto
a clean candidate.

No deployment or shared database is used. The new maintenance draft PR and its
existing local-resource PR workflow are the only authorized remote writes.
