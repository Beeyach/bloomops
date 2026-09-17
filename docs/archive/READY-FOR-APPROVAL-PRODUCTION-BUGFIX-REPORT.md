# Ready for approval: production bugfix

A narrow fix. No redesign, no strategy change, no send or Gmail change.

---

## Reproduction

Ary searched `/#today` for `approval` and Chrome showed **1/1** — the only match
being the Old drafts blurb, *"Redo one to use the new approval."*

Checked before changing anything:

| Check | Result |
|---|---|
| `/api/outreach` loads in production | **yes**, 401 unauthenticated (no module error) |
| `/api/today`, `/api/held` | same |
| Bucket config contains the section | yes, `BUCKET_BY_ID.approvals` with `alwaysShow: true` |
| Packages in production | **not zero.** 1 `READY_FOR_APPROVAL`, 1 `NEEDS_DECISION` |
| Deployed JS matches source | yes, deployment source `e35e3de` |

> ⚠️ This was never the zero state. There were two live packages, the cards
> were rendering, and the words "Ready for approval" were nowhere on the page.

---

## Root cause

`components/ApprovalQueue.jsx` had two render branches and **the heading was in
only one of them.**

```
if (!data.items?.length) {
  return (<section><Header /> …empty text… </section>);   ← heading here
}
…
return (<section aria-label="Prepared outreach">          ← and nowhere here
  {ready.length > 0 && (
    <div>Prepared and waiting for you ({ready.length})</div>
```

So with zero packages the section said "Ready for approval". The moment a real
package arrived, the component took the other branch, which rendered its own
older heading — *"Prepared and waiting for you"* — and the phrase Ary was
looking for disappeared.

The count and the `View all N` link were in the same missing header, so both
were absent too.

**Fix: one `<Header />`, rendered once, above both piles, at any count.**

### A second bug found in the same place

Both live packages have `followups = NULL`, `allowed_length = NULL` and
`priority_band = NULL`, because both predate Strategy V2.

`reconcileForApproval` treated that as a package short of its band: P2 allows 2
emails, the package carried 0 follow-ups, so `missingSteps = [2]` and
`canApprove = false`. **The approve button was disabled on every package in
production.** Nothing could be approved at all.

The blocking rule exists for a narrower case than that: do not let an approval
quietly authorise *fewer* emails than Ary thinks she is buying. A package
carrying two of the three a 💚 allows is exactly that trap and still blocks. A
package carrying **none** is not: the screen says "this approval sends 1 email",
she can read it, and the send guard already refuses any step whose copy does not
exist.

Now: no follow-ups at all means a one-email approval, and it proceeds.

---

## Why the existing test missed it

The previous pass shipped a test called *"ready for approval renders at 0"* and
it passed the whole time. **It asserted against `sectionView()`, a pure helper,
which was correct throughout.** The helper was never the problem. The component
only called it inside one of its two branches.

A second, subtler miss surfaced while writing the replacement. The first version
of the new test asserted `html.includes('Ready for approval')` and **passed even
with the heading deleted**, because the section element carries
`aria-label="Ready for approval"`. Attributes are not on the screen.

Both misses are the same mistake at different depths: asserting on something
adjacent to what a person sees, rather than on what a person sees.

---

## Fix

| File | Change |
|---|---|
| `components/ApprovalQueue.jsx` | `<Header />` rendered above both branches. The old inline "Prepared and waiting for you" heading removed |
| `components/ApprovalQueue.jsx` | `initialData` prop, so the component can be rendered without a browser |
| `lib/approval.mjs` | a package with no prepared follow-ups is approvable as a one-email approval |

The section still reads `/api/outreach` and nothing else, so no legacy
`pending_draft` row can enter it. Old drafts remain their own collapsed section.

---

## Regression test

`tests/approval-render.test.mjs`, **8 tests, against the real component**, not a
helper. It renders `ApprovalQueue` and asserts on `visibleText(html)` with all
tags and attributes stripped.

**Proven to catch the bug.** With the fix reverted:

```
not ok 2 - Today shows "Ready for approval" when packages EXIST
not ok 3 - the heading renders exactly once, at any count
not ok 4 - more than five renders five, and offers the real total
# pass 5  fail 3
```

With the fix in place: 8 of 8.

Covered: visible at 0 with the exact zero-state copy; visible when packages
exist; heading at every count; five-row preview with the real total in
`View all 26`; no legacy strings in the section; the section reads
`/api/outreach` and never `/api/today`; the dedicated page's zero state; send
switches unchanged.

---

## Production verification

| | |
|---|---|
| Full suite | **1021 passing, 0 failing** |
| Build | clean |
| Deployment source | matches the commit below |
| Live packages | 1 `READY_FOR_APPROVAL`, 1 `NEEDS_DECISION` |
| Section present with packages | **yes**, proven by the reverted-fix test above |
| Old drafts still separate | yes, own bucket, ranked 5 against 30 to 100 |

⚠️ **Honest limit on the verification.** The app is behind Ary's access code,
which I must never type, so I cannot load the rendered page as her. What is
verified: the endpoints load, the data is there, the deployment source matches,
and the exact render path now fails a test when the heading is absent. **Ary
opening Today is the last step, and it is hers.**

---

## Deployment

Commit and deployment hash in the chat summary.

---

## Switch state

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

Neither was touched.
