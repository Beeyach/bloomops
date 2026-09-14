# Bloomsi prospect sheet preview

Local built-Worker captures using fictional records in an isolated workspace. These are working application screens, not the generated concepts. [Open live staging](https://staging.ops.gobloomwired.com/prospecting). See [build state](../../BUILD_STATE.md) and [draft PR64](https://github.com/Bloomwired/bloomops/pull/64).

| Screen | Preview |
| --- | --- |
| Editable sheet, visible website column | [Desktop](desktop.png) |
| Readable phone table with horizontal scrolling | [Phone](mobile.png) |
| Saved internal manual-contact evidence | [History on phone](history-note-mobile.png) |
| Explicit filtered selection | [Selection](selection.png) |
| Phone identity remains sticky while scrolling | [Scrolled phone](mobile-scrolled.png) |
| Initial loading before rows arrive | [Skeleton](loading.png) |
| Actual downloaded Sample CSV preview | [Import](csv-preview.png) |
| Returned manual audit with field-by-field review | [Audit review](audit-review.png) |
| Canonical onboarding created without an invitation | [Onboarding ready](onboarding-ready.png) |

Full-page business/contact links retain the last sheet query, page and scroll. Six built-in views project existing records; named personal views, columns, filters and sorting persist per user/workspace in this browser. Date added, imported, contacted and audit date sort by actual timestamps with undated rows last. Page sizes are25/50/100/200. Selection has its own tint; bulk changes preview before saving and support guarded field undo.

CSV import accepts up to50 records/256 KiB, previews mapping/invalid rows/probable matches and preserves immutable batch receipts across retries. The sample contains two fictional examples, including a social-only prospect. A shared website requires human duplicate review; it does not establish one contact identity. Manual audit packages carry prospect/workspace IDs, revisions and provenance. Returned results use the existing structured review workflow; accepted fields remain unverified until separately checked. No paid audit API or automated ChatGPT connection is claimed.

Conversion reuses canonical Clients and purchased Services. A separate reviewed action checks published onboarding templates and generates canonical setup without invitations, portal identity links or messages. Missing prerequisites preserve the sale and stop; retries cannot duplicate onboarding. Won requires successful canonical setup. Internal history remains on the prospect; authorized internal client pages link back.

Limits: personal settings do not sync between devices; explicit all-filtered selection/record export is capped at200, manual audit export at50. Bulk saves report individual failures, and undo refuses same-field concurrent changes. Ready to contact follows the existing reviewed email eligibility, while social-only records remain valid for manual work. Paid audits, video and broader email expansion remain paused.

## Verification evidence

The evidence directory is `/home/ary/Developer/bloomops-prospect-sheet-evidence/`. It contains focused test, native D1, actual built-Worker browser, migration, source-preservation and performance results. Private local browser sessions and synthetic sign-in captures stay outside the repository. 173 focused Node tests,20 native D1 checks and93 distinct browser checks pass (46 main,35 supplemental,12 focused review checks). The main run precedes the Shift-click and review fixes; the supplemental/focused runs cover those changes. Undo restores original source verification and survives a committed-but-lost response; manual evidence notes remain readable internally. Successful favicon rendering uses a fixture-only query suffix because Playwright automatically aborts intercepted URLs ending /favicon.ico. Runtime icon URLs and styling remain unchanged. One fresh Sol High review found three issues; the single focused re-review accepts their fixes with no remaining material findings. Staging is deployed; the live checks and their limits are recorded below.

Compared with the accepted P5B application, Home/Clients/Work retain one navigation request,11/3/7 SQL statements and two D1 calls, respectively. All three retain10 scripts. Decoded shared JavaScript is388963 before and390118 after (+1155 bytes,0.3%). No sheet, prospect evidence, editor or video runtime is added to those routes. The original84-sample comparison retains60 measured navigations and12 cold loads. A final42-sample/six-cold-load recheck confirms query/bundle counts after the final sheet interaction correction. It ran alongside supplemental UI checks, so its timing is not an isolated benchmark. Small synthetic fixtures and frame timing provide no production speed guarantee.

Migration0043 is additive. Fresh migration/idempotency and a populated-copy check preserve113 previous tables and existing rows/schema. Normal development and original Leads That Bloom data are unchanged. Production and DNS were not touched.

The performance runs precede the review fixes to sheet undo, conversation filtering and internal profile history. Those fixes add no calls or client imports to Home/Clients/Work; no new timing claim is made.

## Live staging verification

The existing [staging workflow](https://github.com/Bloomwired/bloomops/actions/runs/34812410187) deployed runtime `bbe828b` successfully, with44 healthy domain migrations and22 passing live checks. A further20 public browser checks verify the version, health, exact official logo, sign-in at1440/390/320, anonymous access denial and redirects. [Check results](staging-checks.json), [desktop sign-in](staging-sign-in-desktop.png), [phone sign-in](staging-sign-in-mobile.png).

These live captures show the public sign-in screen. Authenticated sheet behavior is covered by the isolated application captures and acceptance above; the owner's actual staging account/workspace walkthrough remains unverified. No real prospect import, conversion or outreach was used for live acceptance. The six-file integration preserving main's staging-origin/auth-logo fixes passed20 focused tests, the OpenNext build and a bounded independent Sol High review with no material findings. PR64 remains draft with merge conflicts; deployment does not imply merge acceptance.
