# Client setup UX and shared UI foundations

Model: GPT-6 Astra
Reasoning: High
Surface: Existing Codex session with repository and authenticated browser access

## Outcome and scope

Make the complete Client setup workflow usable by a person who does not know the implementation. Fix the shared control and layout defects behind the latest 13 screenshots. The owner requests product-design judgment, real SaaS references, and suitable design skills, not another series of isolated margin patches.

This task permits reorganizing these screens and decomposing oversized components. Earlier instructions to preserve their exact layout must not prevent a better task flow. Preserve permissions, source truth, client lifecycle, service relationships, immutable reports, and the consequential effects of conversion and invitations.

Read applicable AGENTS.md, AI_WORKING_AGREEMENTS.md, BUILD_STATE, the current design documents, and the relevant Client/Prospecting/onboarding contracts. Preserve other worktrees, uncommitted updates, and PR #93 if still active. Check actual main and current ownership before creating or reusing an implementation branch. Do not duplicate active work.

This task document was prepared against main d361177503c5c4181b8c905d8083bdb2fd629589. It is on a documentation branch. Read it by the supplied commit without switching/resetting your worktree or merging the documentation branch merely to obtain instructions.

## 1. Use two complementary design skills

Inspect already-installed skills and their source before adding duplicates. Install the following selected instruction packages at repository scope under .agents/skills, preserving upstream licensing and attribution. Do not modify global user settings or install an entire marketplace.

- frontend-design from anthropics/skills, directory skills/frontend-design, inspected source revision 34040c9c568585f6929bedeaad110ad08f079624.
- web-design-guidelines from vercel-labs/agent-skills, directory skills/web-design-guidelines, inspected source revision 063bee94c3f4df8453406c830b0a7df0f2860278.

Official skill documentation: https://developers.openai.com/codex/skills/
Vercel guideline source referenced by its skill: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

Read the selected SKILL.md files, needed references, and licenses before use. Use the supported skill installer with an explicit project destination where available, or install only the inspected instruction files and necessary references. Record upstream revisions and actual installed paths. No blind remote shell installers, added runtime dependencies, paid accounts, or replacement UI frameworks.

Check that the skills are discoverable and actually read them. Use frontend-design for composition and design judgment, then web-design-guidelines as a focused self-check during implementation. If live skill discovery cannot reload, read the installed files directly for this run and report that limitation; do not block the feature work on a ceremonial restart.

Skills are guidance, not authority over the owner's product rules. Keep Bloomsi's established identity and readable app typography. Do not introduce marketing heroes, aesthetic novelty for its own sake, new font families merely to be different, or a rebrand. Prefer sentence case. Do not follow generic advice that hides real overflow, disables zoom, adds redundant keyboard handling to native elements, or creates unrelated state/dependencies. Preserve no-em-dash and no-middle-dot UI-copy rules. Do not rewrite stored user content or upstream license text.

### Concrete product references

Read these public first-party references and adapt their relevant patterns, not their brand assets:

- Attio record-page hierarchy: https://attio.com/changelog/2026/record-page-redesign . Keep identity, key information and actions coherent; put secondary detail in an appropriate supporting area.
- Linear creation and draft behavior: https://linear.app/docs/creating-issues . Keep the creation path focused and preserve unfinished input through ordinary navigation.
- Vercel interface guidance: https://vercel.com/design/guidelines . Apply deliberate alignment, useful field errors, accessible controls and next-step recovery.

Do not install CRM integrations or request access to real third-party CRM accounts just to study these public references. No subscription is required for this task. Briefly record the patterns chosen and then implement in the same task. No planning-only handoff.

## 2. Source observations to reproduce

These are repository observations, not claims of independent live reproduction:

1. components/bloomops/ProspectConversionPreview.jsx embeds the complete ProspectProfile EditableSection for identity below the service form and Review handoff. Repairing a contact name exposes business, website, niche, source URLs, verification checkboxes, and other research fields. It also shows generic review errors and places scope errors after all service rows.
2. app/prospecting.css around lines 417-421 styles `.bo-handoff input,.bo-handoff textarea` with padding:12px and min-height:44px. This includes embedded source-verification checkboxes. Earlier `.bo-prospect-check input` supplies a 20px width/height but does not cancel those minimum-size/padding rules. Inspect computed styles to confirm the rendered collision and fix the selector/control boundary.
3. components/bloomops/ClientActivation.jsx renders a primary submit button inside bo-stack and posts directly to activation or invitation retry. Failure renders a Notice, not a guided setup/recovery path. Inspect computed grid/flex sizing before attributing its full width to a specific rule.
4. app/api/bloomops/clients/_activation.mjs maps missing_published_template to an instruction to ask an administrator, even when the actor may be able to manage templates.
5. lib/bloomops/onboarding-setup.mjs checks workspace authority and templates.manage. It does not require an activated Client. components/bloomops/OnboardingSetup.jsx offers installation only for missing categories; existing draft, inactive, and published states are deliberately distinct. A client checklist is generated after activation; that is different from preparing workspace template definitions before activation.

The owner experiences an activation/setup loop. Trace the exact state, route and permission before deciding whether it is a missing link, an unsupported template state, an actual backend defect, or a combination. Do not dismiss the report because one ready-made QA workspace works.

## 3. Replace the client setup interaction

### Focused contact, services and review

Keep the visible workflow in this order:

1. Client and primary contact, prefilled from the selected prospect where actually recorded.
2. Purchased services, with separately editable package/scope details for each selection.
3. Review the exact client/service outcome and explicitly save or confirm conversion.

Do not force a long wizard if a compact, structured page is clearer. The required behavior is the sequence and clarity, not a mandatory number of screens.

Replace the embedded full identity/source editor used solely for contact repair with a focused contact editor near the top. Ask only for values needed by the actual create/convert contract. Clearly distinguish required contact name/email from optional information. Keep the complete profile and source-verification tools available at their own destination or a secondary disclosure, outside this essential workflow.

Preserve existing field-source metadata when untouched. Never automatically check verification boxes, infer a person's name from a business label, overwrite provenance with empty fields, or claim email deliverability from a source review. An optional research verification checkbox must not become a prerequisite for ordinary client creation.

Use canonical partial updates and existing revision/scope guards. Do not require a full-profile payload to save one contact field. Preserve service selections, written scopes and custom offerings when repairing contact information, reviewing templates, cancelling an editor, or returning from setup. Stale requests and workspace/user changes must not repopulate another scope's private draft.

Each service card needs its own meaningful labels and inline errors. If agreed scope is required, label it as required and focus the exact missing field on review. Return errors keyed to the actual service, not one detached message saying Describe the agreed scope. A generic Check the selections message is insufficient by itself. Keep all valid input. Separate error summary and action region with deliberate space.

Keep real multi-service persistence, custom offerings, review hashes, retry identity and duplicate protection. Merely changing a selector to look simpler must not merge separately scoped purchases or create duplicate clients on retry.

Manual client creation, prospect conversion, onboarding generation and sending a portal invitation remain distinct operations. Do not demand onboarding templates merely to save a Client draft where the current contract permits that draft. Do not remove the explicit sale confirmation that protects permanent outreach-stop behavior. Present that consequence once, clearly, at the relevant final action instead of spreading verification chores across every field.

### Useful onboarding readiness

Replace the oversized desktop Activate Client strip with a normal-width, clearly placed action region. Before a consequential activation attempt, provide Review onboarding or an equivalent truthful setup action that exposes the actual remaining requirements and lets the authorized person resolve them.

Readiness should identify contact, purchased-service and required-template status through canonical server checks. Do not duplicate business rules in browser-only validation, use activation attempts as a preflight that sends mail, or introduce a separate database model for readiness.

For missing common or service-specific templates, expose the supported setup directly from the client workflow, preserving current workspace and safe return context. No already-active Client may be required just to prepare workspace templates. Detect and correct such a real gate if it exists.

Handle each template state honestly:
- Missing: allow an authorized user to review and explicitly install the needed existing defaults.
- Already published: show ready and preserve the version.
- Existing draft, inactive or invalid: give the actual supported review/publish/repair action with the relevant state. If this recovery path is genuinely absent, implement the smallest complete authorized path using existing template version rules. Do not overwrite custom drafts or silently reactivate/publish them.
- No templates.manage capability: show which permission is needed and who can resolve it. Do not tell an authorized Owner to ask an administrator or grant privileges as a shortcut.

After setup, return to the same client with entered data intact, recheck readiness, and make the next action obvious. Preserve template version immutability and existing client progress.

The final action must say what it will do. If it starts onboarding and sends a portal invitation, disclose the recipient and those effects before explicit confirmation. Do not silently suppress an intended invitation or automatically send one when opening the page, installing templates, or saving a draft. Preserve separate retry status and prevent duplicate generation/invitations through the existing server mechanisms.

## 4. Repair shared primitives, not another override layer

Inspect existing TextInput/control, checkbox, radio, button, Field, Notice, Section, Tabs/view switcher, EmptyState and toolbar implementations and all affected callers.

Scope text-input styling to text-like controls or their explicit component classes. Checkboxes and radios require their own geometry and states. A 44px clickable label area does not mean a 44px-tall colored checkbox. Use a compact square indicator, one stable label/control hit target, and visible focus. Do not hide a native control without preserving its behavior and accessibility.

Consolidate repeated section, field, action/helper, and error/action layout relationships into existing shared components/tokens. Avoid appending a new pile of !important rules, matching arbitrary descendants, or patching only the pictured instance. Keep this refactor limited to the demonstrated shared faults.

Target deliberate gaps: 6-8px label/control; 8-12px related actions; 12-16px description/content; 16-24px form/action regions; 24-32px distinct sections. Adjust optical alignment without replacing every margin with the same number. Examine both empty and populated states.

Use a coherent action hierarchy. Navigation remains a recognizable link, mutations remain buttons, filters and view switches stay compact, status is not styled as a clickable control. Preserve keyboard focus and touch sizes. No full-width desktop CTA unless the task genuinely calls for one. Keep prose readable while list/report working surfaces use their available width.

Update the existing shared design guidance narrowly so new screens use the repaired primitives. Do not start a second design-system project or rebuild all components unnecessarily.

## 5. Complete current screenshot register

The 13 screenshots are represented below so missing attachments cannot block implementation. Each requires a visible outcome, not merely a selector added to CSS.

| ID | Observed screen | Required outcome |
| --- | --- | --- |
| U01 | Handoff review error touches CTA; detached scope error | Service-specific inline error, focus recovery, preserved input, explicit error/action spacing |
| U02 | Tall pink source-verification checkbox | Correct typed-control geometry and label hit target; test checked/unchecked/disabled/focused states inside and outside handoff |
| U03 | Entire identity/source-audit form appended below services/review | Focused contact repair before services; optional research work stays secondary; no enormous duplicate form |
| U04 | Workspace label/name/icon/chevron alignment | Stable left icon, left-aligned two-line identity, trailing chevron; bounded width; long-name access, dropdown and user/workspace guards preserved |
| U05 | Systems Apply/Reset below left despite desktop space | Field grid and action group on one aligned desktop toolbar where space allows; actions on the right; honest responsive wrap, no stretched controls |
| U06 | Calendar month controls, note and empty state collide | Coherent month navigation, human-readable month, separate explanatory text and results; target-date semantics unchanged |
| U07 | Work templates Back and retired controls look like plain text | Recognizable back navigation and clear active/retired control; authorized first-create path or accurate explanation; keep retirement distinct from deletion |
| U08 | Report list is a narrow, disconnected text island | Consistent Client-context header, visible New report action, compact active/archive controls and useful empty state; no false claim that published reports are private drafts |
| U09 | Reporting metric legends, help and fields misalign | Shared metric-field layout with description separation, aligned controls, sensible provenance/time grouping; formulas and published snapshots/PDF contents unchanged |
| U10 | Prospecting wrong-workspace recovery copy touches CTA | Clear selected-context explanation and supported explicit workspace chooser; preserve unsaved work; never silently switch or expose another workspace |
| U11 | Client overview has a long request column and huge gaps before details | Coherent record layout: key contact/services/actions near top, bounded useful requests with View all, details reachable without a large blank column; no hidden required work |
| U12 | Client activation error dead end, full-width purple CTA, old wide tab rail | Full readiness/recovery flow above; compact approved view-switch style, clear selected state, appropriately sized action and truthful invitation effects |
| U13 | Prospect view dropdown and record count misaligned | Proper view-control height, aligned count and search, stable selected/filter state, usable keyboard and narrow-width behavior |

Apply shared corrections to sibling routes using the same components, including unpictured states. Use the owner's approved compact Social controls as a reference rather than inventing another navigation treatment. Keep the existing friendly empty-state icons and stronger type hierarchy where already useful.

## 6. Verify from an unprepared workspace

Use synthetic local data and deliberately synthetic staging records. Ary's real prospects are not customers or QA fixtures. Do not change their names, verification states, notes, lifecycle, contact data, or outreach state. Do not convert or activate them. Do not publish templates into the owner's real pilot workspace as a visual test.

Start the key browser scenario from a normally provisioned synthetic workspace with no onboarding templates. Do not pre-seed templates to skip the reported setup difficulty. Use the UI to create/select a synthetic prospect, repair an actually missing contact name, choose two services, enter scopes, review and create the draft Client, prepare required onboarding, and reach explicit final confirmation.

Exercise missing, published, existing-draft/inactive and denied-management template cases. Prove that template setup is possible before Client activation. Use captured local mail for consequential end-to-end invitation testing; live email is permitted only to an explicitly authorized controlled QA recipient under existing scoped approval. No real prospect email or newly inferred mailbox permission.

Also verify cancellation, return-from-setup, refresh, concurrent edits/retries, custom service preservation, normal save/reopen, current workspace changes, and failure recovery. Use real pointer/keyboard interactions and authenticated roles, not forced clicks or fixtures that bypass the normal setup.

For shared visuals, inspect real 100% browser views around 1440x900 and 1920x1080, plus tablet/390px and keyboard/200% zoom. A long page screenshot shrunk until text is unreadable is not visual acceptance. Capture ordinary viewport screenshots showing initial state, errors, selected services, corrected contact, readiness, and final result. Inspect them yourself before reporting completion.

Measure control bounds and gaps for the exact nested cases that regressed: checkbox inside handoff; error immediately before CTA; workspace two-line control; report field description/inputs; client tab/header and filter actions. No page-wide overflow hiding or narrowed crops concealing defects.

Run focused tests while building, then the normal full suite/build and applicable browser/storage checks at meaningful integration checkpoints. Keep assertions about correctness and permissions. Add regressions for actual missed interactions and shared geometry, not snapshots mechanically approved after every change.

Use the existing bounded in-session risk review when repository rules require it. No owner-shuttled audit cycle or massive new archive. Do not call tests run by CI independently reproduced by the reviewer.

## 7. Implement and deliver

Work in two coherent batches if useful: complete client setup/readiness plus typed-control fixes first, then propagate the shared layout changes to the screenshot siblings. Do not hold a working critical fix behind every minor polish item. Do not stop after a design document or skill installation.

Use the standing normal PR/CI/merge/staging authorization for this scope, respecting actual protection rules and current branch identity. Production, DNS, billing, real outreach, arbitrary paid tools, shared resets and unrelated features remain excluded. Preserve prior evidence and current uncommitted work. Keep the existing remote-D1 integrity limitation and PERF3 honestly open; neither may be quietly relabeled successful in a UI report.

Keep one U01-U13 outcome list in the existing tracker, with FIXED AND RETESTED, NOT REPRODUCED, BLOCKED or NOT RUN as appropriate. Return the deployed revision, real click path from fresh Client setup through onboarding readiness, matched readable screenshots, installed skill names/paths/revisions, and exact remaining limitations. Lead with usability outcomes rather than counts.

The owner should not need another walkthrough to identify the missing contact field, prepare an onboarding template, or find the next button. Finish these flows, inspect their shared siblings proactively, then return the app to her for use. Do not resume the broad roadmap or sourcing automatically.
