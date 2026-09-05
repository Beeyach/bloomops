# Chapter 9: one job at a time

Branch `ui/ch9-focused-workspaces-readability`, from `ui/ch8-focus-reset-light-first` at `824ce40` (which is `9598c7d` plus the Chapter 8 report). One commit, `c720245`. **2,294 tests passing, build clean. Nothing merged to main, nothing deployed, no production data touched.**

Chapter 8 made the app legible. It did not make it short.

## Today: before and after

**Before** — one column, everything at once. Greeting, a prose summary that re-explained "nothing sends on its own", then four group cards stacked: Needs your reply, Approvals, Follow-ups, Needs attention. All of it on screen whether or not any of it had anything in it.

**After** — greeting, one count line, five tabs, one panel.

```
Morning
6 replies · 5 follow-ups · 7 exceptions

Replies 6 | Approvals 0 | Follow-ups 5 | Decisions 0 | Exceptions 7
─────────
[ the open tab, and nothing else ]
```

Verified live: it opened on **Replies (6)**, the summary read `6 replies · 5 follow-ups · 7 exceptions`, clicking Follow-ups switched the panel and wrote `followups` to `sessionStorage`, and an empty tab showed one line — `Nothing here right now.`

| | |
|---|---|
| Priority order | Replies → Decisions → Approvals → Follow-ups → Exceptions |
| A manual choice | wins over priority, even when its tab is empty — being moved off what you were working on because you finished it is worse than an empty panel |
| Remembered | `sessionStorage`, so tomorrow morning opens on whatever is actually waiting |
| All clear | `You're clear for today.` and no tab strip at all |

**One real bug this caught.** My first version put the tab strip *and* the queues inside the "there is work" branch of a ternary. The queues are what count the work — so an empty first render decided there was none, unmounted the things that would have said otherwise, and Today stayed clear for ever. I only found it because I looked at the running page. Both queues now mount unconditionally and `clear` only decides what is visible.

## Copy that stopped repeating

| Where | Was | Now |
|---|---|---|
| Every Replies row | "Cold outreach stopped here. What happens next is a message from you." | nothing — the tab says it once |
| Every Follow-ups row | "…Nothing sends on its own while follow-up automation is off." | just when it came due |
| Decisions rows | "Vet could not decide" | **Needs your call** |
| Today header | a paragraph re-explaining what the sections below said | one count line |
| Approvals panel | its own heading and blurb inside a tab named Approvals | header suppressed |
| Empty buckets in a tab | tab says "Nothing here right now", then the queue says "Needs your decision 0 / Nothing is waiting on a decision…" | the tab says it, the bucket draws nothing |

That last one I also only found by looking. On its own page the per-bucket empty states stay, because there a missing section reads as a missing feature.

## Type

| Role | Ch 8 | **Ch 9** | Large | Compact |
|---|---|---|---|---|
| Display | 31 | **32** | 34 | 31 |
| Section | 22 | **24** | 26 | 23 |
| Heading | 18 | **19** | 21 | 18 |
| Body | 15 | **16** | 18 | 15 |
| Small | 14 | **15** | 17 | 14 |
| Meta | 13 | **14** | 16 | 13 |

Every role is now one expression over one token — `calc(16px + var(--fs-step))` — so the preference moves all of them together and no surface has to know it exists. Confirmed in the browser: body computed **16px** at Comfortable, **18px** at Large, **15px** at Compact.

Nothing a person reads sits below **14px** at the default. **Compact never drops below the Chapter 8 scale** on any role — it is for fitting more on screen, not for undoing two chapters of making the app readable.

## Text size preference

**Settings → Appearance → Text size**: Comfortable (default) · Large · Compact.

Stored in this browser as `ltb_textsize_v1`, never in the database — the same person on a laptop and a 27-inch monitor wants different answers, and a synced preference would be wrong on one of them. Applied by the boot script **before first paint**, alongside the theme, so the page does not resize itself one frame after you see it. Comfortable carries no attribute at all, so the default costs no CSS rule. Anything unrecognised falls back to Comfortable.

## Dark mode

Not the light palette inverted. Its own room.

| | Was (plum) | **Now (ink)** |
|---|---|---|
| Canvas | `#1A1118` | **`#181B20`** |
| Panel | `#251A22` | **`#22262D`** |
| Raised | `#2B1F29` | **`#292E36`** |
| Text | `#F2E9EE` | **`#F4F1EC`** |
| Secondary | `#CBB3C0` | **`#C8C4BE`** |
| Muted | `#9A8290` | **`#A7A39D`** |
| Borders | `rgba(255,220,235,…)` rose | **`rgba(232,236,242,…)`** neutral |
| Hover | rose at 16% | **neutral at 9%** |
| Ambient | three coloured radial gradients | **`none`** |
| Shadow | plum-cast | **neutral black** |

Three coloured radials behind every screen is the purple-brown haze in one declaration, and no amount of dimming makes a gradient a neutral ground. It is gone. So is the glow: the accent lights one control, not the room. No gradients anywhere.

Semantics are sage / amber / red, plus a **new fourth hue** — a cool slate `--info` — for information that is neither good nor bad, so "here is a fact" no longer has to borrow the accent or a status colour and pick up a meaning it does not have. Every one clears AA on canvas, panel *and* the raised surface; asserted in tests, and confirmed painted live (`--bg #181B20`, panel `rgb(34,38,45)`, `--ambient: none`).

**Light is unchanged and remains the primary direction.** The Chapter 8 values stand exactly.

## The prospect drawer, and the Video tab

Six tabs when there is a video, five when there is not:

**Overview · Email · Evidence · Video · Activity · More**

| Tab | Owns |
|---|---|
| Overview | identity card, state, one next action, what they said |
| Email | outreach history and sequence state — no evidence, no record |
| Evidence | why LTB chose them, what was checked, the gaps |
| Video | the audit video, its controls, and one line saying where it got to |
| Activity | the log |
| More | the editable record, contact, dates, bees, notes, technical |

**Video is conditional and deliberately strict.** It counts `video_url`, `video_sent_at`, or a recorded view in the activity log. It does **not** count `video_tier`, `video_score` or `video_reasons` — those are the scanner's opinion that a video *would be worth making*, which nearly every scanned prospect has. Counting them would put an empty Video tab on almost everybody, which is exactly the fake state the brief said not to invent.

Live proof: of **35 local prospects, exactly one** has a video. Opening Kind Roots Nutrition showed `Overview | Email | Evidence | Video | Activity | More` and the Video panel opened with **"They watched it"** above the audit-video controls. The other 34 get five tabs.

Walking the list onto somebody with no video while the Video tab is open falls back to Overview rather than leaving the drawer on a panel that is not in the strip.

**One thing I got wrong and corrected:** my first version of the video check looked for a `video_script` column. There is no such column — I invented it. Removed before it shipped.

## AI Hive

Now opens with a named, numbered sequence. Live:

```
Lead workflow
1 Scout → YOU gather the leads → 2 Guard → 3 Honey → YOU send them → 4 Vet → 5 Waggle
```

The step numbers are derived from the employee table rather than written out again, so the strip and the cards cannot disagree. Each helper card leads with a **Step N** eyebrow and the mascot came down from 56px to 44px — the number tells you where in the run you are, so the number leads. The strip wraps rather than scrolling sideways: at 768px it becomes 3 rows, because a sequence you have to drag to finish reading is not a sequence you can see.

The source grouping stayed, because it is true.

Live fix from looking: the human chips read **"YOU You gather leads"** — badge plus a label starting with "You". Now "YOU gather the leads".

## How-to popups

**Before** — five paragraphs averaging 240 characters. A page of reading in front of a button.

**After** — four short lines, then **More details** collapsed. Measured live on Scout Bee: **331 visible characters**, disclosure closed.

```
What it does   It reads what you sell and who you sell to from your Settings,
               then comes back with 10 phrases your buyers would actually type.
Run it when    Once when you start, then every week or two.
Result         In the Search phrases panel in Leads, added to the list you already have.
Cost           15 credits
▸ More details
```

Six of eight bees' first sentences stand on their own, so those derive. **Vet** and **Buzz** did not — Vet's opened with a 176-character clause, Buzz's opened by describing what *you* do rather than what it does — so those two carry explicit short copy. The full text is intact under the disclosure.

## Tests and build

**2,294 passing, 0 failing.** `next build` clean. A new suite, `tests/ui-chapter9-focused-workspaces.test.mjs`, 34 tests covering all 25 requirements.

Eight existing assertions were re-derived, never weakened — each pinned a decision this chapter deliberately supersedes:

- Today's section titles now come from `lib/today-tabs.mjs`, so the tests read the tab table instead of hard-coded headings.
- The type-scale reader learned to read `calc()`, because the scale became one expression over one token.
- One test sliced source between two anchors, one of which was a comment I replaced — its slice ran on into the workflow chips and read their (correct) `whitespace-nowrap` as a fault. Re-anchored.

Four of my own new tests were wrong and I fixed the tests, not the code: an invented `video` activity-log tag (it is `VIDEOVIEW`), an `indexOf` without an offset that produced an empty slice, a global substring count that matched my own comment quoting the retired string, and a neutrality threshold one point too tight for a legitimate cool charcoal.

The suite also pins what must **not** have changed: the DNC/unsubscribe boundary still suppresses every next action, the package automation invariant is byte-identical, the approval surface still speaks to exactly one endpoint, the drawer still cannot send email, and the send guard and stage vocabulary are untouched.

**Zero API routes modified** — `git diff --name-only` over `app/api/` returns nothing.

## Visual review status

**Verified by reading the live DOM and computed styles**, in a signed-in session: the Today tab strip and its counts, the default and the switch and its persistence, the empty-tab line, all three text sizes computed, the dark palette painted, the six-tab drawer on the one prospect with a video, the Video panel's state line, the Hive workflow strip and its step eyebrows, the How-to popup's length and collapsed disclosure, and 768px with **no horizontal overflow anywhere**.

**Screenshots still will not composite** — the Browser pane does not render frames in this session, same as Chapters 8 and the integration review. So none of this was seen as a picture. Structure, sizes, colours and copy are verified; how it *feels* is still yours to judge.

## Remaining issues

1. **Approvals shows 0 locally.** `/api/outreach` returns 500 on localhost — `no such table: send_events` in the local miniflare replica. Pre-existing since Chapter 8, no route was touched, production unaffected. It means the Approvals tab could not be reviewed with real content.
2. **Help and the Sourcing guide are still essays.** Carried over from Chapter 8 and not in this brief's scope. Still undone.
3. **The AI Hive is still grouped by data source**, not by Find/Qualify/Write/Review. Chapter 8 explained why; Chapter 9 made the workflow order visually win instead, which was the actual complaint. Say the word if you want the regroup.
4. **Body / small / meta are 16 / 15 / 14** — still 1px apart. Bigger than before, and the hierarchy now comes from containers, but the bottom of the scale is inherently subtle. Large makes it 18/17/16 if it still reads flat.

## Zero production change

No merge to main, no deploy, no production writes, no sends, no drafts, no jobs, no credits. Scheduler, heartbeat and Gmail untouched. No migrations. **Package 23 untouched** and unchanged: approved copy and sequence, `auto_followup_approved = 0`, `emails_sent = 0`, both switches false — unsent and unarmed.

Running at **`http://localhost:3000`**, light theme. Safe to click: local miniflare SQLite, no production access, no email possible.

### What to look at

1. **Today.** Is it much faster to scan with one job showing?
2. **Text at Comfortable.** Finally comfortable, or still small? Try Large in Settings.
3. **Dark mode.** Does it feel genuinely different, or like the same app dimmed?
4. **The Hive header.** Is the order obvious inside two seconds?
5. **A How-to popup.** Concise enough?
6. **Kind Roots Nutrition** — the one prospect with a video. Does Video deserve its own tab in practice?
7. **~768px.** Everything wraps; nothing scrolls sideways.

---

`UI CHAPTER 9 READY FOR ARY'S EYES — THE FOCUSED WORKSPACES, LARGER TYPE, NEW DARK PALETTE, VIDEO TAB, AND CLEAR AI FLOW ARE BUILT LOCALLY, BUT PRODUCTION REMAINS BLOCKED UNTIL THE REAL PIXELS FEEL RIGHT.`
