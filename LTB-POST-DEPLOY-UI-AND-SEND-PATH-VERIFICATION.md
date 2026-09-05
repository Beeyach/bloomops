# Post-deploy verification — read only

Production: `https://leadsthatbloom.com`, serving commit **`0f9bd20`** (deployment `da6c7625`).
Deploy boundaries used throughout: **19:17:46Z** (Chapters 8–11A) and **19:55:55Z** (density + deferral pass), both 2026-08-14.

**Nothing was redeployed, mutated or written.** Every database statement below is a `SELECT`; every HTTP call is a `GET`. No branch moved, no build was pushed.

## Verdict

**Outbound safety: PASS, with evidence.** No send state changed, and nothing the deploy touched could have changed it.

**Production UI: PARTIAL.** I could verify the deployed artifact contains all six fixes, and that every unauthenticated surface is healthy. I could **not** log into production — I do not have your access code and would not use one — so the authenticated screens were not seen rendered. That single check is yours, and it is listed at the end.

**One correction to the brief's premise**, detailed below: the *string* "Open Gmail" is legacy-only, but Gmail hand-off is **not**. There are three paths, two of which are current by design.

---

## 1. Outbound safety state

### Package 23

| | |
|---|---|
| Status | `APPROVED` |
| `sequence_approved` / `sequence_max_step` | `1` / `2` |
| `auto_followup_approved` | **`0`** |
| `auto_followup_approved_at` | `null` |
| `auto_followup_revoked_at` | `null` |
| Last updated | **`2026-08-14T05:22:42Z`** — 14 hours *before* the first deploy |

Its prospect (`3163`, AZ Therapy Quest LLC): **`emails_sent = 0`**, `last_contact_date` null, `video_sent_at` null, not DNC, not unsubscribed.

Approved, unsent, unarmed — exactly as before, and provably untouched by the deploy.

### Global switches

`settings.engine` for workspace `ary`, last written **2026-08-11 15:47:15** (three days pre-deploy):

```
autoSendApprovedFirstEmails : false
autoSendApprovedFollowups   : false
```

Workspace `ellen` has no policy keys, so it falls through to `lib/send-policy.mjs`, where both default to `false`.

### Nothing sent, nothing armed, nothing queued

| Check | Result |
|---|---|
| `send_events` total | **10**, newest **2026-08-12T16:35:41Z** — two days before the deploy |
| `send_events` since 19:17Z | **none** |
| Packages with `auto_followup_approved = 1` | **0**, across the whole table |
| Auto-followup approvals since 19:17Z | **none** |
| `outreach_packages` updated since 19:17Z | **none** |
| `relationship_events` created since 19:17Z | **0** |

Jobs created since the deploy, by kind — every one is a read or a check, none is a send:

```
gmail-sync        48  done       prepare-followup  10  done
prescreen          8  done       signals            8  done
verify-site        8  failed     sweep              2  done
gmail-watch        1  done       vet                1  waiting
```

`verify-site` failing 8 times is pre-existing website-check noise (the kind Chapter 8 taught the UI to render in plain words), not deploy damage. `prepare-followup` writes drafts; it does not send.

**Conclusion: no outbound safety state changed.**

## 2. Native sending is intact

The current path is native and has real history behind it:

```
Send now  →  POST /api/outreach { action: 'send' }  →  lib/send-guard.mjs
          →  lib/send-runner.mjs  →  lib/gmail-send.mjs
          →  gmail.googleapis.com/gmail/v1/users/me/messages/send
```

Proof it has actually run in production — `send_events` rows carry real Gmail message ids:

| id | prospect | package | step | provider | message id | sent |
|---|---|---|---|---|---|---|
| 10 | 4860 | 19 | 1 | gmail | `19ff6d45ffa27f` | 2026-08-12T16:35:41Z |
| 9 | 6568 | 15 | 2 | gmail | `19ff25fe4d98d0` | 2026-08-11T19:49:58Z |
| 8 | 6568 | 15 | 1 | gmail | `19ff2204778682` | 2026-08-11T18:40:29Z |

Seven packages sit at status `SENT`. Sending works and has been used.

Worth noting for the record: `lib/gmail.mjs` — the **sync** client — is deliberately read-only and says so in its own header. Sending lives in the separate `lib/gmail-send.mjs`. Two clients, two scopes.

## 3. Gmail hand-off inventory — the premise needs correcting

The brief asked me to prove "Open Gmail" is legacy-only. The literal string is. The *behaviour* is not. There are **three** hand-off paths in shipped UI code:

| # | Where | Trigger | Legacy? |
|---|---|---|---|
| 1 | `ExceptionQueue.jsx:325` — **"Open Gmail"** | only inside `r.draft` on the `legacy` bucket ("An old draft is waiting") | **Yes** — pre-Strategy-V2 plain-text drafts, which are not outreach packages and cannot enter the approval/send path |
| 2 | `EmailSequenceModal.jsx:558` — **"Compose in Gmail"** | any prospect with a recipient, in the email-sequence modal | **No** — current, deliberate. Its own comment: "one click and she only presses Send. A plain link, no Gmail login or API." |
| 3 | `LeadInbox.jsx:1355` — a `mailto:` on the address | any **lead** (raw scanner find) that has an email | **No** — leads are not in the package system at all, so no native send path exists for them |

The other `mailto:` hits in `lib/` (`contact-discovery`, `contact-job`, `extract-email`) are **parsers** reading addresses out of scraped HTML. Not hand-offs.

So: if you saw "Open Gmail" on a row saying *An old draft is waiting*, that is legacy and it is contained. If you saw **"Compose in Gmail"** in the email-sequence modal, that is a current path that has simply never been replaced by native send — a real product decision still open, not a bug and not legacy.

## 4. The six fixes, in the deployed artifact

Production serves `0f9bd20`. I rebuilt that exact commit and inspected the output bundles:

| Fix | Check | Result |
|---|---|---|
| 1 — one total, not five figures | `" waiting on you."` in client chunks | **present** |
| 1 — all-clear line | `"clear for today"` occurrences | **exactly 1** (was 2) |
| 3 — repeated per-row sentence | `"Nothing has gone back yet"` in client **and** server bundles | **absent from both** |
| 4 — row/divider ownership | `divider` prop in client chunks | **present** |
| 5 — dev rationale on screen | `"deliberately not a button"` | **absent** |
| 5 — shortened deferral line | `"no date was recorded"` | **present** |
| — | `"A conversation is open"` kept at source (server bundle only, suppressed in Replies) | **present server-side, absent client-side** — correct |

And the live stylesheet on `leadsthatbloom.com` carries `--fs-step:-1px` (Compact default), the six `--tone-*` families, and `--bg:#FAF7F3`.

Fixes 2 and 6 are structural (no title/count on the Today panel; the outlined "Set a date") and were measured in the browser on this same commit before the merge: rows **68px uniform**, resolver text left **58px** = row name left **58px**, one divider per row/resolver pair.

## 5. Production health, unauthenticated

| Route | |
|---|---|
| `/` | 200 |
| `/gate` | 200 |
| `/api/auth` | 200 |
| `/api/today` | **401** (correctly gated, not 500) |
| `/api/prospects` | **401** (correctly gated, not 500) |

All nine gate chunks and both stylesheets return 200. No stale-asset mismatch: the CSS hash referenced by the served HTML is the one that answers. No 500s on any reachable route.

## 6. What I could not verify

**The authenticated screens.** Today's five tabs, the drawer, Prospects, Clients, System, AI helpers and Settings were not opened on production, because signing in needs your access code and I will not handle one. Everything above is the deployed artifact and the database, not the rendered page.

Two minutes, on production, would close it:

1. **Today → Replies** — no "Nothing has gone back yet." on any row; one count on the tab only
2. **A deferred row** — the block sits indented under the name, one divider, no "deliberately not a button"
3. **The header** — one line ("N things waiting on you."), no repeated figures
4. Click through **Prospects, Clients, System, More → AI helpers, Settings** — nothing blank or crashed
5. **Console** — no red

If those five are clean, this is a PASS.

## Zero-change proof

```
git log -1        0f9bd20  (unchanged; no commit made during this task)
git status        clean
Deployments       none created
D1 statements     SELECT only
HTTP              GET only
```

---

**PARTIAL — OUTBOUND SAFETY VERIFIED, UI VERIFIED AT THE ARTIFACT LEVEL.** No outbound safety state changed: package 23 is approved, unsent and unarmed; both global switches are false and predate the deploy; no send event, send job or auto-followup approval exists after it. The six fixes are present in the commit production serves, and every unauthenticated surface is healthy. The authenticated UI walk is the one item outstanding, and it needs your login rather than mine.

**One correction to carry forward: "Open Gmail" is legacy-only, but Gmail hand-off is not. "Compose in Gmail" in the email-sequence modal and the `mailto:` in New finds are both current paths with no native equivalent.**
