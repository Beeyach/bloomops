# Chapter 8: focus, and light first

Branch `ui/ch8-focus-reset-light-first`, from `integration/ui-reset-2026-08-14` at `fc0ebe1`. One commit, `9598c7d`. **2,260 tests passing, build clean. Nothing merged to main, nothing deployed, no production data touched.**

Six chapters built structure. None of it had been *looked at*. This chapter is the pass that makes the structure legible.

## What you said, and what happened to it

| Your words | What changed |
|---|---|
| "Light mode is preferred. Dark is disliked." | Light is the default everywhere. Dark is now only ever chosen, never inferred. |
| "I'm starting to hate the overall color." | Cream canvas, white panels, charcoal text. Lines, hovers and shadows stopped being pink. |
| "The fonts are too thin and small." | Every step of the scale went up. 13px floor. Body and headings carry weight, not just size. |
| "The sidebar is cramped and small." | Four destinations plus one More. Bigger rows, bigger labels, bigger icons. |
| "Today is cramped and unreadable." / "I would lose motivation." | Its four groups are cards now — own edge, own header band, own count. |
| "The side/profile is too much and overwhelming." / "just words with different fonts" | Bordered identity card pinned above five tabs: Overview, Email, Evidence, Activity, More. |
| "I just want a proper profile. Put deeper things deeper." | The editable record and everything technical moved into More. |
| "Not this offer" is confusing | It says **Not interested**. |
| "Prospects feels random. All by default? Where's the urgency?" | It opens on the first list that has something in it. All is last. |
| "Clients looks redundant." | Split into **Needs onboarding** and **Active**. An empty group is not drawn. |
| "No one is reading page.goto: net::ERR_NAME_NOT_RESOLVED." | That line reads "Domain does not resolve". Raw text kept behind Technical details. |
| "AI Hive has barely any hierarchy." | Group headers are banded, and the Hive joined the type system. |

## Light mode, measured

Every value below was read out of the running browser, not out of the source.

| | Before | After |
|---|---|---|
| Canvas | `#F8EDF0` blush | **`#FAF7F3` cream** |
| Panels | `#FFFDFC` | **`#FFFFFF`** |
| Text | `#3A2B36` aubergine | **`#2B2529` charcoal** |
| Lines | `rgba(150,80,110,…)` | **`rgba(58,48,52,…)`** neutral |
| Hover wash | rose at 12% | **neutral at 6%** |
| Panel shadow | rose-cast | **neutral** |
| Aurora | 0.34 / 0.28 / 0.28 | **0.07 / 0.05 / 0.06** |

The blush was not an accent, it was the room — every line, shadow, hover and wash was rose, which is what made white panels read as mauve. Rose is still here: the brand mark, the primary button, the focus ring. Nothing else.

**Contrast, computed and asserted in tests.** Secondary text 7.5:1 on cream and 8.0:1 on white. Muted 5.32 / 5.68. Sage, amber and red each clear AA on both grounds, and none of them is the accent, so "good", "waiting" and "wrong" never have to be read off the brand colour. Dark mode was measured too and is unharmed.

**Dark still works.** `setTheme` accepts it, the toggle goes both ways, the palette is intact. A saved `dark` preference survives; everything else — including no saved preference at all — is light.

## Type

| Role | Before | After |
|---|---|---|
| Display | 28px | **31px** |
| Section | 18px | **22px** |
| Heading | 15px | **18px** |
| Body | 13.5px | **15px** / weight 450 |
| Small | 12.5px | **14px** / weight 450 |
| Meta | 12px | **13px** |

Confirmed live in the browser: `h1` 31px, `h2` 18px/600, `.ui-body` 15px/450, `.ui-meta` 13px.

**One thing I want to flag.** Body, small and meta are 15 / 14 / 13 — the sizes your brief named, but still only 1px apart at the bottom. I raised them and added weight, and I did not widen those gaps further by taste. Where hierarchy now comes from is containers: group cards, header bands, the bordered identity block, the tab strip. If body / small / meta still read as one blurry level when you look at it, say so and it is a one-line change that every migrated surface inherits.

## Structure

**The rail.** Work is Today / Prospects / Clients / System. Everything else — Stats, Templates, Help, AI helpers, Settings, Trash — is behind one collapsed More. Rows went from `py-2` to `py-2.5`, icons 17px to 19px, labels from 13.5px to 15px semibold. Nothing was deleted: every view still resolves, and the layout key is bumped to v3 so a saved v2 layout cannot resurrect the old four folders.

**Today.** All four groups now wear the same card. Two of them did not before — Follow-ups and Needs attention drew their own loose headings from their own components, so the page alternated card / not-card all the way down. `Section` was extracted to `components/TodaySection.jsx` so all three files share it without an import cycle. The count moved into a header pill, which also fixed "Needs attention(7)" rendering with no space.

**The prospect drawer.** 440px to 520px. Identity is a bordered block — 12px radius, real edge, cream ground — pinned above the tab strip with the quick actions. Then five tabs. The editable record, contact, dates, bees, notes and the technical dump all live under More. Verified in the browser: 520px wide, identity card bordered, 31px name, Overview selected, all five panels rendering distinct content.

**Prospects.** The six lists are reordered by urgency and All is last. On load, the page picks the first list with anything in it and then never picks again — one deliberate click, hash route or search freezes it, so it can never yank a list out from under you mid-task. Live check: it landed on **Needs attention (8)** instead of **All (35)**.

**Clients.** Needs onboarding vs Active. An empty checklist counts as setup not started, which is the case that matters. A group with nobody in it is not drawn, so a fully-onboarded book is one list again.

## Two places I did not do what the brief said, and why

**1. The AI Hive is not regrouped by Find / Qualify / Write / Review.** It is already grouped — by data source: what the Leads scanner brings back, what is already in Prospects, and your own content. Those three groups each carry a blurb that is *true about that source* ("Nothing here touches the Leads scanner"). Regrouping by job would cut across that and make those sentences false. What the Hive actually lacked is what you named: hierarchy. A bold 13px line over a paragraph, in front of cards with heavy borders and shadows, is not a heading. The group headers are banded now and the whole file joined the type system (42 raw sizes → 0). **If you want the job grouping anyway, say so and I will rewrite the blurbs to match.**

**2. The Help and Sourcing guide pages are untouched.** I ran out of this chapter on the surfaces you use daily and stopped rather than half-do the guides. They are still essays. That is the one part of the brief left undone.

## The error mapping was already there

Worth being precise, because my own audit could have claimed a bigger win than it earned: `lib/friendly-errors.mjs` already existed and already translated failures into sentences, and the Today cards and the exception queue already used it. **Exactly one line bypassed it** — the per-attempt history inside System health, which printed the raw provider string. That is the line you saw.

Fixed, plus: every rule gained a short form for places with one line to spend (Domain does not resolve, Website timed out, Website refused the connection, Website blocked the check, Website showed a bot challenge), and a bot challenge was split out of the plain-403 case because they need different reactions from you. Raw text is still carried and still sits under Technical details.

## Tests

**2,260 passing, 0 failing.** A new suite, `tests/ui-chapter8-focus-reset.test.mjs`, 32 tests.

Nineteen existing tests failed on the way and every one of them was re-derived, not weakened — each pinned a Chapter 1/3/6/7 decision that this chapter deliberately supersedes, and each replacement asserts the same guarantee by the new means:

- Rail structure tests now assert Work / More and that More starts collapsed. The invariant they protected — nothing non-daily is visible when the rail opens — is unchanged and now enforced by one folder instead of three.
- "Activity is collapsed behind a `<details>`" became "Activity is its own tab and Overview is where a prospect opens". Stronger, not weaker: you only reach the log by asking for it.
- The drawer render tests now walk all five tabs through a new `initialTab` seam, so they still assert everything the drawer says rather than just what the first panel shows.
- Chapter 7's contrast tests were re-anchored on the new palette. The thresholds did not move; the surfaces did.

The Chapter 8 suite also pins what must **not** have changed: the hard-stop boundary still suppresses every next action for `do_not_contact` and `unsubscribed`, the package-level automation invariant is byte-identical, the approval surface still speaks to exactly one endpoint, the drawer still cannot send email, and the send guard and stage vocabulary are untouched.

**Zero API routes were modified.** `git diff --name-only` over `app/api/` returns nothing.

## One pre-existing local fault, not mine

`/api/outreach?limit=60` returns 500 on localhost: `no such table: send_events` in the local miniflare replica. The Approvals card on Today will therefore look empty locally. This is a gap in the local dev database, not in the app and not in this chapter — no route was touched. Production is unaffected.

The `params.id should be awaited` lines in the dev log are pre-existing Next 15 warnings, and the HMR websocket errors are the preview harness, not the app.

## What I could not do

**Screenshots still will not composite** — the Browser pane does not render frames in this session, same as the integration review. So everything above was verified by reading the live DOM and computed styles rather than by looking at a picture. That is real verification, but it is not the same as eyes on pixels, and the pixel judgement is still yours.

Running at **`http://localhost:3000`**, light theme, signed in. Safe to click: local miniflare SQLite, no production access, no email possible.

### What to look at

1. **Does the type hierarchy read now**, particularly body vs small vs meta.
2. **The cream.** Too warm, too yellow, or right?
3. **The drawer tabs.** Are Overview / Email / Evidence / Activity / More the five you would have picked?
4. **Today's group cards** — four of them stacked. Grouped, or four boxes?
5. **The rail's More.** Does hiding Stats and Settings behind it cost you anything?
6. **Prospects opening on Needs attention.** Right instinct, or would you rather it always opened where you left it?
7. **Dark mode**, briefly — it is preserved but it is no longer the design's centre of gravity.

## Production isolation

No merge to main, no deploy, no production writes, no sends, no drafts, no jobs, no credits. Scheduler, heartbeat and Gmail untouched. Migrations not run. **Package 23 untouched** and unchanged from the canary check: approved copy and sequence, `auto_followup_approved = 0`, `emails_sent = 0`, both switches false — unsent and unarmed.

**Still blocked on your eyes.** That is the only remaining gate.
