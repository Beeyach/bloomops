# Pilot usability feedback 01

Model: GPT-6 Astra
Reasoning: High
Surface: Existing Codex session with authenticated repository and browser access

## Purpose and evidence

This is the owner's first annotated feedback batch after loading real prospects. Capture and address all 19 screenshots, in their upload order. The list below includes every annotation, including positive references and new feature requests. It is not another general redesign roadmap.

The screenshots establish visible presentation and the owner's experience. A static screenshot does not establish the cause of hover failure, whether a single empty block should move, a missing backend capability, or the current deployment revision. Reproduce behavioral reports before claiming a diagnosis or fix. No live browser behavior was independently exercised while preparing this task.

Repository inspected during preparation: Bloomwired/bloomops at main af71130f5e032a2c85c3d13e1cc9f727e1a044dc. Recheck current main, staging, open work and ownership before implementation. Do not reset to this reference.

Read applicable AGENTS.md, AI_WORKING_AGREEMENTS.md, current BUILD_STATE, the existing UI brief, and the relevant Prospecting/Pages contracts. This task's newer visual preferences supersede conflicting recommendations in the earlier UI cleanup brief. Preserve all unrelated requirements.

This file is on a documentation branch. Read it at the supplied commit without switching/resetting your working tree or merging the documentation branch merely to obtain instructions. Publishing this file did not modify the application or the owner's records.

## Owner decisions to retain

- Prefer the compact, individually bounded Social Content list / Calendar controls. Reuse their visual treatment for Work and Team. No full-width lavender navigation strip or black active underline for these switches. This does NOT reverse the previous request for fluid working surfaces.
- Filters should be quieter and more compact, without losing visible labels, usable controls, active-filter feedback or keyboard focus.
- Use meaningful matching icons and a consistent, clearly different visual treatment for labels versus values. This is a hierarchy requirement, not permission to mix random font families.
- Correct shared spacing throughout equivalent components, not only annotated pixels. Description-to-button gaps and grouped metadata repeatedly remain too tight.
- Put writing ahead of document configuration in Pages. Fix the reported block-control interactions.
- Make client creation explain and enable the next step. Record the requests for prospect search/prefill, multiple services and a custom-service path as functionality work, not completed CSS changes.
- Workspace switching should open a dropdown with View all workspaces. Empty states should have a small friendly relevant icon.
- No app-authored U+2014 or U+00B7 metadata separators. Preserve stored user content, names, research notes and immutable records.

## Screenshot-by-screenshot register

### S01. Prospect profile, outreach card and sources sidebar

Type: visual and action clarity.

Owner annotations: matching icons for View audit evidence and View draft, including equivalent actions elsewhere; padding between Review outreach and its draft-only helper; icons/alignment in Sources & verification.

Correction: use the existing icon set with evidence/document and draft/mail meanings. Keep actual link and button semantics. Give the outreach action/helper a deliberate vertical gap. Use consistent icon/label/value alignment in source metadata without adding a colored container around every property.

Acceptance: both actions retain their real destinations; draft-only messaging remains truthful and readable; no sending or scheduling results from visiting the card; the source sidebar has consistent inner gutters.

### S02. Niche and Observed facts provenance

Type: visual.

Owner asks for icons beside Source, Verification, Checked time and Last edited by and for less unstructured repeated text.

Correction: reuse one metadata-row pattern. Suggested meanings are link, verification shield/status, clock/calendar and person. Verification icons must not imply Checked when the value is Not checked. Retain field-level provenance and its explicit unknowns.

Acceptance: labels, icons and values align across both fields; repeated metadata is easier to scan; no evidence or dates are invented.

### S03. Public email and Website provenance

Type: visual; same shared cause as S02.

Apply the same metadata pattern to both fields. Render long source URLs as understandable source links with wrapping that does not clip or push the sidebar wide. Keep the complete destination accessible; do not silently change URLs.

Acceptance: source, verification, checked time and editor remain available for each field at desktop and narrow widths.

### S04. Label typography close-up

Type: owner design direction.

Owner asks for a distinct label style everywhere, using Checked time and Last edited by as examples.

Use a shared label token and consistent weight, size and contrast. Start with the current app family, compact 12-13 px medium/semibold labels and readable 14-16 px values, adjusted to the existing design. Do not add a new font dependency merely to distinguish labels. Check actual computed typography; do not claim fonts failed to load from this image.

Acceptance: the label/value distinction works across profile metadata, client forms, handoff summaries, workload and settings, not just these two labels.

### S05. Conversion identity summary and purchased-service picker

Type: visual plus a new functionality request.

Identity summary: add meaningful business/person/mail icons and apply the shared label/value hierarchy.

Service picker: owner asks to select more than one service, add a custom service, and use service-specific icons rather than the same checklist glyph for every service. Do not lose any of these three requests.

The inspected conversion UI currently holds one chosenService and sends one serviceTypeId. Multiple selection is not fixed by changing card styling. Implement multiple service engagements through the real domain model with separately associated package/scope values where applicable. Preserve the difference between a reusable service type and a purchased client engagement.

Custom service means a supported editable named offering, not an arbitrary invalid ID, a hard-coded Other record, or a fake selectable card. Inspect the existing catalogue-management capability and reuse it. A permitted user should be able to add/select a custom service without losing the conversion draft. Do not grant service-management privileges to other roles. If a new backend path is genuinely required, keep it within this feature and validate its authorization/persistence.

Use meaningful existing icons for Ads, content planning, automation/system delivery, course delivery and social management. Selected checkmarks can remain selection indicators; they must not replace the service identity icon.

Acceptance: two services plus a custom service can be reviewed, edited/removed before confirmation and saved as the intended client engagements in a synthetic test. Retry and concurrent submission must not create duplicate clients, contacts, conversions or engagements. One invalid selection must not leave a misleading partially successful client conversion. Existing single-service receipts remain readable. Show real page navigation only when needed, and keep selections across service search/pagination.

### S06. Add a client with prospect search and prefill

Type: new functionality request.

Owner proposes searching existing prospects at the top of Add a client, then filling available fields. Strong prospects may be prioritized or filterable; Strong is not proof of a sale and must not become an invented requirement for every manual client.

Keep a clear manual-entry path. Search only the current workspace and prospects the user may read. Show business, available contact and existing conversion/client association where authorized. Selecting a result should visibly carry supported name, contact, email, website and timezone values. Missing contact names remain empty, not inferred from the business name. Preview/review values before creation; do not overwrite edited fields silently when changing selection.

Use the canonical prospect-to-client path when the user explicitly records a sale/conversion. Selecting a prospect or prefilling a form alone must not stop outreach, create a client, attach a purchased service, invite anyone or mark the lead Won. Do not let the ordinary Add client endpoint become a way to duplicate an existing conversion or evade its rules. Choose and document one coherent entry flow with real saved outcomes.

Acceptance: search/prefill/manual entry work; denied and cross-workspace records never appear; existing converted prospects lead to the right existing client or explicit supported action; returning from a prospect preserves relevant context; no side effects before confirmation.

### S07. Handoff preview with no actionable next step

Type: workflow/recovery problem. Highest-priority client-flow item.

Owner cannot tell what to do after preview. The UI lists Confirm primary contact name, Publish common onboarding template and Publish service onboarding template without usable repair links or controls. Before conversion repeats a contact instruction without taking the user to its field.

Make each applicable issue actionable: edit/confirm the missing contact where the user is, or open the exact authorized edit field with a return path; provide a contextual Review onboarding setup action for missing templates. Preserve selected client, services, scope and entered data during repair. Recalculate a fresh preview after changes.

Separate true conversion blockers from onboarding prerequisites and advisory information. Do not disable client creation for a missing template if the canonical conversion model permits a draft client and separately pending onboarding. Do not remove a real contact, permission or stale-review requirement. The footer must state the next valid action, what it saves and what remains separate.

The current repository has /settings/onboarding and an OnboardingSetup component for reviewing/installing missing default categories. Link to that real supported flow. Do not invent a generic Publish button that overwrites existing drafts, inactive templates or published versions. Show the exact needed common/service categories and preserve scope when returning. Users without template-management authority need a truthful administrator instruction, not a broken link or a new permission grant.

Maintain explicit sale confirmation and its actual cold-outreach stop semantics. No automatic activation, invitation or external message. Render success with a useful destination such as the created client and a separate supported onboarding next step.

Acceptance: using a synthetic prospect with no contact name and missing common/service defaults, complete repair, re-review and the supported confirmed conversion without developer help, data loss or duplicate writes. Prove template warnings are not confused with blockers. Test stale review/conflict recovery.

### S08. Work view selector

Type: visual preference, replacing the previous full-width strip.

Owner dislikes the full-width colored band, cramped left padding for Actions and black active underline.

Replace it with compact bounded Actions / Projects controls using S10's visual reference. Keep the result surface fluid. Align Work templates with the appropriate toolbar and preserve a clear gap before filters. Keep navigation state, deep links, keyboard focus and real scrolling intact.

### S09. Social platform filter

Type: control improvement.

Replace the unexplained free-text platform filter with a labeled dropdown/searchable selector using existing supported platform values and matching available brand icons. Do not invent a connection to providers.

Preserve All, stored custom/legacy values and any supported custom-platform option. Do not narrow the catalogue silently to a guessed list of popular networks. Use local approved icon assets or readable text fallback, not remote logo tracking. Preserve filter query semantics, Apply/Clear, URL state and Back behavior.

Acceptance: known platform, custom/legacy platform, All and clear-filter recovery work with keyboard and touch. Logos are supplementary to text and not the only accessible name.

### S10. Social view controls, positive reference

Type: explicitly approved pattern, not a defect.

Owner likes the compact Content list / Calendar buttons and asks for the same treatment in Work and equivalent views. Preserve this as the reference: individually bounded controls, modest selected fill/border, readable selected label, no full-width rail and no black underline.

Reuse visual styling across equivalent navigation while preserving each control's actual link/button semantics. A shared appearance is not a reason to impose ARIA tabs on ordinary route links.

### S11. Systems filters

Type: visual refinement.

Owner asks for subtler filter controls/surfaces. Reduce the visual weight and unnecessary height/width of the panel. Keep labels, chosen values, Apply and Clear/Reset easy to identify and correctly spaced. Do not shrink text, remove focus rings, conceal active filters or switch to a different auto-query behavior.

Apply the same balanced filter treatment to equivalent Work, Social and Ads regions, with responsive wrapping instead of giant stretched controls.

### S12. Pages tools displace the writing area

Type: layout and information hierarchy.

The expanded Page tools panel appears ahead of the document title. Its template and record-context text/actions are crowded. Owner explicitly rejects the result.

Put the title and writing area first. Move Templates and Linked work/record context into a compact named Page tools control in the editor toolbar or an intentional inspector, closed by default for normal writing. Opening it must reveal clearly separated sections, descriptions and actions. Do not place another large settings card ahead of the document or hide these functions without a discoverable control.

Keep Comments, Share, save state, template reuse and record-context permissions functional. Preserve the document, selection, autosave, caret and scroll position while opening/closing tools.

### S13. Pages Move block and hover controls

Type: reported functional bug requiring browser reproduction.

Owner reports that Move block does not work and the plus/grip controls require repeated hovering before they become clickable.

The screenshot contains an empty document. Disabled movement may be correct when there is only one block. Reproduce with one empty block AND at least three distinguishable blocks. First cannot move up and last cannot move down; middle-block movement must work, persist after save/reload and support undo as implemented. Do not enable meaningless operations to make a disabled control look fixed.

Investigate actual pointer hit areas, hover boundaries, overlays, z-index, rerenders, selection/focus and event handling. The plus/grip must remain reachable when the pointer moves from the text into the control. One intentional click should open the correct insert/action UI without repeated pointer entry. Do not use force-clicks or programmatic DOM clicks to claim human pointer success.

Provide usable keyboard and touch access. Hide or de-emphasize inapplicable movement chrome rather than leading an empty page with dead-looking controls. Preserve rich block contents, marks, links and selection during movement. This is not permission for an editor-engine replacement.

### S14. Team workload explanation and refresh

Type: visual and language.

The stacked explanation paragraphs have poor separation and overwhelm the result. Refresh workload is too prominent.

Keep a concise summary. Put detailed counting rules in a clearly named explanation/disclosure with a meaningful info icon and full access to the accurate rules. Separate summary, explanation and results using shared spacing. Make Refresh a smaller, named secondary control near its results heading, with truthful loading/error feedback.

Do not convert Action counts into hours/capacity, change overlap semantics, timezone behavior, excluded states or authorization filtering.

### S15. Team view controls

Type: visual preference.

Replace the full-width People / Workload / Department work rail with the compact control pattern approved in S10 and the equivalent Ads pattern. Keep all three destinations, active state and accessible names. Do not relocate these pages into unrelated navigation.

### S16. Workspace switcher

Type: interaction request.

Owner wants the current workspace control to open a dropdown, with View all workspaces as a secondary destination.

Reuse current authorized workspace listing and selection services. Show selected workspace clearly; a bounded quick list may link to the existing full chooser for more results. Do not pretend the first paginated response is every membership.

Switch only after the ordinary authorized selection succeeds. Retain unsaved-draft protections, current user/workspace/membership isolation and existing scope invalidation. Close dropdown and recover focus sensibly; support keyboard, Escape and touch. Do not persist credentials or invent a second workspace store. Error recovery must not show the wrong workspace's records under the newly selected name.

### S17. Home and other empty states

Type: visual preference.

Owner asks for a small cute, relevant icon above the empty-state heading. Use the existing Bloomsi/garden visual language and icon assets. Keep it modest, friendly and supplementary to the text. No giant illustration, false urgency, animated distraction or fake status.

Apply consistently to comparable empty results, while keeping distinct messages/actions for nothing created, filtered out, all clear, access restriction and load failure. Never turn an error or permission denial into a cheerful zero state.

### S18. Settings purpose and recurring spacing

Type: comprehension and shared layout.

Owner does not know what Systems builds is for. Explain in plain language which service types can start the existing GHL/Kajabi delivery workflows and when an administrator would use these controls. Do not imply this connects a provider account or performs a build unless the actual implementation does so.

Use an appropriate setup/advanced section rather than making implementation terminology the user's prerequisite. Keep authorized controls findable and preserve their effect. Align their buttons with section content instead of arbitrary centered placement.

Fix the description-to-action gaps for Onboarding templates and Reusable Work, and equivalent section/action relationships elsewhere. Use specific labels describing the supported next action. Existing template versions, progress and service-binding behavior must not change as a styling side effect.

### S19. Full workspace chooser identity block

Type: visual.

The Signed in as / email / Sign out area is disconnected and consumes awkward vertical space. Use a compact identity row or small account region with sign-out as a clearly secondary action. Separate it consistently from the page header and workspace list. Keep full identity available and preserve sign-out behavior. Do not hide the account identity or rename workspaces to make the page look cleaner.

## Source observations, distinct from the owner's screenshots

Inspected at af71130f5e032a2c85c3d13e1cc9f727e1a044dc:

- components/bloomops/ProspectConversionPreview.jsx holds one chosenService, uses one serviceTypeId, renders the proposed contact as read-only profile text, and renders issue messages as text-only list items. It separately renders conversionReview blockers and explicit sale confirmation. This supports the single-select/current-recovery observations; it does not prove every server-side prerequisite.
- app/(internal)/clients/new/page.jsx uses ClientForm with workspace/user identity, owner candidates and timezones. It does not supply a prospect-search picker at that entry point. Inspect ClientForm and the actual APIs before integrating the new flow.
- app/(internal)/settings/onboarding/page.jsx and components/bloomops/OnboardingSetup.jsx provide the supported missing-default setup flow. Existing published versions, inactive templates and existing drafts have different states; installation is not permission to overwrite them.
- AI_WORKING_AGREEMENTS.md says one client can have several simultaneous service engagements. That does not mean the current conversion endpoint already accepts a service list.
- lib/editor-block-move.mjs and scripts/pages-block-move-browser-local.mjs distinguish first/last block movement. The existing tests do not settle the owner's reported hover failure in a real session.

Inspect actual shared components and callers before editing. These are starting references, not invented file-level implementation requirements.

## Execution order

Keep the current product-completion list. This is the bounded owner-feedback batch, not permission to resume every remaining feature.

1. Remove the handoff dead end and reproduce/fix the Pages controls (S07/S13). Implement needed draft preservation and next-step links without using real prospects to test conversion.
2. Correct shared field metadata, action/helper gaps, compact view controls, subtle filters, Page tools placement and the remaining screenshot presentation items. Check equivalent sibling screens; do not repair only the marked pixels.
3. Complete the requested client/prospect entry, multiple/custom services, platform selector and workspace dropdown. Keep this functionality visible on the checklist until actual persisted outcomes pass. Do not label a styled selector as feature completion.

Coherent separate commits/PRs are appropriate. Do not hold an independent bug fix until every enhancement is finished. Do not duplicate another session's work or absorb uncommitted changes. Use current repository instructions for any required bounded risk review inside the same session; no owner-shuttled audit/report loop and no large new review archives.

## Preservation and scope

Real prospects now exist in the owner's persistent workspace. They are not test fixtures or confirmed customers. Screenshots do not authorize converting them, setting them Strong/Won, changing their notes or provenance, stopping their outreach state, publishing templates in their workspace, sending invitations or enrolling anything.

Use disposable local fixtures and deliberately synthetic staging records for mutations, conversion, custom services, template setup, membership changes and editor tests. Viewing the owner's records for the requested diagnosis is not permission to modify them. Do not publish the screenshots, real emails, private notes, record IDs or session material in Git. This document intentionally omits those details.

Unknown values remain unknown. A source URL or a dated prose note does not automatically make the structured field verification Checked. Do not backfill missing contact names from business names or alter imported verification state during a visual pass.

Prefer existing components, icons, catalogue and authorization patterns. Add no new UI framework, provider integrations, paid services or infrastructure. UI work should not require a migration. If the multiple-service feature genuinely needs schema work, document the bounded reason, use the repository's additive migration process and verify fresh/populated upgrades. Do not silently claim no migration is possible or impose a blanket no-migration rule that creates fake behavior.

Standing authorization covers normal validated PR/merge/staging release within this requested scope, not production, DNS, billing, real communication, destructive data operations or protection bypasses. Read triggers before publishing. Do not merge the documentation branch simply to read this task.

## Verification and report

For each S01-S19 record one of: FIXED AND RETESTED, IMPLEMENTED AND VERIFIED, APPROVED PATTERN RETAINED, NOT REPRODUCED, BLOCKED, or NOT RUN. A code change or screenshot capture alone is not a behavioral pass.

Check the actual browser at representative desktop/tablet/phone sizes, including 1920, 1440, 768 and 390 CSS px, with keyboard and real zoom where available. Measure actual gaps/overflow, inspect rendered text and pointer interactions, and check empty/populated/long-content/error cases. Use matched before/after screenshots of synthetic data. A crop or a different zoom cannot conceal an unresolved layout issue.

Feature acceptance must include real UI navigation, save/reload, missing-data correction, cancellation/return recovery, server-side denied access, workspace switches with pending data, and duplicate/concurrent-write protections for client/service operations. Preserve current published-report and finance behavior.

Run focused checks while iterating, then the normal full suite/build and applicable integrated browser/storage checks at a coherent release checkpoint. Do not rerun the entire product suite after each icon or spacing adjustment. Do not weaken tests to accommodate a regression or claim something was independently reviewed when it was not.

Bind final staging evidence to the actual deployed revision. Lead the owner update with the completed usable flows, exact click paths, screenshots and remaining items. Keep test counts secondary. If a reported behavior cannot be reproduced, state the session/data/steps tested rather than declaring the owner wrong or closing it as fixed.

Finish this batch and return the app to Ary for use and further notes. Do not restart the broad roadmap or open another design-planning cycle.
