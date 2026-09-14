# BloomOps Product Specification

## Purpose

BloomOps is an agency operations and client portal system, with internal prospecting planned under the owner-approved [Prospecting and Pages roadmap](PROSPECTING_ROADMAP.md). The roadmap extends the original post-sale boundary without declaring unfinished features shipped.

It is built first for Ellen's agency, with Ary as an administrator and Systems/GHL fulfillment provider. It should be simple enough for Ellen to operate without overwhelm, structured enough for a future project manager to run approximately ten clients, and polished enough for non-technical clients to use comfortably.

It may later become a commercial product, but V1 is an internal agency system first.

## Product Boundary

BloomOps owns:

- client activation
- onboarding
- service delivery
- projects
- milestones
- actions
- deliverables
- social/content production
- approvals
- file exchange
- team assignments
- Systems/GHL/Kajabi delivery
- Ads operations
- Pages/SOPs
- lightweight finance tracking
- client success signals
- client portal

## Planned internal Prospecting area

The 13 September 2026 owner direction adds selected raw lead import, website auditing, qualification, outreach, Gmail reply tracking, optional approved follow-ups, Skills Library and Results inside BloomOps. Use its existing design system and a focused contextual sidebar. Pages remains a main application area.

Ary will start in a fresh workspace. Keep the original Leads That Bloom app or her original workspace intact; do not merge old prospect history into the new workspace. Only selected untouched raw prospect fields are exported/imported explicitly. Source records, old conversations and active schedules remain separate. Import does not send messages, enable automation or copy credentials.

A deliberate same-workspace Convert to client action will link/create the canonical client, confirm services and start existing activation/onboarding. It preserves linked sales history and stops cold outreach. This is upcoming work, not a change to historical Release A acceptance.

Preserve every voice recording. Video fixes, narration generation and video tests remain paused. Follow [PROSPECTING_ROADMAP.md](PROSPECTING_ROADMAP.md) for phase order, profile fields, skills, statistics, performance and acceptance criteria.

## Primary Users

### Owner

Ellen.

Needs full operational access and eventual ability to step out of fulfillment.

### Admin

Ary.

Needs broad operational access, especially Systems/GHL/Kajabi work. Finance access is separately configurable.

### Project Manager

Future cross-client operator.

Needs broad delivery visibility and coordination, but not security administration or Finance by default.

### Team Member

Examples include white-label Social contractors.

Access should be assignment-based, not department-wide by default.

### Client

Uses a calm portal with only relevant client-visible items.

## Internal Navigation

Target internal navigation:

- Home
- Prospecting (planned; contextual sidebar)
- Clients
- Onboarding
- Work
- Social
- Ads
- Systems
- Pages
- Team
- Finance
- Settings

The main operational navigation should remain consistent across team members rather than being arbitrarily rearrangeable.

## Client Portal Navigation

Portal navigation is conditional.

Possible destinations:

- Home
- Content
- Projects
- Files

Do not show empty or irrelevant modules.

Examples:

Social-only client:
- Home
- Content
- Files

Kajabi-only client:
- Home
- Projects
- Files

Multi-service client:
- Home
- Content
- Projects
- Files

## Client Home

Client Home should answer:

- what does the agency need from me?
- what is currently happening?
- what is coming next?
- what has recently been delivered?
- who should I contact?

Avoid exposing internal operational detail.

## Client Detail

Canonical internal route conceptually:

`/clients/:clientId`

Long-term tabs:

- Overview
- Services
- Onboarding
- Projects
- Content
- Files
- Team
- Activity
- Finance

Tabs should appear only when meaningful.

## Departments

Initial departments:

- Social
- Ads
- Systems
- Operations

Departments are internal organizational views over shared data.

## Service Types

Initial examples:

- Social Media Management
- Ads
- GHL
- Kajabi
- Content Calendar
- Funnels
- Email Sequences
- Automation
- Course Builds
- Integrations

A single client can purchase multiple service engagements simultaneously.

Kajabi belongs under Systems.

## Work Area

Shared operational engine with specialist projections.

Target views:

### Projects

Project detail:
- Overview
- Milestones
- Actions
- Files
- Activity

### Actions

Views:
- Mine
- Today
- Upcoming
- Waiting
- Review
- Overdue
- All

Filters:
- Client
- Department
- Service
- Project
- Assignee
- Status
- Priority

### Requests

Request flow:
- Submitted
- Triage
- Need Info
- Accepted
- Declined

Accepted requests may become an Action or Project.

### Templates

Reusable blueprints for onboarding and delivery.

### Team

People, Workload, Departments.

No fake productivity scoring.

## Social

Content is first-class structured data.

Possible types:

- Reel
- Static Post
- Carousel
- Story
- Video
- Email
- Ad Creative
- Other

Default pipeline:

- Idea
- Script
- Waiting for Recording
- Editing
- Internal Review
- Client Review
- Revision Requested
- Approved
- Scheduled
- Published

Stages are conditional. Skip stages that do not apply.

Client recording uploads should occur inside the specific Content Item.

Approvals occur inside the specific work item and preserve history.

## Systems

### GHL Example Flow

- Discovery
- Access
- Funnel
- Forms
- Calendar
- Pipeline
- Automations
- Email/SMS
- Integrations
- QA
- Client Review
- Launch
- Handoff

### Kajabi Example Flow

- Access/Assets
- Architecture
- Course Build
- Funnel/Checkout
- Email/Nurture
- QA
- Client Review
- Launch
- Handoff

Kajabi work may include course setup, checkout, branding/access, offer packaging, lead magnet, landing page, nurture, affiliate system, sales page, testing, and client approvals.

## Ads

Target specialist views:

- Campaigns
- Creative
- Approvals
- Performance

Keep V1 performance lightweight.

Possible metrics:
- spend
- leads
- cost per lead
- bookings
- cost per booking
- revenue

Do not build a giant attribution platform in V1.

## Pages

Reuse the existing rich Notion-style Page editor.

Pages are for freeform documentation, not structured operational state.

Useful categories:
- SOPs
- Client Docs
- Project Docs
- Internal Docs

Pages may embed live structured database views where useful.

## Client reports

The owner has requested client-facing GHL and social reporting as a next phase. Follow [CLIENT_REPORTING.md](CLIENT_REPORTING.md) and [NEXT_PHASES.md](NEXT_PHASES.md). Reports belong to canonical client/service records, with structured metric observations, source definitions, periods and reviewed publication snapshots. Reuse existing performance records where appropriate. Reports are not finance ledger entries and should not introduce a second financial model. Pages may provide narrative and authorized links to reports. Start with numeric entry and reviewed CSV imports, with charts and portal/PDF output. Automatic source collection and delivery remain later work.

## Finance

Finance is intentionally lightweight.

Possible fields:
- Client
- Service
- Package
- Amount
- Currency
- Invoice status
- Payment status
- Due date
- Paid date
- Provider
- Reference
- Renewal

Do not build:
- accounting
- tax calculations
- payroll
- bank reconciliation

## Activation Experience

Manual activation is the canonical path.

A future payment event may call the same activation logic, but manual activation must always remain available.

High-level flow:

Create Client
→ choose Services
→ assign Team
→ set start/contact information
→ Activate Client
→ create onboarding
→ create configured initial service work
→ invite client
→ send welcome/sign-in
→ Client status becomes Onboarding

Activation must be coherent and idempotent.

## Client Onboarding Experience

Client should see a simple progress-oriented experience such as:

- Agreement
- Brand assets
- Instagram access
- GHL access
- Meta Business Manager
- Kickoff booking

Requirements from multiple services should be deduplicated by stable logical key.

Do not show the same client requirement twice merely because two service templates require it.

Some items may require internal verification after client submission.

## Design Direction

BloomOps should feel:

- calm
- premium
- editorial
- polished
- feminine without being childish
- understandable to non-technical clients

Avoid:

- generic SaaS-dashboard look
- excessive cards
- icon clutter
- exposing technical implementation detail
- visually overwhelming client screens

Visual reference:

https://bloomlab-preview.cool-sunset-2169.workers.dev/design

Inspect it only when browser access is actually available.
