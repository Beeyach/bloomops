# Outcome data map

Whether the chain from "where did this prospect come from" to "did they become
a client" can actually be queried. Written 2026-08-09, before any outcome
analysis, deliberately: the point is to find the broken links while nobody is
depending on them.

**Read the coverage column before trusting any number.** Most of the structure
below is days old and most of the database is months old. A query that ignores
that will confidently compare structured records against legacy ones and report
the difference as a finding.

| Link | Where it lives | Identifier | Present? | Historical coverage |
|---|---|---|---|---|
| Prospect | `prospects.id` | id | Yes | All |
| Source / import | `prospects.source` | text | Partial | Free text, not a controlled vocabulary. Older imports left it null. |
| Human rating | `prospects.rating` | emoji | Yes | 2,052 of 5,492 rated |
| Evidence | `prospects.site_intel`, `own_findings` | keys + reasons | Yes | **8 probed rows.** Keys existed on 1 before the backfill, 3 after |
| Vet result | `outcome_events` kind=`vet` | value | Yes | From 2026-08-09 only |
| Playbook | `outreach_packages.playbook` | id | Yes | From 2026-08-09 only |
| Playbook version | `outreach_packages.playbook_version` | int | Yes | From this pass |
| Generator version | `outreach_packages.generator_version` | string | Yes | From this pass |
| Evidence snapshot | `outreach_packages.evidence_hash` | hash | Yes | From this pass |
| Workspace context | `outreach_packages.workspace_context_hash` | hash | Yes | From this pass |
| Generated email | `outreach_packages.email_subject`, `email_body` | — | Yes | 2 packages |
| Review outcome | `outreach_packages.review_outcome` | enum | Yes | **0 reviews so far** |
| Original vs final | `email_body` vs `edited_body` | — | Yes | Original is never overwritten |
| Approval | `outreach_packages.status` = APPROVED | — | Yes | 0 so far |
| Send | — | — | **NO** | The product does not send. A send happens in Gmail via the sweep skill and is recorded only as `last_contact_date` |
| Reply | `reply_events` | gmail message id | Yes | 1 event, from 2026-08-09 |
| Reply classification | `reply_events.classification` | enum | Yes | Same |
| Conversation detail | `reply_events.extracted` | JSON | Yes | Date asked for, referral, objection, provider |
| Client | `prospects.stage` = 'Client' | — | Partial | A stage, not an event. No timestamp for *when* they became one |
| Lost / declined | `prospects.stage`, `reply_type` | — | Partial | Same |
| Deal value | — | — | **NO** | Nothing stores it. Not invented. |

## The three real gaps

**1. Send is not an event.** The app prepares and never sends; the sweep skill
sends from Gmail. So "approved on Tuesday, sent on Thursday" is not recorded,
and time-to-send cannot be measured. The Gmail sync records our outbound
messages in `reply_events` with `direction='outbound'`, which is the closest
thing and only exists for threads a prospect has already replied into.

**2. Becoming a client has no timestamp.** `stage='Client'` is a current state.
Nothing says when it changed or what it was before, so "how long from first
contact to client" is unanswerable for every existing client.

**3. Almost nothing has history.** The structured chain starts on 2026-08-09.
Every prospect before that has evidence, a rating and an outcome, and no
playbook, no generator version and no review record. They are legitimately
different data and must be reported as `LEGACY` rather than blended.

## What NOT to conclude

- Do not compute conversion by playbook yet. n=2 packages, 0 reviews.
- Do not compare rated against unrated prospects as though the rating caused
  anything; she rated the ones she looked at, which is not random.
- Do not read `stage='Client'` as attributable to any outreach the product
  produced. Every current client predates all of it.

---

## SEND is closed, and proven in production (2026-08-09)

The three gaps this document opened with have moved.

### 1. Send is now an event

`send_events`, with a ranked identity: provider message id, RFC Message-ID,
thread chronology, derived. The Gmail UI gives none of them at send time, so
the sweep records a derived send flagged `needs_reconciliation`, and the
mailbox UPGRADES that row rather than inserting a second one.

**Proven end to end on 2026-08-09**, using the real send path: a package
prepared by the queue, approved through the approval API, composed and sent
from hello@bloomwired.io through the Gmail UI to an address under Ary's own
control, reported back through `window.bloom.recordSend`, then reconciled
against the mailbox.

```
prospect            6545
package             5, APPROVED, APPROVED_UNCHANGED
playbook            own-finding (v2)
generator           outreach-2026-08-09.3
model               claude-sonnet-5
evidence_hash       9xagn4meqnxw
workspace_context   9mfwweux3wdo
workspace_fit       IN_SCOPE
prepared            16:51:54Z
approved            17:00:31Z
sent                17:01:54Z
gmail message       19fe7791f9bf75c9
gmail thread        19fe778db858d7b6
identity            provider-message-id (upgraded from derived)
send_events rows    1
outcome events      1
mailbox rows        1
```

One email, one send, one event. The mailbox observation confirmed rather than
created.

**The ordering nobody predicted.** Pub/Sub delivered the outbound message at
17:01:40 and the skill reported the send at 17:01:54, so confirmation ran
fourteen seconds before there was anything to confirm. `reconcileFromMailbox`
runs the same match from the other side. Both orderings are now swept.

### 2. Client transition

Unchanged and untested against production on purpose: manufacturing a fake
client to prove a timestamp would put a fiction in the table this document
exists to keep honest. The implementation and its tests stand; the next real
client stamps itself.

### 3. Structured history

Still begins 2026-08-09. As of this pass: 1 structured prospect, 5,492 legacy.
The baseline reports both and never adds them together.
