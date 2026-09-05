# Chapter 5: consequence you can see before you read

Branch `ui/ch5-approval-send-hierarchy`, stacked on `ui/ch1-rail-today-reset` at base **`75d89eb`** (Chapter 1 code `f90f73c`), Chapter 5 commit **`ee6ae0c`**. **Not merged, not deployed. Production untouched. Merge order later: Chapter 1, then Chapter 5. Both remain gated on visual review and the natural daily-wake canary.**

## The hierarchy, before and after

Before: Approve Email 1, Approve sequence, grant auto-followup, revoke auto-followup, and Send now all wore `btn-bloom` at 13 to 14px semibold. The only signal separating "agree to words" from "email a human" was the sentence beside the button.

After, a five-word action vocabulary scoped to this surface (`app/globals.css`, appended after `.btn-bloom`, which itself is untouched):

| Action | Class | Look |
|---|---|---|
| **Send now** | `btn-send` | The only strong filled action: rose fill plus a double ring and glow. Shows "Sending…" while busy. The existing consequence copy stays: "Sends this email to X from hello@bloomwired.io" |
| **Approve Email 1** | `btn-approve` | Filled but calm: rose tint, rose text, rose hairline. Clearly a consent, clearly not the send. After approval the button is not rendered at all (existing behavior, kept) and the card says "Approved. Nothing has been sent yet." |
| **Approve sequence** | `btn-approve-2nd` | Outline. Broader in words, quieter in pixels, in both places it appears (review panel and the approved card's upgrade box). Never merged with the Email 1 button |
| **Auto-followup** | `switch-pill` | A real switch: `role="switch"`, `aria-checked` from the package's own `auto_followup_approved`, visible Off/On wording, flipped by the exact same backend action (`auto-followup` with an `allow` flag). "Nothing is sent by turning this on." kept; revoke note kept |
| **Skip** | `btn-danger-quiet` | Quiet poppy text, moved past Details to the card's far edge, out of the forward path |
| **Retry** (load error) | `btn-retry-quiet` | The one retry style on this surface; the error text also moved off low-contrast ink-3 |

No modal was added: the inline copy already names recipient, mailbox, and scope, and clarity beat extra clicks.

## Behavioral state matrix (all exercised by tests)

| State | What shows |
|---|---|
| A. Nothing approved | Review email (btn-bloom, the surface's one navigational primary), Skip at the far edge; approvals live in the review panel with distinct classes |
| B. Approved, nothing sent | "Approved. Nothing has been sent yet." + `btn-send` as the only strong action |
| C. Sequence approved | "All N emails in this sequence are approved."; upgrade box absent |
| D/E. Auto-followup off/on | Switch with `aria-checked` false/true, "Auto-followup off/on"; only offered on a sequence-approved P2 whose Email 1 has actually gone; the global switch alone can never arm a package (tested three ways) |
| F. Stale approval | Server truth, unchanged: the send route still runs the guard and the guard still recomputes `approvalFingerprint`; a UI class cannot make a stale send available |
| G. Busy/disabled | Button disabled + `aria-busy` + label flips to "Sending…"; disabled styles are solid muted controls, never stacked opacity on small text |
| H. Sequence in flight | "The first email has gone. The next approved one in this sequence has not." kept; arming the timer never claims the follow-up went |

## Accessibility

Every new class defines `:focus-visible` (2px outline, offset), keyboard operation is native buttons throughout, the switch exposes `role="switch"` + `aria-checked` + an accessible name, and every `:disabled` state was rebuilt as readable solid colors (`--control-bg` + `--ink-2`) instead of `opacity-60` stacking. No new small text uses `--ink-3`; the load-error line moved off it. All tokens used exist in both light and dark themes.

## Unchanged, deliberately

Approval fingerprint and mismatch handling, READY_FOR_APPROVAL semantics, both approval scopes, `auto_followup_approved` backend semantics and its package-level invariant, allowed_length, touch ceilings, the send transport (`action: 'send'` to `/api/outreach`, the surface's only endpoint), scheduler, package 23, global switches, reply and relationship state. The tests pin each of these.

## Verification

| | |
|---|---|
| Chapter 5 tests | 13 passing (`tests/ui-chapter5-approval-hierarchy.test.mjs`, rendered-component assertions via the `initialData` seam) |
| Chapter 1 regression | 12/12 passing, plus the approval render/consent/surfaces suites (61 tests together) |
| Full suite | **2,168 passing, 0 failing** |
| `next build` | clean |
| Diff vs Chapter 1 | 3 files: `app/globals.css`, `components/ApprovalQueue.jsx`, the new test file |
| Trial merge vs main | **0 conflicts** |
| Trial merge vs `integration/post-canary-ready-2026-08-13` | **0 conflicts** |

## Visual verification: pending

Same constraint as Chapter 1: the authenticated app needs Ary's access code (not entered by policy) and pixel screenshots were unavailable. The rendered-DOM assertions above are real, but nobody has *looked* at this card. The brief's seven questions (can Ary tell what sends, is approval visibly not sending, is the sequence consent broader-but-secondary, does the switch read as state, is off/on obvious, are disabled states readable, are destructive actions separated) plus the narrow-viewport pass are queued for an authenticated review before merge.

## Production isolation

No deployment, no production reads or writes (this task never touched the database or Gmail at all), no sends, drafts, jobs, or credits, no scheduler interaction, package 23 unchanged, both automation switches unchanged. The branch exists locally only. **Merge/deploy status: WAITING FOR VISUAL REVIEW + CANARY.**
