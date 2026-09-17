# LTB: Simple v1.0 Badge and a Cleaner Conversation View

Date: 2026-08-18 · Commit: `e95e077` · Deployment: live production (`https://leadsthatbloom.com`)

## Verdict

> LIVE PRODUCTION NOW WEARS A SIMPLE v1.0 BADGE, AND THE GMAIL CONVERSATION OPENS ON ONLY THE NEWEST MESSAGE WITH THE FULL HISTORY ONE CLICK AWAY. DRAFT CONTEXT IS UNCHANGED: THE SERVER STILL READS THE WHOLE THREAD.

## What changed

### 1. The version badge is just `v1.0`

Ary saw `LTB 2026.08.18 · 5eadc40 · Production` wrapping across two lines in the sidebar footer and asked for a plain version number.

- The footer now shows `v1.0` in the same row as "Powered by Bloomwired" and "Log out". One calm line.
- The full identity (release date, commit, environment, built date) moved to the badge tooltip and stays at `/api/version`.
- The number comes from `package.json` `version` (now `1.0.0`, worn as `v1.0`), stamped automatically at build via `next.config.js` → `lib/version.mjs`. Working rule: bump the package.json version in any commit that changes what Ary sees. Minor for features, patch for fixes.
- On a preview or local build, the badge appends the environment (`v1.0 · Preview`) so it can never be mistaken for production.
- Stale-tab detection is untouched. It compares commit shas, not the human number, so a stale tab still shows "A newer LTB version is available. Refresh."

### 2. The Gmail conversation is collapsed by default

Ary wanted LTB to know the context without showing the whole wall of messages.

- The Conversation section now shows only the newest message (the one waiting on Ary).
- Above it: "Show the whole conversation · N earlier messages". One click expands, "Hide the earlier messages" collapses.
- Collapsed caption: "From Gmail, synced automatically. Draft reply still reads the whole conversation." That sentence is literal: `/api/draft-reply` builds its context server-side from the full thread and never depended on what is rendered.
- Opening a different prospect resets the view to collapsed.

## Verified

- Tests: 2,419 passing (2,418 before, one new test covering both changes).
- Local production build compiles clean.
- Live production fetched after deploy (~4 minutes after push):
  `GET https://leadsthatbloom.com/api/version` → `{"version":"1.0","sha":"e95e077","builtAt":"2026-08-18T15:56:14.033Z","branch":"main","environment":"Production","release":"LTB 2026.08.18"}`
  The `version` field only exists in the new code, and a Pages deploy ships the server and UI bundle as one atomic build, so the live UI is the new one.
- The badge itself sits behind the access gate, which only Ary can pass. First hard refresh shows it.

## Not touched

- No prospect was emailed. Mary Ann has still been sent nothing; she remains the real row in Today → Replies.
- Draft-reply context, send guards, cold-outreach policy, package 23: all unchanged.
- OpenNext and parked cleanup: untouched.

## For Ary

Hard refresh once (`Ctrl+Shift+R`). The footer should read `v1.0`. From now on, version talk is just "I'm on v1.0" — the tooltip or `/api/version` has the exact build when debugging needs it.

## v1.1 addendum: the drafter follows Ary's voice rules

Found live the same day: Mary Ann's latest reply contains no question (it is her echoing the duplicate-posts finding from Ary's own Jul 20 audit email), yet Draft reply opened with "Good question". Ary caught it on the real pixels.

`REPLY_SYSTEM` in `lib/reply-context.mjs` (the system prompt behind Draft reply) now carries the professional-register rules from Ary's voice guide:

- If their message asks no question, do not answer one. "Good question" / "Great question" openers are banned outright.
- The thread shows who raised each point. When Ary flagged something first and they echo it, the draft says so ("I saw the same thing") instead of crediting the discovery to them.
- Open "Hi [first name]." and go straight in. No exclamation marks, emojis, semicolons, or numbered lists. Em dashes were already banned.
- Ary's verbs (fix, clean up, set up, work on, check, follow up), never consultant verbs. No mirroring the prospect's niche vocabulary. "just" at most twice, "honestly" at most once, no metaphors.

Two new tests pin the rules; regenerating Mary Ann's draft after this deploy produces the corrected framing. Version bumped to v1.1.

## v1.2 addendum: signature noise stripped, subject shown once

Ary asked for the same treatment for every prospect with a reply, and a cleaner conversation history.

**Every replied prospect already has it.** Verified against production D1: Sarah, Cynthia, Gena, and Pablo all hold Gmail thread ids on their reply events, so the synced conversation, the collapse, and Draft reply are the same screen for all of them. Only Mary Ann is currently owed a reply, which is why Today → Replies shows one row.

**What v1.2 cleans:**

- Message bodies now drop the promo tail after a sign-off: the scripture quote, the "Get a FREE chapter" links, the "Join me on Facebook/Twitter" block. The sign-off and the person's name stay. The cut is conservative: it only fires when the tail is clearly a tail (has a link or runs three-plus lines) and clearly not content (no question mark, no PS). A PS after "Thanks," survives untouched.
- This cleaning feeds both the on-screen cards and the Draft reply context, so the model's per-message budget is spent on words the person actually wrote.
- The subject line ("Re: your contact page") now shows once above the conversation instead of repeating on every card.

Five new tests. Version bumped to v1.2.

## v1.3 addendum: conversations live in LTB, refreshed only when needed

Ary sent Mary Ann her reply (recorded natively, in-thread, 2026-08-18 16:15 UTC), then asked for conversation history to live in LTB instead of being fetched from Gmail on every open, with a manual update option and a 12-hour auto-refresh.

**How it works now:**

- New `gmail_messages` table (migration 058, applied to production D1): one row per message, body stored cleaned for reading, stamped with `synced_at`. Gmail stays the source of truth; this is a reading copy.
- Opening a conversation reads the store instantly. It syncs from Gmail first only when the copy is empty or when `reply_events` (kept fresh by push + reconcile) knows a conversation moment newer than the newest stored message. A new reply therefore syncs on the very next open; a quiet thread never re-fetches.
- A newsletter blast can never force a sync; only real conversation events count, with five minutes of clock slack.
- The caption now shows when the copy was last updated (Pacific time) with an "Update now" button that forces a fresh sync.
- Draft reply reads through the same store, so drafting got faster too and both readers can never disagree.
- The 5-minute cron drain warms the store: at most one stale copy (12h+) refreshed and one unseeded replied prospect seeded per drain. All existing replied prospects (Sarah, Cynthia, Gena, Pablo, Mary Ann) seed themselves within the first few drains, no opens required.
- Nothing is ever deleted from the store, and it writes nothing to Gmail.

Nine new tests. Version bumped to v1.3.

## v1.3.1 addendum: every conversation history is now stored, cleaner hardened

Ary asked to grab the other conversation histories immediately instead of waiting for the cron's one-per-drain rhythm.

**Stored in production now (all five real replied prospects):**

| Prospect | Messages | How it got there |
|---|---|---|
| Sarah (Good Energy Coach) | 5 | cron seeded itself |
| Mary Ann Johnson | 18 (includes Ary's sent reply) | cron seeded itself |
| Gena (Perfect Skin Habit) | 4 | loaded from Gmail by hand |
| Pablo (Steinman Coaching) | 2 | loaded from Gmail by hand |
| Cynthia Criss | 2 | loaded from Gmail by hand |

The hand-loaded rows used the same thread ids the app's own events hold, the same Gmail account, and the app's own `cleanBodyForReading`, so they are byte-for-byte what `syncConversation` would store. Upserts keep future syncs idempotent over them.

**Cleaner hardening (shipped as v1.3.1, live):** Cynthia's webmail writes its quote header as "On 2026-08-12 9:35 am, ... wrote:", which the dated pattern never matched, and her signature is a dash-delimited clinic block with a HIPAA notice. The cleaner now cuts any "On ... wrote:" line and dash-delimited signature blocks, with the same conservative guards, and a blank line between a sign-off and a name no longer costs the name. Her stored card reads exactly: "Yes, I prefer it this way." Shipping this immediately mattered: the deployed v1.3 cleaner would have overwritten her clean row with the HIPAA version on the next 12-hour re-sync.

**Data note:** Gena's thread contains no human reply. Ary's email to info@perfectskinhabit.com bounced (their mail DNS is broken) and the three inbound messages are mailer-daemon delivery notices. LTB's reply count for her is really a bounce; the conversation view now shows that honestly.

Three more tests (2,436 passing). Version v1.3.1.

## Full-mailbox sweep and backfill (data only, no deploy)

Ary asked to record everything from Gmail. The whole mailbox was swept (sent and inbox, back to June) and matched against the prospects table. What the sweep found, LTB had never recorded: about thirty prospect conversations from the manual era, before Gmail sync went live on Aug 9.

**Backfilled into `reply_events`** (41 rows, `source='gmail-backfill'`, idempotent via the unique message-id index): every human prospect reply found, with honest classifications, and `answered_at` set wherever Ary's real outbound answered it. The conversation store seeds each thread from these automatically via the cron.

**Genuinely owed, now visible as evidence** (previously invisible):
- Chris (coscimp@gmail.com), Aug 17: warm reply about his Three by Three page. He had NO prospect row, which is why sync could not match him; row created (id 6569).
- Dan Amzallag, Aug 8: asked whether Ary's email was sales or a guest-article invitation. His stage still said "Email 1"; the recorded reply now ends his cold sequence permanently. Verified he had zero packages and zero pending sends, so nothing automated could have touched him anyway.
- Roopali Rao's assistant, Jul 10: "Where do you see this discrepancy?" was never answered.

**Do-not-contact compliance:** Lisa (OnPoint Healing, "Don't contact me") and Adele (eztherapy, "STOP") were already flagged `do_not_contact=1`. Suzie Plush ("Please unsubscribe me", Jul 29) was NOT — her row said stage Finished with no reply type. Now locked: unsubscribe event recorded and `do_not_contact=1` set.

**Sync gap discovered:** a real reply with no matching prospect row is dropped silently instead of being parked in `unmatched_replies` (which has stayed empty). Flagged as a follow-up task; Chris was the proof.

**Left alone on purpose:** auto-replies and out-of-office acks (not evidence of a person), vendor and client service threads, newsletters, and Ary's existing manual stages on old prospects (the relationship model merges the new evidence with them). Two tiny data smells noted, not fixed: Frances has two prospect rows for one email (1515 and 2788; evidence attached to 2788), and the Well Mind Center reply could not be attached (prospect row carries a different address).

## v1.3.2 – v1.3.4: Show in table actually shows the row; Chris becomes visible

Ary tested on real pixels and caught three layered failures.

- **v1.3.2** — the jump raced the table: its highlight expired after 2.6s and its scroll poller quit after 1s, while resetting six filters over 5,495 rows takes longer on a tablet. The jump target now persists until the row is in the DOM, then pages, scrolls to center, flashes.
- **v1.3.3** — the real killer: the row projection is tab-scoped and layout-scoped. A person in Replied stayed invisible while Needs attention was open, and the List layout has no row refs at all. The jump now forces the All tab (a deliberate pick, so the opening-tab logic stays frozen) and the Table layout. The sidebar footer also became two calm lines with the version alone underneath, ending the wrapped mess that stranded the flower icon next to the version number.
- **v1.3.4** — Chris (created during the sweep) read as "Not contacted yet · No reply yet". Two causes: his fresh prospect row carried no outreach facts (now backfilled in D1: 1 email sent Jul 15, replied Aug 17, interested), and the Conversation section early-returned "No reply yet" without rendering the Gmail thread whenever nothing was classified. The synced conversation now always renders when it exists; Draft reply stays hidden in that branch so uncontacted prospects never grow an off-sequence nudge button.

All verified live at `v1.3.4` / `1f81fbc` (2,438 tests).
