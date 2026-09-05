# Gmail follow-up threading, and two worse things found next to it

**Date:** 2026-08-11
**Commit:** `8165489` — deployment `e436dba9`, Production, Active
**Tests:** 1,602 passing (11 new)
**Emails sent: 0. Model calls: 0. Credits: 0.**

---

## Before

The threading question was real: every follow-up started a new Gmail thread.
Auditing it found two defects sitting beside it that matter more.

### 1. A follow-up would have sent Email 1 again

```js
const body = pkg.edited_body || pkg.email_body || '';   // every step
```

Those are Email 1's fields. A follow-up's approved copy lives in the package's
`followups`, and **nothing in the send path had ever read it.**

Pressing Send on the approved Email 2 canary would have delivered **Email 1's
body under Email 1's subject.**

The copy-approval gate did not catch this, and could not: it checks the step's
words are *in* the package, not that they are the ones being *sent*.

### 2. The recipient-name guard was checking nothing

```js
const nameCheck = checkGreeting({ body: pkg.body || '', ... });
```

**There is no `body` column on `outreach_packages`** — confirmed against the
live schema (`no such column: body`). It read `undefined`, checked an empty
string, and **could never have blocked a single send** since it was written.

### 3. Threading

The thread id Gmail returns was stored on every send and never used again.

## The plumbing already existed

Nothing new was built:

- `buildMime` already accepted `inReplyTo` and `References`
- `sendMessage` already accepted a `threadId` and passed it to Gmail
- `send_events` and `send_attempts` already stored `provider_thread_id`

`sendApproved` simply never called any of it.

## Canonical thread source

`threadFor(db, workspace, prospectId)` — the earliest `send_event` for that
prospect carrying a **real** `provider_thread_id`, giving the thread id, Email
1's message id and Email 1's subject.

Only real provider values. A test asserts the thread is never derived from a
subject, an address, a prospect id or a timestamp: those guesses would file a
follow-up into somebody else's conversation, which is worse than starting a new
one.

## Native sequence policy

With a real Email 1 thread, Email 2 and Email 3 now:

- send with the original `threadId`
- carry `In-Reply-To` and `References` from Email 1's real message id
- **keep Email 1's subject**, because that is what makes Gmail render one
  conversation rather than two

The model writes the body. It no longer decides the subject when threading.

## Legacy fallback

No native send ever recorded a thread for the 1,106 contacted prospects, and
none exists for the canary either. There is nothing to join, so those start a
new thread and `threadFor` returns `threaded: false` with the reason. **No id is
fabricated.** That is a legacy data limit, not a send failure, and the two are
distinguishable.

Production today: **5 of 6 send events carry a real thread id** — the five
genuine sends. The sixth is the canary's synthetic anchor, which has none.

## Current canary

**Threading remains `NOT TESTED` for prospect 6567.** Its Email 1 is synthetic
with no Gmail thread, so this canary cannot exercise same-thread either way.
Claiming otherwise would be a claim nothing supports.

The canary is otherwise unchanged: package 14, `arylombres@gmail.com`, Email 2
of 3, same approved subject and body. **It now sends the right words** — before
this fix it would have sent Email 1's.

## Tests

**1,602 passing**, up from 1,591. 11 new in `tests/followup-threading.test.mjs`
covering the thread source, the refusal to invent one, the approved-step body,
the empty-body block, the name guard reading the outgoing words, the MIME
wiring, subject ownership threaded and unthreaded, and that a first email is
never threaded onto anything.

## Safety

`send_attempts` 4 → **4** · `send_events` 6 → **6** · send jobs 1 → **1** ·
no real prospect contacted · no Gmail send · both switches **OFF** · scanner
concurrency **2** · dedupe, reconciliation, send-event recording and the
relationship model unchanged · no migration.

## Remaining gap

Finish the canary in the send window (send, delivery, event, dedupe, scheduler,
reply-stop), then a **real** threading acceptance needs a native Email 1 to the
test inbox first — which is a second send and needs Ary's approval separately.
