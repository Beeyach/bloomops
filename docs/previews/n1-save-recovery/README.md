# N1A sheet save recovery preview

Working application captures from a copied synthetic local workspace. This change is locally verified; staging continues to serve the accepted sheet runtime `bbe828b`.

| Screen | Preview |
| --- | --- |
| Failed field remains beside its value and retry | [Desktop](retry-1440.png) |
| Readable field error and retry controls | [Phone](retry-390.png) |
| Narrow layout | [320px](retry-320.png) |

A partial save retains failed values and original comparison values. Retry rechecks the current profile and refuses a newer field; already-applied values need no additional write. Confirmed successes keep their undo receipts through retries. Pending reviews require explicit discard before another edit, query or view replaces them. Ordinary links and reload warn before losing mounted unsaved work.

This is mounted-view recovery, not durable draft storage. Client-side history navigation, browser crashes, cross-session restoration and broader forms remain later N1 work. No automatic retry, server authorization change or draft storage was added.

[24 final built-Worker browser checks](save-recovery.json) and20 focused sheet Node tests pass; the OpenNext build passes. Checks cover partial/offline/delayed/lost-response saves, duplicate submission, concurrency, denied access, undo, discard/navigation/reload and three viewport widths. Three final checks cover active/inactive saved-view deletion and its discard guard. Twelve existing undo/history browser regressions also passed before this view-handler-only correction. These checks use real local APIs with intercepted failures and copied fictional records. No live account or provider request was used.

[Performance comparison](performance.json): Home/Clients/Work retain one navigation request,11/3/7 SQL statements and two D1 calls respectively,10 scripts and390118 decoded JavaScript bytes. The recheck covers42 navigation samples and six cold loads at1440/390. The performance run precedes only the active-view deletion guard; it changes no unrelated imports or queries. No production timing improvement is claimed.

Evidence: `/home/ary/Developer/bloomops-n1-sheet-save-recovery-evidence/`. One fresh Sol High review found the active-view deletion bypass; its correction passed the single focused re-review with no remaining material findings. [BUILD_STATE](../../BUILD_STATE.md) records acceptance. No migration, deployment, production/DNS change or original LTB mutation.
