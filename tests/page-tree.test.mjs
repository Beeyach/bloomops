import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageTree, breadcrumbFor, ancestorsOf, descendantIds, canMoveUnder, depthOf, MAX_PAGE_DEPTH,
} from '../lib/page-tree.mjs';

const pages = [
  { id: 'a', title: 'Clients', parent_id: null },
  { id: 'b', title: 'James Morgan', parent_id: 'a' },
  { id: 'c', title: 'Onboarding', parent_id: 'b' },
  { id: 'd', title: 'Guides', parent_id: null },
];

test('nests children under their parent', () => {
  const tree = buildPageTree(pages);
  assert.deepEqual(tree.map((n) => n.id), ['a', 'd']);
  assert.deepEqual(tree[0].children.map((n) => n.id), ['b']);
  assert.deepEqual(tree[0].children[0].children.map((n) => n.id), ['c']);
});

test('breadcrumb runs outermost first and ends on the page', () => {
  assert.deepEqual(breadcrumbFor('c', pages).map((p) => p.title), ['Clients', 'James Morgan', 'Onboarding']);
});

test('a top-level page has a breadcrumb of just itself', () => {
  assert.deepEqual(breadcrumbFor('a', pages).map((p) => p.id), ['a']);
});

test('breadcrumb for a page that does not exist is empty', () => {
  assert.deepEqual(breadcrumbFor('nope', pages), []);
});

test('a page whose parent was deleted surfaces at the top instead of vanishing', () => {
  // The parent is gone from the list entirely — trashed, say.
  const orphaned = [{ id: 'x', title: 'Stranded', parent_id: 'missing-parent' }];
  const tree = buildPageTree(orphaned);
  assert.deepEqual(tree.map((n) => n.id), ['x'], 'losing a parent must not lose the child');
});

test('descendants finds the whole branch', () => {
  assert.deepEqual(descendantIds('a', pages).sort(), ['b', 'c']);
  assert.deepEqual(descendantIds('c', pages), []);
});

test('a page cannot be moved inside itself', () => {
  assert.equal(canMoveUnder('a', 'a', pages), false);
});

test('a page cannot be moved inside its own descendant', () => {
  // This is the one that silently detaches a whole branch from the tree.
  assert.equal(canMoveUnder('a', 'c', pages), false);
});

test('a page can be moved under an unrelated page', () => {
  assert.equal(canMoveUnder('d', 'a', pages), true);
});

test('moving to the top level is always allowed', () => {
  assert.equal(canMoveUnder('c', null, pages), true);
});

test('nesting is capped so the sidebar cannot bury a page', () => {
  const deep = [];
  for (let i = 0; i < MAX_PAGE_DEPTH; i += 1) {
    deep.push({ id: `p${i}`, title: `p${i}`, parent_id: i === 0 ? null : `p${i - 1}` });
  }
  const loose = { id: 'loose', title: 'loose', parent_id: null };
  assert.equal(canMoveUnder('loose', `p${MAX_PAGE_DEPTH - 1}`, [...deep, loose]), false);
});

test('a cyclic parent chain does not hang and does not hide the pages', () => {
  // Two pages each claiming the other as parent. Nothing should be lost.
  const looped = [
    { id: 'l1', title: 'One', parent_id: 'l2' },
    { id: 'l2', title: 'Two', parent_id: 'l1' },
  ];
  const tree = buildPageTree(looped);
  const flat = [];
  const walk = (ns) => ns.forEach((n) => { flat.push(n.id); walk(n.children); });
  walk(tree);
  assert.equal(flat.length, 2, 'both pages must still be reachable');
  assert.deepEqual(ancestorsOf('l1', looped).length >= 0, true);
});

test('depth counts ancestors', () => {
  assert.equal(depthOf('a', pages), 0);
  assert.equal(depthOf('c', pages), 2);
});

test('a page claiming itself as parent is treated as top level', () => {
  const selfRef = [{ id: 's', title: 'Self', parent_id: 's' }];
  assert.deepEqual(buildPageTree(selfRef).map((n) => n.id), ['s']);
});
