# Release E — Ads

## Status and baseline

**E1 is CLOSED** through PR #55 on verified `f2a2bb0c7e665a5bd77cd010544a226c4da934a9`. Staging `34704707619` and zero-to-current `34704707656` passed on that SHA; live staging confirms 22 migrations. The [E2 creative contract](phases/E2.md) is prepared; [E2A](phases/E2A.md) is CLOSED through PR #56 on verified `2a73193`, with both release gates passed and 23 migrations. The [E2B internal creative interface](phases/E2B.md) is locally verified and independently reviewed; publication gates are pending. E2–E5 and Release E remain unfinished. [BUILD_STATE](BUILD_STATE.md) owns current execution status.

Start from verified `main` at `707d2bea55a7f5262a539d20313cbcb37abf3665` (PR #54), with 22 domain migrations. Staging `34702705746` and zero-to-current `34702705747` passed on that SHA. Release D remains closed. The owner's continuation after the Ads/model handoff authorizes this work; the older Release D closure instruction to wait before starting Ads has been satisfied. Human pilot destination setup and reusable onboarding quick picks do not block E1.

## Goal

Give the agency an Ads operating area for campaign delivery, creative production, client approvals and lightweight performance. Follow [ROADMAP](ROADMAP.md) and the Ads section of [PRODUCT_SPEC](PRODUCT_SPEC.md). BloomOps coordinates agency work; it does not execute campaigns or spend money at an ad provider.

## Canonical boundaries

### Campaign delivery uses Work Core

An Ads campaign delivery workstream is a canonical Project under an Ads Service Engagement. Its Milestones, Actions, Deliverables, Files, assignments and activity stay in Work Core. E1 presents this as **Campaign work**, with **Project status** explicitly labeled. In Progress, Completed or Approved never means an ad is running, stopped or accepted by a provider.

There is no separate Campaign table or parallel campaign task/status engine in E1. A Project may coordinate work for several external campaigns; E1 makes no one-to-one claim about provider campaign identity. Later required provider references or reported delivery facts may justify a small relational extension, with their own contract and provenance. They must not replace Project identity or lifecycle.

Eligibility follows the current same-workspace, same-Client chain:

`Project.serviceEngagementId → Service Engagement.serviceTypeId → Service Type.departmentId → Department.slug = 'ads'`.

Project names, Service names/slugs, Project department metadata, Content type and department membership are not substitutes. Client-level Projects without an Ads Service remain in Work. Catalog archival or Client/Service lifecycle must not silently close or hide otherwise readable Project work. A changed department relationship removes Ads eligibility immediately without deleting canonical work.

### Creative remains specialized Content

The existing `ad_creative` Content type is a format label inside Social. Current Content access explicitly permits a null Service or a canonical Social Service, and Content approvals reuse that predicate. It is not an Ads grant and must not be reclassified by inference.

Accepted E2A extends canonical Content with explicit, immutable Ads production context and a same-workspace, same-Client Ads Project relationship. E2B activates internal production through the bounded [interface contract](phases/E2B.md). Preserve existing Social records and routes as Social; do not migrate them based on their title, type, platform or department display text. Do not create a second editorial, File or approval engine.

E2A supplies the additive schema and Social containment; E2B defines the affected callers and exact Ads authority before activation. Reads and writes must prove both current Ads parent eligibility and their own Content authority. A Project-only assignment must not become Client/Service management authority or a blanket grant to existing Social Content. Changing a parent's visibility, relationship or assignment must revoke dependent access immediately. Creative ownership remains responsibility, not a grant.

E1 adds no creative records, associations, Social predicate changes or empty Creative controls.

### Approval is explicit evidence

Work Deliverables' Client Review and Approved states are coordinator-managed delivery facts. They are not formal client approval receipts. E1 may show them with their existing labels but must not count them as a client decision or expose a new approval action.

The later Ads approval slice should reuse canonical immutable Content rounds, with explicit Ads authorization and a safe portal projection. It must preserve requested snapshots, exact-round responses, revision/concurrency checks, retry behavior, current contact and visibility checks, revocation, cancellation and activity privacy.

Current Content snapshots contain text and platform labels; they deliberately exclude Files because uploaded assets have no immutable approval versions. An Ads image/video approval cannot be described as covering those mutable assets. Before offering approval of a media creative, its slice must define and verify immutable asset identity/version evidence through the existing File/R2 system. Copy-only approval must visibly say what was submitted. A delivery status or current asset link cannot stand in for that evidence. No new client approval UI ships under E1.

### Performance is reported data

Begin with bounded, manually recorded reporting facts in a later slice. Provider ingestion, attribution and execution are excluded. Store source, reporting interval, reporting timezone, currency for monetary values, recorder and recorded time alongside facts, scoped to the exact workspace and campaign Project. Distinguish the reporting interval from the time the agency entered it.

Spend, leads and bookings are the initial candidate inputs. Cost per lead and cost per booking derive from compatible inputs; missing facts and zero denominators yield unavailable values, not fabricated zero results. Corrections need current authorization, revision protection and history. Duplicate/overlapping intervals and mixed currencies cannot silently inflate aggregates. The performance contract must define these rules before storage or UI work.

Revenue is optional in the product specification and remains deferred until its source and the separate Finance permission are explicitly addressed. A campaign/Project assignment must not grant Finance access. No performance or revenue data becomes client-visible merely because a Project is shared.

## Permissions and presentation

- E1 uses current Work Project/child SQL authorization. Owner/Admin/Project Manager retain their existing roles; Team scope follows current Client, Service or explicit Project assignments. Restricted Project and child rules remain unchanged. Action-only scope stays in Work and grants no Ads parent or sibling view.
- Every list, facet, summary and overflow probe filters by current workspace/membership, assignment, visibility and Ads eligibility. Hidden work must not affect counts or empty states. Minimal readable parent labels are context, not parent navigation or management authority.
- E1 is internal only. Existing explicitly shared Work Projects/Deliverables/Files retain their current portal behavior; no Ads portal navigation or broader DTO is added.
- Reuse Bloom primitives and the accepted [design system](DESIGN_SYSTEM.md). Use restrained, distinct status badges and specific icons where useful; no dot-separated operational label strings or emojis. Title artwork uses the accepted 28px tile/16px glyph with title-centered alignment. Do not invent platform branding when no platform fact exists.
- Render useful current work and honest empty states. Do not display inactive Creative, Approvals or Performance tabs before they do something.

## Delivery sequence

| Slice | Bounded outcome | Contract/gate |
| --- | --- | --- |
| E1 | Internal Campaign work projection over existing Ads Projects, with scoped filters, delivery summaries and canonical Work links | [E1](phases/E1.md); no schema or writes |
| E2 | Explicit Ads creative context within canonical Content, with safe parent binding and production workflow | [E2](phases/E2.md) splits compatibility foundation [E2A](phases/E2A.md) from [E2B interface activation](phases/E2B.md); foundation closed, interface locally verified and reviewed, publication pending |
| E3 | Ads client approval of explicitly identified submitted copy/media | Define immutable media evidence and portal scope first; preserve canonical rounds and revocation |
| E4 | Lightweight manual reporting with source, interval, currency and correction provenance | Define metric storage, deduplication, calculations and permissions first; no revenue by default |
| E5 | Integrated acceptance and operating guidance | Exercise agency/client paths, revocation, migration compatibility and exact release gates |

These are implementation slices within the existing roadmap, not completed features. Each later slice needs its own bounded contract based on the preceding implementation. Routine technical choices within this scope do not require renewed owner approval; real product decisions and uncovered external actions still do.

## Exclusions and release acceptance

No ad-account connection, provider credentials, OAuth, publishing, spend controls, tracking pixels, conversion APIs, attribution engine, scheduled sync, new billing/queue/storage system, live client communication or production launch. No template-management UI or reusable onboarding quick picks in E1; those remain separate follow-up work.

Release E closes only when its accepted slices are implemented and verified, required Sol High reviews are resolved, safe internal/client behavior is demonstrated, documentation reflects actual capability, and the exact merged source passes the applicable staging and zero-to-current gates. Planning completion does not close E1 or Release E.
