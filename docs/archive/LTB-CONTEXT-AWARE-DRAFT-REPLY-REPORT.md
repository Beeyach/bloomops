# Context-aware draft reply

Live: commit **`26065df`**, deployment `7d9c0459`. Tests **2,399 passing**. Zero sends.

---

## Status

`CONTEXT-AWARE REPLY DRAFTING IS READY — ARY CAN OPEN A REAL GMAIL REPLY INSIDE LTB, GENERATE A DRAFT FROM THE RELEVANT CONVERSATION AND PROSPECT/CLIENT CONTEXT, EDIT IT IN PLACE, AND NOTHING IS SENT UNTIL ARY CHOOSES TO SEND IT.`

---

## 1. What was added

Open anyone from Today, and the drawer's **Conversation** block now leads with a **Draft reply** button. One click reads that person's real Gmail thread plus what LTB knows about them, and writes something Ary can edit.

After it generates:

| Control | Does |
|---|---|
| the textarea | fully editable in place |
| **Copy** | to clipboard |
| **Regenerate** | asks again; safe to repeat, no side effects |
| **Discard** | clears it |

Under the box, in plain words: *"A draft. Nothing is sent from here: read it, change it, then send it yourself."*

**No separate AI page.** It is where the conversation already is.

**It cannot send.** No send path is wired to it — not the guard, not the runner, not Gmail. That is deliberate: the value is that a thread never leaves the app by hand, not that the machine gains a voice.

## 2. The context builder is a narrowing, not a gathering

`lib/reply-context.mjs`. The entire risk in drafting from a database is that the model fills gaps — a diagnosis nobody made, a price nobody agreed, a promise Ary never gave. Two rules govern the file:

1. **Every fact handed over is one somebody actually wrote down** — in the Gmail thread, or in a field Ary filled in.
2. **Absence is stated, not hidden.** Silence invites invention; an explicit "this is not recorded" does not.

### What goes in

| Group | Included | Rule |
|---|---|---|
| **Identity** | business, person, website, country | omitted entirely when the field is empty, never guessed |
| **Relationship** | client status, stage, how their last reply was read | client comes from the **clients table**, the same authority Today uses |
| **Money** | `offer_accepted_at`, if set | if not set: *"No agreed price or offer is recorded. Do not name a price, a scope or a delivery date."* |
| **Promises** | `deferral_promise`, if set | verbatim, never paraphrased into a commitment |
| **Conversation** | last 8 messages, oldest first, ~600 chars each | who spoke, and when |
| **The message to answer** | latest real inbound, up to 900 chars | |
| **`owed`** | did they write last? | a reply and a follow-up read very differently |

**Never included:** the whole database, ratings as if they were agreements, stages as if they were prices, or anything derived from a conversation merely sounding positive.

### What the thread strips before the model sees it

- **Newsletters** — dropped via the same threading rule Today uses. Three of Sarah's marketing blasts would otherwise have become "context" for a reply to her.
- **HTML entities** — decoded, so `It&#39;s` is not fed in as markup.
- **Quoted chains** — cut, so the model is not answering our own email quoted back.
- **Signatures** — trimmed where clearly separable.

## 3. Gmail handling

Reads the existing native `reply_events` — the same store the Gmail sync already fills and dedupes. **No second Gmail integration was built.** Up to 40 events per prospect, filtered and ordered, then narrowed to the last 8 for the prompt.

## 4. Client versus prospect

Client status is read from the `clients` table first, then `stage` / `first_client_at` as a fallback — identical to the cold gate.

For a client the prompt says, in the facts block:

> `Relationship: CLIENT. This is client service, not prospecting.`

and the prospecting stage is **omitted entirely**, so there is nothing for the model to treat as a sales position. Generating a draft performs no writes, so it cannot route a client into a cold sequence — the operation is read-only by construction.

## 5. Voice rules

Held in `REPLY_SYSTEM` next to the evidence rules they depend on:

- Short, usually three or four sentences. Plain English, warm, like a person.
- **Answer the question they actually asked, first.**
- No corporate phrasing, no "I hope this finds you well".
- **Never an em dash.**
- Move the conversation one step forward. Do not pitch again unless asked.
- **Do not invent** a technical cause, price, scope, delivery date, meeting or past agreement.
- If a technical answer is not certain from the thread, say so and name what you would check.
- Ends exactly `Thanks,` / `Ary`.

## 6. Mary Ann — the live acceptance case

Generated on production, from her real thread:

> That's a good clue, not necessarily the cause though. Once we start the cleanup we'll check your feed settings, any publishing plugins, and how Libsyn connects in to see what's triggering the duplicate. We'll get it sorted as part of the work.
>
> Thanks,
> Ary

Against the brief's acceptance criteria:

| Required | Result |
|---|---|
| Answers the duplicate-post concern **without pretending to know the cause** | *"a good clue, not necessarily the cause"* — then names what it would check |
| Acknowledges the one-time cleanup | *"Once we start the cleanup"* |
| Continues the buying conversation naturally | *"We'll get it sorted as part of the work"* |
| Stays short | four sentences |
| Names no price | none is recorded, so it was forbidden to |
| No em dash, correct signature | both |

This is the exact trap the brief warned about. It did **not** say *"a duplicate post is almost always caused by Libsyn publishing twice."*

**Nothing was sent.**

## 7. Model and failure behaviour

Uses the app's existing `askBackground` and `loadAiKey` — **no parallel provider abstraction.** Task tagged `draft-reply`, capped at 400 tokens.

| Case | What Ary sees |
|---|---|
| No AI key on the workspace | *"No AI key is set on this workspace yet. Add one in Settings, Admin."* |
| Provider error, timeout, empty result | *"Couldn't draft that reply just now. Try again."* with a Try again link |
| Person deleted mid-flight | *"That person is not in the workspace any more."* |

**No raw provider error ever reaches the screen.** Ary cannot act on a 429 from an API she does not administer, and a stack trace there reads as broken.

## 8. Tests

**2,399 passing.** 11 new in `tests/reply-context.test.mjs`, mostly about what does **not** reach the prompt:

| Test | Guards |
|---|---|
| thread is oldest-first and attributed | ordering |
| entities decoded, quoted chains stripped | clean input |
| a newsletter never becomes conversation context | Sarah's blasts |
| no agreed price → the model is told so explicitly | invented pricing |
| an accepted offer is carried, never restated as a number | invented figures |
| a client is framed as client service | wrong register |
| only fields that hold a value appear | invented identity |
| `owed` true when they wrote last, false once answered | reply vs follow-up |
| prompt carries thread and the message to answer | completeness |
| with no stored message the prompt refuses to pretend | honest fallback |
| voice rules forbid invention, fix the signature | the rules exist |

Also fixed while here: the icon-existence test only accepted **quoted** keys, so it failed `pencil`, which is real but declared unquoted because it is a valid identifier. The regex now accepts both forms — the test was wrong, not the icon.

## 9. Production verification

1. Today → Replies → **Mary Ann** opens over Today ✅
2. **Draft reply** button present in the Conversation block ✅
3. Click → *"Reading the conversation…"* → draft appears ✅
4. Draft reflects her actual thread — cleanup, Libsyn, duplicate post ✅
5. Textarea editable ✅
6. **Copy / Regenerate / Discard** all present ✅
7. **No Gmail send occurred** ✅
8. No console errors ✅

⚠️ A **hard refresh** was needed the first time to get past a cached bundle. Expect the same once.

## 10. Outbound safety

| Check | Value |
|---|---|
| `send_events` total | **10**, newest 2026-08-12 |
| Packages armed | **0** |
| Package 23 | `APPROVED`, `emails_sent = 0`, `auto_followup_approved = 0` |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

**Zero sends. The draft endpoint writes nothing** — it reads the prospect, the clients table and `reply_events`, and returns text.

---

## In one line

Open a person, click **Draft reply**, get something in Ary's voice built from what actually happened, edit it, send it yourself. The thread never has to leave the app, and nothing goes out that Ary did not press send on.
