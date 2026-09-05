# BloomOps Build State

## Current Release

Release A: Foundation, Auth, Clients, Services, Onboarding, Client Portal

## Current Phase

A0 (Create BloomOps safely) is **complete**. See Last Verification.

Next phase spec: `docs/phases/A1.md`

Documentation index: `docs/INDEX.md`

## Source

BloomOps was seeded from the clean tracked `origin/main` snapshot of `Beeyach/bloomtrack-pro`.

| Item | Value |
|---|---|
| Source repository | `Beeyach/bloomtrack-pro` |
| Source ref | `origin/main` |
| Source commit SHA | `270d9543381841fc05bc50dee4b8c163bf120e2f` |
| Source tree SHA | `bdcadaa8577eab35add61b77e4555cf34d97937d` |
| Source commit date | 2026-08-31T01:34:56Z |
| Source commit subject | `merge: main's local-changes sync (additive only)` |
| Tracked files imported | 974 |
| Import method | `git archive <SHA>` from a fresh shallow clone, extracted into the BloomOps working tree |
| Imported on | 2026-09-05 |

The SHA was confirmed two ways: the GitHub API listing of `main` and a fresh shallow clone (`git rev-parse HEAD`). Every imported file was checked blob-for-blob against the source index. All 974 entries are byte-identical. No untracked or ignored files from the source were copied.

BloomOps Git history is fresh. It contains only BloomOps planning commits and the A0 import commit. The source commit object does not exist in the BloomOps object store.

## Completed

- Planning documentation structure (`CLAUDE.md`, `docs/INDEX.md`, `docs/PRODUCT_SPEC.md`, `docs/DOMAIN_MODEL.md`, `docs/RELEASE_A.md`, `docs/ROADMAP.md`, `docs/DESIGN_SYSTEM.md`, `docs/DESIGN_CHECKLIST.md`, `docs/PAGES_SYSTEM.md`, `docs/reference-code/bloomlab/`, `docs/phases/A0` through `A11`)
- A0: source snapshot imported, planning docs preserved, source SHA recorded, install/test/build verified

## Preserved Planning Files

All 35 pre-existing BloomOps planning entries under `CLAUDE.md` and `docs/` were unchanged by the import (index hashes compared before and after).

No source file collided with a protected planning path. The source snapshot did add its own files under `docs/` alongside the BloomOps planning docs:

- `docs/ACCESS-CODES.md`: Leadsthatbloom access-code auth documentation (legacy for BloomOps, replaced in A3)
- `docs/superpowers/plans/*` and `docs/superpowers/specs/*`: historical Leadsthatbloom planning documents

These are inherited reference material, not BloomOps planning truth. `docs/INDEX.md` remains the authority on which documents to read.

## Pages System Preservation

All A0 anchor files were imported unchanged and verified byte-identical to the source:

- `components/RichEditor.jsx`
- `components/PageView.jsx`
- `components/BlockInsertMenu.jsx`
- `components/DatabaseViewNode.jsx`
- `components/PublicReader.jsx`
- `lib/editor-extensions.mjs`
- `lib/page-tree.mjs`
- `lib/page-share.mjs`

Nothing under `components/` or `lib/` was adapted, restyled, or moved. See `docs/PAGES_SYSTEM.md` for the later migration strategy.

## Verified Working

Verified on the imported snapshot in a clean Linux container (Node 22.22.2, npm 10.9.7):

| Check | Command | Result |
|---|---|---|
| Install from lockfile | `npm ci` | OK, 465 packages, lockfile in sync |
| Tests | `npm test` (`node --test tests/**/*.test.mjs`) | 2605 tests, 2605 pass, 0 fail, 0 skipped |
| Production build | `npm run build` (Next.js 15.4.11) | exit 0 |

Build warnings, both pre-existing in the source snapshot and not failures:

- `@cloudflare/next-on-pages` uses `process.release`, which Next flags as unsupported in the Edge Runtime
- edge runtime on a page disables static generation for that page

`pages:build` (`@cloudflare/next-on-pages`) and `wrangler` were not run. Nothing was deployed.

## Current Infrastructure

None owned by BloomOps yet.

The imported `wrangler.toml` still names the Leadsthatbloom Cloudflare Pages project `bloomtrack-pro` and its production D1 binding, and its `[env.preview]` block points at the same database. `workers/bloomwired-review/wrangler.toml` names the Leadsthatbloom R2 bucket `bloomwired-pdfs`. Do not run `wrangler deploy`, `wrangler pages deploy`, or any D1/R2 command against this configuration. A1 replaces it with isolated BloomOps resources.

Do not assume any Leadsthatbloom production resource belongs to BloomOps.

## Known Risks

- inherited application is still Leadsthatbloom in behavior, naming (`package.json` name `bloomtrack-pro`), and UI
- inherited deployment configuration references Leadsthatbloom Cloudflare resources (see Current Infrastructure)
- inherited authentication is access-code based (`docs/ACCESS-CODES.md`, `middleware.js`, `lib/session.mjs`) and temporary for BloomOps
- inherited root application is centered around `ProspectsApp.jsx`
- prospecting-specific code, skills, tools, and Leadsthatbloom report markdown files at the repository root remain until replacement phases make removal safe
- prospect data exports are tracked at the repository root (`all-prospects.json`, `all-emailed-prospects.csv`, `ellen-coaches.csv`, `done-coaches.csv`, `coaches.json`); they are Leadsthatbloom data, not BloomOps records, and should be removed in a later cleanup phase once nothing imports them
- `.open-next/` build output is tracked in the source snapshot and was imported as-is
- `.claude/launch.json` inherited launch configs reference `wrangler pages dev`; do not use them against Leadsthatbloom bindings

## Intentionally Not Done in A0

- no rename of the package or app
- no removal of prospecting code or data files
- no change to `wrangler.toml`, D1, R2, secrets, or DNS
- no auth, schema, or UI changes
- no A1 work

## Context Discipline

Claude Code should not automatically read every planning document.

For the next phase, read:

1. `CLAUDE.md`
2. this file
3. `docs/phases/A1.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

A1, Infrastructure isolation

## Last Verification

2026-09-05, A0 execution:

- `pwd`, `git status`, branch, and remotes inspected before action; working tree was clean on `claude/bloomops-a0-phase-xhae5r`
- target confirmed as `Beeyach/bloomops`, private, default branch `main`
- BloomOps `origin` points only to `https://github.com/Beeyach/bloomops`
- source fetched fresh; SHA `270d9543381841fc05bc50dee4b8c163bf120e2f` recorded above
- 974 tracked files imported and verified byte-identical; 35 planning entries unchanged
- 8 Pages anchors verified present and identical
- `npm ci`, `npm test` (2605/2605), `npm run build` (exit 0) all passed
- `git status` after build showed only the staged import; `.next/` and `node_modules/` are ignored by the imported `.gitignore`
- `Beeyach/bloomtrack-pro` was read-only throughout: no commits, no pushes, no config or resource changes
