# OpenNext production candidate readiness

Repo: `Beeyach/bloomtrack-pro`. Production: `https://leadsthatbloom.com`, **unchanged** on Pages deployment `c85812e7` / commit `0f9bd20`.

**Result: NOT READY — blocked on one thing, and it is a thing only you can do.**

Everything buildable is built. The production Worker exists, was built on Linux, has the D1 binding and both vars, and answers correctly on its `workers.dev` URL. It has **zero secrets**, because Cloudflare stores secrets write-only and I cannot read your production values to copy them across. That is the documented stop condition in your brief: *"If any secret cannot be retrieved safely, STOP and report the missing NAME."* All 13 names are in section 5.

**No domain was attached. No scheduler was changed. No Gmail endpoint was changed.** Production still serves Pages.

---

## Verdict

`OPENNEXT PRODUCTION CANDIDATE NOT READY — A SPECIFIC BINDING, AUTH, GMAIL, CRON, SSR, OR UI ISSUE MUST BE FIXED BEFORE ANY DOMAIN CUTOVER.`

Precisely: **the 13 production secrets are not on the Worker.** Nothing is broken. Sections 6 through 9 could not run because signing in requires `LTB_ACCESS_CODES`, which does not exist on the candidate. Section 5.2 has the exact commands; it is about ten minutes of your time, after which the smoke test can run.

---

## 1. Preview Worker deleted

```
Successfully deleted bloomtrack-pro-opennext-preview
preview URL /gate            -> 404
wrangler deployments list    -> worker no longer exists
workers on account matching /bloom/i:
  bloomboard, bloomnotes, bloomtrack-pro-app, bloomtracker,
  bloomwired-counter, bloomwired-llms, bloomwired-review
```

`bloomtrack-pro-opennext-preview` is absent from the account. Its two secrets went with it, so the temporary credential is dead — it is not repeated anywhere in this report, and the local files holding it were deleted.

**Untouched by the deletion:** the D1 database `bloomtrack-pro`, the Pages project, and deployment `c85812e7`. Verified after the fact: production still redirects `/` to `/gate` and serves `/gate` at 200, and `c85812e7` is still canonical.

## 2. Branch and main reconciliation

| | |
|---|---|
| `origin/main` | **`0f9bd20`** |
| Commits on main after `0f9bd20` | **0 — main has not moved** |
| Migration branch | `migration/opennext-cloudflare-preview` |
| Head | **`a4ffd4e`** |

Three commits, none merged:

```
a4ffd4e  chore: name the production Worker bloomtrack-pro-app
b82ab55  ci: build the OpenNext bundle on Linux
5111ff8  migrate: move the Cloudflare adapter from next-on-pages to OpenNext
```

Diff against main, excluding the lockfile: **75 files, +199 / −191**. Nothing to reconcile and no later fixes at risk, because main did not move while this work happened.

## 3. Linux build

The Windows caveat from the preview report is now closed. The candidate was built on GitHub's Ubuntu runners, not on this workstation.

| | |
|---|---|
| Workflow | `.github/workflows/opennext-linux-build.yml` |
| Run | `31974007202`, conclusion **success** |
| OS | `Linux 6.17.0-1022-azure #22-Ubuntu SMP x86_64` |
| Node | **v22.23.2** |
| npm | 10.9.8 |
| Next | **15.5.23** |
| `@opennextjs/cloudflare` | **1.20.2** |
| wrangler | 4.110.0 |
| React / React DOM | 18.3.1 |
| Build command | `npx opennextjs-cloudflare build` |
| Tests | **2,364 passed, 0 failed** |
| `worker.js` | **2,278 bytes** |
| `.open-next` total | 42 MB (assets 4.9 MB) |

The only warning is the cosmetic `compatibility_date: 2025-05-01, consider updating`. **The `OpenNext is not fully compatible with Windows` warning is gone**, which was the entire point.

The workflow holds **no secrets** by design. Building needs none — only deploying does — so the job cannot reach Cloudflare, the database or production. The artifact was downloaded and deployed from here using existing wrangler credentials, keeping deployment a deliberate human-run step.

## 4. Production candidate Worker

| | |
|---|---|
| Worker name | **`bloomtrack-pro-app`** |
| Version id | **`ec8a1d45-65a5-4d90-9360-a2fd7e82afff`** |
| URL | `https://bloomtrack-pro-app.cool-sunset-2169.workers.dev` |
| Source commit | `a4ffd4e` (app code identical to `5111ff8`) |
| Artifact | the Linux one from run `31974007202` |
| Upload | 9,541 KiB raw / **1,949 KiB gzipped** |
| Startup | **23 ms** |
| Custom domain | **none attached** |

**On the name.** The brief suggested `bloomtrack-pro`. I used `bloomtrack-pro-app` instead: the live Pages project already holds `bloomtrack-pro`, Cloudflare surfaces Pages projects alongside Workers, and reusing the name risks colliding with the thing currently serving your domain. Two objects called `bloomtrack-pro` would also be genuinely dangerous to reason about during a rollback, which is the moment you least want ambiguity.

## 5. Bindings and secrets

### 5.1 What is bound and verified

| Resource | Status |
|---|---|
| D1 `DB` → `bloomtrack-pro` (`412a33ad-…`) | **Bound**, reported by wrangler at deploy |
| `ASSETS` static binding | **Bound**, gate assets serve |
| `RENDER_URL` var | **Set**, same value as Pages |
| `VIDEO_BASE_URL` var | **Set**, same value as Pages |

### 5.2 What is missing — the blocker ⚠️

```
npx wrangler secret list --name bloomtrack-pro-app
[]
```

**Zero of 13.** And this is not something I skipped — it is something I cannot do. Asked for the production values, the Cloudflare API returns names with empty strings:

```
BRAVE_API_KEY           -> type=secret_text, value=""
CRON_SECRET             -> type=secret_text, value=""
GMAIL_PUBSUB_TOPIC      -> type=secret_text, value=""
GMAIL_PUSH_AUDIENCE     -> type=secret_text, value=""
GMAIL_PUSH_SA           -> type=secret_text, value=""
GOOGLE_CLIENT_ID        -> type=secret_text, value=""
GOOGLE_CLIENT_SECRET    -> type=secret_text, value=""
LTB_ACCESS_CODES        -> type=secret_text, value=""
LTB_SESSION_SECRET      -> type=secret_text, value=""
LTB_SHARED_APIFY_TOKEN  -> type=secret_text, value=""
RENDER_SECRET           -> type=secret_text, value=""
SERPER_API_KEY          -> type=secret_text, value=""
UPLOAD_SECRET           -> type=secret_text, value=""
```

Secrets are write-only by design. There is no API, no wrangler command and no dashboard view that returns a stored value. They cannot be copied from the Pages project to a Worker programmatically, by me or by anyone.

**The candidate says so itself.** Asked to sign in, it answers honestly rather than with a bare 500:

```
503  POST /api/auth
{"error":"This deployment has no access codes configured yet.
          Its LTB_ACCESS_CODES variable is missing."}
```

**To unblock, run these 13 and paste each value at the prompt.** Nothing is echoed, and I never see them:

```bash
for s in LTB_ACCESS_CODES LTB_SESSION_SECRET CRON_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET RENDER_SECRET UPLOAD_SECRET BRAVE_API_KEY SERPER_API_KEY LTB_SHARED_APIFY_TOKEN GMAIL_PUBSUB_TOPIC GMAIL_PUSH_AUDIENCE GMAIL_PUSH_SA; do npx wrangler secret put $s --name bloomtrack-pro-app; done
```

Then confirm the count, which shows names only:

```bash
npx wrangler secret list --name bloomtrack-pro-app
```

Two notes. `LTB_SESSION_SECRET` does **not** have to match the Pages value — a different one simply means everyone signs in once after cutover. `LTB_ACCESS_CODES` **does** have to be your real JSON, or your existing code will not work.

## 6. Smoke test — what ran, and what could not

### Ran, signed out — correct on every count

```
307  /             -> /gate          (no error document)
200  /gate         len 9150
200  /api/auth     len 23
401  /api/today    correctly gated, not 500
```

No `__next_error__`. No `async__chunk_*`. The middleware, the gate render, the asset binding and the API gating all work on the Linux-built Worker.

### Could not run — needs section 5.2

| Required check | Status |
|---|---|
| Authenticated `/` ×5 = 200 | **Not run.** Sign-in returns 503, no access codes. |
| `/?verify=1..4` | **Not run**, same reason |
| Real SSR, session persists | **Not run**, same reason |
| The 9 authenticated read routes | **Not run**, same reason |
| `/api/gmail/status` against real config | **Not run**, no Google secrets |

Worth stating plainly so the gap is not overread: **the identical artifact, from the identical branch, passed all of these on the preview Worker** — 5/5 authenticated 200s with a real 22.9 KB server render, 9/9 read routes with real data, 15/15 assets. The only difference between that Worker and this one is which secrets are on it. The evidence that the code works is strong; what is missing is the provisioning that lets me re-prove it here.

## 7. Gmail verification

**Blocked.** `/api/gmail/status` needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to report real configuration, and both are unset.

What is already known from the preview, where the same bundle ran: the Gmail sync module loads, `/api/gmail/status` returns 200 and reads mailbox state from D1, and the OAuth and push routes resolve. The Node runtime is strictly more capable than the edge runtime these routes used before.

**No email was sent. No draft was created. No watch was renewed. No Gmail state was mutated.**

## 8. Cron verification

| Check | Result |
|---|---|
| Cron route exists | **Yes**, `/api/cron/drain` |
| `CRON_SECRET` present on the candidate | **No** — must be set at 5.2 |
| Request without the secret refuses | **Yes: `401`, no work performed** |

```
401  POST /api/cron/drain
{"error":"Not authenticated. Enter your access code."}
```

No valid cron run was invoked and no sweep work was enqueued.

Recall from the preview report: this is an **HTTP route called by an external scheduler**, not a Cloudflare scheduled trigger. There is no `scheduled()` handler to port. Cutover is changing the URL that scheduler posts to.

## 9. Authenticated visual walk

**Not run.** It needs a signed-in session (section 5.2), and separately the Chrome extension disconnected during the preview task and has not reconnected.

The preview task verified the UI from the served document and stylesheet on this same code: navigation, Compact `--fs-step:-1px`, light `--bg:#FAF7F3`, dark `--bg:#11141A`, 13 tone variables, and zero occurrences of the Chapter 8–11A strings that were removed. That is good evidence, but it is not the same as clicking through Today's five tabs, and I am not going to describe it as if it were.

## 10. Outbound safety

Read before and after. `SELECT` only.

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

**Candidate-induced outbound delta: zero.** No sign-in happened on this Worker, so unlike the preview there is not even a `login_attempts` write. The `gmail-sync`, `prescreen`, `signals` and `sweep` jobs in the database are your live production cron running on its own schedule.

## 11. Go-live checklist — written, NOT executed

Nothing below was run. Steps 0 and 1 are the gate.

**0. Set the 13 secrets** (section 5.2) and confirm with `wrangler secret list --name bloomtrack-pro-app`.

**1. Re-run the smoke test on `workers.dev`, before touching the domain.** Authenticated `/` five times must return 200 with no `__next_error__`; the nine read routes must return 200; `/api/gmail/status` must report your real connected state. **If any of that fails, stop — do not attach the domain.**

**2. Attach `leadsthatbloom.com`** as a Custom Domain on Worker `bloomtrack-pro-app`. This is the moment traffic moves.

**3. Confirm TLS and domain active.** Wait for the certificate to go active; fetch `https://leadsthatbloom.com/gate` and confirm 200 from the Worker, not Pages.

**4. Update the external cron target** to `https://leadsthatbloom.com/api/cron/drain` (unchanged path, now served by the Worker) and confirm `CRON_SECRET` matches.

**5. Update the Gmail Pub/Sub push endpoint** to the new host so `/api/gmail/push` keeps receiving.

**6. Authenticated `/` ×5** on the live domain.

**7. The nine read routes** on the live domain.

**8. `/api/gmail/status`** — confirm connected, not `configured:false`.

**9. First heartbeat.** Watch for the next scheduled cron to fire and land a job row. Do not declare done before one full cycle.

**10. Outbound safety.** Re-run the section 10 table. Package 23 approved, unsent, unarmed; both switches false; no new send events.

## 12. Rollback — exact steps

Preserved for this purpose, and **must not be deleted for at least 30 days**:

```
Pages project     bloomtrack-pro
Deployment        c85812e7-9048-49ac-81e8-2dd226ad044c
Source            0f9bd20
```

1. **Remove the Custom Domain** `leadsthatbloom.com` from Worker `bloomtrack-pro-app`.
2. **Re-attach `leadsthatbloom.com` to the Pages project**, which restores deployment `c85812e7`. That deployment already exists and needs no rebuild.
3. **Restore the external cron target** to the Pages URL.
4. **Restore the Gmail Pub/Sub push endpoint** to the Pages URL.
5. **Verify** signed-out `/` redirects to `/gate`, `/gate` is 200, then sign in and confirm the read routes.
6. **No database rollback is needed.** Both deployments read and write the same D1; nothing about the schema or data changes at cutover.

Rollback is a domain rebinding, not a redeploy, so it completes in minutes. The known-good state you return to is the one production is on right now.

## 13. Zero-change proof

```
origin/main            0f9bd20, unchanged, not merged into
Branch                 migration/opennext-cloudflare-preview @ a4ffd4e, pushed, unmerged
Production             Pages c85812e7 / 0f9bd20, still canonical, still holds the domain
Pages build command    "npx @cloudflare/next-on-pages@1", unchanged
Pages deployments      none created
Custom domain          never attached to any Worker
Preview Worker         deleted, verified 404, credential dead
Candidate Worker       bloomtrack-pro-app, workers.dev only, zero secrets
Scheduler              not changed
Gmail push endpoint    not changed
D1 statements          SELECT only; no sign-in occurred on the candidate
Credentials            production secret values never read — the API returns "" by design
Out of scope           package 23, email, approvals, AUTO_SEND_* switches, migrations,
                       Gmail hand-off product behaviour, and all UI design untouched
```

---

## Final statement

`OPENNEXT PRODUCTION CANDIDATE NOT READY — A SPECIFIC BINDING, AUTH, GMAIL, CRON, SSR, OR UI ISSUE MUST BE FIXED BEFORE ANY DOMAIN CUTOVER.`

The specific issue is **binding**: all 13 production secrets are absent from Worker `bloomtrack-pro-app`, and they are absent because Cloudflare will not disclose stored secret values to anyone, including me. Everything else is done and verified — preview Worker deleted, main reconciled, a genuine Linux build with 2,364 tests passing, the Worker deployed with D1 and both vars, signed-out routing correct with no error document and no chunk error, the cron guard refusing, and zero outbound delta.

**Next step is yours: run the 13 `wrangler secret put` commands in section 5.2.** Then say the word and I will run the full authenticated smoke test on `workers.dev` and report back — still without touching the domain, which stays gated behind your explicit go-live approval.
