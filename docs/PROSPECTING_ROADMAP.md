# Prospecting and Pages build roadmap

Owner direction recorded 13 September 2026. **Scope and phase contracts.** P0/P1 is implemented, locally verified and independently reviewed on the implementation branch; it has not been merged or deployed. P2 onward remains planned. [BUILD_STATE.md](BUILD_STATE.md) owns the current delivery state.

BloomOps will combine internal prospecting, client operations and Pages in one application. It supplies the design, shell, identity and permission model. Reuse useful Leads That Bloom functionality selectively; do not embed its entire application or reproduce its crowded interface.

The first usable slice is a Prospecting destination, its contextual sidebar and one full-page structured prospect profile. Raw import, skills, outreach and results then make that surface useful. Main Pages and the client-to-onboarding handoff are core priorities. Paid bulk auditing and video improvements are later extensions.

## Non-negotiable boundaries

- **Fresh workspace:** Ary starts in a distinct new workspace with no prospects. Keep the original Leads That Bloom app, or at minimum her original workspace, intact and accessible.
- **Separate records:** old audits, conversations, qualification, clients, outreach history, pending follow-ups and connection state stay in their original workspace. Do not copy the production database, merge histories or silently sync the workspaces.
- **Selective raw import:** reuse only selected untouched raw prospects through a previewed export/import. Import raw business/contact/source fields with provenance; fresh records start unaudited and uncontacted. An import never initiates sending or AI work.
- **Existing operations:** preserve operational workspaces, client records, permissions and accepted release work. Prospecting is internal; it must not appear in the client portal or expose internal records through search, Pages, exports or asset URLs.
- **Design:** use BloomOps' actual tokens, fonts, components and responsive behaviour. Apply the repo-wide readability rules in [DESIGN_CHECKLIST.md](DESIGN_CHECKLIST.md).
- **Voice preservation:** keep every existing voice recording and tuned setting. Do not delete, retire, hide or regenerate clips as cleanup. Add appropriate new material later.
- **Video is paused:** do not record, generate narration, spend voice credits or run video tests in these core phases. The earlier stationary-page prototype does not meet the requested walkthrough behaviour.

These directions supersede older instructions that exclude prospecting from BloomOps. They do not relax workspace isolation or authorise a production cutover.

## Product structure

```text
BloomOps
  Prospecting
    Overview
    Prospects
    Outreach
    Skills Library
    Results
    Video & Voice Library (later, only when useful)
  Clients
  Onboarding
  Work and existing operational areas
  Pages
  Existing administration areas
```

Entering Prospecting opens its own contextual sidebar, with a clear route back to BloomOps. Keep main Pages outside Prospecting. The proposed labels can evolve after usability review; the section boundaries are confirmed. Do not expose empty placeholder menus just to show the eventual architecture.

### What to reuse and what to leave behind

| Reuse or adapt | Do not port automatically |
|---|---|
| Prospect fields, useful tables and filters | Every old tab, status chip and saved lens |
| Audit evidence, offer matching and drafting capabilities | A pasted audit used as the entire profile |
| Reply tracking, approved follow-up scheduling and stop rules | Old active schedules or five-email defaults |
| Skills and reusable instructions, reconciled with the new strategy | Every AI helper, duplicate guide or generic chat panel |
| Existing page tree, rich editor and compatible blocks | A second general document workspace inside Prospecting |
| Existing recorder, media hosting and voice assets for later | Video as a prerequisite for useful prospecting |
| Useful event recording and result definitions | Historical counters blended into new-workspace results |

Inspect dependencies before removing inherited modules. Simpler navigation is not permission for a large deletion sweep.

## Phase order

| Phase | Deliverable | Completion evidence |
|---|---|---|
| P0 | Baseline, workspace and design foundation | Explicit workspace isolation, empty new workspace, baseline measurements and scoped build contracts |
| P1 | Prospecting shell and structured full-page profile | One complete usable profile at desktop and phone widths; no unrelated-route regression |
| P2 | Selected raw import, manual audits and Skills Library | Repeat-safe import, structured audit mapping and usable skill context round trip |
| P3 | Outreach, automation overview and accurate Results | Verified send/reply/stop behaviour and reconciled event-based counts |
| P4 | Main Pages with familiar Notion-like editing | Page/block editing, saving/recovery and content compatibility acceptance |
| P5 | Prospect-to-client-to-onboarding handoff | Same-workspace conversion, duplicate-safe retries and recoverable onboarding failures |
| Later | Optional paid bulk audits, then resumed video work | Separately scoped cost, queue and visual/audio acceptance |

Finish a bounded slice before adding another. P4 and P5 are core work and must not be displaced by optional AI or video additions. This sequence does not declare unrelated release gates complete or authorise changing another task's in-flight branch.

## P0 — baseline and foundation

### Work

- [x] Confirm the current accepted main branch and release state. The planning branch started at `09de9d61d419add9a9e85d8e5e933936b5561154`; recheck before implementation. Existing performance work is recorded as closed in [BUILD_STATE.md](BUILD_STATE.md). Preserve its findings and existing Ads release work.
- [x] Inventory reusable prospecting, Pages, identity and job dependencies. Define what this release will load and which legacy features remain unused.
- [x] Specify the new workspace membership, internal capabilities and explicit workspace selection. Reuse existing identity; do not grant access to another workspace merely because an email matches.
- [x] Create the fresh workspace through a supported scoped flow. Keep old workspace access and links usable. Do not copy old mailbox/API credentials or enable automation implicitly.
- [x] Record baseline navigation, request counts and relevant bundle cost for Home, Clients, Work and the main shell on representative desktop/mobile conditions. Reuse the repository's accepted performance methodology.
- [x] Translate the shared readability requirements into a bounded implementation checklist for account identity, headings, field/help spacing, metadata and substantial editing flows.

### Done when

- [x] New-workspace prospect lists are empty; source records and access are unchanged.
- [x] Cross-workspace and client-portal requests are denied server-side, including guessed IDs and export/search paths.
- [x] New connections, queues and sending are inactive until explicitly configured.
- [x] Each following phase has an implementation contract, dependencies and measurable checks. No new database/auth/UI framework is needed merely for consolidation.

## P1 — Prospecting shell and one proper profile

### Work

- [x] Add route-based Prospecting navigation within the BloomOps internal shell. Build the contextual sidebar and return path. Load only destinations that work.
- [x] Build a small readable prospect list. Keep useful filters behind a focused control instead of stacked rows of chips and counters.
- [x] Open a prospect as a full page. Prefer inline editing; reserve dialogs for small focused decisions. Avoid nested drawers and multiple tab layers.
- [x] Establish stable workspace-scoped prospect fields and identifiers. Keep structured records in the existing relational model, with migrations for new schema.

### Profile contract

| Section | Content |
|---|---|
| Identity and contact | Person, business, website, current platform, niche/services, public contact email, location and timezone |
| Provenance | Import/source identity, field source, verification status and checked time; unknown values remain unknown |
| Assessment | Strong/Hold/Skip, specific reason, observed facts, unknowns and proposed work |
| Audit evidence | Dated report, page/target evidence, tested interaction and limitations; expandable rather than pasted into identity fields |
| Outreach | Drafts, actual last contact, next scheduled action, reply/stop state and automation state |
| Activity | Timestamped actor/action records, with detailed history available on demand |

Strong/Hold/Skip describes fit; it is separate from outreach stage. A Strong prospect is worth relevant outreach, not a confirmed buyer. Keep evidence and opportunity separate: an optional improvement is not a broken website.

### Done when

- [x] A user can find the website/platform, understand the opportunity, edit a field and reach the relevant draft without a cramped side panel.
- [x] Empty, unknown, loading, error and saved states are understandable. Source/date metadata does not become another compressed text chain.
- [x] Semantic fields and controls are readable by skills; no important value requires interpreting a prose audit or visual badge colour.
- [x] Desktop, 390px and 320px checks confirm readable spacing, keyboard/focus behaviour and no clipping.
- [x] Home/Clients/Work do not fetch the prospect table or load its heavy editor/media code. Compare actual measurements against P0 and resolve regressions attributable to the change.

The conversation's fictional profile concept is a direction for hierarchy, not a pixel-approved specification. Use the existing BloomOps design system when implementing.

## P2 — untouched raw prospects, manual audits and Skills Library

### Import

- [ ] Preview source eligibility from actual recorded activity. A “New” label alone does not establish that a prospect is untouched. Put ambiguous records aside for review; do not relabel contacted prospects to make them eligible.
- [ ] Export the selected raw fields without modifying source records. Record source workspace/record IDs as provenance, not as permission to access the old workspace.
- [ ] Preview field mapping, duplicates and invalid records before committing an import. Reconcile selected/imported/rejected counts and explain individual failures.
- [ ] Use duplicate-safe source mappings and durable import receipts. A repeat import does not recreate people or events. Never copy audits, send history, old qualification, scheduled work or suppression-bypassing state.

### Skills and audit output

- [ ] Manual ChatGPT use remains fully functional without a paid API audit. Provide versioned audit, outreach and follow-up skills with clear inputs, output schemas and context copy/export actions.
- [ ] Map an audit result into profile fields, observations, unknowns, assessment, proposed offer and drafts. Preserve the full report separately and handle conflicts with manual edits explicitly.
- [ ] Verify visible interactions: popups, new tabs, direct downloads, calendars, iframes and delayed content. Hidden code-only placeholder text is not a visitor-visible defect. Failed inspection is uncertainty, not proof something is broken.
- [ ] Never infer missing backend emails, reminders, lost leads or delivery from a website alone. Existing GHL is eligible for repairs/extensions. Direct messages, link-in-bio pages and open downloads can be deliberate choices.
- [ ] Check current public business activity when relevant; an old footer alone does not establish abandonment. Keep website observations separate from business viability.
- [ ] Record public contact source and confidence. An email found online is not delivery-verified. Keep contact research bounded and offer an unresolved-contact state.
- [ ] Match a meaningful offer: website fixes, funnels, nurture, GHL work or custom setup. Preserve affordable entry/custom work; do not force all prospects into booking repairs. Prices and claims need their own approved offer source.
- [ ] For suitable prospects, draft a specific intro plus two follow-ups using the actual business/programme/resource and a simple reply CTA. Tone is warm, polite and natural, without invented pain or forced filler. No PDF audit deliverable.

### Done when

- [ ] A selected untouched export can be imported and re-imported without duplicate prospects or events. Old data remains unchanged and new records have no sent messages or running automation.
- [ ] One complete skill round trip populates the correct sections and preserves uncertainty/manual edits. AI-readable context is built from the same canonical fields the user sees.
- [ ] Existing-GHL, direct-PDF, popup/calendar and hidden-text examples do not trigger the old automatic skip/false-defect assumptions.

## P3 — outreach, automation overview and Results

### Work

- [ ] Replace the old Today backlog with a calm Overview: decisions and replies needing a person, what automation is doing, and the next useful action. Untouched inventory is not urgent work. Group repeated exceptions without concealing real failures.
- [ ] Keep approved follow-up automation separate from paid AI auditing. Display running, held, stopped and failed state accurately; sending approved text does not require a fresh AI call.
- [ ] Use three total cold emails: day zero, three business days later, then five further business days later. A selected later video replaces email two's content; it does not add a fourth message.
- [ ] Keep follow-ups in the actual original thread using provider message/thread references. A matching subject alone is insufficient.
- [ ] Start with recipient-local weekdays at 9–11 a.m. and explicit timezone handling for Oceania, North America and the UK, including DST. Unresolved timezone requires a clear scheduling decision rather than a silent guess.
- [ ] Pause cold outreach on any reply. Stop on opt-out, decline or hard bounce. Recheck stop state immediately before send and use durable idempotency to handle retries, concurrent workers and reply/send races.
- [ ] Editing an approved draft invalidates the approval for that version. Do not import old schedules or silently enable sending in the fresh workspace.
- [ ] Keep sending and AI costs visible without requiring the user to read implementation details. Log manual/external activity with its provenance; do not present it as provider-confirmed.

### Events before dashboards

Record workspace/prospect/actor/time, event type, relevant skill/audit/offer/sequence version and provider or request ID. Include import, audit completion, qualification, draft approval, provider-confirmed send, reply, positive outcome, stop/bounce and client conversion. Retries must not duplicate events. A draft or button click is not a send.

| Metric | Definition |
|---|---|
| People contacted | Distinct recipients with a confirmed send in the selected first-contact cohort |
| Emails sent | Distinct accepted provider message IDs, shown separately from people; acceptance is not inbox delivery |
| People replied | Distinct human repliers from the same cohort; exclude automatic replies |
| Interested | Distinct prospects with a recorded positive outcome, with actor/source |
| Clients | Distinct linked completed client conversions; not inferred from interest, a call or a proposal |
| Rates | Visible numerator/denominator, fixed cohort/time basis and as-of date |

Unknown or untracked is not zero. Keep later bounces visible and define whether the denominator includes them rather than silently changing it. New-workspace Results excludes original LTB history. No formal A/B experiment is required.

### Done when

- [ ] Duplicate callbacks/retries, automatic replies, edited drafts, bounces, opt-outs and reply/send races produce the correct events and stop behaviour.
- [ ] Three-message cap, actual threading and timezone/DST scheduling are verified with controlled fixtures.
- [ ] Results reconciles to its underlying events, counts people separately from messages and never blends old-workspace history.
- [ ] Leaving Prospecting stops unnecessary polling; unrelated routes do not start audit or sending jobs. Unconfigured automation produces an honest inactive state.

## P4 — main Pages and the Notion-like experience

### Work

- [ ] Reuse the existing rich editor, page tree and compatible block implementations under main BloomOps Pages. Inventory existing capabilities before rebuilding.
- [ ] Prioritise nested pages, inline names/icons, slash insertion, rich text, block/page drag-and-drop, links, search, dependable autosave and recovery.
- [ ] Preserve source documents and scope any requested copies to the intended workspace. Verify hierarchy, formatting, embeds, attachments and access rather than automatically merging content.
- [ ] Keep operational records structured. Embedded views project authorised canonical data; Pages must not become a second database for Clients/Tasks/Content.
- [ ] Full Notion parity is not the first-release promise. Define larger relations/database behaviours separately after the core editing experience works.

### Done when

- [ ] Existing supported content round-trips without loss. Reordering/nesting, reload, save failure and conflicting edits have tested recovery.
- [ ] Keyboard and touch interactions are usable. Searches, embeds, public links and files respect workspace and visibility boundaries.
- [ ] Editor code loads only in the area that uses it; P0 routes retain their accepted performance characteristics.

## P5 — convert to client and begin onboarding

### Work

- [ ] Provide an explicit Convert to client action. Link a client in the same workspace or create one once; confirm the purchased service/scope and invoke existing activation/onboarding behaviour.
- [ ] Keep linked prospect/conversation history. Stop the cold sequence when the sale is recorded even if a later onboarding step needs repair.
- [ ] Use durable duplicate-safe conversion/activation receipts. Handle retries and partial failure without duplicate clients, engagements, onboarding instances or misleading success.
- [ ] Keep invitations/client messages as explicit authorised sending actions, not a hidden consequence of importing or inspecting a prospect.

### Done when

- [ ] New-client and existing-client cases both use canonical same-workspace records.
- [ ] Repeated/concurrent conversion, partial activation failure and retry are recoverable; cold outreach cannot resume accidentally.
- [ ] Portal visibility and existing operational lifecycle rules remain intact. Client conversion statistics reflect the recorded conversion event, not completed onboarding tasks.

## Later, separately scoped

**Paid bulk audits:** selected raw prospects, persistent queues, cancellation, bounded concurrency/retries/cost and evidence saved to the same profile. Verify model capability/pricing at implementation; API calls do not inherit regular ChatGPT context or its browser session.

**Video and voice:** only resume when Ary reopens this phase. Reuse the existing findings-based renderer and all saved voice assets. The recording must navigate/scroll to the relevant element, visibly demonstrate the correct interaction (including popup/PDF tabs), and match measured narration timing. Label proposed changes; never fabricate a current website state. Add reusable approved thoughts plus fresh prospect-specific lines. Tone remains warm, polite, naturally paced and includes a thank-you. Human review precedes sharing. Do not regenerate clips merely to spend expiring credits.

**Other business work:** final offer pricing/scopes, website credibility and offer-matching checklist, AI widgets and partner services remain separate from this core build.

## Working and release rules

- Implement in small coherent branches against the current accepted baseline. Update [BUILD_STATE.md](BUILD_STATE.md) with actual work/evidence, not unchecked plans marked complete.
- Follow existing authorization, migration and release checks appropriate to changed behaviour. Add schema migrations when needed; do not repair production schema during normal requests.
- Check functional behaviour and important invariants, then measure performance and visually inspect affected desktop/mobile screens. Do not broaden testing repeatedly without a changed requirement or unresolved issue.
- Preserve original LTB resources and unrelated BloomOps work. Data export/import, real communications, new paid jobs and deployment are not performed by this documentation PR.
- The initial sidebar/profile concept is not final design approval. Evaluate one useful slice before adding more features; do not turn feedback into another cycle of bloat.
