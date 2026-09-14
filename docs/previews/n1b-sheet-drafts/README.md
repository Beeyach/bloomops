# N1B sheet draft recovery

Actual built-Worker captures with fictional records in a copied local workspace. This feature is not deployed to staging.

| Screen | Preview |
| --- | --- |
| Recovered field with original value and explicit save | [Desktop](recovered-1440.png) |
| Editable recovery on a phone | [Phone](recovered-390.png) |
| Narrow layout | [320px](recovered-320.png) |

Typed cells and pending reviewed fields are kept separately for each mounted sheet, user and workspace. On return, the recovery prompt shows only counts/dates. Review recovered fields checks current account/workspace/record access before showing stored values. Recovery retains the original comparison values and query; it never submits automatically. Incomplete input stays editable, and a newer field cannot be silently overwritten.

Copies last seven days in this browser, with at most ten copies per user/workspace and200 fields/256KiB each. Logout clears them; workspace changes invalidate open sheets while preserving the original workspace's distinct copy. Missing records block a whole candidate. Storage errors warn while keeping mounted input. This is not cross-device sync, and browser storage removal cannot be recovered. Undo receipts remain in the mounted session.

Verification:33 focused Node tests; [33 final built-Worker recovery checks](acceptance.json);24 existing save/undo browser regressions; final OpenNext build. The regression harness adapts its old denied-read case to503 because N1B deliberately clears drafts on discovered403 revocation, covered by the new suite. [Native D1 recovery](native-recovery.json) returned200 records with55 bindings maximum; database tests prove no writes and enforce stale-membership, operations-workspace, foreign-record and identity boundaries. Final browser checks cover typed query guards, reload, a new browser context, back/forward, invalid correction, lost responses, concurrency, no unvalidated content, quota, revocation, initiating-user mismatch, independent tabs, workspace switch/return and logout, including failed storage signaling, shared-page switching and the isolated real legacy rail button. Exactly-ten-copy recovery/save is covered. Guarded concurrent source cleanup, encoded-byte limits and physical expiry cleanup have focused tests. Provider egress stayed empty.

[Unrelated-route comparison](performance-summary.json): Home/Clients/Work retain one navigation request,11/3/7 SQL statements and two D1 calls, respectively. All retain10 scripts; shared JavaScript rises from390118 to390649 decoded bytes (+531,0.14%) for the shared draft lifecycle signal. The42-navigation/six-cold-load run uses the final reviewed-fix runtime. Concurrent local browser work and synthetic fixtures establish no production timing improvement.

Chromium initially crashed when opening later tabs because the shared `/tmp` tmpfs was98% full. Using a task-private temporary directory on the regular filesystem allowed the complete final run. Existing temporary files and unrelated servers were preserved. The harness now chooses that private directory itself.

Independent review status is in [BUILD_STATE](../../BUILD_STATE.md). Evidence: `/home/ary/Developer/bloomops-n1b-sheet-drafts-evidence/`. No migrations, deployment, production/DNS changes, real prospect import/outreach or video work.
