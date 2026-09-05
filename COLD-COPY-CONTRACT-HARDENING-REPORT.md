# What a cold email may say

Date: 2026-08-12 · commit `614033a` · tests 1,879 passing

Both patterns are fixed centrally and deployed. **Package 17 needs retiring in
the UI before Cynthia can be regenerated** — there is no canonical non-human
path to retire it, and I checked rather than assumed.

---

## Part 1 — why the current copy passed

### The industry generalisation

The prompt already said, in `lib/outreach.mjs`:

> Never claim what happens to other businesses like theirs. No statistics, no
> "most owners", no numbers about their industry.

Every example in that sentence is quantitative, so the model obeyed it
literally and wrote a qualitative one instead.

The validator should have been the backstop. It has three peer-generalisation
rules in `lib/followup.mjs`, and **all three key on a loss verb**:

| Rule | Requires |
|---|---|
| 1 | `a lot of / most / many / N% of` … `lose, miss, never, forget, fail` |
| 2 | `this is usually / often the point` … `lose, miss, drop, slip, wait` |
| 3 | `usually / often` … `people, owners, businesses` … `lose, miss, forget, wait` |

The draft said *"for a therapy practice that first contact often happens late at
night or in a moment someone finally decides to reach out"*. Nothing is lost in
that sentence. It carries no number, names no proportion, and uses the verb
"happens". Run against all five relevant rules including the statistic check:

```
passed  peer/loss #1     passed  peer/loss #2     passed  peer/loss #3
passed  statistic        passed  filler opener
```

Five for five. The rules were written from the drafts that existed at the time,
and every one of those drafts was about loss.

### The follow-up opener

`lib/followup-v2.mjs` has its own banned list, separate from the one Email 1
uses. It holds `circling back`, `bumping this`, `touching base`, and stops one
synonym short of `just checking in`. The same five checks on that line: five
passes.

There was also no opener rule at all. The list is applied to the whole body, so
even a match would not have known the phrase was setting the tone rather than
appearing in passing.

## Part 2 — the fix

### No unsupported peer or industry behaviour

`PEER_BEHAVIOUR` in `lib/followup.mjs`, applied to Email 1, catching the shape
rather than the vocabulary of loss:

- `businesses / practices / clinics / coaches / people / clients … like yours`
- `for a <trade> …` within 80 characters of `often / usually / typically /
  tends to`
- `people / clients / customers / patients / enquiries … often / usually /
  tend to`

The prompt line was rewritten so its examples are no longer all numeric, and it
now names the only three things an email may contain:

> Never describe what people in their trade do, feel or when they get in touch.
> No statistics, no "most owners", no "for practices like theirs", and no
> sentence about their clients that did not come from the evidence. You have
> not met their clients.
>
> You may say only three kinds of thing: what was observed on their site, what
> you could not tell from outside, and the offer.

### No filler opener

`FILLER_OPENER` in `lib/followup-v2.mjs`, checked against **the first sentence
after the greeting only**, so the rule is about where a phrase sits rather than
that it exists anywhere:

- `just checking in`, `just following up`, `just wanted to follow up / check in`
- a body opening on `checking in` or `following up`
- `wanted to see / check if you saw / got / had seen`
- `following up on my / the last email / note / message`

The follow-up prompt gained the positive instruction alongside the bans: the
first sentence after the greeting is the offer or the reason, never an
announcement that this is a follow-up.

### A flag was not enough

Email 1's checks produce flags, which are advice shown next to the draft. That
is right for "this is a bit long" and wrong for a sentence stating something
about a stranger's clients that nobody verified: the only reason that one never
reached an inbox is that Ary read it.

So `PREPARE_OUTREACH` now separates advice from disqualification. A flag naming
an industry claim, a peer claim, an unsourced statistic or an unfilled
placeholder stops the package and throws, and the queue asks for another draft
the same way it retries anything else. Everything else still flags and passes.

Follow-ups already worked this way: `validateFollowup` returning `ok: false`
breaks the loop, which leaves the sequence incomplete, which under the contract
shipped earlier today means PREPARING rather than READY.

## Part 3 — tests

`tests/cold-copy-contract.test.mjs`, 10 behavioural tests through the real
`parseFollowUp`, `parseFollowup` and `validateFollowup`. The fixtures are the
exact sentences that shipped, and each group starts by proving the old rules
missed them.

| | |
|---|---|
| The exact therapy sentence | now flagged `a claim about how their industry behaves` |
| Five other shapes of it | `businesses like yours usually`, `for most clinics, people often`, `clients tend to`, `enquiries usually`, `practices like yours often` |
| Observation is not generalisation | all four sentences of the real Email 1 that describe her site, what could not be told from outside, and the offer, produce **no** flags |
| Statistic and loss rules | still fire, unchanged |
| The exact `Just checking in` opener | now `opens on filler` |
| Four other filler openers | all caught |
| Opening on the offer | passes |
| `following up` later in the body | **not** an opener, so it passes |
| A clean follow-up | still validates `ok: true` |
| Sign-off survives validation | both emails |

One pre-existing test in `tests/outreach.test.mjs` pinned the old prompt
sentence word for word. It now asserts the intent — that the prompt forbids
describing the trade, and confines the email to the three permitted things —
rather than the phrasing, so rewording it again does not break the suite for
the wrong reason.

Suite: **1,879 passing**, up from 1,869.

## Part 4 — package 17

**Not approved, not edited, not touched.**

| | |
|---|---|
| Package 16 | `SKIPPED`, preserved, reviewed 07:05 |
| Package 17 | `READY_FOR_APPROVAL`, fingerprint null, `sequence_approved` 0, `reviewed_at` null |
| `emails_sent` | 0 |
| send_events | 0 |

### There is no canonical non-human way to retire it

Checked rather than assumed:

- `PREPARE_OUTREACH` refuses while a package is in `ACTIONABLE_STATUSES`, and
  17 is `READY_FOR_APPROVAL`
- the only retire actions are `skip` and `research` on `POST /api/outreach`,
  both of which require Ary's signed session
- `STATUS.STALE` exists in the enum and nothing in the codebase ever writes it
- writing the status directly was attempted for package 16 earlier and refused
  by the permission layer, correctly

So the boundary holds and I stopped at it.

## Deployment

| | |
|---|---|
| Commit | `614033a` |
| Target | Cloudflare Pages, production |
| Verified | deployment list shows `614033a` |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

## What Ary does

Retire **package 17** on Cynthia's card, the same way you retired 16. Then say
so and I will regenerate 4860 canonically. Under the new contract the writer
will either produce two touches that pass both rules, or produce nothing and
retry — it cannot hand over a draft carrying an invented claim about her
clients.

## Separate backlog, still not chased

1. `hasCalendar` false-positives on CSS icon classes
2. `clientsecure.me` missing from scheduling hosts
3. `contact-page-no-form` ignores some off-site enquiry paths
4. debug passthrough access restriction
5. a job in backoff looks identical to a stuck one
