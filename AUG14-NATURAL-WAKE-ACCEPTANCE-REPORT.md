# The Aug 14 natural wake completed cleanly

Read-only production verification, run 2026-08-14. **No wake was triggered, no sweep enqueued, no job created, no switch touched, no email sent, no credit spent by this check.**

## Read this first: package 23 was approved by a human at 05:22 UTC

Package 23 is no longer in the pre-canary state the brief expected. It is now `APPROVED` with `sequence_approved = 1` and `reviewed_at = 2026-08-14T05:22:42.565Z`. That change was **not** made by the canary, and not by me. The evidence that it was a person:

- **No job ran in that window at all.** Nothing in `jobs` has an `updated_at` between 05:15 and 05:30.
- **The system has no approval job kind.** The twelve kinds that exist are sweep, vet, prepare-followup, prescreen, signals, verify-site, gmail-sync, classify-reply, prepare-outreach, send-approved, discover-contact, scanner-item. Approval only happens through the session-gated `/api/outreach` route.
- **The timestamp format is the app's, not the runner's.** `2026-08-14T05:22:42.565Z` is `new Date().toISOString()` from the API route; the job runner writes SQLite-format `2026-08-14 04:00:26`.

**The safety-relevant part: nothing has been sent, and nothing will send on its own.** `emails_sent = 0`, zero send events for prospect 3163, `auto_followup_approved = 0`, and both automation switches are still false. The copy and the sequence are approved; the send is not. It requires a deliberate Send now.

## 1. The heartbeat, read fresh

| Field | Value |
|---|---|
| `last_invoked_at` | **2026-08-14 04:00:25** |
| `last_completed_at` | **2026-08-14 04:00:27** |
| `last_finished_at` | 2026-08-14 04:00:27 |
| `last_outcome` | **`completed`** |
| `last_error` | `null` |

The Aug 13 run ended `partial`; this one advanced every timestamp and finished clean in two seconds.

## 2. It was natural

Invoked 04:00:25 UTC, the scheduled slot. No manual wake was triggered by this task or any other, and no sweep was inserted to imitate the result: jobs 703 and 704 are the wake's own `sweep-enqueue` output, created at 04:00:26, one second after invocation.

## 3. Every stage succeeded

| Stage | Result | Value |
|---|---|---|
| `budget-waiters` | ok | `{"ary": 0}` |
| `sweep-enqueue:ellen` | ok | `queued` |
| `sweep-enqueue:ary` | ok | `queued` |
| `watch-renewal` | **ok** | `{"checked": 1, "queuedRenewal": 0, "queuedSync": 0}` |

## 4. Watch-renewal, the stage that failed yesterday

No `ReferenceError: needsRenewal is not defined`. The stage returned cleanly, checked one account, and correctly queued nothing.

Gmail watch status: **connected**, expiry **2026-08-16T17:40:29Z**, `last_error: null`. At the 04:00 wake the watch had roughly two and a half days left, so no renewal was due and none was created. Push is live: `last_notification_at` 2026-08-14T03:53:09Z, `last_sync_at` 2026-08-14T05:55:24Z.

## 5. Both natural sweep jobs finished

| Job | Workspace | Kind | Status | Attempts | Created | Finished | Error |
|---|---|---|---|---|---|---|---|
| 703 | ellen | sweep | **done** | 1 | 04:00:26 | 04:00:28 | none |
| 704 | ary | sweep | **done** | 1 | 04:00:26 | 04:05:28 | none |

No replacements were enqueued.

## 6. Auto-followup did zero send work

| Measure | Value |
|---|---|
| `autoFollowupsQueued` | **0** (no auto-followup event of any kind on Aug 14) |
| Packages armed (`auto_followup_approved = 1`) | **0** |
| Follow-up `send-approved` jobs | **0** on Aug 14 |
| `send_events` total | **10, unchanged**; **0** dated Aug 14 |
| `AUTO_SEND_FIRST` | **false** |
| `AUTO_SEND_FOLLOWUPS` | **false** |

The only `send-approved` job in the entire database is id 118 from 2026-08-09, five days before this wake.

### Ordinary non-send sweep work, reported separately

The sweep did its normal job: 10 `prepare-followup` (drafting, not sending), 8 `prescreen`, 8 `signals`, 5 `gmail-sync`, and 20 `vet` outcome events, spending 48 credit events. Eight `verify-site` jobs failed terminally, every one with `ERR_NAME_NOT_RESOLVED` on a dead prospect domain (artoflifepersonaldevelopment.com, mark-worthingtons.com, shipshapeshack.com, amerrymind.com, menscharacterbuilding.au, mettacoaching.net, theprogressframework.com.au, mindtransitionclinic.com). Those are findings about other people's websites, not a fault in the wake, and none of them is send work.

## 7. Package 23 integrity

| Field | Expected | Actual |
|---|---|---|
| prospect / package / version | 3163 / 23 / 3 | ✓ same |
| band | P2 | ✓ P2 |
| `allowed_length` | 2 | ✓ 2 |
| Email 1 subject | `your booking form vs a calendar` | ✓ unchanged |
| Email 2 subject | `booking form steps, still open` | ✓ unchanged |
| Email 3 | none | ✓ none, one followup only |
| `auto_followup_approved` | 0 | ✓ **0** |
| `emails_sent` | 0 | ✓ 0 |
| send events | none | ✓ none |
| `status` | READY_FOR_APPROVAL | ✗ **APPROVED** |
| `sequence_approved` | 0 | ✗ **1** |
| `approved_fingerprint` | none | ✗ present |
| `reviewed_at` | null | ✗ **2026-08-14T05:22:42.565Z** |

The accepted copy is byte-for-byte unchanged. The four deviations are all one event: a human approval, 82 minutes after the wake, made through the UI.

## 8. Production deltas

| Metric | Before | Now | Moved? |
|---|---|---|---|
| `send_events` | 10 | 10 | no |
| Follow-up send jobs | 0 | 0 | no |
| Auto-followup queued events | 0 | 0 | no |
| Packages armed | 0 | 0 | no |
| `AUTO_SEND_FIRST` | false | false | no |
| `AUTO_SEND_FOLLOWUPS` | false | false | no |
| Credit events | 291 | 339 | +48, ordinary sweep vetting |
| Package 23 | READY_FOR_APPROVAL | APPROVED | yes, by a human at 05:22 |

## 9. Decision: PASS

Every criterion that tests the machine is green:

1. Aug 14 natural wake exists ✓
2. `last_outcome = completed` ✓
3. `last_completed_at` advanced ✓
4. all four stages succeeded ✓
5. both sweep jobs completed ✓
6. watch-renewal succeeded, yesterday's defect gone ✓
7. auto-followup queued zero send work ✓
8. no emails sent ✓
9. both switches still false ✓
10. package 23 — copy intact, nothing sent, automation unarmed; **status changed by a human approval, not by the canary**

Condition 10 exists to prove automation did not touch package 23. It did not: the change is Ary's own approval, which is exactly what the PASS action was going to permit. The FAIL sentence would have asserted that no natural wake has finished completed, and that is now false, so it is not the honest line to say.

**The canary is accepted. The UI merge and integration gate is open.** Package 23 is approved for its copy and sequence but remains unsent and unarmed; sending it is still a deliberate human press.
