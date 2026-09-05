# OpenNext production candidate — final verification

Repo: `Beeyach/bloomtrack-pro`. Production: `https://leadsthatbloom.com`, **unchanged** on Pages deployment `c85812e7` / commit `0f9bd20`.

> **Verification run twice.** This brief was issued a second time and the checks were re-run in full. The result did not change: still 0 of 13 secrets. Nothing in the first pass is withdrawn or corrected. The second pass added one new check — whether the secrets had landed on a different Worker by mistake — and its result is in section 1.1.

**Result: NOT READY. The precondition is not met.**

This task's stated precondition was *"Ary has manually set all 13 production Worker secrets"*, and the instruction on failure was *"If any name is missing, STOP."* **All 13 are missing.** Worker `bloomtrack-pro-app` has zero secrets, so sections 2 through 7 could not run: there is no way to sign in, and every check downstream of that depends on a session.

I stopped rather than working around it. No domain was attached, no scheduler changed, no Gmail endpoint changed, and no secret was created or replaced.

---

## Verdict

`OPENNEXT PRODUCTION CANDIDATE NOT READY — A SPECIFIC BINDING, AUTH, GMAIL, CRON, SSR, OR UI ISSUE MUST BE FIXED BEFORE ANY DOMAIN CUTOVER.`

**The exact blocker, and the only one: the 13 production secrets have not been set on `bloomtrack-pro-app`.**

Nothing else was found wrong. The Worker is deployed, healthy and correct on every surface reachable without a session. This is not a new problem, a regression, or a different problem from last time — it is the same unmet step, still unmet.

---

## 1. Secret-name parity — FAIL

Checked twice, by two independent paths, in case the first was a stale read or an expired token.

```
npx wrangler secret list --name bloomtrack-pro-app
[]

GET /accounts/{id}/workers/scripts/bloomtrack-pro-app/secrets
  status: 200 | success: true
  secret names: []
  count: 0 of 13 required
```

The Worker itself exists and is current (created `2026-08-16T21:40:46Z`), and the API call succeeded — it returned an empty list, rather than failing to answer. So this is a real reading of real state, not a tooling artifact.

| Required name | Present |
|---|---|
| `LTB_ACCESS_CODES` | **No** |
| `LTB_SESSION_SECRET` | **No** |
| `CRON_SECRET` | **No** |
| `GOOGLE_CLIENT_ID` | **No** |
| `GOOGLE_CLIENT_SECRET` | **No** |
| `RENDER_SECRET` | **No** |
| `UPLOAD_SECRET` | **No** |
| `BRAVE_API_KEY` | **No** |
| `SERPER_API_KEY` | **No** |
| `LTB_SHARED_APIFY_TOKEN` | **No** |
| `GMAIL_PUBSUB_TOPIC` | **No** |
| `GMAIL_PUSH_AUDIENCE` | **No** |
| `GMAIL_PUSH_SA` | **No** |

**0 / 13.** No value was printed, none was regenerated, and nothing was replaced.

## 1.1 Second pass: did the secrets land somewhere else?

Added on the re-run, because "you ran the commands but they went to the wrong place" is a much more useful answer than "still missing" — and it is the failure mode worth ruling out before saying nothing happened.

Every Worker on the account, with its secret count:

```
  bloomboard                     0 secrets
  bloomnotes                     0 secrets
  bloomtrack-pro-app             0 secrets      <-- the candidate
  bloomtracker                   3 secrets
  bloomwired-counter             0 secrets
  bloomwired-llms                0 secrets
  bloomwired-review              2 secrets      (includes a CRON_SECRET)
  loomtasks                      0 secrets
```

And the Pages project's preview environment:

```
Pages preview env keys: LTB_ACCESS_CODES, LTB_SESSION_SECRET, RENDER_URL, VIDEO_BASE_URL
```

**Nothing new landed anywhere.** The two Workers holding secrets, `bloomtracker` (3) and `bloomwired-review` (2), are unrelated projects and their secrets predate this work — `bloomwired-review`'s `CRON_SECRET` is its own, not this app's. The Pages preview keys are left over from the earlier `[env.preview]` work and also predate this.

So the conclusion is simple and not a misdiagnosis: **the 13 `wrangler secret put` commands have not been run yet.** No typo'd Worker name to fix, nothing to move.

### The runtime agrees

The deployment reports the same fact in its own words when asked to sign in:

```
503  POST /api/auth
{"error":"This deployment has no access codes configured yet.
          Its LTB_ACCESS_CODES variable is missing."}
```

### To unblock

Run these 13 and paste each value at the prompt. Nothing is echoed to the terminal and none of it reaches me:

```bash
for s in LTB_ACCESS_CODES LTB_SESSION_SECRET CRON_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET RENDER_SECRET UPLOAD_SECRET BRAVE_API_KEY SERPER_API_KEY LTB_SHARED_APIFY_TOKEN GMAIL_PUBSUB_TOPIC GMAIL_PUSH_AUDIENCE GMAIL_PUSH_SA; do npx wrangler secret put $s --name bloomtrack-pro-app; done
```

Then confirm — this prints names only, never values:

```bash
npx wrangler secret list --name bloomtrack-pro-app
```

You should see 13 entries. `LTB_ACCESS_CODES` must be your real JSON or your own code will not work; `LTB_SESSION_SECRET` can be anything, and a new one simply means signing in once after cutover.

## 2. Authenticated document test — NOT RUN

Blocked by section 1. Sign-in returns 503, so no session can be minted and `/` cannot be requested as an authenticated user.

| Required | Status |
|---|---|
| `/` ×5 = 200 | **Not run** |
| `/?verify=1..4` | **Not run** |
| Real SSR body | **Not run** |
| No `__next_error__` | **Not run** |
| No `async__chunk_*` | **Not run** |
| Session persists | **Not run** |

**Not a failure — an unrun test.** No authenticated request returned 500, because none could be made. The stop rule in the brief ("if any authenticated document request returns 500, STOP") was not triggered.

## 3. Read-route parity — NOT RUN

All ten routes require a session. `/api/gmail/status` returns `401 Not authenticated`, which is the gate doing its job.

Verified instead, without a session, that gating behaves correctly:

```
307  /             -> /gate     (no error document, no chunk error)
200  /gate         len 9150
200  /api/auth     len 23
401  /api/today    correctly gated, not 500
401  /api/gmail/status
```

The middleware, the gate render, the `ASSETS` binding and API gating all work on the Linux-built Worker. That is real signal about the deployment; it is not the read-route parity test, and is not offered as a substitute for it.

## 4. Gmail configuration — NOT RUN

Blocked twice over: `/api/gmail/status` needs a session (missing `LTB_ACCESS_CODES`) and needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to report real configuration. Neither exists.

**No email was sent. No draft was created. No watch was renewed. No Gmail state was touched. No Compose or Send control was activated.**

## 5. Cron configuration — PARTIAL PASS

| Check | Result |
|---|---|
| `/api/cron/drain` route exists | **Yes** |
| Request without a valid secret refuses | **Yes — `401`, no work performed** |
| `CRON_SECRET` present by name | **No** — part of section 1 |

No request carrying a valid cron secret was sent. No sweep work was enqueued.

## 6. Authenticated visual walk — NOT RUN

Blocked by section 1, and independently by tooling: the Chrome extension disconnected earlier in this session and has not reconnected, so a browser-driven walk is unavailable regardless of the session problem. Both would need to be resolved.

Nothing is claimed here about Today's tabs, Prospects defaults, System tabs, AI helpers, Settings, responsive behaviour at ~768px, dark mode, or console errors on this Worker. Those remain genuinely unverified on the production candidate.

What *is* known, from the earlier preview Worker running this identical bundle: the served document carried the correct navigation, and the stylesheet carried Compact `--fs-step:-1px`, light `--bg:#FAF7F3`, dark `--bg:#11141A`, 13 tone variables, and zero occurrences of the Chapter 8–11A strings that were removed. Good evidence about the code; not a substitute for the walk.

## 7. Worker logs — NOT RUN

There was no authenticated walk to tail. The unauthenticated requests above produced no server exception, no 500 and no `async__chunk_*`.

## 8. Outbound safety — PASS

Read after all checks. `SELECT` only.

| Check | Value |
|---|---|
| Package 23 status | `APPROVED` |
| `sequence_approved` | `1` |
| `auto_followup_approved` / `_at` | **`0`** / `null` |
| Package 23 `updated_at` | `2026-08-14T05:22:42Z`, untouched |
| Prospect 3163 `emails_sent` | **`0`** |
| Send events for package 23 | **none** |
| `send_events` total / newest | **10** / `2026-08-12T16:35:41Z` |
| New `send_events` | **0** |
| Packages armed | **0** |
| Packages updated | **0** |
| Send-shaped jobs | **0** |
| `autoSendApprovedFirstEmails` | **`false`** |
| `autoSendApprovedFollowups` | **`false`** |

**Candidate-induced outbound delta: zero.** No sign-in occurred on the candidate, so there is not even a `login_attempts` write.

Attribution, as the brief asked: the `gmail-sync` (61), `prepare-followup` (10), `prescreen` (8), `signals` (8), `verify-site` (8) and `sweep` (2) job rows are your **live production cron**, running on its own schedule against the Pages deployment. They accumulate continuously and predate this task's window. **None was caused by the candidate Worker**, which has no `CRON_SECRET` and therefore cannot run a cron pass at all.

## 9. Production is untouched

```
307  /            -> https://leadsthatbloom.com/gate
200  /gate
Pages canonical deployment   c85812e7-9048-49ac-81e8-2dd226ad044c
Pages production commit      0f9bd20
Custom domain on any Worker  none
Scheduler target             unchanged
Gmail Pub/Sub endpoint       unchanged
origin/main                  0f9bd20, unmerged
```

## 10. Go-live command sheet — not created

Section 10 of the brief conditions it on READY: *"If READY, prepare one final go-live command sheet."* The candidate is not ready, so `LTB-OPENNEXT-GO-LIVE-COMMAND-SHEET.md` was **not** created.

The full ordered go-live and rollback steps already exist and are current, in **`LTB-OPENNEXT-PRODUCTION-CANDIDATE-READINESS-REPORT.md`**, sections 11 and 12. Nothing about them has changed. They will become the command sheet once the candidate passes.

Rollback target, unchanged and to be preserved for at least 30 days:

```
Pages project  bloomtrack-pro
Deployment     c85812e7-9048-49ac-81e8-2dd226ad044c
Source         0f9bd20
```

## 11. What changed in this task

**Nothing.** No deployment, no secret, no config, no commit, no branch move. This task was a verification pass that hit its stop condition on the first check. Every statement above is from a `SELECT` or a `GET`.

---

## Final statement

`OPENNEXT PRODUCTION CANDIDATE NOT READY — A SPECIFIC BINDING, AUTH, GMAIL, CRON, SSR, OR UI ISSUE MUST BE FIXED BEFORE ANY DOMAIN CUTOVER.`

The specific issue is **binding**: `bloomtrack-pro-app` has **0 of 13** production secrets, verified twice by independent paths, and confirmed by the deployment's own 503. Everything testable without a session passed — signed-out routing, the gate render, API gating, the cron guard, static assets — with no error document, no chunk error and no server exception. Outbound safety is unchanged.

**One step stands between here and the full verification: the 13 `wrangler secret put` commands in section 1.** Run them, then say the word and I will complete sections 2 through 7 on `workers.dev` and issue the READY line if they pass. The domain stays untouched either way, gated behind your explicit go-live approval.
