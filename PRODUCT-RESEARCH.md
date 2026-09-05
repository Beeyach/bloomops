# Product research

Sources behind the decisions in `PRODUCT-ROADMAP.md`. Researched August 2026.

Kept short on purpose: source, what it says, whether we acted on it.

---

## Cold outreach performance, 2026

| Source | Key finding | Relevance | Adopted? |
|---|---|---|---|
| [Instantly 2026 Benchmark Report](https://instantly.ai/cold-email-benchmark-report-2026) | Average cold email reply rate **3.43%**. | Sets the floor. Anything the product claims has to beat this to matter. | Yes — the baseline for outcome analytics |
| [Amplemarket cold email benchmarks](https://www.amplemarket.com/blog/cold-email-benchmarks) | Signal-referencing emails (funding, leadership change, hiring) reach **15–25%** reply vs generic. | The single largest lever in the whole funnel is *having a real reason to write*. | Yes — this is the product thesis |
| [InboxKit reply rate benchmarks 2026](https://www.inboxkit.com/learn/cold-email-reply-rate-benchmarks-2026) | Good = 1–5%; 8–10%+ for well-targeted personalised campaigns on a clean list. Medium personalisation (research-based opening) 4–8% vs 1–2% generic. | Confirms research depth beats volume by 3–4x. | Yes |
| [Prospeo B2B reply rates](https://prospeo.io/s/b2b-cold-email-reply-rates) | **Positive** replies ≈ 2% of sends. Campaigns hitting 1–2 contacts per company reply at 7.8%; 10+ contacts drops to 3.8%. | Positive reply rate is a different, much smaller number than reply rate, and must be tracked separately. Spraying a company hurts. | Yes — analytics separates reply from positive reply |

**What this changes:** the product should spend its effort on *finding a real,
verifiable reason to contact someone*, not on sending more. That is already
what the audit-video pipeline does; it just was not being treated as the core.

---

## What the market does

| Source | Concept | Why people pay | Our version |
|---|---|---|---|
| [Clay signal-based prospecting](https://asphia.consulting/blog/clay-signal-based-prospecting-workflow/) | Signal source → enrich → score by signal strength → sequence with a personalised first line, running daily unattended. | Removes the "who do I contact today and why" decision. | We already have a narrow, deeper version: the site probe *is* a signal source, and it produces verified evidence rather than a database lookup. |
| [Clay waterfall enrichment](https://lelab0.com/en/guide-clay/), [Databar review](https://databar.ai/blog/article/clay-lead-enrichment-complete-2025-guide-top-alternatives) | Try provider 1, fall through to 2, 3… Claimed 80%+ email match vs 40–50% single-source. Cost control comes from *not* calling the expensive provider when a cheap one answers. | Coverage plus cost control in one mechanism. | **Adopted as a pattern, not a product.** The fall-through idea is why `precheck` now checks stored intel before paying for a probe. We do not need 150 providers; we need to stop buying the same answer twice. |
| [Apify Google Maps Scraper pricing](https://apify.com/scraperlink/google-maps-scraper/api), [pricing breakdown](https://gmapsscraper.io/blog/apify-google-maps-scraper-pricing-review) | Pay-per-event: **$2.10–$5.00 per 1,000 places** by plan tier. Filters (category, rating, has-website) add a surcharge *per filter per place*. `scrapePlaceDetailPage` adds $0.002/place. | Discovery at a known unit cost. | Already integrated. The per-filter surcharge is the thing to watch — the app exposes several filters and each one multiplies. Grounded the scan credit price. |

**Deliberately not copied:** Clay's 150-provider marketplace, Instantly-style
sending infrastructure, and generic "AI SDR" autopilot. See DO NOT BUILD.

---

## Claude platform economics

| Source | Finding | Adopted? |
|---|---|---|
| [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) | Cache reads bill at **0.1x** input; cache writes at 1.25x. | Yes — encoded in `lib/ai-cost.mjs` and tested |
| [Minimum cacheable length](https://hidekazu-konishi.com/entry/anthropic_claude_api_prompt_caching_and_token_efficiency.html), [Grokipedia](https://grokipedia.com/page/Prompt_caching_Anthropic) | Minimum cacheable prefix ~**1024 tokens** (Sonnet-class); shorter prefixes are **silently not cached**. | Yes, and it invalidated an existing assumption — our largest system prefix is 706 tokens, so caching has never engaged. See `AI-COST-MODEL.md`. |
| [Batch API discount](https://pecollective.com/tools/claude-pricing-guide/), [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) | Message Batches = **50% off** input and output, stacks with caching, results typically within the hour. | Documented as the next big lever for `score` sweeps. Not implemented — it changes the Guard Bee UX. |

---

## What we did **not** find support for

- **Open-rate optimisation.** Open tracking is unreliable enough in 2026 that
  no source treated it as a primary metric. The app does not track opens and
  should not start.
- **Longer sequences.** Nothing in the benchmark data supported adding steps.
  The 5-email cadence stays.
- **Autonomous sending.** Every source that reported strong numbers had a
  human deciding what went out. Reinforces the human-in-the-loop design.

---

## Honest limits of this research

- The benchmark figures come from vendor-published reports (Instantly,
  Amplemarket, Prospeo). Vendors have an interest in the numbers that make
  their category look effective. The *direction* (signals and research beat
  volume) is consistent across all of them, which is the part we relied on;
  the absolute percentages are not load-bearing for any decision here.
- Apify pricing varies by plan tier and changes; the range is recorded rather
  than a single figure.
- No primary research was done with real prospects. Everything about our own
  funnel should come from `ai_usage` and the pipeline once there is data.
