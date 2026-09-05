# LTB v1.13 + v1.14 — the voice holds everywhere, and skills preload sequences for free

Production: https://leadsthatbloom.com · v1.14, sha `d78cbff`, verified live by fetching `/api/version` at 2026-08-20T20:56Z.

## v1.13 — the second voice leak, closed

Ary caught "Circling back on this one" in a reply draft hours after the batch composer was fixed. Two different writers: the late-follow-up composer (fixed in v1.12) and the drawer's reply drafter, whose REPLY_SYSTEM said only "No corporate phrasing, no filler openers" — a vague rule the model walked straight through, exactly as it once did with "Good question".

The fix names the family: circling back, closing the loop, touching base, bumping this, reaching out again, per my last email — banned by name in `lib/reply-context.mjs`, with her real openers handed over for quiet-thread nudges ("Just checking in regarding...", "Just want to follow up about..."). Pinned by test. The lesson is recorded in memory: every prompt surface bans phrases by name, never by category.

## v1.14 — skills preload sequences; the app spends nothing on cold drafting

Ary's words: "i want my website audit skills to preload email sequences so i dont have ti generate them inside ltb and use up api creds."

What was already there: her skills store full sequences on the prospect row via `window.bloom.setEmailSequence()` (up to 5 emails, the old-strategy shape she wants kept). What was missing: any bridge from that stored sequence to the approval-and-send machinery — and the old auto-prospect skill filled the gap by hand-driving Gmail's compose window to send Email 1 itself.

The bridge, new in v1.14:

- `lib/sequence-stage.mjs` — pure staging rules. V2 trim at the door: a 💚 prospect stages the first 3 stored emails, anyone else the first 2; stored emails 4-5 stay on the row and can never be staged or sent. Refusals with plain reasons: already contacted (`emails_sent > 0`), replied/declined/unsubscribed/do-not-contact/closed stage, sequence shorter than the band's allowance, missing subject or body, corporate phrases, em dashes.
- `POST /api/prospects/[id]/stage-sequence` — loads the row and recent events, asks the staging rules, writes through `savePackage` (the canonical writer, one-live-package rule included). Creates a READY_FOR_APPROVAL package and nothing else: no send, no approval, no schedule, no model call — `model: null` on the record because no model ran.
- `window.bloom.stageSequence(emailOrId)` — the one console call skills make after storing a sequence.

The auto-prospect skill was rewired to match: Step 5 (hand-sending Email 1 in Gmail, eight sub-steps of browser automation) is replaced by the single staging call; Step 6 no longer touches the stage (LTB advances it when it actually sends); the safety constraints now read "This skill sends NOTHING, ever." Generation still writes all 5 emails, exactly as Ary asked to keep — staging trims to the V2 allowance.

Cost shape after this: cold sequences are drafted in Claude Code on Ary's plan (no API spend); the app's paid drafting remains only where it belongs — the late-follow-up composer, whose inputs live in the mailbox.

## The step-ceiling fix (rides in the pending push)

Tracing the new-prospect flow end to end exposed a gap in the not-yet-shipped auto-send bundle: the armed shapes pinned one step each (P2→2, P1→3), so a staged P1 sequence would auto-send Email 3 but never its day-4 Email 2. The scheduler now reads the due step from the real send history and checks it against the grant's ceiling (`auto_followup_max_step`), so one grant covers a P1 package's Email 2 on day 4 and Email 3 on day 10. A new test pins the one-send case selecting step 2.

## Numbers

- Tests: 2,496 pass (nine new for staging, one extended for the step ceiling).
- Sent today by Ary's own taps: 3 final follow-ups (Nina Thompson, Deborah Mangum-Copelli, Tanya Roesler-Kirby).
- Queue at writing time: 46 new-voice drafts READY_FOR_APPROVAL, 3 APPROVED awaiting Send now (Kurt Peters, Lisa Tesoriero, Motoko Yoshihara).
- Still pending Ary's own push (v1.15 staged): the Settings auto-send switch, batch arming on Approve all, and the step-ceiling fix. Composition and staging ship without it; zero-tap sending waits on it.

## The whole machine, after her push

1. Skill researches and writes the sequence in Claude Code — free.
2. `stageSequence` puts it in Today → Approvals.
3. One tap: Approve all (arms the packages).
4. LTB sends every step on its day, inside the window, under the caps, cancelling on any reply.

Ary's recurring work: the approval tap.
