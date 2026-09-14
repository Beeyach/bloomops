# Bloomsi Build State

## Current direction — fluid prospect sheet accepted in staging; N2 not started

Owner requested the prospect table fill the available screen before N2. Worktree `/home/ary/Developer/bloomops-sheet-fluid`, branch `fix/prospect-sheet-fluid`, starts from main `85ab496`. Runtime `43374cc` changes only `app/prospecting.css`: smaller desktop gutters, an expanding sheet/records viewport, normal-height rows and pagination below it. Long results scroll inside with the sticky header available; phones and short screens retain natural page flow. Toolbar-bound desktop menus stay within the canvas when buttons wrap. No JavaScript, schema, query, dependency or workflow change.

The final production OpenNext build and **23 candidate browser/layout checks pass**. One fresh Sol High review found no material findings; no re-review was needed. Initial menu checks caught right-edge overflow and a wrapped-tablet alignment problem; the final toolbar anchor fixes both, verified at six widths. No new Node suite or fresh-database run is needed for this CSS-only change. Existing staging migration checks pass with the same45 migrations.

**Live in [staging](https://staging.ops.gobloomwired.com/prospecting)** through [workflow34871184108](https://github.com/Bloomwired/bloomops/actions/runs/34871184108), successful on `43374ccdbe603976906f42b9c04cf0a01c9ac8f8`. **20 final live checks pass without injected preview CSS**: version/health,1920/1440/1024/768/390/320 layouts, full desktop/tablet height, bounded toolbar menus, long-list scrolling/sticky header/pagination and actual selection/clear. At1440x1000 the sheet grows from454px to859px high while rows keep their natural size. Desktop/phone and loading visuals were inspected. Long-list clones were temporary DOM fixtures only, removed afterward; no database records were created or edited. [Exact evidence and screenshots](previews/sheet-fluid/README.md).

[PR73](https://github.com/Bloomwired/bloomops/pull/73) is draft and unmerged. Main remains the accepted N1 release; staging now includes this reviewed CSS follow-up. Next bounded task is PR73 readiness/merge before starting the recorded N2 client overview contract. **N2 is not started.** Original LTB records/voices, unrelated root work and other worktrees remain preserved. Production/DNS, real imports/outreach, paid actions and video remain untouched.

## Previous accepted release — N1 release checkpoint complete; N2 not started

The owner bounded this checkpoint to releasing accepted N1 work. PRs **#67–72 are merged into main in dependency order**, ending at `1f9c1c14051f5887b5b351f3c0ba774a08d5a600`. The final main tree exactly matches independently reviewed candidate `71a6388`. Worktree: `/home/ary/Developer/bloomops-n1-release`, branch `release/n1-checkpoint`. Subsequent release-note commits change documentation/evidence only; the deployed application remains this merged-main runtime.

All nine open PRs were inspected before implementation. No newer N1 PR or active client identity/contact implementation existed; the final open list contains only unrelated #1/#34 and reference PR#58 (`c47c171`). Accepted branch ancestry was preserved with fast-forward pushes and ordinary merge commits, without force-pushing. Only BUILD_STATE and the N1 contract conflicted. Both histories and newer instructions were retained. Combined search/recovery testing found a real same-route account-refresh leak; internal and portal search now remount for the current user/workspace. No unrelated application, dependency, deployment configuration or voice-library change was introduced.

**Verification:** 331 relevant Node tests pass before the final two-route search correction; 29 affected search/shell tests pass afterward. The final production OpenNext build passes. Fresh and second-pass migration checks pass with all **45 domain migrations**, including additive0044 client creation receipts. Accepted populated-copy preservation of112 application tables and old schema remains unchanged. The197 combined built-Worker browser checks precede only the search correction;13 final account-replacement checks verify that fix. Home/Clients/Work retain one navigation request,11/3/7 SQL statements and two D1 calls. Ten shared scripts total391061 decoded bytes (+12 versus accepted PR72). Synthetic local timings are not production latency claims.

One fresh **Sol High integration/deployment review and the single focused re-review are complete**, with no material findings outstanding. The review required guaranteed portal-fixture cleanup; five injected cleanup paths pass independently. The live fixture ran inside that wrapper and readback proves its QA membership is owner again, the synthetic contact is unlinked, the Page grant is revoked and the original selected workspace is restored.

**Staging is green:** [Open Bloomsi](https://staging.ops.gobloomwired.com/prospecting). [Deploy staging34863338309](https://github.com/Bloomwired/bloomops/actions/runs/34863338309) and [fresh remote database34863338085](https://github.com/Bloomwired/bloomops/actions/runs/34863338085) both succeeded on merged main `1f9c1c1`. Live version and staging health confirm that runtime and45 healthy migrations. Intermediate queued runs were superseded by GitHub concurrency; their SHAs are not claimed verified.

**24 public and63 distinct authenticated staging checks pass.** Coverage includes five-type search and canonical links/downloads; wrong-user and workspace denial; sheet selection, reviewed edits/undo, saved views/filters/date order/paging, Sample CSV and all17 columns fitting desktop and320-pixel mobile without sideways scrolling; profile recovery; new-prospect/client committed-but-lost reply recovery with retained later input; internal and portal rich Page recovery; inherited child navigation; revoked Page/editor/search access. Revoked input leaves the canonical title/revision unchanged. Read-only staging SQL confirms one recovered prospect, one client receipt and one primary contact, with no synthetic invitations, onboarding runs, deliveries, conversions or CSV imports. Two previously captured QA profiles remain byte-identical. Desktop/phone screenshots were inspected. [Exact evidence, visuals and limitations](previews/n1-release/README.md).

The staging harness needed query readback via Wrangler `--command` rather than file-import summary output, the exact fixture-file text, and the actual workspace of earlier preservation IDs. These were test corrections; the final checks pass without changing app behavior. Original LTB data was never targeted for fixture edits; no full remote LTB snapshot comparison is claimed. Original LTB records/voices, unrelated root D2 work and accepted worktrees remain preserved. Production/DNS, real imports/outreach, paid audits and video work/tests remain untouched; broader email work stays paused.

**Next bounded task, recorded only:** define N2's first client overview slice using canonical purchased services, current work, next deadline and unresolved requests, preserving prospect links and permissions. Client preview and collaboration retain separate N2 acceptance. **N2 implementation has not begun.** This release closes the accepted N1 checkpoint, not the entire product or every form in the broader N1 inventory. Client identity/contact edit recovery, project/content forms and other remaining controls stay explicitly unfinished in [N1](phases/N1.md#remaining-n1-inventory--inspected-after-n1d).

## Previous accepted direction — N1G client creation recovery accepted locally

Active worktree `/home/ary/Developer/bloomops-n1g-client-creation-recovery`, branch `feat/n1g-client-creation-recovery`, starts from accepted Pages recovery head `0b2b048` in draft PR71. Main and PR58 documentation were freshly fetched and remain `9763650` and `c47c171`. PR71 is confirmed open/draft at `0b2b048`; its task-only Worker is stopped. Search and recovery drafts remain unmerged; staging has not changed.

Follow the [N1G contract](phases/N1.md#n1g--client-creation-recovery-accepted-locally). Client creation now retains bounded original-user/workspace/writer copies, exact pending input and request identity. Explicit recovery checks current authority before showing fields. The canonical client/contact/activity transaction and new immutable receipt commit atomically under live creator/owner eligibility. Lost replies return the original client; later input remains downloadable and cannot silently create another record. Original role rules, Draft/On Track defaults and unlinked contacts remain intact. Existing field-only callers retain their API with live transaction authority.

119 focused tests, the final OpenNext build and 56 native/browser checks pass. The final 23 main checks include incomplete later input after a real committed-but-lost reply; earlier nine storage, 18 lifecycle and six native checks precede only that form validation-order correction. Actual same-route RSC account replacement, logout/workspace switching, revoked membership, keyboard, ten-copy/quota/expiry/CAS, native concurrent creation and transaction rollback are covered. Desktop/phone visuals inspected; five widths fit. Migration0044 reaches45 domain migrations; fresh/second-pass verification and populated-copy preservation of112 application tables/old schema pass. Home/Clients/Work retain one request,11/3/7 statements and two D1 calls; shared JS grows51 bytes to391049, with final bundle sizes matching measurement. [Evidence and limitations](previews/n1g-client-recovery/README.md).

One fresh Sol High independent review found no material findings and independently passed the28 creation/store tests. No re-review is needed. N1G is accepted locally. Implementation `8e45fd8` is pushed in [draft PR72](https://github.com/Bloomwired/bloomops/pull/72), stacked on PR71; GitHub confirms it is open and draft. No merge or deployment is claimed. Next remaining N1 task after acceptance is client identity/contact edit concurrency and recovery, preserving primary/portal/lifecycle rules. Original LTB records/voices, unrelated root D2 work and accepted worktrees remain preserved. No deployment, production/DNS, real import/outreach, paid audits or video work/tests. Private evidence `/home/ary/Developer/bloomops-n1g-client-creation-recovery-evidence/`; task-only synthetic Worker8800 is stopped.

## Previous accepted direction — N1F Pages recovery accepted locally

N1E new-prospect recovery is accepted locally and pushed in draft PR70 (`0c88481`, documentation head `c4924c7`), stacked on PR69. Search PR67, screen fit PR68 and profile recovery PR69 retain their accepted local evidence and pending release state. Latest fetched main remains `9763650`; staging has not changed.

Active worktree `/home/ary/Developer/bloomops-n1f-pages-recovery`, branch `feat/n1f-pages-recovery`, starts from N1E head `c4924c7`. Follow the [N1F contract](phases/N1.md#n1f--pages-lifecycle-and-recovery-accepted-locally). Inspection confirms PageEditor is shared by internal and portal routes. Current tab recovery reveals fields and schedules autosave immediately; the serial session lacks shared lifecycle invalidation and exact outstanding-attempt reconciliation. Both routes currently key only by page ID, and PUT lacks initiating-user binding. Existing canonical live Page edit and revision guards, editor content, grants and history must be preserved.

Current implementation: the internal and portal PageEditor now use scoped per-writer browser copies and the existing serial autosave engine. Recovery shows metadata before a bound canonical edit-authority read, then waits for deliberate save. Exact outstanding attempts survive reload, confirming committed-but-lost replies without duplicate saves while retaining later input. Original revision conflicts require deliberate review/download/use-saved. Account replacement remounts the editor; logout, revocation, workspace switching and page departure invalidate it and reject late responses. Old tab-only copies remain recoverable with a seven-day first-observation clock; modern copies have seven-day/ten-copy/8MiB bounds, with quota warnings and conditional source removal. RichEditor, nested links, sharing and comments remain in place.

Verification: 92 focused Page/store/session/canonical/sharing/profile/sheet tests and the final OpenNext build pass. 75 built-Worker checks pass: 30 main internal/portal journeys, 17 lifecycle checks, seven real same-route account replacements, seven rich-document/keyboard checks seven final legacy expiry checks and seven delayed-control regression checks. Coverage includes real committed-but-lost saves, input while pending, conflicts, exact source/clock cleanup, quota/ten-copy/CAS, actual workspace/logout, client revocation during a pending write, direct/inherited edit authority, rich blocks, keyboard focus/activation and actual nested child navigation. Layouts fit 1440/1024/768/390/320; desktop and phone captures were visually reviewed and heading/contrast corrections applied. Home/Clients/Work retain one request, 11/3/7 statements and two D1 calls; ten shared scripts add 294 bytes over N1E, with final build sizes matching measured bundles. [Evidence and limitations](previews/n1f-pages-recovery/README.md). The fresh Sol High review found a delayed-control race: use-saved could discard input typed during its authority check, and download could omit that input. The fix uses a captured session generation for replacement and a live post-check snapshot for download. Two added unit invariants and seven corrected built-Worker checks pass; the single focused re-review accepts the fix with no remaining material findings. N1F is accepted locally. Implementation `b716345` is pushed in [draft PR71](https://github.com/Bloomwired/bloomops/pull/71), stacked on PR70; it is not merged or deployed.

Next: continue client creation in a separate N1G worktree. Client creation recovery is next in the remaining N1 inventory: its current POST lacks durable creation-request identity and its mounted-only form lacks scope recovery. Inventory canonical creation/permissions before defining that next contract. No N1F merge or deployment has occurred. No migration or dependency change. Original LTB, root D2 work and accepted worktrees remain preserved. No production/DNS, real import/outreach, paid audit or video work/tests. Private evidence `/home/ary/Developer/bloomops-n1f-pages-recovery-evidence/`; isolated synthetic Worker8799 is stopped after final acceptance. Latest fetched main remains `9763650`.

## Previous accepted direction — Full roadmap goal active; N1E new prospect recovery accepted locally

Continue the full agreed Bloomsi roadmap. N1D profile recovery is locally accepted in draft PR69; search PR67 and screen-fit PR68 remain accepted drafts, not merged/deployed. Latest fetched main remains `9763650`; staging retains that release. No production/DNS, live prospect import/outreach, paid audit or video activation is authorized by this phase.

Active worktree `/home/ary/Developer/bloomops-n1e-new-prospect-recovery`, branch `feat/n1e-new-prospect-recovery`, starts from accepted N1D head `71b8fb4`. Follow the [N1E contract](phases/N1.md#n1e--recover-new-prospect-forms-accepted-locally). The new form now reuses the bounded profile draft storage/lifecycle with its own new-record scope and retained creation request ID. A guarded read distinguishes an unsubmitted form from its original creation receipt. Failed/lost responses keep input; existing receipts offer the saved prospect and retained-input download rather than another creation. Canonical creation adds optional initiating-user binding and keeps the original fingerprint/source/activity transaction. New-form server rendering is keyed by user/workspace, incorporating the N1D account-boundary correction.

Current evidence: 41 focused tests, the final OpenNext build, 54 new-form browser checks (including five keyboard checks) and 59 shared-profile regressions pass. Four final visual checks pass after the last heading-only CSS correction; desktop 1440 and phones 390/320 were visually inspected. Copy handoff stores a replacement before conditionally removing its source, with quota/newer-writer preservation verified. Lost committed replies retain the original creation receipt without duplicate records. Actual account replacement, workspace switching, revocation and logout are covered. Home/Clients/Work request/query counts remain unchanged; ten shared scripts add two bytes over N1D, with final build sizes matching measurements. [Visual evidence and verification limits](previews/n1e-new-prospect-recovery/README.md). One fresh Sol High independent review found no material defects; its keyboard-evidence gap is closed with five focused checks and no runtime correction or re-review. N1E is accepted locally. Implementation `0c88481` is pushed in [draft PR70](https://github.com/Bloomwired/bloomops/pull/70), stacked on PR69; it is not merged or deployed. No migration or dependency change. Only the isolated synthetic fixture was used; original LTB and unrelated work remain unchanged. Private evidence `/home/ary/Developer/bloomops-n1e-new-prospect-recovery-evidence/`.

Next: address existing internal and portal Pages lifecycle/recovery in a separate N1F worktree, preserving the mature editor and live sharing permissions. Continue the remaining N1 inventory and full-goal ledger below. This implementation progress does not complete N1 or the whole roadmap.

## Previous accepted direction — Full roadmap goal active; N1D profile recovery accepted locally

Owner set the persistent goal: **finish everything** in the agreed Bloomsi roadmap. Keep the whole objective active; a passing slice or draft PR is not overall completion. The previous goal step made implementation progress. Latest main was fetched and remains `9763650`; PR67 search and PR68 screen fit are still open drafts with local acceptance, not merged/deployed. Production/DNS, live prospect imports/outreach, paid audits and video work/tests retain their existing restrictions. Continue useful authorized work rather than stopping at these pending release gates.

Current worktree `/home/ary/Developer/bloomops-n1d-profile-recovery`, branch `feat/n1d-profile-recovery`, starts from PR68 head `331e765`. Read the [N1D contract](phases/N1.md). Existing full-page prospect editors only warned on leave; the new implementation retains per-tab, user/workspace/prospect-scoped copies for all four profile sections, with original revision/values/source controls, ten-copy/seven-day/256KiB bounds, conditional deletion and logout invalidation. Recovery reveals only counts/dates until an explicit bound server authority check succeeds. Canonical updates accept an optional initiating user ID while preserving old callers. Retry compares normalized values and provenance, confirms already-saved values without another write, or preserves conflicting drafts for deliberate review. The same structured forms remain in place.

Current evidence:36 focused profile/store/canonical/sheet tests pass; final OpenNext build passes;42 main built-Worker checks and17 transition/native checks pass. Recovery, incomplete source controls, real lost replies, conflicts, storage limits, original-user/workspace binding, revocation during reads, real switch/logout and independent tab stability are verified. Shared JS adds53 bytes; Home/Clients/Work request/query counts remain unchanged. The final asset sizes match the measured build. One fresh Sol High independent review found a same-route account-prop replacement gap. The profile is now keyed by initiating user/workspace/prospect. Four unfixed-build checks reproduce the gap; seven final built-Worker regression checks pass after correction, along with the final rebuild and36 focused tests. The single focused re-review accepts the fix with no remaining material findings. Accepted implementation `829df36` is pushed in [draft PR69](https://github.com/Bloomwired/bloomops/pull/69), stacked on PR68. It is not merged or deployed. N1D is accepted locally; total browser/native acceptance is66 checks, with the earlier59 preceding only the server key fix. [Visual evidence and verification limits](previews/n1d-profile-recovery/README.md). No deployment or migration. Private evidence `/home/ary/Developer/bloomops-n1d-profile-recovery-evidence/`.

The [remaining N1 inventory](phases/N1.md#remaining-n1-inventory--inspected-after-n1d) identifies new prospect creation recovery next, then Pages lifecycle/recovery, client creation/identity/contact concurrency, project/content forms and remaining record controls. These gaps are recorded from the actual current paths, not counted as complete.

Full-goal completion ledger (verify against the linked contracts before closing):

| Requirement area | Authoritative current evidence / remaining work |
| --- | --- |
| Prospecting sheet/import/manual audit/client handoff | Accepted merged release9763650; original LTB preserved. Screen-fit correction is accepted draft PR68, pending release. |
| N1 reliable saves, recovery, search | Sheet save/draft recovery deployed; search accepted draft PR67. Profile recovery in progress. Inventory and complete remaining new-record/client/Pages forms before closing N1. |
| N2 client overview/preview/collaboration | Implement and verify `NEXT_PHASES.md` and `COLLABORATION_NOTIFICATIONS.md`; no completion evidence yet. |
| N3 client reporting | Implement and verify `CLIENT_REPORTING.md`: canonical reports, reviewed import, charts, publication snapshots and portal/PDF. |
| N4 reusable work and Pages | Reuse existing generation/editor engines; verify dated instantiation, retries, links, nesting and recovery against `NEXT_PHASES.md`. |
| N5 optional connections | Source/account selection and activation retain their explicit gates; no automatic sending or connection from the broad goal. |
| Operational roadmap and final release | Audit remaining A–G requirements and newer owner overrides against main and existing in-flight work; preserve unrelated worktrees. Drafts/local tests alone do not satisfy release gates or prove the entire app complete. |

Next concrete actions: implement N1E new-prospect form recovery in a separate worktree using the contract appended to `phases/N1.md`. Keep the existing search/screen-fit drafts and pending staging release state clear. No new project-status file or replacement roadmap is needed.

## Previous accepted direction — Prospect sheet screen fit locally accepted

Owner requested that the prospect table fill the screen without sideways scrolling. Active worktree `/home/ary/Developer/bloomops-sheet-screen-fit`, branch `fix/prospect-sheet-screen-fit`, is isolated from N1C PR67 and starts from latest fetched main `9763650`. The [sheet contract](PROSPECTING_SHEET.md) records the new direction; [visual preview and checks](previews/sheet-screen-fit/README.md) show actual synthetic local records. This layout correction is not merged or deployed; staging remains at the accepted release checkpoint.

The sheet now fills the workspace canvas and uses proportional desktop columns. Narrow containers and views with more than eight fields wrap labelled properties beneath each business, keeping all selected fields and existing actions accessible without horizontal scrolling. Existing widths are retained as relative proportions. A generic navigation-sheet height/overflow/shadow/animation collision is overridden only for the prospect sheet, so its footer remains reachable. The official logo, garden/favicons and 16px body text are preserved. No backend, authorization, save/recovery logic, migrations or dependencies changed.

Verification: 33 focused sheet/draft tests, final OpenNext build and 27 built-Worker browser checks pass. Widths 1920/1440/1280/1024/768/390/320 have no horizontal page/table overflow; seven default and all 17 optional fields stay accessible. Keyboard resize, page/phone selection, real synthetic edit/save/undo, saved widths and profile navigation/return pass. Screenshots inspected at 1440/1280/390/320. An initial browser assertion raced row refresh; the corrected check waits for the actual value and undo restoration. One fresh bounded Sol High review found no material findings; no re-review was needed. Additional widths 1208/1220/1240/1260 also show exact table/container fit. Task-only local Worker8795 is stopped. Private evidence is `/home/ary/Developer/bloomops-sheet-screen-fit-evidence/`.

Accepted implementation `e1ba6e2` is pushed in [draft PR68](https://github.com/Bloomwired/bloomops/pull/68), preserving N1C's independent draft PR67. Merge and staging deployment remain pending. Broader N1 work next covers full-page form recovery, starting with ProspectProfile; N2 remains later. No real imports, outreach, paid auditing, video work/tests, production, DNS or original LTB/voice changes. Root D2 work and historical status tail remain preserved.

## Previous accepted direction — N1C workspace search locally accepted

Owner continued from the completed PR64–66 release. Worktree `/home/ary/Developer/bloomops-n1c-global-search`, branch `feat/n1c-global-search`, starts at merged main `9763650`; latest main was fetched and remains unchanged. Read the [N1C contract](https://github.com/Bloomwired/bloomops/blob/feat/n1c-global-search/docs/phases/N1.md) and [visual acceptance](https://github.com/Bloomwired/bloomops/blob/feat/n1c-global-search/docs/previews/n1c-search/README.md). This slice is local and has not been merged or deployed. The existing staging release remains the accepted `9763650` checkpoint.

Internal Search now finds authorized prospects, clients, Tasks (canonical Actions), Pages and ready Files; portal Search finds shared Pages and downloadable Files. It uses explicit name/title queries, bounded groups and type pagination, current canonical access predicates, live membership/role checks and initiating user/workspace binding in one read-only batch. Result links open the real profiles/readers/downloads and recheck access. Queries/results are not persisted. Loading, empty and offline states retain a retryable query; query edits, scope lifecycle changes and departed/restored pages clear results and reject late responses. The official logo, existing favicon/garden artwork, labelled controls and coloured type icons remain consistent with Bloomsi.

Verification: 65 focused tests; final OpenNext Worker build including Next/lint/type checks; 45 native/browser checks with synthetic isolated D1/R2; actual desktop/tablet/phone visual inspection and overflow/link checks at 1440/1024/768/390/320. Canonical navigation, exact file bytes, portal downloads, revoked Page access, keyboard Tab/Enter, pagination, offline/delayed replies, workspace switching and no application-table writes pass. Persisted-page/departure acceptance uses dispatched browser lifecycle events; real browser cache eviction is not claimed. One fresh Sol High read-only review found no material findings; no re-review was needed. No migrations or dependencies changed; video tests remain paused.

Measured Home/Clients/Work remain at one navigation request, 11/3/7 statements and two D1 invocations. Ten shared scripts grow from 390,649 to 390,661 bytes (+12 bytes); search client code remains route-local. Native Owner all-types search uses one identity statement plus a six-statement read batch, maximum 38 bindings; role tests reach 66. Local medians are about 62–63ms on equivalent synthetic fixtures, not production latency evidence or an arbitrary-scale guarantee. Details and limits are in the committed preview.

Accepted implementation `a9a5238` is pushed in [draft PR67](https://github.com/Bloomwired/bloomops/pull/67), based on main. Merge and deployment remain outside this slice. Broader N1 save/recovery is not complete; next bounded investigation is existing full-page form recovery (starting with ProspectProfile), preserving sheet recovery and checking comparison/revision guards before implementation. N2 client overview/preview/collaboration remains later. No real imports, outreach, paid audits, video work/tests, production, DNS or original LTB changes. Root D2 work and historical build-state tail are preserved. Task-only previews on8793/8794 are stopped. Private evidence: `/home/ary/Developer/bloomops-n1c-global-search-evidence/`.

## Previous accepted direction — PR64–66 merged and final staging accepted

All three PRs are merged into main in dependency order: PR64 `b94fe15`,PR65 `73767f4`,PR66 `9763650`. Main and live staging version match `9763650`. Final staging deployment [34832314094](https://github.com/Bloomwired/bloomops/actions/runs/34832314094) passed; health confirms staging and44 domain migrations. Final zero-to-current [34832314049](https://github.com/Bloomwired/bloomops/actions/runs/34832314049) also passed, including a second migration pass and disposable database cleanup. All release gates are complete. GitHub automatically superseded intermediate PR65 queued runs; no failed check was bypassed.

The fresh-workspace service catalogue fix initializes the existing four departments/five service types in the same guarded creation transaction. Existing customized catalogues, source workspace records and concurrent retry semantics are preserved.86 focused tests, final OpenNext build and native D1 handoff choices pass. No new migration or dependency. One fresh bounded Sol High integration review found no material findings; accepted PR64/65/66 reviews remain valid.

Authenticated synthetic staging acceptance passes: Sample CSV/duplicate-invalid preview/import receipt, manual audit download without record writes, sheet/profile links/websites, bulk save/undo, saved views/filter/date order/page size, canonical client conversion and retained history/permanent stop, and missing-template onboarding handling. N1 retains drafts across reload/workspace switching, hides values until authority validation, retries offline failures, preserves undo and refuses concurrent/foreign/wrong-user writes. Desktop1440/phone390/320 were visually inspected.20 public checks pass again on the final merged deployment. Final authenticated recovery/save/undo passed at revisions5/6 and the conversion receipt remains unchanged. [Committed visual acceptance and limitations](previews/stack-staging-acceptance/README.md).

Only synthetic QA records were used. Missing common/service onboarding templates remain an explicit workspace setup prerequisite; full template-driven generation, real logout/revocation and lost-response behavior retain accepted isolated evidence. No real import, outreach, paid audit, video/test, production or DNS action. Original LTB records/voices and all1932 preserved P2 source files remain unchanged; three accepted implementation worktrees stay clean. Root D2 work and build-state history tail are preserved. Task-only native preview8792 is stopped. Private evidence: `/home/ary/Developer/bloomops-stack-staging-evidence/`.

The requested release checkpoint is complete; stop here as instructed. N1C permission-aware global search is the next separate bounded task; broader N1 and the whole product are not claimed complete.

## Previous accepted direction — N1B sheet draft recovery

The owner requested continued work from accepted N1A. Active worktree: `/home/ary/Developer/bloomops-n1b-sheet-drafts`, branch `feat/n1b-sheet-drafts`, based on PR65 head `15d8b69`. Accepted implementation `25efc52` is pushed in [draft PR66](https://github.com/Bloomwired/bloomops/pull/66), stacked on PR65 without merging either prerequisite. PR64 and PR65 worktrees remain clean and unchanged; latest main is `4b7acea`. Staging still serves accepted sheet runtime `bbe828b`. Read [N1B contract](phases/N1.md) and [NEXT_PHASES](NEXT_PHASES.md).

Typed cells and pending reviewed fields are retained in browser-local copies scoped to the original user/workspace, with a separate writer ID per mounted sheet. Recovery first offers counts/dates; an explicit read-only endpoint checks the current identity, workspace authority and every referenced record before showing values. Recovered fields retain original comparison values/query and accept corrections to incomplete input. No automatic submission occurs. Save/undo requests from this UI also bind the initiating user ID to prevent accidental writes under a replaced session.

Copies are bounded to200 fields/256KiB, ten per user/workspace and seven days since last update. Logout clears sheet copies; workspace changes invalidate open sheets while keeping the original workspace's distinct copy available on return. Discovered revocation clears that scope. Storage failures keep mounted values and display a warning. Browser storage removal and cross-device synchronization are outside this slice; undo receipts remain in the mounted session.

33 focused Node tests,33 final built-Worker recovery checks,24 existing save/undo browser regressions and the final OpenNext build pass. Native D1 returns200 authorized records with55 bindings maximum; tests prove recovery changes no tables and rejects cached revoked membership, operations workspaces, foreign/missing records and identity mismatch. Browser coverage includes reload/new-context/back-forward recovery, raw invalid input, concurrency/lost responses, no unvalidated values, typed-query guard, quota, revocation, initiating-user mismatch, independent tabs, workspace switching/return and logout. The old regression harness uses503 for its unavailable-profile case because N1B intentionally clears copies on discovered403 revocation; the new suite covers actual403 behavior. One fresh Sol High review and the single focused re-review are complete, with no remaining material findings. [Visual evidence](previews/n1b-sheet-drafts/README.md).

Home/Clients/Work retain one navigation request,11/3/7 SQL statements and two D1 calls. Each retains10 scripts; shared JavaScript grows390118→390649 decoded bytes (+531,0.14%) for the shared lifecycle signal. The42-navigation/six-cold-load comparison uses the final reviewed-fix runtime. Synthetic fixtures and concurrent browser work establish no production timing claim.

The initial Sol High review found four issues: unguarded retirement of a concurrently updated source copy, encoded-byte/expiry enforcement, source cleanup at the ten-copy limit, and missed session/workspace exits. Fixes now compare the exact validated source snapshot before removing it, enforce encoded bytes on read, purge expired entries when listing, retain a source at capacity until confirmed save/discard, and cover shared-page switching plus the legacy logout button. Cross-tab BroadcastChannel signaling supplements storage when the context marker cannot be written. Two added Node cases and four added browser checks cover these boundaries; the single focused re-review accepts all four fixes. The legacy rail is rendered alone for its button test, without mounting the paused prospect/video app. Its simulated failed logout follows the existing authenticated redirect; real sign-out is tested separately.

Initial fixture corrections respected immutable workspace purpose and proper foreign membership. A typed-edit replacement guard was corrected so Preview does not ask to discard the very edit being reviewed. Repeated late-tab Chromium crashes coincided with the shared `/tmp` tmpfs reaching98%; using a private temporary directory on the regular filesystem allowed the final complete run, without removing existing files or stopping unrelated servers. The browser harness now configures that directory itself. Evidence: `/home/ary/Developer/bloomops-n1b-sheet-drafts-evidence/`.

No migration, dependency, deployment, production/DNS change, real prospect import/outreach or video work. The only application database mutations were synthetic fixture edits in the isolated copied database on8791. Original LTB records/voices,1932 prior P2 source files and accepted worktrees are preserved. Next bounded task: define and implement N1C permission-aware global search over existing prospects, clients, tasks, pages and files. Broader form recovery and full N1 acceptance remain unfinished.

## Previous accepted direction — N1A sheet save recovery

The owner requested continued work after the accepted sheet deployment and main reconciliation. PR64 is draft, unmerged and mergeable at `069650e`; its worktree remains clean and unchanged. Staging still serves reviewed runtime `bbe828b`. The owner's authenticated staging walkthrough remains unverified, but it is not a prerequisite for independent local N1 work. The sheet contract required isolated acceptance and staging deployment, both already completed.

Active work: `/home/ary/Developer/bloomops-n1-sheet-save-recovery`, branch `feat/n1-sheet-save-recovery`, based on `069650e`. Implementation commit `05ef73a` is pushed in [draft PR65](https://github.com/Bloomwired/bloomops/pull/65), stacked on PR64 without merging either PR. [N1 contract](phases/N1.md), following [NEXT_PHASES](NEXT_PHASES.md). N1A retains failed reviewed sheet values, identifies errors beside each field, retries explicitly against current profile/revision, recognizes already-saved values without a second write, and retains confirmed undo receipts across partial retries. Replacing a pending review requires explicit discard; ordinary link navigation and reload warn before losing unsaved values. No persistent drafts or automatic retries are introduced.

20 focused sheet Node tests,24 final built-Worker browser checks and the OpenNext build pass. Browser coverage includes mixed saves, offline/503, delayed and duplicate submission, committed-but-lost responses, concurrency, denied access, undo retention, replacement/query/navigation/reload guards and1440/390/320 layouts. Initial harness corrections aligned the canonical location field, post-refresh status timing and expected browser reload cancellation; the final run passes. One fresh Sol High review found an active-view deletion bypass of the pending-review discard guard. It is fixed, with three final browser checks covering inactive deletion and cancelled/confirmed active deletion. The single focused Sol High re-review accepts the fix with no remaining material findings. Twelve existing undo/history browser regressions also pass before this view-handler-only correction. [Visual evidence](previews/n1-save-recovery/README.md).

Home/Clients/Work retain one request,11/3/7 SQL statements and two D1 calls, respectively. All retain10 scripts and390118 decoded JavaScript bytes, unchanged from the accepted sheet. The42-sample/six-cold-load local recheck precedes only the view-deletion guard and establishes no production timing claim. The new route-local UI performs no automatic retry or extra polling.

No migration, dependency, backend authority, deployment or live data change. A consistent SQLite backup copied only the isolated synthetic fixture into separate local storage on8790; prior fixtures, the original1932 P2 source files, original LTB records/voices and unrelated work remain unchanged. Browser connection inspection could not complete through Chrome DevTools; authenticated staging is not claimed. Evidence: `/home/ary/Developer/bloomops-n1-sheet-save-recovery-evidence/`.

Next bounded task: N1B durable authorized draft recovery and remaining navigation boundaries before global search. N1A is locally accepted and independently reviewed; it is not deployed. N1 as a whole remains unfinished; paid auditing, video and broader email work remain paused.

## Previous accepted direction — Prospect sheet deployed; draft PR64 unmerged

The owner supplied the sheet plan in PR58 and explicitly authorized staging. The sheet contract now supersedes the previous table deferral. Active implementation: `/home/ary/Developer/bloomops-prospect-sheet`, branch `feat/prospect-sheet`, isolated from the accepted P2/P3/P4/P5B worktree and unrelated D2 work. Resume here using `docs/PROSPECTING_SHEET.md` and the updated working guide in this active worktree. Latest main inspected: `4b7acea`; reference documentation fetched from `docs/prospecting-reset-roadmap` at `211ab33`, then rechecked at `c47c171` (before the final staging integration). The later change adds only future reporting/collaboration direction; those three contracts and their canonical-guide links are preserved. The sheet contract, its three images and branding document were brought in; newer instructions and the exact official logo are preserved.

The canonical editable sheet, personal views/filters, timestamp sorting, 25/50/100/200 paging, selection/bulk previews/undo, sample CSV/import receipts, manual audit review and explicit canonical onboarding setup are implemented. Full profiles and client records link both ways. Conversion preserves sale/history and stops cold outreach; separate onboarding confirmation generates existing canonical records without invitations or portal identities. Missing templates remain recoverable without a second client or false Won state.

Focused acceptance currently passes: 173 Node tests,20 native D1 checks,46 main built-Worker browser checks and the Worker build. The main browser run precedes the final Shift-click correction and review fixes;35 supplemental checks and12 focused review browser checks exercise those changes. All35 supplemental browser checks now pass, including the final selection correction, loading/error/mobile/reduced-motion states and successful favicon rendering. Playwright automatically aborts intercepted /favicon.ico requests; the success fixture uses a test-only query parameter to bypass that tool rule. One fresh Sol High review found three issues: incomplete verification undo, waiting-view chronology and hidden manual evidence notes. All three are fixed with focused invariant coverage. Undo now restores the server-recorded source snapshot atomically, including its original checked date, while preserving unrelated edits; lost-response retries remain available. Waiting compares actual outbound/inbound/resolution dates without clearing sending holds. Authorized history exposes only the bounded manual note. The single focused Sol High re-review accepts all three fixes with no remaining material findings. The independent sheet review gate is complete; staging is deployed as recorded below. Evidence: `/home/ary/Developer/bloomops-prospect-sheet-evidence/`.

Additive migration0043 reaches44 domain migrations, creates immutable CSV receipts and manual conversation facts, and adds sheet indexes. Fresh/idempotent migration checks and a populated-copy comparison pass;113 existing tables, old schema and rows are preserved. All1932 source files in the original active P2 worktree still match the captured baseline. The normal development database and original LTB records remain untouched. Normal8787 remains the prior accepted P5B preview; isolated sheet browser evidence is retained separately.

Personal saved views/settings are scoped to user and workspace in this browser, not synchronized across devices. CSV batches are bounded to50 records/256 KiB, record exports to200, manual audit packages to50. Bulk edits save individual reviewed fields and report partial failures; undo refuses concurrent edits to the same field. Ready to contact uses existing reviewed email eligibility and does not authorize sending. Social-only prospects remain valid and available to manual skills.

Home/Clients/Work retain the same request/query counts and10 scripts each. Shared JavaScript increases from388963 to390118 decoded bytes (+1155,0.3%); no prospecting/editor/video runtime is introduced on unrelated routes. Local timing comparisons use small synthetic fixtures and frame-based navigation; they establish no production speed claim. Final query/bundle recheck is recorded separately from the earlier timing run.

[Visual preview](previews/prospect-sheet/README.md). **Staging is live:** [Open the prospect sheet](https://staging.ops.gobloomwired.com/prospecting). GitHub CLI access was restored for Beeyach. Before dispatch, the branch preserved the six runtime/test files from main PR62/PR63 for the public staging origin and official auth-email logo. All six match main `4b7acea`;20 focused integration tests, the staging configuration check and OpenNext build pass. A separate bounded Sol High review of this new integration found no material findings; it does not reopen the accepted sheet review.

The existing [staging workflow run34812410187](https://github.com/Bloomwired/bloomops/actions/runs/34812410187) succeeded on runtime commit `bbe828b0170258135013dba9e867833bbfa0b335`. Public `/api/version` reports `bbe828b`, and `/api/health` reports staging with all44 domain migrations healthy. The workflow's22 live checks and20 additional public browser checks pass. Live sign-in was visually inspected at desktop and phone sizes; the official logo bytes,1440/390/320 layouts, anonymous access denial and redirects are verified. Authenticated sheet/data journeys were tested in the isolated workspace; the owner's authenticated staging walkthrough has not been automated. No real prospect import, conversion, invitation or outreach was performed for acceptance.

[Draft PR64](https://github.com/Bloomwired/bloomops/pull/64) contains the preserved prerequisite checkpoint `7dcb609`, reviewed sheet implementation `ca8612c`, and staging integration `bbe828b`. The implementation branch is reconciled with main `4b7acea` and remains unmerged. Later documentation-only commits record this result without changing the deployed runtime. **Next bounded task: authenticated staging acceptance**, followed by the draft PR readiness/merge checkpoint. The sheet/P5C slice is locally accepted and staged; broader P3/P5 work is not claimed complete. Production, DNS, original Leads That Bloom data, paid auditing, video work/tests and broader email expansion remain unchanged/paused.

## PR64 reconciliation with main

Merged main `4b7acea` into `feat/prospect-sheet` without rewriting branch history. Resolved the Pages conflict by preserving the completed workspace Pages screen; retained the current local branding-reference link. Main's branding captures and local acceptance script are preserved unchanged. Its older active-priority/resume instructions are retained below as a historical checkpoint; the sheet remains the current direction. The documentation index now points to that current state.

The resulting application, dependency, migration, test and deployment files are byte-identical to the previously staged branch `8016bac` (runtime `bbe828b`). Only documentation/evidence and the previously accepted branding browser script are added or updated. No runtime rebuild, database mutation, browser fixture rerun or deployment is needed for this reconciliation. Patch hygiene, local documentation links, unchanged-runtime comparison, original source preservation and syntax of the imported browser script are checked. No fresh independent review trigger applies to this documentation/history reconciliation; the sheet and staging integration reviews remain accepted.

## Historical main checkpoint — Bloomsi branding for staging

Branding-only branch `feat/bloomsi-branding` in `/home/ary/Developer/bloomops-bloomsi-branding`, based on deployed main `618e18f`. Owner explicitly authorized applying the approved PR #58 logo/guide and deploying through the existing staging workflow, without production or DNS changes. Only the logo and guide are imported from PR #58 `bee6af5`; original/P1/P2 worktrees and unfinished Prospecting runtime remain separate.

Implemented: original Bloomsi PNG replaces platform initial tiles on sign-in, internal and portal shells. Workspace names and person avatars remain their existing identities. Platform copy, browser titles and auth-mail text use Bloomsi; technical identifiers, stored workspaces and configured sender settings are preserved. Tablet branding uses the existing top bar for a readable full logo while retaining the navigation rail. No layout redesign, feature, migration or dependency change.

Local acceptance: 54 relevant shell/auth/mail/config tests, final Cloudflare build and 64 built-Worker browser checks pass at five widths. Original PNG byte identity, workspace names, sign-in/account flows and inspected desktop/mobile/tablet captures are recorded in the [visual preview](previews/bloomsi-branding/README.md). Shared dependency reuse caused an initial local packaging failure; isolated `npm ci` fixed it. One fresh Sol High deployment review and one focused re-review are complete. Long-name sidebar overflow was fixed and verified. The reviewer retracted the portal clipping finding after the dedicated capture and full-artwork geometry checks. No remaining material finding. Exact-source staging gates are pending. Existing staging provisioning/idempotent migrations/bootstrap remain the deployment path; no new credential, schema or production target.

Staging authentication now uses the public staging origin `https://staging.ops.gobloomwired.com`, matching the domain users open. Resend verified `mail.bloomsi.app` for sending and receiving. The deployed sender is `Bloomsi <sign-in@mail.bloomsi.app>`. A live sign-in request to the existing owner address was accepted and delivered with the Bloomsi subject and public staging callback. No production domain or Leadsthatbloom resource changed.

Authentication and invitation emails render the approved Bloomsi lockup above the heading. The image is served from the same configured app origin, keeps useful `alt` text when images are blocked and leaves the sign-in button as the only action.

The staging verifier now exercises the configured public origin. Its old Workers-address fallback did not match Better Auth's public origin and caused a false 403 after a successful deployment.

After this branding deployment, resume P2B3 durable import receipts and synthetic commits in `/home/ary/Developer/bloomops-prospecting-p2`, where P2A/P2B1/P2B2 are accepted locally. P1 remains draft PR #60, unmerged. All real prospect imports, outreach and video work/tests remain paused. This checkpoint supersedes older pending E3A gate directions below: E3A was deployed on `618e18f` with 24 migrations. No Prospecting phase is deployed by this branding branch.

## Previous direction — P5B accepted; P5C next; email paused by owner

The owner requested on13 September2026 that email work be wrapped up and other phases proceed. P3 remains unfinished and paused: no further email features, live mailbox setup/checks, follow-ups or sending. P4 Pages was advanced next and its bounded core is now accepted locally; P5A conversion preflight and P5B durable conversion are now accepted locally; P5C explicit onboarding initiation and repair is next. The owner will provide a separate plan for the Prospecting table, important filters and revised statuses; that redesign is deferred. Preserve all existing P3 implementation and evidence. P4A create/open/edit/save is accepted locally. P4B nested pages and page finding is accepted locally; P4C named sharing, P4D discussions/comment access and P4E rich document readers are accepted locally and independently reviewed; P4I read-only canonical Work projections are also accepted. Anonymous sharing, larger database behaviour and legacy document copies remain separate.

## P5B durable client conversion — accepted locally

An explicit sale confirmation now records a prospect against a new or existing same-workspace client and its purchased service. New clients remain Draft, new services remain Planned, and primary contacts remain unlinked to portal identities. Existing client/contact/lifecycle and open-service scope remain unchanged; the immutable receipt records this sale's agreed scope separately. Missing onboarding templates do not block recording a sale. Reloads restore the receipt and lost-response retries reuse the same request identity without duplicate records.

Conversion, any new canonical records, history and the permanent cold-outreach stop commit atomically. Current SQL authority, profile/client/contact/service snapshots and delivery state are revalidated. The immutable receipt protects the prospect and up to three captured recipient addresses; preparation/submission guards and database triggers prevent later cold sending. In-flight or unresolved delivery blocks conversion. No provider request, onboarding activation or invitation is a side effect. This necessary no-send protection integration does not resume P3 email development.

**119 distinct focused tests,14 native D1 checks and45 final built-Worker conversion browser checks pass.** The42 existing preflight browser checks also pass, before only the final retry-ID type validation. Native checks cover concurrency, rollback, revocation and duplicate-safe retries; the largest conversion statement uses49 bindings. Browser checks cover new/existing clients, actual committed-but-lost response recovery, reloads, stale selection, denied access, keyboard/focus, five desktop/mobile widths and zero provider egress. The final Worker build passes. Initial stale schema-count assertions and browser history selectors were corrected; all affected checks pass. [Visual preview](previews/prospecting-p5b/README.md).

One fresh Sol High read-only review found no material findings; no re-review was needed. It inspected the final diff, execution paths, tests, logs, JSON evidence and desktop/mobile captures without rerunning mutating harnesses.

Additive migration0042 creates the immutable receipt table, indexes and protection triggers (43 migrations total). Fresh/idempotent native migration and populated-copy checks pass. All110 previous normal application tables/rows, original schema objects and credentials are preserved; the new normal conversion table remains empty. Original LTB/workspaces/history/voices and unrelated source remain intact. Normal8787 is healthy on the final build; isolated8788 is stopped. All conversion fixtures are synthetic. No real conversion, invitation, email/video work, commit/push or deployment. Evidence: `/home/ary/Developer/bloomops-prospecting-p5b-evidence/`.

**Next bounded task: P5C explicit onboarding initiation and repair**, reusing canonical onboarding generation while separating it from invitation delivery. Existing activation currently sends an invitation; decouple that side effect before exposing the new action. Preserve the sale and permanent stop through failures/retries, and verify no duplicate onboarding or messages. Real onboarding, invitations and deployment remain separate. Full P5 is unfinished. Prospecting table/filter/status redesign awaits the owner's plan.

## P5A client handoff preflight — accepted locally

Prospects now open a full-page **Review client handoff**. Explicitly choose a proposed new client or a current-workspace existing client, one purchased service and its scope. Client/service search is bounded to20 results with pagination and labelled unique references for duplicate names. Existing contacts and engagements remain canonical. Current published template hashes and the existing onboarding compiler produce only a temporary step-count preview. Missing contacts, invalid/missing templates, existing onboarding and lifecycle limits are shown as unresolved. Editing an input clears the prior result.

This is read-only: no conversion/link, client/contact/service write, onboarding instance, invitation, stop receipt or provider action. Current Owner/Admin prospecting-workspace authority is checked in SQL and rechecked before returning results. A preview is never authority for a future conversion. No migration or dependency change.

**106 focused tests and42 final built-Worker browser checks pass.** Tests cover canonical compiler/template behaviour, per-source SQL revocation, duplicate names, boundaries and all-table no-write snapshots. Browser checks exercise new/existing clients, selected/paginated/empty/invalid/loading/error/keyboard states, five widths, long identity wrapping, actual profile navigation, denial/revocation, unchanged business tables and no provider egress. Initial browser work corrected field-label stability and validation contrast; harness waits were aligned with the actual validation response. The final Worker build and diff checks pass. [Visual preview](previews/prospecting-p5a/README.md).

One fresh Sol High review found two issues: live authorization was missing from template-source SQL, and duplicate names lacked distinguishing references. Both are corrected with focused coverage; the single focused re-review accepts both and reports no remaining findings. The reviewer inspected supplied logs/code/screenshots and did not rerun the mutating browser harness.

All110 normal application tables/rows, schema,42-migration ledger, credentials and unrelated source are preserved. Normal8787 is healthy on the final build; isolated8788 is stopped. Email and all video work/tests remain paused. No real business conversion, invitations, commit/push or deployment. Evidence: `/home/ary/Developer/bloomops-prospecting-p5a-evidence/`.

**Next bounded task: P5B durable conversion and stop receipts**, implementing explicit new/existing-client recording with canonical service scope, atomic duplicate-safe retries and a permanent cold-sequence stop independent of later onboarding repair. Keep actual onboarding activation and invitations separate. P5 as a whole remains unfinished.

## P4I linked Work views — accepted locally

Pages now offers Table, Board, Calendar and Gallery over canonical Actions. Slash insertion creates a linked Work block; Show Work loads records explicitly, with a status filter, refresh and50-row pagination. Editors save configuration through existing document revisions; readers change their own temporary view. Action links open existing authorized Work pages. Phone calendars use a readable date list and phone tables use separated rows.

The final SQL query intersects current page access with canonical Action authority. A page grant never exposes internal Actions to clients or unassigned work to team members. Documents store configuration and static fallback only; no operational rows or Action writes. Legacy database sources/defaults remain intact and shared readers load no editor runtime. No migration or dependency change.

**153 distinct focused tests pass**, plus55 Work browser checks,45 editor/recovery checks and39 rich-reader checks. The final build includes a pagination sentence clarification, verified by6 additional browser checks at1440/390/320. Broader browser and performance results precede only that copy change. All four layouts were exercised at1440/1024/768/390/320; actual record navigation, saved filters, permission boundaries, revocation, retry, loading, empty and keyboard pagination pass. Initial checks corrected a fixture field, stale insertion expectation, native focus timing, reader markup replacement and inherited mobile styling. A local auth rate limit was respected by restarting only the isolated preview.

A42-sample navigation run (30 retained,6 cold loads) on a copy of P4H's representative fixture retains the same Home/Clients/Work request/statement/call counts. All routes keep10 scripts; decoded JavaScript adds153 bytes to388963. One/two-frame timing variation is disclosed without a significance or speed claim. No Pages queries/editor runtime on unrelated routes. [Visual preview and measurements](previews/pages-p4i/README.md). One fresh Sol High review found no material findings; no re-review. The review relied on recorded checks and noted two artifact details, corrected/documented in its evidence report.

All110 normal application tables/rows, schema,42-migration ledger, credentials and unrelated source remain intact. Normal preview is healthy atlocalhost:8787 on the final build; isolated8788 is stopped. No real sharing/invitations, provider/email action, video work/tests, commit/push or deployment. Evidence: `/home/ary/Developer/bloomops-pages-p4i-evidence/`.

**P4's core editing, named sharing and bounded Work-view slice is locally accepted.** Anonymous publication, external guests, larger relations/database features and full Notion parity remain separate; staging/merge is not claimed. **Next bounded task: P5A conversion preflight**, defining and implementing a read-only review of a prospect's same-workspace client match, purchased service/scope and onboarding prerequisites. Conversion receipts/stop guarantees and explicit activation follow in separate P5 slices. Keep email paused; no invitations or other messages are a side effect.

## P4H file compatibility and navigation — accepted locally

Existing project-file links work in shared readers while retaining independent file/project/client access. Actual client downloads preserve file bytes and private attachment headers. A page grant does not expose internal files or another client's files; changing file visibility revokes its saved link while page access remains valid. Source documents are never rewritten. This verifies existing file links, not a new upload surface or storage model.

**192 focused compatibility tests and15 built-browser file checks pass.** A controlled pre-Pages/current comparison records84 navigation samples (60 retained) and12 cold loads on the same representative synthetic fixture with40ms D1 latency. Home/Clients/Work retain1 request each,15/3/7 statements and3/2/2 D1 calls respectively. Medians are comparable; frame-sized differences in five-observation samples are not a speed claim. All routes keep10 scripts; decoded JavaScript changes388457→388810 bytes (+353,about0.09%), without loading editor runtime or querying workspace Pages tables. [Preview and complete measurements](previews/pages-p4h/README.md).

The disposable pre-Pages source matches all1785 recorded hashes. Its first symlinked-dependency build failed at Worker startup; a separate dependency copy and rebuild resolve packaging without changing runtime source. File tests use a separate database copy from performance measurements. Main110 application tables/rows, schema,42-migration ledger, credentials and unrelated source remain intact. No production behavior or migration change. One fresh Sol High acceptance review found no material findings and independently passed all192 compatibility tests; no re-review was needed. Evidence: `/home/ary/Developer/bloomops-pages-p4h-evidence/`. Normal8787 remains on the accepted current build; isolated8788 is stopped. No original copies, provider/email/video work, commit/push or deployment.

**Next bounded task: P4I linked Work views**, reusing existing Table/Board/Calendar/Gallery presentation over authorized canonical Actions. Start with read-only records and keep page configuration separate from operational changes. Anonymous publication, live operational projections and P5 handoff remain unfinished; do not claim all P4 or full Notion parity. P3 email remains paused.

## P4G native page links — accepted locally

Typing @ now searches the current authorized page tree and inserts a labelled link through Bloomsi's existing shared-page resolver, with explicit workspace context. Client links open portal Pages; receiving or choosing a link does not grant access. Suggestions contain metadata only and omit pages outside the recipient's tree. Keyboard navigation keeps the highlighted result visible; Escape restores writing, and options retain44px targets on desktop/mobile. Bloomsi page links end at their label when writing continues, while URL detection and legacy editor defaults remain intact. Links are visibly underlined in the editor.

**72 focused tests and72 built-browser checks pass** (27 linking and45 editor/recovery). Actual client reader link clicks, touch insertion, private suggestions, revocation, five widths, source round trips and recovery are verified. The final Worker build, syntax/diff and data/schema/source/credential preservation pass; no migration. Initial browser checks found the inherited link-inclusivity behaviour and a touch-target CSS override; both are fixed with focused coverage. One fresh Sol High review found no material findings and independently passed57 focused tests; no re-review was needed. [Visual preview](previews/pages-p4g/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4g-evidence/`. Normal8787 is restored; isolated8788 is stopped. No real shares/messages, provider/email action, video work/tests, commit/push or deployment.

**Next bounded task: P4H remaining content/access and P0 navigation acceptance**, verifying existing file links and compatible non-video content, and measuring unrelated routes with a controlled synthetic fixture. Anonymous publication, live operational projections and P5 handoff remain unfinished; P3 email stays paused.

## P4F keyboard and touch block movement — accepted locally

Bloomsi's existing editor now has compact SVG up/down controls and Ctrl/Cmd+Shift+ArrowUp/ArrowDown shortcuts. Movement carries a whole top-level block, preserving nested content, marks, selection and undo/redo. Boundaries and selections spanning several top-level blocks leave content unchanged. Existing drag and autosave/recovery remain; the new controls default off in legacy editors.

**24 focused tests and36 final built-Worker movement checks pass;45 existing editor/recovery checks passed before the gap-cursor-only fix.** Keyboard, buttons, touch, nested content, native drag, save/reload, undo/redo and five widths are verified. Initial browser attempts needed waits for the editor's actual selection and floating-menu layout; no application fix or authorization relaxation was needed. The final Worker build and preservation checks pass: all110 main application tables/rows, schema,42-migration ledger, credentials and1849 unrelated source files are unchanged. One fresh Sol High review found that a gap cursor could stay behind its moved divider. Numeric gap-position mapping and real StarterKit/browser divider regressions fix it; the single focused re-review accepts the correction. [Visual preview](previews/pages-p4f/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4f-evidence/`. Normal8787 runs the built change; isolated8788 is stopped. No migration, real shares/messages, provider/email action, video work/tests, commit/push or deployment.

**Next bounded task: P4G native page links**, adapting the inherited mention picker to current authorized Bloomsi page metadata and shared-page routes. File storage/public publication and canonical operational projections remain separate acceptance work; P3 email remains paused.

## P4E shared document compatibility — accepted locally

Authorized read-only Pages now preserves native toggles, responsive columns, inline raster images, callout/semantic formatting, read-only tasks, tables/code and bounded server-rendered equations. The existing editor and stored source HTML are preserved. Bloomsi opts into document formatting; the legacy sanitizer/reader defaults remain unchanged. Sanitization runs before equation rendering, permits strict raster data only on image sources and removes arbitrary layout classes/styles. Bookmarks remain links; no iframe/video activation or operational data readers.

**125 focused tests and39 built-Worker browser checks pass**, including real editor/custom-block round trips, image picking/re-encoding, client read/revocation, keyboard toggles, five widths, safe text/source preservation and absence of the ProseMirror runtime in loaded reader scripts. Worker build, syntax/diff and preservation checks pass. No schema change: all110 main application tables/rows, schema,42-migration ledger, credentials and unrelated files remain unchanged. One fresh Sol High read-only review found equation serialization issues with quoted greater-than signs and encoded ampersands. A quote-aware opt-in scan and equation-attribute normalization fix them; real-editor serializer and browser comparison/matrix regressions pass. The single focused Sol High re-review accepts the fix and independently reproduced correct rendering. [Visual preview](previews/pages-p4e/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4e-evidence/`. No real share/import, provider/email action, video work/tests, commit/push or deployment. Normal8787 preview runs the final build; isolated8788 is stopped.

**Next bounded task: P4F keyboard/touch block movement**, followed by remaining Pages acceptance checks. Larger database behaviours and P5 handoff remain separate. P3 email remains paused.

## P4D document discussions — accepted locally

Pages now has a compact Comments control with attributed page discussions, replies, Open/Resolved filtering and resolve/reopen. Named Can comment grants inherit through subpages; viewers read discussions, commenters reply without editing pages, and thread starters/current editors can resolve them. Author identity is saved separately from membership. Posting uses duplicate-safe request IDs and independent thread revisions; failed responses retain the mounted draft for explicit retry and refresh. Comments are plain text, with readable paragraph spacing and native SVG controls.

**176 focused tests and179 built-browser checks pass** (36 discussions,50 sharing,48 hierarchy,45 editor/recovery). The final Worker build, syntax/diff and fresh/repeat/populated/local migration and preservation checks pass. Desktop and mobile visuals at1440/1024/768/390/320 are verified. Browser testing found an incorrectly correlated preview query; explicit workspace/page/thread correlation and a private-page regression fix it. Final checks and one fresh Sol High independent review pass with no material findings; no re-review was needed. [Visual preview](previews/pages-p4d/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4d-evidence/`.

Migration0041 adds threads/messages and widens the grants permission check through a complete row-preserving leaf-table rebuild.42 domain migrations,75 domain tables. Populated proof preserves six nested rich/untitled documents and12 view/edit/none grants across two workspaces. All108 prior main application tables/rows, unrelated source and credentials remain unchanged; old schema differs only in the widened grant check. Normal local Pages remains empty. Normal8787 preview is restored with all live actions disabled; isolated8788 is stopped. No real shares/invites, email/provider work, video tests, legacy copy/import, commit/push, deployment or production/DNS change.

**Next bounded task: P4E document compatibility**, starting with the inherited reader's supported formatting, equations, embeds and inline images. Preserve source content and verify authorized read-only rendering and rich-editor round trips. Inline anchored comments, notifications, reusable templates, anonymous publication, larger database behaviours and P5 handoff remain separate. P3 email remains paused.

## P4C inline icons and named page sharing — accepted locally

Owner expanded P4C to sharing pages and subpages with clients/users. The Share dialog grants current workspace recipients Can view / Can edit / No access, shows inherited access and supports a restricted inheritance boundary. Owners/Admins manage sharing and hierarchy; shared editors change content only. Private ancestors/siblings never enter recipient trees, breadcrumbs or search. Client grants bind active membership, role and a live linked contact. Revocation and membership/contact changes gate reads and pending saves; denied edits keep the existing recoverable draft. Moving between parents with sharing requires acknowledgement. Native SVG icons persist across the document and sidebar.

Clients open shared documents through portal Pages; copied links require sign-in and explicit workspace switching when needed. Possessing a link grants no permission. Read-only HTML uses the existing sanitizer. No real page was shared or invitation sent; normal local Pages remains empty. The owner asked for a familiar Notion experience; this implements named sharing, not full Notion parity or anonymous publication.

**161 focused tests and143 built-browser checks pass** (50 sharing/keyboard/responsive checks across owner, internal editor and two clients;48 hierarchy regressions;45 editor/recovery regressions). Final Worker build, fresh/repeat/populated/local migration, syntax/diff and preservation proofs pass. The populated proof preserves six existing rich/untitled documents and nested hierarchy across two workspaces. One fresh Sol High read-only review found no material findings; no re-review was needed. [Visual preview](previews/pages-p4c/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4c-evidence/`.

Additive migration0040 creates page settings/grants and a composite client-contact index; it defaults existing icons/inheritance and creates no grant.41 domain migrations,73 domain tables. All106 prior application tables/rows and all prior schema objects are preserved, along with credentials and unrelated work. No dependency, provider/email, legacy import, video work/tests, commit/push, production/DNS or deployment. Further P3 email work remains paused.

**Next bounded task: P4D document comments**, including explicit comment-only access, authenticated attribution and inherited permission checks. Broader rich-content/attachment compatibility, reusable page templates, anonymous publication and P5 handoff remain unfinished. [P4 contract](phases/P4.md) owns acceptance.

## P4B nested Pages and page finding — accepted locally

Pages now has an expandable sidebar with inline child creation, breadcrumbs and child links beneath the editor. Dragging nests a page; the searchable Move page dialog supports keyboard/touch and explicit sibling order. Title search shows at most50 matches and narrows across the complete authorized metadata tree. Mobile uses a collapsible navigator,44px page controls and wrapping document titles. All document bodies stay out of the tree read model. Original Bloomsi branding, rich editor and tab-local recovery remain.

**118 focused tests,48 hierarchy browser checks and45 editor regression checks pass on the final build.** Coverage includes opposing moves, depth/cycle guards, current workspace/member authority, foreign/origin denial, stale tree conflict/retry, independent content saves while moving, drag/reorder, bounded title finding, five viewport widths, keyboard/touch, and successful creation despite a failed tree refresh without duplicate pages. Worker build, fresh/repeat/populated/local migration and preservation proofs pass. One fresh Sol High read-only review found no material findings and independently passed50 focused hierarchy/page/draft/tree tests; no re-review was needed. [Visual preview](previews/pages-p4b/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4b-evidence/`.

Additive migration0039 creates separate page hierarchy/location tables and backfills existing pages at top level in deterministic order; content revisions remain independent of hierarchy revisions. There are40 domain migrations and71 domain tables. All104 prior application tables/rows and old schema are unchanged. The populated proof preserves six preexisting synthetic rich/untitled documents across two workspaces. Credentials and1789 unrelated source files remain intact; normal local Pages still contains no seeded documents. Normal8787 preview runs the final build and isolated8788 is stopped. No legacy copies, providers/email, new dependency, commit/push, deployment, production/DNS or video work/tests.

**P4B follow-on: P4C inline page icons and named sharing**, implemented above, reusing the existing SVG icon picker with the owner's no-emoji preference and readable inline document identity. Broader content/attachment compatibility, permissioned sharing/projections and P5 handoff remain unfinished. P3 email remains paused. [P4 contract](phases/P4.md) owns scope.

## P4A workspace Pages — accepted locally

Main Pages now provides a real page list, creation and full-page rich writing for current workspace Owners/Admins. Reused RichEditor supports labelled inline titles, slash insertion and existing formatting/blocks. Serial revision-bound autosave retains edits typed during a pending request; failures/conflicts preserve a user/workspace/page-scoped tab draft, with download, retry and explicit latest-version review. Other internal roles receive an explanatory landing without document access. Legacy operational readers are disabled in this wrapper; inherited editor defaults and source documents remain intact.

**103 focused checks and45 final built-browser checks pass**, plus Worker build, fresh/repeat/populated/local migration, syntax/scope and preservation checks. Real browser coverage includes create/edit/reload, rich formatting, five viewport widths, inherited dark-theme preference, keyboard/slash insertion, failed saves, tab recovery, draft download, conflicts, pending edits, denied/foreign access and return navigation. One fresh Sol High review found no material issue and independently passed21 domain/draft tests; no re-review was needed. A final copy-only clarification makes the leave-page prompt avoid promising recovery when storage is unavailable; the final Worker build passes afterward. Browser coverage predates that wording-only clarification. [Visual preview](previews/pages-p4a/README.md). Evidence: `/home/ary/Developer/bloomops-pages-p4a-evidence/`.

Additive migration0038 creates `bloomops_pages` (39 migrations total). All103 previous application tables/rows and old schema, credentials and1769 unrelated source files are preserved; the new normal local table is empty. No legacy documents copied, new dependencies, real provider request, email, commit/push, deployment, production/DNS or video work/tests. Normal local preview is rebuilt; isolated browser preview is stopped.

**P4A follow-on: P4B nested pages and page finding**, implemented above using the existing depth/cycle-safe helpers. Further P3 email work remains paused by owner. P4 hierarchy, broader document compatibility, sharing/projections and P5 handoff are unfinished. [P4 contract](phases/P4.md) owns current scope.

## P3C3F1 reviewed monitoring checkpoint — accepted locally

Added an explicitly acknowledged future starting point from the latest complete recovery collection, no more than five minutes old, with zero unassigned messages and unchanged account/grant/sender/target/reply revisions. Immutable relational provenance and existing claim/completion guards preserve older-mail uncertainty, the original baseline and every held/stopped decision. No provider request or automatic monitoring occurs.

122 distinct focused tests,15 native D1 checks,56 built-browser checks, Worker build and fresh/repeat/populated/local migration proofs pass. One Sol High review identified an exclusive five-minute cutoff; inclusive timestamp guards and boundary regressions correct it. The single focused re-review accepts the fix.45 affected checkpoint/schema tests,15 native checks and final build/migration proofs pass after that correction. The56 browser checks were run before the server-side cutoff correction; no layout/flow changed afterward. Desktop/mobile captures inspected; mobile dates stack clearly. [Visual preview](previews/prospecting-p3c3f1/README.md). Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3f1-evidence/`.

Additive migration0037 is applied locally (38 migrations). Its new checkpoint trigger was corrected during local acceptance; fresh and actual final schemas agree. All102 prior application tables/rows, old schema except the approved run-kind trigger, credentials and1762 unrelated source files are preserved. The new main checkpoint table remains empty. Normal preview is healthy with live actions disabled. No real checkpoint, mailbox request, email, commit/push, deployment, import, production/DNS or video work/tests. Full P3 remains unfinished and is now paused by owner.

## P3C3E6 report-linked human stop review — accepted locally

Added a named permanent-failure review disclosure, explicit personal-review acknowledgement and bounded evidence note. The guarded confirmation API resolves an opaque saved-report selection and reuses the existing permanent-stop command. Atomic SQL guards bind the associated failed5.x report to the exact accepted delivery/prospect/account, current member/session, account/sender revisions and reply revision. Stop activity retains safe report-check provenance; the existing relational stop remains the operational source. Provider report authenticity and immutable association remain unchanged. No provider read is needed, including when a token is unhealthy.

**101 distinct focused tests and52 built-browser checks pass**, along with the final Worker build and preservation/syntax/diff checks. Native D1 saves one stop/provenance event; duplicate requests and failures cannot leave partial decisions. Five viewport widths, keyboard/error/loading/form/saved states and zero provider requests verified; desktop/mobile captures inspected. One fresh Sol High review found a report-provenance bypass through the older manual-stop API. Separate strict manual and server-resolved report entry points close that boundary; a direct built-browser regression proves rejection. The single focused re-review accepts the fix and independently passed41 affected tests. No further review loop is needed. [Visual preview](previews/prospecting-p3c3e6/README.md). Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3e6-evidence/`.

No migration/dependency change. All normal local application rows/schema/37-migration ledger, credentials and unrelated source are preserved. Original LTB/workspaces/history/voices are intact. Normal preview is rebuilt and healthy with live checks/sends disabled. No real stop, Google/body read, email, commit/push, deployment, import, production/DNS or video work/tests. Next agent-owned task: mailbox coverage/hold resolution before follow-up scheduling and Results. No owner setup is required for local implementation. Full P3/P4/P5 are unfinished.

## P3C3E5 delivery-report review — accepted locally

Added the current-account Owner/Admin Delivery reports screen under Mailbox review, with a bounded deduplicated read model and guarded local API. Raw provider IDs and correspondence stay server-side; opaque selections are resolved against saved current-account candidates. Current authority/account/sender are revalidated after asynchronous reads. Strict same-origin/body/revision/acknowledgement controls precede E4's exact guarded command. Opening/reloading the screen makes no provider request. Associated reports remain unauthenticated and held, with separate received/association/outcome facts and optional detail; no automatic hard-bounce or sending permission.

Verification: **72 distinct focused tests pass**, **61 built-browser checks pass**, and the final Worker build, syntax/diff and preservation checks pass. Desktop/mobile captures inspected at1440/1024/768/390/320 with keyboard/error/loading/empty/disabled/unresolved/associated coverage. Successful and failed favicon requests exercise the unchanged existing avatar against a loopback image server. Initial test harness errors (stale route count, Playwright favicon interception and synthetic fixture SQL) were corrected; the complete final browser run passes. One fresh Sol High read-only reviewer found no material issue and independently passed11 tests; no re-review was needed. [Visual preview](previews/prospecting-p3c3e5/README.md). Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3e5-evidence/`.

No migration or dependency change. All main application tables/rows/schema and37-migration ledger, credentials and unrelated source are unchanged. Original LTB/workspaces/history/voices remain intact. Normal built preview is healthy atlocalhost:8787; live checks/sends remain disabled. No live Google/body read, email, commit/push, deployment, real import/outreach, production/DNS or video work/tests.

Next agent-owned task: **P3C3E6 report-linked human stop review**, reusing the existing permanent stop command with explicit personal review, an evidence note and safe report provenance. No owner setup is needed for this local implementation. Confirmed bounce handling, coverage/hold resolution, scheduling/follow-ups and Results remain unfinished; full P3/P4/P5 are not complete.

## P3C3E4 guarded durable delivery-report evidence — accepted locally

Added a local-only domain command for one exact server-read saved recovery candidate. Existing current Owner/Admin session/member stamps, healthy original-account token/grant/sender/authorizer checks and discovery workspace/account gates are reused, with additional exact report run/message enablement and explicit acknowledgement. All1..100 accepted deliveries require verified identities and settled held/stopped reply states. The atomic claim takes one account lease and snapshots target identities/reply revisions; current authority, unchanged full target set, mailbox revision, reply revisions and expiry guard both transport and completion. Concurrent checks, revocation, new deliveries, manual stops or expired leases discard late results.

Additive migration **0036_p3c3e4_report_evidence** creates report checks and immutable relational target snapshots. Terminal safe action/status/association facts and activity commit atomically; failures cannot leave partial evidence. A90-second lease,30-second cooldown, expired-check supersession and account/message replay protection bound subsequent explicit checks. SQL enforces workspace/candidate/account/target links, immutable provenance/terminal facts and required nonnull terminal fields. Recovery assignments, canonical observations, coverage/cursors, existing stops and holds remain unchanged. Stored associations remain explicitly unauthenticated; no automatic hard-bounce/stop/resume or raw body/header/diagnostic/token persistence.

Verification: **230 distinct focused tests pass**, including36 new command/schema-boundary cases; **19 native D1 checks pass**, covering100 targets, concurrency, rollback, stop races, expiry and replay. Worker build, fresh/repeat zero-to-current migration, populated-copy and actual local migration, syntax/diff and preservation checks pass. One fresh Sol High read-only reviewer found no material defect and independently passed152 report/provider/association/schema tests; no re-review was needed. An initial schema helper-name error was corrected before migration generation; SQL NULL-bypass constraints have dedicated regression coverage. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3e4-evidence/`.

All100 prior application tables/rows and original schema objects are preserved; the existing36 migration entries remain plus0036 (37 total,67 domain tables). Both new tables are empty in the normal local database. Integrity/FKs, credential hashes and unrelated source preservation pass. Original LTB/workspaces/history/voices remain intact. The rebuilt normal preview is healthy atlocalhost:8787 in development/r2-dev with all live actions disabled. No route/UI, dependency, live Gmail/body read, email, commit/push, deployment, real import/outreach, production/DNS or video work/tests. Browser acceptance does not apply to this domain-only slice.

Next agent-owned task: **P3C3E5 delivery-report review surface**, with a current-account Owner/Admin read model and guarded local UI/API for saved candidates and safe check results. Explain association versus confirmation, retain holds, hide raw provider identifiers/correspondence and complete synthetic desktop/mobile/browser acceptance before any separately scoped real body read. No owner setup is required for that local implementation. Confirmed bounce handling, coverage/hold resolution, scheduling/follow-ups and Results remain unfinished; full P3/P4/P5 are not complete.

## P3C3E3 exact delivery-report provider reader — accepted locally

Implemented an uncalled adapter around E2 using the existing bounded Google transport. It validates the complete same-workspace/account registry and saved candidate before any request, requires canonical received time/non-sent identity, and snapshots context before waiting. One fixed original-account message GET requests full MIME payload with explicit top-level fields, one15-second deadline and256KiB response budget. No redirect, retry, refresh, listing/profile request or external attachment follow-up. Missing/mismatched/oversized/malformed/error responses produce no partial proposal. Successful output remains held with unverified authenticity; no automatic hard-bounce, stop or send decision.

Verification: **303 distinct focused checks pass**:302 Node cases across provider, association, field parser, metadata, discovery, backfill, recovery and mailbox regressions plus1 real workerd test. The Worker test uses synthetic intercepted egress and verifies delayed headers plus stalled body under the same15-second deadline. One fresh Sol High read-only reviewer found no material issue and independently passed97 provider/association tests; no re-review needed. Syntax/diff checks pass. This uncalled adapter and interpreter have no changed application import path, so the real Worker bundle/runtime test applies; no unrelated full application build, UI/browser or migration rerun was needed.

All100 application tables, migration ledger/schema and application rows match the preserved E2 checkpoint; credential hashes and unrelated source match E3 startup. Miniflare-managed metadata changed since E2 and is excluded from application-row comparison; E3 startup's separate snapshot covered metadata.sqlite. Integrity/FKs pass. Normal preview stays healthy atlocalhost:8787 in development/r2-dev, with live checks/sends disabled. No app caller, persistence, schema/UI, dependency, live Google/body read, email, commit/push, deployment, import/outreach, production/DNS or video work/tests. Original LTB/workspace/history/voices remain preserved. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3e3-evidence/`.

Next agent-owned task: **P3C3E4 guarded durable report evidence**, connecting exact saved recovery candidates to current workspace/account authority, grant/lease checks and immutable safe association records under synthetic tests. The provider adapter alone does not prove current authority, token-account binding or report authenticity. Manual review, confirmed bounce handling, coverage/hold resolution, scheduling/follow-ups and Results remain unfinished; full P3/P4/P5 are not complete. No owner setup is required for the next local coding task; any later real body read needs its own concrete scope.

## P3C3E2 MIME delivery-report association — accepted locally

Implemented a pure bounded interpreter of supplied Gmail MIME reports. It extracts the structured delivery-status part and returned original headers (header-only or bounded raw message/rfc822), reuses E1 parsing and shares the existing complete verified-identity registry. Exact saved candidate workspace/account/provider IDs/time, returned original Message-ID, immutable sender/recipient and DSN final/original recipient must agree. Missing, duplicate, forwarded, multiple-recipient, malformed or conflicting evidence yields no partial proposal. Human text/HTML and original message-body text are never used as evidence. External attachments and unsupported nested message forms remain unresolved.

Successful output is only a held association proposal with explicit unverified authenticity and reported action/status; even a forged report containing the exact copied original identity cannot become a confirmed bounce or automatic stop. No provider fetch, route, application caller, storage, schema/UI or send action was added. Existing discovery still requires its history cursor after registry reuse.

Verification: **277 focused tests pass**, including72 new association cases plus existing field-parser/metadata/discovery/backfill/recovery/mailbox regressions. A final MIME-type length bound in the uncalled module additionally passes72/72. Worker build, syntax/diff and preservation checks pass. All100 application tables/schema/36-migration ledger, credentials and unrelated source are unchanged. One fresh Sol High read-only reviewer found no material issue and independently passed72 tests; no re-review was needed. Browser/migration/live-provider tests do not apply to this pure interpreter; the shared discovery change is covered by regressions and the Worker build. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3e2-evidence/`.

Normal local preview is restored and healthy; all live check/discovery/recovery/send flags remain disabled. No live mailbox/body read, email, commit/push, deployment, real import/outreach, production/DNS or video work/tests. Original LTB/workspace/history/voices remain preserved. Next agent-owned coding task: P3C3E3 bounded provider retrieval for an exact saved report candidate, then guarded persistence/review. No owner setup is required for that local implementation. Confirmed bounce handling, coverage/hold resolution, scheduling/follow-up delivery and Results remain unfinished; full P3/P4/P5 are not complete.

## P3C3E1 delivery-status field parser — accepted locally

Continued after the approved live mailbox review into the next local delivery-status foundation. Added a pure bounded parser for a decoded ASCII message/delivery-status part. It returns only untrusted canonical final/original recipients and reported action/status fields. No MIME/provider reader, caller, persistence, message attribution, automatic hard-bounce verdict, stop or send action. Diagnostics, MTA names, envelope/log identifiers and extension values are discarded. Internationalized DSNs and unsupported address/date/diagnostic grammar remain unresolved.

Required, duplicate and misplaced fields, malformed optional standard fields and size/recipient limits fail with no partial facts. Raw unfolding retains whitespace for the8192-character cap before normalization; physical lines are limited to998 characters, input64KiB,64 fields/block and20 recipients. Action/status remain independent (including failed4.x.x for abandoned retries); a parsed report is not authenticated delivery evidence.

Verification: **139 focused tests pass**, including54 parser tests plus85 existing metadata/discovery regressions. Syntax/import/diff checks pass; all100 application tables/schema/36-migration ledger, credentials and unrelated source remain unchanged. No build/browser/migration rerun was needed because the parser has no application caller; the accepted D4C build remains current. One fresh Sol High review found unfolded-whitespace/fold-position and optional-field validation gaps. Both were corrected with15 focused regression cases. The single focused re-review accepts the result and independently passed54 parser tests. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3e1-evidence/`.

The approved live mailbox result remains visible:4 messages read,1 matched reply,0 unassigned,catch-up complete,all three test conversations held and historical coverage unverified. No additional live reads, body access, send, commit/push, deployment, import/outreach or video work/tests in this parser slice. Normal preview is healthy with live flags disabled. Next bounded task: P3C3E2 conservative MIME extraction and exact accepted-message/recipient association, retaining an explicit distinction between parsed reports and confirmed bounce evidence. Full P3/P4/P5 remain unfinished.

## P3C3D4D approved live mailbox review — verified

The owner explicitly approved the broader header-only check, including mail outside the three test threads and Spam/Trash. One bounded recovery run read4 unique messages using7 provider requests (profile, one listing page, four metadata requests and one history page). It saved one matched reply and zero unassigned messages; recent-change catch-up completed. No refresh or retry was needed. The collection boundary is2026-09-13T08:06:29.000Z, derived from one second before the earliest attempted test send. No message body/snippet was fetched, no Gmail message was changed and no email was sent.

The result is saved and visible in the normal local mailbox review screen. Eight read-only built-browser checks pass, with desktop1440px and mobile390px captures inspected. Coverage remains explicitly unverified; all three test conversations are held, the existing reply observation was not duplicated and operational/baseline cursors remain null. Enumeration and catch-up do not establish a complete historical snapshot or release sending holds.

Before/after verification: only current-workspace discovery/recovery evidence, reply holds and safe activity changed; schema,36-migration ledger, credentials/configuration, other workspaces and LTB/history/voices are preserved. Integrity/FKs pass. Browser verification additionally created a normal local Owner session through captured r2-dev mail. No migration, application code/build change, commit/push, deployment, real prospect import/outreach, follow-up or video work/tests. Existing independently reviewed D4C build remains current; accepted commands were exercised without an unnecessary extra review cycle. Normal preview remains healthy with all live collection/check/send flags disabled. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d4d-evidence/mailbox-review/`.

Next: define and implement the first bounded local delivery-status evidence slice. Confirmed hard-bounce classification, explicit coverage/hold resolution, scheduling/follow-up delivery and Results remain unfinished. Broad continuous monitoring is not enabled by this one approved check. Full P3/P4/P5 remain unfinished.

## P3C3D4D controlled live prerequisites — verified; broader scope pending

Continued after D4C acceptance using the owner's standing authorization for the existing test conversations. The existing reviewed connection check refreshed the current grant and verified its account/sender. Three exact accepted test-thread metadata checks then passed and registered all three immutable delivery identities. Exactly6 bounded provider requests: token refresh, profile, sender aliases and three exact threads. No mailbox listing, broad history read or email send. The original one reply observation and held conversation remain intact; no duplicate observation and no recovery collection. No retry was needed.

Verification compares the separate pre-live backup: only current-workspace Google check/token state, reply-check state, three identity registrations and safe activity changed. All other workspace rows, LTB/history/voices, schema/migration ledger and `.dev.vars` are preserved; integrity/FKs pass. Credentials were refreshed through the existing encrypted-token path; no credential/config file changed. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d4d-evidence/`. This is verification of accepted commands, with no implementation, migration, build or extra independent-review cycle. D4C's final build/review remains current. Normal preview is healthy with all live send/check/discovery/recovery flags disabled.

**Next scope decision:** one bounded header-only collection from `hello@bloomwired.io` since2026-09-13T08:06:31.349Z (the earliest accepted test delivery), including Spam/Trash and mail outside the three test threads. Up to40 unique available messages/3 listing pages plus bounded catch-up; save server-only message-ID/time/assignment evidence and safe summaries, retain holds and explicitly unverified coverage. The prerequisites now pass. Broader mailbox collection is not yet run because its inclusion of unrelated messages goes beyond the existing test-conversation scope. No additional test email is needed. Production/deployment, imports/outreach, follow-ups and video work/tests remain paused.

## P3C3D4C current-account mailbox review — accepted locally

Implemented `/prospecting/mailbox`, reachable from Overview (including an empty workspace) and Sender setup, plus scoped Owner/Admin GET/POST. The page separates collection/catch-up results, matched/unassigned counts, saved collections and explicitly unverified historical coverage. Read-only acknowledgement, duplicate-submit prevention, focused feedback and reload handle unavailable, busy, cooldown, error and incomplete outcomes. Provider IDs/raw correspondence/tokens stay server-side; no send/resume/hold-clearing action. Existing Bloomsi layout/logo/icons are preserved; mobile account stacking and native checkbox sizing were visually corrected. No schema change.

Verification: **43 distinct focused tests pass** (8 mailbox view,17 shell,18 existing recovery), final Worker build, **61 built-browser checks** across1440/1024/768/390/320 plus **2 unobscured mobile-control checks**. Synthetic injected Google only, including empty/saved/incomplete/unavailable/error, keyboard, role/origin/body/revision and zero-conversation navigation cases. All100 main application tables, schema,36-migration ledger, credentials and unrelated source remain unchanged. [Visual preview](previews/prospecting-p3c3d4c/README.md). Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d4c-evidence/`. External design gallery was inaccessible; existing local design sources were inspected. A stale shell-route test count was corrected before final acceptance.

One fresh Sol High review found two issues: stale read results after mid-read authority/connection changes, and a hidden Overview link with zero conversations. Final authoritative SQL revalidation plus four deterministic race tests and unconditional navigation resolve both. The single permitted focused re-review found no remaining material issue. No commit/push, deployment, live Google request, email, real import/outreach, production/DNS or video work/tests occurred in this slice. Normal preview is restored with live flags disabled.

Next: complete necessary verification of the three existing owner-authorized test conversations, then resolve whether the next bounded mailbox check may include metadata outside those threads. Broad live collection stays disabled. Full P3, P4 and P5 remain unfinished; Astra High remains appropriate for these account/authorization boundaries.

## P3C3D4B saved recovery evidence and catch-up — accepted locally

Continued on `feat/prospecting-p2-eligibility` in `/home/ary/Developer/bloomops-prospecting-p2`; remote preflight confirms main `651d9a5` and PR60head `67b94eb` unchanged. The owner asked to keep proceeding until input is actually needed; no input was needed for this domain slice.

Recovery reuses D3's atomic claim,90-second lease, cooldown, current session/member/authorizer/grant/sender guards, recipient holds and complete target snapshots. Explicit local recovery enablement is additional to the exact workspace/account discovery gate. A verified profile history boundary is captured before collection; bounded recovery-only history catch-up retains assigned and unassigned proposals while normal discovery stays strict. Current authority/lease/targets are checked before each stage and completion. Conflicting repeated evidence is discarded. A failed catch-up may save successful collection with an explicit incomplete boundary.

Additive migration `0035_p3c3d4b_recovery_evidence` adds immutable run kind and two relational tables for collections/messages. Canonical observations, assigned/unassigned proposals, counts, safe activity and terminal run persist atomically. Guards enforce workspace/account/registered-target provenance, complete counts/canonical observations, immutable evidence and no post-terminal insertion. Recovery cannot advance or reset the operational cursor, clear a gap/hold/stop or claim complete historical coverage. Current Owner/Admin summary omits raw provider/history IDs and correspondence.

Verification: **174 focused tests pass**, including18 recovery-domain and5 recovery-provider tests, existing mailbox/schema/discovery/backfill/metadata regressions and three real workerd provider suites. **29 native D1 checks pass**, including100 delivery targets,80 recovery evidence records, replay, failed catch-up, rollback and immutable sealing. Final Worker build, fresh/repeat zero-to-current migration, populated-copy/actual-local migration and syntax/diff checks pass. All98 prior application tables and credential/key/`.dev.vars` bytes are preserved; integrity/FKs pass. Local schema now has36 domain migrations/65 domain tables; new main recovery tables remain empty. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d4b-evidence/`.

One fresh Sol High read-only review found no material issue and independently passed all23 recovery tests. No re-review was needed. No UI/route/job, enabled live setting, dependency, live Google request, email, commit/push, deployment, real import/outreach, production/DNS or video work/tests. Normal built preview has been restored with sending/checks/recovery disabled. Next, continue to a truthful local mailbox review screen with explicit collection/catch-up/coverage distinctions; do not present saved proposals as verified historical coverage or sending permission.

## P3C3D4A historical reply collection foundation — accepted locally

Continued on `feat/prospecting-p2-eligibility` in `/home/ary/Developer/bloomops-prospecting-p2`. Read-only preflight confirms main `651d9a5` and PR60head `67b94eb` unchanged. P3C3D4's first bounded implementation is provider collection; full durable backfill and gap recovery remain unfinished.

Added `prospect-reply-backfill.mjs`, deriving its lower time boundary from the earliest accepted delivery. It lists available mail including Spam/Trash, with no subject/address/thread filter, then reads only the existing approved metadata headers. Limits:3 pages,40 unique messages,64KiB per response,1MiB total and one15-second deadline across listing and metadata. Stable repeated IDs deduplicate; changed identities, incomplete pages, cycles, malformed data and provider/transport failures discard the whole proposal. No retry, redirect, body/snippet or profile/cursor reset.

The reused ancestry matcher now has a separate recovery collector entry point: verified exact ancestry remains tied to the original accepted delivery, while valid incoming mail with no known root becomes unassigned server-only evidence proposals. These contain provider message/thread IDs, received time and a needs-review kind; no headers, correspondence addresses, content or tokens. Ambiguous roots and invalid ancestry cannot yield partial evidence. The existing history reader remains strict and rejects unattributed batches as before.

A successful result means available-message enumeration completed within the limits. Coverage remains explicitly unverified, history catch-up is false, and no next cursor or send permission is offered. Missing/deleted historical mail and transactional mailbox completeness are not claimed. No proposal is persisted or exposed by an app caller in this slice; guarded durable recovery is next.

Verification: **130 focused tests pass** (20 new provider tests,1 new real workerd,38 existing discovery,1 existing real workerd,47 metadata and23 mailbox domain). Both real workerd tests use synthetic intercepted egress; the new test delays listing3 seconds before stalling the metadata body to verify one shared15-second deadline. All98 existing application tables, schema, credentials/key/`.dev.vars` and unrelated source are unchanged; integrity and foreign keys pass. No migration, persistent database fixture write, UI/route/job, enabled setting or dependency added. The final Worker build and syntax/diff checks pass; evidence lives in `/home/ary/Developer/bloomops-prospecting-p3c3d4-evidence/`.

One fresh Sol High read-only review found no material issue and independently passed all58 backfill/discovery tests. No re-review was needed. The normal built preview is restored at `http://localhost:8787`, healthy in development/r2-dev with sending, exact-thread checks and discovery disabled. No live Google request, email, commit/push or deployment occurred.

**Next: P3C3D4B guarded durable recovery proposals and history catch-up.** Define immutable collection/run evidence and unassigned-review handling under current authority, lease and full target snapshots; preserve D3 holds/gaps and explicitly define what coverage can be established. No broad live mailbox access, scheduled/follow-up sending, confirmed DSN classification, real imports/outreach, production/DNS or video work/tests. Full P3/P4/P5 remain unfinished. Astra High remains appropriate.

## P3C3D3 saved discovery progress and recovery holds — accepted locally

Continued in `/home/ary/Developer/bloomops-prospecting-p2` on `feat/prospecting-p2-eligibility`; read-only preflight confirmed main `651d9a5` and PR60head `67b94eb` unchanged. No owner input was needed. The P3 contract defines this bounded domain-only slice before implementation.

Implemented `lib/bloomops/prospect-mailbox.mjs` and additive migration `0034_p3c3d3_saved_discovery`: versioned workspace/account progress, immutable run provenance and relational delivery/identity/reply-revision snapshots. An explicitly enabled local Owner/Admin command atomically holds all 1..100 accepted recipients before provider access, preserving manual stops and prior holds. Revision matching, a 90-second lease, a 30-second completed-run cooldown and current session/member/authorizer/grant/sender checks guard each claim and completion. Any outstanding exact-thread lease needs its own recovery first. New accepted deliveries/identities, competing checks, manual stops, revoked access and replaced/expired leases cannot advance progress. A later claim supersedes an expired run.

Startup records a verified account profile history baseline with permanently unverified earlier coverage; it does not imply that previous conversations were checked. Later P3C3D2 history walks atomically save deduplicated observations/events, a terminal result and the next cursor. Missing identities, expired history, unattributed mail, incomplete outcomes and conflicting observations keep the cursor and a sticky coverage gap. Successful empty reads cannot clear recipient holds or prior gaps. Status omits raw cursor, provider/identity IDs, snapshots and credentials. This is not yet historical backfill, a recovery/resume UI or verified DSN classification.

Verification: **183 distinct focused tests** (181 domain/provider/schema/protection tests plus 2 baseline tests, including real workerd). Final mailbox23/23 rerun passes after recording the actual prior coverage in activity. **22 native D1 checks** include concurrent claims, cross-thread replies, replay, cursor/gap permanence, stop/expired-lease races, rollback, 100 targets and 40 observations in real D1. The Worker build and syntax/diff checks pass. Initial implementation fixes addressed explicit defaults in conditional inserts, direct workspace foreign keys and an EXISTS query construction; the native fixture's incoming timestamp was corrected to follow its actual accepted send.

Fresh and repeated zero-to-current local migration proof passes: 35 domain migrations and 63 domain tables. A populated-copy proof and the actual local migration preserve all 95 prior application tables; the three new main discovery tables and original identity registry remain empty. Integrity and foreign keys pass. Original LTB/history/voices, the three controlled send receipts, saved reply/hold and credential/key/`.dev.vars` bytes are preserved. Unrelated source and the original worktree release-history tail are preserved. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d3-evidence/`.

One fresh Sol High read-only review found no material issue and independently passed all 23 mailbox tests. No re-review was needed. The normal built preview is restored at `http://localhost:8787`; health confirms development/r2-dev and sending, exact-thread checking and new discovery are disabled. No UI, HTTP route, background job, dependency or enabled configuration was added. No live Google request, email, real import/outreach, commit/push, staging/production deployment, DNS change or video work/tests. No new visual acceptance was required for this domain-only slice.

**Next bounded task: P3C3D4 historical coverage and gap recovery foundation.** Define and verify bounded backfill against registered accepted identities, preserving unmatched/gap evidence without guessing attribution or resetting cursors. Distinguish a verified historical coverage boundary from this startup-only baseline before adding a local review UI. Broad live access, scheduled/follow-up sends, confirmed DSNs and Results remain off. Full P3/P4/P5 remain unfinished; Ads E3B stays deferred. Astra High remains appropriate.

## P3C3D2 bounded reply discovery provider foundation — accepted locally

Continued in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`. Read-only remote preflight confirms main `651d9a5` and PR60head `67b94eb` unchanged. No owner input was needed.

Implemented `lib/bloomops/prospect-reply-discovery.mjs`: a provider-only history/metadata reader and exact ancestry matcher against registered same-workspace/account accepted delivery identities. It discovers replies in different Gmail threads using the returned RFC identities from P3C3D1. Direct/transitive references resolve independently of response order; conflicting roots, invalid metadata/ancestry or unattributed inbound mail keep the entire proposal unresolved/held without observations or a next cursor. Subject, address, domain, thread coincidence and the submitted RFC ID are never fallback attribution. Existing original messages seen in the window must still match their registered SENT/provider/thread/sender/recipient identity. Draft/own-SENT observations are excluded; automatic responses and delivery reports remain unreviewed holds, never positive/human/hard-bounce classifications.

History reads are bounded to3 pages/40 unique messages/100 registered identities, with no Inbox filter, body/snippet fetch, search, profile/reset fallback or retry. IDs are compared numerically, including values beyond JavaScript safe integers. Repeated additions are deduplicated. A next cursor is proposed only after complete terminal history, all metadata and unambiguous matching. Expired history404, incomplete pagination, missing/deleted messages, invalid responses and budget failures remain unresolved. One15-second deadline covers the entire walk, including body reads; per-response limits are256KiB history/64KiB metadata and1MiB total. Shared strict parsing and transport are reused from the existing exact-thread reader. Legacy sync/matching/storage/queue modules are untouched: their fallback matching, body reads and cursor reset are incompatible with this slice.

Verification passes: **128 distinct focused tests** (38 discovery,1 new real workerd,47 existing provider,1 existing real workerd,24 reply domain,17 identity), final Worker build and syntax/diff hygiene. The127-test aggregate passed before review; after the review correction, all38 affected discovery tests pass. Workerd tests use synthetic interception only, exercise redirects/status/gaps/limits, and stall a metadata body after4-second history latency to prove the shared15-second deadline. An initial pagination-token test exposed overly strict space handling; printable opaque tokens now pass through URLSearchParams encoding safely.

One fresh Sol High read-only review found a Medium issue: a per-record100-addition limit could reject101 duplicates representing one unique message. The new regression reproduced the failure. Removed that unsupported limit while retaining the history-record, unique-message and byte limits. The single focused Sol High re-review resolves the finding with no remaining material issue, independently passing38/38 affected tests and inspecting the final build. Initial review independently ran37 discovery tests and both real workerd tests.

No schema, migration, UI, endpoint, background job, dependency or configuration change. All95 application tables, schema, credentials/key/`.dev.vars` and unrelated source files are unchanged;34 domain migrations/60 tables remain. Integrity and foreign keys pass. Original LTB/history/voices,3 accepted controlled receipts, the saved reply/hold and the empty main identity registry are preserved. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d2-evidence/`. The final built normal preview is restored at `http://localhost:8787`; local GET confirms the existing1 reply observation checked/held with mailbox checks disabled. Sending remains disabled. No live provider access, email, real import/outreach, commit/push, deployment, production/DNS or video work/tests. No new browser/migration acceptance was needed for this provider-only slice.

**Next bounded task: P3C3D3 durable discovery progress and recovery holds.** Define the guarded same-workspace/account cursor/lease and identity-snapshot contract, with atomic persistence, replay deduplication, revocation/stop races and conservative expired/incomplete/unattributed outcomes. Establish explicit bootstrap/backfill coverage before wiring discovery; a current mailbox cursor alone must never imply earlier mail was checked. The new reader intentionally leaves an unattributed inbound batch unresolved, so durable handling is required before unattended use. Keep broad live access and scheduled/follow-up sending off. Verified DSN evidence, scheduling/Results and full P3/P4/P5 remain unfinished; Ads E3B deferred. Astra High remains appropriate.

## P3C3D1 verified delivery identities — accepted locally

Continued on `feat/prospecting-p2-eligibility` in `/home/ary/Developer/bloomops-prospecting-p2`. Read-only remote preflight confirms main `651d9a5` and PR60head `67b94eb` unchanged. The owner's standing direction authorizes routine work without repeated permission prompts; no owner input was needed.

The exact-thread check now saves the verified RFC identity returned by the exact accepted Google SENT message, after its original account/thread/provider-message/sender/recipient gates. It remains separate from the immutable submitted receipt. Additive migration `0033_p3c3d_delivery_identity` creates one relational identity record per delivery, unique by workspace/account/RFC and provider message, with verifying membership, connection/sender revisions and verification time. Same-workspace foreign keys, accepted-receipt matching and immutable update/delete guards protect provenance. The returned RFC identity remains server-only.

Identity registration, its single creation event, reply observations and completed state share the existing atomic completion batch. Replays preserve original verification provenance without duplicate identity/observation events. Prior or raced conflicting delivery identities and observation associations finish **unresolved/held**, without new associations or partial observations. Revoked authority, changed grants, permanent stops and expired/replaced leases still win. Empty checks may verify an identity but cannot clear a hold or grant sending. Original-ID-only uncertain-send recovery remains unchanged and must not resend when unmatched.

Verification passes: **121 distinct focused tests** (17 identity,24 reply domain,47 provider,19 schema,1 real workerd,13 recipient protection), **24 native D1 checks**, **51 built-browser checks** at1440/1024/768/390/320px, final Worker build and syntax/diff hygiene. The initial119-test passing run was followed by final17/17 identity tests after adding workspace-isolation and nonaccepted-receipt cases. Test-only fixture corrections aligned privacy assertions with the existing delivery DTO's original receipt fields and created a distinct prospecting workspace. Native acceptance includes100-message threads, replay, conflicts and immutable guards. The built-browser flow saved exactly1 synthetic returned identity and1 verification event; desktop/mobile captures were inspected. No UI layout change.

Fresh/repeated local migration verification passes; a populated-copy check and the actual local migration preserve all94 prior application tables. There are now34 domain migrations/60 domain tables. The generated snapshot changes only the new table. Main local identity table remains empty: existing deliveries were not backfilled or inferred from submitted IDs. Original live reply remains checked/held with1 observation and all3 accepted receipts unchanged; credential/key/`.dev.vars` bytes are unchanged. Integrity passes with0 foreign-key failures. Unrelated source and the original worktree's release history are preserved.

One fresh **Sol High read-only review** found no material issue, independently reran17/17 identity tests, and inspected the supplied121focused/24native/51browser/build/migration/preservation evidence. No re-review was needed. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3d-evidence/`. The final built preview is restored at `http://localhost:8787`; authenticated local GET confirms sending and mailbox checks disabled, with the existing reply/recipient hold intact. Isolated8788 is stopped. No new provider request, connection refresh, email, real import/outreach, commit/push, deployment, production/DNS or video work/tests.

**Next bounded task: P3C3D2 broader reply discovery foundation.** Inspect reusable `gmail-sync`, `gmail-thread`, `reply-match` and reply-ingest behavior without activating legacy connections/state. Define a bounded metadata-only discovery contract against registered accepted-delivery identities, with exact ancestry attribution, replay deduplication and conservative gap/cursor recovery. Do not classify a delivery report as a confirmed hard bounce without separately verified DSN evidence. Keep broad live access, scheduling and follow-up sends disabled. Full P3/P4/P5 remain unfinished; Ads E3B stays deferred. Astra High remains appropriate.

## P3C3B live acceptance and P3C3C recipient protection accepted

Owner direction: **do not ask for approval before each routine step in the current work**. Necessary checks of the existing controlled test conversation are authorized without per-attempt prompts; this supersedes the earlier one-check gates below. Preserve the explicit real-outreach/production/video exclusions. No additional owner input was needed for the work recorded here.

The corrected built UI successfully checked **Bloomsi paragraph spacing check** at `2026-09-13T09:50:08.440Z`. It saved one incoming **reply_unreviewed /reply_chain** observation (received `2026-09-13T09:26:14.000Z`), a **checked/held** state at revision6 and3 activity events. This confirms exact-thread reply ingestion and durable hold, not a positive/human Results classification. Original immutable receipt `4502eb1e-166d-4983-abfb-7e753be519a8` and submitted identity are preserved. The temporary check preview was stopped and normal send/check-disabled preview restored. No further send, connection refresh or credential change was needed. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3b-evidence/live-verification/`.

Continued directly into P3C3C in the same isolated worktree `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`. Recipient protection now derives from the original recipient in immutable accepted receipt/approval records. An existing hold, stop or unfinished/unresolved check prevents preparation or sending through another prospect at that exact normalized email in the same workspace. It cannot be bypassed by editing the source profile/draft or changing the sender/connection. Different addresses, Gmail dots/plus forms and other workspaces are not silently combined. Content drafting/approval remains separate.

Protection is enforced in server preflight, atomic preparation/send claims and immediately before provider transport. A hold/stop arriving before submission wins; an outcome already submitted remains recorded honestly. The delivery screen explains stopped/held/pending protection and links to the source conversation, with preparation/send controls disabled. No raw stop evidence, provider tokens or body content in the protection DTO. [Visual preview](previews/prospecting-p3c3c/README.md).

Verification passes: **52 distinct focused tests** (13 recipient protection,15 delivery,24 replies), **20 native D1 checks**, **51 built-browser checks** at1440/1024/768/390/320px, final Worker build and syntax/hygiene. Tests include canonical/exact/alias/tenant boundaries, source address edits, denied/suspended actors, disconnected/sender changes, stale preparations/sends, before-claim/pretransport/in-flight events, pending/expired checks and empty-check behavior. Native/browser fixtures create approved duplicate receipts before recording their source stop; API/keyboard/visible protection checks prove the new guard. An initial test used the wrong existing update-result property; corrected to its actual `ok` contract, then final tests passed. One fresh Sol High read-only review found no material issue; it independently reran13/13 recipient-protection tests and inspected the supplied52focused/20native/51browser/build/preservation evidence. No re-review was needed.

No schema/migration/dependency change:33 domain migrations/59 tables remain. All94 application tables and real `.dev.vars`/credential/key bytes are unchanged by P3C3C implementation, including the newly verified live reply and all earlier receipts. Integrity/FKs pass. The final built preview is restored at `http://localhost:8787`; local read-only checks show held recipient protection on both the original test delivery and its earlier duplicate recipient, with sending disabled. Isolated preview is stopped. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3c-evidence/`. No real import/outreach, new email, commit/push, deployment, production/DNS or video work/tests; original LTB/history/voices and unrelated work preserved.

Next: define the bounded P3C3D broader reply/delivery-status discovery and recovery contract, including verified provider-returned message identity for matching outside the original thread. Keep actual scheduled/follow-up sending off. The observed provider/submitted RFC-ID difference also limits legacy-style original-ID-only uncertain-send recovery; it must stay unresolved rather than resend if no exact match is available. Full P3/P4/P5 remain unfinished; Ads E3B deferred. Astra High remains appropriate.

## P3C3B provider-returned identity fix — accepted locally; live verification pending

The owner’s **yes go** authorized the prepared single diagnostic check. It ran once at `2026-09-13T09:38:49.485Z`: HTTP200, valid bounded metadata, the exact original thread and accepted SENT provider message, two messages. The returned anchor RFC Message-ID differs from the submitted receipt ID. That difference explains the old equality check’s rejection; the diagnostic did not retain raw header values or message content. The result remained unresolved/held at revision4 with zero observations. Both live-read authorizations are consumed. No further mailbox check was made.

Implemented the bounded compatibility correction: locate the original accepted Google provider message in its original account/thread, require SENT/not-DRAFT, exact sender/recipient and a valid unique returned RFC ID, then trace reply ancestry from that returned ID. Preserve the immutable submitted receipt. The submitted RFC ID alone, another sent message, subject/address/domain similarity or missing/ambiguous identity cannot substitute for the accepted anchor. All prior conservative holds, own-SENT exclusion, tenant/session/grant guards and stop behavior remain intact.

Verification: **72/72 focused tests** (47 provider,24 domain,one native workerd test with19 intercepted requests), **17/17 native D1 checks**, **41/41 final built-browser checks** across five widths, final Worker build and syntax/hygiene pass. New regressions reproduce the original mismatch failure and prove returned-ID ancestry/descendants, no submitted-ID fallback, original provider/address/SENT denials and immutable receipt preservation. Native and browser provider fixtures now return a different RFC ID; actual desktop/phone captures were inspected. All post-diagnostic provider traffic is synthetic/intercepted. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3b-evidence/provider-anchor-fix/`. One fresh Sol High read-only review found no material issue; the reviewer independently passed47/47 provider tests and inspected the supplied final verification evidence. No re-review was needed.

The corrected built app is restored at `http://localhost:8787` with send/check disabled; the existing live held/unresolved state remains visible. Isolated preview is stopped. Comparison across94 application tables shows only the expected two diagnostic-check events and reply-state revision change; all other rows including connection and accepted receipts are unchanged. Integrity/FKs pass; `.dev.vars`/credential/key bytes unchanged. No migration/schema/dependency change, new send, commit/push, deployment, real import or video work/tests. Original LTB/history/voices and unrelated work remain preserved.

**Next owner gate:** authorize one header-only verification check of the same **Bloomsi paragraph spacing check** conversation, thread `1a099e1072d8810f`, receipt `4502eb1e-166d-4983-abfb-7e753be519a8`, prospect `34e5a667-2ae0-401e-96b6-cd10b1fb84c9`. No new reply or email is needed. Use the existing exact-receipt temporary preview and built UI acknowledgment once, keep sending off, then restore disabled preview. The diagnostic helper’s attempt marker is consumed and it must not be rerun. Refresh the current dedicated connection through its accepted check path only if needed. Full P3/P4/P5 and later discovery/suppression/DSN/scheduling/Results remain unfinished. Astra High remains appropriate.

## P3C3B live check — durable hold verified; reply verification unresolved

The owner said **done**, authorizing one header-only check after replying to **Bloomsi paragraph spacing check**. Refreshed the existing dedicated Google connection successfully (revision4), keeping the same grant/account/sender/key. Started the prepared exact-receipt preview with sending off, acknowledged the header check in the built UI and clicked **Check this thread** once. The check completed at `2026-09-13T09:27:55.176Z` as **unresolved**, saving a durable **held** state at revision2 with zero observations. This does not prove that the reply is absent; the response could not be verified. No second check was made.

The one-check authorization is consumed. The temporary preview is stopped and the normal built preview restored. Authenticated local GETs confirm reply `enabled:false`, `canCheck:false`, persisted held/unresolved state and delivery `enabled:false`, `canSend:false`. Comparison across94 application tables shows only the expected connection refresh, one reply state and3 added activity events. All other prior rows, including the three sent receipts and LTB records, are preserved. Integrity/FKs pass; `.dev.vars`/credential/key bytes unchanged. Private before/after evidence: `/home/ary/Developer/bloomops-prospecting-p3c3b-evidence/live-check/`.

Local investigation confirms the saved original receipt/account/address context passes the reviewed parser's validation with an injected synthetic anchor. The normal response intentionally omits provider diagnostics/raw metadata, so the live failure's cause is still unknown. No weakened matching or speculative fix was introduced. Google’s [thread metadata reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get) confirms the requested metadata mode and header filter; that alone does not establish the actual live response.

Prepared a private one-use diagnostic helper that reuses the accepted scoped check command and records only HTTP status, byte/message counts and validation booleans. It rejects other endpoints/threads/methods/body formats, preserves manual redirect rejection/deadline/size bounds, and outputs no header values, message text, raw errors or tokens. It has not run against the live mailbox. All21 synthetic diagnostic tests and syntax checks pass; the separate bounded read-only Sol High helper review found an incomplete request allowlist. Tightened it to require the entire exact URL/query, Authorization-only headers and no body. All21 tests pass, including7 added denials; the single focused Sol High re-review resolves the finding with no remaining issue and independently passes21/21 tests. No application runtime/schema/migration/build change, send, commit/push, deployment or video work/tests this turn.

**Next owner gate:** authorize one additional header-only diagnostic check of the same existing thread `1a099e1072d8810f`, receipt `4502eb1e-166d-4983-abfb-7e753be519a8`, prospect `34e5a667-2ae0-401e-96b6-cd10b1fb84c9`. No new reply or test email is needed. The prepared `live-check/check-with-diagnostics.mjs` requires `--owner-authorized-one-thread-diagnostic` and consumes an exclusive local attempt marker; do not execute before that specific authorization. Stop the normal preview before native helper execution to avoid concurrent local DB ownership, restore it afterward, and keep sending disabled. The live reply acceptance gate remains unresolved; scheduling, broader discovery/DSNs, address-wide suppression and Results remain later work. Astra High remains appropriate.

## P3C3B saved thread checks and stop review — accepted locally; live acceptance pending

Continued in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`; latest read-only preflight main `651d9a5` and PR60 head `67b94eb` remain unchanged. Preserved all accepted source work and the owner-approved **Ary at Bloomwired** sender and paragraph spacing.

What works: full-page **Replies and stop review** from accepted deliveries, with original sender/recipient/subject, compact icons, labelled fields, visible colored states and local saved conversations in Overview. An explicitly enabled Owner/Admin check reads only the accepted receipt's original thread through the reviewed P3C3A metadata reader. Current workspace/session/member/original-account/sender/grant and revision checks guard transport and persistence. A90-second lease and30-second cooldown bound concurrent/repeated checks. Immutable observations deduplicate by workspace/account/provider message; records and activity commit atomically. Incoming or unresolved checks create a durable hold; a later empty check cannot clear it. Human opt-out, decline, confirmed hard-bounce or manual stops require evidence, survive connection loss, supersede in-flight checks and cannot resume or be rewritten. No body/snippet/raw-header/token storage or human/positive outcome inference.

Verification: **100/100 distinct focused tests**, **16/16 native D1 checks**, **41/41 built-browser checks** at1440/1024/768/390/320px, final Cloudflare build and syntax/patch hygiene pass. Browser coverage includes keyboard acknowledgement/check/stop, busy/cooldown controls, interrupted-request focus, visible state labels, stopped evidence, Overview links and denied roles/workspaces. [Inspected visual preview](previews/prospecting-p3c3b/README.md). Provider responses were synthetic/injected/intercepted only. Initial verification corrected a missing workspace FK, nullable stop constraint and Status label usage; one earlier browser run overlapped a build that removed assets, then passed after the final build/restart. The final tests/captures above use the corrected source.

Additive migration `0032` reaches **33 domain migrations /59 domain tables**. Populated/repeat and isolated zero-to-current/repeat verification pass. All92 pre-existing application tables are unchanged, including the three accepted receipts and encrypted Google grant; both new reply tables remain empty on the main local database. Integrity/FKs pass, and real `.dev.vars`/credential/key bytes are unchanged. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3b-evidence/`. No new dependency.

One fresh Sol High review found a D1 parameter-limit failure for long threads. Replaced the per-message SQL bindings with one bound JSON value and a `json_each` collision guard. The64/99-observation regressions fail before the fix and pass after it; all23 reply-domain tests and16 native checks pass, including an actual100-message thread saved atomically. The other77 focused checks remain passing. The single focused Sol High re-review resolves the finding with no remaining issue; the reviewer independently reran23/23 domain tests and inspected the supplied16/16 native evidence. The final post-fix Worker build and41/41 browser checks also pass. The current built app is restored at `http://localhost:8787`; authenticated local reads confirm reply `enabled:false`, `canCheck:false`, zero observations and delivery `enabled:false`, `canSend:false`. The isolated fixture preview is stopped. A private exact-thread helper is prepared but has not run. No live mailbox read, new send, commit/push, deployment, production/DNS, real import or video work/tests occurred. Original LTB/history/voices and unrelated work remain preserved.

**Next owner gate:** reply **Test reply** to the existing **Bloomsi paragraph spacing check** email, then explicitly authorize one metadata-only check of that conversation. Original sender `hello@bloomwired.io`, recipient `aryannelombres@gmail.com`, thread `1a099e1072d8810f`, receipt `4502eb1e-166d-4983-abfb-7e753be519a8`, prospect `34e5a667-2ae0-401e-96b6-cd10b1fb84c9`. Use the original connected account, keep sending off, refresh the existing connection if needed, check once and restore disabled preview. All prior single-email authorizations are consumed. [P3 contract](phases/P3.md) requires separately bounded live acceptance; no new credentials or new test email are currently needed.

Full P3/P4/P5 remain unfinished. Before scheduling or real outreach: address-wide suppression across duplicate prospects, broader reply discovery/gap recovery, verified DSNs outside the original thread, final stop checks at claim/pretransport and truthful Results. A hold is not send permission or a complete mailbox view. Ads E3B remains deferred. Astra High remains appropriate.

## P3C3A exact-thread reply observation foundation — accepted locally

Continued on `feat/prospecting-p2-eligibility` in `/home/ary/Developer/bloomops-prospecting-p2`; read-only remote preflight confirms main651d9a5 and PR60head67b94eb unchanged. Defined the bounded P3C3A provider foundation and remaining P3C3B durable integration in [P3](phases/P3.md). All accepted source work and the owner-approved sender/paragraph format are preserved.

Implemented `lib/bloomops/prospect-reply-observations.mjs`: one metadata-only GET for an accepted receipt's original Google thread, with original-account/receipt validation and exact SENT provider/RFC message/sender/recipient anchor checks. Explicit reply ancestry works across changed correspondent addresses and response order. Subject/address/domain matching is never a fallback. Drafts and verified own SENT mail are excluded; ambiguous apparent self-mail, unknown ancestry, duplicate IDs, malformed data and missing anchors remain held/unresolved. Automatic responses and delivery reports are separated from unreviewed replies; no human, positive outcome, opt-out, decline or confirmed hard-bounce inference is made from these headers. No reply bodies, snippets, raw headers or provider diagnostics are returned.

Verification: **44/44** tests pass (43 focused plus one real workerd test with18 intercepted requests). Coverage includes redirects/errors, partial/malformed/oversized responses, a stalled response body stopped by the15-second deadline, matching/duplicate/ancestry cases and conservative hold decisions. Syntax/diff checks pass. All92 existing application tables and credential/key/.dev.vars bytes are unchanged; the live preview and three accepted send receipts remain untouched. Evidence: `/home/ary/Developer/bloomops-prospecting-p3c3a-evidence/`.

One fresh Sol High review found an alternate-alias outbound false hold. Corrected the reader to honor each message's provider SENT label; an added regression proves alternate-alias mail is excluded while a reply to it still holds. The prior filter reproduces the false hold. The single focused Sol High re-review resolves the finding with no remaining issue; the reviewer independently reran the two affected regression cases and inspected supplied final44/44 suite evidence. This module has no application caller, API, persisted stop state or UI yet. No live mailbox read or external send occurred; native egress was intercepted in memory. No schema/migration/dependency change, application build, browser run, commit/push or deployment. The native test bundles and runs the new code in workerd; unrelated application/build/migration/browser checks are not claimed. Original LTB/history/voices and paused video work/tests remain preserved.

**Next: P3C3B durable exact-thread checks and pause/stop review**, with live workspace/session/grant guards, additive relational records, deduplication/activity and monotonic stop state. Empty thread observations are not send permission and cannot clear earlier stops. Broader reply discovery, validated DSNs outside the original thread, automatic stop handling and final send-race protection remain required before any scheduled sequence/Results. Full P3/P4/P5 remain unfinished; Ads E3B deferred. No owner input is needed for the next local implementation; live mailbox acceptance will need its separately bounded authorization after the integrated path is verified. Astra High remains appropriate.

## P3C2 sender presentation — owner accepted the spaced test

Owner said **go** to the prepared spaced revision, authorizing one test to `aryannelombres@gmail.com`. Sent **Bloomsi paragraph spacing check** once from **Ary at Bloomwired <hello@bloomwired.io>**, preserving the blank line before Thanks and the name on its next line. Google accepted it at `2026-09-13T08:27:35.008Z`, provider message/thread `1a099e1072d8810f`. Receipt `4502eb1e-166d-4983-abfb-7e753be519a8`, profile `34e5a667-2ae0-401e-96b6-cd10b1fb84c9`. The owner replied **perfect**, accepting the received presentation. [Exact authorized message](previews/prospecting-p3c2/proposed-spacing-check.txt). This resolves the sender/sign-off presentation follow-up; it does not guarantee Gmail rendering in every future thread or client.

Approved convention: use the workspace sender name **Ary at Bloomwired**; retain normal paragraph breaks, a blank line before **Thanks,**, and **Ary at Bloomwired** on the following line. The existing MIME helper supports this already. No automatic signature insertion or global body rewrite was introduced; future drafts should follow this approved convention.

Verified the exact immutable approval against the authorized recipient/name/subject/body, then acknowledged and clicked Send once in the built UI. D1 records exactly one attempt and one acceptance for this receipt. The temporary per-receipt preview is stopped; normal preview is restored with `accepted`, `enabled:false`, `canSend:false` and Google connected. All existing rows across92 application tables, including the previous two accepted receipts and encrypted Google grant, are preserved. Only this explicitly labelled local test fixture and7 activity events were added. Integrity/FKs pass; `.dev.vars`/credential/key bytes unchanged. Private snapshot/receipt/result: `/home/ary/Developer/bloomops-prospecting-p3c2-evidence/spacing-check/`.

Reused the accepted sender/MIME/delivery implementation and completed Sol High review; no runtime, dependency, migration, build, commit/push or deployment change and no new review cycle. All three single-test authorizations are consumed; no additional email or follow-up is authorized. Original LTB/history/voices and paused video work/tests remain preserved. **Next bounded task: define P3C3 reply/stop ingestion before scheduled sequences or Results.** Full P3/P4/P5 remain unfinished; Ads E3B deferred.

## P3C2 second test — historical paragraph-spacing feedback

The owner explicitly approved one second test to `aryannelombres@gmail.com`: **Bloomsi sender and sign-off check**, from **Ary at Bloomwired <hello@bloomwired.io>**. The immutable [sent message](previews/prospecting-p3c2/proposed-sender-check.txt) has a compact sign-off in the same paragraph. Google accepted it at `2026-09-13T08:20:00.799Z`, provider message/thread `1a099da17678fddc`. Receipt `9df4f3f4-5011-4f58-b19d-89d3493f9612`, profile `e43e65cc-a2a2-4814-b565-a10e178d8cab`. **The owner confirmed the sign-off is visible but reported insufficient paragraph spacing.** Sender-name rendering and folder placement were not explicitly confirmed. This is evidence for that one received message, not a universal Gmail trimming fix.

The exact reviewed message was verified against owner authorization before sending through the built UI once. D1 records one preparation, one attempt and one acceptance for this receipt. Sending is disabled again: the normal local preview reports `accepted`, `enabled:false`, `canSend:false`, Google connected. The one-use temporary preview is stopped. An explicit connection refresh succeeded before sending; its encrypted connection row is the only changed existing row across92 application tables. Prior records, including the first accepted message, are preserved; additions are limited to this controlled fixture and8 activity events (one connection check plus seven fixture/delivery events). Integrity/FKs pass, and `.dev.vars`/credential/key bytes are unchanged. Private snapshot/result evidence: `/home/ary/Developer/bloomops-prospecting-p3c2-evidence/sender-check/`.

The compact test deliberately used single line breaks, producing one HTML paragraph. Prepared a [spaced revision](previews/prospecting-p3c2/proposed-spacing-check.txt) with a blank line before Thanks and the name on the next line; the existing MIME helper already preserves this as separate paragraphs. At this point the revision was a local proposal only; its subsequent authorized send and owner acceptance are recorded above. Recipient-side trimming with the restored spacing remains unverified. Both single-email authorizations are consumed; no further test or follow-up is authorized.

No runtime code, dependency, migration, build, commit/push or deployment change. Reused the accepted sender/MIME/delivery path and its completed Sol High review without reopening an audit. Original LTB/history/voices, unrelated work and paused video work/tests remain preserved. Next: resolve sender presentation from the owner feedback; P3C3 reply/stop ingestion remains the next implementation slice before scheduled sequences or Results. Full P3/P4/P5 remain unfinished.

## P3C2 first live test — historical acceptance and sender feedback

The owner explicitly chose `aryannelombres@gmail.com` in response to the exact single-email authorization question. Sent that one approved introduction from `hello@bloomwired.io`, subject **Bloomsi controlled delivery check**, at `2026-09-13T08:06:31.349Z`. Google accepted it; provider message/thread reference `1a099cdbc1a1582a`. **The owner confirmed receiving the message. Folder placement was not specified.** No resend or follow-up is authorized.

Prepared a clearly named controlled local test fixture in `Bloomsi Google Test` using the existing authenticated Owner session and standard profile/draft/approval/receipt APIs. The profile explicitly says it is not a commercial fit assessment or real prospect; UTC is fixture-only, the recipient was manually checked against the owner's direct instruction, and both unused follow-up fields say delivery is not authorized. The immutable introduction exactly matches the [authorized message](previews/prospecting-p3c2/proposed-live-test.txt). Receipt `76fb8eb1-c865-4170-92f3-fc50702d68be`, profile `12c01161-bdcd-4561-bbce-9bf030a6e3ef`.

A temporary local preview enabled only that receipt/recipient in memory. Clicked the explicit acknowledgement and send action once in the built UI. D1 records exactly one attempt and one acceptance event; accepted receipts cannot submit again. The temporary preview is stopped and the normal preview restored. Authenticated read-only status confirms `accepted`, `enabled:false`, `canSend:false`, with Google still connected. `.dev.vars` and all existing credentials/key bytes are unchanged. No mailbox read was needed. All pre-test rows across92 application tables are preserved; additions are limited to the test profile/sources/draft/approval/receipt and activity. Integrity/FKs pass. Evidence/private pre-test snapshot: `/home/ary/Developer/bloomops-prospecting-p3c2-evidence/live-test/`.

This completes the authorized live-send/provider-acceptance step using the already verified and Sol High-reviewed P3C2 implementation. No new runtime code, dependency, migration, commit/push or deployment; no additional review loop. The live receipt is available at `http://localhost:8787/prospecting/12c01161-bdcd-4561-bbce-9bf030a6e3ef/delivery`. Original LTB/history/voices and paused video work/tests remain untouched.

Owner feedback: the sender appeared only as Ary and Gmail collapsed the final Ary sign-off. Saved **Ary at Bloomwired** through the existing authenticated workspace sender API, revision2; the sent receipt retains its original Ary snapshot. The exact future From header is verified locally. No Google account-wide setting or credential change. Gmail remains connected and test sending stays disabled.

Signature investigation: the emitted MIME already uses ordinary escaped body paragraphs, without signature/quote classes, hidden markup or a double-dash signature separator. [Google documents signature trimming](https://support.google.com/mail/answer/11468381?hl=en), but provides no documented sender-controlled guarantee of expansion. The exact recipient-side trigger was not inspected. Prepared a [second test proposal](previews/prospecting-p3c2/proposed-sender-check.txt) with the new display name and a compact, single-paragraph sign-off. Verified its MIME locally; **at proposal time, no second email was authorized or sent; the subsequent authorized result is recorded above**. This is an empirical formatting test, not a claimed Gmail fix.

At that point, the next owner gate was explicit approval of the proposed second email to the same owner-controlled inbox; it has since been granted and completed as recorded above. The previous approval covered exactly one message and is consumed. Live receipt acceptance itself is complete; after presentation feedback, continue the bounded P3C3 reply/stop contract. Existing drafts need reapproval after the sender-name revision, by design. No runtime/migration/deployment change was needed for this setting; the already reviewed sender mutation and MIME path were reused. Astra High remains appropriate for upcoming provider work.

## Prospecting P3C2 implementation acceptance — before the authorized live test

Continued in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`, preserving accepted P2/P3 and unrelated worktrees. Latest read-only remote check confirms main `651d9a5` and PR #60 head `67b94eb` unchanged. **No real email has been sent.** The next gate is an explicitly owner-controlled test recipient and approval of the exact single introduction.

What works locally: a permanent approval-bound introduction receipt and RFC Message-ID; preparation and cancellation without provider access; exact-receipt/recipient development-only send configuration; separate human acknowledgement; current workspace/session/actor/approval/profile/draft/sender/Google authority checks inside an atomic one-time claim and immediately before transport. Once attempted, a receipt cannot send again. Interrupted, malformed or failed provider responses stay unresolved; exact-message Sent metadata recovery can confirm acceptance without resubmitting. Outcomes survive in-flight authority revocation while response reads remain scoped. Google acceptance is explicitly distinct from inbox delivery. Cancellation cannot recall submitted email. This controlled-test path has no follow-up, cold-outreach schedule, inbox/reply ingestion or Results counters.

Verification passes: 74 focused SQL/domain/provider/MIME tests plus one native workerd test exercising success and ten redirect/error responses; 8 native D1 checks; 34 final built-browser checks across 1440/1024/768/390/320px; final Cloudflare build; syntax and patch hygiene. Browser flows cover keyboard preparation, acknowledgement, disabled/busy controls, cancellation, ambiguous submission, no resend, interrupted recovery, focused error, exact Sent recovery and denied roles. [Visual preview](previews/prospecting-p3c2/README.md) includes inspected desktop/phone/error/disabled/accepted captures. All provider traffic in these tests was synthetic/injected or intercepted; no real mailbox metadata/content was read.

Additive migration `0031` reaches **32 domain migrations and 57 domain tables**. Populated/repeat and isolated zero-to-current/repeat verification pass. All rows in 91 pre-existing application tables are unchanged, including the encrypted live Google grant and legacy accounts/sends; integrity and FKs pass. The main local database contains zero delivery receipts. Internal migration/engine bookkeeping is excluded from the application-row comparison. No new dependency.

One fresh GPT-5.6 Sol High read-only review found no material issue; no re-review was needed. The reviewer independently passed 20 delivery/provider/workerd tests and 19 schema tests plus syntax/hygiene; it inspected supplied stateful acceptance evidence rather than rerunning browser/native/migration checks. Initial verification corrected a trigger-order assertion and a browser selector that also matched Next's route announcer; the final scoped alert/focus check passes without changing application focus behavior.

The owned preview runs the verified build at `http://localhost:8787`; authenticated read-only Google status still reports connected at revision2. Login remains `ary@bloomwired.io`, workspace `Bloomsi Google Test`, sender `hello@bloomwired.io`. Test enable flag/receipt/recipient remain unset or disabled; the existing encryption key and credentials are unchanged. The isolated fixture preview and browser are stopped. Evidence and pre-slice source/DB snapshots: `/home/ary/Developer/bloomops-prospecting-p3c2-evidence/`.

Next: obtain the owner-controlled recipient and explicit single-test-email authorization for the [proposed message](previews/prospecting-p3c2/proposed-live-test.txt), then prepare the exact reviewed test record, enable only that receipt/recipient and verify its actual outcome/arrival. Do not infer the recipient from the app login or send to a real prospect. Full P3 still needs controlled live delivery acceptance, reply/opt-out/bounce stop ingestion, scheduled sequence/recovery and truthful Results; P4/P5 remain unfinished and Ads E3B is deferred. Astra High remains appropriate. No commit/push/merge/deployment, real import/outreach, original-LTB/voice change, production/DNS change or video work/tests. P1 remains draft PR60; P2/P3 are local/uncommitted/undeployed. Staging remains separately deployed Bloomsi branding at main651d9a5.

## Prospecting P3C1 — connection reliability accepted locally

Continued in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`. Main651d9a5 and PR60head67b94eb remain unchanged; accepted P2/P3 work and unrelated worktrees are preserved.

What works: explicit Owner/Admin Check connection; encrypted refresh/rotation with omitted refresh-token/scope preservation; matching account and primary/accepted sender verification; distinct expired/checking/temporary/reconnect states. GET status makes no provider request. A90-second database lease and30-second completed-check cooldown prevent duplicate refreshes; session/actor/original-authorizer/sender/revision guards reject late results after edits, disconnect/reconnect or revocation. Temporary failures retain the grant, including a validated rotation obtained before a later identity-probe failure. Completion and its activity event are atomic. Sending remains off; no background polling or provider revocation is enabled.

Verification:78 focused tests pass; real workerd global fetch covers consent and refresh success plus30redirect rejections;16 native D1 checks;36 final built-browser/native HTTP checks at1440/1024/768/390/320px; final Cloudflare build and syntax/diff checks. Browser failures use a separate synthetic database/R2 on8788 with all provider egress intercepted. Desktop/phone/focus/error captures were inspected: [visual preview](previews/prospecting-p3c1/README.md). Early checks corrected a test's wrong-workspace null-vs-conflict expectation and updated the migration inventory30to31. The browser launcher needed the existing private Chromium library path; screenshot capture switched to viewport mode so fixed bars were represented accurately. No application failure remains.

Additive0030 adds only four connection fields, reaching31 migrations/56 domain tables. Populated/repeat and isolated fresh/repeat migrations pass. All prior application rows across92 checked tables were preserved before the live check; internal D1 migration sequence advanced30to31 and Cloudflare metadata maintenance is excluded. Integrity/FKs pass. No dependency or historical migration rewrite.

One fresh GPT-5.6 Sol High read-only review found no material issue; no re-review was needed. Reviewer inspected code and supplied evidence, without reading private databases or running live/stateful checks. After review, the single controlled live check succeeded for `hello@bloomwired.io`: revision2, healthy, later access expiry, valid encrypted grant, released lease and exactly one check event at `2026-09-13T07:18:23.822Z`. All other application rows, legacy accounts and send records are unchanged. App login remains `ary@bloomwired.io` in `Bloomsi Google Test`.

Evidence and private pre-slice/source/database snapshots: `/home/ary/Developer/bloomops-prospecting-p3c1-evidence/`. Local owner preview runs the accepted build at `http://localhost:8787/prospecting/sender`. No commit/push/merge/deployment, real import/outreach, mailbox-content read, production/DNS change or video work/tests. Staging remains branding-only at main651d9a5; P1/P2/P3 remain undeployed.

Next bounded task: P3C2 controlled delivery preparation with exact reviewed content, durable dispatch identity, duplicate/ambiguous-response handling and current stop/authority checks. Prepare and test locally with intercepted provider responses. An actual test recipient and explicit controlled-send authorization are required before any email leaves the app. Automatic follow-ups, reply processing and Results remain unfinished; full P3/P4/P5 are not complete. Astra High remains appropriate.

## Prospecting P3B — live Google connection verified locally

Continued in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`, preserving accepted uncommitted P2/P3A and all unrelated worktrees. Preflight confirmed main `651d9a5` and PR #60 head `67b94eb`. The owner has already confirmed Google Workspace and `hello@bloomwired.io`; no provider/sender decision is being repeated.

What works locally: dedicated Google connection configuration; session/member/workspace/sender/revision-bound single-use state with PKCE; bounded provider identity/scope verification; both authenticated primary addresses and accepted custom aliases; encrypted workspace-bound tokens; local disconnect and safe callback outcomes. Current authority, session and revisions are rechecked before attaching a grant. Sender setup refreshes connection state after saving. The client never receives stored tokens, and original LTB connections are not reused. Read-only timing preview uses the saved recipient timezone, weekdays 09:00–11:00, then three and five further business days with DST handling. Saving, approving, connecting and previewing never sends or schedules email.

Verification: 81 distinct focused tests (initial combined 78, plus key-rotation and two primary-address regressions); final affected Google suite 18/18; final Cloudflare Worker build; 13 final native D1 checks with injected provider responses and 48 final built-browser/native-HTTP checks at five widths. Browser coverage includes exact dates, keyboard/focus/error/retry, pending/stale-response handling, read-only persistence, origin/body/revision checks and denied roles/workspaces. The provider review fix reran Google/native/build checks. Final visual inspection found a phone error obscured by bottom navigation; scoped scroll margins and an explicit visible-position assertion fix it. The final build/browser run includes that self-reviewed styling correction. [Visual preview](previews/prospecting-p3b/README.md).

Additive migration `0029` reaches 30 domain migrations/56 domain tables. Populated/repeat and isolated fresh/repeat migration verification pass. All prior application rows are preserved: 90 pre-existing tables are unchanged; one internal `_cf_METADATA` maintenance row changed during local engine use. Integrity/FKs are clean. No new dependency. The native harness initially needed the repository's Miniflare compatibility adapter; it then passed. The original preservation probe selected a different local SQLite file; final proof uses the exact preflight-recorded native file. Neither harness correction changed application data. A capture attempted against a still-running pre-build Worker had mismatched assets; restarting the owned preview from the final build corrected that harness state.

One fresh GPT-5.6 Sol High read-only review found that primary Google addresses may omit custom-alias verification status. The fix accepts a primary only when its address independently matches the authenticated mailbox profile; custom aliases still require accepted verification. Added positive and negative SQL/native regressions pass. The single focused re-review confirms the finding resolved with no material issue remaining. The reviewer inspected code and supplied evidence; it did not independently rerun stateful browser/database checks.

Evidence and pre-slice source/DB snapshots: `/home/ary/Developer/bloomops-prospecting-p3b-evidence/`. At initial local acceptance no real Google grant/provider request or credential change had occurred; the subsequent authorized local setup is recorded below. No import, send, commit, push, merge or deployment. P1/P2/P3 remain undeployed; staging remains the separate Bloomsi branding at main `651d9a5`. Original LTB records/settings/connections/voices and paused video work/tests remain preserved. The owned local Worker remains running with the verified connection.

Current setup outcome: the dedicated local Google connection now works after owner consent; verified evidence and remaining P3 boundaries are recorded below. Staging remains branding-only; P1/P2/P3 are still local. Astra High remains appropriate for the next security/provider work.

Google setup follow-up: project `bloomsi`, account `hello@bloomwired.io`, Gmail API Enabled and OAuth audience Internal are verified in Windows Chrome. The downloaded web-client JSON matches the exact local-only callback. Dedicated client ID/secret, a new encryption key and local enable flag are installed in ignored `.dev.vars`, preserving its original bytes; private copies/backups use directory0700/files0600. Wrangler parsing, development/r2-dev target, AES-GCM roundtrip and wrong-context denial pass. One fresh Sol High configuration review found no material issue.

The owner explicitly selected `ary@bloomwired.io` for the local app login. Created only that local Owner and a separate `Bloomsi Google Test` Prospecting workspace in an atomic native D1 batch, with normal creation activity. No second administrator was invented. A private pre-setup database backup is retained. One fresh Sol High read-only review of the bounded setup/handoff found no material issue. The initial one-use sign-in handoff expired; a sign-in-only retry reused the verified identity without repeating bootstrap. Better Auth sign-in succeeded using locally captured R2 mail; its temporary loopback handoff is closed. Browser session identity and workspace were verified. Saved `hello@bloomwired.io` / Ary through the sender form; the UI confirms sending is off.

Live consent follow-up: the owner approved Google access, but two real callback attempts failed after valid single-use state consumption and before grant storage. Safe, application-owned diagnostics were added without exposing provider messages, URLs, account addresses or secrets. Their fresh Sol High read-only review found no material issue. Isolated workerd reproduction then identified the root cause: `redirect:'error'` is unsupported by Cloudflare and throws before network access. Changed the provider fetch to `redirect:'manual'`; the existing non-success guard rejects all 3xx, so credentials cannot follow a provider redirect. Added explicit Node and native workerd regressions for token/profile/send-as redirects. Final checks pass: 26 focused tests, one real workerd test exercising success plus 15 redirect cases, final Cloudflare build, syntax and patch hygiene. The built app's controlled invalid-code probe now reaches Google and receives HTTP400 `invalid_grant`, where the old build failed locally with a transport error. This verifies transport, not a live grant. One fresh Sol High read-only review of the newly isolated redirect fix found no material issue; no re-review was needed. Both reviewers inspected code and supplied evidence without rerunning stateful checks. Before the successful retry below, prior application rows and integrity/FKs were preserved and no grant, send or connected event was stored. No migration, dependency, UI, commit/push/deployment, remote credential or original-LTB change. The owned local Worker runs the corrected build at `http://localhost:8787` with request logging disabled. That fresh owner consent has now succeeded, as recorded below.

Live connection acceptance: after the owner approved fresh consent on the corrected Worker, the callback returned to Sender setup with **Connected**, account `hello@bloomwired.io`, and “Google connection verified. Sending is still off.” The authenticated app login remains `ary@bloomwired.io` in the separate `Bloomsi Google Test` Prospecting workspace. The status API returns connected/configured at revision1, the matching sender/account, and no token/secret/verifier fields. Native D1 confirms one active encrypted `v1` token envelope, both required Gmail scopes, and exactly one `PROSPECT_GOOGLE_CONNECTED` event. All pre-setup application rows remain preserved; legacy `gmail_accounts` and `send_events` are unchanged, with clean integrity/FKs. Verification used only mailbox profile/send-as settings; no message content was read and no email was sent. The local Worker remains available at `http://localhost:8787/prospecting/sender`. No new code, migration, dependency, commit/push/merge/deployment or remote configuration change in this acceptance step. Evidence: `bloomops-prospecting-p3b-evidence/google-local-setup.json` outside the worktree.

The successful real consent/account-verification path is now accepted locally. This does not complete all P3: live cancelled/partial/mismatched-account and disconnect/reconnect exercises remain distinct from the passing synthetic tests; token refresh, provider-revocation detection, durable send/retry/stop/reply processing and Results are still unfinished. Preserve the connected grant and its encryption key. Next bounded local work: define the Google token refresh/revocation contract and controlled connection-lifecycle acceptance before implementing delivery. Real prospect outreach, staging/production deployment and video work/tests remain paused. No owner input is pending for the completed connection setup.

## Prospecting P3A — accepted locally

Owner confirmed Google Workspace and hello@bloomwired.io. P3A is implemented, locally verified and independently reviewed in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`. Accepted P2 and all unrelated worktrees are preserved. Main remains `651d9a5`; PR #60 head remains `67b94eb`. No commit/push/merge/deployment occurred.

What works: an explicitly configured workspace sender identity; one versioned three-message draft per prospect; incomplete saves; explicit saved-result follow-up selection preserving the current introduction; immutable content approval bound to exact sender/profile/draft and approving-member revisions; invalidation after edits or approver revocation/demotion; atomic retry/concurrency guards; a paginated Overview containing saved drafts only. Forms protect unsaved edits and retain text on errors. Google is not connected, and saving/approving never sends or schedules email. No sender is globally defaulted or copied from original LTB.

Verification passes: 78 distinct focused tests (original 76 plus two added P3A regressions), including the final 21 P3A SQL tests and 17 affected shell tests; final Cloudflare Worker build; 58 final native/browser checks across 1440/1024/768/390/320px. Actual sender normalization, unsaved-navigation prompt, empty/incomplete draft, saved-result selection, approval, edits, retries/concurrent requests, keyboard/error/focus/busy, denied access and favicon success/garden fallback were exercised. [Visual preview](previews/prospecting-p3a/README.md) contains inspected desktop, phone and error captures.

Additive migration `0028` reaches 29 domain migrations/54 domain tables. Populated/repeat and isolated fresh/repeat migration checks pass. Every pre-slice row across 87 tables is preserved, with clean integrity/FKs. No new dependency. Early verification corrected a test's unsupported fit fixture and optional-label selector. Playwright aborts `/favicon.ico` before mock routing; final favicon evidence uses a real isolated local HTTP endpoint, without changing runtime detection.

One fresh GPT-5.6 Sol High read-only review and the single focused re-review are complete. Findings on missing unsaved-navigation protection, misleading draft activity field names and a normalized sender's false unsaved warning are fixed. The re-review confirms all three resolved with no new material issue. The reviewer inspected code and supplied final evidence; it did not independently rerun stateful native/browser checks.

Evidence and pre-slice source/DB snapshots: `/home/ary/Developer/bloomops-prospecting-p3a-evidence/`. Owned Worker/browser/favicon fixture processes are stopped. Staging still contains the separately deployed Bloomsi branding at `651d9a5`; P1/P2/P3 remain undeployed. Original LTB records, settings, connections and voices are preserved. No real import/outreach, credential change, production/DNS change or video work/tests.

Next: define and implement P3B Google connection/consent and recipient-local schedule preview under [P3](phases/P3.md), with new-workspace isolation, sender account/address verification and explicit callback/client configuration. Inspect available configuration before requesting owner action; no credential is requested in chat. Real provider delivery, reply/stop/recovery and Results still need their later P3 contracts and acceptance. Full P3, P4 Pages and P5 conversion remain unfinished; Ads E3B is deferred. Astra High remains appropriate. No owner input is pending for the completed P3A slice.

## Prospecting P2 — accepted locally; P3 sender decision pending

P2C2 and P2C3 are complete in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`. Full P2 now has locally verified selected raw imports, manual skills/context export and a structured audit/draft round trip with preserved reports and explicit manual-edit protection. Original LTB records/voices, operational work and unrelated dirty worktrees remain intact. Main is `651d9a5`; P1 draft PR #60 remains at `67b94eb`. No commit/push/merge/deployment occurred.

P2C2 acceptance: 81 distinct focused tests, final Cloudflare build and 55 final browser/native-D1 checks pass. Additive migration `0027` reaches 28 migrations/51 domain tables; populated/repeat and isolated fresh/repeat checks pass. One fresh Sol High review and its single focused re-review resolved normalized-result deduplication and unsourced observed-evidence findings; no material issue remains. The reviewer did not independently rerun stateful browser checks. [Result review preview](previews/prospecting-p2c2/README.md).

P2C3 acceptance: all 18 controlled journey/browser/native checks pass. Actual PDF, new-tab/same-tab links, calendar popup/iframe, delayed content, hidden placeholders, dated public activity and controlled inspection failure were checked. The assistant-authored audit and intro/two-follow-up suggestions used exported canonical context, preserved a newer manual note and kept delivery, backend processes, viability, sender approval and prices uncertain. These are synthetic manual-workflow examples, not general model-quality or live-business claims. Every pre-slice row in ten watched tables remains unchanged; integrity/FKs pass. No application runtime/migration/dependency change in P2C3; self-review under the usage-aware policy. [Controlled journey evidence](previews/prospecting-p2c3/README.md).

The owned Worker preview and research/browser processes are stopped. P2C2/P2C3 source/DB snapshots, logs and captures are in `/home/ary/Developer/bloomops-prospecting-p2c2-evidence/` and `/home/ary/Developer/bloomops-prospecting-p2c3-evidence/`. Staging remains the separately deployed Bloomsi branding at `651d9a5`; P1/P2 are not deployed. No real imports, original-LTB connector, provider/send action, production/DNS change or video work/tests.

Next: [P3 Outreach/Overview/Results preparation](phases/P3.md). Repository reuse and boundaries are recorded. Required product input: the email provider and sender address for this fresh workspace. It determines connection consent, threading, reply ingestion and send recovery; do not infer the sender from login or copy an original-LTB connection. The user has been asked asynchronously; no answer is recorded yet. No credential or external-action approval is requested at this stage. Astra High remains appropriate. P3, P4 Pages and P5 conversion remain unfinished; Ads E3B stays deferred.

## Prospecting P2C2 — result round trip accepted locally

Continued in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`, preserving accepted P2C1 and earlier uncommitted work. Main `651d9a5` and PR #60 head `67b94eb` are unchanged. Original/P1/branding worktrees, LTB data/voices and paused video work/tests remain intact.

What works locally: full-page JSON result preview; canonical field comparisons defaulting to Keep current; explicit per-field application; stale context warnings and save-time revision/authority checks; atomic immutable report/source/event/profile persistence; exact and concurrent retry recovery; scoped paginated history/detail. Full reports, observation/contact uncertainty, offer limitations and two follow-up suggestions remain separately inspectable. Follow-ups are unsent suggestions, not a scheduled or approved sequence. Submitted prose renders as escaped text.

Verification passes: 81 distinct focused tests, including the final 32 affected result/context tests; final Cloudflare build; 55 final built-browser/native-D1 checks across five widths. Desktop/phone comparisons, saved reports and conflict recovery captures were inspected. Additive migration `0027` brings this branch to 28 migrations/51 domain tables. Populated/repeat and isolated fresh/repeat migrations pass; every pre-slice row in nine watched tables remains unchanged, with clean integrity/FKs. No new dependency.

Self-review/testing fixed concurrent receipt recovery, document key-order preview hashing, history revocation between reads and comparison/error spacing. The real preview response is now used in the round-trip regression. One fresh Sol High review found two medium issues: equivalent normalized field values could bypass result deduplication, and observed claims could omit their own date/source. Both are fixed with regression tests. Normalized identity now owns the result hash while the original artifact remains intact; every observed item requires its own valid HTTP(S) source and date. The single focused re-review confirms both resolved with no material remaining issue. The reviewer inspected the 32 affected passing tests and final build; it did not independently rerun stateful browser checks. The parent subsequently completed all 55 final native/browser checks. Evidence and the prior source/DB snapshots are in `/home/ary/Developer/bloomops-prospecting-p2c2-evidence/`; [visual preview](previews/prospecting-p2c2/README.md). The owned local preview was reused for P2C3 and is now stopped. No commit/push/PR/merge/deployment or original-LTB connection. Staging remains branding-only at `651d9a5`.

Next: remaining P2C controlled journey/evidence acceptance for visible popups/new tabs/downloads/calendars/iframes/delayed content, hidden-only text and bounded contact/offer uncertainty. Full P2 remains unfinished. No real imports, provider call, outreach, production/DNS change or video work/tests. Astra High remains appropriate; no owner input is pending.

## Prospecting P2C1 — manual skills and context export accepted locally

Continued the first unfinished P2 task in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`, preserving accepted uncommitted P2 work and the original/P1/branding worktrees. Git fetch/ls-remote confirmed main `651d9a5` and PR #60 head `67b94eb`. The GitHub CLI Windows sign-in bridge and external Bloomlab gallery were unavailable; source refs and committed design references were inspected. Neither limitation blocked local work.

What works: a Prospecting Skills Library with versioned manual website audit, outreach draft and follow-up refinement tasks; explicit profile selection; copy/download of instructions, output schema and current canonical context. Saved fields, unknowns and field/import provenance match the profile. Current workspace authority, skill version and profile revision are checked for every export, including a final authority/revision check after provenance reads. Clipboard denial offers selectable text; stale context requires a real reload. No provider or database write occurs. The exact Bloomsi logo, garden/favicon identity, compact icons and existing contact/edit controls are retained.

Verification: 41 distinct focused tests pass, with the final 11 affected tests rerun after the review fix; 42 Draft7 schema/example checks; final Cloudflare build; 50 final built-browser/native-D1 checks across five widths. Final desktop/phone captures are inspected in the [visual preview](previews/prospecting-p2c1/README.md). Every pre-slice row in nine watched tables remains unchanged; integrity/FKs pass. No migration or package dependency: this branch remains at 27 domain migrations and 50 domain tables. Synthetic examples validate the contract, not live website findings or AI output quality.

One fresh Sol High review found that empty output could validate as ready. The correction requires nonblank reports/draft bodies, an introduction plus two follow-ups for ready outreach, and dated HTTP(S)-sourced observed evidence for a ready audit. The single focused re-review confirms the finding resolved with no remaining material issue. The reviewer checked the schemas, fixtures and affected verification; it did not independently rerun stateful browser checks. No additional review loop was used.

P2C1 is implemented, locally verified and independently reviewed. Evidence and the pre-slice snapshot are in `/home/ary/Developer/bloomops-prospecting-p2c1-evidence/`. The owned preview is stopped. No commit, push, PR, merge or deployment. Staging remains the separately deployed branding at `651d9a5`; P1/P2 are not deployed. Original LTB data/voices, unrelated work and paused video work/tests are preserved.

Next: P2C2 structured result validation, field-change preview, full-report preservation and explicit resolution of conflicts with manual edits. Record its bounded contract before implementation. Full P2C/P2 remains unfinished. Real imports, outreach, production/DNS changes and video work/tests remain paused. Astra High remains appropriate for the permission/revision/persistence work; no owner decision or credential is pending.

## Prospecting P2B3 — durable import receipts accepted locally

Continued the first unfinished P2 task in `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`, preserving accepted uncommitted P2A/P2B1/P2B2 work. Preflight fetched main `651d9a5`; draft PR #60 remains at `67b94eb`. The approved Bloomsi branding/guide from main is now carried into this worktree without merging/rebasing its dirty branch or importing unrelated roadmap changes. Original/P1/branding worktrees and original LTB records/voices are preserved.

What works: an explicit import of every Ready row in an unchanged file preview; immutable relational receipts/source mappings; full-page receipt history/details with reconciled Imported / Duplicate / Rejected outcomes; original source provenance on editable canonical profiles. Current source/destination authority, source evidence/fields and destination duplicates are checked again at write time. One atomic D1 batch creates all selected profiles and creation events or rolls everything back. Exact-request/lost-response retries recover the same receipt; concurrent/new requests and edited profiles cannot recreate an imported source identity. Import never verifies a field or copies old qualification, audits, drafts, sends, schedules or automation. Imported profiles accurately show Raw import as their record source.

Verification passes: 142 distinct focused tests, including the final 36 import/preview tests after the native query fix and 21 import tests rerun after the final UUID type guard; final Cloudflare build; 97 built-browser/native-D1 checks at five widths plus four targeted checks against the final rebuilt request boundary. The native 50-record export/preview/concurrent commit, lost response/retry, history/provenance, revocation, conflict recovery and source preservation all pass. Desktop/phone/error captures are inspected in the [visual preview](previews/prospecting-p2b3/README.md).

Additive migration `0026` adds receipts/rows and completion/immutability constraints: 27 domain migrations and 50 domain tables on this branch. Populated 26→27 preserves all seven watched tables exactly; repeat migration is a no-op. Disposable fresh/repeat verification, integrity and foreign keys pass. After browser fixtures, every pre-slice watched row remains unchanged. The first native maximum-size test exposed the prior duplicate-preview compound-SELECT limit; a bounded VALUES CTE fixes it while retaining per-row completeness and permission checks. A schema test also caught a missing direct workspace FK before final migration acceptance. The browser's cross-workspace denial assertion now checks the actual rendered not-found page because streamed Next.js not-found responses can have HTTP 200.

One fresh GPT-5.6 Sol High read-only review found no material correctness, authorization, isolation, migration or data-loss defects. It traced the final runtime and request-type guard and inspected the supplied tests, native evidence and captures. No review fixes or re-review were needed. The reviewer did not rerun stateful checks; that limitation is explicit. No remaining material finding.

P2B3/P2B is implemented, locally verified and independently reviewed. Full P2 remains unfinished. Evidence: `/home/ary/Developer/bloomops-prospecting-p2b3-evidence/`, including the exact pre-slice source snapshot, scoped diff, test/build/migration/native logs and preservation proofs. The owned preview is stopped. No new dependency, commit, push, PR, merge, deployment or original-LTB connection. Staging remains the separately deployed Bloomsi branding at `651d9a5`; P1/P2 are not deployed.

Next: P2C1 versioned manual audit/outreach/follow-up skills and canonical context copy/export, then the conflict-safe structured round trip. Define that bounded contract from the approved P2C roadmap before implementation. Real imports, outreach, production/DNS changes and all video work/tests remain paused. Astra High remains appropriate for permission/provenance and structured import/conflict work; no owner decision or credential is pending.

## Bloomsi branding staging handoff — P2B3 remains next

Owner-priority branding was completed separately from main in `/home/ary/Developer/bloomops-bloomsi-branding`. PR #61 deployed `651d9a5` to [staging](https://bloomops-staging.cool-sunset-2169.workers.dev); both exact-source workflow gates, 54 focused tests, final build, 64 local browser checks and 7 live checks pass, with one fresh Sol High review and focused re-review complete. Exact logo/guide came from PR #58 `bee6af5`; no roadmap or P1/P2 runtime was deployed. No migration, production/DNS change or original-LTB mutation.

This P2 worktree's runtime and prior uncommitted changes are preserved. P2B3 is still the first unfinished task under the P2 contract. Before eventual P1/P2 publication, integrate the shared branding from new main while preserving these changes; no merge/rebase of the dirty Prospecting checkout was performed for branding. Original technical identifiers and workspace names remain unchanged. Astra High is appropriate for resumed import permission/concurrency/persistence work; real imports, outreach and video work/tests stay paused.

## Prospecting P2B2 — mapping and duplicate preview accepted locally

Owner requested “continue” after P2B1. The first unchecked roadmap item is a field-mapping/duplicate/rejection preview, bounded in [P2](phases/P2.md). Continue in `/home/ary/Developer/bloomops-prospecting-p2` on `feat/prospecting-p2-eligibility`. Main `618e18f` and open draft PR #60 at `67b94eb` are unchanged at preflight. Prior uncommitted P2 work is preserved in the worktree and an external before-snapshot; original/P1 worktrees are preserved.

Implemented: a full-page version-1 JSON file preview, up to 50 records/1 MiB, with canonical field mapping, source-label/ID provenance, explicit Ready / Possible duplicate / Rejected outcomes and reconciled selected/ready/duplicate/rejected counts. Imported is always zero. The server rereads current source evidence/fields and both workspace authorities. Forged/stale fields and inaccessible/old-work sources cannot become ready. Duplicates within the file and current workspace are conservative review signals, never implicit merges. No profile/history/file/receipt write, migration, dependency, provider or import action.

Local acceptance: 60 distinct tests pass: 33 affected import/source/export tests rerun after the review fixes and 27 unchanged profile/workspace/session regressions from initial acceptance; final Cloudflare build; 65 built-browser/native-D1 checks (26 P2A + 39 import) at five widths, with unchanged source/destination snapshots. Actual file selection, mapping, count reconciliation, busy/error/retry/reset/focus, denied access and body bounds pass. [Visual preview](previews/prospecting-p2b2/README.md) records inspected desktop/phone/error captures and limits. Only this route opts into 1 MiB; other structured JSON routes retain 64 KiB. Early test failures were fixture setup violating existing Prospecting-only creation and immutable workspace-purpose guards; the fixture now creates its own separate Prospecting workspace without relaxing either guard.

The independent Sol High review found two medium issues: invalid field copies could hide a repeated source ID, and an incomplete destination query after transient authority loss could appear to have no duplicate. Both are fixed with targeted regressions; 33 affected import/source/export tests and the rebuilt app pass. Final browser verification passes all 65 checks, including the repeated source identity with an invalid copy. The single focused Sol High re-review confirms both findings resolved with no blocker and independently reruns all 15 import-preview tests successfully. P2B2 is accepted locally; no remaining material code finding. A fresh-thread spawn was rejected by the tool’s agent-thread limit; the existing configured Sol High reviewer completed this scoped review and re-review. This thread-reuse deviation is recorded rather than described as a fresh reviewer. Evidence: `/home/ary/Developer/bloomops-prospecting-p2b2-evidence/`, including `before/` for the prior accepted P2 files. The owned preview is stopped. Work remains local/uncommitted; no new PR, merge or deployment.

Next: P2B3 durable duplicate-safe source mappings, import receipts and explicit synthetic import commits with fresh checks and concurrency/stale-preview guards. Full P2B/P2 remains unfinished. Real imports, outreach, deployment and all video work/tests remain paused. Astra High remains appropriate; no owner decision or credential is pending.

## Prospecting P2B1 — selected raw export

Owner requested “continue” after P2A acceptance. The first unchecked roadmap item is selected raw export; this bounded slice is [P2B1](phases/P2.md). Work continues in `/home/ary/Developer/bloomops-prospecting-p2` on `feat/prospecting-p2-eligibility`, preserving accepted uncommitted P2A and the original/P1 worktrees. Fresh preflight confirms main `618e18f` and open draft PR #60 at `67b94eb` are unchanged.

Implemented: page-local explicit selection, select eligible, hydration/busy guards and a raw JSON download. The server validates 1–50 unique record IDs, rereads the same P2A evidence with live source/destination authority, and exports only the freshly read seven raw fields plus source workspace/record provenance. Any blocked/missing selection prevents the whole file, with typed reasons and reconciled counts. Missing history fails closed. Oversized raw fields are rejected before preview truncation can affect the export. No source or destination write, migration, receipt, automation or provider call.

Local acceptance passes: 18 source/export SQL tests, 27 existing profile/workspace/session regressions, final Cloudflare build and 60 built-browser/native-D1 checks (26 P2A + 34 export) across five widths. Actual downloads match selected raw fields/counts and preserve source/destination data. Desktop/phone captures are inspected in the [visual preview](previews/prospecting-p2b1/README.md). The initial test matched Next.js’s route announcer as an application error; scoped error selectors now verify recovery correctly. One fresh independent Sol High review completed with no material findings and independently reran all 18 source/export tests successfully. No review fixes or re-review were needed. P2B1 is implemented, locally verified and independently reviewed; full P2B/P2 remains unfinished. The owned local preview is stopped. Evidence is isolated in `/home/ary/Developer/bloomops-prospecting-p2b-evidence/`; `before/` preserves the exact prior P2A files for scoped review. Work remains local/uncommitted; no new PR, merge or deployment.

Next: P2B2 field mapping, invalid/duplicate record preview and durable repeat-safe import receipts using synthetic exports. A downloaded file is an editable dated snapshot, not a permission grant or current eligibility proof. Full P2B/P2 remains unfinished. Real imports, outreach, deployment and all video work/tests remain paused. Astra High remains appropriate.

## Prospecting P2A — read-only source eligibility

The owner accepted the P1 contact/edit icon refinement and requested the next phase. Preflight confirmed main `618e18f` and open draft PR #60 at `67b94eb`. Continue in the separate worktree `/home/ary/Developer/bloomops-prospecting-p2`, branch `feat/prospecting-p2-eligibility`, stacked on that P1 commit. Original checkout changes and the P1 branch are preserved. [P2 contract](phases/P2.md) bounds this first unfinished roadmap task; the rest of P2 remains open.

What works: “Review source” opens a full-page, read-only eligibility preview. Source selection is explicit and requires this same user's active Owner/Admin membership in both the selected Prospecting destination and an operational source workspace. Live authority is checked in the source query and again before returning records. A foreign ID or revoked membership cannot disclose source records. Preview reads only legacy tables in the currently bound database; it does not connect to the separate original LTB app.

Records show No recorded work / Already worked / Needs review with typed reasons and raw identity details. Recorded contacts, suppression, drafts, audits and jobs override a New label. Ambiguous notes/states/counters, changed timestamps, duplicate/deleted identities and unmatched replies are handled conservatively. Missing required evidence schema fails closed. Pages use 50 rows plus one sentinel and show page-level counts/as-of time. No source reconciliation, record write, import, export, provider call or send action is introduced.

Local acceptance passes: 8 source SQL/classifier tests; 27 existing profile/workspace/session regressions; Cloudflare build; existing local base/inherited/domain migrations; 26 built-browser/native-D1 checks across 1440/1024/768/390/320px. The populated synthetic fixture proves source rows, send history and empty canonical destination remain unchanged. Screenshots were inspected and the [visual preview](previews/prospecting-p2a/README.md) records checks and limits. No new migration or dependency. Initial double-parenthesized Drizzle EXISTS was fixed before the SQL pass; the browser assertion now correctly expects the existing 403 denial for demoted destination access.

One fresh independent Sol High review completed with no material findings; the reviewer also reran all 8 source tests successfully. No fixes or re-review were needed. P2A is implemented, locally verified and independently reviewed; full P2 remains unfinished. The owned local preview is stopped. Work is local and uncommitted; no P2 PR, merge or deployment. Evidence: `/home/ary/Developer/bloomops-prospecting-p2-evidence/`, with the source test log in `/home/ary/Developer/bloomops-prospecting-evidence/p2-source-tests.log`.

Next: P2B selected raw export, eligibility recheck, mapping/rejection/duplicate preview and durable repeat-safe import receipts using synthetic data. P2C manual audit round trip and versioned skills follows. Real prospect imports, outreach, production deployment and all video work/tests remain paused; original LTB records, voices and settings remain intact. Astra High remains appropriate for the following import/provenance and isolation work; no model switch is needed yet.

## P0/P1 — accepted visual revision in draft PR #60

The preceding owner priority was [P0/P1](phases/P0_P1.md), from [PR #58](https://github.com/Bloomwired/bloomops/pull/58) and [PROSPECTING_ROADMAP](PROSPECTING_ROADMAP.md). Implementation is isolated in `/home/ary/Developer/bloomops-prospecting-p1` on `feat/prospecting-p0-p1`, based on latest main `618e18f`. PR #58 remains open; its latest visual-reference update `a6efafa` is integrated alongside its original `bf7609d` roadmap; its documentation is integrated with newer E3A acceptance and the canonical usage-aware guide/configuration. AGENTS/CLAUDE remain identical regular entry files. Original runtime/branches and unrelated edits are preserved. The original checkout’s BUILD_STATE has only a routing note to this isolated implementation.

What works locally: existing-identity workspace chooser, atomic retry-safe empty Prospecting workspace creation, exact active-membership selection/revocation recovery, contextual sidebar and return path, searchable/paginated list, full-page create/edit, source/check provenance, fit/facts/unknowns/proposed work, dated manual audit evidence, draft subject/body, timestamped actor history, conflict/error recovery. Fresh purpose cannot use inherited prospecting/Pages/automation routes. Drafts never send. The original workspace stays selectable.

Verification: 3,467 BloomOps tests; 68 Pages/editor regressions; 33 native D1/R2 checks; 64 browser assertions across all five widths; Cloudflare build; isolated fresh/repeat migration proof. Additive migrations `0024`/`0025` bring the branch to 26 migrations and 48 tables. [Visual preview and measurements](previews/prospecting-p1/README.md) record actual checks and limitations. Home/Clients/Work retain request/query counts and comparable medians; small-sample p95 varies by about one frame; shared navigation costs +1,377 decoded JS bytes, with no prospect query or editor dependency on those routes.

One fresh Sol High independent review and its single focused re-review are complete. The medium finding—source controls missing outside Identity—was fixed across all editors; 13 focused tests, 64 browser assertions and the build passed again. No remaining material code findings. Delivery: [draft PR #60](https://github.com/Bloomwired/bloomops/pull/60) is open with the [visual preview](previews/prospecting-p1/README.md). Implementation commit `ad58743` contains the reviewed runtime; this follow-up records the draft handoff. P0/P1 is implemented, locally verified and independently reviewed; it is not merged or deployed. The owner accepted the P1 visual refinements and requested the next phase; the active P2A checkpoint is above. No real owner workspace was created remotely; original LTB data, voices and settings remain untouched. Real imports, outreach, production deployment and all video work/tests remain paused/out of scope.

## P1 contact and edit icon refinement

Latest owner feedback removes visible Contact labels and edit-button text. Email, website, platform, location and timezone now pair their compact icon directly with the value; the person name has no visible label. Accessible field labels remain available to screen readers. Edit controls use pencil icons with section-specific accessible names, hover titles and 44px targets; edit-form labels and save behavior remain unchanged. No migration, data, auth or automation change. Final Cloudflare build and 23 focused browser checks pass: five-width label/icon alignment and accessible controls, edit/focus/cancel, favicon behavior and social/disclosure behavior. Desktop/contact and narrow captures were inspected and the preview refreshed. Self-review only under the usage-aware policy; prior broad-suite and independent review results are historical.

## P1 owner feedback — reference layout and prospect artwork

Fetched PR #58 at `a6efafa` and inspected its committed [image and written corrections](design-references/README.md) before the reference-driven edits. Integrated the exact reference files and its guide/checklist/roadmap direction without replacing newer status, release facts or canonical instructions. The full-page profile now puts Opportunity and Outreach draft in the primary column, Contact and a short Recent activity summary alongside them. Evidence, sources, business services and full history remain accessible through named disclosures. Profile fields, fit/outreach separation, editing, checked sources, conflicts and pagination remain canonical.

Profile and list reuse the same website avatar, existing `faviconHost` parser and four stable flower/garden SVG variations, never initials. The standard site `/favicon.ico` is a direct browser image with no referrer. Missing/blocked/undecodable images keep the garden visible. The inherited Google favicon cache was inspected; its successful generic-globe response cannot reliably trigger the required garden fallback, so it is not used here. Custom HTML icon-link discovery remains unimplemented. No server fetching or new provider/dependency/migration was added.

Icon-only Instagram/LinkedIn links sit beside Open website only when existing business/person identity provenance contains a checked profile URL. P1 supports manually checked audit/source data; there is no automatic social discovery yet. Share/content/login URLs, unchecked identity sources and arbitrary report links do not create buttons. Source invalidation removes the corresponding button. Accessible names, hover/focus tooltips and 44px targets preserve usability without visible social-network labels.

Final reference acceptance: Cloudflare build, 64 functional browser assertions, 14 responsive/avatar checks, nine social/disclosure checks and seven Node social/favicon tests pass. Desktop and phone captures were inspected against the reference, including favicon success/failure and social presence/absence. Prior broad schema/domain/Pages/migration results remain the foundation evidence; no unrelated broad suite or video test was rerun.

One fresh Sol High review of the reference-driven changes completed with no material findings; no review fixes or repeat audit were needed. The earlier avatar/layout pass had also been reviewed before the owner supplied the new reference.

The owner accepted the updated [visual preview](previews/prospecting-p1/README.md) with “okay better” and requested the next phase. P2A proceeds separately; PR #60 remains unmerged and undeployed. Real imports, outreach, remote workspace setup, deployment and all video work/tests remain paused.

## Current Release

Release E — Ads is underway. E1, E2 (E2A/E2B) and E3A are closed, latest verified `618e18f`; E3 activation and E4–E5 remain unfinished.

Release D: Systems Delivery is **CLOSED** on verified `844ac905541df9e6fccb7dc313ab0a8d517da319` (PR #51). Release C is closed for forward development on verified `main` baseline `1638e3ed9fd33c3725aa3449935b08335b73f1a9`, including the audited/merged C7 product and two workflow-only follow-ups making both post-merge gates automatic. Read-only GitHub checks confirmed [Deploy staging 34478365157](https://github.com/Beeyach/bloomops/actions/runs/34478365157) and [Verify zero-to-current migration 34478365145](https://github.com/Beeyach/bloomops/actions/runs/34478365145) succeeded on that exact SHA. Release B remains closed on `c6509aa395a5db58310e2a0ae22a8a808082f77b`; Release A on `3deed08d8db2a92fcf4dc29a6a879a9945260049`.

## Current Phase

**Prospecting P2 is accepted locally. P3 preparation is active**, with the fresh workspace provider/sender decision pending. See the checkpoint above, [P2 acceptance](phases/P2.md) and [P3 preparation](phases/P3.md). P3–P5 remain unfinished; P1/P2 remain unmerged and undeployed. **Ads E3B is deferred**, not completed. E3A remains closed on verified `618e18fbb9241f3523f362f292a0e336c1ed0c81` (PR #59), with 24 migrations on main. Its next Ads task remains the E3B approval activation contract under [E3](phases/E3.md). E1/E2/E3A are closed; E3–E5 and Release E remain unfinished. No existing release gate is waived by this branch.

**Performance remains CLOSED.** PR #36's accepted application is `cb2ef0bea2900a46583e86c75840e8ba6639d663`; its exact-SHA gates and staging smoke are recorded below. Smart Placement was rejected/reverted, the approximately 500 ms target was not fully met, and additional performance work remains deliberately deferred.

## E3A — accepted and deployed (2026-09-12)

- [PR #59](https://github.com/Bloomwired/bloomops/pull/59) merged candidate `d1facb26048d25a4eace6823dd90202dbe14cf51` as `618e18fbb9241f3523f362f292a0e336c1ed0c81`; identical tree `7c63082d60d8b21566abeeab67011453132a136e` and reviewed runtime hashes. Additive `0023_e3a_review_media` is the 24th migration. Exact ordered evidence, complete sealing, retained File/attachment generation guards and pin-aware cleanup are deployed. No existing table rebuild, historical migration rewrite, new dependency, Ads approval/portal activation or production change.
- [Staging 34713560289](https://github.com/Bloomwired/bloomops/actions/runs/34713560289), job `103606572424`, passes all 16 steps; [remote zero-to-current 34713560190](https://github.com/Bloomwired/bloomops/actions/runs/34713560190), job `103606572586`, passes all 10 steps. Both use the exact merge SHA. Live version/health confirm `618e18f`, main, staging, schema OK and **24 migrations**.
- One fresh read-only Sol High review and one focused re-review resolved the requested-round partial unique-index replacement finding. A distinct second revision/all-new round identity regression proves replacement denial and exact original provenance retention; removing the fix reproduces failure. Final affected **141/141**, native evidence **97/97**, and fresh/repeat local zero checks pass. The native harness proves populated23→24 upgrade and actual accepted E2B application/schema create/request/retry/read/response compatibility.
- Full Node **6,112/6,112**, focused **860/860**, native File/R2 **64**, Social approval **65**, Ads creative **42**, Cloudflare build and built-Worker Ads **69 checks /42 captures** plus Social **91 checks /53 captures** pass. These broader results precede the migration-only review fix; final affected/native/fresh-repeat and exact-source remote gates cover the fix. No runtime JS changed after the accepted build. Five-width captures inspected; syntax/link/diff hygiene pass. Owned preview is stopped, and its local database now has the final reviewed guard with passing integrity/FKs and 24 migrations.
- Cleanup acceptance uses the successful mandatory remote verifier step, whose unchanged exact-source code fails on deletion, restored inventory or staging-identity errors. Downloaded verbose stdout omits the final cleanup lines; no raw log-tail proof or separately fetched account inventory is claimed. Evidence/logs/metadata/source/build hashes are retained in `/home/ary/Developer/bloomops-e3a-evidence/`.
- Existing BUILD_STATE/INDEX/RELEASE_E/E3/E3A and DOMAIN_MODEL facts updated selectively in both checkouts. Original unrelated runtime/schema/D2/instruction changes and branch remain untouched. E3 remains open. **Next: E3B activation contract**; once E3B creates media evidence, E3A is the minimum safe fallback. Human pilot setup and reusable quick picks do not block that work.

## E3A — local acceptance and review complete (2026-09-12)

- Implemented additive review scope/count and ordered relational manifest, exact same-Content File evidence and complete sealing, retained-generation/attachment replacement guards, explicit C5 copy-only defaults and pin-aware cleanup. Generated Drizzle SQL was adapted to ADD COLUMN; no existing table rebuilt, no previous migration/snapshot changed, no approval/portal activation or dependency added.
- Populated upgrade, old/new Social request compatibility, original/terminal rounds, retained bytes/archive, immutable File identity, exact selection bounds, transaction rollback and interrupted-upload cleanup checks pass. Native foundation passes 95 checks, including actual accepted E2B application/schema create/request/retry/read/response against upgraded D1. Native File/R2 64, Social approval 65 and Ads creative 42 regressions pass. Final full Node suite passes 6,112; Cloudflare build and fresh/repeat local zero verification pass. Built-Worker acceptance passes Ads 69 checks /42 captures and Social approvals 91 checks /53 captures across five widths. All 860 focused tests pass. Representative desktop/mobile captures inspected; syntax, relative links and diff hygiene pass.
- Earlier focused failures were an outdated trigger-count assertion and E2A fixtures constructing Ads review snapshots through a now-forbidden schema path. Fixtures now capture/seal through E3A's valid structural path then revoke visibility; all original denied-ID assertions remain intact. Historical E2A upgrade harnesses are explicitly bounded to their 23-migration baseline.
- Work/evidence: `feat/e3a-review-media` in `/home/ary/Developer/bloomops-d4-execution`; `/home/ary/Developer/bloomops-e3a-evidence/`. Original D2/schema/instruction edits and branch preserved. Local acceptance is complete and the owned preview is stopped. One fresh read-only Sol High review found a missing partial-unique-index replacement guard for an open round. Added an explicit same-Content requested-round collision check and a distinct-revision/all-new-identities replacement regression that also proves every original round field survives. The regression reproduces against the prior guard; 141 affected tests and final native foundation 97 checks pass. The single focused Sol High re-review resolves the finding with no remaining issue. Final fresh/repeat verification passes on the corrected migration. [PR #59](https://github.com/Bloomwired/bloomops/pull/59) merges candidate `d1facb26048d25a4eace6823dd90202dbe14cf51` as `618e18fbb9241f3523f362f292a0e336c1ed0c81`, identical tree `7c63082d60d8b21566abeeab67011453132a136e`. Staging `34713560289`, job `103606572424`, passes all 16 steps on that SHA. Live version/health confirm `618e18f`, main, staging and 24 healthy migrations. Remote zero `34713560190` subsequently passed; accepted release evidence is recorded above. Browser/build/full-suite results precede this migration-only review fix; final affected/native/fresh-repeat checks cover the fix.

## E3 — approval and media evidence contracts prepared (2026-09-12)

- Completed the first unfinished task by writing [E3](phases/E3.md) and the bounded [E3A foundation contract](phases/E3A.md). E3 reuses canonical rounds/revisions and explicitly distinguishes copy-only approval from copy plus 1–10 selected media files. Request/withdrawal remain Owner/Admin/PM capabilities; Team production access does not grant sharing. Working Content/Files stay internal; future Client access is scoped to the requested snapshot, with live contact/Project/Content/File revocation. No provider execution, notification or general Ads portal Content is introduced.
- Source inspection confirmed successful File generations already retain original bytes, so ordered relational evidence can pin their exact key/hash/ETag without duplicate uploads. E3A specifies additive review scope/count defaults, manifest ownership/completeness/sealing, replacement and pinned-generation guards, and pin-aware cleanup. Existing C5 all-column insertion must explicitly bind the new defaults to preserve Social request compatibility.
- E3 specifies atomic request movement from Internal Review to Client Review, exact selection/retry identity, immutable copy/media, current-authority downloads and scoped Client response/withdrawal behavior. The C5 requested-stage freeze constrains statement ordering; E3B must prove complete batch rollback and cannot merely broaden E2B's allowed stages. Copy-only evidence remains visibly copy-only; current 5 MiB uploads remain bounded.
- Used current repository source and the Cloudflare skill/official R2 API, D1 batch and limits documentation for architecture assumptions. Source, links, lifecycle/containment consistency and diff hygiene self-review completed. Planning-only work: no runtime edit, migration, application test/build/browser run, independent reviewer, commit or deployment. E3 is not implemented or closed.
- Work is on `docs/e3-approval-contract` in the isolated checkout at verified `09de9d6`; remote main matched that SHA during read-only preflight. Existing E2 closure notes are carried forward. Original D2/schema/instruction edits and branch remain untouched; task-owned contracts/status/index/release routing updated selectively in both checkouts.
- **Next:** implement E3A, including populated old/new Social compatibility, native D1/R2 retention proof, full/focused/browser checks, one fresh Sol High review and exact-source release gates. E3B's detailed activation contract follows accepted E3A. Astra High remains appropriate; no model change or owner input is currently needed.

## E2B — deployed and closed (2026-09-12)

- [PR #57](https://github.com/Bloomwired/bloomops/pull/57) merged `188cf3b43632a9b7202705775b445880f4ec8325` as `09de9d61d419add9a9e85d8e5e933936b5561154`. Candidate and merge share tree `565b980371b5ebd4f0bd6677de305df36558cca3`; reviewed runtime hashes are unchanged. Internal Ads creative list/create/detail/edit, production, platform edits, working assets and scoped history are live in staging.
- [Staging 34710782201](https://github.com/Bloomwired/bloomops/actions/runs/34710782201), job `103599071400`, and [zero-to-current 34710782170](https://github.com/Bloomwired/bloomops/actions/runs/34710782170), job `103599071204`, passed on the exact merge SHA. Public version/health confirm `09de9d6`, main, staging, healthy schema and **23 migrations**. No E2B migration, dependency or production change.
- Cleanup acceptance uses the successful mandatory zero-verifier step, whose unchanged source fails on disposable deletion, inventory-restoration or staging-identity errors. Available workflow metadata/logs are preserved. Downloaded verbose stdout omits the final verifier cleanup lines; no raw log-tail proof or separate post-run account inventory is claimed.
- Final acceptance: **6,109 Node tests**, **78 affected review-fix tests**, Cloudflare build, and **198 native D1/R2 checks** (Ads creative 42, Files 64, Social approvals 65, E1 campaign work 27). Ads proves 240 assignments with at most 82 bindings / 10,698 SQL bytes. **160 browser/HTTP checks /95 captures** pass at 1440/1024/768/390/320px (Ads 69/42, Social 91/53), plus three immediate-edit exact-persistence reproductions. Final mobile/desktop captures were inspected.
- One fresh Sol High review and one focused re-review are complete. Both findings are resolved: forms now wait for hydration before accepting edits, and equal-timestamp mixed Content/File history sorts UUID text IDs correctly. Persisted-caption browser assertions and mixed-event SQL regression cover the fixes. No remaining finding, post-review runtime edit or additional review loop.
- Evidence: `/home/ary/Developer/bloomops-e2b-evidence/` holds logs, captures, original/fixed edit reproduction, review records, source/build/candidate/merge hashes, exact gate metadata and live identity. Owned preview stopped. Original D2/schema/instruction edits and branch are preserved. Task-owned status/index/contracts/domain facts are updated selectively in both checkouts; post-gate closure notes remain local to preserve the published source.
- **E2B and E2 are CLOSED.** Next: write the bounded **E3 Ads client approval and immutable media evidence contract** against this deployed implementation. E3–E5 and Release E remain unfinished. Working assets are mutable internal media; no Ads client approval, provider execution or publishing was added. E2A remains the minimum compatible application fallback once Ads records exist. Astra High remains appropriate for E3's cross-system approval/storage design; explicitly recommend Medium when the actual work returns to routine implementation. No owner decision or credential currently blocks E3 contract preparation.

## E2B — local acceptance and review complete (2026-09-12)

- Active branch `feat/e2b-ads-creative` in `/home/ary/Developer/bloomops-d4-execution`, based on accepted `2a73193`. Owner confirms Astra High has remained selected; do not infer an active effort from repository defaults or ask for this switch again. Explicitly flag when a future task warrants returning to Medium.
- Implemented internal Ads list/create/detail/edit, Project-derived canonical Content identity, fixed internal production, platform edits, working assets, canonical detail history and scoped query/options limits. Social loaders/approvals/portal stay explicitly Social. Shared mutations and File operations use stored context with live Project/child authority. Generic Ads File retry now resolves its actual Content family; Work and Social retry contracts are preserved.
- Final full Node suite passes **6,109 tests**. Native local acceptance passes **198 checks**: Ads creative 42, File/R2 64, Social approvals 65 and E1 campaign work 27. Ads covers 240 assignments with a maximum of 82 bindings / 10,698 SQL bytes. Cloudflare build passes; schema remains 23 migrations with no E2B migration or dependency.
- Initial browser acceptance exposed a real shared-form hydration timing defect: HTTP 200 could save stale/concatenated text after fast navigation. The form now waits for hydration before accepting edits; the focused built-browser reproduction passes three consecutive exact-input/exact-persistence checks. Ads acceptance now asserts persisted caption text. Final built-Worker Ads acceptance passes **69 checks /42 captures** across five widths; saved caption and canonical details activity are visually confirmed. The final Social recording/approval regression passes **91 checks /53 captures** on the same build. Total final browser acceptance: **160 checks /95 captures**, plus three fast-edit persistence reproductions.
- One fresh Sol High review is complete. It found the same form defect and UUID event-ID tie sorting in mixed Content/File history. Both are fixed; **78 affected tests pass**, including equal-timestamp mixed-history order. The single focused Sol High re-review confirms both findings resolved, with no remaining problem. Reviewed source hashes match final source; no further runtime edits or review loop. Publication/deployment gates subsequently passed; E2B closure is recorded above.
- Evidence: `/home/ary/Developer/bloomops-e2b-evidence/` contains logs, final captures, original/fixed fast-edit reproduction, review records, and runtime/build hashes. Owned preview stopped. Publication and exact candidate/merge/live evidence are now complete, recorded above.

## E2B — implementation preflight (2026-09-12)

- Confirmed isolated HEAD `2a73193` and the prepared contract; only task-owned documentation is dirty there. Original D2/schema/instruction work and branch remain untouched.
- Traced canonical Content create/update/platform/transition, Project scope, Content File storage policy and API dispatch. Preserve Social-only `loadContentResource` / `getContent` callers used by approvals and Social pages; add narrowly internal Ads dispatch for the shared mutation/File paths. Fixed Ads workflow predicates must also guard retries and storage operations, not only transition menus. The existing File activity helper caps at 60, so E2B's authorized 61st-row overflow probe needs a targeted read-model extension.
- No runtime edit, migration, test, build, independent review, commit or deployment occurred in this preflight. Implementation and acceptance remain unfinished. This preflight initially inferred Medium from repository defaults. The owner subsequently confirmed Astra High was already selected; that session choice overrides the default. Keep High for the shared permission/storage implementation and explicitly flag a later return to Medium. No product decision or credential is missing.

## E2B — implementation contract prepared (2026-09-12)

- Added [E2B](phases/E2B.md): exact routes and input/query limits, Project-derived immutable identity, live role/assignment/restricted-child authority, atomic receipts and revisions, bounded internal workflow, working assets and Social/portal containment. PM ordinary Project access stays broad; Project-only Team access is narrowly typed and SQL-authorized. Client approval/media evidence remains E3.
- Defined functional Ads navigation, route-safe shared controls, scoped metadata/badges/icons, responsive acceptance and concrete Node/native D1/R2/browser/review/release gates. No new schema or migration is planned. Corrected stale E2 source findings and updated existing release/index routing in both checkouts.
- Planning-only source inspection, relative-link and whitespace checks plus self-review completed. No runtime tests/build, new independent reviewer, commit, migration or deployment was needed or performed for this task. Existing E2A closure notes remain local alongside this contract; E2B implementation and all its acceptance remain unfinished.
- **Next:** implement E2B from accepted `2a73193` under its contract, then verify and obtain one fresh Sol High review. No product decision or credential is pending.

## E2A — deployed and closed (2026-09-12)

- [PR #56](https://github.com/Bloomwired/bloomops/pull/56) merged `82a0b0e6316fd4456fd611dfd7b48dae1065f758` as `2a73193d23e8e83673153e0e4512ddcae2bb6505`. Candidate and merge share tree `fc6a06ba10cd919d53a5e32a354084942ca8b645`. Reviewed runtime and migration source hashes are unchanged; local build hashes are preserved.
- [Staging 34707425150](https://github.com/Bloomwired/bloomops/actions/runs/34707425150), job `103589899841`, and [zero-to-current 34707425223](https://github.com/Bloomwired/bloomops/actions/runs/34707425223), job `103589899998`, passed every step on the exact merge SHA. Public version/health confirm `2a73193`, main, staging, healthy schema and **23 migrations**. Additive `0022_e2a_content_context` is deployed; no production change.
- Cleanup acceptance uses the successful mandatory verifier step, whose source returns failure for disposable deletion, inventory-restoration or staging-identity errors. Downloaded verbose stdout omits the final repeat/cleanup lines; no raw log-tail proof or separately fetched post-run account inventory is claimed. Full run/job metadata and available logs are preserved.
- Local acceptance: **6,081 full Node tests**, 710 focused Content/portal/schema tests, final 13 context tests and **73 affected tests after the review fix**. Native checks total **224** (41 populated upgrade/invariants, 64 File/R2, 65 approval, 27 Ads, 27 Systems). Final local fresh/repeat verification passes with 23 migrations, all historical trigger names, 111 indexes, valid foreign keys/integrity and unchanged repeat ledgers. Cloudflare build and **145 browser/HTTP checks /53 captures** across five widths pass.
- One fresh Sol High review and one focused re-review are complete. Its same-context Ads replacement-identity finding is resolved: all original immutable Ads identity fields are guarded while the E1 Social concurrent request no-op stays compatible. No application JavaScript/UI changed after the full browser/build acceptance; affected SQL was verified in Node and native D1 and replayed by both exact-SHA release gates. No remaining finding or additional review loop.
- Evidence is in `/home/ary/Developer/bloomops-e2a-evidence/`: accepted browser captures/logs, local and CI checks, review/fix records, candidate/merge/tree/source/build hashes, exact workflow metadata and live identity. Owned preview stopped. Original D2/schema/instruction edits and branch are preserved. Status/index/contracts/domain facts updated selectively in both checkouts; these post-gate closure notes remain local to preserve the exact published source.
- **E2A is CLOSED.** The bounded **E2B internal Ads creative interface contract** is prepared above; implementation from deployed `2a73193` is now the first unfinished task. E2B will use canonical Content/Files and exact Project authorization; E3 owns client approval/media evidence. No Ads creative endpoint/UI was activated in E2A. E2, E3–E5 and Release E remain unfinished; human pilot setup and quick picks do not block the next task.

## E2A — local acceptance complete (2026-09-12)

- Added `production_area` (Social default) and nullable `ads_project_id`, exact pair checks, Project FK and two indexes without rebuilding Content. Existing identity/approval/File/platform/history guards remain. The same-named Social insert trigger is conditional on area; Ads insertion requires its exact current workspace/Client/Service/Ads Project tuple. Update and replacement guards protect context and referenced Project parents. Department reassignment stays allowed without reclassification.
- Existing internal/Client Content predicates explicitly require Social/null context. Social creation binds both new values and checks Client request-key availability inside the insertion SELECT; unreadable Ads collisions, including a competing insert after the retry read, cannot return an Ads identifier or become a successful retry. Legacy receipt JSON and response/input allowlists remain unchanged.
- Focused Content/portal/schema/HTTP checks pass; populated native D1 upgrade passes 41 checks, with old/new application Social creation and open approval resolution. Native File/approval harnesses pass 64/65 checks, the full Node suite passes 6,081 tests, and the final Cloudflare build passes. Browser acceptance passes **145 checks /53 captures** at 1440/1024/768/390/320px, using the existing C5 Social/recording/approval walkthrough with the E2A denied-ID extension. Native Ads/Systems regressions also pass 27 checks each; total native checks are 224. Disposable fresh/repeat zero verification passes with all historical trigger names, 111 indexes and 23 migrations.
- Verification caught stale schema count assertions and the historical blanket trigger-removal assertion. Counts now reflect E2A; only the exact same-name Social-trigger replacement is allowed, with independent preservation checks for all old trigger names/other definitions and indexes. No zero-verifier safety check changed. Final evidence lives in `/home/ary/Developer/bloomops-e2a-evidence/`.
- One fresh Sol High review found a same-context Ads SQL replacement gap: request identity/creation time could change. The Ads insert guard now compares all original immutable identity fields; Social context checks and E1 conflict semantics remain compatible. **73 affected Node tests and 41 native D1 checks pass**, including unchanged-row rejection and the old Social concurrent request no-op. The single focused Sol High re-review confirms this finding resolved, with no remaining problem. Final fresh/repeat verification passes on the complete migration, with unchanged repeat ledgers.
- Working branch `feat/e2a-content-context` is isolated from original D2/schema/instruction edits. Publication and deployed gates are now complete, recorded above. Astra High remains appropriate; configured review is one fresh read-only Sol High reviewer after final local acceptance.

## E2 — creative and compatibility contracts prepared (2026-09-12)

- Completed the first unfinished task by writing [E2](phases/E2.md) and [E2A](phases/E2A.md). E2A establishes immutable `productionArea` and `adsProjectId` storage and keeps all existing application paths Social-only. E2B will add scoped Ads creative production and assets after the compatibility baseline is accepted/deployed; E3 retains client approval and immutable media evidence.
- Source inspection found the C1 Social-service database trigger, every-column Content creation SELECT, Client/Service-only Content and restricted-File grants, Project resource-type handling in `inScope`, shared approval/recording/portal predicates, historical activity filtering and hard-coded Social navigation. The contracts explicitly cover those callers rather than assuming an Ads service predicate is sufficient.
- Chosen migration direction: additive fields, context-pair validation, Project existence FK plus database guards for the exact workspace/Client/Service tuple and parent reparenting, immutable area/Project, and preserved historical trigger names. Existing Social rows/receipts remain Social/null, including `ad_creative`; no inference-based reclassification. SQLite ADD COLUMN restrictions were checked against the primary documentation; native D1 proof is an implementation acceptance gate, not claimed here.
- E2A must land before Ads records can be created. The contract requires old/new Social-create compatibility and an E2A-or-newer application fallback after E2B activation. E2B will use current Project/Content/File checks with narrow typed Ads resource scope, preserve Social grants, keep Content/assets internal or restricted, and stop internal production before client approval/publication. No provider action, metric or new approval engine.
- Planning-only self-review under the usage-aware policy; source/contract/link consistency and diff hygiene checked. No runtime code, schema, migration, application test/build/browser run, independent review, commit, push or deployment was performed for this preparation task. No model configuration changed. E2A implementation will require its own focused/full/native/browser checks and one fresh Sol High review.
- Source work used `docs/e2-creative-contract` in the isolated checkout based on fetched `f2a2bb0`. Existing E1 closure notes were carried forward. Original runtime/schema/D2/instruction changes and branch remain untouched; task-owned contracts and status/index/release routing updated in both checkouts. Next: implement E2A from its contract; it is not complete merely because planning is complete.

## E1 — campaign work deployed and closed (2026-09-12)

- [PR #55](https://github.com/Bloomwired/bloomops/pull/55) merged `6fdae4274d190733d6aa1de081b2a4ac2a4c8f4f` as `f2a2bb0c7e665a5bd77cd010544a226c4da934a9`; candidate and merge share tree `9ab89d0e5a144b44e4e887706b20c014679c2aeb`. Reviewed runtime file hashes are unchanged. Campaign work, scoped filters, canonical Work summaries/links and structured summary badges are live in staging.
- [Staging 34704707619](https://github.com/Bloomwired/bloomops/actions/runs/34704707619), job `103582554942`, and [zero-to-current 34704707656](https://github.com/Bloomwired/bloomops/actions/runs/34704707656), job `103582554985`, passed every step on the exact merge SHA. Public version/health confirm `f2a2bb0`, main, staging, healthy schema and 22 migrations. No new migration or production change.
- Cleanup acceptance uses the successful mandatory verifier step, whose source fails on disposable deletion, account-inventory restoration or staging-identity errors. Downloaded verbose stdout omits the final repeat-migration/cleanup lines; no raw log-tail proof or separately fetched post-run inventory is claimed. Complete run/job metadata and available logs are preserved.
- Final local acceptance is **166 focused tests, 54 native D1 checks, Cloudflare build and 123 browser/HTTP checks /47 captures**. One fresh Sol High review and one focused re-review are complete; both low-severity presentation/status findings are resolved. No post-review runtime change or extra review loop. Final desktop/mobile captures inspected; owned preview stopped.
- Evidence: `/home/ary/Developer/bloomops-e1-evidence/` holds logs, final captures, review records, candidate/merge/tree/runtime/build hashes, exact workflow metadata and live identity. Original runtime/schema/D2/instruction work and branch are preserved. Existing status/index/contracts/domain documentation updated in both checkouts; these post-gate closure notes remain local to preserve the exact published source.
- **E1 is CLOSED.** Next: write the bounded E2 Ads creative contract under RELEASE_E before extending Content eligibility, schema or approvals. E2–E5 and Release E remain unfinished. Manual human pilot setup and onboarding quick picks do not block this independent development.

## E1 — campaign work local acceptance (2026-09-12)

- Replaced the internal Ads preview with Campaign work, strict Client/Service/Project-status filters, 50-row pagination, bounded facets and canonical Work summaries/forward Deliverables. Create/detail/summary links use existing Work operations. Client and Service context have separate labeled fields; no inferred platform marks or new operational dot-label string. Project statuses describe delivery, not provider execution.
- Extracted Systems' bounded read composition into `department-work.mjs`; fixed Systems and Ads wrappers select their canonical department relationship while preserving live Project/child authorization, request-local batching, timezone behavior and hidden-data exclusions. No new schema/migration, writes, provider facts, Content/approval/metrics or portal capability. Schema remains 22 migrations.
- **165 focused Ads/Systems domain/access/page/execution/handoff/portal tests pass.** Initial new-fixture expectations were corrected for renamed alphabetical ordering and for canonical attention promoting review work; the off-page test now deliberately places 55 at-risk Projects first. These were test setup corrections, not application fixes.
- Cloudflare/OpenNext build passes. Disposable native D1 acceptance passes **27 Ads + 27 Systems checks**, including 240 assignments, five metadata statements in one native batch, unchanged data, restricted-child filtering, immediate revocation, timezone-alias fallback, integrity and foreign keys. No R2 binding is needed for these reads.
- Real local Worker/browser acceptance passes **122 checks /47 captures** across 1440/1024/768/390/320px. Covers empty/populated/long-name/invalid/Team/restricted states, strict filtering, pagination, native GET without JavaScript, canonical links, Client redirect, assignment removal/suspension, keyboard focus, touch and reduced motion. No horizontal overflow or browser errors. Representative desktop/mobile and the fully loaded live Bloomlab gallery were inspected. Owned preview stopped.
- Evidence is retained at `/home/ary/Developer/bloomops-e1-evidence/`: focused/native/build/browser logs, captures, source/build hashes and draft PR description. Implementation is isolated on `feat/e1-ads-campaign-work`; original runtime/schema/D2/instruction changes and branch remain untouched. Task-owned contracts/status/index/domain notes updated in both checkouts. One fresh read-only Sol High review completed with two low-severity findings: inherited WorkSummary dot separators and an outdated staged browser-status note. Ads now opts into wrapping Status badges for summary details, preserving canonical facts/links and default Systems rendering. A new render/browser assertion rejects operational middle-dot separators. Final fix acceptance passes **166 focused tests, a fresh Cloudflare build and 123 browser/HTTP checks /47 captures**. The new browser assertion confirms Ads operational summaries contain no middle-dot separator and have distinct badges; final desktop/mobile captures were inspected and the preview is stopped. The one allowed focused Sol High re-review resolved both findings with no remaining issue. No further review or query rerun was needed. E1 stays open until publication and exact-source release gates pass.

## Release E — release and E1 contracts prepared (2026-09-12)

- Completed the first unfinished preparation task: [RELEASE_E](RELEASE_E.md) defines campaign delivery, creative, approval and lightweight performance boundaries; [E1](phases/E1.md) defines the first implementation slice and its acceptance checks. This is planning completion, not shipped Ads behavior or E1 acceptance.
- Campaign delivery reuses canonical Work Projects under the current same-workspace/same-Client Ads Service relationship. Project status describes agency delivery, never provider operation. E1 is a bounded internal read with existing Work summaries/permissions and no schema or writes. No independent campaign task engine or inferred platform data.
- Inspected actual Content and approval predicates: Social's `ad_creative` type does not grant Ads eligibility. Later creative work needs an explicit production context and safe Project binding within canonical Content; later approvals must address immutable media evidence because current snapshots exclude Files. Manual performance needs source/interval/timezone/currency/correction provenance; revenue and provider execution remain deferred.
- Owner continuation satisfied the preceding High handoff and older Release D wait-before-Ads note. No configuration change or programmatic model switch was made. Implementation still needs Astra High under permission routing, with one fresh Sol High review after focused verification. No owner decision or credential blocks E1.
- Source/link/contract consistency and diff hygiene checked in the isolated checkout and original task-owned documents. Planning-only self-review follows the usage-aware policy; no independent audit, runtime test, build, migration, commit, push or deployment was performed for these contracts. Existing runtime baseline remains PR #54. New contracts and status/index updates are local; unrelated original changes and branch are preserved.
- Next bounded task: implement E1 from `707d2be` in the isolated checkout, then run the contract's domain/access/Worker/browser/build checks and required review. E2–E5 remain later slices, not implemented or accepted.

## Release E — source inventory and model routing (2026-09-12)

- Read the canonical guide, existing tracker, roadmap, Ads specification and relevant implemented surfaces. Release E calls for Campaigns, Creative, Approvals and lightweight Performance; possible metrics include spend, leads, cost per lead, bookings, cost per booking and revenue. The specification excludes a giant attribution platform. No Release E phase contract currently exists.
- `/ads` currently renders the internal AreaPreview. The canonical schema exposes no Campaign model; Content has an `ad_creative` type, but existing Social eligibility, approvals and shared Work boundaries require inspection before choosing how Ads reuses them. This inventory does not establish or change an Ads architecture.
- First unfinished task: prepare the bounded Release E/foundation contract with explicit relationships, permissions, scope exclusions and acceptance checks. Recommend **GPT-6 Astra High** for this architecture/database work under AI_WORKING_AGREEMENTS. `.codex/config.toml` records the Medium repository default; it does not prove the active session setting. No model/effort or configuration change was performed by the assistant.
- Source/status-only preparation. No runtime, schema, migration, test, independent audit, commit or deployment change. Existing dirty checkout/branch and unrelated work preserved; status/index updated in both checkouts and diff hygiene checked. Continue once the owner selects/confirms High; manual pilot link setup does not block development.

## Internal pilot — compact icon alignment deployed (2026-09-12)

- [PR #54](https://github.com/Bloomwired/bloomops/pull/54) merged `797c81378f63155a8cf2c8de8024e4a345740a3e` as `707d2bea55a7f5262a539d20313cbcb37abf3665`; both trees are `1133e7a149147ec2aeb8ca2a2e55280695059dcd`. Icon tiles/glyphs are now 28/16px, centered on titles with Required/Optional below.
- [Staging 34702705746](https://github.com/Bloomwired/bloomops/actions/runs/34702705746), job `103577167149`, and [zero-to-current 34702705747](https://github.com/Bloomwired/bloomops/actions/runs/34702705747), job `103577167134`, passed every step on that merge SHA. Public version/health confirm `707d2be`, staging, schema OK and 22 migrations. No new migration or production change.
- Cleanup acceptance uses the successful exact-SHA verifier step, which fails on deletion/inventory/staging-identity errors. The downloaded verbose log omits the final verification/cleanup lines; no raw log-tail proof or separate post-run inventory is claimed. Complete run/job metadata, downloaded logs, live identity and local build/browser evidence are in `/home/ary/Developer/bloomops-icon-alignment-evidence/`.
- Cloudflare build and **76 browser checks /17 captures** pass. Desktop/mobile captures inspected; all five widths measured compact icon dimensions and less than 1px icon/title center difference. Self-review only for this spacing correction; no repeat broad test suite, new persistent test suite or independent audit. Owned preview stopped; unrelated original work and exact published source preserved. Existing status/index/design guidance updated. Next: bounded Release E Ads contract preparation.

## Internal pilot — compact icon alignment acceptance (2026-09-12)

- Owner found the new 40px artwork oversized and title text aligned with its upper half. Reduced tiles to 28px and glyphs to 16px. A two-column grid centers artwork on the title row; Required/Optional occupies a separate second row. No metadata, action, lifecycle, API, schema or migration change.
- Cloudflare/OpenNext build passes. The existing synthetic local browser walkthrough, with a temporary geometry check outside the repository, passes **76 checks /17 captures**. At all five widths (1440/1024/768/390/320), visible icon/title center differences are under 1 CSS pixel and tile/glyph sizes are 28/16px. Existing responsive, focus/Escape, reduced-motion, setup/action/confirmation/verification and portal exclusion checks pass. No page errors; desktop and mobile captures inspected, including Brand assets.
- Self-review applies to this spacing-only correction; no independent agent or new persistent test suite was needed. Evidence: `/home/ary/Developer/bloomops-icon-alignment-evidence/` build/browser logs, captures and temporary measurement runner. Source changes are isolated on `fix/onboarding-icon-alignment` in `/home/ary/Developer/bloomops-d4-execution`; original checkout and unrelated work are preserved. Publication/gates pending. Ads contract preparation resumes afterward.

## Internal pilot — badge and icon release accepted (2026-09-12)

- [PR #53](https://github.com/Bloomwired/bloomops/pull/53) merged reviewed `577e1cbef19a05e62c7016fc31359e0b84c9d445` as `d36ff5f099e0b6e2f670f3c2fdb6d9cff2fac520`; both share tree `ae7fbdd07d3c48678fa51e4b5afb942d42802831`. No post-review runtime change or re-review.
- [Deploy staging 34701934730](https://github.com/Bloomwired/bloomops/actions/runs/34701934730), job `103575127963`, and [Verify zero-to-current 34701934733](https://github.com/Bloomwired/bloomops/actions/runs/34701934733), job `103575127909`, passed every step on the exact merge SHA. Direct public curl version/health checks confirm `d36ff5f`, staging, schema OK and 22 migrations. No new schema/migration or production change.
- The disposable verifier requires successful deletion, restored account inventory and unchanged staging identity before exiting successfully. Its exact-SHA job/step metadata passes; archived verbose stdout again omits the final integrity/idempotency/cleanup lines. Cleanup acceptance uses that successful mandatory verifier step, not a claimed raw log tail or separately fetched post-run inventory.
- Local acceptance and independent review remain **85 focused checks /59 browser checks /17 captures**, final Cloudflare build, desktop/mobile/reference inspection and one Sol High pass. Color contrast checks pass; no API/lifecycle/permission change. Persistent evidence: `/home/ary/Developer/bloomops-pilot-visual-evidence/`, including review report, candidate/source/build hashes, complete workflow metadata, downloaded job logs and deployed version/health JSON. Owned previews are stopped. Only post-release tracking notes remain local; unrelated original work is preserved.
- Owner's design preferences are recorded in DESIGN_SYSTEM: separate restrained badges for operational meanings, distinct state pills, recognizable platform/media/task artwork, preserved identity after completion, no emojis. Reusable guidance templates and quick picks are deferred. Continue independent development without waiting on manual demo destination setup; actual Client link actions still require genuine destinations. The next bounded development task is Release E Ads contract preparation from the existing roadmap/spec. Human pilot steps remain pending and do not count as completed acceptance.

## Internal pilot — badge and icon follow-up local acceptance (2026-09-12)

- Replaced the onboarding responsibility/visibility/verification sentence with a compact wrapping badge group: labeled responsibility, visible audience and conditional verification requirement, each with an appropriate icon and restrained tint/border. Lifecycle pills use distinct text/glyph/color for pending, waiting, blocked and completed states. Removed the duplicated internal Onboarding heading and redundant percentage text.
- Existing named Instagram access and Course videos steps now use recognizable Instagram and video artwork; Agreement, Brand assets and Kickoff use signing, image and calendar artwork. Completed items retain their task artwork and show completion separately. Exact visible-title hints are presentation only; custom titles fall back to the configured action icon. No new API fields, template mutation, data, lifecycle, permission, dependency, schema or migration change.
- Final Cloudflare/OpenNext build passes. **85 focused checks** pass; the final local Worker walkthrough passes **59 browser checks / 17 captures** across agency and Client views at 1440/1024/768/390/320px, keyboard focus/Escape and reduced motion, setup/link action/persisted confirmation/separate verification, contact revocation and portal exclusion of agency metadata. No page errors. New badge/artwork contrast pairs measure 5.4–6.9:1. Final desktop/mobile captures and the fully loaded live Bloomlab gallery were inspected.
- Initial browser run stopped on a fixture selector that expected a shortened Social service label; the actual local catalogue uses Social Media Management. The corrected selector passes. The reference screenshot now waits for gallery content rather than capturing a loading shell. A read-only local catalogue diagnostic initially used a nonexistent column, then used the inspected schema correctly. One fresh Sol High review passed with no material correctness, authorization, privacy, lifecycle, responsive or accessibility findings. Reviewer inspected the final diff, recorded evidence and desktop/mobile captures without rerunning write-producing harnesses. No re-review or repeat full-suite run was needed.
- Work is on `feat/pilot-onboarding-visuals` in `/home/ary/Developer/bloomops-d4-execution`, based on deployed `9bf27e0`. Evidence: `/home/ary/Developer/bloomops-pilot-visual-evidence/` final focused/build/browser logs and captures. Runtime changes are isolated; original dirty checkout and unrelated work remain preserved. Publication remains pending. Templates and quick picks stay deferred; manual demo setup is not a prerequisite for this UI follow-up.

## Internal pilot — onboarding fix deployment accepted (2026-09-12)

- [PR #52](https://github.com/Bloomwired/bloomops/pull/52) merged reviewed `8de6123f3ab66d673e72cae7f8b11ec4b7328100` as `9bf27e03055ebff9387d7bbf4f1e4798030f1c53`. Both trees are `a92c4930a492528a1fc954a2f5b484556bccb655`; no post-review runtime change or additional independent review.
- [Deploy staging 34700598748](https://github.com/Bloomwired/bloomops/actions/runs/34700598748), job `103571551987`, passed every step. Direct public curl checks confirm deployed `9bf27e0`, environment staging, configured auth, schema OK and **22 migrations**. Additive migration `0021_pilot_onboarding_guidance.sql` is deployed. The inherited version endpoint's Production label still reflects branch main; health confirms the staging environment.
- [Verify zero-to-current 34700598755](https://github.com/Bloomwired/bloomops/actions/runs/34700598755), job `103571552333`, passed every step on the same SHA, including verifier safety tests and the create/migrate/repeat/verify/delete step. Cleanup acceptance is based on successful execution of the verifier that throws on failed deletion, changed account inventory or staging identity; no separate post-run account inventory was fetched. The downloaded verbose log omits the final integrity/idempotency/cleanup output, so no raw log-tail proof is claimed. Full run/job/step metadata is archived.
- Prior local acceptance remains **6,000 tests**, **489 browser checks / 116 captures**, native D1/R2 and migration/build checks, and one Sol High review with no material findings. This turn performed publication and read-only gate/identity verification, not another full application test run or signed-in staging browser pilot.
- Persistent evidence: `/home/ary/Developer/bloomops-pilot-evidence/` contains both run/job metadata, downloaded job logs, deployed version/health JSON, reviewed artifact/publication metadata and prior available acceptance evidence. Existing status/index files are updated locally in both checkouts; unrelated starting changes and reviewed source remain preserved. Production is untouched.
- First unfinished task requires owner-controlled document/folder destinations and the human portal session: demo Client → Onboarding → Set up step → save concise instructions and the actual HTTPS agreement/upload-folder destination; refresh the Client portal, follow it and confirm only work actually completed. Existing completed steps remain history. No link destination was invented, no real agreement or asset receipt is asserted, and no real Client communication was initiated by this publication task. Continue remaining Social, Systems and handoff pilot steps after this recheck. The overall human pilot remains open.

## Internal pilot — authentication resolved and publication (2026-09-12)

- The owner supplied successful PowerShell authentication for Beeyach from the Windows keyring. Direct diagnosis isolated the mismatch: `/run/WSL/2544_interop` could execute Windows GitHub CLI but could not read its token; the existing `/run/WSL/1_interop` connection could. `WSL_INTEROP=/run/WSL/1_interop` applied only to the task's GitHub commands restored authenticated ADMIN access to Bloomwired/bloomops. The earlier invalid-token diagnosis was misleading; no further login was needed. No token was printed or persisted, and no credential/global-wrapper setting changed.
- Created and merged [PR #52](https://github.com/Bloomwired/bloomops/pull/52) with the exact reviewed head pinned. Candidate `8de6123f3ab66d673e72cae7f8b11ec4b7328100` and merge `9bf27e03055ebff9387d7bbf4f1e4798030f1c53` share tree `a92c4930a492528a1fc954a2f5b484556bccb655`. Existing authorization covers staging and disposable D1 gates; production remains untouched.
- [Staging 34700598748](https://github.com/Bloomwired/bloomops/actions/runs/34700598748) and [zero-to-current 34700598755](https://github.com/Bloomwired/bloomops/actions/runs/34700598755) target the exact merge SHA. Staging passed all steps, including deployed identity/auth/schema checks. Direct curl version/health checks confirm `9bf27e0`, staging, schema OK and 22 migrations; Python urllib received 403, so no urllib success is claimed. The disposable migration gate remains running. No post-review runtime change or repeat independent review.

## Internal pilot — reviewed candidate and publication blocker (2026-09-12)

- Authentication diagnosis after the owner reported completing sign-in: WSL interop is available and the configured Windows GitHub CLI runs successfully, but its direct `auth status --hostname github.com` reports active account `Beeyach` with an invalid stored token. Native WSL GitHub CLI has no configured account; no token/config override is set in this session. The wrapper hides the underlying error behind a generic sign-in message. This does not establish what happened in the owner's separate terminal; compare that terminal's `gh auth status` before requesting another login. No credentials or global configuration changed.
- Committed and pushed **`8de6123f3ab66d673e72cae7f8b11ec4b7328100`**, branch `feat/pilot-onboarding-guidance`. A read-only remote ref check confirms that exact branch SHA. One fresh **Sol High** read-only review inspected the exact clean candidate against `844ac905541df9e6fccb7dc313ab0a8d517da319` and found no material correctness, authorization, isolation, migration, lifecycle, privacy or UI issues. No re-review or post-review source change.
- Final accepted checks: **6,000 full tests / 29 new guidance tests / 125 affected checks**, Cloudflare build, **32 onboarding native D1 + 86 Work Core workerd/D1/R2 checks**, local zero-to-current and second-pass migration verification. Browser acceptance: **42 dedicated / 174 legacy onboarding / 273 legacy Work Core = 489 checks**, **12 + 42 + 62 = 116 captures** at five widths. Dedicated final 320px portal, 390px setup and live design reference inspected. The supplemental legacy browser results finished after review; no product or harness source changed to obtain them.
- Local validation interruptions were environmental/fixture setup: legacy onboarding initially lacked its documented Smoke Agency bootstrap; the bootstrap was restored locally and the suite passed. An initial Work Core fixture insertion failed while another harness was running; no application defect was established. Its resumed isolated run passed all 273 checks after restoring the lost temporary Playwright runner and three browser libraries from cached packages/temporary extraction. No project dependencies or global configuration were changed.
- **Publication blocker:** the configured WSL `gh` wrapper obtains authentication from Windows GitHub CLI, whose authentication check fails. Native `/usr/bin/gh` has no sign-in. The connected GitHub app also returned 404 for `Bloomwired/bloomops` PR creation. SSH push works, but no PR was created. No credentials were changed or printed, no protection was bypassed, and no main push/deployment/disposable remote database mutation was triggered. The prepared PR description and reviewed branch are ready for restored authentication.
- Fresh public staging checks still show **`844ac90`**, health OK, environment staging, **21 migrations**. The fix and additive migration remain undeployed; do not ask the owner to test new controls on staging yet. Next: owner restores Windows GitHub CLI sign-in, then the assistant creates/merges the PR and verifies the exact merge's staging and zero-to-current gates before resuming the human pilot.
- The resumed environment lost earlier `/tmp/bloomops-pilot-onboarding` raw logs/captures after they had been inspected and independently reviewed. Their results remain recorded above and in the task conversation; do not claim those raw files still exist. Persistent handoff evidence is now `/home/ary/Developer/bloomops-pilot-evidence/`: transcribed review result, built artifact hash, ready PR body, and the final resumed Work Core browser log/captures. Owned preview Worker is stopped after validation. Post-review status notes remain local, preserving the exact reviewed/pushed candidate and unrelated root-checkout work.

## Internal pilot — actionable onboarding local acceptance (2026-09-12)

- Runtime guidance is separate from original generated instructions/master versions: additive migration `0021_pilot_onboarding_guidance.sql` adds four columns without table replacement or history reset. Owner/Admin/Project Manager can configure open Client-visible, Client-responsible steps. Guidance freezes on submission/completion. Unconfigured open steps cannot be confirmed. Optimistic revisions, live commit-time authority and atomic activity prevent stale/conflicting writes; activity excludes destination URLs/instruction contents.
- Per-Client controls support explicit HTTPS agreement, upload-folder, booking, access or instructions links, plus confirmation-only work explained by the agency. **This slice uses external upload destinations, not a native onboarding uploader.** It changes no Project file-write grants, stores no uploaded bytes and performs no provider fetch/execution. External destination permissions require agency validation; hiding a link in BloomOps cannot revoke an already shared external URL. Link clicks do not claim signing, upload or completion. Existing verification rules remain separate.
- Portal uses the shared SVG line icons, accessible action labels, one progress heading, concise instructions and collapsible completed history. Existing templates still generate the checklist; the owner's template question is answered by this two-layer model. No visual master-template editor is introduced. [Operator instructions and acceptance](phases/PILOT.md) record the scope.
- Verification: 29 new guidance tests; 125 affected checks; final full suite **6,000 passed**, no failures/skips. Native disposable D1 passes **32 checks** over all 22 migrations. Fresh base/inherited/domain migration and second-pass zero-to-current checks pass locally. The upgrade regression preserves an existing completed item and its submission FK. Final Cloudflare/OpenNext build and syntax/diff checks pass.
- Final stable Worker browser run: **42 checks / 12 captures**, five widths 1440/1024/768/390/320, reduced motion, focused setup dialog, stale-editor rejection, actual configured-link navigation, no click-based completion, persisted Client confirmation, separate agency verification, preserved completed history, issued-session contact unlink and destination exclusion. No page errors. The external upload page is an intercepted synthetic fixture; no actual external upload is claimed. Live Bloomlab reference, final 320px portal and 390px dialog captures inspected.
- Corrections during validation: harness navigation initially accepted `/clients/new` as a saved Client URL; it now waits for the actual record. New portal DTO/revision fields were added to legacy acceptance fixtures. A stale open editor now retains its original revision. The new-tab accessible hint uses the existing `sr-only` class after a 320px overflow finding; repeated per-row helper text was consolidated. Dialog captures disable transitions and use the viewport so the final image reflects the settled modal.
- Evidence: `/tmp/bloomops-pilot-onboarding/` guidance/affected/full-final/native/zero-local/build-final/browser-final logs and browser captures. Runtime work is isolated on `feat/pilot-onboarding-guidance` in `/home/ary/Developer/bloomops-d4-execution`; original dirty checkout/branch and unrelated instruction/schema work remain preserved. Owned D7 closure/pilot docs are included in this branch. No staging/production mutation or real mail occurred during local acceptance. One fresh Sol High review and publication/gates remain pending; no independent pass or deployed fix is claimed yet.

## Internal pilot — onboarding feedback and investigation (2026-09-12)

- Owner reports reaching the Client portal with their controlled email, seeing “Your onboarding/Your steps” (including Agreement and Brand assets), and receiving a successful save after “I’ve done this.” Portal access and the visible submission response pass by owner report. Exact item/status and refresh persistence were not independently observed; this is not proof of an executed agreement or uploaded assets. Earlier pending portal-access notes below are superseded.
- Owner reports no useful agreement instructions/destination or place to upload assets, and requests a less text-heavy interface with icons, explicitly no emojis. Treat this as pilot-blocking usability feedback before broader rollout.
- Source inspection: `onboarding-defaults.mjs` supplies generic instructions; `onboarding-definition.mjs` v1 has no action URL or upload type; `onboarding-views.mjs` includes instructions only for authorized visible items, and `Onboarding.jsx` renders them as plain text. A10 deliberately supported external-step acknowledgement without upload/link controls (historical A10 scope below and the portal-render regression). The user-visible gap is confirmed in implementation; absence of the current staging item's instruction text itself has not been reproduced.
- Existing `components/bloomops/Icons.jsx` provides SVG line icons. `PortalHome.jsx` and `Onboarding.jsx` repeat onboarding/steps headings and render every item in full. Proposed fix: actionable per-step guidance/destinations, an explicit missing-setup state, correctly scoped asset submission and clearer completion meaning, plus concise layout and meaningful line icons. Do not invent agreement/scheduling URLs, introduce e-signature integration or rewrite immutable templates/history. See the pilot contract for acceptance.
- Investigation/status only; no runtime, schema, migration, live-data, mail or deployment change. Diff checks passed. No new application test/browser run or independent audit claimed. Recommend Astra High before the complete fix because it crosses portal authorization, file handling and lifecycle/schema boundaries; the repository guide requires explicitly flagging the main-session change. One Sol High review applies once implementation and focused acceptance are ready. No model switch was performed by the assistant.

## Internal pilot — owner access confirmed (2026-09-12)

- Ary reports “yeah i reacched Home” after the staging sign-in instruction. Record owner-reported signed-in Home access as passed; no assistant browser session or separate mailbox-delivery trace was obtained. This does not establish Ellen's access, Client portal access, catalogue readiness or the remaining workflows.
- Ary reports available purchased-service options: Ads, Kajabi, GHL, Social Media and Content Calendar. This confirms owner-observed catalogue choices; it does not establish saved engagements, department eligibility or blueprint bindings. Ary subsequently reports “yeah still listed” in response to refreshing and checking the three Planned rows. Record owner-reported service persistence as passed; blueprint bindings and department eligibility remain unverified. Activation still waits for a controlled portal recipient; Ads and Content Calendar are outside this demo setup.
- Ary confirms a separate controlled mailbox is available; its address was not requested or recorded here. Next: Overview → Contacts → Edit the primary Demo Contact, replace `demo@example.test` with that address and save; activate the demo Client, then open its invitation in a separate browser session. The address must not already be an internal workspace member. Contact update, actual invitation delivery, onboarding creation and portal access remain pending user results.
- Status-only update in both existing checkouts; diff validation passed. No runtime/schema/migration change, independent review, commit or deployment. No model/effort change needed.

## Internal pilot preparation (2026-09-12)

- Added [the bounded pilot contract and walkthrough](phases/PILOT.md) for Client/onboarding, Social approval, separate GHL/Kajabi Projects and controlled portal handoff. Preparation is complete; real sign-in, current account/catalogue prerequisites and human acceptance remain pending. No invitation was sent or live binding changed.
- Fresh public GET checks: staging `844ac90`, health OK, auth configured with Resend, 21 migrations/schema OK, sign-in 200, anonymous home redirect, protected identity 401 and null session. These do not establish mailbox delivery or authenticated usability. The inherited version response labels main as `Production`; health confirms actual `staging`.
- Read-only remote D1 membership/catalogue/count inspection failed with Cloudflare code 7403 (account invalid or unauthorized). No rows were obtained and no database write ran. Current account/catalogue setup must be checked through signed-in UI or restored CLI access; no credential change attempted. Evidence: `/tmp/bloomops-pilot-readiness/public-probes.json` and `staging-readiness.json`.
- Repository production configuration retains its D1 placeholder and lacks an app origin; there is no production deployment workflow. This is a limited readiness inspection, not a completed production audit or a claim that every remote resource is absent. Provisioning, sender/origin and mailbox validation, plus restore/rollback acceptance need a separate launch task.
- Documentation/planning only: self-review and relative-link/route/diff validation; no new application tests/build or independent audit required by the selective policy. No runtime/schema/migration/configuration change, deployment, real mail, provider execution or production action. Files remain local on `docs/pilot-readiness`, alongside owned D7 post-gate closure notes; original unrelated checkout work is preserved.
- **Preparation handoff (superseded by the owner-access update above):** Ary was asked to sign into staging and report whether Home loaded. Continue with bounded fixes as walkthrough results arrive; do not mark the full human pilot passed from sign-in or automated evidence alone.

## Release D / D7 closure (2026-09-12)

- **D1–D7 and Release D are CLOSED.** [PR #51](https://github.com/Bloomwired/bloomops/pull/51) merged exact reviewed candidate `995e89f5c7410b631110c039946caa818e7bba95` as `844ac905541df9e6fccb7dc313ab0a8d517da319`; reviewed and merged trees are identical. No source or candidate documentation changed after the exact-head audit.
- [Deploy staging 34685865364](https://github.com/Bloomwired/bloomops/actions/runs/34685865364), job `103532631620`, and [Verify zero-to-current 34685865366](https://github.com/Bloomwired/bloomops/actions/runs/34685865366), job `103532631791`, passed every required step on that exact merge SHA. Live staging reports `844ac90`. Direct before/after comparison restores all eight original D1 IDs/names; the disposable database is absent.
- Final acceptance: 11 new hardening tests / 5,970 full-suite tests, 187 native D1/workerd/R2 checks, clean exact-candidate Cloudflare build, 104 integrated browser/HTTP checks and 41 full-page captures at five widths. The mixed GHL/Kajabi story covers explicit setup/selection, response-loss retry, canonical QA/rework/approval/launch/handoff, exact private/shared bytes, current portal and issued-session revocation. Full mobile mixed-platform capture inspected. No page errors. One fresh Sol High audit passed the exact clean candidate with no material findings; no re-review needed.
- Evidence: `/tmp/bloomops-d7-hardening/` final test/native/build/browser logs, captures, audit record, artifact metadata, complete run/job/step metadata, archived logs, live version and inventories. Native metric bounds remain recorded below. The local version endpoint intentionally reports `dev/local` without CI stamping; local candidate identity is established by the clean source SHA, successful fresh build and artifact SHA-256 `d05223bf4d44c84108a102ab62aa3bc9c5568f0c3ac2064c37be5cc65c64bc45`. Live staging independently matches its CI-stamped merge SHA. Remote verifier stdout truncates during verbose migration output; no full remote integrity/no-op log tail is claimed. Successful complete gate metadata and direct cleanup establish the gate.
- D4 added canonical Systems execution summaries. D5 completed and documented the operating path; D6 verified the current mixed-platform portal and operations projections; D7 hardened their boundaries. D5–D7 add no runtime/schema/configuration changes. No migrations, live service binding, provider execution, production action or real client communication was performed in these closing phases. [Running a Systems build](SYSTEMS_DELIVERY.md) documents explicit operation.
- Original checkout remains on `feat/d2-slice2a-binding-storage` at `74cc2efd2420c76053cab145de792eb54dd83a1c`; unrelated guide/configuration/schema work and prior branches remain preserved. AGENTS.md/CLAUDE.md are identical regular files. Owned preview Workers are stopped. Final post-gate closure notes are local updates in the original and isolated checkouts, preserving the exact audited/published candidate; the merged PR description records remote closure evidence.
- **No phase is active. Do not start Ads / Release E automatically.** The Release D contract requires new owner direction at this boundary. Performance remains closed and deferred. Next: owner chooses the next release or live Systems configuration; neither is silently inferred from synthetic acceptance.

## Historical D7 candidate acceptance (2026-09-12)

- Eleven new mixed-platform hardening tests pass: current file/parent/contact/membership authority after R2 awaits, unchanged provenance/replay, concurrent cross-platform request collision with one workspace winner and safe fresh-key recovery, plus hidden prerequisite multiplicity without count leakage. Full suite: 5,970 pass, no failures/skips. An initial concurrency assertion incorrectly assumed per-Project request IDs; D2's existing workspace-wide uniqueness contract was confirmed and the test corrected. No runtime defect was found.
- Disposable native checks: 26 GHL generation + 26 Kajabi generation + 26 setup + 27 Systems + 40 Home/Work + 42 workerd D1/R2 Files = 187 checks, all pass. Both recursive-trigger modes and all committed migrations are exercised. Generation retains 18 queries / eight batch statements / 49 bindings / 4,017 SQL bytes. Systems retains five statements in one batch over 240 assignments, max 75 bindings / 15,991 SQL bytes; Home/Work ten queries in one batch, max 64 bindings / 13,054 SQL bytes. Actual R2 checks include exact 5 MiB files and late recovery races.
- No runtime/schema/configuration/dependency or migration change. The browser harness adds optional full-page captures. Final syntax/diff checks pass. Evidence: `/tmp/bloomops-d7-hardening/{focused-final,full-final,native-*}.log`.
- This candidate is committed before its final Cloudflare build, stable mixed-platform browser run and one fresh Sol High exact-head audit. Those checks and both exact-merge-SHA workflows/live identity/cleanup remain pending here; closure evidence is recorded in the existing status after they finish. D7 and Release D are not yet closed. No Release E or live provider work is authorized by this phase.

## D6 Client Experience + Operations closure (2026-09-12)

- [PR #50](https://github.com/Bloomwired/bloomops/pull/50) merged reviewed `a64cb6e0630edaf4a3725f8990b09edbc5ba3ab3` as `ccc6e68088cf095f5e0ad9b31603f4ddeca6dd9d`; trees match exactly.
- [Deploy staging 34685107888](https://github.com/Bloomwired/bloomops/actions/runs/34685107888), job `103530634770`, and [Verify zero-to-current 34685107891](https://github.com/Bloomwired/bloomops/actions/runs/34685107891), job `103530634614`, passed every required step on that SHA. Staging reports `ccc6e68`; all eight original D1 IDs/names are restored and the disposable database is absent.
- 11 focused / 5,959 full tests and 104 browser checks / 41 captures passed. One fresh Sol High audit found no material findings. No runtime/schema/configuration change. Evidence: `/tmp/bloomops-d6-portal/` metadata, archived logs, identity and inventories. Verbose verifier stdout truncates; no full remote integrity/no-op log tail is claimed.
- **D6 is CLOSED.** Next is D7 hardening, with no new product features. Original checkout/branches and unrelated work remain preserved.

## Historical D6 local acceptance (2026-09-12)

- Added 11 integration tests using actual generated GHL/Kajabi work for one multi-service Client. Exact portal DTOs and canonical sections, private QA/provenance, hidden-child invariance, current File/Deliverable/Project/contact/member visibility and Team Project/Service/Client revocation pass. Full suite: 5,959 tests, no failures/skips.
- Stable local Worker acceptance passes 104 browser/HTTP checks with 41 captures at five widths. It includes selected work, review/rework/launch/handoff, exact bytes, mixed portal output, current File visibility, issued Team Service/Client positive scope and revocation across Home, Work Actions/Projects and Systems, plus Client contact unlinking. No page errors. Mixed portal desktop capture inspected; D5's mobile handoff acceptance remains intact.
- The only browser correction used the canonical `/work?tab=projects` for Project names; `/work` intentionally defaults to Actions. The final run also checks both tabs after revocation. No runtime/schema/build input/configuration or migration change. The verified D4 artifact was reused. Final syntax/diff checks pass.
- One fresh Sol High read-only audit completed with no material findings after inspecting the corrected harness and final evidence. Evidence: `/tmp/bloomops-d6-portal/{focused,full,browser-final}.log` and captures. Synthetic local D1/R2/captured mail only; unrelated checkout work and prior branches preserved.
- D6 remains open pending publication and both exact-merge-SHA workflows, live identity and disposable cleanup. Next: D7 Release D Hardening; no new product features.

## D5 Launch + Handoff closure (2026-09-12)

- [PR #49](https://github.com/Bloomwired/bloomops/pull/49) merged reviewed `fc666a826834d879910c0c42a9289265f2ee5d4f` as `a8b483aaf31ae26526dcda0f4068667c5c8bf465`; trees match exactly.
- [Deploy staging 34684310958](https://github.com/Bloomwired/bloomops/actions/runs/34684310958), job `103528492391`, and [Verify zero-to-current 34684310988](https://github.com/Bloomwired/bloomops/actions/runs/34684310988), job `103528492539`, passed every required step on that SHA. Staging reports `a8b483a`; all eight original D1 IDs/names are restored and the disposable database is absent.
- Eight focused / 5,948 full tests and 149 browser checks / 72 captures passed. One fresh Sol High review found no material findings. No runtime/schema/configuration changes. Complete metadata, archived logs, identity and inventories are in `/tmp/bloomops-d5-handoff/`; verbose verifier stdout truncates, so no full remote integrity/no-op log tail is claimed.
- **D5 is CLOSED.** D6 verifies the mixed-platform Client portal and internal operations projections under current visibility and scope. Original checkout and unrelated work remain preserved.

## Historical D5 local acceptance (2026-09-12)

- The existing canonical work, Deliverable approval/delivery and private File attachment controls support the Launch + Handoff path. Added [the operating guide](SYSTEMS_DELIVERY.md) and eight integration tests across GHL/Kajabi for review/rework, explicit approval/delivery, dependency sequence, independent parent lifecycles, exact generation replay with a later added handoff output/file, byte identity and current authority/visibility/contact denial.
- All eight focused and 5,948 full tests pass. Final stable Worker acceptance passes 77 Kajabi + 72 GHL browser checks (149 total), with 36 captures each (72 total), at 1440/1024/768/390/320px. Actual approval/rework/launch/handoff/status and file controls, exact internal/Client download bytes, explicit sharing, retry preservation and Client exclusion pass with no page errors. Mobile upload and portal handoff screenshots inspected.
- No runtime/schema/configuration or migration change. Browser acceptance reuses the verified D4 built artifact because all build/runtime inputs remain unchanged. Final syntax/diff and current guide/phase links pass. Harness-only corrections handled the optional field label, actual portal Home sections and B5's compact desktop/44px mobile button contract. One superseded run was intentionally stopped; only final `browser-{kajabi,ghl}-pass.log` counts are accepted.
- One fresh Sol High read-only review found no material findings; no re-review required. Evidence: `/tmp/bloomops-d5-handoff/{focused-final,full-final,browser-kajabi-pass,browser-ghl-pass}.log` and captures. All fixtures/mail are synthetic local D1/R2. Original checkout/branches and unrelated work are preserved.
- D5 remains open pending publication and both exact-merge-SHA gates, staging identity and cleanup. Next: D6 Systems Client Experience + Operations.

## D4 execution closure (2026-09-12)

- [PR #48](https://github.com/Bloomwired/bloomops/pull/48) merged reviewed `209aab392e81884833b6e92baee053f6bbddd9dc` as `cae247fa823e7a54ffb6632a0e517ce650483e9f`; trees match exactly.
- [Deploy staging 34683257899](https://github.com/Bloomwired/bloomops/actions/runs/34683257899), job `103525645146`, and [Verify zero-to-current 34683257919](https://github.com/Bloomwired/bloomops/actions/runs/34683257919), job `103525645256`, passed every required step on that SHA. Staging reports `cae247f`; all eight original D1 IDs/names are restored and the disposable database is absent.
- Acceptance: 158 affected / 5,940 full tests, 27 native D1 checks, Cloudflare build, 73 browser checks / 27 captures; one fresh Sol High review found no material findings. No post-review runtime change or migration. Complete run/job metadata, logs, identity and inventories are in `/tmp/bloomops-d4-execution/`. Verbose verifier stdout truncates during migrations; no full integrity/no-op log tail is claimed.
- **D4 is CLOSED.** Next: D5 Launch + Handoff using canonical approval/delivery and Files. Original branches and unrelated guide/configuration work remain preserved.

## Historical D4 execution local acceptance (2026-09-12)

- Systems opts into canonical current-phase and action-progress fields on the existing Work summary query. In-progress/waiting/upcoming readable milestones determine the phase; closed Projects suggest none. Action totals distinguish done/cancelled/open work, and dependency-blocked counts include only readable open actions. Hidden prerequisite identity/counts remain private. Existing Work links support QA and Deliverable Internal Review without an extra lifecycle or approval claim.
- Default Home/Work DTOs and UI, Systems filters/attention/timezone behavior and native batching remain intact. No schema/migration, provider execution, dependency or workflow changes.
- Verification: 18 new execution tests; 158 affected and 5,940 full tests pass. Native D1 passes 27 checks over 240 assignments, retaining five metadata statements in one batch; maximum 75 bindings / 15,991 SQL bytes. Cloudflare build, syntax and diff checks pass. Initial test-only corrections loaded JSX dynamically and supplied the completed Project timestamp; the inherited native harness’s 18-migration assertion now correctly pins the current 21-migration baseline.
- The stable built Worker passes 73 browser/HTTP checks with 27 screenshots at 1440/1024/768/390/320px, including actual milestone/action/Deliverable Internal Review controls, current Systems rows, usable links/keyboard/reduced motion, restricted QA exclusion, Team Project assignment/revocation and Client exclusion. Desktop execution and mobile QA screenshots inspected. No page errors. All fixtures/mail are isolated synthetic local D1/R2 data.
- One fresh Sol High read-only review found no material findings; no re-review or post-review runtime change. Evidence: `/tmp/bloomops-d4-execution/{affected-final,full,native-fixed,build,browser}.log` and browser captures. Original checkout and unrelated guide/configuration work remain preserved.
- D4 remains open pending publication, both exact-merge-SHA workflows and staging identity/cleanup. Next after D4: D5 Launch + Handoff; reuse canonical approval/delivery and Files before considering any additional metadata.

## D3 Kajabi closure (2026-09-12)

- [PR #47](https://github.com/Bloomwired/bloomops/pull/47) merged reviewed `e52baac0a5bf25a68cdd03d06f99c42b27d63224` as `689727c17547bfcc10e7b0741a8bb1e4d20b8856`; trees match exactly. No migration or live binding was performed.
- [Deploy staging 34682202017](https://github.com/Bloomwired/bloomops/actions/runs/34682202017), job `103522776535`, and [Verify zero-to-current 34682202046](https://github.com/Bloomwired/bloomops/actions/runs/34682202046), job `103522776768`, passed every required step on that exact SHA. Live staging reports `689727c`; all eight original D1 IDs/names are restored and the disposable database is absent.
- Evidence: `/tmp/bloomops-d3-kajabi/` complete run/job metadata, archived logs, staging identity and before/after inventories. The verifier stdout archive truncates during verbose migration output; the full remote integrity/no-op tail is not claimed. Successful gate metadata plus direct inventory restoration establish verification.
- Local acceptance remains 293 affected / 5,922 full tests, 78 native D1 checks, final Cloudflare build and 143 browser/HTTP checks with 58 captures. One fresh Sol High review found no material findings; no re-review or post-review code change. Original branches and unrelated instruction/configuration work remain preserved.
- **D3 is CLOSED.** Both GHL and Kajabi support explicit setup and conditional canonical work with shared provenance/retry rules. No provider execution, real mail or production action. Next: [D4.md](phases/D4.md), Systems Execution + QA.

## Historical D3 Kajabi local acceptance (2026-09-12)

- Canonical Kajabi v1 has 10 selectable components, 9 Milestones, 10 Actions, 4 Deliverables and 12 dependency edges when all are chosen. It shares the existing compiler, relational writer, immutable receipts, setup guards and HTTP/retry path. The exact GHL definition bytes/hash and saved request key/shape remain unchanged.
- Explicit GHL/Kajabi Settings pages reuse one form and protected handler. Each preserves the other's binding; no name-based platform inference or automatic live configuration. Project labels use the verified definition key. No schema/migration, provider execution, credentials, dependency or workflow changes.
- Verification: 293 affected tests and 5,922 full-suite tests pass with no failures/skips; 26 Kajabi + 26 GHL native generation checks and 26 native setup checks pass. The maximum measured generation remains 18 queries / eight batch statements / 49 bindings / 4,017 SQL bytes. Final Cloudflare/OpenNext build, syntax and diff checks pass.
- Stable built Worker acceptance: Kajabi 53 checks / 21 screenshots, GHL setup 48 / 21, GHL generation/recovery 42 / 16, totaling **143 checks and 58 captures** at 1440/1024/768/390/320px. These include explicit choices, keyboard/reduced motion, selected work, committed-response loss and exact retry after reload, no storage/no submission, disable/replay, stale recovery, capability revocation, Team/Client denial and both platforms coexisting without mixed work. No page errors. The browser harness initially measured unrelated compact Project buttons behind the dialog; scoping to the active dialog fixed the harness without a runtime change. Local sign-in rate limits were respected with bounded waits. Visuals inspected include the 320px Kajabi selection and confirmation dialogs.
- One fresh Sol High read-only review found no material correctness, authorization, isolation, platform, provenance/retry or GHL regression findings. No re-review was needed. Evidence: `/tmp/bloomops-d3-kajabi/` (`affected.log`, `full.log`, native logs, `build-final.log`, final Kajabi/GHL setup and GHL retry browser logs/captures). All fixtures/mail are isolated local synthetic D1/R2 data; original checkout and unrelated work remain preserved.
- Publication and both exact-merge-SHA workflows are pending. D3 remains open until those gates and staging identity/cleanup pass. Next after D3: D4 Systems Execution + QA; performance stays closed.

## D2 closure — explicit setup and integrated acceptance (2026-09-12)

- [PR #46](https://github.com/Bloomwired/bloomops/pull/46) merged reviewed `469d98748494a1ed7529d9ac3d39e78dcaeecf5a` as `642009c713daa2ecfb985203aa3f4d5240f4ddcc`; reviewed/merge trees match exactly. No migration or live catalogue binding was performed.
- [Deploy staging 34681135771](https://github.com/Bloomwired/bloomops/actions/runs/34681135771), job `103519865690`, and [Verify zero-to-current 34681135753](https://github.com/Bloomwired/bloomops/actions/runs/34681135753), job `103519865636`, passed with all required steps on that merge SHA. Live staging reports `642009c`; all eight original D1 database IDs/names are restored and the disposable verifier database is absent.
- Post-fix acceptance: 149 affected / 5,886 full-suite tests, 26 native D1 checks, Cloudflare build and 38 browser/HTTP checks with 11 captures at five widths. The integrated explicit setup → selected Project work → disable/exact replay → current permission/Client portal story passes. One fresh Sol High review and its single focused re-review resolved the canonical-default race. No code changed after review.
- Run/job metadata, archived logs, staging identity and inventories: `/tmp/bloomops-d2-setup/`. Verbose verifier stdout again truncates during migrations; complete successful run/job/step metadata and directly restored inventory establish the gate, without a claimed full remote integrity/no-op log tail.
- **D2 is CLOSED.** The reusable engine, immutable storage/lifecycle, explicit default setup, conditional generation and recoverable Project interface are merged and verified. No provider execution, real client communication or production action. D3 Kajabi is the first unfinished Release D task and proceeds under the owner's instruction to continue until actual input is needed.

## Historical D2 setup interface local acceptance (2026-09-12)

- The narrow Settings flow now lets current template managers explicitly select an active Systems Service Type, review, enable or disable GHL builds, and refresh after a stale/uncertain result. Existing non-GHL bindings are preserved. No default selection, live catalogue change, schema/migration, provider execution or general template editor.
- Enabling provisions/verifies the canonical default and requires that exact active, sole published v1 at the binding INSERT, UPDATE and unchanged-save boundary. Disabling requires only the existing GHL identity and does not provision or repair history. One fresh Sol High review found a validation-to-write race; it was fixed with this final predicate and nine migrated-SQLite interleavings. The same reviewer's one focused re-review passed with no remaining material findings.
- Post-fix verification: 36 setup interface tests, 149 affected tests, 5,886 full-suite tests, 26 native D1 setup checks, Cloudflare/OpenNext build, syntax and diff checks pass. The restarted complete artifact passes 38 browser/HTTP checks and 11 screenshots at 1440/1024/768/390/320px, including keyboard/reduced motion, explicit setup, selected Project generation, disable/replay, granted Team versus Project authority, capability revocation, stale-save recovery and actual Client portal exclusion. Logs: `/tmp/bloomops-d2-setup/{affected-fixed,full-fixed,native-fixed,build-fixed,browser-fixed}.log`.
- Locked dependencies were installed locally; package/lock remain unchanged. Synthetic local D1/R2 fixtures and captured local mail only. Shell coverage includes the new protected page and correct route count. Original checkout and unrelated work remain preserved.
- Publication and both exact-merge-SHA workflows remain pending. After successful gates, integrated setup → selected canonical work → disable/replay/portal checks complete D2; D3 Kajabi is next under Release D.

## D2 generation interface closure (2026-09-12)

- [PR #45](https://github.com/Bloomwired/bloomops/pull/45) merged reviewed `e221aecd295ba41b3e720704100c434109523629` as `c5d6b2edd4cd843f3e96c054e495f00bfbecbfb5`; merge and reviewed trees match exactly. No migration or live binding was performed.
- [Deploy staging 34679662184](https://github.com/Bloomwired/bloomops/actions/runs/34679662184), job `103515797952`, and [Verify zero-to-current 34679662243](https://github.com/Bloomwired/bloomops/actions/runs/34679662243), job `103515798082`, passed on the exact merge SHA, with every required step successful. Live staging reports `c5d6b2e`; all eight original database IDs/names are restored and the disposable database is absent.
- Evidence: `/tmp/bloomops-d2-interface/` run/job metadata, archived CI logs, staging identity and inventories. The first inventory read from the new worktree received a Cloudflare authentication error; the established CLI checkout successfully supplied both before/after read-only inventories. As in prior runs, archived verifier stdout truncates during verbose migration output; complete run/job/step metadata and direct cleanup establish the gate, without claiming a full remote integrity/no-op log tail.
- Local acceptance remains 95 affected / 5,850 full-suite tests, 42 actual local Worker browser/HTTP checks with 16 screenshots, and the accepted Cloudflare build. One fresh Sol High review found no material issues. No runtime change followed review; final syntax, diff and current-phase links passed. Original checkout/branches and unrelated guide/configuration work remain preserved.
- Next: explicit GHL setup under [D2_SETUP_INTERFACE.md](phases/D2_SETUP_INTERFACE.md), then integrated D2 acceptance. The UI now supports existing explicit bindings; staging's GHL and Kajabi Service Types remain unbound.

## Historical D2 interface local acceptance (2026-09-11)

- Protected Project blueprint options, preview and generation endpoints reuse current Project management authority and the reviewed domain writer. The Project flow provides explicit selection, server preview, confirmation and bounded tab-local recovery of the same request after a lost response/reload. No automatic submission or live binding, schema/migration, provider execution or general template editor.
- Verification: 14 new HTTP tests, 95 affected tests and 5,850 full-suite tests pass; current Cloudflare/OpenNext build passes. The stable built local Worker passes 42 browser/HTTP checks with 16 screenshots at 1440/1024/768/390/320px, covering controls, keyboard/dialog, reduced motion, all-component generation, exact lost-response/reload retry, stale preview recovery, storage refusal, Team denial and actual Client portal/API exclusion. No page errors. Live design reference inspected successfully. Logs and screenshots: `/tmp/bloomops-d2-interface/`.
- Local environment correction: a shared `node_modules` symlink produced a built artifact with unsupported dynamic requires. Installing the unchanged lockfile into this worktree and rebuilding resolved local packaging. No dependency/configuration changes. Browser work corrected 16px label sizing and isolated native checkbox appearance; the harness now waits for animations and uses the existing assignment API's HTTP 200. Final browser checks ran on a restarted complete artifact, after an earlier rebuild interrupted Client navigation. No real mail was sent; fixtures and captured mail remain in isolated local D1/R2.
- One fresh Sol High read-only review found no material correctness, authorization, isolation, retry, privacy or regression findings; no re-review was needed. Publication and both exact-merge-SHA gates are pending. Work is on `feat/d2-generation-interface` from verified `8df6d318ae1889691fe73a7fd19e155c4f6f5d69`; original branches and unrelated guide/configuration work remain preserved. Next: publish and verify the reviewed interface, then address explicit GHL setup/binding and remaining integrated D2 acceptance.

## D2 generation backend closure (2026-09-11)

- [PR #44](https://github.com/Bloomwired/bloomops/pull/44) merged reviewed `1a9141bde53221372e39705fa95a5b4bdf37c4df` as `8df6d318ae1889691fe73a7fd19e155c4f6f5d69`; reviewed and merge trees match exactly. No migration or live binding was performed.
- [Deploy staging 34678235589](https://github.com/Bloomwired/bloomops/actions/runs/34678235589), job `103511861579`, and [Verify zero-to-current 34678235591](https://github.com/Bloomwired/bloomops/actions/runs/34678235591), job `103511861598`, passed on the exact merge SHA. Every required step succeeded. Live staging reports `8df6d31`; all eight original D1 IDs/names are restored and the disposable database is absent.
- Complete run/job metadata, archived CI logs, staging identity and inventories are under `/tmp/bloomops-d2-generation/`. As in earlier runs, verbose verifier stdout is truncated in the archive; no complete remote integrity/no-op log tail is claimed. Successful step metadata and direct inventory verification establish the gate.
- Local acceptance remains 818 affected / 5,836 full tests, 26 native D1 checks and Cloudflare build; one fresh Sol High review found no material findings. No implementation changed during publication; final syntax and commit diff checks passed. Original branches and unrelated guide/configuration work remain preserved.
- Next: [D2_INTERFACE.md](phases/D2_INTERFACE.md). Read-only catalogue inspection found separate active Systems GHL and Kajabi types, neither bound; no catalogue change has been made.

## Historical D2 generation backend local acceptance (2026-09-11)

- Shared options/preview eligibility and receipt-gated atomic generation are implemented for existing empty planned Systems Projects. The writer proves complete immutable provenance, one matching internal event and the Project revision advance before reporting success; retries preserve later live work edits/deletions. No schema/migration, HTTP/UI, automatic binding or provider execution is included.
- Verification: 56 new generation tests, 818 affected tests, 5,836 full-suite tests, 26 native D1 checks across both recursive-trigger modes, and Cloudflare/OpenNext build pass. The largest measured operation uses 18 queries, including one eight-statement batch; maximum statement size is 4,017 bytes with 49 bound parameters. Logs: `/tmp/bloomops-d2-generation/{affected.log,full.log,native.log,build.log}`.
- One fresh Sol High read-only reviewer found no material correctness, authorization, isolation, atomicity, replay or regression findings. Independent syntax and patch checks passed; no re-review was required.
- Work is isolated on `feat/d2-generation-backend` from verified `854863af8b8997781c3358aa0de245df2a8f007d`. Original branches and unrelated guide/configuration changes remain preserved. Publication and both exact-merge-SHA gates are pending; this backend and D2 are not yet closed. Next: publish, merge and verify staging under the owner's standing authorization, then continue HTTP/UI integration.

## D2 Slice 2D closure (2026-09-11)

- [PR #43](https://github.com/Bloomwired/bloomops/pull/43) merged reviewed commit `4e6db709f024dff69a27c4e345d78a7a59807d30` as `854863af8b8997781c3358aa0de245df2a8f007d`; merge and reviewed trees match exactly. No schema/migration or live catalogue setup was performed.
- [Deploy staging 34677070113](https://github.com/Bloomwired/bloomops/actions/runs/34677070113), job `103508703839`, and [Verify zero-to-current 34677070203](https://github.com/Bloomwired/bloomops/actions/runs/34677070203), job `103508703997`, both passed on that exact merge SHA, with every required job step successful. Staging `/api/version` serves `854863a`. The disposable database is absent and the original eight database IDs/names are restored.
- The remote verifier step's archived stdout again truncates during verbose migration output. Successful complete run/job/step metadata and direct inventory restoration establish the gate; a full remote no-op/integrity log tail is not claimed. Evidence is under `/tmp/bloomops-d2-2d/`: run JSON, CI logs, live version and before/after inventory files.
- Local acceptance remains 644 affected / 5,780 full-suite tests, 26 native D1 checks, passing Cloudflare build and syntax/diff checks. One fresh Sol High read-only review found no material findings. Packaging changed no reviewed implementation, so no new review or broad test rerun was needed.
- Original branches and unrelated instruction/configuration work remain preserved. Closure notes are local and will accompany the next scoped handoff. Next: the connected preparation/committed-generation backend contract, [D2_GENERATION.md](phases/D2_GENERATION.md). D2 and later UI acceptance remain unfinished.

## Historical D2 Slice 2D local implementation (2026-09-11)

- **Scope:** `systems-blueprint-setup.mjs` provides authorized GHL v1 default provisioning and explicit Service Type binding reads/writes. Live `templates.manage` capability, role/identity/workspace and canonical Systems Service Type/Department eligibility are checked at read/commit time. Default setup is atomic and exact-replay only, with no repair of existing inactive/customized/draft/retired history. Bindings use explicit expected ID/revision, preserve no-ops, and prevent stale or overflow writes. No schema/migration, route, UI, automatic bootstrap or live catalogue write is included.
- **Verification:** 644 affected tests (43 setup), 5,780 full-suite tests, 26 native D1 checks, Cloudflare/OpenNext build, syntax and diff checks pass. Native statements remain under 100 KB and use at most 21 bindings. Initial native fixture lacked a Department relationship; correcting the fixture made explicit Systems eligibility pass without relaxing the implementation. No schema change means no extra local zero replay. One fresh Sol High read-only review found no material findings. Logs: `/tmp/bloomops-d2-2d/{affected.log,full.log,native.log,build.log}`.
- **Scope/authorization:** work is isolated on `feat/d2-slice2d-blueprint-setup` in `/home/ary/Developer/bloomops-d2-slice2d`, based on `ea18733e98ddff4e29ea1dff41800d3e294e59dd`. The owner requested autonomous continuation through the established workflow until real input is needed. Original branch and unrelated guide/configuration work remain preserved. No 2D commit or deployment has occurred.
- **Next:** publish/merge the reviewed candidate and verify both exact-SHA workflows. Continue to Project preparation after these gates. Do not mark 2D or D2 closed from local evidence alone.

## D2 Slice 2C closure (2026-09-11)

- **Approved publication:** the owner approved committing, pushing and merging Slice 2C, including automatic staging migration/deployment and disposable remote D1 verification, and requested no repeated approval prompts within that scope. [PR #42](https://github.com/Bloomwired/bloomops/pull/42) merged `1256fb7913fe350c15974220d8eab155bd190654` as `ea18733e98ddff4e29ea1dff41800d3e294e59dd`; direct tree comparison confirms exact equality. The 12-path change contains migration `0020`, its generated snapshot/journal, schema commentary, tests/harness and existing phase/status documents. Unrelated guide/configuration work is excluded.
- **Exact-SHA gates:** [Deploy staging 34676088171](https://github.com/Bloomwired/bloomops/actions/runs/34676088171), job `103506097208`, and [Verify zero-to-current migration 34676088116](https://github.com/Bloomwired/bloomops/actions/runs/34676088116), job `103506097242`, both completed **success** on the merge SHA above. All staging migration/build/deploy/secrets/bootstrap/live-verification steps and the disposable create/migrate/twice/verify/delete step succeeded.
- **Direct verification:** the staging `/api/version` endpoint serves `ea18733`, built `2026-09-12T05:39:10.247Z`. Read-only metadata confirms the `0020_d2_slice2c_version_guards.sql` ledger entry and all five expected trigger names. Post-workflow read-only inventory matches all eight pre-merge database IDs/names, with the disposable verifier database absent. No production deployment or mutation was performed.
- **Evidence limitation:** both the CLI and raw GitHub job logs truncate the disposable verifier step's stdout during the verbose migration listing. Successful complete run/job/step metadata plus direct cleanup verification establish the remote gate; no complete remote no-op/integrity log tail or separately observed 30-check count is claimed. The final local replay retains complete 22-check fresh/no-op evidence. Evidence is saved under `/tmp/bloomops-d2-2c/`: `staging-run.json`, `zero-run.json`, `staging-ci.log`, `zero-ci.log`, `zero-job-raw.log`, `staging-version.json`, `staging-guards.json`, and before/after inventory files.
- **Review and preservation:** the previously reviewed implementation is unchanged, so no second broad test run or new reviewer was used for packaging/deployment. Local evidence remains 5,737 full-suite tests, 273 focused/compatibility tests, 74 native D1 checks and 22 fresh/no-op checks, with the completed Sol High review/focused re-review finding no remaining material defects. Existing status/index/phase closure notes are updated locally in both checkouts; no extra main push is made solely for bookkeeping. Original branch and unrelated work remain preserved.
- **Next:** scope the remaining D2 writer contract for authorized blueprint management/provisioning and committed generation under [RELEASE_D.md](RELEASE_D.md). This closure adds no API/UI or generation writer. D2 as a whole remains unfinished; performance remains closed.

## Historical D2 Slice 2C local implementation (2026-09-11)

- **Scope:** custom migration `0020_d2_slice2c_version_guards.sql` adds five triggers; all 44 domain table definitions, existing indexes and previous snapshots remain unchanged. The journal now contains 21 domain migrations. Systems versions start as identified drafts, follow draft → published → retired, retain publication timestamps and immutable snapshot/identity/attribution fields, and reject implicit replacement through every existing unique key and physical rowid. Parent kind/identity and missing historical generation-source identity are guarded. Unused unreferenced drafts may be explicitly deleted; published/retired/referenced history remains retained. Onboarding behavior and permitted parent metadata edits remain unchanged.
- **Corrections:** final inspection reproduced SQLite `UPDATE OR REPLACE ... status=NULL` substituting the default draft status after a trigger's nullable condition. Explicit NULL rejection now prevents that history-retention bypass. Independent review also reproduced empty/NUL creator IDs passing the existing membership FK; a supplied creator ID now requires nonempty NUL-free text, while null attribution remains supported. Both have focused and native D1 regressions.
- **Local evidence:** final focused Systems/compatibility tests pass 273/273 (251 Systems and 22 migration compatibility checks); the full Node suite passes 5,737/5,737 with zero failures/skips. Native disposable workerd/D1 smoke passes 74/74 in both recursive-trigger modes, including competing publications, publish/delete competition and late atomic-batch rollback. Prior Slice 2B native smoke passed 80/80. Earlier tests against the migration omitted reproduced 135 failures, confirming the new guard coverage. Syntax and patch hygiene checks pass. One fresh Sol High read-only review and its one permitted focused re-review found no remaining material defects after the creator-ID correction. The final local zero-to-current verifier passed all 22 checks with exit 0: 60 inherited and 21 domain migrations, 44 domain / 80 total tables, 109 explicit domain indexes, all migration-defined triggers, clean integrity/FKs, and identical schema plus both ledgers after a no-op second pass. Its disposable local directory was removed.
- **Limits and preservation:** a read-only staging preflight found zero existing Systems Template Versions. No backfill, data rewrite, new column/index/table, dependency, runtime writer/API/UI, authorization grant or compiler-validity claim is included. No application build or browser check is claimed for this SQL-only storage slice. Original checkout/branch and unrelated instruction/configuration work remain preserved; only status/index/current-contract notes are synchronized there. Implementation lives in the isolated worktree above. Evidence is local under `/tmp/bloomops-d2-2c/` (`focused-before.log`, `focused.log`, `native-final.log`, `prior-native.log`, `full-final.log`, `zero-local-final.log`).
- **Owner authorization (2026-09-11):** the owner approved committing, pushing and merging this reviewed slice, including automatic staging migration/deployment and disposable remote D1 verification, and requested no repeated approval prompts within this scope.
- **Next gate:** publish the reviewed candidate and inspect both resulting workflows. Required exact-merge-SHA workflow results and staging evidence remain pending. Slice 2C is not closed; do not begin later writer work while these gates remain open.

## D2 Slice 2B correction closure (2026-09-11)

- [PR #41](https://github.com/Bloomwired/bloomops/pull/41) merged reviewed correction `eedda3f3d303ba19292142370e4aaa84ca8fa071` as `6697d40398645a40607175c74348353890e38535`; the merge tree exactly matches the reviewed correction. Its five paths are migration SQL, a compatibility regression test and existing status/index/phase documents. Original instruction/configuration work remains excluded and preserved.
- [Deploy staging 34673400835](https://github.com/Bloomwired/bloomops/actions/runs/34673400835) and [Verify zero-to-current migration 34673400821](https://github.com/Bloomwired/bloomops/actions/runs/34673400821) both completed **success** on that exact merge SHA. Job metadata confirms every staging migration/build/deploy/secrets/bootstrap/live-verification step and the fresh-database create/migrate/twice/verify/delete step succeeded.
- Public `/api/version` reports `6697d40`, built `2026-09-12T04:36:03.683Z`. Read-only staging metadata confirms the `0019_d2_slice2b_generation_provenance.sql` ledger entry and both provenance tables. A post-workflow read-only inventory confirms the disposable database is absent and all eight original database names remain.
- **Evidence limitation:** the successful zero workflow's archived stdout cuts off during the verbose migration listing, before final verification/cleanup messages. Closure uses its successful complete job/step metadata plus the direct post-workflow cleanup check; no complete CI log tail is claimed. The identical correction's earlier full remote verifier independently passed all 30 checks and retained complete no-op/integrity/FK/cleanup evidence in `/tmp/bloomops-d2-2b-fix/zero-remote.log`. CI logs and watcher evidence are in that same directory. No additional signed-in browser smoke is claimed for this SQL-only correction.
- Original branches, worktrees and unrelated guide/configuration notes remain preserved. The original checkout contains the corrected owned migration and regression test. Closure notes are updated locally in the existing status/index/phase files; no extra main push is made solely for this bookkeeping. Existing Slice 2B approval covered the bounded staging correction and disposable verification; no production action, new dependency or 2C behavior was included.
- **Next:** scope Slice 2C's Systems Template Version lifecycle/immutability protections under D2. Slice 2B is closed; D2 as a whole and the later committed-generation writer remain unfinished. Performance stays closed.

## Historical D2 Slice 2B remote migration correction (2026-09-11)

- **Root cause:** local Wrangler splits SQL into prepared statements, while remote migrations submit the SQL to D1's `/query` parser. Two top-level `CASE ... END` expressions inside the provenance insert trigger are interpreted incorrectly remotely, producing `incomplete input`. [Cloudflare issue #4727](https://github.com/cloudflare/workers-sdk/issues/4727) describes the same behavior. Our disposable remote reproduction independently confirmed the original failure and the correction.
- **Correction:** enclose those two existing CASE expressions in parentheses in `0019_d2_slice2b_generation_provenance.sql`; no predicate, table, index, FK, trigger count, schema model, snapshot, journal, dependency or workflow changes. Read-only staging metadata confirms migration `0019` is absent from its ledger and both provenance tables are absent. The disposable reproduction also confirms a failed original migration leaves the entire schema and ledger unchanged. Repair the pending migration itself so zero-to-current can succeed; no new migration can bypass the failing predecessor.
- **Regression protection:** `tests/d1-migration-compatibility.test.mjs` checks all 20 domain migrations for unparenthesized CASE expressions in trigger bodies, with positive/negative examples covering multiple CASEs, comments and quoted text. Against the original SQL it fails only migration `0019`; corrected 21/21 pass. This narrow syntax guard supplements actual remote replay and is not a general remote SQL parser or substitute for deployment verification.
- **Verification:** affected 981/981 tests pass with zero failures/skips, including 360 provenance tests and the 21 new compatibility checks. Native disposable workerd/D1 smoke passes 80/80 checks in both recursive-trigger modes. Remote reproduction applies the prior 19 domain migrations, reproduces the original failure with unchanged schema/ledger, applies corrected `0019`, verifies all 20 ledger entries and FKs, and confirms an exact no-op second pass. Guarded cleanup deletes only its disposable database, restores the exact account inventory and confirms unchanged staging identity. A fresh Sol High read-only review found no confirmed material issues and independently passed the 21 compatibility checks. The full inherited-plus-domain remote verifier then passed 30/30 checks with exit 0: 60 inherited + 20 domain migrations, 44 domain / 80 total tables, 109 explicit domain indexes, clean integrity/FKs, identical schema and both ledgers on the second pass, disposable deletion, exact account inventory restoration and unchanged staging identity. No application build or full application-suite rerun is needed for parentheses-only SQL and the regression guard; existing runtime build evidence remains unchanged.
- **Scope/preservation:** correction is isolated on `fix/d2-slice2b-remote-migration` in `/home/ary/Developer/bloomops-d2-slice2b-fix`, based on exact merged main `f1bb9853f529af08a10d54efcb9781fa93fe0eb5`. Original branches and unrelated instruction/configuration work remain preserved. Remote writes are confined to the guarded disposable verifier target; staging inspection is metadata-only. No correction commit/push, staging migration/deployment, production action or 2C implementation has occurred.
- **Evidence:** `/tmp/bloomops-d2-2b-fix/` contains `0019-before.sql`, `compatibility-before.log`, `compatibility.log`, `affected.log`, `native.log`, `remote-repro.mjs`, `remote-repro.log` and `zero-remote.log`. These are local evidence, not shipped artifacts. Next: publish the reviewed correction and pass both workflow gates on its resulting main SHA before closing Slice 2B.

## Bloomwired transfer and workflow reruns (2026-09-11)

- **Transfer complete:** explicitly approved transfer from `Beeyach/bloomops` to private [`Bloomwired/bloomops`](https://github.com/Bloomwired/bloomops). GitHub confirms admin access, Actions enabled with all actions allowed, and all 10 repository secret names present. PR #40 remains merged at `f1bb9853f529af08a10d54efcb9781fa93fe0eb5`. The shared origin for both existing worktrees now points to `git@github.com:Bloomwired/bloomops.git`; branches and uncommitted work are preserved.
- **Billing diagnosis:** Bloomwired's API plan field reports `enterprise`; this is not independent confirmation of its paid subscription/trial status. Organization-wide Actions policy inspection was denied because the CLI token lacks `admin:org`, but repository policy is readable and both reruns actually started. No billing settings or token scopes were changed.
- **Staging attempt 2:** [run 34672104559](https://github.com/Bloomwired/bloomops/actions/runs/34672104559), job `103496239757`, failed at domain migrations. Cloudflare returned `incomplete input: SQLITE_ERROR [code: 7500]` while applying `0019_d2_slice2b_generation_provenance.sql`. Earlier provisioning/base/inherited migration steps succeeded; build/deployment/bootstrap/live verification were skipped. The public version endpoint still reports `a4ceb81`. Do not assume the entire run made no remote changes, or infer rollback/partial schema state without inspection.
- **Fresh database attempt 2:** [run 34672104558](https://github.com/Bloomwired/bloomops/actions/runs/34672104558), job `103496242001`, also failed during first-pass domain migrations with `incomplete input: SQLITE_ERROR [code: 7500]`. Its finally cleanup successfully deleted the disposable database, restored the exact eight-database inventory and confirmed unchanged staging identity (78 tables before and after, informational only). No fresh-schema/no-op pass is claimed. Both reruns use the exact approved merge SHA above. Sanitized runner logs remain outside Git at `/tmp/bloomops-d2-2b/staging-attempt2-failed.log` and `/tmp/bloomops-d2-2b/zero-attempt2-failed.log`.
- **Next:** reproduce and repair the remote migration failure in a bounded follow-up, using Astra High under the working agreements and a scoped Sol High review of any correction. Existing local passing checks did not establish remote migration compatibility. Slice 2B stays open; 2C remains gated. Status reconciliation is local and uncommitted; no code, migration, workflow or credential edits accompany the transfer.

## Historical D2 Slice 2B merge and blocked verification (2026-09-11)

- **Authorization/merge:** the owner explicitly approved PR #40's merge, automatic staging migration/deployment and disposable D1 verification. PR #40 merged at `f1bb9853f529af08a10d54efcb9781fa93fe0eb5` after checking final head `d7b5fcf270bb0472a369c3372ebb8b7d89ff1e04`. The merged tree exactly matches that head, including migration `0019_d2_slice2b_generation_provenance.sql`.
- **Required gates blocked:** [Deploy staging 34672104559](https://github.com/Beeyach/bloomops/actions/runs/34672104559) and [Verify zero-to-current migration 34672104558](https://github.com/Beeyach/bloomops/actions/runs/34672104558) both failed on the exact merge SHA. Both jobs have no steps and no assigned runner. Check annotations `103495270129` and `103495269763` report: “The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings”. No migration, deployment or disposable-database operation ran in these workflows.
- **Observed staging:** read-only `/api/version` still returns SHA `a4ceb81`, built at `2026-09-11T22:18:31.742Z`. This is prior Slice 2A, not deployment evidence for Slice 2B.
- **Verification/review:** authenticated GitHub PR/run/job/check metadata, merge-tree equality and public version response establish the result. Earlier passing local tests/build/migration checks and the completed Sol High review remain evidence for unchanged implementation. The billing failure is infrastructure scheduling, not a failed application test; no additional reviewer or broad suite rerun is warranted.
- **Preservation:** original checkout/branch and pre-existing guide/configuration edits remain preserved. This reconciliation updates existing status/index/phase documents locally in both checkouts; no follow-up commit/push, manual deployment, billing setting change or production action is performed.
- **Next:** owner resolves GitHub Billing & plans, then rerun these two existing workflows on the exact merge SHA and inspect their complete results. Existing approval covers those reruns; another deployment approval is unnecessary. Do not close Slice 2B or start 2C while either required gate remains unverified.

## Historical D2 Slice 2B PR handoff (2026-09-11)

- [PR #40](https://github.com/Beeyach/bloomops/pull/40) is open against `main`, implementation commit `54d4372fca9f9c4f3739dd961647efa732b522bb`, plus a documentation-only handoff follow-up. The clean worktree is `/home/ary/Developer/bloomops-d2-slice2b`; the original checkout and pre-existing instruction/configuration edits remain preserved. No force push, merge, deployment or remote database action occurred.
- **Next:** owner-controlled PR merge/deployment approval and both exact-merge-SHA gates; then separately scope Slice 2C. GPT-6 Astra Medium is sufficient for this packaging handoff; use Astra High for the next database/architecture implementation under the project routing policy. No new review subagent or broad suite rerun was required for unchanged reviewed code and documentation-only packaging.
- Owner authorized the commit/push/PR handoff. A clean worktree on `feat/d2-slice2b-generation-provenance` starts at current canonical main `a4ceb813afa0aad028ac67457940b734dbeb9412`. Its base tree is byte-identical to implementation base `74cc2ef`, confirmed with Git tree IDs.
- The eight runtime/schema/migration/test files are byte-identical to the locally verified and independently reviewed candidate. Only handoff documentation changes during packaging; no additional implementation audit or broad rerun is needed under the usage-aware policy.
- Pre-existing instruction and Codex configuration work is excluded from this PR and preserved in the original checkout. The original checkout/branch is unchanged. Workflow inspection confirms a push to this feature branch does not trigger staging deployment or remote database verification; merging into main would trigger both and is not authorized here.
- Packaging verification: exact changed-path inventory, reviewed-file byte equality, prior-table snapshot preservation, documentation link checks and `git diff --check`. Recorded 360 focused / 960 affected / 5,464 full tests, 80 native D1 checks, 22 fresh/no-op checks, Cloudflare/Next build and Sol High review remain evidence for the identical implementation.

## Historical D2 Slice 2B implementation (2026-09-11)

- **Decision:** the owner explicitly approved preserving immutable generation history while allowing future otherwise-authorized deletion of live work. The prior retention question is resolved. Existing canonical deletion constraints remain in force; no delete API or new permanent no-delete FK to generated work is added.
- **Storage:** migration `0019_d2_slice2b_generation_provenance.sql` adds `systems_blueprint_generations` (21 columns) and `systems_blueprint_generation_items` (7 columns), five explicit unique indexes, three retained-parent FKs and 14 guards. All 42 prior table definitions are unchanged; 44 domain tables / 20 domain migrations. Source relationships and active attribution are validated on insert; historical IDs and snapshots survive subsequent changes/deletion. Original Project/item IDs remain reserved against reuse and replacement. This is storage integrity, not generation authority or a complete committed-generation proof.
- **Verified:** 360 focused, 960 affected and 5,464 full-suite tests pass with zero failures/skips. Disposable workerd/D1 passes 80 checks, including both recursive modes, history retention, denied scope, replacement protection, concurrent batches with one winner, late failure rollback and FK integrity. `npm run cf:build` passes including Next build and configured validation. Four changed/new JS modules and `git diff --check` pass. Full tests reuse the existing external `/tmp/bloomops-c6-tools/bin` Python wrapper; no repository environment/dependency change. The one fresh Sol High read-only review found no confirmed material issues in the final diff. Final fresh/no-op local verification passed 22/22 checks: 60 inherited + 20 domain migrations, 44 domain / 80 total tables, 109 explicit domain indexes, clean FK/integrity checks, an identical schema/ledgers second pass and disposable local cleanup. All counts refer to the corrected final files.
- **Scope/preservation:** implementation stays on `feat/d2-slice2a-binding-storage` at `74cc2ef` (merged PR #39 head); existing uncommitted guide/configuration/closure edits are preserved. No commit, push, branch switch, merge, deployment, remote migration, live-data change or real email. No writer, API/UI, provisioning, 2C Version lifecycle protection or later Systems feature. Performance stays closed. The first focused run had a fixture-only nonexistent Service column; it was corrected before passing checks, without removing or skipping assertions.
- **Correction:** final inspection reproduced NUL-suffixed request IDs/hashes passing SQLite length/GLOB checks. Explicit NUL checks and eight focused/four native regressions now cover that class, including exact matching source-Version hash/key cases. The reviewer independently confirmed the class and found no remaining material issue in the corrected diff. Final counts/build above include the fix.
- **Next:** leave PR #40 unmerged for owner-controlled merge/deployment approval. Slice 2C and the later exact committed-receipt generation writer remain separate bounded work. Full contract, commands, limitations and local log locations: [D2_SLICE2B.md](phases/D2_SLICE2B.md).

## D2 Slice 2A post-merge reconciliation (2026-09-11)

- The first unfinished recorded task was the Slice 2A PR/closure gate. GitHub now reports PR #39 merged, with head `74cc2efd2420c76053cab145de792eb54dd83a1c` and merge/current-main SHA `a4ceb813afa0aad028ac67457940b734dbeb9412`.
- [Deploy staging 34653350194](https://github.com/Beeyach/bloomops/actions/runs/34653350194) and [Verify zero-to-current migration 34653350149](https://github.com/Beeyach/bloomops/actions/runs/34653350149) are completed **success**, both automatic `push` runs on that exact merge SHA. Read-only job inspection confirms successful staging migration/build/deployment/bootstrap/live verification and disposable database migration/no-op verification/cleanup steps. No separate signed-in browser smoke or fresh local application test result is claimed.
- This session changes only status/index/phase documentation. The checkout remains `feat/d2-slice2a-binding-storage` at `74cc2ef`; pre-existing guide/configuration/status changes are preserved. No commit, push, merge, deployment, migration execution or remote mutation was performed by this session.
- Verification: current GitHub PR/main/run/job metadata, documentation link checks, unchanged regular entry-file equality, and `git diff --check`. Existing implementation tests/audit remain historical evidence. The usage-aware policy requires no new review subagent or broad application rerun for this documentation-only reconciliation.
- Next bounded task: separately authorize and scope D2 Slice 2B, resolving provenance retention when live records are deleted before implementation. No 2B contract or implementation is created by this continuation; performance stays closed.

## D2 Slice 2A binding storage (2026-09-11)

- Before editing, fetched refs confirmed exact main `77bbb6b3ea7dff0b873e6fa72c583027159942b1`. Its [Deploy staging 34617425161](https://github.com/Beeyach/bloomops/actions/runs/34617425161) and [Verify zero-to-current 34617425293](https://github.com/Beeyach/bloomops/actions/runs/34617425293) jobs succeeded; job logs identify the exact SHA. The connected GitHub integration supplied read-only verification because the local CLI sign-in was unavailable.
- Migration `0018_d2_slice2a_binding_storage.sql`: exactly `service_type_blueprint_bindings`, five restricted same-tenant FKs (including workspace), four explicit indexes, six CHECKs and four incoming/outgoing write guards. Generated snapshot leaves all 41 prior table definitions unchanged; there are now 42 domain tables and 19 ordered domain migrations.
- Binding identity/creator/creation time are immutable; revision starts at 1 and increments exactly once per executed UPDATE without safe-integer overflow. Stored configuration permits inactive/unpublished Systems Templates. Historical creator revocation neither invalidates configuration nor grants authority. Enabled and disabled bindings protect Template ID/workspace/kind/slug; name/description/active remain editable. Explicit binding deletion is permitted, with no tombstone or provisioning.
- Verification: **206 focused / 598 affected / 5,102 full-suite tests passed**, zero failures/skips; all 34 adversarial requirements covered with recursive triggers OFF and ON. The local zero-to-current verifier passed 22 checks and an identical-schema/ledgers second pass (60 inherited + 19 domain migrations). `npm run cf:build` passed, including Next build/lint/type validation; syntax and diff hygiene passed. The full suite reused only the external temporary Python 3 PATH wrapper, with no committed workaround. The documented conservative implicit-rowid collision edge and future writer authorization/receipt boundaries require independent review.
- No receipt or generated-item mapping, Project/service eligibility wiring, API, UI, default initialization, generation transaction, provider call, Systems Version protection or later-slice implementation. No configuration/dependency/workflow changes. No remote migration or deployment; performance remains closed. Next step is independent 2A audit, not 2B implementation.

## D2 Slice 1 audit follow-up (2026-09-11)

- Independent audit verdict on `c255ed62718d6a4e3a6efea6f4c8197d6d059c00`: **PASS WITH NONBLOCKING NOTES**. A separate cleanup commit addresses only the three notes: sanitize exotic reflection/shape failures; reject U+0085/U+2028/U+2029 in labels; commit deterministic oversized-definition/plan regression fixtures.
- Reflection catches are confined to shape inspection. Callers retain existing sanitized domain reasons, and unrelated encoding/compiler failures propagate. The supported interface remains plain JSON data, not executable objects or a JavaScript sandbox.
- Verification: **180 focused/reused-helper tests and 4,896 full-suite tests passed**, zero failures/skips; focused coverage includes all **16,383** nonempty selections. `npm run build`, changed-module syntax checks and `git diff --check` passed. Full tests reused the external PATH-only Python 3 wrapper required by inherited packaged-skill tests; no dependency or configuration changes.
- The compiler, default manifest and hand-authored golden plans are unchanged from the audited candidate. All-selected output remains **13 Milestones / 14 Actions / 8 Deliverables / 20 edges**; **49** remains the generic edge ceiling. No bounds, versions, keys or selection/dependency semantics changed.
- The follow-up prompt is read from its remote ref, not changed or included in the implementation branch. Prepare/push this branch and open its PR against `main`; **leave it unmerged**. Provenance/deletion remains a Slice 2 design gate, exact committed-receipt proof remains a Slice 4 gate, and no later slice is authorized.

## D2 Slice 1 implementation (2026-09-11)

- Strict definition/compiler version 1, immutable in-code GHL default, pure deterministic selection and plan compilation. No runtime IDs, dates, assignments, credentials, execution instructions or authority are accepted. No Project/service eligibility, including a magic Service Type slug, is encoded.
- The approved 14 components produce at most 13 Milestones, 14 Actions and 8 Deliverables; Email/SMS share one Milestone. The full default has 20 dependency edges. Empty dependency groups are removed after selection and adjacent surviving groups are connected, keeping build Actions parallel. Canonical initial values are Upcoming / To Do / Planned, internal visibility and normal Action priority.
- Hand-authored golden fixtures cover minimal, representative, all-component, reordered and Email/SMS plans plus malformed/duplicate/dangling/cyclic definitions. Exhaustive tests cover all 16,383 nonempty selections. Existing canonical JSON/SHA-256 helpers are reused unchanged.
- Verification: **170 focused/reused-helper tests passed; 4,886 full-suite tests passed**, no failures or skips. `npm run build` passed including Next's lint/type validation; new module/fixture syntax checks and diff hygiene passed. The host lacks `python`; the initial broad run hit inherited packaged-skill tests requiring it. The successful full rerun used a temporary external `python` → `/usr/bin/python3` wrapper, following prior phases, with no repository dependency or test changes. Commands: `node --test tests/bloomops-systems-blueprint-compiler.test.mjs tests/bloomops-onboarding-compiler.test.mjs tests/bloomops-onboarding-templates.test.mjs`; full `node --test tests/**/*.test.mjs` with that PATH-only wrapper.
- Scope: no schema/migrations, database writer, provisioning, generation transaction, API, UI, dependency/configuration changes, provider calls or D3–D7 implementation. No remote mutation or deployment. This slice is not a completed or authorized runtime generation engine.
- Required later design gates: trusted canonical Project/service-to-blueprint relationship (never display-name/magic-slug matching); provenance survival under future live-record deletion without accidental cascade/history loss or an unapproved permanent no-delete FK policy; exact authorized committed-receipt proof for success/replay, with receipt-gated writes and no zero-row success or integrity auto-repair. **Do not begin Slice 2 without separate authorization and the deletion/provenance design decision.**

## Post-merge performance closure (2026-09-11)

- [Deploy staging — 34607488524](https://github.com/Beeyach/bloomops/actions/runs/34607488524): automatic `push` run on `main`, exact SHA `cb2ef0bea2900a46583e86c75840e8ba6639d663`, completed **success**.
- [Verify zero-to-current migration — 34607488607](https://github.com/Beeyach/bloomops/actions/runs/34607488607): automatic `push` run on the same exact SHA, completed **success**, including the disposable create/migrate twice/verify/delete job. All job steps succeeded.
- Staging `/api/version`: HTTP 200, `sha: cb2ef0b`, `branch: main`, `builtAt: 2026-09-11T14:00:29.395Z`, confirmed publicly and in the existing signed-in Windows Chrome session. The response's inherited `environment: Production` display label accompanies the main build; the verified origin is the staging Worker, not a production deployment.
- Basic signed-in functional smoke only: Home renders its completed empty state; Systems renders its filters and completed empty state; actual sidebar Home → Systems → Home navigation succeeds. No visible error boundary or browser console errors/warnings. No timings, profiles, benchmarks, session changes or business-data mutations were performed.
- Accepted optimizations remain Home/Systems **3 → 2 ordinary serial D1 waits** and Home scalar JSON timezone lookup with the repeated scans removed, preserving fresh authorization and exact legacy-zone fallback. Historical medians remain Home **821.9 → 672.9 ms**, Systems **775.1 → 587.8 ms**; these were not remeasured for closure. Smart Placement and experimental PERF4 runtime were excluded from integration.

`68580d7fdff779ec9cdfec7f67381af9cf5e7724` is the historical accepted staging candidate; **`cb2ef0bea2900a46583e86c75840e8ba6639d663` is now the verified merged/deployed application**. This follow-up is documentation/state only; it does not change or deploy application code. Older audit-pending, unmerged, performance-gate and staging-SHA statements below are historical and superseded by this closure.

Release D remains open. D1 Systems Foundation is merged; remaining product phases are D2 GHL Build Blueprint, D3 Kajabi Build Blueprint, D4 Systems Execution + QA, D5 Launch + Handoff, D6 Systems Client Experience + Operations, and D7 release hardening. Recommend scoping **D2** next: selected-component generation into canonical Milestones/Actions/Deliverables, immutable version provenance, authorization and idempotent/concurrent retry guarantees. Do not implement D2 or expand into later phases yet. See [RELEASE_D.md](RELEASE_D.md).

## Accepted performance integration (2026-09-11)

Historical pre-merge integration verification follows; current merge/deployment/phase status is recorded above.

Read [PERFORMANCE_INTEGRATION.md](PERFORMANCE_INTEGRATION.md) for exact commit mappings, artifact review, historical evidence and final checks. Only the two accepted optimization commits were cherry-picked onto main: `008fa500ed84dea15fecd4726271ac3aab10ba9a` from `137773b`, and `4f8af586aff6eceec9dab7902d2ea37c64fd082d` from `68580d7`. Their four runtime modules/tests/supporting scripts remain byte-identical to the accepted application. Later integration documentation is not a deployed application revision.

Historical Home median improves **821.9 → 672.9 ms**, Systems **775.1 → 587.8 ms**; the accepted Home candidate's later Systems control was 618.8 ms. Ordinary Home/Systems serial D1 waits fall **3 → 2**, preserving fresh identity/membership checks and exact timezone-alias fallback. Home's repeated JSON timezone scans are removed. Smart Placement did not establish a repeatable additional improvement and is absent.

The clean PR intentionally excludes all intervening PERF4 diagnostic runtime, opt-in, Analytics Engine binding, active diagnostic runners and transport prompts. Wrangler configuration, workflows, dependencies and migrations are unchanged from main. Sanitized round-trip, Home-query and rejected-placement evidence is retained as historical documentation, not new diagnostics. The existing deployed staging candidate was not changed during integration preparation.

Final clean-branch verification passes **163 focused / 4,788 full tests**, **40 Home / 24 Systems native D1 checks**, Cloudflare/Next build, external type generation, staging dry-run, resolved configuration assertions and diff hygiene. The full count excludes 46 PERF4-only diagnostic tests; none are skipped. No new code fix was needed. No deployment, production action, PR merge or D2 was performed.

## PERF3 implementation and evidence (2026-09-11 UTC)

Read [PERF3_RESULTS.md](PERF3_RESULTS.md) for exact timing phases, provenance, all-route representative/exact-3× comparisons, security evidence, reproduction and limitations. Home and Systems were traced before selecting the fix. Early RSC streaming precedes completed authorization/projection reads. The proven local avoidable critical path is the separate session/user → membership D1 round trip, not a measured browser reconciliation bottleneck. The current session/user query now includes the canonical active workspace selection; Better Auth still owns signature verification, expiry, refresh and identity DTOs. This reduces one sequential database stage on every protected request without cross-request authorization/session caching, protected prefetch, changed timezone semantics, additional loading UI or page-data scope changes.

Full tests: **4,786/4,786**. Next and OpenNext/Cloudflare builds pass. The request-local adapter has issued-cookie, expired/deleted/changed-session, refresh-race, current membership/workspace/capability, concurrent-user/binding, DTO and failure tests. Existing Client/Service/Project/Action/Content scope and next-request revocation suites remain intact. Detailed runtime/browser/benchmark results are in the PERF3 report.

No schema, migration, dependency, configuration, workflow, placement or infrastructure changes. No staging/production deployment or real email was sent. No authenticated staging session was available in this workspace; supplied live baseline figures are not independent waterfall measurements. Local zero-delay and injected-latency results cannot establish the live target. The implementation PR must stay **open and unmerged** for independent audit, followed by exact-SHA staging/zero gates and signed-in live retesting. D2 remains blocked.

## PERF2 implementation and evidence (2026-09-10)

Read [PERF2_RESULTS.md](PERF2_RESULTS.md) for the complete before/after tables, sample counts, SQL costs, completed-body/browser method, safe staging capture workflow, verification and limitations. The implementation uses bounded, request-local native D1 read batches, preserving live authorization and explicit SQL scopes. A small Drizzle adapter preserves ordinal field mapping for duplicate SQL column names, decoders and null joins. It never patches a shared session, caches authorization/results, intercepts writes or uses replicas. Project authorization reuses its live authorized DTO instead of reading the Project twice. Home/Systems share exact timezone reads without merging Action-only and Project scope. Social member options retain their readable-parent gate in SQL; unfiltered Systems data no longer waits for facet values it does not need to validate.

Owner end-to-end statements / binding invocations / observed sequential depth change as follows: Home `14/14/4 → 12/4/4`; Clients `4/4/3 → 4/3/3`; Work `8/8/3 → 8/3/3`; Social `6/6/4 → 6/3/3`; Systems `8/8/5 → 7/4/4`; Team `4/4/3 → 4/3/3`; Project detail `15/15/5 → 14/4/4`. Counts/depth stay constant between 50-Client and 150-Client workspaces. The representative fixture contains 100 Projects, 300 Milestones, 1,000 Actions, 300 Deliverables, 250 Content Items and 200 File metadata rows; stress is exactly 3× each. Existing pagination and row limits are unchanged.

Full tests: **4,769/4,769**. Next and Cloudflare builds pass. Built Worker auth: **144/144**; external local verifier: **21/21**; local zero-to-current: **22/22**; Systems runtime: **23/23**; projections: **34/34**; Release B: **86/86**; Release C: **29/29**. Native runtime smokes prove five Systems statements in two D1 batches and ten Home statements in two batches, with 240 assignments and maximum 65/64 bindings. Navigation browser: **87 checks / 70 screenshots**, seven routes at 1440/1024/768/390/320 with and without JavaScript, including next-request Project metadata/body revocation. Systems browser: **122 checks / 47 screenshots**, including native no-JS filters, keyboard/focus, touch and denied access. Issued-cookie session/membership/assignment/capability/contact/visibility revocation tests were rerun after structural changes. The new adapter and numeric measurement regressions pass.

No schema, migration, dependency, package/lock, deployment configuration, workflow, placement or infrastructure changes. No UI/loading boundary, future D2 feature, remote mutation, deployment or automatic real email was added. Current public staging still serves `d0533cb`; no Owner sign-in completed in the manually opened capture browser, so no authenticated staging timing or candidate deployment result is claimed. Public request colo is not proof of D1/Worker execution placement. PERF2 is an implementation handoff, not phase closure. Detailed local artifacts are outside Git at `/home/ary/.cache/bloomops-perf2`; only sanitized numeric evidence is committed. The PR must remain open and unmerged for independent audit.

## PERF1 implementation and evidence (2026-09-10)

Read [PERF1_RESULTS.md](PERF1_RESULTS.md) for measurement method, every route's before/after median and range, query attribution, safe staging evidence, reproduction commands and remaining uncertainty. [Sanitized numeric samples](evidence/PERF1_navigation.json) retain all warmups and measured requests. Baseline application content is byte-identical to the exact D1 base; repeatable measurements preceded production changes. The fixture has 12 Clients, 24 Projects, 240 Actions and representative children/Content, with issued local Owner/Admin/Team/Client sessions.

Proven avoidable latency came from sequential identity/actor/read-model D1 round trips and a duplicate Project read. Better Auth now joins the current session/user in one database call, retaining disabled cookie caching. Owner skips redundant capability loading; other roles retain live grants, with independent assignment/grant reads in parallel. Clients joins its uniquely indexed current primary contact and overlaps count/list reads. Non-date Action views skip an unused timezone map. Social list/options and independent Project options overlap. Project metadata/body share a React request-local authorized read. No authorization decision is cached across requests; shell/navigation/loading behavior is unchanged.

Eight retained samples after two warmups per route: local medians before → after are Home 109.30 → 94.95 ms, Clients 61.85 → 62.80, Work 160.35 → 128.00, Social 76.85 → 61.90, Systems 78.70 → 79.00, Team 61.95 → 62.65, Project detail 117.20 → 89.65. End-to-end D1 calls fall respectively 18 → 14, 7 → 4, 11 → 8, 8 → 6, 10 → 8, 6 → 4 and 19 → 15. With **synthetic 100 ms per D1 call**, median click-to-visible improves by 200–493 ms across those routes. These controlled figures are not staging results.

Public staging GETs (eight retained after two warmups, MIA response colo) measured version 260.95 ms median, health 736.32, sign-in 271.67 and anonymous Systems redirect 252.09. Health performs two sequential D1 reads; its additional roughly 475 ms supports a deployed database-path contribution, but does not measure actual D1 region/latency or prove the user's exact two-second delay. No safe issued authenticated staging browser session was available. No real email, remote mutation or deployment was performed. Authenticated staging confirmation remains outstanding; PERF1 is not closed and D2 remains blocked.

Verification: full suite **4,762/4,762**; shared auth/membership/shell/Client/Service/B1–B7 **1,098/1,098**; Release C **665/665**; Systems/schema **84/84**. The focused new five-test regression proves issued-cookie session deletion, membership suspension/removal, independent assignment and capability revocation, portal visibility/contact unlinking, tenant existence hiding and Department/ownership non-grant. Both Next and Cloudflare builds pass. Ordinary built-Worker auth **144/144**, local staging verifier **21/21**, zero-to-current **22/22**, Systems runtime **23/23**, Home projections **34/34**, Release B runtime **86/86**, Release C runtime **29/29** all pass. At 240 assignments, Systems stays at six projection queries / 65 maximum binds; Home drops to 12 queries / 64 binds. Navigation browser acceptance passes **87 checks / 70 screenshots**, all seven routes at five widths with and without JavaScript, including next-request Project metadata/body denial after unassignment. Existing Systems browser acceptance passes **122 checks / 47 screenshots**, including visible native no-JS filtering, keyboard/focus, reduced motion and touch. All **16** changed JS/JSX syntax checks pass; `git diff --check` is clean.

No DDL, migrations, dependencies, package/lock, deployment configuration, workflows or infrastructure changed. `schema.mjs` adds only ORM relationship metadata over existing auth foreign keys; Drizzle generation reports no schema changes. No D2 or future Systems feature was added. The temporary PERF1 execution prompt is removed from the implementation; durable instructions remain in `docs/phases/PERF1.md`. Local detailed logs and screenshots are at `/home/ary/.cache/bloomops-perf1/`; issued session files stay outside Git. Prior local D1 audit notes remain preserved in their named stashes. The implementation PR must stay open and unmerged for independent audit; use its final exact head for review.

## D1 independent audit correction (2026-09-10)

The final corrected implementation commit is `729ff558e03d5e5c8a650f76827a04f4bbd223d6`. It contains the complete application/test correction, prompt cleanup and verification record below. The subsequent documentation-only commit records this SHA without changing the verified application or test content; fresh independent review must use the final PR #31 branch head, including that documentation commit.

### Reproduction and smallest correction

The fix resumed on `codex/d1-systems-foundation` at `a1485ed` (the failed implementation plus the focused fix prompt). Required contracts and the complete build state are byte-identical to their complete prior audit reads; current Systems page, loading/error components, projection, browser harness, tests and relevant shell/navigation code were inspected again. Previous local independent-audit documents were preserved in a named Git stash before switching branches.

Before editing, the actual original built Worker reproduced the failure with an issued Owner session and JavaScript disabled: after the complete response, the visible main contained only “Systems / Loading Systems projects…”, there were zero visible Project rows, and the Client filter was hidden. The independent visibility assertion failed. The strengthened repository browser harness was then run against that same original build and failed specifically at its new 1440px completed-heading/filter visibility assertion. Its earlier checks reached that point successfully. The original 101-check implementation run below is historical evidence; its named no-JavaScript check counted hidden DOM nodes and did not establish usable native filters. The first audit did not pass.

The root cause was the route-level `app/(internal)/systems/loading.jsx` boundary. Next streamed the completed page into a hidden segment that needed client JavaScript to replace the loading fallback; the boundary also delayed the visible client-navigation commit. The production correction deletes that four-line file. The protected server page, sanitized `error.jsx`, shell authorization and every domain/query implementation remain unchanged. There is no replacement spinner, timeout, hydration workaround, duplicate state or additional fetch path.

`tests/bloomops-systems-page.test.mjs` no longer imports or asserts the removed loading component. It retains error-message sanitization, the Systems heading, announced error and retry control, and explicitly checks one heading and the reset link. `scripts/systems-review-local.mjs` now verifies one visible completed Systems heading, visible native controls, absence of final loading text and the exact expected visible Project rows at 1440/1024/768/390/320px. In the same JavaScript-disabled context it selects a Client and clicks the actual Apply filters button; it verifies the resulting HTTP 200 GET, Client/Service/status query values, the exact narrowed Project, retained selection and narrowed Service choices. The completed filtered view is checked again at all five widths. Existing keyboard/focus/touch/reduced-motion, authorization, bounds and recovery checks are retained.

The corrected browser harness passes **122/122 checks with 47 screenshots**, including ten no-JavaScript captures. Its native Client filter narrows the story's three readable Systems Projects to the selected Client's one Project. A separate unchanged audit-style probe also passes against the corrected build: 50 visible Projects, one heading, a visible Client filter, then native submission narrows to the other Client's two Projects and retains that Client selection. The live design reference and corrected desktop/narrow no-JavaScript screenshots were visually inspected. No hydration or browser runtime error occurred.

### Local navigation comparison

The same Playwright Chromium probe measured the original and corrected built OpenNext Workers at `http://localhost:8787`, using the same issued Owner session and synthetic audit workspace (51 Systems Projects, two excluded Projects). At 1440px, each run clicked Work → Social → Systems for eight rounds, discarded the first two rounds and retained six warm samples per route. In-page click timing ends when completed route content is visible plus two animation frames; Resource Timing records the RSC response separately. No artificial CPU/network throttling was used. The post-fix probe ran after builds, browser acceptance and the migration verifier completed, before auth stress tests.

| Route | Before: median click to visible | Corrected: median click to visible | Before / corrected median RSC duration |
|---|---:|---:|---:|
| Systems | 345.6 ms | **78.6 ms** | 34.4 / 37.8 ms |
| Work (default Actions view) | 70.2 ms | 77.9 ms | 30.9 / 33.8 ms |
| Social | 62.7 ms | 62.3 ms | 23.4 / 25.9 ms |

The correction removes approximately 267 ms of D1-local visible-navigation delay in this comparison while the Systems data response remains similar. Corrected Systems samples ranged from 78.1 to 80.6 ms. This is local measurement evidence, not an SLA or a claim that the staging-wide latency is fixed. No additional D1-specific performance defect was observed. Query shape and fresh per-request identity/membership/scope checks were not changed. The separate global performance-hardening phase remains required after D1 closes and before D2.

### Fresh correction verification

Logs, precise timing samples, the before-fix failure and corrected screenshots are under `/tmp/bloomops-d1-fix`. Counts below overlap; they are not additive. Every node:test suite has zero failures, skips, cancellations and todos.

| Check / command | Result |
|---|---|
| `node --test tests/bloomops-systems-*.test.mjs` | 62/62 passed |
| Systems plus `tests/bloomops-shell.test.mjs` | 79/79 passed |
| Service/auth/authorization/membership/shell and relevant B1–B7 suites | 1043/1043 passed; same complete shared command documented in the original implementation evidence below |
| Release C Content/portal/release suites | 665/665 passed |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4757/4757 passed; existing external Python alias only |
| `npm run build`; `npm run cf:build` | Both passed, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: fresh database, all migrations, integrity, identical no-op second pass and cleanup |
| `npm run db:domain:generate` | No schema changes; nothing to migrate |
| Schema/drift tests | 22/22 passed |
| `node scripts/systems-smoke-local.mjs` | 23/23 actual workerd/D1 checks; 240 assignments, six queries, maximum 65 bindings / 13,419 SQL bytes; no R2 binding |
| `node scripts/projections-smoke-local.mjs` | B6: 34/34 actual workerd/D1 checks |
| `node scripts/release-b-smoke-local.mjs` | B7: 86/86 actual workerd/D1/R2 checks |
| `node scripts/release-c-smoke-local.mjs` | C7: 29/29 actual workerd/D1/R2 checks |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against the corrected built Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the corrected built Worker after the normal auth throttle window; no throttle setting changed |
| Corrected `systems-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-d1-fix/browser-after` | 122/122 passed; 47 screenshots at all five established widths, including visible no-JavaScript pages and real native filter submission |
| Independent no-JavaScript visibility/native-filter probe | Failed on original build; passed unchanged on corrected build |
| Changed JS/JSX syntax; `git diff --check` | Both changed JavaScript modules parsed with Node; no whitespace errors |
| Exact package/lock/schema/migration/Cloudflare config diff against D1 base | Empty; no prior migration edits, new migrations, dependency, provider or infrastructure change |

`D1_FIX_PROMPT.txt` was removed before the implementation commit and has no net diff against the D1 base. The correction changes only the loading-file deletion, the two acceptance-test files and this build-state record, apart from that temporary-prompt cleanup. All operational verification uses synthetic local/disposable data and development mail. No staging/production business-data mutation, deployment, merge, second PR or D2 work was performed. PR #31 must remain open for a fresh independent exact-head re-audit.

## Systems Foundation (D1)

### Entry and implementation decisions

The branch started clean at `c7143ba`, containing the Release D plan, roadmap split, binding D1 contract and temporary execution prompt. The entire prompt/contract and B1–B7 phase contracts were read before implementation. Required AGENTS/product/domain/design/build-state documents are byte-identical to their complete prior reads in this session, verified against the preceding C7 audit checkout. Current Service/catalog, Work Core, assignment/access, shell, projection, tests and local verification implementations were inspected.

- `/systems` now renders a protected server-side operational view with one heading, Client/Service/Project-status filters, Project rows, derived attention/progress, open Action/review summaries, Ready File presence and forward Deliverables. Empty, invalid-filter, loading and sanitized error recovery are included.
- Eligibility is a current relational Project -> same-Client Service Engagement -> Service Type -> Department with stable `systems` slug. Display names, Project department metadata, ownership and Department membership cannot substitute. No GHL/Kajabi platform is inferred. Active catalog flags and Client/Service status do not silently close otherwise active Project work.
- B6's existing Project and forward Deliverable queries accept a server-only narrowing condition. They retain every live Project/Milestone/Action/Deliverable/File predicate. New pagination and attention-first options leave existing Home/Work defaults intact. No Action-only assignment can inflate Project/sibling/facet scope, and no R2 bytes are read for summaries.
- The default Project view excludes Completed/Cancelled/Archived; all exact statuses remain selectable. Project pages contain 50 readable rows plus one overflow probe, with deterministic attention priority then target date/name/id. Client/Service facets cap at 200 plus a separately authorized selected value. Forward Deliverables keep the B6 six-row review/approved/14-day target window across the whole filtered set, independent of the Project page. Missing/foreign/revoked/incompatible filters share one generic response without a fallback data list.
- All management links use existing canonical Work/Project/Action surfaces. The convenient creation link opens the ordinary Work form; there is no second Systems creation operation. The existing fixed staff navigation is retained for every internal role, with Systems marked available and a calm empty state for users without readable Systems Projects. Client navigation is unchanged.
- D1 is **schema-free**: no migration, schema, dependency, lockfile, provider, infrastructure/configuration, stored status/counter, template or lifecycle change. Release D/roadmap/D1 contracts are preserved.

### Verification and corrections

Fresh logs and screenshots are outside Git under `/tmp/bloomops-d1-*`. The new tests exercise real migrated SQLite/Drizzle and actual issued Better Auth sessions; the runtime smoke uses disposable workerd/D1 without an R2 binding. The browser harness creates its operational story through the canonical HTTP APIs, then uses local fixtures for bounds and revocation.

Two new test-fixture mistakes were corrected after existing constraints rejected them: a Service-bound Project cannot also store a Project department, and Service completion uses `completed`, not `ended`. The page tests were changed to import JSX after the repository loader registers. Invalid-filter presentation uses the existing error Notice so assistive technology receives an alert with its recovery link. Existing shell assertions were updated to explicitly include Systems among available destinations.

One unrelated inherited regression test blocked a repeated shared run: its `/existing-|count|199/` scan rejected random Action id `334cff7f1995463bb03ea0b01b1d4ec3`. `bloomops-actions-views.test.mjs` now asserts the exact successful `{ok, actionId}` and conflict `{ok, reason}` envelopes against the currently visible Action. This directly proves no hidden names/counts are returned without rejecting legitimate opaque ids. No production Action behavior changed.

| Check / command | Fresh result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; 53 inherited advisories (1 low, 43 moderate, 9 high) |
| `node --test tests/bloomops-systems-*.test.mjs` | 62/62 passed; real read/authorization/limits/server-page/loading/error invariants |
| Focused Systems plus `tests/bloomops-shell.test.mjs` | 79/79 passed |
| Service/auth/membership/shell plus B1–B7 Project/Milestone/Action/Deliverable/File/projection/regression suites | 1043/1043 passed after the exact-envelope correction above |
| `node --test tests/bloomops-content-*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-release-c-*.test.mjs` | 665/665 passed |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4757/4757 passed; zero failures, skips, cancellations or todos |
| `npm run build`; `npm run cf:build` | Both passed, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: empty database, all migrations, integrity, identical no-op second pass and cleanup |
| `npm run db:domain:generate` | No schema changes; nothing to migrate |
| `node --test tests/bloomops-schema.test.mjs tests/schema-drift.test.mjs` | 22/22 passed |
| `node scripts/systems-smoke-local.mjs` | 23/23 actual workerd/D1 checks; 240 assignments, six metadata queries, maximum observed 65 bindings / 13,419 SQL bytes; no R2 binding |
| `node scripts/projections-smoke-local.mjs` | 34/34 passed; shared B6 defaults and large assignment scope |
| `node scripts/release-b-smoke-local.mjs` | 86/86 actual workerd/D1/R2 checks passed |
| `node scripts/release-c-smoke-local.mjs` | 29/29 actual workerd/D1/R2 integrated checks passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against the actual built Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built Worker after the live auth throttle window elapsed |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/systems-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-d1-review-final` | 101/101 passed, 37 screenshots including the live design reference; 1440/1024/768/390/320px, populated/empty/invalid/assigned/restricted/last-page states, keyboard/focus/touch/reduced-motion and JavaScript-disabled reads |
| Changed JS/JSX syntax and `git diff --check` | 16 modules parsed with Node/esbuild; no whitespace errors |
| Exact dependency/config/schema/migration diff against `1638e3ed9fd33c3725aa3449935b08335b73f1a9` | No changes to package/lock, schema.sql, Drizzle schema/config, migrations/snapshots or wrangler.jsonc |

The full shared regression command was `node --test tests/bloomops-services.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-projects-*.test.mjs tests/bloomops-milestones-*.test.mjs tests/bloomops-actions-*.test.mjs tests/bloomops-deliverables-*.test.mjs tests/bloomops-files-*.test.mjs tests/bloomops-projections-*.test.mjs tests/bloomops-release-b-*.test.mjs tests/bloomops-shell.test.mjs`.

The fresh database contains 60 inherited ledger migrations, 18 domain migrations, 41 domain / 77 total tables, 37 triggers and 100 migration-defined indexes. No prior migration was edited. The 53 advisories remain inherited with identical package/lock contents; no dependency remediation is claimed. Browser screenshots manually inspected include the live reference, populated desktop and 320px long-name view, invalid 390px recovery, and narrow Project pagination. No page hydration/runtime errors occurred in the final browser run. Local auth throttling is preserved; the external verifier initially received the real 429 throttle response after other auth tests and passed on retry after the window elapsed. The first browser attempt overlapped the authentication smoke's intentional failure-injection checks; browser acceptance was rerun independently and waits for streamed navigation to settle. The existing external Python alias and Playwright installation remain outside the repository.

### Complete D1 changed-file inventory

The net diff against the exact D1 base contains 22 files, including the supplied Release D/roadmap/D1 planning commits:

- `app/(internal)/systems/error.jsx`
- `app/(internal)/systems/loading.jsx`
- `app/(internal)/systems/page.jsx`
- `components/bloomops/SystemsOverview.jsx`
- `docs/BUILD_STATE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/INDEX.md`
- `docs/RELEASE_D.md`
- `docs/ROADMAP.md`
- `docs/phases/D1.md`
- `lib/bloomops/navigation.mjs`
- `lib/bloomops/systems.mjs`
- `lib/bloomops/work-projections.mjs`
- `scripts/systems-review-local.mjs`
- `scripts/systems-smoke-local.mjs`
- `scripts/systems-smoke-worker.mjs`
- `tests/_systems.mjs`
- `tests/bloomops-actions-views.test.mjs`
- `tests/bloomops-shell.test.mjs`
- `tests/bloomops-systems-access.test.mjs`
- `tests/bloomops-systems-domain.test.mjs`
- `tests/bloomops-systems-page.test.mjs`

`D1_CODEX_PROMPT.txt` was removed and has no net diff against the base. Generated artifacts, screenshots, local secrets, build outputs and temporary verification resources are not tracked.


### Deliberate limits and remaining gates

D1 contains no Systems-specific creation/editor, platform filter/inference, blueprint generation/provenance, QA lifecycle, launch/handoff metadata, Client Systems navigation, provider integration, credential storage, notifications, Ads or D2+ work. These are not implied by the new view. All verification uses synthetic local/disposable data and local development mail. No remote deployment, remote migration or staging/production business-data mutation was performed. Independent audit, merge and the two automatic exact-merge-SHA workflows remain outstanding.

## Release C Hardening (C7)

### Verified entry and scope

Read-only `gh run view` checks confirmed [Deploy staging 34446462522](https://github.com/Beeyach/bloomops/actions/runs/34446462522) and [Verify zero-to-current 34446699082](https://github.com/Beeyach/bloomops/actions/runs/34446699082) both completed successfully on `4dff635df8bb9268b18369eea05914c2c2534e3f`. The branch started clean and contained only its binding contract (`d01e1de`) and temporary execution prompt (`3aaff1f`) after that base. The complete prompt and C7 contract were read; required repository/product/design/C1–C6 documentation and current implementation, tests and verification harnesses were inspected before editing. Required pre-C7 documents were byte-identical to the complete C6 re-audit reads in this session.

C7 adds no product feature, lifecycle, schema, dependency or infrastructure change. Existing C1–C6 authorization, storage, snapshot, pagination and concurrency rules survived the review and fresh regressions. The only product correction restores page orientation on invalid staff Social filters.

### Reproduced defect and smallest correction

The staff Social list's invalid-query response and both calendar invalid-query branches rendered an announced error and reset link with no page heading. Real Next server-page tests, using actual request stores, migrated SQLite and issued Better Auth sessions, reproduced three failures (zero `h1` elements). Six companion checks confirmed anonymous/Client redirects happened before error rendering. The two pages now prepend the existing `PageHeader` with their ordinary title. The tests prove one named heading, the existing alert and the appropriate reset link; shell authorization is not mocked. No filter semantics, route status or permission rule changed.

The live Bloom design gallery loaded with HTTP 200 and was visually inspected. The correction reuses its existing typography/spacing primitives; no redesign or CSS change was needed.

During browser-harness development, an overbroad alert count also matched the hydrated shell's empty live region; direct inspection confirmed the reset control already had a 2px keyboard focus outline. The new check now targets the announced filter error and drives the real Tab order. The direct-index check also waits for Next's redirect, matching the existing C6 harness. These were harness corrections, not additional product defects. Initial diagnostic runs are retained under `/tmp/bloomops-c7-browser-*-diagnostic.log`; only complete successful reruns count as acceptance evidence.

### Connected acceptance evidence

`scripts/release-c-story.mjs` is a test-only story shared by `node:test` and disposable workerd/D1/R2. It creates a synthetic two-Client agency with Social and Systems engagements, an exact Social contractor, PM and Client identities, plus another workspace. Better Auth issues real cookies through an in-memory mailer; every subsequent access reloads current membership/scope, while sensitive domain calls also exercise actors loaded before revocation. No mail leaves the process. All Content stage, detail, platform, recording and review operations use the canonical domains; SQL seeds parents and changes assignment/contact facts only.

Its 29 assertions connect C1 creation and different conditional pipelines, C3 date/platform changes, a C4 Client recording and response-loss retry, two formal C5 rounds, and C6 discovery/actions/recent publication. Prior review copy and finalized rounds remain identical through rework. Old request/response retries cannot overwrite or complete round two. The contractor demonstrably reads current history/Files before reassignment, loses old list/calendar counts, detail, review/File history and bytes after reassignment, and regains them only with the exact assignment. Contact unlinking removes navigation, recordings, metadata, upload retry and download authority while identity survives. Restriction removes broad PM and Client access while retaining the canonical Requested round; exact PM assignment restores only internal authority. A real C2 transition to Editing during an R2 GET fences the in-flight Client download and simultaneously removes C6 recording/File indicators. Actual canonical publication drives inclusive 30-day and future-date discovery checks without duplicate schedule state. Client/Service lifecycle facts and relational integrity remain unchanged.

`node scripts/content-approvals-review-local.mjs --release-c` extends the current C5 browser journey with C7 checkpoints in the same workspace and issued browser sessions. The optional checkpoints add multi-service/other-Client/hidden work, invalid-filter recovery and visible keyboard focus, recording/action/detail/File presentation, each round's C6 action link, contractor reassignment and disappearance of old history/Files, publication through different pipelines, recent-only navigation, contact revocation and portal reduced motion. The existing C5 journey supplies double-submit/retry checks, immutable two-round copy/feedback, frozen fields, dialog focus/trap/restoration, touch and withdrawal controls. All integrated layouts use 1440/1024/768/390/320px and check one heading, overflow and readable controls; long titles, copy and filenames are included.

Existing convincing adversarial coverage was retained and rerun rather than duplicated:

| Invariant | Existing proof retained |
|---|---|
| Tenant/Client IDs, current membership/role/workspace, assignment/contact/visibility/Social truth; owner/department/Project/Action do not grant Content | C1–C6 access/HTTP tests, shared authorization and shell tests; corresponding runtime smokes |
| Every conditional flag combination, legal stages, terminal Published, context/revision/event integrity | C2 domain/HTTP/runtime matrix, including formal C5 approval for the Client gate |
| Edit/stage/platform races; same/different request retries; late-write rollback | C1–C3 domain/HTTP/runtime suites and C5 concurrency tests |
| Requested uniqueness/freeze, immutable prior rounds, stale response, response/withdraw/edit winners, late rollback | C5 domain/concurrency/HTTP/runtime suites |
| C4-only storage authority, retry recovery/generations, changed parents, post-R2 PUT/GET/HEAD checks and File history visibility | C4 access/domain/HTTP/R2/runtime plus B5 File regressions |
| Date/null/order/range/page limits, Unicode platforms, dense pages and large assignment/contact scopes | C3 and C6 domain/HTTP/runtime suites (including 205 dense rows and 240 scopes) |
| Exact general DTOs, hidden-row pagination, current/Needs you/recent windows, conditional navigation/direct index, no-client/suspended behavior | C6 domain/HTTP/real-page/UI/runtime/browser suites |
| Loading, sanitized errors, disabled pending controls and recovery | Existing Content/recording/approval/portal UI tests plus browser error, empty and dialog paths |

### C7 verification

All commands run from the repository root. Logs and browser artifacts use `/tmp/bloomops-c7-*`, outside Git. Results below are fresh C7 runs, not historical C6 counts.

| Check / command | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; 53 inherited advisories (1 low, 43 moderate, 9 high) |
| `node --test tests/bloomops-release-c-*.test.mjs` | 10/10 passed, including 29 integrated story assertions; zero skips/cancellations |
| `node --test tests/bloomops-content-*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-release-c-*.test.mjs` | 665/665 passed; zero skips/cancellations |
| `node --test tests/bloomops-file*.test.mjs tests/bloomops-projection*.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-membership.test.mjs` | 311/311 passed; zero skips/cancellations |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4695/4695 passed; zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed; fresh schema, exact no-op second pass and disposable cleanup |
| `npm run db:domain:generate` | Exit 0; no schema changes, nothing to migrate |
| `node --test tests/bloomops-schema.test.mjs tests/bloomops-content-schema.test.mjs tests/bloomops-content-pipeline-schema.test.mjs tests/bloomops-content-calendar-schema.test.mjs tests/bloomops-content-files-schema.test.mjs tests/bloomops-content-approvals-schema.test.mjs tests/schema-drift.test.mjs` | 72/72 passed |
| `node scripts/content-smoke-local.mjs` | 43/43 actual workerd/D1 checks passed |
| `node scripts/content-pipeline-smoke-local.mjs` | 54/54 passed |
| `node scripts/content-calendar-smoke-local.mjs` | 57/57 passed |
| `node scripts/content-files-smoke-local.mjs` | 64/64 actual workerd/D1/R2 checks passed |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 passed |
| `node scripts/portal-content-smoke-local.mjs` | 30/30 passed |
| `node scripts/release-c-smoke-local.mjs` | 29/29 passed on real workerd/D1/R2 with issued sessions |
| `node scripts/files-smoke-local.mjs`; `node scripts/projections-smoke-local.mjs`; `node scripts/release-b-smoke-local.mjs` | 42/42, 34/34 and 86/86 passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against the built Worker; identity, invitation, scopes, suspension and sign-out |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built Worker |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --release-c --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c7-review` | 206/206 browser/HTTP checks passed; 134 screenshots at 1440/1024/768/390/320px |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/portal-content-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c7-c6-review` | 86/86 browser/HTTP regressions passed; 52 screenshots at all five widths |
| Changed JS/JSX syntax; `git diff --check 4dff635df8bb9268b18369eea05914c2c2534e3f` | Nine JS/JSX files parsed with Node/esbuild; no whitespace errors |
| `git diff --exit-code 4dff635df8bb9268b18369eea05914c2c2534e3f -- package.json package-lock.json drizzle lib/bloomops/schema.mjs` | Exit 0; byte-identical dependencies, schema, migrations and snapshots |

No migration or schema correction was necessary. No prior migration was edited, no migration was added and no dependency/audit-fix command ran. The fresh database has 60 inherited ledger entries, 18 domain migrations, 41 domain / 77 total tables, 100 migration-defined indexes and 37 triggers; the second pass changed neither schema nor ledgers. The pinned manifest/lockfile remain identical to the exact C6 base. npm's 53 advisories are inherited; the available build checks pass but do not resolve those advisories. The external Python alias already used by prior phases supports inherited packaged-skill ZIP tests without changing repository behavior. Playwright remains external at `/tmp/bloomops-c6-tools`; Chromium uses the existing libraries under `/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu`.

Screenshots visually inspected include the live design reference, the 320px Social reset/focus state, calendar invalid-query heading, long recording detail/filename and reassigned contractor calendar, plus the desktop recent-publication list. The integrated browser checks preserve real auth throttling with bounded retries. Loading/error-state assertions also remain in the focused UI regressions; no remote browser acceptance is claimed.

### Deliberate limits and handoff

Only synthetic local/disposable data is used. Runtime harnesses remove their temporary resources. The built Worker uses the safety-checked local preview with `r2-dev` mail and an in-memory loopback origin override. `.dev.vars`, unrelated developer processes, staging/production business data and Leadsthatbloom are untouched. No deployment, real email/SMS, payment, DNS change or Release D work is authorized or performed. Remote C7 deployment/migration gates, independent audit and merge are intentionally not verified by this implementation; those are the remaining release-closure gates.

All required local checks ran and passed. The owned preview was stopped after browser/auth verification. Its SIGTERM exit left the local dry-run bundle behind; after confirming both owned processes and port 8787 were gone, that specific temporary directory was removed explicitly. Unrelated older preview directories were left untouched. Synthetic browser/auth fixtures remain only in local development D1/R2; disposable runtime/zero-check resources were removed by their harnesses.

Historical C1/C2/C4 browser scripts still contain phase-local absence/bypass assertions superseded by C5/C6. C7 runs the current C5 journey extended across C1–C6 and the current C6 browser regression, plus every current C1–C6 runtime smoke. It does not alter historical harnesses merely to inflate passing counts. Earlier contracts' limits remain: C4-only eligible recording sharing, C5-only explicit review copy, no Client history/general assets/provider publishing/notifications or future modules. There is no behavior correction requiring DOMAIN_MODEL or RELEASE_C edits.

The implementation handoff is an open, unmerged PR for independent audit. The final exact head is reported with that PR and identifies the content reviewed; Release C is not closed by this work. The next step is independent C7 audit, not Release D implementation.

### Complete C7 changed-file inventory against the exact C6 base

- `app/(internal)/social/calendar/page.jsx`
- `app/(internal)/social/page.jsx`
- `docs/BUILD_STATE.md`
- `docs/phases/C7.md`
- `scripts/content-approvals-review-local.mjs`
- `scripts/release-c-review-checks.mjs`
- `scripts/release-c-smoke-local.mjs`
- `scripts/release-c-smoke-worker.mjs`
- `scripts/release-c-story.mjs`
- `tests/bloomops-release-c-page.test.mjs`
- `tests/bloomops-release-c-story.test.mjs`

The temporary `C7_CODEX_PROMPT.txt` is removed, giving zero net diff against the C6 base. No generated output, local data, secrets or browser artifacts belong in the final diff.

### Historical C6 entry: verified C5 closure and exact C6 base

C5 PR #26 merged as `df4bfde1d3746d3517dbaff498f6eb17a5b732e0`, the exact C6 base. Read-only `gh run view` checks confirmed [Deploy staging 34365507942](https://github.com/Beeyach/bloomops/actions/runs/34365507942) and [Verify zero-to-current 34365508005](https://github.com/Beeyach/bloomops/actions/runs/34365508005) both completed successfully on that exact SHA. The C6 contract records successful disposable cleanup. The requested branch started clean and contained only the C6 phase contract and temporary prompt after the base. The complete prompt, phase contract, repository instructions and required preflight documentation were read before implementation.

## Client Content Portal (C6)

### Implementation decisions

- Schema-free general Client Content index/detail, conditional Home/Content navigation and exact allowlisted JSON reads. All records remain canonical C1–C5 records; no portal cache, duplicated statuses, new writes, File policy expansion or notification side effect.
- Shared `contentClientReadCondition` extracts the existing C5 live Client predicate. Membership/workspace/role, current contact, Content visibility and canonical optional Social parent are rechecked in SQL. C4 and C5 retain narrower recording/Requested-round gates; their internal scope and writes remain unchanged. Owner, department, Project, Action and unrelated-service relationships do not grant Client reads.
- Current/upcoming includes every readable non-Published item. Needs you derives C4 recording and C5 approval eligibility. Recently published uses canonical `published_at` in the inclusive preceding 30 days and excludes future dates. Queries filter eligibility before 20+1 pagination; date/ID ordering is deterministic, null planned dates sort last, and only eligible `hasMore` is returned. Positive page input is bounded to 999999. No total or hidden overflow is exposed. Navigation and the direct index gate share the union of discoverable Content: readable non-Published work or recent Published work, using the same stage/window predicates as the lists. Ineligible portal Clients redirect to `/portal`; eligible Clients retain empty states for a selected view/page with no items.
- General DTOs contain only ID, title/type, Client name, derived status label, dates, platform display labels and current action/File indicators. Detail adds the existing six-field File metadata projection. No script, hook, caption, CTA, pillar, internal context/owner, CAS, provenance, activity, service/member/workspace IDs or completed review history is serialized. Explicit C5 review remains the sole surface for its submitted snapshot copy.
- Detail and File metadata are read in one D1 batch, with authorization predicates repeated after route resolution. File indicators correlate to this exact Content and reuse C4: only Ready, client-visible, unarchived recording Files while recording is required and Content is Waiting for Recording. Uploading/Failed retries remain on the existing recording page. Generic Content assets remain hidden; leaving the recording stage removes metadata and download access. C6 uses the existing opaque download endpoint with its post-R2 authority check.
- Existing B portal Home/onboarding/Projects/Deliverables/Files are preserved. Recording and approval links reuse existing pages and mutations. Staff Content changes are limited to correcting visibility help text and shared helper extraction. Portal styles reuse the existing tokens/primitives, quiet rows, wrapping titles/filenames, active nav, loading/empty/error/no-action recovery and 44px controls.

### C6 conditional-destination audit correction

`hasPortalContent` now combines live Client authorization with the union of the Current and Recently published predicates. The list and destination query reuse the same non-Published and inclusive 30-day publication conditions. Older/future publications, hidden/foreign Content and invalid Client/Service authority cannot activate navigation. `/portal/content` calls this same query after ordinary portal authentication and redirects an ineligible Client to `/portal`. The page uses one timestamp for eligibility and its list; an empty selected view/page does not revoke an otherwise eligible destination. There is no change to detail/API readability, DTOs, C4/C5 authorities, schema, dependencies or the binding phase contract.

Fifteen focused regressions were added: six domain/window/isolation tests and nine actual Next server page/layout tests using migrated SQLite and issued Better Auth sessions. The page tests provide Next's request stores without mocking shell authorization, Content eligibility or redirect. Six tests failed against the unchanged audited product code before the fix; all pass afterward. Browser acceptance replaces the incorrect empty-global-module assertion with direct redirects for no Content, old-publication-only Content, visibility revocation and contact revocation. It also proves current-only access and valid empty Current/Needs you views when only recent Published Content exists. The disposable C6 runtime adds six discovery/window cases and exercises the corrected navigation query with 240 linked Clients.

### Fresh audit-correction verification

| Check / exact command | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; same 53 inherited advisories (1 low, 43 moderate, 9 high) |
| `node --test tests/bloomops-portal-content*.test.mjs` | 56/56 passed, zero skips/cancellations |
| `node --test tests/bloomops-content*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-file*.test.mjs tests/bloomops-projection*.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-authorization.test.mjs` | 936/936 passed, zero skips/cancellations |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4685/4685 passed, zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed; fresh schema, exact no-op second pass and disposable cleanup |
| `npm run db:schema:local`; `npm run db:migrate:local`; `npm run db:domain:migrate:local` | Exit 0; local preview schema current, no domain migrations to apply |
| `npm run db:domain:generate` | Exit 0; no schema changes, nothing to migrate |
| `node scripts/portal-content-smoke-local.mjs` | 30/30 actual workerd/D1/R2 checks passed |
| `node scripts/content-files-smoke-local.mjs` | 64/64 passed |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 passed |
| Changed JS/JSX syntax; `git diff --check df4bfde1d3746d3517dbaff498f6eb17a5b732e0` | 31 files parsed with Node/esbuild; no whitespace errors |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/portal-content-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c6-fix-review` | 86/86 browser/HTTP checks; 52 screenshots at 1440/1024/768/390/320px |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c6-fix-c5-review` | 91/91 browser/HTTP regressions; 53 screenshots at all five widths |

The corrected navigation query measures 12 bindings and 1206 SQL bytes. List/detail queries retain their previous shape. Schema/migrations and package manifests/lock remain byte-identical to the audited head and exact C5 base; inventory remains 18 domain migrations, 41 domain / 77 total tables, 100 indexes and 37 triggers. No dependency update or audit-fix command ran.

Logs are under `/tmp/bloomops-c6-fix-*.log`, with the pre-fix failures in `bloomops-c6-fix-before.log`. Browser artifacts/tooling and the existing Python alias remain outside Git. The 320px recent-Published-only empty Current view and desktop Content list were visually inspected. No visual redesign or remote design-reference inspection is claimed for this correction. Verification uses synthetic local D1/R2 and example.com identities. The owned preview was stopped after both browser suites; `.dev.vars` and unrelated processes were untouched. All required correction checks ran and passed; remote deployments/post-merge gates were intentionally not run. The earlier C1–C3/B/A runtime commands below are historical implementation evidence; the fresh correction reruns are the table above.

The fix changes eight product/test/documentation paths relative to `50c196a`: `app/portal/content/page.jsx`, `lib/bloomops/portal-content.mjs`, `scripts/portal-content-review-local.mjs`, `scripts/portal-content-smoke-worker.mjs`, `tests/bloomops-portal-content.test.mjs`, new `tests/bloomops-portal-content-page.test.mjs`, `docs/DOMAIN_MODEL.md` and `docs/BUILD_STATE.md`. The temporary `C6_FIX_PROMPT.txt` is removed, giving zero net prompt diff against both the audited head and C5 base. PR #27 must remain open and unmerged for a fresh independent audit.

### Initial C6 verification evidence (audited head `50c196a`, historical)

These initial runs preceded the independent audit. The original browser harness incorrectly accepted an irrelevant empty Content index; its green result did not prove the conditional-destination contract. The correction and fresh verification are recorded above.

| Check / exact command | Result |
|---|---|
| `npm ci` | Exit 0; package manifests/lock byte-identical to exact C5 base |
| `node --test tests/bloomops-portal-content*.test.mjs` | 41/41 passed, zero skips/cancellations |
| `node --test tests/bloomops-content*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-file*.test.mjs tests/bloomops-projection*.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-authorization.test.mjs` | 921/921 passed, including C1–C6 and relevant B portal/File/shared authorization regressions |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4670/4670 passed, zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Exit 0, including available Next lint/type checks; final Worker includes navigation styles |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed; fresh schema/ledgers and exact no-op second pass, disposable cleanup |
| `npm run db:schema:local`; `npm run db:migrate:local`; `npm run db:domain:migrate:local` | Exit 0; local preview schema current; domain path reports no migrations to apply |
| `npm run db:domain:generate` | Exit 0; no schema changes, nothing to migrate |
| `node scripts/portal-content-smoke-local.mjs` | 24/24 actual workerd/D1/R2 checks, including 240 linked Clients, filtered pagination, per-Content Files, C5 response, recent publication and stale-authority revocations |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 passed |
| `node scripts/content-files-smoke-local.mjs` | 64/64 passed |
| `node scripts/content-calendar-smoke-local.mjs` | 57/57 passed |
| `node scripts/content-pipeline-smoke-local.mjs` | 54/54 passed |
| `node scripts/content-smoke-local.mjs` | 43/43 passed |
| `node scripts/files-smoke-local.mjs` | 42/42 passed |
| `node scripts/projections-smoke-local.mjs` | 34/34 passed |
| `node scripts/release-b-smoke-local.mjs` | 86/86 passed |
| `node scripts/release-a-hardening-smoke-local.mjs` | 26/26 passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against built Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed |
| Changed JS/JSX syntax; `git diff --check` | 30 files parsed with `node --check` / existing esbuild JSX transform; no whitespace errors |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/portal-content-review-local.mjs` | 78/78 browser/HTTP checks passed; 52 screenshots at 1440/1024/768/390/320px |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c6-c5-review` | 91/91 C5 browser/HTTP regressions passed; 53 screenshots at all five widths |

The focused D1 queries were also measured with the repository's SQLite adapter: current/action/published list queries use 33/44/35 bindings and 5154/6584/5178 SQL bytes; the detail's two reads use 33/15 bindings and 5022/2247 bytes; navigation uses 8 bindings and 1056 bytes. They stay below D1's 100 bound parameters and 100KB SQL limit, without per-item SQL, scope-expanded IN lists or R2 list calls. The actual D1 smoke independently exercised the large-contact case.

There are no migrations, schema/snapshot edits or dependency changes. Inventory remains 18 domain migrations, 41 domain tables, 77 total fresh tables, 100 migration-defined indexes and 37 triggers. `npm audit --package-lock-only --json` was run against the working tree and isolated exact-base/head manifest extractions. All 53 inherited advisories match in IDs, affected packages, ranges, severity and fixes: 1 low, 43 moderate, 9 high, 0 critical. npm varied only the transitive `effects` attribution for `@tiptap/extension-drag-handle` and `@tiptap/react`; there is no package/advisory delta. No dependency update or audit-fix command ran.

Browser/tooling evidence lives under `/tmp/bloomops-c6-*`, outside the repository. Playwright is installed only under `/tmp/bloomops-c6-tools`; existing Chromium libraries are reused from `/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu`. The full suite initially hit the host's unavailable `python` command in five inherited packaged-skill ZIP tests; an external `python` → `/usr/bin/python3` alias, as documented in prior phases, made the complete rerun pass without changing test or product behavior. The C6 browser fixture initially exceeded the existing 180-character filename bound; the synthetic filename was corrected to 180 characters. Its recording-page assertion was also aligned with the existing C4 heading (Recording needed, with the Content title as subtitle). Only final complete runs count as acceptance evidence. Existing sign-in throttling was respected with bounded retries.

The complete C6 browser story covers Social-only/non-Social/multi-service Home, retained Systems Project, upcoming and recent Published Content, recording navigation, canonical Ready File bytes and 180-character filename, explicit snapshot/approval response, no-action/empty/invalid-query states, long titles, keyboard, touch, reduced motion and live stage/visibility/contact/membership revocation. Screenshots inspected include the desktop list, 320px File detail, mobile list and recent publication view. Loading and sanitized server-error recovery are covered by focused UI tests; no remote C6 deployment or post-merge gate is claimed.

The browser successfully fetched the live design reference with HTTP 200 and its full gallery screenshot was visually inspected. The initial web fetch failed; browser inspection is the evidence used. The local preview uses the existing safety-checked `scripts/files-preview-local.mjs`, with its in-memory loopback origin override and synthetic example.com identities. `.dev.vars` and unrelated developer processes remain untouched. No remote deployment, staging/production data mutation, real client communication, DNS, payment or Leadsthatbloom action was performed. Browser fixtures remain in local development D1/R2; disposable runtime/zero-check resources are removed by their harnesses.

Deliberate limits: no general copy disclosure, Client history, generic Content asset sharing, File versioning, comments, notifications, provider publishing, templates, Ads/Systems buildout or C7. Offset pages reflect current truth and can shift as records change. Publication browsing is limited to the last 30 days; older readable Content retains its existing authorized detail URL but cannot activate navigation or the index. C6 awaits a fresh independent audit, user-controlled merge and both post-merge gates before a separately instructed C7.

The initial owned loopback preview was stopped after verification and its cleanup completed. The temporary `C6_CODEX_PROMPT.txt` was removed and has zero net diff against the exact C5 base. Corrected scope is the 36 paths below; no secrets, production data or generated/debug artifacts entered the intended diff. The implementation commit and open/unmerged PR identify the exact final head.

### Complete C6 changed-file inventory against the exact C5 base

- `app/api/bloomops/portal/content/[contentId]/route.js`
- `app/api/bloomops/portal/content/route.js`
- `app/bloomops.css`
- `app/portal/content/[contentId]/page.jsx`
- `app/portal/content/error.jsx`
- `app/portal/content/loading.jsx`
- `app/portal/content/page.jsx`
- `app/portal/layout.jsx`
- `components/bloomops/ContentForm.jsx`
- `components/bloomops/ContentViews.jsx`
- `components/bloomops/PortalContent.jsx`
- `components/bloomops/PortalContentNav.jsx`
- `components/bloomops/PortalShell.jsx`
- `docs/BUILD_STATE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/RELEASE_C.md`
- `docs/phases/C6.md`
- `lib/bloomops/authorization.mjs`
- `lib/bloomops/content-access.mjs`
- `lib/bloomops/content-approval-access.mjs`
- `lib/bloomops/content-file-access.mjs`
- `lib/bloomops/content-files.mjs`
- `lib/bloomops/portal-content-api.mjs`
- `lib/bloomops/portal-content-values.mjs`
- `lib/bloomops/portal-content.mjs`
- `scripts/content-approvals-review-local.mjs`
- `scripts/portal-content-review-local.mjs`
- `scripts/portal-content-smoke-local.mjs`
- `scripts/portal-content-smoke-worker.mjs`
- `tests/bloomops-authorization.test.mjs`
- `tests/bloomops-content-ui.test.mjs`
- `tests/bloomops-portal-content-http.test.mjs`
- `tests/bloomops-portal-content-page.test.mjs`
- `tests/bloomops-portal-content-ui.test.mjs`
- `tests/bloomops-portal-content.test.mjs`
- `tests/bloomops-shell.test.mjs`

### Historical C5 preflight: verified C4 closure and exact C5 base

C4 PR #25 merged as `5b3e3c3ac3eae69b75310f73f9f54c7a85edc095`, the exact requested C5 base. Read-only checks confirmed [Deploy staging 34333717208](https://github.com/Beeyach/bloomops/actions/runs/34333717208) and [Verify zero-to-current 34333717121](https://github.com/Beeyach/bloomops/actions/runs/34333717121) both completed successfully on that SHA; the C5 contract records successful disposable cleanup. Branch preflight was clean and contained only the C5 phase contract and temporary prompt after the base. All requested preflight documents and relevant C1–C4 implementation/tests were read before implementation.

## Approvals + Revision History (C5)

Additive `0017_c5_content_approvals.sql` adds `content_review_revisions` (13 columns) and `content_approval_rounds` (18 columns), seven indexes and ten triggers. Composite workspace/Content/revision FKs and workspace membership provenance FKs prevent cross-parent references. Revision insertion validates the exact current structured copy and platform labels; updates/deletes are refused. Round insertion fixes its matching revision/number, a partial unique index permits one Requested round, and update/delete triggers allow exactly one terminal decision without rewriting earlier provenance or feedback. Current inventory: 18 domain migrations, 41 domain tables, 77 total fresh tables including inherited tables/ledgers, 100 migration-defined indexes, 37 triggers. Migrations 0013–0016 and every prior snapshot table definition are unchanged; Content is not rebuilt.

### Implementation decisions

- `content_items.revision` remains the shared CAS counter; every request/response/withdraw consumes it. Each request separately allocates a durable review ID and monotonic per-Content round number. No extra approval status lives on Content, and activity never owns approval state.
- Owner/Admin/PM request and withdraw under current C1 scope. Team may read current scoped history, not coordinate formal approval. PM/Team restricted access requires exact Client/Social Service assignment; department/owner/Project/Action relationships grant nothing.
- Request requires `client_review`, Client approval enabled, Client eligible visibility, valid live Client/optional canonical Social Service, expected CAS and no open round. One D1 batch captures current SQL fields/platform labels, inserts revision/round/activity and consumes CAS without changing stage. Immutable requester/request-key/consumed-revision evidence makes identical retries converge.
- Requested freezes reviewed title/type/hook/script/caption/CTA/date, all workflow flags, platform associations and stage/context through conditional writes plus database triggers. Visibility, identity/membership/role/workspace, contacts and assignments remain live/revocable. Pillar and internal owner remain editable. Request/edit/platform/date and response/response/withdraw/edit/stage races cannot produce conflicting canonical facts.
- Any currently linked active Client contact for the exact Client may respond via the narrow endpoint. Approve resolves that round and moves Content to Approved. Changes Requested requires 1–2,000 normalized UTF-16 units of plain-text feedback, stores durable round feedback and updates current C2 Revision Requested context. Withdraw preserves revision/history, records coordinator/time/reason, leaves Client Review and unlocks edits. New requests create new rounds, never overwrite old ones.
- C2 direct internal Client Review → Approved is blocked when approval is required; Requested also fences direct internal Revision Requested. Internal Review rework, Revision Requested → Editing, approval-disabled skips and Published terminal behavior remain. C2 retry evidence excludes C5-generated stage events.
- Portal Home adds only conditional “Approval needed” links and `/portal/approvals/[roundId]`. Exact snapshot keys: `title,type,hook,script,caption,cta,targetPublishDate,platforms`; envelope: `id,number,requestedAt,snapshot`. Plain-text rendering excludes internal pillar/owner/membership/CAS/context/activity/Service/Department/storage authority. C4 has no immutable File versions, so **all Files are explicitly excluded from review snapshots**. No R2 access or File mutations occur in approvals.
- Client GET is actionable-only. A completed POST retry may acknowledge only the same responder and normalized decision/feedback under live current access; it returns no history or snapshot. The browser keeps a just-completed confirmation. Coordinator withdrawal retry similarly matches original coordinator/reason/consumed CAS.
- Internal history is 20 rounds/page in descending round order, with safe current names for durable provenance memberships, timestamps, feedback/reason and expandable snapshots. Home uses an eligible-only 200+1 SQL bound; hidden rows cannot alter counts/overflow/empty state. Relational assignment predicates avoid bind-list growth; platform/snapshot/history reads perform no per-row API/File/R2 queries. Client operational history continues to filter each Content event by current Content readability.
- Shared exact JSON/query, authorization-before-input, Origin, no-store and safe failure conventions remain. No new dependencies, providers, deployment configuration, queues or notifications were added. Cloudflare D1/Workers/Wrangler guidance informed atomic batches and disposable runtime verification; latest Workers types `5.20260908.1`, pinned Wrangler schema and current D1 batch documentation were inspected. The live design reference loaded and was visually inspected; existing Bloom primitives/editorial spacing are reused.

### C5 verification evidence (2026-09-09 local session)

| Check | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; no package/lock changes |
| Focused C5 schema/domain/access/HTTP/UI/concurrency | 139/139 passed |
| Combined C1–C5 Content regression | 599/599 passed (C1 133, C2 105, C3 111, C4 111, C5 139) |
| B1–B7 Work regression | 946/946 passed |
| Exact Release A/core command retained below | 421/421 passed |
| Full `npm test` | 4,629/4,629; zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available lint/type checks; final Worker rebuild includes the browser anchor correction |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22; fresh schema/ledgers, exact no-op second pass, disposable cleanup |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 actual workerd/D1/R2 checks; two-round story, preserved C4 bytes, C3 projections, lock races, late rollback, retries, real issued-session revocation, large scopes |
| C4/C3/C2/C1 runtime smokes | 64/57/54/43 passed |
| B1/B2/B3/B4/B5/B6/B7/A11 runtime smokes | 25/28/47/38/42/34/86/26 passed |
| Built `auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed |
| Local external `verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed |
| `content-approvals-review-local.mjs` browser/HTTP | Final complete run 91/91; 53 captures at 1440/1024/768/390/320; two-round long-copy/feedback story, keyboard/focus, touch, reduced motion, distinct Clients, current revocations |
| Changed JS/JSX syntax; `git diff --check` | 44 files parsed; no whitespace errors |
| Drizzle schema/snapshot consistency | Generate reports no schema changes; no additional migration created |
| Dependency comparison against exact C4 base | Same 53 advisories/affected packages (1 low, 43 moderate, 9 high, 0 critical); zero advisory/package delta and byte-identical package manifests/lockfile |

Focused commands: `node --test tests/bloomops-content-approvals-*.test.mjs`; combined Content uses the C1 `{access,domain,http,schema,ui}` pattern and C2 `content-pipeline-*`, C3 `content-calendar-*`, C4 `content-files-*`, C5 `content-approvals-*`. Work uses `tests/bloomops-{projects,milestones,actions,deliverables,files,projections,release-b}-*.test.mjs`. The exact 421-test Release A/core command remains in the B6 section below. Full tests use `PATH=/tmp/bloomops-c4-tools-SGrX9Q:$PATH npm test` for the host's missing `python` alias; installed `/usr/bin/python3` executes the five inherited packaged-skill ZIP tests without changing application/test behavior.

The browser command is `LD_LIBRARY_PATH=/tmp/bloomops-c4-tools-SGrX9Q/browser-libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --playwright /tmp/bloomops-c4-tools-SGrX9Q`. Its final pass checks 53 layouts, including two expanded immutable history snapshots, 1,498-character feedback, request/approval/withdrawal dialogs, frozen edit fields and both Client/coordinator touch controls. Screenshot inspection included the live reference, narrow review copy, 320px request/feedback dialogs and their visible focus rings. During development the browser caught a missing history anchor (fixed locally in C5), optional-label selectors were corrected, and its feedback assertion was aligned with the existing outer-whitespace normalization after inspecting stored round/context equality. No production rule was weakened. Earlier incomplete browser runs do not count as final evidence.

The exact-base audit ran from an isolated temporary extraction of `package.json` and `package-lock.json` at `5b3e3c3ac3eae69b75310f73f9f54c7a85edc095`, using `npm audit --package-lock-only --json` for a like-for-like comparison. Advisory IDs/affected package sets, ranges, severities and counts match. npm's transitive `effects` attribution differed for two Tiptap entries between installed-tree/lock-only reports; this is not a dependency or advisory change. No upgrade or audit-fix command ran.

Raw evidence lives in `/tmp/bloomops-c5-*`, not durable CI artifacts. Browser tooling/libraries and the inherited Python alias are reused outside the repository at `/tmp/bloomops-c4-tools-SGrX9Q`; no app dependency change was made. The local preview's in-memory loopback origin override leaves the developer's `.dev.vars` unchanged. Browser fixtures use fresh synthetic local workspaces and example.com identities; they are not staging or production business data. Disposable workerd and zero-to-current databases/configs are removed by their harnesses; browser fixtures remain local development state. Existing login rate limits occasionally required bounded local waits and were not changed. The requested temporary prompt was deleted and has zero net diff against the exact C4 base. The final PR body carries the exact head SHA and complete changed-file inventory.

Final net scope is 53 changed paths against the exact C4 base, including the C5 contract and generated migration snapshot. The owned loopback preview was stopped after verification; other development processes and `.dev.vars` were left untouched. The final external verifier was rerun after its first post-smoke attempt correctly hit the unchanged sign-in rate limit; only the complete 21-check pass is counted.

Deliberate limitations: structured copy/date/platform review only (no File review/versioning), no named-reviewer assignment, no general Client Content portal/navigation/history, no comments, notifications/email, providers/publishing, templates, generalized Deliverable approvals, C6/C7, Ads/Systems, production/DNS, real payments, staging business-data writes or Leadsthatbloom changes. Existing 53 inherited dependency advisories remain out of scope. C5 closure and any remote C5 deployment/gate are not claimed. Next phase is C6 only after independent audit, delegated/user-controlled merge, both exact-merge-SHA gates, and a separate implementation instruction.

## Historical C4 handoff

### Verified C3 closure and C4 base

C3 PR #24 merged as `6be5b4d668545d630c463e0a6b457ce7d53d6338`, the exact requested C4 base. Read-only checks verified [Deploy staging 34296771989](https://github.com/Beeyach/bloomops/actions/runs/34296771989) and [Verify zero-to-current 34296772032](https://github.com/Beeyach/bloomops/actions/runs/34296772032) succeeded on that exact SHA, including the successful create/migrate/twice/verify/delete step. C4 preflight changed no remote resources. Branch history contained the authorized C4 contract and temporary prompt after this base.

## Recordings + Content Assets (C4)

Migration `0016_c4_content_assets.sql` adds one five-column fixed `content_asset_links` table: File primary key, workspace, Content, exact `recording|asset` purpose and creation timestamp. It has workspace/composite asset/composite Content FKs, a workspace/Content index, immutable update/delete triggers, and insert triggers excluding both attachment-family orders. The snapshot chain preserves every previous table exactly. Migrations 0012–0015 are unchanged. Current inventory: 17 domain migrations, 39 domain tables, 75 total fresh tables including inherited tables/ledgers, 93 migration-defined indexes and 27 triggers.

Canonical `assets`, `asset_upload_attempts` and private `FILES` R2 bytes remain the sole storage system. A fixed-parent policy adapter shares B5's reserve/write/finalize, recovery generations, checksum validation, CAS changes, cleanup and download protocol. B5 `file.manage` stays coordinator-only. The common lost-finalize-response branch now also reauthorizes after its R2 head await. Ready still needs server-computed SHA-256 and matching R2 key/size/MIME/etag/checksum, one readiness timestamp and one canonical `FILE_UPLOADED` event. Unknown D1 outcomes never authorize blind deletion; recovery uses fresh keys and old writers cannot win. File operations never update Content, platform associations, dates, publication or parent lifecycles.

Internal Content file management uses the dedicated `content.file.manage` action capped by current C1–C3 readability. Team requires exact Client or Social Service assignment; restricted Content or Files require that exact assignment for PM/Team. Department, owner, Project and Action relationships grant nothing. SQL rechecks current membership/workspace/identity/role/parents at every relevant read and committing batch.

Client access is only `recording.view` / `recording.upload`: current contact linkage, shared Content, recording required, Waiting for Recording, canonical same-client optional Social service, and shared recording-purpose File. All eligibility is rechecked at reservation, retry, finalization and before/after R2 downloads. Clients retry only their own upload. They cannot choose visibility, change purpose/parent, archive, change visibility, or access production assets. Server-selected upload visibility is `client`.

The conditional Home “Recording needed” section links to `/portal/recordings/[contentId]`; there is no general Content/Social portal destination. The request DTO is exactly `id,title`; title is explicitly client-safe for an eligible recording request. File DTO is exactly `id,filename,mimeType,byteSize,status,readyAt`. Non-ready entries are shown only to their uploader for retry; only Ready can download. Both Waiting and Revision Requested `stage_context`, all editorial copy except title, owner, revision, internal activity, service IDs, storage authority and hidden counts stay private. Request projection is at most 200 eligible rows, filtered before limiting, with no hidden-row overflow indicator.

Content has a deliberate 200-File lifetime cap including archives, atomically enforced in reservation. Lists are bounded SQL with no R2 probes. Internal Content File history and Client history filter historical filenames through current File+Content authority, including archive. A separate bounded Content-file history query merges with B5 history by timestamp/rowid so the combined Client query stays below D1's 100-bind ceiling. B5 Home/Project projections remain B5-only.

### Deliberate recording limitation

Retained B5's 5 MiB (5,242,880 bytes) positive-byte limit and unchanged `assets` CHECK. Current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) specify 128 MB per isolate, not per request. Existing bounded upload parsing plus `crypto.subtle.digest` holds the bounded bytes in memory; larger media requires a separately designed protocol/migration, not changing a number. Current [R2 binding docs](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and published Workers types `5.20260908.1` confirm server-supplied SHA-256 integrity checking and returned checksums. The exact 5 MiB boundary passed real R2. Unknown browser MIME uses `application/octet-stream`; MIME is syntactically validated, not a malware/content verdict. No scanner, transcoding, multipart protocol, public URL, presigned URL or third-party upload service was added. The portal explains short clips and asking the agency about larger recordings.

### Verification evidence (2026-09-08 local session)

| Check | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; no package/lock changes |
| Focused C4 schema/domain/access/HTTP/R2/UI | 111/111 passed |
| C3 / C2 / C1 focused regression | 111/105/133 passed |
| B7 / B1 / B2 / B3 / B4 / B5 / B6 focused | 29/97/173/203/197/171/76 passed |
| Release A/core command retained below | 421/421; updated shell included in full suite |
| Full `npm test` | 4,490/4,490; zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22; fresh schema, complete ledgers, exact no-op second pass, disposable cleanup |
| `node scripts/content-files-smoke-local.mjs` | 64/64 actual workerd/D1/R2; includes real Better Auth-issued Client/Team sessions revoked during binding awaits |
| C3 / C2 / C1 runtime smokes | 57/54/43 passed |
| B1/B2/B3/B4/B5/B6/B7/A11 runtime smokes | 25/28/47/38/42/34/86/26 passed |
| Built `auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed |
| Local external `verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed |
| Browser/HTTP | Final complete run 75/75, 47 captures at 1440/1024/768/390/320; keyboard/focus, touch, reduced motion, two-Client story |
| Changed JS/JSX syntax; `git diff --check` | 39 files parsed; no whitespace errors |
| Dependency audit | Exact current base and head vulnerability objects identical: 53 (1 low, 43 moderate, 9 high, 0 critical) |

Focused commands use `node --test tests/bloomops-content-files-*.test.mjs`, the existing C1/C2/C3 patterns, each B1–B7 pattern and the Release A/core command retained in B6 below. Full tests use a temporary PATH alias from `python` to installed `/usr/bin/python3` for five inherited packaged-skill ZIP checks; no application/test behavior was weakened. Browser dependencies were installed outside the repository in `/tmp/bloomops-c4-tools-SGrX9Q`, with extracted shared libraries on `LD_LIBRARY_PATH` because the host lacks them. The live design reference loaded successfully and was visually inspected.

The checked-in browser harness is `scripts/content-files-review-local.mjs`; pass `--playwright /tmp/bloomops-c4-tools-SGrX9Q` in this environment. It uses only loopback development D1/R2 and synthetic identities. The local preview helper overrides only its in-memory app URL to its actual `http://localhost:8787` origin; the developer's existing `.dev.vars` remains untouched. Initial simultaneous fixture/bootstrap runs hit SQLite locking and auth rate limiting; completed evidence runs are serialized, and only complete passes count. Production auth limits remain unchanged. The C4 disposable runtime applies pinned Wrangler Node-compat shims with an unconditional dry-run and a generated config containing no remote bindings; this supports Better Auth's optional Node dependency imports without changing app compatibility flags.

Raw evidence is local `/tmp/bloomops-c4-*`, not durable CI artifacts: focused/full/build/CF/zero/runtime/HTTP/verifier logs, base/head audit JSON and browser screenshots. The exact base audit ran from a detached temporary worktree. Byte authorization is checked before handing off the response stream; delivered bytes cannot be recalled. Cleanup remains B5's bounded explicit-retry cleanup, not an orphan sweeper. 53 inherited advisories remain out of scope, with zero C4 delta. No remote C4 migration/deployment, real email, staging business data, provider operation, production, DNS or Leadsthatbloom mutation occurred.

Final scope is 47 changed paths against the exact C3 base, including the phase contract and generated migration snapshot. `C4_CODEX_PROMPT.txt` was removed as instructed and has zero net diff against that base. The final PR body carries the complete changed-path inventory and final commit SHA. Screenshot inspection included the live design gallery, internal long-filename layout, and client upload dialogs at 390/320 pixels; controls, focus rings and the short-clip explanation remain readable.

C5 approval rounds/revision history and C6 general Content portal, notifications, comments, templates and provider publishing are intentionally absent. The next planned phase is C5, only after independent audit, user-controlled C4 merge and both exact-C4-merge-SHA gates, then a separate implementation instruction. C4 must remain OPEN/UNMERGED for independent audit.

### Verified C2 closure and C3 base

C2 PR #23 merged as `fed68697ff9f45e5c0228655bec2aaee3583f1c2`, the exact requested C3 base/main SHA. Read-only preflight verified [Deploy staging 34291205923](https://github.com/Beeyach/bloomops/actions/runs/34291205923) and [Verify zero-to-current 34291205922](https://github.com/Beeyach/bloomops/actions/runs/34291205922), including the successful create/migrate/twice/verify/delete step, on that exact SHA. Branch history contains only the authorized C3 contract/prompt after that base before this implementation. C1 closure remains recorded in the historical sections below.

## Calendar + Platforms (C3)

The additive `0015_c3_calendar_platforms.sql` introduces only the four-column relational association table, its composite primary key, workspace and composite Content foreign keys, two bounded text checks and one platform-filter index. Content retains all 24 C2 columns and gains two indexes (seven total): workspace/id uniqueness for the FK and workspace/target-date/id for calendar ordering. The journal contains 16 migrations and domain schema 38 tables. C1/C2 migrations and triggers, dependencies/lockfile, Worker configuration and R2 subject model remain unchanged.

### Implementation decisions

- Canonical docs/history, including original model commit `0757d45`, specify associations but no fixed provider vocabulary. Labels are user-entered channels, normalized NFC/outer whitespace/internal spacing, with lowercase normalized keys. A set has 0–12 distinct labels, each 1–60 UTF-16 units; keys allow 120 units for case expansion. Controls, all Unicode format characters/bidi and malformed UTF-16 are rejected. Duplicate normalized keys reject atomically. Display spelling survives; case-only label edits are significant. Code-point sorting matches SQLite BINARY ordering for astral/BMP mixtures.
- Initial platforms share the existing creation batch and immutable request provenance. Legacy creation events mean an empty initial set. The dedicated PUT accepts only platforms/expectedRevision, replaces the complete relational set, and shares strict Content CAS with details and C2 transitions. Current identical/empty-removal sets are silent no-ops. Significant changes append one `CONTENT_PLATFORMS_CHANGED` event. Current-readable immutable consumed-revision evidence acknowledges identical response-loss retries after later changes without restoring an old set; incompatible reuse conflicts.
- Activity, conditional deletion/insertion and the final revision/timestamp update are one atomic D1 batch. Every committing predicate rechecks live Identity → Role → Scope → Visibility and the expected revision. Keeping the revision update last lets every statement use the same unconsumed CAS condition. Revocation/restriction fences writes; late failures roll back facts and history. Parent, stage, flags, context, target date and publication timestamp remain unchanged.
- Calendar GET requires exact real start/end dates, inclusive 1–42 days, plus the existing exact Content filters and platform. Protected authorization precedes invalid/duplicate query and body handling, with Origin/no-store/safe error mapping preserved. The single SELECT uses relational assignments, date/ID ordering and visible 200+1 overflow; correlated bounded platform aggregation and EXISTS filtering avoid duplicate Content rows or N+1 requests. No R2 access or calendar writes exist.
- Dates stay floating YYYY-MM-DD values in the existing helper's supported 0100–9999 range. The UI defaults to the UTC current month; published timestamps remain C2 instants and do not relocate planned dates. Undated Content stays in the list. Stable offset pages can shift under concurrent edits, just as C1 pages can.
- The monthly agenda groups complete rows by date. Inspection found the inherited seven-column calendar draggable and title-only, unsuitable for long titles, multiple channel labels and 200 same-day items at narrow widths. C3 keeps explicit date edits in the canonical form. Social list retains stage filters, adds platform filtering, and create/edit/detail expose platform editing with field errors and safe conflict reload. No per-day item clipping or drag/drop mutation is introduced.

### Verification evidence

Only final completed runs count below. Node 22.22.1 is used. Browser tooling is installed outside the repository; local example.com identities and development R2 mail only. No staging business-data writes, production actions, provider calls, real email, DNS or Leadsthatbloom changes occur.

| Command / check | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; package/lock unchanged |
| Focused `bloomops-content-calendar-*.test.mjs` | 111/111: access 44, domain 48, HTTP 11, schema 2, UI 6; final strengthened access rerun 44/44 |
| C2 pipeline / C1 Content regressions | 105/105 and 133/133 |
| B7 / B1 / B2 / B3 / B4 / B5 / B6 focused regressions | 29/97/173/203/197/171/76, all passed |
| Release A/core command in B6 below | 421/421; additional updated shell suite 17/17 |
| Final `npm test` | 4,379/4,379; zero failures, cancellations or skips; exit 0 |
| `npm run build` / final `npm run cf:build` | Both passed; final CF build includes Next/lint/type checks; exit 0 |
| Fresh/no-op local zero-to-current | 22/22; all 16 migrations, identical second-run schema/ledgers, cleanup complete |
| C3 actual disposable workerd/D1 | 57/57; no R2 binding |
| C2 / C1 actual workerd/D1 | 54/54 and 43/43 |
| B1/B2/B3/B4/B5/B6/B7/A11 actual D1/R2 smokes | 25/28/47/38/42/34/86/26, all passed |
| Built Worker `auth-smoke-local.mjs` | Final isolated rerun 144/144; exit 0 |
| Local external `verify-staging.mjs` | 21/21 on development loopback; exit 0 |
| C3 browser/HTTP acceptance | 120/120; 38 captures at 1440/1024/768/390/320; keyboard/focus, touch, reduced motion, dense dates, range edges and issued-session revocation; exit 0 |
| Changed JS/JSX syntax / `git diff --check` | 32 changed paths parsed; whitespace clean |
| Dependency audit / exact-base comparison | 53 current advisories; complete base/current JSON identical; +4 high vs historical 49 |

The full suite exposed a stale internal-shell page-count assertion, updated from 20 to 21 while retaining server authorization checks and adding the calendar to anonymous redirect coverage. Early source/test failures and interrupted runs are not counted as passes. Initial concurrent browser fixture setup and HTTP smoke collided on local SQLite and the HTTP harness's global user/membership counts; the completed HTTP and browser evidence runs are serialized. Browser harness selectors distinguish the named Platforms section from its textbox, and the workspace-revocation case retains its revision before revocation. Only a complete successful browser rerun counts. Protected application behavior and auth rate limits were not weakened.

### Evidence limitations and gate

The live design reference was successfully loaded past the “Design gallery” heading and visually inspected. The final browser captures are `/tmp/bloomops-c3-review-final3`; the final browser/full/HTTP logs are `/tmp/bloomops-c3-browser-final3.log`, `/tmp/bloomops-c3-full-final.log` and `/tmp/bloomops-c3-http-final.log`. Screenshots and raw logs/audit JSON are local `/tmp/bloomops-c3-*` artifacts, not permanent CI artifacts. Runtime harnesses are checked in and reproducible. The local zero verifier proves fresh/no-op schema and cleanup; it is not a C3 post-merge remote gate.

Contemporary `npm audit --json` reports 53 advisories (1 low, 43 moderate, 9 high, 0 critical) for both C3 and an external directory containing the exact base package/lockfile. Their full JSON outputs are identical and package/lock diff is zero. This is +4 high advisories versus the historical 49-advisory baseline (previously 1 low, 43 moderate, 5 high), with zero C3-vs-current-base delta. Historical raw audit JSON is absent after the session environment reset, so historical advisory-by-advisory attribution is not claimed. Dependency remediation remains inherited work, outside C3.

Final scope is 41 changed paths against the exact base; the temporary prompt has zero net diff. The owned local preview was stopped intentionally with SIGINT (wrapper exit 130), and port 8787 was confirmed closed; this is cleanup, not a failed verification check.

C4 recordings/Content assets, formal approvals/revision history, Client Content portal, comments, notifications/templates and provider publishing/integrations are intentionally absent. The PR must stay OPEN and UNMERGED for independent ChatGPT audit. Only after audit, user-controlled merge, and Deploy staging plus Verify zero-to-current on that exact C3 merge SHA may C4 start.

## Production Pipeline (C2)

Historical C2 implementation evidence follows. C2 is now closed through PR #23 and the exact-SHA gates recorded above. The narrow additive migration is `0014_c2_content_pipeline.sql`. It adds nullable current `stage_context` and one stage-filter index to canonical Content: 24 columns and five Content indexes. There is no new table, duplicate status, identity key or approval model. Historical migrations, C1 triggers, package/lock and Worker configuration remain unchanged.

### Implementation decisions

- The shared pure resolver derives the exact next applicable forward stage from current Content stage and flags. Recording, internal review and Client review are skipped only when their corresponding flag is false. Disabling a flag in its current stage preserves that stage and changes future resolution only.
- Only Internal Review/Client Review may request revision; Revision Requested returns only to Editing. Both waiting and revision entry require NFC/line-ending-normalized, nonempty context, bounded to 2,000 UTF-16 units with controls/bidi/malformed-Unicode rejection. Context lives on Content and clears when leaving the contextual stage. Historical C1 null context remains valid; there is no invented backfill.
- Published is terminal and receives its server timestamp only in the winning commit. Detail edits and retries cannot rewrite it. Approved is production state, not formal Client approval; Scheduled adds no calendar/platform behavior. C1-assigned Team fulfillment remains valid for all legal steps, including Approved; coordinator wording does not invent a new role restriction.
- The dedicated `content.transition` policy and POST endpoint retain C1 Identity → Role → Scope → Visibility. Owner/Admin coordinate; PM restricted and Team fulfillment require exact current Client/Service assignment. Owner, Department, Project and Action-only responsibility never grant Content access. Clients receive no internal Content or stage history.
- Every committing condition rechecks active workspace, membership/user/role identity, canonical same-workspace Client/optional Social Service, assignment, visibility, expected revision, source stage, three current flags and absent publication. Conditional activity and fact update use one atomic D1 batch; revocation or stale facts prevent both, and a late failure rolls both back.
- Content ID + consumed expected revision identify an operation without another request-key column. One immutable `CONTENT_STAGE_CHANGED` event records small from/to/context/revision facts. Exact retry under current read authorization acknowledges the operation, even after later edits or revision passes, without rewriting current state. Different target/context or an edit-consumed revision conflicts. Merely matching the current stage never proves a retry. Two identical concurrent transitions create one fact/revision/event; different transition/transition or transition/edit races have one winner.
- A reproduced C1 eligibility-window race needed one narrow correction: an edit whose revision is consumed after its initial read now returns conflict instead of a field-validation error. Owner/visibility validation remains unchanged when the revision is current. The regression injects a real transition between the detail read and eligibility query.
- Ordinary detail payloads still reject stage, publication and current context. The transition endpoint accepts exactly targetStage/expectedRevision/optional context, rejects all query keys and malformed/non-object JSON, authorizes first, and preserves Origin/no-store/sanitized 400/401/403/404/409/500 boundaries.
- Social detail exposes only legal controls with the existing Bloom dialog, required context, keyboard focus restoration and safe conflict/revocation reload. The existing list gains exact stage filtering over canonical facts with its bounded 200+1 pagination. No drag/drop or future-phase controls were added.

### Verification evidence

Node `22.22.1`; final completed runs alone count. Interrupted development checks were restarted and are not counted as passes. The shared HTTP verifier initially met a magic-link 429 after browser sign-ins; after the existing 60-second limiter expired, its complete rerun passed. No auth behavior or limits were changed.

| Command / check | Result |
|---|---|
| `npm ci` | 560 installed / 561 audited; package/lock unchanged |
| `node --test tests/bloomops-content-pipeline-*.test.mjs` | 105/105: access 49, domain 35, HTTP 10, schema 2, UI 9 |
| `node --test tests/bloomops-content-{schema,domain,access,http,ui}.test.mjs` | C1 133/133 |
| Separate B7/B1/B2/B3/B4/B5/B6 regression runs | 29/97/173/203/197/171/76, all passed |
| Exact Release A/core command retained in B6 below | 421/421 |
| `npm test` | Final 4,268/4,268; zero failures, cancellations or skips; exit 0 |
| `npm run build` | Passed including lint/type checks; final CF build reruns it |
| `npm run cf:build` | Final source passed with nested Next/lint/type checks; exit 0 |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 fresh/no-op, cleanup complete |
| `node scripts/content-pipeline-smoke-local.mjs` | Final actual disposable workerd/D1 54/54 |
| `node scripts/content-smoke-local.mjs` | Final actual C1 workerd/D1 43/43 |
| Prior B1/B2/B3/B4/B5/B6/B7/A11 D1/R2 smokes | 25/28/47/38/42/34/86/26, all passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | Final built Worker HTTP 144/144; exit 0 |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | Local external verifier 21/21; exit 0 |
| `node scripts/content-pipeline-review-local.mjs --out /tmp/bloomops-c2-review-final` | C2 128/128, 43 captures across 1440/1024/768/390/320; exit 0 |
| `node scripts/content-review-local.mjs --out /tmp/bloomops-c2-c1-review-final` | C1 96/96, 33 captures across the same five widths; exit 0 |
| Changed JS/JSX syntax / `git diff --check` | 23 paths passed Node/esbuild parsing; whitespace clean |
| `npm audit --json` vs saved C1 and contemporaneous exact base | 49 advisories; identity/range/severity/count delta zero; two dependency effects-link differences described below |

Fresh/no-op verification: 60 inherited + 15 domain migrations, 37 domain / 73 total tables, 89 explicit indexes, 23 triggers, clean integrity/foreign-key checks and identical schema/ledgers after replay. The local disposable directory was cleaned up. C1 schema/runtime assertions now preserve their 23-column prefix while C2 asserts the current 24-column model.

The actual C2 D1 smoke covers all flag paths, Published terminal/retry, both revision branches, context bounds, current-stage flag edits, exact restricted scope, three race shapes, response-loss after edits, late fact/activity rollback, assignment/membership/role/workspace/Social-parent/visibility commit fencing, ordinary-edit authority, parent lifecycle isolation, stage filtering and 240 assignments inside actual D1 limits. Node tests additionally exhaust the source/target matrix, Unicode/JSON/revision bounds, all responsibility non-grants, identity/flag/source-stage fencing, exact restricted PM/Team scopes, current history filtering and the eligibility-window race. No Release A/B parent lifecycle changes.

Dependency audit remains 49 (1 low, 43 moderate, 5 high; zero critical). The audit command exits 1 for these existing advisories. Compared with retained `/tmp/bloomops-c1-audit.json` and a contemporaneous audit of exact-base package/lock in an external temporary directory, advisory package identities, source/ranges, severity and counts are unchanged. npm reports two transitive `effects` attribution changes: the drag-handle-react edge moves from `@tiptap/extension-drag-handle` to `@tiptap/react`. All other vulnerability-entry fields match. This is a zero-advisory delta, not a zero-advisory tree or byte-identical graph report. No dependency or lockfile was changed.

### Changed-file inventory

Net against exact C1 base: **32 paths**, including the supplied C2 contract and excluding the removed temporary prompt.

- Schema (4): `lib/bloomops/schema.mjs`, `drizzle/0014_c2_content_pipeline.sql`, `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json`.
- Domain/boundaries (7): `lib/bloomops/content-pipeline-values.mjs`, `content-pipeline.mjs`, `content-values.mjs`, `content.mjs`, `authorization.mjs`, `activity.mjs`, `client-activity.mjs`.
- API (1): `app/api/bloomops/content/[contentId]/transition/route.js`.
- UI (2): `components/bloomops/ContentPipeline.jsx`, `ContentViews.jsx`.
- Verification (12): three `scripts/content-pipeline-*.mjs`, `scripts/content-smoke-worker.mjs`, five `tests/bloomops-content-pipeline-*.test.mjs`, and existing authorization, Content schema and global schema tests.
- Documentation (6): this build state, domain model, index, Release C, C1 closure and C2 contract/evidence.

### Limits and handoff

All runtime verification is local: pinned Miniflare/workerd, disposable smoke D1/R2, and isolated development D1/R2 with example.com/R2 development mail for the built Worker. Playwright/Chromium stays outside the repository at `/tmp/bloomops-a11-browser`; session logs/captures are under `/tmp/bloomops-c2-*`. The owned loopback preview was stopped after acceptance. The live Bloomlab Design gallery loaded and was visually inspected. C2 browser acceptance covers all eight flag paths, both revision branches, context persistence, legal controls, terminal publication, safe conflicts, stage filtering, exact Team/restricted PM scope, Client denial, competing writes, current-session assignment/membership/role/workspace revocation, real touch and reduced motion. Long waiting/revision dialogs and detail, Published, conflict and filtered-list views passed geometry/controls at every required width. Mobile dialog/conflict and desktop revision captures were visually inspected. C1 create/edit/list/overflow acceptance also remains green. Browser fixture corrections used the canonical Client relationship-status column and awaited the actual transition response/reload link instead of the unrelated global toast alert. These checks do not replace exact-merge-SHA staging gates or constitute production/load certification. Existing offset pagination can shift with concurrent insertions; current null context on historical C1 stage rows remains possible. Retry provenance is bounded per event but retained in existing append-only activity, not a new approval-history model.

Temporary `C2_CODEX_PROMPT.txt` deleted with zero net diff against exact main. C3+ remains intentionally unimplemented: calendar/platforms, recording/File subjects, formal approval rounds, revision-history UI, Client Content portal, comments, notifications, templates and Ads behavior. No production, staging business data, DNS, real communication or Leadsthatbloom resources changed. Open PR must remain unmerged for independent ChatGPT audit; only user-controlled merge and both successful post-merge workflows on the actual C2 merge SHA unlock C3.

The C1 and earlier sections below retain historical implementation evidence; their earlier pre-merge scope/status language is superseded by current closure and C2 state above.

## Content Items Core (C1)

C1 is closed on exact merge `f1003c236cbce5102efcddd1bf7cda20e4f8ed8b` with both successful post-merge gates recorded above. The following is retained C1 implementation evidence. Migration `0013_c1_content.sql` adds one canonical `content_items` table: 23 columns, four justified indexes, four foreign keys and two narrow triggers. No historical migration, package/lock, Worker binding/configuration or A/B lifecycle is changed. The migration/snapshot chain remains additive.

### Implementation decisions

- Client-level Content or an optional fixed same-Client Social Service; canonical Service Type → Department slug `social` resolution, never names/type slugs. Existing Client/Service composite keys are reused. Closed/terminal Service status is not an invented Content restriction.
- Exact types: Reel, Static Post, Carousel, Story, Video, Email, Ad Creative, Other. Machine values and labels live together in `content-values.mjs`. Ad Creative is a type only.
- Title/type/pillar/owner/hook/script/caption/CTA, target publish date and exact workflow booleans are relational fields. Text limits are 200/120/2,000/20,000/10,000/1,000 respectively for title/pillar/hook/script/caption/CTA; NFC and line-ending normalization, optional blank-to-null, controls/bidi/malformed UTF-16 rejection. Flag defaults are recording false, internal review true, Client approval true.
- Storage contains all ten Release C stages; every C1 create is Idea with no published timestamp, and neither API nor UI accepts stage/published mutation. Visibility defaults internal; `client` is explicitly future eligibility with no portal access.
- Owner/Admin coordinate the workspace. PM coordinates ordinary Content; PM/Team restriction requires a current explicit Client/exact Service assignment. Team may read/create/edit inside that canonical scope. Client assignment reaches Client-level and that Client's Social-service Content; Service-only assignment reaches exactly that Social service. Department, owner, Project and direct Action assignment never grant Content scope.
- Every read/committing write fences current workspace, membership, role, parent, scope and visibility with relational SQL. Existing generic live-actor SQL is reused without an unrelated rename/refactor. Client activity now filters historical Content events by current readability, preventing old titles from surviving scope/restriction changes.
- Lowercase UUIDv4 request identity is unique per workspace/Client. Immutable `CONTENT_CREATED` activity snapshots normalized initial details and exact Service context. Identical retry after edits returns the same record unchanged; incompatible reuse/retargeting conflicts. Strict edit revision CAS gives one competing winner/event; a stale identical edit still conflicts. Current-revision no-ops are silent. Fact and significant activity share a conditional atomic batch.
- Protected parent-specific POST routes authorize fixed Client/Service context before parsing JSON, supporting Service-only Team members without granting Client detail access. Internal GET/PATCH routes and list filters use exact allowlists, duplicate-query rejection, real sessions, Origin, safe errors and no-store. No internal Content fields are projected into the portal.
- `/social` now lists real records; `/social/new`, `/social/:contentId` and `/social/:contentId/edit` use native Bloom controls and an editorial reading column. Ownership is responsibility; Client eligibility and workflow intent are explained without claiming future functionality.
- Visible lists use 200-row pages plus one readable overflow row, stable creation-timestamp/ID ordering and relational scope. There is no Content lifetime cap. Offset pages can shift under concurrent insertion. Parent choices show up to 200 Client-level plus 200 Social contexts with Client-name search and truthful overflow. Owner choices show the first 200 active internal members, announce overflow, allow unset ownership and preserve an existing selected owner. Empty-scope choices reveal no owner directory.

### Verification evidence

Use Node `22.22.1`. Commands run from the repository root; successful completed runs alone count as verification.

| Command / check | Result |
|---|---|
| `npm ci` | 560 installed, 561 audited; package/lock unchanged |
| `node --test tests/bloomops-content-*.test.mjs` | 133/133: schema 27, domain 36, access 44, HTTP 22, UI 4; final focused rerun exit 0 |
| `node --test tests/bloomops-release-b-*.test.mjs` | 29/29 |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 |
| `node --test tests/bloomops-projections-*.test.mjs` | 76/76 |
| Release A/core command retained in the B6 section | 421/421 |
| `npm test` | 4,163/4,163, zero failures/skips, exit 0 |
| `npm run build` | Passed, lint/type checks included; final CF build also reruns this exact command |
| `npm run cf:build` | Final source passed, nested Next build/lint/type checks included, exit 0 |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 fresh/no-op checks, cleanup complete |
| `node scripts/content-smoke-local.mjs` | Actual disposable workerd/D1: 43/43, exit 0 |
| `node scripts/projects-smoke-local.mjs` | Actual D1: 25/25 |
| `node scripts/milestones-smoke-local.mjs` | Actual D1: 28/28 |
| `node scripts/actions-smoke-local.mjs` | Actual D1: 47/47 |
| `node scripts/deliverables-smoke-local.mjs` | Actual D1: 38/38 |
| `node scripts/files-smoke-local.mjs` | Actual D1/R2: 42/42 |
| `node scripts/projections-smoke-local.mjs` | Actual D1: 34/34; 240 assignments, max 64 bindings / 12,918 SQL bytes |
| `node scripts/release-a-hardening-smoke-local.mjs` | Actual D1: 26/26 |
| `node scripts/release-b-smoke-local.mjs` | Actual D1/R2: 86/86 |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | Built Worker HTTP: 144/144, exit 0 |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | Local external verifier: 21/21, exit 0 |
| `node scripts/content-review-local.mjs --out /tmp/bloomops-c1-review-final` | 96/96, exit 0; 33 captures (32 app + live reference), all five widths, keyboard/focus, touch and reduced motion |
| Changed JS/JSX syntax and `git diff --check` | 33 paths passed Node/esbuild syntax checks; whitespace clean |
| `npm audit --json` | 49 existing advisories; current base/branch entries identical, count/severity delta zero |

C1 actual D1 exercises exact types/Idea, canonical Social binding, role/scope/restricted access, concurrent identical creation, retry after edit, incompatible/retargeted keys, strict edit races, forbidden authority fields, four injected fact/activity rollback cases, live commit revocation, 240 assignments with two visible pages and unchanged parent lifecycles. Node/HTTP coverage adds all non-grants, current membership/role/workspace changes, exact malformed JSON/query behavior and safe 400/401/403/404/409/500 responses. Additional Client-history query inspection measured at most 77 bindings / 11,380 SQL bytes for the Team predicate.

Fresh migration evidence: 60 inherited + 14 domain migrations, 37 domain / 73 total tables, 88 explicit indexes, 23 triggers, clean foreign-key/integrity checks, identical schema and both ledgers after no-op replay, and disposable local directory cleanup.

`npm audit --json` reports 49 advisories (1 low, 43 moderate, 5 high, no critical), unchanged from B7. A contemporaneous audit of the exact base's package/lock in an external temporary directory returned identical vulnerability entries and severity counts. Package and lock have no diff. The historical B7 JSON was not retained, so this proves today's base/branch equality and continuity with recorded historical counts, not a historical advisory-by-advisory time comparison. This is not a zero-advisory dependency tree or a full transitive-dependency security audit.

All runtime evidence uses pinned local Miniflare/workerd, disposable D1 for domain smokes, isolated development D1/R2 for the built Worker, and R2 development mail or in-memory test mail. `files-preview-local.mjs` supplies the existing unconditional Wrangler dry-run bundle/shims on loopback. Playwright 1.63.0/Chromium is installed outside the repository at `/tmp/bloomops-a11-browser`; logs/captures live at `/tmp/bloomops-c1-*`. These are local session artifacts, not remote post-merge acceptance. The live Bloomlab design gallery loaded and its palette/typography were inspected. Final browser acceptance covers empty/create/detail/edit/list/overflow at all five widths, long title/editorial copy, keyboard validation focus and navigation/save, real touch targets, reduced motion, Owner/Admin/PM and Service-scoped Team operations, Client denials, retry/CAS and current-session scope/suspension revocation. Mobile and desktop/tablet captures were visually inspected. The owned preview process was stopped after successful acceptance.

Initial verification exposed expected schema/navigation/action-matrix inventory changes as C1 became real, including the B6 actual-D1 harness's former whole-journal count, plus a flaky test that changed a random UUID substring rather than the version nibble. The fixture now uses a fixed invalid-version UUID. The B6 harness now verifies its closed 13-migration prefix and runs all current migrations. These corrections preserve the prior A/B invariants. No production behavior was weakened for a test.

### Changed files by area

Net against exact closed Release B base: **44 paths** (includes the supplied Release C/C1 contract docs, excludes the removed temporary prompt).

- Schema (4): `lib/bloomops/schema.mjs`, `drizzle/0013_c1_content.sql`, `drizzle/meta/0013_snapshot.json`, `drizzle/meta/_journal.json`.
- Domain/boundaries/navigation (8): four `lib/bloomops/content*.mjs` modules, `authorization.mjs`, `activity.mjs`, `client-activity.mjs`, `navigation.mjs`.
- API (4): Content list/item and Client-level/Service-specific creation route files.
- UI (7): four Social pages, `ContentForm.jsx`, `ContentViews.jsx`, scoped additions to `app/bloomops.css`.
- Verification (14): the B6 smoke migration-prefix assertion, three `scripts/content-*.mjs` harnesses, `_content.mjs`, five focused C1 test files, existing authorization/schema/Files-schema/shell inventory tests.
- Documentation (7): this build state, domain model, index, Release B/C, B7 closure and C1 phase contract/evidence.

The temporary `C1_CODEX_PROMPT.txt` has been deleted; comparison against exact closed Release B main shows no net diff for that path. C2+ remains unimplemented: transitions, calendar/platforms, recording/File subjects, approvals, revision-history screens, Content portal, comments, notifications, templates and Ads behavior. No production, staging business data, DNS, real email or Leadsthatbloom resource was changed. Independent ChatGPT audit, user-controlled merge, Deploy staging and Verify zero-to-current on the exact C1 merge SHA remain required before C2.

The following B7 and earlier sections preserve historical implementation evidence; their original pre-merge status language is historical and superseded by the exact-SHA closure above.

## Repository Agent Instructions

2026-09-07: Repository agent instructions migrated to canonical root `AGENTS.md` before A8. `CLAUDE.md` retained only as a compatibility pointer. No product/runtime/schema behavior changed in that handoff. A8 subsequently proceeded as recorded below; `AGENTS.md` was not modified by A8.

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
- A4: one server-side authorization engine over the A2 and A3 tables (role, capability, client and service assignment scope, client-contact scope, internal/client/restricted visibility, leak-safe HTTP answers), member and invitation routes moved onto it, the inherited prospecting surfaces fenced to workspace administrators; verified by an explicit allow/deny matrix over the real schema and Better Auth sessions, the local Worker smoke, and the external verifier
- A5: the BloomOps application shells — an internal shell with the eleven PRODUCT_SPEC destinations for Owner, Admin, Project Manager, and Team Member, a separate client portal for Client, the boundary decided on the server by the A4 engine on every request, the Bloomlab-derived design system implemented in `app/bloomops.css` and `components/bloomops/`, and the inherited prospecting application moved to `/legacy` for administrators only
- A6: the Clients domain — a scoped list with lifecycle filters, create (Draft, primary contact, nobody invited), the `/clients/:id` detail with the five Release A tabs, multiple contacts with a database-enforced single primary, an internal owner that grants no access, manually managed health, and immutable operational activity in plain words; one migration, one new action (`client.create`), and an internal client resource descriptor that keeps Client memberships out of the internal surfaces
- A7: service engagements with independent lifecycles, the default departments and service types, and client-wide/service-specific team assignments; see "Services and Departments (A7)" for implementation and verification evidence
- A8: five workspace onboarding defaults, immutable version creation and atomic publishing, deterministic logical-key compilation, relational multi-version provenance, and atomic generated onboarding; audited and merged as PR #10, staging deployed successfully
- A9: authorized Draft → Onboarding activation, atomic A8 generation and core activity, durable initial-activation identity, recoverable invitation delivery, explicit portal contact linkage, and minimal internal activation/retry UX; merged with generic revoke ownership correction as PR #12
- A10: scoped onboarding portal and internal operational tab, durable Client submission, coordinator verification/completion, reasoned waiver/N/A, atomic onboarding completion and Client Active transition; merged as PR #13
- A11: twelve reproduced hardening corrections, 82 new adversarial regressions, fresh/no-op migration proof, actual workerd/D1 and built-Worker verification, and both Release A browser acceptance stories; merged as PR #14 with both post-merge gates passed on `3deed08`. Release A is closed. The following A11 section preserves its historical pre-merge evidence.

- B1: Projects Core, merged as PR #15 at `cacb2d3`, with both post-merge gates passed.
- B2: Milestones, merged as PR #16 at `74eb09a`, with both post-merge gates passed.
- B3: Actions + Dependencies, merged as PR #17 at `884051d`, with both post-merge gates passed.
- B4: Deliverables, merged as PR #18 at `ac71b35`, with both post-merge gates passed.
- B5: Files, merged as PR #19 at `4c6dad6`, with both post-merge gates passed.
- B6: Work + Home Projections, merged as PR #20 at `58647bd`, with both post-merge gates passed.

## Release B Hardening (B7)

B7 is schema-free and adds no product feature. Its production diff is limited to exact HTTP input validation and modal layer order. `release-b-smoke-local.mjs` extends the existing in-Worker D1/R2 harness; `release-b-review-local.mjs` extends the built-Worker browser harness. Neither is deployed or imported by the application.

### Reproduced gaps and narrow corrections

1. **Project body allowlists:** create, edit, transition and assignment add/edit accepted unknown fields by discarding them and applying recognized fields. This did not grant a foreign workspace or caller identity, but violated B7's exact-input acceptance requirement. Five new cases reproduced successful responses where the full request should be rejected. `projectBody` now rejects unknown fields before invoking a mutation. The prior B1 smuggling test now proves a 400 with no record creation, rather than expecting silent discard.
2. **Work query allowlists:** 22 internal/portal reads ignored invented filters, and the Project collection silently chose a value from duplicate filters. Twenty-three new cases reproduced 200 responses. A shared, small query validator runs after authorization. Only the documented Project collection filters and existing B3 Action filters are accepted; detail/child/portal routes accept none. Existing denial status and no-store behavior are preserved. Downloads cancel their prepared stream on an invalid query after retaining the existing post-R2 authorization check.

3. **Toast obstruction of mobile dialogs:** real Files browser captures showed a fresh success toast covering the Archive confirmation. An immediate `elementFromPoint` probe, while that actual five-second toast was still present, reproduced the intercepted button at 390px (`/tmp/bloomops-b7-repro-toast.log` and `bloomops-b7-repro-toast-390.png`). The modal token moves from 1100 to 1300 above notifications at 1200. No dialog layout, timer, focus logic or workflow changes. The Files browser harness now checks the real hit target at both 390px and 320px before slow history reads or screenshots can allow the toast to disappear.

The corrected HTTP suite is 28/28. Its pre-fix log is `/tmp/bloomops-b7-repro-http.log` (28 failing assertions on the unchanged runtime). Final focused evidence is `/tmp/bloomops-b7-regression-b7.log`: 29/29 node tests including one shared cross-domain matrix with 34 invariant assertions. The matrix also passes on real workerd D1/R2; it does not substitute a mock for storage acceptance. No lifecycle, scope grant, storage protocol, domain schema, package/lock, Worker configuration or workflow is changed.

### Audit coverage

| Area | Evidence and result |
|---|---|
| Identity, tenant, role, scope and visibility | B1–B6 access/HTTP regressions and real D1 smokes attack guessed/foreign IDs, current membership/workspace/role/contact, Client/Service/Project assignment revocation, Action-only scope/reassignment, restricted parent/children, Department/owner non-grants and hidden rows/history. Built B7 acceptance retains issued sessions during revocation. |
| Projects | B1 domain/schema/HTTP suite plus B7 real edit/edit and edit/status races, request-input rejection and late fact failure rolling back the earlier activity receipt. Health and child lifecycles remain independent. B1 intentionally has no creation request key; same-name creates remain distinct. |
| Milestones | B2 lifecycle/progress/order/access/HTTP suite, actual 200-row reorder, and B7 overlapping reorder/reorder, reorder/status and reorder/create preserve revisions, complete sets and unique slots. |
| Actions/dependencies | B3 lifecycle, assignment, seven views/seven filters, Client calendar/DST, cycles/hidden endpoints/Cancelled semantics, 200-row bounds and rollback. B7 adds a twelve-node concurrent cycle, add/remove/recreated-edge fencing, status/dependency and reassignment/progress races with final graph/event assertions. |
| Deliverables | B4 exact lifecycle, terminal timestamp, retry keys, mixed visibility, Team read-only and exact five-field Client DTO. B7 real edit/status and concurrent Delivered operations verify one winning revision/timestamp/event. |
| Files | B5 metadata/5 MiB/header/storage/parent ceilings, response loss, D1 uncertainty, missing objects, generation/cleanup fencing, downloads after await and archive retention. B7 repeats those on actual local R2 and adds shared overlapping expired recovery/late PUT/finalizer and visibility/archive races. |
| Home/Work/history | B6 canonical prefixes, live child counts, deterministic attention/recent names, 200-row bounds, current restriction/archive, read-only snapshots and no R2 binding. Actual 240-assignment D1 proof: 14 Home queries, maximum 64 bindings and 12,918 SQL bytes. |
| Integrated release | Dedicated local D1/R2 story activates a two-service Client, snapshots Common/Social/GHL, submits and verifies six requirements to Active, creates service-specific and Client-level Projects, children and real attachments, expands to ten Clients, checks Owner/Admin/PM projections and unchanged read snapshots, then runs real races. 86 checks passed. The final built-browser run passed 273 checks with 62 captures after the modal correction. |

### Verification

Use Node `22.22.1` (`PATH=/home/codespace/nvm/versions/node/v22.22.1/bin:$PATH`). Commands run from the repository root. Logs and screenshots are local `/tmp/bloomops-b7-*` artifacts, not committed client data.

| Command | Result |
|---|---|
| `npm ci` | 560 installed, 561 audited; package/lock unchanged |
| `node --test tests/bloomops-release-b-*.test.mjs` | 29/29, including 34 shared race assertions |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 |
| `node --test tests/bloomops-projections-*.test.mjs` | 76/76 |
| Release A/core command in the B6 section below | 421/421 |
| `npm test` | 4,030/4,030, zero failures/skips; final post-correction run exited 0 |
| `npm run build` | Passed, including lint/type checks |
| `npm run cf:build` | Passed after the modal correction, including nested Next build and lint/type checks; exit 0 |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 fresh/no-op checks; 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 indexes, 21 triggers; disposable local directory cleaned up |
| `node scripts/projects-smoke-local.mjs` | Actual D1: 25/25 |
| `node scripts/milestones-smoke-local.mjs` | Actual D1: 28/28 |
| `node scripts/actions-smoke-local.mjs` | Actual D1: 47/47 |
| `node scripts/deliverables-smoke-local.mjs` | Actual D1: 38/38 |
| `node scripts/files-smoke-local.mjs` | Actual D1/R2: 42/42 |
| `node scripts/projections-smoke-local.mjs` | Actual D1: 34/34; metrics above |
| `node scripts/release-a-hardening-smoke-local.mjs` | Actual D1: 26/26 |
| `node scripts/release-b-smoke-local.mjs` | Integrated actual workerd/D1/R2: 86/86 |
| `node scripts/release-b-review-local.mjs` | 273/273 browser/HTTP assertions, exit 0; 62 captures at 1440/1024/768/390/320 after the modal correction |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144, exit 0 |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21, exit 0 |
| `node scripts/files-review-local.mjs --out /tmp/bloomops-b7-files-review` | 143/143, exit 0; 44 captures plus design reference, including real-toast hit tests at 390/320 |
| Changed JS syntax checks; `git diff --check` | 21/21 JavaScript paths; CSS verified by both build stages; whitespace clean |
| `npm audit --json` | Expected advisory exit: 49 entries, 1 low / 43 moderate / 5 high; count/severity delta zero |

The built-application commands use `node scripts/files-preview-local.mjs` in an owned local process, stopped after the browser/HTTP checks. Its unconditional Wrangler dry run does not deploy. Run browser suites sequentially against that development Worker. Changed-file syntax command:

```sh
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
const files = [...new Set([...execFileSync('git',['diff','--name-only','58647bda6dd40739b7670e6c0f907b6f33689e5d'],{encoding:'utf8'}).trim().split('\n'), ...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')])].filter(path=>/\.(mjs|js)$/.test(path));
for (const path of files) execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
console.log(`${files.length} changed JavaScript syntax checks passed.`);
JS
```

### Evidence limits and remaining gates

The high advisory entries remain brace-expansion, Browserslist, nanoid, PostCSS and sharp. Release B accepts bounded metadata and raw File bytes; it does not pass uploaded content to CSS/build configuration/generator/image conversion inputs. No reachable Release B exploit was identified in this scoped review. This is not a zero-advisory dependency tree or a complete audit of the inherited editor and all transitive packages. The lockfile is unchanged; the recorded comparison proves counts/severities and dependency continuity, not a retained historical JSON advisory-by-advisory diff.

Local runtime evidence uses the existing pinned Miniflare/workerd, isolated D1/R2, development R2 mail and external Playwright/Chromium installation. The existing `files-preview-local.mjs` dry-run/Miniflare path is retained because the ordinary Wrangler preview proxy had a previously recorded local startup failure. No compatibility/package/configuration workaround is introduced. In-memory mail in the disposable Worker and local R2 mail in browser acceptance cannot contact a real Client. No production, staging business data, DNS or Leadsthatbloom resources were changed.

Fixture corrections did not change production behavior: the new ten-Client seed must provide each required primary-contact email, and Work row counts use the existing `.bo-project-row` rather than Home-only data attributes. One local Files fixture hit `SQLITE_BUSY` before exercising product behavior; a fresh isolated fixture passed. Verification command processes are isolated, preview ownership is explicit, and only successful completed runs count as final gates. The interrupted build/tracing attempt is superseded by the final rebuild. The new toast probe deliberately checks hit-testing before its five-second notification expires; a later successful click alone had missed this defect.

The live Bloomlab design gallery was loaded and inspected. Populated Home, Work Projects and safe portal captures were visually reviewed at all five widths; File upload/error/archive dialogs were also inspected, including both final 390/320 toast-regression captures with unobstructed confirmation controls. No redesign or new component library was needed.

At B7 local completion, independent audit, user-controlled merge and both exact-merge-SHA gates remained required; its schema-free diff required manual zero-workflow dispatch. Those gates subsequently succeeded on `c6509aa395a5db58310e2a0ae22a8a808082f77b`, closing Release B as recorded in the current branch state above.

### Changed files by area

- HTTP boundaries (13): seven Project/File route files, five existing domain API helpers and new `lib/bloomops/work-api-input.mjs`.
- Shared UI (1): `app/bloomops.css`, modal layer token only.
- Regression tests (3): existing Project HTTP test and new B7 HTTP/race suites.
- Local acceptance (5): shared `release-b-races.mjs`, integrated smoke runner/Worker, integrated browser harness and the existing Files browser harness.
- Documentation (6): this file, `DOMAIN_MODEL.md`, `INDEX.md`, `RELEASE_B.md`, B7 contract/evidence and the minimal B6 closure correction.

Net inventory is 28 paths against verified main. The temporary prompt is deleted with no net diff against main. No migration, schema, package/lock, configuration or workflow changes.

## Work + Home Projections (B6)

B6 is schema-free. Internal Home now composes bounded canonical Action views, Project attention, upcoming/review/approved Deliverables and recent successful delivery/upload facts. Work preserves Actions, all seven views/filters and B3 date/dependency semantics; its separate Projects tab gains readable-child summaries. Server components use the existing session/shell boundary. No API, schema, lifecycle, R2 read, dashboard counter, mutation surface, dependency or infrastructure change is required.

Home takes at most four Actions per Today/Overdue/Waiting/Review section, five Projects needing attention, six Deliverables to move forward and six recent outputs. Empty sections disappear. Counts and Milestone finished percentages are computed from current readable rows; File counts require Ready metadata and exact B5 parent visibility. Direct Action assignment never creates Project, Milestone, Deliverable, File or Client summary scope. Department and ownership remain non-grants.

Project attention is a deterministic read-only priority: At Risk, Blocked, Needs Attention, Project Waiting, readable overdue Actions, Deliverables in Client Review, Deliverables in Internal Review, Actions in Review, then Actions Waiting. Completed/Cancelled/Archived Projects stay available in Work but do not enter attention. Equal priorities use target date (null last), name and ID. No health/status is written. Deliverable targets include missed dates and the next fourteen Client calendar days; review/approved work may have no date. Recent outputs use the past fourteen elapsed days and exclude future events, hidden subjects and non-Ready Files. Current titles come from canonical records, without raw activity metadata or uploader/storage details.

### Verification

All commands use Node `22.22.1` (`PATH=/home/codespace/nvm/versions/node/v22.22.1/bin:$PATH`), locked Wrangler `4.129.0` and the unchanged package/lock/config. All required local verification passed, including the final mobile anchor correction and the subsequent built Worker HTTP/external checks.

| Command | Result |
|---|---|
| `npm ci` | Passed; 560 installed, 561 audited; unchanged 49 advisories (1 low, 43 moderate, 5 high) |
| `node --test tests/bloomops-projections-*.test.mjs` | 76/76, zero failures/skips; includes injected midnight/DST, current visibility, exact portal allowlists, 240-Project scope and read-only snapshots |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 |
| Release A/core command below | 421/421 |
| `npm test` | 4,001/4,001, zero failures/skips after the link correction |
| `npm run build` and `npm run cf:build` | Passed, including lint/type validation and the final mobile scroll offset; Cloudflare build also runs `npm run build` |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22; fresh then no-op schema/ledgers, 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 indexes, 21 triggers |
| `node scripts/projections-smoke-local.mjs` | 34/34 on disposable actual workerd/D1; 240 assignments, Home 14 queries, maximum 64 bindings / 12,918 SQL bytes per statement; no R2 binding |
| `node scripts/projects-smoke-local.mjs` | 25/25 on actual D1 |
| `node scripts/milestones-smoke-local.mjs` | 28/28 on actual D1 |
| `node scripts/actions-smoke-local.mjs` | 47/47 on actual D1 |
| `node scripts/deliverables-smoke-local.mjs` | 38/38 on actual D1 |
| `node scripts/files-smoke-local.mjs` | 42/42 on actual D1/R2 |
| `node scripts/release-a-hardening-smoke-local.mjs` | 26/26 on actual D1 |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 against the built local Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 |
| `node scripts/projections-review-local.mjs` | 144/144; 47 captures at 1440/1024/768/390/320; isolated local workspace, canonical APIs, scopes/revocations, read snapshots, exact portal DTOs/original bytes and keyboard/focus/touch/reduced motion/no-JavaScript Home |
| Changed JS/JSX syntax checks below; `git diff --check` | 16/16 and clean |

Exact Release A/core regression command:

```sh
node --test tests/bloomops-onboarding-*.test.mjs tests/bloomops-activation.test.mjs tests/bloomops-hardening-*.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-invitations.test.mjs tests/bloomops-mail.test.mjs tests/bloomops-middleware.test.mjs tests/bloomops-clients.test.mjs tests/bloomops-services.test.mjs tests/bloomops-assignments.test.mjs
```

Changed-file syntax command (Node parser for JS/MJS; the installed esbuild JSX parser):

```sh
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
const files = [...new Set([...execFileSync('git',['diff','--name-only','4c6dad696d15fac4094b8172788b5c72642ff757'],{encoding:'utf8'}).trim().split('\n'), ...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')])].filter(path=>/\.(mjs|js|jsx)$/.test(path));
for (const path of files) {
  if (path.endsWith('.jsx')) await transform(readFileSync(path,'utf8'),{loader:'jsx',sourcefile:path});
  else execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
}
console.log(`${files.length} changed JS/JSX syntax checks passed.`);
JS
```

### Runtime, browser evidence and corrections

The built Worker is served with the unchanged B5 `node scripts/files-preview-local.mjs` harness: loopback only, development D1/R2, an unconditional Wrangler dry run for Node shims and the pinned Miniflare runtime. Local database ledgers were already current (60 inherited, 13 domain); the separate disposable zero verifier proves fresh application and no-op replay. No staging business data or account resource is modified. Browser dependency Playwright `1.63.0` and its Chromium installation live outside the repo at `/tmp/bloomops-a11-browser`; no manifest/lock change is needed. Logs use `/tmp/bloomops-b6-*.log`; browser captures use `/tmp/bloomops-b6-review/`. These local artifacts are session evidence, not committed remote acceptance evidence.

The live Bloomlab reference loaded and was visually inspected, along with populated Home and Work Projects at all five widths, scoped Team Home and the safe Client portal. The final B6 browser run passed 144 checks with 47 captures, including the actual mobile anchor position and zero hydration/runtime errors. An initial query probe found ambiguous CTE name columns; explicit aliases preserve distinct Project/Client/Service/Department context. The first D1 harness attempt tried to rename an immutable File; the fixture now verifies its original current filename against deliberately different historical metadata. The first browser assertion used nonexistent section IDs; selectors now use the actual labelled regions. Inspection also found B6 summary links targeted those nonexistent section IDs; the implementation now links to the existing `*-title` heading anchors, and browser acceptance checks the actual target position. That check then caught the mobile sticky header covering the heading; the four B6 destination headings now have a mobile scroll offset. Development sign-in throttling is respected without changing application authentication.

### Remaining gates and scope

B6 closed after PR #20 merged as `58647bda6dd40739b7670e6c0f907b6f33689e5d`. Read-only preflight verified [Deploy staging 34231285687](https://github.com/Beeyach/bloomops/actions/runs/34231285687) and [remote zero-to-current 34231727327](https://github.com/Beeyach/bloomops/actions/runs/34231727327) succeeded on that exact SHA. The zero verifier was manually dispatched because B6 was schema-free; disposable-database cleanup succeeded. B7 is recorded separately above. B6 added no new lifecycle, approval history, comments, notifications, queues, specialist pipelines, templates or auto-generation.

### Changed files by area

- Canonical reads (2): `lib/bloomops/actions.mjs`, `lib/bloomops/work-projections.mjs`.
- Internal UI (6): `app/(internal)/page.jsx`, `app/(internal)/work/page.jsx`, `app/bloomops.css`, `components/bloomops/OperationalHome.jsx`, `components/bloomops/WorkSummary.jsx`, `components/bloomops/Projects.jsx`.
- Projection tests (6): `tests/_work-projections.mjs`, `tests/bloomops-projections-domain.test.mjs`, `tests/bloomops-projections-access.test.mjs`, `tests/bloomops-projections-time.test.mjs`, `tests/bloomops-projections-bounds.test.mjs`, `tests/bloomops-projections-ui.test.mjs`.
- Local acceptance (3): `scripts/projections-smoke-local.mjs`, `scripts/projections-smoke-worker.mjs`, `scripts/projections-review-local.mjs`.
- Documentation (6): this file, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B6.md`, and the minimal B5 closure correction in `docs/phases/B5.md`.

Net inventory is 23 paths against verified main. The temporary prompt was deleted before the final implementation commit and has no net diff against main. No migration, schema, route API, dependency, configuration or workflow file changes.

## Files (B5)

B5 is closed through PR #19 and both successful post-merge gates on `4c6dad696d15fac4094b8172788b5c72642ff757`, recorded above. This section preserves its historical local evidence. B5 adds real Project/Deliverable attachments, with D1 as canonical metadata and authorization and R2 as canonical bytes. The phase contract is `phases/B5.md`; `DOMAIN_MODEL.md` records the complete relational model and storage protocol.

### Preflight and implementation decisions

- Verified ancestry and remote main at exact B4 merge `ac71b358f27894af8dd8108f004499cd765fca69` before substantial implementation. PR #18 and its two successful merge-SHA gates are recorded above. The requested phase-contract and task-carrier commits are preserved; `B5_CODEX_PROMPT.txt` is removed so it has no net diff against main.
- Reused the actual `FILES` binding: development uses local `bloomops-files-dev`, staging declares its own `bloomops-files-staging`, and production remains separately configured. Application code accepts the binding and never hard-codes a bucket. Wrangler configuration, compatibility date `2025-05-01`, staging/zero workflows, environment isolation and dependency manifest/lock are unchanged. Verification uses only disposable local bindings or the loopback development Worker with R2 mail and example identities.
- The explicit upload limit is **5,242,880 bytes (5 MiB)**. One exact, percent-encoded JSON header carries bounded metadata and the body contains only raw bytes. Validation precedes one bounded allocation; streaming reads enforce the actual and declared lengths. Filenames are NFC-normalized and bounded to 180 UTF-16 code units, MIME to 127 characters, and the metadata header to 4096 characters. Path/control/bidi/header injection and caller workspace/key authority are refused. The server computes SHA-256. This deliberately small buffered policy follows current official Workers limits and R2 API/consistency documentation linked in `DOMAIN_MODEL.md`; no platform-limit change, multipart infrastructure or scanning claim is introduced.
- Additive `0012_b5_files.sql` creates `assets` (19 columns), `asset_links` (5), and `asset_upload_attempts` (6), with 12 File CHECKs and composite workspace/File/uploader/Project/Deliverable FKs. Seven indexes are added: `assets_ws_id_uq`, `assets_ws_request_uq`, `assets_key_uq`, `asset_links_ws_project_idx`, `asset_attempts_key_uq`, `asset_attempts_cleanup_idx`, and `deliverables_ws_project_id_uq`. Six triggers preserve original details, fixed links, durable attempt identity and legal generation transitions. The generated Drizzle snapshot/journal match; no prior table or migration is rebuilt or rewritten.
- Each File has one fixed Project attachment or a Deliverable attachment within that exact Project. There is no mutable relinking or generic polymorphic endpoint. These are the coherent current upload surfaces required by B5. Client-only, Milestone, Action and onboarding attachment integrations remain outside this implementation. A committing relational count caps each Project at 200 Files including archives, keeping active lists complete and bounded. The form states the limit.
- Upload reserves **Uploading**, the link and a durable attempt in one conditional D1 batch. Each generation has a fresh server-owned workspace-separated opaque key and a five-minute lease. R2 must confirm key, size, MIME, etag and SHA-256 before a live-authorized conditional batch writes **Ready**, its one server timestamp and exactly one `FILE_UPLOADED` event. Reservation has no semantic upload event. UUIDv4 request keys plus immutable initial details and bytes make lost-response retries converge on one File; incompatible reuse conflicts.
- Put/finalize failures mark only the owned Uploading generation **Failed** when D1 can answer. Positive current D1 evidence fences cleanup; uncertain commits never justify blind deletion. A lost finalization response is success only with readable Ready metadata and matching R2 evidence. Database unavailability can leave Uploading and a known key for explicit retry after its lease. Recovery claims a new generation with CAS, so a late old writer or cleaner cannot overwrite/delete the winner.
- Cleanup checks at most ten eligible attempt keys per pass and rotates failed checks as well as successful ones, preventing persistent failures from starving later keys. Attempt rows remain after deletion because an interrupted PUT may finish late; a later explicit recovery/readiness/archive retry can revisit them. Cleanup is best effort, without a scheduled production sweep or guarantee of immediate orphan removal. Archive is terminal metadata removal from active views/downloads, retains previously Ready bytes and timestamp, and atomically records `FILE_ARCHIVED`. Ready visibility uses revision/CAS and `FILE_VISIBILITY_CHANGED`; no parent lifecycle changes.
- Owner/Admin/PM coordinate within current Project scope; Team is read-only. Restricted Project/Deliverable/File access for PM/Team requires explicit Project assignment. Department, Project ownership and Action-only assignment grant no File scope. Every query and committing write uses current identity/workspace/membership/role/assignment/parent visibility predicates, with no assigned-ID expansion. Historical File names are filtered by current File and parent readability in both Project and Client history.
- Clients receive only Ready Files where both File and all parents are currently Client-visible and contact linkage remains valid. The exact portal DTO has six fields: `id`, `filename`, `mimeType`, `byteSize`, `readyAt`, `attachmentLabel`. Labels never fall back to internal Deliverable titles. Hidden counts, uploader identity, storage keys, hashes, lease/revision details and internal activity are excluded. Empty/hidden-only File sets produce no portal section or navigation.
- Six route files provide Project list/upload, File read/visibility/archive, explicit retry, authorized byte download and two portal reads. Real sessions, Origin checks, strict allowlists, sanitized errors and no-store apply. Download resolves a File ID through D1, fetches only its canonical Ready key, then rechecks live authorization and generation after the R2 await. Missing/hidden/foreign/non-ready/missing-object cases share 404; no ordinary read repairs storage. Bytes use safe ASCII/RFC 5987 attachment filenames, `private, no-store`, `nosniff`, sandboxed content policy and same-origin resource policy.
- Project Files and coherent Deliverable attachments use existing Bloom rows, dialogs, buttons, typography, error notices and toast. Upload/retry, visibility, archive and downloads have hydration/pending guards and keyboard focus restoration. Client Files appear under reachable Projects only when actual shared records exist. No new UI library, provider, destination or major dependency was added.

### Verification

Node 22.22.1, Wrangler 4.129.0, pinned Miniflare/workerd and unchanged dependencies.

| Check | Result |
|---|---|
| `npm ci` | Passed: 560 packages installed, 561 audited. Existing 49 advisories remain: 1 low, 43 moderate, 5 high. |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 passed: 59 lifecycle/recovery/domain, 54 access, 27 real-session HTTP, 27 schema and 4 UI. |
| B1/B2/B3/B4 focused regressions | 97/97 Projects, 173/173 Milestones, 203/203 Actions/dependencies and 197/197 Deliverables passed. |
| Release A/auth/authorization/security/domain regression command recorded in the B3 section | 421/421 passed. |
| `npm test` | 3,925/3,925 passed, zero failures/skips. |
| `npm run build` and `npm run cf:build` | Both passed, including available lint/type checks. |
| `node scripts/files-smoke-local.mjs` | 42/42 passed inside actual disposable workerd with D1 and R2: reserve/put/finalize/cleanup failures, response loss, generations, live revocation, 5 MiB bytes/checksum/head/get/delete, isolation, parent preservation and integrity. |
| Prior disposable D1 smokes | B1 25/25; B2 28/28; B3 47/47; B4 38/38; A11 26/26 passed. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: 60 inherited + 13 domain migrations; 36 domain / 72 total tables including ledgers; 84 explicit indexes; 21 triggers; FK/integrity clean and schema/ledgers identical after the no-op second pass. |
| `npm run db:domain:migrate:local` | Migration 0012 applied to the existing development database; the fresh proof used a separate disposable target. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| `node scripts/files-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b5-review-final` | 139/139 passed, exit 0; 42 screenshots at 1440/1024/768/390/320px plus the loaded live design reference. |
| Changed JavaScript/JSX syntax and `git diff --check` | 42 syntax checks passed; diff check passed. The local preview argument guard also refused overrides before creating output or starting a Worker. |

The actual R2 smoke runs the domain inside a Worker bundled with existing esbuild and instantiated through the pinned Wrangler Miniflare runtime. The Node-side `getPlatformProxy` R2 preflight repeatedly stalled before returning a proxy; a direct Worker put/get/delete probe succeeded, so the stronger in-Worker harness exercises all D1/R2 boundaries there. No unverified upstream cause is asserted and no dependency/runtime configuration was changed. The harness refuses remote targets, owns temporary storage and disposes it.

Two normal Wrangler CLI previews stopped with `Error inside ProxyWorker` and an underlying `Network connection lost` cause, matching the failure signature in [workers-sdk #15317](https://github.com/cloudflare/workers-sdk/issues/15317). The exact dropped-connection trigger here is not established. `node scripts/files-preview-local.mjs` provides a reproducible loopback-only alternative: Wrangler first bundles the existing OpenNext output with an unconditional local `deploy --dry-run --no-autoconfig`, including its normal Node shims, then pinned Miniflare/workerd serves that exact bundle with the existing development D1/R2 state and asset binding. It refuses environment/remote arguments, checks the actual local binding identities and R2 mail transport, uses the pinned v5 `resourcePersistencePath`, validates health and removes only its owned temporary bundle on exit. No dependency or production configuration was changed. The disposable File smoke also uses that v5 persistence option for its owned temporary resources.

Browser acceptance then reproduced middleware stripping the File route's `private` cache directive. The narrow authenticated File-download path now retains `private, no-store`; adjacent paths and anonymous denial keep their existing policy. Middleware regressions verify that this creates no authorization exemption. Adversarial HTTP input also reproduced two failures where object-valued MIME/size fields with invalid conversion properties returned 500. Validation now rejects those types without coercion and returns sanitized 400 on both upload and retry; the 27 HTTP tests and built-Worker browser cases cover the correction. Browser failure diagnostics report Worker reachability, and full-page captures begin at the top so fixed navigation does not obscure File rows in the saved images.

The first full/Release A runs exposed an old A6 source-text assertion scanning all Client activity labels for the word “archive.” File history legitimately adds “File archived.” The assertion now checks the actual Client/contact mutation modules, preserving its original invariant that A6 creates no Client archive operation. Existing domain inventory, migration-prefix and permission-matrix tests were extended for B5 without changing prior business behavior. Recovery verification also caught cleanup starvation; failed checks now rotate and the new 13-generation regression proves all known orphan keys get a turn.

The final built Worker was served by the checked-in `files-preview-local.mjs` after both builds passed. Its full 144-check HTTP smoke and 21-check external verifier passed again before browser acceptance. The 139 browser/HTTP checks cover one real File/object/event under double-click and response-loss retry, exact saved bytes and headers for coordinator and Client, no-JavaScript control safety, five-width empty/upload/visibility/Team/portal/retry/archive layouts, keyboard chooser/Tab/Escape/focus after controls disappear, touch, reduced motion, sanitized late finalization failure and recovery, current scope/history revocation, strict input types and unchanged parent facts. Project, upload and portal captures were visually reviewed across all five widths; final retry/archive captures were reviewed at every width, with final Project/Team/portal spot checks. The preview was stopped after verification.

The completed run wrote logs and browser captures under `/tmp/bloomops-b5-*` and used external browser tooling at `/tmp/bloomops-a11-browser` (Playwright 1.63.0 / Chromium 153). These temporary artifacts and the browser installation were no longer present when the session resumed for PR finalization; they are not retained PR artifacts. The exact results above and checked-in verification harnesses remain the durable record. The live Bloomlab reference loaded successfully and was visually inspected during verification. Existing dependency advisories, SQLite experimental notice, build compatibility-date suggestion and `punycode` deprecation remain; none required a dependency or platform change for B5.

### Remaining gates and scope

B5's independent audit, user-controlled merge and both post-merge gates are complete on `4c6dad696d15fac4094b8172788b5c72642ff757`. Local verification did not replace those gates; both successful runs are recorded above.

Deliberate limits are 5 MiB per File, 200 Files including archives per Project, fixed Project/Deliverable attachment, read-only Team, explicit recovery with a five-minute active lease, bounded best-effort orphan cleanup, terminal archive retaining Ready bytes, and no scanning. Client uploads, other subject integrations, relinking, restoration, purge/retention policy, versions, approvals/history, comments, notifications, templates, specialist pipelines and future Request/Page/Finance placeholders are absent. B6 and B7 are recorded separately above; later releases remain unimplemented.

### Changed-file inventory

The net diff against verified B4 main contains 52 paths. The temporary task prompt has no net diff.

- Schema: `drizzle/0012_b5_files.sql`, `drizzle/meta/0012_snapshot.json`, `drizzle/meta/_journal.json`, `lib/bloomops/schema.mjs`.
- Domain and authorization: `lib/bloomops/activity.mjs`, `lib/bloomops/api-handler.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/client-activity.mjs`, `lib/bloomops/file-access.mjs`, `lib/bloomops/file-api.mjs`, `lib/bloomops/file-values.mjs`, `lib/bloomops/files.mjs`, `lib/bloomops/project-activity.mjs`, `middleware.js`.
- API routes: `app/api/bloomops/files/[fileId]/download/route.js`, `app/api/bloomops/files/[fileId]/retry/route.js`, `app/api/bloomops/files/[fileId]/route.js`, `app/api/bloomops/portal/files/[fileId]/route.js`, `app/api/bloomops/portal/projects/[id]/files/route.js`, `app/api/bloomops/projects/[id]/files/route.js`.
- UI: `app/(internal)/work/projects/[id]/page.jsx`, `app/bloomops.css`, `app/portal/page.jsx`, `components/bloomops/DeliverableControls.jsx`, `components/bloomops/Deliverables.jsx`, `components/bloomops/FileControls.jsx`, `components/bloomops/Files.jsx`, `components/bloomops/PortalHome.jsx`, `components/bloomops/Projects.jsx`.
- Tests and verification: `scripts/deliverables-smoke-local.mjs`, `scripts/files-preview-local.mjs`, `scripts/files-review-local.mjs`, `scripts/files-smoke-local.mjs`, `scripts/files-smoke-worker.mjs`, `tests/_files.mjs`, `tests/bloomops-activation.test.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-clients.test.mjs`, `tests/bloomops-deliverables-schema.test.mjs`, `tests/bloomops-files-access.test.mjs`, `tests/bloomops-files-domain.test.mjs`, `tests/bloomops-files-http.test.mjs`, `tests/bloomops-files-schema.test.mjs`, `tests/bloomops-files-ui.test.mjs`, `tests/bloomops-middleware.test.mjs`, `tests/bloomops-schema.test.mjs`.
- Documentation: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B4.md`, `docs/phases/B5.md`.

## Deliverables (B4)

B4 is closed through PR #18 and its two verified merge-SHA gates recorded above. This section preserves the historical local evidence. B4 adds client-receivable outputs inside existing Projects, independent of Actions and Dependencies. The implementation follows `phases/B4.md`; the final relational model is in `DOMAIN_MODEL.md`.

### Implementation decisions

- Migration `0011_b4_deliverables.sql` adds only `deliverables`: 14 columns, two indexes, workspace and composite workspace/Project foreign keys, and nine validation/coherence checks. The generated journal and snapshot match. Physical-name inspection found no inherited Deliverables table. No historical migration or Release A/B1/B2/B3 table is rewritten or rebuilt.
- Client, Service and Department derive from the Project. Internal title and optional Client label are bounded to 120 characters; optional multiline internal description to 5000; target date must be a real calendar date. Visibility starts internal. Every Deliverable starts Planned and uses the exact seven-state B4 matrix. Delivered owns one server timestamp; Cancelled owns none; both are terminal. Coordinators may correct details after either terminal state. No Deliverable operation changes parent or B3 work records.
- Owner/Admin/PM coordinate reachable Deliverables. Team is read-only through existing Client/Service/Project scope. Project ownership, Department membership and Action-only assignment grant nothing. Explicit Project assignment is required for PM/Team to read restricted parents or children. The Project visibility ceiling, live workspace/membership/role/scope and contact-link checks apply to reads and committing writes.
- The portal selects only safe fields and emits exactly `id`, `label`, `statusLabel`, `targetDate`, and `deliveredAt`. Blank Client labels display the literal **Deliverable**, never the internal title. Internal Review becomes **In progress**; Client Review becomes **Ready for review**. No Client approval action or approval history is introduced. Empty/hidden-only child sets produce no section, count or progress indicator.
- Each Project has a guarded ceiling of 200 Deliverables, following the bounded child-detail approach in B2/B3. Lists explicitly limit to 200 and use deterministic creation time/id ordering. Portal Home calls the same bounded projection for each already authorized Project; it does not build an assignment-ID `IN` list or change B1's Project listing semantics. A broad portal pagination/composition redesign is outside B4.
- UUIDv4 creation keys are unique per workspace/Project and compare normalized initial details in immutable creation activity. Retries converge after later edits; incompatible reuse conflicts; repeated titles can intentionally create separate outputs. Details and status use revision/CAS guards. Identical retries append no duplicate semantic history or second delivered timestamp. Events and facts share conditional D1 batches; late failures roll back both.
- Significant activity distinguishes creation, details (including changed visibility fields) and status. Client/Service context comes from Project. Project and Client histories filter past Deliverable events by current readability, so restriction or revoked scope removes old internal titles. Clients receive no internal Deliverable activity.
- Five route files expose Project list/create, child read/edit, transition, portal list and portal child read. All use real sessions, exact object-body allowlists, Origin checks, no-store responses and sanitized 400/403/404/409/500 answers. Guessed, foreign, hidden and other-domain IDs reveal no record existence.
- The existing Project page gains a distinct Deliverables section with create/edit/status controls, visibility and target dates. Bloom rows, typography, fields, dialogs, toast and responsive styles are reused. Buttons wait for hydration; dialogs preserve keyboard focus, including after terminal status controls disappear. No new destination, component library, state library or major dependency is introduced.
- The automatic remote zero-to-current workflow and its disposable-target, identity, command, cleanup and concurrency safeguards are unchanged. All acceptance mutations use disposable workerd/D1 or development loopback D1/R2 and example addresses. No staging business data, production, DNS, real email or Leadsthatbloom resources are touched.

### Verification

Node 22.22.1; dependency manifest and lockfile unchanged.

| Check | Result |
|---|---|
| `npm ci` | Passed: 560 packages installed, 561 audited. The existing 49 advisories remain (1 low, 43 moderate, 5 high). |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 passed: 118 domain/lifecycle/retry/concurrency/rollback, 36 scope/visibility, 22 real-session HTTP, 17 schema and 4 UI tests. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed. |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 passed. |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 passed. |
| Release A/auth/authorization/security/domain regression command recorded in the B3 section | 421/421 passed. |
| `npm test` | 3,754/3,754 passed, zero failures/skips. |
| `npm run build` and `npm run cf:build` | Both passed, including the available lint/type checks. |
| `node scripts/deliverables-smoke-local.mjs` | 38/38 passed on actual disposable workerd/D1, including nonempty B3 parent/work preservation, combined Team histories within binding limits, capacity, retries, delivery concurrency, live revocation and late rollback. |
| `node scripts/projects-smoke-local.mjs`, `milestones-smoke-local.mjs`, `actions-smoke-local.mjs`, `release-a-hardening-smoke-local.mjs` | Actual D1 regressions: 25/25, 28/28, 47/47 and 26/26 passed. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: fresh/no-op, 60 inherited + 12 domain migrations, 33 domain / 69 total tables including ledgers, 77 explicit indexes, 15 triggers, FK/integrity clean and schema/ledgers identical after the second pass. |
| `npm run db:domain:migrate:local` | Migration 0011 applied to the existing development database before preview; the fresh proof above used a separate disposable target. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| JavaScript/JSX syntax and `git diff --check` | 33 changed/new script/module/component/route syntax checks passed; diff check passed. |

`node scripts/deliverables-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b4-review-final` passed **141/141** browser/HTTP checks with exit 0 and **42 screenshots** at **1440, 1024, 768, 390 and 320px**, plus the loaded live design reference. The flow covers multiple outputs in a service-specific B3 Project, derived Client/Service history, complete lifecycle, keyboard entry/validation/Tab trapping/Escape/focus after terminal controls disappear, 44px mobile targets, touch, reduced motion, exact portal DTO/HTML isolation, current scope/history restriction, response-loss retries, competing writes and late rollback.

Logs are under `/tmp/bloomops-b4-*`; final captures are in `/tmp/bloomops-b4-review-final/`. The live Bloomlab gallery returned HTTP 200 and was visually inspected after loading. Final Project, create/edit/status, read-only Team and portal captures were visually inspected across all five widths. Browser tooling remains outside the repo at `/tmp/bloomops-a11-browser` (Playwright 1.63.0 / Chromium 153); no browser dependency was added.

The unchanged dependency advisories are the same inherited tree assessed during B3. No dependency update is required for B4. The Cloudflare build also retains its existing compatibility-date suggestion and `punycode` deprecation notice.

### Verification corrections

The initial full run required narrow inventory updates for Deliverables in `BLOOMOPS_TABLES`, the migration count, two permissions in the role matrix and the activation invariant (zero automatically generated Deliverables). B3's migration test and local smoke now permit later migrations while preserving the exact B3 prefix. A portal test initially matched the word progress inside the deliberately safe status **In progress**; it now checks the forbidden JSON property precisely. No production behavior was changed to satisfy that assertion.

The first local preview started amid concurrent verification startup and did not respond. The HTTP harness initially could not connect; the owned preview was restarted, its development health and twelve migrations were confirmed, and HTTP acceptance restarted. Application mutations were not automatically retried after uncertain failures.

Visual review caught two acceptance-fixture issues: the reference screenshot needed to wait for the loaded Design gallery instead of its loading screen, and the Service API returns `service.id`, not a top-level `serviceEngagementId`. The final harness waits for the gallery and uses the correct Service ID, then explicitly asserts both the Project Service link and each Deliverable event's derived Client/Service context. Its preservation snapshot also includes Client and Service records. These corrections change verification only. The existing five-per-minute magic-link rate limit is preserved; browser retries are limited to explicit 429 responses.



### Remaining gates and scope

B4's audit, merge and both post-merge gates are complete on `ac71b358f27894af8dd8108f004499cd765fca69`, as recorded above. Deliberate B4 limits remain 200 Deliverables per Project, fixed parent identity, terminal Delivered/Cancelled lifecycle, read-only Team and coordinator-managed review states. B5 adds Files in a separate phase; versions, formal approval rounds/history, comments, notifications, templates, auto-generation, specialist pipelines and Home composition remain absent.

### Changed files by area

All 42 paths are relative to the repository root, including the supplied B4 contract. The temporary B4 Codex prompt has no net diff against main.

- Domain/access/history: `lib/bloomops/deliverables.mjs`, `lib/bloomops/deliverable-values.mjs`, `lib/bloomops/deliverable-access.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/activity.mjs`, `lib/bloomops/project-activity.mjs`, `lib/bloomops/client-activity.mjs`.
- API: `lib/bloomops/deliverable-api.mjs`, `app/api/bloomops/projects/[id]/deliverables/route.js`, `app/api/bloomops/projects/[id]/deliverables/[deliverableId]/route.js`, `app/api/bloomops/projects/[id]/deliverables/[deliverableId]/transition/route.js`, `app/api/bloomops/portal/projects/[id]/deliverables/route.js`, `app/api/bloomops/portal/projects/[id]/deliverables/[deliverableId]/route.js`.
- UI: `app/(internal)/work/projects/[id]/page.jsx`, `app/portal/page.jsx`, `app/bloomops.css`, `components/bloomops/DeliverableControls.jsx`, `components/bloomops/Deliverables.jsx`, `components/bloomops/PortalHome.jsx`, `components/bloomops/Projects.jsx`.
- Schema: `lib/bloomops/schema.mjs`, `drizzle/0011_b4_deliverables.sql`, `drizzle/meta/0011_snapshot.json`, `drizzle/meta/_journal.json`.
- Tests/verification: `tests/_deliverables.mjs`, `tests/bloomops-deliverables-domain.test.mjs`, `tests/bloomops-deliverables-access.test.mjs`, `tests/bloomops-deliverables-http.test.mjs`, `tests/bloomops-deliverables-schema.test.mjs`, `tests/bloomops-deliverables-ui.test.mjs`, `tests/bloomops-actions-schema.test.mjs`, `tests/bloomops-activation.test.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-schema.test.mjs`, `scripts/deliverables-smoke-local.mjs`, `scripts/deliverables-review-local.mjs`, `scripts/actions-smoke-local.mjs`.
- Documentation: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B4.md`.

## Actions + Dependencies (B3)

B3 adds internal daily Actions, optional same-Project Milestones, responsibility and priority, exact lifecycle/Waiting rules, atomic cycle-safe dependency edges, live authorization, semantic history, and functional Work/Project interfaces. `DOMAIN_MODEL.md` records the final model and `phases/B3.md` preserves the implementation contract. B3 is now closed by PR #17 and both verified post-merge gates; the following section preserves its local implementation evidence. B4 is recorded above.

### Implementation decisions

- Migration `0010_b3_actions_dependencies.sql` adds `actions` (18 columns), `action_dependencies` (6 columns), six indexes, two dependency triggers, and an additive unique Milestone workspace/Project/id index for the optional child FK. The generated Drizzle journal/snapshot agree. No historical migration or Release A/B1/B2 table is rewritten or rebuilt. Inherited schema inspection confirmed both physical table names were free.
- Actions derive Client/Service/Department from Project, including the existing service-type Department rule. Title is trimmed and bounded to 120 characters, optional multiline description to 5000, and Waiting explanation to 1000. Priority is Low/Normal/High/Urgent, default Normal. Actions start To Do and use the exact B3 transition matrix. Waiting requires the named type and explanation; leaving clears both. Done has one server timestamp; Cancelled has none; both are terminal. No Action operation changes a parent or sibling lifecycle.
- UUIDv4 creation keys are unique within workspace/Project and compare immutable initial details from canonical creation activity. This preserves retries after later edits or assignee deactivation, rejects incompatible key reuse, and permits intentionally repeated titles. Conditional D1 batches couple revisions, live authority/reference checks and semantic events. Identical retries converge; competing stale edits, status, assignment and dependency writes conflict. No uncertain mutation is retried automatically.
- Current direct Team assignment grants only that Action, including restricted work under a restricted Project, with minimal parent context. Project links and linked Milestone details still require independent B1/B2 access. Team can progress only its own active assignment, never structural details or dependencies. Reassignment, role changes and deactivation revoke live access even for issued sessions or previously loaded actors. PM restricted access requires explicit Project assignment; Owner/Admin may coordinate. Department membership and Project ownership grant nothing. Client Action reads, routes, projections, counts, history and navigation are absent.
- Dependency endpoint composite FKs require one workspace and Project. Unique pairs and self-edge checks protect storage. Recursive `UNION` reachability is evaluated inside the committing write and independently enforced by a database insert trigger; an update trigger makes endpoints immutable. A removed edge's opaque identity cannot delete a later re-addition of the same pair. Actual D1 tests cover 180-node chains, diamonds and six competing cycle additions. Done alone satisfies prerequisites; Cancelled remains unresolved. Blocking is derived, including a generic boolean for hidden prerequisites, without serializing hidden endpoint labels/counts/graph. Manual lifecycle changes stay independent of the graph.
- Central Action list/view/manage/progress/dependency permissions and SQL predicates are shared by APIs, pages, writes and history. API bodies have exact allowlists, real sessions and Origin checks; malformed objects, denied/guessed IDs, conflicts and failures are sanitized and no-store. Internal DTOs explicitly select fields. Activity distinguishes creation, details/priority, assignment, status and dependency add/remove; dependency events never copy a sibling title. Project/Client history filters old Action events by current readability.
- Work defaults to Actions and retains Projects in a separate tab. Mine includes all assigned Actions; Today/Upcoming exclude terminal work, Waiting/Review use explicit status, and Overdue requires a past due date with no unresolved prerequisite. Calendar days follow the existing Client IANA timezone, with UTC fallback, and deterministic tests cover midnight/DST. All seven requested filters use relational predicates. Lists paginate at 200 rows; facets disclose their 200-choice overflow. A guarded 200-Action per-Project ceiling keeps Project and prerequisite lists complete and bounded, following B2's parent-detail approach; the creation form states that limit without exposing hidden counts.
- Project detail supports create/edit/assignment/status controls and assigned Team progress. Individual Action details provide narrow access and dependencies. Bloom rows, fields, dialogs, toast and typography are reused. A native Filters disclosure keeps small-screen daily work near the top. Action controls stay disabled until their client handlers attach, and dialog/terminal/removal focus returns to a stable control or title. No generic UI or state dependency, editor rewrite, specialist pipeline or future-phase placeholder was added.
- The existing zero-to-current workflow and all command/config/identity/cleanup/concurrency safeguards are unchanged, including schema/Drizzle push triggers. No staging business data, production, DNS, real mail or Leadsthatbloom resource was mutated.

### Verification

Node 22.22.1, Wrangler 4.129.0, existing external Playwright 1.63.0 / Chromium. Local development Worker/R2 mail and disposable workerd/D1 only, using example.com fixture identities. No new dependency and no package/lockfile change.

| Check | Result |
|---|---|
| `npm ci` | Passed; same 49 existing advisories: 5 high, 43 moderate, 1 low. The A11 assessment below remains applicable. |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 passed across seven files: schema, lifecycle, validation, scope/visibility, real-session HTTP, UI, dates/views, retries, write-lock revocation, dependency cycles and rollback. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed. |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 passed. |
| A8/A9/A10/A11 and auth/authorization/membership/invitation/mail/middleware/Client/Service/assignment regressions | 421/421 passed. |
| `npm test` | 3,557/3,557 passed; zero failures/skips. |
| `npm run build`; `npm run cf:build` | Both passed, including Next lint/type checks and OpenNext Worker generation. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: genuinely empty disposable DB; 60 inherited + 11 domain migrations; 68 total migration-defined tables including both ledgers / 32 domain tables; 75 explicit domain indexes and all 15 triggers; FK/quick_check; identical full schema and both ledgers after the no-op second pass. |
| `node scripts/actions-smoke-local.mjs` | 47/47 actual workerd/D1 checks passed, including long/diamond/concurrent cycles, rollback, stale authority, narrow assignment, timezone projection and 205-assignment pagination within bind limits. |
| `node scripts/projects-smoke-local.mjs`; `node scripts/milestones-smoke-local.mjs`; `node scripts/release-a-hardening-smoke-local.mjs` | B1 25/25, B2 28/28 and A11 26/26 passed against the current migrations. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| `node scripts/actions-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b3-review --playwright /tmp/bloomops-a11-browser` | 161/161 passed; 53 screenshots at 1440, 1024, 768, 390 and 320px. All daily views and combined filters, coordinator create/edit/status/dependencies, assigned Team progress, immediate revocation, Client denials, keyboard/focus, real touch, reduced motion and viewport geometry passed. |
| `node --check` on changed/new JS/MJS; `git diff --check` | 33 changed/new JS/MJS modules passed syntax checks; diff check passed. JSX is covered by the builds. |

The 421-test regression command was:

```sh
node --test tests/bloomops-onboarding-*.test.mjs tests/bloomops-activation.test.mjs tests/bloomops-hardening-*.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-invitations.test.mjs tests/bloomops-mail.test.mjs tests/bloomops-middleware.test.mjs tests/bloomops-clients.test.mjs tests/bloomops-services.test.mjs tests/bloomops-assignments.test.mjs
```

Logs and captures remain under `/tmp/bloomops-b3-*`, outside the repository. The live Bloomlab design reference returned HTTP 200 and was visually inspected at `/tmp/bloomops-b3-design.png`. Representative final Work, expanded Filters, Project, dialog, Action detail, Team and portal captures were visually inspected across all five widths.

### Verification corrections

The initial Department filter used only the optional Project department field. The invariant test correctly failed for service Projects, whose Department comes from the service type; the Action joins now follow the existing B1 rule. Full regressions required narrow inventory updates for B3's five permissions, extra internal page, tables/migration, and the activation invariant: activation must leave zero Action records, while Deliverables remain absent. The role matrix also now expects Clients to receive existence-hiding denials for internal Actions. B2's schema test and local D1 smoke accept later migrations while preserving its exact migration prefix. B1's browser harness explicitly opens the Projects tab now that Work defaults to Actions.

The first browser run reproduced a keyboard activation lost while an Action button was already visible but its React handler had not attached. The isolated readiness probe recorded `bound: false`, a focused enabled status button and no dialog; subsequent activation after attachment worked. Action controls now remain disabled until hydration completes, and keyboard acceptance waits for an enabled control rather than an arbitrary delay. Terminal transitions and dependency removals also verify focus after their opener disappears. Mobile visual review moved the seven filters into a native disclosure and corrected the active-view background to the existing Bloom lilac token. The browser harness retries only explicit magic-link 429 responses under the existing five-per-minute limit; it does not retry uncertain mutations or relax authentication. The D1 smoke status contestant was corrected to the valid To Do → In Progress transition so the test exercises a revision race rather than an invalid transition.

### Remaining gates and scope

B3 is closed: independent review and user-controlled merge produced PR #17 at `884051d2c2308839f95ecdac74c9d896edf221c5`, with staging run 34199099414 and remote zero-to-current run 34199099461 both successful on that exact SHA. Deliberate B3 limits remain 200 Actions per Project, 200 rows per Work page and 200 choices per facet; same-Project dependencies only; fixed parent identities; final Done/Cancelled lifecycle; no automatic dependency-driven transitions. B4 is recorded above. Files, comments, approvals, notifications, template generation, specialist pipelines, Finance and later Home composition remain unimplemented.

### Changed files by area

All 49 paths are relative to the repository root, including the supplied B3 contract. The temporary B3 Codex prompt has no net diff against main.

- Domain: `lib/bloomops/action-access.mjs`, `lib/bloomops/action-dependencies.mjs`, `lib/bloomops/action-values.mjs`, `lib/bloomops/actions.mjs`, `lib/bloomops/activity.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/client-activity.mjs`, `lib/bloomops/project-activity.mjs`.
- API: `app/api/bloomops/actions/[actionId]/dependencies/[dependencyId]/route.js`, `app/api/bloomops/actions/[actionId]/dependencies/route.js`, `app/api/bloomops/actions/[actionId]/route.js`, `app/api/bloomops/actions/[actionId]/transition/route.js`, `app/api/bloomops/actions/route.js`, `app/api/bloomops/projects/[id]/actions/route.js`, `lib/bloomops/action-api.mjs`.
- UI: `app/(internal)/work/actions/[actionId]/page.jsx`, `app/(internal)/work/page.jsx`, `app/(internal)/work/projects/[id]/page.jsx`, `app/(internal)/work/projects/new/page.jsx`, `app/bloomops.css`, `components/bloomops/ActionControls.jsx`, `components/bloomops/Actions.jsx`, `components/bloomops/ProjectForm.jsx`.
- Schema and migration: `drizzle/0010_b3_actions_dependencies.sql`, `drizzle/meta/0010_snapshot.json`, `drizzle/meta/_journal.json`, `lib/bloomops/schema.mjs`.
- Tests and verification: `scripts/actions-review-local.mjs`, `scripts/actions-smoke-local.mjs`, `scripts/milestones-smoke-local.mjs`, `scripts/projects-review-local.mjs`, `tests/_actions.mjs`, `tests/bloomops-actions-access.test.mjs`, `tests/bloomops-actions-dependencies.test.mjs`, `tests/bloomops-actions-domain.test.mjs`, `tests/bloomops-actions-http.test.mjs`, `tests/bloomops-actions-schema.test.mjs`, `tests/bloomops-actions-ui.test.mjs`, `tests/bloomops-actions-views.test.mjs`, `tests/bloomops-activation.test.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-milestones-schema.test.mjs`, `tests/bloomops-schema.test.mjs`, `tests/bloomops-shell.test.mjs`.
- Documentation: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B3.md`.

## Milestones (B2)

B2 adds ordered, workspace-scoped Project children, explicit Milestone lifecycle, internal waiting context, atomic semantic activity, scoped internal APIs and Project-detail controls, and a dedicated Client-safe Milestone/progress projection. B2 is closed by PR #16 and both verified post-merge gates recorded above. This section preserves its historical implementation and local evidence; B3 is recorded separately above.

### Implementation decisions

- Additive generated migration `0009_b2_milestones.sql` adds only `milestones` (16 columns) and four indexes, with matching Drizzle journal/snapshot. Composite workspace/Project FK, per-Project unique positions and request keys, date/name/status/visibility/completion/waiting/revision CHECKs protect stored facts. There are 30 domain tables; no Release A/B1 table is rebuilt.
- Client/Service/Department remain derived from the parent Project. Milestone creation and all changes leave Project status/health/revision, Client, Service and onboarding facts unchanged. Waiting has a bounded internal explanation because `AGENTS.md` requires work to record what or whom it waits on; that explanation is excluded from the portal.
- A UUID creation request key permits explicit response-loss retry without inventing name uniqueness. Server-generated Milestone IDs and immutable initial details in the creation event distinguish retries from key reuse, even after later edits. There are no automatic retries of uncertain mutations.
- A Project supports up to 200 Milestones. Reorder accepts the complete readable set plus its per-row revisions, preserves hidden slots, and parks rows before assigning final unique positions. A conditional canonical event is the transaction receipt; no Project ordering field or secondary status is introduced. Same-order retries add no event. Competing status/reorder and stale-set writes conflict, including under the D1 write lock.
- Owner/Admin/PM coordinate reachable children; Team Member stays read-only. Existing Client/Service/Project assignments govern reach; Department and ownership grant nothing. Restricted children use explicit Project assignment for PM/Team. Both parent and child must be client-visible with a current contact link for Client access. Fresh SQL predicates protect reads, write batches and historical activity against revocation.
- Six route files reuse A11/B1 session/origin, strict JSON/body fields, leak-safe 404s, sanitized 500s and no-store. The exact Client Milestone DTO is `id`, `label`, `statusLabel`, `targetDate`, `completedAt`; safe derived progress is computed only from visible rows, counting Completed and Skipped as finished. Empty progress is null and omitted from UI. B1 Project DTO fields remain unchanged.
- Project detail reuses Bloom primitives, dialogs and toast utilities. Create/edit/status and keyboard/touch reorder controls sit beside the ordered list; Team sees only readable rows. Client summaries nest under relevant Projects, with no global Milestone destination or future-phase placeholders. Project/Client activity filters Milestone events by current readability.
- The existing remote zero verifier's push path filter now includes `lib/bloomops/schema.mjs` and `drizzle/**`. Manual dispatch, database target, cleanup, identity checks, concurrency and isolation logic are unchanged. A workflow regression checks the new paths and retained controls.

### Verification

Node 22.22.1 / Wrangler 4.129.0; local D1 and development R2 mail only, with example.com fixture identities. Dependency manifests and lockfile are unchanged. No production deployment, staging business-data mutation, DNS, real email or Leadsthatbloom operation occurred.

| Check | Result |
|---|---|
| `npm ci` | Passed; package and lockfile unchanged. The same 49 existing advisory entries (5 high, 43 moderate, 1 low) documented by A11 remain; B2 introduces no dependency. |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 passed: 76 domain/lifecycle/rollback/revocation, 32 access/visibility, 25 real-session HTTP, 19 ordering/concurrency, 17 schema and 4 UI tests. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed. |
| A8/A9/A10/A11 + auth/authorization/security/Client/Service/assignment regressions | 421/421 passed, including A8 72, A9 44, A10 39 and A11 82. |
| `npm test` | 3,354/3,354 passed; zero failures/skips. |
| `npm run build`; `npm run cf:build` | Both passed, including Next lint/type checks and OpenNext Worker generation. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22 checks passed: genuinely empty disposable DB; 60 inherited and 10 domain migrations; 66 total migration-defined tables including ledgers / 30 domain tables; 68 explicit domain indexes and 13 immutability triggers; FK/integrity checks; identical complete schema and both ledgers after the no-op second pass. |
| `node scripts/milestones-smoke-local.mjs` | 28/28 actual workerd/D1 checks passed, including idempotent creates/completion, visibility revocation, atomic rollback and 200-row reorder within D1 bind limits. |
| `node scripts/projects-smoke-local.mjs`; `node scripts/release-a-hardening-smoke-local.mjs` | B1 25/25 and A11 26/26 actual D1 checks passed against the current migrations. B1 checks its original migration prefix while accepting B2. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| `node scripts/milestones-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b2-review --playwright /tmp/bloomops-a11-browser` | 117/117 checks passed; 38 screenshots at 1440, 1024, 768, 390 and 320px. Real coordinator create/edit/status/keyboard and touch reorder, visible-only Client progress, Team denial, immediate visibility/contact/scope/suspension revocation, rollback, no-store, focus, reduced motion and responsive geometry passed. |
| `node --check` on changed/new JavaScript; `git diff --check` | 28 modules/scripts passed syntax checks; diff check passed. JSX is covered by the builds. |

Local logs and captures are `/tmp/bloomops-b2-*`; these are verification artifacts, not repository assets. The live Bloomlab design gallery rendered successfully and was inspected at `/tmp/bloomops-b2-design.png`. Existing external Playwright 1.63.0 / Chromium tooling is reused; no browser dependency was installed. Representative internal, dialog, Team and portal captures were visually inspected across all five widths, including the corrected tablet portal layout.

The six new B2 test files were also copied into an isolated archive of the unchanged verified B1 merge. All six fail to load because the Milestone implementation is absent there. This is a new-feature baseline check, not a claim of six pre-existing B1 defects. The final current implementation passes all 173 individual B2 tests.

Verification corrections: the initial order-test source had an invalid await inside a synchronous callback; this test syntax was corrected before the passing run. A portal render test initially rejected valid 0-of-1 progress; it now rejects fabricated 0-of-0 and independently proves hidden-only Projects render no Milestone progress. No application behavior was changed to satisfy that weak assertion. Browser acceptance initially expected 201 for the existing B1 assignment endpoint, which correctly returned 200; the harness now checks that established contract. A separate real-browser probe reproduced terminal Milestone status changes losing keyboard focus to the document body when the status control disappeared. B2 now restores focus to the surviving Edit control. The same probe passes on the final Worker (`/tmp/bloomops-b2-focus-before.log` and `focus-after.log`), and acceptance checks focus after every status mutation. The browser assertions wait for the existing asynchronous dialog/focus effects to settle instead of sampling before the requested animation frame; they still fail if focus is never restored. The final story also uses a real touch-enabled context for reordering and checks reduced motion. Tablet acceptance also reproduced a portal Project row that did not wrap its new full-width Milestone child above the mobile breakpoint (768px viewport measured 833px document width). A dedicated portal Project wrapping rule fixes the parent layout at every width; the browser probe measures 768px afterward, with no clipped content. The first HTTP smoke started before the preview listener was ready; its rerun follows a successful development health check. One local Next build attempt was terminated with SIGTERM during trace collection after compilation and type checks; the detached sequential rerun completed both builds with exit 0. The final external verifier initially received a safe 429 after the HTTP smoke consumed Better Auth’s existing five-per-60-second magic-link allowance. After that window expired, the unchanged verifier passed 21/21 against the same bundle; authentication limits were not relaxed.

### Remaining gates and scope

B2’s independent audit, merge and both post-merge gates are now closed as recorded above. The 200-Milestone bound, terminal Completed/Skipped, fixed parents and read-only Team coordination are deliberate B2 limits. B3 Actions + Dependencies, Deliverables, Files, comments, approvals, templates/generation, notifications and automatic Project completion remain outside this implementation.

### Changed files by area

All 44 paths are relative to the repository root. The supplied B2 contract is included; the temporary Codex prompt has no net diff against main.

- Domain: `lib/bloomops/activity.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/client-activity.mjs`, `lib/bloomops/milestone-access.mjs`, `lib/bloomops/milestone-values.mjs`, `lib/bloomops/milestones.mjs`, `lib/bloomops/project-activity.mjs`.
- API: `app/api/bloomops/portal/projects/[id]/milestones/[milestoneId]/route.js`, `app/api/bloomops/portal/projects/[id]/milestones/route.js`, `app/api/bloomops/projects/[id]/milestones/[milestoneId]/route.js`, `app/api/bloomops/projects/[id]/milestones/[milestoneId]/transition/route.js`, `app/api/bloomops/projects/[id]/milestones/reorder/route.js`, `app/api/bloomops/projects/[id]/milestones/route.js`, `lib/bloomops/milestone-api.mjs`.
- UI: `app/(internal)/work/projects/[id]/page.jsx`, `app/bloomops.css`, `app/portal/page.jsx`, `components/bloomops/MilestoneControls.jsx`, `components/bloomops/Milestones.jsx`, `components/bloomops/PortalHome.jsx`, `components/bloomops/Projects.jsx`.
- Schema/migrations: `drizzle/0009_b2_milestones.sql`, `drizzle/meta/0009_snapshot.json`, `drizzle/meta/_journal.json`, `lib/bloomops/schema.mjs`.
- Tests/verification: `.github/workflows/verify-zero-remote.yml`, `scripts/milestones-review-local.mjs`, `scripts/milestones-smoke-local.mjs`, `scripts/projects-smoke-local.mjs`, `tests/_milestones.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-milestones-access.test.mjs`, `tests/bloomops-milestones-domain.test.mjs`, `tests/bloomops-milestones-http.test.mjs`, `tests/bloomops-milestones-order.test.mjs`, `tests/bloomops-milestones-schema.test.mjs`, `tests/bloomops-milestones-ui.test.mjs`, `tests/bloomops-schema.test.mjs`, `tests/zero-verify-safety.test.mjs`.
- Docs: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B2.md`.

## Projects Core (B1)

B1 is closed: PR #15 merged as `cacb2d3`, with both gates verified above. The following section retains its historical implementation and local evidence. B2 extends it as recorded above.

B1 adds the canonical Project model, Project assignments, scoped internal APIs and Work screens, conditional Client Projects tab, and minimal safe Project summaries in the existing portal. The detailed lifecycle matrix and access rules are recorded in `DOMAIN_MODEL.md` under Projects. There are no Milestone/Action/Deliverable/File placeholders, automatic Project generation, notifications, or later Release B features.

### Implementation decisions

- Additive Drizzle migration `0008_b1_projects_core.sql` creates `projects` and `project_assignments` and the Service composite unique index needed for workspace-and-Client foreign-key enforcement. Historical migrations and Release A tables are preserved. There are now 29 domain tables.
- Parent Client and optional Service stay fixed in B1. Service-specific Department is derived; client-level Department is optional. New relationships validate active members/departments and open Services, with guards rechecked inside the committing batch.
- Explicit Project assignments add only Project scope. Client-wide and Service-specific assignments apply to their ordinary child Projects; Department and ownership grant nothing. Restricted Projects preserve A4's narrower visibility, including Project Manager restrictions.
- Status, health, responsibility and Client/Service lifecycles remain separate. A revision-based conditional batch atomically writes each change and its semantic activity. Retries converge without duplicate events; completion and its winning timestamp survive archiving. No natural name uniqueness is invented.
- Protected API routes retain A11 origin protection, body allowlists, sanitized failures, and `no-store`. SQL reads recheck live membership/scope/visibility; large assignment scopes use relational predicates. Portal selects only label/status/dates and Client context. Internal Client history also respects current Project restrictions.
- UI reuses Bloom's primitives, dialogs, field labels, toasts, typography and semantic colors. Work is now available; its list shows status, health, client/service context, owner and target date. Client and portal Project sections appear only for relevant records. Lists cap at 200 with an explicit notice and status/Client narrowing.

### Verification

All verification uses Node 22.22.1, isolated local D1/R2 and example.com identities. No production deployment, staging business-data mutation, real email, DNS, or Leadsthatbloom action was performed.

| Check | Result |
|---|---|
| `npm ci` | Passed; dependency manifests and lockfile unchanged. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed: lifecycle, relational/tenant constraints, real-session API denials, stale state, retries/concurrency, activity rollback, visibility, large scope, and conditional UI/portal projection. |
| Auth/authorization/membership/invitation/mail/middleware/Client/Service/assignment regressions plus A8/A9/A10/A11 | 421/421 passed. Includes A8 72, A9 44, A10 39 and A11 82. |
| `npm test` | 3,180/3,180 passed; zero failures/skips. |
| `npm run build`; `npm run cf:build` | Both passed, including Next lint/type checks and OpenNext Worker generation. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: empty disposable database, all 60 inherited and 9 domain migrations, 65 total migration-defined tables including ledgers / 29 domain tables, 64 domain indexes, 13 immutability triggers, foreign-key/integrity checks, identical complete schema and both ledgers after a no-op second pass. |
| `node scripts/projects-smoke-local.mjs` | 25/25 passed on actual disposable workerd/D1, including transaction rollback, conflicting transitions, assignments, immediate revocation and 230 assigned Projects. |
| `node scripts/release-a-hardening-smoke-local.mjs` | 26/26 A11 actual workerd/D1 checks passed against the new schema. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed; local target only. |
| `node scripts/projects-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b1-review --playwright /tmp/bloomops-a11-browser` | 124/124 browser/HTTP checks passed, 42 screenshots at 1440/1024/768/390/320px. Covers create/double-click/validation, modal keyboard focus, lifecycle and independent health, assignment edit/removal, Team read-only scope, parent/sibling denials, conditional Client tab, safe single/multi-client portal, sanitized rollback, visibility revocation and suspended sessions. |
| `node --check` on changed/new JavaScript; `git diff --check` | 32 modules/scripts passed syntax checks; diff check passed. JSX is verified by both application builds. |

The local Worker received migration 0008 and runs via `npx --no-install opennextjs-cloudflare preview -- --log-level error`. This is separate from the fresh disposable migration proof. The live Bloomlab design gallery was successfully rendered and inspected; its capture is `/tmp/bloomops-b1-review/design-reference.png`. Creation, detail, Work list, portal and status-dialog captures were visually reviewed in addition to the automated geometry/keyboard assertions. Screenshots and command logs remain local `/tmp/bloomops-b1-*` evidence, not repository assets. Existing Playwright 1.63.0 / Chromium 153 tooling lives outside the repository at `/tmp/bloomops-a11-browser`; no browser dependency was added.

Verification corrections: the A4 action matrix now explicitly includes all four Project actions; shell/schema expectations account for B1. The old A9 assertion that Projects did not exist is replaced with the stronger current invariant that activation creates zero Project records. A11's disposable smoke still verifies the complete Release A migration prefix while accepting the additive B1 migration. The B1 D1 fixture now explicitly seeds active memberships and uses D1's supported `quick_check`. An existing Worker HTTP smoke `SELECT` met `SQLITE_BUSY` through its independent local Wrangler connection; its helper now retries at most three times, only for read-only queries and an explicit lock error. No application mutation or uncertain failure is retried by that correction. The SQLite/D1 transaction double is unchanged.

The initial Project browser run successfully created and assigned work, but its parent-denial check used GET on the existing PATCH-only Client endpoint. The harness now checks the real protected Client Projects GET instead and independently asserts both Project access and parent denial. A subsequent injected-failure check proved sanitized HTTP 500 plus unchanged Project/revision but rejected Next's additional `private, no-cache, max-age=0, must-revalidate` cache directives. The assertion now checks for the required `no-store` directive without rejecting stronger accompanying directives. Modal captures disable finite animations and use the actual viewport so fixed overlays are inspected after settling. Local magic-link rate-limit refusals are waited out; no general application failure is replayed.

A later browser attempt was interrupted when the local preview process exited with SIGTERM (143), causing a socket failure. The same verified bundle was restarted for final acceptance; no application change was made. Browser transport diagnostics now omit cookie/authorization/token lines, and sessions for the disposable B1 fixture identities were revoked before restarting that run.

An intermittent portal geometry assertion was isolated against the real page: its account control measured 44px after settling. Responsive measurements now wait for fonts, two animation frames and finite animations, and print exact geometry on a failure. The final preview runs in a separate local process so the verification terminal lifecycle does not own it. These are harness changes; the application builds and invariant-test evidence remain unchanged.

### Scope and next phase

B1 independent review, merge and both post-merge gates are complete. The internal list limit and fixed Project parents remain deliberate B1 boundaries. B2 Milestones follows, with its current evidence recorded above.

### Changed files by area

Paths below are relative to the repository root and cover the final B1 diff against verified main, including the supplied Release B/B1 planning commits. The temporary `B1_CODEX_PROMPT.txt` is removed with no net prompt-file diff against main.

- Domain: `lib/bloomops/project-values.mjs`, `projects.mjs`, `project-access.mjs`, `project-assignments.mjs`, `project-activity.mjs`, `authorization.mjs`, `activity.mjs`, `client-activity.mjs`.
- API: `lib/bloomops/project-api.mjs`; `app/api/bloomops/projects/route.js`, `projects/[id]/route.js`, `projects/[id]/transition/route.js`, `projects/[id]/assignments/route.js`, `projects/[id]/assignments/[assignmentId]/route.js`, `clients/[id]/projects/route.js`, `portal/projects/route.js`, `portal/projects/[id]/route.js` (all route paths under `app/api/bloomops/`).
- UI: `app/(internal)/work/page.jsx`, `work/projects/new/page.jsx`, `work/projects/[id]/page.jsx`, `clients/[id]/page.jsx` (under `app/(internal)/`); `app/portal/page.jsx`, `app/bloomops.css`; `components/bloomops/Projects.jsx`, `ProjectForm.jsx`, `ProjectControls.jsx`, `ProjectTeam.jsx`, `Clients.jsx`, `PortalHome.jsx`; `lib/bloomops/navigation.mjs`.
- Schema/migrations: `lib/bloomops/schema.mjs`, `drizzle/0008_b1_projects_core.sql`, `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json`.
- Tests/verification: `tests/_projects.mjs`, `bloomops-projects-domain.test.mjs`, `bloomops-projects-http.test.mjs`, `bloomops-projects-schema.test.mjs`, `bloomops-projects-ui.test.mjs`, `bloomops-activation.test.mjs`, `bloomops-authorization.test.mjs`, `bloomops-schema.test.mjs`, `bloomops-shell.test.mjs` (under `tests/`); `scripts/projects-smoke-local.mjs`, `projects-review-local.mjs`, `auth-smoke-local.mjs`, `release-a-hardening-smoke-local.mjs` (under `scripts/`).
- Docs: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B1.md`.

## Release A Hardening (A11)

### Strategy and verified base

A11 treats A3–A10 as a release candidate and attacks stored-state races, transaction failures, authorization and field boundaries, lifecycle recovery, migration safety, and the two Release A acceptance stories. Reproductions use real SQLite SQL/serialized batches and real Better Auth sessions; separate disposable workerd/D1 and built-Worker browser runs verify Cloudflare and user-facing behavior. No test double was changed. The A9 stale-sender injection now intercepts the transactional batch instead of replacing a Drizzle query's `returning` method with a Promise.

The branch starts at merged main `b7d65ee6bd998fe3b04bdec60860f447cd2452d1` (A10 PR #13), followed by task carrier `ee04c0e`. Read-only preflight confirmed [Deploy staging 34108338874](https://github.com/Beeyach/bloomops/actions/runs/34108338874) and [Verify zero-to-current 34108461749](https://github.com/Beeyach/bloomops/actions/runs/34108461749) completed successfully on that exact main SHA. The latter's logs explicitly prove deletion of its disposable database, exact restoration of the eight-database inventory, and unchanged staging identity. These are the pre-A11 gate, not verification of A11 or a future merge.

The final verification also ran the 82 new adversarial tests against an isolated archive of `ee04c0e` with its unchanged pre-hardening application code: 38 failed and 44 passed. The same tests pass 82/82 on the final A11 implementation. Failures reproduce all twelve correction areas below, including middleware caching, URL telemetry, and the four unsafe staging-config shapes. The comparison archive and its logs are disposable local evidence, not a second branch or a test-double change.

### Reproduced defects and corrections

| Defect | Correction and regression evidence |
|---|---|
| Generic invitation acceptance could grant/reactivate membership after token rotation/revocation or workspace suspension won the race, and leave partial membership/acceptance when a later event failed. | Generic and explicitly contact-bound invitations now share one fenced acceptance batch. Live token hash, expiry, workspace, membership state, and any intended contact are checked under the write lock. Concurrent acceptance converges to the accepted identity; inactive accepted-token retries are refused. Both acceptance events roll back with membership/contact/invitation writes. |
| Generic resend/revoke/expiry changed the invitation before separately recording activity. A failed event left token/status drift. A stale expiry lookup could invalidate a newly rotated token; revoke racing generic retargeting could record activity against the prior client. | Conditional event insertion and mutation share one batch and stored-state predicate. Expiry compares the old token and expiry; revoke compares its token snapshot; lookup rejects a token that rotated during the read. Activation-managed ownership is checked both before and within generic mutations. |
| Concurrent suspensions could remove both remaining Owners; failed membership activity left the status changed. | The last-Owner check now runs under the transaction's write lock. Membership status and its event commit together; the losing request returns a safe conflict. |
| Concurrent duplicate Client, Service, contact, and assignment edits/removals appended history for changes that happened only once. | Client/Service/assignment edits compare the stored snapshot and conditionally record events in the same batch. Contact editing validates its snapshot under the write lock before detail/primary writes; unlinked contact removal is conditional and atomic. No-op/stale attempts add no phantom events. |
| A successfully delivered activation invitation became unrecoverable after its seven-day expiry: delivery was `sent`, generic resend was correctly refused, and activation retry was a no-op. | The existing activation retry can renew an expired, unaccepted invitation. Its claim serializes concurrent renewals; the first delivery timestamp and initial lifecycle events remain singular. The existing activation panel explains expiry and exposes retry. Accepted/revoked invitations are not renewed by this path. |
| The existing resolution textarea allowed multiline input, but the server rejected ordinary line breaks. | Reason validation permits newline, carriage return, and tab while retaining the length bound and rejection of other control characters. Multiline rationale is retained and tested through the narrow-screen keyboard flow. |
| Malformed/null/array/scalar JSON on Client/contact/Service PATCH could be treated as an empty successful edit. | The shared body reader requires a JSON object and returns a safe 400 without a write. |
| Unexpected database/authorization/read errors in protected Release A routes escaped their JSON contract. | A small shared error boundary wraps every BloomOps route, preserves established statuses, sanitizes unexpected errors to JSON 500, and applies `no-store` to all responses. Forced late constraint failures are checked through real route handlers and the built Worker. |
| Middleware could replace a protected handler's `no-store` policy with weaker revalidation headers. | Middleware now preserves `no-store` for authenticated and denied responses, portal HTML, sign-in, and token-bearing invitation/auth routes. Regression tests cover the merged boundary, with a built-Worker assertion in browser acceptance. |
| Enabled Worker invocation logs/traces could persist raw invitation or magic-link tokens from request URLs. | Disable Worker observability logs, invocation logs, and traces until URL redaction is available. A regression resolves the actual Wrangler configuration for development, staging, and production and proves all three are disabled. Business activity remains in D1. |
| The supported 200-client list and large assigned scopes exceeded D1’s bound-variable limit, although SQLite unit calls passed. | Client scope and primary-contact lookups now bind the authorized ID set as one JSON parameter and apply relational `json_each` predicates with the existing workspace filter. Actual D1 proves both full-page reads and large assignment scope without leaking unassigned clients; two focused regressions also verify contact association and counts. |
| The staging config guard accepted additional D1/R2 bindings and an incorrect environment/origin despite validating the first resource names. | The guard now requires exactly one D1 and R2 binding, the staging environment, and the explicit staging origin. Disposable config-corruption tests prove rejection without contacting Cloudflare. |

All corrections use the existing schema, capabilities, lifecycle operations, reason mappings, and design primitives. No migration, historical migration rewrite, dependency, resource binding, product destination, or Release B feature was added.

### Security, data, lifecycle, and failure evidence

The new tests compare unauthorized portal responses byte-for-byte for unknown, foreign, internal, restricted, and instance-as-item identifiers; assert exact Client-facing field allowlists; deny Client calls into internal Client/Service/assignment/member/invitation/onboarding APIs; and invalidate already-issued sessions immediately after membership suspension/removal or workspace deactivation. Unsupported/prototype action names default deny. Existing A4–A10 regressions retain department/owner non-grants, canonical client/service assignment boundaries, workspace-body/query smuggling denial, restricted activity privacy, and same-email/contact-link acceptance refusals.

Direct SQL attacks reject fourteen additional A8–A10 foreign-parent combinations for provenance, activation, contact association, submissions, and resolutions. The existing migration/schema/compiler tests retain same-workspace composite FKs, partial uniqueness, immutable definitions/provenance/activity, deterministic generation, and bootstrap idempotency. Later master publication and contact-address edits preserve runtime snapshots and accepted identity. The domain-only fresh database has exactly the 27 Release A domain tables.

Lifecycle tests retain concurrent first activation, contact/service prerequisite changes, failed/missing local mail, uncertain acknowledgement, stale sender/token finalization, expired delivery leases, and late core rollback. New cases add workspace/role/status/primary/removal races and expiry recovery. A10 regression plus new adversarial tests cover duplicate completion/submission/verification, competing waiver/N/A rationale, submission versus verification, two final mutations, response-loss retries, late mutation rollback, hidden required work, optional work, independent service status, and protection of non-initial or unexpected Client lifecycle states. Significant lifecycle events are singular and immutable. Raw tokens remain hashed in storage and absent from public invitation DTOs and activity; test delivery uses only memory or development R2 capture.

### Verification

All required local verification passed on 2026-09-07/08; final browser acceptance completed on 2026-09-08 before updating the documentation index or opening the PR.

| Exact command | Result |
|---|---|
| `npm ci` | Passed; lockfile unchanged. |
| `node --test tests/bloomops-hardening-*.test.mjs` | 82/82 passed. |
| `node --test tests/bloomops-onboarding-runtime.test.mjs` | A10: 39/39 passed. |
| `node --test tests/bloomops-activation.test.mjs` | A9: 44/44 passed. |
| `node --test tests/bloomops-onboarding-compiler.test.mjs tests/bloomops-onboarding-templates.test.mjs` | A8: 72/72 passed. |
| `node --test tests/bloomops-auth.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-invitations.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-mail.test.mjs tests/bloomops-middleware.test.mjs tests/bloomops-clients.test.mjs tests/bloomops-services.test.mjs tests/bloomops-assignments.test.mjs` | 184/184 passed. |
| `node --test tests/bloomops-schema.test.mjs tests/bloomops-shell.test.mjs tests/zero-verify-safety.test.mjs` | 56/56 passed. |
| `npm test` | 3,083/3,083 passed; zero failures/skips. |
| `npm run build` | Passed, including Next's lint/type checks. |
| `npm run cf:build` | Passed; OpenNext Worker bundle generated. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22 checks passed: genuinely empty disposable database, all 60 inherited and 8 domain migrations, exactly 63 migration-defined tables including ledgers (27 domain tables), all 55 explicit domain indexes and 13 immutability triggers, valid FKs/SQLite integrity, and second pass with identical complete schema and both ledgers. |
| `node scripts/release-a-hardening-smoke-local.mjs` | A11 actual workerd/D1: 26 checks passed. |
| `node scripts/onboarding-runtime-smoke-local.mjs` | A10 actual workerd/D1: 27 checks passed. |
| `node scripts/activation-smoke-local.mjs` | A9 actual workerd/D1: 14 checks passed. |
| `node scripts/onboarding-smoke-local.mjs` | A8 actual workerd/D1: 12 checks passed. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed; local target only. |
| `node scripts/onboarding-portal-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-a11-review --playwright /tmp/bloomops-a11-browser` | 174/174 checks passed; 42 acceptance screenshots at 1440/1024/768/390/320px, plus the live design-reference capture. |
| `node --check` on changed/new JavaScript scripts and modules; `git diff --check` | All 48 JavaScript files passed; diff check passed. |

These commands used Node 22.22.1. Browser tooling was installed outside the repository with `npm install --prefix /tmp/bloomops-a11-browser --no-audit --no-fund --fetch-retries=0 playwright` (Playwright 1.63.0; existing Chromium 153.0.8010.12). The built Worker ran through `npx --no-install opennextjs-cloudflare preview -- --log-level error`; this avoids local request-URL logging. The existing local Worker database also received `npm run db:schema:local`, `npm run db:migrate:local`, and `npm run db:domain:migrate:local` before HTTP acceptance; the genuinely fresh/no-op proof is the separate disposable verifier above.

The earlier fresh-migration attempt hit a Wrangler subprocess assertion (`message?.id === id`); a fresh disposable rerun passed all checks. No migration was modified to accommodate it. The final verification session reran npm installation and Node tests outside the filesystem/process sandbox: the sandbox blocked installation subprocesses/cache writes and reported only test-file counts, which were discarded as evidence. Local workerd checks also require loopback sockets that the sandbox refuses; their approved reruns remain local. Focused reproductions failed before their corrections; test-harness timing and event-metadata integration mistakes caught during verification were corrected before the passing runs.

Browser verification exposed four harness issues: the reference screenshot could precede the gallery's render; a standalone Wrangler fixture connection hit `SQLITE_BUSY` while the live Worker held the same local database; a fixed publication-marker title could already exist after a previous run, causing a false failure despite identical runtime snapshots; and two later Client-create fixtures omitted required contact fields, so validation correctly prevented the intended database-failure/multi-client checks. Reference capture now waits for the gallery heading and fonts. The new-version fixture insert uses a fixed ID with `ON CONFLICT(id) DO NOTHING`, retries only explicit lock errors, and verifies the exact stored definition hash. Its title is unique per run, preserving bootstrap's immutable-history behavior. Both Client fixtures now supply valid required contacts. Other fixture/application mutations are not blindly replayed, and application validation and runtime/D1 race tests are unchanged.

### Dependency advisory assessment

The supplementary `npm audit --json --fetch-retries=0` returned its expected nonzero advisory status: 49 affected package entries (5 high, 43 moderate, 1 low), including transitive duplicates. No lockfile or dependency was changed. This is not a zero-advisory dependency tree. The high-severity entries are brace-expansion, Browserslist, nanoid, PostCSS, and sharp; the first four concern build/query/CSS/generator inputs not accepted by Release A's onboarding APIs. The OpenNext Cloudflare image handler uses the optional Cloudflare Images binding, not sharp/libvips, and no Images binding is configured. Tiptap's [attribute-merging advisory](https://github.com/advisories/GHSA-cp6q-959q-f8rh) concerns an untrusted attribute-object boundary: Release A has no editor/import workflow, and the inherited editor uses fixed schemas and HTML content. No reachable Release A exploit was identified by this scoped assessment. Dependency maintenance and a separate inherited-editor review remain follow-up work; the audit's suggested major Next/Drizzle changes were not applied as unrelated release hardening.

### Acceptance, isolation, and release closure

Both Release A acceptance stories passed through the built Worker, real Better Auth sessions, local D1/R2, and Chromium. Story 1 creates Lawrence and Kajabi, assigns Ary, activates and accepts the local invitation, completes Common + Kajabi requirements, keeps submitted Kajabi access awaiting verification, and reaches Client Active only after Ary verifies it. The Service remains Planned and each significant lifecycle event occurs once. Story 2 creates James with Social + Ads + GHL, proves one Meta item linked to both applicable engagements, gives the Social contractor only canonical Social scope and Ary GHL scope, refuses parent/sibling/onboarding access without assignment, isolates both Clients, and preserves all generated items/provenance/service links after a new master version is published. The flow requires only Release A's 27 domain tables.

The 174 browser/HTTP checks include sign-in and invitation acceptance, five-width portal/internal layouts, accessible progress values/text, required/optional and awaiting-verification/completion states, keyboard completion/verification/multiline waiver/N/A, duplicate-click singularity, reload persistence, expired invitation recovery, safe malformed-input and late-failure responses with rollback, immediate session suspension, and separate single-/multi-client contexts. All 42 acceptance screenshots were captured at the stated widths; representative desktop/mobile states and both multi-client layouts were visually inspected. The text browsing tool refused the design-reference URL, but Chromium successfully opened the live design gallery; its fully rendered reference was captured and visually inspected.

No production, DNS/custom domain, staging data, or Leadsthatbloom resource was manually modified. Local Worker tests refuse non-loopback targets and require development R2 mail; D1 smoke uses disposable non-persistent local bindings. No real email was sent.

A11 adds no Release B features. Deliberate portal retargeting/revocation/reinvite, general file uploads, arbitrary template-editing UI, and later execution workflows remain outside Release A. Release A is complete and audited locally. Independent PR review, user-controlled merge, then staging deployment and remote zero-to-current verification on the actual merge SHA are still required before final release closure.

### Exact A11 file manifest

The net PR changes these 53 files relative to the verified main. The task carrier is deleted and has no net PR diff.

Domain consistency and activation UI:

- `components/bloomops/ClientActivation.jsx`
- `lib/bloomops/activity.mjs`
- `lib/bloomops/assignments.mjs`
- `lib/bloomops/client-activation.mjs`
- `lib/bloomops/client-contacts.mjs`
- `lib/bloomops/client-invitation-acceptance.mjs`
- `lib/bloomops/clients.mjs`
- `lib/bloomops/invitations.mjs`
- `lib/bloomops/membership.mjs`
- `lib/bloomops/onboarding-runtime.mjs`
- `lib/bloomops/services.mjs`

Protected API error boundary:

- `app/api/bloomops/clients/[id]/activate/route.js`
- `app/api/bloomops/clients/[id]/assignments/[assignmentId]/route.js`
- `app/api/bloomops/clients/[id]/assignments/route.js`
- `app/api/bloomops/clients/[id]/contacts/[contactId]/route.js`
- `app/api/bloomops/clients/[id]/contacts/route.js`
- `app/api/bloomops/clients/[id]/onboarding/items/[itemId]/[operation]/route.js`
- `app/api/bloomops/clients/[id]/onboarding/route.js`
- `app/api/bloomops/clients/[id]/retry-invitation/route.js`
- `app/api/bloomops/clients/[id]/route.js`
- `app/api/bloomops/clients/[id]/services/[serviceId]/assignments/[assignmentId]/route.js`
- `app/api/bloomops/clients/[id]/services/[serviceId]/assignments/route.js`
- `app/api/bloomops/clients/[id]/services/[serviceId]/route.js`
- `app/api/bloomops/clients/[id]/services/route.js`
- `app/api/bloomops/clients/_shared.mjs`
- `app/api/bloomops/clients/route.js`
- `app/api/bloomops/invitations/[id]/resend/route.js`
- `app/api/bloomops/invitations/[id]/revoke/route.js`
- `app/api/bloomops/invitations/accept/route.js`
- `app/api/bloomops/invitations/route.js`
- `app/api/bloomops/me/route.js`
- `app/api/bloomops/members/[id]/route.js`
- `app/api/bloomops/members/route.js`
- `app/api/bloomops/portal/onboarding/[id]/items/[itemId]/submit/route.js`
- `app/api/bloomops/portal/onboarding/[id]/route.js`
- `app/api/bloomops/portal/onboarding/route.js`
- `lib/bloomops/api-handler.mjs`
- `middleware.js`

Environment guards, tests, and verification scripts:

- `.github/scripts/ensure-staging-resources.mjs`
- `.github/scripts/verify-zero-remote.mjs`
- `wrangler.jsonc`
- `scripts/onboarding-portal-review-local.mjs`
- `scripts/release-a-hardening-smoke-local.mjs`
- `tests/bloomops-activation.test.mjs`
- `tests/bloomops-middleware.test.mjs`
- `tests/bloomops-hardening-config.test.mjs`
- `tests/bloomops-hardening-data.test.mjs`
- `tests/bloomops-hardening-http.test.mjs`
- `tests/bloomops-hardening-invitations.test.mjs`
- `tests/bloomops-hardening-lifecycle.test.mjs`

Documentation:

- `docs/BUILD_STATE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/INDEX.md`

## Client Onboarding Portal (A10)

### Runtime and privacy

`onboarding-views.mjs` supplies a dedicated Client allowlist through the portal page and no-store GET APIs. It reloads active membership/contact scope and prefers the exact A9 activation instance, with a latest-instance fallback for existing generated work. It projects each reachable client into its own named section. Only visibility `client` items are read for the portal. Logical keys, template provenance, service relationships, membership/actor ids, raw invitations, and resolution rationale never reach Client props or API JSON. Internal views use the same A4 resource policy and omit restricted items for unnamed managers/team members; item activity follows that visibility too.

“Your steps” counts only client-visible, client-responsible required items. Completed/Waived/Not Applicable and durable verification submissions count as the Client having done their part. Optional items do not enter the denominator. A Client can reach 100% while overall onboarding still awaits agency verification or hidden work; the portal says they are all set for now without exposing hidden counts. Visible agency-owned work remains read-only.

### Mutations, durable facts, and completion

`onboarding-runtime.mjs` is the canonical mutation engine. `onboarding.submit` is Client-only and requires contact scope plus client visibility/responsibility. Non-verification work becomes Completed with completion actor/time; verification work becomes In Progress with an immutable submission and no completion/verification fields. Repeated submissions/completions are no-ops. There is no Client undo or arbitrary-status API.

`onboarding.verify` and `onboarding.manage` are Owner/Admin/Project Manager actions. Existing restricted-record policy still applies. A Team Member's assignment, department, or internal owner designation grants no write. Verification requires actual submission and records verified/completed actor/time together. Internal users can complete non-client work (including verification when configured). Waived/Not Applicable require a bounded non-empty reason, retained both operationally and in append-only activity; a terminal resolution cannot be overwritten. Client UI shows “No action needed” without the internal rationale.

The first real item mutation starts a Not Started instance; viewing does not. One D1 batch owns the item, durable fact, semantic event, instance lifecycle, and optional Client lifecycle transition. A compare-and-set guard rechecks membership, workspace, role, Client contact, item visibility/responsibility/verification and current status under the write lock. Contenders reload boundedly and converge to a no-op or safe refusal. Final predicates run after the item write against ALL required items, not the portal count. Completion records ONBOARDING_COMPLETED once and activates the Client only if this is A9's initial instance and relationship status is still Onboarding; a distinct CLIENT_ONBOARDING_COMPLETED event records that transition. Service status and unexpected Client lifecycle states are untouched. Late event failures roll back the whole batch; API errors never expose database details.

### Additive migration and UX boundary

Migration `0007_a10_onboarding_progress.sql` adds `onboarding_item_submissions` and `onboarding_item_resolutions`, their primary-key uniqueness and same-workspace item/member foreign keys, a bounded-reason CHECK, and four immutable-fact update/delete triggers. Drizzle schema, snapshot and journal match. There is no prior migration edit, table rebuild, or runtime schema repair. The item remains the canonical owner of outcome/status; its instance supplies the client relationship.

The portal and internal Client > Onboarding tab use existing Bloom components, an ordered list, accessible text progress, keyboard actions and status announcements. Internal resolution controls require reasons and show the stored rationale. Schema-v1 defines no input type/upload flag/URL: A10 acknowledges externally described steps, provides no file uploader, invents no links, and does not claim a Files module. No master definition or generated template snapshot is silently rewritten. No Release B features, payments, queues or additional notifications are included.

### A10 verification

Verification is local only, using memory or development R2 mail. No real email or staging, production, DNS/custom-domain, or Leadsthatbloom resource was modified. The live design reference could not be opened; repository design guidance was used. Final verification evidence follows. All Node checks use 22.22.1. No application dependency, AGENTS.md, deployment configuration, or workflow was changed.

| Check | Result |
|---|---|
| `npm ci` | Exit 0; lockfile/dependencies unchanged |
| A10 focused | 39/39 |
| A9 regression | 44/44 |
| A8 template/compiler regression | 72/72 |
| Affected authorization/client/service/assignment/invitation | 141/141 |
| Shell/schema | 36/36; combined regression invocation 332/332 |
| `npm test`, Node 22.22.1 | 3001/3001, no failures or skipped tests |
| `npm run build` | Exit 0, including lint/type checks |
| `npm run cf:build` | Exit 0; `.open-next/worker.js` emitted; non-blocking dependency `punycode` deprecation warning |
| Disposable workerd A10 smoke | 27/27, including canonical Lawrence/Kajabi/assignment/activation/acceptance/completion and late final-event rollback |
| Local zero-to-current and no-op pass | 19/19: fresh disposable local D1, all 60 inherited/eight domain migrations, 27 domain tables, 55 explicit indexes, 13 immutable-data triggers; second pass applies nothing and schema/both ledgers stay identical |
| Existing actual D1 regression smoke | A9 14/14; A8 12/12 |
| Built Worker HTTP smoke (`auth-smoke-local.mjs`) | 144/144 |
| External verifier against local Worker | 21/21; development R2 mail only |
| A10 built Worker HTTP/browser/Release A acceptance (`onboarding-portal-review-local.mjs`) | 95/95, including complete Story 1, Story 2 merged Meta and Client isolation, keyboard completion, reload persistence, internal verification, waiver/N/A and safe denials |
| Browser viewports | 1440/1024/768/390/320px; 20 screenshots in `/tmp/bloomops-a10-review`; representative phone todo/waiting/complete, phone internal, and desktop internal/complete inspected |
| Syntax and `git diff --check` | Pass |

One intermediate rebuild received SIGTERM without a compiler diagnostic while the preview was running; both final builds passed sequentially after stopping that preview. The first browser pass found that the touch-size assertion measured hidden buttons inside closed resolution panels; the corrected check measures visible controls and separately tests the opened resolution buttons. No production behavior was changed to satisfy that test. Formatting tooling and Playwright/Chromium are external to application dependencies.

The temporary `A10_CODEX_PROMPT.txt` is removed before the implementation commit, with no net prompt diff against main. No remote deployment is claimed. A11 must wait for independent A10 audit/merge, green staging on the merge SHA, and green remote zero-to-current on that same SHA (manually dispatch if the existing path filters do not trigger it).

## Post-merge A8 verifier cleanup correction (2026-09-07)

Read-only inspection of the Actions logs confirmed that [Deploy staging 34078492009](https://github.com/Beeyach/bloomops/actions/runs/34078492009) succeeded on `adcdec226f75b81969d510ac21a4d772a1cf5371`. Concurrent [zero-to-current run 34078492054](https://github.com/Beeyach/bloomops/actions/runs/34078492054) passed the disposable database verification: all 60 inherited and six domain migrations, all 23 domain tables, migration-defined triggers/indexes, and an identical no-op second pass. It deleted its disposable database and restored the exact original seven-database inventory. Only the final staging table-count assertion failed: the independent deploy legitimately applied migration 0005, taking staging from 58 to 59 tables during the verifier run.

The cleanup now compares stable staging UUID and creation time; before/after table counts are explicitly informational. `.github/scripts/zero-verify-safety.mjs` holds the pure checks used by the live verifier. Exact original account inventory (UUID, name, version, creation time) is still required, independent of API ordering. The disposable name protections, distinct environment IDs, fresh disposable ID checks, temporary disposable-only configuration, and exact identity check before deletion remain enforced. The command guard now explicitly requires the `DB` binding as well as that temporary config, rejects named protected targets even with a valid config, and rejects environment/config overrides. Staging access is limited to read-only `d1 info`. The migration paths and workflow concurrency are unchanged; staging deployment is neither serialized nor cancelled.

`tests/zero-verify-safety.test.mjs` adds 20 local regression tests covering the observed 58-to-59 race, changed/missing staging identity, wrong disposable deletion ID, extra/missing/changed inventory entries, protected names and IDs, valid scoped commands, and refused target/config overrides. The workflow runs these tests before account operations and watches the helper/test paths. Focused tests pass 20/20 and the full suite passes 2918/2918 under Node 22.22.1. The local zero-to-current verifier exits 0: all 60 inherited migrations, six domain migrations, 23 domain tables, 50 indexes, and five immutable-data triggers are present; the second pass applies nothing and preserves the schema and both ledgers exactly. Node syntax, workflow YAML parsing, and diff checks pass. Application builds are not rerun for this verifier/workflow/test/docs-only change; no application, dependency, schema, or migration changed, including migration 0005.

The temporary task prompt is removed before the implementation commit, leaving no net prompt-file diff against main. No remote Wrangler command or manual staging mutation is performed in this correction. Production, DNS, and Leadsthatbloom remain untouched. That acceptance gate was subsequently satisfied after PR #11 merged: remote zero-to-current run 34093902316 passed on main `420b1451a8e22d8b7bef39dc052263a176bcfa2d` before A9 began.

## Client Activation (A9)

Implementation on `codex/a9-client-activation`, updated by merge from current main `420b1451a8e22d8b7bef39dc052263a176bcfa2d`. This is the expected PR #11 verifier correction, not unrelated base movement. Its post-merge [Deploy staging 34093902305](https://github.com/Beeyach/bloomops/actions/runs/34093902305) and [zero-to-current 34093902316](https://github.com/Beeyach/bloomops/actions/runs/34093902316) both passed before A9 implementation. They satisfy the replacement acceptance gate established by the verifier correction; the historical failed run named in the temporary A9 prompt remains historical.

### A9 audit correction: generic invitation revoke

The audit of PR #12 at `b0e4d3f8c2154de40e1eddb7a30dbe87e73de755` found that generic revoke could invalidate a delivered activation invitation while leaving delivery status `sent`. The correction adds resend's existing workspace-scoped `invitationContact` guard to `revokeInvitation`, before any status write or activity. The unchanged route returns the existing `activation_managed` HTTP 409 response. Ordinary invitations, including Client-role invitations without a contact association, remain revocable.

Two regressions were confirmed to fail against the reviewed implementation: the domain primitive returned success and the real HTTP route returned 200. They now prove refusal preserves the pending invitation and association, usable original token (including successful acceptance), `sent` delivery status, all core A9 rows, client lifecycle and activity; no `INVITATION_REVOKED` is appended. Real-session HTTP coverage checks Owner/Admin refusal, missing/foreign invitation equivalence, unauthenticated/cross-origin/suspended denial, and ordinary Client invitation revocation. Existing generic resend/retarget and ordinary team invitation lifecycle tests remain passing.

Correction verification on Node 22.22.1: focused A9 44/44, invitations 13/13, auth/authorization 34/34 (91/91 combined); `npm test` 2962/2962 with no failures or skips; `npm run build` exits 0 including lint/type checks. `npm run cf:build` exits 0 and emits `.open-next/worker.js` (non-blocking dependency `punycode` deprecation warning); `git diff --check` passes. No migration, UI change, browser screenshot rerun, activation-specific revoke/reinvite, or A10 work is included. Mail uses test transports only. PR #12 remains for independent review against main `420b1451a8e22d8b7bef39dc052263a176bcfa2d`, without merging.

### Core transaction and authorization

`lib/bloomops/client-activation.mjs` implements the distinct `client.activate` action for Owner, Admin, and Project Manager, scoped by the existing internal client descriptor. It reloads active membership through the authorization engine even when called with a previously loaded actor. Department membership and internal ownership grant no access. The POST activation and retry-invitation routes use the existing origin/session/resource checks; body-supplied identities, workspace ids, services, and template ids are not read.

Initial activation requires Draft, one primary contact with a valid normalized invitation address, and at least one open purchased service. The exact database set of Planned/Onboarding/Active/Paused engagements is passed to A8; terminal services are excluded. The canonical docs define no concrete per-service team prerequisite, so none was invented. Content Calendar alone generates Common. A8 still validates publications/hashes, compiles and merges logical keys, and retains exact source versions.

A small A8 refactor exposes `prepareOnboardingWrites`: all the original plan validation plus prepared statements, without writing. The original standalone `persistOnboardingPlan` executes that same batch with unchanged conflict/rollback semantics. A9 composes these statements with `client_activations`, Draft → Onboarding, and CLIENT_ACTIVATED / ONBOARDING_STARTED in one D1 transaction. Mutable contact, service-set, active workspace, and actor membership prerequisites are checked again under the write lock. A stale edit aborts the whole batch through the existing lifecycle CHECK constraint and returns a calm conflict. Late failures cannot leave partial onboarding, lifecycle or core activity.

The open-onboarding unique index and unique initial client activation are the concurrency authority. Competing requests converge to the committed instance or a safe conflict requiring reload. An activation record survives later onboarding completion or client status changes, so a retry cannot mistake a later lifecycle for permission to start another initial activation. Service status, health, ownership, assignments, and source-template bindings are untouched.

### Invitation delivery and recovery

The activation row captures the primary contact, recipient address and display name. The existing invitation module creates/rotates its Client-role invitation, preserves the seven-day TTL and token hashing, and stores an explicit contact association. Initial invitation creation, association and INVITATION_SENT activity are atomic. Activation cannot repurpose an unrelated pending invitation, and generic invitation creation/resend cannot retarget or bypass an activation's delivery claim. Generic revoke also refuses contact-associated invitations with `activation_managed`, using the same ownership check as resend and the existing HTTP 409 mapping. It does not change activation delivery state; intentional portal-access revocation/reinvite remains a future lifecycle workflow.

A conditional database update claims delivery for five minutes. A send is bounded to thirty seconds; crashes leave a lease that another request can recover after expiry. Token creation/rotation checks the same claim at the database mutation, so an old sender cannot supersede a newer retry's token. Delivery finalization and its client-level event are fenced by the attempt id and commit together. No raw token is persisted, returned by the activation routes, or logged; it exists only for the immediate mail send through the existing mailer.

Core success plus mail failure is HTTP 200 with `activated: true` and a delivery warning. The separate retry route requires an already committed activation and never reruns core generation. Failed sends retain a pending invitation; retry rotates its hash and sends a new token. A confirmed successful send becomes a no-op on subsequent activation requests. An invitation accepted after an uncertain prior send proves receipt without sending again. A database failure around delivery also preserves the committed core; a stranded lease is recoverable after expiry.

External delivery is not exactly-once: if a provider accepts a message but the acknowledgement or final database write is lost, a retry may send a replacement. Only the latest pending token remains valid, and core facts and confirmed client invitation activity remain singular. No queue or provider SDK was added. Generic INVITATION_SENT / INVITATION_RESENT retain their existing meaning of token preparation; CLIENT_INVITED means the first confirmed activation invitation delivery. ONBOARDING_STARTED means generated onboarding was established, not that runtime item completion has begun.

### Portal linkage and migration

Additive migration `0006_a9_client_activation.sql` (generated Drizzle snapshot/journal, plus immutability triggers) adds `client_activations` and `client_invitation_contacts`, five unique indexes, and four triggers. No existing table is rebuilt and no prior migration is changed. Composite keys enforce the same workspace/client for activation, onboarding, contact and invitation relationships. The initial activation identity/snapshot and invitation-contact association are immutable; delivery fields remain mutable. The zero verifier derives all new tables, indexes and triggers from the schema/migrations.

`client-invitation-acceptance.mjs` handles only explicit associated invitations. Matching signed-in email, current intended contact address, Client role, active workspace, compatible membership, and absence of another linked client are checked at acceptance. Membership creation/reactivation, invitation acceptance, contact link, and activity are one transaction; a token rotated/revoked or a contact changed between reads and writes aborts the batch. Retry by the same active linked identity is idempotent. A changed primary marker still links the originally invited contact, not the new primary. Existing unlinked Client memberships can accept; internal memberships and conflicting client scope cannot be silently converted. A6's contact payload still exposes only `linked`, never user ids. Contacts referenced by activation/invitations cannot be removed through the address book; the FK refusal is translated to a calm response.

### Internal UX and boundary

The client detail offers the small `ClientActivation` form only when `client.activate` is allowed. Draft activation explains the effects, validation errors name the missing setup, confirmed activation refreshes the lifecycle, and pending/failed delivery remains visible after reload with a retry action when available. Activity renders the new facts in words. The Onboarding tab reports only whether generation occurred. Existing Bloom primitives and tokens are used; the live Bloomlab reference could not be opened in this environment, so no live visual-reference inspection is claimed.

A10's onboarding portal, item completion/verification and upload UX are not implemented. No Projects, Actions, Milestones, Deliverables, Social/Ads/Systems execution, Pages, Finance, payments, notifications beyond this invitation, or sample production/staging clients were added. Explicit contact retargeting/unlinking is deferred; changing the captured recipient address fails safely rather than guessing who should gain access.

### A9 verification

All verification used local development D1/R2 or disposable workerd storage. Cloudflare credentials were removed from local Worker commands; no real invitation email was sent. No staging data, production, DNS, custom domains, or Leadsthatbloom resources were modified.

| Check | Result |
|---|---|
| `npm ci` | Exit 0; lockfile/dependencies unchanged |
| Focused A9 (`tests/bloomops-activation.test.mjs`) | 42/42 pass |
| Focused A8 regression | 72/72 pass |
| Affected invitation/auth/authorization/client/service/assignment regression | 158/158 pass |
| `npm test` (Node 22.22.1, matching CI major) | 2960/2960 pass, zero skipped |
| `npm run build` | Exit 0, including Next lint/type checks |
| `npm run cf:build` | Exit 0, Worker built |
| `node .github/scripts/verify-zero-remote.mjs --local` | Exit 0; 19 checks, all 60 inherited and seven domain migrations; 25 domain tables, 55 migration-defined indexes, nine triggers; second pass applies nothing and preserves schema and both ledgers exactly |
| `node scripts/activation-smoke-local.mjs` | 14/14 pass on actual disposable workerd D1: activation, repeat, merged Meta links, acceptance/link/repeat, late core rollback |
| `node scripts/onboarding-smoke-local.mjs` | 12/12 pass on actual disposable workerd D1 |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 pass against the built local Worker, including A9 activation/delivery/repeat/acceptance/link/portal scope and denied requests |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 pass against local Worker; development mailbox only |
| `node scripts/activation-review-local.mjs` | 37/37 browser checks at 1440, 1024, 768, 390 and 320px; 16 screenshots captured under `/tmp/bloomops-a9-review`, with phone draft/retry and desktop success inspected; keyboard activation, actionable validation, reload persistence and real recoverable invitation conflict/retry pass |
| `git diff --check` and new script syntax checks | Pass |

Browser review uses Playwright installed outside the repository and Chromium's local system prerequisites, with no application dependency added. `scripts/activation-review-local.mjs` requires the local smoke workspace and accepts `--playwright` for that external installation. The A9 test double serializes concurrent batches while retaining actual SQLite BEGIN/COMMIT/ROLLBACK; actual workerd smoke independently proves core transaction rollback. No remote A9 deployment was attempted; independent audit/merge and subsequent main verification remain outside this branch's local evidence.

## Onboarding Template Engine (A8)

A8 implements the template and relational generation engine. There is no new route, UI, activation, invitation, mail, identity linkage, project, action, deliverable, or client/service lifecycle write. A9 remains the orchestration boundary.

### Definition language and default configuration

`lib/bloomops/onboarding-definition.mjs` owns schema version 1: `{ schemaVersion, category, items }`. Categories are `common`, `social`, `ads`, `ghl`, `kajabi`; every template has `kind = onboarding`. Each item contains `logicalKey`, `title`, nullable/optional `instructions`, boolean `required` and `verificationRequired`, canonical `responsibleParty` and `visibility`, and integer `position`. Unknown fields (including progress/status/completion or membership identifiers), duplicate logical keys, invalid categories/enums, coercible non-booleans, and malformed values are rejected. Keys use lowercase letters/digits separated by underscores (64 characters maximum); titles are bounded at 200 characters, instructions at 10,000, and each definition at 100 items. Positions are signed 32-bit integers. Runtime assignment of a specific user is deferred; the blueprint can preserve `responsibleParty = user` without embedding mutable membership ids.

Canonical serialization recursively sorts object properties; validation trims text, normalizes missing/empty instructions to null, and orders items by position then logical key. SHA-256 is computed with Web Crypto over UTF-8 canonical JSON; no added package. Default JSON and precomputed SHA-256 constants live together in the sole defaults module, and tests independently recompute them with Node `createHash` over the stored bytes.

`lib/bloomops/onboarding-defaults.mjs` is the single source for the published V1 blueprints:

| Slug / name | Exact logical keys, in source order |
|---|---|
| `common` / Common | `agreement`, `brand_assets`, `kickoff_booking` |
| `social` / Social | `instagram_access`, `meta_business_access` |
| `ads` / Ads | `meta_business_access` |
| `ghl` / GHL | `ghl_access` |
| `kajabi` / Kajabi | `kajabi_access`, `course_videos` |

All defaults are client-visible and client-responsible. All are required except `course_videos`. Access requirements require verification; agreement, assets, kickoff booking, and course videos do not. Social and Ads intentionally share identical Meta instructions. Access wording requests approved business, delegated, or invited access and explicitly says not to send a password. The exact instructions and positions are stored in the canonical defaults module, not separately maintained as SQL or test fixtures.

The A7 `bootstrapPlan` now appends these defaults after the service catalogue. Existing workspaces receive them on the existing bootstrap path, and future workspaces use that same path. Conflict-targeted inserts preserve template metadata (including renamed/inactive templates), existing V1 bytes and state, and any newer published version. A missing V1 beside a newer publication is backfilled as retired with no invented publication timestamp. A second pass inserts nothing; no sample clients or runtime onboarding are seeded. No deployment was performed from the A8 branch; an existing remote workspace receives defaults when its normal bootstrap next runs after approval.

### Immutable versions and publication

`lib/bloomops/onboarding-templates.mjs` provides workspace-scoped template/version reads, current active published selection, validated creation, and publication. Domain primitives take a trusted server-side workspace context; they are not exposed through an HTTP route. A9 must authorize the actor and selected client/services before orchestration; department identity and membership grant nothing here.

Editing creates a new draft. `max(version_number) + 1` is computed inside the INSERT itself under SQLite/D1's write serialization, not selected before inserting. The existing template/version unique index remains the final authority; a matching constraint failure becomes `version_conflict`, while unrelated faults propagate. Concurrent real domain calls prove unique increasing numbers. Creator membership, when supplied, must be active in the same workspace.

Publication validates the stored canonical definition/hash, then atomically retires the old publication and publishes the target draft in one Drizzle D1 batch. Both updates are conditional on the target still being draft: a competing publisher cannot cause a stale request to retire a newer version. Publishing an already published target is a true no-op, and a retired target cannot be republished. There is no API to return published/retired versions to draft. Publication never writes definition fields. A forced second-update failure proves the first retirement rolls back.

### Provenance and migration

`drizzle/0005_a8_onboarding_templates.sql` and the matching Drizzle declaration/snapshot add:

- `onboarding_instance_templates(workspace_id, onboarding_instance_id, template_version_id, created_at)`, unique on instance/version, with same-workspace foreign keys to the instance and immutable version;
- `template_versions_published_uq`, a partial unique index on `template_id WHERE status = 'published'`;
- append-only update/delete guards for generated source provenance.

The junction is the canonical source history for composed onboarding. `onboarding_instances.template_version_id` is retained for compatibility and always left null by A8; `service_engagements.source_template_version_id` is untouched. Provenance is relational, not a JSON array or activity metadata. Foreign keys protect referenced versions, and audit guards prevent replacing/removing source relationships. They do not freeze runtime onboarding progress.

The zero-to-current verifier now derives trigger expectations from every journaled migration as it already did for indexes, so the new audit guards and partial index are verified alongside the 23 current domain tables. Historical schema tests now expect six domain migrations and retire a publication before publishing another, matching the new invariant.

### Selection, pure compilation, and merging

`prepareOnboardingPlan` validates the workspace client and the explicitly selected service engagements, then loads current published snapshots. Selection is bounded to 50 engagements to stay below D1's 100 bound-parameter limit. The stable mapping is:

| Service type slug | Template slug |
|---|---|
| `social-media-management` | `social` |
| `ads` | `ads` |
| `ghl` | `ghl` |
| `kajabi` | `kajabi` |
| `content-calendar` or another unmapped type | no service template |

Common is always included once. A required missing/inactive/unpublished template or a hash mismatch fails before runtime writes. Service eligibility/lifecycle policy belongs to A9; A8 checks that explicit selections belong to this client/workspace, without changing their states.

`lib/bloomops/onboarding-compiler.mjs` is pure and returns source version ids, selected service ids, and relational item values. Source precedence is Common, Social, Ads, GHL, Kajabi. Source items sort by position then logical key; services sort by id, and final positions normalize to increments of ten. Database return order does not affect output; caller arrays are not mutated.

Only `logicalKey` deduplicates. The first title by canonical precedence wins. Required flags merge with OR, as do verification flags. Responsible party and visibility must agree. Different meaningful instructions fail with `definition_conflict`; identical instructions survive, and one nonempty instruction wins over an empty one. Links are a sorted union of the engagements that caused each service-template requirement to exist. Common alone has no links. Social + Ads creates five requirements, one Meta item with both links, and an Instagram item linked only to Social. Kajabi course videos stays optional.

### Relational snapshots and atomic persistence

`persistOnboardingPlan` revalidates client/service/source ownership, recomputes source hashes, recompiles exact immutable versions, and compares the entire supplied plan. Caller-tampered fields, links, or provenance are rejected. An exact version selected before a newer publication may now be retired; persistence deliberately retains that captured version rather than silently refreshing the plan.

One Drizzle D1 batch inserts a pre-identified instance (`not_started`, legacy source null), every source junction row, relational items (`pending`), and every item-service link. Each insert stays below D1's parameter limit; the batch is never split. A late failure leaves none of the generated instance, source rows, items, or links. Tests use A7's transactional D1 double, and `scripts/onboarding-smoke-local.mjs` additionally proves actual workerd D1 rollback using a disposable local binding with `remoteBindings: false` and no persisted state.

An existing open instance returns `{ ok: false, reason: 'existing_open_instance', instanceId }` without changing anything. The partial unique open-client index handles concurrency; a losing batch rereads only this workspace/client's winning instance and returns the same safe result. A completed instance permits later generation, with old rows retained. No activation event is recorded.

Publishing Social V2 after generation leaves old item fields, links, and exact V1 provenance byte-for-byte unchanged. A second client uses V2. Separate tests prove runtime items can still evolve operationally while definitions and source provenance remain immutable.

### Verification (2026-09-07)

Baseline was verified on fetched `origin/main` at `999f2397b5695cb058bc87769e5142c6aa12c016` (PR #9 merge): 2826 tests passed, zero failures. The A8 branch was created from that exact commit, and no runtime change existed before the baseline run.

| Check | Result |
|---|---|
| `npm ci` | Exit 0 with the unchanged lockfile; no dependency added. npm reported 49 existing dependency vulnerabilities (1 low, 43 moderate, 5 high); dependency remediation is outside A8. |
| Focused `node --test tests/bloomops-onboarding-*.test.mjs tests/bloomops-schema.test.mjs` | 91 pass, 0 fail: 72 new A8 tests plus 19 existing schema tests. |
| `npm test` | 2898 pass, 0 fail, 0 skipped on finalized code. |
| `npm run build` | Exit 0; compile, lint/type validation, static generation, and traces passed. |
| `npm run cf:build` | Exit 0; OpenNext emitted `.open-next/worker.js`. |
| `node .github/scripts/verify-zero-remote.mjs --local` | Exit 0: an empty disposable local D1 reached all 60 inherited migrations and six domain migrations; all 23 domain tables, 50 indexes, and five immutable-data triggers present. Second pass applied nothing; schema and both ledgers identical. |
| Development local schema + inherited/domain migrations | Exit 0; built Worker health reports six domain migrations. |
| `node scripts/onboarding-smoke-local.mjs` | 12/12 checks on actual disposable workerd D1, including version creation/publication, Meta links, exact provenance, immutable generated fields, existing-open handling, and late-insert rollback. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 132/132 checks against the built local Worker, including internal/client shells, denied access, unchanged client lifecycle, services, assignments, suspension, and sign-out. |
| External `verify-staging.mjs --url http://127.0.0.1:8787 --expect-env development` | 21/21 checks; actual environment development, mail transport `r2-dev`, six domain migrations. |
| Diff/syntax checks | `git diff --check` and Node syntax checks passed; no app/UI/editor/config/package/AGENTS changes or tracked generated screenshots. |

The exact new tests are in `tests/bloomops-onboarding-compiler.test.mjs` (definition validation, canonical ordering, category selection, merge flags/conflicts/links, optional semantics, and pure tenant checks) and `tests/bloomops-onboarding-templates.test.mjs` (bootstrap/hash/idempotency, immutable creation, genuine competing publication/generation interleavings, database authority, stored snapshots/provenance, atomicity, safe open-instance handling, plan tampering, and same-workspace FK bypass attempts). Existing membership tests now accept either `NOT EXISTS` or conflict-targeted `DO NOTHING` guards; the separate data-level tests prove both forms insert nothing on a second pass.

Verification used installed Node 22.22.1, matching CI. Initial sandboxed runs hit subprocess/loopback restrictions (`EPERM`); they were rerun with the needed local permissions. The first app-smoke attempt used 127.0.0.1 while the configured magic-link origin was localhost; the successful run uses the explicit matching localhost URL and waits through normal auth rate limits. No production behavior was changed for these environment differences. No visual code changed, so the app/shell smoke replaced an unnecessary screenshot campaign.

No remote Wrangler operation, staging/production deploy/provisioning, real email, payment, DNS change, or Leadsthatbloom resource mutation occurred. Local test mail went only to simulated R2. GitHub publication consists solely of the A8 branch and its review PR; merging is reserved for the independent audit.

### A9 boundary and known limitations

No A9 activation/idempotency orchestration, client Draft → Onboarding write, service state write, invitation/email, `client_contacts.user_id`, onboarding completion/verification logic, portal, template settings/JSON editor, project/action/deliverable, or invented activation event exists. The Client Onboarding tab and both shells are unchanged. No inherited Pages/editor code was edited. No new dependency was added.

The one-published index intentionally fails migration if preexisting data violates publication uniqueness; A8 does not guess which source history to discard. Normal A7/bootstrap data contains no such competing publications. Template-management activity is deferred. Future A9 routes must enforce the existing authorization engine before calling these internal primitives. The standalone generation batch is not an A9 activation transaction; A9 must explicitly design the wider orchestration. The legacy nullable single-version source remains for compatibility only. There is no staging or production verification/deployment in this task: tests use isolated SQLite and local workerd/D1/R2 only.


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

Third run, the same run 33991512885 re-run as attempt 2 by the repository owner after the secrets were added (commit `8bbc227`, 2026-09-06 00:05:16Z to 00:07:24Z): same provisioning, schema, and migration steps (all no-ops against the ledger), Worker version `68cc78e9-0aae-47a5-bfae-a3c8217c304e` deployed with the same bindings and `BLOOMOPS_MAIL_TRANSPORT` resend. The secrets step uploaded `BLOOMOPS_AUTH_SECRET` and `BLOOMOPS_RESEND_API_KEY` to the Worker (`STAGING_BLOOMOPS_MAIL_FROM` is unset, so the sender stays the default `onboarding@resend.dev`). The bootstrap step applied its 8 idempotent statements to the remote staging D1 and reported Owner `a***@bloomwired.io` (owner, active), Admin `h***@bloomwired.io` (admin, active), workspace slug `bloomops-staging` from the default name "BloomOps Staging". The verifier then passed all 22 checks: build `8bbc227` served, anonymous `/api/infra` 401, `/` 307 to `/sign-in`, `/sign-in` rendering the form with 200, the inherited `ltb_session` cookie refused, `/gate` no longer a login page, `POST /api/auth` with a code refused, `GET /api/auth` not the old session endpoint, `/api/health` 200 with `environment: staging`, `schema: { migrations: 3, ok: true }`, `auth: { configured: true, mail: "resend" }`, mail transport Resend, anonymous get-session null, a magic-link request for a random unknown address accepted with 200, two random unknown addresses answered identically (200/200), no session cookie issued by that request, a malformed magic link answered 302 to `/sign-in?error=INVALID_TOKEN`, a magic link with a foreign callback origin refused with 403, anonymous `/api/bloomops/me` 401, anonymous invitation acceptance 401, and an unknown invitation link rendering the not-found state with 200. The unknown-address requests send no mail by design (no identity, no pending invitation), so the verifier made no Resend call. GitHub reported the run and the PR head's check suite as successful.

Attempts 3 and 4 of the same run, 2026-09-06 00:32Z and 00:40Z. Between attempts 2 and 3 the owner and admin secrets were changed and `STAGING_BLOOMOPS_MAIL_FROM` was set. Attempt 3 deployed Worker version `77655ba4-0f9f-48e5-82b4-01525fd1a1f9` and uploaded all three secrets including `BLOOMOPS_MAIL_FROM`, then failed at the bootstrap step: the address now named as Admin already held the Owner membership it was given in attempt 2, the attempt 2 Admin membership remained as a third member, and the bootstrap reported `owner / active  (expected admin / active)` and `1 other membership(s)`, exited 1, and rewrote nothing. That is the intended behaviour: the bootstrap adds what is missing and never changes an existing membership. The verifier was skipped because of that exit. Attempt 4 ran with the Admin secret pointing back at the attempt 2 address: the bootstrap reported Owner `a***@bloomwired.io` owner/active, Admin `h***@bloomwired.io` admin/active, and `1 other membership(s)` (the extra membership created as Owner by attempt 3, still active), and the verifier passed all 22 checks again. Staging therefore holds three active memberships until the extra one is removed by hand or through the members API. The workflow never rewrote or removed a membership.

Fresh remote database: the "Verify zero-to-current migration" workflow ran on this branch (run 33991041981, commit `438b062`) because its workflow file changed, and succeeded: a disposable remote D1 went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the three Drizzle migrations including `0002_a3_auth_membership.sql`, took a second pass as a no-op, and was deleted with the account inventory unchanged.

The repository secrets now exist: the auth secret, the Resend key, and the owner and admin addresses for the bootstrap. None were guessed and none appear in source. The bootstrap addresses are masked in the workflow log. `STAGING_BLOOMOPS_MAIL_FROM` was set before attempt 3, so the Worker now carries `BLOOMOPS_MAIL_FROM` (its value is masked in the log). For the magic-link mail to arrive, that sender has to be on a domain verified in Resend, or, with the default `onboarding@resend.dev` sender, the recipient has to be the mailbox that owns the API key. The live Worker is not reachable from this build environment (egress policy), so run evidence comes from the workflow logs. Manual acceptance completed on 2026-09-06: a real magic-link email was delivered to a bootstrapped staging Owner mailbox through Resend using the configured verified sender, the link was opened, and the user successfully signed in to BloomOps staging. This closes A3's remaining manual acceptance step.

### Intentionally deferred to A4 and later

- the authorization engine (roles beyond Owner/Admin member management, client, service, and project assignment scope, record visibility, capabilities such as `finance.view`), and all client-facing authorization rules
- linking a Client-role membership to `client_contacts.user_id` on acceptance
- a workspace switcher for a person with several memberships (today the earliest active membership is the one; `resolveWorkspaceAccess` already takes a `workspaceId`)
- member and invitation management screens (the routes exist; A5 owns the shell), profile editing, session listing and revocation from the UI
- database-backed rate limiting for Better Auth (memory storage is per isolate), email change, and any second sign-in method
- `account.issuer NOT NULL`, with the first OAuth or credential provider

## Authorization (A4)

One engine, `lib/bloomops/authorization.mjs`, answers every "may this person do this to that?" for BloomOps. Route handlers and pages name an action and, for one record, hand over a resource descriptor; they never compare roles or capabilities themselves. Policy is three small tables in that file (`ROLE_CAPABILITIES`, `SCOPE_BY_ROLE`, `RESTRICTED_BY_ROLE`) plus the `ACTIONS` table, so a policy change is one line and one test row.

| Item | Value |
|---|---|
| Engine | `lib/bloomops/authorization.mjs`: `loadActor`, `evaluate`, `hasCapability`, `canAccessClient`, `canAccessService`, `inScope`, `canSeeVisibility`, `listCapabilities`, `grantCapability`, `revokeCapability`, `loadClientResource`, `loadServiceResource`, plus the vocabulary (`ROLES`, `INTERNAL_ROLES`, `CAPABILITIES`, `VISIBILITIES`, `ACTIONS`) |
| Request helpers | `lib/bloomops/access.mjs`: `requireAuthorized(req, { action, resource })` (identity, membership, origin, then the engine; answers 401/403/404 itself), `getActor(access)` (loads the actor once per request), `notFound()`. `requireAccess` (membership only) and `requireIdentity` (identity only, invitation acceptance) remain |
| Order of checks | identity, ACTIVE membership in an ACTIVE workspace, cross-site Origin on writes, then in `evaluate`: membership status, action known, resource in this workspace, resource within scope, visibility admits the actor, role may perform the action, capability held. Anything unknown or missing refuses |
| Routes moved | `GET /api/bloomops/members` and `PATCH /api/bloomops/members/:id` (`members.manage`); `GET|POST /api/bloomops/invitations`, `POST .../:id/resend`, `POST .../:id/revoke` (`invitations.manage`). `GET /api/bloomops/me` now lists the caller's capabilities and whether the inherited app is open to them |
| Removed | `canManageMembers` and the `manageMembers` option of `requireAccess` (the A3-only permission) |
| Schema | none. The A2 tables (`workspace_memberships`, `member_capabilities`, `client_assignments`, `service_assignments`, `client_contacts.user_id`, `bloomops_clients`, `service_engagements`) express every invariant A4 needs. `department_memberships` is read by nothing in the engine, on purpose |
| Activity | `CAPABILITY_GRANTED` and `CAPABILITY_REVOKED` join the event vocabulary |

### Roles and capabilities

Capabilities are the five dotted keys the domain model reserves: `members.manage`, `workspace.settings`, `templates.manage`, `finance.view`, `finance.edit`. A role carries some without a `member_capabilities` row; the rest are explicit grants on the membership.

| Role | By role | Grantable | Client/service scope | Restricted records | Inherited prospecting app |
|---|---|---|---|---|---|
| Owner | all five | yes | whole workspace | yes | yes |
| Admin | `members.manage`, `workspace.settings`, `templates.manage` | yes (Finance is an explicit grant) | whole workspace | yes | yes |
| Project Manager | none | yes | whole workspace | only when named on the record | no |
| Team Member | none | yes | assignments only | only when named on the record | no |
| Client | none | no (rows are ignored) | own client through `client_contacts.user_id` | never | no |

Decisions where the planning docs were silent, all in `authorization.mjs` and one line each to change:

- Owner holds every capability by role. The Owner is the workspace principal, cannot be locked out (A3's last-Owner rule), and can grant themself anything through `members.manage`, so withholding a capability from the role would be theatre. `docs/PRODUCT_SPEC.md` gives the Owner "full operational access"
- Admin is not Finance by role because the same document says the Admin's Finance access "is separately configurable"; `finance.view` and `finance.edit` are explicit grants
- Project Manager has workspace-wide client and service scope because `docs/PRODUCT_SPEC.md` gives the role "broad delivery visibility and coordination, but not security administration or Finance by default"; it therefore holds no capability by role and may not manage members, settings, or templates without a grant
- restricted visibility admits Owner and Admin, and anyone the record names in `restrictedToMembershipIds` (internal roles only, and still only inside their scope). It is deliberately not "all internal users", and a Client never sees a restricted record even when named
- a Client membership holds no capability whatever rows say, and `grantCapability` refuses to write one for a Client. Capabilities open internal areas, and a Client never enters those

### Actions

`ACTIONS` in `authorization.mjs`. Workspace-level: `members.manage`, `invitations.manage`, `capabilities.manage` (all need `members.manage`), `workspace.settings`, `templates.manage`, `finance.view`, `finance.edit` (each needs the capability of the same name). Record-level (refuse to run without a resource): `client.view` and `service.view` for every role that can reach the record, `client.manage` and `service.manage` for Owner, Admin, and Project Manager. Transitional: `legacy.prospecting` for Owner and Admin. Later phases add actions here as they add features; nothing else in the engine changes.

### Scope

- Owner, Admin, Project Manager: every client and every engagement in their workspace
- Team Member: a `client_assignments` row reaches that client and everything under it, including all of its engagements; a `service_assignments` row reaches that one engagement and the records under it, not the client record and not sibling engagements. A person on James' Social engagement cannot see James' GHL work. Department membership grants nothing
- Client: the clients whose `client_contacts.user_id` equals the caller's user id in this workspace, and every engagement of those clients. Nothing else links a Client to a client: not an address match, not an accepted invitation naming a client, not request input. A Client membership with no such row fails closed, which is where the unlinked A3 acceptance flow leaves a new Client until a later phase links the contact on acceptance
- a record naming a service is service-scoped; one naming only a client is client-scoped; one naming neither is workspace-level, reachable by internal roles and never by a Client
- assignments, capability rows, and contact links are read for the acting membership in the acting workspace only. The same person's Owner membership in Agency B gives them nothing in Agency A, and the reverse

### Visibility

Resource descriptors carry `visibility`: `internal`, `client`, or `restricted`. A missing value is `internal`, so a record that never declared itself client-visible is never shown to a Client. Scope is checked before visibility, so a client-visible record of another client is still out of reach. A Client sees only `client`; internal roles see `internal` and `client` within scope; `restricted` follows the table above. An unknown value refuses. The two loaders for today's tables mark a client record and an engagement `client`, since a client's own record and their own purchased services are by nature visible to them; what they see of either is a projection for the portal to decide.

### Leak safety over HTTP

`requireAuthorized` answers 401 with no identity, 403 with an identity but no active membership, 403 for a cross-site write, 403 when the actor can see the record (or there is no record) but may not act, and 404 `{ "error": "Not found." }` whenever admitting a record exists would say something: another workspace, out of scope, hidden by visibility, or simply absent. The tests compare the bodies and headers of the hidden and the absent case byte for byte. The engine's reasons (`foreign_workspace`, `scope`, `visibility`, `role`, `capability`, ...) exist for tests and logs and never reach a response.

### Legacy compatibility fence

`lib/workspace.mjs#getWorkspace`, which all inherited prospecting routes call, now returns null unless the engine allows `legacy.prospecting` for the membership (Owner and Admin), so a Project Manager, Team Member, or Client calling `/api/pages`, `/api/prospects`, `/api/settings`, or any of the other inherited routes is answered as an anonymous caller is (401). `app/page.jsx` applies the same decision: administrators get the inherited application, everyone else a plain "Nothing here yet" holding screen with sign-out, until A5 gives their role a home. Not rendering the app is not the boundary; the routes refuse on their own. No inherited route was edited. `legacyRole` still maps Owner and Admin to the inherited two-value `admin`.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2698 tests, 2698 pass, 0 fail (2681 before A4; 17 A4 tests added in `tests/bloomops-authorization.test.mjs`, 1 A3 test migrated from `canManageMembers` to the engine) |
| `npm run build` | exit 0 |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 | `db:schema:local`, `db:migrate:local`, `db:domain:migrate:local` from a fresh local simulation; a second `db:domain:migrate:local` reports nothing to apply |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 46 of 46 through the real bundle on workerd, the 40 A3 checks plus: the Owner holds every capability and the inherited app; a Team Member holds none, is refused member listing and invitation with the generic 403 and no reason, is refused `/api/pages`, `/api/prospects`, and `/api/settings` with 401, and sees the holding screen at `/` while the Owner still gets the inherited app and routes |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 (a first run seconds after the smoke hit Better Auth's per-minute magic-link limiter with 429, the documented A3 behaviour; the rerun passed) |

The A4 tests build two agencies with every role represented, real `client_assignments`, `service_assignments`, `department_memberships`, `client_contacts`, and `member_capabilities` rows, and sign people in through Better Auth's real handler where the HTTP answer is under test. They cover, with denied cases throughout: anonymous, no workspace, suspended and removed (session surviving); same-workspace versus foreign records; the full role-by-action matrix; capability baselines, explicit grants, revocation, a rogue row on a Client, an unknown key, and cross-workspace rows; Team Member client scope, service scope (not the sibling engagement, not the client record), and department membership; the linked, unlinked, and elsewhere-linked Client; all three visibilities against scope, including being named on a restricted record; member management for all five roles; identical answers for hidden and absent records; the Origin fence; the legacy fence for every role; and the same person in two workspaces.

### Intentionally deferred to A5 and later

- no route grants or revokes capabilities yet (`grantCapability` and `revokeCapability` exist in the library with their invariants tested; A5's Team screen or a later phase exposes them). Until then a grant on staging is a direct `member_capabilities` insert
- no route creates `client_assignments` or `service_assignments` (A7) or links `client_contacts.user_id` on Client invitation acceptance (A9/A10)
- no shell, navigation, or portal for the fenced roles; the holding screen is the whole experience of a Project Manager, Team Member, or Client until A5
- `/api/infra` (environment name and binding booleans, no data) still answers any active member; it reveals nothing about clients and is left for the phase that retires the inherited probes

## Shell (A5)

BloomOps has its own application shells now. An internal person (Owner, Admin, Project Manager, Team Member) signs in to a BloomOps internal application with the eleven-destination navigation from `docs/PRODUCT_SPEC.md`; a Client signs in to a separate client portal with no internal chrome at all. The inherited Leadsthatbloom application is no longer the root of anything: it lives at `/legacy`, off the navigation, for workspace administrators only, until later phases retire it. No migration was needed.

### Route architecture

| Route | File | Who | What |
|---|---|---|---|
| `/` | `app/(internal)/page.jsx` | internal roles | Home |
| `/clients`, `/onboarding`, `/work`, `/social`, `/ads`, `/systems`, `/pages`, `/team`, `/finance`, `/settings` | `app/(internal)/<area>/page.jsx` | internal roles | one page per destination, inside `app/(internal)/layout.jsx` |
| `/portal` | `app/portal/page.jsx` inside `app/portal/layout.jsx` | Client | Portal Home |
| `/legacy` | `app/legacy/page.jsx` | Owner, Admin (engine action `legacy.prospecting`) | the inherited prospecting application, unchanged |
| `/design` | `app/design/page.jsx` | internal roles, development only (or `BLOOMOPS_DESIGN_GALLERY=1`) | developer design gallery, `?section=<id>` isolates one section |
| `/sign-in`, `/invite/<token>` | unchanged routes, restyled | anyone | signed-out screens |
| any other address | `app/not-found.jsx` | anyone | not found |

The `(internal)` route group shares one layout that renders the internal shell; the portal is a separate tree with its own layout. Neither layout is the security boundary. `lib/bloomops/shell.mjs#resolveShellAccess` resolves a request through the A4 primitives (`getAccessOrProblem`, `getActor`, `evaluate`) and answers with a decision: redirect, not found, or render with the loaded actor. `lib/bloomops/shell-server.mjs#requireShell(area)` turns that into `redirect()` / `notFound()` for server components, memoised with React `cache()` so the layout and the page share one resolution per request. Every page and both layouts call it (`tests/bloomops-shell.test.mjs` checks that each file does), so a client-side navigation that skips the layout is checked by the page on its own, and a suspended or removed membership loses the shell on its very next request while its identity session survives.

### Root routing by role

| Actor | `/` and every internal address | `/portal` | `/legacy` |
|---|---|---|---|
| anonymous (no cookie) | middleware: `/sign-in?next=…` | `/sign-in` | `/sign-in` |
| identity, no active membership | `/sign-in` (which explains "No workspace access") | `/sign-in` | `/sign-in` |
| suspended or removed | `/sign-in` | `/sign-in` | `/sign-in` |
| Owner, Admin | renders the internal shell | redirect to `/` | renders the inherited app |
| Project Manager, Team Member | renders the internal shell | redirect to `/` | not found |
| Client | redirect to `/portal` | renders the portal shell | redirect to `/portal` |
| unconfigured deployment | `/sign-in` (which explains "Sign-in is not set up") | same | same |

A Client never renders the internal shell, with nothing hidden by CSS or conditionals: the redirect happens before any chrome exists. An internal person never becomes a portal user by opening `/portal`. Both are proven through real Better Auth sessions in `tests/bloomops-shell.test.mjs` and in the browser by `scripts/shell-review-local.mjs`.

### Internal shell

`components/bloomops/InternalShell.jsx`, rendered by `app/(internal)/layout.jsx`: a labelled sidebar (232px) from 1024px, a labelled rail (84px, icon over label) from 768px to 1023px, and on phones a top bar plus a bottom tab bar with four destinations (Home, Clients, Onboarding, Team) and More, which opens the other seven as a labelled sheet. Nothing is dropped at any width; the More sheet reuses the same list. The workspace name, the person, and their role appear once each (sidebar head and foot; top bar on phones). The account menu (`AccountMenu.jsx`) holds the identity, a Settings link, and Sign out; it closes on Escape and outside click and returns focus. Dialogs and toasts are shell infrastructure (`ShellHosts.jsx`, reading the inherited `lib/dialog.mjs` and `lib/toast.mjs` stores, so a page calls `confirmDialog(...)` or `toast(...)` and never mounts its own host). A skip link reaches `main`. Bloomlab's 104px rail was not copied: eleven labelled destinations in a stacked rail were cramped, so the desktop uses a compact sidebar and the rail is the tablet geometry.

### Navigation

One list, `lib/bloomops/navigation.mjs#INTERNAL_NAV`, feeds the sidebar, the rail, the tab bar, the More sheet, the active state (`activeKey(pathname)`: exact root, own path and everything under it), and the area map on Home. Order and labels are PRODUCT_SPEC's: Home, Clients, Onboarding, Work, Social, Ads, Systems, Pages, Team, Finance, Settings, in four groups (Home; Clients, Onboarding, Work; Social, Ads, Systems; Pages, Team, Finance, Settings) separated by hairlines. Every entry carries a one-sentence purpose and an `availability` of `now` (Home, Clients, Onboarding, Team, Settings) or `later`. The list is the same for every internal role; what a person may do inside an area is the engine's decision on the server. `PORTAL_NAV` is Home alone. No prospecting destination exists in either.

### Portal shell

`components/bloomops/PortalShell.jsx`, rendered by `app/portal/layout.jsx`: a top bar naming the agency's workspace ("Client portal" beneath it) and a compact account menu with Sign out, a narrow calm page, a one-line footer. No `nav` element, no internal path, no internal vocabulary; `tests/bloomops-shell.test.mjs` asserts all three on the rendered markup. Portal Home (`PortalHome.jsx`) reads only what A4 scope allows through `lib/bloomops/overview.mjs#portalClients` (the clients whose `client_contacts.user_id` is the caller): a linked Client sees their client's name and "Your portal is ready", with the plain statement that nothing is available to view yet and that requests, updates, or work shared through BloomOps will appear there (no claim about what the agency needs from them, since no requests, approvals, or deliverables exist yet to read); an unlinked Client (the A3 acceptance state, unchanged) sees "Your portal is not connected yet" with plain words and a suggestion to reply to whoever invited them. Nothing works around the missing link. Content, Projects, and Files join the portal only when those features exist.

### Pages in Release A

- **Home**: the workspace name, who you are signed in as and your role, then "Right now" (Clients, Onboarding, Services, and, only with `members.manage`, Team, each with a real count read through the actor's own scope by `lib/bloomops/overview.mjs#workspaceOverview`) and "Areas of BloomOps" (every destination, its purpose, and "Available now" or "Not available yet"). Zero reads as "None yet" or, for a Team Member, "None assigned to you yet". No metrics, charts, activity, or sample data
- **Clients**: the destination and its honest initial state. A read-only list of name and relationship status for the clients the actor may see (`visibleClients`, scoped like everything else), or "No clients yet" / "No clients are assigned to you". No creation, detail, editing, or links into detail; A6 owns those
- **Onboarding**: the destination, its purpose, and either "Nothing is being onboarded" or the count of clients with open onboarding, again scoped. The engine and checklist are A8 and A10
- **Team**: `teamViewFor(actor)` picks one of two screens. With `members.manage`, `TeamManager.jsx` shows the directory (name, email, role, status with label and glyph, joined date, "(you)" on yourself, removed members folded away), open invitations (name, address, role, expiry), and drives the real A3 routes: invite (email, optional name, role among the four internal roles; Client invitations need a client record and are not offered yet), resend, withdraw, suspend, reinstate, remove. Remove and withdraw confirm first. Every backend answer is shown as written (the last-Owner, self, removed, already-member, and expired rules live on the server and are not duplicated); after a change the server re-renders the screen (`router.refresh()`). The token never reaches the browser. Without `members.manage`, the page shows the person's own place (name, email, role, what the role means) and says the directory is managed by the Owner and Admins; the directory is never loaded
- **Settings**: account (name, email, sign out), workspace (name, your role, what it means), and "Your access" (the capabilities the engine lists for you, by label). Nothing is editable. No inherited Leadsthatbloom settings appear
- **Work, Social, Ads, Systems, Pages**: deliberate placeholders through one `AreaPreview` composition: the title, the purpose, what will live there, and "This area is part of a later BloomOps release. Nothing here is live yet." No records, counts, or controls. Pages says the editor is ready and connecting it to the workspace with client-safe visibility is a later step
- **Finance**: `financeViewFor(actor)`. With `finance.view` (the Owner by role; anyone else by explicit grant), the same placeholder treatment. Without it, "Finance is open to the workspace Owner and to people who have been given finance access. It is not open to you." and nothing else

### Legacy transition

`app/page.jsx` is gone; `ProspectsApp.jsx` renders only from `app/legacy/page.jsx`, which calls `requireShell('legacy')`: a Client is sent to the portal, an internal role the engine does not admit to `legacy.prospecting` gets not found, Owner and Admin get the inherited application exactly as A4 left it. It is not in the navigation, not linked from any BloomOps screen, and its data routes keep the A4 fence in `lib/workspace.mjs`. No inherited route, component, or stylesheet was edited; `app/globals.css` still serves the inherited app and the Pages editor, and `app/bloomops.css` sits beside it under its own `--bo-*` / `.bo-*` namespace, so a BloomOps surface looks the same whatever `html[data-theme]` the inherited theme boot script set.

### Design system implementation

- **Tokens** (`app/bloomops.css`): the Bloomlab palette (Cloud, Snow, Mist, Soft Lilac, Ink, Deep Ink, Ink Soft, Ink Faint, the seven accents, Success, Warning, Error, Info, Link/focus), darker semantic text values that clear AA on Cloud, the 4px spacing scale, radius 6/10/16/24/full, three restrained shadows, the 120/200/300/420ms motion family with reduced-motion zeroing
- **Fonts**: Bricolage Grotesque (display, variable weight 200–800) and Inter (interface, variable 100–900), self-hosted under `public/fonts/` as latin and latin-ext woff2 from the fontsource packages, with their OFL licences beside them. Declared in `app/bloomops.css`, served through the existing `/fonts/*` immutable cache rule; no remote font dependency and nothing fetched at build time
- **Primitives** (`components/bloomops/`): `Button` (primary, secondary, ghost, danger; 44px; 1px press; spinner with `aria-busy`), `Field` with `fieldAria` (real label, hint, sentence-and-glyph error, 16px controls, custom select chevron), `Status` (label plus glyph, five tones), `PageHeader`, `Section`, `Surface` (snow, mist, tint), `Facts`, `EmptyState`, `Notice`, `AreaPreview`, `Dialog` (focus trap, Escape, outside click, scroll lock, focus return; a bottom sheet on phones), `Icons` (eleven navigation glyphs and a dozen controls, one stroke weight), `InternalNav`/`NavList`, `MobileNav`/`TabBar`/`MoreSheet`, `AccountMenu`, `ShellHosts`, `InternalShell`, `PortalShell`, `HomeOverview`, `PortalHome`, `TeamManager`. No universal Card; operational lists are hairline rows (`.bo-rows`), and surfaces are used only where a group of facts needs an edge
- **Typography**: display at 32px (27px on phones) and 40px for the portal title, tracking −0.02em; section headings 20px; body 15px Inter; small 13.5px; tabular numerals on counts; no monospace, no eyebrow labels, no gradient text
- **Gallery**: `/design`, developer-only, showing palette, typography, surfaces, buttons, forms, status, navigation, and states for the primitives above, with `?section=<id>` isolation
- **Visual reference**: the live Bloomlab gallery at `bloomlab-preview.cool-sunset-2169.workers.dev/design` could not be opened from this session (the sandbox's egress proxy refused the connection), so the design was built from `docs/DESIGN_SYSTEM.md` and the local reference snapshots under `docs/reference-code/bloomlab/` (tokens, Button, Field, Surface, StatusPill, gallery). No Bloomlab runtime code was imported

### Accessibility

Landmarks (`aside` workspace, `nav` Main, `main`, `header`, `footer`), a skip link, `aria-current="page"` on the active destination, `aria-expanded`/`aria-haspopup` on More and the account button, `role="menu"` with `menuitem`s, dialogs with `aria-modal`, `aria-labelledby`, a focus trap, Escape, and focus return, labels programmatically tied to every control with `aria-describedby` for hints and errors and `aria-invalid` on failure, status never colour alone, 44px targets for navigation, buttons, menu items, dialog controls, and the toast dismiss on phones and coarse pointers (36px small buttons on desktop pointers), 16px minimum control text, no hover-only information, reduced motion respected throughout. Keyboard order (skip link, then Home) and dialog focus behaviour are checked in the browser by `scripts/shell-review-local.mjs`.

### Responsive strategy

Widths: sidebar from 1024px; rail 768–1023px; top bar plus tab bar below 768px, with page padding reserved for the bar. Rows with actions (`.bo-row-wrap`) put their actions under the text on phones; rows with only a chevron or a pill never wrap. The page header stacks its action under the title on phones. Dialogs become bottom sheets under 480px with stacked full-width actions. The account menu opens upward from the sidebar foot and downward from the top bar. The portal is a narrow single column at every width.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2715 tests, 2715 pass, 0 fail (2698 before A5; 17 A5 tests in `tests/bloomops-shell.test.mjs`) |
| `npm run build` | exit 0, no warnings |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 | fresh simulation: `db:schema:local`, `db:migrate:local`, `db:domain:migrate:local` (3 applied); a second `db:domain:migrate:local` reports nothing to apply |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: all checks pass through the real bundle on workerd, the 46 A4 checks (updated where the home page changed) plus the A5 ones: the Owner's `/` is the internal shell with the full navigation and no prospecting markup, `/team` is the directory with the invite action, `/legacy` still opens for the Owner without BloomOps chrome, the Owner opening `/portal` is sent to `/`; the Team Member's `/` is the internal shell, `/team` is the limited view without the directory or other people's addresses, `/finance` says it is not open to them and describes nothing, `/legacy` is 404 |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 |
| Browser review | `node scripts/shell-review-local.mjs --url http://localhost:8787 --out …`: every review state at 1440, 1024, 768, 390, and 320 (sign-in; Home, Clients, Onboarding, Team, Settings, Work, Finance, and the gallery as Owner; Home, Team, Clients as Team Member; Finance as Project Manager; the portal as a linked and an unlinked Client; the account menu, invite dialog, invalid-invite state, remove confirmation, More sheet, and portal account menu open) in headless Chromium, checking no horizontal overflow, 16px controls and 44px targets on phones, the Client-to-portal and Owner-from-portal redirects and the Team Member's 404 at `/legacy` in the browser, keyboard order, and dialog focus behaviour: all structural checks pass. Screenshots were reviewed by eye against `docs/DESIGN_CHECKLIST.md` and the no-AI-slop list |

`tests/bloomops-shell.test.mjs` covers: the navigation list and its invariants (order, labels, one path each, no prospecting, four on the phone bar and seven behind More, active-key resolution); the pure shell decision (unknown area, unconfigured deployment, no session, no membership, unknown role, each role against each area); every role through real Better Auth sessions, with the refused decision carrying no access or actor; suspension and removal taking the shell away while the session survives; Team and Finance views by capability, including a Project Manager and an Admin gaining Finance by explicit grant only; Home, Clients, Onboarding, and portal reads scoped to the actor (workspace-wide, assigned-only, none, and never internal counts for a Client); the internal shell markup (navigation once per geometry, every destination reachable, no prospecting, skip link, landmarks, no emoji); one current destination and the More sheet's seven; the portal markup carrying no navigation, no internal path, and no internal vocabulary, and Portal Home's linked and unlinked states in plain words; Home's honest zero by scope and the area map's availability; Team rows offering only the actions the server would accept and never a token; the signed-out frame keeping the anchors the deploy verifier reads; the inherited application no longer being the root and every shell page re-checking on the server; and the middleware still bouncing anonymous callers from every new address.

### Intentionally deferred to A6 and later

- the Clients feature (list depth, create, detail, contacts, status and health editing, assignments, activity, archive): A6
- services and departments, assignments management: A7; the onboarding engine: A8; activation and client linkage on acceptance: A9 and A10
- Work, Social, Ads, Systems, Finance features, and Pages inside the BloomOps shell; the placeholders stand until each phase
- a capability grant/revoke screen (the library functions exist since A4; the Team screen does not expose them yet)
- an appearance preference: BloomOps is light by design (Bloomlab's Cloud ground; dark Ink surfaces are for focused execution contexts later), and the inherited dark/text-size toggles belong to the inherited palette, so Settings shows none
- portal destinations (Content, Projects, Files) until the features behind them exist
- Playwright as a dependency: `scripts/shell-review-local.mjs` runs on a locally installed `playwright-core` and Chromium and is a developer tool, not a test-suite step
- removal of the inherited prospecting code; it is unreachable from BloomOps navigation but still in source and still served at `/legacy` for administrators

## Clients (A6)

The first real BloomOps business domain. Clients stops being a destination with an honest empty state and becomes the thing the agency actually works in: a scoped list with lifecycle filters, a create flow, a detail screen with the five Release A tabs, multiple contacts with one primary, an internal owner, manually managed health, and a real operational history. One migration, one new authorization action, one new resource descriptor.

| Item | Value |
|---|---|
| Domain | `lib/bloomops/clients.mjs` (vocabulary, validation, slug, reads, create, update, owner candidates), `lib/bloomops/client-contacts.mjs` (contacts and the primary marker), `lib/bloomops/client-activity.mjs` (reading history and saying it in words) |
| Routes | `POST /api/bloomops/clients`, `PATCH /api/bloomops/clients/:id`, `POST /api/bloomops/clients/:id/contacts`, `PATCH|DELETE /api/bloomops/clients/:id/contacts/:contactId`, plus `app/api/bloomops/clients/_shared.mjs` |
| Screens | `app/(internal)/clients/page.jsx` (list and filters), `app/(internal)/clients/new/page.jsx` (create), `app/(internal)/clients/[id]/page.jsx` (detail and its five tabs) |
| Components | `components/bloomops/Clients.jsx` (presentational: `ClientStatus`, `ClientHealth`, `ClientRow`, `ClientFilters`, `ClientDetailHeader`, `ClientTabs`, `ContactRow`, `ActivityRow`), `ClientForm.jsx`, `ClientOverview.jsx`, `ClientContacts.jsx` |
| Authorization | one new action, `client.create` (Owner, Admin, Project Manager; no resource), and one new descriptor, `loadInternalClientResource` |
| Migration | `drizzle/0003_a6_primary_contact.sql`: one partial unique index |
| Activity | eight `CLIENT_*` event types |

### Architecture

Reads go straight from a server component to the domain layer; mutations go over HTTP to a route that authorises, picks the keys it names, calls one domain function, and maps the result. No business rule is written twice, no route handler compares a role, and no React component reaches the database.

A route handler is four steps and nothing else:

1. `requireAuthorized` (identity, membership, origin, engine) — or `requireClient` in `_shared.mjs`, which does the same and loads the client as an internal record
2. `pick(body, [...])`, so only the keys the route names reach the domain
3. one domain call
4. `domainProblem(result)` or a success body

`_shared.mjs` also owns the leak-safe mapping. A domain `not_found` answers with exactly the engine's own 404 body (`{"error":"Not found."}`, no `reason`), because a contact id that belongs to another client and a client the caller may not see have to be one answer or the difference between them is the leak.

### Authorization

`client.create` is the one delivery action with no resource: the record it decides about does not exist yet, so it asks only whether this role may bring a client into the workspace. Owner, Admin, and Project Manager, matching `client.manage`. `ACTIONS` and the A4 role matrix in `tests/bloomops-authorization.test.mjs` were updated together; nothing in the engine changed.

`loadInternalClientResource` returns the same descriptor as `loadClientResource` with `visibility: 'internal'`. That single word is what keeps a Client membership out of the A6 surfaces. The generic descriptor is client-visible on purpose, because a portal contact may legitimately be shown a projection of their own client; the internal Clients area is health, the owner, the contact directory, operational history, and the controls over all of it. Every A6 page and route loads its client through the internal descriptor, so a Client calling an internal endpoint directly is refused by the engine on visibility and answered 404 — not by a UI that happens not to link there. There is no second authorization model.

### Role behaviour

| Role | List | Create | Detail | Edit, contacts, owner, health | Activity |
|---|---|---|---|---|---|
| Owner | workspace-wide | yes | yes | yes | yes |
| Admin | workspace-wide | yes | yes | yes | yes |
| Project Manager | workspace-wide | yes | yes | yes | yes |
| Team Member | only clients they hold a `client_assignments` row for | no | assigned only, read-only | no controls rendered, and the routes refuse | read-only within the detail |
| Client | never | never | never | never | never |

A Team Member assigned only to a *service* engagement reaches that engagement, not the client record, exactly as A4 says: their Clients list stays empty and the client's detail is a leak-safe not-found. An Admin gains no Finance and a Project Manager gains no member administration from anything here.

### The list and its filters

`listClients(db, actor, { filter })` builds the WHERE clause from the actor's scope first and adds the lifecycle filter to it, so a filter can only ever narrow. An unknown value falls back to All (`normalizeFilter`), including prototype names. Counts are per lifecycle and are the actor's own, so a Team Member's "All 1" is the truth for them.

The filters are links, not buttons: the list is server-rendered, so `?status=active` is part of the address, works without JavaScript, is keyboard and screen-reader ordinary, and can be bookmarked. Changing one cannot widen authorization because the server rebuilds the scope from the actor on every request.

A row shows the client's name, the primary contact, the internal owner, the start date, and the two state markers. Not every fact is a pill: status and health are compact `Status` markers with a label and a glyph, and the rest is one quiet line of context.

### Create

`/clients/new`, a route rather than a dialog: seven fields want an address a person can return to, a real back step, and room on a phone without a sheet fighting the keyboard. Required: client or company name, primary contact name, primary contact email. Optional: website, time zone, start date, internal owner.

The existing `clients.name` is the canonical display name. The nullable `company` column is not surfaced: nobody is made to type the same business name twice. It stays available to the domain layer (`updateClient` accepts it) for a later phase that has a reason for it.

A new client is always `draft` and always `on_track`, whatever the request says. Creating a client invites nobody: no invitation row, no membership, no email, no Better Auth user, and no `client_contacts.user_id`, even when the address already belongs to somebody who can sign in. That is asserted in the unit tests, in the Worker smoke, and by the fact that neither create path imports the mailer or the invitation module.

The client, its primary contact, and the `CLIENT_CREATED` event are one `db.batch`, so a failure leaves nothing behind — no client without its contact, no client without its history. Ids are generated in application code in the same shape the schema default produces (32 lower-case hex characters), because the contact row has to name the client before the batch runs.

### Slug

Generated server-side from the name and never asked for. `slugify` normalises, strips accents, and collapses to `a-z0-9-`; an empty result becomes `client`. `slugCandidates` reads what is already taken and offers the plain slug, then numbered ones, then random-suffixed ones; `createClient` tries them in order and retries on the unique-index refusal rather than assuming a candidate is still free. A duplicate name inside one workspace is creatable and gets `name-2`; the same name in another workspace keeps the plain slug. Slug is never a tenant boundary: the canonical route stays `/clients/:id` on the opaque id, and authorization never reads the slug.

### Lifecycle, and the A9 boundary

**A6 displays lifecycle and never writes it.** `updateClient` refuses `relationshipStatus` outright with `status_not_editable` rather than ignoring it, so a caller reaching for it learns why. There is no Activate control anywhere, and no A6 code path creates an onboarding instance, a service engagement, or an invitation.

The reasoning, recorded because the canonical documents are silent on manual transitions:

- Draft to Onboarding (or Active) is the A9 activation transaction: validate, generate onboarding, create the instance, move the client, prepare portal access, invite, record activity. A plain field edit that set `relationship_status` would bypass all of it, and would be the easy thing to leave behind.
- Paused, Completed, and Ended describe an engagement that A7 has not built, and no canonical document gives transition rules for them. Inventing a state machine without support is the larger mistake.
- Least privilege and least irreversible: a phase that shows a fact and refuses to write it is trivially extended; one that wrote it wrongly is not.

`CLIENT_STATUS_CHANGED` is deliberately not in the activity vocabulary. The phase that moves the lifecycle adds the event that records it. Status and health independence is proven at the domain and route layers instead: a health change leaves `relationship_status` untouched, in both directions, and every lifecycle value is refused through the API.

### Health

Manually managed in Release A, as `docs/phases/A6.md` allows. Three values with their canonical labels (On Track, Needs Attention, At Risk), a three-button group on the Overview tab, one `CLIENT_HEALTH_CHANGED` event carrying the old and new value, and no effect on lifecycle. Setting the health a client already has is a no-op and records nothing.

### Contacts and the primary invariant

The existing schema had no database guarantee that at most one contact per client is primary; the UI, a sequence of updates, and hope were all that stood behind it. Migration `0003_a6_primary_contact.sql` adds the smallest thing that fixes it:

```sql
CREATE UNIQUE INDEX `client_contacts_primary_uq` ON `client_contacts` (`client_id`) WHERE is_primary = 1;
```

One statement, additive, matching `lib/bloomops/schema.mjs`. It is partial, so a client with no primary is allowed and contacts that do not claim it are not counted. The application writes the switch as one `db.batch` that clears the old primary and sets the new one together, so the index never sees two and a failure leaves the client with the primary it started with. `tests/bloomops-clients.test.mjs` proves the database refuses two primaries with the domain layer bypassed entirely, through a raw `INSERT` and a raw `UPDATE`.

A client may have any number of contacts. Add, edit, remove, make primary, and clear primary are all supported. Removing or standing down the only primary leaves the client with none and promotes nobody: who speaks for a client is a decision, not a default. `client_contacts` keeps its existing unique `(client_id, email) WHERE email IS NOT NULL`, so one address per client is refused with a readable message and the same address on another client is fine.

### The portal identity link

`client_contacts.user_id` is the durable relationship between a contact and a person who can sign in to the portal, and A9/A10 own its whole lifecycle. A6 never writes it, never accepts it from a request at any spelling, and never infers it from a matching address, an existing identity, or invitation history. `pick()` in the routes names the four contact fields and `isPrimary`, and nothing else reaches the domain.

Where a contact is already linked, A6 chooses fail-safe:

- **removal is refused** (409 `linked`). Deleting the row would revoke a real person's access to their own portal from a screen about the agency's address book.
- **clearing their email address is refused**, for the same reason: it would leave somebody who can sign in with no way for the agency to reach them.
- **ordinary editing is allowed** — name, title, phone, a different address, and the primary marker. None of it touches the link, and the tests check the link survives.

The screen does not offer a Remove control on a linked contact rather than offering one that will fail, and says plainly that the contact can sign in to the client portal. The user id itself never leaves the server: `listContacts` projects it to a boolean `linked`.

### Owner

`owner_membership_id` is operational responsibility and nothing else. The A4 engine does not read it, so naming somebody the owner of a client grants them no access they did not already have, and setting an owner writes no `client_assignments` row. A7 owns assignment management. Both facts have tests.

Because ownership grants nothing, offering any membership as owner would make it easy to hand a client to somebody who then cannot open it. The A6 candidate policy is therefore:

- anyone whose role already reaches every client in the workspace: Owner, Admin, Project Manager
- plus, for one named client, a Team Member who already reaches that client through a real `client_assignments` row

A service-only assignment does not qualify, because under A4 it does not reach the client record. Client memberships are never candidates. A membership from another workspace is refused with the same message as a wrong id ("Choose an owner from the list.") and says nothing about the other workspace. A7 may widen this once a manager can grant the access in the same place they name the owner.

An owner may stop qualifying as a *new* owner after they were assigned: suspended, removed, or a Team Member whose client assignment went away. They keep their place on the record. Nothing silently reassigns the client, the detail reports them with `active: false`, the Team tab explains it, and the edit form keeps them in its list so that saving an unrelated field cannot drop them.

The server has to agree with that, and `updateClient` makes keeping the stored owner a different question from naming a new one. A supplied `ownerMembershipId` equal to the id already stored is a no-op: not checked against the candidate policy, not written, and not recorded. Any different value, the empty one that clears the owner included, goes through the candidate policy exactly as before, so a suspended, removed, Client-role, foreign-workspace, or unscoped Team Member membership is still refused as a *new* owner. `createClient` is unchanged and always strict, because a client being created has no stored owner to keep. Without that distinction the edit form's own preservation behaviour would defeat itself: the form sends every field on save, so an unrelated website or start-date edit on a client with an ineligible owner would fail with "Choose an owner from the list." Three tests in `tests/bloomops-clients.test.mjs` cover the suspended owner, the Team Member who lost their assignment (including that ownership gave none of their scope back), and every ineligible membership still being refused as an actual change.

### The detail and its tabs

Canonical route `/clients/:id`; the five Release A tabs are `?tab=`, so each section is an address that can be shared and returned to and the browser's own back step works. The page asks the engine twice: `client.view` on the internal record to decide whether the client exists for this person at all, and `client.manage` to decide whether any control renders.

- **Overview** — the real work. Status, health, website, time zone, start date (end date when set), internal owner, and the contacts. Managers get Edit details (a dialog), the three-way health control, and full contact management. A Team Member assigned to the client gets the same facts as a read-only projection with no controls, and a line saying who changes a client.
- **Services** — A7's. A deliberate, true state: what will live there and that nothing has been set up for this client. No catalogue, no package fields, no fabricated rows.
- **Onboarding** — A8's, A9's, and A10's. Says onboarding has not started for this client and that it is generated at activation. No progress, checklist, or percentage.
- **Team** — only what A6 owns: who is responsible for this client inside the agency, the explicit statement that the owner is responsibility and not access, and the note that assigning people to a client and its services is a later release. No `client_assignments` CRUD, no department or service assignment, no workload, and no weakening of `members.manage`: the owner picker is its own narrow projection (`ownerCandidates`), built only for actors who may manage the client, and never the Team administration directory.
- **Activity** — real history.

### Activity

Eight event types joined `ACTIVITY`: `CLIENT_CREATED`, `CLIENT_DETAILS_UPDATED`, `CLIENT_OWNER_CHANGED`, `CLIENT_HEALTH_CHANGED`, `CLIENT_CONTACT_ADDED`, `CLIENT_CONTACT_UPDATED`, `CLIENT_CONTACT_REMOVED`, `CLIENT_PRIMARY_CONTACT_CHANGED`.

Every event carries the workspace, the client id, the subject type and id, the acting membership and user, a timestamp, and small metadata: the fields that changed and their old and new values, a contact's name, an owner's name on both sides so the line still reads after somebody leaves. Never a request body, never a copy of every address a contact has held.

No event is written for a validation failure, an authorization failure, a refused origin, or a true no-op, and one request never records the same fact twice. One request can record two or three genuinely distinct facts — details, health, and owner are three different things — and each gets its own line.

`activity_events` remains append-only: the A2 triggers abort every UPDATE and DELETE, and the tests prove it still holds with A6 rows in the table. A6 created no `client_history`, `audit_log`, or `client_events_v2`; every event goes through `recordActivity`/`activityValues`, and `activityValues` exists so an event can be written inside the same batch as the change it describes.

`clientActivity` reads the table back and `describeEvent` turns a row into a sentence: "Client created", "Health changed / From On Track to Needs Attention.", "Primary contact changed / Sam is now the primary contact." Event codes, ids, and metadata JSON never reach the browser, an unknown event type still renders as words, and ordering falls back to insert order within one timestamp so two events from one batch read in the order they happened. Activity is internal; nothing exposes it to the portal.

### Validation

Server-side regardless of the browser, in the domain layer, per field:

- **name** — trimmed, non-empty, at most 120 characters (an over-long value is an error the person can fix, never a silent truncation)
- **website** — completed to `https://` when a scheme is missing, then parsed: http(s) only, a hostname with a dot, stored absolute and trailing-slash-free. `mailto:` and `javascript:` are refused, so nothing unparsed is rendered into an href
- **time zone** — null, or a real IANA zone with a region, checked against `Intl`. The picker offers `Intl.supportedValuesOf('timeZone')` where the runtime has it and a small useful list where it does not, and a typed value is validated either way
- **dates** — `YYYY-MM-DD` calendar dates that actually exist (2026-02-30 is refused), and an end date may not precede the start date
- **health** — one of the three values
- **owner** — a candidate under the policy above
- **contacts** — non-empty name, normalised lower-case email of valid shape, bounded phone and title, one address per client, and the contact must belong to the named client

Nothing is trusted from the browser: not the workspace id, not the actor, not a client id in a body when the route already names one, not a role, and not `user_id`.

### Leak safety

Four cases and one answer. Another workspace's client, a client a Team Member is not assigned to, a contact belonging to a different client, and an id that never existed all produce `404 {"error":"Not found."}`, byte for byte, on both the API and the page. A Client membership calling an internal client route is refused on visibility and gets the same 404, including for their own client. An owner membership id from another workspace is refused with the same words as a wrong id. The tests compare the bodies directly rather than the status alone.

### Design

Built inside the A5 shell with the A5 primitives; nothing about the shell changed. New semantic components sit above them, and the styling is one `bo-client-*` section in `app/bloomops.css`.

Clients are ordinary operational records, so there is no holographic treatment, no gradient, no hero, no card grid, and no fake analytics. The list is hairline rows at medium-to-high density; the detail is semantic sections of label/value facts. Status and health are separate compact markers, each a label plus a glyph, never colour alone.

Two responsive decisions worth recording. Seven lifecycle filters do not fit as pills at 320px, so the filter strip scrolls inside itself with one clear selected state, keyboard-ordinary links, and 44px targets on coarse pointers; the page never scrolls sideways. Five tabs do not shrink into nine-point type, so the tab strip scrolls the same way with a visible focus ring and an obvious active tab. On a phone a client row puts its two state markers under the name and keeps the chevron pinned to the right edge rather than giving it a line of its own.

Two bugs the review found and A6 fixed:

- **date fields were 15px on phones.** The inherited `app/globals.css` carries `input[type="date"] { font: inherit }`, which is more specific than `.bo-control` and dragged the field to the body size. Below 16px a phone browser zooms the page on focus, which `docs/DESIGN_CHECKLIST.md` rules out. `app/bloomops.css` now takes the size back with `.bo-control[type='date']` (and `datetime-local`, `time`). The inherited stylesheet is untouched; a test asserts both halves so it cannot silently regress.
- **a row's title and meta line ran together.** `.bo-row-title` and `.bo-row-meta` are now block by default, which is what a title and the line under it always want; the two inline `display: block` styles A5 had added in `TeamManager.jsx` are gone as redundant.

### Design gallery

`/design` gained a small Clients section (developer-only, as before): both state markers in every value, the filter strip, three client rows, the tab strip, two contact rows, and an activity list. Its fixtures live in that file and nowhere else — no BloomOps screen ever renders a sample client, and staging was not seeded with any.

### Archive and restore

Not implemented in A6. The canonical client schema has no archive state, and A6 does not invent one: no `archived_at`, no `deleted_at`, no archive machinery. `Ended` is a lifecycle status, not an archive flag, and A6 does not write the lifecycle at all. `docs/phases/A6.md` lists archive/restore conditionally ("if implemented"), and nothing in the repository reveals an intended mechanism to implement.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2765 tests, 2765 pass, 0 fail (2715 before A6; 50 A6 tests in `tests/bloomops-clients.test.mjs`, including three for the owner-preservation correction below) |
| `npm run build` | exit 0, no warnings |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 from zero | `.wrangler/state` deleted, then `db:schema:local`, `db:migrate:local` (44 executed, 16 recorded as already present), `db:domain:migrate:local` (4 applied). Second pass: "No migrations to apply", inherited ledger unchanged, base schema re-applied with no failed statement. `client_contacts_primary_uq` present on the fresh database |
| Zero-to-current | `node .github/scripts/verify-zero-remote.mjs --local`: every check passed with the four domain migrations, including the identical-after-second-run comparison |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 89 of 89 through the real bundle on workerd |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 17 of 17 |
| Browser review | `node scripts/shell-review-local.mjs`: every A5 and A6 state at 1440, 1024, 768, 390, and 320 in headless Chromium |

The 47 A6 tests run the real route handlers over a real SQLite built from the committed migrations, with real Better Auth sessions, and render the real components. They cover: the `client.create` policy and the internal descriptor; creation by each role with the denied cases, the forced Draft and On Track, the primary contact, the absence of any invitation, membership, identity, email, or portal link, the `CLIENT_CREATED` event and its metadata, duplicate names and cross-workspace slugs, and field-by-field refusals that write nothing; every lifecycle filter, the scope of every role including the service-only Team Member, and that no filter widens anything; the four leak-safe not-found cases compared byte for byte; editing, its refusals, and the silent no-op; health through all three values in both directions with the lifecycle untouched; the lifecycle refused through the API for every value, including smuggled beside a legitimate field, with no onboarding, engagement, or invitation created; the owner set, changed, and cleared, granting no scope and writing no assignment, and preserved when its holder is suspended; contacts added, edited, removed, and switched, at most one primary with the database refusing two under a bypass, one address per client and the same address elsewhere, a foreign contact unreachable, `user_id` unwritable and uninferable, and a linked contact protected from removal and address clearing while ordinary edits pass through; activity in words with the right actor, workspace, and client, immutable, never duplicated, and never leaking across workspaces; the origin fence on all five state-changing calls; two workspaces with no authority bleed; and the rendered markup of every semantic component.

The Worker smoke adds, over HTTP through the real bundle: the Owner's Clients area and create form, a client created as Draft and On Track with its primary contact and no invitation, the list and a filter that hides it, the detail with its five tabs and no Activate control, a health change that leaves the lifecycle alone, the lifecycle refused, a second contact promoted to primary with exactly one primary in the database, a duplicate address refused, the Activity tab in words with no event codes, a cross-site write refused, an unassigned Team Member's empty list and 404 detail and 403 create and 404 create form, and a linked Client redirected away from the internal Clients area and answered 404 by the internal API for their own client while their portal still opens.

The browser review adds the A6 states at all five widths: the list empty and populated, a non-All filter, the create form and its validation state, the Overview, Services, Onboarding, Team, and Activity tabs, the edit dialog, the add-contact dialog, the removal confirmation, a client with a very long name and a very long contact address, and a Team Member's read-only detail. It also checks in the browser that a Client deep-linking their own client's internal detail lands on the portal with no internal facts on the page, that an assigned Team Member's detail renders no Edit, Add contact, Make primary, or Remove control, and that an unassigned client is a 404 for them.

### Intentionally deferred to A7 and later

- purchased services, the service-type catalogue, and service lifecycle: A7. The Services tab says so and shows nothing invented
- departments, `client_assignments` and `service_assignments` management, and any scoped team-assignment UI: A7. The Team tab shows only the owner
- onboarding template generation: A8. The Onboarding tab says onboarding has not started
- activation, the lifecycle transitions it owns, `CLIENT_STATUS_CHANGED`, client invitation, and `client_contacts.user_id` linkage: A9 and A10
- the full client onboarding portal: A10
- archive and restore: not implemented, and no column was added for it
- the `clients.company` column stays unsurfaced; `clients.name` is the canonical A6 display name
- projects, work, social, ads, systems, and finance records: Release B and later

## Services and Departments (A7)

One client can now hold several purchased services at once, each with its own lifecycle, and internal people can be assigned to a client as a whole or to one of its services. The Services and Team tabs of the client detail stop being placeholders. One migration (a partial unique index), three new authorization actions, one new resource descriptor, nine new activity events.

| Item | Value |
|---|---|
| Domain | `lib/bloomops/service-catalog.mjs` (the default departments and service types, both seeding paths, catalogue reads), `lib/bloomops/services.mjs` (engagement vocabulary, validation, reads, create, update, the duplicate invariant), `lib/bloomops/assignments.mjs` (candidates, reads, add/update/remove for both kinds of assignment) |
| Routes | `POST /api/bloomops/clients/:id/services`, `PATCH /api/bloomops/clients/:id/services/:serviceId`, `POST /api/bloomops/clients/:id/assignments`, `PATCH\|DELETE /api/bloomops/clients/:id/assignments/:assignmentId`, `POST /api/bloomops/clients/:id/services/:serviceId/assignments`, `PATCH\|DELETE /api/bloomops/clients/:id/services/:serviceId/assignments/:assignmentId` |
| Screens | the real Services and Team tabs in `app/(internal)/clients/[id]/page.jsx` |
| Components | `components/bloomops/Services.jsx` (presentational: `ServiceStatus`, `ServiceRow`, `AssignmentRow`, `ServiceTeamHeading`), `ClientServices.jsx`, `ClientTeam.jsx` |
| Authorization | three new actions, `service.create`, `client.assign`, `service.assign` (Owner, Admin, Project Manager; each about a record), and one new descriptor, `loadInternalServiceResource` |
| Migration | `drizzle/0004_a7_open_service_uq.sql`: one partial unique index |
| Activity | nine new event types: three `SERVICE_*` and six `*_ASSIGNMENT_*` |

### The default catalogue, and where it is defined

The four departments and the five initial service types are declared once, in `lib/bloomops/service-catalog.mjs`, and nowhere else.

Departments, in position order:

| Slug | Name | Position |
|---|---|---|
| `social` | Social | 10 |
| `ads` | Ads | 20 |
| `systems` | Systems | 30 |
| `operations` | Operations | 40 |

Service types, each on one of those departments:

| Slug | Name | Department |
|---|---|---|
| `social-media-management` | Social Media Management | Social |
| `ads` | Ads | Ads |
| `ghl` | GHL | Systems |
| `kajabi` | Kajabi | Systems |
| `content-calendar` | Content Calendar | Social |

Operations deliberately has no default service type: it is where internal work lives, not something the agency sells. `docs/PRODUCT_SPEC.md` also lists funnels, email sequences, automation, course builds, and integrations as examples; those are deliverables inside a Systems engagement rather than separate purchases, so seeding them would only lengthen the picker. They were left out on purpose.

### Seeding strategy, and why it is not a data migration

Two paths put the catalogue into a workspace, and both read the same constants:

- `ensureWorkspaceServiceCatalog(db, workspaceId)` — Drizzle, for a workspace that already has an id. Two passes, because a service type needs its department's id.
- `catalogStatements({ workspaceSlug })` — literal `INSERT ... SELECT ... WHERE NOT EXISTS` statements, appended to the plan in `lib/bloomops/bootstrap.mjs`, because that plan is handed to `wrangler d1 execute --file` against a remote database where none of our JavaScript runs.

Both are idempotent by slug and neither ever rewrites a row it did not create: a workspace that renamed Ads or deactivated Kajabi keeps its decision. A test asserts the two paths produce identical rows, so they cannot drift.

An existing workspace picks the catalogue up without a data migration because `.github/workflows/deploy-staging.yml` runs `scripts/bootstrap-workspace.mjs` on every push to main, and a second pass inserts nothing. That is why the catalogue is not in a schema migration: it is workspace-scoped configuration, one workspace's rows are not another's, and the bootstrap already owns "make this workspace's starting state true, again and again".

Nothing seeds a client, a contact, or an engagement anywhere. The catalogue is configuration; there is no sample data in any environment.

### Service engagements

A service engagement is one purchased service for one client. James with Social, Ads, and GHL is one client record with three engagement rows, and nothing in `lib/bloomops/services.mjs` writes to `bloomops_clients` at all.

Creation takes a service type (required, from this workspace's own active catalogue), and optionally a package name, a start date, and scope notes. `approval_preference` and `source_template_version_id` exist from A2, belong to later phases, and are never read from a request or offered by a form.

**A new engagement is always Planned.** The route does not read `status` from the body. Onboarding and Active describe work that activation (A9) coordinates, and letting a create request name them would let a client skip it.

Creating an engagement changes no client field, generates no onboarding, instantiates no template, sets no `source_template_version_id`, invites nobody, sends no mail, and creates no project or action. The engagement row and its `SERVICE_ENGAGEMENT_CREATED` event are one batch, so a failure leaves neither.

### Lifecycle, and its independence from the client

A manager may move an engagement through all six canonical statuses: Planned, Onboarding, Active, Paused, Completed, Cancelled. The service type itself is never editable — an engagement is the purchase of one service, and buying a different one is a different engagement.

Service status and client relationship status are two separate canonical facts on two separate records. Pausing a service leaves an active client active; a service reaching Onboarding generates nothing. Tests walk every status in turn and assert the client's relationship status, health, and dates after each one.

### The duplicate invariant

A client may hold at most **one non-terminal engagement of the same service type at a time**. Non-terminal is Planned, Onboarding, Active, Paused; terminal is Completed and Cancelled. So a completed Social may be replaced with a new one, and a live Social may not be duplicated.

The invariant is the database's, not a check in code: `service_engagements_client_type_open_uq`, a partial unique index over `(client_id, service_type_id)` that applies only while the status is open. A read-then-insert would let two simultaneous requests both pass their check and both insert; the index is what makes the rule true. The domain still checks first, but only so the refusal has human wording, and it catches the constraint error as the same refusal when it loses a race.

The open and terminal lists are declared once in `lib/bloomops/schema.mjs` and the index's `WHERE` clause is built from them, so the schema declaration and the migration cannot disagree.

Reopening a terminal engagement into a conflict (one completed Social, one current planned Social, then trying to make the completed one Active) is refused with the same calm message, never a raw database error.

### Assignment, and exactly what each row grants

Nothing in A7 interprets assignment rows. The A4 engine already does, in `loadAssignedScope` and `canAccessService`, and A7 did not touch it: this phase writes the rows the engine reads, and scope widens or narrows on the next request because the actor is loaded fresh every time.

- **`client_assignments`** grants the client record and every service engagement under it, including engagements added later.
- **`service_assignments`** grants exactly one engagement: not the client record, not the client's other engagements, not another client's engagement of the same service type.
- **`department_memberships`** grants nothing. Belonging to Social organises a person; A4 ignores the table entirely and A7 keeps it that way.

The two narrowing cases are proved explicitly, through freshly loaded actors:

- Somebody holding both a client assignment and a service assignment on James → Social, whose **client** assignment is removed, loses the James record and implicit access to James' other services, and **keeps** James → Social through the explicit row. Nothing cascades; the service row is not deleted.
- The same person whose **service** assignment is removed instead **keeps** Social, because the client assignment still grants every service. Removing a narrower assignment never revokes broader access that still exists.

### Assignment candidates, and rows that outlive eligibility

A new assignment may name only an active internal membership of this workspace: Owner, Admin, Project Manager, Team Member. Never a Client membership, never a suspended or removed one, never a pending invitation, never a membership of another workspace, never a bare user id. Assignment records use membership ids; the workspace comes from the session and the client and service from the route, never from a body.

Somebody who was legitimately assigned and has since been suspended or removed **keeps their row**. The engine refuses them anyway, the Team tab says "No longer active in this workspace" in words, and a manager decides whether to take the row away. Nothing deletes an assignment because a membership changed.

Assignment roles are `lead` and `member`, and no third was invented. The canonical documents do not ask for exactly one lead, so nothing enforces one: a client or a service may have several leads, or none.

Re-assigning the same person is never a second row: the same role is a no-op that records nothing, a different role is a role change that records one update event.

Those semantics hold under concurrent requests, not only sequential ones, and two things in `addAssignment` make that true.

**Atomicity.** The assignment row and its `*_ASSIGNMENT_ADDED` event are one `db.batch`, with the id generated in the domain so the event can name the row before either exists. D1 applies a batch as one transaction, so there is no state in which an assignment exists without the significant activity event that records it.

**Concurrency.** The read before the write is a fast path and never the authority; the unique indexes on `(client_id, membership_id)` and `(service_engagement_id, membership_id)` are. Two requests can both read nothing before either writes, and one then loses the index. That loser does not fail: it re-reads the winning row by workspace, parent, and membership and resolves through exactly the semantics above, so the caller gets the answer it would have got had the two requests arrived in order. Detection is scoped to a UNIQUE violation naming that kind's own table and both of its index columns, read down the error's cause chain; a foreign key failure, a CHECK failure, or a unique violation anywhere else is re-thrown rather than mistaken for a re-assignment. Two attempts, then a calm `conflict` refusal, so a row that keeps vanishing cannot spin.

### Owner versus assignment

A6 established that `clients.owner_membership_id` is operational responsibility and not an authorization grant, and A7 preserves it in both directions: assigning somebody writes no owner, naming an owner writes no assignment row, and removing an assignment leaves the owner exactly as recorded. A Team Member who owns a client and loses their assignment keeps the ownership record and loses the scope. Ownership alone still grants nothing.

`ownerCandidates` in `lib/bloomops/clients.mjs` was not widened. A7 could now grant client access in the same place an owner is named, but the A6 rule (a Team Member qualifies as owner only through a real client assignment) is still the correct one and needed no change.

### Authorization

Three new actions, each about a record that already exists, so each proves reach as well as role:

| Action | Resource | Owner | Admin | Project Manager | Team Member | Client |
|---|---|---|---|---|---|---|
| `service.create` | the client the engagement is added to | yes | yes | yes | no | no |
| `client.assign` | the client | yes | yes | yes | no | no |
| `service.assign` | the engagement | yes | yes | yes | no | no |

`service.create` names the client rather than nothing, because the engagement does not exist yet and asking only about the role would let a manager add a service to a client they cannot otherwise reach. None of the three needs `members.manage`: putting a colleague on a client decides who does the work, while who is in the workspace at all stays where A4 put it. The A4 role matrix test now covers all sixteen actions and asserts that every action naming a record has one and every action naming none has none.

`loadInternalServiceResource` is the service counterpart of A6's `loadInternalClientResource`. `loadServiceResource` stays client-visible, because a portal contact may one day be shown a projection of a service their own client bought; the package, the scope notes, the lifecycle, and the internal team are not that, so every internal route asks about an `internal` record and the engine refuses a Client on visibility. `loadServiceResource` also takes an optional `clientId`, put into the lookup rather than compared afterwards, so an engagement under a different client of the same workspace answers exactly as one that never existed.

### Activity

Nine new event types on the existing append-only `activity_events`; no second history table.

`SERVICE_ENGAGEMENT_CREATED`, `SERVICE_DETAILS_UPDATED`, `SERVICE_STATUS_CHANGED`, `CLIENT_ASSIGNMENT_ADDED`, `CLIENT_ASSIGNMENT_UPDATED`, `CLIENT_ASSIGNMENT_REMOVED`, `SERVICE_ASSIGNMENT_ADDED`, `SERVICE_ASSIGNMENT_UPDATED`, `SERVICE_ASSIGNMENT_REMOVED`.

Every one carries the workspace and the client, so a client's history reads as one story; the service ones also carry the engagement. Details and status are two distinct facts and record one event each. A validation failure, a refused request, and a no-op record nothing, and one request never records the same fact twice.

Metadata carries the safe display names it needs to stay readable later — the service type's name, the member's name, and old and new roles — and nothing else: no request body, no contact address, no whole service record. `lib/bloomops/client-activity.mjs` renders each one as a sentence, and event codes, ids, and metadata JSON never reach the screen:

- "Service added — Social Media Management (Growth) was added."
- "Service status changed — Social Media Management changed from Planned to Active."
- "Client team member added — Maria Reyes was assigned to this client as member."
- "Service team member removed — Tomas Bell was removed from Social Media Management."

Client-wide and service-specific assignment read differently on purpose, so somebody skimming the history can tell the two amounts of access apart without opening the Team tab.

### The Services tab

Real for a manager: one hairline row per purchased service with the service name, its department, its status as a label plus a glyph, the package and start date on a quiet second line, and the scope note clamped to two lines underneath. Add service and Edit are small dialogs, not wizards. No card per service, no department icon, no progress ring, no statistic.

A Team Member who reaches the client reads the same rows on the server with no controls at all. Which services they see is the engine's answer, not the page's: a client-level assignment shows all of them, a service-level assignment shows that one.

The Add service form offers only service types that could actually start now — active, with no open engagement already — so the screen does not invite the duplicate the server would refuse. When a client already has every service in the catalogue, the form says so and offers nothing rather than fields that cannot be submitted. The server is still the boundary either way.

### The Team tab

Three sections, kept apart because they are three different facts:

- **Internal owner** (A6): who is responsible, with the plain statement that it is not who has access.
- **Client-wide team**: "People here work across every service this client has, including services added later."
- **Service teams**: one indented, left-ruled block per engagement, each with its own heading, status, and list, under "People here work on one service only. Being on a service team does not give access to this client's other services."

They are never collapsed into one ambiguous "Team" list. Assignment roles are words beside the name, never a colour, and a member whose workspace membership has ended is marked in words. Owner, Admin, and Project Manager may assign, change a role, and remove, with a confirmation before a removal that says exactly what the person loses and what they keep. A Team Member who can reach the client reads both lists with no controls; a Client never reaches the tab at all.

### Migration

`drizzle/0004_a7_open_service_uq.sql`, generated by `drizzle-kit` from the schema declaration:

```sql
CREATE UNIQUE INDEX `service_engagements_client_type_open_uq` ON `service_engagements` (`client_id`,`service_type_id`) WHERE status IN ('planned', 'onboarding', 'active', 'paused');
```

No column was added, no table was redesigned, and the A6 primary-contact migration is untouched. `.github/scripts/verify-zero-remote.mjs` gained an index check, read from the migration files themselves, because two phases in a row have added nothing but an index and a table-only check would have passed with it missing.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2826 tests, 2826 pass, 0 fail (2765 before A7; 61 A7 tests across `tests/bloomops-services.test.mjs` and `tests/bloomops-assignments.test.mjs`, including the seven added by the correction pass below) |
| `npm run build` | exit 0 |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 from zero | `.wrangler/state` deleted, then `db:schema:local`, `db:migrate:local`, `db:domain:migrate:local` (5 applied). Second pass: "No migrations to apply". `client_contacts_primary_uq` and `service_engagements_client_type_open_uq` both present on the fresh database |
| Zero-to-current | `node .github/scripts/verify-zero-remote.mjs --local`: every check passed with the five domain migrations, including the new "every index the migrations create exists" (48 indexes) and the identical-after-second-run comparison |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 132 of 132 through the real bundle on workerd (89 before A7) |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 |
| Browser review | `node scripts/shell-review-local.mjs`: 538 of 538 structural checks, every A5, A6, and A7 state at 1440, 1024, 768, 390, and 320 in headless Chromium, 249 screenshots inspected |

The 54 A7 tests run the real route handlers over a real SQLite built from the committed migrations, with real Better Auth sessions, and render the real components.

`tests/bloomops-services.test.mjs` covers: the catalogue (exactly four departments and five service types with the right mappings, Operations with none, a second pass adding nothing, a row with a canonical slug left exactly as the workspace made it, two workspaces with independent rows and a foreign department refused by the foreign key, the bootstrap plan and the domain helper producing identical rows, the plan giving an existing workspace the catalogue without rewriting anything, and department membership granting no scope); creation by each role with the denied cases, the forced Planned status, the ignored `status`, `clientId`, `workspaceId`, `approvalPreference`, and `sourceTemplateVersionId`, and the absence of any onboarding, invitation, mail, or portal link; one client holding Social, Ads, and GHL as one record; a foreign, inactive, and invented service type all refused identically; bounded validation that writes nothing; the duplicate invariant in all four open statuses and its release in both terminal ones, a direct database insert refused, and a terminal reopen into a conflict refused in words; every canonical status accepted with the client's status, health, and dates unmoved after each; the service type refused as an edit; activity with the right actor, workspace, client, and engagement, readable after a rename, absent on failure and no-op, and immutable; leak safety across four cases compared byte for byte; the origin fence on both routes; what the add form offers; and the rendered markup of every semantic component.

`tests/bloomops-assignments.test.mjs` covers: the two new actions' policy; assignment by each role with the denied cases; a client assignment granting the client, its list entry, its detail, and every engagement including a later one; its removal taking all of that away on the next request; a service assignment granting exactly one engagement and not the client, its siblings, another client's, or another agency's; both narrowing cases; department membership granting nothing even as lead of all four departments; the candidate list and the five refused kinds of assignee plus a user id; a suspended assignee keeping their row and being marked; re-assignment semantics with no duplicate row and one event per real change; several leads allowed; one row per client and per service for the same person with the database refusing a second; owner and assignment separate in both directions; activity in words with the right actor, client, and engagement; leak safety across six cases; a body-supplied workspace and client ignored; the origin fence on all six routes; and no bleed for one identity with memberships in two workspaces.

The Worker smoke adds, over HTTP through the real bundle: the seeded catalogue and its no-op second pass, the real Services tab, Social added and starting Planned despite the request, GHL added to the same client, both under one client record, a duplicate Social refused in words with no database wording, a status change with the client's lifecycle unmoved and nothing activated behind it, a service-only assignment that does not give the client record, a client-wide assignment that gives every service read-only, the Team tab's two separated sections, a cross-site assignment change refused, a Team Member refused when assigning, the client-wide assignment removed with the client lost and the explicit service row intact, department membership alone reaching nothing, a leak-safe not-found, and the Activity tab in words with no codes or ids.

The browser review adds the A7 states at all five widths: the services list with several statuses and a long package and scope note, the empty state, a client whose catalogue is spoken for, the Team tab with both assignment layers and an inactive member, the empty team, the mixed A6/A7 activity, a Team Member's read-only services and team, the add and edit dialogs, the status selector, the exhausted-catalogue state, both assignment dialogs, and the unassignment confirmation. It also checks in the browser that the two assignment layers are separate sections in order, that each service names its own team through an aria-label, that the assignment role is a word, that an inactive member says so, that a service row carries its department and status, that the Services tab states the lifecycle independence, that A6 and A7 history read as words together with no code, id, or JSON, and that a Team Member is offered no control on either tab.

Two defects the browser review found and A7 fixed before this was recorded:

- **the assignment role ran into the name in the accessible text.** `AssignmentRow` separated the name and the Lead/Member marker with a CSS margin only, so `textContent` and a screen reader both got "Priya ManagerLead". A real space now sits between them, with a render test asserting it.
- **the per-service assign button overflowed a 320px screen.** Its label carried the whole service name ("Assign to Social Media Management", 293px inside a padded block), which pushed the document 3px wider than the viewport. The service is named by the heading directly above it, so the button now reads "Assign someone" and carries the full name in its accessible label.

### Intentionally deferred to A8 and later

- onboarding template generation and instantiation: A8. Nothing in A7 sets `source_template_version_id` or creates an onboarding row
- activation, the client lifecycle transitions it owns, and any coordinated Planned → Onboarding move for services: A9. A7 built the choices activation will use and none of the activation
- client invitation and `client_contacts.user_id` linkage: A9 and A10
- the client portal's own view of a service: A10. `loadServiceResource` stays client-visible for it, and no portal projection was written
- service-type administration: no catalogue CRUD, no pricing, no packages catalogue, no custom service builder, no template binding UI. The catalogue is read-only in the product and exists so a manager can choose what a client bought
- departments administration: no department management screen, no department membership editor, no department dashboard, no workload by department. Departments appear where they are useful (on a service type and on a service row) and nowhere else
- `approval_preference` on an engagement: the column exists from A2 and no route or form touches it
- a direct service detail route: not invented. Navigation for a service-only Team Member belongs to the later Social, Ads, and Systems areas, and A7 did not weaken A4 to make the client detail convenient
- workload analytics, department-wide authorization, projects, milestones, actions, and deliverables: Release B and later

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

- the default catalogue reaches an existing workspace through the bootstrap step of the staging deploy, not through a migration. If that step is ever skipped (it is skipped with a warning when the owner or admin secret is missing), a workspace has departments and service types only from whenever the bootstrap last ran, and the Services tab's Add form has nothing to offer. The seeding is idempotent, so re-running the bootstrap fixes it
- the A7 duplicate rule (one open engagement per service type per client) is a Release A decision taken where the canonical documents are silent about re-selling. It is one partial unique index plus the open/terminal split in `lib/bloomops/schema.mjs`; widening or narrowing it means a migration, not a code change
- a service-only Team Member has no navigation to the engagement they are assigned to. The engine grants it, `listClientServices` returns it, and no route or screen in A7 exposes a service on its own, because the client detail is behind the client record they deliberately do not have. C1 now provides scoped Social Content list/create/detail/edit and minimal Social-service context; a standalone Service detail remains outside C1
- `describeEvent` falls back to "Client updated" for an event type it does not know, which is right for a screen but means a future phase that adds an event and forgets its renderer degrades quietly rather than loudly
- A6 shows the client lifecycle and never writes it, so a client created today stays Draft until A9 exists. That is the deliberate boundary (see "Lifecycle, and the A9 boundary"), but it means the lifecycle filters other than Draft can only show clients whose status was set outside the application
- the A6 owner-candidate policy (workspace-wide roles, plus a Team Member already assigned to that client) is a decision taken where the canonical documents are silent, made because ownership grants no access. It is one function, `ownerCandidates`, and A7 may widen it once assignment management exists
- `owner_membership_id` is operational responsibility and the A4 engine does not read it. A future phase that decided ownership should imply scope would have to change the engine deliberately, not the client domain
- a slug race falls back to random suffixes and, if every candidate loses, answers a plain "try again" rather than a constraint error. It has not been observed; the retry loop exists so it cannot surface as a raw unique-constraint failure
- `app/globals.css` (inherited) carries element-level rules that can outrank `.bo-*` classes. A6 hit one (`input[type="date"] { font: inherit }`) and answered it in `app/bloomops.css` with a more specific selector plus a test. Other element rules there could do the same to a future control
- the inherited Leadsthatbloom application is still in source and still served to Owner and Admin at `/legacy` (no longer the root, not in navigation); its Pages editor is the part worth keeping, and retiring the rest is later work
- the inherited prospecting routes are fenced, not authorized: Owner and Admin reach all of them as `admin`, and no other role reaches any. Every inherited route still knows nothing of client, service, or visibility scope, which is why the fence admits nobody else until later phases replace those surfaces
- the shell layouts and pages resolve access through React `cache()` per request; a page that forgets to call `requireShell` would render inside the shell without its own check. `tests/bloomops-shell.test.mjs` fails if any page or layout under `app/(internal)` or `app/portal` omits the call
- `app/bloomops.css` and the inherited `app/globals.css` both load on every page; the BloomOps layer is namespaced, but a future inherited-CSS change to element selectors (`html`, `body`, focus rings) could still reach BloomOps surfaces. `html:has(.bo-root)` and `.bo-root` reset the ground, font, and focus colour deliberately
- the `/design` gallery is gated to development or an explicit `BLOOMOPS_DESIGN_GALLERY=1` var plus an internal membership; staging does not set the var, so the gallery does not exist there
- the restricted-visibility policy (Owner, Admin, and named memberships) and the Owner-holds-everything capability baseline are A4 decisions taken where the planning docs are silent; each is one line in `lib/bloomops/authorization.mjs` and one row in the tests to change
- a Client membership created through the A3 invitation flow has no `client_contacts.user_id` link yet and therefore reaches nothing until a later phase links the contact on acceptance; that is the intended fail-closed state, not an oversight
- Better Auth's rate limiter uses memory storage, which is per Worker isolate; the magic-link path is still bounded (5 requests a minute per IP per isolate) but not globally
- staging can sign in only its bootstrapped addresses. Real magic-link delivery and sign-in were manually verified on 2026-09-06 from a bootstrapped staging Owner mailbox using the configured verified Resend sender domain
- staging holds one extra active membership, created as Owner when the bootstrap addresses were changed between workflow attempts on 2026-09-06. The bootstrap never rewrites or removes memberships, so it stays until removed by hand or through the members API
- the `resend` transport sends from `onboarding@resend.dev` until `BLOOMOPS_MAIL_FROM` names an address on a domain verified in Resend; that sender only delivers to the Resend account's own mailbox
- prospecting code, skills, tools, `services/audit-render/`, the quarantined `workers/bloomwired-review/`, and the Leadsthatbloom report markdown files at the repository root remain until replacement phases make removal safe
- the inherited schema is still bootstrapped from `schema.sql` plus postcondition-aware migrations. A2 added the BloomOps domain schema beside it. The inherited schema is retired only when the prospecting code that reads it is removed
- `open-next.config.ts` configures no cache. Every inherited route is dynamic, so nothing is lost today. Revisit when a route needs ISR
- `compatibility_date` is `2025-05-01`. Wrangler suggests a newer date. Raise it deliberately with a test pass
- the production D1 id is a placeholder until production is provisioned deliberately
- two migration systems coexist in one database until the inherited prospecting schema is retired: keep running the inherited bootstrap before the domain migrations on a brand-new database, as the workflow does, even though either order works today
- the BloomOps client table is physically named `bloomops_clients` until the inherited `clients` table is dropped

## Intentionally Not Done in A7

- no service-type administration: no catalogue CRUD, no pricing, no packages catalogue, no custom service builder, no template binding UI
- no departments administration: no management screen, no membership editor, no dashboard, no workload by department. Department membership still grants no client or service scope
- no activation of any kind: no onboarding instance, no template instantiation, no `source_template_version_id`, no client invitation, no `client_contacts.user_id` write, no mail, no project, no action
- no client lifecycle write. A service status change touches the service and nothing else
- no `approval_preference` in any route or form, though the column exists from A2
- no direct service detail route. Navigation for a service-only Team Member belongs to the later specialist areas; A4 was not weakened to make the client detail convenient
- no portal projection of a service. `loadServiceResource` stays client-visible for A10 and nothing renders it yet
- no "one lead only" constraint. The canonical documents do not ask for one, so several leads are allowed
- no workload analytics, no department-wide authorization
- no staging deployment from this branch, and no fake client or engagement seeded anywhere. The default departments and service types are real workspace configuration and reach staging through the existing bootstrap step

## Intentionally Not Done in A6

- no purchased services, service types, or service lifecycle (A7); the Services tab is an honest state
- no departments, `client_assignments` or `service_assignments` management, or scoped team-assignment UI (A7); the Team tab shows only the internal owner
- no onboarding template generation (A8), activation (A9), client invitation or `client_contacts.user_id` linkage (A9/A10), or client onboarding portal (A10)
- no client lifecycle write of any kind, and no Activate control: `updateClient` refuses `relationshipStatus`, and `CLIENT_STATUS_CHANGED` is left for the phase that moves the lifecycle
- no archive or restore, and no `archived_at` or `deleted_at` column
- no `clients.company` field in the UI; `clients.name` is the canonical display name
- no second authorization model: one new action and one new descriptor, both in `lib/bloomops/authorization.mjs`
- no change to the A5 shell, navigation, or portal, and no new portal destination
- no edit to any inherited prospecting route, component, or the Pages/editor system; `app/globals.css` is untouched (the date-field fix is in `app/bloomops.css`)
- no staging deploy from the branch and no production provisioning; no staging data was created or seeded, and no workflow trigger was changed
- no removal of inherited code

## Intentionally Not Done in A5

- no Clients CRUD or detail, no service or department management, no onboarding engine, no activation or client linkage, no projects, milestones, actions, deliverables, social, ads, systems, or finance records, no payment or billing, no public registration, no new auth method, no Better Auth organization plugin, no workload analytics
- no capability grant/revoke screen, no appearance preference, no portal destinations beyond Home
- no schema change or migration
- no edit to any inherited prospecting route, component, or the Pages/editor system; `app/globals.css` is untouched
- no staging deploy from the branch and no production provisioning; the extra A3 staging membership is untouched; no workflow trigger was changed
- no removal of inherited code; the inherited application is served at `/legacy` for administrators until later phases retire it

## Intentionally Not Done in A4

- no Clients, client detail, onboarding, project, task, social, ads, systems, finance, settings, or portal features; no A5 shell or navigation; no member or invitation management UI; no capability, assignment, or contact-link routes
- no change to Better Auth, the sign-in or invitation screens, or the magic-link flow; no new auth method, no organization plugin
- no schema change or migration
- no edit to any inherited prospecting route; the fence is in `lib/workspace.mjs` and `app/page.jsx` only
- no staging deploy from the branch and no production provisioning; the extra staging membership A3 recorded is untouched
- no removal of the extra A3 staging membership or any other staging data

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

For the current phase and its audit, read:

1. `AGENTS.md`
2. this file
3. `docs/phases/C4.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

Finish C4 independent ChatGPT audit and user-controlled merge, then verify Deploy staging and Verify zero-to-current on the exact C4 merge SHA. The next planned phase is C5 — Approvals + Revision History, after those gates and a separate implementation instruction. C5+ remains unimplemented.

### The A7 phase, for reference

A7, Services and Departments. Complete. It seeds the four departments and the initial service types, gives one client several purchased service engagements with their own lifecycle, and builds assignment at both the client and the engagement level. The Services and Team tabs of the client detail (`app/(internal)/clients/[id]/page.jsx`) are where its screens land; both say today, honestly, that services and assignments are a later release. `service.view` and `service.manage` already exist in `ACTIONS`, and `loadServiceResource` already builds the descriptor; A7 adds whatever creation action it needs beside `client.create` and may widen `ownerCandidates` in `lib/bloomops/clients.mjs` once a manager can grant client access in the same place they name an owner. The A4 rule that a service assignment reaches the engagement and not the client record is load-bearing and is covered by tests in both `tests/bloomops-authorization.test.mjs` and `tests/bloomops-clients.test.mjs`.

## Last Verification

2026-09-08, C4. 111 focused tests, all C1–C3/B1–B7/A-core regressions, 4,490 full tests, both builds, 39 JS/JSX syntax checks, clean diff check, 22 fresh/no-op checks, C4 real workerd/D1/R2 64, all prior runtime smokes, built HTTP 144, external verifier 21 and final browser/HTTP 75 with 47 captures passed. The leading C4 section is the current evidence and gate record; the paragraphs below are historical. Package/lock unchanged; exact current C3-base and C4 audit both 53, zero delta. C4 remains pending independent audit, user-controlled merge and exact-merge-SHA post-merge gates; C5+ is unimplemented.

2026-09-08, C1. Canonical Content Items and the real Social list/create/detail/edit flow passed 133 focused tests, all B1–B7 and A/core regressions, and 4,163/4,163 full tests. Both builds, 33 JS/JSX syntax checks, whitespace checks, 22 fresh/no-op checks, C1 actual D1 43, prior B1/B2/B3/B4/B5/B6/B7/A11 actual D1/R2 25/28/47/38/42/34/86/26, built HTTP 144, external verifier 21, and final browser/HTTP 96 with 33 captures all passed. Package/lock unchanged; audit 49 advisories, zero current base/branch delta. The C1 section records the 44-path inventory, exact schema/field/auth choices, pagination/choice limits, complete commands and local evidence limitations. The temporary prompt is gone with no net diff. C1 awaits independent audit, user-controlled merge and both exact-C1-merge-SHA gates; C2+ is not implemented.

2026-09-08, B7. Schema-free Release B hardening reproduced and corrected exact Project body validation, Work query validation and a mobile toast obstructing a dialog. B7 focused 29/29 (34 shared race assertions), B1–B6 97/173/203/197/171/76, A/core 421/421 and full 4,030/4,030 passed with zero failures/skips. Install, Next/Cloudflare builds including lint/type checks, 21 JavaScript syntax checks and whitespace checks passed. Fresh/no-op zero: 22/22 with unchanged 60 inherited + 13 domain migrations. Actual D1 B1/B2/B3/B4/B6/A11: 25/28/47/38/34/26; actual Files D1/R2: 42; integrated B7 D1/R2: 86. Final built HTTP: 144; external: 21; B7 browser: 273 with 62 captures; Files browser: 143 with 44 captures plus reference. All five required widths passed, including immediate 390/320 toast hit tests. The B7 section records exact commands, the 28-path inventory, audit matrix, local evidence limits and unchanged 49-advisory count/severity baseline. This is historical B7 local evidence. B7/Release B subsequently closed through PR #21 and both successful exact-SHA gates on `c6509aa395a5db58310e2a0ae22a8a808082f77b`. C1 is recorded above.

2026-09-08, B6. Schema-free canonical Home/Work projections passed 76/76 focused tests, B1/B2/B3/B4/B5 regressions 97/173/203/197/171, Release A/core 421/421 and the full suite 4,001/4,001, all with zero failures/skips. Install, both builds including lint/type validation, 16 JS/JSX syntax checks and diff checks passed. Fresh/no-op verification: 22/22, unchanged 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 indexes and 21 triggers. Actual D1 B6: 34/34 with 240 assignments, Home 14 metadata queries and a maximum 64 bindings / 12,918 SQL bytes; no R2 binding. Prior D1/R2 B1/B2/B3/B4/B5/A11: 25/28/47/38/42/26. Final built HTTP: 144/144; external verifier: 21/21; B6 browser/HTTP: 144/144 with 47 captures at 1440/1024/768/390/320, including keyboard/focus, mobile anchor positioning, touch, reduced motion and no-JavaScript Home. Exact commands, the 23-path inventory, query/date/attention rules, fixture/UI corrections, local runtime limitations and unchanged 49 dependency advisories are recorded in the B6 section. This is historical B6 local evidence. B6 subsequently closed through PR #20 and both gates on `58647bda6dd40739b7670e6c0f907b6f33689e5d`; current B7 evidence is recorded above.

2026-09-08, B5. Focused Files 171/171, B1/B2/B3/B4 97/173/203/197, Release A/core 421/421 and full suite 3,925/3,925 passed with zero failures/skips. Install, both builds with lint/type checks, 42 JavaScript/JSX syntax checks and diff checks passed. Fresh/no-op verification: 22/22, 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 explicit indexes and 21 triggers. Actual D1/R2 B5 42/42; prior D1 B1/B2/B3/B4/A11 25/28/47/38/26; built HTTP 144/144; external verifier 21/21; browser/HTTP 139/139 with 42 screenshots at five widths plus the live design reference, exit 0. The B5 section records the complete 52-path inventory, 5 MiB upload and recovery limits, middleware/input corrections, reproducible local preview alternative and unchanged 49 dependency advisories. This is historical B5 local evidence. B5 is closed through PR #19 and both post-merge gates on `4c6dad696d15fac4094b8172788b5c72642ff757`. Current B6 work is recorded above.

2026-09-08, B4. Focused Deliverables 197/197, B1 97/97, B2 173/173, B3 203/203, Release A/core 421/421 and full suite 3,754/3,754 passed with zero failures/skips. Install, both builds with lint/type checks, 33 JavaScript/JSX syntax checks and diff checks passed. Fresh/no-op verification: 22/22, 60 inherited + 12 domain migrations, 33 domain / 69 total tables, 77 explicit indexes and 15 triggers. Actual D1 B4/B1/B2/B3/A11: 38/25/28/47/26; built HTTP: 144/144; local external verifier: 21/21; final B4 browser/HTTP: 141/141 with 42 screenshots across all five widths plus the live design reference, exit 0. Exact commands, 42 changed paths, limits, fixture corrections and the unchanged 49 dependency advisories are in the B4 section above. This is historical B4 local evidence; B4 is now closed through PR #18 and both gates on `ac71b358f27894af8dd8108f004499cd765fca69`. B5 is recorded above.

2026-09-08, B3. Focused Actions 203/203, B1 97/97, B2 173/173, Release A/auth/security/domain regressions 421/421 and full suite 3,557/3,557 passed with zero failures/skips. Install, both builds including lint/type checks, 33 changed/new JavaScript syntax checks and diff checks passed. Fresh/no-op migrations: 22/22 checks, 60 inherited + 11 domain migrations, 32 domain tables, 75 explicit indexes and 15 triggers. Actual D1 B3/B1/B2/A11: 47/25/28/26; built-Worker HTTP: 144/144; local external verifier: 21/21; B3 browser/HTTP: 161/161 with 53 screenshots at all five widths. Exact commands, decisions, corrections, changed paths and unchanged 49 dependency advisories are in the B3 section above. This is historical B3 local evidence. B3 is now closed by PR #17 and both verified post-merge gates; B4 is recorded above.

2026-09-08, B2. Focused Milestones 173/173, B1 Projects 97/97, Release A/auth/security/domain regressions 421/421 and full suite 3,354/3,354 passed with zero failures/skips. Install, both builds with lint/type checks, 28 changed/new JavaScript syntax checks and diff checks passed. Fresh/no-op migrations: 22 checks; actual D1 B2/B1/A11: 28/25/26; built-Worker HTTP: 144/144; external local verifier: 21/21; B2 browser/HTTP acceptance: 117/117 with 38 screenshots at all five widths. Implementation, exact commands, verification corrections and existing dependency advisories are recorded in the B2 section above. This is historical B2 local evidence; B2 is now closed by PR #16 and both verified post-merge gates. B3 is recorded above.

2026-09-08, A11. New adversarial tests 82/82 (38 failures reproduced against unchanged pre-hardening code); A10 39/39, A9 44/44, A8 72/72, auth/security/domain 184/184, schema/shell/verifier safety 56/56. Full suite 3,083/3,083 with zero failures/skips on Node 22.22.1. Install, both builds including lint/type checks, all 48 changed/new JavaScript syntax checks, and diff checks passed. Fresh/no-op migrations 22 checks; actual workerd/D1 A11/A10/A9/A8 smoke 26/27/14/12; built Worker HTTP 144/144; external local verifier 21/21; both Release A browser stories and responsive hardening 174/174 with 42 screenshots at five widths. Four browser-fixture defects were corrected before the final passing acceptance run. The dependency advisory assessment and exact commands/files are recorded above. Release A is complete and audited locally, pending independent PR review/merge and both post-merge runs on the actual merge SHA. No real email or manual staging, production, DNS, or Leadsthatbloom mutation occurred.

2026-09-07, A10. Focused A10 39/39; A9 44/44; A8 72/72; affected domain/access 141/141; shell/schema 36/36, combined 332/332. Full suite 3001/3001 on Node 22.22.1. Install and both final builds exit 0. Fresh/no-op local verifier 19/19; A10/A9/A8 disposable D1 smoke 27/14/12; built Worker HTTP smoke 144/144; external verifier against local Worker 21/21; A10 HTTP/browser/Release A acceptance 95/95 with 20 screenshots at five widths. Exact architecture, evidence and limitations are above. All email used memory/development R2, and no staging, production, DNS or Leadsthatbloom resources were modified. A11 is next after independent audit/merge and the merged-main gate.

2026-09-07, A9. Focused A9 42/42, A8 72/72, affected access/domain regressions 158/158, full suite 2960/2960 on Node 22.22.1. Install and both builds exit 0. Fresh/no-op zero verifier passes with seven domain migrations, 25 tables, 55 indexes and nine triggers. Actual D1 A9 smoke 14/14 and A8 smoke 12/12; built local Worker smoke 144/144; external verifier against local Worker 21/21; browser review 37/37. Full evidence and limitations are under "Client Activation (A9)". A10 is next. All mail was fake or local R2; staging, production, DNS and Leadsthatbloom were untouched.

2026-09-07, post-merge A8 verifier correction. Focused safety tests 20/20, full suite 2918/2918, local zero-to-current exit 0 with all six domain migrations and an identical no-op second pass. Syntax, YAML parsing, and diff checks pass. No application build was needed for this verifier/workflow/test/docs-only change. The corrected remote workflow must still pass on main after independent merge before A9 begins. See "Post-merge A8 verifier cleanup correction" above.

2026-09-07, A8. Baseline 2826/2826 on `999f2397`; final 2898/2898, focused A8/schema 91/91, both builds and `npm ci` exit 0, fresh/no-op migrations and zero-to-current pass, actual D1 engine smoke 12/12, app Worker smoke 132/132, external verifier 21/21. Full evidence and environment notes are recorded under "Onboarding Template Engine (A8)" above. A9 is not implemented; staging, production, and Leadsthatbloom were untouched.

2026-09-06, A7 correction pass after an independent audit of PR #8. The audit found one blocking problem in `lib/bloomops/assignments.mjs`: `addAssignment` read then inserted, so two concurrent requests assigning the same person to the same parent could both read nothing and the loser would surface a raw unique-constraint failure instead of the documented re-assignment semantics; and the assignment insert and its `*_ASSIGNMENT_ADDED` event were two separate writes, so an assignment could exist without the event that records it. Both are fixed in the shared implementation, so client and service assignments behave identically (see "Assignment, and exactly what each row grants"). Seven regression tests were added, including three that arrange the real interleaving (the pre-read finds nothing, another writer commits through the real domain path, the insert meets the real index) and one that proves the batch rolls back when the event write fails. Each was confirmed to fail against the unfixed code before being kept.

One test-harness correction came with it: the D1 double in `tests/_bloomops-db.mjs` ran a batch as sequential statements with no rollback, so it could not have proved atomicity for A6's `createClient` or A7's `createServiceEngagement` either. It now wraps a batch in a real SQLite transaction, matching what D1 does. Correct domain code fails the new atomicity test against the old double, which is why the change was necessary.

The optional dialog cleanup the audit flagged was taken: the assignment form no longer renders a role selector when nobody is left to assign.

Re-verified: 2826 tests pass (2819 before this pass), `npm run build` and `npm run cf:build` exit 0, the local Worker smoke passes 132 of 132, and a focused browser check of the changed dialog passes at 1440, 390, and 320 in both its states. No migration was added or changed, so the zero-to-current proof from the A7 execution stands. No staging or production resource was touched, and no wrangler command was authenticated: the only wrangler operations run were local. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A7 execution. Results are in "Local verification (2026-09-06)" under "Services and Departments (A7)": 2819 tests pass (2765 before A7), `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes 132 of 132 and the external verifier 21 of 21 against the local Worker built from this branch, and the browser review passes 538 of 538 structural checks at all five widths with 249 screenshots inspected by hand. A7 added migration `0004_a7_open_service_uq.sql`, so zero-to-current was re-proved: `node .github/scripts/verify-zero-remote.mjs --local` passed every check, including a new one asserting that every index the committed migrations create is present on a database built only from them, and the local D1 went from an empty simulation through all five domain migrations with a no-op second pass. The browser review found two defects (the assignment role running into the name in the accessible text, and the per-service assign button overflowing a 320px screen); both were fixed and re-reviewed before this was recorded. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A6 correction pass after an independent audit of PR #7. The audit found one blocking bug: `updateClient` validated a supplied `ownerMembershipId` as a new-owner candidate before comparing it to the id already stored, so a client whose owner had become ineligible could not have any unrelated field edited. Fixed in the domain layer (see "Owner" above), with three regression tests. Re-verified: 2765 tests pass, `npm run build` and `npm run cf:build` exit 0, the local Worker smoke passes every check including a new one for this case, and the local domain migrations remain a no-op (no migration was added or changed). No production, staging, or Leadsthatbloom resource was touched.

2026-09-06, A6 execution. Results are in "Local verification (2026-09-06)" under "Clients (A6)": 2765 tests pass (2715 before A6), `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes 89 of 89 and the external verifier 17 of 17 against the local Worker built from this branch, the browser review passes 353 of 353 structural checks at all five widths, and a local D1 was migrated from an empty simulation through all four domain migrations with a no-op second pass. A6 added migration `0003_a6_primary_contact.sql`, so zero-to-current was re-proved: `node .github/scripts/verify-zero-remote.mjs --local` passed every check including the identical-after-second-run comparison, and `client_contacts_primary_uq` is present on a database built only from the committed migrations. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `d1 migrations list --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A5 execution. Results are in "Local verification (2026-09-06)" under "Shell (A5)": 2715 tests pass, `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes every check and the external verifier 21 of 21 against the local Worker built from this branch, the browser review passes every structural check at all five widths, and the local D1 was migrated from a fresh simulation with a no-op second pass. No migration was added, so the zero-to-current proof from A3 stands unchanged. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `d1 migrations list --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A4 execution. Results are in "Local verification (2026-09-06)" under "Authorization (A4)": 2698 tests pass, `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes 46 of 46 and the external verifier 21 of 21 against the local Worker built from this branch, and the local D1 was migrated from a fresh simulation with a no-op second pass. No migration was added, so the zero-to-current proof from A3 stands unchanged. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `d1 migrations list --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-05, A3 execution, updated 2026-09-06 with the staging result. Local results are in "Local verification (2026-09-05)" under "Authentication and Membership (A3)": 2680 tests pass, `npm run build` and `npm run cf:build` exit 0, the external verifier passes 21 of 21 and the end-to-end smoke 40 of 40 against the local Worker, and the bootstrap CLI is idempotent against the local D1. Staging runs 33991041976 and 33991512885 deployed and migrated successfully. The second passed 11 live checks (including the A3 migration present and the access-code flow gone) and failed only at the explicit "authentication is configured" check for lack of the new repository secrets. On 2026-09-06, after the secrets were added, run 33991512885 was re-run as attempt 2 and passed end to end: secrets set on the Worker, bootstrap created the Owner and Admin memberships, and all 22 verifier checks passed against Worker version `68cc78e9`. Attempt 3 (00:32Z) failed at the bootstrap by design after the owner and admin secrets changed between runs, and attempt 4 (00:40Z) passed end to end again, 22 of 22, with the sender address secret now set. The zero-to-current workflow (run 33991041981) proved a fresh remote D1 reaches the A3 schema. Details under "Staging verification (A3)". No production resource was touched. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`).

Earlier the same day, A2 execution. Local results are in "Domain Schema (A2)". GitHub Actions run 33968508433 applied the two domain migrations to `bloomops-staging`, and run 33968734285 (commit `ea075bc`) deployed and passed all 16 live checks, including the domain schema check. Run 33987071853 (commit `ee96d17`) then proved the fresh-remote case: a disposable D1 named `bloomops-a2-zero-verify` went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the Drizzle migrations, took a second pass as a no-op, and was deleted, with the account inventory and `bloomops-staging` unchanged. A2 satisfies every verification item in `docs/phases/A2.md`, including "fresh staging DB migrates from zero". No production resource was provisioned. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

Earlier the same day, A1 execution. Results are in "Verified Working". Later the same day the remote staging step ran from GitHub Actions (run 33966322588) and passed every check, as recorded under "Staging Deployment". A1 satisfies every verification item in `docs/phases/A1.md`. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `--dry-run`, `wrangler dev`).
