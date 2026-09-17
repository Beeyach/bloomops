Historical checkpoints: [BUILD_STATE_ARCHIVE.md](history/BUILD_STATE_ARCHIVE.md). Read only for a specific past decision, never at session start.

# Bloomsi Build State

Local CLI correction: inline project profiles removed. Use explicit model and effort flags instead. Owner-supplied CLI /status confirms Terra Medium in this worktree. Main integration remains pending. Existing product gates below remain open.

## Current phase

Prospecting completion resumed by owner direction. This bounded session closes the missing event-backed P3 Results view; Ellen's new client-success portal, paid auditing, video and broader email/provider work remain deferred.

## Current bounded task

Prospecting completion on `fix/prospecting-completion-20260917`, from the owner-confirmed clean checkpoint `76176a6`. Ellen's new client-success portal is deferred.

- [x] Reuse accepted sheet/import/manual-audit and P5C onboarding evidence; do not rebuild those paths from stale checklist text.
- [x] Add the missing event-backed Prospecting Results destination, with counts that distinguish people, messages, human replies, recorded interest and durable conversions.
- [x] Verify focused invariants plus synthetic desktop/mobile save-and-reload browser behavior; keep release/deployment gates separate.

## Open blockers and unresolved gates

- Product source baseline is `7d8166cc317335c01d18fb8596908bcf4562b62d` (Client setup UX, PR #99). This task does not roll it back or modify it.
- Disposable remote-D1 integrity verification remains unresolved at `PRAGMA quick_check` / `SQLITE_NOMEM`. No new attempt is part of this maintenance task.
- PERF3 overall live performance acceptance remains open.
- PR #93, Client-detail edit recovery, remains separate and unmerged in the supplied checkpoint. Preserve its branch and any local work. Other remaining form-recovery work is still governed by `docs/phases/N1.md`; this documentation task does not close it.
- Downstream onboarding request destinations must still be configured where required. Template setup and portal invitation acceptance do not prove every agreement/access step is complete.
- Source-only maintenance is not permission to convert or contact real prospects, resume paused video or paid auditing, change providers, or restart the broad roadmap.

## Most recent verification checkpoint

Product evidence carried forward, not rerun: PR #99 release notes report staging `7d8166c`, final PR run `35163655840` passing 7,419/7,419 plus feature checks, and staging run `35165342432` passing. Remote-D1 run `35165342330` failed as noted above. These are recorded product results, not verification performed by this documentation job.

Maintenance run `35201052091` passed TOML parsing, repository-wide filename-reference checks, content preservation, allowed-path scope and Git diff whitespace checks. Its exact results, complete move list and retained-file reasons are in the maintenance run's report artifact. No application suite, build or database command was run.

The Prospecting Results tree is locally verified on `fix/prospecting-completion-20260917`, based on `76176a6`: 30/30 focused tests, final OpenNext Worker build, and 15/15 built-Worker browser checks pass. Browser evidence uses an isolated synthetic D1/R2 fixture and includes a visible interest-event save, Results refresh/reload, desktop/390/320 layouts, signed-out denial, no runtime errors and zero provider egress. One Sol Medium review found a reporting-basis ambiguity and focused coverage gaps; both were fixed and the single re-review reports no remaining material findings. This is local evidence only; no push, PR, deployment, remote database operation or real outreach occurred.
