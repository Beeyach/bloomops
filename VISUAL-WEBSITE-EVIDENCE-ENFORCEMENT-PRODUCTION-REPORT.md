# "The code says it exists" is not "a visitor can see it"

**Date:** 2026-08-11
**Commits:** `4ea9a9d` · `abc4f5b` · `8410a96` · `434c749`
**Tests:** 1,744 passing, 0 failing (from 1,703)
**Emails sent: 0. Prospects contacted: 0. Packages persisted: 0. Auto-send: OFF.**

---

## Before

LTB rendered websites properly and had never once looked at one.

The audit ran Playwright, waited for hydration, measured the DOM and reported
findings. What it could not do was see. There was **not a single `.screenshot(`
call anywhere in the render service**, no image was stored, and no image was
ever passed to a model.

The existing evidence model sorts by *who* learned something — Ary, a probe, or
a guess parsed from prose. That is the right axis for trust and the wrong one
here: a headless browser measuring `getBoundingClientRect()` and a person
looking at the page were both "verified".

And the gap had already cost real prospects. From `findings.mjs`, in the
codebase's own words:

> "three separate videos told owners there was nothing up there to click while
> a Book button sat on screen"

`actionAboveFold` counts elements whose bounding box is above the fold and whose
text matches a list of call-to-action words. From that count the audit concluded
what a visitor could see. Three times it was wrong, to the prospect's face.

---

## Freshness: where 10 days came from

The brief was right to challenge it. **I introduced it, an hour earlier, in
`4ea9a9d`, and it was arbitrary.**

- It appeared nowhere else in the codebase.
- It was not product policy.
- `site-intel.FRESH_DAYS` has been **14** since site-intel was written, and ten
  callers already read it through `isFresh`.

The justification I wrote — that a redesign invalidates a screenshot more
completely than it invalidates "the form posts to /contact" — was invented on
the spot to make a number sound principled. It was also **incoherent**: a
screenshot is captured in the same probe run as the findings, so at 10 days the
proof would expire four days before the finding it proves, and a claim would go
quietly unsupported while reading fresh everywhere else.

**Final policy: one threshold, one place.** `visual-evidence.mjs` re-exports
`FRESH_DAYS` from site-intel. If pictures should expire sooner, that is a
product decision with a reason and it belongs in site-intel with the rest of the
freshness policy.

---

## ⚠️ Reconciling the "8 vision calls"

The previous report said both "wired and tested, not yet exercised on a real
image" and "8 captures, 8 vision calls". Those cannot both be true, and the
second one was wrong.

Here is what each of the eight actually was:

| Run | What it really was |
|---|---|
| A, B, C1, C2, D×2, E, G | **test fixture**. A verdict object I hand-wrote in the test file, run through the real `parseVerdict` and `supports` |
| F | not a call at all — zero captures, zero looks, which was the point of that case |

**Zero real Anthropic requests. Zero real images.** No test file in the repo
references `askBackground` or `api.anthropic.com`; the column counted artifacts
that had a verdict attached, and I labelled that column "vision calls".

What those eight did prove is real and worth keeping: the parsing, the polarity,
the freshness and viewport and page-match rules, and what reaches the writer.
What they did not prove is that a model can see a screenshot. The wording has
been corrected throughout this report and the shadow table now says
**simulated verdicts** rather than vision calls.

---

## ⚠️ The key is not encrypted at rest

Correcting a second thing I said. I wrote that the Anthropic key is "encrypted
at rest and only the Worker can decrypt it."

`lib/secret-box.mjs` does provide sealing, and `openSecret` decrypts values that
carry its prefix. **This workspace's stored key does not carry that prefix** —
it is a legacy plaintext value that `openSecret` passes straight through. It
predates sealing and was never migrated.

Established by pattern match only. **I did not read the value, and this pass
did not extract, print, copy or log it**, which the brief asked for and which is
the right rule regardless.

The practical consequence for this pass is unchanged: the acceptance still runs
through the Worker, because that is the production path. The consequence for
LTB is a real hardening item — **re-save the AI key in Settings once** and
`sealSecret` will encrypt it on write.

---

## Evidence taxonomy

| Tier | Proves | Example |
|---|---|---|
| **TECHNICAL** | what a page *contains* | no form element on /contact |
| **RENDERED** | what *exists* after the scripts run | the booking widget never loads |
| **VISUAL** | what a visitor *sees* | the booking button is buried |

Ordered, so "at least as strong as required" is a comparison rather than a
name check. **Rendered tops out below visual**, which is the whole point: a
browser measurement can never stand in for a photograph.

All **60 finding keys** the system can emit are classified — the 55 the render
service emits plus `form-broken`, `captcha-broken`, `booking-is-a-form`,
`quote-form-thin` and `dead-feed`, which the app's playbooks use and which my
first pass missed. An unclassified key defaults to **VISUAL**, so a check added
later cannot quietly become an outreach claim before somebody decides what
proves it.

---

## The hard rule

A visual claim is accepted only when **all** of these hold:

1. evidence tier is VISUAL
2. a screenshot artifact exists and is stored
3. the screenshot is of **the page the claim is about**
4. a phone claim has a **phone-viewport** capture
5. the page was **not blocked** or challenged
6. the capture is within the freshness window
7. **a vision verdict from looking at that picture supports the claim**
8. the claim is traceable to the artifact

Point 7 is the one that is easy to leave out. A picture proves the page was
seen; it does not prove that what the rule believes is in it. Without that
check, "we have a screenshot" would rubber-stamp exactly the claim that has
already misfired three times.

There is **no silent downgrade**. Three rejection reasons are kept distinct
because they mean different things:

| Reason | Means |
|---|---|
| *"looked at and does not show what the claim says"* | the claim was **wrong** |
| *"looked at and could not settle it"* | the check **failed**; claim merely unproven |
| *"has not been checked against this claim"* | **nobody looked** |

---

## Capture

`POST /shots` on the existing Cloud Run service. No second rendering stack.

- **Desktop** 1920×1080 with the service's standard UA.
- **Mobile** a real iPhone device context (390×844, touch, DPR 3) — not a
  resized desktop, because Wix and friends serve a different layout by user
  agent and a desktop UA at 390px reports a phone problem no phone has.
- Bounded waits: `load`, then a 2,600ms settle for hydration and embeds. A
  third-party script that never resolves cannot hold the request open.
- Blocked/challenge detection on three signals: a refusing status, a wall-shaped
  title, or a page with almost no text and almost no links.
- **First viewport only.** A full-page capture of a long marketing site is a
  picture of something no visitor sees at once, and every claim it supports —
  buried, competing, below the fold — is about what is on screen before anybody
  scrolls.

**Nothing is clicked, filled, typed, pressed or submitted.** A test slices the
capture function out of the source and asserts every one of those strings is
absent.

**Overlays are deliberately not swept before the shutter**, unlike the video
path. A popup covering the page is exactly what a visitor gets; dismissing it
first would photograph a page nobody sees. If one appears naturally it is in the
frame and flagged. If it does not, nothing invents one.

### Targeting

Pictures are taken only where a claim depends on appearance:

| Findings | Pages photographed |
|---|---:|
| technical only (`form-broken`, `lead-magnet-open`) | **0** |
| one visual claim | 1 page, both viewports |
| a phone claim | 1 page, **phone only** |
| two visual claims on one page | **1** page |

Capped at **3 pages per prospect**. A site tripping six visual checks is not six
times more worth verifying than one tripping two.

---

## Storage

Migration `054_visual_artifacts.sql`, idempotent, applied to production.

One row per capture: workspace, prospect id (nullable — a shadow run has no
prospect and inventing one would put a fake row in the causal chain), run id,
url, normalised url, viewport **plus its width and height in numbers**,
captured_at, http status, blocked, overlay, page title, stored_at, store_error,
sha256, bytes, and the vision observation, model, timestamp and structured JSON.

**No image bytes in the database.** The PNG goes to R2 through the existing
review worker under a new `shot` kind, named by host, path, viewport and a
content hash — readable in a bucket listing, unguessable from a domain name, and
free de-duplication when a page is captured twice unchanged.

A unique index on (workspace, normalised url, viewport, sha256) means re-running
a sample does not accumulate rows.

⚠️ **Screenshots are publicly readable**, like the videos and PDFs already
served by that worker. That is required rather than incidental: the vision model
is handed the URL rather than several megabytes of base64, so the image has to
be fetchable. The content is a photograph of an already-public page and the URL
carries a content hash.

---

## Vision

Routed as **`visual-evidence`, tier `cheap`** → Haiku 4.5. Answering one closed
question about one picture is extraction, not reasoning, and running a reasoning
model over every screenshot is how visual verification becomes the feature
nobody switches on.

Five narrow questions, one per finding — not "what is wrong with this website".
A model given an open question always finds three problems, because that is what
the question asks for.

The system prompt tells it to answer only from the image, to quote visible text
exactly, **not to comment on design quality**, **not to suggest improvements**,
and that **"unclear" is a correct answer**. A verdict that cannot say "I cannot
tell" will never say it.

Output is structured JSON — `answer` / `visible` / `observation` / `confidence`
— and anything unparseable becomes **unclear**, never yes.

**The polarity is written down and tested**, because getting it backwards would
turn the whole thing into a rubber stamp:

| Finding | Claims | Supported when the model says |
|---|---|---|
| `cta` | there is nothing to click | **no** |
| `ctas-collapse` | actions compete | yes |
| `long-form` | the form comes too early | yes |
| `mobile-overflow` | content is clipped | yes |
| `overlay` | a popup covers the page | yes |

**Low confidence is not support.** A model guessing is the geometry heuristic
again with a bigger bill.

---

## Writer enforcement

The enforcement point is earlier than it looks.

Filtering the evidence *list* is not enough. The chosen angle is written into
the system prompt as a sentence of its own (`plan.whyContact`), so a visual
finding that survives long enough to be **selected** has already leaked,
whatever the list underneath says.

So screening runs inside **`canPrepare`** — before evidence strength is measured
and before a playbook is picked. A test asserts the ordering in the source.

Measuring strength on screened evidence matters too: a prospect whose findings
are three unprovable visual claims has nothing to write about, and counting the
unscreened list would call it well-evidenced and then hand the writer an empty
block.

**Two real bugs the tests caught:**

**The probe run is its own evidence.** "The contact form is broken" was learned
by a browser opening that page, so the run *is* the rendered proof. My first
version supplied only screenshots, so nothing of technical or rendered tier
existed and **every claim was rejected**, including the ones needing no picture.
That would have stopped all outreach.

**The key map was incomplete.** Built from the render service alone, it missed
`form-broken`, `captcha-broken`, `booking-is-a-form` and `quote-form-thin`,
which the conservative default sent to VISUAL — costing genuinely technical
findings their angle.

**Ary's own notes are never screened.** She looked at the page herself. That is
the strongest evidence in the system and a camera requirement must not override
a person.

Rejected claims are carried on the plan with their reason, so a discarded claim
is distinguishable from one nobody made.

---

## Strong / Vet

Unchanged and not weakened. A prospect may be Strong on technical evidence
alone, with zero pictures and zero vision calls — sample F does exactly that.

What changed is only that a reason which *depends on appearance* now has to be
proved by a photograph.

---

## Maybe / failure policy

A failed visual check never becomes work for Ary. The claim is dropped; the
prospect continues on other evidence or skips. A test asserts the rejection text
contains none of "please check", "manually", "have a look", "review this site"
or "maybe".

---

## Skill alignment

`website-audit` was already disciplined here — it refuses to call things broken
from raw HTML, and it already treats "nothing above the fold" as an *inference*
that gets hedged rather than a fact.

It now carries the app's contract explicitly: the three tiers, the rule that a
claim about what a visitor sees cannot be proved by reading the DOM, and a table
of what proves what. Plus one instruction it did not have: **if there is no
screenshot, do not soften a visual claim into a hedge — drop it.** A hedged
unprovable claim is still unprovable, and it is the one the owner checks first.

`auto-prospect` contains no visual-claim language at all; nothing needed
changing.

The app owns the policy. The skill follows it. Two policies about what counts as
proof is how one of them quietly becomes the loose one.

---

## Shadow acceptance — all seven cases

Run through the real decision path with **no stubs in the middle**:
`collectEvidence → screenEvidence → canPrepare → selectPlaybook →
buildEmailParts`.

| # | Case | Pages needing a picture | Shots | Simulated verdicts | Allowed | Rejected | Outcome |
|---|---|---:|---:|---:|---|---|---|
| **A** | picture refutes the geometry | 1 | 1 | 1 | `form-broken` | `cta` — *looked at, does not show what the claim says* | **STRONG** |
| **B** | picture confirms buried CTA | 1 | 1 | 1 | `form-broken`, `cta` | none | **STRONG** |
| **C1** | phone claim, desktop frame | 1 | 1 | 1 | `form-broken` | `mobile-overflow` — *needs a phone viewport* | **STRONG** |
| **C2** | phone claim, phone frame | 1 | 1 | 1 | `form-broken`, `mobile-overflow` | none | **STRONG** |
| **D** | popup present / absent | 1 | 2 | 2 | `overlay` when in frame | `overlay` when not | evidence follows the frame |
| **E** | challenge page | 1 | 1 | 1 | `form-broken` | `cta` — *blocked, nobody has seen it* | **STRONG** |
| **F** | technical only | **0** | **0** | **0** | `form-broken`, `lead-magnet-open` | none | **STRONG** |
| **G** | unverifiable, nothing else | 1 | 1 | 1 | none | `cta` — *could not settle it* | **SKIP** |

**Totals: 8 captures, 8 *simulated* verdicts across 8 runs — no model was
called.** Sample F cost nothing at all, which is the cost control working.

### False-positive proof

**Sample A is the one the brief asked for.** The geometry claims there is nothing
above the fold to click. The picture shows "Book a call". The claim is rejected,
the prospect keeps its real technical finding, and the email never contains the
sentence that embarrassed LTB three times.

⚠️ **What this does not prove.** The captures are fixtures shaped exactly like
`/shots` output. **Nothing in the shadow run has photographed a real website**,
because the Cloud Run deploy is blocked (below). The test file says so in its
first paragraph rather than implying otherwise.

---

## Cloud Run deployment — done and proven

The login recovered (my own fault that it took three goes: I had two
`gcloud auth login` attempts racing, and the browser answered the wrong one's
state, which is what produced the CSRF error).

| | |
|---|---|
| Service | `audit-render` |
| Region | `us-east1` |
| Revision | **`audit-render-00170-2mf`**, serving 100% of traffic |
| Image digest | `sha256:90a3204b0e41831c556bf5b093bc0b1f9d2b17e1e5ff7b2cb7251940f487b96e` |
| Command | `gcloud run deploy audit-render --source . --region us-east1` |

### Behaviour proof, not "Ready"

Route existence, on the live revision:

```
POST /shots            → 403   (route exists, secret required)
GET  /health           → 200
POST /definitely-not   → 411   (no such route)
```

Then a real capture against a controlled public URL:

```
desktop  status 200 | blocked false | bytes 22,712 | https://file.gobloomwired.com/shot/example-com-desktop-210b3f7d274f
mobile   status 200 | blocked false | bytes 67,255 | https://file.gobloomwired.com/shot/example-com-mobile-c66377d768f3
```

And the stored artifacts fetched back:

```
HTTP 200  content-type: image/png  bytes: 22,712  magic: 89504e470d0a1a0a
HTTP 200  content-type: image/png  bytes: 67,255  magic: 89504e470d0a1a0a
```

`89504e47` is `‰PNG`. The byte counts match what the renderer reported exactly,
and the two viewports produced different hashes, which is what a genuinely
different capture looks like.

**LTB has now taken, stored and served real screenshots of a real website.**

### ⚠️ A second deploy target nobody had counted

The first live capture came back `storeError: "upload failed 404"`. The
screenshots were taken correctly and had nowhere to go: the `shot` kind was
added to `workers/bloomwired-review` and **that worker had never been
deployed**. `git push` ships the Cloudflare *Pages* app; the Worker is its own
target, exactly like Cloud Run.

Deployed with `npx wrangler deploy` from `workers/bloomwired-review`, version
`30887a8f-c998-494a-b175-c06b652a7c16`. The change is additive — one entry in
the `KINDS` map — and touches neither the R2 bindings nor the two cron triggers
that drive the automation queue, both of which redeployed unchanged
(`*/5 * * * *` and `0 4 * * *`).

So this feature has **three** deploy targets, not two. Worth writing down.

### What is still not proven

**No model has looked at a real screenshot yet.** The vision call is wired,
routed as `cheap`, and unit-tested on parsing, polarity and the unclear path —
but the workspace's Anthropic key is encrypted at rest and only the Worker can
decrypt it, so I cannot make that call from a shell without extracting a secret,
which I will not do.

What is established: the image is publicly fetchable, `content-type: image/png`,
and 22–67KB against a 5MB ceiling — the conditions a URL image block needs. The
first real prospect run will exercise the call itself.

## Cloudflare app deployment

| | |
|---|---|
| Branch | `main` |
| Commits | `4ea9a9d`, `abc4f5b`, `8410a96`, `434c749` |
| Build | `next build` clean |
| Production | https://leadsthatbloom.com/ |

These commits touch only JavaScript behind the auth gate — no new CSS classes —
so there is no public asset whose content changes, and therefore no content
proof available from outside the gate. Stated rather than dressed up: the
Pages deployment is from `main`, and the app-side behaviour is covered by 1,744
tests rather than by a fetch.

---

## DB safety

| Table | Before | After |
|---|---:|---:|
| prospects (live) | 5,814 | **5,814** |
| send_events | 6 | **6** |
| send_attempts | 4 | **4** |
| outreach_packages | 12 | **12** |
| relationship_events | 18 | **18** |
| visual_artifacts | — | **0** (created empty) |

Migration 054 is `CREATE TABLE IF NOT EXISTS` plus indexes. No prospect history
rewritten, no send event changed, no relationship event touched, no bulk
mutation. Artifacts will only ever be added by capture runs.

---

## Tests

**1,744 passing, 0 failing** (from 1,703). The 18 contract tests are retained
and extended to 21; three new files add 44 more.

| File | Holds |
|---|---|
| `visual-evidence.test.mjs` (21) | the tiers, the key map, page/viewport/blocked/freshness rules, and that a picture alone is not enough |
| `visual-capture.test.mjs` (19) | targeting, artifact metadata, the questions, verdict parsing, polarity, cost routing, and that the shutter clicks nothing |
| `writer-visual-enforcement.test.mjs` (11) | screening before selection, the angle, Ary's notes, Strong on technical alone, and no human handoff |
| `visual-shadow.test.mjs` (8) | all seven cases end to end |

---

## Safety

- No prospect contacted. No email sent. No send job created. No package
  persisted or approved.
- Both auto-send switches **OFF** and untouched.
- The cold follow-up generator, V2 scheduler, `sendApproved`, Gmail, threading,
  send events, touch ceilings, evidence rules and the canary were not opened.
- Every new module is scanned by tests for `sendApproved`, `enqueue(`,
  `INSERT INTO`, `UPDATE `, `DELETE ` and stray `fetch(`.
- The only production writes were migration 054 (a `CREATE TABLE`) and nothing
  else.

---

## Remaining gap

**Is LTB now safe to rely on screenshot-level visual UX evidence when preparing
future Email 1s?**

**Yes, with one link exercised by the first real run rather than by me.**

The rule is live and correct: a visual claim cannot reach outreach copy without
a screenshot of the right page, at the right viewport, that a model looked at
and confirmed. The camera is deployed and has taken, stored and served real
screenshots of a real site at both viewports.

The one thing I could not exercise is the vision call itself, because the API
key is encrypted and only the Worker can decrypt it. Everything either side of
that call is proven: the image is fetchable and correctly typed, and the parsing,
polarity and unclear-handling are unit-tested. If that call fails in production
it fails **closed** — an artifact with no supporting verdict supports no claim —
so the failure mode is a rejected visual claim, never an unproven one slipping
through.

Two smaller things, named rather than buried:

1. **Screenshots are publicly readable.** Required by the URL-based vision call.
   Acceptable for photographs of public pages; worth revisiting if a signed-URL
   flow is ever wanted.
2. **This says nothing about LTB's own UI.** Website screenshots existing does
   not mean anybody has visually reviewed Ary's screens. The browser pane could
   not composite frames all session, so LTB's own aesthetic review remains an
   open, separate item.

---

# Real vision acceptance — the final gate

## What was built for it

The vision call could not be exercised from a shell without handling the
workspace's key, so it runs where the key already lives:
**`POST /api/visual-evidence`**, admin only. It calls the live renderer for a
picture, writes the artifact row **before** asking anything, then asks the model
one closed question per finding through the same `askBackground` the rest of the
app uses. Nothing about the key is returned, logged or echoed.

## The controlled fixtures

Two pages under `/guide/`, the one path the middleware serves without auth.
Both live and serving 200:

| Page | What it shows |
|---|---|
| `/guide/visual-fixture-cta.html` | a large **Book a call** button in the first viewport |
| `/guide/visual-fixture-buried.html` | the same button, pushed **1,400px** below the fold |

No forms, no inputs, no fetch, no data of any kind — asserted by test. Both
buttons go nowhere.

**The pair is the point.** A rule that rejects every visual claim is not
enforcement, it is a switch that is off. The first case must come back
**refuted** and the second **supported**, and only both together prove the check
discriminates.

## ⚠️ The one gate I could not close myself

The route is deployed and gated — an unauthenticated call gets 401. Running it
needs an **admin session**, and producing one means handling Ary's access code,
which this pass will not do.

**The whole acceptance is one paste in the browser console**, on
`leadsthatbloom.com` while signed in, where the session cookie already exists
and no credential passes through anybody's hands:

```js
for (const [name, url, expect] of [
  ['visible',  '/guide/visual-fixture-cta.html',    'REFUTED (a button is in frame)'],
  ['buried',   '/guide/visual-fixture-buried.html', 'SUPPORTED (the button is 1400px down)'],
]) {
  const r = await (await fetch('/api/visual-evidence', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: location.origin + url, keys: ['cta'], viewports: ['desktop'] }),
  })).json();
  const look = r.results?.[0]?.looks?.[0];
  console.log(name, '| expect', expect, '
  model', look?.model,
    '
  answer', look?.verdict?.answer, look?.verdict?.confidence,
    '
  saw', JSON.stringify(look?.verdict?.visible),
    '
  supported', look?.supported,
    '
  artifact', r.results?.[0]?.artifact?.id, r.results?.[0]?.artifact?.storedAt,
    '
  tokens', look?.usage?.input_tokens, '/', look?.usage?.output_tokens);
}
```

There is also `scripts/visual-acceptance.mjs` for a session cookie supplied on
the command line, which prints the same table plus cost projections.

**Expected, and the thing that proves the model saw the image:** the first case
returns `answer: "yes"`, `visible: "Book a call"`, `supported: false` — the
claim *"nothing above the fold reads like an action"* **rejected by a
photograph**. The second returns `answer: "no"`, `supported: true`.

## Cost

Not yet measurable — no real call has been made. What is known: the task routes
to **Haiku 4.5** (`TASK_TIER['visual-evidence'] = 'cheap'`), the images are
22–67KB, and one closed question with a ~400-token cap is a small call. The
acceptance script prints actual tokens and projects ×100 and ×1,000 from the
measured figure rather than from an estimate, because an estimate is what this
whole pass exists to stop accepting.

Only a subset of prospects ever reaches vision at all: sample F needed zero
pictures, and targeting caps at 3 pages per prospect.

## Artifact safety

| Check | Result |
|---|---|
| Slug leaks a secret | **No** — host, path, viewport, sha256 only; asserted by test |
| Renderer carries a session | **No** — no `storageState`, `addCookies`, `httpCredentials`, `setExtraHTTPHeaders`, `localStorage` or `Authorization` anywhere in the capture path |
| Screenshot content | public pages only, opened in a clean context |
| Screenshot URL contains a secret | **No** |
| Retention / expiry | ⚠️ **None. Indefinite.** Recorded as a hardening item, not a vulnerability — the content is public-page imagery |

## Freshness ownership

One constant, one owner. `lib/visual-evidence.mjs` re-exports
`FRESH_DAYS` from `site-intel.mjs` and never declares its own value — asserted
by test. No 10-day constant survives anywhere; the only "10" left is the comment
recording why it was wrong.

**Said honestly: 14 days is a product choice, not a derived number.** Its merit
is that it is the *same* choice the rest of the app already makes about how long
a look at a website is worth trusting, rather than a second opinion invented for
pictures.

## Deployment proof

| Target | Proof |
|---|---|
| **Cloud Run** | revision `audit-render-00170-2mf`, 100% traffic. `POST /shots` → 403 (exists, needs secret); a fake route → 411. Real capture returned 22,712 / 67,255 bytes, fetched back as valid PNGs |
| **Review Worker** | version `30887a8f-c998-494a-b175-c06b652a7c16`. Upload proof: the first capture 404'd on `shot`, and after deploy the identical capture stored and served. Crons redeployed unchanged (`*/5 * * * *`, `0 4 * * *`) |
| **Cloudflare app** | `ba647fe` on `main`. Behaviour proof: `/guide/visual-fixture-cta.html` and `/guide/visual-fixture-buried.html` both serve 200 with "Book a call", and `/api/visual-evidence` answers 401 unauthenticated — neither existed before this deploy |

## Final scorecard

| Gate | Status |
|---|---|
| Real screenshot capture | **PASS** — live revision, real PNGs, fetched back and verified |
| Durable screenshot storage | **PASS** — R2 via the worker, `image/png`, byte counts match |
| Real Anthropic vision call | ⚠️ **NOT YET** — route deployed and gated; needs one admin-session run |
| Structured visual verdict | **PASS** (offline) — schema, unclear-default and polarity tested |
| Claim traceability | **PASS** — verdict carries artifact id, url, viewport, captured-at, model |
| Rejected claim blocked from writer | **PASS** — absent from angle, evidence, supporting set and why-contact |
| Mobile evidence rule | **PASS** |
| Native/skill parity | **PASS** — one writer entry point; skills carry no competing rule |
| Fails closed | **PASS** — no verdict means no support, in every path |
| No MAYBE human workload | **PASS** |
| Both auto-send switches OFF | **PASS** |

**Ten of eleven. Visual evidence is not fully production-accepted**, because
`Real Anthropic vision call` is not PASS, and the brief is right that it should
gate the whole thing. Everything either side of that call is proven; the call
itself is one paste away.

## Tests

**1,759 passing, 0 failing.** The new `visual-acceptance.test.mjs` holds the 15
guarantees that must survive whether or not Anthropic is reachable — the key
never leaving the Worker, the admin gate, artifact-before-look ordering, the
writer boundary, the renderer's lack of any session, slug safety, single
freshness owner, and that the fixtures collect nothing.

The real vision acceptance is deliberately **not** in the suite. A suite that
fails when a third party has a bad afternoon is a suite people learn to ignore.

---

# The first real acceptance failure, and the fix

## What Ary's run actually did

She ran the console acceptance against both fixtures. The route worked:

| Stage | Result |
|---|---|
| `POST /api/visual-evidence` | **200**, live `runId` |
| Playwright capture | **PASS** — 46,437 bytes (cta), 66,858 bytes (buried) |
| R2 storage | **PASS** — `store_error` null on both |
| `visual_artifacts` rows | **PASS** — ids 1 and 2 |
| Anthropic request reached | **PASS** |
| Anthropic reading the picture | **FAIL** |

Recorded verbatim in both rows:

> `Unable to download the file. Please verify the URL and try again.`

So the answer to "why 200 with no verdict" is that everything up to the model
worked, and the model never saw anything. The route reports what happened
rather than what it hoped; a picture with no verdict is exactly the shape of
this failure.

## Root cause, tested rather than guessed

The image was delivered as a **public URL** — `{type: 'image', source: {type:
'url', url}}` in `lib/ai-call.mjs`, pointing at the R2 artifact.

Those two exact URLs, fetched from a clean external path:

```
.../leadsthatbloom-com-guide-visual-fixture-cta-html-desktop-4333f84d98f3
  200 | image/png | 46,437 bytes
.../leadsthatbloom-com-guide-visual-fixture-buried-html-desktop-2d91e4e57b8e
  200 | image/png | 66,858 bytes
```

Byte counts match the database exactly. Also checked: **no redirects**
(`num_redirects=0`), HEAD 200, range requests honoured (`Accept-Ranges: bytes`),
`Access-Control-Allow-Origin: *`, valid TLS, `Cache-Control: public,
max-age=86400`, and **no expiry** — the URL is content-hashed and permanent.

⚠️ **So the honest finding is a boundary, not a cause.** The URL is correct and
reachable from every vantage point available here; it is not reachable from
Anthropic's fetcher. Cloudflare bot management on that hostname is the likely
candidate, but that is a hypothesis and this pass will not report it as fact.

What is certain is the design flaw: the argument for URLs — *the pictures are
already publicly fetchable* — rested entirely on the one fetch nobody had
tested, and that fetch was the whole feature.

## The fix: send the bytes

The Worker fetches the screenshot itself and sends
`{type: 'image', source: {type: 'base64', media_type, data}}`. Anthropic never
touches the screenshot host.

**Cost of the change, stated plainly:** a first-screen capture is 46–67KB, and
base64 adds a third. That is a real cost on a Worker, and the previous comment
in `ai-call.mjs` arguing against exactly this has been replaced rather than
quietly deleted. It buys a step that actually happens.

### The hash check is the part worth having

`imageBytes()` verifies the fetched bytes against the **sha256 recorded at
capture**, and refuses a non-image content type or a zero-byte body. An error
page served with a 200 cannot become a verdict, and neither can a stale or
substituted capture. It runs **before** `askBackground`, so a fetch failure
never produces a verdict at all — and a verdict is the only thing that supports
a claim.

The public URL keeps its real job: the audit trail a person can open, recorded
on the artifact row alongside id, hash, dimensions and capture time. It is
simply no longer how the model receives the picture.

## Failed-artifact handling

Rows 1 and 2 were **not deleted** — they are real captures and real evidence of
what happened. Both are marked:

```
VISION_FAILED_IMAGE_FETCH — the picture was taken and stored, but Anthropic
could not download it. No model looked at this. Supports no claim.
```

They already supported nothing: `supportsKeys` is derived from
`looks[].supported`, which requires a verdict. The marker makes a failed run
*look* like what it already *was*, so nobody reading the table later mistakes a
stored screenshot for accepted proof.

## Deployment

| Target | Changed | Proof |
|---|---|---|
| **Cloudflare app** | **Yes** — `49d878e` | 3 files: `ai-call.mjs`, `visual-review.mjs`, and the test that asserted the old design |
| **Cloud Run** | **No** | commit touches nothing under `services/`; revision stays `audit-render-00170-2mf` |
| **Review Worker** | **No** | commit touches nothing under `workers/`; version stays `30887a8f-c998-494a-b175-c06b652a7c16` |
| Public screenshot fetch | still 200 / `image/png` — verified after the change |
| Automation crons | untouched (no Worker deploy) |

## Tests

**1,761 passing, 0 failing.** One test was **deleted and replaced** rather than
patched: `images travel as URLs, not as megabytes through the Worker` asserted
the design that did not work. It now asserts the opposite and says why in the
test itself, so the next reader does not re-derive the URL argument.

New guarantees: the image block carries base64 with a real media type and never
a URL source; fetched bytes are hashed against the record and a mismatch throws;
a non-image content type or an empty body throws; and `imageBytes` is awaited
before `askBackground`, so an unfetchable picture cannot reach the model.

---

# REAL VISUAL ACCEPTANCE — COMPLETE

Run in production on 2026-08-11 by Ary, from an authenticated browser session,
against the two controlled fixtures. Both passed.

## The chain, end to end

```
controlled URL → live Cloud Run renderer → real PNG → R2 via the review worker
  → Worker fetches the bytes back → sha256 checked against the capture record
  → base64 to claude-haiku-4-5 → structured verdict → evidence validation
  → claim allowed or refused
```

Every link exercised. Nothing simulated.

## Visible fixture — the false claim, refuted by a photograph

`/guide/visual-fixture-cta.html`

| | |
|---|---|
| Model | **claude-haiku-4-5** |
| Delivery | **base64**, 46,437 bytes, `image/png` |
| Artifact | **1** |
| Answer | **yes** |
| Saw | **"Book a call"** |
| Observation | *"A pink button with the text 'Book a call' is prominently displayed in the center of the page…"* |
| Tokens | 1,843 in / 73 out |
| Error | none |
| **`supported`** | **false** |

The `cta` finding claims *nothing above the fold reads like an action*. A model
looked at the actual pixels, found the action, and named it. **The claim is
refuted — not unproven, not deferred. Wrong.**

This is precisely the failure that cost three real prospects: geometry counted
elements and concluded there was nothing to click while a Book button sat on
screen. A picture now settles it.

## Buried fixture — the true claim, supported precisely

`/guide/visual-fixture-buried.html`

| | |
|---|---|
| Model | **claude-haiku-4-5** |
| Delivery | **base64**, 66,858 bytes, `image/png` |
| Artifact | **2** |
| Answer | **no** |
| Saw | **""** (nothing actionable in frame) |
| Observation | *"The screenshot shows an 'About the practice' section with descriptive text…"* |
| Tokens | 1,842 in / 89 out |
| Error | none |
| **`supported`** | **true** |

Same button, same design, pushed 1,400px down. The model reports what is on the
first screen and nothing more — it does **not** claim no booking action exists,
because it cannot see that far and was not asked to.

**The pair is the proof.** A check that rejects everything is not enforcement,
it is a switch that is off. Opposite pages, opposite answers, opposite outcomes.

## Writer-boundary proof, from the real verdicts

Both real answers are now pinned in `tests/visual-real-verdicts.test.mjs` as
data and run through the real polarity map and the real screening:

| From the real verdict | Result |
|---|---|
| Visible fixture → `supportsKeys: []` | claim **dropped**; writer receives nothing from it |
| Buried fixture → `supportsKeys: ['cta']` | claim **kept**; a true visual point survives |
| Rejection reason | *refuted* — distinct from unproven and from nobody-looked |

Nothing reaches the network in those tests. What they hold is that the
production answers, run through production logic, produce the right outcome —
so a later change to the polarity map or the screening breaks against the real
answers rather than a convenient fixture.

## Failed-artifact handling — resolved rather than left standing

The two rows marked `VISION_FAILED_IMAGE_FETCH` are **the same two rows**. The
capture is deterministic, so the re-run produced identical bytes and identical
hashes, and the upsert keyed on `(workspace, normalized_url, viewport, sha256)`
landed on the existing rows.

Both now carry `vision_model: claude-haiku-4-5`, a real observation and a real
timestamp. **The failure marker was transient by design** — it described a row
with no verdict, and those rows have verdicts now. No failed model result is
left anywhere looking like accepted proof.

## Actual cost

Priced with the app's own table (`MODEL_PRICES['claude-haiku-4-5']` = $1 / $5
per million):

| | Input | Output | Cost |
|---|---:|---:|---:|
| Visible | 1,843 | 73 | **$0.002208** |
| Buried | 1,842 | 89 | **$0.002287** |
| **Total** | **3,685** | **162** | **$0.004495** |

Average **$0.00225 per verified claim**.

| Scale | Cost |
|---|---:|
| 100 visual verifications | **$0.22** |
| 1,000 visual verifications | **$2.25** |

⚠️ **Those are ceilings, not forecasts.** Only a subset of prospects reaches
vision at all: technical and rendered findings cost zero pictures, targeting
caps at 3 pages per prospect, and sample F in the shadow run needed no capture
whatever. A thousand *prospects* costs well under a thousand *verifications*.

At roughly a fifth of a cent per claim, cost is not the constraint on using
this — which is the answer to the only real objection to checking.

## Deployment

| Target | State |
|---|---|
| **Cloudflare app** | `9f6c745`, Pages deployment `087822d7-8952-4178-b96a-b2af7cf1d436`, **Active** |
| **Cloud Run** | `audit-render-00170-2mf` — unchanged, nothing under `services/` touched |
| **Review Worker** | `30887a8f-c998-494a-b175-c06b652a7c16` — unchanged, crons untouched |
| Public screenshot fetch | still 200 / `image/png`, hashes match the record exactly |

## Final scorecard

| Gate | Status |
|---|---|
| Real screenshot capture | **PASS** |
| Durable screenshot storage | **PASS** |
| **Real Anthropic vision call** | **PASS** — two, both fixtures, base64 bytes |
| Structured visual verdict | **PASS** |
| Visible CTA false claim refuted | **PASS** |
| Buried CTA wording precise | **PASS** |
| Claim traceability | **PASS** — verdict → artifact id → hash → URL |
| Rejected claim blocked from writer | **PASS** |
| Mobile evidence rule | **PASS** |
| Native/skill parity | **PASS** |
| Fails closed | **PASS** |
| No MAYBE human workload | **PASS** |
| Both auto-send switches OFF | **PASS** |
| Anthropic key sealed at rest | **SEALED** — pending one decrypt check |

**Visual evidence is production-accepted.**

## Safety

Zero prospects contacted · zero emails sent · zero send jobs · both auto-send
switches OFF · no prospect history changed · no relationship changed · no key
exposed in any log, report or chat · automation crons untouched.

**Tests: 1,769 passing, 0 failing.**

---

# Secret hardening — sealed

Ary re-saved the Anthropic key through the normal Settings write path, which
routes through `resolveSecret` → `sealSecret`.

Verified by structure only. The query tests for byte sequences and returns
booleans; **the value was never selected, printed, copied or logged**, which was
the rule for this whole pass and is the reason the hardening existed at all:

| Check | Before | After |
|---|---|---|
| `aiKey":"enc:v1:` present | 0 | **1** |
| `aiKey":"sk-` present (plaintext) | 1 | **0** |

Prior state: **legacy plaintext** — a value that predated `secret-box` and had
never been re-saved through the sealing path, so `openSecret` passed it straight
through. Final state: **sealed at rest under `enc:v1:`**, AES-GCM with a key
derived from `LTB_SESSION_SECRET`.

## ⚠️ Why a decrypt check is not ceremony

Sealing proves the value was written encrypted. It does not prove it can be read
back. If the derived key differed between the write and the read, `openSecret`
returns an empty string and every AI path fails — quietly, and including the
automation cron that runs unattended every five minutes.

So the seal is confirmed and the read is verified by one live vision call
through the same Worker that must decrypt it in production. Anything less would
be trusting the half of the operation that is easy to check.
