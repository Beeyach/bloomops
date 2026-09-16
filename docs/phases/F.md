# F — Operations workflows

## F1: Team Action workload — 16 September 2026

The owner's integrated-completion instruction includes remaining agreed Operations.
ROADMAP.md Release F requires Team workload; PRODUCT_SPEC.md specifies People,
Workload and Departments, with no fake productivity scoring. The existing Team
screen manages membership, and Work Core already owns Actions and assignments.
No other active Team implementation was found among current PRs/worktrees.

This batch adds a usable **Action workload** view under Team, with canonical Work
links. It does not represent Action counts as hours, utilization, performance or
all Social production. Broader Operations/Finance and department management remain
on the existing completion list rather than being declared complete here.

New bounded implementation decisions:
- Show currently readable open Actions grouped by individual assignee, including
  an explicit Unassigned group. Done/cancelled Actions are excluded. A historical
  inactive assignee remains identified; no silent reassignment or grant follows.
- Summaries show open, overdue, waiting, review, dependency-blocked, undated and
  next dated work. Counts overlap where appropriate. Reuse Work's exact Client-day
  timezone and dependency rules; blocked Actions never become false overdue work.
- Current internal roles can see only canonical actionReadCondition-authorized
  records. A Team Member's narrow Action grant never becomes a Project, directory,
  Finance, sibling or department-wide grant. Do not enumerate unrelated people,
  emails, hidden record counts or zero-work members. Portal/preview users are denied.
- Pagination applies after authorization/grouping:25 assignee groups; selected
  assignee's open Actions use the existing Action DTO/list and50-row pagination.
  Existing Work detail routes independently authorize links. Query fields select
  only bounded pagination and an assignee; no client-supplied SQL or URLs.
- This is read-only live derived data, with explicit refresh/navigation, no storage,
  new lifecycle, assignment writer, migration, background polling or capacity model.
- Keep existing membership controls untouched. Provide Team and Work entry points,
  clear scope/empty/error messages, canonical Action links, keyboard/narrow layouts.

Acceptance: independently counted assigned/unassigned/status/dependency/date cases;
Client timezones and DST boundaries; inactive assignees; current/revoked/foreign/
portal/restricted/Action-only isolation; inaccessible records excluded before paging;
real supported assignment→summary→Action detail→status change→updated summary in a
completed Worker and staging synthetic workspace. Full suite/build and focused
browser/native query checks are required before integration. Exact commands will be
recorded with their harnesses. Preserve existing N4 integration and other worktrees.

Focused commands: `node --test tests/bloomops-team-workload.test.mjs`,
`node scripts/team-workload-native-local.mjs`, and, against a completed stamped
build, `BLOOMOPS_BUILD_IDENTITY=/absolute/build-identity.json node scripts/team-workload-browser-local.mjs`
with the existing isolated Playwright environment. These join normal non-deploying
PR validation. No schema inputs changed; existing schema verification is retained.
