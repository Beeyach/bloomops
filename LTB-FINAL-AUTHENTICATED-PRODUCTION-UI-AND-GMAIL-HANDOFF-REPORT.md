# Final authenticated production walk + Gmail hand-off decision

Production: `https://leadsthatbloom.com`, serving commit **`0f9bd20`** (deployment `da6c7625`).
Walked signed in, in Ary's own Chrome session, on 2026-08-15 between 18:33Z and 18:50Z.

**Nothing was redeployed, mutated or written.** Every database statement is a `SELECT`. Every HTTP call is a `GET`. No button that sends, approves, defers, retries or deletes was pressed. The access code was never seen, typed or stored: the browser was already signed in.

---

## Verdict

**Authenticated UI: every screen renders correctly, and all six fixes are right on the live page.** I could not find a single rendering fault in Today, Prospects, Clients, System, AI helpers or Settings. Zero console errors across the whole walk.

**But the deployment carries a real production regression, and it is not a UI one.** Every authenticated request for the app document returns **HTTP 500**. The page you see is drawn entirely by the browser after that error. It is caused by the Cloudflare build adapter, not by your app code, and it began in the hour the deploy landed.

So: **UI PASS on rendering, FAIL on the brief's stated bar**, which requires "no runtime/network regressions". I am not issuing the acceptance line. Section 2 is the reason and Section 8 is the decision you actually have to make.

**Gmail hand-off: decided, option A.** Full statement in Section 7.

---

## 1. Authenticated screen checklist

Everything below was seen rendered on production, signed in.

### Today

| Check | Result |
|---|---|
| Header shows one short total only | **Pass.** "Morning, Ary" / "209 things waiting on you." Nothing else. |
| Replies count appears once | **Pass.** Only on the tab: `Replies 24`. |
| No repeated "Nothing has gone back yet." | **Pass.** 0 occurrences in the rendered page. |
| No "A conversation is open" in ordinary Replies rows | **Pass.** 0 occurrences. |
| Representative row height stays compact | **Pass. 68px**, measured, uniform. Wrapper 69px including its 1px rule. |
| Deferred row content aligned under the row text | **Pass, to the pixel.** Name left edge `718px`, deferral sentence left edge `718px`. |
| Only one divider around the deferral row | **Pass.** One `border-b` wrapper holds both children: the 68px row and the 70px resolver. Total 139px, one rule. |
| No duplicate explanation text | **Pass.** "clear for today" 0, "deliberately not a button" 0, "Not this offer" 0. |

All five tabs opened and rendered:

- **Replies** (24): rows, deferral resolvers, `Set a date` correctly outlined rather than filled.
- **Approvals** (79): legacy drafts, `Redo it` / `Put aside` / `Read it`.
- **Follow-ups** (35): grouped "Gone quiet 6" then "Due now (29)".
- **Decisions** (5): renders.
- **Exceptions** (66): grouped "Automation stopped 10", plain-English causes, raw detail behind a `System details` disclosure.

### Prospects

| Check | Result |
|---|---|
| Needs attention opens in List | **Pass.** List button carries the active `bg-rose-btn` class. |
| All opens in Table | **Pass.** Table active, `<table>` present, 500 rows rendered. |
| No blank or crashed state | **Pass.** |
| Help disclosure works | **Pass.** "How Prospects works" present and dismissible. |
| No empty Working lenses band | **Pass.** See the correction in Section 5. |

### Clients

Renders. It is an **empty state**, not a fault: "Onboarding checklists for everyone who signed." and an explanation of how a card gets created. No duplicated UI. On the very first visit it sat on skeletons for a few seconds while `/api/clients` answered, then filled in; a reload was instant.

### System

Four tabs, all rendering: **Overview**, **Issues**, **Automation**, **Usage**.

- Overview: "25 things could not finish / Nothing was sent by mistake and no prospect data was lost. The rest of the work carried on." Right now / Today's work / Hive.
- Issues: every failure in plain words, every raw provider error behind `Technical details`.
- Automation: covered in Section 6, and it independently confirms the send switches.
- Usage: budget and credits, technical detail collapsed.

**No raw provider error is visible by default anywhere.** No crashed or blank section.

### AI helpers

| Check | Result |
|---|---|
| Workflow strip renders | **Pass.** `1 Scout → YOU gather the leads → 2 Guard → 3 Honey → YOU send them → 4 Vet → 5 Waggle`. |
| Featured helper hierarchy renders | **Pass.** A `START HERE` card at the top, then one expanded helper per lane: Honey Bee for Scanner leads, Vet Bee for Prospects. |
| Compact helpers stay compact | **Pass.** Scout, Guard, Waggle, Pick, Echo, Buzz are all one-liners. |
| No crash | **Pass.** |
| No wall of finished cards | **Pass.** Two expanded cards on the whole page, which is the cap by design. |

### Settings

Eight sections render: Your offer, Lead scoring, Your voice, Email template, Pipeline, Sources, Preferences, Admin.

- **Appearance**: Light / Dark, both present.
- **Text size**: Compact / Comfortable / Large, with Compact labelled "The default. More on screen, body text at 15px, as small as it goes."
- Live values confirm it: `data-theme="light"`, no `data-textsize` attribute, `--fs-step: -1px`. Compact really is the default.

### Sidebar and More

| Check | Result |
|---|---|
| Primary nav is Today / Prospects / Clients / System | **Pass.** Exactly those four. |
| More starts collapsed | **Pass.** It had to be clicked to open. |
| Secondary groups render | **Pass.** AI helpers, Templates, Settings, Help, Stats, Trash. |
| Library and custom pages reachable | **Pass.** Your own page **"How this workspace works"** is listed and reachable. The Chapter 8 rail fix is holding. |

---

## 2. The regression: every page load returns HTTP 500

This is the one thing in this report that needs a decision.

### What happens

Signed in, every request for the app document returns **500**:

```
GET https://leadsthatbloom.com/        -> 500   (5 of 5 attempts)
GET https://leadsthatbloom.com/?x=1    -> 500
GET https://leadsthatbloom.com/gate    -> 200
GET https://leadsthatbloom.com/  (signed out) -> redirect, never renders
```

The body is Next.js's server-render error document, `<html id="__next_error__">`. Every API and every asset is fine: `/api/today`, `/api/prospects`, `/api/clients`, `/api/settings`, `/api/limits`, `/api/outreach`, `/api/leads`, `/api/pages`, `/api/auth`, all nine chunks, both stylesheets, all three fonts. All 200.

### Why you have not noticed

React's error boundary catches it, the browser boots the client bundle, and the app renders from scratch in the browser. It works. What you lose is the server-rendered first paint, which is why Clients showed grey skeletons for a few seconds on first visit. The console stays completely silent, so nothing surfaces to you.

### The cause

From Cloudflare's own live log for deployment `da6c7625`, identical on every request:

```
ReferenceError: async__chunk_82704 is not defined
    at fT (__next-on-pages-dist__/functions/index.func.js:920:70001)
    at ds (__next-on-pages-dist__/webpack/ce5aadd....js:42:2530)
    ...
```

`async__chunk_82704` is not a name in this repo. It is a synthetic identifier that `@cloudflare/next-on-pages` (v1.13.16) generates when it splits the app into chunks for the edge runtime. The whole stack is inside the adapter's own output, `__next-on-pages-dist__`, and never touches application code. The adapter emitted a reference to a chunk it then failed to define.

So the defect is in the build adapter. What our chapters contributed is size: Chapters 8 to 11A added a lot of components to a client tree that already had `ProspectsApp.jsx` in it, and this class of adapter failure is triggered by crossing a chunking threshold.

### It is definitely new, and it is definitely this deploy

Cloudflare's zone analytics, 500s by hour with the path:

```
Aug 14 (deploy day)      19:00Z   x6   /        <- deploys landed 19:17Z and 19:55Z
Aug 15 (today)           14:00Z   x1   /        <- your own use
Aug 15 (today)           18:00Z   x18  /        <- my probes for this report
```

On deploy day the only 500s of any kind, on any path, were on `/`, and they start in the deploy hour. Aug 13 had zero 500s. Daily totals: Aug 13 = 0, Aug 14 = 1, Aug 15 = 11.

The low counts are not evidence of it being intermittent, they are evidence that the app is a single-page app: one document load per session, then hash routing. It is 100% reproducible right now, 23 hours later.

### What it costs you

- Slower first paint on a cold load, and a skeleton flash.
- 500s accumulating in your Cloudflare logs, which will mask a genuine 500 later.
- Fragility. Today the client recovers. A future adapter or React change that does not recover this cleanly would leave you at an error page.

It does **not** touch sending, data, or automation. Nothing about it is urgent today.

### Recommended fix, not applied

A plain rebuild and redeploy of the same commit will very likely clear it, because the chunk split is not deterministic across builds. If it survives a rebuild, the fix is to pin or bump `@cloudflare/next-on-pages`.

Per your brief I have **not** redeployed, and I am not going to without you saying so. This is the "real production regression found, Ary separately approves the fix" case.

---

## 3. Console and network

- **Console errors across the entire authenticated walk: zero.** Not one error, not one warning. The only output is nine `[bloom] window.bloom ready` info lines, one per page boot.
- **No runtime `ReferenceError` in the browser.** The one `ReferenceError` in this report is server-side, in the adapter, described above.
- **No failed chunk or CSS asset.** Every `_next/static` request returned 200. No stale-asset mismatch.
- **No 500 from any read route.** Every `/api/*` call returned 200 while signed in, and 401 while signed out. The only 500 in the whole session is the app document itself.

---

## 4. Package 23 safety snapshot

Read fresh, `SELECT` only, after the walk.

| Field | Value |
|---|---|
| Status | `APPROVED` |
| `sequence_approved` / `sequence_max_step` | `1` / `2` |
| `emails_sent` (prospect 3163, AZ Therapy Quest LLC) | **`0`** |
| `auto_followup_approved` | **`0`** |
| `auto_followup_approved_at` / `auto_followup_revoked_at` | `null` / `null` |
| `updated_at` | `2026-08-14T05:22:42Z`, 14 hours before the deploy |
| `send_events` for package 23 or prospect 3163 | **none** |
| `do_not_contact` / `unsubscribed` | `0` / `0` |

Wider state, unchanged from the previous verification:

| Check | Result |
|---|---|
| `send_events` total | **10**, newest `2026-08-12T16:35:41Z` |
| Packages with `auto_followup_approved = 1` | **0**, across the whole table |
| `autoSendApprovedFirstEmails` (workspace `ary`) | **`false`** |
| `autoSendApprovedFollowups` (workspace `ary`) | **`false`** |
| `settings.engine` last written | `2026-08-11 15:47:15`, three days before the deploy |

Approved, unsent, unarmed. Exactly as expected. `Send now` was not pressed.

---

## 5. Two corrections to my own earlier claims

Both were caught by measuring rather than looking, and both are recorded here rather than quietly dropped.

**"Working lenses is an empty band."** Wrong. It looked empty in a screenshot. It is a `<details>` disclosure with `open = false` that contains **7 chips**. Closed text does not lay out, which is why the text read as blank. The Chapter 11 `lensesWorthShowing > 0` guard is working correctly. **No defect.**

**"Every Approvals row repeats the pill for its own tab."** Overstated. Every row on Approvals does carry an identical `An old draft is waiting` pill, and the Approvals tab is 100% legacy drafts, so the pill is true of every row in it. But it is not a rule violation: the row's kind is `draft` and the tab's kind is `approval`, so the Chapter 11 suppression rule (`kind === tabKind`) correctly does not fire, and the pill is saying something the tab name does not, which is that these are *old* drafts rather than fresh ones. It is a judgement call for you, not a bug. Left alone.

One genuine observation, not a regression and not from these chapters: **System → Issues lists 25 rows across only about 9 distinct businesses.** The same business appears three times, and each of those rows already says "3 attempts". Overview even states the rule out loud, "Counted per prospect, so a job that ran twice on one business is one website checked", which Issues does not follow. Worth a look some day; nothing to do now.

---

## 6. The UI confirms the send switches by itself

System → Automation, read live, independently of the database:

> **First emails** ✓ **Manual**
> Reviewing and approving a draft does not send it. The card then offers Send now, and that is the press that sends it.
>
> **Follow-ups** ◦ **Watching only**
> Follow-ups are worked out but not sent. You can see what would have gone, and what stopped it, without anything leaving.
>
> Anything that does send goes out 8am to 5pm, Monday to Friday (America/Los_Angeles) only, and never more than 20 a day, 5 an hour.

And the watched follow-up counters: **1 checked, 0 would have gone, 1 held back, 0 actually sent.**

Two independent sources, the database and the running UI, agree. This is the state you want.

---

## 7. Gmail hand-off inventory and decision

### Exact inventory, all three paths

| # | Where | Trigger | Status |
|---|---|---|---|
| 1 | `components/ExceptionQueue.jsx:325` — **"Open Gmail"** | only inside `r.draft` on the `legacy` bucket | **Legacy.** Pre-Strategy-V2 plain-text drafts. They are not outreach packages and cannot enter the approval/send path. Correct to keep. |
| 2 | `components/prospects/EmailSequenceModal.jsx:558` and `:622` — **"Compose in Gmail"** | any prospect with a recipient, on any unsent email in the sequence modal | **Current.** Opens a prefilled Gmail compose popup. |
| 3 | `components/LeadInbox.jsx:1355` — a `mailto:` on the address | any **lead** (raw scanner find) that has an email | **Current.** Leads are not in the package system, so no native send path exists for them. Correct to keep. |

The other `mailto:` hits under `lib/` (`contact-discovery`, `contact-job`, `extract-email`) are parsers reading addresses out of scraped HTML. Not hand-offs.

### The four questions about `EmailSequenceModal`

**Is Compose in Gmail necessary for any current workflow?**
No, but removing it today would leave a hole. Native `Send now` lives in `ApprovalQueue.jsx:426`, on the approval card. **The sequence modal has no native send at all** — only Compose in Gmail, Copy subject, and Copy body. So it is the only send-shaped action in that modal.

**Is it duplicating native package send?**
Yes, and precisely. On the email marked `Next to send` it composes the exact email the native path would send.

**Can it bypass approval and package semantics?**
**Yes, completely, and this is the serious part.** It is a plain `window.open` to a `mail.google.com` compose URL. No API call is made. So an email sent that way:

- writes **no `send_events` row**, so LTB believes nothing was sent
- leaves **`emails_sent` at its old value**, so follow-up timing is computed from wrong data
- skips **`lib/send-guard.mjs` entirely**: no do-not-contact check, no unsubscribe check, no 20-a-day or 5-an-hour cap, no 8am-to-5pm weekday window
- records no sequence step, so the package's idea of where it is in the sequence goes stale

Every guardrail you built lives on the native path. This button walks around all of them.

**Can it cause you to wonder which send path is canonical?**
Yes, and the styling actively argues the wrong way. On the `Next to send` email the button is given `btn-bloom`, your **primary filled** style (`EmailSequenceModal.jsx:618`). On exactly the email where native send is canonical, the hand-off is dressed as the main action.

### Decision

**A. Native-only recommended.**

`CURRENT OUTREACH SHOULD BE NATIVE-SEND-ONLY — KEEP OPEN GMAIL FOR LEGACY DRAFTS AND MAILTO FOR RAW LEADS, BUT REMOVE/DEMOTE COMPOSE IN GMAIL FROM MODERN PROSPECT OUTREACH.`

The intended product rule, stated once and not left ambiguous:

> Once a prospect is in the package/outreach workflow, LeadsThatBloom sends natively, through `Send now`. Gmail hand-off exists only for legacy drafts and for raw leads that have never entered the package system.

Recommended sequence when you want it done, in this order:

1. **Demote first, one line.** Drop `btn-bloom` from the `isNext` branch at `EmailSequenceModal.jsx:618` so Compose in Gmail is outlined like every other secondary in that row. This removes the "which one is canonical" question immediately at near-zero risk.
2. **Then add native `Send now` to the sequence modal**, reusing the `ApprovalQueue.jsx:155` call (`POST /api/outreach { action: 'send' }`), so the modal has a guarded path of its own.
3. **Then remove Compose in Gmail** from the modal. Not before step 2, or you take away the only send-shaped action it has.

Nothing in this section has been implemented. You have not approved native-only behaviour, so per the brief I did not touch it.

### LeadInbox mailto

**Keep.** New finds are not outreach packages, and forcing raw leads into the package system is a different and much larger decision. Untouched.

---

## 8. Does another code change need to happen?

Two things are open. They are not the same size.

**One real change is warranted: the 500.** It is a genuine production regression that this deploy introduced. The likely fix is a rebuild and redeploy of the same commit, `0f9bd20`, with no source edit at all. If the rebuild does not clear it, pinning or bumping `@cloudflare/next-on-pages` is next. It changes nothing you can see and nothing about sending. **It needs your explicit go-ahead, and it has not been done.**

**One is optional and can wait: the Compose in Gmail demotion.** One line, cosmetic, and it removes a real ambiguity about which send path is canonical. It can sit until you break the freeze.

**Everything else is finished.** The UI needs no further work. Every acceptance item in the brief that concerns rendering passed on the live, signed-in site.

---

## Zero-change proof

```
git log -1        0f9bd20  (unchanged; no commit made during this task)
git status        clean, apart from the two untracked report .md files
Deployments       22 production, unchanged; none created
D1 statements     SELECT only
HTTP              GET only
Buttons pressed   navigation and tabs only; nothing that sends, approves,
                  defers, retries or deletes
Credentials       none seen, typed or stored; the browser was already signed in
```

---

## Final statements

**Authenticated UI rendering: PASS.** Every major authenticated route renders, all six focus and density fixes are correct on the live page, row geometry is exact (68px rows, 718px alignment on both sides, one divider per row and resolver pair), and there are zero console errors and zero failed assets.

**Deployment: FAIL against the brief's bar**, which requires no runtime or network regressions. Every authenticated document request returns HTTP 500 from a `@cloudflare/next-on-pages` chunking defect that began in the deploy hour on 2026-08-14. The app recovers in the browser, so it is degraded rather than broken, but it is real and it is new. I am therefore not issuing the acceptance line.

**Gmail hand-off:**

`CURRENT OUTREACH SHOULD BE NATIVE-SEND-ONLY — KEEP OPEN GMAIL FOR LEGACY DRAFTS AND MAILTO FOR RAW LEADS, BUT REMOVE/DEMOTE COMPOSE IN GMAIL FROM MODERN PROSPECT OUTREACH.`

**Outbound safety: unchanged and correct.** Package 23 approved, unsent, unarmed. Both switches false, and confirmed twice over, in the database and on the Automation screen. No send event since 2026-08-12.
