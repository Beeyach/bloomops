# BloomOps Documentation Index

This repository uses selective context so coding agents do not need the entire product plan in every session.

## Always Read

For every implementation session:

1. `/AGENTS.md`
2. `/docs/BUILD_STATE.md`
3. the current phase file under `/docs/phases/`

## Read Only When Relevant

- `PRODUCT_SPEC.md` — product behavior, users, navigation, client experience
- `DOMAIN_MODEL.md` — entities, lifecycle, permissions, canonical data rules
- `RELEASE_A.md` — Release A scope and release-level acceptance
- `RELEASE_B.md` — Work Core scope and the B1–B7 implementation sequence
- `ROADMAP.md` — later releases and sequencing
- `DESIGN_SYSTEM.md` — Bloomlab-derived visual language, tokens, component behavior, accessibility, and BloomOps adaptation rules
- `DESIGN_CHECKLIST.md` — per-screen visual QA and responsive/accessibility acceptance checklist
- `PAGES_SYSTEM.md` — inherited bloomtrack-pro Notion-style Pages/editor architecture and BloomOps adaptation rules
- `reference-code/bloomlab/` — local reference snapshots of the real Bloomlab design-system code; reference-only, never imported automatically into runtime

Do not automatically load every planning document into context.

## Current Build

Release B — Work Core is the active release.

Current phase: **B7 — Release B Hardening implemented and locally verified; independent audit pending**

Release A closed after A11 PR #14 merged as `3deed08d8db2a92fcf4dc29a6a879a9945260049`. Read-only preflight verified [Deploy staging 34175768644](https://github.com/Beeyach/bloomops/actions/runs/34175768644) and [remote zero-to-current 34175768643](https://github.com/Beeyach/bloomops/actions/runs/34175768643) completed successfully on that exact SHA.

B1 closed after PR #15 merged as `cacb2d3b8f4ff634fb5a3470a4fd5f91930ef2c1`. Read-only preflight confirmed [Deploy staging 34182639418](https://github.com/Beeyach/bloomops/actions/runs/34182639418) and [remote zero-to-current 34183581349](https://github.com/Beeyach/bloomops/actions/runs/34183581349) succeeded on that exact SHA.

B2 closed after PR #16 merged as `74eb09a619516ae4969622f5e79a64c35d300d39`. Read-only preflight confirmed [Deploy staging 34190261299](https://github.com/Beeyach/bloomops/actions/runs/34190261299) and [remote zero-to-current 34190261285](https://github.com/Beeyach/bloomops/actions/runs/34190261285) succeeded on that exact SHA.

B3 closed after PR #17 merged as `884051d2c2308839f95ecdac74c9d896edf221c5`. Read-only preflight confirmed [Deploy staging 34199099414](https://github.com/Beeyach/bloomops/actions/runs/34199099414) and [remote zero-to-current 34199099461](https://github.com/Beeyach/bloomops/actions/runs/34199099461) succeeded on that exact SHA.

B4 closed after PR #18 merged as `ac71b358f27894af8dd8108f004499cd765fca69`. Read-only preflight confirmed [Deploy staging 34207017617](https://github.com/Beeyach/bloomops/actions/runs/34207017617) and [remote zero-to-current 34207017646](https://github.com/Beeyach/bloomops/actions/runs/34207017646) succeeded on that exact SHA.

B5 closed after PR #19 merged as `4c6dad696d15fac4094b8172788b5c72642ff757`. Read-only preflight confirmed [Deploy staging 34221696674](https://github.com/Beeyach/bloomops/actions/runs/34221696674) and [remote zero-to-current 34221696667](https://github.com/Beeyach/bloomops/actions/runs/34221696667) succeeded on that exact SHA.

B6 closed after PR #20 merged as `58647bda6dd40739b7670e6c0f907b6f33689e5d`. Read-only preflight verified [Deploy staging 34231285687](https://github.com/Beeyach/bloomops/actions/runs/34231285687) and [remote zero-to-current 34231727327](https://github.com/Beeyach/bloomops/actions/runs/34231727327) succeeded on that exact SHA. The zero verifier was manually dispatched because B6 was schema-free; disposable-database cleanup succeeded.

Current phase file: `docs/phases/B7.md`; release sequence: `docs/RELEASE_B.md`. B7 hardens Release B without adding features. `BUILD_STATE.md` records reproduced gaps, verification evidence and the remaining independent audit, user-controlled merge and exact-merge-SHA post-merge gates. Release C does not start automatically.

## Phase Reading Matrix

| Phase | Required planning docs beyond AGENTS.md + BUILD_STATE |
|---|---|
| A0 | `phases/A0.md` |
| A1 | `phases/A1.md` |
| A2 | `DOMAIN_MODEL.md`, `phases/A2.md` |
| A3 | `DOMAIN_MODEL.md`, `phases/A3.md` |
| A4 | `DOMAIN_MODEL.md`, `phases/A4.md` |
| A5 | `PRODUCT_SPEC.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/A5.md` |
| A6 | `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/A6.md` |
| A7 | `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `phases/A7.md` |
| A8 | `DOMAIN_MODEL.md`, `phases/A8.md` |
| A9 | `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `phases/A9.md` |
| A10 | `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/A10.md` |
| A11 | `RELEASE_A.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/A11.md` |
| B1 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B1.md` |
| B2 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B1.md`, `phases/B2.md` |
| B3 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B1.md`, `phases/B2.md`, `phases/B3.md` |
| B4 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B1.md`, `phases/B2.md`, `phases/B3.md`, `phases/B4.md` |
| B5 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B1.md`, `phases/B2.md`, `phases/B3.md`, `phases/B4.md`, `phases/B5.md`, current Worker/R2 configuration and test harnesses |
| B6 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B3.md`, `phases/B4.md`, `phases/B5.md`, canonical B1–B5 reads/authorization/UI and current test harnesses |
| B7 | `RELEASE_B.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B2.md` through `phases/B7.md`, merged A/B implementations and strongest local Worker/D1/R2/browser harnesses |

## Minimal Coding-Agent Prompt Pattern

Use a short prompt like:

> Read AGENTS.md, docs/BUILD_STATE.md, and the current phase file completely. Execute only the requested phase. Follow the scope boundary and verification requirements. Stop when that phase is complete.

Use the current phase file identified above and let it tell the coding agent which supporting docs are relevant. Do not load every planning document into every task.

## Documentation Rules

- `AGENTS.md` is the canonical source of permanent repository rules and product invariants.
- `BUILD_STATE.md` contains current factual project state.
- Phase files contain implementation scope for one bounded task.
- Product/domain documents contain durable planning truth.
- Do not duplicate large specs across phase files if a canonical planning document already owns that truth.
- When architecture changes by explicit user decision, update the canonical document first, then any affected phase files.
