# BloomOps Pages System

P4 is now active after the owner paused further email work. The following inventory records the inherited implementation; current integration acceptance lives in [P4](phases/P4.md) and [BUILD_STATE](BUILD_STATE.md).

This document captures the existing Notion-like Pages implementation in `Beeyach/bloomtrack-pro` that BloomOps intends to preserve and adapt.

The actual code will be imported into BloomOps by A0 because BloomOps is seeded from the tracked `bloomtrack-pro` snapshot. Do not rebuild this system from scratch unless repository evidence shows a specific part must be replaced.

## Why Preserve It

The existing Pages system is already substantially more than a textarea. It includes a mature TipTap editor, block insertion, nested pages, public sharing, live database views, embeds, equations, responsive columns, breadcrumbs, and a reader experience.

BloomOps should use this as its freeform documentation layer for:

- SOPs
- briefs
- meeting notes
- welcome kits
- strategy
- brand guides
- internal documentation
- client documentation

It must not replace structured operational domains such as Clients, Onboarding, Actions, Content, Approvals, Projects, or Finance.

## Primary Source Files

### Editing and Page UI

- `components/RichEditor.jsx`
- `components/PageView.jsx`
- `components/BlockInsertMenu.jsx`
- `components/EmojiPicker.jsx`
- `components/EmbedView.jsx`
- `components/EquationNode.jsx`

### Structured Views Inside Pages

- `components/DatabaseViewNode.jsx`
- `lib/editor-extensions.mjs`

### Page Tree and Sharing

- `lib/page-tree.mjs`
- `lib/page-share.mjs`
- `components/PublicReader.jsx`
- `app/api/pages/route.js`
- `app/api/pages/[id]/route.js`
- `app/api/pages/[id]/share/route.js`
- `app/api/public/[token]/route.js`

### Public Safety / Rendering

- `lib/sanitize-public-html.mjs`
- `lib/public-embeds.mjs`
- `lib/public-equations.mjs`
- `lib/embeds.mjs`
- `lib/equations.mjs`

### Migrations

- `migrations/003_pages_prompts.sql`
- `migrations/018_page_nesting.sql`
- `migrations/019_page_sharing.sql`

### Existing Tests

- `tests/editor-nodes.test.mjs`
- `tests/embeds.test.mjs`
- `tests/equations.test.mjs`
- `tests/page-share.test.mjs`
- `tests/page-tree.test.mjs`
- `tests/page-url.test.mjs`
- `tests/public-embeds.test.mjs`

## Existing Editor Behavior

The current editor is TipTap-based and intentionally styled as a borderless Notion-like page canvas rather than a form field.

It supports:

- paragraph text
- Heading 1–4
- bulleted lists
- numbered lists
- task/to-do lists
- toggle lists
- blockquotes
- callouts
- code blocks
- dividers
- block equations
- tables
- images
- video / YouTube
- web embeds/bookmarks
- 2, 3, and 4-column layouts
- live database views
- inline formatting
- markdown paste conversion

Formatting is available through a selection bubble menu and block controls.

The existing block insert menu is reached from the block gutter rather than duplicating the editor with a second slash-command system.

## Custom Editor Nodes

`lib/editor-extensions.mjs` includes custom TipTap nodes with useful implementation decisions.

### Callout

A block container with a tone attribute.

Keyboard behavior allows an empty callout to be exited rather than trapping the cursor.

### Toggle

Implemented with real HTML `<details>/<summary>`.

That choice is important because toggles continue to work on a public shared page without requiring custom client-side JavaScript.

### Equation

Stores LaTeX source rather than persisted rendered markup.

Rendering is derived separately.

### Columns

Supports 2–4 columns.

The first current block is preserved when converting into columns.

The rendered structure uses CSS grid and can collapse on narrow screens.

### DatabaseView

Stores only view configuration in the page body, not the live records.

This is a critical security invariant.

A shared page must never serialize internal Clients, Actions, Content, Projects, or other operational records into `pages.body`.

## Existing Database Views

`components/DatabaseViewNode.jsx` currently provides four views:

- Board
- Calendar
- Gallery
- Table

Current data sources are:

- Prospects
- Clients

The component fetches current structured records at runtime rather than copying them into the page.

Current behavior includes:

- stage grouping
- stage filters
- sorting
- board drag/drop stage changes
- calendar drag/drop rescheduling
- optimistic updates with rollback
- source-specific columns and metadata

## BloomOps Database View Adaptation

Do not keep the Prospect source in BloomOps long term.

Likely BloomOps structured view sources:

- Clients
- Projects
- Actions
- Content

Potential later sources may include:

- Deliverables
- Requests

The database view remains a projection over canonical records.

It must not become a second editable copy of business data.

Client-visible/public Pages must not leak private operational rows simply because a database block exists in the stored HTML.

## Existing Page Experience

`PageView.jsx` currently provides:

- emoji/icon
- large editable page title
- borderless rich body
- autosave behavior
- saved-state feedback
- breadcrumbs
- nested-page navigation
- generated table of contents for longer pages
- page sharing controls

BloomOps should preserve the useful interaction model while restyling it into the Bloomlab-derived BloomOps design system later.

## Nested Pages

`lib/page-tree.mjs` models the database as a flat list with `parent_id` and builds the hierarchy in application code.

Important invariants:

- maximum depth is 5
- a page cannot be moved under itself
- a page cannot be moved under its own descendant
- missing/deleted parent does not make a child disappear
- cyclic/broken ancestry surfaces pages at top level rather than making them unreachable

Do not weaken these safeguards during migration.

## Existing Public Sharing

A page may have an unguessable share token.

Sharing a root page exposes that page plus its descendants, not:

- its parent
- its siblings
- unrelated pages
- other workspaces

The existing token is generated from 20 random bytes and encoded as a 40-character hexadecimal value.

Revoking sharing clears the token.

The public reader deliberately does not render the internal app shell.

It does not reveal workspace navigation or internal application structure.

## Public Rendering Safety

The public route:

1. validates token shape
2. resolves the token-owning workspace
3. limits the page set to the shared branch
4. strips the share token from the payload
5. sanitizes author-written HTML
6. upgrades allowlisted embeds
7. renders equations
8. returns `Cache-Control: no-store`

The sanitization-before-server-upgrade ordering is load-bearing.

Do not simplify public rendering into raw unsanitized `dangerouslySetInnerHTML`.

## BloomOps Sharing Decision

The old public-token feature can be preserved as a capability, but it is not the same thing as authenticated Client Portal access.

For BloomOps:

- client portal documents should normally follow workspace/client authorization
- public share links should remain explicit, narrowly scoped, and revocable
- a public page must never reveal internal-only database records
- visibility rules must integrate with BloomOps `internal / client / restricted` semantics before broad client use

Do not assume every client document should be publicly shareable.

## Schema Adaptation

The inherited Pages schema uses legacy workspace conventions.

When BloomOps formally migrates Pages into its new domain model, preserve the editor behavior while adapting metadata toward the canonical model.

Likely metadata:

- workspace_id
- client_id, nullable
- service_engagement_id, nullable
- project_id, nullable
- category
- visibility
- owner
- parent_id
- title
- icon/emoji
- body
- position
- sharing metadata

Do not stretch Pages into operational relational data.

## Styling Adaptation

The existing editor/page code uses Leadsthatbloom styling and class names.

When visually integrating it:

- preserve mature editor behavior first
- apply `docs/DESIGN_SYSTEM.md`
- apply `docs/DESIGN_CHECKLIST.md`
- avoid rewriting editor internals merely to change appearance
- keep client-facing Pages calm and readable
- preserve responsive column behavior
- preserve keyboard accessibility

## A0 Preservation Requirement

A0 should import these source files as part of the clean tracked snapshot.

After A0, verify at minimum that these anchors exist locally:

- `components/RichEditor.jsx`
- `components/PageView.jsx`
- `components/BlockInsertMenu.jsx`
- `components/DatabaseViewNode.jsx`
- `components/PublicReader.jsx`
- `lib/editor-extensions.mjs`
- `lib/page-tree.mjs`
- `lib/page-share.mjs`

Do not move or rewrite them during A0.

## Later Implementation Rule

When BloomOps reaches its Pages/SOP phase:

1. inspect this inherited system and its tests
2. retain the editor and tree behavior that still fits
3. adapt data ownership and authorization to BloomOps
4. adapt database sources to BloomOps canonical domains
5. restyle with BloomOps design system
6. add permission and public-sharing tests before considering the feature complete

The target is not a full Notion clone.

The target is BloomOps Pages: a strong freeform document system embedded inside a structured agency operations product.


## P4A implementation inventory

- RichEditor already implements slash insertion, rich marks/headings/lists/tasks, block controls, tables, callouts/toggles/columns, images, equations and embeds. Reuse its parser and serializer. The earlier description of gutter-only insertion is historical; the current code handles `/` on an empty paragraph.
- PageView owns legacy `/api/pages/:id/share` calls, inherited emoji selection and blur-save feedback. Main Bloomsi Pages composes RichEditor in its own wrapper instead of mounting those legacy services.
- Page tree helpers preserve depth/cycle/orphan invariants and remain ready for later hierarchy integration. P4A starts with the canonical page list and individual documents.
- A new opt-in change callback supports autosave without changing legacy blur-save defaults. Main Pages disables legacy operational view insertion/readers while retaining DatabaseView block configuration through the existing static node. Existing source documents and public routes are untouched.
- The new save session serializes revisions and retains a user/workspace/page-scoped tab recovery draft through failure or conflict. Another revision cannot be silently overwritten. Recovery is local to that browser tab, not a cross-device backup.
- Main Pages authoring initially uses current Owner/Admin membership, a canonical `bloomops_pages` table and guarded BloomOps APIs. Portal/public sharing, client visibility, attachments, copies/imports and operational projections are not enabled by this first slice.

## P4I canonical Work projections

Main Bloomsi Pages now uses the existing DatabaseView node with `source=actions`. Shared Table/Board/Calendar/Gallery presenters are extracted into `DatabaseViewPresentation.jsx`; legacy source fetching, writes and defaults remain in DatabaseViewNode. Bloomsi stores only layout/status-filter configuration, and explicitly loads up to50 currently authorized Actions through its page-scoped endpoint. The final query intersects Page permission with canonical Action access. Client page sharing does not reveal internal Actions. No operational writes are offered in the block.

Page editors save configuration through existing document revisions; readers use temporary controls and an isolated sanitized-markup host. The reader loads no TipTap runtime. Phone calendars show a date list; other source/invalid block configurations remain unavailable. Public token routes and existing legacy documents are unchanged.
