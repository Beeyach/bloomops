# BloomOps Build State

## Current Release

Release A: Foundation, Auth, Clients, Services, Onboarding, Client Portal

## Current Phase

A3 (Authentication and membership) is implemented and verified locally. BloomOps signs people in with Better Auth magic links sent through Resend, resolves every protected request against an ACTIVE workspace membership, bootstraps the first workspace from explicit inputs, runs the invitation lifecycle, and no longer accepts the inherited access-code login. See "Authentication and Membership (A3)" below for the decisions, the schema comparison, and the evidence. The staging cutover runs from the same GitHub Actions workflow once the repository secrets named there exist; the run result is recorded under "Staging verification (A3)".

Completed phase specs: `docs/phases/A1.md`, `docs/phases/A2.md`, `docs/phases/A3.md`. Next phase spec: `docs/phases/A4.md` (not started).

Documentation index: `docs/INDEX.md`

## Branch State

PR #2 (A0 and A1) and PR #3 (A2) are merged into `main` (`541da1e`). A3 lives on `claude/a3-auth-membership-xo5r7e`, branched from that merged `main`, with its own PR. Nothing was stacked on the earlier branches.

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
- A3: Better Auth magic-link identity and sessions over the A2 tables, Resend mail behind a small transport, per-request workspace membership enforcement, first-workspace bootstrap, the invitation lifecycle, minimal sign-in and invitation screens, and removal of the inherited access-code login; verified by invariant tests, a full local Worker smoke, and the external verifier

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

Secrets are per environment and never in the repository. `.dev.vars.example` documents the BloomOps auth and mail secrets for local use. Copy it to `.dev.vars` (gitignored). Public per-environment configuration (`BLOOMOPS_APP_URL`, `BLOOMOPS_MAIL_TRANSPORT`) lives in `wrangler.jsonc` vars.

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

## Authentication and Membership (A3)

Better Auth owns identity (`user`), sessions (`session` plus a signed cookie), and the one-time magic-link token (`verification`). BloomOps owns everything about what a person may do: workspace membership, role, membership state, client scope, and capabilities, resolved from BloomOps tables on every protected request. A valid identity session never bypasses membership.

| Item | Value |
|---|---|
| `better-auth` | 1.7.2 (dependency). Latest release on npm as of 2026-09-05, published 2026-08-26, the same version A2 generated its tables from |
| Drizzle adapter | `@better-auth/drizzle-adapter` 1.7.2 (direct dependency; the current docs import it from this package, which `better-auth/adapters/drizzle` re-exports). `provider: 'sqlite'` over `drizzle-orm/d1` |
| Resend | REST API (`POST https://api.resend.com/emails`, bearer key, JSON body) through `lib/bloomops/mail.mjs`. The `resend` npm SDK (6.26.0 at the time) is not installed: the call is one `fetch`, and the SDK carries a React Email peer dependency the Worker has no use for |
| Auth routes | `app/api/auth/[...all]/route.js` hands GET and POST to `auth.handler`. Endpoints used: `POST /api/auth/sign-in/magic-link`, `GET /api/auth/magic-link/verify`, `GET /api/auth/get-session`, `POST /api/auth/sign-out` |
| BloomOps routes | `GET /api/bloomops/me`, `GET|POST /api/bloomops/invitations`, `POST /api/bloomops/invitations/:id/resend`, `POST /api/bloomops/invitations/:id/revoke`, `POST /api/bloomops/invitations/accept`, `GET /api/bloomops/members`, `PATCH /api/bloomops/members/:id`, public `GET /api/health` |
| Screens | `/sign-in` (form, check-your-email state, invalid or expired link state, no-workspace state), `/invite/<token>` (invalid, expired, withdrawn, already used, sign in to accept, wrong address, accept). `components/auth/AuthShell.jsx` frames them with the existing Bloom tokens. A5 owns the real design |
| Modules | `lib/bloomops/auth-config.mjs` (environment resolution), `auth.mjs` (Better Auth instance), `access.mjs` (per-request identity and membership), `membership.mjs`, `invitations.mjs`, `bootstrap.mjs`, `mail.mjs`, `activity.mjs` |

### Official documentation and API decisions

`better-auth.com` and `resend.com` are blocked by this environment's egress policy. The current documentation was read from the Better Auth repository's own docs source on GitHub (`docs/content/docs/...` on `main`: magic-link plugin, database concepts and hooks, Drizzle adapter, Next.js integration, options reference, session management, hooks) and cross-checked against the installed 1.7.2 package source, which is what actually runs. Resend's request and error shapes were read from the `resend-node` source and the Cloudflare Workers example on GitHub. Decisions taken on that basis:

- magic-link plugin: `expiresIn: 900`, `storeToken: 'hashed'`, sign-up left enabled so an invited person can create their identity on first click. Better Auth 1.7 consumes each token atomically on first verification (`allowedAttempts` is deprecated and ignored)
- restricting account creation: the documented `databaseHooks.user.create.before` hook throws an `APIError` unless a pending, unexpired invitation exists for the normalised address; the plugin turns that into an error redirect (`error=NOT_INVITED`) and no user or session is created. This is the supported mechanism; there is no second authentication system
- `hooks.before` on `/sign-in/magic-link` answers 503 for everyone when no mail transport is configured, before any address-dependent logic runs
- `baseURL` is always set explicitly (Better Auth's reference recommends against request inference); `trustedOrigins` is the app origin plus `BLOOMOPS_TRUSTED_ORIGINS`. Better Auth's `originCheck` limits `callbackURL`, `newUserCallbackURL`, and `errorCallbackURL` to those origins and to safe relative paths, and its CSRF check refuses a cross-site `Origin` on the sign-in request
- middleware follows the documented pattern of a cookie presence check only (`getSessionCookie` semantics, implemented locally against the fixed cookie names so the middleware imports nothing from Better Auth); every protected route and page performs the full check
- `emailAndPassword` stays disabled (its default), no social providers, no organization plugin. Telemetry is off explicitly

### A2 auth schema compared with the current Better Auth schema

`auth@1.7.2 generate` (the current CLI; `@better-auth/cli` 1.4.21 is the old package) was run against a Drizzle sqlite config with the magic-link plugin, and its output was compared field for field and index for index with the four A2 tables in `lib/bloomops/schema.mjs` and `drizzle/0000_bloomops_release_a_foundation.sql`. The magic-link plugin adds no tables.

| Table | Match | Difference |
|---|---|---|
| `user` | exact: `id`, `name`, `email` (unique `user_email_unique`), `email_verified`, `image`, `created_at`, `updated_at` | none |
| `session` | exact columns: `id`, `expires_at`, `token` (unique `session_token_unique`), `created_at`, `updated_at`, `ip_address`, `user_agent`, `user_id` (index `session_userId_idx`, cascade from `user`) | A2 gives `updated_at` a database default the CLI omits (a harmless superset; Better Auth always writes the column) |
| `account` | columns and `account_userId_idx` match | the CLI emits `issuer` as NOT NULL with a compound unique index `account_issuer_accountId_uidx (issuer, account_id)`; A2 has `issuer` nullable and no such index. A2 also gives `updated_at` a default the CLI omits |
| `verification` | exact: `id`, `identifier` (index `verification_identifier_idx`), `value`, `expires_at`, `created_at`, `updated_at` | none |

Migration `drizzle/0002_a3_auth_membership.sql` adds the compound unique index `account_issuer_accountId_uidx`, which is the smallest safe forward change: no `account` rows exist anywhere (magic-link sign-in creates users and sessions only, never accounts) and Better Auth 1.7 always supplies `issuer` when it does write one. Tightening `issuer` to NOT NULL would be a table rebuild in SQLite for a column no Release A code path writes, so it is deliberately left nullable and noted in the schema comment for the phase that first adds an OAuth or credential provider. The same migration adds `workspace_invitations.invitee_name` (nullable) and the partial unique index `workspace_invitations_pending_uq (workspace_id, email) WHERE status = 'pending'`, so one address can hold at most one usable invitation per workspace. Generated with `drizzle-kit generate --name a3_auth_membership`; a second `generate` reports no changes. Applied locally with `db:domain:migrate:local`; staging receives it from the deploy workflow.

### Magic links, sessions, origins

- a link is `https://<app origin>/api/auth/magic-link/verify?token=<32 characters from Better Auth's CSPRNG>&callbackURL=<path>`; it expires after 15 minutes, is consumed atomically on the first verification, and a second use redirects to `/sign-in?error=INVALID_TOKEN` without a session. Only the SHA-256 of the token is stored (`verification.identifier`); the raw token exists in the email alone, and nothing logs it (the tests capture the console to prove that)
- `BLOOMOPS_APP_URL` is the only origin links and redirects use in staging and production; it must be https, and a Host header never changes it. In development the request's own loopback origin (`localhost`, `127.0.0.1`, `[::1]`, any port) wins so `next dev` on :3000 and `npm run preview` on :8787 both work, and the loopback siblings are trusted for the Origin check because wrangler answers as `localhost` when a script typed `127.0.0.1`. A non-loopback host in development is ignored
- sessions live 30 days, extend once every 24 hours of use, and are read from the database on every request (no cookie cache), so sign-out and membership changes take effect immediately. Cookie `bloomops.session_token` (`__Secure-bloomops.session_token` on https), HttpOnly, SameSite=Lax, Path=/, signed with `BLOOMOPS_AUTH_SECRET` (32+ characters, required outside development; the development fallback value is refused if it ever reaches a deployed environment)
- Better Auth's built-in limiter (memory storage, 5 magic-link requests a minute per IP, active when `NODE_ENV` is production) is in force on the Worker; the local smoke runs into it when repeated within a minute, which is the expected behaviour

### Unknown addresses

`POST /api/auth/sign-in/magic-link` answers `{ "status": true }` for every well-formed address. The `sendMagicLink` callback delivers the email only when the address belongs to an existing `user` row or a pending, unexpired invitation; otherwise nothing is sent and the caller cannot tell. The token row Better Auth writes for an unknown address is never delivered and expires in 15 minutes. Even a delivered link creates no identity unless the invitation is still pending at click time (tested by revoking between delivery and click). The one residual difference is timing: a known address costs one Resend call. A mail failure for a known address is logged with transport, status, and error name only, and the response stays `{ "status": true }`.

### Membership enforcement

`lib/bloomops/access.mjs` is the one place a request becomes a person: `getAccess` reads the Better Auth session from the cookie, then resolves the earliest ACTIVE membership in an ACTIVE workspace for that user. `requireAccess` answers 401 without a session, 403 with a session but no active membership, 403 for a state-changing request whose `Origin` is not a trusted origin, and 403 for `manageMembers` unless the membership is an active Owner or Admin. `requireIdentity` (identity only) exists for exactly one route, invitation acceptance. The inherited `lib/workspace.mjs#getWorkspace`, which all 161 inherited data routes call, now returns the BloomOps workspace slug and a two-value role derived from the membership role (Owner and Admin are `admin`), or null, so the prospecting routes are scoped by membership without being edited. `app/page.jsx` performs the same check before rendering the inherited app. Suspending or removing a membership takes effect on the person's next request while their identity session remains valid; the tests and the Worker smoke both show `get-session` still answering while `/api/bloomops/me`, `/api/pages`, and `/` refuse. The last active Owner cannot be suspended or removed, and nobody can change their own membership.

### First workspace bootstrap

`scripts/bootstrap-workspace.mjs` builds a plan of eight literal SQL statements, each guarded by `NOT EXISTS`, and runs it with `wrangler d1 execute DB --file` (`--local`, or `--remote` with a required `--env`), then reports what the workspace holds with masked addresses. Inputs come from flags or `BLOOMOPS_BOOTSTRAP_WORKSPACE_NAME`, `BLOOMOPS_BOOTSTRAP_WORKSPACE_SLUG` (optional, derived), `BLOOMOPS_BOOTSTRAP_OWNER_EMAIL`, `BLOOMOPS_BOOTSTRAP_OWNER_NAME`, `BLOOMOPS_BOOTSTRAP_ADMIN_EMAIL`, `BLOOMOPS_BOOTSTRAP_ADMIN_NAME`. No address is in the source. Owner and Admin must differ. Rerunning creates nothing and rewrites nothing: an existing identity keeps its name, an existing membership keeps its role and status, and the report says when the database differs from the intent (exit 1) instead of correcting it. Bootstrapped identities start `email_verified = 0`; the first magic-link click proves the mailbox and Better Auth flips it. The staging workflow runs the same script on every deploy from repository secrets; without both addresses it skips with a warning, so nobody can sign in until they are supplied.

### Invitations

`lib/bloomops/invitations.mjs` implements Pending → Accepted | Expired | Revoked over the A2 table: 256-bit base64url token from the CSPRNG, SHA-256 hash stored, seven-day expiry, normalised address, role, optional client (required for the Client role, refused for the others, and the composite foreign key refuses a client from another workspace), optional invitee name, inviter membership. Creating an invitation for an address that already has a pending one rotates that row's token and expiry (the old link stops resolving) instead of adding a second; the partial unique index enforces it at the database as well. Resend rotates a pending invitation or replaces an expired one with a fresh row; revoked and accepted ones are left alone. Acceptance requires a signed-in identity whose normalised address equals the invitation's, creates the membership as `active` with the invited role (or reactivates a removed or suspended row, never a duplicate; the unique `(workspace_id, user_id)` index backs that), stamps `accepted_membership_id`, and is idempotent for the same person retrying. A wrong address, an expired, revoked, or already accepted invitation, and an invitation from another workspace are refused. Every transition writes an `activity_events` row (`INVITATION_SENT`, `INVITATION_RESENT`, `INVITATION_REVOKED`, `INVITATION_EXPIRED`, `INVITATION_ACCEPTED`, `MEMBERSHIP_CREATED` or `MEMBERSHIP_ACTIVATED`, plus `MEMBERSHIP_SUSPENDED`, `MEMBERSHIP_REINSTATED`, `MEMBERSHIP_REMOVED` for state changes), carrying the client id where the invitation had one. Client authorization rules themselves are A4.

### Mail

`lib/bloomops/mail.mjs` exposes `createMailer(env).send({ to, subject, text, html })` with three transports: `resend` (the REST call; key only in the Authorization header; errors carry status and Resend's error name, never the body or key), `r2-dev` (development only, refused elsewhere; writes the message as JSON into the local R2 simulation under `dev-mail/<sha256(recipient)>.json` so a local smoke can read a link back with `wrangler r2 object get --local`), and `none`. Templates (`magicLinkEmail`, `invitationEmail`) are short, plain, escape names, and name no other member. Configuration: `BLOOMOPS_RESEND_API_KEY` (secret), `BLOOMOPS_MAIL_FROM` (defaults to `BloomOps <onboarding@resend.dev>`, Resend's test sender, which delivers only to the Resend account's own address until a sending domain is verified there), `BLOOMOPS_MAIL_TRANSPORT` (optional; `resend` when a key exists). For staging, the safe path is a Resend key for a verified sending domain, or the onboarding sender while the only recipients are the account owner's address and Resend's test addresses (`delivered@resend.dev`, `bounced@resend.dev`).

### Old access-code login removed

Deleted: `lib/session.mjs`, `app/api/auth/route.js`, `app/gate/`, `docs/ACCESS-CODES.md`, `tests/session.test.mjs`. Rewritten: `middleware.js`, `lib/workspace.mjs`, `app/page.jsx`, the sign-out button in `components/GlassRail.jsx` (now `POST /api/auth/sign-out` then `/sign-in`), `app/api/credits/route.js` (known workspaces come from the `workspaces` table instead of the access-code map), `.dev.vars.example`, the staging workflow and verifier. `LTB_ACCESS_CODES` is read nowhere. `LTB_SESSION_SECRET` no longer signs or verifies anything; the inherited prospecting code still derives the Gmail token encryption key from it (`lib/secret-box.mjs`, `app/api/gmail/*`), which is not authentication and leaves with that code. `POST /api/auth` with a code answers 401 from Better Auth (unknown endpoint), and an `ltb_session` cookie opens nothing. `tests/bloomops-middleware.test.mjs` pins all of this and scans `app/`, `lib/`, `components/`, `.github/`, and `scripts/` for the old symbols.

### Local verification (2026-09-05)

| Check | Result |
|---|---|
| `npm ci` | ok from the regenerated lockfile. `npm install` needed `--force` once because Better Auth's optional SvelteKit peer chain wants a newer esbuild than OpenNext pins; npm installs none of those optional peers, and a clean `npm ci` reproduces the tree without flags |
| `npm test` | 2680 tests, 2680 pass, 0 fail (2634 before A3; 6 inherited access-code tests removed, 52 A3 tests added across `bloomops-auth`, `bloomops-invitations`, `bloomops-membership`, `bloomops-mail`, `bloomops-middleware`; `bloomops-schema` and the Pages and editor tests unchanged and green) |
| `npm run build` | exit 0, all new routes listed as dynamic |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 | `db:domain:migrate:local` applied 0000, 0001, 0002; bootstrap CLI run twice: 1 workspace, 2 users, 2 memberships, 3 activity events both times |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 (front door, `/gate` and `POST /api/auth` gone, inherited cookie worthless, health and schema, identical responses for two unknown addresses, malformed link refused, foreign callback origin refused, anonymous BloomOps routes refused) |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 40 of 40 through the real bundle on workerd with the r2-dev mailbox: bootstrap, unknown address, Owner link request, delivery, click, single use, `/api/bloomops/me`, home page, inherited `/api/pages` scoped to the slug, `/sign-in` redirecting a member home, invitation created and delivered without the token, invitee identity created on click, no access before acceptance, wrong-person acceptance refused, acceptance, idempotent retry, Team Member cannot manage, suspend (identity session survives, every protected surface refuses), self-suspension refused, cross-site origin refused, remove, old login gone, sign-out |

The A3 tests run Better Auth's real request handler and the drizzle D1 driver over a real SQLite (`tests/_bloomops-db.mjs` wears D1's interface, including `raw()` and `batch()`), built from the committed migrations, so the code path is the one Cloudflare runs. Two defects found and fixed during the Worker smoke, neither reachable from unit tests: the Origin check refused `127.0.0.1` while wrangler answered as `localhost` (now the loopback siblings are trusted in development only), and on the server-component path Next reports `x-forwarded-proto: https` for a loopback host, which selected the `__Secure-` cookie name (now a loopback host is always plain http for the purpose of picking the development origin).

### Staging verification (A3)

The deploy workflow (`.github/workflows/deploy-staging.yml`) now sets `BLOOMOPS_AUTH_SECRET`, `BLOOMOPS_RESEND_API_KEY`, and optionally `BLOOMOPS_MAIL_FROM` on `bloomops-staging` from `STAGING_BLOOMOPS_AUTH_SECRET`, `STAGING_BLOOMOPS_RESEND_API_KEY`, `STAGING_BLOOMOPS_MAIL_FROM`; runs the bootstrap from `STAGING_BLOOMOPS_WORKSPACE_NAME` (default "BloomOps Staging"), `STAGING_BLOOMOPS_OWNER_EMAIL`, `STAGING_BLOOMOPS_OWNER_NAME`, `STAGING_BLOOMOPS_ADMIN_EMAIL`, `STAGING_BLOOMOPS_ADMIN_NAME`; and no longer reads `STAGING_LTB_ACCESS_CODES` or `STAGING_LTB_SESSION_SECRET` (delete them from the repository). `BLOOMOPS_APP_URL` for staging is committed in `wrangler.jsonc`. The verifier fails the run when authentication is not configured and warns when mail is not. It cannot sign in: no endpoint exposes tokens, so the one manual acceptance step is a real click on a magic link from a real mailbox.

First run on this branch, GitHub Actions run 33991041976 (commit `438b062`, 20:45:22Z to 20:47:45Z): identity `hello@bloomwired.io`, staging D1 and R2 confirmed, inherited schema and migrations applied, domain migrations step succeeded (`0002_a3_auth_membership.sql` applied to `bloomops-staging`), Worker version `c63e1d10-17f6-4ee2-816c-ac0f25d9f329` deployed with bindings `DB` (bloomops-staging), `FILES` (bloomops-files-staging), `ASSETS`, `BLOOMOPS_ENV` staging, `BLOOMOPS_APP_URL`. The secrets step found no `STAGING_BLOOMOPS_AUTH_SECRET` (error logged) and no Resend key (warning); the bootstrap step found no addresses and skipped. The verifier confirmed build `438b062` was being served, anonymous `/api/infra` 401, and `/` redirecting to `/sign-in`, then failed because `/sign-in` answered 500: without an auth secret the Worker could not build its Better Auth instance and the server component surfaced that as an error. That was fail-closed but unreadable, so the next commit makes an unconfigured deployment render a "Sign-in is not set up" state on the signed-out pages, answer 503 on routes, and report `auth.configured: false` on the health probe; the verifier accepts that page state and fails on its explicit configuration check instead, naming the missing secret. The run also warned that `BLOOMOPS_MAIL_TRANSPORT` existed only at the top level of `wrangler.jsonc`; staging and production now name `resend` explicitly, and a named Resend transport without a key is treated as "not ready" rather than a configuration crash.

Second run, GitHub Actions run 33991512885 (commit `8bbc227`, 20:55:13Z to 20:57:19Z): same provisioning, schema, and migration steps, Worker version `5d4b23ca-7d53-4322-989f-ac7ca1b08c73` deployed with `BLOOMOPS_MAIL_TRANSPORT` now bound for staging and no wrangler vars warning. The verifier passed 11 live checks against the deployed Worker: build `8bbc227` served, anonymous `/api/infra` 401, `/` redirecting to `/sign-in`, `/sign-in` rendering the not-configured state with status 200, an inherited `ltb_session` cookie refused, `/gate` no longer a login page, `POST /api/auth` with a code refused without a cookie, `GET /api/auth` not the old session endpoint, `/api/health` answering `environment: staging` and `schema: { migrations: 3, ok: true }`; it then failed, as designed, at "authentication is configured" with `{ configured: false, mail: "none" }` and the instruction to set `STAGING_BLOOMOPS_AUTH_SECRET`. The old access-code flow is therefore proven gone on staging, the A3 migration is proven applied there, and the remaining checks (identical responses for unknown addresses, refused bad links and foreign callback origins, refused anonymous membership routes) run once the secret exists.

Fresh remote database: the "Verify zero-to-current migration" workflow ran on this branch (run 33991041981, commit `438b062`) because its workflow file changed, and succeeded: a disposable remote D1 went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the three Drizzle migrations including `0002_a3_auth_membership.sql`, took a second pass as a no-op, and was deleted with the account inventory unchanged.

Values that still have to be supplied as repository secrets before staging can sign anybody in: the auth secret, the Resend key, and Ellen's and Ary's addresses for the bootstrap. None were guessed. Until they exist every run of the workflow fails at "authentication is configured", which is the intended signal. The live Worker is not reachable from this build environment (egress policy), so run evidence comes from the workflow logs.

### Intentionally deferred to A4 and later

- the authorization engine (roles beyond Owner/Admin member management, client, service, and project assignment scope, record visibility, capabilities such as `finance.view`), and all client-facing authorization rules
- linking a Client-role membership to `client_contacts.user_id` on acceptance
- a workspace switcher for a person with several memberships (today the earliest active membership is the one; `resolveWorkspaceAccess` already takes a `workspaceId`)
- member and invitation management screens (the routes exist; A5 owns the shell), profile editing, session listing and revocation from the UI
- database-backed rate limiting for Better Auth (memory storage is per isolate), email change, and any second sign-in method
- `account.issuer NOT NULL`, with the first OAuth or credential provider

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
| `LTB_ACCESS_CODES`, `LTB_SESSION_SECRET` | `lib/session.mjs`, `middleware.js`, `app/api/auth/route.js`, `docs/ACCESS-CODES.md` | Removed in A3 with the access-code login. `LTB_SESSION_SECRET` survives only as the Gmail token encryption key in the inherited prospecting code (`lib/secret-box.mjs`, `app/api/gmail/*`), which goes with that code |
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
- authorization beyond "active member of the workspace" and "Owner or Admin manages members" does not exist yet; every inherited route still treats any active member as it treated an access-code holder, with Owner and Admin as `admin`. A4 builds the engine
- Better Auth's rate limiter uses memory storage, which is per Worker isolate; the magic-link path is still bounded (5 requests a minute per IP per isolate) but not globally
- staging cannot sign anybody in until the repository secrets named in the deploy workflow exist (auth secret, Resend key, bootstrap addresses), and a real magic-link click from a real mailbox remains a manual step
- the `resend` transport sends from `onboarding@resend.dev` until `BLOOMOPS_MAIL_FROM` names an address on a domain verified in Resend; that sender only delivers to the Resend account's own mailbox
- prospecting code, skills, tools, `services/audit-render/`, the quarantined `workers/bloomwired-review/`, and the Leadsthatbloom report markdown files at the repository root remain until replacement phases make removal safe
- the inherited schema is still bootstrapped from `schema.sql` plus postcondition-aware migrations. A2 added the BloomOps domain schema beside it. The inherited schema is retired only when the prospecting code that reads it is removed
- `open-next.config.ts` configures no cache. Every inherited route is dynamic, so nothing is lost today. Revisit when a route needs ISR
- `compatibility_date` is `2025-05-01`. Wrangler suggests a newer date. Raise it deliberately with a test pass
- the production D1 id is a placeholder until production is provisioned deliberately
- two migration systems coexist in one database until the inherited prospecting schema is retired: keep running the inherited bootstrap before the domain migrations on a brand-new database, as the workflow does, even though either order works today
- the BloomOps client table is physically named `bloomops_clients` until the inherited `clients` table is dropped

## Intentionally Not Done in A3

- no authorization engine, capabilities, assignment scope, or visibility rules (A4)
- no member or invitation management UI, no shell or navigation changes, no redesign of the sign-in screens (A5)
- no social OAuth, no email and password, no Better Auth organization plugin
- no production provisioning, secrets, or deployment
- no removal of prospecting code beyond the access-code login itself
- no change to the Pages/editor system

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
3. `docs/phases/A4.md` and `docs/DOMAIN_MODEL.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

A4, Authorization engine. Not started. A3's primitives to build on: `lib/bloomops/access.mjs` (`getAccess`, `requireAccess`, `requireIdentity`, `originAllowed`), `lib/bloomops/membership.mjs` (`resolveWorkspaceAccess`, `canManageMembers`, `setMembershipStatus`), and the `member_capabilities`, `client_assignments`, and `service_assignments` tables from A2.

## Last Verification

2026-09-05, A3 execution. Local results are in "Local verification (2026-09-05)" under "Authentication and Membership (A3)": 2680 tests pass, `npm run build` and `npm run cf:build` exit 0, the external verifier passes 21 of 21 and the end-to-end smoke 40 of 40 against the local Worker, and the bootstrap CLI is idempotent against the local D1. Staging runs 33991041976 and 33991512885 deployed and migrated successfully; the second passed 11 live checks (including the A3 migration present and the access-code flow gone) and failed only at the explicit "authentication is configured" check for lack of the new repository secrets. The zero-to-current workflow (run 33991041981) proved a fresh remote D1 reaches the A3 schema. Details under "Staging verification (A3)". No production resource was touched. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`).

Earlier the same day, A2 execution. Local results are in "Domain Schema (A2)". GitHub Actions run 33968508433 applied the two domain migrations to `bloomops-staging`, and run 33968734285 (commit `ea075bc`) deployed and passed all 16 live checks, including the domain schema check. Run 33987071853 (commit `ee96d17`) then proved the fresh-remote case: a disposable D1 named `bloomops-a2-zero-verify` went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the Drizzle migrations, took a second pass as a no-op, and was deleted, with the account inventory and `bloomops-staging` unchanged. A2 satisfies every verification item in `docs/phases/A2.md`, including "fresh staging DB migrates from zero". No production resource was provisioned. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

Earlier the same day, A1 execution. Results are in "Verified Working". Later the same day the remote staging step ran from GitHub Actions (run 33966322588) and passed every check, as recorded under "Staging Deployment". A1 satisfies every verification item in `docs/phases/A1.md`. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `--dry-run`, `wrangler dev`).
