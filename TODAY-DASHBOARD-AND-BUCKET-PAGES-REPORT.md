# Today dashboard and bucket pages

Today had become a scroll. With a few hundred prospects in play, "Ready for
approval" ended up a long way down the page, and an empty section rendered as
nothing at all.

That second part was the real problem. **"There is none" and "you have not
scrolled far enough" looked identical**, which is the worst ambiguity possible
on a page whose only job is telling somebody what to do today.

UX only. No strategy, send, Gmail, qualification or bucket-definition change.

---

## Baseline

| | |
|---|---|
| Commit before | `7542720` |
| Tests before | 980 |
| Tests after | **1013 passing, 0 failing** |
| Build | clean |
| Migrations | none added |

---

## Today dashboard changes

`lib/today-buckets.mjs` is now the single description of what Today shows: the
order, the titles, the one-line blurbs, the empty wording, the preview size and
the page each bucket hands off to. The components read it; they no longer each
carry their own idea of any of that.

Every section renders the same way:

```
Ready for approval                    26          View all 26 →
New outreach prepared under the current rules.
Nothing sends until you approve it.

[ 5 rows ]
```

---

## Empty states

Four sections render **even at zero**, because Ary acts on them and their
absence is indistinguishable from a bug:

| Section | At zero |
|---|---|
| Needs your reply | Nobody is waiting on an answer. |
| **Ready for approval** | **No new outreach is ready right now.** |
| Needs your decision | Nothing is waiting on a decision. |
| Ready to reconsider | Nothing is due to come back today. |

Automation stopped, held and old drafts stay hidden when empty. They are work,
but they are not today's work, and an empty one is not a question anybody is
asking.

---

## Preview limits

**5**, defined once as `PREVIEW`. Under six items, everything shows and no
"View all" appears, because a link to see five items you can already see is
noise.

Held gets the same treatment: **the first 5 on Today**, never 702 cards.

---

## Dedicated bucket pages

Seven, following the app's own hash-routed view convention rather than
inventing a second one:

`today/replies` · `today/approvals` · `today/decisions` · `today/deferrals`
· `today/blocked` · `today/held` · `today/legacy-drafts`

Each is a real view with its own URL, so the browser's back button works and a
page can be linked to.

**`BucketPage` is deliberately thin.** Every list is the same component Today
previews, told to show everything:

| Page | Renders |
|---|---|
| approvals | `<ApprovalQueue full />` |
| held | `<HeldPanel full />` |
| everything else | `<ExceptionQueue only={id} />` |

So the actions, the wording and the row layout are identical because they are
literally the same code. A second implementation of "approve this package" is
how two screens start disagreeing about what approving means.

---

## Breadcrumbs

```
← Today  /  Ready for approval
```

The "Today" half is a real button, not a reliance on browser back. After acting
on a row Ary stays on the bucket page rather than being thrown back to Today,
which is the behaviour that makes working through a list bearable.

---

## Held pagination

`GET /api/held` now takes `limit`, `offset`, `state` and `q`, and returns:

```json
{ "total": 702, "matched": 702, "returned": 25,
  "offset": 0, "hasMore": true, "nextOffset": 25 }
```

The header always shows the **real total**. The footer says
**"Showing 25 of 702"**, and `loadedLabel()` is written so it can never say
"all 200" when there are 702: a page that overstates what it holds turns a
partial list into a wrong answer.

Load more, 25 at a time. No infinite scroll: it loses your place, and this is a
list somebody works through.

The count and the page share one SQL predicate, written once, so they cannot
disagree about what "held" means. Search and the state filter run **on the
server**, so filtering narrows the whole bucket rather than the page that
happens to be loaded.

---

## Legacy draft page

Unchanged in behaviour and now reachable in full at `today/legacy-drafts`.
Still last in the order, still collapsed on Today, still capped at a 5-row
preview. Old drafts do not get to dominate the screen.

---

## API and count changes

| Endpoint | Change |
|---|---|
| `/api/today` | returns `totals` per bucket, counted **before** the page limit |
| `/api/held` | pagination, server-side filter and search, real totals |
| `/api/outreach` | already returned `total`; the section now uses it |

The rule, asserted in a test: **a count is the size of the job, never the size
of the page.** A header that reported loaded rows would understate every list
exactly when the list is long, which is precisely when it matters.

---

## Tests

**33 added** (shared with the row-hierarchy pass), 1013 passing.

| # | Scenario | |
|---|---|---|
| 1 | Ready for approval renders at 0 | ✅ |
| 2 | zero state says no outreach is ready | ✅ |
| 3 | 26 items render only the preview | ✅ |
| 4 | View all shows 26, not 5 | ✅ |
| 5 | dedicated pages exist and resolve by view | ✅ |
| 6 | legacy drafts never enter the approval count | ✅ |
| 7 | held count uses the total, not the page size | ✅ |
| 8 | Today preview never renders hundreds | ✅ |
| 9 | held page loads more | ✅ |
| 10 | preview and full page share one definition | ✅ |
| 11 | routes resolve back to their bucket | ✅ |
| 12 | replies and approvals rank above held and legacy | ✅ |
| 13 | no send switch changed | ✅ |
| 14 | bucket meanings unchanged | ✅ |

---

## Deployment

Commit and deployment hash in the chat summary. Both send switches remain OFF.

---

## What Ary should test

1. **Open Today.** Every section she acts on should be visible with a count,
   even the empty ones.
2. **Find a section with more than five.** Press "View all N" and check the
   number matches.
3. **On a bucket page**, act on a row. She should stay on the page.
4. **Press "← Today"** rather than the browser back button.
5. **Open the held page.** It should say "Showing 25 of 702", not "702" beside
   25 rows. Load more, search, and filter.
