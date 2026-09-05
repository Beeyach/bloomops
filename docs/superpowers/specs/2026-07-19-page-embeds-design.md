# Page embeds — design

Written 2026-07-19.

## Problem

Pages support images and YouTube today. We want the rest of what a Notion page
can hold: Loom walkthroughs, Google Docs, Figma files, Maps, Calendly, and
Instagram and Facebook posts for showing clients campaign results.

The complication is `/p/<token>`. Public pages are the only unauthenticated
read in the app, and `PublicReader.jsx:88` renders `page.body` straight through
`dangerouslySetInnerHTML`. Whatever an editor node stores becomes live HTML on a
link we send to clients. Today ProseMirror's schema is the only thing keeping
that safe — it silently drops anything it does not recognise. An embed feature
that stores raw markup would walk around that protection.

So the design question is not "how do we render an iframe". It is "what is safe
to persist, and who is allowed to turn it into an iframe".

## Goals

- One embed block covering many providers, inserted by pasting a URL
- Named, public-safe providers render live on public pages
- Arbitrary URLs work inside the app, never on a public page
- The allowlist lives in one place and cannot drift between editor and server

## Non-goals

- Notion "Database" blocks. That is schemas, views, filters and relations, and
  it overlaps the prospects table we already have.
- Migrating YouTube. `@tiptap/extension-youtube` works, has its own paste rule,
  and folding it in would mean rewriting existing page bodies for no visible
  gain.
- File upload. That needs R2, which is not bound in `wrangler.toml`. Separate
  piece of work, tracked elsewhere.
- Auto-resizing embeds to their content height. Not possible for a sandboxed
  cross-origin frame without letting the provider post messages to us.

## Decisions

### Never persist an iframe

The node stores an inert div with the data needed to build an embed, and a
plain link as its visible fallback:

```html
<div data-embed data-provider="loom" data-url="https://www.loom.com/share/abc">
  <a href="https://www.loom.com/share/abc" rel="noopener nofollow">loom.com/share/abc</a>
</div>
```

Renderers *add* capability to this; nothing has to remember to strip anything.
If the public transform breaks, is removed, or throws, the page degrades to a
list of links rather than rendering third-party content. Fail-safe rather than
fail-open.

The anchor is not decoration. It is the fallback when nothing upgrades the
block, the provenance line for a reader, and the accessible representation.

Rejected alternative: persist a real `<iframe>` and strip non-allowlisted ones
server-side. Fewer moving parts in the editor, but safety then depends on a
strip step running correctly on every path, and `PublicReader` already renders
body HTML raw. We did not want a second thing that must not be forgotten.

Rejected alternative: hydrate client-side in `PublicReader` only. Cheapest, and
safe enough because the client builds `src` from a fixed template — but it puts
the boundary in the browser and flashes link-then-iframe on every public page.

### One node, one registry

A single `embed` node with a `provider` attribute, not a node type per
provider. Providers differ only in how a URL maps to an embed URL and whether
they are allowed in public — data, not behaviour.

`lib/embeds.mjs` holds that data and is imported by both the editor and the
public route, so the allowlist cannot drift. This mirrors `lib/columns.mjs`,
which exists because the promote route and the table disagreed about columns.

## Provider registry

`lib/embeds.mjs`. Pure — no DOM, no fetch, no platform globals.

```
matchEmbed(rawUrl, selfHost) → { provider, url, embedUrl, aspect } | null
embedUrlFor(provider, url)   → string | null
isPublicSafe(provider)       → boolean
```

Each entry carries `id`, `label`, `test`, `toEmbedUrl`, `publicSafe`, and
exactly one of `aspect` (a ratio, for providers with a known shape) or `height`
(a pixel value, for providers whose content height varies and which therefore
scroll internally). A provider carrying both, or neither, is a test failure.

`toEmbedUrl` is `null` for providers we can recognise but cannot frame. That is
the single flag meaning "link only" and it drives both the paste rule and the
public transform.

Validation is total and lives here: must parse as a URL, must be `https:`, must
not be `selfHost`, must match a known provider or fall through to `generic`.

| Provider | Public | Embed URL | Sizing |
|---|---|---|---|
| Loom | yes | `loom.com/embed/{id}` | 16/9 |
| Google Docs / Sheets / Slides | yes | `/preview` form | 4/3 |
| Google Maps | yes | `google.com/maps/embed?...` | 4/3 |
| Figma | yes | `figma.com/embed?url=...` | 16/9 |
| Calendly | yes | original URL | `height` 700 |
| Instagram | yes | `instagram.com/p/{code}/embed` | `height` 640, scrolls |
| Facebook post | yes | `facebook.com/plugins/post.php?href=...` | `height` 640, scrolls |
| Facebook video | yes | `facebook.com/plugins/video.php?href=...` | 16/9 |
| X / Twitter | no | `toEmbedUrl: null` | link only |
| `generic` | no | original URL | 16/9, app only |

X has no iframe endpoint. Embedding it means loading `platform.twitter.com`
script, which cannot be sandboxed and would undermine the whole design. Its
`toEmbedUrl` is `null`, so it never becomes a block — a pasted X link stays
ordinary link text.

Heights are starting values, tunable once real posts are on screen.

Instagram and Facebook embed public posts only. A private account or a
restricted post renders an error inside the frame; the fallback link is what
saves that case.

## Rendering

**App** — a React NodeView (`components/EmbedView.jsx`) builds the iframe from
`embedUrlFor`. Generic embeds render live here.

**Public** — `HTMLRewriter` in `app/api/public/[token]/route.js` walks
`div[data-embed]`, reads `data-provider` and `data-url`, and calls
`setInnerContent(iframeHtml, { html: true })` only when `isPublicSafe`.
Non-safe providers are left untouched and render as their fallback link. The
transform wraps each page body in a `Response`, rewrites, and reads the text
back. It is applied in the existing `clean` map at `route.js:47`.

If the transform throws, the untransformed body is returned.

### Sandbox

```
sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
referrerpolicy="no-referrer" loading="lazy"
```

`allow-same-origin` together with `allow-scripts` is normally the combination to
avoid, because framed content sharing the parent's origin can remove its own
sandbox. That risk does not apply here: `matchEmbed` rejects our own host, and a
public embed must match a named third-party provider. The allowlist is what makes
this safe, and the permission is required for Loom, Docs and Instagram to work
at all — they need their own storage.

`allowfullscreen` is set for video providers only.

## Insertion

Auto-convert on paste when **both**: the URL matches a named provider that has a
non-null `toEmbedUrl`, and it is pasted onto an empty paragraph.

Both conditions matter. Without the provider check, every pasted link becomes an
embed. Without the empty-paragraph check, pasting a link mid-sentence explodes
into a block. Requiring `toEmbedUrl` keeps X from converting into a block that
could only ever show a link — which is what it already was as text.

Generic embeds are reachable only from the toolbar button, where the intent is
explicit.

This extends the existing `handlePaste` in `RichEditor.jsx`, ahead of the
markdown branch. YouTube keeps its own paste rule and is not touched.

## Error handling

| Case | Behaviour |
|---|---|
| Pasted URL matches nothing | No conversion, stays as text |
| Non-https, or our own host | Rejected by `matchEmbed`, no node inserted |
| Toolbar button, bad URL | Inline message, nothing inserted |
| Provider fails to load | Provider's own error inside the frame; fallback link visible |
| `HTMLRewriter` throws | Body returned untransformed — link cards |

## Testing

`tests/embeds.test.mjs`, `node:test`, matching the existing suite.

1. Each provider: a matching URL parses, a near-miss does not
2. `http:`, `javascript:` and own-host are all rejected
3. Unknown https URL resolves to `generic`
4. Drift guard: nothing is `publicSafe` without a working `toEmbedUrl`,
   `generic` is never `publicSafe`, and every provider carries exactly one of
   `aspect` or `height`
5. Every `embedUrlFor` result is https and begins with its provider's expected
   host prefix

Test 5 is the security regression test. It is what stops a later edit turning a
provider template into an arbitrary-URL hole.

## Files

| File | Change |
|---|---|
| `lib/embeds.mjs` | new — registry and validation |
| `tests/embeds.test.mjs` | new |
| `lib/editor-extensions.mjs` | add `Embed` node beside `Callout` |
| `components/EmbedView.jsx` | new — React NodeView |
| `components/RichEditor.jsx` | register node, paste branch, toolbar button |
| `app/api/public/[token]/route.js` | HTMLRewriter transform |
| `app/globals.css` | embed styling, app and `.pub-body` |

Roughly two days, after the spike below.

## Risks to resolve during implementation

**Instagram and Facebook endpoints.** Task one is a spike: paste one real IG URL
and one real FB URL into a sandboxed iframe and confirm both render today.
`plugins/post.php` is documented and stable; Instagram's `/embed` is less so,
and Meta has tightened related APIs before. Half an hour, and it de-risks the
two providers that prompted this work. Build the registry only after it passes.

**HTMLRewriter and fragments.** Unverified whether transforming an HTML fragment
returns it clean or wrapped in `<html><body>`. If it wraps, the transform needs
an unwrap step. Verify before building the rest of the public path.

**Third-party cookies on public pages.** A shared page carrying Meta or Google
embeds loads third-party content in the client's browser. Worth knowing given
client-facing use; not a blocker, and out of scope here.
