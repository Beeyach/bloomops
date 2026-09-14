# Bloomsi next phases

Owner-requested plan recorded 14 September 2026. These phases follow the active Prospecting work and its required client/onboarding connection. They do not interrupt a running build or declare any feature implemented. Inspect current code and accepted release evidence before starting. Reuse completed features and existing records.

These phase IDs supplement the existing release roadmap. They do not rename releases A through G or restart completed P phases. Existing Pages work stays under the main Bloomsi platform and continues through its current phase.

## Phase N1 Save reliably and find records

Improve autosave, recovery and global search across existing screens. Show Saving, Saved and Save failed states. Preserve unsaved work through recoverable failures without allowing stale edits to overwrite newer work. Provide undo where changes can be safely reversed. Restore edits only to their original authorized user and workspace. Clear or invalidate local drafts on logout, revoked access and workspace changes as appropriate.

Add one search control for authorized prospects, clients, tasks, pages and files. Results should show enough identity and type to choose the right record without cramped metadata. Support keyboard access, bounded results and useful empty/error states. Do not index private contents into client-visible snippets or leak records through counts, filenames, suggestions or caches. Start with existing database/search capabilities rather than adding another service without evidence it is needed.

Done when delayed saves, offline/network failure, concurrent edits, navigation and retry do not silently lose or overwrite work, and search results stay within current permissions. Check desktop, keyboard and narrow layouts. Measure save/search load against the current app.

## Phase N2 Client overview and client preview

Improve the existing client overview. Show purchased services, current work, the next deadline and unresolved requests. Use canonical engagements, projects and onboarding records. Keep detailed history and internal notes available without filling the overview with them. Preserve the prospect-to-client link.

Add an authorized Preview as client mode using the same server-side visibility rules as the real portal. Label the selected client and preview mode clearly. Preview is read-only and cannot send, approve, pay, sign, impersonate a session or mutate client records. Do not simulate visibility only by hiding UI elements. Stop preview immediately when access changes. Test direct routes and media/file permissions as well as the page itself.

Done when an internal user can understand current work and see the exact eligible client-facing content without exposing private material or changing the client's data.

## Phase N3 Client reporting

Implement [CLIENT_REPORTING.md](CLIENT_REPORTING.md). Reports belong to client/service records. Start with manual entry and reviewed CSV import, reusable templates, calculated metrics, readable charts, narrative notes and a reviewed published version in the client portal. Automatic GHL/social connections are not prerequisites.

Start with two templates: GHL campaign report and social media report. Support monthly and custom date ranges, including per-auction reporting. Keep the record structure generic enough for later Ads and other service templates without building an attribution platform.

Done when a user can enter actual numbers, verify their sources and calculations, preview the client report, publish it explicitly, export a readable PDF and revise it without silently changing the previously published version. Draft/private sources remain inaccessible to clients. No scheduled delivery or external messages are activated by this phase.

## Phase N4 Reusable work and Pages improvements

Reuse the current work, service blueprint and onboarding-template engines. Add practical saved setups for repeated jobs such as an auction campaign. Enter the new event details and dates, preview generated work, then create new records once. Do not duplicate credentials, audiences, live sending state or prior approvals. Retries must not duplicate tasks. Template changes cannot mutate previously created jobs.

Continue the existing main Pages/editor work with reliable nested pages, links, templates, search and save/recovery. Link pages to clients and projects using canonical IDs and current permissions. Do not replace the mature LTB editor with a second editor or turn Pages into the source of client metrics and status fields.

Done when an existing setup can produce a new correctly dated job without affecting the previous job, and Pages retain links and content safely across moves, edits and permission changes. External campaign execution remains a separate explicit action.

## Phase N5 Optional reporting connections

Only after manual reports are useful, choose one requested source connection at a time. Verify current API availability, scopes, account-level limits and source metric definitions. Store refresh time, failures, provider IDs and mapping versions. Preview imported numbers and protect published snapshots and intentional manual corrections. Avoid collecting unrelated account data.

Scheduled refresh and scheduled delivery are separate capabilities. A refresh does not publish or send. Delivery requires a reviewed recipient list, schedule and explicit activation, with stop/retry rules that prevent duplicate messages. Respect existing credential and workspace isolation rules. Do not promise that all values shown in a provider's UI are available through its API.

## Shared acceptance

Each phase needs a bounded implementation contract based on current code, migration requirements if any, meaningful checks and visual review. Build only the phase being worked on and preserve active work. Keep route-specific code and reporting queries out of unrelated pages. Use measured performance comparisons, clear loading/error states, reduced motion and the owner's readability rules. Update BUILD_STATE.md with actual evidence and remaining work. This plan alone authorizes no live data changes, account connections, messages, DNS changes or deployments.
