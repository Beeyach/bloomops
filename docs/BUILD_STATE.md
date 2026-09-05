# BloomOps Build State

## Current Release

Release A: Foundation, Auth, Clients, Services, Onboarding, Client Portal

## Current Phase

A2 (Database foundation) is complete. The BloomOps domain schema exists as Drizzle-generated migrations, is proven by invariant tests against a real SQLite, and was applied to the staging database `bloomops-staging` by the same GitHub Actions run that deploys the Worker. See "Domain Schema (A2)" below for the local and staging evidence.

Completed phase specs: `docs/phases/A1.md`, `docs/phases/A2.md`. Next phase spec: `docs/phases/A3.md` (not started).

Documentation index: `docs/INDEX.md`

## Branch State

A0 (PR #2) was not merged into `main` when A1 started, so A1 is a second commit on the same branch, `claude/bloomops-a0-phase-xhae5r`, stacked on the A0 import commit. PR #2 was still unmerged when A2 started, so A2 lives on its own branch, `claude/bloomops-a2-database-foundation`, based on the PR #2 head, with its own PR against `main`. Once PR #2 merges, that PR shows A2 alone.

## Source

BloomOps was seeded from the clean tracked `origin/main` snapshot of `Beeyach/bloomtrack-pro`.

| Item | Value |
|---|---|
| Source repository | `Beeyach/bloomtrack-pro` |
| Source commit SHA | `270d9543381841fc05bc50dee4b8c163bf120e2f` |
| Source tree SHA | `bdcadaa8577eab35add61b77e4555cf34d97937d` |
| Source commit date | 2026-08-31T01:34:56Z |
| Imported on | 2026-09-05 (A0) |

BloomOps Git history is fresh. The source commit object does not exist in the BloomOps object store.

## Completed

- Planning documentation structure under `CLAUDE.md` and `docs/`
- A0: source snapshot imported, planning docs preserved, source SHA recorded, install/test/build verified
- A1: deployment path migrated to Cloudflare Workers through OpenNext, three isolated environments configured, Leadsthatbloom infrastructure references removed or neutralized, generated output and prospect exports removed from version control, fresh-database bootstrap made reproducible, local runtime verified, `bloomops-staging` deployed from GitHub Actions and verified live
- A2: BloomOps domain schema for Release A declared with Drizzle, materialised as SQL migrations, applied alongside the inherited schema, proven with invariant tests

## Deployment Path Decision (A1)

BloomOps deploys to Cloudflare Workers through the OpenNext Cloudflare adapter.

| Package | Before | After | Why |
|---|---|---|---|
| `@cloudflare/next-on-pages` | 1.13.16 | removed | Deprecated on npm (its `deprecated` field points to OpenNext), last release 1.13.16, Pages only, peer range caps Next at 15.5.2 |
| `@opennextjs/cloudflare` | none | 1.20.6 | Current release (2026-09-02), peer `next >=15.5.24 <16 \|\| >=16.3.3`, `wrangler ^4.125.0` |
| `next` | 15.4.11 | 15.5.25 | Newest 15.x. The smallest move that satisfies the adapter. Stays on the 15 line, no framework upgrade |
| `react`, `react-dom` | 18.3.1 | 18.3.1 | Unchanged. Next 15.5 accepts `^18.2.0` |
| `wrangler` | 4.110.0 | 4.129.0 | Adapter requires `^4.125.0` |
| `esbuild` | transitive only | 0.25.4 (devDependency) | `tests/_jsx-hooks.mjs` and OpenNext's bundler both require it from the project root. It used to arrive only as a hoisted dependency of the old adapter |

### Why not vinext

Cloudflare presents vinext as the default Next.js path on Workers today, with OpenNext as the alternative when compatibility requires it. vinext was checked on 2026-09-05 and rejected for this repository:

- vinext is `1.0.0-beta.9` (published 2026-09-02) and its README says it is not yet a production-ready solution for every workload
- it targets Next.js 16 only and states there is no support for deprecated APIs from older versions
- its peer dependencies require `react ^19.2.6`, `react-dom ^19.2.6`, and `vite ^8.0.0`
- it lists platform-specific route configuration (`runtime`) among its known gaps

This app is Next 15 with React 18.3.1, a React 18 TipTap editor, and 73 routes that carried an edge-runtime declaration. Moving to vinext would be a framework-level upgrade (Next 16 and React 19) on top of the infrastructure change, which A1 forbids. OpenNext builds on the standard `next build` output and is the mature option.

### Why the inherited adapter had to go

- `@cloudflare/next-on-pages` is deprecated and frozen. Its peer range `next >=14.3.0 && <=15.5.2` cannot pair with any Next 15.5 release that carries the fix for CVE-2025-66478 (documented in the inherited `LTB-OPENNEXT-CLOUDFLARE-PREVIEW-MIGRATION-REPORT.md`)
- the inherited `LTB-CLOUDFLARE-500-SAME-COMMIT-REBUILD-REPORT.md` records a production 500 inside the adapter's own output that no adapter version could fix
- it is a Cloudflare Pages adapter, and BloomOps needs Workers environments with their own bindings

### Compatibility evidence used

- npm registry metadata queried on 2026-09-05: versions, `peerDependencies`, `deprecated` flags, and publish dates for `@opennextjs/cloudflare`, `vinext`, `@cloudflare/next-on-pages`, `wrangler`, and `next`
- the vinext README on GitHub (status, Next 16 target, React 19 peers, known gaps)
- web search summaries of Cloudflare's "Next.js on Workers" framework guide and the OpenNext Cloudflare docs. Direct reads of `developers.cloudflare.com` and `opennext.js.org` are blocked by this environment's egress policy, so those two sites were not read first-hand
- the inherited reports `LTB-OPENNEXT-CLOUDFLARE-PREVIEW-MIGRATION-REPORT.md`, `LTB-OPENNEXT-PRODUCTION-CANDIDATE-READINESS-REPORT.md`, and `LTB-OPENNEXT-PRODUCTION-CANDIDATE-FINAL-VERIFICATION.md`, which document this same codebase migrated to `@opennextjs/cloudflare` in August 2026 on a branch: 65 edge-runtime removals, 25 context swaps, a preview Worker serving authenticated pages with binding parity, and the full test suite passing. The tracked `.open-next/` output that A0 inherited was a stale artifact of that experiment
- local proof in this repository, recorded under "Verified Working"

### Code changes the adapter required

- 73 `export const runtime = 'edge';` declarations removed under `app/`. OpenNext runs the Node.js runtime on Workers, and the edge runtime is not supported by the adapter
- `getRequestContext` from `@cloudflare/next-on-pages` replaced by `getCloudflareContext` from `@opennextjs/cloudflare` in 26 files: 23 route files, `lib/db.js`, `lib/workspace.mjs`, `middleware.js`, plus one dynamic import in `app/api/visual-evidence/route.js`. The returned `{ env, cf, ctx }` shape is the same, so call sites did not change otherwise
- `next.config.js` calls `initOpenNextCloudflareForDev()` during `next dev` instead of the old `setupDevPlatform()`, and reads `WORKERS_CI_COMMIT_SHA` before the old `CF_PAGES_COMMIT_SHA` for the build stamp
- stale comments that described the edge runtime, Pages, or `wrangler.toml` were rewritten. No component, query, or business logic changed
- new: `open-next.config.ts` (deliberately minimal, no cache), `wrangler.jsonc`, `.dev.vars.example`, `lib/infra-status.mjs`, `app/api/infra/route.js`

## Current Infrastructure

All names below are BloomOps names. None existed in Leadsthatbloom.

| Environment | Selected by | Worker | D1 binding `DB` | R2 binding `FILES` | `BLOOMOPS_ENV` |
|---|---|---|---|---|---|
| development | top-level config (no `--env`) | `bloomops-dev` | `bloomops-dev` (local id `bloomops-dev-local`) | `bloomops-files-dev` | `development` |
| staging | `--env staging` | `bloomops-staging` at `https://bloomops-staging.cool-sunset-2169.workers.dev` | `bloomops-staging` (id `4bb0c8e9-a08f-43d7-9ad7-68b28c371d23`) | `bloomops-files-staging` | `staging` |
| production | `--env production` | `bloomops-production` | `bloomops-production` | `bloomops-files-production` | `production` |

Every environment also has the `ASSETS` binding for static files from `.open-next/assets`.

Configuration lives in `wrangler.jsonc`. Wrangler does not inherit `d1_databases`, `r2_buckets`, or `vars` between environments, so each environment declares its own resources in full. The staging `database_id` is committed. The production `database_id` is still the placeholder `REPLACE_WITH_BLOOMOPS_PRODUCTION_D1_ID` until production is provisioned as a deliberate, separate step. A remote deploy fails on a placeholder, which is the intended failure. Compatibility date is `2025-05-01` with `nodejs_compat` and `global_fetch_strictly_public`, the combination the inherited migration proved on this codebase. Raising the date is a later, deliberate change.

Development runs entirely on wrangler's local D1 and R2 simulation (`.wrangler/state/`, gitignored). `next dev` reaches the same local bindings through `initOpenNextCloudflareForDev()`.

Secrets are per environment and never in the repository. `.dev.vars.example` documents the two inherited login secrets for local use. Copy it to `.dev.vars` (gitignored).

### Commands

| Purpose | Command | Target |
|---|---|---|
| Dev server with local bindings | `npm run dev` | development, local |
| Worker build | `npm run cf:build` | writes `.open-next/` (gitignored) |
| Local Worker preview | `npm run preview` | development, local |
| Apply base schema | `npm run db:schema:local`, `db:schema:staging`, `db:schema:production` | `DB` binding of that environment |
| Apply migrations | `npm run db:migrate:local`, `db:migrate:staging`, `db:migrate:production` | `DB` binding of that environment |
| Prove a fresh database migrates from zero | `node .github/scripts/verify-zero-remote.mjs --local`, or the "Verify zero-to-current migration" workflow for a disposable remote D1 | a temporary config bound to one disposable database, never a named environment |
| Deploy | `npm run deploy:staging`, `npm run deploy:production` | named environment only |
| Binding types | `npm run cf:typegen` | writes `cloudflare-env.d.ts` (gitignored) |

There is no bare deploy script. Every remote command names its environment. The migration runner refuses `--remote` without `--env`.

### Resource isolation evidence

`wrangler deploy --dry-run` on 2026-09-05, one run per environment, bindings as printed by wrangler:

```
development:  env.DB (bloomops-dev)          D1   env.FILES (bloomops-files-dev)          R2   BLOOMOPS_ENV "development"
staging:      env.DB (bloomops-staging)      D1   env.FILES (bloomops-files-staging)      R2   BLOOMOPS_ENV "staging"
production:   env.DB (bloomops-production)   D1   env.FILES (bloomops-files-production)   R2   BLOOMOPS_ENV "production"
```

A dry run without `--env` prints wrangler's own warning that multiple environments are defined and none was chosen. No environment shares a database or bucket name with any other, and no configuration in the repository names a Leadsthatbloom database, bucket, Worker, or Pages project.

`GET /api/infra` (behind the session gate) reports the serving environment and whether its own `DB` and `FILES` bindings answer. Locally it returns `environment: development` with both bindings `ok`. On a deployed environment it is the runtime check that staging holds staging data only.

### Fresh database bootstrap

The inherited `schema.sql` already contains the tables and columns that 16 of the 60 migrations add, so replaying every migration on a fresh database failed on the third file. `scripts/migrate.mjs` now checks each pending migration's postconditions (the catalogue checks from `scripts/ledger-audit.mjs`) against the live schema and records a migration that is already fully present instead of executing it. On a fresh database this recorded 16 migrations and executed 44, leaving a ledger of 60 and 37 tables. A second run is a no-op. This is the inherited schema kept working on new databases. A2 replaces it with the BloomOps domain schema.

Bootstrap order for any new environment: `db:schema:<env>` then `db:migrate:<env>`.

## Domain Schema (A2)

The BloomOps relational model for Release A lives in `lib/bloomops/schema.mjs` (Drizzle, plain JavaScript) and is materialised by the SQL migrations under `drizzle/`. Runtime access goes through `lib/bloomops/db.mjs`, which wraps the environment's `DB` binding with `drizzle-orm/d1`. No route uses it yet. A2 builds the foundation, A3 onward builds on it.

| Item | Value |
|---|---|
| `drizzle-orm` | 0.45.2 (dependency) |
| `drizzle-kit` | 0.31.10 (devDependency), used for `generate` only, no push, no credentials in `drizzle.config.mjs` |
| Schema | `lib/bloomops/schema.mjs`, 22 tables |
| Migrations | `drizzle/0000_bloomops_release_a_foundation.sql` (tables, indexes, constraints), `drizzle/0001_immutability_triggers.sql` (custom SQL), journal in `drizzle/meta/` |
| Applied by | `wrangler d1 migrations apply DB` per environment, ledger table `d1_migrations`. `wrangler.jsonc` names `drizzle` as every environment's `migrations_dir` |
| Commands | `db:domain:generate`, `db:domain:migrate:local`, `db:domain:migrate:staging`, `db:domain:migrate:production`, `db:domain:status:local`, `db:domain:status:staging` |

### Tables

Identity and organisation: `workspaces`, `user`, `session`, `account`, `verification`, `workspace_memberships`, `workspace_invitations`, `departments`, `department_memberships`, `member_capabilities`.
Clients and services: `bloomops_clients` (exported as `clients`, see coexistence), `client_contacts`, `client_assignments`, `service_types`, `service_engagements`, `service_assignments`.
Templates and onboarding: `templates`, `template_versions`, `onboarding_instances`, `onboarding_items`, `onboarding_item_services`.
History: `activity_events`.

`onboarding_item_services` is the one table beyond the A2 list. It is the junction that lets a single merged onboarding item (Meta access, say) serve several service engagements, which the Release A merge story requires. No projects, tasks, deliverables, content, approvals, comments, requests, finance, notification, queue, or webhook tables were created.

The four auth tables are Better Auth 1.7.2's core schema for sqlite, generated with its CLI and copied field for field (`user`, `session`, `account`, `verification`, camelCase keys over snake_case columns, integer epoch-millisecond timestamps, cascade from `user`). A nullable `account.issuer` column is included ahead of Better Auth's documented account model. No auth behaviour exists. Better Auth itself is not installed.

### Constraints that carry the invariants

- Every business table has `workspace_id` with a foreign key to `workspaces`. Every child row also carries a composite foreign key `(workspace_id, parent_id)` to the parent's unique `(workspace_id, id)`, so a contact, assignment, engagement, onboarding row, invitation, or activity event can never reference a parent in another workspace. 53 foreign-key clauses in total.
- `workspace_memberships`: one row per user per workspace, `role` limited by CHECK to owner, admin, project_manager, team_member, client. `member_capabilities` holds dotted keys such as `finance.view` per membership, unique per pair, so finer permissions are data rather than roles.
- `bloomops_clients`: `relationship_status` and `health` are separate columns with separate CHECK vocabularies. `slug` is unique per workspace.
- `service_engagements`: many per client, own `status` vocabulary, optional `source_template_version_id`. `service_assignments` is unique per engagement and membership and is distinct from `client_assignments`.
- `templates` and `template_versions`: one row per template version number, `definition_json` plus `definition_hash` per snapshot, and a trigger that aborts any update of the definition, hash, template, or version number. A used version cannot be deleted (restrict).
- `onboarding_instances`: at most one open instance per client (partial unique index), so activation can be retried. `onboarding_items`: unique `(instance, logical_key)`, lowercase keys enforced by CHECK, structured status, responsible party, visibility, and position columns. Items and their service links cascade with their instance.
- `activity_events`: triggers abort UPDATE and DELETE, event types are upper-case constants, indexed by workspace, client, and subject.
- Domain timestamps are ISO-8601 text with millisecond precision, defaulted by the database. Ids are text, defaulted by the database when absent.
- No table stores a third-party platform password. Better Auth's `account.password` column exists for its credential provider only and stays unused with magic-link login.

### Coexistence with the inherited Leadsthatbloom schema

Both schemas live in the same D1 database per environment and never share a table.

- The inherited schema keeps its bootstrap: `schema.sql` then `scripts/migrate.mjs` over `migrations/` with the `_migrations` ledger (`db:schema:*`, `db:migrate:*`). Nothing there changed.
- The domain schema uses wrangler's native migrations over `drizzle/` with the `d1_migrations` ledger (`db:domain:migrate:*`). `wrangler.jsonc` now points `migrations_dir` at `drizzle` for all three environments, which only affects these wrangler commands.
- The one name collision is `clients`. The inherited prospecting app still reads and writes its own `clients` table from four routes, so the BloomOps client table is created as `bloomops_clients` and exported from the schema as `clients`. Application code only ever sees the export. When the inherited prospecting tables are dropped in a later phase, one Drizzle migration renames `bloomops_clients` to `clients`. No inherited SQL or behaviour was touched.
- Order does not matter. Applying domain migrations to the inherited dev database worked (37 inherited tables plus 22 plus the ledger), and applying `schema.sql` on top of a domain-first database also worked. The two ledgers never see each other's files.
- `GET /api/infra` now also reports `domain: { migrations, ok }` from the `d1_migrations` ledger and the presence of the anchor tables, and the staging verifier checks it.

### Local verification (2026-09-05)

| Check | Result |
|---|---|
| Schema module loads, `drizzle-kit generate` | 22 tables, 27 unique indexes, 17 indexes, 53 foreign-key clauses, 20 CHECK constraints. Re-running generate reports no changes |
| Fresh local D1 from zero, `db:domain:migrate:local` | 2 migrations applied, 22 tables, ledger 2. Second run: "No migrations to apply" |
| Existing dev D1 with the inherited schema | domain migrations applied cleanly on top, 60 tables in total, triggers present |
| Reverse order | `schema.sql` applied after the domain schema without conflict |
| `tests/bloomops-schema.test.mjs` | 19 invariant tests against a real SQLite built from the committed migrations |
| `npm ci` | ok |
| `npm test` | 2633 pass, 0 fail (2613 before A2, 20 new) |
| `npm run build`, `npm run cf:build` | exit 0 |
| Local Worker smoke (`verify-staging.mjs` against `wrangler dev`) | 15 of 15, including "BloomOps domain schema present" |
| Pages anchors | all eight unchanged, nothing under `components/` changed |

### Staging verification (2026-09-05)

The Deploy staging workflow runs `db:domain:migrate:staging` after the inherited migrations and before the deploy, and the live verifier requires `/api/infra` to report the domain schema. Two runs on branch `claude/bloomops-a2-database-foundation` did the work:

| Run | Commit | What happened |
|---|---|---|
| 33968508433 | `bf9bcdb` | Identity `hello@bloomwired.io`, account `Bloomwired`. Provisioning confirmed the committed staging D1 id `4bb0c8e9-a08f-43d7-9ad7-68b28c371d23` and bucket `bloomops-files-staging`. Inherited bootstrap: 28 schema statements, all 60 legacy migrations already applied. Domain migrations at 13:19:11Z: "About to apply 2 migration(s)", `0000_bloomops_release_a_foundation.sql` executed 67 commands, `0001_immutability_triggers.sql` executed 4 commands, both recorded in `d1_migrations`. Deployed version `fd0f1f3d-50be-49bf-82a1-0a0bfe9a9b7b`. The live verifier then failed only its new "BloomOps domain schema present" check because `/api/infra` was still answered by the previous Worker version two seconds after the last secret upload |
| 33968734285 | `ea075bc` | Same steps. Domain migrations: "No migrations to apply", so the second apply is a no-op on staging as it is locally. Deployed version `5ee00b71-0536-46ea-b6f8-233e5b9a44a0` at 13:24:26Z. Verifier 13:24:30Z to 13:24:34Z, 16 of 16 passed, including `build ea075bc is being served` and `BloomOps domain schema present ({"migrations":2,"ok":true})` |

The fix in `ea075bc` stamps the commit into the build (`WORKERS_CI_COMMIT_SHA`) and makes the verifier wait until `/api/version` reports that commit before it inspects bindings, so a verify run can no longer land on the previous version.

The staging database now holds the 35 inherited tables plus the 22 domain tables and both immutability triggers. No production database exists, and no Leadsthatbloom database was named or touched: every wrangler call in both runs carried `--env staging` and resolved to `bloomops-staging`.

### Zero-to-current remote verification (2026-09-05)

`docs/phases/A2.md` requires a fresh staging or remote database to migrate from zero. The staging runs above cannot show that, because `bloomops-staging` already carried the inherited schema and its full migration ledger when the domain migrations arrived. Commit `ee96d17` added `.github/scripts/verify-zero-remote.mjs` and the workflow `.github/workflows/verify-zero-remote.yml`, which create a disposable remote D1 database, migrate it from empty through the repository's own three paths, migrate it again, verify, and delete it. GitHub Actions run 33987071853 (job 101362522182, 19:26:03Z to 19:30:44Z) did this once:

| Item | Result |
|---|---|
| Disposable database | `bloomops-a2-zero-verify`, id `3426af49-50cb-4204-ac12-8da621e9db70`, created 19:26:10Z in region ENAM. The account inventory was read first: seven databases, none by that name, so it was newly created. Its id matched neither the committed staging id nor the production placeholder |
| Target isolation | every migration command ran with `--config` pointing at a wrangler config written to the runner's temp directory whose only D1 binding was that id. `wrangler.jsonc` was not edited and no staging or production id was repointed. The script routes every wrangler call through one guard that refuses any database command without that config and any account command naming anything but the disposable database (plus a read-only `d1 info` on `bloomops-staging`) |
| Began empty | `sqlite_master` held one Cloudflare-internal object, table `_cf_KV`, and no user objects |
| Inherited base schema | `schema.sql` executed as one remote batch with no failed statement |
| Inherited migration ledger | `scripts/migrate.mjs --remote --config`: 44 migrations executed, 16 recorded as already present because `schema.sql` already satisfied their postconditions, 0 previously applied, all 60 files accounted for. Afterwards `_migrations` held exactly the 60 file names |
| Drizzle migrations | `wrangler d1 migrations apply DB --config … --remote`: `0000_bloomops_release_a_foundation.sql` executed 67 commands, `0001_immutability_triggers.sql` executed 4 commands, both ✅. `d1_migrations` then held exactly those two names in committed order and `migrations list` reported nothing pending |
| Tables | all 22 BloomOps A2 tables present. 58 tables in total: 34 inherited tables, `_migrations`, 22 domain tables, and `d1_migrations`. `d1 info` reports the same 58 for `bloomops-staging`, so the fresh database and the incrementally migrated staging database have the same table set |
| Triggers | `template_versions_immutable_update`, `activity_events_immutable_update`, `activity_events_immutable_delete` all present |
| Second run | `schema.sql` again with no failed statement, `migrate.mjs` reported 0 applied, 0 recorded, 60 already applied, `migrations apply` reported "No migrations to apply". A full `sqlite_master` snapshot plus both ledgers was identical before and after the second run |
| Deletion | `d1 info bloomops-a2-zero-verify` resolved to the id created in this run, then `wrangler d1 delete bloomops-a2-zero-verify --skip-confirmation` at 19:30:40Z. The inventory afterwards listed the same seven databases as before, by uuid, name, version, and creation time, and the disposable name and id were gone |
| Untouched | `bloomops-staging`: 58 tables before and after, same uuid and creation time. No production database exists. The Leadsthatbloom database on the account appeared in the inventory by name only and was identical before and after. The account identity was `hello@bloomwired.io` on account `Bloomwired` |

The same script runs locally against wrangler's local D1 with `node .github/scripts/verify-zero-remote.mjs --local`, where it skips the create, inventory, and delete steps and passed the same checks before the remote run. `scripts/migrate.mjs` gained `--config <file>` for this; a bare `--remote` is still refused, and `tests/migrate.test.mjs` covers the argument handling.

### Deferred to A3 and later

- installing Better Auth, its routes, sessions, magic links, Resend, and any login UX (A3)
- seeding the four departments, service types, or any workspace (A7 and later, or explicit setup)
- Pages metadata columns (workspace, client, visibility) on the inherited `pages` table
- renaming `bloomops_clients` to `clients` after the inherited prospecting tables are dropped
- any use of `lib/bloomops/db.mjs` from routes

## Leadsthatbloom Reference Audit (A1)

| Reference | Where it was | What happened |
|---|---|---|
| Pages project `bloomtrack-pro`, D1 `bloomtrack-pro` id `412a33ad-…`, preview env on the same database, `RENDER_URL`, `VIDEO_BASE_URL` | `wrangler.toml` | File deleted. Replaced by `wrangler.jsonc` with BloomOps resources only. Neither var is BloomOps configuration |
| `pages:build` script, `@cloudflare/next-on-pages` | `package.json` | Removed. Package name is now `bloomops` |
| `wrangler pages dev` launch config | `.claude/launch.json` | Replaced with `npm run dev` and `npm run preview` |
| Worker `bloomwired-review`, R2 bucket `bloomwired-pdfs`, cron drain against the Leadsthatbloom app | `workers/bloomwired-review/wrangler.toml` | Quarantined. Worker name and bucket renamed to non-existent BloomOps-prefixed placeholders with a do-not-deploy header, so a deploy from that directory is refused. Source kept because tests pin its cron cadence and routing. Removal belongs with the prospecting cleanup |
| `wrangler d1 execute bloomtrack-pro --remote` | `scripts/canary-create.mjs`, `canary-followup.mjs`, `repair-send-events.mjs`, `retire-legacy-sequence.mjs`, `tools/audit-triage/push-results.mjs` | Deleted. Nothing imported them |
| `wrangler d1 execute bloomtrack-pro --remote` | `scripts/migrate.mjs`, `ledger-audit.mjs`, `cutover-dry-run.mjs`, `shadow-followups.mjs`, `reconstruct-replies.mjs` | Kept (tests import or read them). Retargeted to the `DB` binding, `--local` by default, `--remote` refused without `--env` |
| `bloomtrack` commands in comments | `schema.sql` | Rewritten to `DB --env <environment>` |
| PDF upload to R2 through the Leadsthatbloom Worker | `scripts/upload-pdf.sh`, `scripts/upload_pdf.py`, `upload-pdfs.ps1`, `check-pdfs.ps1` | Deleted |
| Windows launcher into `F:\bloomtrack-pro` | `Bloomtrack.bat` | Deleted |
| Tracked generated Worker output (204 files, 13 MB) | `.open-next/` | Removed from version control and gitignored. Regenerated by `npm run cf:build` |
| Prospect exports (5 files, 700 KB) | `all-prospects.json`, `all-emailed-prospects.csv`, `ellen-coaches.csv`, `done-coaches.csv`, `coaches.json` | No runtime source referenced them. Deleted and gitignored by name |
| `LTB_ACCESS_CODES`, `LTB_SESSION_SECRET` | `lib/session.mjs`, `middleware.js`, `app/api/auth/route.js`, `docs/ACCESS-CODES.md` | Still read by the inherited login until A3 replaces it. Not placed in any wrangler config. Documented as temporary in `.dev.vars.example` |
| `LTB_SHARED_APIFY_TOKEN`, `RENDER_SECRET`, `UPLOAD_SECRET`, `CRON_SECRET`, `GOOGLE_*`, `GMAIL_*`, `BRAVE_API_KEY`, `SERPER_API_KEY` | prospecting routes and `lib/` | Prospecting secrets. Not configured for any BloomOps environment. They go with the prospecting code |
| `NEXT_PUBLIC_LTB_*` build stamps | `next.config.js`, `lib/version.mjs` | Kept. Build-time version badge, not infrastructure. Rename with the app identity later |
| `CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH` | `app/api/system-health/route.js` | Kept. Reports `unknown` on Workers. Prospecting system page |
| `audit-render` Cloud Run service | `services/audit-render/` (Dockerfile, gcloud README), `lib/runner.mjs`, `tools/audit-triage/scan.mjs` | Kept. Tests import its pure modules. Not a Cloudflare resource, deploys only through an explicit `gcloud` login. Goes with the prospecting code |
| `leadsthatbloom.com`, `file.gobloomwired.com` URLs | `scripts/visual-acceptance.mjs`, `scripts/port-pages.mjs`, `lib/bloom-api.mjs`, prospecting routes, skills, root reports | Kept. HTTP references, not resource configuration. No BloomOps command uses them |

## Verified Working

Verified on 2026-09-05 in a clean Linux container (Node 22.22.2, npm 10.9.7):

| Check | Result |
|---|---|
| `npm ci` from the regenerated lockfile | OK |
| `npm test` | 2613 tests, 2613 pass, 0 fail (2605 inherited, 8 new) |
| `npm run build` (Next.js 15.5.25) | exit 0, no warnings. The old edge-runtime warnings are gone |
| `npm run cf:build` (OpenNext 1.20.6) | exit 0, `Worker saved in .open-next/worker.js`, no unsupported features reported |
| `wrangler deploy --dry-run` for development, staging, production | exit 0 each, bindings as listed above |
| Fresh local D1 bootstrap | `db:schema:local` then `db:migrate:local`: 16 recorded, 44 executed, ledger 60, 37 tables, second run no-op |
| `npm run preview` (local Worker) | `/gate` 200, `/` redirects to `/gate`, `/api/infra` 401 without a session, sign-in 200, `/api/infra` reports `development` with D1 and R2 `ok`, `/api/pages` 200 with seeded pages, page create 201 and read back, `/api/version` `/api/clients` `/api/settings` `/api/prospects` `/api/today` `/api/system-health` all 200, authenticated `/` 200 with no Next error markers |
| `next dev` | sign-in 200, `/api/infra` reports `development` with D1 and R2 `ok` through the dev hook |
| Pages anchors | all eight A0 anchor files unchanged, no file under `components/` changed |

New tests: `tests/infra-status.test.mjs` (binding report never carries ids or secrets, failures are reported not thrown) and four cases in `tests/migrate.test.mjs` (already-present migrations are recorded not executed, missing ones execute and inform later checks, the runner without a schema reader behaves as before).

## Staging Deployment

First completed on 2026-09-05 by GitHub Actions run 33966322588 of `.github/workflows/deploy-staging.yml` at commit `9442c11`. The same workflow runs on every push to `main` and, until PR #2 and PR #3 merge, on pushes to their branches, so staging stays current on its own. The latest deploy is recorded under "Staging verification" in "Domain Schema (A2)".

| Item | Value |
|---|---|
| Cloudflare identity | User API token for `hello@bloomwired.io`, account `Bloomwired`. The account id lives only in the repository secret |
| Worker | `bloomops-staging` at `https://bloomops-staging.cool-sunset-2169.workers.dev` |
| Deployed version | `a876ed03-2fe0-405a-9a60-e883c9870501`, deployed 2026-09-05T12:40:14Z |
| D1 | `bloomops-staging`, id `4bb0c8e9-a08f-43d7-9ad7-68b28c371d23`, committed in `wrangler.jsonc` under `env.staging` |
| R2 | `bloomops-files-staging`, present on the account, bound as `FILES` |
| Bindings at deploy | `DB` (bloomops-staging), `FILES` (bloomops-files-staging), `ASSETS`, `BLOOMOPS_ENV` = `staging` |
| Schema | `db:schema:staging`: 28 statements executed on the staging database |
| Migrations | `db:migrate:staging`: 16 recorded as already present, 44 executed, none previously applied (fresh database) |
| Secrets | `LTB_ACCESS_CODES` and `LTB_SESSION_SECRET` set on `bloomops-staging` from throwaway repository secrets |
| Bundle | 9811 KiB, 1981 KiB gzipped, 25 ms startup |

Remote verification by `.github/scripts/verify-staging.mjs` against the live URL, 12:40:19Z to 12:40:25Z, 14 of 14 checks passed:

- anonymous `/api/infra` refused with 401, `/gate` renders 200, anonymous `/` redirects to `/gate`
- sign-in with the throwaway staging code returns 200 and issues a session cookie
- `/api/infra` returns `environment: staging`, `d1: bound, ok`, `r2: bound, ok`
- `/api/pages` returns 200 with the 4 seeded pages
- a disposable page was created (201), read back, deleted (200), and no longer listed. The row remains soft-deleted in the staging trash and holds no real data

Isolation proof. The staging Worker binds only the resources above, and their names and id differ from every other environment: development runs on wrangler's local simulation with id `bloomops-dev-local`, and production still carries the placeholder id and has no Worker. The provisioning script refuses to run if the staging block names anything other than the BloomOps staging resources or shares an id with production, and it passed.

Leadsthatbloom and BloomOps production untouched. The run's wrangler operations were `whoami`, `d1 list`, `r2 bucket info`, `d1 execute DB --env staging --remote`, `deploy --env staging`, and `secret put --env staging`. Every mutating call carried `--env staging`. No production environment was deployed, no production database or bucket was created, and no Leadsthatbloom database, bucket, Worker, Pages project, or secret was named or touched.

Re-running the workflow is safe. Schema and migrations are idempotent, the provisioning step verifies the committed id against the account, and the verifier creates and deletes its own page.

## Known Risks

- inherited application is still Leadsthatbloom in behavior and UI, and `ProspectsApp.jsx` remains the root
- inherited authentication is access-code based (`LTB_ACCESS_CODES`, `LTB_SESSION_SECRET`) until A3
- prospecting code, skills, tools, `services/audit-render/`, the quarantined `workers/bloomwired-review/`, and the Leadsthatbloom report markdown files at the repository root remain until replacement phases make removal safe
- the inherited schema is still bootstrapped from `schema.sql` plus postcondition-aware migrations. A2 added the BloomOps domain schema beside it. The inherited schema is retired only when the prospecting code that reads it is removed
- `open-next.config.ts` configures no cache. Every inherited route is dynamic, so nothing is lost today. Revisit when a route needs ISR
- `compatibility_date` is `2025-05-01`. Wrangler suggests a newer date. Raise it deliberately with a test pass
- the production D1 id is a placeholder until production is provisioned deliberately
- two migration systems coexist in one database until the inherited prospecting schema is retired: keep running the inherited bootstrap before the domain migrations on a brand-new database, as the workflow does, even though either order works today
- the BloomOps client table is physically named `bloomops_clients` until the inherited `clients` table is dropped

## Intentionally Not Done in A2

- no Better Auth install, routes, sessions, magic links, Resend, or login UX
- no Clients, Onboarding, or Templates UI
- no seed data beyond test fixtures
- no changes to inherited tables, SQL, or behaviour, and no rename of the inherited `clients` table
- no production provisioning or migration
- no A3 work

## Intentionally Not Done in A1

- no Better Auth, no Drizzle domain tables, no Clients, no Onboarding, no navigation changes
- no removal of prospecting routes, components, or libraries
- no rename of inherited `LTB_*` login secrets (A3 replaces the login)
- no change to the Pages/editor system
- no production provisioning or deployment
- no A2 work

## Context Discipline

For the next phase, read:

1. `CLAUDE.md`
2. this file
3. `docs/phases/A3.md` and `docs/DOMAIN_MODEL.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

A3, Authentication and membership. Not started.

## Last Verification

2026-09-05, A2 execution. Local results are in "Domain Schema (A2)". GitHub Actions run 33968508433 applied the two domain migrations to `bloomops-staging`, and run 33968734285 (commit `ea075bc`) deployed and passed all 16 live checks, including the domain schema check. Run 33987071853 (commit `ee96d17`) then proved the fresh-remote case: a disposable D1 named `bloomops-a2-zero-verify` went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the Drizzle migrations, took a second pass as a no-op, and was deleted, with the account inventory and `bloomops-staging` unchanged. A2 satisfies every verification item in `docs/phases/A2.md`, including "fresh staging DB migrates from zero". No production resource was provisioned. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

Earlier the same day, A1 execution. Results are in "Verified Working". Later the same day the remote staging step ran from GitHub Actions (run 33966322588) and passed every check, as recorded under "Staging Deployment". A1 satisfies every verification item in `docs/phases/A1.md`. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `--dry-run`, `wrangler dev`).
