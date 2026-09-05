# BloomOps Build State

## Current Release

Release A: Foundation, Auth, Clients, Services, Onboarding, Client Portal

## Current Phase

A1 (Infrastructure isolation) is implemented and verified locally. The remote staging deployment is the one A1 step still outstanding, because this environment holds no Cloudflare credentials. See "Staging Deployment" below for the exact commands.

Phase spec: `docs/phases/A1.md`

Documentation index: `docs/INDEX.md`

## Branch State

A0 (PR #2) was not merged into `main` when A1 started, so A1 is a second commit on the same branch, `claude/bloomops-a0-phase-xhae5r`, stacked on the A0 import commit. Each phase is its own commit and can be reviewed or reverted on its own.

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
- A1: deployment path migrated to Cloudflare Workers through OpenNext, three isolated environments configured, Leadsthatbloom infrastructure references removed or neutralized, generated output and prospect exports removed from version control, fresh-database bootstrap made reproducible, local runtime verified

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
| staging | `--env staging` | `bloomops-staging` | `bloomops-staging` | `bloomops-files-staging` | `staging` |
| production | `--env production` | `bloomops-production` | `bloomops-production` | `bloomops-files-production` | `production` |

Every environment also has the `ASSETS` binding for static files from `.open-next/assets`.

Configuration lives in `wrangler.jsonc`. Wrangler does not inherit `d1_databases`, `r2_buckets`, or `vars` between environments, so each environment declares its own resources in full. The staging and production `database_id` values are placeholders (`REPLACE_WITH_BLOOMOPS_STAGING_D1_ID`, `REPLACE_WITH_BLOOMOPS_PRODUCTION_D1_ID`) until `wrangler d1 create` has run for that environment. A remote deploy fails on a placeholder, which is the intended failure. Compatibility date is `2025-05-01` with `nodejs_compat` and `global_fetch_strictly_public`, the combination the inherited migration proved on this codebase. Raising the date is a later, deliberate change.

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

Not performed. This environment has no Cloudflare credentials (`wrangler whoami` reports not authenticated, no `CLOUDFLARE_API_TOKEN`), and `workers.cloudflare.com` is blocked by its egress policy. Everything up to the upload is proven locally. To finish A1, from a machine with Cloudflare access to the BloomOps account:

```
npx wrangler login
npx wrangler d1 create bloomops-staging           # paste the id into wrangler.jsonc env.staging
npx wrangler r2 bucket create bloomops-files-staging
npm run db:schema:staging
npm run db:migrate:staging
npx wrangler secret put LTB_ACCESS_CODES --env staging     # throwaway staging codes, never production values
npx wrangler secret put LTB_SESSION_SECRET --env staging
npm run deploy:staging
```

Then sign in on the staging URL and confirm `GET /api/infra` returns `environment: staging` with D1 and R2 `ok`. Production follows the same steps with `production` in place of `staging` once staging is accepted. Record the resulting URLs and database ids here.

## Known Risks

- inherited application is still Leadsthatbloom in behavior and UI, and `ProspectsApp.jsx` remains the root
- inherited authentication is access-code based (`LTB_ACCESS_CODES`, `LTB_SESSION_SECRET`) until A3
- prospecting code, skills, tools, `services/audit-render/`, the quarantined `workers/bloomwired-review/`, and the Leadsthatbloom report markdown files at the repository root remain until replacement phases make removal safe
- the inherited schema is bootstrapped from `schema.sql` plus postcondition-aware migrations. A2 replaces it with the BloomOps domain schema and Drizzle migrations
- `open-next.config.ts` configures no cache. Every inherited route is dynamic, so nothing is lost today. Revisit when a route needs ISR
- `compatibility_date` is `2025-05-01`. Wrangler suggests a newer date. Raise it deliberately with a test pass
- staging and production D1 ids are placeholders until the resources are created

## Intentionally Not Done in A1

- no Better Auth, no Drizzle domain tables, no Clients, no Onboarding, no navigation changes
- no removal of prospecting routes, components, or libraries
- no rename of inherited `LTB_*` login secrets (A3 replaces the login)
- no change to the Pages/editor system
- no remote resource creation or deployment (no credentials here)
- no A2 work

## Context Discipline

For the next phase, read:

1. `CLAUDE.md`
2. this file
3. `docs/phases/A2.md` and `docs/DOMAIN_MODEL.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

A2, Database foundation. Start only after the staging deployment above is verified.

## Last Verification

2026-09-05, A1 execution. Results are in "Verified Working". `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `--dry-run`, `wrangler dev`).
