# Chapter 11A: two acceptance misses

Branch `ui/ch11a-acceptance-fixes`, from `ui/ch11-context-focus-cleanup` at `d8d0d3a` (`22cf3e6` plus the Chapter 11 report). One commit, `97150e1`. **2,363 tests passing, build clean. Nothing merged to main, nothing deployed, no production data touched.**

Both misses were visible in Chapter 11's own report. Narrow pass, nothing else touched.

## Miss 1 — Replies still repeated their own tab

**Required:** ordinary Replies rows must not render `A conversation is open`.

**What Chapter 11 actually did:** dropped the pill and kept the words as quiet context. Its report said so plainly — "still on each row, no longer as a badge". That is the tab's name printed under the tab.

**Fix.** When a row's own kind is the kind the tab is named after, the state is not rendered at all — not as a pill, a sentence, a subtitle or a title attribute. The line only draws when something is left to put on it.

A Replies row now reads:

```
[✉]  Hearthside Bakery
     Leo · United States
     ⏳ 12d
```

What kind of work it is still comes from three places: the active tab, the message tile in the left column, and the action. The row's space goes to the things only it knows.

**Not removed globally.** The phrase is untouched in `lib/exceptions.mjs` and still renders wherever it is *not* redundant — a test asserts the same row shows it when `tabKind` is something other than `reply`.

**Verified live:** the Replies tab renders four rows, and `A conversation is open` appears **nowhere in the page's HTML**. Zero pills, four tiles.

## Miss 2 — six helpers still had equal weight

**Required:** the current usable step should win.

**What Chapter 11 actually did:** made *not ready* the only way to be compact. Since most helpers are technically runnable, six were expanded and two compact — which is not emphasis.

**Fix.** Each lane features exactly one helper:

1. the earliest by step with **real work waiting**, or
2. failing that, the earliest that can run at all — the helper that would create work for the rest of the lane.

Everything else is a line. A helper that is **running** or has **just finished** stays expanded regardless, because a run in progress and a result you have not opened are both things you need to see.

**No invented state.** `pending` is only ever a count the app already produced — unscored leads for Guard, undrafted greens for Honey. A test asserts exactly two helpers report one and that nobody is handed a fabricated number. The other six simply have none, which is the honest answer.

### Before and after

| | Expanded | Compact |
|---|---|---|
| **Chapter 11** | 6 — Scout, Guard, Vet, Waggle, Pick, Echo | 2 — Honey, Buzz |
| **Chapter 11A** | **2** — Guard, Vet | **6** — Scout, Honey, Waggle, Pick, Echo, Buzz |

Live, with the current local data:

- **Scanner lane** features **Guard** — it has unscored leads waiting, so it beats Scout (always runnable, no work waiting) and Honey (later in the lane).
- **Prospect lane** features **Vet** — earliest that can run.
- Scout reads "Ready whenever. New phrases merge into your list." on one line. Honey reads "No greens without drafts. Run Guard Bee (step 2) first."
- The content lane's Buzz stays compact, matching the brief's cap of one expanded in Scanner work and one in Prospect work.

**Nothing hidden.** A compact helper keeps a real action as a quiet link rather than losing it — "no giant CTA" is about weight, not about taking the button away. It is gated by the same `disabled` rule the large button uses, so on this machine (no AI key configured) it does not draw; the code path is asserted by test.

If no lane has anything to point at, the page says **Nothing needs running right now.**

## Tests and build

**2,363 passing, 0 failing.** `next build` clean. New suite `tests/ui-chapter11a-acceptance-fixes.test.mjs`, 13 tests.

| Requirement | Covered by |
|---|---|
| 1. Replies rows lack the phrase | absent from the rendered markup entirely |
| 2. Replies still show business/person + age | business, person, `12d`, and the message tile |
| 3. No item moved tabs for this | the Chapter 11 ownership map re-asserted unchanged |
| 4-5. One expanded per lane | `featuredFor` shape, and the expand condition |
| 6. Blocked helpers stay compact | the expand condition no longer keys on readiness |
| 7. Later runnable helpers do not expand | the ready-means-expanded rule asserted gone |
| 8. No fake state | exactly two `pending` counts, none fabricated |
| 9. No functionality/endpoint change | all eight helpers keep task, action and job |
| 10. Chapter 11 stays green | its suite, plus the full run |

Two Chapter 11 assertions were re-derived, both because this pass supersedes them: "the words survive, quietly" became "the words do not survive either", and the compact-helper condition moved from `!r.ready` to the featured check.

**Zero API routes modified** — `git diff --name-only` over `app/api/` returns nothing. Four files changed in total: the row, the Hive, the Chapter 11 suite, and the new suite.

## Browser verification

Signed-in local session, both checks the brief asked for:

**Today → Replies.** Four rows. The phrase is absent from the page HTML. Rows read business, person · country, waiting age. Zero pills, one tile each.

**AI Hive.** Two expanded cards (Guard, Vet), six compact rows. The workflow strip, the group headers and the step numbering are exactly as Chapter 11 left them.

**I am not claiming visual acceptance.** Screenshots still will not composite in this session, so this is DOM-level verification of the two specific claims, not a judgement that the screens look right.

## Kept from Chapter 11, untouched

Today ownership map · Follow-ups and Approvals routing · System tabs · Prospects List/Table defaults · sidebar More grouping · dark palette · type scale · semantic colours and icons · Help landing · package, send and scheduler behaviour.

## Zero production change

No merge to main, no deploy, no production writes, no sends, no drafts, no jobs, no credits. Scheduler, heartbeat and Gmail untouched. No migrations. **Package 23 untouched**: approved copy and sequence, `auto_followup_approved = 0`, `emails_sent = 0`, both switches false — unsent and unarmed.

The preview is stopped so the build stays clean.

---

`CHAPTER 11A ACCEPTANCE FIXES READY — REPLIES NO LONGER REPEAT THEIR OWN TAB MEANING, AND AI HIVE NOW EMPHASIZES THE NEXT USEFUL STEP INSTEAD OF EXPANDING EVERY RUNNABLE HELPER.`
