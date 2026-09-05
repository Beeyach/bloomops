# No seed cohort, and the app is the one saying so

**Date:** 2026-08-11
**Tests:** 1,811 passing
**Emails sent: 0. Prospects contacted: 0. Nothing approved, nothing mutated. Both auto-send switches: OFF.**

---

## Verdict

**NO-GO.** None of the four real prospects qualifies for a P2 seed cohort.

Every rejection below comes from the app's own rules — the band function, the
vetting score, the workspace-capability check and the planner — run live against
production rows. None of it is my judgement of who is worth contacting.

---

## The four, read live

| id | Business | Rating | Band | Sends | Planner verdict |
|---:|---|:---:|:---:|---:|---|
| 1134 | Center for True Health | 💚 | **P1** | **6** | excluded before the planner |
| 1583 | Strongbyliv (Etobicoke Personal Trainer) | 💚 | **P1** | 0 | `NEEDS_DECISION` — nothing verified yet |
| 1680 | Brett Pace | 🥀 | P2 | 0 | `NEEDS_DECISION` — nothing verified yet |
| 1713 | Payette Counseling & Psychotherapy | 🥀 | P2 | 0 | `NEEDS_DECISION` — not a job this workspace sells |

None are on do-not-contact, none are unsubscribed, none have replied. All four
have usable addresses. The blockers are evidence and policy, not contactability.

---

## Why each one is out

### 1134 — Center for True Health · P1 · six emails already sent

Two independent disqualifications.

**It is P1, not P2.** 💚 maps to P1, which carries three touches. The cohort is
explicitly P2-only so that it never exercises the Email 3 transport path, which
has not been accepted.

**It has already had six emails**, last contact 2026-08-05 — and **zero native
send events**. So the sequence ran entirely on the legacy path, before LTB could
send. There is no Gmail thread id to continue, which is precisely the
"no legacy/pre-native sequences" exclusion.

⚠️ **This corrects an error in my previous report.** The stabilization report
states that the four real prospects have "0 sends". Three do. This one has six.
I took that from a truncated view of the audit output and did not check the
remaining rows. The audit script itself was right; my reading of it was not.

### 1583 — Strongbyliv · P1

**P1, so out of scope for a P2 cohort** regardless of anything else.

Its evidence is also not yet sufficient for the planner: three findings scoring
15 (a dead link, a default browser-tab title, no opening hours) from an `auto`
source, which returns *"Nothing about this prospect has been verified yet."*

### 1680 — Brett Pace · P2 · the band is right and nothing else is

The only candidate whose band, send count, reply state and contact all fit. It
fails on evidence, and the vetting is unusually direct about it:

> `worth: false` — *"Only 3 small things worth 13. Not enough for two minutes of
> their attention."*

Findings: not sized for phones, no opening hours, no reviews. The planner returns
*"Nothing about this prospect has been verified yet."*

**No verification was run on this prospect, deliberately.** Fresh verification is
the one thing that could move it, and spending it here would be paying to argue
with the app's own conclusion that these findings do not justify the email. The
brief's instruction not to invent a replacement pain point points the same way.

### 1713 — Payette Counseling · P2 · a real problem, and not one to sell

Band, sends, replies and contact all fit, and the evidence is the strongest of
the four: score 23, `worth: true`, three findings — served over http and marked
Not secure, a default browser-tab title, and template text reading
*"your paragraph here"* still on the page.

The planner still refuses:

> *"Served over http, marked Not secure. Real problem, but it is a website build
> job and this workspace does not sell that."*

That is the workspace-capability gate doing exactly what it exists for: a real
problem this workspace has no offer for is not a reason to email somebody.
Verification cannot change it, because the finding is not in doubt — the fit is.

---

## What was not done, and why

- **No verification runs.** For 1583 and 1134 the band alone rules them out, so
  evidence could not rescue them. For 1713 the evidence is already sufficient and
  the block is capability. For 1680 the app has already judged the findings too
  small, and a paid check to overrule that would be spending money to disagree
  with the vetting.
- **No copy written.** Writing Email 1 for a prospect with no supported reason
  means inventing one.
- **No packages approved, no rows mutated, no fingerprints created.**

---

## What would actually produce a cohort

The gap is upstream of follow-up entirely. A P2 auto-followup cohort needs P2
prospects who pass vetting, and today the pipeline has two P2 prospects and both
fail for different reasons.

Three routes, in rough order of how quickly they'd bear fruit:

1. **More P2 prospects through vetting.** There are 4,344 in `New`. The
   constraint is that vetting has to find sellable problems, not just problems.
2. **A P1 seed instead**, accepting that Email 3 transport is unproven. 1583
   Strongbyliv is P1 with real findings and only needs verification. That is a
   scope decision, not a technical one — the P2-only rule exists to avoid an
   unaccepted path, and relaxing it is a choice about risk.
3. **Nothing yet.** The follow-up machinery is finished and idle. It costs
   nothing to wait for prospects that genuinely qualify.

The machinery being ready and the pipeline being empty are separate facts, and
the second is not a reason to lower the bar on the first.

---

## Safety

Zero emails. Zero prospects contacted. Zero mutations — no package created,
approved, or edited; no prospect row touched; no fingerprint written. No
verification spend. No internal canaries involved. Both auto-send switches OFF.
No cohort enabled or proposed for enabling.
