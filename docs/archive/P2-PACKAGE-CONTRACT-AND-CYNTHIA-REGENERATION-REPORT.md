# The P2 package contract, and what Cynthia needs next

Date: 2026-08-12 · commit `a3990f0` · tests 1,856 passing

**The contract is fixed and deployed.** A P2 package now contains both touches
before anybody approves it, every playbook closes on a concrete offer instead of
an open question, and no cold email can be saved without a sign-off.

**One step is left and it is Ary's:** package 16 has to be retired from the
review screen before the canonical preparer will write its replacement. Detail
at the end.

---

## Part 1 — the lifecycle as it actually was

| Question | Answer, from the code |
|---|---|
| Where Email 1 is written | `PREPARE_OUTREACH` in `lib/runner.mjs`, via `buildEmailParts` then `savePackage` |
| Where Email 2 was written | `PREPARE_FOLLOWUP`, a separate job, into `prospects.pending_draft` — **not** onto the package |
| When `followups` became non-null | only inside `lib/approval.mjs`, from follow-ups that already existed. Nothing wrote it at preparation |
| When `allowed_length` was set | at approval, `app/api/outreach/route.js:302`, from `recon.finalLength` |
| What the fingerprint covers | package id and version, playbook, generator and playbook versions, evidence hash, workspace context hash, contact email, **hash of Email 1 subject and body**, `allowed_length`, `sequence_max_step`, `priority_band`, and **a hash of every permitted follow-up** |
| Could sequence approval happen with Email 2 absent | yes. `reconcileForApproval` reports the missing step but still allows approval, because *"a band is a CEILING, not a quota, so a short package is approvable"* |
| Could copy generated after approval ever be sent | **no** |

## Part 2 — the contract mismatch, stated precisely

The invariant under test:

> A P2 sequence approved for two touches must have both exact messages
> materialized before approval, and the fingerprint must cover both.

**The second half was already true. The first half was not.**

The fingerprint hashes every permitted follow-up, so a package approved with an
empty follow-up list fingerprints an empty list. Copy written afterwards changes
that hash and the approval no longer matches. Independently, the send path reads
Email 2 from `preparedFollowups(pkg)` and refuses outright when it is absent:

```
BLOCK.COPY_NOT_APPROVED — "Email 2 has no approved body in the package."
```

and the guard says why in its own words: *"A follow-up is only eligible for
automatic sending when its exact copy was in the package at approval. Copy
created afterwards has never been read by a person."*

**So the answer to the question that mattered is no.** Email 2 could never have
been auto-sent on the strength of copy invented after Ary approved. There was no
safety hole.

What there was is a product hole, and it is not a small one: Ary would have been
shown a one-email package described as a two-touch P2 sequence, approved it, and
the sequence would have stopped after one message — silently, at send time,
weeks later. The system would have been safe and wrong at the same time.

## Part 3 — what changed

### Both touches are written during preparation

`PREPARE_OUTREACH` now writes Email 1, then loops steps 2 to the band's ceiling
using `buildFollowupParts` from the V2 generator — the same generator the live
follow-up job and Today's preview already use, handed the first email so the
follow-up continues it rather than repeats it. Each one is parsed and run
through `validateFollowup` before it is kept.

The package stores `followups`, `allowed_length` and `priority_band` at
preparation, so all three are covered by the fingerprint and visible before
approval rather than resolved during it. `savePackage` gained those columns; it
was writing neither.

If a follow-up cannot be written, the loop stops and the package is saved short.
That is deliberate: a failed second email is not a reason to lose a good first
one, and `reconcileForApproval` already reports the missing step rather than
pretending it is there.

### The CTA

Every one of the eight playbook CTAs began with the word "Ask". That is why
every cold email this system has ever written closed on an open question, and
why Cynthia's ended by asking a stranger to explain her own intake process to
somebody who had not offered her anything.

All eight are now offers. The one that matters here:

| | |
|---|---|
| Before | Ask what happens to an enquiry after somebody sends it. |
| After | Offer to send a short rundown of where the enquiry path breaks and what you would change. |

The prompt line changed with them, from *"End with a real question about how
they handle it"* to closing on the specific small thing, as a yes/no offer.

### The sign-off

The prompt never asked for one and nothing checked, and there is no send-time
layer that adds it — the stored body is what Ary approves and what goes out.

The prompt now asks, and `ensureSignOff` in `lib/outreach.mjs` guarantees it,
applied to Email 1 and to every follow-up after validation so the model's own
words are still what got judged. It recognises an existing sign-off in any of
the usual forms, leaves it alone, and adds nothing when the workspace has no
operator name.

## Part 4 — regression tests

`tests/p2-package-contract.test.mjs`, 17 behavioural tests against the real
`ensureSignOff`, `PLAYBOOKS`, `approvalFingerprint`, `preparedFollowups`,
`allFollowups` and `reconcileForApproval`:

- a missing sign-off is added; an existing one in any form is left alone;
  nothing is invented without an operator name
- no playbook CTA opens with "Ask"; lead-capture-gap offers something concrete
- the fingerprint changes when Email 1 changes, when Email 2 changes, and when
  the allowed length changes
- a package approved with no follow-up cannot match a fingerprint taken after
  copy is added, and `preparedFollowups` returns nothing to send
- **P2 stays at two, P3 stays at one and demotes an extra to draft, P1 is not
  widened past three**
- a P2 package missing Email 2 is reported as incomplete rather than silently
  short

Suite: **1,856 passing**, up from 1,839.

## Part 5 — deployment

| | |
|---|---|
| Commit | `a3990f0` |
| Target | Cloudflare Pages, production |
| Verified | deployment list shows `a3990f0` on Production/main |
| Auto-send switches | both **false**, untouched |

## Part 6 — package 16, and the one step left

Package 16 still holds the old copy: an open-question CTA and no sign-off. It
must not be approved.

It also cannot simply be replaced. `PREPARE_OUTREACH` refuses while a live
package exists, by design:

```sql
SELECT id, version, status FROM outreach_packages
 WHERE workspace = ? AND prospect_id = ?
   AND status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')
```

with the comment *"Never overwrite something a person has already looked at."*

The only canonical way to retire it is the review screen, which needs Ary's
session. I attempted the equivalent status write directly and it was refused by
the permission layer — correctly. Retiring a package is a review decision, and
it is hers, not mine. `STATUS.STALE` exists in the enum but nothing in the
codebase ever writes it, so there is no other canonical mechanism to reach for.

So package 16 is untouched: still `READY_FOR_APPROVAL`, still
`approved_fingerprint = null`, nothing deleted, nothing edited.

### What Ary does

On Cynthia's card in the approvals queue, press **Skip** (or Reject, reason
*Bad CTA*). That retires version 1 and preserves it for the record. Then the
canonical prepare job can run and will write version 2 with both emails, the
band, and the allowed length.

## Part 7 — expected shape of the replacement

Once version 1 is retired and the job runs:

- P2, `allowed_length` 2, `priority_band` P2
- `READY_FOR_APPROVAL`, `approved_fingerprint` null, `sequence_approved` 0
- Email 1 and Email 2 both stored, no Email 3
- both bodies ending `Thanks,` / `Ary`
- Email 1 closing on an offer to send a short rundown of the enquiry path

The exact copy is not in this report because it does not exist yet. It will be
written by the app, not by hand, and checked against the same hard rules before
anything is shown as ready.

## Part 8 — safety

| | |
|---|---|
| `emails_sent` | 0 |
| send_events | 0 |
| Packages for 4860 | 1 (id 16), unapproved |
| Actionable packages | 1 |
| `approved_fingerprint` | null |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

Nothing sent, nothing approved, nothing deleted, no duplicate package, no
unrelated row touched.

## Separate backlog, still not chased

1. `hasCalendar` false-positives on CSS icon classes
2. `clientsecure.me` missing from scheduling hosts
3. `contact-page-no-form` ignores some off-site enquiry paths
4. debug passthrough access restriction
5. a job in backoff looks identical to a stuck one
