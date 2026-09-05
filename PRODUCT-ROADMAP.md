# Product roadmap

Written after reading the whole repository and the research in
`PRODUCT-RESEARCH.md`. Ranked by whether it helps someone **choose better
prospects, write better outreach, waste fewer credits, follow up better, and
get more clients**. Anything that only adds a screen is in DO NOT BUILD.

---

## What Leads That Bloom is today

A prospecting tracker with one genuinely unusual capability bolted to it: a
**headless browser that verifies problems on a prospect's website and refuses
to record a video when it cannot find any**.

That refusal is the product. Everything else in the repo — stages, Today,
Leads, the Hive — is competent CRM. The probe is the thing nobody else has,
and it was being treated as a feature of the video recorder rather than as the
core.

## What it should become

**The prospecting tool that will not let you invent a reason to contact
someone.**

Not "AI writes your emails". Every observation carries where it came from and
when it was seen, and the system says "I don't know" rather than guessing.
That is a narrow wedge and a defensible one, because it is the opposite of
what a generic AI SDR does.

---

## Found already inside, underused

| Asset | State | Verdict |
|---|---|---|
| Render-service probe output (facts, checks, pages, keyed findings, blocked reason) | Computed on every 20-credit precheck, **95% discarded** — only tier/score/reasons survived | **CONNECTED this pass** → `site_intel` |
| `usage` block on every Anthropic response | Read and dropped | **CONNECTED this pass** → `ai_usage` |
| `lib/extract-email.mjs` `siteEmailAndSignals` | Works, finds contact emails and high-ticket signals off a landing page. Only reachable from the ad-scan path | **KEEP + CONNECT (NEXT)** — this is contact discovery, already built |
| `signalsInText` (program / funnel / price / income-claim detection) | Works, tested, used only for ad leads | **CONNECT (NEXT)** — real buying signals, applicable to any prospect |
| `lib/audit-profile.mjs` `parseAuditNotes` | Parses the audit skill's notes into a profile, re-parsed on every render, never stored, no dates | **IMPROVE (NEXT)** — should feed `site_intel`, not live beside it |
| `own_findings` (Ary's own observations) | Stored, spoken in videos, **not in `video_reasons`, not in any bee's context** | **CONNECT (NOW-ish)** — her eyes beat the probe |
| `lib/engine-prompts.mjs` `buildScoringParts`, `buildAdScoringParts`, `DEFAULT_INTENT_PHRASES` | Exported, nothing imports them | Superseded by `buildVerdictParts`. **REMOVE** once confirmed |
| `vidtest.mjs` A/B markers | Computes real A/B stats from `VIDTEST:A/B` info markers | **KEEP** — this is the outcome-learning seed |
| `daily_log` table + targets | Real funnel-target tracking, one screen | **KEEP** |
| Prompt caching markers | Never engaged (prefix < 1024 tokens) | **DOCUMENTED** — do not chase |

---

## NOW — shipped this pass

| # | Change | Problem it solves |
|---|---|---|
| 1 | **`ai_usage` ledger** (`lib/ai-cost.mjs`, `migrations/031`, `GET /api/ai-usage`) | Every credit price was a guess. Now every call records model, tokens, cache hits, real dollars, credits charged, and whether it failed. `score` turned out to be **sold at a loss**. |
| 2 | **Task→model routing** (`modelForTask`) | Eleven tasks, one model. Extraction now runs on Haiku at ~⅓ the cost; reasoning stays on the configured model, which remains a ceiling. |
| 3 | **`site_intel` prospect memory** (`lib/site-intel.mjs`, `migrations/031`) | The probe's findings are kept with a **date and a source**, reused for 14 days instead of re-bought, and handed to every bee as measured facts. A bee with no intel is now told *"you do not know anything about their website"* rather than left to infer. |

These three are one change, not three: (1) proves (2) works, and (3) is both
the biggest credit saving and the foundation of the evidence-first wedge.

---

## NEXT

| Feature | Problem | Impact | Effort | Depends on |
|---|---|---|---|---|
| **Vet Bee → staged funnel** | Every prospect gets the same expensive treatment. Cheap prescreen → only promising ones get the full probe. | High | M | `site_intel` ✅ |
| **Pick Bee reads `site_intel` instead of re-reasoning** | It ranks from stage/date/rating and cannot see that a site has a verified broken form. | High | S | `site_intel` ✅ |
| **`own_findings` into `video_reasons` + bee context** | Ary's own observations are the highest-confidence evidence in the system and no bee can see them. | High | S | — |
| **`signalsInText` + `siteEmailAndSignals` on every prospect** | Contact discovery and buying signals already exist and only ad leads get them. | Med-High | S | — |
| **Batch API for `score` sweeps** | 50% off, stacks with Haiku routing. ~4x cheaper scoring. | Med | M | Guard Bee UX change |
| **Outcome analytics with sample sizes** | We hold something Clay does not: her actual history. "Lead-capture findings: 4 positive replies from 38 prospects" — never a percentage on n=3. | High | M | `ai_usage` ✅ |
| **Output-cap tuning** | Output bills 5x input and every cap exceeds any real answer. Cheapest remaining saving. | Med | S | `ai_usage` ✅ to measure |

---

## LATER

- Reply classification into structured outcomes (the reply-sync skill already
  writes `REPLYSYNC` markers; nothing aggregates them).
- Lookalike discovery from prospects that became clients.
- Website-change detection (re-probe, diff against stored `site_intel` — the
  storage now exists, which is the hard half).
- Split the single video severity number into **fit / opportunity / evidence /
  confidence**. The probe already computes the inputs.

---

## EXPERIMENT

- Re-probe stale `site_intel` nightly in a batch and surface *"their site
  changed"* as a timing signal. Cheap to try now that intel is stored and
  dated; worthless if small-business sites turn out not to change.

---

## DO NOT BUILD

| Not building | Why |
|---|---|
| **Native email sending** | Our differentiator is everything *before* and *after* the send. Instantly and Smartlead do this well and we would be worse at it while inheriting deliverability as a support burden. Gmail compose already works. |
| **Open tracking** | Unreliable in 2026, and optimising for it teaches the wrong lesson. Reply / positive reply / client are the metrics. |
| **150-provider waterfall enrichment** | Clay's moat, not ours. We need *one* reliable answer per fact plus the discipline not to buy it twice — which is what `site_intel` does. |
| **Autonomous AI SDR that sends** | Every source with strong numbers had a human deciding. Automating the send is how the tool becomes a spam bot. |
| **Another AI chat panel** | The app already has eight bees. A ninth generic assistant adds a button, not a decision. |
| **Longer email sequences** | No benchmark evidence supports more steps. |
| **Public signup / Stripe / pricing page** | Nothing about the architecture is blocked on it, and turning it on now would be committing to prices we have only just started measuring. |
| **A second dashboard** | Today is the dashboard. Improve it. |

---

## Monetisation readiness

**Already in place:** workspace isolation on every query (verified in the
previous security pass), per-workspace credit balances and limits, admin/user
roles, session gating, CSV export, soft-delete with a 30-day Trash, migrations,
and now a per-workspace cost ledger with margin per operation.

**Still blocking commercial release:**

1. **Prices are measured but not yet coherent** — margins run 0.8x to 4.5x.
   `AI-COST-MODEL.md` has a proposed table; repricing is a business decision.
2. **Video costs are unmeasured.** The most expensive action in the app
   (200 credits) has never been costed against real Cloud Run + ElevenLabs
   spend. This is the biggest unknown in the economy.
3. **No billing ledger.** Credits move, but there is no record of *purchases*,
   only balances.
4. **No account deletion or data-retention policy.** The app stores scraped
   public data about third parties; that needs a stated retention window and a
   deletion path before anyone but Ary and Ellen uses it.
5. **No plan feature-gating primitive.** Limits exist per workspace but are
   set by hand, not derived from a plan.

None of these is architectural. They are all additive.

---

## The moat question

*Why not Clay + a CRM + Claude + a spreadsheet?*

Because that stack will happily tell you a prospect "probably isn't following
up with their leads." Leads That Bloom already refuses to: the renderer will
not record a video when it cannot verify a problem, and it names what it
found. That refusal is worth more than any feature on this roadmap, and this
pass extended it — every bee now either reads a dated measurement or is told
plainly that it knows nothing about the site.

The wedge: **evidence-first prospecting for service businesses.** Find the
real reason before you spend the touch.
