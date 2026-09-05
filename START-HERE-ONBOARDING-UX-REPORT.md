# Start here — in-app onboarding

**NOT DEPLOYED.** Implemented, tested and reviewed on branch `start-here-onboarding`.
Production is still on `5b690f3` while the native Gmail acceptance test finishes.

Nothing in this pass touches sending, approval, guards, windows, the queue or
either switch. Both remain OFF.

---

## Existing help audit

Nine surfaces already existed. Two of them were actively teaching a product that
no longer exists.

| Surface | Where it lived | Verdict | What happened |
|---|---|---|---|
| `Orientation.jsx` — "Start with one thing" welcome, 4-card map, a 5-step order, an SVG loop diagram | Top of Today | **REMOVE** | Deleted. It described find → score → write a DM → track, which is the pre-V2 loop. Its diagram read *Find · Score · Write · Track · Deliver*, and its steps sent people to Leads and the AI Hive to score leads by hand. None of that is how outreach works now |
| `StartHere.jsx` — 3-step setup checklist (positioning, voice samples, score a lead) | Top of Today | **REWRITE** | Deleted and replaced by `OnboardingChecklist.jsx`. Step 3 was "score your first lead", again the old loop. The name is reused for the new page |
| "Automation guide" (`guide-automation`) | Sidebar, **AI** section | **DEMOTE** | Left in place but now sits below Start here in the reading order, and is reachable from Start here's Technical details |
| "Connect an AI" (`guide-agents`) | Sidebar, Resources, admin-only | **KEEP** | Already admin-gated. Untouched |
| "Sourcing guide" (`guide-sourcing`) | Sidebar, Resources | **KEEP** | Untouched, linked from Technical details |
| "Templates" (`workspace`) | Sidebar, Resources | **KEEP** | Untouched |
| `Hint.jsx` — dismissible one-time tip | 6 screens | **KEEP** | Reused as-is |
| `InfoTip.jsx` — inline "?" bubble | Settings, Leads, Skill Studio | **KEEP** | Reused as-is |
| Bucket titles, blurbs and empty lines in `lib/today-buckets.mjs` | Today + bucket pages | **KEEP + extend** | Blurbs kept. Empty states extended, see below |
| `HowItWorksModal` in the Hive | AI Hive | **KEEP + extend** | One line added about Stop |

### Workspace pages, deliberately untouched

The sidebar also carries **How this workspace works**, **Build Guide**,
**Automation Blueprint**, **Field Manual**, **Apify FB playbook** and two pages
both called **What people say**. These are rows in the database, not code: they
are Ary's own Notion-style pages. Nothing in this pass edited, moved or deleted
any of them.

They are, however, part of the problem the brief describes. Two of those titles
("Build Guide", "Automation Blueprint") read like the product manual and are not
one. Start here now exists above them in Resources so there is a correct place
to land. **Tidying her own pages is her call, not mine.**

### One thing the brief expected that does not exist

Section 9 asked for plain-language consequences on the **Settings automation
switches**. There are no automation switches in Settings. `autoSendApprovedFirstEmails`
and `autoSendApprovedFollowups` are stored settings with **no UI at all** — they
can only be changed through the API.

I did not build that UI. Adding a control that turns on automatic emailing is
not a thing to slip into a help pass, and certainly not during a live send test.
What went in instead is a read-only panel that says what the switches are
currently doing.

---

## User mental model

The five beats, in `lib/help-copy.mjs`:

> **LTB finds → LTB checks → LTB prepares → You decide → LTB keeps track**
>
> Most of the research and sorting happens in the background. Today shows the
> few things that actually need you.

"LTB prepares" rather than "Claude writes", on purpose: preparation is native
today and may be skill-assisted later, and that distinction is not something a
person operating the product should have to hold.

---

## Start here

Route `#start`, view key `start`, label **Start here**, first entry in the
**Resources** sidebar section. `components/StartHerePage.jsx`.

| Section | Why it is there |
|---|---|
| The whole thing in one line | Five beats. The one thing to remember if nothing else lands |
| What you do each day | The most important section. Four steps, no more |
| What the app does, and what only you can do | The recurring "what am I responsible for" question, in two columns |
| What will actually send an email | The most-asked question, read live from settings |
| Words you'll see | 11 terms, each a one-line answer with the rest behind a disclosure |
| When something looks stuck | Four failure shapes and where each one goes |
| Technical details | Collapsed. Links to Settings and the two setup guides |

Second way in: a permanent, non-dismissible **"How Today works"** link under the
Today greeting. The sidebar entry alone was not enough — the Resources section
is collapsible, and on the machine I reviewed it was collapsed, which hid Start
here entirely until I expanded it. A dismissible tip would have been worse
still: no use at all to somebody who dismissed it three weeks ago and has now
forgotten what Held means.

---

## Automatic vs human

The static half lives in `lib/help-copy.mjs` (`AUTOMATIC`, 10 items; `YOURS`,
5 items). Every line was checked against the code that does the thing. Where
something is conditional the condition is in the sentence: *"when they pass the
first look"*, *"when there is enough to say, and the day's budget allows it"*.

Deliberately **not** claimed: automatic sourcing, buying contact data, and
sending. The first two do not exist. The third depends on a setting.

### The dynamic half

`lib/sending-state.mjs` turns the stored engine settings into three words and
a sentence each:

| | Switch off | Switch on |
|---|---|---|
| First emails | **Manual** — "Reviewing and approving a draft does not send it. The card then offers Send now, and that is the press that sends it." | **Automatic** — "Approving a draft schedules it. It goes out on its own inside the sending hours below." |
| Follow-ups | **Watching only** — "Follow-ups are worked out but not sent." | **Automatic** — "…using only the words that were in the package when you approved it." |

The window and the caps are read too, not written down: *"Sending only happens
8am to 5pm, Monday to Friday, and never more than 20 a day, 5 an hour."* Change
`sendWindowStartHour` and the sentence changes.

The switch names never appear. A person reads Manual, Automatic, Watching only
or Off. `AUTO_SEND_FIRST` tells you nothing unless you already know what it
does.

There is a test that renders the page with the switch on and asserts the
sentence **"approving a draft does not send it"** is gone. That sentence is the
exact failure mode the brief warned about, and it is now impossible to ship it
into a workspace where it would be false.

The same module renders in Settings, next to the shadow panel, as
`components/SendingSummary.jsx`. Both screens ask the same function, so they
cannot disagree.

---

## Contextual help

| Where | What | Why |
|---|---|---|
| Every bucket page | **"Why is this here?"** disclosure, closed by default | The question is about the pile, not the row. Answering it per row turns a list into an essay |
| Today, under the greeting | **"How Today works"** link | Permanent, undismissable route back to the explanation |
| AI Hive, How it works | One line on **Stop** | "It stops the next one starting. Whatever is already in progress finishes, and everything done before you pressed it is kept." The live progress line already said this, but only after you had committed to a run |
| Start here, glossary | 11 disclosures | The one-line answer is usually enough |

No tooltips were added to chips. No tour, no carousel, no coach marks, no
modals over the UI. The bucket explanations come from `BUCKET_HELP` in
`lib/help-copy.mjs`, so the page and the help cannot drift.

### Empty states

Every actionable bucket now answers "and what happens next".

| Bucket | Before | After |
|---|---|---|
| replies | Nobody is waiting on an answer. | …New replies land here on their own. |
| approvals | No new outreach is ready right now. | …People arrive here once the checks pass and a draft is written. |
| decisions | Nothing is waiting on a decision. | …You only see this when the app would rather ask than guess. |
| deferrals | Nothing is due to come back today. | …Anyone you deferred reappears on the date you picked. |
| blocked | Nothing is stuck. | …Background checks that fail show up here with the reason. |
| held | Everyone active has a way in. | …Nothing to do. |

"No old drafts left." was left alone: it is terminal, and there is no next.

---

## Onboarding checklist

`components/OnboardingChecklist.jsx`, on Today, replacing the two retired cards.

Five items: have some prospects, look at Today, read what was found about
someone, read one prepared draft, know what sends. **No item is a send**, and a
test enforces that: nothing in the list may say "send a/an/your/the" or point at
Send now. Onboarding that only completes by emailing a stranger is onboarding
that pressures somebody into a send they have not thought about.

**Persistence: `localStorage`, key `ltb_onboarding_v2`.** A deliberate choice,
and the reason is written into the file. A settings column would have meant a
migration plus a write path for "which help card has this person seen", which is
a lot of machinery for a fact nobody needs on a second device. The cost is
honest and small: a new browser shows it again.

Three things stop it being annoying:

- **Hide this** dismisses it permanently.
- Clicking through all five dismisses it permanently, with no congratulations panel.
- A workspace with more than 25 prospects never sees it, so a veteran on a fresh
  laptop is not welcomed to an app they have used for a year.

It renders as a sibling, never a wrapper, and returns nothing until the client
has read the stored preference — so it cannot block first paint, and there is a
test asserting the server render is empty.

---

## Existing UX cleanup

All presentational, all inside files this pass already touched.

1. **Held title appeared three times.** Breadcrumb, then the page `h1`, then the
   panel's own `h2`, plus two near-identical "not a rejection" blurbs. On its own
   page the panel now shows only the count; the breadcrumb stops at the way back.
   One title, one blurb. The breadcrumb change applies to every bucket page.
2. **Duplicate contact chips.** A site with a contact form linked from three
   pages rendered "contact form · contact form · contact form", which reads as
   three ways in when there is one. `waysOf()` deduplicates by kind.
3. **Bucket rows ran the full width of a wide monitor**, putting a name and its
   button a foot apart. Capped at 860px, matching Today.
4. **The Held page printed two empty messages** stacked: "Nothing waiting.
   Everyone active has a way in." directly above "Nothing here." The footer
   counter is now hidden when there is no list to count.

Contact-discovery policy: untouched.

---

## Tests

**1071 passing, 0 failing.** 21 added in `tests/start-here.test.mjs`, plus one
existing assertion updated from an exact string match to a prefix match because
an empty state grew a second sentence.

All 15 required checks are covered:

| # | Requirement | |
|---|---|---|
| 1 | Start here route resolves | ✅ |
| 2 | Primary navigation contains Start here | ✅ |
| 3 | Daily-loop section exists | ✅ |
| 4 | Automatic vs human section exists | ✅ |
| 5 | Sending panel reflects automatic-first-send OFF | ✅ |
| 6 | Sending panel has a distinct state for ON | ✅ |
| 7 | Follow-ups can represent shadow / off / automatic truthfully | ✅ |
| 8 | Held is never described as rejected or skipped | ✅ |
| 9 | 💚 cannot create or satisfy Strong | ✅ |
| 10 | Empty-state help stays visible at zero | ✅ |
| 11 | Checklist dismisses without blocking the app | ✅ |
| 12 | No AI or network model call for help copy | ✅ |
| 13 | No send, approval or queue logic changed | ✅ |
| 14 | Both send switches untouched | ✅ |
| 15 | No horizontal overflow on mobile | ✅ |

Two of my own assertions were too strict and were corrected rather than worked
around. One banned the word "reject" from the Held copy, which would have banned
the sentence Ary actually needs ("Held is not a rejection"); it now bans the
*claim* and requires the denial. The other banned "send" from checklist titles,
which banned "Know what sends"; it now bans instructions to send.

---

## Live / local visual review

Reviewed against a running dev server at `localhost:3000`, not against
production, because production must not receive this build yet.

Inspected, all rendering correctly:

- **Start here, desktop (1280px).** Full read-through. All seven sections, the
  glossary disclosures, the Technical details fold.
- **Start here, mobile (402 × 874 and 320 × 720).** `scrollWidth === clientWidth`
  at both widths, and no element extends past the viewport. The retired welcome
  card had a 560px minimum-width SVG rail; nothing here has a minimum above 200px,
  and a test now enforces that.
- **Sending panel, live settings.** Rendered *First emails · Manual*, *Follow-ups ·
  Watching only*, "8am to 5pm, Monday to Friday", "20 a day, 5 an hour" — read
  from the workspace, not typed.
- **Today.** "How Today works" link present; checklist present at 0 of 5;
  **Hide this** removes it and the stored preference reads `{"dismissed":true}`;
  the link survives the dismissal.
- **Sidebar.** Start here is the first entry under Resources. ⚠️ It was invisible
  until I expanded that section, which is exactly why the Today link exists.
- **Held bucket page.** Title now appears once. Empty state reads cleanly with
  no doubled message.
- **Ready for approval bucket page.** "Why is this here?" opens to the right
  sentence.
- **Settings.** "What sends email right now" renders above the shadow panel and
  agrees with Start here word for word.
- **AI Hive.** How it works now carries the Stop line. No run was started, and
  nothing about scanner execution was touched.

⚠️ **No screenshots.** The browser pane is not displayed in this session, so it
composites no frames and every screenshot attempt timed out. The review above was
done on rendered text, the accessibility tree and computed geometry, which is
enough to verify content, structure and overflow, and is not enough to catch a
purely visual defect such as a colour clash. Worth a two-minute look by eye when
this deploys.

---

## Accessibility

- One `h1`, `h2` per section, `h3` inside cards. No level skipped.
- Every disclosure is a real `<details>`/`<summary>`, so its state is announced.
- The sending modes carry a shape as well as a colour (`▶` automatic, `✓` manual,
  `◦` watching), so the state does not depend on telling one tint from another.
- A completed checklist item is marked with a tick and a screen-reader-only
  "(done)", not by colour alone.
- Every control is a real `<button>`. No ghost buttons: every one carries a
  visible border or a solid fill.
- No critical explanation lives in a tooltip.
- No horizontal overflow at 320px.

---

## Files changed

**Added**
- `lib/sending-state.mjs` — settings to plain words
- `lib/help-copy.mjs` — the model, the daily loop, the two columns, bucket help, glossary, checklist
- `components/StartHerePage.jsx` — the page
- `components/OnboardingChecklist.jsx` — the five things
- `components/SendingSummary.jsx` — the same answer, in Settings
- `tests/start-here.test.mjs` — 21 tests

**Deleted**
- `components/Orientation.jsx` — described the pre-V2 loop
- `components/StartHere.jsx` — same

**Changed**
- `components/GlassRail.jsx` — Start here in `NAV`, one new icon
- `components/ProspectsApp.jsx` — `start` view, route, Settings summary mounted
- `components/TodayView.jsx` — retired cards out, checklist and the link in
- `components/BucketPage.jsx` — "Why is this here?", width cap, breadcrumb tail
- `components/HeldPanel.jsx` — duplicate header, chip dedupe, empty footer
- `components/ArmyPanel.jsx` — one line about Stop
- `lib/today-buckets.mjs` — six empty states extended
- `tests/today-dashboard.test.mjs` — one assertion loosened to a prefix

---

## Commit / branch

| | |
|---|---|
| Branch | `start-here-onboarding` |
| Based on | `5b690f3` (production) |
| Pushed | **No** |
| Tests | 1071 passing |
| Build | clean |

---

## Production deployment

**NOT DEPLOYED, and not pushed.**

The native Gmail acceptance test is mid-flight: one approved package is waiting
on the send window to open, and an unrelated frontend deployment during the first
real send and reconciliation is exactly the confound worth avoiding. The branch
exists locally and merges cleanly.

---

## Send switch state

| Switch | State | Touched by this pass |
|---|---|---|
| `AUTO_SEND_FIRST` | **OFF** | No |
| `AUTO_SEND_FOLLOWUPS` | **OFF** | No |

No help component may write a setting, and a test enforces it: none of them may
contain a `PUT`, `POST`, `PATCH` or `DELETE`. A second test asserts the send
guard, the send runner and the send policy do not import either new module — the
explanation must never become something the sending path depends on.
