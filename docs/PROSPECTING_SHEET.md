# Bloomsi prospect sheet build contract

Owner direction recorded 14 September 2026. Requirements and design references only. This document does not establish the current implementation or staging state. Inspect the active code, accepted build state and recent work before implementation.

## Required first screen

Prospects opens a spreadsheet-style table of canonical prospect records. Full-page profiles show those same records. A simple list leading to one profile does not satisfy this requirement.

Use [Bloomsi branding](BRANDING.md), the existing design system and the [readability checklist](DESIGN_CHECKLIST.md). Preserve existing operational work, workspace boundaries and historical records. Ary starts in her fresh workspace. The original Leads That Bloom workspace and its audit/outreach history remain separate. This feature does not migrate old records automatically.

## Visual references

| Reference | Use |
|---|---|
| [Links, colours and import](design-references/prospect-sheet/links-colours-import.png) | Latest main sheet direction, website links, view colours and quiet Sample CSV action |
| [Views and sorting](design-references/prospect-sheet/views-and-sorting.png) | Open saved-view menu, date sorting and rows per page |
| [Bulk selection](design-references/prospect-sheet/selection.png) | Selected rows and contextual bulk action bar |

These images contain fictional businesses, people, domains, dates and counts. They are generated concepts, not live screenshots or audit evidence. Written requirements override image errors. Use the exact official logo. Use actual prospect favicons, with the existing stable garden SVG fallback when unavailable. Do not copy the generated dumbbell icon or initials tiles. Contacted must not imply a phone call. Do not copy incidental blank column space or shrink type to fit a screenshot.

## Layout and editing

Keep a single toolbar with the saved-view dropdown, search, Filter, Sort and Columns. Keep Add prospect and Import prospects in the header with a quieter Sample CSV download link. Avoid KPI cards, rows of status chips, permanent job controls and nested side drawers.

Default columns are Business, Website, Platform, Contact, Fit, Outreach and Next action. Website remains visible by default. Email, region, timezone, matched offer, audit date, source, import batch, Last contacted, Date added and Date imported are selectable columns. The date-focused mockup demonstrates an alternate column configuration. Unknown values remain unknown rather than guessed.

Business and person names open the same full-page prospect profile. Website links open the external site separately and only allow supported safe protocols. Social-only prospects remain valid without a website. Names have an explicit edit affordance or keyboard edit action so navigation and editing do not conflict. Other supported fields edit inline. Checkbox selection never opens a profile.

Support keyboard movement, range selection, validated copy/paste, column resizing and a sticky business column/header. Preserve the view, sort, filters, page and scroll when returning from a profile. Preserve in-session selection only while its record scope remains valid. Do not restore bulk selections across sessions. Owner correction (14 September 2026): fit the sheet to the available workspace width without horizontal scrolling. Desktop columns use flexible proportions and wrap long values. At narrow widths, or when more than eight fields are selected, wrap labelled fields beneath each business; keep every selected field, selection and edit action accessible with readable type. The desktop header/business column remain sticky. The sheet also fills the remaining desktop/tablet viewport height, including short result sets. Keep rows at their natural height, scroll long results within the records area and keep pagination available below it. Phones and short viewports retain natural page flow; recovery and bulk controls must remain reachable.

Owner typography correction: use compact14px desktop sheet text and tighter spacing while retaining readable16px phone text and44px touch actions. Keep the website external-link icon beside its URL. Give Next Action a quiet bordered, tinted control with a directional icon and visible hover/focus, preserving its profile destination. This explicit density request supersedes the earlier instruction against shrinking type.

Owner picker/icon correction: Platform and Fit should have obvious selectable controls. Offer common platform choices in row editing, filters and bulk editing, with an escape to custom text that preserves historical values. Show recognizable locally served platform marks beside recorded names, and readable Fit text with color and a distinct icon. Keep canonical save/retry/undo behavior and bulk review. Outreach remains derived from canonical activity; a decorative dropdown must not fabricate contact history.

Owner interaction correction, superseded by full-table QA: Platform and Fit open options on the first click and save the selected value directly. Show the chosen value while saving, then Saved or a recoverable failure. Choosing another field after a successful save must not ask to discard it. Custom platform and text cells use one explicit Save field action. Bulk/pasted changes and recovered/failed fields retain explicit review; genuine unsaved work still requires a deliberate discard. Save failures, lost responses, current authority and concurrent-edit guards must remain intact.

Outreach is an action dropdown into existing contact, interest, reply-handled, outreach-review and client-handoff flows. Preselect the requested actual-event form; changing this menu alone must not fabricate a status or send a message. A successful new-prospect creation must retire its own leave warning before opening the created record, while failed creation retains both its input and its warning.

Keep profile identity, assessment, evidence, outreach and activity structured as described in [the profile reference](design-references/README.md). Skills must be able to read and write authorized structured fields without parsing a pasted audit or guessing from colours.

## Saved views and personal preferences

On first entry, open All prospects, sorted by Date added, newest first, with 25 rows per page. On return, restore the last view, active filters, sorting, columns and page size for that user and workspace. A deleted or inaccessible view falls back to All prospects. Display active filter state and provide Clear filters. Never leak personal settings between workspaces or users.

| View | Record selection | Colour |
|---|---|---|
| All prospects | All accessible prospects in the current workspace | Mauve |
| To audit | Prospects needing their initial audit | Blue |
| Ready to contact | Reviewed Strong prospects with an eligible contact method, no prior outreach and no sending blocker | Teal |
| Waiting for reply | Contacted prospects awaiting a response with outreach still open | Amber |
| Needs a reply | Inbound conversations requiring a response, excluding automated and resolved replies | Purple |
| Closed | Closed outreach records with the reason preserved | Slate |

These views are filters over the same data. They are not separate tables or new status values. Ready to contact does not approve a draft or authorize sending. Under My views, allow saved filter/sort/column combinations such as Australia & New Zealand. Save current view explicitly creates a named view. Restore ordinary personal adjustments without silently changing a shared view definition.

Use coloured icons with dark readable labels. Keep colour assignments consistent and provide text, focus and selected-state indicators. Avoid colouring entire data rows by outreach status. A row-selection tint has a separate meaning.

## Sorting and pagination

Rows per page supports 25, 50, 100 and 200. Keep row height readable. Fetch bounded pages rather than every full record. No unbounded All rows choice. Changing filters, sort or page size returns to the first page. Counts and pagination use the same active query as the rows.

Each date field supports newest first and oldest first. Sort actual timestamps with a stable record-ID tie-breaker, not formatted strings.

| Field | Meaning |
|---|---|
| Date added | Record creation in the current workspace |
| Date imported | Successful original import into the current workspace, absent for manually created records |
| Last contacted | Latest recorded outbound contact, from a provider-confirmed send or explicitly logged manual contact |

Retries must not refresh added/imported timestamps and make existing prospects look new. Keep later import/update events separately. Drafts, note edits and incoming replies do not update Last contacted. Show Never when there was no outbound contact. Keep undated rows at the end in either direction, with a Never contacted filter available.

## Fit and outreach labels

| Field | Display values |
|---|---|
| Fit | Unreviewed, Strong, Maybe, Skip |
| Outreach | Not contacted, Contacted, Replied, Interested, Won, Closed |
| Next action | Derived action such as Audit website, Find contact, Review draft, Follow up with date, Read reply or Review audit |

Unreviewed is unset qualification. Maybe is the proposed friendly display label for the earlier Hold fit value. Inspect the current schema and preserve existing semantics. If Hold also means a timed outreach pause, do not map that pause to Maybe. Store pauses separately. Do not create duplicate state machines to match visual labels.

Strong is a relevant opportunity, not purchase intent. A reply alone does not establish interest. Existing GoHighLevel does not make a prospect a Skip. Missing email does not change fit. A failed audit is a job failure, not a qualification result. Audit job state, automation state and contact eligibility remain separate.

Preserve Closed reasons such as no reply and not interested. Enforce opt-out and do-not-contact suppression independently from displayed stage. Import, retries and status edits cannot bypass suppression. Counts come from canonical events, with distinct prospects, provider-confirmed sends, real replies and outcomes. Drafts and retries do not inflate results.

## Bulk actions and manual auditing

Show the selection action bar only when rows are selected, with an exact count. Header select-all selects the current page. Selecting every filtered result requires a separate explicit action. Clear or reconcile selection on query changes and prevent actions on stale or hidden selection scopes.

Prepare audit batch packages selected records for the manual ChatGPT skill. Include workspace and prospect IDs, URLs, known fields and provenance. It is a real structured export, not a claim that ChatGPT is already connected. Returned audit results need a preview and ID-based mapping into the same records. Use version checks to avoid overwriting newer edits.

Bulk Edit fields previews the proposed changes. Export includes authorized workspace data only. Provide undo for supported edits without reverting concurrent unrelated work. Audit findings need evidence and a review state before becoming outreach claims. Review allows accept, edit or dismiss while retaining source history. Findings about invisible source content or unverified buttons must not become visible-defect claims.

Optional paid API auditing stays in the later phase. When implemented, use eligibility checks, a model/provider choice, an estimate where available, a spend cap, persistent queue, cancellation and retry-safe results. Do not call paid services merely to demonstrate a button. Imports, row selection, fit edits and audits never start outreach.

## Sample CSV and imports

Sample CSV is a subtle download link beside the import action. Generate it from the same field schema the importer accepts. Include two clearly fictional example rows with a note in the import view to replace them. Proposed headings are Business name, Contact name, Website, Email, Country, Platform, Instagram and LinkedIn. Align exact headings, aliases and required fields with the inspected parser before shipping. The downloaded sample must parse correctly in that parser.

Allow missing website/email for social-only prospects. Leave unknowns blank. Raw imports do not copy qualification, audit reports, sending state or old follow-up schedules.

Preview parsed rows and column mapping before confirming. Show invalid fields, probable duplicates, skipped records and conflicts clearly. A shared website is not proof that two contacts are the same person. Use reviewed matches and retry-safe import receipts. Keep batch identity so users can filter by the CSV upload and inspect added/skipped/failed rows. Preserve import counts without counting retries twice.

## Existing CRM and onboarding connection

Convert to client lives on the full-page prospect profile. Confirm prefilled business/contact details, match an existing client in the active workspace or create one, then confirm the purchased service, agreed scope and relevant existing onboarding template. A suggested audit offer cannot silently become a purchased service.

Reuse Bloomsi's canonical Clients, service engagement and Onboarding workflow. Do not build a second onboarding database inside Prospecting. Create/link records once with retry-safe conversion and two-way authorized references. Keep the prospect record, audit and outreach history. After successful setup show Won and Open client. The client record links back to the prospect for authorized internal users. Failed setup must not appear complete and must be recoverable without duplicate clients or onboarding tasks.

Keep internal audit findings, qualification notes and email history private. Transfer approved identity/contact information and confirmed service scope. Stop pending cold outreach after conversion. Do not send invitations, messages or invoices as a side effect of this build. The handoff works within the active workspace. It must not merge Ary's old LTB history or Ellen's workspace into Ary's new workspace.

## Loading and motion

Initial loading uses skeleton rows matching actual columns and row heights. Profiles use section-shaped skeletons. Keep the header, sidebar and controls stable. Never show an empty-state message before the fetch completes.

During filtering, sorting and refresh, preserve existing rows and show a small updating indicator. Prevent stale bulk actions while query scope changes. Replace content without layout jumps and retain focus. Avoid flashing skeletons for near-instant responses.

Owner correction: after a cell save, retain the mounted table and use quiet background reconciliation. Do not insert a table-wide Updating line or keep unrelated controls blocked while that read finishes. Keep compact save feedback in reserved space. Newer saves must supersede older reads; filters/counts still reconcile with the canonical sheet, and failed reconciliation must remain retryable. Query changes retain their stale-action guard.

For longer audit/import jobs use a restrained local garden-themed animation, based on an approved asset or the existing icon library. Preserve the official logo. Show actual progress such as 8 of 20 checked when known. Use an indeterminate indicator otherwise. Do not fabricate percentages or completion times.

Distinguish upload, row checking and saving, along with queued, working, failed and completed jobs. Provide useful errors and retries rather than indefinite spinning. A quiet progress control opens job details only when needed. Completion gets a short check transition. Respect reduced motion and avoid unnecessary off-screen animation, bouncing controls or artificial delays.

## Optional helpers after the core sheet

A Needs attention saved view can collect real blockers such as missing contact details or failed jobs, with one actionable next step per row. Do not make a huge task dashboard. A Find contact bulk action may reuse the contact-finding skill, preserving sources and verification status. These helpers must not delay the first usable sheet or invent integrations that do not exist.

## Build order and acceptance

Inspect the current implementation first. Preserve completed work and identify the smallest missing changes. Update the existing P1 contract to include the sheet and profile together. P2 adds the import/template/manual skill workflow. Existing outreach work supplies real view/action states. P5 connects the client handoff. Keep this dependency order while carrying the requested work through to a usable verified result. Paid auditing and video remain later work.

Verify server-side workspace and field authorization, including guessed IDs and exports. Use bounded queries and indexes suited to search/filter/sort. Load profiles and evidence on demand. Keep prospecting, editor and video code out of unrelated route bundles. Measure regressions against the current app rather than claiming it cannot slow down.

Acceptance must demonstrate inline edits, profile return state, separate website opening, saved preferences, each date sort, null dates, all four page sizes and filtered counts. Verify selection across pages/query changes, bulk previews and supported undo. Download and import the actual sample CSV. Check malformed rows, duplicates and import retries. Verify permitted and denied client conversion, existing-client linking, failed conversion recovery, suppression, private notes and onboarding references.

Inspect desktop and narrow layouts, long values, favicon failure, no website/email, keyboard interaction, reduced motion, skeletons, empty states, updating rows and errors. Use fictional test records in an isolated environment. Run the repository's relevant checks and document evidence. Deploy through the existing staging workflow when implementing this owner-requested work, preserving production, DNS and original LTB resources.

## Evidence for this documentation handoff

The three PNGs were copied exactly from the reviewed conversation concepts. Documentation links and whitespace were checked. No runtime tests, paid calls, migrations, deployments or application changes are performed by this documentation commit.
