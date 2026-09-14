# Client creation recovery — N1G

Local synthetic preview. Implementation is locally accepted and independently reviewed; this slice is not merged or deployed. The official Bloomsi logo, existing full-page form and canonical client records are retained.

## Behaviour

Incomplete client details survive navigation/reload in browser-local copies scoped to the initiating user and workspace. Recovery initially shows only field counts and dates. Review checks current server authority before revealing fields and never creates automatically. A lost response reuses the same creation identity, finds the original saved client and keeps later input available for download. New clients remain Draft/On Track with an unlinked primary contact; no invitation or onboarding is triggered.

The client/contact/activity transaction now checks current creator and selected-owner eligibility. Its durable receipt commits in the same batch. Exact replays confirm the original record; changed-input reuse refuses another creation. Existing field-only callers remain supported with live creation authority. Browser copies are separate per writer, limited to ten per user/workspace, seven days and 256 KiB; storage failure keeps mounted input and warns. Stored fields are not synchronized across devices or guaranteed after browser data removal. Logout clears copies; workspace changes preserve the original scope while invalidating mounted forms.

## Visuals

- [Desktop recovered fields](client-recovery-1440.png)
- [Phone recovered fields](client-recovery-390.png)
- [Narrow phone](client-recovery-320.png)
- [Phone recovery choices](client-recovery-copies-390.png)
- [Keyboard focus](client-keyboard-focus.png)

Desktop 1440 and phone 390 captures have been visually inspected; horizontal-fit checks cover 1440/1024/768/390/320. Full-page captures include the fixed mobile navigation at its viewport position; the form remains vertically scrollable.

## Verification

119 focused tests pass: existing clients/schema/profile/sheet plus new client creation and storage checks. The final OpenNext Worker build passes. **56 native/browser checks pass:** [23 main journeys](client-acceptance.json) on the final build, [nine storage checks](client-storage.json), [18 session/lifecycle/native concurrency checks](client-lifecycle.json), and [six native rollback/replay checks](client-native.json). The latter 33 checks precede only the final form correction: sent-request reconciliation now runs before validation of later incomplete input. The final main run verifies that correction with a genuinely committed-but-lost reply and a subsequently incomplete email. It also rechecks reload recovery, changed input, ordinary creation, duplicate submission, five widths, downloads, quota and denied user binding.

Additive migration 0044 adds one receipt table and immutable receipt triggers, reaching 45 domain migrations. Fresh zero-to-current and second-pass idempotency checks pass. [Populated-copy comparison](migration-populated.json) preserves all 112 existing application tables and old schema objects, with no foreign-key violations. Wrangler's internal `_cf_METADATA` migration metadata is excluded from the application-row comparison. No original LTB or ordinary development records were touched.

[Unrelated route measurements](performance.json): Home/Clients/Work keep one navigation request, 11/3/7 SQL statements and two D1 invocations each. Ten scripts total 391049 decoded bytes, up 51 bytes from accepted N1F (390998). Measurements use synthetic local data, seven rounds with two warmups, desktop/phone and zero artificial database latency. Local timings are not production latency claims. [Native manager recovery](native-client-recovery.json) uses three statements/three calls: identity, existing capability loading, and one bound receipt read; maximum eight bindings. Owner capability loading is skipped by the existing authorization engine. [Final build bundle-size comparison](final-bundle-check.json) matches all six measured route/viewport combinations; the last correction stays in the client form route.

The expiry browser harness was corrected to age inactive copies after leaving the mounted form; mounted departure correctly persists current input. The manager-query assertion was corrected for the existing capability read, and the session harness reuses its issued original cookie after account replacement to avoid unnecessary magic-link rate-limit requests. No app rate limit was changed. One fresh Sol High read-only review found no material correctness, authorization, isolation, migration or data-loss findings. It independently ran the 28 creation/store tests and inspected the full diff, snapshot predecessor, supplied acceptance logs and visuals. No re-review was needed.

Private logs, synthetic auth fixtures and downloads remain outside the repository at `/home/ary/Developer/bloomops-n1g-client-creation-recovery-evidence/`. No provider egress, deployment, production/DNS, real import/outreach, paid auditing or video work/tests. N1 and the full roadmap remain unfinished.
