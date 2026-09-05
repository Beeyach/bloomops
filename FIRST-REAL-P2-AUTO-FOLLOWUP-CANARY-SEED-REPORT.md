# Every button says book, and every button goes to a form

Date: 2026-08-12 · candidate **3163** · package **20** · 60 credits spent of a 100 ceiling

One real P2 prospect, one package with both touches, nothing approved and
nothing sent.

**0 emails sent. 0 approvals. Package automation permission OFF. Both switches OFF.**

---

## Part 14 — the live sweep prerequisite

> **LIVE SWEEP ACCEPTANCE STILL PENDING**

The last daily sweep ran at `2026-08-12 04:00:29 UTC`. The scheduler deployed at
`21:02 UTC`. No sweep has run on the new code, and none was forced. The next
natural one is `2026-08-13 04:00 UTC`.

This is not a blocker for the seed, and it **is** a prerequisite before the
global follow-up switch is ever turned on.

## Part 1 — the candidate pool, read fresh

"Safe" means: not deleted, never emailed, no reply, no DNC, no unsubscribe, a
prospectable stage, and no existing package, send event, reply event or
relationship event.

| | Count |
|---|---|
| Safe and prospectable, any shape | **4,602** |
| 1. Email-bearing, no usable evidence | **364** |
| 2. Evidence-bearing, no usable email | **63** |
| 3. Email + evidence, unrated and unpackaged | **3** |
| 4. Rated 💙 (P2), safe and unused | **0** |
| Rated 🥀 (P2, dead site), safe and unused | 36 |
| Rated 💚 (P1), safe and unused | 964 |
| Email + evidence fresher than 14 days, any rating | 27 |

The P2 pool is thinner than the raw numbers suggest. 💚 is P1 and out of scope
for this pilot; ✖️ is P3 and has no follow-up; 🥀 means the website is dead,
which cannot support a verifiable reason. That leaves unrated prospects, which
package as P2 with `allowed_length = 2` — Cynthia's shape.

## Part 2–3 — free filtering first

All three of the ready-made candidates failed on free evidence alone, before a
credit was spent:

| Prospect | Business | Free finding | Verdict |
|---|---|---|---|
| 3174 | Bliss Therapy Co. | `worth: false`, score 6, only `ctas-collapse` | **rejected** — not enough for two minutes of anyone's attention |
| 4966 | Resilient Intimacy | `worth: true`, score 18, but keys are exactly `dead-links` + `stale-copyright` + `no-reviews` | **rejected** — the filler the brief names as disqualifying |
| 5058 | Soul Counseling | blocked, HTTP 429 | **rejected** — a challenge page cannot support any claim |

So the shortlist had to come from the 364 email-bearing prospects with no
evidence yet. Filtered for free down to **208** with a real website, no
free-mail address and no platform host, then to **48** that were also unrated
(the only band that packages as P2).

### The free shortlist

Ranked by contact safety, then likely evidence, then offer fit, then simplicity.

| Prospect | Business | Email | Site | Ownership | Intel | Paid check warranted |
|---|---|---|---|---|---|---|
| **3163** | AZ Therapy Quest LLC | brianda@aztherapyquest.com | aztherapyquest.com | SAME_DOMAIN | none | **yes** |
| **3786** | The Jess Effect | Jess@thejesseffect.com | thejesseffect.com | SAME_DOMAIN | none | **yes** |
| **4572** | Janine Dowling Coaching | janine@janinedowlingcoaching.com | janinedowlingcoaching.com | SAME_DOMAIN | none | **yes** |
| 3279 | HALO Healing Therapies | alisia@halohealingtherapies.com | halohealingtherapies.com | SAME_DOMAIN | none | held in reserve |
| 4567 | Izzie Sadler Functional Medicine | is@izziesadler.com | izziesadler.com | SAME_DOMAIN | none | held in reserve |
| 3278 | Growable Coaching | sarita@growablecoaching.com | growablecoaching.com | SAME_DOMAIN | none | held in reserve |
| 3859 | Trina Goodwin Coaching | trina@trinagoodwincoaching.com | trinagoodwincoaching.com | SAME_DOMAIN | none | held in reserve |
| 4849 | Oasis to Zen | cheri@oasistozen.com | oasistozen.com | SAME_DOMAIN | none | held in reserve |

Every one is a named person or a role address on the business's own domain — no
third-party or free-mail primary contact anywhere on the list.

## Part 4 — paid prechecks

`PRICES.precheck` read from production: **20 credits**. Cap 5 checks, **100
credits maximum**. Projected maximum spend stated before spending: 100.

Run through the canonical `VERIFY_SITE` job on the production runner, so the
render secret stayed on the server and every charge went through the normal
credit ledger. No `site_intel` was hand-edited.

| Prospect | Result | Score | Keys | Verdict |
|---|---|---|---|---|
| **3163** | `worth: true` | **13** | `ctas-collapse`, `no-reviews`, **`booking-is-a-form`** | **PASS** |
| 3786 | `worth: false` | 9 | `no-hours`, `no-reviews` | rejected — filler only |
| 4572 | `worth: false` | 8 | `no-meta-description`, `no-hours` | rejected — filler only |

**Spent: 60 credits of 100.**

Honest note on stopping early: 3163's result landed at 21:45 and I stopped
queueing there, but job 576 for 4572 had already been enqueued at 21:42 and ran
at 21:53 before I could stop it. `lib/queue.mjs` has no cancel helper, and
hand-writing an `UPDATE` against the queue to save 20 credits was not worth
inventing a mutation path for. Two of the five allowed checks went unused.

## Part 5 — the evidence

```json
{
  "tier": "verified",
  "text": "Booking is a request form, not a calendar",
  "source": "https://aztherapyquest.com",
  "observedAt": "2026-08-12T21:46:26.239Z",
  "confidence": "high",
  "method": "browser check, auto",
  "key": "booking-is-a-form"
}
```

**FIT** — a therapy practice in Phoenix, Arizona. Exactly Bloomwired's shape.

**CONTACT REASON** — every booking call to action leads to a contact form
instead of a calendar.

**IN-SCOPE** — shortening a booking path is work Bloomwired actually sells.

**SUFFICIENT** — `evidence_level: strong`, five pages checked, nothing blocked.

### Verified independently, for free, before trusting it

The `booking-is-a-form` detector has been changed four times this session
(literal "book" link text, followed-calendar suppression, off-site scheduling
paths, decorative calendar icons, date-picker evidence), so I checked the claim
by hand rather than taking the score:

```
homepage — every booking CTA resolves to /contact/
  "Schedule a Consultation"       -> /contact/
  "BOOK YOUR CONSULT"             -> /contact/
  "BOOK YOUR FREE CONSULTATION"   -> /contact/
third-party scheduler hosts in HTML: NONE
forms: 0   iframes: 0

/contact/ — HTTP 200, 335,787 bytes
  <form>: 1 (Fluent Forms)   inputs: 65   textareas: 4
  input types: text, hidden, radio, email, tel, checkbox   — no date input
  iframes: 2, both Google Maps
  scheduler hosts: NONE
```

Checked against 25 scheduler hosts including the `clientsecure.me` and
`headway`/`alma` paths added earlier. There is no off-site booking flow to
suppress the finding, and no date picker to mistake for a calendar. **The claim
holds.**

`no-reviews` and `ctas-collapse` are on the record but are **not** the angle —
the package leads with the booking path, which is the one strong, simple,
verifiable fact.

## Part 6 — contact safety

| | |
|---|---|
| Email | `brianda@aztherapyquest.com` |
| Ownership | **SAME_DOMAIN** — mailbox domain equals the website domain exactly |
| Business | AZ Therapy Quest LLC, Phoenix AZ, US |
| Previous sends | **0** |
| Replies | **0** |
| DNC / unsubscribe | **0 / 0** |
| Relationship events | **0** |
| Existing packages | 1, the one just prepared |
| Internal or test address | **no** |
| Contact data changed by me | **none** |

⚠️ The prospect row has `name: null`, so no person's name is verified. The
generator used the business name in the greeting rather than guessing "Brianda"
from the mailbox — which is the name guard behaving correctly. It does mean the
greeting reads **"Hi AZ Therapy Quest LLC,"**, with the LLC. Flagged rather than
hand-edited; see below.

## Part 7 — P2 qualification

Unrated, so the band is P2 with exactly two touches. `allowed_length = 2`, no
Email 3, concrete micro-offer, signature exactly `Thanks,` / `Ary`. Not forced:
the same preparation path would have produced P1 for a 💚 and P3 for a ✖️.

## Part 8 — the package

**Package 20**, produced by the canonical pipeline with no intervention from me.
Queueing the precheck was enough — production ran `verify-site` → `vet` →
`prepare-outreach` on its own:

```
job 574  verify-site      done  21:42 → 21:45
job 577  vet              done  21:46
job 579  prepare-outreach done  21:50
```

| Field | Value |
|---|---|
| status | `READY_FOR_APPROVAL` |
| priority_band | **P2** |
| allowed_length | **2** |
| sequence_approved | **0** |
| sequence_max_step | **null** |
| auto_followup_approved | **0** |
| approved_fingerprint | **null** — created at approval |
| playbook | `booking-friction` |
| prepared_by | `native` |
| generator_version | `outreach-2026-08-09.3` |
| evidence_level | `strong` |
| credits_spent | 20 |

## Part 9–10 — the copy

### Email 1 — `your booking form vs a calendar`

```
Hi AZ Therapy Quest LLC,

I looked at your booking page and saw that it works as a request form rather
than a calendar someone can pick a time from. That caught my eye because it
means each booking needs a reply back and forth before a time is set. One thing
I could not tell from the outside is whether that is set up this way on purpose,
maybe you want to screen requests before confirming a time. If that is the case,
this is already handled and there is nothing to fix. If you would find it useful,
I can send over the two or three steps I would cut from the booking path to make
it quicker to land on a set time.

Thanks,
Ary
```

### Email 2 — `quick note on your booking form`

```
Hi AZ Therapy Quest LLC,

Still glad to send over the two or three steps I'd cut from your booking form to
get people onto a set time faster, no back and forth needed. Just say the word
if that's useful.

Thanks,
Ary
```

### Against the writer contract

| | |
|---|---|
| Verified observed fact | ✅ the request form, from the browser check |
| What we could not tell from outside | ✅ "whether that is set up this way on purpose" |
| Concrete micro-offer | ✅ "the two or three steps I would cut" — fulfillable, and only if she accepts |
| Peer or industry generalisation | none |
| Unsupported outcome inference | none — "needs a reply back and forth" is the mechanism of a request form, not a claim about lost leads |
| Banned filler opener | none — Email 2 opens "Still glad to send over…" |
| Fake urgency, invented pain | none |
| Unverified visual claim | none — the finding is rendered, not visual |
| Signature | exactly `Thanks,` / `Ary` |
| Em dashes | none |

Two things for you to judge rather than me:

1. **The greeting.** "Hi AZ Therapy Quest LLC," is stiff, and the LLC is
   unnecessary. The name guard is right not to guess "Brianda" from the mailbox,
   but you may prefer a nameless opener. Your edit, in the app.
2. **Contractions drift.** Email 1 writes "I would" and "that is"; Email 2 writes
   "I'd" and "that's". Not a contract breach, just inconsistent.

Both are left exactly as generated. Nothing was hand-edited.

## Part 11 — acceptance, read-only

| Check | |
|---|---|
| one package created | ✅ |
| P2 | ✅ |
| `allowed_length = 2` | ✅ |
| Email 1 stored | ✅ |
| Email 2 stored | ✅ |
| no Email 3 | ✅ |
| `sequence_approved = 0` | ✅ |
| `sequence_max_step = null` | ✅ |
| `auto_followup_approved = 0` | ✅ |
| no approval fingerprint yet | ✅ |
| `emails_sent = 0` | ✅ |
| `send_events` for 3163 | **0** |
| `send_events` total | **10**, unchanged |
| `AUTO_SEND_FIRST` / `AUTO_SEND_FOLLOWUPS` | **false / false** |

Nothing disagreed.

## Part 13 — canary suitability

If both emails are approved and Email 1 is sent by hand, can package 20 become
the first automatic Email 2 canary?

| Requirement | |
|---|---|
| P2 | ✅ |
| exactly two stored touches | ✅ |
| sequence approval path exists | ✅ the card offers it once Email 1 is approved |
| `pilotEligible` will accept it after Email 1 | ✅ band P2, length 2, `sequence_max_step` 2 after full approval, Email 2 present, fingerprint current, thread present once sent |
| automation control meaningful after Email 1 | ✅ the card shows it for P2 + sequence approved + Email 1 sent |
| same Gmail thread reused | ✅ `threadFor()` reads the step-1 `provider_thread_id` |
| day 4 from the real send event | ✅ `anchorSource: "send event"` |
| scheduler requires package permission | ✅ `automation-not-approved` otherwise |
| runner rechecks reply, permission, fingerprint, window | ✅ all four independently |
| a human reply kills automatic Email 2 | ✅ `declined` / `NEEDS_HUMAN`, as Cynthia proved |

**Not armed. Not approved. Nothing sent.**

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Packages approved | **0** |
| Sequence approvals | **0** |
| Auto-followup grants | **0** |
| Switch changes | **none** |
| Contact data adopted or changed | **0** |
| `site_intel` hand-edited | **0** |
| Credits spent | **60** of a 100 ceiling |
| Cynthia / package 19 touched | **no** |
| P1 Email 3 | not enabled |

## The next human action

Open Today → Ready for approval, read package 20, and decide whether the copy is
right. Nothing after that happens without you.
