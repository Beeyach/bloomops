# BloomOps Build State

## Current Release

Release A — Foundation, Auth, Clients, Services, Onboarding, Client Portal

## Current Phase

A0 — Create BloomOps safely

## Source

BloomOps will be seeded from a clean snapshot of `Beeyach/bloomtrack-pro`.

The exact source commit must be recorded when A0 is executed.

## Completed

None yet.

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

## Next Planned Phase

A1 — Infrastructure isolation

## Last Verification

Not yet run.
