# A date box is a field to fill in, not a calendar to pick from

Date: 2026-08-12 · commit `7774dfc` · Cloud Run `audit-render-00180-66j` · tests 1,976 passing

`hasCalendar` could become true because a page contained a date field. The
guard was a list of field names that are obviously not appointments, and that
list could only ever grow. It has been replaced by where the control sits, not
what it is called.

All five controls preserved. **Spend: 0 credits. Nothing refreshed.**

---

## Part 1 — every path a date control could earn calendar evidence

From `calendar-evidence.mjs`, before this change:

```js
hasCalendar = widgets.length > 0 || Number(pickers) > 0 || Boolean(vendorFrame)
```

`pickers` was a **count**, collected as:

```js
document.querySelectorAll(
  'input[type=date],input[type=time],input[type=datetime-local],' +
  'select[name*=date i],select[name*=time i]'
).filter(el => !/birth|dob|d\.o\.b|expir|issued|anniversar|since|founded/i.test(
  el.name + el.id + el.ariaLabel + el.placeholder
))
```

So **one date input anywhere on a page made `hasCalendar` true**, independently
of any widget or provider frame, unless its name happened to contain one of
eight substrings.

`hasCalendar` feeds `realBooking` in the findings chain, which suppresses
`booking-is-a-form`. A page with a stray date field could therefore silence a
true request-form finding.

## Part 2 — the field names the list was missing

The blacklist covered birthdays, expiry, anniversaries. It did not cover:

- an **event date** on a listing or workshop page
- a **publication or archive date** on a blog
- an **insurance or policy start date**
- a **preferred contact date** on an enquiry form
- a field simply called **`date`** — the commonest name of all
- an **incident date** on a claim form

Every one of those would have made a page claim a booking calendar. And the
next name nobody thought of would have too, which is the real problem with a
list: it is only ever as good as the last site somebody looked at.

## Part 3 — what replaced it

Not a longer list. **The field's name is no longer consulted at all.**

A date control counts only where it sits inside recognised scheduling UI: a
container that passes the same widget test everything else does — not an icon,
not inside an `<svg>`, at least 40 by 40, and with at least four things to
choose between.

```js
export function isSchedulingPicker(picker = {}) {
  if (!picker || !picker.inWidget) return false;
  return isSchedulingWidget(picker.widget || {});
}
```

The collector now reports, for each date control, the scheduling container it
is inside if any, and nothing about what it is called.

### Why the strict reading, and not "date plus booking language"

The obvious middle ground is to count a date field when the surrounding form
talks about appointments. That is the wrong answer here, and it took thinking
about Player One Start to see why.

A date box somebody types into, on a form that says "book a call", is exactly
the **request form** the booking rules already describe: the
achievewellnesscenters case where a visitor types when they would like and
waits for a human to confirm. Counting that as a calendar would make
`realBooking` true and suppress `booking-is-a-form` — which is the claim this
product actually sends.

So the rule protects the true finding rather than the flattering one. A calendar
means slots offered. A field means a request.

## Part 4 — which signal each control actually uses

Measured live before changing anything, with the signal breakdown added to the
debug output for the purpose:

| Prospect | pickers | vendorFrame | Where its calendar comes from |
|---|---|---|---|
| Sabine 6439 | **0** | false | the followed Acuity destination |
| Katie 6470 | **0** | false | the followed destination |
| James 6452 | 0 | false | not a calendar at all — `furtherStep` |
| Player One 6454 | 0 | false | nothing, correctly |
| Cynthia 4860 | 0 | false | nothing; one icon candidate, rejected |

**Not one of them depended on the picker path.** That is what made the strict
rule safe to adopt, and it is why it was measured first rather than argued
about.

## Part 5 — tests

`tests/calendar-evidence.test.mjs`, now 25 tests. New in this pass:

| Case | Result |
|---|---|
| event date | not a calendar |
| publication / archive date | not a calendar |
| insurance / policy date | not a calendar |
| preferred contact date | not a calendar |
| generic `name="date"` | not a calendar |
| incident date on a claim form | not a calendar |
| **appointment date + time controls together** | **not a calendar** — it is a request form, and the report says why |
| a date control inside a real scheduling widget | **is** a calendar |
| a date control inside an icon span, a heading, or an `<svg>` | not a calendar |
| `inWidget: true` with no widget described | refused |
| an older collector sending a plain count | earns nothing, fails closed |
| provider iframe, real widget | unchanged, still count |
| Sabine, Katie, Player One, Cynthia fixtures | unchanged |

Suite: **1,976 passing**, up from 1,967.

## Part 6 — live acceptance

| Prospect | Expected | Result |
|---|---|---|
| **Sabine 6439** | real calendar preserved | ✅ `hasCalendar` true on all four pages, `no-hours` only |
| **Katie 6470** | real calendar preserved | ✅ true on all four pages |
| **James 6452** | multi-step flow unchanged | ✅ `stale-copyright`, `no-hours`; `furtherStep` still true |
| **Player One 6454** | request-form result preserved | ✅ `booking-is-a-form` remains |
| **Cynthia 4860** | `hasCalendar` false | ✅ false on all four pages, finding intact |

## Part 7 — persistence audit

Read-only, across all 100 prospects carrying site intel:

| | |
|---|---|
| Rows with the `booking` good finding | **0** |
| Rows with `booking-is-a-form` | 1 — 6454 Player One, verified true, `pickers` 0 |
| Rows with `no-booking` | 1 — 6467 Caitlin Erica |

**No persisted row depends on the weak date-select signal.** A page whose
calendar came from a date field would carry the `booking` good finding, and no
row does.

6467's `no-booking` was written on 2026-08-10, before the off-site enquiry and
calendar fixes, so it may be stale. It was **not** refreshed: she has no email
address and sits at stage New, so no future action can depend on it. It will be
recalculated whenever she is next checked, which is the standing rule.

**Nothing refreshed. 0 credits.**

## Deployment

| | |
|---|---|
| Commit | `7774dfc` |
| Cloud Run revision | `audit-render-00180-66j`, 100% traffic |
| Tests | 1,976 passing |

An earlier revision, `audit-render-00179-vhw`, carried only the diagnostic that
exposed the signal breakdown. It is superseded.

## Safety

| | |
|---|---|
| Emails sent | 0 |
| `send_events` for 4860 | 0 |
| Package 19 | untouched: `APPROVED`, `sequence_approved` 1, `sequence_max_step` 2 |
| Cynthia `site_intel_at` | unchanged, `2026-08-12T05:06:51.079Z` |
| Packages created or approved | 0 |
| Contacts adopted | 0 |
| Prospect refreshes | 0 |
| Credits | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

Five sites checked, all five named as controls. No broad re-audit.

## Remaining backlog

1. Failure messages are cleared from `last_error` on eventual success, so a
   job's earlier errors are not recoverable from the row afterwards.
