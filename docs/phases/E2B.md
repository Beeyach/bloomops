# E2B — Internal Ads creative production and assets

## Status and baseline

**CLOSED** through [PR #57](https://github.com/Bloomwired/bloomops/pull/57) on verified `09de9d61d419add9a9e85d8e5e933936b5561154`. Implementation, local acceptance, one Sol High review and one focused re-review, exact-SHA staging/zero-to-current gates and live identity/health all pass. [BUILD_STATE](../BUILD_STATE.md) owns evidence and current execution status. Follow [E2](E2.md), [RELEASE_E](../RELEASE_E.md) and the canonical working agreements. The [E3](E3.md)/[E3A](E3A.md) contracts are prepared; E3A is closed on `618e18f`; E3B’s activation contract is next.

Start from accepted E2A, `2a73193d23e8e83673153e0e4512ddcae2bb6505` (PR #56), with 23 migrations. E2A already supplies immutable `production_area` / `ads_project_id`, exact parent integrity, replacement guards and Social/portal containment. Preserve those guards and old Social creation receipts. No additional migration is planned; if implementation exposes a missing database invariant, document the evidence and revise this contract before adding one. Preserve the original dirty checkout and branch; use the isolated execution checkout.

## Outcome and exclusions

An authorized internal user can select an existing Ads Project, create a creative, edit its copy/platforms, progress internal production and manage working assets. Everything uses canonical Content, Content platforms, File/R2 and activity records. Campaign delivery remains Work Core.

E2B adds no client approval, portal creative navigation, recording request, immutable media approval version, provider connection, publishing, spend control, metrics, templates, notification or new background job. E3 owns formal client approval and immutable media evidence. Never create a parallel creative table, status engine, Project, Action, Deliverable or duplicate File to represent the creative.

## Exact identity and authorization

Creation takes the Project ID from the route. Derive workspace, Client and Service from that current Project. Require its Service's canonical department slug to be `ads`, with every relationship in the same workspace and Client. Names, Content type, platform, Project department metadata and catalog archival are not alternative eligibility rules. Existing readable archived Client/Service/catalog records retain the E1 eligibility behavior.

Every read, mutation, retry, activity query and storage operation must prove live workspace/membership/role, exact stored Content/Project tuple, current Ads eligibility, Project readability and child visibility in SQL. Do not convert a truncated actor assignment list into the authorization source.

| Actor | Ordinary Ads Project | Restricted Project or restricted Ads Content/File |
| --- | --- | --- |
| Owner / Admin | Existing broad internal access | Existing broad internal access |
| Project Manager | Existing broad ordinary Project access; no new assignment prerequisite | Explicit assignment to the exact Project required |
| Team Member | Current Client, Service or exact Project assignment | Explicit assignment to the exact Project required |
| Client, inactive membership or wrong workspace | Unavailable | Unavailable |

These grants permit internal creative production, not parent management. Department membership, ownership and Action-only assignment grant nothing. A readable child may carry minimal Client/Service/Project labels; parent links/actions require independent authorization.

Keep `contentReadCondition` and `contentClientReadCondition` explicitly Social. Add a distinct Ads predicate and a narrowly internal, stored-context dispatcher for shared ID operations. Introduce server-loaded typed Ads Content/creation-parent resource descriptors for `authorization.mjs::inScope`; Project-only scope must work through both SQL and `evaluate`. Do not add a generic shortcut for any object containing `projectId`, or broaden Social descriptors. Current SQL authority remains mandatory even with a previously loaded descriptor or actor.

Ads Content is internal or restricted only. Raw Ads rows with client visibility, malformed context or an ineligible parent are unavailable, including to Owner/Admin through E2B. Restricted Content or File requires the Project assignment even when its parent is ordinary. Validate current and desired visibility at commit; a user cannot escape a restriction by changing it. Revoking membership, assignment, parent visibility or Ads eligibility must revoke the next read/write/retry/download without a new session.

## Routes and bounded read models

| Surface | Contract |
| --- | --- |
| `/ads` | Existing Campaign work view and query behavior preserved; add functional Campaign work / Creative navigation |
| `/ads/creative` | Ads-only list and scoped filters; genuine empty state and create link |
| `/ads/creative/new` | Bounded Project picker; optional `projectId` preselection and `q` search |
| `/ads/creative/:contentId`, `/ads/creative/:contentId/edit` | Ads-only detail/editor, working assets and internal production |
| `GET /api/bloomops/ads/creative` | Same strict list filters and bounded projection as the page |
| `POST /api/bloomops/projects/:id/creative` | Create canonical Ads Content under the current Project; use the existing `[id]` route directory |
| Existing `/api/bloomops/content/:contentId` and its platforms, transition and Files routes | Shared internal domain operations dispatch from immutable stored context; retain existing methods and response/error conventions |
| Existing generic File download/retry routes | Resolve the actual File family and live Content context; no Work-to-Content grant shortcut |

List query keys are exactly `clientId`, `serviceEngagementId`, `projectId`, `type`, `ownerMembershipId`, `stage`, `platform`, `page`. Reject unknown or repeated keys, invalid vocabulary, malformed IDs and non-integer pages outside 1–10000. Empty optional filters mean unset. Use 50 rows plus one overflow probe, ordered by `createdAt DESC, id DESC`; authorization and filters precede pagination. No unfiltered global totals. Stage filters offer only E2B stages; platform normalization follows canonical Content platform rules.

Filter choices come from currently readable Ads creative, with at most 200 distinct choices plus one overflow probe per dynamic facet and stable label/ID ordering. Project creation choices instead come from currently authorized Ads Projects, including those without creative. Return at most 200 plus one overflow probe, ordered by Project name then ID; `q` is trimmed, at most 120 characters, and literal substring search across Project/Client/Service names. The new page accepts only `q` and `projectId`. A selected readable Project is fetched separately if outside the bounded choices; an unreadable selection returns unavailable without its label. Overflow must visibly invite narrowing the search. Selection/search does not create or change a parent. No new options API is required; server-render these choices.

Owners reuse the canonical bounded active-internal-member picker (200 plus overflow), with the existing current-owner fallback on edit. Ownership never grants access. Each creative retains the existing 200 File-link ceiling; show the full authorized bounded result using canonical File order and lifecycle rules. Detail history shows at most 60 currently authorized canonical Content/File events, ordered by timestamp descending with stable event-ID tie-breaking, plus one authorized overflow probe. Hidden events must not influence overflow. Do not duplicate events while combining File and Content history.

Social collection/calendar/facet APIs and `/social` pages stay Social-only, even when shared ID-domain loaders learn Ads dispatch. An Ads ID on a Social detail/edit page is unavailable; a Social ID on an Ads page is likewise unavailable. Existing Client/Service Content creation routes continue to reject area and Project input. Keep approval request/withdraw/respond, portal Content/Files, recording requests/uploads, aggregates and navigation explicitly Social at read, retry and commit boundaries. Neither a forged client visibility nor changing an Ads Service's department to Social may activate those paths.

## Creation, edits and retries

Ads create accepts exactly the canonical editorial fields (`title`, `pillar`, `hook`, `script`, `caption`, `cta`), `type`, `ownerMembershipId`, `targetPublishDate`, `visibility`, `platforms`, and `requestId`. Reuse existing text/date/platform limits and validation. Default type is `ad_creative`, visibility internal, and stage Idea. Type and platform remain descriptive. Set workflow flags server-side: recording false, internal review true, client approval true. Reject body-supplied identity, context, stage, publication and workflow flags, even if they equal the defaults.

Ads detail PATCH accepts the same editable fields except `platforms` and `requestId`, plus required `expectedRevision`; platform replacement uses its existing separate endpoint and strict revision contract. Project/Client/Service/area/request identity and creation time never change. Preserve existing valid-owner behavior, including an unchanged historical owner. Social field allowlists and defaults remain unchanged.

Keep workspace/Client/request-ID uniqueness. Ads creation receipts include normalized input, platforms, production area and exact Project ID. Legacy Social receipts lacking context mean Social/null. Same request with the same inputs and Project is an idempotent retry only while currently authorized; a different area, Project or input conflicts without returning hidden IDs or metadata. Handle collisions arriving after the retry read as a safe conflict, not a raw database error or success.

Creation, platform associations and the immutable `CONTENT_CREATED` event commit atomically with live parent and desired-visibility predicates. All later writes retain live authorization and revision checks inside their committing batch. Concurrent losers, denied retries and late failures leave no partial rows or activity. Canonical activity retains `subject_type='content'` and the Content ID. Client aggregate activity may include an Ads event only after independently authorizing the Client and the current subject; redact no-longer-readable historical metadata rather than trusting old receipts.

## Production and working assets

The only forward path is Idea → Script → Editing → Internal Review. Internal Review may request revision with the canonical required context, at most 2,000 characters; Revision Requested returns to Editing. Internal Review otherwise has no next transition in E2B. No skip, backwards edit or alternate endpoint may enter Waiting for Recording, Client Review, Approved, Scheduled or Published. `publishedAt` stays null.

Select the workflow profile from stored area on the server. Keep Social transition behavior unchanged. Enforce Ads allowed stages, all three fixed flags, null publication, expected revision and absence of an active approval inside mutation predicates and retry handling, not merely menus. A raw Ads row with invalid workflow flags, forbidden stage, publication or an unexpected active approval must fail closed for production/asset mutations; an otherwise authorized detail can explain that it is unavailable for editing without offering a bypass or silently repairing data. Do not render Content approval controls for Ads. Brief copy can explain that client review is not available yet.

Ads uploads accept only `purpose='asset'` and internal/restricted visibility. Reject recording purpose and client visibility on upload/change/retry; changing File purpose is unsupported. Preserve Social recording/asset behavior. Reuse canonical byte/type/size validation, hashing, upload lease, retry, revision, archive and raw-byte download behavior; no new R2 key family or copied objects. Validate the live exact parent and restricted File scope before each storage action and its final metadata write, including stale retries and generic File endpoints. Do not serve malformed Ads client-visible or recording-purpose File rows through internal or portal routes.

Assets are mutable working media. Neither current File URLs nor an internal production stage count as immutable client approval evidence. No public asset URL, portal download or provider submission is introduced.

## Interface and implementation ownership

Read [DESIGN_SYSTEM](../DESIGN_SYSTEM.md), [DESIGN_CHECKLIST](../DESIGN_CHECKLIST.md) and the available live design reference before visual implementation. Reuse Bloom forms, notices, buttons, File controls and tokens. Shared editors/controls receive server-selected route context so save, cancel, conflict reload and error recovery stay in Ads. Keep permission and workflow decisions in the domain, independent of presentation props. Do not copy the Content engine or hardcode a second transition implementation in JSX.

Use explicit Project/Client/Service labels, restrained meaningful status/visibility badges and compact icons from actual type/platform facts. No emojis or dot-separated operational metadata. Preserve the accepted 28px title tile / 16px centered glyph. Hide unsupported workflow flags, client visibility and recording purpose rather than presenting inactive controls. Create/edit forms explain fixed Project context and what the user can do next. Empty/error/overflow/loading states and keyboard focus must be usable at 1440, 1024, 768, 390 and 320px.

Expected ownership: Ads read/API/pages and presentation; targeted extensions to canonical Content access, creation/update, platforms, pipeline, Files, authorization and activity; explicit containment at Social/approval/portal callers; focused invariant/native/browser fixtures; task-owned docs. Inspect all actual callers before broadening shared ID dispatch. No unrelated D2/schema/instruction changes, global style cleanup, new dependencies or infrastructure changes.

## Acceptance and completion

1. Prove the permission matrix for reads, creates, edits, transitions, platforms, assets and history. Include Project-only users with at least 240 assignments and bounded native D1 bindings; PM ordinary scope; restricted parent/Content/File; Action-only, ownership-only, wrong workspace and suspended/stale actors. Test revocation between read and commit/storage action, not only fresh requests.
2. Prove immutable context, exact parent eligibility, cross-area and cross-Project request-key conflicts, same-input retry, revision races, atomic rollback and no leaked receipts/IDs. Retain E2A replacement/parent invariants and legacy Social receipt compatibility.
3. Prove fixed workflow and allowed edges through generic APIs and direct domain calls, including malicious flags/visibility/stage/publication, invalid stored workflow and attempted C5 approval/recording bypasses. Social transitions and active Social approvals still work.
4. Prove File raw bytes/hash, size/type failures, leases, retry/archive/visibility races and live authorization at R2 boundaries. Include generic family resolution, restricted File under ordinary Content, invalid Ads purpose/visibility and portal denial before and after Service department reassignment.
5. Prove strict query/body keys, pagination/filter/option/history bounds, scoped overflow, selected Project outside the first 200, safe parent links, no Social list/calendar contamination and no Ads portal/activity leakage. Hidden rows must not change visible counts or overflow.
6. Run focused authorization/Content/File/platform/pipeline/approval/portal/Ads tests, then the full Node suite because shared authorization and storage callers change. Run JavaScript syntax/diff checks and `npm run cf:build`. Run native local D1/R2 acceptance and existing relevant Social approval/File and E1 regressions; capture concrete counts and commands. Run real built-Worker HTTP/browser creation, edit, production, upload/download and denied-ID stories across all five widths, including keyboard/error recovery. A mock-only or structural DOM check does not replace the workflow/byte checks.
7. Obtain exactly one fresh read-only Sol High review under the configured policy. Supply the bounded contract, relevant final diff and actual results; at most one focused re-review after fixes. No independent audit is required for this planning-only document.
8. Update existing status/index/domain facts with actual acceptance, omissions and evidence. Publication follows standing authorization and current workflow triggers. E2B closes only after reviewed implementation and required exact-merge-SHA staging/zero-to-current gates plus live identity/health pass. Baseline E2A results are not E2B results. Keep the E2A application as the minimum compatible fallback once Ads records exist; never roll back before E2A or remove its migration. E3–E5 remain separate unfinished phases.

Contract preparation is verified by source, relative-link and diff checks plus self-review only. It changes no runtime, migration, credentials or deployed behavior.

## Accepted implementation

Merged/deployed `09de9d6`; no additional migration or dependency, 23 migrations remain. Full Node 6,109; affected review-fix 78; native D1/R2 198; build; final browser/HTTP 160 checks /95 captures at five widths; three exact-persistence reproductions all pass. One Sol High review and one focused re-review resolve hydration readiness and UUID history ordering. Staging `34710782201` and zero-to-current `34710782170` pass on the merge SHA; live staging identity/schema match. BUILD_STATE records evidence and cleanup-verification limits. Internal working media remains mutable; client approval/media evidence stays in E3.
