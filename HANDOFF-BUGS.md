# Open bug backlog

Written 2026-07-19. Findings came from a three-agent sweep; each was verified
against the code. Items are ordered by how much they hurt.

## Context you need first

**Cloudflare builds are intermittently failing, and it is not your code.**
Evidence: `6b2e297`, `efab049`, `d48fdaf` failed; `45ca506`, `a82e377`,
`e8234f2` passed. `e8234f2` contains everything `d48fdaf` had and passed, so
the content is not the trigger. Do NOT revert a change just because its build
failed. Push again first, then investigate.

Also: an earlier isolation attempt was invalid because the "revert" tree was
byte-identical to an already-built tree and probably hit the build cache. Any
future isolation experiment must use a tree that has never been built.

Build logs are not reachable from the CLI (wrangler lists deployments and
tails runtime logs only). They live in the Cloudflare dashboard. The REST API
would work with a `Cloudflare Pages:Read` token, which is not set locally.

`next-on-pages` cannot run on this Windows machine and there is no WSL, so CI
cannot be reproduced here.

## 1. TipTap never re-renders React (biggest one)

`components/RichEditor.jsx:151`

TipTap v3 does not re-render on transactions unless you opt in with
`shouldRerenderOnTransaction` or `useEditorState`. Neither appears anywhere in
the source.

Consequences:
- Every `active={editor.isActive(...)}` on the toolbar is stale. Select bold
  text, the B does not light up.
- The table buttons (`+ Col`, `+ Row`, `- Col`, `- Row`, `Delete table`) are
  gated on `editor.isActive('table')` and so **never appear at all**.
  `PageView.jsx:248` promises "click into a table and the same toolbar grows
  buttons for adding and deleting rows and columns." That has never worked.

Same root cause as two bugs already fixed: React not subscribed to state that
ProseMirror owns.

## 2. Two dead nav links

`components/LeadInbox.jsx:554` (`#army`) and `:632` (`#settings`).

`ProspectsApp.jsx:1423` listens for `popstate` only. A fragment anchor fires
`hashchange`, so `setView` never runs. Both views are valid; the links would
work if the listener existed. URL changes, screen does not.

## 3. Destructive actions fail silently

- `ProspectsApp.jsx:2212` `bulkDelete` — no `res.ok`, no `catch`. Rows vanish
  from the table, user believes they are in Trash, they return on next load.
- `TrashView.jsx:24-37` `act()` — no error handling at all, bound to Restore,
  Delete forever and Empty trash.
- `app/api/trash/route.js:50-54` — restore returns `{ok:true}` without checking
  `meta.changes`, so restoring an already-purged id reports success.

## 4. Clipboard buttons that claim success without checking

- `PageView.jsx:218` — public share link. `navigator.clipboard?.writeText(url)`
  unawaited, then `setCopied(true)` regardless.
- `WorkspaceView.jsx:157` and `ProspectDrawer.jsx:156` — same shape.

The correct pattern already exists at `LeadInbox.jsx:1273`.

## 5. Filters that hide what you were sent to see

- `ProspectsApp.jsx:1541` `openProspectRow` clears every filter except
  `quickLens`, though its comment claims otherwise. `resetFilters:2041` does
  clear it, which proves the omission.
- `ProspectsApp.jsx:2817` `onShowMissingCountry` sets the flag but not the
  stage/rating sets, so the card says "23, click to see them" and the table is
  empty.

## 6. Smaller, confirmed

- `ProspectsApp.jsx:3217` InfoModal shows a click-time snapshot, so a save
  succeeds but the modal still shows old text. `EmailSequenceModal:3209` shows
  the fix.
- `ProspectsApp.jsx:2258` `res.json()` before `res.ok` inside a FileReader
  callback — a bad CSV gives no preview and no error.
- `ProspectsApp.jsx:1757` CSV export drops `dueOnly`/`quickLens` and sends the
  `__none__` sentinel literally; `export/route.js:44` has no `IS NULL` branch,
  so unrated rows are silently missing from the export.
- `SettingsView.jsx:193` "Your name" saves to localStorage but is outside
  `dirty`, so Save stays greyed out even though it did save.
- `ClientsView.jsx:539` a file with a URL but blank label renders an anchor
  with no text — saved but unclickable forever.
- `EmojiPicker.jsx:36` "Set" with an empty input does nothing, never disabled.

## Unverified — check before acting

- `PublicReader.jsx:46` both `find` calls can return undefined and then
  `page.id` throws. Nobody confirmed the API can actually emit that shape.
- `PageView.jsx:147` `editorTools.current` is not reset when RichEditor
  remounts, so image/video buttons may hold a closure over a destroyed editor.
  Could not confirm this is user-reachable.

## Fixed today, for reference

- Slash menu `/` in the editor, plus callout, code block, highlight
- "View in Prospects" clears filters and scrolls to the row
- Contents rail links (relanded as `1cae92b` after being wrongly blamed)
- Promote route dropped 5 lead columns; column lists now shared in
  `lib/columns.mjs` with a test that fails on drift
- Add-prospect drawer stole focus on every keystroke
