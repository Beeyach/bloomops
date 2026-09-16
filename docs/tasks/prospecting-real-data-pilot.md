# First real-prospect pilot

Model: GPT-6 Astra
Reasoning: Medium
Surface: Existing Codex session with authenticated GitHub and browser access

## Goal and scope

Create one usable, persistent Prospecting workspace for Ary and load up to five already-researched real businesses. Let her use the list and save notes. Pause redesign and unrelated feature work. Stop after delivering the working batch.

This revision resolves the destination blocker from the first attempt. The selected new workspace name is **Bloomwired Prospecting**. This is a setup decision for the pilot, not a claim that a workspace with that name already exists or that Ary previously chose the name.

Executing this task covers creating that one workspace through the existing application flow, as well as adding the eligible records. A fresh application workspace is ordinary supported setup; it is not permission to provision a database, deploy an application, create production infrastructure, or change permissions in an existing workspace.

This replaces the previous instruction to stop merely because no non-QA Prospecting workspace exists. It does not authorize using a QA workspace, renaming Operations/QA into the target, bypassing authorization, or ignoring a concrete storage-risk finding.

Read applicable repository instructions and the relevant intake contract. Preserve existing worktrees, PR #93 if still active, pending BUILD_STATE edits, and prior evidence. Read this document at the supplied commit without switching, resetting, or merging your active branch. No application build or deployment is required simply to read or execute ordinary data-entry flows.

## 1. Resume the existing attempt

The supplied operator report says no records were added. The five public business identities were checked; K9 Summit Academy's email was not established. Research was saved outside Git at:

`/home/ary/.local/share/bloomops-private/ary-review-batch-01/research-not-imported.json`

Read that local file and its actual source/check-time fields. Keep the original research intact. Do not assume a record exists in Bloomsi just because it appears in this research file.

Reuse the recent verified research rather than repeating all five searches. Recheck only missing, stale, contradictory, or unsupported details. If the private file is unavailable, recover the facts from the original pilot task at commit `b2d2cddaf0d1923c7aabdd1bb65965b848a5a101` and its public source pages. Do not reuse an unverified email from an older assistant message.

The current main inspected during preparation contains the supported creation flow:
- `app/workspaces/page.jsx`: authenticated workspace chooser; creation control available to the selected workspace's Owner/Admin.
- `components/bloomops/WorkspaceChooser.jsx`: "Start a fresh prospecting workspace", Workspace name, and "Create workspace"; successful creation selects the new workspace.
- `lib/bloomops/workspaces.mjs`: `createProspectingWorkspace()` creates an active prospecting workspace, a creator Owner membership, and default catalogue configuration. It uses a creation request ID and rechecks authority. It does not copy prospect histories or connections.

These are source observations at main `af71130f5e032a2c85c3d13e1cc9f727e1a044dc`, not a claim that live creation was tested in this chat. Inspect the current served revision and actual controls before using them.

## 2. Create the destination through the real interface

Use Ary's genuinely authenticated session on the current staging app, initially `https://staging.ops.gobloomwired.com`. Open `/workspaces`.

Check whether an earlier interrupted attempt already created a workspace named Bloomwired Prospecting. If it did, confirm Ary's legitimate membership, prospecting purpose, and actual creation/context evidence before reusing it. A matching name alone is insufficient.

Otherwise:
1. Select Ary's existing Operations workspace if she already has an active Owner/Admin membership there. This establishes the legitimate source context only; do not import any prospects into it.
2. Return to `/workspaces` and use "Start a fresh prospecting workspace".
3. Enter **Bloomwired Prospecting** and click **Create workspace** once.
4. Confirm the new workspace is selected, its purpose is Prospecting, Ary is its Owner through normal creation, and its prospect list is empty.
5. Reload and confirm the same membership, workspace, and list remain accessible through ordinary navigation.

If creation succeeded but selection failed, recover by selecting the already-created workspace. Do not create another one or generate repeated creation requests blindly.

Do not grant Ary new privileges in Operations, use a synthetic QA actor, forge sessions, or insert workspace/membership rows directly. If she has no eligible source membership or the supported operation actually fails, report the precise role/response and the operation attempted. Merely finding no pre-existing Prospecting workspace is no longer a blocker.

## 3. Treat this as real pilot data on staging

The new workspace remains in the existing staging environment. Tenant separation does not create a separate database or turn staging into production.

Check the actual scoped fixture/cleanup procedures before loading records. Do not run reset scripts. The new workspace must not be classified as a synthetic QA fixture or included in a known destructive cleanup target. Preserve all existing Operations, QA, and legacy LTB records.

Record the new workspace identity in private pilot notes outside Git as real pilot data to retain, and keep a recoverable private export after import. A name or a note alone is not proof of cleanup exclusion. If a known reset policy makes safe retention impossible, report that concrete policy instead of silently importing.

No infrastructure, backup service, production rollout, migration, or credential change is part of this task. Do not demand a production-readiness project for a five-record manual pilot.

## 4. Load the already-researched businesses

Candidates remain limited to Evelynne Gomes Greenberg Photography, Rachael Mattio Photography, K9 Summit Academy, Rieko Yamanaka, and Annie Swafford. Use only supported details in the private research. Do not broaden the batch.

Keep K9's email unknown unless independently verified. A website-only record is acceptable when the actual intake contract permits it. If a genuinely required field is missing, skip only that candidate and state the constraint; do not invent a value or block the other eligible records.

Before intake, inspect the current create/import side effects. Use the existing supported unaudited review/hold state, with no sending or automatic AI work. No email, SMS, contact-form submission, campaign enrollment, follow-up scheduling, paid enrichment, mailbox connection, provider sync, or outreach is authorized. Do not change global automation settings or mark records Strong/Ready to contact.

Check existing records and already-authorized suppression/contact-history information by business identity, domain, and verified public email where available. Skip duplicates, suppressed contacts, known previously contacted businesses, and existing clients found through supported checks. A newly empty workspace is not proof these businesses were never contacted. Unavailable history remains explicitly unknown. Do not copy legacy histories or scan entire mailboxes.

Use the ordinary Add prospect or supported reviewed-import flow. Apply the real intake schema's provenance rules. Batch label: `Ary review batch 01`. Use existing batch/tag/note fields, without adding a schema or feature.

Add one record first, reopen it, and verify fields, source, state, and absence of outreach side effects. Then load the remaining eligible candidates. Inspect saved results before retrying an interrupted operation.

Initial note:

> Added for Ary's manual review by the assistant. Qualification, service need, buying intent, and email deliverability are not established. Contact history is unverified unless separately documented. No outreach authorized.

Do not attribute that note to Ary as though she wrote it, invent a business problem, fabricate a contact event, or overwrite existing notes.

Keep imported contact data, workspace IDs, private notes, screenshots, credentials, and sessions outside Git and CI artifacts. Retain the original research and a separate import receipt with actual saved record IDs and private export location.

## 5. Verify the pilot and hand it over

Through the deployed interface, open Prospecting from the sidebar, display the batch in an existing All prospects/review view, search for one business, open its details and website, save the honest initial note, and reload/reopen to verify persistence.

Do not leave a Ready-to-contact filter hiding the records. Do not change qualification to satisfy the filter. Confirm no enrollment, scheduled action, provider sync, or sending occurred.

This data-entry task needs no full-suite/build/CI run or independent audit. A real application defect blocking the basic flow warrants only the smallest correction and applicable checks. Do not restart the completed app-wide QA or redesign.

Return directly to Ary:
- The working workspace name and Prospecting URL, with actual selected-context evidence.
- Names, record links, and number actually imported, plus skips and reasons.
- A screenshot of the populated list without unrelated private data.
- The shortest click path for writing and saving her own notes.
- Confirmation that no outreach/enrollment occurred.
- Private export location and any remaining specific limitation.

Do not label research or import previews as saved records. Leave the real workspace and records intact. Keep PERF3 and prior unreproduced limitations separate. Stop for Ary to use Bloomsi; do not resume sourcing, redesign, another roadmap phase, or an audit archive.
