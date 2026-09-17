# Twelve branches, rehearsed

Rehearsal branch `rehearsal/parked-branches-2026-08-13` · base `main` (`7490524`) · **disposable, unpushed, nothing merged into main**

**Result: a proven order, and two real integration defects that pairwise analysis had missed.**

**0 merges into main. 0 pushes. 0 deploys. 0 migrations applied. 0 production writes. 0 credits. Every parked branch tip byte-identical to where it started.**

---

## Verified inventory

`main` is **`7490524`** — unmoved from the last known base.

Read from git, not from notes. All twelve are unmerged.

| # | Branch | Tip | Code commits | Files (non-doc) | Migration |
|---|---|---|---|---|---|
| 1 | `fix/closed-prospect-action-precedence` | `1c5f71f` | 1 | 7 | — |
| 2 | `ui/type-scale-cleanup` | `460f89e` | 1 | 60 | — |
| 3 | `fix/verify-site-refund-prospect-id` | `467556d` | 1 | 4 | — |
| 4 | `fix/credit-refund-actor` | `0b16de5` | 1 | 7 | — |
| 5 | `fix/credit-event-job-correlation` | `51c46b3` | 1 | 10 | **058** |
| 6 | `fix/credit-ledger-write-observability` | `c8ffda9` | 1 | 14 | **058** (inherited) |
| 7 | `fix/settings-500-console-noise` | `9428e5c` | 1 | 5 | — |
| 8 | `fix/non-settings-render-capability-semantics` | `ccc8579` | 1 | 8 | — |
| 9 | `fix/render-route-authorization-boundaries` | `fda0d0b` | 1 | 3 | — |
| 10 | `fix/screenshot-artifact-privacy-retention` | `9028899` | 1 | 6 | **059** |
| 11 | `cleanup/remove-dead-audit-video-precheck-route` | `bf7f04e` | 1 | 3 | — |
| **12** | ⚠️ **`ui/radius-cleanup`** | `5946a52` | 1 | 58 | — |

Each branch is one code commit plus one report-only commit.

> ⚠️ **The brief lists eleven; there are twelve.** `ui/radius-cleanup` is missing
> from it. It is real, unmerged, and it collides hard with `ui/type-scale-cleanup`
> — **267 conflict hunks across 50 files**, measured when it was built. It is
> excluded from this rehearsal for the same reason type-scale is, and its own
> report already carries the re-derive-rather-than-merge recommendation.

## Part 1 — the dependency graph, verified

### The credit chain is a stack, not four merges

Verified by ancestry, not assumed:

```
verify-site-refund-prospect-id ⊂ credit-refund-actor
                               ⊂ credit-event-job-correlation
                               ⊂ credit-ledger-write-observability
```

Each is **contained in** the next. **Merging `c8ffda9` alone brings all four.**
That is one merge, not four, and it removes three chances to get the order wrong.

### The render three are siblings, not a chain

`non-settings-render-capability-semantics`,
`render-route-authorization-boundaries` and
`cleanup/remove-dead-audit-video-precheck-route` are **three independent
branches off main** that all edit `app/api/audit-video/precheck/route.js`. The
"chain" is an ordering requirement, not an ancestry one.

### Every file overlap in the set

| Pair | Shared files |
|---|---|
| closed-prospect × type-scale | `cron/drain/route.js`, `ProspectsApp.jsx`, `missing-imports.test.mjs` |
| closed-prospect × credit-ledger | `cron/drain/route.js`, `missing-imports.test.mjs` |
| type-scale × credit-ledger | `cron/drain/route.js`, `SystemHealth.jsx`, `missing-imports.test.mjs` |
| type-scale × settings-500 | `SettingsView.jsx` |
| type-scale × render-capability | `RenderWatcher.jsx` |
| credit-ledger × precheck-cleanup | **`durable-hive.test.mjs`** ← the one that bit |
| settings-500 × render-capability | `_route-hooks.mjs` (byte-identical) |
| settings-500 × render-authorization | `_route-hooks.mjs` (byte-identical) |
| render-capability × render-authorization | `precheck/route.js`, `_route-hooks.mjs` |
| render-capability × screenshot-privacy | `visual-evidence/route.js` |
| render-capability × precheck-cleanup | `precheck/route.js` |
| render-authorization × precheck-cleanup | `precheck/route.js` |

## Part 2 — the rehearsed order

| Step | Branch | Result | Conflicts | Resolution |
|---|---|---|---|---|
| 1 | `fix/closed-prospect-action-precedence` | ✅ | 0 | — |
| 2 | `fix/credit-ledger-write-observability` | ✅ | 0 | brings the whole credit chain |
| 3 | `fix/settings-500-console-noise` | ✅ | 0 | — |
| 4 | `fix/non-settings-render-capability-semantics` | ✅ | 0 | — |
| 5 | `fix/render-route-authorization-boundaries` | ✅ | 0 | different hunk in the shared file |
| 6 | `cleanup/remove-dead-audit-video-precheck-route` | ⚠️ | **2** | see below |
| 7 | `fix/screenshot-artifact-privacy-retention` | ✅ | 0 | — |
| — | `ui/type-scale-cleanup` | rehearsed separately | **1 file** | `SettingsView.jsx` |
| — | `ui/radius-cleanup` | excluded | — | re-derive on top of type-scale |

### Step 6, conflict 1 — expected

`app/api/audit-video/precheck/route.js`, modify/delete. Both render branches
edited a file the cleanup removes. **Resolved as deletion**, which is the whole
point of that branch.

### Step 6, conflict 2 — ⚠️ not predicted

`tests/durable-hive.test.mjs`. The credit chain relaxed a regex in it (the
`runPrecheck` call is now spread over lines to carry `jobId`/`jobAttempt`); the
cleanup rewrote the same block. **Neither side survives alone:**

```
<<<<<<< HEAD  (credit chain)
  assert.match(runner, /runPrecheck\(db, \{[\s\S]{0,80}workspace: ws, …actor: 'human',/);
=======       (cleanup)
  assert.match(runner, /runPrecheck\(db, \{ workspace: ws, …actor: 'human' \}\)/);
  const precheck = code('../lib/precheck.mjs');   // + two new assertions
>>>>>>>
```

Resolved by **keeping both**: the relaxed pattern, plus the cleanup's new
assertions about `lib/precheck.mjs`.

## Parts 3 and 5 — what the combined tree exposed

The first full run on the merged code: **2,286 tests, 17 failing.** Every
failure merge-induced; none pre-existing. Three classes, and the third is a
genuine finding rather than a fixture nuisance.

### Class A — 14 tests read a file that no longer exists

Three separate branches wrote tests that open
`app/api/audit-video/precheck/route.js`. `ENOENT` once the cleanup lands.

Affected: `credit-job-correlation.test.mjs`, `render-capability-semantics.test.mjs`,
`render-route-authorization.test.mjs`.

### Class B — a stale single-line regex, second instance

`precheck-route-retired.test.mjs` carried its own copy of the single-line
`runPrecheck` pattern — the same one that conflicted in `durable-hive`. It goes
stale the moment the credit chain lands. **Two files, same defect, found only
because the whole set was merged at once.**

### Class C — the deploy-order hazard, reproducing itself in a test

> `precheck-route-retired.test.mjs` builds its ledger with migration **042
> only**. After the credit chain, `note()` writes `job_id`/`job_attempt`, the
> insert fails against the old schema, and `note()` swallows it — **zero credit
> events, silently.**

That is exactly the hazard the observability branch was written to expose,
reproducing itself inside a test fixture. It is the strongest possible
confirmation that the hazard is real and that migration 058 must precede the
code.

### ⚠️ Class D — two branches are mutually redundant

Not a test failure; a product finding that the failures pointed at.

> **`fix/render-route-authorization-boundaries`'s entire code deliverable is 16
> lines in `app/api/audit-video/precheck/route.js`** — the file
> `cleanup/remove-dead-audit-video-precheck-route` deletes.

Merge both and the net code change is **zero**: a gate is added, then the file
is removed. Its test file is left with no subject, which is why nine of its
tests could not be made to pass.

**Resolution taken in the rehearsal:** merge the cleanup, and keep only the
durable half of the authorization branch's tests — thumb stays member-usable,
the admin routes are unchanged, and *permission before money* still holds across
every surviving credit-spending route. The nine precheck-specific tests were
dropped along with the route.

### After the patch

| | |
|---|---|
| Tests | **2,277 passing, 0 failing** |
| `next build` | **clean** |
| Branches integrated | 10 of 12 |

**No parked branch was modified to achieve this.** Every fix lives on the
disposable rehearsal branch, and the list above is the patch the real merge will
need.

## Part 4 — migrations

| | |
|---|---|
| Numbering | 058, 059 — **no collision**, next free is 060 |
| Applied together on a fresh database | ✅ 042 → 054 → 058 → 059 |
| Duplicate columns | **none** |
| `credit_events.job_id` / `job_attempt` | present after 058 |
| `visual_artifacts.stored_deleted_at` | present after 059 |
| Independent of each other | **yes** — different tables, no ordering constraint between them |

**058 and 059 coexist cleanly.** Each must precede its own code, and neither
cares about the other.

## Part 6 — type-scale

Merged onto the ten-branch stack: **1 conflicted file**, `components/SettingsView.jsx`
— shared with the Settings branch.

**Classification: merge later, after browser review.** Green tests and a clean
build are not permission to ship it. The product order stands: operational UI
quick-wins first, then visual verification, then type-scale. `ui/radius-cleanup`
sits behind it and should be **re-derived** on top rather than merged.

## Part 7 — screenshot privacy rollout, validated

1. apply migration **059**
2. deploy the **app** — starts sending the authenticated screenshot fetch
3. deploy the **Worker** — starts requiring it
4. verify one visual-evidence run end to end
5. **only after canary acceptance**, wire the retention sweep into the drain

⚠️ Steps 2 and 3 are not interchangeable. The scheduler hook was **not** wired
here, and a test on that branch asserts it stays unwired.

## Part 8 — credit chain rollout, validated

1. merge `c8ffda9` (brings all four)
2. apply migration **058**
3. deploy code
4. verify healthy `credit_events` writes
5. verify no fresh `credit_ledger_failures` alarm

⚠️ Steps 2 and 3 are not interchangeable, and Class C above is the proof: with
the code ahead of the migration, the ledger goes silent rather than loud.

## Part 9 — the integration map

### Merge as soon as the canary is accepted
- `fix/closed-prospect-action-precedence`
- `fix/settings-500-console-noise`

### Merge with order
1. `fix/credit-ledger-write-observability` → **migration 058** → deploy
2. `fix/non-settings-render-capability-semantics`
3. `cleanup/remove-dead-audit-video-precheck-route` (resolve the two conflicts as above)
4. `fix/screenshot-artifact-privacy-retention` → **migration 059** → app → Worker

### Merge but defer activation
- `fix/screenshot-artifact-privacy-retention` — the retention sweep stays unwired
  until after canary acceptance

### Hold for visual review
- `ui/type-scale-cleanup`
- `ui/radius-cleanup` — behind type-scale, and re-derived rather than merged

### Reconsider before merging
- ⚠️ **`fix/render-route-authorization-boundaries`** — its only code change is on
  a file that is being deleted. Either drop it, or merge it before the cleanup
  purely to keep the history honest, and take only its durable tests. **This is
  Ary's call, not a mechanical one.**

### Do not merge yet
- Nothing. No branch carries an unresolved product defect.

## Part 10 — cleanup

| | |
|---|---|
| `main` | **`7490524`** — unchanged |
| All twelve parked tips | **byte-identical**, verified by SHA after the rehearsal |
| Pushes | **0** |
| Rehearsal branch | `rehearsal/parked-branches-2026-08-13` — **retained deliberately**, disposable and unpushed, because it holds the patch list the real merge needs. Delete it with `git branch -D` once that merge is done. |

`main` sits 1 commit ahead of `origin/main` — the acceptance report from the
previous task, deliberately unpushed so no deployment lands during the canary
window. Unrelated to this rehearsal.
