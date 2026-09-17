# LTB v1.12 — the follow-up composer speaks in Ary's voice, and the whole cohort preloads

Production: https://leadsthatbloom.com · sha `7ccd00b` · verified live by fetching `/api/version` at 2026-08-19T13:59Z.

## What Ary asked for

Two things, in her words:

1. "i want everything to be preloaded, the emails like before already ready for the sequence... i am not reading the emails anyway idk why u have me go thru each make that shit optional."
2. "i noticed its not using /anthropic-skills:ary-voice liek i dont ssay shit like circlingback"

## The voice bug, root-caused

The pilot template (`LATE_FOLLOWUP_SHAPE` in `lib/late-followup.mjs`) literally said **"Closing the loop on my two earlier notes"**, and the prompt told the model to follow the shape "never copied word for word". So the model paraphrased the one phrase it was handed into its nearest synonyms: "circling back", "touching base". The corporate register was injected by the template itself; the shared V2 validator already banned "circling back" but the shape kept steering the model straight at it.

### The fix

- New shape, in Ary's real register (per the ary-voice skill: "just" as softener, plain verbs, the "ignore me" escape hatch, "Thanks, Ary"):

  > "Hi [name]. Just one last note about [the specific thing from my earlier emails]. If you ever want help with it, I'm around. If that's already handled, ignore me, I won't email you about it again. Thanks, Ary"

  The opener is "Just one last note about", not "Just checking in", because the shared V2 validator deliberately rejects filler openers that spend the first sentence announcing the follow-up. "One last note about [the thing]" names the thing in the same breath and passes every layer.

- The prompt now bans the family by name: closing the loop, circling back, touching base, bumping this, final follow-up, on your radar.
- The validator grew a `CORPORATE` reject (`clos(e|ing) the loop`, `circl* back`, `touch* base`, `on your radar`, `per my last`), so even if a future prompt regresses, the draft is refused before it becomes a package.
- `LATE_FOLLOWUP_GENERATOR_VERSION` bumped to `late-followup-2026-08.2`, which is also the cap-count marker, so the old and new batches can never be confused.

### The old drafts

All 15 `2026-08.1` packages were still `READY_FOR_APPROVAL` — none approved, none sent. They were marked `SKIPPED` with the reason recorded ("Superseded: the template was not in Ary's voice... nothing was ever sent"), which frees each prospect for one fresh composition under `2026-08.2`. The one-composition-per-prospect rule keys on generator version, so a draft Ary herself discards under .2 stays discarded.

## The cohort, extended to the US

- Selector and eligibility now accept `country IN ('AU','Australia','US','USA','United States')` (was AU-only).
- Live production counts at ship time: **51 AU + 5 US eligible** (💚-rated, exactly 2 touches, `last_contact_date >= 2026-08-05`, no reply, no block flags).
- Only 5 US because the rest of the US two-touch cohort is not 💚-rated, and under V2 a non-💚 prospect's ceiling is 2 touches. Their sequence is complete; they are correctly left alone. Ary's two manual sends from 2026-08-19 sit at 3 touches and are likewise excluded.
- Pilot cap lifted from the code default 15 to **80** via the named engine setting `lateFollowupPilotCap` (workspace `ary` only), applied with `json_set` so the rest of the settings blob was untouched. Verified in the same query: `autoSendApprovedFirstEmails = 0`, `autoSendApprovedFollowups = 0`. Composing is machine work; sending still requires Ary's Approve all tap, and every send-guard refusal (reply arrived, stale approval, not due, past allowed length) stays in force.

Order of operations mattered and was honoured: code deployed first, cap lifted second, so the old composer never ran with the lifted cap.

## Proof from the live queue

First three `2026-08.2` drafts, read back from production D1, all `READY_FOR_APPROVAL`:

> "Hi Kurt. Just one last note about the matching and first-session setup after someone fills out your intake form. If you ever want help with it, I'm around. If that's already handled, ignore me, I won't email you about it again. — Thanks, Ary"

> "Hi Lisa. Just one last note about the reminders and follow-up after someone books that call. If you ever want help setting that up, I'm around. If it's already handled, ignore me, I won't email about it again. — Thanks, Ary"

> "Hi Motoko. Just one last note about the reply someone gets after filling out your first client form. If you ever want help setting that up, I'm around. If that's already handled, ignore me, I won't email you about it again. — Thanks, Ary"

Each names the specific thing its own Email 1 raised. No corporate phrasing anywhere. (The em dashes above are this report's quoting convention, not in the emails.)

## Manual sending got a Send now button

`Draft & send` in the conversation drawer already wrote, showed, and sent after a visible 10-second countdown. The countdown banner now carries **Send now** beside Cancel, so reading the draft is optional in both directions: wait out the clock, kill it, or fire immediately. The button lives inside the `draft &&` render block, so it sends the live draft state — the stale-closure trap that bit the interval path cannot reach it.

Walking prospects with next/prev already resets the drawer to Overview per prospect (shipped in the deep-QA batch), so no change was needed there — and with the whole cohort precomposing into Today → Approvals, the per-prospect walk is no longer the workflow for follow-ups at all.

## Numbers

- Tests: 2,485 pass (one added: the corporate register is refused by name, and the shape itself is proven clean).
- Files: `lib/late-followup.mjs`, `components/ConversationTimeline.jsx`, `lib/runner.mjs` (comment), `tests/late-followup.test.mjs`, `package.json` + lockfile.
- Cadence: 5 compositions per drain, drains every 5 minutes → all 56 drafts preloaded within roughly the hour. The Approve all control appears in Today → Approvals whenever two or more are waiting.

## What Ary does now

Open Today → Approvals, tap **Approve all N follow-ups** once (Discard any row first if something looks off). Approved sequences send through the existing guarded send path during the send window. That is the entire job.
