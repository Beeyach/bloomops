# P2C2 manual result review

Synthetic local built-Worker preview. P2 remains uncommitted and undeployed; staging still contains the separate Bloomsi branding change. No real import, provider call, outreach or video work/tests.

[Desktop review](review-1440.png), [phone review](review-320.png), [saved report](saved-1440.png), [phone report](saved-320.png), [older context](stale-320.png), [concurrent edit recovery](conflict-320.png).

Open a profile's Audit evidence → Saved skill results, or Review a result from a selected skill. Paste or choose a JSON result, inspect the full report and compare proposed fields. Every field starts on Keep current. Saving records the complete report and your selected changes. Contact confidence, observations, limitations and follow-up suggestions remain separate and inspectable. Suggestions never become checked facts, approved offers or a scheduled sequence automatically.

## Verification

- 81 distinct focused tests: original 63 schema/shell/skill/result tests plus 13 profile/workspace regressions and five additional result isolation/read-race/review-fix tests. The final affected result suite has 21 passing result tests; all 32 affected result/context tests pass after the review fixes.
- Additive migration `0027_p2c2_skill_results.sql` adds one immutable result-artifact table. The local populated 27→28 migration, no-op repeat and isolated fresh/repeat migration path pass, with 51 domain tables. Every pre-slice row in nine watched tables remains unchanged; integrity and foreign keys pass.
- The built browser/native run passes 55 checks: actual file selection, escaped report text, current/proposed comparison, explicit defaults, atomic apply, retained manual values, full report/history, native audit/outreach/follow-up round trips, concurrent retry, stale edit rejection, input bounds, origin/role/workspace/revocation denials, keyboard focus, five widths and no browser runtime errors.
- Final Cloudflare build and browser refresh pass. One fresh Sol High review found two medium issues: equivalent normalized field values could bypass result deduplication, and observed claims could omit their own date/source. Both are fixed with regression tests. Normalized identity now owns the result hash while the original artifact remains intact; every observed item requires its own valid HTTP(S) source and date. The single focused re-review confirms both resolved with no material remaining issue. The reviewer inspected the 32 affected passing tests and final build; it did not independently rerun stateful browser checks. The parent subsequently completed all 55 final native/browser checks. See [browser results](results.json) and [preservation proof](preservation-final.json).

Initial tests exposed concurrent-save recovery returning a stale error; the application now recovers the existing immutable result. Native UI verification exposed JSON field-order changes affecting the preview hash; comparison ordering is now deterministic and the regression test uses the actual returned preview document. Self-review moved history's scoped identity query after the rows read to fail closed on intervening revocation, and corrected inherited fieldset CSS specificity plus error-panel spacing. The read-race test targets the actual final query; provenance uses a separate read-batch session.

## Reproduce

Use the current isolated local development D1/R2 setup, `npm run cf:build`, then `node scripts/navigation-perf-local.mjs --d1-delay-ms 40`. Run `node scripts/prospect-skill-results-browser-local.mjs /tmp/bloomops-p2c2-evidence` with the existing Playwright/Chromium installation. This environment uses `/tmp/bloomops-pilot-tools`, with `/tmp/bloomops-pilot-tools/libs/usr/lib/x86_64-linux-gnu` in `LD_LIBRARY_PATH`. The harness checks development/r2-dev before creating synthetic workspaces/profiles. It performs only explicit synthetic result saves and fixture membership/profile changes.

## Limits

Reported readiness is the submitted skill's status, not verification. The source revision is an untrusted dated reference; if it is older, every difference is reviewed conservatively because there is no trusted per-field export snapshot. No value is applied by default. A save-time edit invalidates the complete preview.

The original structured artifact and full report are immutable. Reimporting the same canonical artifact returns its prior result and does not undo later edits. The result page shows historical applied values, not a duplicate editable profile. Follow-ups remain saved suggestions for P3's sequence lifecycle. Synthetic reports test mapping and preservation, not live audit truth or model quality. The external Bloomlab gallery was unavailable; committed references and written corrections were inspected.

Next is the remaining P2C controlled journey/evidence acceptance: visible popups/new tabs/downloads/calendars/iframes/delays, hidden text and bounded contact/offer uncertainty. No live source connection, paid model, send or video work is needed for that local acceptance.
