# Native human reply send — end-to-end canary

Live: commit **`df4aeff`**, deployment `97ffb26b`. Tests **2,410 passing**.

**One internal email was sent, to Ary's own address, and nothing else.**

---

## Verdict

`NATIVE HUMAN REPLY SENDING IS READY — THE PRODUCTION PATH SENT EXACTLY ONE INTERNAL CANARY REPLY IN THE EXISTING GMAIL THREAD, LTB RECORDED IT AS HUMAN CONVERSATION ACTIVITY, THE THREAD MOVED TO WAITING ON THEM, DUPLICATE AND STALE SENDS WERE BLOCKED, AND NO COLD-OUTREACH STATE CHANGED.`

---

## 1. Canary identity

| | |
|---|---|
| Prospect | **6567**, `LTB Canary (internal test)` |
| Recipient | `arylombres@gmail.com` — Ary's own inbox |
| Restored via | the app's own Trash endpoint, `PUT /api/trash` |
| Gmail thread | **`19ff1cff05b6f74a`** |

`6568` was restored first, found to have **no thread at all**, and put straight back in the bin. Without an inbound message there is nothing to reply to, and the guard correctly refuses that case.

**No real prospect and no client was touched. Mary Ann was not used.**

## 2. Real inbound proof

The thread contains a genuine Gmail exchange, not a fabricated event:

```
2026-08-11T17:12:44Z  outbound  hello@bloomwired.io  "quick note on that booking form"
                      rfc CANGdcBK_dLa7Hg8sYWj6Ro9os5eY1...
2026-08-11T17:18:44Z  inbound   arylombres@gmail.com "Re: quick note on that booking form"
                      msg 19ff1d5af697d017
                      rfc CAOqsbjfHVk9AefYSW4p=ZnyNOBBC4...
```

## 3. Draft proof

`POST /api/draft-reply` on the live deployment returned a context-aware draft and the fingerprint the send path checks:

```
draft        "Glad to hear it. Let's get things moving on our end. I'll follow up
              shortly with the next steps to get you started.  Thanks, Ary"
fingerprint  { prospectId: 6567, threadId: 19ff1cff05b6f74a,
               latestInboundId: 19ff1d5af697d017, at: 2026-08-11T17:18:44Z }
basedOn      { messages: 2, owed: true, isClient: false,
               subject: "Re: quick note on that booking form" }
```

It was then replaced with the unmistakable test text before sending.

## 4. Same-thread send proof

Body sent, exactly as specified by the brief:

```
Internal native reply transport test. Please ignore.

Thanks,
Ary
```

Response from the production endpoint:

```
{ ok: true, threadId: "19ff1cff05b6f74a", to: "arylombres@gmail.com" }
```

**Read back from Gmail itself**, thread `19ff1cff05b6f74a`, which now holds three messages:

```
1  2026-08-11T17:12:44Z  SENT           hello@bloomwired.io -> arylombres@gmail.com
2  2026-08-11T17:18:44Z  INBOX          arylombres@gmail.com -> hello@bloomwired.io
3  2026-08-18T14:08:09Z  SENT           hello@bloomwired.io -> arylombres@gmail.com
   id       1a0153377984d224
   subject  "Re: quick note on that booking form"
   snippet  "Internal native reply transport test. Please ignore. Thanks, Ary"
```

| Required | Result |
|---|---|
| Exactly one Gmail message sent | **Yes** — the thread has 3 messages, one of them new |
| Same Gmail thread id | **Yes** — `19ff1cff05b6f74a` |
| Correct recipient | **Yes** — `arylombres@gmail.com`, the address that wrote |
| Subject continuity | **Yes** — `Re: quick note on that booking form` |
| No disconnected new thread | **Yes** — nothing else appeared |

`In-Reply-To` and `References` were built from the inbound message's `rfc_message_id` and `refs`. Gmail placed the message in the thread, which is the observable proof that threading was accepted.

## 5. Exactly-once proof

The identical submission was repeated against the live endpoint:

```
{ ok: true, deduped: true, messageId: "native-reply:04b72d937c0b95ec277848d615f85d1b" }
```

**No second Gmail message.** The thread still holds three. The key is derived from workspace, prospect, thread and body, so a retry, a double click, or a request that timed out after Gmail accepted it all collapse to the same no-op.

## 6. Stale-draft refusal proof

A draft carrying an older fingerprint was submitted:

```
409  { error: "A newer message came in. Refresh the conversation before sending.",
       block: "stale" }
```

**Nothing sent.** The refusal happens before Gmail is contacted at all.

## 7. State transition proof

| | Before | After |
|---|---|---|
| Inbound `19ff1d5af697d017` `answered_at` | `null` | **`2026-08-18T14:08:09.834Z`** |
| Canary in Today | in Replies | **absent from every tab** |
| Today needs-reply | 2 | **1** (Mary Ann only) |

`GET /api/today` after the send returns no canary row at all, and `totals["needs-reply"] = 1`. The conversation moved out of "needs your reply" because the inbound is answered — no stage change, no package advanced.

## 8. Cold isolation proof

| Check | Before | After |
|---|---|---|
| Cold `send_events` total | **10** | **10** |
| Cold `send_events` newest | 2026-08-12T16:35:41Z | **unchanged** |
| Canary `emails_sent` | **2** | **2** |
| `native-reply` reply_events | 0 | **1** |
| Packages armed | 0 | **0** |
| Canary packages | 1 | **1**, unchanged |
| Package 23 | `APPROVED`, sent 0, armed 0 | **identical** |
| `autoSendApprovedFirstEmails` | false | **false** |
| `autoSendApprovedFollowups` | false | **false** |

**A human reply added no cold state whatsoever.** No `send_events` row, no cadence counter increment, no package movement, no new follow-up.

## 9. A bug the canary caught

`sendMessage` returns `{ messageId, threadId, labelIds }`. The route read `sent.id`, which is undefined, so the **idempotency key was written where Gmail's own id belongs**:

```
recorded   native-reply:04b72d937c0b95ec277848d615f85d1b
actual     1a0153377984d224
```

Harmless for dedupe, wrong for reconciliation — a later Gmail sync could not recognise its own message and might ingest it as a new outbound event. **Fixed and deployed in `df4aeff`.** The one canary row still carries the old value; it belongs to a deleted internal record and is left as-is rather than hand-edited.

This is exactly what an end-to-end canary is for. Twenty-two unit tests did not catch it, because they never saw a real Gmail response.

## 10. Cleanup

```
6567  LTB Canary (internal test)            deleted_at = 2026-08-18 14:15:01
6568  LTB Threading Canary (internal test)  deleted_at = 2026-08-18 14:07:07
```

Both internal records are back in the bin, using the app's own delete semantics. The `native-reply` event is retained as audit proof, and the Gmail messages are untouched.

## 11. Tests

**2,410 passing, 0 failing**, including 22 added for this feature:

- `tests/reply-send-guard.test.mjs` (11) — cold caps do not block a reply, DNC/unsubscribe/NO_TO_US do, `NO_TO_THIS_OFFER` does not, no thread refuses, stale refuses, threading targets the address that actually wrote, `Re:` is not doubled
- `tests/reply-context.test.mjs` (11) — what does not reach the model

## 12. Final status

**Ready.** The full path is proven on production against a real Gmail thread: draft, edit, send, same thread, exactly once, correct state transition, and zero cold-outreach side effects.

**Mary Ann has not been sent anything.** She remains the one row in Replies, waiting.
