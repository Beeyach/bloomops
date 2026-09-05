# AI cost model

What the AI in Leads That Bloom actually costs, measured rather than assumed.

Every number in the first two tables was produced by building the app's real
prompts with realistic fixtures and counting them. Nothing here is an estimate
copied from a blog post. The dollar rates are Anthropic list prices.

Rerun the measurement with the script pattern in
`lib/ai-cost.mjs` + `tests/ai-cost.test.mjs`; the live numbers come from
`GET /api/ai-usage` once there is real traffic.

---

## The finding that mattered most

`callAI` in `app/api/ai/route.js` read the `usage` block off every Anthropic
response and threw it away. So:

- no task's cost was known,
- no credit price had ever been checked against a real invoice,
- and the prompt-cache markers could not be verified to do anything.

Credit prices came from a comment in `lib/credits.mjs`: *"work out what it
actually costs, multiply by a thousand."* Nobody had done the first half.

Fixed: `ai_usage` table + `lib/ai-cost.mjs` + `GET /api/ai-usage`.

---

## Measured prompt sizes

Tokens, at ~3.7 chars/token. "System" is the part marked for caching.

| Task | System | User | Total in | Max out | System share |
|---|---:|---:|---:|---:|---:|
| best5 | 601 | 2407 | 3008 | 4000 | 20% |
| content-scripts | 706 | 518 | 1224 | 5000 | 58% |
| objections | 191 | 580 | 771 | 3000 | 25% |
| reply-coach | 606 | 103 | 709 | 1500 | 85% |
| proposal | 481 | 93 | 574 | 3000 | 84% |
| voice-note | 274 | 122 | 396 | 900 | 69% |
| call-prep | 238 | 86 | 324 | 2500 | 73% |
| score | 160 | 92 | 252 | 900 | 63% |

**Input is tiny. Output dominates cost.** Output bills at 5x input, and every
task's output cap is larger than its whole prompt. That single fact reorders
every optimisation below.

---

## Prompt caching does nothing here, and never did

Anthropic silently skips caching for prefixes below roughly **1024 tokens**
(Sonnet-class). The app's largest system prefix is **706 tokens**.

So the `cache_control: { type: 'ephemeral' }` marker on every call has been a
no-op since it was added, and the comment above `callAI` claiming Anthropic
"bills it once at full price and ~10% on every later call" has never been true
for this app.

The marker is left in place — it is harmless and correct if prompts grow past
the floor — but the comment is corrected and `cacheReadTokens` is now reported
by `/api/ai-usage`. If that stays at 0 after real use, caching is confirmed
dead rather than assumed alive.

**Do not chase caching here.** Padding a prompt to 1024 tokens to trigger a
cache costs more than it saves at these sizes.

---

## Cost per call, at list price

Output assumed to land at 40% of its cap.

| Task | Sonnet 5 | Haiku 4.5 | Saving by routing |
|---|---:|---:|---:|
| score | $0.00616 | $0.00205 | 67% |
| voice-note | $0.00659 | $0.00220 | 67% |
| reply-coach | $0.01113 | $0.00371 | — (stays) |
| call-prep | $0.01597 | $0.00532 | — (stays) |
| proposal | $0.01972 | $0.00657 | — (stays) |
| objections | $0.02031 | $0.00677 | — (stays) |
| best5 | $0.03302 | $0.01101 | — (stays) |
| content-scripts | $0.03367 | $0.01122 | — (stays) |

Model rates used: Opus 5 $5/$25, Sonnet 5 $3/$15, Haiku 4.5 $1/$5 per 1M
tokens in/out.

---

## Task routing (implemented)

`lib/ai-cost.mjs` → `TASK_TIER` + `modelForTask()`.

| Tier | Tasks | Model | Why |
|---|---|---|---|
| cheap | `voice-note`, `score`, `phrases` | Haiku 4.5 | The answer is already in the input. Extraction against a fixed schema, or classification with the rubric supplied. No judgement, no writing. |
| standard | `draft`, `reply-coach`, `call-prep`, `proposal`, `content-scripts` | configured (Sonnet) | Writing in Ary's voice, or reasoning about one prospect. Quality is the product. |
| deep | `analyze`, `best5`, `objections` | configured (Sonnet) | Has to hold the whole table or every logged reply at once. A worse answer costs more than the money saved. |

The configured model is a **ceiling, not a target**: a workspace on Haiku is
never silently upgraded, and a non-Anthropic model id is left alone.

`score` is the highest-volume task in the app (it runs per lead, in sweeps of
tens). Moving it to Haiku is where most of the real saving lands.

---

## Margin against current credit prices

At 1 credit = $0.001, which is the rate `lib/credits.mjs` was written against.

| Task | Credits | Charged | Real (Sonnet) | Margin | Verdict |
|---|---:|---:|---:|---:|---|
| score | 5 | $0.0050 | $0.00616 | **0.8x** | sold at a loss |
| call-prep | 20 | $0.0200 | $0.01597 | 1.3x | thin |
| proposal | 25 | $0.0250 | $0.01972 | 1.3x | thin |
| voice-note | 10 | $0.0100 | $0.00659 | 1.5x | thin |
| reply-coach | 20 | $0.0200 | $0.01113 | 1.8x | ok |
| best5 | 60 | $0.0600 | $0.03302 | 1.8x | ok |
| objections | 50 | $0.0500 | $0.02031 | 2.5x | ok |
| content-scripts | 150 | $0.1500 | $0.03367 | 4.5x | overpriced |

This is not an economy, it is eight unrelated guesses. `score` loses money on
every call; `content-scripts` charges 4.5x cost.

### Recommended prices

Target ~3x on AI-only tasks (covers retries, failed runs, and the free tier of
everything else). **Not applied in this pass** — repricing is a decision about
what Ary charges Ellen, not a bug fix.

| Task | Now | Recommended | Basis |
|---|---:|---:|---|
| score | 5 | 6 | $0.00205 on Haiku after routing → 3x |
| voice-note | 10 | 7 | $0.00220 on Haiku after routing → 3x |
| phrases | 15 | 8 | now Haiku |
| reply-coach | 20 | 33 | $0.01113 → 3x |
| call-prep | 20 | 48 | $0.01597 → 3x |
| proposal | 25 | 59 | $0.01972 → 3x |
| objections | 50 | 61 | $0.02031 → 3x |
| best5 | 60 | 99 | $0.03302 → 3x |
| content-scripts | 150 | 101 | $0.03367 → 3x |

Two of these go **down**. That matters: a credit economy nobody can predict is
worse than an expensive one.

### The non-AI prices are the big ones and were not measured here

| Action | Credits | Real cost driver |
|---|---:|---|
| scan | 100 + 4/result | Apify. Google Maps actors run about **$2.10–$5.00 per 1,000 places** depending on plan tier, plus per-filter surcharges. 50 results ≈ $0.10–$0.25 → 300 credits ($0.30). Roughly 1.2–3x. Closest to honest of anything in the list. |
| precheck | 20 | Cloud Run browser, ~1 min. Now **cached for 14 days**, so a repeat sweep costs 0. |
| video | 200 | Cloud Run + ffmpeg + ElevenLabs. Not measured. **This needs its own pass** — it is the most expensive action in the app and the least understood. |

---

## Batch API

Anthropic's Message Batches are **50% off input and output**, and that stacks
with cache discounts. Results usually return within the hour.

Candidates, in order of value:

1. **`score` sweeps** — Guard Bee scores every new lead. Nobody watches an
   individual result. Batch + Haiku would put this at roughly a quarter of
   today's cost. *Best candidate by far.*
2. **Nightly re-precheck** of prospects whose `site_intel` has gone stale.
3. **`analyze`** if it ever becomes a scheduled weekly report rather than a
   button.

Not candidates: everything in the drawer. `reply-coach`, `call-prep`,
`voice-note` and `proposal` all have a human waiting.

**Not implemented in this pass.** Batching changes the shape of the Guard Bee
UI (submit → come back later), which is a product decision, not a refactor.

---

## Waste found

| Waste | Status |
|---|---|
| Every task on the strongest configured model | **Fixed** — `modelForTask` |
| Re-running a 20-credit site probe on a site checked minutes ago | **Fixed** — 14-day `site_intel` reuse |
| The probe's full output discarded, so bees were re-told in prose what had been measured | **Fixed** — `site_intel` + `intelLines` |
| `usage` discarded, so none of the above could be proven | **Fixed** — `ai_usage` |
| Cache markers assumed to be saving money | **Documented** — they are not, and now it is measurable |
| Output caps (900–5000) larger than any real answer | Open. Cheapest remaining win: output is 5x input. |
| A failed run's tokens invisible | **Fixed** — logged with `ok = 0` |

---

# Video economics, measured

Previously the biggest unknown in the app: 200 credits for the most expensive
action, never costed. Now measured from **250 real `/render` requests** in the
Cloud Run access logs over 90 days.

## The sample

| Outcome | Count | Share |
|---|---:|---:|
| Delivered (200) | 154 | 62% |
| **Timed out (504 at the 900s ceiling)** | **25** | **10%** |
| Rejected as busy (429) | 46 | 18% |
| Other | 25 | 10% |

Of attempts that actually ran, **25 of 179 (14%) hit the timeout**.

## Wall time on a successful render

| min | p50 | p90 | p95 | max | mean |
|---:|---:|---:|---:|---:|---:|
| 12s | **87s** | 134s | 147s | 170s | 82s |

## Cost per delivered video

Cloud Run gen2 us-east1 at 4 vCPU / 8 GiB, request-billed
($0.000024/vCPU-s, $0.0000025/GiB-s).

| Component | p50 | p90 | Note |
|---|---:|---:|---|
| Cloud Run | $0.0101 | $0.0156 | **only 7% of the total** |
| ElevenLabs | $0.0924 | $0.2090 | warm cache vs cold |
| Failure share carried per success | $0.0319 | $0.0319 | 14% × (900s + wasted audio) |
| **All-in** | **$0.1344** | **$0.2565** | |

## Against the 200-credit price

| | p50 | p90 |
|---|---:|---:|
| Charged | $0.200 | $0.200 |
| Cost | $0.134 | $0.257 |
| **Margin** | **1.49x** | **0.78x — a loss** |

- Break-even at p50: **135 credits**
- 3x margin at p50: **404 credits**
- 3x margin at p90: **770 credits**

## What this actually says

**1. The voice is the cost, not the rendering.** ElevenLabs is 7–15x Cloud Run.
Every optimisation aimed at the browser was aimed at 7% of the bill. The audio
cache is the single most valuable thing in the render service, and it is
already built — a cold cache more than doubles the cost of a video.

**2. A 14% timeout rate is both a failure and a bill.** Each one burns the full
900-second ceiling *and* the ElevenLabs characters, because audio is generated
before the walkthrough is recorded. That is $0.196 for nothing, 25 times in
this sample. Generating audio *after* the walkthrough succeeds would remove the
wasted characters; that is a render-service change, not a pricing one.

**3. 200 credits is roughly break-even, and loses money on a slow site.** It is
not the runaway loss `score` was, but it is not a 3x business either.

> ⚠️ **Flagged for Ary, not changed.** Video pricing is a decision about what
> Ellen pays, and 200 → 404 is a doubling. Unlike `score` (which was
> accidentally priced below cost and got fixed by routing), this one needs a
> human call. My recommendation: **fix the timeout rate first**. Cutting it
> from 14% to ~3% removes $0.026 per delivered video, and moving audio
> generation after the walkthrough removes most of the rest of the waste. Then
> reprice once, from the better number.

## Assumptions stated

- **ElevenLabs at $0.00022/character** (Creator tier, $22 for 100k credits,
  `eleven_turbo_v2_5` billing 1 credit/char). If the account is on a different
  tier this number moves, and it is the dominant term — so it is the first
  thing to check against a real invoice.
- **Script length** of ~950 characters cold / ~420 ephemeral, from the app's
  own `narrate.mjs` segment structure.
- Storage (R2) and thumbnail generation are immaterial at this volume and are
  excluded rather than guessed at.
- Cloud Run CPU is billed for the whole request under the default
  request-based model, which is what these numbers assume.
