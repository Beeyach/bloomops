// Public page sharing.
//
// One page is shared by token; everything nested under it is shared with it.
// That is the behaviour asked for, and it makes the blast radius of a mistake
// exactly one branch — so the rule this module enforces is that a token can
// reach its own page and its descendants and NOTHING else. Not the parent it
// hangs off, not its siblings, and never another workspace.
//
// The token is unguessable rather than the page id, so nobody can walk the
// URL space to find pages you did not share.

import { descendantIds } from './page-tree.mjs';

export function makeShareToken() {
  // 160 bits, url-safe. Long enough that guessing is not a strategy.
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Everything a given token is allowed to see.
//
// `pages` must already be scoped to a single workspace by the caller; this
// returns null when the token matches nothing so the route can 404 without
// distinguishing "wrong token" from "unshared page".
export function publicPagesFor(token, pages) {
  const t = String(token || '').trim();
  if (!t) return null;

  const all = (pages || []).filter((p) => !p.deleted_at);
  const root = all.find((p) => p.share_token && p.share_token === t);
  if (!root) return null;

  const ids = new Set([root.id, ...descendantIds(root.id, all)]);
  return {
    root,
    pages: all.filter((p) => ids.has(p.id)),
  };
}

// What the share dialog promises will become public. Shown BEFORE sharing so
// inheritance is a visible decision rather than something discovered later.
export function sharePreview(pageId, pages) {
  const all = (pages || []).filter((p) => !p.deleted_at);
  const page = all.find((p) => p.id === pageId);
  if (!page) return { page: null, subpages: [] };
  const ids = descendantIds(pageId, all);
  return {
    page,
    subpages: all.filter((p) => ids.includes(p.id)),
  };
}
