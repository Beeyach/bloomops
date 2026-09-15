# BloomOps Documentation Index

Current owner priority: [N2E in-app notifications](phases/N2.md#n2e-bounded-contract--useful-in-app-notifications). [Local evidence](previews/notifications/README.md) records the independent-audit handoff; PR77/N2D is merged; [BUILD_STATE](BUILD_STATE.md) records exact release gates and the next bounded task. Preserve the accepted [prospect sheet](PROSPECTING_SHEET.md) and [Bloomsi branding](BRANDING.md). Earlier release entries below are historical.

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
- `RELEASE_D.md` — closed Systems-only release and D1–D7 sequence
- `RELEASE_E.md` — Ads boundaries and E1–E5 sequence; `phases/E2.md` and `phases/E2B.md` record accepted internal creative production; `phases/E3.md` and `phases/E3A.md` route approval/media work; E3A is closed on `618e18f`; E3B activation contract is next
- `PROSPECTING_ROADMAP.md` — approved P0–P5 scope; `phases/P0_P1.md` records the accepted fresh-workspace/profile slice; `phases/P2.md` owns accepted raw imports/receipts and manual skills/context export; structured result review/application is accepted; controlled audit journey acceptance is complete; `phases/P3.md` owns sender identity/content review and the P3B Google connection/timing preview and P3C1 connection reliability/P3C2 controlled delivery, with three separately authorized tests received and sender/paragraph presentation accepted, followed by P3C3 exact-thread reply/stop handling
- `ROADMAP.md` — later releases and sequencing
- `DESIGN_SYSTEM.md` — Bloomlab-derived visual language, tokens, component behavior, accessibility, and BloomOps adaptation rules
- `DESIGN_CHECKLIST.md` — per-screen visual QA and responsive/accessibility acceptance checklist
- `PAGES_SYSTEM.md` — inherited bloomtrack-pro Notion-style Pages/editor architecture and BloomOps adaptation rules
- `reference-code/bloomlab/` — local reference snapshots of the real Bloomlab design-system code; reference-only, never imported automatically into runtime

Do not automatically load every planning document into context.

## Earlier build records

These entries are historical. Use BUILD_STATE and the N2 contract above for current work.

**Active owner-directed phase: P3**, following locally accepted P2 on `feat/prospecting-p2-eligibility`. [P3](phases/P3.md) records confirmed Google Workspace/hello@bloomwired.io, P3A sender/draft/content approval/Overview and P3B connection/timing preview. [Google setup](GOOGLE_CONNECTION_SETUP.md) records verified local consent/refresh and the still-disabled controlled test gate. [P3C2 preview](previews/prospecting-p3c2/README.md) records accepted local delivery/recovery verification; Google accepted two separately authorized tests; the owner confirmed receipt and visible compact sign-off but requested restored paragraph spacing. The subsequently authorized spaced test was accepted once and the owner replied perfect; presentation is accepted and test sending remains disabled. [P3A preview](previews/prospecting-p3a/README.md) records actual local captures and verification; [BUILD_STATE](BUILD_STATE.md) owns current review acceptance. P1 remains draft PR #60 at `67b94eb`; subsequent work is local/uncommitted and undeployed. Full P3–P5 remain unfinished; Ads E3B is deferred. The following entries retain accepted release history.
P3C3B live reply acceptance now passes: one exact-thread incoming observation and durable hold. [P3C3C preview](previews/prospecting-p3c3c/README.md) records recipient protection across duplicate prospects, with52 focused,20 native and51 browser checks passing; independent Sol High review is accepted. The owner’s standing direction removes repeated approval prompts for necessary current test-conversation checks. Broader discovery/recovery and scheduling/Results remain unfinished; see BUILD_STATE.


Release E — Ads is underway; E1, E2 and [E3A](phases/E3A.md) are closed on verified `618e18f`, with 24 migrations. The first unfinished task is E3B’s activation contract under [E3](phases/E3.md). See [RELEASE_E](RELEASE_E.md) and [BUILD_STATE](BUILD_STATE.md).

Release D — Systems Delivery is closed. Release C is closed for forward development on verified `main` baseline `1638e3ed9fd33c3725aa3449935b08335b73f1a9`.

Current state: **Release D is CLOSED**, verified `844ac905541df9e6fccb7dc313ab0a8d517da319` through PR #51. [D7 closure](phases/D7.md) and [BUILD_STATE](BUILD_STATE.md) record final gates. [Internal pilot](phases/PILOT.md) follow-ups: actionable onboarding deployed through PR #52 as `9bf27e0`; both release gates passed with 22 migrations. The badge/icon follow-up is deployed through PR #53 as `d36ff5f` with both gates passed. Compact title-centered icons are deployed through PR #54 as `707d2be`, with both release gates passed. Current development phase: [Release E](RELEASE_E.md) [E1 campaign work](phases/E1.md) closed through PR #55 as `f2a2bb0`, with both exact-source gates passed and 22 migrations. [E2](phases/E2.md) and [E2A](phases/E2A.md) contracts record E2A closed through PR #56 on verified `2a73193`, with both exact-SHA gates passed and 23 migrations. [E2B](phases/E2B.md) and E2 are closed through PR #57 on verified `09de9d6`, with both exact-SHA gates and live staging acceptance passed; 23 migrations remain. [E3A evidence foundation](phases/E3A.md) is closed through PR #59 on `618e18f`, with 24 migrations and both gates passed. Next: E3B activation contract under [E3](phases/E3.md). See BUILD_STATE for the current handoff. Human pilot setup and reusable quick picks remain follow-up work.

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

Current state and successful gate run IDs: [BUILD_STATE.md](BUILD_STATE.md). Release boundaries: [RELEASE_D.md](RELEASE_D.md). The approved pure D2 Slice 1 contract is [D2_SLICE1.md](phases/D2_SLICE1.md); later slices remain separately gated. [PERFORMANCE_INTEGRATION.md](PERFORMANCE_INTEGRATION.md) records the accepted optimization scope and closure. PERF1–PERF4/query/placement reports remain historical evidence: the approximately 500 ms target was not fully met, Smart Placement was rejected/reverted, and further performance work is deliberately deferred. Ads remains Release E.

Systems operating guide: [Running a Systems build](SYSTEMS_DELIVERY.md).

## Phase Reading Matrix

| Phase | Required planning docs beyond AGENTS.md + BUILD_STATE |
|---|---|
| E3A | `RELEASE_E.md`, `phases/E3.md`, `phases/E3A.md`, accepted `phases/E2B.md`, current review/File schema, migrations, canonical approval/File/R2/portal callers and relevant `DOMAIN_MODEL.md` |
| E2B | `RELEASE_E.md`, `phases/E2.md`, `phases/E2B.md`, accepted `phases/E2A.md`, canonical Content/Project/Files/approval access, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md` |
| E2A | `RELEASE_E.md`, `phases/E2.md`, `phases/E2A.md`, current Content schema/access/File/approval paths and relevant `DOMAIN_MODEL.md` rules |
| E1 | `RELEASE_E.md`, `phases/E1.md`, relevant Work/Ads sections of `DOMAIN_MODEL.md` and `PRODUCT_SPEC.md`, `DESIGN_SYSTEM.md`, `DESIGN_CHECKLIST.md` |
| Internal pilot | `phases/PILOT.md`, `SYSTEMS_DELIVERY.md` |
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

P3C3D1 verified returned delivery identity is accepted locally:121 focused,24 native D1 and51 browser checks, final build, additive0033 fresh/repeat/populated migration proof and one Sol High review pass. See [BUILD_STATE](BUILD_STATE.md), the [P3 contract](phases/P3.md) and [identity model](DOMAIN_MODEL.md#verified-provider-identities-p3c3d1-local-implementation). Next is bounded broader discovery against registered identities; no new mailbox read or send was activated.

P3C3D2 bounded history/metadata discovery is accepted locally:128 distinct focused tests, both real workerd readers, final build and one Sol High review plus its focused correction re-review. It matches registered returned identities across threads, with conservative unresolved cursor behavior. No route or mailbox monitoring is enabled. Next is durable discovery progress/recovery holds and explicit bootstrap coverage; see [BUILD_STATE](BUILD_STATE.md) and [P3](phases/P3.md).

P3C3D3 saved discovery progress and recovery holds are accepted locally:183 focused tests,22 native D1 checks, additive0034 fresh/repeat/populated migration proof, Worker build and one Sol High review pass. Startup remains explicitly unverified and empty checks cannot remove holds. Next is historical coverage and gap recovery; no route/job or live mailbox access is enabled. See [BUILD_STATE](BUILD_STATE.md), [P3](phases/P3.md) and the [saved discovery model](DOMAIN_MODEL.md#saved-discovery-runs-p3c3d3-local-implementation).

P3C3D4A historical metadata collection is accepted locally:130 focused tests, both affected real workerd readers, final Worker build, preservation checks and one Sol High review pass. No schema/UI/route or live access changed. Collection returns matched and unassigned proposals without claiming coverage or advancing a cursor. Next is guarded durable recovery and history catch-up; see [BUILD_STATE](BUILD_STATE.md), [P3](phases/P3.md) and [collection proposals](DOMAIN_MODEL.md#historical-collection-proposals-p3c3d4a).

P3C3D4B saved recovery evidence is accepted locally:174 focused tests,29 native D1 checks including100 targets/80 evidence records, additive0035 migration proofs, final build and one Sol High review. Recovery preserves operational cursors and holds. Next is the local mailbox review surface; [BUILD_STATE](BUILD_STATE.md) owns evidence.

P3C3D4C mailbox review is accepted locally:43 focused tests,61 browser checks plus2 mobile-control checks, final build, preservation and one Sol High review with its focused correction re-review. [Visual preview](previews/prospecting-p3c3d4c/README.md). No migration or live collection; [BUILD_STATE](BUILD_STATE.md) records the next live scope boundary.

P3C3D4D prerequisites are live-verified: the existing connection and three exact owner test threads, three registered identities, prior reply/hold preserved. Broader mailbox collection remains pending the owner's scope decision; see [BUILD_STATE](BUILD_STATE.md). No new implementation or migration.

P3C3D4D approved live mailbox collection is verified:4 messages read,1 matched reply/0 unassigned,catch-up complete,8 browser checks. Coverage remains unverified and all test conversations held. Existing preview flags remain disabled; [BUILD_STATE](BUILD_STATE.md) records evidence and next local delivery-status scope.

P3C3E1 delivery-status field parsing is accepted locally:139 focused tests, syntax/preservation, and one Sol High review with its focused correction re-review. No application caller, provider reader or automatic bounce classification. Next is bounded MIME extraction and exact-message/recipient association; [BUILD_STATE](BUILD_STATE.md) owns current evidence.

P3C3E2 MIME extraction and exact accepted-message/recipient association are accepted locally:277 focused tests, Worker build/preservation and one Sol High review (72 independent association tests). No provider/caller/persistence or automatic verdict. Next agent-owned code is bounded exact-candidate retrieval; see [BUILD_STATE](BUILD_STATE.md).

P3C3E3 exact saved-report provider retrieval is accepted locally:303 distinct focused checks including real workerd, preservation and one Sol High review (97 independent tests). No app caller/persistence/live access or automatic verdict. Next agent-owned code is guarded durable report evidence; see [BUILD_STATE](BUILD_STATE.md).

P3C3E4 guarded durable report evidence is accepted locally:230 focused tests,19 native D1 checks, Worker build/migration/preservation and one Sol High review (152 independent tests). Migration0036 adds two empty local tables. No UI/route/live access or automatic verdict. Next agent-owned code is the report review surface; see [BUILD_STATE](BUILD_STATE.md).

P3C3E5 Delivery reports review is accepted locally:72 focused tests,61 browser checks, final build/preservation and one Sol High review (11 independent tests). [Visual preview](previews/prospecting-p3c3e5/README.md). No migration/live action; next local task is report-linked human stop review. See [BUILD_STATE](BUILD_STATE.md).

P3C3E6 report-linked human stop review is accepted locally:101 focused tests,52 built-browser checks, final build/preservation and one Sol High review with its focused correction re-review (41 independent tests). [Visual preview](previews/prospecting-p3c3e6/README.md). No migration/live action; next local task is mailbox coverage/hold resolution. See [BUILD_STATE](BUILD_STATE.md).

P3C3F1 reviewed monitoring checkpoint is accepted locally after one Sol High review and focused correction re-review. [Visual preview](previews/prospecting-p3c3f1/README.md). Additive migration0037 preserves existing records; no provider request or hold release. [BUILD_STATE](BUILD_STATE.md) owns evidence. Further email work is paused by owner; P4 Pages is active.

P4 Pages is active by owner direction; P3 email is paused. [P4 contract](phases/P4.md) scopes the first create/edit/save slice and later hierarchy/sharing work. [Pages inventory](PAGES_SYSTEM.md) identifies the reused editor and remaining legacy seams. BUILD_STATE owns acceptance.

P4A workspace Pages is accepted locally:103 focused checks,45 built-browser checks, final build/migration/preservation and one Sol High review. [Visual preview](previews/pages-p4a/README.md). Next is P4B hierarchy/search; email remains paused. See [BUILD_STATE](BUILD_STATE.md).
