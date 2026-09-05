// Nested workspace pages. The list is flat in the database — each page just
// names its parent — and this turns it into a tree for the sidebar and a
// trail for the breadcrumbs.
//
// The rule that matters throughout: a page is never hidden because of a
// broken link. If its parent is missing, deleted, or the data has somehow
// formed a loop, the page surfaces at the top level instead of disappearing
// into a branch nobody can reach.

export const MAX_PAGE_DEPTH = 5;

// Pages whose parent no longer exists (trashed, deleted, never existed) are
// treated as top level. Losing a parent must never lose the child.
function parentOf(page, byId) {
  const pid = page?.parent_id;
  if (!pid || pid === page.id) return null;
  return byId.has(pid) ? pid : null;
}

// A page's ancestors, outermost first, not including the page itself. Also
// the loop detector: if following parents ever revisits a page, the chain is
// cyclic and we stop rather than spin.
export function ancestorsOf(pageId, pages) {
  const byId = new Map((pages || []).map((p) => [p.id, p]));
  const seen = new Set([pageId]);
  const chain = [];
  let cur = byId.get(pageId);
  while (cur) {
    const pid = parentOf(cur, byId);
    if (!pid || seen.has(pid)) break;
    seen.add(pid);
    const parent = byId.get(pid);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

// The breadcrumb trail: ancestors plus the page itself.
export function breadcrumbFor(pageId, pages) {
  const page = (pages || []).find((p) => p.id === pageId);
  if (!page) return [];
  return [...ancestorsOf(pageId, pages), page];
}

export function depthOf(pageId, pages) {
  return ancestorsOf(pageId, pages).length;
}

// Everything beneath a page, at any depth.
export function descendantIds(pageId, pages) {
  const kids = new Map();
  const byId = new Map((pages || []).map((p) => [p.id, p]));
  for (const p of pages || []) {
    const pid = parentOf(p, byId);
    if (!pid) continue;
    if (!kids.has(pid)) kids.set(pid, []);
    kids.get(pid).push(p.id);
  }
  const out = [];
  const stack = [...(kids.get(pageId) || [])];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue; // a loop can't make this run forever
    seen.add(id);
    out.push(id);
    stack.push(...(kids.get(id) || []));
  }
  return out;
}

// Can this page be dropped under that one? Guards the three ways nesting
// corrupts itself: a page inside itself, a page inside its own descendant
// (which detaches the whole branch from the tree), and burying something so
// deep the sidebar can't show it.
export function canMoveUnder(pageId, newParentId, pages) {
  if (!newParentId) return true; // moving to the top level is always fine
  if (pageId === newParentId) return false;
  if (descendantIds(pageId, pages).includes(newParentId)) return false;
  const parentDepth = depthOf(newParentId, pages);
  const branchDepth = deepestBelow(pageId, pages);
  return parentDepth + 1 + branchDepth < MAX_PAGE_DEPTH;
}

// How many levels sit below this page.
function deepestBelow(pageId, pages) {
  const byId = new Map((pages || []).map((p) => [p.id, p]));
  const kids = new Map();
  for (const p of pages || []) {
    const pid = parentOf(p, byId);
    if (!pid) continue;
    if (!kids.has(pid)) kids.set(pid, []);
    kids.get(pid).push(p.id);
  }
  let best = 0;
  const walk = (id, d, seen) => {
    if (seen.has(id)) return;
    seen.add(id);
    best = Math.max(best, d);
    for (const k of kids.get(id) || []) walk(k, d + 1, seen);
  };
  walk(pageId, 0, new Set());
  return best;
}

// The sidebar tree. Children keep the order the flat list already had, so
// whatever ordering the caller sorted by carries through.
export function buildPageTree(pages) {
  const list = pages || [];
  const byId = new Map(list.map((p) => [p.id, p]));
  const nodes = new Map(list.map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const p of list) {
    const pid = parentOf(p, byId);
    const node = nodes.get(p.id);
    // A cycle makes a branch unreachable from every root, so anything whose
    // ancestry loops gets pulled up to the top level rather than vanishing.
    if (pid && isReachable(p.id, list)) nodes.get(pid).children.push(node);
    else roots.push(node);
  }
  return roots;
}

// Does walking parents from here terminate at a top-level page?
function isReachable(pageId, pages) {
  const byId = new Map((pages || []).map((p) => [p.id, p]));
  const seen = new Set();
  let cur = byId.get(pageId);
  while (cur) {
    if (seen.has(cur.id)) return false;
    seen.add(cur.id);
    const pid = parentOf(cur, byId);
    if (!pid) return true;
    cur = byId.get(pid);
  }
  return true;
}
