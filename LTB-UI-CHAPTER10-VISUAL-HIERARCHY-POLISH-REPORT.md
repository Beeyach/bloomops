# Chapter 10: hierarchy that is not made of fonts

Branch `ui/ch10-visual-hierarchy-polish`, from `ui/ch9-focused-workspaces-readability` at `3c1f145` (`c720245` plus the Chapter 9 report). One commit, `cca2e66`. **2,323 tests passing, build clean. Nothing merged to main, nothing deployed, no production data touched.**

Nine chapters raised the type scale, and the answer to "what is this row" was still *read the sentence*. This chapter stops adjusting fonts.

## Type: deliberately unchanged

32 / 24 / 19 / 16 / 15 / 14, exactly as Chapter 9 left it, and Comfortable / Large / Compact still work. A test now pins those six numbers so a later chapter cannot quietly shrink them.

## The semantic vocabulary

Two new files carry the whole chapter.

**`lib/semantic.mjs`** — every recurring concept declares one icon, one colour family and one word, in one place.

| Concept | Icon | Family |
|---|---|---|
| reply / conversation | `message` | info |
| email / sent | `mail` / `send` | info / good |
| approval, approved | `check-circle` | good |
| follow-up, waiting | `clock`, `hourglass` | wait |
| decision | `split` | wait |
| exception | `alert-triangle` | wait |
| failed, do-not-contact | `alert-triangle`, `ban` | bad |
| evidence | `shield` | neutral |
| video, watched | `play` | info / good |
| activity | `history` | neutral |
| business / person | `building` / `user` | — |
| system | `activity` | — |
| AI Hive | `bee` | — |

Six glyphs did not exist and were added: `arrow-right`, `shield`, `history`, `building`, `activity`, `split`. **`arrow-right` was already being asked for by `ProspectHeadline` and `ProspectCard` and was silently rendering nothing** — the Next box has had an invisible icon for several chapters. A test now fails if any concept names a glyph the library does not have.

**`components/Semantic.jsx`** — four flat atoms: `Tile`, `Pill`, `Meta`, `Monogram`. They accept a *kind*, never a colour, and a test asserts the file contains no literal hex at all. No gradients: the existing `IconTile` uses a gradient plus a coloured shadow, which reads as a product-tour illustration, so these use a flat tint and a one-pixel border instead.

## The colour system

Five families and a neutral, declared once per theme as `--tone-{family}-{ink,bg,line}`.

| | Light | Dark | Means |
|---|---|---|---|
| info | `#2F6491` | `#8FBEE6` | something is being told to you |
| good | `#33704A` | `#79D3A3` | done, healthy |
| wait | `#7C6011` | `#EFC85F` | due, waiting, needs a look |
| bad | `#A8321C` | `#F0796B` | wrong, forbidden |
| brand | `#A93C60` | `#F2A0B6` | the brand and primary actions only |
| neutral | `#574E53` | `#C8C5BF` | a fact with no judgement |

**Two pairs were too close and the tests caught them before you did.** Light danger and brand started 56 apart — a red and a rose-red, which is a "Do not contact" pill that could be read as a brand pill; danger moved toward orange-red, now 69 apart. Dark amber and red started **45** apart, which is a waiting pill and a danger pill that look the same at a glance; amber went yellower and red went redder, now 74 apart. Every family clears AA as text on every ground it can sit on **and** on its own tinted pill — measured, not eyeballed.

**Colour is never the only signal.** Every concept carries an icon and a word as well. A greyscale screenshot loses nothing.

## Today

Each row is now:

```
[▣ tile]  Hearthside Bakery
          Leo · United States
          ( ✉ A conversation is open )   ⏳ 12d
```

Verified live in the Replies tab: 6 rows, each with exactly **one tile and one pill**, all painted `rgb(47,100,145)` — the info family — matching the underline colour of the open tab. `waiting 12 days` became a clock and `12d`; the noun is still spoken to screen readers.

The tab strip derives its glyphs from the same map rather than keeping a second list, and the open tab is underlined in its own family's colour, so the strip says what kind of work you are looking at before the panel has rendered a word.

**One pill per row** is asserted, so this cannot drift into a badge wall.

## The prospect drawer

- **Identity card** — a bordered favicon square when there is a site, a monogram in the brand family when there is not. Never an empty left column. The canonical state became a pill; a test asserts there is exactly one on the header.
- **Email** — each send is a card with a tile and a `Sent` pill instead of one of five identical text lines.
- **Activity** — every event type has its own glyph in the timeline bullet, so the reply is findable among the stage changes.
- **Video** — a tile and a `Watched` / `Recorded, not sent` pill.
- **Overview / Evidence / More** — ownership unchanged from Chapter 9, and asserted: Email holds no evidence, Evidence holds no sends, More owns the record.

## Dark mode, darker

| | Ch 9 | **Ch 10** |
|---|---|---|
| Canvas | `#181B20` | **`#11141A`** |
| Panel | `#22262D` | **`#191D24`** |
| Raised | `#292E36` | **`#242932`** |
| Text | `#F4F1EC` | **`#F5F2ED`** |
| Muted | `#A7A39D` | **`#9F9C97`** |

Still neutral (every surface's channel spread is ≤15 and blue-leaning, never warm), still no aurora, still no glow, still no gradients. Confirmed painted live: `--bg #11141A`, `--panel #191D24`, `--ambient: none`. Primary text ≥7:1 and muted ≥4.5:1 on all three grounds; disabled pair 4.89:1; white on the primary button 5.07:1.

## AI Hive

Name kept exactly. A test fails if it is renamed.

A card is now:

```
STEP 1
Scout Bee  ·  How to use
Find search phrases
( ✓ Ready )
[ Run a phrase sweep ]
```

The tagline — a full sentence — left the card body for the hover title and the popup. All eight helpers gained a two-to-four-word `job`. The mascot stays at 44px and the step number leads. The workflow strip's numbered nodes went flat (a gradient chip beside seven others is decoration) and a size larger:

```
1 Scout → YOU gather the leads → 2 Guard → 3 Honey → YOU send them → 4 Vet → 5 Waggle
```

## How-to popup

**Before** (Chapter 9) — four short lines of identical white text.
**After** — four coloured labels and four values. Measured live on Scout: **167 characters**, disclosure closed.

```
WHEN      Starting out, or searches going stale     ← amber
DOES      Writes 10 buyer phrases                   ← blue
SAVES TO  The Find panel in Leads                   ← sage
COST      15 credits                                ← neutral
▸ More details
```

Worst case across all eight bees is **140 characters** against a 180 target. The full explanation is intact under the disclosure.

## System and the Sourcing guide

**System** — each area is a titled group with a glyph: Right now, Website checks, Today's work, Budget and credits, Contact recovery, Hive, Background services. The failure group is named for what it checks and carries its count as a pill. Human error mapping and the Technical details disclosure are untouched.

**Sourcing guide** — five numbered steps above the pages: Pick a niche → Find phrases → Scan results → Review New finds → Promote the good ones, each with an icon and one line. **Your own guide pages were not edited** — the strip is additive, because the brief asked for a small visual cleanup, not a rewrite of your writing. General Help was left alone; see remaining issues.

## Redundancy removed

- Clients said the state in a pill and again in the sentence below it. The sentence now says only the next action, without a `Next:` prefix the button already implies.
- The Hive's readiness line said "Ready whenever" beside a pill already saying **Ready**. The sentence now appears only when a helper is *not* ready, where it is the only thing explaining what is missing.
- Chapter 9's de-duplications (per-row "cold outreach stopped", per-row "nothing sends on its own") are asserted to have held.

## Three bugs found by looking, not by testing

1. **`Pill is not defined` crashed the whole AI Hive.** I used the component in `ArmyPanel` without importing it. `next build` compiled fine and 2,300 tests passed, because the Chapter 10 tests read that file as source text rather than rendering it. I then audited every component for the same class of mistake across all four atoms and the four library helpers — no others.
2. **`shortDuration(null)` rendered `1d`**, because `Number(null)` is `0`. A duration the record does not have was being drawn as one it does.
3. **The readiness sentence repeated its own pill**, above.

## Tests and build

**2,323 passing, 0 failing.** `next build` clean. New suite `tests/ui-chapter10-visual-hierarchy.test.mjs`, 29 tests covering all 24 requirements.

Two existing assertions were re-derived: Chapter 9's dark-palette anchors moved with the darker values, and Chapter 3's "one state line" became "exactly one state pill" — the same guarantee by stronger means, since a pill carries an icon and a word where a coloured heading carried only colour.

The suite pins what must **not** have changed: the DNC/unsubscribe boundary still suppresses every next action, the package automation invariant is byte-identical, one send control, one endpoint, the send guard intact, and Chapter 8's plain-language error mapping unchanged.

**Zero API routes modified** — `git diff --name-only` over `app/api/` returns nothing.

## Visual review status

Verified live in a signed-in session: the tab strip's glyphs and family-coloured underline, six Replies rows each with one tile and one pill in the info family, pills computing flat at 6px radius with no gradient, `.sr-only` correctly hidden, the Hive cards' STEP/name/job/state/action shape, the cheat sheet's four coloured labels at 167 characters with the disclosure closed, dark mode painting `#11141A` with no ambient, and **768px with no horizontal overflow on either Today or the Hive** (the tab strip wraps to 2 rows, the workflow to 3).

**Screenshots still will not composite** in this session, as in Chapters 8 and 9. Structure, colour, contrast and copy are verified by reading the live DOM and computed styles; how it *feels* is yours.

## Remaining issues

1. **General Help is still an essay.** Only the Sourcing guide got its step strip. Carried from Chapter 8.
2. **Approvals shows 0 locally** — `/api/outreach` 500s with `no such table: send_events` in the local miniflare replica. Pre-existing, no route touched, production unaffected. The Approvals tab's cards could not be reviewed with real content, so the approval card is the one surface whose new pills I have not seen populated.
3. **`IconTile` still exists with its gradient** and is used on a few empty states. The new flat `Tile` is what the semantic system uses; I did not sweep the old one out, because that is a wider change than this brief asked for.
4. **Prospects list default view** was left as-is. The brief said not to redo the filter architecture, and switching the default between List and Table is a behaviour change rather than a visual one.

## Zero production change

No merge to main, no deploy, no production writes, no sends, no drafts, no jobs, no credits. Scheduler, heartbeat and Gmail untouched. No migrations. **Package 23 untouched**: approved copy and sequence, `auto_followup_approved = 0`, `emails_sent = 0`, both switches false — unsent and unarmed.

Restart the preview when you want it: it is stopped right now so the build stays clean.

### What to look at

1. **Today Replies and Decisions** — does hierarchy come from the tile, the pill and the layout rather than from font size?
2. **Is there less reading?**
3. **Is the colour useful without being childish?** Five families, one pill per row.
4. **Are the icons useful or decorative?** Every one maps to a concept; none is there for texture.
5. **Does the AI Hive still feel like the AI Hive?**
6. **The How-to popup** — instant, or still work?
7. **Dark mode** — dark enough now?
8. **Does any screen read as pill/card slop?** That is the failure mode of this chapter and the one I most want you to check.

---

`UI CHAPTER 10 READY FOR ARY'S EYES — THE VISUAL HIERARCHY POLISH IS BUILT LOCALLY WITH MORE ICONS, CLEANER SEMANTIC COLOR, LESS TEXT, AND A DARKER DARK MODE, BUT PRODUCTION REMAINS BLOCKED UNTIL THE REAL PIXELS FEEL RIGHT.`
