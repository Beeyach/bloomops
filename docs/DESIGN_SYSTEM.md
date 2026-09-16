# BloomOps Design System Reference

This document adapts the real Bloomlab design-system implementation for BloomOps.

Source repository reviewed: `Beeyach/Bloomlab`.

Primary source files reviewed:

- `DESIGN_SYSTEM.md`
- `apps/web/src/screens/DesignGallery.tsx`
- `apps/web/src/screens/DesignGallery.module.css`
- `apps/web/src/styles/global.css`
- `apps/web/src/app/routes.tsx`
- `packages/design-system/src/tokens.css`
- `packages/design-system/src/fonts.css`
- `packages/design-system/src/primitives/Button.*`
- `packages/design-system/src/primitives/Field.*`
- `packages/design-system/src/primitives/Surface.*`
- `packages/design-system/src/primitives/ToolPanel.*`
- `packages/design-system/src/semantic/StatusPill.*`
- `packages/design-system/src/holo/HoloMaterial.module.css`
- `packages/design-system/src/layout/layout.module.css`

The Bloomlab `/design` route is the actual developer gallery, behind the `design_gallery` feature flag. It exposes the design system by section and supports `?section=<id>` isolation for visual review.

## BloomOps Adaptation Goal

BloomOps should inherit Bloomlab's visual language rather than invent a separate generic SaaS look.

The adaptation rule is:

**quiet operational interface, special moments/materials used with restraint.**

BloomOps is an agency-operations product, not a training game, so the strongest collectible/holographic treatments should be used much more selectively than in Bloomlab.

The visual system should still feel:

- tactile
- polished
- editorial
- intelligent
- playful in small doses
- premium
- comfortable for long sessions

Avoid generic admin-dashboard styling.

## Actual Bloomlab Gallery Sections

The implemented Bloomlab gallery contains:

- Palette
- Typography
- Surfaces
- Buttons
- Forms
- Holo
- Motion
- Panels
- Semantic components

BloomOps should preserve this review mentality. When its own component system matures, maintain an equivalent internal gallery or Storybook-like route rather than judging design only from production screens.

## Core Design Rule

Bloomlab's central rule is:

> The interface is quiet. The objects are magical.

For BloomOps:

- normal Clients, Work, Team, Onboarding, Finance, and Settings surfaces stay quiet
- special client deliverables, major launches, important achievements, or visually meaningful summary objects may use stronger material
- do not make every card holographic
- do not make every section a card

## Palette

Use the Bloomlab palette as the starting family.

| Role | Value |
|---|---|
| Cloud | `#F8FAFF` |
| Snow | `#FFFFFF` |
| Mist | `#F0F3FC` |
| Soft Lilac | `#EEEAFB` |
| Ink | `#18152B` |
| Deep Ink | `#100D22` |
| Ink Soft | `#5D5873` |
| Ink Faint | `#86819C` |
| Electric Sky | `#6EC8FF` |
| Bubblegum | `#FF82C8` |
| Lavender | `#A99BFF` |
| Aqua | `#75E6DE` |
| Lemon Cream | `#FFE98A` |
| Peach | `#FFB49C` |
| Ice | `#CFF8FF` |
| Success | `#56BFA1` |
| Warning | `#E5A94C` |
| Error | `#D85C72` |
| Info | `#5D90D9` |
| Link / focus | `#3B69BD` |

Use semantic colours with text/glyph support. Never communicate status by colour alone.

## Typography

Bloomlab implementation uses:

- Display: Bricolage Grotesque
- Interface/body: Inter

BloomOps should use the same pairing unless there is a concrete implementation reason not to.

### Typography rules

- strong, expressive display headings
- readable Inter for operations and long sessions
- negative display tracking around `-0.02em`
- do not use monospace as an aesthetic for user-facing operational data
- use tabular numerals when aligned figures are useful
- mobile form controls stay at least 16px

### No decorative pre-heading strips

Do not use tiny uppercase eyebrow/kicker/overline labels above headings merely as decoration.

Important context belongs in:
- subtitle
- metadata row
- status
- navigation context
- normal sentence copy

## Spacing

Bloomlab uses a 4px spacing scale:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40
- 48
- 64

Use the same rhythm for BloomOps.

## Radius

- small: 6px
- medium: 10px
- large: 16px
- extra large: 24px
- full: 999px

Avoid making every element heavily rounded.

## Shadows

Bloomlab shadows are intentionally restrained:

- small: subtle 1–2px grounding
- medium: approximately 4px / 12px blur
- large: approximately 12px / 32px blur

Avoid huge floating SaaS shadows.

## Motion

Bloomlab categories:

- state
- spatial
- execution
- reward

Timing family:

- fast: 120ms
- base: 200ms
- slow: 300ms
- settle: 420ms
- major reward: 1.5–3s

BloomOps should primarily use state and spatial motion.

Examples:
- button state
- row hover
- sheet open/close
- panel transition
- drag/reschedule feedback

Use major/reward motion sparingly.

Always respect `prefers-reduced-motion`.

## Surfaces

Bloomlab's implemented surface system has:

### Surface

Tones:
- Snow
- Mist
- Tint

Elevation:
- 0
- 1
- 2

Interactive surfaces may lift by approximately 1px on hover.

### InkSurface

Dark operational workspace surface:

- Ink: `#18152B`
- Deep Ink: `#100D22`

Child roles invert automatically.

For BloomOps, reserve dark workspaces for areas where sustained focused execution benefits from it, not ordinary CRUD screens.

Potential candidates:
- Systems QA / launch room
- advanced automation inspection
- focused review environment

Do not make the entire application dark by default.

## Buttons

Implemented Bloomlab variants:

- primary
- secondary
- ghost
- danger

Sizes:
- medium
- small

Rules:
- normal target height approximately 44px
- small controls return to 44px on coarse/touch pointers
- primary is Ink on light surfaces
- primary becomes Snow on Ink surfaces
- active press moves down approximately 1px
- loading state uses spinner and `aria-busy`
- focus is visibly outlined

BloomOps should reuse these interaction principles.

## Forms

Implemented field behavior:

- explicit label
- optional hint
- explicit error treatment
- 44px minimum control height
- 16px minimum font size
- focus border + outline
- disabled surfaces use secondary surface
- error state uses semantic Error on border/icon, not tiny red text alone
- select chevron is custom but simple

BloomOps forms should never depend on placeholder-only labels.

## Status Pills

Bloomlab includes semantic StatusPill variants:

- neutral
- success
- warning
- error
- info
- execution

Status includes:
- visible text label
- glyph
- optional colour

For BloomOps, use pills only where status benefits from compact scanning.

Do not turn every piece of metadata into a pill.

## Panels

Bloomlab's ToolPanel/Inspector pattern uses:

- quiet 1px border
- medium radius
- 44px header
- restrained title
- actions aligned right
- configurable density

BloomOps can adapt this for:

- Filters
- QA inspectors
- activity/log panels
- content review panels
- request triage
- task detail inspectors

## Density

Bloomlab explicitly varies density by environment.

BloomOps should do the same.

Suggested BloomOps mapping:

- Client Portal: low–medium
- Home: medium
- Clients: medium–high
- Onboarding: medium
- Work / Actions: high
- Social Calendar: medium–high
- Systems QA: high
- Ads: medium–high
- Pages: low–medium
- Finance: medium–high

Do not force one spacing density across the whole product.

## Navigation

Bloomlab's implemented desktop rail is 104px wide and becomes a 64px bottom bar below 768px.

BloomOps may adapt this geometry, but navigation labels and destinations are product-specific.

Internal BloomOps destinations:

- Home
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

Do not blindly copy Bloomlab's exact rail composition if eleven operational destinations become cramped.

Preserve:
- compactness
- clear labels
- strong active state
- responsive recomposition

Test navigation at all required widths.

## Responsive Review Widths

Use Bloomlab's review widths:

- 1440
- 1024
- 768
- 390
- 320

Tablet is first-class.

Mobile should be recomposed, not merely squeezed.

No critical function may disappear solely because responsive design is difficult.

## Accessibility

Carry over Bloomlab's standards:

- keyboard operability
- visible focus
- proper labels
- reduced motion
- sufficient contrast
- status not conveyed by colour alone
- alternatives to drag
- touch targets around 44px
- mobile inputs at least 16px
- no critical hover-only information

## Holographic Material

Bloomlab implements one reusable HoloMaterial with:

1. pearlescent base
2. diagonal spectral bands
3. metallic grain
4. pointer-following glare
5. iridescent rim

Variants:
- soft
- collectible
- mastery
- legendary

The physics use restrained tilt up to 6 degrees, 5px lift, subtle scale, pointer-following bands/glare, and a 420ms settle.

Reduced motion freezes the physics while preserving the static material.

### BloomOps rule

Do not automatically port HoloMaterial onto ordinary operational cards.

Appropriate BloomOps candidates may include:
- a major client launch card
- a special delivered project cover
- portfolio-ready deliverable
- a rare celebration/major completion
- selected premium client identity treatment

Ordinary:
- task
- client row
- invoice
- onboarding item
- settings panel

should stay quiet.

## No AI-Slop Rules

Bloomlab explicitly rejects:

- giant gradient heroes
- purple SaaS gradients
- gradient text
- glassmorphism everywhere
- random blobs
- icon beside every heading
- endless three-column card grids
- every section inside a card
- giant useless stats
- fake analytics
- emoji navigation
- trophy spam
- rocket graphics
- stock SaaS art
- generic AI avatars
- huge shadows
- random confetti
- excessive pills
- identical layouts for every environment
- generic "Welcome back" dashboards

Carry this list directly into BloomOps visual review.

## BloomOps Semantic Components To Build Over Time

Do not create these all now. This is a target vocabulary.

Potential semantic components:

- ClientRow / ClientCard
- ClientHealth
- ServiceEngagementRow
- OnboardingRequirement
- ProjectSummary
- MilestoneTrack
- ActionRow
- DeliverableCover
- ContentItemCard
- ApprovalRound
- RequestRow
- TeamWorkload
- ActivityEvent
- FileItem

These should sit above shared visual primitives rather than becoming one universal Card component.

## Design Gallery Strategy For BloomOps

Do not copy the entire Bloomlab gallery implementation during A0.

When BloomOps reaches shell/UI work, create a developer-only design gallery that can show:

- palette
- typography
- surfaces
- buttons
- forms
- status
- panels
- navigation
- client-facing objects
- operational rows
- empty/loading/error states
- responsive examples

Support section isolation if practical.

The Bloomlab implementation uses:

`/design?section=<id>`

That is a good pattern to reuse.

## Visual Acceptance Rule

A major BloomOps screen is not complete from one desktop screenshot.

Review at:

- 1440
- 1024
- 768
- 390
- 320

Evaluate:

- hierarchy
- density
- material restraint
- interaction
- client readability
- no-AI-slop rules
- responsive composition
- long-session comfort
- accessibility

## Owner feedback — operational metadata and icons (2026-09-12)

Do not join responsibility, visibility and verification requirements into a
flat middle-dot-separated text line. Give these distinct meanings compact,
readable badges with restrained semantic tints, borders, a visible label and
an appropriate glyph. Group and wrap them naturally on mobile. Reserve status
pills for lifecycle state; do not turn dates, IDs or every sentence into badges.

Use recognizable platform marks where a platform is explicitly identified
(for example Instagram access), and specific media/task icons where applicable
(video for Course videos, imagery for Brand assets, signing for Agreement).
Keep a step's identity icon after completion; show completion separately in
its status. Onboarding title icons use a compact 28px tile with a 16px glyph,
centered on the title row; Required/Optional belongs below that row. Reuse the
icon vocabulary and consistent sizing. No emojis.

## Client setup and typed controls (owner task, September 2026)

Keep primary contact and selected services in the essential flow, before review.
Supporting research opens separately without replacing handoff selections.
Errors belong beside the exact service field and focus the first invalid control.
Draft save, sale confirmation, template publication, and invitation delivery are
separate explicit actions. Readiness explains the next supported action before
activation. Avoid a full-width CTA where a compact action region is sufficient.

Text-input rules must exclude checkbox and radio types. Keep a native square
indicator with a generous label target; test nested forms as well as standalone
controls. Apply existing spacing tokens to labels, help, actions and disclosures.
Use compact ordinary route links for alternate views, preserving Social's pattern.
Inspect 1440×900 and1920×1080 screenshots at100% before claiming visual completion.

Project-local design references: `.agents/skills/SOURCES.md`. Interaction references:
[Attio record hierarchy](https://attio.com/changelog/2026/record-page-redesign) and
[Linear focused creation](https://linear.app/docs/creating-issues).
