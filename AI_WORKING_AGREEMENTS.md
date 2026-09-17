# Bloomsi working agreements

## Start here

Newer explicit owner scope wins. Read this guide and the short
[BUILD_STATE](docs/BUILD_STATE.md) once at task start. Inspect actual repository,
branch, HEAD, changes and ownership before edits. Never reset, stash, discard,
overwrite or absorb another session's work. Old repository names are not identity.

[INDEX](docs/INDEX.md) locates contracts. Read the relevant section, acceptance
rules and necessary dependencies, not every linked file. Retrieve missing context
rather than guess. "Continue" resumes unfinished work inside current scope;
"What's next?" requests a report, not implementation or external actions.
Historical approval never overrides a newer restriction.

## Context and usage

- BUILD_STATE is a current handoff, not a transcript: maximum 6 KiB. Replace stale
  entries; put detailed receipts in the established phase/evidence location.
  Preserve the finite completion inventory and unresolved gates.
- Budgets: this guide 12 KiB; each entry file 2 KiB; INDEX 4 KiB. Keep AGENTS.md and
  CLAUDE.md byte-identical. Run `python3 tools/agent_context.py check` after edits.
- History, previews, evidence, reference-code, old root reports and superpowers
  documents are opt-in. [History](docs/history/README.md) preserves the originals.
  Do not recursively read them or load old model/permission rules as current.
- Source search: `python3 tools/agent_context.py search 'symbol'`. Current contract
  search: add `--scope docs`. History requires `--scope history --path <file>`.
  Output is bounded and truncation explicit. Narrow before requesting more.
- After compaction, use the short handoff and inspect changed/relevant files.
  Do not replay the timeline, full phase documents or unchanged broad diffs.
- One task and one writer per shared file. No routine parallel agents, automatic
  next milestone, broad audit or large review archive.
- Start a long check once. Retain its command, revision, log and process/run ID.
  Prefer a bounded terminal wait and final receipt. Do not repeatedly analyze an
  unchanged running job or restart a healthy one. If the turn ends, report PENDING
  and the run ID once; inspect again when its result is needed. Never promise
  background work without scheduling it.
- Keep logs in files; read final summaries or bounded failure excerpts. No complete
  TAP logs, giant JSON, duplicate receipts or repository-wide content dumps.

## Model routing

Codex: **GPT-5.6 Sol / Medium**, configured in `.codex/config.toml`. Low for
mechanical work; High for difficult bugs, authority, transactions, migrations,
performance or cross-system work. Extra High only for a specific issue unresolved
at High. The owner's Sol-only choice stays in force. No automatic Astra escalation.

Claude Code: **Sonnet 5**, configured in `.claude/settings.json`. Opus is reserved
for a bounded auth, migration or security problem Sonnet cannot resolve. No silent
model change, premium fallback or fast-mode spending. Session/provider/managed
settings can override repository defaults; check actual selection before claiming
it changed. Never change global settings as part of ordinary project work.

Required review: one fresh **Sol High read-only** reviewer, without the implementation
conversation. Independence means separate context, not model diversity. A review
trigger does not upgrade the implementer. Report unavailable models; no silent
substitution or invented review. Include Model / Reasoning / Surface only for an
actual task the owner must run, not discussion.

## Product and data invariants

Bloomsi contains agency operations, the Client portal and approved fresh-workspace
Prospecting/Pages. Keep legacy Leadsthatbloom data, voices, settings and credentials
separate and intact. No inferred membership from email, copied histories, implicit
AI work or sending on intake. Video/voice, paid bulk audits and real outreach remain
paused until explicitly resumed. Discussing DeepSeek costs does not enable it.

Use existing Next/React, Bloom primitives, OpenNext, D1/Drizzle, R2, Better Auth and
Resend. No new framework, database, auth system or paid dependency without an
approved need. Trace actual callers through canonical `lib/bloomops/` rules.

Preserve:
- Server-side deny-by-default checks for current identity, active membership,
  workspace, role, assignment, visibility and special capability. UI is not authority.
  Finance capability remains separate. Revocation applies despite a valid session.
- Owner/Admin/Project Manager/Team Member/Client roles; portal isolation from internal
  notes, finance, contractors, workload, unrelated Clients and restricted files.
- Tenant-owned records and several services per Client. Departments are views, not
  new data stores or permissions. Client lifecycle, health, service, Project and
  Action statuses stay distinct; waiting/dependencies cannot create false overdue work.
- Immutable template/report versions and snapshots; canonical relational generated
  records, stable dedupe/request identity, provenance and activity history.
- Mature Page editor/tree, actual record-backed views, autosave/recovery, comments
  and sharing. Pages do not replace structured metrics.
- Real pilot records are not QA fixtures. Never change evidence, verification,
  qualification, outreach state or user text to make a screenshot pass.

Read relevant [DOMAIN_MODEL](docs/DOMAIN_MODEL.md), [PRODUCT_SPEC](docs/PRODUCT_SPEC.md)
and phase sections for exact behavior. [PROSPECTING_ROADMAP](docs/PROSPECTING_ROADMAP.md)
supersedes old separate-product exclusions. The app owns live prospecting policy;
inherited skills cannot override it. Unfinished phases remain unfinished.

## Engineering and external effects

Make the smallest complete correction. Preserve validation, original input on errors,
revision/compare guards, transactional side effects and safe retry/deduplication.
Do not invent commands, APIs, configuration or success. No unrelated refactor.

For local checkouts use the existing WSL tools, Node 22+ and root npm lockfile.
Do not mix Windows binaries into WSL builds or alter global tools. Reuse dependencies.
If I/O/read-only failures recur, inspect storage before heavy writes.

Keep secrets, tokens, magic links and sessions out of Git, logs and reports. No raw
third-party passwords or production secrets in tests. Use supported auth/invitations,
synthetic local D1/R2 and captured mail; inspect script targets before execution.

Schema changes require generated additive migrations, fresh/populated validation and
tenant constraints. Never rewrite applied migrations, use schema push, repair schema
inside requests or connect preview to production data.

Explicit owner approval must cover the target/effects of deployment (including
staging), production writes, destructive migrations, credentials, paid services,
meaningful deletion, force-push, DNS, publication, real messages and payments.
Standing approval applies only within its scope. Never bypass protections or infer
production/legacy deployment from "continue". Inspect push/merge workflow triggers:
agent configuration may trigger staging and remote-D1 work on main. No deployment
is a verification shortcut. Preserve current environments and real-data boundaries.

## Design

Read relevant [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md), [DESIGN_CHECKLIST](docs/DESIGN_CHECKLIST.md)
and owner references for UI work. Use installed skills selectively. Preserve Bloomsi
identity and approved compact Social-style controls. Use clear hierarchy, recognizable
actions and shared spacing, not blanket overrides. No app-authored em dashes or
middle-dot chains; do not substitute pipes/slashes. Preserve stored user content and
immutable snapshots. Prefer full-page substantial records/inline editing over stacked
drawers. Inspect the rendered app; selectors alone do not prove visual quality.

## Verification and review

Focused checks during edits; required build/full suite and relevant browser/native
checks at a meaningful integration checkpoint. Reuse results only with demonstrated
unchanged executed inputs. Changed inputs, new failures or unresolved concerns justify
reruns; routine spacing adjustments do not justify repeated full suites. Never weaken
assertions, authority checks or failed gates to cut cost.

Docs/config-only work uses syntax, links, budgets, archive identity and focused script
checks, not local app builds, database writes or browser sweeps unless behavior changed.
Existing required CI still applies. Commands come from actual contracts/package.json:
`npm test`, `npm run cf:build`, `git diff --check` where relevant. No invented standalone
lint/typecheck scripts. Zero verification with `--local` is local; without it creates
and deletes remote resources and needs authorization.

Use one bounded reviewer for security/authority, schema/data, payments/sending/jobs,
deployment/credentials, measured performance, recurring bugs, cross-system changes,
failed/inconclusive checks or an explicit audit. No reviewer for routine styling,
text, low-risk fixes or pure documentation organization. Fix valid findings and use
at most one focused re-review by the same reviewer. Reports stay under 500 words
unless essential evidence needs more. No owner-shuttled packets; unresolved issues
stay open. Never claim CI evidence was independently rerun when merely inspected.

## Finish

Update the short BUILD_STATE in place with task, actual revision, next action,
blockers and evidence links. Do not append the session or create another roadmap.
Retain PERF3, remote integrity, portal/setup gaps and unfinished recovery inventory.
Progress updates only for meaningful changes/blockers. Final **DONE**, **VERIFIED**,
**PROBLEM**, **NEXT**, scaled to scope. Distinguish implemented, tested, reviewed,
merged, deployed and live-accepted. End at the requested task with one usable handoff.
