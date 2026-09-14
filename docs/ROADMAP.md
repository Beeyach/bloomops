# BloomOps Roadmap

This is sequencing guidance, not permission to pre-build future work.

## Current checkpoint — prospect sheet merged; N2A contract prepared

PR73 merged as `6ab4d11` with the previously reviewed and staged prospect sheet. Both merged staging and zero-to-current workflows passed on that exact SHA. [BUILD_STATE](BUILD_STATE.md) records exact evidence and the active worktree.

**Next:** implement the [N2A client overview contract](phases/N2.md) from the closed release. The contract is prepared from current code; runtime implementation is not started. Client preview, profile photos, discussion and in-app notifications retain separate N2 acceptance.

## Previous checkpoint — N1 release accepted in staging

PRs67–72 are merged in dependency order into main `1f9c1c1`: search, prospect sheet screen fit and profile/new-prospect/Pages/client-creation recovery. Combined build/tests,45 fresh/idempotent migrations and the required Sol High review/re-review pass. Both merged-main workflows are green;24 public and63 distinct authenticated staging checks verify the affected flows. [BUILD_STATE](BUILD_STATE.md) and [release evidence](previews/n1-release/README.md) record exact results, visuals and limitations. The broader all-app form-recovery inventory remains explicit and is not declared complete.

The N1 checkpoint identified the first N2 client overview contract as the next task. That contract is now prepared above; no N2 runtime code is implemented.

Owner-requested follow-up before N2: the prospect sheet now fills the desktop/tablet workspace and is accepted in staging on `43374cc`. [PR73](https://github.com/Bloomwired/bloomops/pull/73) is now merged as6ab4d11; its final acceptance and subsequent editor refinements are recorded in BUILD_STATE. See [fluid sheet evidence](previews/sheet-fluid/README.md).

## Current owner priority — Prospecting and Pages

Use [PROSPECTING_ROADMAP.md](PROSPECTING_ROADMAP.md) for the new workspace, internal prospecting area, structured profiles, Skills Library, outreach/results, main Pages and client-onboarding handoff. It supersedes earlier exclusions of prospecting and brings Pages forward from the general Operations Layer backlog. The first useful slice is the Prospecting shell and one full-page structured profile.

Keep the original Leads That Bloom workspace and records separate. Reuse selected untouched raw prospects only through explicit export/import. Apply the shared readability requirements; dot-separated metadata is banned. Video work is deferred and existing voice assets are preserved.

The release history below remains the operational roadmap. This priority change does not declare pending Ads/release gates complete or authorise overwriting in-flight work; consult BUILD_STATE.md before implementation.

## Release A — Activation + Onboarding

- Foundation
- Infrastructure isolation
- Auth
- Permissions
- Clients
- Services
- Onboarding
- Client portal

First real use: Ellen can onboard a real client.

## Release B — Work Core

- Projects
- Milestones
- Actions
- Dependencies
- Deliverables
- Home dashboard
- Files

This is where BloomOps begins replacing much of the operational Notion system.

## Release C — Social

- Content items
- Production pipeline
- Calendar
- Client recordings
- Approvals
- Revision history

This is where BloomOps becomes materially better than Notion for social fulfillment.

## Release D — Systems Delivery

- Systems specialist workspace
- GHL build blueprints
- Kajabi build blueprints
- QA
- Client Review
- Launches
- Handoff

Systems remains a specialist projection over the canonical Work Core rather than a second task/project engine.

## Release E — Ads

- Campaigns
- Creative
- Approvals
- Lightweight performance

Do not build a giant attribution platform in V1.

## Release F — Operations Layer

- Pages/SOP Library
- Team workload
- Department views
- Finance Lite
- Template management UI

## Release G — Reliability + Automation

- Expanded notifications
- Queues
- Payment activation
- Client Success

## Future Commercialization

Only after internal use proves the product.

Possible later work:
- workspace self-onboarding
- SaaS billing
- custom branding
- custom domains
- workspace limits
- admin/support tools
- data export
- tenant deletion

Do not build commercialization features before internal use proves the product.
