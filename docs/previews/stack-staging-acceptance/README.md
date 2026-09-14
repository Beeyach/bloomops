# Authenticated staging acceptance — PR64–66

Real staging captures from synthetic QA workspaces. Candidate `04cd43a` was deployed by [workflow34831084932](https://github.com/Bloomwired/bloomops/actions/runs/34831084932), with44 healthy migrations. Original LTB records/voices, production and DNS are unchanged.

| Screen | Capture |
| --- | --- |
| Prospect sheet | [Desktop1440](candidate-sheet-1440.jpg) |
| Recovered field and concurrent-edit warning | [Phone390](recovery-detail-390.jpg), [Phone320](recovery-detail-320.jpg) |
| Canonical client conversion receipt | [Desktop](conversion-receipt.jpg) |
| Sheet loading skeleton | [Phone](loading-390.jpg) |
| Synthetic CSV import receipt | [Baseline staging](import-receipt.jpg) |

[Observed candidate acceptance and limits](acceptance.json) covers fresh service choices, canonical client/history links, retained drafts, offline retry, undo, workspace switching, current identity/resource boundaries and concurrent edits. Fresh-workspace creation now atomically initializes the existing four departments/five service types. Missing onboarding templates remain an explicit Settings prerequisite; conversion itself succeeds and sends no invitation. No real prospect imports or outreach occurred.

Baseline acceptance also exercised Sample CSV download, duplicate/invalid preview selection, the2-added/1-skipped/1-invalid receipt, saved views/filters/date order/rows per page through reload, bulk edits/undo and manual audit export without prospect revision changes. Only fictional records were used.

Verification:86 fresh focused tests and the OpenNext build pass for the catalogue fix; native D1 offers all five conversion services.20 fresh public candidate checks pass. Prior accepted PR64/65/66 tests, browser/performance evidence and reviews remain valid. One new bounded Sol High release/fix review found no material issues. No additional migration or dependency was introduced. Broader N1/global search, real onboarding templates, outreach, paid auditing and video remain outside this release.

Merge and final deployment status are recorded in [BUILD_STATE](../../BUILD_STATE.md).
