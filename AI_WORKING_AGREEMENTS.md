# BloomOps working agreements

This is the canonical project guide for Codex and Claude Code. Root `AGENTS.md` and `CLAUDE.md` are identical entry files; keep them identical regular files, never symlinks. Explicit owner instructions govern the requested scope and override older project handoff instructions. Keep implementation, review, fixes, and reporting in the same working session; do not make the owner transfer prompts or audit reports between chats.

## Start here and track the phase

Before changing anything, read this guide, [docs/BUILD_STATE.md](docs/BUILD_STATE.md), and the current contract in [docs/phases/](docs/phases/). Inspect Git status (including untracked files), relevant recent commits, implementation, and tests. Preserve the starting changes and branch; never reset, stash, overwrite, or absorb unrelated work into the task.

- **“Continue”** means identify the current phase and complete the first unfinished task within the requested scope. Check the current checkout against the tracker before acting. Historical authorization is not permission to bypass a newer restriction or a later phase gate.
- **“What’s next?”** means report the current phase, completed items, blockers, and recommended next task. It does not authorize implementation or external actions.
- [docs/BUILD_STATE.md](docs/BUILD_STATE.md) is the existing status source. Update it after meaningful work, recording evidence, blockers, and the next bounded task. Do not create another roadmap or `PROJECT_STATUS.md`.
- [docs/INDEX.md](docs/INDEX.md) routes supporting reading; [docs/ROADMAP.md](docs/ROADMAP.md) owns release sequencing; `docs/RELEASE_A.md` through `docs/RELEASE_D.md` and `docs/phases/` own scope and acceptance. Read only relevant supporting documents. `docs/PROSPECTING_ROADMAP.md` owns the approved Prospecting/Pages phase order. Root `PRODUCT-ROADMAP.md`, other inherited prospecting reports, and `docs/superpowers/` remain historical references.
- Never mark a phase complete while required acceptance checks fail or remain unverified. Distinguish implemented, locally verified, independently reviewed, merged, and deployed. An external gate awaiting approval stays pending; finish all authorized local work first.

## Product and architecture

BloomOps manages post-sale agency operations and a client portal, initially for Ellen's agency with Ary as administrator and Systems/GHL provider. It owns clients, services, onboarding, Work Core, Social content, approvals, files, Systems/GHL/Kajabi delivery, Ads, Pages/SOPs, team operations, and lightweight finance within the approved phase. The owner-approved Prospecting and Pages roadmap adds internal prospecting in a distinct fresh workspace, selective raw import, structured profiles, audits/skills, outreach/results and a same-workspace client/onboarding handoff. Follow docs/PROSPECTING_ROADMAP.md and the currently authorized phase; do not activate later phases. The original Leadsthatbloom / `Beeyach/bloomtrack-pro` app, workspace, history, voices and tuned settings remain intact and accessible. No workspace/history/credential merging or implicit automation. All video work, voice generation and video tests are paused until the owner resumes them. SaaS commercialization remains future scope.

The app uses Next.js 15 / React 18, Tailwind and custom Bloom primitives; OpenNext packages it for Cloudflare Workers. D1 holds data through Drizzle, R2 holds files, Better Auth owns identity/sessions and magic links, and Resend delivers deployed mail. Development uses local D1/R2 and captures mail in local R2. Queues are intended when reliable jobs are needed; Workflows are later, not assumed implemented.

| Location | Ownership |
| --- | --- |
| `app/(internal)/`, `app/portal/`, `app/api/`, `middleware.js` | Internal routes, separate portal, HTTP boundaries and request gating; middleware/UI alone never grants access. |
| `lib/bloomops/` | Canonical business rules, access checks, read models, auth and schema. `db.mjs` wraps the current environment's D1 in Drizzle; `schema.mjs` owns domain schema. Inspect the actual caller through domain/query code before edits. |
| `components/bloomops/`, `app/globals.css`, `tailwind.config.js` | Shells, domain UI, design primitives and tokens. Do not grow inherited `ProspectsApp.jsx` into BloomOps. |
| `components/` and `lib/editor-extensions.mjs` | Reusable Page/editor infrastructure; inspect before replacing. See [docs/PAGES_SYSTEM.md](docs/PAGES_SYSTEM.md). |
| `schema.sql`, `migrations/`, `scripts/migrate.mjs` | Inherited baseline and ledgered migrations still needed for fresh databases. |
| `drizzle/`, `drizzle.config.mjs` | Generated domain SQL migrations and snapshots; no schema push. |
| `tests/`, `scripts/`, `.github/scripts/` | Node tests, local/Worker/browser harnesses, bootstrap and verification tools. Inspect target and side effects before executing. |
| `wrangler.jsonc`, `open-next.config.ts`, `next.config.js`, `.github/workflows/` | Environment bindings, build and deployment. Development, staging and production are distinct. |
| `services/audit-render/`, `tools/audit-video/`, `tools/audit-triage/`, `workers/bloomwired-review/`, inherited prospecting modules | Inherited source material to reuse only within the current Prospecting roadmap phase and current workspace authorization. Video remains paused; no deletion sweeps, legacy deployment or voice cleanup. |
| `docs/reference-code/bloomlab/` | Design references only; never import into runtime. |

Durable product behavior and domain detail live in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) and [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md). Preserve these invariants:

- Start with one workspace but keep tenant ownership and multi-workspace membership compatible. Never share mutable client records across workspaces. One client can have multiple simultaneous service engagements; service types and purchased engagements differ.
- Social, Ads, Systems and Operations are organizational views, not data silos or authorization grants. Kajabi/GHL/funnels/automations/integrations generally belong to Systems. Shared projects, milestones, actions, deliverables, files, approvals, comments, assignments and activity have one canonical source. Views project those records.
- Actions describe team work; Deliverables describe client outputs; Content Items stay specialized. Pages hold documents, never fake structured databases. Preserve the mature editor, Page tree, `RichEditor`, `PageView`, `BlockInsertMenu`, `DatabaseViewNode`, `PublicReader`, `EmbedView`, equation/emoji/icon/select and dialog/toast/theme/accessibility utilities. Adapt live Board/Calendar/Gallery/Table projections rather than duplicate data.
- Template versions and definition snapshots are immutable. Instantiation creates relational runtime records that may evolve without following later master edits. Deduplicate with stable logical keys, not labels. JSON is for definitions/configuration where appropriate, not hidden operational state.
- Keep relationship status, client health, service status, project status and action status separate. Client: Draft / Onboarding / Active / Paused / Completed / Ended. Health: On Track / Needs Attention / At Risk. Project: Planned / Ready / In Progress / Waiting / Blocked / Review / Completed / Cancelled / Archived. Action: To Do / In Progress / Waiting / Review / Done / Cancelled. Record whom/what Waiting depends on; explicit dependencies must prevent false downstream overdue work.
- The portal presents only relevant client-visible milestones, requests, deliverables, content, approvals and files. Hide irrelevant navigation. Never automatically expose internal tasks/notes/QA, contractors, workload, restricted files, finance, unrelated services or other clients.
- Keep the calm, premium, editorial Bloom design. Reuse existing tokens/components; avoid excessive cards, visual noise and generic component-library replacements. For visual work read [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) and [docs/DESIGN_CHECKLIST.md](docs/DESIGN_CHECKLIST.md), and inspect [the design reference](https://bloomlab-preview.cool-sunset-2169.workers.dev/design) when browser access is available. Report failed access honestly.

## Environment and exact commands

Work inside the current WSL checkout (`/home/ary/Developer/bloomops` here). Keep Git, Node, npm, Python, paths and development servers in WSL; do not mix Windows executables, PowerShell/cmd, `C:\\` or `/mnt/c` toolchains into this checkout. Use Node **22 or newer** (`package.json`; CI uses 22), npm and the root `package-lock.json`. Preserve existing line endings; no root `.editorconfig` or `.gitattributes` exists at setup. Do not change global Git or runtime configuration.

Run these from the repository root as relevant, not as a blanket startup script:

| Purpose | Exact command / condition |
| --- | --- |
| Inspect | `git status --short`; `git log -6 --oneline`; `node --version`; `npm --version` |
| Install locked dependencies | `npm ci` (when setup is needed; do not replace an unrelated in-progress installation) |
| Local schema, in order | `npm run db:schema:local`, then `npm run db:migrate:local`, then `npm run db:domain:migrate:local`; writes only local development D1, so inspect existing local work first |
| Local workspace fixture | `node scripts/bootstrap-workspace.mjs --local --workspace-name 'Local Agency' --owner-email owner@example.test --admin-email admin@example.test` (after local migrations; synthetic local users) |
| Development server | `npm run dev` (Next development, normally port 3000) |
| Local Worker preview | `npm run preview` (builds then starts local Worker, normally port 8787) |
| Next build | `npm run build` |
| Cloudflare build | `npm run cf:build` (includes Next build and its configured validation; emits `.open-next/worker.js`) |
| Lint / type checking | No standalone `lint` or `typecheck` script or ESLint configuration/dependency exists. Do not invent `npm run lint`, `npm run typecheck` or a passing lint result. Use the relevant build's configured checks; these are not a separate lint suite. |
| Full Node suite | `npm test` |
| Focused example for D2 binding storage | `node --test tests/bloomops-blueprint-binding-schema.test.mjs` (choose the actual affected tests for other tasks) |
| Syntax / patch hygiene | `node --check lib/bloomops/schema.mjs` (example; check changed JS modules); `git diff --check` |
| Generate domain migration | `npm run db:domain:generate` (review SQL and immutable snapshot implications) |
| Local domain migration status | `npm run db:domain:status:local` |
| Fresh-schema and idempotency proof | `node .github/scripts/verify-zero-remote.mjs --local` (isolated disposable local database, checks a second pass; omitting `--local` targets remote resources) |

Local secret documentation is [.dev.vars.example](.dev.vars.example). On a fresh setup only, copy it to ignored `.dev.vars` without overwriting an existing file; use a separate local auth secret and retain `r2-dev` mail. Never copy deployed secrets or enable real mail for a smoke test. Nonsecret environment bindings live in `wrangler.jsonc`; deployed secret names/bootstrap inputs are documented in `.github/workflows/deploy-staging.yml` and `scripts/bootstrap-workspace.mjs`.

Some inherited full-suite tests invoke `python` and expect Python 3. Check availability before claiming a full run; prior evidence used a temporary WSL PATH wrapper pointing `python` at `/usr/bin/python3`. Do not alter global Python or commit a workaround for this documentation setup. Browser scripts require separately available Playwright/Chromium (for example `scripts/shell-review-local.mjs` documents its flags); there is no root browser-test npm script. Reuse configured tooling and the phase's exact harness, never invent an MCP/browser installation or pretend a browser check ran. Keep servers and fixture writes isolated from unrelated local work.

## Engineering and safety

Think before coding. Inspect the real execution path. Prefer the simplest sufficient solution. Make the smallest complete change. Preserve unrelated behavior and user changes. Do not invent libraries, APIs, commands, or results. Run focused verification. Do not claim success when required acceptance checks fail.

Fix root causes; avoid unrelated refactors and future roadmap work. If a pre-existing bug blocks the task, make only the necessary correction and explain it. Test business invariants, not implementation echoes or special-case fixture behavior. Authorization, lifecycle, generation, dependencies and isolation changes need explicit invariant tests; include denied access. Use critical browser checks when the phase/behavior requires them. Report architectural deviations with repository evidence.

- Authorization is server-side and defaults to deny: identity, active membership, resource workspace, role, assignment, visibility and special capability all matter. Owner / Admin / Project Manager / Team Member / Client remain the roles; Finance is independently controlled. Membership suspension revokes access despite a valid identity session. Do not leak inaccessible existence where practical or expose internal/restricted data through APIs, search, embeds, exports, public Pages or file URLs.
- Better Auth owns identity, signed sessions and magic links; BloomOps owns workspace authority. Preserve invitation-only onboarding, revocation and token privacy. Never log auth links/tokens or print secrets. Never store third-party raw passwords; use invitations, delegated/OAuth access or an external credential vault.
- Every schema change needs a migration; a fresh database must reach the current schema through repository migrations. Preserve tenant constraints. Never create/repair production schema during requests, use Drizzle push, copy Leadsthatbloom production data, or point preview/staging at production data.
- No extra database/auth/storage/UI/state/queue system or major infrastructure dependency without a concrete requirement and justification. Prefer existing Bloom primitives. Paid additions require approval.
- Require **explicit owner approval before deploying (including staging), modifying production data, running destructive migrations, changing credentials, adding paid services, or deleting meaningful files/records**. Prepare and verify the concrete change before requesting final approval. Approval must cover the target and side effects; an earlier approval remains valid within its stated scope, but newer restrictions win.
- Force-push, repository/resource deletion, Leadsthatbloom mutations, real client communication/payments, DNS and irreversible publication require an explicit request covering the action. Never infer these from “continue.” Commit/push only when authorized by the task; do not commit automatically.

Deployment is an external action, not a verification shortcut. `npm run deploy:staging` and `npm run deploy:production` build/deploy to their named environments; they do not replace the full migration/bootstrap/verification process. `.github/workflows/deploy-staging.yml` provisions staging D1/R2, applies base/inherited/domain migrations, deploys, sets secrets, bootstraps and verifies. It runs on eligible main pushes (and a historical A3 branch), with Markdown/docs ignored. `.github/workflows/verify-zero-remote.yml` runs on every main push and creates/migrates/deletes a disposable remote D1. Both allow manual dispatch. **A push/merge can deploy or mutate remote resources; inspect these triggers before approval. `.codex/*.toml` changes are not ignored by the staging workflow.** There is no production CI job; production binding/origin placeholders deliberately prevent an unconfigured launch. Never activate legacy render/deploy instructions in inherited READMEs.

## Owner communication and model routing

Use plain language and short sections; omit large logs unless requested. Resolve technical implementation details from evidence without asking the owner to choose. For a real product decision, offer two or three choices, recommended first, with the visible effect of each. Ask only when the answer matters and continue independent authorized work.

Every meaningful progress update uses:

```text
NOW
- Phase: current phase
- Task: current bounded task
- Status: plain-language progress or blocker
- Needs you: Nothing, or the specific input needed
```

Every final response uses **DONE**, **VERIFIED**, **PROBLEM**, **NEXT**; add **NEEDS YOUR DECISION** only when applicable. Say “None” under PROBLEM when appropriate. Include changes/decisions, migrations (or none), actual checks/results, commits if created, intentional omissions/risks, and the next bounded task, scaled to the work. Return one combined report, not separate implementer/reviewer handoffs. A specifically requested report format takes precedence.

Default daily work is **GPT-6 Astra Medium**, including normal features, UI, tests, refactoring and routine fixes. `.codex/config.toml` supplies that repository default for new Codex sessions; an explicit session choice wins. Recommend **Astra High** for auth, database, security, architecture, difficult performance work or recurring bugs. Do not claim to change the main session's effort yourself. If High is needed and not already selected, display:

```text
MODEL CHANGE NEEDED
Recommended: GPT-6 Astra High
Reason: one plain-language sentence
Action: Switch the main session to High, then say “continue.”
```

Request Extra High only after High was tried and a specific unresolved difficulty remains. Independent reviews use **GPT-5.6 Sol High**. Never silently substitute another model if unavailable; report the limitation and leave the review gate pending. Claude Code follows the shared workflow, but a Codex custom-agent file does not configure Claude's model/runtime; disclose an unavailable Sol review there. When giving an actual prompt/task to run, include a compact **Model / Reasoning / Surface** block; omit it for discussion alone.

## Selective internal review and definition of done

Optimize for low usage without sacrificing verification on high-risk work. Use exactly one **GPT-5.6 Sol High read-only reviewer** only when one or more of these triggers apply:

- Authentication, authorization, permissions or security.
- Database schemas, migrations or production data.
- Payments, email sending, background jobs or external automations.
- Deployment, infrastructure, credentials or environment configuration.
- Performance work with measured acceptance targets.
- Recurring bugs that survived a previous fix.
- Changes spanning several connected systems.
- Failed or inconclusive tests.
- An explicit owner request for an independent audit.

Otherwise, do not spawn a reviewer for explanations, planning, text/copy, styling/spacing, typo fixes, one-file low-risk fixes, routine refactoring with unchanged behavior, or routine changes covered by focused passing tests. The main Astra agent inspects its own diff and runs focused checks. Passing tests do not waive a listed review trigger.

For work that meets a review trigger:

1. Establish acceptance criteria from the request and current phase.
2. Inspect or reproduce current behavior along the real execution path.
3. Implement the smallest complete change.
4. Run focused checks, recording commands and actual results.
5. Spawn one fresh **read-only reviewer** using `.codex/agents/reviewer.toml` (Sol High), without forking the implementation conversation. Use one reviewer maximum.
6. Give it only the original request (including relevant owner clarifications), acceptance criteria, relevant final diff including new files, focused test results/limitations, and minimum repository context needed for the change. Do not provide the entire conversation, private reasoning, broad repository dumps or unrelated phase documents. The reviewer may inspect the relevant execution path and tests as needed.
7. If there are no material findings, stop reviewing and proceed to status/reporting. Otherwise assess and fix valid findings; explain evidence for rejected findings. Do not ask the owner to shuttle the review between chats.
8. If reviewer findings caused code changes, run affected tests and allow one focused re-review by the same reviewer, limited to those findings, the resulting diff and updated test results. No additional reviewer or repeated review loop. Report unresolved blockers honestly; the review limit does not turn failed acceptance into success.
9. Update the existing project status with evidence and any pending gates.
10. Return one combined owner-facing report.

Keep reviewer reports under 500 words unless critical evidence requires more. Use only one subagent at a time; parallel work is permitted only when two tasks are genuinely independent and it materially reduces waiting time, without increasing the one-reviewer limit. Use a browser auditor only when live visual/browser behavior needs reproduction and browser tooling is already configured; styling alone does not require an auditor. A filesystem read-only sandbox does not authorize live account or connector mutations. If the custom-agent feature or requested model cannot be used, report that specifically; do not claim an independent review or replace it silently.

Done means requested scope implemented, focused tests and applicable build/type/lint/browser/migration acceptance checks passed, valid review findings resolved when review is required, status updated, and the final diff free of unrelated changes or secrets. Do not rerun broad suites without a relevant change, failure or unresolved concern. Documentation/configuration-only tasks use link/command/configuration/diff validation; they need no application build, database mutation or browser run unless behavior changed. Pending acceptance or owner-gated deployment is reported accurately, never called complete.

## Prospecting and Pages owner direction (PR #58)

The approved product changes in PR #58 supersede older separate-product exclusions; preserve the newer shared workflow and review policy above. A distinct workspace uses existing identity and explicit membership/selection, never an email match as authority. Keep the original LTB workspace and its links/records accessible. Imports are separately selected raw fields with provenance; never copy old audits, sends, schedules, suppression-bypassing state or connections. No import or workspace setup starts sending or AI work.

Prospecting has a route-based contextual sidebar and clear return path; main Pages stays outside it. Reuse useful relational prospect fields and mature Page/editor infrastructure without mounting the legacy monolithic app. Keep prospect/editor queries and heavy bundles out of unrelated routes and measure regressions.

Dot-separated UI metadata chains are banned. Do not replace dots with pipes/slashes or make every field a pill. Use labelled properties, clear identity/role hierarchy, readable typography and separate spacing for headings, labels, controls and help. Prefer full-page substantial records and inline editing; avoid stacked drawers/tab layers. Profiles separate structured identity, assessment, evidence and outreach. Optional detail belongs in named disclosures. Apply docs/DESIGN_CHECKLIST.md.

For Prospecting profile edits, inspect [the committed visual reference and owner corrections](docs/design-references/README.md). The favicon/garden SVG before the business name and conditional icon-only social links are explicit requirements; written corrections override the mockup.

## Future owner direction added to PR58

After the active Prospecting sheet work, follow [docs/NEXT_PHASES.md](docs/NEXT_PHASES.md) for save/recovery, search, client overview/preview, structured reporting and reusable work. [docs/CLIENT_REPORTING.md](docs/CLIENT_REPORTING.md) defines client reports with manual entry/import, charts, immutable publication snapshots and portal/PDF output. Pages supply narrative and authorized links, not the metric database. These are future phases, not permission to interrupt or expand the active task.

N2 includes profile pictures, record-linked comments and basic in-app mentions/replies/assignment notifications, following [docs/COLLABORATION_NOTIFICATIONS.md](docs/COLLABORATION_NOTIFICATIONS.md). Resend remains the existing provider; @bloomsi.app is the owner's intended sender domain. Collaboration email and inbound processing remain later work after domain verification, visibility checks and user preferences. This documentation does not authorize DNS changes or email sending.
