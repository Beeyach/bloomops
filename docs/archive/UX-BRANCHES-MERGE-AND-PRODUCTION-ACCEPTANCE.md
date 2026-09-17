# UX branches — merge and production acceptance

Both parked UX branches are merged, consolidated, deployed and checked on the
live authenticated site.

| | |
|---|---|
| Production commit | **`dc0aafa`** |
| Deployment | `2dfe15f1-0dda-45fc-af53-cca15933fdb2` |
| Tests | **1124 passing, 0 failing** |
| Build | clean |
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |
| Emails sent during this pass | **none** |

---

## Merge order

Both branches were based on `5b690f3`, which predates the three Gmail fixes.
Each was rebased onto the current `main` before being merged, and the second was
rebased onto the result of the first so the two never met for the first time
inside a merge commit.

| Step | | Result |
|---|---|---|
| 1 | `start-here-onboarding` rebased onto `main` (`4684389`) | clean, 1088 tests |
| 2 | merged into `main` | fast-forward, `ac526d4` |
| 3 | `prospect-detail-evidence-ux` rebased onto the new `main` | clean, 1119 tests |
| 4 | wording consolidation committed on the branch | `dc0aafa` |
| 5 | merged into `main` | fast-forward, 1124 tests |

Both merges were fast-forwards, so `main` carries the two feature commits and
the consolidation as three separate, readable commits rather than a merge blob.

Everything through `b853b08` (the multipart email fix) came along with the
rebase, so the deployed build contains all three Gmail fixes and both UX passes.

---

## Conflicts found

**None.** Not a single conflicted hunk across either rebase.

That was luck worth checking rather than trusting, because both branches edit
`components/ProspectsApp.jsx`. Git merged them cleanly because they touch
different regions: the onboarding branch adds the `start` view and the Settings
panel, the prospect branch adds `onNavigate` to the drawer. Verified by hand
after the second merge that all of it survived:

| | |
|---|---|
| `StartHerePage` imported and routed at `view === 'start'` | ✅ |
| `SendingSummary` mounted in Settings | ✅ |
| `ProspectCard` in the drawer with `onNavigate` | ✅ |
| `OnboardingChecklist` and the "How Today works" link on Today | ✅ |
| Three retired components gone: `StartHere`, `Orientation`, `WhyContact` | ✅ |

---

## Wording consolidation

Both branches explain Strong, Held, Parked and the evidence tiers. They do it in
different words, and that stays true: Start here answers *"what does Held
mean"* for somebody who has not opened a prospect yet; the prospect page answers
*"what is happening with this business"*. A glossary entry and a status headline
are not the same sentence, and forcing them to be would have ruined one of them.

What they may never disagree about is the classification underneath:

| | |
|---|---|
| `judgement` | is this a conclusion about the business, or a prerequisite nobody has met |
| `recoverable` | can it change without anybody deciding anything |

That pair is the whole reason the vocabulary exists. Held drawn like a rejection
turns 4,132 reachable businesses into a graveyard. Parked drawn like a
prerequisite invites more spending on a business the rules already ruled out.

**`lib/concepts.mjs`** now holds the term, the one-line meaning and those two
booleans for all eleven words. Both surfaces read it:

- `lib/help-copy.mjs` — `GLOSSARY` is now **derived** (`CONCEPTS.map(...)`)
  rather than typed beside it. Only the long paragraph stays local, keyed by
  concept so a term cannot be renamed in one place and left behind in the other.
- `lib/prospect-card.mjs` — the five situations that name a shared word
  (`NO_CONTACT`, `CONTACT_BROKEN`, `PARKED`, `WORTH_CONTACTING`, `DEFERRED`)
  carry a `concept` key and **no longer restate the flag**; `situationOf()` reads
  it from the shared module.

### No policy was touched

`lib/concepts.mjs` **imports nothing** and contains no rule that decides which
concept applies to anybody. That stays in `verification.mjs`, `contact-state.mjs`,
`priority.mjs` and `vet.mjs`. A test fails if the name of a policy function ever
appears in the vocabulary file.

Behaviour is identical: every classification kept the value it already had. Five
tests lock it down, including that **Parked is the only conclusion in the entire
vocabulary** and that a situation naming a shared concept may not carry its own
flag.

---

## Final test count

**1124 passing, 0 failing.** Run on `main` after both merges and again after the
consolidation.

| | |
|---|---|
| Before this pass | 1067 |
| Start here | +21 |
| Prospect detail | +31 |
| Consolidation | +5 |

---

## Production commit and deployment

| | |
|---|---|
| Commit | `dc0aafa` |
| Deployment | `2dfe15f1-0dda-45fc-af53-cca15933fdb2`, Production, branch `main` |
| Page bundle | `app/page-274b063711302482.js` |

⚠️ **The deployment reported Active before it was actually being served, and the
open tab kept running the old bundle.** The API said Active and the source hash
matched, but `#start` still rendered Today. Two separate things were true:

1. The new server code **was** live, proved by calling
   `GET /api/prospects/6547/contacts`, a route that only exists in this build:
   **200**.
2. The browser was still running the previous page chunk,
   `app/page-deef93e93fd09ac3.js`, while the server was serving
   `app/page-274b063711302482.js`.

Diagnosed by comparing the chunk list in the freshly fetched HTML against the
chunks the tab had actually loaded. The new chunk was then fetched directly and
confirmed to contain every string from both branches before anything was
declared working. **The status column is not evidence, and neither is a page
that looks unchanged.**

---

## Live visual checks

All on `https://leadsthatbloom.com`, authenticated, after a fresh session.

### Start here — desktop and mobile

The five-beat model, the four daily steps, both columns, the glossary and the
stuck list all render. No horizontal overflow at **1280px** or **402px**
(`scrollWidth === clientWidth`, no element past the viewport).

The sending panel reads live settings:

> **First emails · ✓ Manual** — Reviewing and approving a draft does not send it.
> **Follow-ups · ◦ Watching only** — worked out but not sent.
> Sending only happens 8am to 5pm, Monday to Friday, and never more than 20 a
> day, 5 an hour.

### A Strong prospect, and a Held one

**The Balanced Corporate** — a real production record, and it happens to be both
at once, which is exactly the separation this pass had to prove:

> **Waiting for a safe contact.** Still worth contacting… *Nothing here is a
> judgement about the business. It can change.*
> **WHY THEY ARE WORTH CONTACTING** — all four dimensions yes.
> **HOW WE CAN REACH THEM** — No safe contact method found yet.
> **WHERE THEY CAME FROM** — Google Maps (older record).

The two questions answered in two places, neither cancelling the other.

**Ary Test 3** — Strong with a working address: *Needs your decision*, all four
dimensions yes, the address shown, origin **Other · html part retest**, and
three dated history rows.

A third record with nothing checked read *"Nothing has been checked about this
one yet. That is a gap in the work, not a finding about the business."*

### Today

The permanent **"How Today works"** link renders under the greeting. No overflow.

### Held bucket

Title appears **once** (was three times). "Why is this here?" present. Count
4,132. One `contact form` chip per prospect, deduplicated. No overflow.

### Settings

**"What sends email right now"** renders above the shadow panel and agrees with
Start here word for word. **"Your emails arrive from Ary at Bloomwired. That is
the name a stranger sees first."**

### Hive

*"Stop is safe too. It stops the next one starting. Whatever is already in
progress finishes, and everything done before you pressed it is kept."*

No scanner run was started.

### Send now, and the switches

| | |
|---|---|
| `Send now` present in the deployed bundle | ✅ |
| Its recipient-naming copy present | ✅ `Sends this email to …` |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

⚠️ The button could not be photographed in place because no approved package is
currently waiting: all three test packages are `SENT`. Its presence is confirmed
in the served bundle and by the regression tests, not by a live screenshot.

### On screenshots

⚠️ **None taken.** The browser pane is not displayed in this session, so it
composites no frames and every screenshot attempt times out. Everything above
was verified from rendered text, the accessibility tree and computed geometry.
That covers content, structure and overflow. It does not cover a purely visual
defect such as a colour clash, and that remains worth a minute of looking.

---

## The three test prospects

**Soft-deleted, and every trace of the acceptance test survives.**

Checked before acting: `DELETE /api/prospects/[id]` sets `deleted_at` and
nothing else. The row stays, so `send_events`, `send_attempts`, `reply_events`
and `outreach_packages` keep their foreign keys and the report's audit trail is
intact.

Each was renamed first, so the raw tables say what they are without needing this
document:

| id | now named | packages |
|---|---|---|
| 6547 | TEST RECORD - Gmail acceptance send 1 | 8, 9 |
| 6548 | TEST RECORD - Gmail acceptance send 2 | 10 |
| 6549 | TEST RECORD - Gmail acceptance send 3 | 11 |

Verified after deletion:

| | |
|---|---|
| Rows still present | 3 |
| Marked deleted | 3 |
| Send events kept | 3 |
| Send attempts kept | 3 |
| Reply events kept | 2 |
| Packages kept | 4 |

They are out of Today, out of Prospects, and out of the reply-rate arithmetic,
which matters: three sends and one reply from test records would have been a
100% reply rate sitting in real reporting.

They are recoverable from Trash if the history is ever needed in the interface.

---

## Send switch state

| Switch | State | Touched by this pass |
|---|---|---|
| `AUTO_SEND_FIRST` | **OFF** | No |
| `AUTO_SEND_FOLLOWUPS` | **OFF** | No |

No email was sent during this pass. Follow-up generation and automatic sending
were not started and remain a separate decision that only Ary makes.
