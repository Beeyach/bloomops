# Today work-item click navigation fix

Live: commit **`1b203d3`**, deployment `b7344747`. Tests **2,388 passing**. Zero sends.

**Status: fixed.**

---

## 1. Root cause — and it was not the click handler

The reported bug was that clicking Mary Ann Johnson in Today → Replies navigated to Prospects → Needs attention instead of opening her.

**The row click was never broken.** Reproduced on production before changing anything: clicking her row opens her drawer over Today, the hash stays `#today`, and her conversation is there. The wiring is sound end to end:

```
ExceptionQueue row  onOpen={() => onOpen(r.id)}
TodayView           finds the prospect, calls onOpen(p)
ProspectsApp        setDrawerId(p.id)
drawer              renders over whatever view is open, not gated by tab
```

**What Ary actually clicked was one of sixteen rows that should not have been on the screen.**

The previous pass ("one source of truth per tab") removed `needsYou` from `TAB_PILES.replies`. That fixed the **count**. But the panel that *draws* that pile lives in `components/TodayView.jsx` and checked only which tab was open:

```jsx
{tab === 'replies' && (
  <Block label="Waiting on your reply" count={sections.needsYou.total} ...
```

It never consulted the ownership map. So Replies rendered:

- Mary Ann, from the evidence-backed bucket — **1 row, correct**
- then a **"Waiting on your reply 16"** section underneath, from the prospect-column pile

**The tab said 1 and listed 17.** The sixteen are prospect-column rows built from a different section with different handlers, and clicking one is what dumped her into Prospects.

The screenshot that made this obvious showed `Showing 1 of 1.` immediately above `Waiting on your reply 16` — the panel contradicting itself on one screen.

## 2. Code changed

**`components/TodayView.jsx`** — one condition:

```diff
-{tab === 'replies' && (
+{tab === 'replies' && TAB_PILES.replies.includes('needsYou') && (
```

The block now reads the same map that drives the count, so the invariant declared in `lib/today-tabs.mjs` is **enforced by the render** rather than written beside it:

> A tab must not combine an evidence-backed semantic queue with an independently computed prospect-column pile that can disagree with it.

Nothing else changed. No handler, no navigation code, no drawer, no queue semantics.

## 3. Tests

**2,388 passing.** Three updated, all of which had encoded the behaviour that was being reported as a bug:

| Test | Was asserting | Now asserts |
|---|---|---|
| `ui-chapter11-context-focus` — panel ownership | Replies draws `sections.needsYou.rows` | the block is gated on the ownership map |
| `ui-chapter11-context-focus` — panel finder | matched `{tab === 'x' && (` exactly | tolerates an ownership guard after the tab check |
| `render` — warm list | a `replied = 1` fixture renders under "Waiting on your reply" | that pile no longer renders under Replies |

The `render` case is worth naming: its fixture is a prospect with `replied = 1` and no message behind it, which is exactly the shape that made Replies say 17 and prove 1.

## 4. Click behaviour across all five tabs

Audited. Every actionable row in Today goes through `ExceptionQueue` → `ProspectListRow`, whose `onOpen` resolves the prospect and opens the drawer in place.

| Tab | Row source | Click opens |
|---|---|---|
| **Replies** | `replies` bucket | the person's drawer, over Today |
| **Follow-ups** | `deferrals` bucket + `hotViewers` / `warm` | same |
| **Decisions** | `decisions` bucket | same |
| **Approvals** | `legacy` bucket + `videoReady` | same |
| **Exceptions** | `blocked` + `held` + `attention` | same |

`View all` controls are the only thing that navigates to Prospects, which is what they are for.

The rule holds: **clicking a specific work item opens that specific work item.**

## 5. Production verification

Authenticated, on `leadsthatbloom.com`, after a hard reload:

```
Replies tab                     Replies 1
"Waiting on your reply" section absent
Kori / Tranquil / Riddlock /
  Hustle Mornington              absent
Mary Ann's quote                 visible
```

Click test on her row:

```
hash before   #today
hash after    #today        <- no navigation
drawer        Overview, Email, Evidence, Activity
her message   visible ("appearing twice")
```

Console: no errors.

## 6. Status

**Fixed.** Today → Replies is one row, it is the right row, and clicking it opens the person over Today rather than routing to a list.

The deeper win is that the ownership invariant is now structural. The next tab that tries to draw a pile it does not own will not render it.
