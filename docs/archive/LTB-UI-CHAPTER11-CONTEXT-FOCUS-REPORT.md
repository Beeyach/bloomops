# Chapter 11: one job at a time, meant literally

Branch `ui/ch11-context-focus-cleanup`, from `ui/ch10-visual-hierarchy-polish` at `b03f676` (`cca2e66` plus the Chapter 10 report). One commit, `22cf3e6`. **2,350 tests passing, build clean. Nothing merged to main, nothing deployed, no production data touched.**

Chapter 9 gave Today five tabs. Chapter 10 made them legible. Neither checked whether the contents matched the names.

## Today: ownership map

They did not match. Ownership is now declared once, in `lib/today-tabs.mjs`, and a test walks it to prove nothing can appear twice.

| Tab | Owns (piles) | Owns (queue buckets) |
|---|---|---|
| **Replies** | `needsYou` | `replies` |
| **Approvals** | `videoReady` | `legacy` |
| **Follow-ups** | `hotViewers`, `warm`, `due`, `upcoming` | `deferrals` |
| **Decisions** | — | `decisions` |
| **Exceptions** | `attention` | `blocked`, `held` |

What moved, and why:

| Moved | From → To | Reason |
|---|---|---|
| Gone quiet | Replies → **Follow-ups** | Silence is not an answer. What it earns is a nudge. |
| Watched your video | Replies → **Follow-ups** | Engagement, not a reply. Also a nudge. |
| Video recorded, not sent | Replies → **Approvals** | Work to review and send. |
| Deferral came round | Decisions → **Follow-ups** | A date arriving. The decision was made when it was deferred. |
| Old draft waiting | Exceptions → **Approvals** | Review-before-send. |

The counts are computed from the same map the panels render from — `countTab(tab)` sums the tab's buckets and piles — so a tab's number and its contents are one list counted twice, not two lists that might disagree.

**No backend state changed.** These are presentation routes over facts the router and the exception queue already produce.

Verified live, tab by tab: Replies 4 → 4 rows, Approvals 1 → 1 row, Follow-ups 6 → "Gone quiet 1" + "Due now (5)", Decisions 0 → one line, Exceptions 7 → the attention kinds.

## Redundant pills and copy removed

A pill has to add a fact the tab does not already state. Rows now pass `tabKind`; when a row's own kind *is* the tab's kind, the pill is dropped and the same words stay as quiet context. The semantic icon still carries the meaning either way.

Confirmed live: the Replies tab renders **four rows and zero pills**. "A conversation is open" is still on each row, no longer as a badge repeating the tab name above it.

Empty states are one line each, and each says something:

| Tab | Empty line |
|---|---|
| Replies | Nobody is waiting on an answer. |
| Approvals | Nothing is waiting for approval. |
| Follow-ups | Nothing is due right now. |
| Decisions | **Nothing needs a decision right now.** |
| Exceptions | Nothing is stuck. |

Blocks inside a panel lost their second border — the panel is already the card, so rows sit on one surface with dividers.

## Prospects: action queue first

`lib/prospect-layout.mjs` makes the view preference **per tab**. One value across all seven meant opening the spreadsheet once to edit forty cells left Needs attention as a spreadsheet for ever, and those two tabs are not asking the same question.

| Tab | Opens as |
|---|---|
| Needs attention, Replied, In outreach | **List** |
| All, Finished, Not contacted | **Table** |

A deliberate choice is remembered per tab, so choosing Table inside All never changes what Needs attention does. The key is bumped to `v2` so a stored v1 single value cannot apply to every tab. A corrupt or unrecognised blob falls back to the defaults rather than stranding the screen.

Verified live: Prospects opened on **Needs attention** with **List** pressed.

## Prospects chrome

- The permanent help band is a collapsed line: **How Prospects works**. `Hint` gained a `title` prop that turns it into a disclosure.
- The **Working lenses** row does not render when it would open onto nothing. The active lens always counts toward that, so the row can never hide the control that turns it off.

## System: four questions

| Tab | Answers |
|---|---|
| **Overview** | Right now · Today's work · Hive · Background services |
| **Issues** | Website checks · Contact recovery |
| **Automation** | What sends email right now · Follow-ups, watched · Held work |
| **Usage** | Budget and credits |

Each `Section` declares which tab it belongs to and renders nothing otherwise. Verified live: Overview shows exactly its four sections and **none of the automation tables**. Human-readable errors and the Technical details disclosure are untouched.

## AI Hive

The workflow strip is unchanged: `1 Scout → YOU gather the leads → 2 Guard → 3 Honey → YOU send them → 4 Vet → 5 Waggle`.

Below it, weight follows usefulness. A helper you can run right now is a full card; one you cannot is a single line saying what is missing, with the link to fix it and **no giant disabled button**. Live: six expanded, two compact (Honey, waiting on Guard; Buzz, waiting on account names).

Source groups stopped re-explaining the workflow:

| | Before | After |
|---|---|---|
| Title | "Social posts, from the Leads scanner" | **Scanner leads** · `Scout → Guard → Honey` |
| Blurb | 230 characters walking through the sequence again | "Strangers the scanner found: posts, threads, ads." |

## Sidebar More

Collapsed on every fresh load — a drawer left open is the clutter it was meant to hide. It still reopens within a session; only the across-sessions memory was dropped, which is what the brief asked for.

When open it reads:

```
— Tools      Templates · AI helpers
— Account    Settings
— Help       Help
— Admin      Stats · Trash
— Library    (custom pages)
```

**New folder** only appears while that drawer is open. Because a stored layout keeps whatever order it was dragged into, More is sorted by group at render rather than by rewriting the saved layout — dragging still works and nobody's custom folders were thrown away to get a tidy drawer.

## Help landing

Five task cards — Today, Prospects, Email and approvals, AI Hive, System — each one sentence and three short steps with a link. The essay is intact behind **How the whole thing works**.

## Three bugs found by opening the page

1. **Today's tab counts were reading the wrong key.** `data.totals` is keyed by the BUCKET value (`needs-reply`), not the definition id (`replies`), so every bucket lookup returned `undefined`. Chapter 9 hid it behind a fallback to the overall exception count; Chapter 11's stricter counting exposed it as **"Replies 0" printed above four visible rows**. Fixed by bridging through `BUCKET_BY_ID`.
2. **`lensesWorthShowing` crashed the whole Prospects screen** — I declared it above the counts it reads, and a `const` cannot be read before initialisation. Moved below its inputs.
3. **The rail's page tree tested for a `Library` section that Chapter 8 removed**, in both the expanded and the icons-only branch — so custom pages had rendered nowhere at all for three chapters and were reachable only by their `#page:` hash. Pointed at `More`, where they went.

None of the three was caught by 2,350 passing tests or by `next build`, because the suites read those files as source text. That is the standing limitation of this test strategy and it is worth saying plainly rather than once per chapter.

## Tests and build

**2,350 passing, 0 failing.** `next build` clean. New suite `tests/ui-chapter11-context-focus.test.mjs`, 27 tests covering all 26 requirements.

The centrepiece is the partition test: it flattens `TAB_PILES` and `TAB_BUCKETS` and asserts the flattened length equals the set size, so a pile claimed by two tabs fails immediately rather than being noticed on screen.

Five existing assertions were re-derived, never weakened — each pinned a decision this chapter supersedes: Chapter 6's plain "Automation" heading became a tab, Chapter 9's bucket map was re-cut, Chapter 9's empty-state string became "one short line" rather than one exact sentence, Chapter 10's `Section` signature grew a `tab`, and system-health's route check now expects the strip above the panel.

Pins that must not move are asserted again here: the DNC/unsubscribe boundary, the package automation invariant, one send control and one endpoint, the send guard, Chapter 10's five colour families and icon map, and Chapter 8's plain-language errors.

**Zero API routes modified** — `git diff --name-only` over `app/api/` returns nothing.

## Visual review status

Verified live in a signed-in session: every tab's contents against its count, the zero-pill Replies rows, the one-line Decisions empty state, Prospects opening on Needs attention in List, the collapsed help band, System's four tabs and Overview's four sections, the Hive's six expanded and two compact helpers, the More drawer's five groups and its collapsed default, and **768px with no horizontal overflow on Today, System or the Hive** in both themes. Dark still paints `#11141A` / `#191D24`.

**Screenshots still will not composite** in this session, as in Chapters 8–10. Structure, counts, colour and copy are verified by reading the live DOM; how it feels is yours.

## Unresolved

1. **Approvals still shows only the video row locally.** `/api/outreach` 500s with `no such table: send_events` in the local miniflare replica — pre-existing, no route touched, production unaffected. The approval cards themselves remain unreviewable locally.
2. **Quick filters were not capped to 3–4.** The brief asked for that; the lenses are already behind a closed disclosure that now hides itself when empty, and cutting the list further would remove filters you use. Left as-is deliberately — say the word if you want the cap.
3. **`IconTile`'s gradient still exists** on a few empty states, carried from Chapter 10.
4. **The guide pages themselves are still essays.** Only their landings changed.

## Zero production change

No merge to main, no deploy, no production writes, no sends, no drafts, no jobs, no credits. Scheduler, heartbeat and Gmail untouched. No migrations. **Package 23 untouched**: approved copy and sequence, `auto_followup_approved = 0`, `emails_sent = 0`, both switches false — unsent and unarmed.

The preview is stopped so the build stays clean; restart it when you want to look.

### Acceptance questions

1. Does every tab contain only the job it is named after?
2. Are normal rows free of redundant pills?
3. Does Prospects feel like an action queue before a spreadsheet?
4. Can System be understood without scrolling through the whole machine?
5. Is the current AI step obvious?
6. Does More stay out of the way?
7. Is there visibly less text?
8. Does anything still feel like card or pill slop?

---

`UI CHAPTER 11 READY FOR ARY'S EYES — THE CONTEXT-FOCUS CLEANUP IS BUILT LOCALLY, BUT PRODUCTION REMAINS BLOCKED UNTIL THE REDUCED-CHROME, LOW-REDUNDANCY UI FEELS RIGHT IN THE REAL BROWSER.`
