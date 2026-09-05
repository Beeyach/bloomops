# OpenNext Cloudflare preview migration

Repo: `Beeyach/bloomtrack-pro`. Production: `https://leadsthatbloom.com`, **unchanged** on Pages deployment `c85812e7` / commit `0f9bd20`.

**Result: PASS. The 500 is gone.**

Five of five authenticated requests to `/` return **HTTP 200 with a real 22.9 KB server render**. Production returns a 7.3 KB error document on every single one. `async__chunk_82704` does not appear anywhere: not in the response, not in the Worker logs, not once in 13 logged requests.

Production was not touched. Nothing was promoted, nothing merged, no custom domain attached.

---

## Verdict

`OPENNEXT PREVIEW PASS — THE APP SERVES AUTHENTICATED DOCUMENTS CLEANLY ON THE SUPPORTED CLOUDFLARE ADAPTER, CORE READ PATHS AND UI BEHAVIOR HOLD, BINDINGS HAVE PARITY, AND NO OUTBOUND SAFETY STATE CHANGED. A SEPARATE PRODUCTION CUTOVER CAN NOW BE APPROVED.`

Three caveats attach to that pass, all in section 12. The important one: **the preview Worker is publicly reachable and shares your production database.** Section 12.1 has the one-line command to delete it.

---

## 1. Branch and base

| | |
|---|---|
| Base | `0f9bd20`, the exact commit production serves |
| Branch | `migration/opennext-cloudflare-preview` |
| Commit | `5111ff8` |
| Merged? | **No.** Pushed only. `origin/main` is still `0f9bd20`. |

Recorded before editing: Next `15.4.11`, `@cloudflare/next-on-pages` `1.13.16`, wrangler `4.110.0`, React `18.3.1`, production deployment `c85812e7`, Pages build command `npx @cloudflare/next-on-pages@1`, compatibility date `2025-05-01`, flags `["nodejs_compat"]`, D1 binding `DB`, 13 production secrets by name.

## 2. Migration-risk inventory, taken before any edit

| Assumption in the code | Count | Risk | Outcome |
|---|---|---|---|
| `export const runtime = 'edge'` | **65** | **High.** OpenNext states plainly: *"The edge runtime is not supported yet."* Every one had to go. | Removed mechanically. Node runtime is a superset for this app's needs. |
| `getRequestContext` from `@cloudflare/next-on-pages` | **25 files** | Medium. Package disappears. | Swapped to `getCloudflareContext`. Identical `{env, cf, ctx}` shape, so call sites did not change otherwise. |
| `setupDevPlatform()` in `next.config.js` | 1 | Low, dev only | Replaced with `initOpenNextCloudflareForDev()`. |
| D1 binding `DB` | 1 | **High.** Everything reads through it. | Declared in `wrangler.jsonc`, verified live. |
| KV / R2 / Queues / service bindings | **0** | None | Nothing else to port. |
| Middleware | 1 | **High.** Gates the whole app. | Runs; the gate still redirects and still 401s the APIs. |
| Access code / session cookie | — | **High** | Sign-in mints a session, the cookie persists, `/` renders. |
| Gmail sync / send / OAuth / watch | 4 routes | Medium | All load on the Node runtime. Section 10. |
| Cron / sweep / watch renewal | 1 route | Medium | It is an HTTP route, not a Cloudflare trigger. Section 9. |
| Static assets, fonts, video artifacts | 101 files | Medium | Served via the `ASSETS` binding. 15/15 referenced assets return 200. |

## 3. Official requirements, and how each is met

Source: `opennext.js.org/cloudflare/get-started` and `/cloudflare/bindings`, read for this task rather than recalled.

| Requirement | Status |
|---|---|
| Install `@opennextjs/cloudflare` | **1.20.2** |
| Remove `@cloudflare/next-on-pages` | Uninstalled; zero references remain in source |
| Remove `export const runtime = "edge"` | All **65** removed |
| Replace `getRequestContext` with `getCloudflareContext` | 23 static imports, 1 dynamic import, 25 call sites |
| Replace `setupDevPlatform()` | `initOpenNextCloudflareForDev()` |
| `wrangler.jsonc` with `main`, `assets`, compat date ≥ `2024-09-23` | Created; date `2025-05-01`, flags `nodejs_compat` + `global_fetch_strictly_public` |
| `open-next.config.ts` | Created |
| Package scripts | `cf:build`, `cf:preview`, `cf:deploy`, `cf:typegen` |
| `.gitignore` gets `.open-next` | Added, plus `cloudflare-env.d.ts` |

`npx @opennextjs/cloudflare migrate` was **not** run. Every change above was made by hand or by a reviewable codemod, so each one could be inspected — which is what your brief asked for.

## 4. Versions chosen, and why

| Package | From | To | Reason |
|---|---|---|---|
| `next` | 15.4.11 | **15.5.23** | `@opennextjs/cloudflare@1.20.2` requires `next >=15.5.21 <16`. 15.5.23 is the newest 15.5.x and carries **no security advisory**. |
| `@opennextjs/cloudflare` | — | **1.20.2** | Current release, actively maintained, not deprecated. |
| `react` / `react-dom` | 18.3.1 | **18.3.1** | Next 15.5.23 accepts `^18.2.0`. No reason to move it, so it did not move. |
| `wrangler` | 4.110.0 | **4.110.0** | Already satisfies OpenNext's `^4.86.0`. |
| `@cloudflare/next-on-pages` | 1.13.16 | **removed** | Deprecated by its own maintainers. |

**This migration is a security fix as much as a build fix.** next-on-pages declares `next: ">=14.3.0 && <=15.5.2"`. Next **15.5.2 is deprecated for CVE-2025-66478**, and every patched 15.5.x (15.5.11 and up) sits above that ceiling. So the old adapter could not be paired with any patched Next 15.5. OpenNext requires `>=15.5.21`, which is patched by definition. Staying put is the option with a known CVE at the top of its supported range.

## 5. Diff summary

**75 files changed, 4,760 insertions, 4,481 deletions** — of which the lockfile is 8,913 lines of churn from swapping one adapter for another.

Excluding the lockfile:

```
 65 route/page files   removed one line each (the edge runtime declaration)
 25 files              getRequestContext -> getCloudflareContext
  1 next.config.js     setupDevPlatform -> initOpenNextCloudflareForDev
  1 package.json       adapter swap, Next pin, four cf:* scripts
  1 .gitignore         .open-next, cloudflare-env.d.ts
  + wrangler.jsonc     new (Worker config)
  + open-next.config.ts new (deliberately empty)
  - wrangler.toml      deleted (Pages-only; wrangler errors if both exist)
```

**Zero component changes. Zero query changes. Zero business logic.** Three stale comments that described the removed edge declaration were rewritten so they no longer describe something that is not there.

`open-next.config.ts` is empty on purpose. Every route in this app is `force-dynamic` and reads per-request state from D1, so there is no ISR output to store and nothing to revalidate. Wiring an R2 incremental cache would add a bucket, a binding and a failure mode in exchange for caching nothing.

## 6. Binding parity

| Pages binding / env | Worker equivalent | Verified |
|---|---|---|
| D1 `DB` | `d1_databases[0].binding = "DB"`, same database id | **Yes** — 9/9 read routes return real data |
| `RENDER_URL` (var) | `vars.RENDER_URL` | **Yes** — same value |
| `VIDEO_BASE_URL` (var) | `vars.VIDEO_BASE_URL` | **Yes** — same value |
| static assets | `assets` binding `ASSETS` | **Yes** — 15/15 referenced assets 200 |
| `LTB_ACCESS_CODES` (secret) | Worker secret | **Yes** — throwaway value, see 12.1 |
| `LTB_SESSION_SECRET` (secret) | Worker secret | **Yes** — throwaway value |
| `CRON_SECRET` | Worker secret | **Not set on preview.** Route correctly refuses. Cutover must set it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Worker secret | Not set. `/api/gmail/status` reports `configured:false` and does not crash. |
| `RENDER_SECRET`, `UPLOAD_SECRET`, `BRAVE_API_KEY`, `SERPER_API_KEY`, `LTB_SHARED_APIFY_TOKEN`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_AUDIENCE`, `GMAIL_PUSH_SA` | Worker secret | Not set on preview. Cutover must set all of them. |

**No required production capability is without an equivalent.** Every unset item is a secret I deliberately did not provision, not a missing feature. ⚠️ Note for cutover: **a Worker's secret store is separate from a Pages project's.** All 13 must be set again with `wrangler secret put`; they do not carry over.

## 7. Build and test

| Step | Result |
|---|---|
| `npm test` | **2,364 passed, 0 failed** |
| `next build` | Success. **65 dynamic routes**, identical to the Pages build's 65 edge routes. |
| OpenNext bundle | Success. `Worker saved in .open-next/worker.js` |
| Upload size | **9,495 KiB raw / 1,949 KiB gzipped** |
| Worker startup | **28 ms** |
| `.open-next` on disk | 39 MB (4.5 MB assets) |
| Unsupported features reported | **None** |

Two build warnings, both recorded rather than waved past:

```
WARN OpenNext is not fully compatible with Windows.
WARN For optimal performance, it is recommended to use WSL.
WARN workerd compatibility_date: 2025-05-01, consider updating to a more recent date
```

The Windows warning matters for cutover and is caveat 12.2. Worth noting anyway: **this build ran to completion on Windows, which next-on-pages never could** — it died at `spawn npx ENOENT` before doing any work.

## 8. Preview Worker and the decisive test

| | |
|---|---|
| Worker name | `bloomtrack-pro-opennext-preview` — deliberately **not** `bloomtrack-pro`, so it cannot collide with the live Pages project |
| URL | `https://bloomtrack-pro-opennext-preview.cool-sunset-2169.workers.dev` |
| Version id | `4aeddfed-80af-42bc-9c52-5080f25f4b05` |
| Custom domain | **None attached.** `leadsthatbloom.com` was never pointed at it. |
| Bindings | `DB` (D1), `ASSETS`, `RENDER_URL`, `VIDEO_BASE_URL` |

### Signed out — matches production exactly

```
307  /             -> /gate
200  /gate         len 9150
200  /api/auth     len 23
401  /api/today    correctly gated, not 500
```

### Authenticated — the test this whole thread has been trying to run

```
sign-in            : 200 {"ok":true,"role":"admin"}

200  /            len 22871   no-next-error  no-chunk-error  ssr-content
200  /?verify=1   len 22907   no-next-error  no-chunk-error  ssr-content
200  /?verify=2   len 22907   no-next-error  no-chunk-error  ssr-content
200  /?verify=3   len 22907   no-next-error  no-chunk-error  ssr-content
200  /?verify=4   len 22907   no-next-error  no-chunk-error  ssr-content

PASS 5/5
```

Against production, right now, on the same source:

| | Production (next-on-pages 1.13.16) | Preview (OpenNext 1.20.2) |
|---|---|---|
| Authenticated `/` | **500**, every time | **200**, every time |
| Body | 7,308 B `<html id="__next_error__">` | **22,871 B real server render** |
| `async__chunk_*` | present on every request | **absent** |
| Client recovery required | yes | **no** |
| Session persists | n/a | yes |

**Real server render, not a shell.** The 22.9 KB document contains the navigation, the wordmark and the theme boot script, produced server-side. Today's rows still arrive client-side by design, which is unchanged behaviour.

### Cloudflare Worker logs

Tailed live while driving the tests:

```
13 requests logged
13 "outcome": "ok"
13 "status": 200
 0 exceptions
 0 occurrences of async__chunk
```

## 9. Read-only smoke test

**9/9 read routes returned 200 with real data.** GET only.

```
200  /api/auth               55 B    keys: authenticated,role,workspace
200  /api/today           39,662 B   keys: summary,counts,total,totals,shown
200  /api/prospects     2,566,912 B  keys: prospects,stages,ratings
200  /api/clients          3,842 B   keys: clients
200  /api/settings         6,177 B   keys: settings
200  /api/limits             111 B   keys: limits,usage,isAdmin
200  /api/outreach        10,697 B   keys: items,counts,total,automation
200  /api/leads            1,679 B   keys: leads
200  /api/pages           17,994 B   keys: pages
```

`/api/today` returns the same shape production does: `{"needs-reply":11,"needs-decision":5,"automation-blocked":10,"legacy-draft":61}`.

**Assets:** 15/15 referenced JS, CSS and font files return 200.

**UI behaviour survived the adapter change.** Verified against the served document and stylesheet:

| Check | Result |
|---|---|
| Nav is Today / Prospects / Clients / System, plus More | **Present** |
| `--fs-step: -1px` (Compact default) | **Present** |
| `--bg: #FAF7F3` (light canonical) | **Present** |
| Dark `--bg: #11141A` | **Present** |
| Semantic tone families | **13 tone variables** |
| `"Nothing has gone back yet"` | **0** |
| `"A conversation is open"` | **0** |
| `"clear for today"` | **1** |
| `"Not this offer"` | **0** |
| `"deliberately not a button"` | **0** |

Every Chapter 8–11A fix is intact.

⚠️ The browser-driven visual walk (clicking Today's five tabs, the drawer, AI Hive) could **not** be run: the Chrome extension disconnected mid-task and did not recover. What is above is the served HTML, the stylesheet and the API payloads, which is stronger evidence for most of these checks than a screenshot but is not the same as seeing it. That walk is caveat 12.3.

## 10. Gmail compatibility

No email was sent. No send path was exercised.

| Capability | Status on the Worker |
|---|---|
| Gmail sync client (`lib/gmail.mjs`) | Module loads; `/api/gmail/status` returns **200** and reads mailbox state from D1 |
| Gmail send client (`lib/gmail-send.mjs`) | Loads in the same bundle; **not invoked** |
| OAuth routes (`connect`, `callback`) | Present and routable |
| Watch / push webhook (`/api/gmail/push`) | Present and routable |
| Token access | Reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from `env`, same as before |

`/api/gmail/status` reports `configured:false` on the preview purely because I did not put the Google secrets on it. The route runs, reads the database and answers correctly — which is what needed proving.

Worth stating plainly: the Node runtime is **more** capable than the edge runtime these routes ran on before, not less. Nothing about Gmail gets harder here. Current send behaviour is untouched by this branch.

## 11. Scheduler and background work

The inventory turned up something that makes this much simpler than expected.

**There are no Cloudflare scheduled triggers.** `wrangler.toml` had no `[triggers]`/`crons` section. The daily wake, sweep, Gmail sync and watch renewal are all driven by an **external scheduler making an HTTP request** to `/api/cron/drain` with an `x-cron-secret` header checked against the `CRON_SECRET` secret.

So the scheduler migration is one line of config in whatever calls it:

```
change the URL it posts to, and set CRON_SECRET on the Worker
```

No Worker `scheduled()` handler is needed. No new trigger was enabled in this task.

Verified on the preview, which has no `CRON_SECRET`:

```
401  POST /api/cron/drain   {"error":"Not authenticated. Enter your access code."}
```

The guard refuses and does no work.

## 12. Caveats attached to this pass

### 12.1 The preview Worker is live, public, and shares your production database ⚠️

It is reachable at a `workers.dev` URL and reads the real `bloomtrack-pro` D1. It is gated by an access code **I generated for this test** — your production access code was never read, used or stored, because Cloudflare secrets are write-only and I would not have used yours anyway.

That code is a live credential to your real prospect data until the Worker is gone. **Delete it when you are done looking:**

```bash
npx wrangler delete --name bloomtrack-pro-opennext-preview
```

That removes the Worker, its URL and both secrets. It touches nothing else — not the database, not the Pages project, not production.

### 12.2 This Worker was built on Windows ⚠️

OpenNext prints `not fully compatible with Windows` and recommends WSL. The build completed and the deployment behaves correctly across every test above, but **the production cutover build must run on Linux** — Cloudflare's own builder or CI — not from this machine.

### 12.3 The browser-driven visual walk did not happen

Covered in section 9. The Chrome extension dropped and did not come back.

## 13. Package 23 and outbound safety

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
| Prospects updated since the preview deployed | **0** |

**Outbound delta: zero.**

Full disclosure on writes: signing in to the preview performs one write, `DELETE FROM login_attempts WHERE ip = ?` for my own IP, which is what signing in does on any deployment. `login_attempts` is back to **0 rows**. No prospect, package, send or settings row was written. The `gmail-sync`, `prescreen`, `signals` and `sweep` jobs visible in the database are your **live production cron** running normally on its own schedule; none were caused by the preview.

## 14. Production cutover plan — written, NOT executed

Nothing below was run.

**0. Backup reference.** Current good state to return to: Pages project `bloomtrack-pro`, deployment **`c85812e7-9048-49ac-81e8-2dd226ad044c`**, commit `0f9bd20`, holding the `leadsthatbloom.com` alias. Keep this id written down; step 9 needs it.

**1. Build on Linux.** Merge `migration/opennext-cloudflare-preview` to `main`, and build with Cloudflare Workers Builds or CI. Do not deploy a Windows-built artifact (12.2).

**2. Create the production Worker.** A **new** name, e.g. `bloomtrack-pro`, distinct from the preview. Same `wrangler.jsonc`, same D1 binding.

**3. Secrets.** Set all 13 with `npx wrangler secret put NAME` against the production Worker: `LTB_ACCESS_CODES` (your real one), `LTB_SESSION_SECRET`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RENDER_SECRET`, `UPLOAD_SECRET`, `BRAVE_API_KEY`, `SERPER_API_KEY`, `LTB_SHARED_APIFY_TOKEN`, `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUSH_AUDIENCE`, `GMAIL_PUSH_SA`. **A Worker's secret store is not the Pages one; nothing carries over.** Verify with `wrangler secret list` before step 4.

**4. Smoke the Worker on its `workers.dev` URL first**, exactly as section 8 did, while `leadsthatbloom.com` still points at Pages. Confirm 5/5 authenticated 200s and 9/9 read routes.

**5. Custom domain cutover.** Only after step 4 passes: add `leadsthatbloom.com` as a Custom Domain on the Worker. This is the moment traffic moves. Expect a brief DNS/cert settle.

**6. Scheduler cutover.** Point the external cron at the new host and confirm `CRON_SECRET` is set. Watch for the first heartbeat.

**7. Gmail webhook.** Update the Pub/Sub push endpoint to the new host so `/api/gmail/push` keeps receiving. Re-check `/api/gmail/status`.

**8. Post-cutover smoke.** Authenticated `/` ×5, the nine read routes, assets, and Today/Prospects/Clients/System/AI helpers/Settings by eye.

**9. Outbound safety check.** Re-run the section 13 table. Package 23 must still be approved, unsent, unarmed; both switches false; no new send events.

**10. Rollback — how `leadsthatbloom.com` returns to Pages.** Remove the Custom Domain from the Worker, then re-attach `leadsthatbloom.com` to the Pages project, which restores deployment `c85812e7` (commit `0f9bd20`). That deployment already exists and does not need rebuilding. Point the external cron and the Gmail push endpoint back. Rollback is a DNS/domain-binding change, not a redeploy, so it is fast. **Keep the Pages project and `c85812e7` for at least 30 days** after cutover; do not delete either until the Worker has run a full week including a weekend cron cycle.

**Also delete the preview Worker (12.1) once cutover is done or abandoned.**

## 15. Zero-change proof

```
origin/main           0f9bd20, unchanged, not merged into
Branch                migration/opennext-cloudflare-preview @ 5111ff8, pushed, unmerged
Production            Pages c85812e7 / 0f9bd20, still canonical, still holds the domain
Pages build command   "npx @cloudflare/next-on-pages@1", unchanged
Production deploys    none created
Custom domain         never attached to any Worker
D1 statements         SELECT only, except the login_attempts row signing in clears
Buttons/actions       no send, approve, defer, retry or delete
Credentials           production access code never read, used or stored
Out of scope          package 23, email, approvals, AUTO_SEND_* switches, migrations,
                      Gmail hand-off product behaviour, and all UI design untouched
```

---

## Final statement

`OPENNEXT PREVIEW PASS — THE APP SERVES AUTHENTICATED DOCUMENTS CLEANLY ON THE SUPPORTED CLOUDFLARE ADAPTER, CORE READ PATHS AND UI BEHAVIOR HOLD, BINDINGS HAVE PARITY, AND NO OUTBOUND SAFETY STATE CHANGED. A SEPARATE PRODUCTION CUTOVER CAN NOW BE APPROVED.`

**Production recommendation: migrate.** The evidence is not marginal. The 500 that survived a deterministic rebuild and could not be fixed by any available adapter version disappears completely on OpenNext, replaced by a real server render, with 2,364 tests passing, 65-route parity, binding parity, zero Worker exceptions and no outbound state change. It also moves Next off an adapter ceiling whose top supported version carries CVE-2025-66478.

Two things gate the cutover, and neither is a blocker: build it on Linux, and set the 13 secrets on the Worker before pointing the domain. The rollback is a domain rebinding to a deployment that already exists.

**Before anything else, delete the preview Worker when you have finished looking at it (12.1).**
