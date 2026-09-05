# Native Gmail send — live acceptance test

One real email, approved and sent entirely inside Leads That Bloom, with both
auto-send switches off the whole time.

| | |
|---|---|
| Recipient | `arylombres@gmail.com` (Ary's own inbox, named by her) |
| Sent from | `hello@bloomwired.io` |
| First send | 2026-08-10 15:02:06 UTC · 08:02 America/Los_Angeles, `19fec31f91df0feb` |
| Second send | 15:37:26 UTC, `19fec52555cf0057` |
| Third send | 15:49:59 UTC, `19fec5dd1ff08aaf` |
| Emails sent | **3**, all to Ary's own inbox |
| `AUTO_SEND_FIRST` | **OFF**, start to finish |
| `AUTO_SEND_FOLLOWUPS` | **OFF**, start to finish |
| Production at test time | `5b690f3` |

---

## Phase 1 — what the test found before anything was sent

The brief asked what is supposed to happen after **Approve draft** with automatic
first sending off. The honest answer was **nothing could**, and that answer took
three separate blockers to establish.

1. `SEND_APPROVED` was enqueued from exactly one place, `app/api/outreach/route.js`,
   inside `if (policy.autoSendApprovedFirstEmails)`. Off, so nothing ever queued.
2. `canSendNow()` returned `AUTOMATION_OFF` as its **first** answer, so even a
   hand-made job would have been refused.
3. `GET /api/outreach` selected only `READY_FOR_APPROVAL` and `NEEDS_DECISION`,
   so an approved package vanished off the screen entirely.

Root cause: the switch is named for and documented as gating **automatic**
sending, and the guard used it to gate **all** sending. A person pressing a
button is not automation.

**Fixed in `a3d8a18`.** A `manual` flag skips two things and only two: the
automation switch, and the fifteen-minute pause after approval, which exists so
a timer cannot fire before a change of mind and protects nothing when approving
and sending are two separate deliberate presses. Everything else still applies,
each with a test: approval, fingerprint, copy coverage, changed address,
unsubscribe, do-not-contact, decline, client, duplicates, mailbox health, send
scope, daily and hourly caps, and the send window.

There is no second sending system. The button calls the same `sendApproved()`
path the scheduler uses.

---

## Two more bugs, both found by running the test rather than by reading code

### The approved card looked like a broken one — `b2d7dc0`

The API returned the approved package correctly. The component then sorted it by
"status is not READY_FOR_APPROVAL" into the pile headed **Nothing verified yet**,
which renders a bare name over an *Open prospect* link. So an approved package
appeared on Today as a problem, the Send now button never rendered, and copying
into Gmail was still the only way to finish. Separately, approving removed the
row from local state, so even with the sorting fixed the card only came back
after a manual reload.

### Every approval was born stale — `5b690f3`

The first real press of Send now answered:

> "The package changed after it was approved, so what was approved is not what
> would be sent."

Nothing had changed. Nobody had touched the row.

The approve handler built a second object to fingerprint, next to the row it
actually wrote, and the two disagreed in three places:

| field | on the fingerprinted copy | on the row |
|---|---|---|
| `sequence_max_step` | the final length | `null` unless the sequence was approved too |
| `edited_subject` / `edited_body` | uncapped | sliced to 300 / 8000 |
| `contact_email` | filled from the prospect | not written |

The first fires on **every ordinary approval**. So the stored fingerprint
described a package that had never existed, recomputing it from the real row
could never match, and the guard refused the send — correctly, on its own terms.

⚠️ Nothing caught it because nothing could reach the check. **It would have
blocked automatic first sending in exactly the same way on the first morning
that switch was ever turned on**, and the message it prints points at the draft
rather than at the handler that wrote the fingerprint.

Now there is one object: the fields are built once, the fingerprint is computed
from those fields, and those same fields are written.

---

## Phase 2 — the controlled live send

The package was prepared through the real pipeline, not by hand: prescreen →
site check → vet → prepare-outreach, on the test prospect **Ary Test /
Bloomwired Test** (id 6547) with `bloomwired.io` as its site.

The vet came back **MAYBE** and parked itself as a decision for a human, which
is the app working correctly. Preparation was then requested through the app's
own queue front door, the same job kind the cron uses.

What came out was a real evidence-backed V2 Email 1:

- **Playbook** `booking-friction`
- **Evidence** VERIFIED, high confidence, `booking-is-a-form`, observed on `https://bloomwired.io`
- **Subject** `how bookings reach your calendar`
- **No PDF, no video** (V2: assets are fulfilment, not cold outreach)

### Confirmed in the live production UI before pressing anything

- **To:** `arylombres@gmail.com`
- **"Sends this email to arylombres@gmail.com from hello@bloomwired.io."**

Checked twice: once before approval, once after the fingerprint fix and
re-approval.

### The guards that fired along the way

Two presses were refused before the real one, and both refusals were correct
and wrote nothing:

| press | answer | wrote |
|---|---|---|
| 1 | `stale-approval` — the fingerprint bug above | nothing |
| 2 | `Outside the send window (8:00 to 17:00 America/Los_Angeles)` | nothing |
| 3 | sent | one email |

Press 2 is worth keeping in the record: the send window is a real rule, it held,
and it was **not** weakened to make the test finish sooner. The test waited an
hour and fifty-eight minutes for 8am Pacific.

---

## Phase 3 — reconciliation, verified against the database

| Check | Result |
|---|---|
| Exact subject matches what was approved | ✅ `how bookings reach your calendar` |
| Exact body matches what was approved | ✅ package unedited, `edited_subject` and `edited_body` both null |
| Only one copy sent | ✅ `send_events` = **1**, `send_attempts` = **1** |
| Gmail message id recorded | ✅ `19fec31f91df0feb` |
| Gmail thread id recorded | ✅ `19fec31f91df0feb` |
| LTB marks it sent | ✅ package `SENT`, `emails_sent` = 1, `last_contact_date` = 2026-08-10 |
| No duplicate job created | ✅ `send-approved` jobs for this prospect = **0** |
| Refreshing does not re-offer the send | ✅ card gone, `Send now` buttons = 0, API returns 3 items and none is this one |
| Pressing send again | ✅ **409** `That package is already SENT.` Nothing written: counts still 1 and 1 |

The subject and body comparisons are between what the approval stored and what
the send path used. **What arrived in the inbox is for Ary to confirm** — that
half cannot be checked from this side.

---

## Phase 4 — reply sync, unattended

Ary replied from the test inbox at **15:24:35 UTC**. Nothing was pressed and no
cron was nudged: the mailbox sync read it, classified it, and stopped the
outbound cadence for that prospect on its own.

| | |
|---|---|
| Inbound `reply_event` | recorded, direction `inbound` |
| Classification | `interested` |
| Prospect | `replied = 1`, `reply_type = interested`, `reply_date = 2026-08-10` |
| Stage | moved to **Interested** |
| Automatic touches for this prospect | stopped |

That closes the loop: approved in the app, sent by the app, delivered, recorded,
replied to, and read back in.

---

## Two bugs the delivered email exposed

Neither was visible from any test. Both needed a real message in a real inbox.

### The body arrived broken into ragged lines — `ca9fbce`

It landed on a phone breaking mid-sentence after "as a request" and after "If
not,". The body in the database was one clean paragraph, 457 characters, with no
line breaks in it at all, and `buildMime` adds none.

The header said `Content-Transfer-Encoding: 8bit`. A long line declared 8bit is
an invitation: the relay has to make the message 7-bit clean on the way out, and
the cheapest way to do that is to hard-wrap it. Measured against the original,
the breaks landed at 70, 138, 209, 280, 350 and 417 — a 72-column ruler. The
receiving client then wrapped the already-wrapped lines again to phone width.

Now quoted-printable, which is 7-bit by construction and leaves the relay
nothing to fix. Its soft breaks vanish on decode, so the client receives one
logical line per paragraph and reflows it to the reader's actual width.

### The sender said "Ary" — `0ffcd01`

A first name, no surname, no company, from an address nobody recognises. It
fails the only job the From line has.

Worse, the Settings screen said of that field: *"Nothing here is ever shown to a
prospect on its own."* True when written, false from the day the app started
sending, and the most expensive kind of stale copy because it stops anybody from
looking.

Now `senderName()` combines both stored names, the screen prints the real sender
line instead of describing it, and display names carrying punctuation are quoted
properly.

---

## Phase 5 — one more send, to prove both fixes

Ary authorised exactly one further email. Prospect **6547** had already replied,
so its outbound is correctly stopped and that state was **not** cleared to make
room; a second test prospect was created instead.

Prospect **6548**, Ary Test 2, `arylombres@gmail.com`, through the full pipeline
again. The paid site check was parked on the day's automatic allowance, so it
was run by hand the way Vet Bee runs it — 5 pages read, one verified finding.
Before that, with nothing verified, the app **refused to write an email at all**:
*"Nothing has been verified about them yet, so there is nothing true to say."*

| | |
|---|---|
| Sent at | 2026-08-10 15:37:26 UTC |
| Gmail message id | `19fec52555cf0057` |
| Gmail thread id | `19fec52555cf0057` |
| Package | 10, `SENT`, unedited |

### The message that left, reproduced from the stored body

```
From: Ary at Bloomwired <hello@bloomwired.io>
To: arylombres@gmail.com
Subject: how bookings reach your calendar
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable
```

| Check | Result |
|---|---|
| Sender name | ✅ `Ary at Bloomwired` |
| Sender address | ✅ `hello@bloomwired.io`, unchanged |
| Longest line | ✅ 74 characters, inside the 76 limit |
| Hard breaks inside the paragraph | ✅ **none.** Every wrap is soft and disappears on decode |
| Intentional paragraph breaks | ✅ 3 real breaks: the greeting, the blank line, the closing line |
| Subject and body match the approved copy | ✅ `edited_subject` and `edited_body` both null |
| Only one additional email | ✅ 1 send event, 1 attempt, 4 sends in the table's whole history |
| No duplicate job | ✅ `send-approved` jobs for this prospect = 0 |
| Pressing send again | ✅ **409** `That package is already SENT.` Counts unchanged after |
| Refreshing | ✅ card gone, `Send now` buttons = 0 |
| Switches | ✅ both OFF throughout |

> ⚠️ **This section originally ended by calling the formatting fixed.** That was
> premature. The relay was no longer mangling the body, and the delivered lines
> broke at clean word boundaries rather than mid-sentence, so the change had
> worked. It was still not what a normal email looks like, and Ary said so.
> Phase 6 is the rest of it. The claim is left here rather than edited out,
> because being wrong twice about the same screenshot is the useful part.

---

## The third bug the delivered email exposed

### It was plain text and nothing else — `b853b08`

Ary: *"you dont see whats wrong with this? this is not normal emails."*

She was right, and the evidence was in the screenshot I had already looked at
and read too quickly. The text wrapped at **69 characters** inside a container
wide enough for about **95**. It stopped a third of the way short of the right
edge.

Measured from the delivered lines: 68, 64, 66, 67, 66, 65, 69, 69, 34.

That is Gmail rendering `text/plain` the way it always has, in a fixed column of
its own rather than the width of the window. Every other email in that inbox is
multipart with an HTML part, so every other email reflows and this one could
not.

**The quoted-printable fix was still correct and still necessary.** It was
simply not the whole cause, and no amount of further care in the plain part
would have helped, because the plain part was never the thing being wrapped
wrongly.

⚠️ **Where I went wrong, twice.** After the first fix I verified the message we
*generate* — no hard breaks, every line under 76 — and reported it fixed. I
never asked why the delivered result still looked wrong. Checking our own output
is not the same as checking the outcome, and the second screenshot was sitting
there with the answer in it.

The message is `multipart/alternative` now, least rich first as the standard
requires. The plain text is unchanged. The HTML part is the same sentences in
`<p>` tags, **generated from that same string** so the two cannot say different
things: no table, no image, no inline style, no link, no tracking pixel. A
person typing this in Gmail would produce that markup and nothing more. The body
is escaped first, so a business name containing a `<` can never become an
element.

---

## Phase 6 — the third send, and what it proved

Prospect 6549, Ary Test 3, through the whole path again: site check by hand (5
pages, one verified finding), draft, approve in the live UI, one press.

| | |
|---|---|
| Sent at | 2026-08-10 15:49:59 UTC |
| Gmail message id | `19fec5dd1ff08aaf` |
| Gmail thread id | `19fec5dd1ff08aaf` |
| Package | 11, `SENT` |

The message that left:

```
From: Ary at Bloomwired <hello@bloomwired.io>
Content-Type: multipart/alternative; boundary="..."

--...
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable
--...
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<p>Hi Ary,</p>
<p>I checked the booking flow on Bloomwired's site ...</p>
```

| Check | Result |
|---|---|
| Renders like a normal email | ✅ **confirmed by Ary in her own inbox** |
| Sender name and address | ✅ `Ary at Bloomwired <hello@bloomwired.io>` |
| Only one more email | ✅ 1 event, 1 attempt, 5 sends in the table's whole history |
| Gmail ids recorded | ✅ message and thread |
| No duplicate job | ✅ 0 |
| Pressing send again | ✅ **409** `already SENT`, counts unchanged after |
| Switches | ✅ both OFF |

**Three test emails in total, all to Ary's own inbox. No more are planned.**

---

## What is left

Nothing. The acceptance test is complete: approve, send, deliver, reconcile,
reply, sync, and the three delivery bugs the real emails exposed are fixed and
confirmed in the inbox they were breaking in.

Six bugs in total, and the split is the finding worth keeping:

| Found by | |
|---|---|
| Reading the code | none |
| Running the test | the send path did not exist, the approved card vanished, every approval was born stale |
| Looking at the delivered email | the relay rewrapped the body, the sender said "Ary", the message had no HTML part |

Half of them were only ever visible in a real inbox. A test suite that passes
1067 times says nothing about what a phone draws.

Automatic sending remains off, and turning it on is still a separate decision
that only Ary makes.

---

## Test data

Three test rows, all pointing at Ary's own inbox and all set to `bloomwired.io`
so the real pipeline had something true to check. No third-party business was
contacted and nothing was sent to anybody else.

| Prospect | Package | Why it exists |
|---|---|---|
| 6547 Ary Test | 8 | the first send, and the reply-sync half |
| 6548 Ary Test 2 | 10 | proving the encoding and the sender name |
| 6549 Ary Test 3 | 11 | proving the HTML part |

6547 replied, so its outbound is correctly stopped. **That state was never
cleared to make room for a later test**; a new prospect was created each time
instead.

⚠️ All three are still in the prospect list and can be deleted whenever Ary
wants them gone.

---

## Switch state

| Switch | Before | During | After |
|---|---|---|---|
| `AUTO_SEND_FIRST` | OFF | OFF | OFF |
| `AUTO_SEND_FOLLOWUPS` | OFF | OFF | OFF |

Neither was touched at any point, and no safety rule was relaxed to let the test
pass. The send window blocked a press and the test waited it out.

## Tests

**1067 passing.** 23 of them cover this work: the manual send path, the
fingerprint drift, quoted-printable checked against a decoder written separately
in the test file, the sender name and its header quoting, and the multipart
structure including that a body containing a script tag can never become markup.

None of them would have caught the last three bugs on their own, which is the
point of having sent a real email to a real inbox.
