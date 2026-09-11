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
- `RELEASE_B.md` — closed Work Core and the B1–B7 implementation sequence
- `RELEASE_C.md` — closed Social scope and C1–C7 history
- `RELEASE_D.md` — current Systems-only release and D1–D7 sequence
- `ROADMAP.md` — later releases and sequencing
- `DESIGN_SYSTEM.md` — Bloomlab-derived visual language, tokens, component behavior, accessibility, and BloomOps adaptation rules
- `DESIGN_CHECKLIST.md` — per-screen visual QA and responsive/accessibility acceptance checklist
- `PAGES_SYSTEM.md` — inherited bloomtrack-pro Notion-style Pages/editor architecture and BloomOps adaptation rules
- `reference-code/bloomlab/` — local reference snapshots of the real Bloomlab design-system code; reference-only, never imported automatically into runtime

Do not automatically load every planning document into context.

## Current Build

Release D — Systems Delivery is the active release. Release C is closed for forward development on verified `main` baseline `1638e3ed9fd33c3725aa3449935b08335b73f1a9`.

Current phase: **PERF4 — staging timing integration implemented; extended verification passed; live correlation remains required. PERF3/PERF4 remain OPEN; D2 remains BLOCKED.**

Release A closed after A11 PR #14 merged as `3deed08d8db2a92fcf4dc29a6a879a9945260049`. Read-only preflight verified [Deploy staging 34175768644](https://github.com/Beeyach/bloomops/actions/runs/34175768644) and [remote zero-to-current 34175768643](https://github.com/Beeyach/bloomops/actions/runs/34175768643) completed successfully on that exact SHA.

B1 closed after PR #15 merged as `cacb2d3b8f4ff634fb5a3470a4fd5f91930ef2c1`. Read-only preflight confirmed [Deploy staging 34182639418](https://github.com/Beeyach/bloomops/actions/runs/34182639418) and [remote zero-to-current 34183581349](https://github.com/Beeyach/bloomops/actions/runs/34183581349) succeeded on that exact SHA.

B2 closed after PR #16 merged as `74eb09a619516ae4969622f5e79a64c35d300d39`. Read-only preflight confirmed [Deploy staging 34190261299](https://github.com/Beeyach/bloomops/actions/runs/34190261299) and [remote zero-to-current 34190261285](https://github.com/Beeyach/bloomops/actions/runs/34190261285) succeeded on that exact SHA.

B3 closed after PR #17 merged as `884051d2c2308839f95ecdac74c9d896edf221c5`. Read-only preflight confirmed [Deploy staging 34199099414](https://github.com/Beeyach/bloomops/actions/runs/34199099414) and [remote zero-to-current 34199099461](https://github.com/Beeyach/bloomops/actions/runs/34199099461) succeeded on that exact SHA.

B4 closed after PR #18 merged as `ac71b358f27894af8dd8108f004499cd765fca69`. Read-only preflight confirmed [Deploy staging 34207017617](https://github.com/Beeyach/bloomops/actions/runs/34207017617) and [remote zero-to-current 34207017646](https://github.com/Beeyach/bloomops/actions/runs/34207017646) succeeded on that exact SHA.

B5 closed after PR #19 merged as `4c6dad696d15fac4094b8172788b5c72642ff757`. Read-only preflight confirmed [Deploy staging 34221696674](https://github.com/Beeyach/bloomops/actions/runs/34221696674) and [remote zero-to-current 34221696667](https://github.com/Beeyach/bloomops/actions/runs/34221696667) succeeded on that exact SHA.

B6 closed after PR #20 merged as `58647bda6dd40739b7670e6c0f907b6f33689e5d`. Read-only preflight verified [Deploy staging 34231285687](https://github.com/Beeyach/bloomops/actions/runs/34231285687) and [remote zero-to-current 34231727327](https://github.com/Beeyach/bloomops/actions/runs/34231727327) succeeded on that exact SHA. The zero verifier was manually dispatched because B6 was schema-free; disposable-database cleanup succeeded.

Release B closed with PR #21 on `c6509aa395a5db58310e2a0ae22a8a808082f77b`. [Deploy staging 34269402296](https://github.com/Beeyach/bloomops/actions/runs/34269402296) and [Verify zero-to-current 34269544255](https://github.com/Beeyach/bloomops/actions/runs/34269544255), including disposable cleanup, succeeded on that exact SHA.

C1 closed through PR #22 on `f1003c236cbce5102efcddd1bf7cda20e4f8ed8b`. Read-only checks verified [Deploy staging 34276571767](https://github.com/Beeyach/bloomops/actions/runs/34276571767) and [Verify zero-to-current 34276571760](https://github.com/Beeyach/bloomops/actions/runs/34276571760), including disposable-database cleanup, succeeded on that exact merge SHA.

C2 closed through PR #23 on `fed68697ff9f45e5c0228655bec2aaee3583f1c2`. Deploy staging `34291205923` and Verify zero-to-current `34291205922`, including disposable cleanup, succeeded on that exact SHA.

Release C and the automatic post-merge workflow follow-ups are verified on `1638e3ed9fd33c3725aa3449935b08335b73f1a9`: [Deploy staging 34478365157](https://github.com/Beeyach/bloomops/actions/runs/34478365157) and [Verify zero-to-current 34478365145](https://github.com/Beeyach/bloomops/actions/runs/34478365145) both succeeded on that exact SHA.

D1 is closed through [PR #31](https://github.com/Beeyach/bloomops/pull/31) on `e5bc81630c47fb6eb51e9bdc6be1687947683643`. Read-only checks verified [Deploy staging 34496059835](https://github.com/Beeyach/bloomops/actions/runs/34496059835) and [Verify zero-to-current 34496059875](https://github.com/Beeyach/bloomops/actions/runs/34496059875) succeeded on that exact SHA.

Current integration handoff: [PERF4_RESULTS.md](PERF4_RESULTS.md), with [historical accepted evidence and primitive overhead](evidence/PERF4_server_timing.json). `BUILD_STATE.md` records current verification and remaining gates. The custom Worker and staging-only Analytics Engine sink are implemented, with ordinary telemetry still disabled; nothing has been deployed. Signed-in staging correlation is required before a PERF4 PR or performance fix is justified. The original `PERF4_EXECUTION_PROMPT.txt` remains intact. [PERF3_RESULTS.md](PERF3_RESULTS.md), [PERF2_RESULTS.md](PERF2_RESULTS.md) and [PERF1_RESULTS.md](PERF1_RESULTS.md) retain historical evidence. Release sequence: `docs/RELEASE_D.md`. PERF3/PERF4 remain OPEN and D2 BLOCKED. Ads remains Release E; PERF4 references its existing destination only.

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
| C1 | `RELEASE_C.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/B7.md`, `phases/C1.md`, current schema/migrations, Client/Service authorization, activity, exact HTTP boundaries and Worker/browser harnesses |
| C2 | `RELEASE_C.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/C1.md`, `phases/C2.md` |
| C3 | `RELEASE_C.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/C1.md`, `phases/C2.md`, `phases/C3.md` |
| D1 | `ROADMAP.md`, `RELEASE_D.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `RELEASE_B.md`, `phases/B1.md` through `phases/B7.md`, `phases/D1.md`, current Work Core/Service/authorization/shell code and verification harnesses |
| PERF1 | `RELEASE_D.md`, `PRODUCT_SPEC.md`, `DOMAIN_MODEL.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md`, `phases/D1.md`, `phases/PERF1.md`, current internal/portal shell/navigation/auth/membership/authorization, Home/Clients/Work/Social/Systems/Team read models, OpenNext/Cloudflare configuration and verification harnesses; `PERF1_RESULTS.md` for implementation review |
| PERF2 | `phases/PERF2.md`, `PERF2_RESULTS.md`, `PERF1_RESULTS.md`, `DOMAIN_MODEL.md` request-local read composition, `lib/bloomops/read-batch.mjs`, current authorization and seven route read paths, navigation measurement/browser harnesses and native D1 regression smokes; exact base `d0533cb9a7b3646134cbc194767af669c75f5adf` |
| PERF3 | `phases/PERF3.md` complete Read First list; `PERF3_RESULTS.md`, `DOMAIN_MODEL.md` current-session workspace composition, `workspace-session.mjs`, current Better Auth/Drizzle integration, completion/performance/browser harnesses and issued-session regressions; exact base `62bcf019226db1e7e939fbcffc8909f41fbd577a` |

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
