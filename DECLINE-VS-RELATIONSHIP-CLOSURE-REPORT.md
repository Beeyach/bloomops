# A polite no is not a permanent one

Date: 2026-08-12 · commit `332ae61` · tests 2,025 passing

Cynthia replied to the first real native P2 email. The app read it as `decline`,
set her stage to `Rejected`, and wrote nothing at all about the relationship.
Her actual sentence turns down a contact form. It says nothing about
Bloomwired.

**0 emails sent. 0 rows migrated. 0 credits. Cynthia not mutated.**

---

## Part 1 — the exact inbound reply

`reply_events` id 31, verbatim:

```
message_id      19ff73126313617a
thread_id       19ff6d45ffa27fbb
rfc_message_id  0d689b30960307a40a11bf88d9637e29@openheartsopenmindscounseling.com
in_reply_to     CANGdcB+jEiOqXiTR+hCd7gqsPLXeAYZZYNgHMnT7j9kC54g1pw@mail.gmail.com
direction       inbound
occurred_at     2026-08-12T18:16:58.000Z
from            cynthia.criss@openheartsopenmindscounseling.com
to              hello@bloomwired.io
subject         Re: no form on your contact page
matched_by      thread
source          gmail
```

Her message:

```
Yes, I prefer it this way.
---
Cynthia A. Criss, LPC, CSAT
Open Hearts Open Minds Counseling Services
4545 E. Shea Blvd., Suite 235
Phoenix, AZ 85028
602-677-3557
CONFIDENTIALITY NOTICE: This message
```

**Six words.** The stored `snippet` is capped at ~300 characters, and the cap
lands inside her confidentiality notice — after the `---` signature delimiter.
Her actual message is complete above it, not truncated. Worth stating plainly,
because a truncated decline and a complete one are not the same evidence.

Current classifier result:

```
classification  decline
confidence      high
classified_by   model
why             "Prefers current setup, not interested in change"
requires_human  0
extracted       {"source":"reply","objection":"prefers it this way","provider":null,
                 "priceConcern":false,"referredTo":null,"newContact":null}
```

Current transition: `stage → Rejected`, `reply_type → decline`, `replied = 1`,
`reply_date = 2026-08-12`. `do_not_contact = 0`, `unsubscribed = 0`.

**`relationship_events` for prospect 4860: 0 rows.**

## Part 2 — the mapping, proven

> **Cynthia became `Rejected` because `actionFor()` in
> `lib/reply-classify.mjs` maps classification `decline` to stage `Rejected`,
> unconditionally and with `needsHuman: false`.**

```js
case REPLY.DECLINE:
  return { stage: 'Rejected', replyType: 'decline', stopOutbound: true,
           needsHuman: false, note: 'Reply received: not interested. Outreach stopped.' };
case REPLY.UNSUBSCRIBE:
  return { stage: 'Rejected', replyType: 'decline', stopOutbound: true,
           doNotContact: true, unsubscribed: true, needsHuman: false, ... };
```

`applyReplyToProspect` writes that stage, and `lib/outbound.mjs` stops her twice
over: `reply_type === 'decline'` returns `STOP.DECLINED`, and `Rejected` is in
`TERMINAL_STAGES`.

### Does `decline` conflate the two?

**At the stage level, yes.** `decline` and `unsubscribe` land on the same word,
`Rejected`. The two are told apart only by the `do_not_contact` / `unsubscribed`
flags that ride alongside — real, and invisible in the one field a person reads.

**At the relationship level, no — the distinction already existed.**
`lib/relationship.mjs` has carried it for some time:

```js
// "This specific thing is not what I need." The relationship is intact.
NO_TO_THIS_OFFER: 'NO_TO_THIS_OFFER',
// "I do not want to work with you." Materially stronger.
NO_TO_US: 'NO_TO_US',

// Note what is NOT here: NO_TO_THIS_OFFER.
export const CLOSED_TO_OUTREACH = new Set([REL.WON, REL.NO_TO_US, REL.LOST]);
```

and `relationshipFromReply` reads the words rather than the label:

```js
case 'decline':
  return { state: rejectsUs(text) ? REL.NO_TO_US : REL.NO_TO_THIS_OFFER };
```

### So the real defect

Two paths apply a reply. Only one wrote the relationship.

| Path | Applies the reply | Writes the relationship |
|---|---|---|
| `lib/reply-ingest.mjs` — rules pass, at ingest | ✅ | ✅ `recordReply` at line 164 |
| `lib/runner.mjs` `CLASSIFY_REPLY` — model pass | ✅ | ❌ **never called it** |

The rules pass only recognises bounces, autoresponders and unsubscribes. **Every
reply a person actually composed falls through to the model** — which is the
path that skipped the relationship half.

Cynthia's route, exactly: ingested → rules returned `unknown` → `unknown` is not
in `REAL_REPLY`, so `recordReply` declined to write ("not a human reply") →
queued for the model → model said `decline` → `applyReplyToProspect` set the
stage → nothing wrote the relationship. Empty timeline.

## Part 3 — classifying Cynthia from her words

> **NO_TO_THIS_OFFER.**

The email offered to fix a contact page with no form. She wrote **"Yes, I prefer
it this way."** That is a preference about a form. It contains no request to
stop contacting her, no rejection of Bloomwired, and no boundary of any kind.

Run through the real mapping:

```
Cynthia 4860           decline      -> NO_TO_THIS_OFFER
Maj 1317               decline      -> NO_TO_THIS_OFFER
"No thanks, we're all set."         -> NO_TO_THIS_OFFER
"Not interested in changing the contact page."  -> NO_TO_THIS_OFFER
"Please don't contact me again."    -> NO_TO_US
"Remove me from your list."         -> NO_TO_US
unsubscribe (classification)        -> NO_TO_US
```

Not ambiguous, so the tie-break rule does not need to be used. Her cold sequence
is correctly over; her relationship is not closed.

## Part 4 — the taxonomy

The brief asks whether separate canonical states are needed. **They already
exist**, and they already cover every state the brief names:

| Brief | Existing | Closes the relationship? |
|---|---|---|
| INTERESTED | `REL.INTERESTED` | no |
| QUESTION | folded into `INTERESTED` | no |
| NO_TO_THIS_OFFER | `REL.NO_TO_THIS_OFFER` | **no** |
| NO_TO_US | `REL.NO_TO_US` | **yes** |
| DEFERRED | `REL.DEFERRED` | no |
| OTHER / NEEDS_HUMAN | `REL.AMBIGUOUS` | no |

Plus `BUDGET_CONCERN`, `RECONSIDERED`, `ACCEPTED_OFFER`, `WON`, `LOST`.

**No new states were invented.** The taxonomy was right; the wiring was not.
Adding a sixth name for a thing that already had one would have been the more
visible fix and the wrong one.

### What changed

`recordReply` moved **inside** `applyReplyToProspect`, the one function both
callers already use:

```js
export async function applyReplyToProspect(db, ws, prospectId, {
  cls, action, isReal, needsHuman, occurredAt,
  message = null,   // { id, threadId, text }
}) {
```

The ingest route now hands the message in instead of making a second call. The
classify job passes it too. A third caller cannot forget the half that was
forgotten, because there is no longer a half to forget.

Deliberately unchanged: the stage mapping, the stop rules, `do_not_contact`,
`unsubscribed`, the cadence, and the classifier prompt. The relationship write
is additive and failure-tolerant — if it throws, the prospect update and the
stop have already happened, and a test proves it.

## Part 5 — safety

| | |
|---|---|
| Emails sent | **0** |
| Email 2 | still stopped — `declined` |
| Automation resumed | no |
| New cold sequence created | 0 |
| Packages regenerated | 0 |
| Contact data changed | 0 |
| Cynthia's row mutated | **no** |
| `send_events` for 4860 | 1, unchanged |
| `send_events` total | 10, unchanged |
| Package 19 | `SENT`, `allowed_length` 2, `sequence_approved` 1, `sequence_max_step` 2 — unchanged |
| Rows reclassified | **0** |
| `AUTO_SEND_FIRST` | **false** |
| `AUTO_SEND_FOLLOWUPS` | **false** |

## Part 6 — scope audit, read-only

### Replies classified `decline`

**2 in the whole database.** Both model-classified, both `high` confidence.

| Event | Prospect | Their words | Supports |
|---|---|---|---|
| 17 | 1317 (Maj) | "This is needed, I'm sure, but not the kind of upkeep I need most. I think I have found a WordPress person… But thank you for reaching out." | **NO_TO_THIS_OFFER** |
| 31 | 4860 (Cynthia) | "Yes, I prefer it this way." | **NO_TO_THIS_OFFER** |

**Neither supports NO_TO_US.** Maj names another provider, which is an objection
about the offer, not a boundary about us. Cynthia states a preference.

### Prospects at stage `Rejected`

| | |
|---|---|
| Total at `Rejected` | 87 |
| With `replied = 1` | 37 |
| With `do_not_contact` or `unsubscribed` set | **0** |
| With stored reply text to judge from | **1** (Cynthia; Maj is at `Interested`, having reconsidered) |
| With `replied = 1` and no stored reply text at all | **36** |

**Not one prospect in the database at `Rejected` has a real NO_TO_US boundary.**
Sixteen prospects overall carry `do_not_contact` or `unsubscribed`, and none of
them is at `Rejected`.

For the 36 legacy rows there is **no stored text**, so their wording supports
neither reading. That is a gap in the evidence, not a finding, and it is why
nothing was reclassified. `relationship-reconstruct.mjs` already handles them
correctly and softly: `decline` → `NO_TO_THIS_OFFER`, with `NO_TO_US` reachable
only from a real stored boundary.

### The real gap: replies that never reached the timeline

| Event | Prospect | Class | By | Relationship rows |
|---|---|---|---|---|
| 8 | 6547 | interested | model | **0** |
| 21 | 6567 | interested | model | **0** |
| 23 | 2595 | not-now | model | **0** |
| 29 | 1317 | question | model | **0** |
| **31** | **4860** | **decline** | **model** | **0** |

**5 real replies, every one model-classified, none in the relationship
timeline.** Events 17 and 18 do have rows — from the reconstruction backfill,
not the live path, which is what made the hole invisible.

So the conflation is systematic, but it is a **write gap, not a mapping error**:
the mapping was always right and was simply never reached.

Fixed in code first. **No rows migrated.** The five above are the candidate list
for an explicit canonical migration, on your word.

## Part 7 — tests

`tests/decline-vs-closure.test.mjs`, 12 behavioural tests:

1. "No thanks, we're all set." → NO_TO_THIS_OFFER, relationship open
2. "Not interested in changing the contact page." → NO_TO_THIS_OFFER
3. "Please don't contact me again." → NO_TO_US, relationship closed
4. "Remove me from your list." → NO_TO_US
5. an ambiguous decline stops the sequence and does not close the relationship
6. unsubscribe and do-not-contact stay stricter, and rank above `decline` in the gate
7. every real reply category stops the cold sequence, including unreadable ones
8. NO_TO_THIS_OFFER cannot restart the same offer
9. NO_TO_US blocks future outreach
10. **Cynthia's exact words** map to NO_TO_THIS_OFFER, with and without her signature block
11. classifying a decline sends nothing and mutates nothing
12. Maj's exact words map to NO_TO_THIS_OFFER

Plus, in `tests/relationship.test.mjs`, four tests replacing two that had pinned
the old file layout by string matching:

- the stop still comes from the reply, not the relationship state
- the prospect update runs first, and the relationship event after
- **a failing relationship write leaves the update and the stop intact**
- a model-classified decline now reaches the timeline as NO_TO_THIS_OFFER
- an applied reply with no message text invents no relationship state

Those two originals asserted real properties through the wrong instrument —
`reply-apply.mjs` must not contain the string "relationship", and
`reply-ingest.mjs` must call `recordReply` after `applyReplyToProspect`. Both
properties still hold; they are now checked by running the code.

Suite: **2,025 passing**, up from 2,011. `next build` clean.

## Part 8 — deployment

| | |
|---|---|
| Commit | `332ae61` |
| Pages | deployment `c230b76d`, `deploy:success` |
| Cloud Run | not touched |
| `bloomwired-review` Worker | not touched |
| Migrations | none |
| Rows written | **0** |

## What still needs your word

Cynthia's persisted state is **correct on every guard and incomplete on the
record**:

- ✅ cold sequence stopped, correctly
- ✅ `do_not_contact = 0`, `unsubscribed = 0` — she asked for neither
- ⚠️ stage `Rejected` reads as permanent rejection, and is the same word
  `unsubscribe` produces
- ⚠️ no `NO_TO_THIS_OFFER` event, so her timeline is empty

The fix going forward is deployed. Correcting the five existing rows is a
migration, and the brief says list them rather than run it. Listed above.
