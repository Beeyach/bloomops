# A sequence you cannot send is a sequence you cannot approve

Date: 2026-08-12 · commit `6360a1f` · tests 1,869 passing

You were right, and the hole was bigger than the one you named. Saving a P2
short was not the only problem: **a P2 package missing Email 2 could be given
sequence approval for two touches today.** Proven below, fixed, deployed.

Package 16 is untouched.

---

## Proof that it could be approved

Three things line up, and each one is fine on its own.

**1. Reconciliation calls an incomplete package approvable.**
`reconcileForApproval` returns `RECONCILE.PARTIAL` with `canApprove: true` when
steps are missing. The comment says why, and the reasoning was sound at the
time:

> A band is a CEILING, not a quota, so a short package is approvable. An earlier
> version read the ceiling as a requirement and refused to approve anything
> short of it, which blocked every package in production.

**2. The route wrote the sequence consent from the caller's flag alone.**

```js
const sequenceApproved = body.approveSequence === true;
...
sequence_approved: sequenceApproved ? 1 : 0,
sequence_max_step: sequenceApproved ? recon.finalLength : null,
```

Nothing checked that the emails existed. `recon.missingSteps` was computed,
returned, and then not consulted at the moment it mattered.

**3. `approvalPatch` stamped it unconditionally.**

```js
sequence_approved: 1,
```

So: prepare a P2 with one email, approve it with `approveSequence: true`, and
the row reads *approved for two touches, sequence_max_step 2* over a package
containing one email.

### What that would and would not have caused

It would **not** have sent anything. `stepCoveredByApproval` in the send guard
refuses copy that was not in the package at approval, and the send path reads
Email 2 from `preparedFollowups(pkg)` and blocks with `COPY_NOT_APPROVED` when
it is absent. Both are untouched.

What it would have done is record a consent to two messages when one was read.
That number is what every later decision is made against, and the failure would
have surfaced weeks later as an Email 2 that silently never went.

## The fix

### Preparation cannot hand over an incomplete sequence

`PREPARE_OUTREACH` now computes `missingSequenceSteps(ceiling, followups)`. If
anything is missing, the package is written as **PREPARING** with the first
email preserved, a note is left on the prospect, and the job throws so the queue
retries it with its normal backoff.

`PREPARING` appears on no screen. It is not review work, it asks nothing of
anybody, and the email already paid for is not thrown away.

For the retry to be able to finish the job, `PREPARING` also had to stop
blocking preparation. The existing-package guard read:

```
status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')
```

which made an incomplete package permanent: the retry that exists to complete it
would find the stub and stop. It now guards on `ACTIONABLE_STATUSES` only. The
protection it was written for is intact, because its subject is "something a
person has already looked at" and nobody can look at a PREPARING package.

### Sequence approval requires the copy

`reconcileForApproval` now returns **`canApproveSequence`** alongside
`canApprove`. Partial packages keep `canApprove: true`, so the first email can
still be approved on its own and no existing package in production is blocked —
that regression is not being reintroduced. But `canApproveSequence` is false
whenever a step is missing.

`approvalPatch` writes `sequence_approved` and `sequence_max_step` from that
flag rather than from optimism.

The route **refuses** a sequence approval it cannot honour, with a 409 and the
missing steps, rather than quietly downgrading it to a first-email approval. A
silent downgrade would leave you believing you had authorised two touches while
the record said one, which is the same lie in the other direction.

### One thing that nearly broke on the way

Making `sequence_max_step` conditional meant changing it in two places: the
object the fingerprint is computed over, and the patch written to the row. I
changed one and a test caught it. Those two drifting apart is exactly what once
made every approved package stale the instant it was approved. There is now a
test that fingerprints the stored row and asserts it matches the fingerprint the
approval wrote, across both bands and both completeness cases.

## Tests

`tests/p2-package-contract.test.mjs`, now **30 behavioural tests** against the
real `reconcileForApproval`, `approvalPatch`, `approvalFingerprint`,
`preparedFollowups`, `missingSequenceSteps` and `ACTIONABLE_STATUSES`.

The ones you asked for:

| Case | Test |
|---|---|
| P2 Email 2 generation failure → not approvable | an unfinished preparation is not actionable · P2 with Email 2 missing is an incomplete sequence · a P2 missing Email 2 cannot receive sequence approval |
| Retry succeeds → READY with both touches | a retry that writes the missing step makes the package complete · P2 with both touches is complete, so preparation may publish it |
| P2 missing Email 2 cannot receive sequence approval | the approval patch refuses to stamp a sequence it cannot justify (`sequence_approved` 0, `sequence_max_step` null) |
| P3 one-touch remains valid | P3 needs exactly one touch and approves complete · P3 needs exactly one touch, so it is never incomplete |
| Existing full P2 approves normally | a complete P2 approves normally, sequence and all |

Plus: P1 not widened past three; a package with no first email is approvable by
nothing; the fingerprint still changes when Email 1, Email 2 or the allowed
length changes; the stored row matches its own fingerprint.

Suite: **1,869 passing**, up from 1,856.

## Deployment

| | |
|---|---|
| Commit | `6360a1f` |
| Target | Cloudflare Pages, production |
| Verified | deployment list shows `6360a1f` |
| Auto-send switches | both **false**, untouched |

## Cynthia, untouched as instructed

| | |
|---|---|
| Package | 16, `READY_FOR_APPROVAL` |
| `approved_fingerprint` | null |
| `sequence_approved` | 0 |
| `reviewed_at` | null |
| `allowed_length` | null |
| `emails_sent` | 0 |

Nothing about her was edited, retired, approved or sent.

## Your move

Retire package 16 through the UI. Then say so and I will run the canonical
prepare job, which under the new contract will either produce a complete
two-touch package or refuse to produce one at all.

## Separate backlog, still not chased

1. `hasCalendar` false-positives on CSS icon classes
2. `clientsecure.me` missing from scheduling hosts
3. `contact-page-no-form` ignores some off-site enquiry paths
4. debug passthrough access restriction
5. a job in backoff looks identical to a stuck one
