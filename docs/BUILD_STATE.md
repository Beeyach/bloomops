# BloomOps Build State

## Current Release

Release A — Foundation, Auth, Clients, Services, Onboarding, Client Portal

## Current Phase

A0 — Create BloomOps safely

Current phase spec: `docs/phases/A0.md`

Documentation index: `docs/INDEX.md`

## Source

BloomOps will be seeded from a clean snapshot of `Beeyach/bloomtrack-pro`.

The exact source commit must be recorded when A0 is executed.

## Completed

Planning documentation structure is established:

- permanent repository instructions in `CLAUDE.md`
- selective-context index in `docs/INDEX.md`
- canonical product spec in `docs/PRODUCT_SPEC.md`
- canonical domain model in `docs/DOMAIN_MODEL.md`
- Release A acceptance in `docs/RELEASE_A.md`
- broader sequencing in `docs/ROADMAP.md`
- phase specs A0 through A11 in `docs/phases/`

No implementation phase is complete yet.

## In Progress

A0

## Verified Working

Not established yet.

## Current Infrastructure

Not established yet.

Do not assume any Leadsthatbloom production resource belongs to BloomOps.

## Known Risks

- inherited application is still Leadsthatbloom until the source snapshot is imported
- inherited deployment configuration references Leadsthatbloom resources
- inherited authentication is access-code based and temporary for BloomOps
- inherited root application is centered around `ProspectsApp.jsx`
- prospecting-specific code remains until replacement phases make removal safe

## Context Discipline

Claude Code should not automatically read every planning document.

For the current phase, read:

1. `CLAUDE.md`
2. this file
3. `docs/phases/A0.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

A1 — Infrastructure isolation

## Last Verification

Planning files verified present in the private `Beeyach/bloomops` repository.

A0 implementation verification has not yet run.
