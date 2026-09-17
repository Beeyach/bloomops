Historical checkpoints: [BUILD_STATE_ARCHIVE.md](history/BUILD_STATE_ARCHIVE.md). Read only for a specific past decision, never at session start.

# Bloomsi Build State

Local CLI correction: inline project profiles removed. Use explicit model and effort flags instead. Owner-supplied CLI /status confirms Terra Medium in this worktree. Main integration remains pending. Existing product gates below remain open.

## Current phase

BloomOps 1.0 release-candidate completion on `fix/prospecting-completion-20260917`, from owner-confirmed checkpoint `76176a6`. Prospecting is the active dependency; Ellen's new portal is outside 1.0.

## Capability checklist

- **Complete locally:** workspace-safe prospect creation/import/edit/search; manual skill export and conflict-aware result application; reviewed drafts, reply/stop evidence, exception-led Overview, event-backed Results; bounded historical-coverage decision (`84bc1e8`, `edab89a`, `e773b41`, `4662068`); duplicate-safe conversion/service/onboarding handoff; accepted Pages and core BloomOps operational baseline. Existing focused review and test evidence is retained below.
- **Actual missing agreed behavior:** P3 approved three-message follow-up execution is still preview-only. It needs explicit separate activation, original-thread delivery, recipient-local timing, idempotent retries, immediate reply/stop guards and truthful running/held/stopped/failed state. The prior pause on scheduled Gmail reads/sends conflicts with this requirement and needs an explicit operating-policy decision; provider activation and real sending stay off.
- **Configuration/live/release blockers:** bounded live historical acceptance for `hello@bloomwired.io`; PERF3; disposable remote-D1 integrity; downstream onboarding destinations; integrated staging/release acceptance. Push/PR/main integration, remote migrations and deployment require separate approval.
- **Owner-deferred:** Ellen's new client-success portal, paid audits, video/voice, anonymous/external Pages expansion and other speculative roadmap work.

## Open blockers and unresolved gates

- Product source baseline is `7d8166cc317335c01d18fb8596908bcf4562b62d` (Client setup UX, PR #99). This task does not roll it back or modify it.
- Disposable remote-D1 integrity verification remains unresolved at `PRAGMA quick_check` / `SQLITE_NOMEM`. No new attempt is part of this maintenance task.
- PERF3 overall live performance acceptance remains open.
- PR #93, Client-detail edit recovery, remains separate and unmerged in the supplied checkpoint. Preserve its branch and any local work. Other remaining form-recovery work is still governed by `docs/phases/N1.md`; this documentation task does not close it.
- Downstream onboarding request destinations must still be configured where required. Template setup and portal invitation acceptance do not prove every agreement/access step is complete.
- Live historical mailbox acceptance remains an external evidence gate. Existing real collections predate the new immutable enumeration-scope record and cannot be promoted; no live mailbox read, provider call or real coverage decision was authorized here.
- Source-only maintenance is not permission to convert or contact real prospects, resume paused video or paid auditing, change providers, or restart the broad roadmap.

## Most recent verification checkpoint

Product evidence carried forward, not rerun: PR #99 release notes report staging `7d8166c`, final PR run `35163655840` passing 7,419/7,419 plus feature checks, and staging run `35165342432` passing. Remote-D1 run `35165342330` failed as noted above. These are recorded product results, not verification performed by this documentation job.

Maintenance run `35201052091` passed TOML parsing, repository-wide filename-reference checks, content preservation, allowed-path scope and Git diff whitespace checks. Its exact results, complete move list and retained-file reasons are in the maintenance run's report artifact. No application suite, build or database command was run.

The Prospecting Results tree is locally verified on `fix/prospecting-completion-20260917`, based on `76176a6`: 30/30 focused tests, final OpenNext Worker build, and 15/15 built-Worker browser checks pass. Browser evidence uses an isolated synthetic D1/R2 fixture and includes a visible interest-event save, Results refresh/reload, desktop/390/320 layouts, signed-out denial, no runtime errors and zero provider egress. One Sol Medium review found a reporting-basis ambiguity and focused coverage gaps; both were fixed and the single re-review reports no remaining material findings. This is local evidence only; no push, PR, deployment, remote database operation or real outreach occurred.

The Overview slice is locally verified after `84bc1e8`: 27/27 focused Overview/reply tests, the final OpenNext Worker build and 23/23 built-Worker browser checks pass. Synthetic browser evidence covers connected-but-inactive and empty/unconfigured states, repeated held exceptions with exact counts, a recorded stop reason, a recorded mailbox gap, supported navigation, reload persistence, 1440/1024/768/390/320 layouts, signed-out denial, no runtime errors and zero provider egress. The diff changes no authorization rule, schema, external contract or automation, and all checks passed, so no independent-review trigger applied. Release/staging acceptance is not claimed.

Held-conversation recovery is locally verified after `edab89a`: 50/50 focused hold/reply/Overview/sheet tests, the final OpenNext Worker build and 21/21 built-Worker browser checks pass. The synthetic browser path records a real visible `Reply handled` fact, reloads it, keeps the relational hold, excludes only the handled decision from active exceptions, retains the coverage gap/inactive automation, and shows desktop plus 390/320 layouts with no runtime errors, provider egress or new delivery events. Current workspace/role denial remains covered by the focused domain suite. The change reuses the existing authorization rule and event ledger, with no schema, external contract or automation change, so no independent-review trigger applied. Release/staging acceptance is not claimed. Next is the P3 verified-historical-coverage evidence/acceptance gate; provider activation, follow-up sending and broader mailbox work remain paused pending separate owner direction.

Historical coverage is locally verified after `e773b41`: 69/69 focused collection/recovery/mailbox/Overview/schema tests pass, a fresh isolated local database applied all 58 migrations and a repeat reported no work, the final OpenNext Worker build passes, and 16/16 built-Worker browser checks pass at 1440/390/320 widths. Synthetic evidence covers complete empty and multi-page collections, incomplete pagination/caps/metadata/catch-up, cross-workspace/account and stale/replaced authority/evidence, duplicate promotion, immutable provenance, delayed-checkpoint interval bounds, reload persistence, signed-out denial, unchanged holds/delivery facts and zero provider egress. One Sol Medium review found that a checkpoint could overstate the interval end; binding the decision to the recovery start boundary fixed it, and the focused re-review reports no remaining material findings. This is local evidence only; release/staging, live mailbox acceptance, PERF3 and remote-D1 remain open.
