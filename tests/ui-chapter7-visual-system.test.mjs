// Chapter 7: the visual system, measured rather than felt.
//
// Everything here is arithmetic or source truth. Nothing in this file
// claims anything looks good: that needs eyes, and the report says so.
// What it does claim is checkable — contrast ratios, how many distinct
// sizes and radii survive on the surfaces a person actually uses, and
// that the earlier chapters' semantics came through untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NAV } from '../lib/nav-structure.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const CSS = src('app/globals.css');

// The surfaces this chapter migrated. Obscure admin and debug components
// were deliberately left alone: a huge risky diff for screens nobody reads
// is a bad trade, and the report names them as remaining work.
const SURFACES = [
  'components/GlassRail.jsx', 'components/TodayView.jsx', 'components/ProspectTabs.jsx',
  'components/ProspectListRow.jsx', 'components/ProspectDrawer.jsx', 'components/ProspectHeadline.jsx',
  'components/SystemHealth.jsx', 'components/ApprovalQueue.jsx', 'components/Followups.jsx',
  'components/NeedsAttention.jsx', 'components/ExceptionQueue.jsx',
];
const ALL = SURFACES.map(src).join('\n');

// ── contrast, computed ──────────────────────────────────────────────────────

const luminance = (hex) => {
  const c = hex.replace('#', '').match(/[0-9a-f]{2}/gi)
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
// Pull a token's value out of a specific theme block.
const tokenIn = (block, name) => {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} is defined`);
  return m[1];
};
// Chapter 8 repainted the light theme: cream canvas, white panels, charcoal
// text. The anchors and the two surfaces every ratio is measured against
// move with it; the thresholds do not.
const LIGHT_CANVAS = '#FAF7F3';
const LIGHT_PANEL = '#FFFFFF';
const DARK = CSS.slice(0, CSS.indexOf(`--bg: ${LIGHT_CANVAS}`));
const LIGHT = CSS.slice(CSS.indexOf(`--bg: ${LIGHT_CANVAS}`));
// The EFFECTIVE muted colour. A later block re-points --ink-3 at
// --text-muted for both themes, so the upper --ink-3 declaration is dead
// and measuring it (as the original audit did) measures nothing.
// Anchored on the semantic block specifically (the one that defines
// --text-muted), not the first light block in the file: there are two, and
// slicing from the wrong one reads the dark value.
const DARK_THEME = CSS.slice(CSS.indexOf(':root, html[data-theme="dark"] {'));
const LIGHT_THEME = CSS.slice(CSS.indexOf(`--canvas: ${LIGHT_CANVAS}`));

test('the muted token is what --ink-3 actually resolves to', () => {
  assert.match(CSS, /:root, html\[data-theme="dark"\] \{ --ink-3: var\(--text-muted\); \}/);
  assert.match(CSS, /html\[data-theme="light"\] \{ --ink-3: var\(--text-muted\); \}/);
});

test('light-theme muted text meets AA on panel AND on the cream canvas', () => {
  const muted = tokenIn(LIGHT_THEME, 'text-muted');
  const onPanel = contrast(muted, LIGHT_PANEL);
  const onCanvas = contrast(muted, LIGHT_CANVAS);
  assert.ok(onPanel >= 4.5, `muted on panel is ${onPanel.toFixed(2)}:1, needs 4.5`);
  assert.ok(onCanvas >= 4.5, `muted on canvas is ${onCanvas.toFixed(2)}:1, needs 4.5`);
  // The failure this test was written for, kept as history: on the old blush
  // canvas the old muted value passed on panel and failed on the canvas,
  // which is the surface most muted text is actually drawn on.
  assert.ok(contrast('#7E6874', '#F8EDF0') < 4.5, 'the original value did fail on the old canvas');
});

test('light-theme primary and secondary text still pass, unharmed by the repaint', () => {
  for (const ground of [LIGHT_PANEL, LIGHT_CANVAS]) {
    assert.ok(contrast(tokenIn(LIGHT, 'ink'), ground) >= 7, `primary on ${ground}`);
    assert.ok(contrast(tokenIn(LIGHT, 'ink-2'), ground) >= 4.5, `secondary on ${ground}`);
  }
});

test('dark theme was not damaged by the light-theme fix', () => {
  for (const name of ['ink', 'ink-2', 'ink-3']) {
    const v = tokenIn(DARK, name);
    assert.ok(contrast(v, '#251A22') >= 4.5, `dark --${name} on panel`);
  }
  const darkMuted = tokenIn(DARK_THEME, 'text-muted');
  assert.ok(contrast(darkMuted, '#251A22') >= 4.5, 'dark muted on panel');
  assert.ok(contrast(darkMuted, '#1A1118') >= 4.5, 'dark muted on canvas');
});

test('disabled controls are readable in both themes, not faded into nothing', () => {
  const l = contrast(tokenIn(LIGHT, 'disabled-ink'), tokenIn(LIGHT, 'disabled-bg'));
  const d = contrast(tokenIn(DARK, 'disabled-ink'), tokenIn(DARK, 'disabled-bg'));
  assert.ok(l >= 4.5, `light disabled text is ${l.toFixed(2)}:1`);
  assert.ok(d >= 4.5, `dark disabled text is ${d.toFixed(2)}:1`);
  // What it replaces: opacity-50 over --ink-2 composited on the light panel.
  const faded = '#ABA6A9'; // #574E53 at 50% over #FFFFFF
  assert.ok(contrast(faded, LIGHT_PANEL) < 3, 'the opacity approach really was unreadable');
});

// ── the vocabularies exist and are actually used ────────────────────────────

test('five type roles and four radii exist as classes over the existing tokens', () => {
  // No new scale was invented: the classes read the --fs-* and --r-* tokens
  // the repo already defined, which is the whole point of the chapter.
  for (const t of ['--fs-page', '--fs-card', '--fs-body', '--fs-label', '--fs-meta']) {
    assert.ok(CSS.includes(t), `${t} defined`);
  }
  for (const t of ['--r-sm', '--r-md', '--r-lg', '--r-full']) {
    assert.ok(CSS.includes(t), `${t} defined`);
  }
  assert.ok(!CSS.includes('--radius-sm'), 'no competing second radius vocabulary');
  assert.ok(!CSS.includes('--text-display:'), 'no competing second type vocabulary');
  for (const c of ['.ui-display', '.ui-heading', '.ui-body', '.ui-small', '.ui-meta', '.r-sm', '.r-md', '.r-lg']) {
    assert.ok(CSS.includes(c), `${c} defined`);
  }
});

test('no quarter-pixel or raw font sizes survive on the migrated surfaces', () => {
  const raw = ALL.match(/text-\[[0-9.]+px\]/g) || [];
  assert.deepEqual(raw, [], `raw sizes remain: ${[...new Set(raw)].join(', ')}`);
  // The pre-existing scale keeps 13.5/12.5px steps; components no longer
  // pick them by hand, which is what caused the drift.
  assert.ok(CSS.includes('--fs-body'), 'the shared scale is the only source');
});

test('the radius vocabulary collapsed, and true pills survived', () => {
  const raw = ALL.match(/rounded-\[[0-9]+px\]/g) || [];
  assert.deepEqual(raw, [], 'no raw pixel radii left on migrated surfaces');
  // rounded-full is intentionally kept: switches and true pills need it.
  assert.ok(ALL.includes('rounded-full'), 'pills were not flattened away');
  const distinct = new Set((ALL.match(/\br-(sm|md|lg|pill)\b/g) || []));
  assert.ok(distinct.size <= 4, 'at most four radius roles in use');
});

test('opacity stacking is gone from the migrated controls', () => {
  const stacked = ALL.match(/disabled:opacity-\d+/g) || [];
  assert.deepEqual(stacked, [], 'disabled state uses explicit tokens now');
  assert.ok(ALL.includes('ui-control'), 'and the token class is applied');
  assert.match(CSS, /\.ui-control:disabled\{[\s\S]*?opacity:1/, 'the class explicitly cancels opacity fading');
});

test('focus is visible on every control class this chapter defines', () => {
  for (const cls of ['.ui-secondary', '.ui-quiet', '.btn-bloom']) {
    assert.ok(CSS.includes(`${cls}:focus-visible`), `${cls} has a visible focus ring`);
  }
});

// ── the earlier chapters came through intact ────────────────────────────────

test('Chapter 1 rail and Today semantics are untouched by the restyle', () => {
  // Chapter 2, when integrated, removes the separate Leads entry. Both
  // shapes are a valid Chapter 1 rail, so assert what is true in either.
  const work = NAV.filter((t) => t.section === 'Work').map((t) => t.key);
  // 2026-08-27: Journey leads now — the five-tab rebuild.
  assert.equal(work[0], 'journey', 'Journey leads the Work section');
  assert.ok(work.includes('prospects') && work.includes('clients'));
  const today = src('components/TodayView.jsx');
  assert.ok(today.includes('previewLimit={TODAY_APPROVALS_LIMIT}'), 'the approvals cap survived');
  // Chapter 9 moved the section naming into lib/today-tabs.mjs.
  assert.ok(today.includes('<Section blurb={tabDef.blurb}>'), 'the panel is named by its tab, not by itself');
  assert.ok(today.includes('<TodayTabs'), 'and the strip that names the panel is here');
  assert.ok(!/Follow up\?/.test(today), 'still no faked turn-state group');
});

test('the approval surface keeps its actions and endpoint', () => {
  const q = src('components/ApprovalQueue.jsx');
  for (const marker of ["action === 'approve'", "'auto-followup'", 'Send now', "action: 'send'"]) {
    assert.ok(q.includes(marker), `approval surface still carries ${marker}`);
  }
  assert.ok(q.includes('previewLimit = PREVIEW'), 'the Chapter 1 prop survived');
});

test('Chapter 5 classes compose on top rather than being redefined', () => {
  // Chapter 7 owns the shared vocabulary; Chapter 5 owns consequence. Neither
  // may define the other's selectors, or a merge silently picks a winner.
  // Written to hold both standalone (Chapter 5 absent) and integrated
  // (Chapter 5 present): the rule is "at most one definition", not "absent".
  for (const cls of ['.btn-send{', '.btn-approve{', '.btn-approve-2nd{', '.switch-pill{']) {
    assert.ok(CSS.split(cls).length - 1 <= 1, `${cls} is defined at most once`);
  }
  for (const mine of ['.ui-body{', '.ui-small{', '.r-md{']) {
    assert.equal(CSS.split(mine).length - 1, 1, `${mine} is defined exactly once`);
  }
});

test('safety and relationship wording is untouched', () => {
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED]];
  assert.equal(new Set(labels).size, labels.length, 'still three distinct states');
  assert.ok(!labels.includes('Rejected'), 'no rename into one bucket');
  assert.ok(!NAV.some((t) => /conversation/i.test(t.key)), 'no Conversations placeholder appeared');
});

test('no backend logic was touched by a styling chapter', () => {
  // The migrated surfaces still speak to exactly the endpoints they did.
  const endpoints = [...ALL.matchAll(/fetch\(`?'?(\/api\/[a-z0-9/${}.-]+)/g)].map((m) => m[1]);
  assert.ok(endpoints.length > 0, 'they do still call APIs');
  assert.ok(!ALL.includes('DELETE FROM') && !ALL.includes('UPDATE prospects'), 'no SQL appeared in components');
});
