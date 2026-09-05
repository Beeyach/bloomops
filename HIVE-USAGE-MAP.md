# Hive usage map

What the workspace knows about itself, and what actually reads it. Written
2026-08-09 while wiring the first of it into qualification.

Hive is not an assistant. It is workspace memory the automation engine reads:
configuration that should be answered once and reused, rather than inferred
from scratch on every prospect.

Values below are described, not quoted, where they are long or personal.

| Field | Meaning | Set for Ary? | Read by | Should be read by | Layer |
|---|---|---|---|---|---|
| `offer` | What this workspace sells | Yes, one sentence naming forms, booking, reminders, follow-up | Outreach email, **workspace fit (new)** | ✔ current | Workspace |
| `positioning` | Who you help + result + method | Yes, 157 chars | Outreach email, lead scoring, workspace fit | ✔ current | Workspace |
| `audience` | ICP in prose | Yes: coaches, trainers, therapists, service businesses | Lead scoring, **workspace fit (new)**, outreach | Vet, as advisory only | Workspace |
| `voiceSamples` | Real messages that got replies | 2 | Outreach email, DM writer | ✔ current. More would help; two is thin | Voice |
| `greenRules` | What makes a lead worth contacting | **10, customised** | Lead scoring only | **Vet fit signal. Currently unused by the prospect pipeline** | Workspace |
| `redRules` | What disqualifies one | **10, customised** | Lead scoring only | **Prescreen. Currently unused by the prospect pipeline** | Workspace |
| `intentPhrases` | Buying language to search for | Yes, 8 defaults | Lead scanning | Fine as-is; social only | Workspace |
| `platforms` | Where leads are scanned | Yes | Lead scanning | Fine as-is | Workspace |
| `sequenceTemplate` | The 5-email workspace template | **Empty** | Sequence modal | Follow-up generation, once filled | Workspace |
| `promptProjects` | Per-client prompt fill-ins | **Empty (0)** | Chat prompt copying | Nothing. Candidate for removal | Obsolete? |
| `hiddenStages` | Stages this workspace does not use | Yes | Stage dropdown | ✔ current | Workspace |
| `aiKey`, `aiModel` | Their own key and model ceiling | Yes | Every AI call | ✔ current | Product |
| `apifyToken` | Scraping token | Set | Lead scans | ✔ current | Workspace |
| `auto_limits` (separate row) | Budgets and asset switches | Yes | Sweep, research feeder, asset gating | ✔ current | Workspace |

## Connected in this pass

**`offer` + `positioning` + `audience` → capability tags → playbook selection.**

Ary's offer parses to `lead-capture`, `booking`, `follow-up`. It does **not**
contain website rebuilds or SEO, which is correct and is now consequential: a
verified broken image gallery used to produce an outreach angle and now
produces **"real issue, not our offer"**.

That distinction is the point. A verified problem and a reason for *this*
workspace to make contact are two different things, and the product can now say
so.

**`audience` → advisory fit note** on the package. Deliberately advisory:
wanting to work with therapists must never turn "nothing verified" into Strong.
Fit narrows; it never creates.

## Still unused, and worth connecting next

**`greenRules` and `redRules` are the biggest gap.** Ary customised both to ten
entries each, and they are her own answer to "who is worth contacting" and "who
is not". The prospect pipeline ignores them entirely; only the social lead
scorer reads them. Prescreen is the natural consumer for the red rules.

`sequenceTemplate` is empty, so follow-ups have no workspace shape to follow.
Worth filling before follow-up generation is judged.

`promptProjects` is empty and read by one copy-to-clipboard flow. Likely dead.

## The three layers

Keeping these apart is what makes a second customer possible.

- **Product rules** are universal safety. Evidence cannot be invented. DEAD is
  not SKIP. Unreadable is not a bad prospect. An unsubscribe blocks outreach.
  An unanswered reply blocks follow-up. Absence of evidence is not evidence of
  absence. These live in code and no workspace may switch them off.
- **Workspace rules** are the table above: offer, ICP, tone, budgets, asset
  preferences. A future customer sets these and changes nothing else.
- **Playbook rules** are per-angle: required evidence keys, exclusions, CTA,
  asset fit. Shared across workspaces, filtered by workspace capability.

**Leak closed, 2026-08-09.** The outreach prompt used to open "You write one
email for Ary, who builds booking and follow-up systems for small businesses",
and eight other prompts did the same thing. That was a workspace fact welded
into a product module: the offer existed in two places and only the wrong one
was editable, and a second workspace would have received emails describing
somebody else's business.

Identity now comes from `operatorName` and `businessName` in the Hive, via
`lib/hive-context.mjs`. A workspace that has filled in neither reads as "this
workspace" rather than borrowing a name. `GENERATOR_VERSION` moved with the
wording, so packages written before and after are not counted together.

A test strips comments and then asserts that no prompt module contains the
strings "Ary" or "Bloomwired", which also caught two the audit had missed:
`playbooks.mjs` labelled an angle "Something Ary saw herself" and
`evidence.mjs` stamped manual findings "Ary saw this herself", both of which
reach a model and a screen.

## What each AI task now receives

The opposite mistake to the leak, and the easy one to make while fixing it, is
handing every call the entire Hive record. Voice samples are the largest thing
in settings and belong in two prompts; qualification rules belong in one.

| Task | Gets |
|---|---|
| Outreach (first contact) | identity, offer, audience, voice samples |
| Follow-up | identity, offer |
| Reply coach | identity, offer |
| Call prep | identity, offer |
| Proposal | identity only. The template carries the prices |
| Best five | identity only. Ranking already happened in code |
| Objections | identity only |
| Voice note | nothing. Turning speech into fields needs no business context |
| Content scripts | identity, offer, audience. Not voice samples: those are one-to-one messages and read wrong in a script |
| Lead scoring | offer, audience, green and red rules. The only task that reads the rules |
| Asset eligibility | nothing. Decided in code |

A test asserts no credential reaches any task context, and that the
qualification rules reach only the scorer.

## The workspace context hash

A package stores this so "was this email written for the business we are today"
is answerable. It only works if it moves when something that could change the
writing moves, and holds still when something that could not does.

**In:** operatorName, businessName, offer, positioning, audience, voiceSamples,
greenRules, redRules.

**Out, each for a stated reason:** aiKey and apifyToken (credentials, and
rotating one does not change a word), aiModel (stored on the package itself,
where it can be compared directly), hiddenStages (shortens a dropdown),
platforms (where leads are found, not how they are written to), intentPhrases
(a search aid), promptProjects (a copy-paste flow that stores nothing),
sequenceTemplate (applied per prospect and stored on the row).

Both lists are checked against the real settings object by test, because a typo
in either is silent: the field simply stops contributing, and packages stop
being invalidated by a change that should invalidate them.

## Qualification rules

See QUALIFICATION-RULE-MAP.md. The short version: all twenty describe what
somebody wrote, so they are consequential for prospects promoted from a scored
lead and honestly UNKNOWN for everybody else.
