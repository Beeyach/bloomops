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

## F2: Department work — 16 September 2026

Release F and PRODUCT_SPEC Departments/Team require Social, Ads, Systems and
Operations as organizational views over shared records, never additional grants.
This task completes a navigable Team department view using the existing canonical
Project and Action readers. Existing specialist Social/Ads/Systems screens and
other sessions' Ads work remain unchanged. No new department memberships or engine.

Bounded engineering decisions: select one initial department, Projects or Actions,
and open/all work. Each page contains at most50 currently readable records. Match
Work's effective department: Service Type first, Project metadata only when no
Service Type department exists. Preserve existing names/inactive history, closed
records through explicit All work, Client-local dates and dependency semantics.
Project and Action permissions remain separate; an Action-only assignee can use
Actions without receiving Project access, sibling counts, or directory rights.
Portal/preview, stale memberships and replaced identities remain denied. Selection
and pagination are server-validated. Team navigation, real canonical destinations,
empty/invalid recovery, keyboard and320px layouts complete the workflow. No schema,
new grants, fake capacity scores, writable department administration or polling.

Acceptance: Service department authority and rejection of conflicting Project metadata; standalone
Operations Projects; open/all history; pagination after permission filtering;
Action-only/currently revoked/portal/foreign/preview boundaries; supported real
Client→Service→Project→Action setup and navigation in a completed Worker and
synthetic staging. Commands: `node --test tests/bloomops-team-departments.test.mjs`,
the existing workload/access regressions, `node scripts/team-workload-browser-local.mjs`
(the shared Team harness now also exercises department flows), full `npm test`,
`npm run cf:build`, and `git diff --check`. The native Worker browser reads use the
shipped migrations and real D1. No schema/migration change needs separate upgrade
verification. Finance and broader all-form recovery remain unfinished.
