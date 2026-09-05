# Live production UI verification report

Date: 2026-08-10  
Production: https://leadsthatbloom.com/#today  
Repository: Beeyach/bloomtrack-pro

## Production state before the fix

The authenticated Today page did not visibly contain **Ready for approval** or **No new outreach is ready right now.**

The only visible use of the word approval was inside the Old drafts description:

> Written before the new outreach flow. Redo one to use the new approval.

The live DOM contained the Today preview sections for replies, decisions, deferrals, stopped automation, and Old drafts. It contained no ApprovalQueue subtree.

The deployed page bundle was current and contained the intended strings and component code:

- `/_next/static/chunks/app/page-e4db268c87124e5c.js`
- `Ready for approval`
- `No new outreach is ready right now.`
- `/api/outreach`

No service worker controlled the page. This ruled out an old service worker, an old browser asset, and an older frontend deployment.

## Root cause

`ApprovalQueue` waits for `GET /api/outreach`. On any non-200 response it left its state as `null`, swallowed the error, and returned `null`. That removed the whole section from the DOM.

The endpoint failed when live packages existed because its joined SQL row did not satisfy its own safety boundary:

- `guardView()` required `reply_date`, but the query did not select it.
- `canProgressOutbound()` reads `last_contact_date`, but `GUARD_FIELDS` did not declare it and the query did not select it.
- `guardView()` therefore threw before the endpoint could return JSON.
- The frontend converted that server failure into a missing section.

Commit `8363adc` fixed the heading inside `ApprovalQueue`, but it did not fix the endpoint that had to supply the component's data.

## Changes

- `app/api/outreach/route.js`
  - Selects `reply_date` and `last_contact_date`.
- `lib/prospect-view.mjs`
  - Declares `last_contact_date` as a required safety field.
- `components/ApprovalQueue.jsx`
  - Keeps the section heading visible while loading.
  - Shows a friendly message if the endpoint fails.
  - No longer turns a runtime error into a missing section.
- Tests
  - Lock the SQL query to every field in `GUARD_FIELDS`.
  - Build a real guard view from the approval query row shape.
  - Assert that the visible heading exists before the endpoint resolves.

## Tests

Focused production-path tests:

- 11 passed
- 0 failed

Covered:

- loading state
- zero packages
- packages present
- one visible heading
- five-row preview and real total
- Old drafts exclusion
- dedicated approval page
- query and guard field contract
- both send defaults remain off

This was the focused production-path suite only. A full repository suite was not available in the scratch checkout, so this report does not claim that the full suite ran.

## Why the prior fix and tests missed it

Commit `8363adc` tested the component's zero-data render and put the heading above its normal data branches. It did not exercise a real joined `/api/outreach` row through `guardView()`, and it did not cover the component before the request resolved or after a non-200 response. The heading was correct in source, but the live route failed and the component's error path still removed the entire section.

## Live V2 smoke check before deployment

| Surface | Result |
|---|---|
| Today preview sections | Working, except the missing approval section described above |
| View all bucket page | Needs your reply loaded 9 of 9 |
| Breadcrumbs | Today / Needs your reply and Today / Old drafts both worked |
| Friendly automation errors | Friendly headline and detail visible, raw text remained under Technical details |
| Old drafts separation | Separate preview and separate page, showing 25 of 26 with Load 1 more |
| Hive scanner Stop button | AI Hive opened correctly. No scanner was active, so the conditional Stop button was not visible. No real scan was started for a smoke test |

## Send state

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | OFF |
| `AUTO_SEND_FOLLOWUPS` | OFF |

No send policy or Gmail code changed. The live Settings page continued to say: **Watching only. No follow-ups are being sent.**

## Commit and deployment

- Pull request: `#1`, **fix: restore live Ready for approval section**
- Squash merge commit: `6f994690121a77f7d2782589f873543ea6d04310`
- Production platform: Cloudflare Pages
- Previous production page bundle: `page-e4db268c87124e5c.js`
- Verified new production page bundle: `page-5579dcb1b3529a87.js`

The canonical authenticated page was then opened at `https://leadsthatbloom.com/#today` and reloaded after the new bundle appeared.

## Production state after deployment

I personally inspected both the live DOM and a screenshot of the authenticated production page.

The Today page visibly showed:

- **Ready for approval 2**
- A current-rule package for **Deborah, Center for True Health**
- Rating: **you rated 💚**
- Angle: **Booking is a request form, not a calendar**
- Evidence label: **strong evidence**
- Approval action: **Approve 1 email**
- A separately labeled **Stopped before writing (1)** item for Liv
- The safety copy: **Nothing has been sent, and approving does not send it.**

There were two total approval-section items, so a View all control was not expected. The five-row preview threshold was not exceeded.

Old drafts remained a separate section above Ready for approval. Its dedicated page still showed **25 of 26** and **Load 1 more**.

Post-deployment smoke results:

| Surface | Result |
|---|---|
| Ready for approval | Visible in the authenticated production screenshot and DOM, count 2 |
| Needs your reply page | Breadcrumb present, 9 of 9 rows loaded |
| Old drafts page | Breadcrumb present, 25 of 26 rows loaded, Load 1 more visible |
| Friendly automation errors | Friendly text visible, raw diagnostics remain behind Technical details |
| Hive scanner Stop button | Hive loaded. No scanner was active, so the conditional Stop button was not visible. No real scan was started |
| Gmail and follow-up safety | Gmail connected. Settings says Watching only. No follow-ups are being sent |

## V2 acceptance readiness

The live UI blocker is removed. A fresh end-to-end V2 acceptance test can now begin. This verification did not approve or send a real email, start a paid scanner run, or alter prospect state.

`READY FOR APPROVAL VERIFIED IN LIVE PRODUCTION — V2 ACCEPTANCE TEST CAN BEGIN`
