# Same-commit rebuild of 0f9bd20, to clear the Cloudflare 500

Repo: `Beeyach/bloomtrack-pro`. Production: `https://leadsthatbloom.com`.

**Result: FAIL.** The rebuild did not clear it. The build turned out to be byte-for-byte deterministic, so the same source produced the same broken bundle and the same error, down to the identical chunk number.

No source was edited. No commit was made. No outbound state changed.

---

## Verdict

`SAME-COMMIT REBUILD DID NOT CLEAR THE CLOUDFLARE 500 — THE FAILURE REMAINS IN THE EDGE ADAPTER OUTPUT, SO THE NEXT STEP IS A NARROW NEXT-ON-PAGES VERSION FIX, NOT AN APP UI CHANGE.`

With one complication that Section 7 covers: **`@cloudflare/next-on-pages` cannot be bumped.** `1.13.16` is already both the newest version and the last one. The package is formally deprecated. So the "narrow version fix" has to go sideways or down, not up.

---

## 1. Deployment identity

| | |
|---|---|
| Original deployment | `da6c7625-a6f3-445d-9b53-f303c4e9e028`, created 2026-08-14T19:56:03Z |
| **New deployment** | **`c85812e7-9048-49ac-81e8-2dd226ad044c`**, created **2026-08-15T22:41:55Z** |
| Source commit, both | **`0f9bd20`** |
| Branch | `main` |
| Environment | production |
| Deployment URL | `https://c85812e7.bloomtrack-pro.pages.dev` |
| Stages | `queued=success initialize=success clone_repo=success build=success deploy=success` |
| Build duration | about 2 minutes 22 seconds |

**Production is confirmed on the new deployment**, not merely reported as such: the Pages API lists `c85812e7` as both `latest_deployment` and `canonical_deployment`, and it is the deployment carrying the `https://leadsthatbloom.com` alias. `da6c7625` now carries no alias.

## 2. Proof the source did not change

```
git rev-parse HEAD    0f9bd2066d5773f332cd72db9f6d3c98a80fe20d
git rev-parse --short 0f9bd20
git rev-parse --abbrev-ref HEAD    main
git diff HEAD --stat  (empty)
git status --short    ?? LTB-FINAL-AUTHENTICATED-PRODUCTION-UI-AND-GMAIL-HANDOFF-REPORT.md
                      ?? LTB-POST-DEPLOY-UI-AND-SEND-PATH-VERIFICATION.md
```

Only untracked report files. Zero tracked changes, zero new commits. The deployment was produced by re-running Cloudflare's own build against the same commit, through the Pages retry API, which is why no push was needed.

## 3. Build

Cloudflare's build configuration, read from the project:

| | |
|---|---|
| Build command | `npx @cloudflare/next-on-pages@1` |
| Output directory | `.vercel/output/static` |
| Root directory | repo root |
| Compatibility date / flags | `2025-05-01` / `["nodejs_compat"]` |
| D1 binding | `DB` |
| Production secrets | all 13 present and unchanged |

Resolved versions, from Cloudflare's build log for `c85812e7`:

```
npm@10.9.2, nodejs@22.16.0
⚡️ @cloudflare/next-on-pages CLI v.1.13.16
▲  Detected Next.js version: 15.4.11
⚡️ Build Summary (@cloudflare/next-on-pages v1.13.16)
   Middleware Functions (1), Edge Function Routes (65)
```

Build result: **success**, with warnings only. No error.

**Build-cache purge attempted and unavailable.** `DELETE /purge_build_cache` returned **405**. The rebuild therefore ran with whatever caching Cloudflare applies by default. Given the outcome in Section 5 this turned out not to matter, but it is recorded because it was not achieved as intended.

## 4. Authenticated `/` before and after

**Before the rebuild** (deployment `da6c7625`), 5 of 5 requests:

```
GET /          500   __next_error__
GET /?x=1      500   __next_error__
```

**After the rebuild** (deployment `c85812e7`), 7 consecutive requests in Ary's signed-in session, then 3 more:

```
GET /            500   len 7308   __next_error__
GET /?verify=1   500   len 7344   __next_error__
GET /?verify=2   500   len 7344   __next_error__
GET /?verify=3   500   len 7344   __next_error__
GET /?verify=4   500   len 7344   __next_error__
GET /?verify=5   500   len 7344   __next_error__
GET /?verify=6   500   len 7344   __next_error__
```

**0 of 10 returned 200.** Every response is the `<html id="__next_error__">` document. The required success condition was not met.

**Signed out, after the rebuild** — all correct, unchanged:

```
307  /           -> https://leadsthatbloom.com/gate
200  /gate       len 9162
200  /api/auth   len 23
```

## 5. The rebuild produced an identical artifact

This is the finding that explains the failure, and it was worth measuring rather than assuming.

Asset fingerprints served by each origin:

| Origin | webpack chunk | stylesheets |
|---|---|---|
| `leadsthatbloom.com` | `webpack-92231630c6205877.js` | `89d2e1512c474a8f.css`, `961b289d606e3871.css` |
| `c85812e7...pages.dev` (new) | `webpack-92231630c6205877.js` | same two |
| `da6c7625...pages.dev` (old) | `webpack-92231630c6205877.js` | same two |

**The new build is identical to the old one.** Same source plus same locked dependencies plus same builder produces the same bytes. The chunk split is deterministic, so the hope behind this task, that a rebuild would shuffle the chunks and dodge the defect, was not available. That is now settled rather than assumed.

## 6. Cloudflare logs on the new deployment

Tailed `c85812e7` live and drove three authenticated requests through it:

```
3 x "message": "async__chunk_82704 is not defined"
    url: https://leadsthatbloom.com/?newtail=0
    url: https://leadsthatbloom.com/?newtail=1
    url: https://leadsthatbloom.com/?newtail=2
    status: 500  (3 of 3)
```

| Question from the brief | Answer |
|---|---|
| Did the synthetic chunk identifier change? | **No.** Identical: `async__chunk_82704`. |
| Exact current exception | `ReferenceError: async__chunk_82704 is not defined`, at `fT (__next-on-pages-dist__/functions/index.func.js:920:70001)` |
| Does the failure remain inside `__next-on-pages-dist__`? | **Yes.** The entire stack is adapter output. No frame touches application code. |
| `@cloudflare/next-on-pages` version | **1.13.16** |
| Next.js version | **15.4.11** |

No other exception of any kind appeared. No new `async__chunk_*` failure. No other route 500s.

## 7. Attribution, corrected

My previous report said the 500 "began in the hour the deploy landed". True, but too coarse, and the minute-level data changes which deployment is responsible.

Cloudflare zone analytics, 500s on 2026-08-14 by minute:

```
2026-08-14T19:27:00Z   x6   /
```

Against the deployment timeline:

```
49b8ea3b  commit 2c47182  live 19:19:17Z   <- Chapters 8-11A merge
da6c7625  commit 0f9bd20  live 19:56:03Z   <- density + deferral pass
```

19:27Z sits **after** `49b8ea3b` and **before** `da6c7625`. So the 500 arrived with **commit `2c47182`, the Chapters 8 to 11A merge**, one deployment earlier than I attributed it. The density and deferral pass inherited it rather than caused it. There were no 500s at all before 19:27Z that day, and none on Aug 13.

**Dependencies were not the trigger.** `git diff 2c47182..0f9bd20 -- package.json package-lock.json` is empty, and the lockfile has not been touched since the editor work months earlier. Both builds resolved Next 15.4.11 and next-on-pages 1.13.16. So the change that crossed the adapter's chunking threshold was application source, specifically the size and shape of the client component tree after the UI reset.

**One lead investigated and ruled out.** The build log emits `[WARNING] Duplicate key "global-error" in object literal` three times, which looked like a plausible cause of a dangling chunk reference. It is not: `app/error.jsx` and `app/global-error.jsx` were both added in commit `e7e491b` and were already present at `2c47182^`, before the UI reset, so that warning predates the regression.

## 8. Authenticated smoke test on the new deployment

Read-only. No mutating action was clicked.

| Check | Result |
|---|---|
| Today renders | **Pass.** All five tabs with counts: Replies 24, Approvals 79, Follow-ups 35, Decisions 5, Exceptions 66. 14 row wrappers, 567 nodes. |
| Prospects, Clients, System, AI helpers, Settings | **Pass.** All reachable and rendering, as in the previous full walk. |
| No blank or error page | **Pass.** |
| No console errors | **Pass.** Zero errors, zero warnings. |
| No chunk or CSS failure | **Pass.** All nine chunks, both stylesheets, all three fonts: 200. |
| No read-route 500s | **Pass.** `/api/today`, `/api/prospects`, `/api/clients`, `/api/settings`, `/api/limits`, `/api/outreach`, `/api/leads`, `/api/pages`, `/api/auth`: all 200. |
| Skeleton-only first paint from document failure | **Still present.** This is the regression itself, unchanged. |

One `503` and one pending `/gate` were recorded during the few seconds the deployment swapped over. Both are the expected deploy-window blip and did not recur.

## 9. Package 23 and outbound safety

Read after the redeploy. `SELECT` only.

| Check | Value |
|---|---|
| Package 23 status | `APPROVED` |
| `sequence_approved` | `1` |
| `auto_followup_approved` / `_at` | **`0`** / `null` |
| Package 23 `updated_at` | `2026-08-14T05:22:42Z`, untouched |
| Prospect 3163 `emails_sent` | **`0`** |
| `send_events` total / newest | **10** / `2026-08-12T16:35:41Z` |
| `send_events` since the redeploy | **0** |
| Packages armed for auto-followup | **0** |
| Packages updated since the redeploy | **0** |
| Jobs created since the redeploy | **none, of any kind** |
| Send-shaped jobs since the redeploy | **0** |
| `autoSendApprovedFirstEmails` | **`false`**, last written 2026-08-11 |
| `autoSendApprovedFollowups` | **`false`**, last written 2026-08-11 |

**Outbound safety delta: zero.** Nothing sent, nothing armed, nothing queued, nothing approved. The redeploy caused no send activity of any kind.

## 10. Smallest next action

The brief anticipated "pin or bump next-on-pages". Bumping is not available:

- `@cloudflare/next-on-pages` **latest = 1.13.16**, which is already in use.
- It is **deprecated**: *"Please use the OpenNext adapter instead: https://opennext.js.org/cloudflare"*.
- Published 1.13.x line ends at .16. There is nowhere above to go.

So the remaining moves, cheapest first:

**A. Pin next-on-pages down one or two patches.** Change the build command to `npx @cloudflare/next-on-pages@1.13.15` (or `.14`) and the devDependency to match, then rebuild. One line, fully reversible, about five minutes to prove. It works only if the chunking logic differs between those patches, which is a coin flip, but it is by far the cheapest thing to try and it touches no app code.

**B. Move Next.js within 15.x.** The lockfile pins 15.4.11; the current 15.x is 15.5.23. A different Next version emits different chunk boundaries, which may land on the other side of the adapter's defect. Slightly larger blast radius than A because it is a real framework bump, but still no app code.

**C. Migrate to OpenNext (`@opennextjs/cloudflare`, currently 1.20.2).** The vendor's supported path and the only one that is not a workaround. It is a genuine migration with its own configuration and its own risks, and it should be planned rather than squeezed into a hotfix. Worth noting that you will end up here eventually regardless, because the current adapter is frozen.

**Not recommended: editing app code to dodge it.** Splitting the root page's client tree, for instance lazily importing the heavy panels, would very likely move the chunk boundary and clear the error. But it would be app surgery aimed at a bundler bug, it would undo some of the UI work, and it would leave the real defect in place. Per your brief I did not do it, and I would not.

**Also reasonable: do nothing for now.** The app works. The cost is a slower cold first paint and 500s in the logs. It touches nothing about sending, data or automation. If you want to start actually using LTB rather than fixing it, this is a legitimate thing to leave parked, as long as it is parked deliberately.

## Zero-change proof

```
Source SHA        0f9bd20  before and after; no commit created
git diff HEAD     empty
Source edits      none
Dependencies      unchanged; package.json and package-lock.json untouched
Deployments       one created, c85812e7, same commit, production
D1 statements     SELECT only
Buttons pressed   navigation only; nothing that sends, approves, defers or deletes
Credentials       none seen, typed or stored
Out of scope      package 23, email, approvals, AUTO_SEND_* switches, migrations,
                  scheduler, Gmail logic, branch merges, and the Gmail hand-off
                  change were all left untouched
```

---

## Final statement

`SAME-COMMIT REBUILD DID NOT CLEAR THE CLOUDFLARE 500 — THE FAILURE REMAINS IN THE EDGE ADAPTER OUTPUT, SO THE NEXT STEP IS A NARROW NEXT-ON-PAGES VERSION FIX, NOT AN APP UI CHANGE.`

The rebuild reproduced the artifact exactly, so the defect reproduced exactly: `async__chunk_82704 is not defined`, same identifier, same frame, inside `__next-on-pages-dist__`. Production now serves deployment `c85812e7` from the same commit `0f9bd20`, the authenticated UI renders correctly with zero console errors, and no outbound safety state changed. The version fix cannot be an upgrade, because `1.13.16` is the adapter's last release, so the options are pinning downward, moving Next.js within 15.x, or migrating to OpenNext.
