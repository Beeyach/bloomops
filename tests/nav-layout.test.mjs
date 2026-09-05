import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultLayout,
  reconcile,
  moveTab,
  toggleCollapsed,
  renameSection,
  addSection,
  deleteSection,
} from '../lib/nav-layout.mjs';

const NAV = [
  { key: 'today', section: 'Pipeline' },
  { key: 'inbox', section: 'Pipeline' },
  { key: 'army', section: 'AI' },
  { key: 'settings', section: 'System' },
];
const SECTIONS = ['Pipeline', 'AI', 'System'];

test('buildDefaultLayout groups tabs by section in order', () => {
  const l = buildDefaultLayout(NAV, SECTIONS);
  assert.deepEqual(l.map((s) => s.id), ['Pipeline', 'AI', 'System']);
  assert.deepEqual(l[0].tabs, ['today', 'inbox']);
  assert.equal(l[0].builtin, true);
});

test('reconcile returns defaults when nothing stored', () => {
  const { sections } = reconcile(null, NAV, SECTIONS);
  assert.deepEqual(sections.map((s) => s.id), ['Pipeline', 'AI', 'System']);
});

test('reconcile drops unknown tabs and dedupes', () => {
  const stored = { sections: [{ id: 'Pipeline', title: 'Pipeline', tabs: ['today', 'today', 'ghost', 'inbox'] }] };
  const { sections } = reconcile(stored, NAV, SECTIONS);
  assert.deepEqual(sections[0].tabs, ['today', 'inbox']);
});

test('reconcile re-homes new built-in tabs the stored layout is missing', () => {
  // stored layout knows nothing about 'army' or 'settings'
  const stored = { sections: [{ id: 'Pipeline', title: 'Pipeline', tabs: ['today', 'inbox'] }] };
  const { sections } = reconcile(stored, NAV, SECTIONS);
  const aiSection = sections.find((s) => s.id === 'AI');
  const sysSection = sections.find((s) => s.id === 'System');
  assert.deepEqual(aiSection.tabs, ['army']);
  assert.deepEqual(sysSection.tabs, ['settings']);
});

test('reconcile keeps custom folders and their tabs', () => {
  const stored = {
    sections: [
      { id: 'custom-1', title: 'Mine', builtin: false, tabs: ['army'] },
      { id: 'Pipeline', title: 'Pipeline', tabs: ['today', 'inbox'] },
    ],
  };
  const { sections } = reconcile(stored, NAV, SECTIONS);
  const mine = sections.find((s) => s.id === 'custom-1');
  assert.deepEqual(mine.tabs, ['army']);
  // 'army' should NOT be duplicated back into AI
  assert.deepEqual(sections.find((s) => s.id === 'AI').tabs, []);
});

test('moveTab across folders, before a key', () => {
  const secs = buildDefaultLayout(NAV, SECTIONS);
  const next = moveTab(secs, 'army', 'Pipeline', 'inbox');
  assert.deepEqual(next.find((s) => s.id === 'Pipeline').tabs, ['today', 'army', 'inbox']);
  assert.deepEqual(next.find((s) => s.id === 'AI').tabs, []);
});

test('moveTab to end when beforeKey is null', () => {
  const secs = buildDefaultLayout(NAV, SECTIONS);
  const next = moveTab(secs, 'today', 'Pipeline', null);
  assert.deepEqual(next.find((s) => s.id === 'Pipeline').tabs, ['inbox', 'today']);
});

test('toggleCollapsed flips one folder', () => {
  const secs = buildDefaultLayout(NAV, SECTIONS);
  // System starts collapsed by default (progressive disclosure); toggling
  // opens it. (The Chapter 1 reset collapses Library/System/Utilities; the
  // fixture's AI section is no longer in that set and starts open.)
  assert.equal(secs.find((s) => s.id === 'System').collapsed, true);
  assert.equal(secs.find((s) => s.id === 'AI').collapsed, false);
  const next = toggleCollapsed(secs, 'System');
  assert.equal(next.find((s) => s.id === 'System').collapsed, false);
  assert.equal(next.find((s) => s.id === 'Pipeline').collapsed, false);
});

test('addSection then rename, then delete re-homes its tabs', () => {
  let secs = buildDefaultLayout(NAV, SECTIONS);
  secs = addSection(secs, 'Focus', () => 'custom-x');
  assert.equal(secs[secs.length - 1].title, 'Focus');
  secs = moveTab(secs, 'army', 'custom-x', null);
  secs = renameSection(secs, 'custom-x', 'My Focus');
  assert.equal(secs.find((s) => s.id === 'custom-x').title, 'My Focus');
  secs = deleteSection(secs, 'custom-x');
  assert.equal(secs.find((s) => s.id === 'custom-x'), undefined);
  // 'army' fell back into the first folder
  assert.ok(secs[0].tabs.includes('army'));
});

test('deleteSection refuses built-in folders', () => {
  const secs = buildDefaultLayout(NAV, SECTIONS);
  assert.deepEqual(deleteSection(secs, 'Pipeline'), secs);
});
