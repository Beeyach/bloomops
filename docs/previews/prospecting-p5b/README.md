# P5B client conversion — local preview

After reviewing a client handoff, explicitly confirm the sale and choose **Convert to client**. A new client starts as Draft with an unlinked primary contact and a Planned purchased service. An existing client keeps its contact and lifecycle; an open engagement is reused without changing its scope. The receipt separately records this sale's agreed scope. Missing onboarding templates do not prevent recording the sale.

Conversion and its permanent cold-outreach stop are saved together. Reloading restores the receipt. Retrying a lost response uses the same request identity and cannot create another client or service. The prospect profile retains its conversion/stop history and links to the canonical client.

The immutable receipt protects the prospect and up to three recorded recipient addresses even after profile edits. Preparation and submission guards enforce these stops; unresolved/in-flight delivery must be resolved before conversion. No provider call, onboarding activation, invitation, portal identity link or deployment is introduced.

## Visuals

[Desktop confirmation](convert-review-1440.png), [phone confirmation](convert-review-390.png), [desktop receipt](conversion-saved-1440.png), [phone receipt](conversion-saved-390.png), [narrow receipt](conversion-saved-320.png), [existing client](existing-conversion-320.png), [profile history](converted-profile-320.png).

Both confirmation and saved result were exercised at1440/1024/768/390/320. Existing Bloomsi branding, favicon/garden SVG, typography, labels and native icons are reused. The Prospecting table/filter/status redesign awaits the owner's separate plan.

## Verification

119 distinct focused tests pass:117 initially passed, two stale schema-count assertions were updated for the additive migration and all19 schema tests then passed. The21 conversion tests also passed after stricter retry-ID validation. Fourteen native D1 checks verify actual transactional concurrency/retry/rollback, current authority, unchanged existing scope, immutable receipts and no portal/onboarding side effects. The largest domain statement uses49 bindings.

The final Worker build and45 conversion browser checks pass. The42 pre-existing handoff browser checks passed before only the final retry-ID type check. Lost-response recovery is exercised by letting the actual POST commit, withholding its successful response, and retrying the identical request. Initial browser harness assertions were corrected to open full history and select its event, since recent history can show the simultaneous stop event instead.

Migration0042 creates only the immutable receipt table, indexes and protection triggers. Fresh/idempotent native migration verification passes. A populated database copy preserves112 pre-existing tables including ledgers/metadata, all original schema objects and all rows. Applying the migration to normal local development preserves all110 application tables/rows and credentials, adds migration43, and leaves the new conversion table empty. All conversions shown here are synthetic isolated fixtures.

One fresh Sol High read-only review found no material findings; no re-review was needed. It inspected the final code, supplied checks and desktop/mobile captures without rerunning mutating harnesses. BUILD_STATE records local acceptance. Evidence: `/home/ary/Developer/bloomops-prospecting-p5b-evidence/`. Local preview only; no commit/push, staging or production deployment.
