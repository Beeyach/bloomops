# First real-prospect pilot

Model: GPT-6 Astra
Reasoning: Medium
Surface: Existing local Codex session with authenticated GitHub and browser access

## Goal and owner decision

Load up to five real businesses into Ary's usable Prospecting workspace. Let her review the records and save notes before deciding further improvements. Pause redesign and unrelated feature work. Stop after handing over the populated list.

This task combines the owner's request for real prospects with the completed app-wide QA report. It replaces the earlier instruction to repeat a broad repair pass before importing. It does not authorize outreach or a new product phase.

Read applicable repository instructions, the current `docs/BUILD_STATE.md`, and relevant intake rules in `docs/PROSPECTING_ROADMAP.md` and `docs/PROSPECTING_SHEET.md`. Preserve existing worktrees, PR #93 if still active, QA fixtures, and uncommitted documentation. Check current state rather than assuming historical branch ownership.

This document lives on a documentation branch. Read it by the exact supplied commit without switching, resetting, or merging the active implementation worktree. Do not merge this branch or open a PR simply to execute these instructions. No build, migration, or deployment is needed merely to read a task.

## Starting point and evidence limits

At preparation, repository `main` resolved to `af71130f5e032a2c85c3d13e1cc9f727e1a044dc`. The owner's latest supplied release report states that PR #97 merged and staging served `af71130`. Check the actual deployed revision when executing; do not force the app back to this reference.

That report says authorized QA users can open Prospecting from the sidebar and complete create/edit/filter/import flows. A restricted Team Member now receives an explanation and workspace recovery instead of a generic not-found screen. The authorized Owner's earlier failure remains unreproduced. QA success with another identity does not prove Ary's session works.

Retain the existing limitations without reopening them unless they block the pilot: unreproduced Owner-specific access failure, inconclusive initial activation timing, unexecuted live Windows 200% zoom, and no comparable live Prospecting performance baseline. PERF3 remains open. Do not repeat the completed app-wide QA sweep.

## 1. Use Ary's actual persistent workspace

Open the current deployed app, initially referenced by `https://staging.ops.gobloomwired.com`. Use Ary's genuine authorized identity and intended fresh Prospecting workspace. Verify the selected workspace and role through supported session/workspace controls.

Do not use an internal synthetic QA actor's workspace, a disposable database, or the legacy Leads That Bloom workspace. Confirm that the selected workspace's records survive normal restarts/releases and are excluded from fixture reset and cleanup procedures. Real prospects must not become disposable test records.

Use the existing authenticated browser session when available. If a genuine sign-in is needed, use the supported flow and an already controlled mailbox; never forge a session, expose magic links, or change roles to overcome a denial.

If multiple workspaces are genuinely indistinguishable after inspecting the available context, ask only which should receive the batch. Do not guess. If no safely persistent destination is available, report that specific limitation without creating infrastructure or silently loading real data into QA storage.

Click the actual Prospecting sidebar entry and confirm the usable list. If it fails for Ary, capture the real URL, identity/workspace context, response, and error before making the smallest necessary correction. Do not broaden this into redesign or disable authorization.

## 2. Keep this a review-only intake

The owner authorizes storing these public business details and an honest initial review note. No emails, SMS, form submissions, follow-up scheduling, campaign enrollment, contact discovery requiring paid services, provider sync, or outreach is authorized.

Inspect the actual create/import side effects before the first write. Choose an existing supported unaudited review/hold state with no sending or automatic AI work. Do not invent an enum, mark a prospect Strong or Ready to contact, or change global automation settings. Qualification is not established by being included in this batch.

Check existing records and already-authorized suppression/contact-history information by business identity, domain, and verified public email where available. Preserve existing records and notes. Skip duplicates, suppressed contacts, known previously contacted businesses, and existing clients found through supported checks. Unknown contact history remains unknown, not proof of no prior contact.

Do not copy legacy histories, credentials, audits, campaigns, or source records. Do not scan an entire connected mailbox or another workspace's private data for this small pilot.

## 3. Recheck these five public candidates

The following are research targets from the earlier proposed batch. They are not prequalified leads, verified current contacts, or a claim that every URL is currently available.

1. Evelynne Gomes Greenberg Photography
   Source: https://egomesgreenbergphotography.com/contact
2. Rachael Mattio Photography
   Source: https://rmattiophotography.com/contact
3. K9 Summit Academy
   Source: https://www.k9summitacademy.com/contact-us
4. Rieko Yamanaka
   Source: https://www.rieko.co/contact
5. Annie Swafford
   Source: https://www.creeksidewholehealthcenter.com/life-coaching

Open each source before creating its record. Record only supported business name, website, category, source URL, actual check time, and a publicly advertised business email when verified. Inspect normal linked public contact pages if needed. No login bypass, contact submission, or exhaustive crawl.

Do not reuse a claimed prior verification date or assume previously supplied emails remain correct. Do not guess identity, location, timezone, email, financial capacity, business problems, buying intent, or qualification scores. Leave unavailable optional fields unknown. If a required field cannot be established without invention, skip the record and explain the exact constraint.

If a source cannot establish the intended business, skip it with a reason. Do not quietly substitute another business or increase the batch. A smaller honest batch is acceptable.

## 4. Load and preserve the eligible records

Batch label: `Ary review batch 01`.

Use the ordinary Add prospect or supported reviewed-import flow. Map to the real intake schema. Apply its explicit origin/provenance rules and record the actual source and check time. Use existing batch/tag/note fields; do not add a schema, custom status, or batch-management feature.

Add one record first. Reopen it and verify the saved business details, source, review state, and absence of outreach/enrollment side effects. Then load the remaining eligible candidates.

Initial note:

> Added for Ary's manual review by the assistant. Qualification, service need, buying intent, and email deliverability are not established. Contact history is unverified unless separately documented. No outreach authorized.

Do not attribute that note to Ary or fabricate a sent/contacted event. Preserve any established facts separately without converting this note into a qualification decision.

If a save/import is interrupted, inspect what persisted before retrying. Do not duplicate records or overwrite an existing prospect to make the batch count reach five.

These are real records. Keep a recoverable export in private local storage outside Git. Do not commit the imported dataset, discovered contact details, workspace identifiers, private notes, screenshots, credentials, or session material to the repository or CI artifacts. The public research URLs in this task are not an imported contact database.

## 5. Verify the practical review flow only

Through the actual deployed interface:

- Open Prospecting from the sidebar.
- Display the batch in an existing All prospects or suitable review view.
- Search for one added business and open its details.
- Open its public website.
- Save the honest initial note, reload/reopen, and confirm it persisted.
- Confirm no record was enrolled, scheduled, marked outreach-ready, or sent a message.

Do not leave the app on a Ready-to-contact filter that hides the records. Do not change records to satisfy that filter.

A data-only pilot requires neither a new full-suite/build/CI cycle nor an independent audit. If an actual code defect blocks basic use, fix only that defect with focused regressions and the normal applicable release checks under existing staging authorization. No new framework, broad QA, or cosmetic work.

Do not claim live speed improvement or completion of PERF3 from this pilot.

## 6. Deliver the working list and stop

Return directly to Ary, not in a public repository report:

- Exact workspace and working Prospecting URL.
- Names, record links, and actual number added.
- Candidates skipped and their specific reasons.
- Screenshot of the populated review view, with no unrelated private data.
- Short click path for writing and saving her notes.
- Confirmation that no outreach, enrollment, or provider sync occurred.
- Private export location and any concrete remaining blocker.

Do not call a saved draft or an import preview a completed import. Leave the real records intact after verification. Preserve existing worktrees and pending documentation.

Then stop for Ary to use Bloomsi. Do not resume redesign, expand sourcing, restart the product roadmap, build a feedback feature, send messages, or prepare another large audit archive.
