# Gmail Integration

How Leads That Bloom finds out that somebody replied, without anybody being
present. Written 2026-08-09.

Everything about Google's requirements below comes from Google's current
documentation, linked at the bottom. Where something is a judgement call rather
than a documented requirement, it says so. Nothing here is legal advice.

---

## Why this exists

The follow-up guard is the most important rule in the product: *a follow-up
sent on top of an unanswered reply is the worst email we can send.* It is
deterministic, it is checked on every sweep, and until now it was running on
information that only arrived when a person ran a skill.

A guard that has not heard about a reply is not a guard. So the app reads the
mailbox itself.

---

## The scope, and why it is that one

```
https://www.googleapis.com/auth/gmail.readonly
```

One scope. Nothing else is requested, and there is a test that fails if a
second one ever appears.

Gmail has two read scopes and **both are classified Restricted**, so neither is
cheaper to get approved:

| Scope | Class | Bodies? | Usable here? |
|---|---|---|---|
| `gmail.metadata` | Restricted | No | **No.** Without a snippet there is no way to tell an out-of-office from a decline, which is the entire job. |
| `gmail.readonly` | Restricted | Yes | Yes. The narrowest scope that can actually classify a reply. |
| `gmail.modify` | Restricted | Yes | No. We never change a mailbox. |
| `gmail.send` | Sensitive | n/a | No. The product's hardest rule is that it never sends. |
| `mail.google.com` | Restricted | Yes | Never. |

So `readonly` is asked for because it is the narrowest one that works, not
because it is convenient.

**The narrowness that matters in practice is not the scope, it is the read.**
Every changed message is fetched as `format=metadata` first, which returns
headers and no body. A body is requested for exactly one reason: something
links the message to a prospect. Newsletters, receipts and personal mail are
identified from a `From` line and dropped, having never left Google as anything
more than that.

**Drafts.** The reply-sync skill still creates Gmail drafts for interested
replies. It does that through Claude's own Gmail access, not through this
token, which is why our scope stays read-only. Worth keeping that way.

---

## The shape

```
  Gmail (a connected mailbox)
    │  users.watch, labelIds:["INBOX"]
    ▼
  Pub/Sub topic  projects/hale-function-497521-q3/topics/gmail-replies
    │  push subscription, signed with an OIDC token
    ▼
  POST /api/gmail/push          ← verifies the token, enqueues, runs it now
    │
    ▼
  gmail-sync job
    │  users.history.list from OUR stored cursor
    │  users.messages.get format=metadata     (every changed message)
    │  users.messages.get format=full         (only the ones that are ours)
    ▼
  lib/reply-ingest.mjs          ← the same code the HTTP endpoint uses
    │  match → classify → store → stop outbound → stale the draft
    ▼
  Today
```

### The notification is a wake signal, and nothing more

A Pub/Sub message carries a `historyId`. **It is deliberately ignored.**

Resuming from a number in an inbound HTTP request would let a forged or
replayed notification skip past messages. The sync always resumes from the
cursor the app stored after the last batch it finished.

That single decision handles most of the hard cases for free:

| Case | What happens |
|---|---|
| Duplicate notification | Re-reads the same window, dedupes on message id. |
| Out-of-order notification | Identical to a duplicate. |
| Missed Pub/Sub delivery | The cursor never moved, so the next notification or the reconcile picks it up. |
| Worker restart mid-batch | The cursor never moved. The batch replays. Replaying is free. |
| Forged notification | Causes a redundant read of a mailbox we already had permission to read. |

The cursor advances in exactly one place (`advanceCursor`) and only after a
batch is fully stored.

### When the cursor is too old

Gmail keeps roughly a week of history and returns **404** past that, with the
instruction to do a full sync. A full sync of a real inbox is what this whole
file exists to avoid, so recovery is bounded: `in:inbox newer_than:7d`, at most
100 messages, then the cursor resets to the mailbox's current position.

### Push is primary, and push is not trusted alone

Every five-minute drain runs `reconcileMailboxes`, which queues a sync for any
connected mailbox not read in the last 20 minutes. This is **not** a mailbox
scan: it is the same incremental sync, resuming from the same cursor. A quiet
mailbox costs one history call that returns an empty list.

---

## Staying connected

Watches expire after 7 days. Google's advice is to renew daily.

The daily cron renews at **48 hours left**, not on the day. A cron that misses
a run, or a deployment that eats one, then has two more chances before anything
lapses. A lapsed watch is silence, and silence looks exactly like a quiet inbox,
which is the failure mode worth spending a margin on.

Stored per mailbox, each answering a question somebody actually asks:

| Column | Question it answers |
|---|---|
| `history_id` | Where do we resume? |
| `watch_expiration`, `last_watch_at` | Is it about to stop? |
| `last_notification_at` | Is it listening? |
| `last_sync_at` | Is it working? |
| `status`, `last_error` | What went wrong? |

When renewal or refresh fails, `status` becomes `needs-reconnect` and **Today
shows a banner**, because outbound safety depends on it. It does not fail
quietly into Settings.

---

## Tokens

- The refresh token is sealed with the same AES-GCM box as the AI keys
  (`lib/secret-box.mjs`), keyed off `LTB_SESSION_SECRET`.
- It is never in an API response. `publicView()` returns a status word and
  timestamps; there is a test asserting no sealed value can appear in it.
- Nothing in a browser has ever held it.
- Access tokens are cached sealed and refreshed a minute before expiry.
- `invalid_grant` from Google means revoked, password-changed, or dead. It is
  marked permanent so the queue stops retrying and asks for a person instead.

**Known tradeoff:** rotating `LTB_SESSION_SECRET` makes the stored refresh
token unreadable. That surfaces as "Gmail needs reconnecting" rather than a
silent stop, which is the correct behaviour, but it is a reconnect.

---

## Matching, in priority order

A reply attaching to the wrong prospect is a data-integrity failure, not a UX
inconvenience: it corrupts the timeline, the metrics and the outbound guard at
once, silently.

1. **Known Gmail thread.** An earlier message in this exact conversation was
   already matched.
2. **`In-Reply-To` names one of our Message-IDs.** Proof, not inference: their
   mail client wrote that header by copying the ID of the email we sent.
3. **`References` contains one of ours.** Same evidence, one step weaker
   because a forwarded chain can carry it.
4. **The address we sent to** is on a record. (From the skill, and right: owners
   reply from personal accounts.)
5. **They replied from the address we hold.**
6. **Same company domain, exactly one prospect there.** Never a public mailbox
   domain — sharing gmail.com with somebody means nothing.

Anything else goes to `unmatched_replies` for a person. Never matched on
display name, company name in the body, subject similarity, or a model's
opinion.

---

## What is stored

Per inbound event: workspace, prospect, mailbox, Gmail message id, thread id,
RFC `Message-ID`, `In-Reply-To`, `References`, sender, recipient, exact arrival
time, how it was matched, classification, confidence, who classified it,
whether it needs a human, and a ≤300-character snippet for recognition.

**No message bodies.** This is a prospecting tracker, not a mail archive.
Outbound events keep no snippet at all — we wrote it, and we already have the
sequence.

`extracted` holds what the reply *stated* (a date they named, somebody they
pointed at, an objection, a provider they already use), tagged `source:
'reply'`. Deliberately a separate column from the site-check evidence: one is
what a person said, the other is what we verified, and merging them would let a
polite guess become a fact a follow-up points at.

---

## OAuth and verification

**bloomwired.io is a Google Workspace organisation** (verified 2026-08-09).
That is the single most useful fact here, because it means the consent screen
can be set to **Internal**:

| Consent screen | Verification | Restricted scopes | Refresh token |
|---|---|---|---|
| **Internal** (Workspace only) | Not required | Allowed | No fixed lifetime |
| External + Testing | Not required | Allowed | **Expires after 7 days** |
| External + In production | Required, and restricted scopes add a security assessment | Allowed | No fixed lifetime |

So the setup is Internal, and the 7-day expiry that would break this weekly
does not apply.

### "No fixed lifetime" is not "never expires"

An earlier version of this file said refresh tokens never expire. That was
wrong. Internal removes the 7-day testing clock; it does not make a token
immortal, and the difference matters because every condition below produces the
same symptom — `invalid_grant`, and replies quietly stop arriving.

Google documents these:

| Condition | Applies to us |
|---|---|
| **The user changed their password AND the token carries Gmail scopes** | **Yes.** Ours carries a Gmail scope. A password change kills it. |
| The user revoked the app's access | Yes |
| The token went unused for six months | Not in practice; it is used every few minutes |
| The account exceeded 100 live refresh tokens for this client | Only if reconnected over and over |
| An admin restricted a requested service | Possible on a Workspace domain |

So **a reconnect is a normal event, not a design failure**, and the product
treats it as one: `invalid_grant` is classified permanent rather than retried
forever, the connection flips to `needs-reconnect`, and Today shows a banner,
because outbound safety depends on replies arriving.

In plain terms: if Ary changes her Google password, Gmail sync needs
reconnecting. That is expected, and the app will say so rather than going quiet.

**For future SaaS with customers outside bloomwired.io**, the app has to move to
External + In production, which per Google's current documentation means brand
verification, a demonstration video, a privacy policy covering Gmail data, and
— because `gmail.readonly` is Restricted — an annual third-party security
assessment (CASA). That is a real cost and a real timeline, and the architecture
here is built so it is the only thing that changes: no scope creep to explain,
no bodies stored to justify, one mailbox row per workspace already.

---

## Setup, once

Done already, on project `hale-function-497521-q3`:

```bash
gcloud services enable gmail.googleapis.com pubsub.googleapis.com
gcloud pubsub topics create gmail-replies
gcloud pubsub topics add-iam-policy-binding gmail-replies \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
gcloud iam service-accounts create ltb-pubsub-push
gcloud projects add-iam-policy-binding hale-function-497521-q3 \
  --member="serviceAccount:service-669979959969@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator
gcloud pubsub subscriptions create gmail-replies-push \
  --topic=gmail-replies \
  --push-endpoint="https://leadsthatbloom.com/api/gmail/push" \
  --push-auth-service-account="ltb-pubsub-push@hale-function-497521-q3.iam.gserviceaccount.com" \
  --push-auth-token-audience="https://leadsthatbloom.com/api/gmail/push"
```

**Still needs a person** (OAuth clients cannot be created from the CLI):

1. Cloud Console → APIs & Services → OAuth consent screen → **Internal**.
2. Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Credentials → Create OAuth client ID → Web application.
   Authorised redirect URI: `https://leadsthatbloom.com/api/gmail/callback`
4. Set the Pages secrets, then redeploy — **secrets only reach deployments
   created after they are set**:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GMAIL_PUBSUB_TOPIC   projects/hale-function-497521-q3/topics/gmail-replies
GMAIL_PUSH_AUDIENCE  https://leadsthatbloom.com/api/gmail/push
GMAIL_PUSH_SA        ltb-pubsub-push@hale-function-497521-q3.iam.gserviceaccount.com
```

5. Open Today and press **Connect Gmail**.

---

## Sources

- Gmail API push notifications — https://developers.google.com/workspace/gmail/api/guides/push
- `users.history.list` — https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
- Gmail API OAuth scopes — https://developers.google.com/workspace/gmail/api/auth/scopes
- Authenticating Pub/Sub push subscriptions — https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions
