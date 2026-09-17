# Today: human errors and row hierarchy

Two visual problems, one screen.

Ary was reading `page.goto: net::ERR_NAME_NOT_RESOLVED` as the headline of a
card, and prospect rows had flattened person, business, country and waiting age
into a single strip with the person's name missing entirely.

UI and wording only. No logic, bucket, qualification, send, Gmail, scanner or
queue change.

---

## Baseline

| | |
|---|---|
| Commit before | `7542720` |
| Tests before | 980 |
| Tests after | **1013 passing, 0 failing** |
| Build | clean |
| New AI calls | **none** |

---

## Error presentation

`lib/friendly-errors.mjs` translates a raw failure into a sentence. The raw text
is kept untouched and shown on request; it is never the headline.

**Deliberately a lookup table and not a model.** Asking a language model to
rewrite an error would cost money per failure, take a second, and sometimes
invent a diagnosis. A regex either matches or it does not, and when nothing
matches the honest answer is *"something interrupted it"*, not a guess. There is
a test that reads the module's own source and fails if it ever reaches for
`fetch`, `aiCall`, `anthropic` or `/api/ai`.

Where the queue already has a structured reason (`error_kind`), that is trusted
**over** the text: a budget stop is a budget stop whatever the message says.

---

## Error categories

| Raw | Ary sees | Retry |
|---|---|---|
| `ERR_NAME_NOT_RESOLVED`, `ENOTFOUND` | **Their website could not be reached** — The address is not resolving. The site may be offline, expired, or having a bad day. | yes |
| `Timeout 45000ms exceeded` | **Their website took too long to load** — It did not finish loading before the check gave up. Nothing was changed. | yes |
| `ECONNREFUSED`, `ECONNRESET` | **Their website is not responding** | yes |
| captcha, Cloudflare, 403 | **The site blocked the automatic check** | no |
| 404 | **That page is not there any more** | yes |
| 5xx | **Their website had an error** | yes |
| credits, budget | **Waiting on credits** | no |
| gmail, oauth, token | **The mailbox needs attention** | no |
| anything else | **The check could not finish** — Something interrupted it. Nothing was sent or changed, and you can try again. | yes |

Rules are ordered, first match wins, so "connection refused" never gets read as
a generic network wobble.

---

## Technical details

A collapsed `Technical details` disclosure under the card. Closed by default.
Inside, the raw error in full, unmodified and untruncated: truncating an error
is how the useful half gets lost.

**Monospace lives there and nowhere else.** Setting the rest of the card in it
is what made Today read like a console.

The disclosure only appears when the raw text actually looks technical, so a
plain message is not hidden behind a click for no reason.

---

## Automation failure cards

Before:

> **A background job failed**
> page.goto: net::ERR_NAME_NOT_RESOLVED at https://amerrymind.com...

After:

> **A Merry Mind**
> **Their website could not be reached**
> The address is not resolving. The site may be offline, expired, or having a bad day.
> `Try again` · `Technical details`

"A background job failed" is gone. It was technically true and useless: the
section heading already says the automation stopped, so the card's job is to say
what happened to *this business*.

---

## Prospect row hierarchy

`lib/row-identity.mjs` decides who a row is about; `components/ProspectRow.jsx`
draws it. The rule, in four levels:

| | | Weight |
|---|---|---|
| 1 | **Person** | 14px semibold, ink |
| 2 | Business | 12.5px, muted, own line |
| 3 | Location · waiting age | 12px, tertiary, own line |
| 4 | Status chips | top right, one cluster |

Before: `Doolan Coaching | Life Coach, Sober Coach   US   36 days waiting` — one
line, one weight, no person.

After:

```
Dennis                                     [Snoozed]
Doolan Coaching
US · Waiting 36 days   [Interested]
```

**The business is promoted only when there is no person**, so a nameless card
never has an empty first line.

**A name that matches the business is said once.** The failure cards were
rendering `A Merry Mind · A Merry Mind`, which is what happens when two fields
are joined without asking whether they differ.

**Country is metadata, never appended to the title.** Codes stay codes (`US`,
`AU`, `UK`); anything longer is already human.

**Waiting age is its own element**, and passes 30 days into the palette's quiet
warning tone. Emphasis, not alarm, and never competing with the name.

---

## Status placement

Two areas, and only two.

- **Top right:** workflow state (`Snoozed`, `Engaged`, `Replied`)
- **With the metadata:** outcome (`Interested`, `Asked for later`, `Said no`)

Chips used to sit between the name, the business and the location, which
destroys reading order: the eye cannot find the second line when something else
is in the way.

Meaning never rides on colour alone. Every chip says what it means in words.

---

## Shared components

One `ProspectRow` with variants, used by every Today bucket and every bucket
page. Actions differ per bucket and come in as children; identity never differs,
so it does not.

The Today preview and the full page render **the same component**, so a compact
list cannot quietly become a worse-looking one.

`lib/row-identity.mjs` is pure and separately tested, so the hierarchy is a rule
with assertions rather than a habit that drifts between six copies of JSX.

---

## Retry actions

`Try again` appears only when the failure is genuinely retryable. It calls
`POST /api/jobs/retry`, which re-queues through the **existing durable queue**.
A second retry mechanism would be a second place for a job to get stuck.

Refused, both on the card and again in the endpoint because state moves between
a page load and a click:

- do-not-contact, unsubscribed, declined
- Client, Rejected, Lost, Finished
- a blocked or challenged site, where retrying changes nothing
- out of credits, where it is not a failure to retry

---

## ⚠️ Two real bugs found while testing

**`looksTechnical` never matched a timeout.** The pattern was `\bms exceeded\b`,
and in `45000ms exceeded` there is no word boundary between the digits and the
unit. The single most common error on the screen would have skipped its
disclosure. Now `\d+\s*ms\b`.

**`waitingLabel(null)` said "Waiting since today".** `Number(null)` is `0`,
which is finite and not negative, so every row with no date claimed a wait of
zero days. Now an explicit absence check first.

Both were caught by tests written before the code was trusted.

---

## Tests

**33 added** (shared with the dashboard pass), 1013 passing.

| # | Scenario | |
|---|---|---|
| 1 | `ERR_NAME_NOT_RESOLVED` reads as a sentence | ✅ |
| 2 | timeout reads as a sentence | ✅ |
| 3 | raw text is never the headline | ✅ |
| 4 | raw text is available in Technical details | ✅ |
| 5 | unknown error uses safe copy, invents nothing | ✅ |
| 6 | retryable failure offers Try again | ✅ |
| 7 | closed or blocked states do not | ✅ |
| 8 | person is primary when present | ✅ |
| 9 | business is secondary | ✅ |
| 10 | no duplicate `Business · Business` | ✅ |
| 11 | country is metadata, not part of the title | ✅ |
| 12 | waiting age is its own element | ✅ |
| 13 | chips render in two consistent areas | ✅ |
| 14 | layout works with no person name | ✅ |
| 15 | preview and bucket page share the hierarchy | ✅ |
| 16 | no AI call added for error rewriting | ✅ |
| 17 | send switches unchanged | ✅ |
| 18 | bucket meanings unchanged | ✅ |

---

## Deployment

Commit and deployment hash in the chat summary. Both send switches remain OFF.

---

## What Ary should test

1. **Look at any failure card.** It should name the business, then say what
   happened in English. No `net::` anywhere.
2. **Open "Technical details".** The raw error is still there, in full.
3. **Press "Try again"** on one that offers it.
4. **Find a card for a business with no contact name.** It should show the
   business once, not twice.
5. **Scan a list.** Names should be the first thing the eye lands on, and the
   waiting age should be findable without reading a sentence.
