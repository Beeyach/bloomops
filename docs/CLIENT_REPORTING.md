# Client reports that show the work and results

Owner-requested planning direction recorded 14 September 2026. The owner wants reusable GHL and social reporting templates, simple numeric entry and clear client-facing visuals. This document defines the proposed first version. It does not claim reports or source integrations already exist in Bloomsi.

## Where reports belong

Use a Reports area inside the existing client detail and a permission-controlled Reports destination in that client's portal. Create and open reports from the relevant service or campaign when useful. Do not add another global sidebar section in the first version.

Report numbers and chart data are structured records associated with workspace, client, service engagement and reporting period. Pages can link to a report and supply narrative blocks through the existing editor. Do not store metric truth as manually typed prose or duplicate the report as a second editable Page. An embedded report must enforce the same permissions as the report itself.

Reuse canonical Clients, campaigns, files, users and service records. Inspect existing lightweight Ads performance storage before adding another metric store. Where a source already exists in Bloomsi, reference it and record the source/version used for publication. Do not invent a second client or campaign identity for reporting.

## First workflow

Choose client, service and template. Select the period and timezone. Enter numbers or import a supported CSV. Attach or link supporting source material for internal checking. Review calculated values and charts. Write a short summary of the work, results, limits and next actions. Preview the client-facing version, then publish explicitly to the authorized client portal. Offer a PDF download of that same published version.

Provide Save draft and visible save state throughout. New reports default to private drafts. A client should see the latest published version, not live internal edits. Corrections create a revision with a new publication timestamp and preserve the earlier snapshot. Template changes do not rewrite existing reports. Archived or revoked reports follow explicit access rules. A PDF already downloaded cannot be recalled.

Publishing to a portal and sending a notification are separate actions. This phase does not enable email schedules, send reports or add recipients automatically. Any later public share link needs explicit scope, revocation and expiry design. Start with authenticated client access.

## Two starting templates

| Template | Inputs to support where the source provides them | Useful presentation |
|---|---|---|
| GHL campaign report | Campaign or auction identity, channel, dates, sent, delivered, failed/bounced, unique clicks, replies, opt-outs, leads/bookings when verified | Separate email and SMS summaries, period comparison, campaign table, short explanation and next actions |
| Social media report | Account and channel, reporting dates, published content count, source-native views/reach where available, interactions, link clicks, follower counts/change and attributable inquiries when recorded | Channel summary, comparable-period charts, selected content examples and next actions |

Support monthly and custom periods. JT's auction work can use one report per auction, then an optional monthly summary whose campaign scope and overlap rules are explicit. Reuse the same template with a new period, while leaving previous metrics blank until supplied. Never carry last month's values forward as new results.

These are proposed fields, not a promise that every platform exposes every metric. Show only fields appropriate to the chosen channel and source. Permit a small set of typed custom metrics with explicit labels, units, definitions and aggregation rules. No arbitrary executable formulas or page scripts are needed in the first version.

## Numeric entry and sources

Each observation records a stable metric key and definition version, provider/account, campaign or content scope where relevant, reporting window, timezone, unit, value, source reference, collection time and actor/import batch. Distinguish entered values, imported values, verified source values and derived values. Manual entries require a source note or an explicit unverified state before publication review.

Missing, unavailable and not tracked values remain distinct from zero. Reject malformed input and explain inconsistent totals, units or dates. Correct numbers without silently changing source provenance. Record edits and reviewed exceptions. Internal attachments and source links are not client-visible unless explicitly included.

CSV templates must use the accepted import schema. Preview field mapping, period, platform, units, duplicates and conflicts before saving. Re-imports must not double-count rows or overwrite newer manual corrections without review. Start with documented generic templates and a bounded mapping step. Do not promise an arbitrary GHL or social export will parse without inspecting its format.

## Calculations and honest comparisons

Define every calculated metric's numerator, denominator, scope and zero-denominator behaviour. Use Not available where a rate cannot be computed. For example, a delivery rate requires compatible delivered and sent counts from the same channel and period. A click rate must identify its source-defined denominator and whether clicks are unique. Retain source-reported rates when source semantics differ from a proposed calculation.

Compare only compatible periods, accounts, definitions and units. Show both date ranges and identify partial periods. Distinguish percentage-point changes from relative percentage changes. Do not manufacture a growth percentage from a zero or missing baseline. Sum compatible counts only, and recompute rates from compatible underlying counts instead of averaging percentages.

Do not add unique reach across overlapping posts/platforms and label it unique people. Do not equate views, impressions and reach. Preserve source-native definitions and review current provider documentation at integration time. Label metrics that cannot be compared after a definition change. Separate paid and organic results when the source supports that distinction.

Email opens, when included, are a directional source metric and not proof that a person read a message. Do not claim sales, bookings or revenue came from a campaign without a defined recorded attribution source. Record the attribution window and method when used. Do not combine currencies without an explicit conversion basis. The first version does not require revenue/ROAS reporting.

## Report layout and visuals

Use the supplied Bloomsi brand and existing client identity. The header shows client, report title, service and date range as clearly separated fields. Follow with a short written result summary, three to five relevant headline numbers, one or two useful charts, work completed and next actions. Detailed tables and source notes can follow. Avoid cramped metadata, giant dashboards, decorative doughnut charts and repeated explanations.

Use line charts only when dated observations exist. A single monthly total cannot produce an invented daily trend. Use bars for valid period/channel comparisons. Show missing intervals rather than interpolating them silently. Label axes, dates and units. Use colours consistently, with text/symbol cues and readable contrast. A lower value can be an improvement for some metrics, such as bounce rate, so colour direction must follow metric meaning.

Provide an accessible table for chart values. Client users should understand which numbers are actual, calculated, unavailable or still unverified. Do not make unverified metrics look like proven results. AI may draft narrative from approved data later, but it must not fabricate numbers, causes, attribution or promised outcomes. Human review is required before publishing.

The PDF must use the same published snapshot and visibility rules as the portal. It needs readable type, sensible page breaks, complete chart labels and no private notes. This client-report PDF is separate from the rejected prospect-audit PDF deliverable. That earlier decision does not ban PDFs for client reporting.

## Privacy and publication

Enforce workspace, client, service assignment and report visibility on the server for reports, metric queries, chart data, thumbnails, PDFs, search and embedded Pages. Drafts, internal commentary and private evidence never become accessible through a published report's asset URLs. Do not expose other clients in comparison charts or selectors. Preview as client must use real authorization rules and remain read-only.

Freeze the reviewed narrative, metric definitions, inputs, calculations, relevant template version and chart data at publication. Record publisher and time. Allow authorized revisions and withdrawal without erasing audit history. Make concurrent editing and publish conflicts explicit. Provider refreshes update draft inputs, not a published snapshot.

## Why manual entry comes first

HighLevel already supports custom reports, including email widgets and combined reporting. Bloomsi can start with a consistent client report using entered or reviewed imported data. Automatic collection is a later phase, chosen only for sources that save enough work and have suitable access.

Primary references checked 14 September 2026:

- [HighLevel custom reports](https://help.gohighlevel.com/support/solutions/articles/155000003965-how-to-create-and-schedule-reports)
- [HighLevel email widgets](https://help.gohighlevel.com/support/solutions/articles/155000004328-email-widgets)

No Meta API schema is frozen by this plan. Current metric availability and definitions must be verified against official provider documentation when an actual connector is built.

## Acceptance before calling reporting complete

Use fictional GHL and social fixtures with independently checked expected totals, missing values, zero denominators, incompatible periods, overlapping unique metrics and changed definitions. Verify CSV round trips, duplicate imports, manual corrections and concurrent edits. Confirm previous-period copying does not copy values accidentally.

Create, preview, publish, revise, archive and export reports. Verify that published versions stay unchanged after template/source edits. Test denied access to drafts, other clients, evidence files and chart/PDF URLs. Inspect client and internal views at desktop and narrow widths, reduced motion, loading/error states, printable output and actual PDF pages. No real client communication is needed for acceptance.

This document is planning only. No report, PDF, integration, live metric, client publication or scheduled delivery is created by this commit.
