# Bloomsi Design Checklist

Use the official [Bloomsi name and supplied logo](BRANDING.md) for new platform branding. Older BloomOps references below identify the existing design system and technical context.

Use this checklist for every major BloomOps screen, component set, and client-facing flow.

Source basis: the actual Bloomlab design system and `/design` gallery in `Beeyach/Bloomlab`, adapted for BloomOps.

## 1. Product Fit

- [ ] The screen solves one clear operational question.
- [ ] The screen does not expose irrelevant internal complexity.
- [ ] Client-facing views use plain, calm language.
- [ ] Internal and client-facing representations are intentionally different where needed.
- [ ] No fake analytics, filler metrics, or decorative dashboard noise.

## 2. Visual Language

- [ ] The interface feels calm, premium, editorial, and polished.
- [ ] The visual language clearly belongs to the Bloomlab family.
- [ ] Light surfaces use the Bloomlab palette family.
- [ ] Strong material effects are reserved for meaningful moments.
- [ ] Holographic treatment is not used on ordinary CRUD rows/cards.
- [ ] Shadows are restrained.
- [ ] Radius use is consistent and not excessively rounded.
- [ ] Spacing follows the 4px rhythm.
- [ ] No generic SaaS template look.

## 3. Typography

- [ ] Display headings use Bricolage Grotesque or the approved display equivalent.
- [ ] Interface/body text uses Inter or the approved UI equivalent.
- [ ] No user-facing monospace aesthetic for metadata, IDs, logs, timestamps, or technical labels.
- [ ] Tabular numerals are used when aligned figures benefit from them.
- [ ] No decorative uppercase eyebrow/kicker/overline above headings.
- [ ] Heading hierarchy is obvious without relying on colour alone.
- [ ] Long-session text remains comfortable to read.

## 3a. Information hierarchy and readable copy

These owner requirements apply across the repository, including existing screens during the planned cleanup:

- [ ] No dot-separated metadata chains joining email, role, dates, business types or statuses. Do not substitute another separator for the same cramped row.
- [ ] Identity, role and properties have clear hierarchy or labelled positions. Dates appear where they help a decision, rather than being repeated in app chrome.
- [ ] Not every piece of metadata is a badge, pill or bordered box.
- [ ] Each screen has a clear purpose and at most one short introductory instruction when useful. Repeated explanations are removed.
- [ ] Optional mechanics and supporting explanation are behind a named disclosure. Information that changes the action's meaning remains visible beside it.
- [ ] Headings, instructions, field labels, inputs, helper text and sections have distinct spacing. Helper text does not run into the next field.
- [ ] Body size, line height, contrast and line length are comfortable on desktop and phone. Density is not solved by shrinking the text.
- [ ] Substantial records/workflows use full-page views and inline editing. Small dialogs are purposeful; drawers and tab layers are not stacked.
- [ ] A profile uses structured fields and a separate audit/evidence section, not an unstructured report pasted into its overview.
- [ ] Non-urgent inventory is not presented as a huge urgent task backlog. Automation states reflect what is really running, held or failed.

The separator ban concerns UI metadata chains, not punctuation in domains, email addresses, numbers or ordinary sentences. Reference: [Prospecting and Pages roadmap](PROSPECTING_ROADMAP.md).

### Prospect profile reference

- [ ] Inspect [the profile mockup and owner corrections](design-references/README.md) before editing the profile.
- [ ] Business icon precedes the name: actual website favicon, then stable garden-themed SVG fallback; no acronym/initial avatars. Reuse the existing detection/library where available.
- [ ] Detected social profiles use icon-only links beside Open website, with accessible names and focus/tooltips. No detected URL means no icon or empty placeholder.
- [ ] Maintain comfortable scrolling and spacing; do not compress the profile to fit one viewport.

## 4. Colour

- [ ] Palette stays within the Bloomlab family unless a justified semantic extension is required.
- [ ] Primary text uses Ink-family colours with sufficient contrast.
- [ ] Secondary text remains readable.
- [ ] Semantic colour is never the only status signal.
- [ ] Focus states are visible.
- [ ] Dark surfaces use the Ink / Deep Ink family rather than generic black.
- [ ] No gradient text.
- [ ] No generic purple SaaS gradient background.

## 5. Surfaces and Cards

- [ ] Not every section is inside a card.
- [ ] Surface choice has a structural purpose.
- [ ] Snow / Mist / Tint surfaces are used intentionally.
- [ ] Interactive surfaces have restrained hover feedback.
- [ ] Dense operational lists prefer rows/tables/panels over endless card grids.
- [ ] Dark Ink surfaces are reserved for focused execution contexts.
- [ ] One universal Card component is not used to flatten all semantic differences.

## 6. Buttons and Controls

- [ ] Primary, secondary, ghost, and danger hierarchy is clear.
- [ ] Main touch targets are about 44px minimum.
- [ ] Small controls recover adequate touch size on coarse pointers.
- [ ] Loading state is visible and non-destructive.
- [ ] Disabled state is clear.
- [ ] Active/press state provides tactile feedback.
- [ ] Buttons have visible focus states.
- [ ] Destructive actions are visually and semantically distinct.

## 7. Forms

- [ ] Every control has a real label.
- [ ] Placeholder text is not used as the only label.
- [ ] Inputs are at least 16px on mobile.
- [ ] Error states explain what is wrong.
- [ ] Error colour is not the only indicator.
- [ ] Required fields are clear.
- [ ] Hints are concise and useful.
- [ ] Disabled/read-only states are distinguishable.
- [ ] Form layout remains usable at 320px width.

## 8. Status and Metadata

- [ ] Status includes readable text.
- [ ] Status is not communicated by colour alone.
- [ ] Pills are used only when compact scanning benefits from them.
- [ ] Metadata is not turned into excessive pill clutter.
- [ ] Client-facing status labels are understandable to non-technical users.
- [ ] Internal technical states are translated where necessary for clients.

## 9. Information Density

- [ ] Density matches the environment.
- [ ] Client Portal is low-to-medium density.
- [ ] Home is medium density.
- [ ] Clients is medium-to-high density.
- [ ] Onboarding is medium density.
- [ ] Work / Actions is high density.
- [ ] Social Calendar is medium-to-high density.
- [ ] Systems QA may be high density.
- [ ] Finance may be medium-to-high density.
- [ ] Pages remain low-to-medium density.
- [ ] The same spacing density is not forced everywhere.

## 10. Navigation

- [ ] Navigation labels are explicit.
- [ ] No emoji navigation.
- [ ] Active state is obvious.
- [ ] Internal navigation stays consistent across users.
- [ ] Client navigation hides irrelevant modules instead of showing empty sections.
- [ ] Mobile navigation is recomposed, not merely squeezed.
- [ ] No critical destination disappears because responsive work is difficult.
- [ ] Eleven internal destinations do not become visually cramped.

## 11. Client Experience

- [ ] Client sees only their own client-visible data.
- [ ] Internal tasks, QA notes, contractor details, workload, finance, and restricted files remain hidden unless explicitly intended.
- [ ] The page answers: what do you need from me?
- [ ] The page answers: what is happening now?
- [ ] The page answers: what is next?
- [ ] Client-facing milestone names are calm and understandable.
- [ ] Empty or irrelevant portal modules are hidden.
- [ ] Upload, approval, and request interactions are obvious without training.

## 12. Motion

- [ ] Ordinary interaction motion stays roughly in the 120–300ms family.
- [ ] Motion reinforces state or spatial change rather than decorating the screen.
- [ ] No constant expensive animation.
- [ ] Off-screen animated work stops where practical.
- [ ] Reduced-motion preference is respected.
- [ ] Major celebration/reward motion is rare and optional.
- [ ] Holographic physics are disabled or frozen under reduced motion.

## 13. Holographic Material

- [ ] Holo is used only for something meaningfully special.
- [ ] Ordinary task/client/onboarding/settings surfaces stay quiet.
- [ ] Text remains legible over holo material.
- [ ] Interactive holo tilt remains restrained.
- [ ] Reduced-motion mode preserves static material without motion.
- [ ] Holo does not become the default visual treatment.

## 14. Accessibility

- [ ] Entire screen is keyboard operable.
- [ ] Focus order is logical.
- [ ] Focus is visible.
- [ ] Labels are programmatically associated.
- [ ] Status does not rely on colour.
- [ ] Drag interactions have a keyboard/menu alternative.
- [ ] Touch targets are approximately 44px where appropriate.
- [ ] Mobile inputs are at least 16px.
- [ ] No critical information is hover-only.
- [ ] Contrast is sufficient on both light and dark surfaces.
- [ ] Reduced motion is supported.

## 15. Responsive Review

Review every major screen at:

- [ ] 1440px
- [ ] 1024px
- [ ] 768px
- [ ] 390px
- [ ] 320px

At each width verify:

- [ ] hierarchy still works
- [ ] no accidental horizontal overflow
- [ ] actions remain reachable
- [ ] tables/lists recompose deliberately
- [ ] mobile is not just a compressed desktop
- [ ] client-facing flows remain simple
- [ ] touch targets remain usable
- [ ] text does not collapse into cramped layouts

## 16. State Coverage

For every major screen/component set, review:

- [ ] default
- [ ] empty
- [ ] loading
- [ ] error
- [ ] disabled
- [ ] selected
- [ ] hover
- [ ] focus
- [ ] mobile
- [ ] reduced motion
- [ ] permission-denied / unavailable state where relevant

## 17. No-AI-Slop Review

Reject the screen if it relies on:

- [ ] giant gradient hero
- [ ] generic purple SaaS gradient
- [ ] gradient text
- [ ] glassmorphism everywhere
- [ ] random decorative blobs
- [ ] icon beside every heading
- [ ] endless identical three-column cards
- [ ] every section inside a card
- [ ] giant useless stats
- [ ] fake analytics
- [ ] emoji navigation
- [ ] trophy spam
- [ ] rocket graphics
- [ ] stock SaaS art
- [ ] generic AI avatar
- [ ] huge shadows
- [ ] random confetti
- [ ] excessive pills
- [ ] identical layout pattern for every area
- [ ] generic "Welcome back" dashboard

## 18. Semantic Component Review

Before inventing a new component:

- [ ] Is this a real reusable semantic object?
- [ ] Can an existing primitive support it?
- [ ] Is it meaningfully different from existing objects?
- [ ] Does it deserve its own visual identity?
- [ ] Are we avoiding a generic universal Card abstraction?

Potential BloomOps semantic objects include:

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

## 19. Final Screen Acceptance

A major screen is not design-complete until:

- [ ] it passes all required responsive widths
- [ ] empty/loading/error states are designed
- [ ] keyboard and focus behavior are verified
- [ ] reduced motion is verified
- [ ] no-AI-slop review passes
- [ ] client/internal visibility is correct
- [ ] density matches the environment
- [ ] visual hierarchy is clear in under five seconds
- [ ] the screen remains comfortable for repeated daily use
