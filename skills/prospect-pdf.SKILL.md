---
name: prospect-pdf
description: Generate a Bloomwired prospect review PDF in a mini-offer-page style. Use for prospect PDFs, visual audits, and walkthrough PDFs. Fulfilment only: made after somebody accepts an offer, or when Ary asks. Never part of a cold sequence.
---

## Strategy V3: what this skill owns, and what it does not

The app is the source of truth and the owner of policy. This skill orchestrates,
executes, deep-reviews and recovers. Two prospecting brains is the failure this
section exists to prevent.

**The app owns, and this skill reads rather than restates:**

- how many cold emails a prospect may ever receive (`allowed_length`, from the
  priority band: P1 = 4, P2 = 3, P3 = 1)
- send eligibility, the send window, timezone and region scope
- every stop condition: reply, decline, unsubscribe, DNC, deferral, bounce,
  evidence staleness, allowed length reached
- the package fingerprint, dedupe, the Gmail send and reconciliation
- Strong, Vet, qualification, priority band
- asset eligibility, which is now an accepted offer and never a sequence step
- contact ownership classification

**A disagreement is worth reporting, not silently resolving.** A skill
overriding live policy is what makes both untrustworthy.

### The three things Strategy V3 retires everywhere

1. **There is no five-email sequence.** Read `allowed_length` off the record.
   Population evidence: emails 1 and 2 convert at 2.9% and 3.0%, email 3 at
   1.2%, and everything after that at about 1% against a 7.9% baseline. Emails 4
   and beyond are a deliberate manual override on a named prospect, never
   routine.
2. **Every cold email closes on a concrete micro-offer.** Name one specific
   thing actually seen, offer to hand over something small and specific,
   deliverable in under about ten minutes, plus the escape hatch ("if that is
   already handled, ignore me"). 4.0% interested against 0.4% for an open
   question, n=625. Never close on an open question. A yes/no offer that happens
   to be a question is fine and is in fact the best-performing shape.
3. **Assets follow evidence, not habit.** The PDF stays out of the cold
   sequence: it happens after somebody accepts an offer, or when Ary asks. Video
   is different and is NOT banned from cold outreach. When the audit turns up two
   or more showable findings on a visual angle, the prospect is VIDEO_WORTHY: the
   video is offered in Email 1 and delivered in the last touch the band already
   allows. It never adds a touch, and it is never made because credits exist.
   `videoDecision` in lib/assets.mjs is the authority.

### This skill's V2 role: fulfilment artifact

**The trigger changed.** It is no longer "the prospect reached Email 5", and
under a three-email maximum that could not fire anyway.

Run when the app says a PDF is the right rung for an artifact that was
explicitly promised and accepted, or when Ary asks for one directly.

The asset ladder decision belongs to the app (`lib/asset-ladder.mjs`): plain
text, then a written rundown, then PDF, then video, then a live audit, stopping
at the first rung that honestly fulfils what was promised. Default to plain
text. If the whole finding fits in an email, a PDF adds a download step between
them and the point.


## WHERE THE RULES COME FROM

Leads That Bloom is the source of truth for anything about the workspace: what
it sells, who it sells to, its qualification rules, its stages and its prices.
Those live in the Hive (Settings) and the app reads them on every decision.

**Inside the app, the Hive always wins.** If a rule below disagrees with what
Settings says, Settings is right and the disagreement is worth reporting: it
means this file has drifted, and a skill quietly overriding live configuration
is the failure mode that makes both untrustworthy.

**Fallback, and it is clearly marked as one.** These skills also run where the
app is not reachable, and the specifics kept here exist for that case only:
pricing figures, the sending address, region scopes, and the voice examples.
Treat them as a last resort, say plainly in the report when one was used, and
never let a fallback value override a live one.



## WHO OWNS WHAT (rewritten 2026-08-09, second revision)

**The app decides whether a PDF should exist. This skill decides what a good
one looks like.** That boundary is now real code: `pdfDecision()` returns
PDF_RECOMMENDED / PDF_OPTIONAL / NO_PDF with a reason code, from verified
evidence, whether the findings benefit from being laid out, whether a country
is known so the offer can be priced, and whether one already exists.

Do not generate a PDF because this skill exists. Check the decision first.

This skill remains authoritative for everything after that:

- what goes on the page, and in what order
- the three jobs: show we looked, name the one step worth fixing, point at one
  starting point
- typography, layout, whitespace, the dark CTA band
- the currency and pricing table
- the rule that it goes out as a link, never a file, and never in the same
  email as a video

Design nuance stays here. Qualification stays in the app. Neither should learn
the other's job.


# Prospect PDF Generator - Proposal Review v18

## Role in the outreach sequence

This PDF is a **fulfilment artifact**, not part of a cold sequence. It is made once somebody has accepted an offer, or when Ary asks for one by name. It is supporting evidence, not the whole sales pitch.

It used to be "the Email 5 attachment". There is no Email 5 under Strategy V3, and under a three-email maximum that trigger could not fire anyway.

The PDF should do three jobs:

1. Show we actually looked at the live site.
2. Name the one public-facing step worth fixing.
3. Point to one best-fit Bloomwired starting point.

Do not overbuild the PDF or turn it into a full website teardown. It should feel like a thoughtful one-page note that makes one idea easier to understand.

The PDF goes out as a link (the prospect's review URL at `https://file.gobloomwired.com/review/{slug}`), never a file. Whichever email carries it links to it on its own line labeled "Here's the link to it:". Never say "attached".

When an audit video exists for the prospect, nothing changes here. The two assets live in different parts of the relationship: the video is cold, offered in Email 1 and delivered in the last touch the band allows, and the PDF is warm, made after somebody accepts. Neither one mentions the other. The video shows what is broken. The PDF is the offer page. Never both links in one email.

## Design rules

- Use `Instrument Serif` Regular 400 for large headings.
- Use `Instrument Serif` Italic 400 for the emphasized phrase when the italic font file is available.
- Use `Instrument Sans` for body text.
- Do not use mono fonts.
- Do not show a top label like `PROSPECT REVIEW`.
- Keep the hero large, airy, and editorial.
- Keep copy short. Use fewer boxes, fewer icons, and more whitespace.
- Dark CTA band at the bottom should stay clean and horizontal.
- Avoid route-map language unless the prospect issue truly requires it.


## CURRENCY AND PRICING RULES

Always note the prospect's likely country/currency during the audit. Use visible evidence first: country domain, business address, phone country code, service area, social links, and local currency shown on the site.

Use this Bloomwired pricing table unless Ary provides a newer one:

| Offer | USD | EUR | GBP | CAD | AUD |
| --- | ---: | ---: | ---: | ---: | ---: |
| Funnel Setup | USD$297 one time | €273 one time | £235 one time | CAD$407 one time | AUD$429 one time |
| Follow-Up Flow | USD$297 one time | €273 one time | £235 one time | CAD$407 one time | AUD$429 one time |
| Full Lead Path Setup | USD$597 one time | €549 one time | £472 one time | CAD$818 one time | AUD$859 one time |
| Custom Build | from USD$797 one time | from €733 one time | from £630 one time | from CAD$1,092 one time | from AUD$1,239 one time |
| Care Plan | from USD$197/mo | from €181/mo | from £156/mo | from CAD$270/mo | from AUD$285/mo |
| Ongoing Lead Support | from USD$397/mo | from €365/mo | from £314/mo | from CAD$544/mo | from AUD$575/mo |

Currency mapping:

- Australia or `.com.au` / `.au` / Australian address or phone: AUD.
- Canada or `.ca` / Canadian address or phone: CAD.
- United Kingdom or `.co.uk` / `.uk` / UK address or phone: GBP.
- Eurozone country: EUR.
- United States or unclear country: USD, unless the site clearly shows another currency.

When using dollar pricing, always write the currency code with the symbol: `USD$297`, `AUD$429`, or `CAD$407`. Never write just `$297`, `$429`, or `$407` in audits, email sequences, or PDFs.

Use the prospect's currency in the audit, offer match, email sequence, and prospect PDF. If the currency is inferred rather than directly visible, state it softly in internal audit notes, not in the prospect email. Example: `Likely currency: AUD based on .com.au domain.`

Treat Full Lead Path Setup as the $597 full-flow tier. Do not call it `Systems Setup` in prospect-facing copy unless Ary explicitly asks.

## Prospect-first content rules

Write from the prospect's point of view. A busy owner wants to see:

1. Proof that we actually looked at their site.
2. What is already working and should not be rebuilt.
3. The exact place I would check next.
4. Why that matters in plain business terms.
5. What Bloomwired would set up.
6. What pain it removes.
7. The best-fit offer and price if there is a clear fit.
8. One easy next step.

Do not sound like an audit robot. Avoid filler and jargon like `handoff`, `optimize`, `workflow`, `streamline`, or `route` unless the word is natural for the site.


Stay close to the words a business owner would use: form, quote request, booking, first reply, follow-up, reminders, service type, phone, text, email, no-show, past client. Use `path`, `handoff`, and `route` sparingly.

Use the same verified angle from the website-audit skill. Do not introduce a new claim that was not checked in the audit. If something is unverified, say `I could not tell from the outside` instead of presenting it as broken.

## Unverified absence rules (hard, from two owner corrections)

The website-audit skill's unverified absence rules apply to every line of the PDF. In PDF terms:

1. The `What's happening now` / `What I noticed` column may contain only verified, visible facts. Anything invisible from outside (auto-reply, owner notification, follow-up, who sees the inbox) never appears as a gap item, warning-icon item, or headline claim. Never `No visible reply after form submission` as a finding.
2. The gap, when it concerns something invisible, is phrased as the part we could not check, with the limit on us: `What someone sees after submitting is the part I could not check from the outside.` It reads as a question the owner can answer in ten seconds, not a verdict.
3. Somewhere in the hero or the gap item's note, give the already-handled out: `If an instant reply is already set up, this part is done.` Both owners who corrected us had it handled. The out is what makes the page read fair instead of wrong when they do.
4. `With Bloomwired` / `What I would clean up` items describe additions, never corrections of an unverified failing. `You get a notification with the person's details on your phone` passes. `Requests stop sitting in the inbox waiting to be noticed` fails, it asserts they currently sit there.
5. No invented visitor moments anywhere: no `they stop wondering if the form worked`, no `most people expect something back by morning`.

## The pain arc (required in every PDF)

The PDF must walk the reader through four beats, in this order. The three-column layout stays the same; these beats map onto it.

**Beat 1 — Notice (hero + left column).** Prove we looked. Name real things from their live site. Compliment what works and mean it.

**Beat 2 — Recognize (last item of the left column, always).** The final `What I noticed` item is always the gap, and its note must land as a moment the owner has personally lived, not a category. A category is `requests can go quiet`. A moment is `the job goes to whoever replied first` or `answering the same first question from your phone between appointments`. The owner should read that note and picture a specific Tuesday.

**Beat 3 — Cost (one line, once per PDF).** Exactly one sentence, in the left column gap item or the offer card intro, that puts the price of the fix next to the value of one lost job. Rules for this line:

- If the site shows their own service prices, use their own numbers: `One missed duct cleaning job is most of this setup's cost.`
- If no prices are visible, use the generic version: `One quote that goes quiet usually costs more than this whole setup.`
- Never invent revenue figures, close rates, or statistics about their business. Never write `you're losing thousands`.
- One defensible market truth is allowed when it fits: most people request quotes from two or three businesses at once, and the first clear reply usually gets the conversation. Phrase it as common knowledge, not a study.

**Beat 4 — Relief (right/middle column + offer card).** Every `What I would clean up` item pairs the fix with the moment it deletes. Not `sends the next step clearly` alone, but tied to the recognizable scene it replaces: `You stop typing the same first reply from your phone at 9 PM.` The offer card is the exit from the pain, so its intro should read like permission to stop doing the manual version.

**Ary's voice calibration (applies to every line of PDF copy):** the `What I noticed` column leads with the strongest genuine positive, stated plainly and tied to something verified, before any gap item. Curiosity framing over diagnosis: "the part I would check" beats "the problem is." No exclamation marks anywhere in the PDF. "honestly" once max, or not at all. No antithetical rhetoric ("this isn't X, it's Y" constructions). No metaphors or decorated phrases; concrete scenes ("typing the same first reply from your phone at 9 PM") are fine, figurative weight-and-burden language is not. Ary's verbs: fix, clean up, set up, keep track. Warm means plain, specific, and easy to agree with, never bubbly.

**Tone guardrails for the arc:** recognition, never fear. The owner should feel seen, not scolded or scared. No urgency countdowns, no `every day you wait`, no disaster framing. If the pain line would sound at home in a late-night infomercial, cut it. The confidence comes from specificity, not volume.

## Recognition line library

Pick or adapt lines like these for Beat 2 and Beat 4 notes. Match to what the audit actually verified:

- `Most owners answer these from their phone between jobs. Some slip.`
- `The job usually goes to whoever replied first, even if their quote was higher.`
- `A commercial request buried under home quotes is the expensive one to miss.`
- `Nobody forgets on purpose. Busy days win sometimes.`
- `Most people ask two or three businesses at once. The first clear reply usually gets the conversation.`

Never use more than two of these per PDF. Specific beats generic: if the site shows service types, seasons, or emergency work, write the line around that instead.

Retired lines, never use (each got an owner correction or implies one): `People fill these out at night. The reply they get by morning decides a lot.` / `The follow-up that never got sent is invisible. The lost job is not.` / `By the time a quiet request resurfaces, they have already booked someone.` / anything that narrates what their visitors experience or asserts requests currently sit unanswered. We never watched their visitors or their inbox.

Use lines like:

- `I would not rebuild this part.`
- `The form is visible. The reply after it is the part I would check.`
- `Every request gets a first reply without you typing it.`
- `People know what happens next before you manually reply.`
- `Requests get sorted by service type on their own.`

## Copy structure

Hero:
- Headline is two beats. Beat one names something true and visible. Beat two (the italic phrase) carries the stake, the thing at risk, not just the topic.
- Weak: `Your quote form is visible. <em>The follow-up is the part I would fix.</em>` (topic, no stake)
- Strong: `Your quote form works. <em>What happens in the hour after is what wins the job.</em>`
- Strong: `People can reach you three ways. <em>What happens after they do is the part I would check first.</em>`
- Subtitle should be specific and human, and it plants the stake in one calm sentence.

Left column:
- Label: `What I noticed`
- Mention visible site details: phone, email, quick quote, booking, service categories, programs, locations, named offers.
- Include what is already good.
- The LAST item is always the gap (Beat 2). Its note is a lived moment, not a category.

Middle column:
- Label: `What I would clean up`
- Say what would happen after Bloomwired builds it.
- Each point pairs the fix with the moment it deletes (Beat 4). The owner should see their own Tuesday getting easier, item by item.

Right column:
- Suggested offer, price, and what it includes.
- The offer intro reads like permission to stop doing the manual version. This is also a valid home for the one cost line (Beat 3) if it did not go in the left column.
- Keep the offer card clear and separate from the observations.

Metrics:
- Each metric names a before/after moment, not a category. `Fewer quiet quotes` is a category. `Requests get an answer before you have even seen them` is a moment.
- Three metrics max. If one feels generic, replace it with something the audit actually verified.

## Font handling

The downloadable skill does not include font files. To render with exact Bloomwired fonts, pass a folder containing:

- `InstrumentSerif-Regular.ttf`
- `InstrumentSerif-Italic.ttf` for true italic emphasis
- `InstrumentSans-VariableFont_wdth,wght.ttf`

Run:

```bash
python3 prospect-pdf/scripts/generate.py   --config config.json   --output prospect.pdf   --assets prospect-pdf/assets   --font-dir /path/to/fonts \
  --require-fonts
```

If the font files are available in project sources, materialize/copy them before rendering and pass the folder through `--font-dir`. Do not rely on font-family names alone. If exact fonts cannot be accessed, say so before rendering instead of silently falling back.


## Link handling

The `bloomwired.io/offers` text in the Suggested starting point card must be a real clickable PDF link, not plain text. The footer `bloomwired.io` text must also be clickable.

The generator uses real `<a href="...">` tags for:

- `offers_url`, default `https://bloomwired.io/offers`
- `home_url`, default `https://bloomwired.io`
- `setup_check_url`, default `https://bloomwired.io/setup-check`

Do not replace these links with `<div>` or `<span>` elements. After rendering, inspect the PDF annotations if possible to confirm the links exist.


## Wording when an email carries this PDF

This is a warm email, after somebody has accepted an offer or asked to see something. It should say something like:

`I put together a one-page note so you can see what I mean.`

Then the link on its own line:

```
Here's the link to it:
[review URL]
```

Never the word "attached". The email treats the PDF as a link, never a file. This never appears in a cold sequence.
