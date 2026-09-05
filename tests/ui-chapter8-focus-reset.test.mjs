// Chapter 8: focus, and light first.
//
// The previous chapters were structural and they were right. What they were
// not was *looked at*. Ary opened the assembled build and the verdict was
// blunt: "I can't immediately find what I'm looking for", "everything is in
// one place too much", "the fonts are too thin and small", "I'm starting to
// hate the overall color", "so much broken cramped layout", and — about the
// prospect drawer six chapters had carefully ordered — "just words with
// different fonts".
//
// So this chapter is not new capability. It is the pass that makes the
// structure legible: a light theme that is cream and white instead of mauve,
// a type scale with real gaps, four places in the rail instead of ten, action
// groups that look like groups, and a prospect page that is five places
// rather than one scroll.
//
// These tests pin what changed AND everything that must not have: no
// endpoint, no send path, no safety boundary, no automation invariant.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { NAV, SECTIONS, RAIL_PRIMARY, ALL_VIEWS, OFF_RAIL_VIEWS } from '../lib/nav-structure.mjs';
import { buildDefaultLayout, LAYOUT_KEY } from '../lib/nav-layout.mjs';
import { TABS, openingTab } from '../lib/prospect-tabs.mjs';
import { VIEW } from '../lib/prospect-action.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';
import { friendlyError, looksTechnical } from '../lib/friendly-errors.mjs';
import { approvalCard } from '../lib/approval.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const CSS = src('app/globals.css');
const SHELL = src('components/ProspectsApp.jsx');
const DRAWER = src('components/ProspectDrawer.jsx');

const px = (name) => {
  // Chapter 9 made every role a calc() over --fs-step, so this reads the
  // base of that expression, which is the Comfortable value.
  const m = CSS.match(new RegExp(`--${name}:\\s*(?:calc\\()?([0-9.]+)px`));
  assert.ok(m, `--${name} is defined`);
  return Number(m[1]);
};

// Contrast, computed rather than eyeballed.
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
const LIGHT = CSS.slice(CSS.indexOf('--bg: #FAF7F3'));
const tokenIn = (block, name) => {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} is defined`);
  return m[1];
};

// ── 1-3. Light is the default, and dark still works ───────────────────────

test('the boot script defaults to light and only dark is ever inferred', () => {
  const layout = src('app/layout.jsx');
  // The whole rule in one expression: an explicitly stored 'dark' wins,
  // everything else — including no stored value at all — is light.
  // Chapter 9 added the text size to the same script; the theme rule is
  // unchanged: an explicitly stored 'dark' wins, everything else is light.
  assert.match(layout, /localStorage\.getItem\('ltb_theme'\)/);
  assert.match(layout, /d\.dataset\.theme=t==='dark'\?'dark':'light'/);
  assert.ok(!/\?'light':'dark'/.test(layout), 'nothing still falls back to dark');
});

test('the theme hook agrees with the boot script in every branch', () => {
  const hook = src('components/useTheme.js');
  // Four decisions: SSR, the DOM attribute, storage, and React's initial
  // state. If any one of them still said dark, the first paint would flash.
  assert.match(hook, /if \(typeof document === 'undefined'\) return 'light';/);
  assert.match(hook, /dataset\.theme === 'dark' \? 'dark' : 'light'/);
  assert.match(hook, /getItem\('ltb_theme'\) === 'dark' \? 'dark' : 'light'/);
  assert.match(hook, /useState\('light'\)/);
});

test('dark mode is still a working choice, not a removed one', () => {
  const hook = src('components/useTheme.js');
  assert.match(hook, /const value = next === 'light' \? 'light' : 'dark'/, 'setTheme still accepts dark');
  assert.match(hook, /setTheme\(readTheme\(\) === 'dark' \? 'light' : 'dark'\)/, 'the toggle still goes both ways');
  assert.ok(CSS.includes(':root, html[data-theme="dark"] {'), 'and the dark palette is intact');
});

// ── 4-6. The palette left the mauve ───────────────────────────────────────

test('light is cream and white, not blush on blush', () => {
  assert.equal(tokenIn(LIGHT, 'bg'), '#FAF7F3', 'a cream canvas');
  assert.equal(tokenIn(LIGHT, 'panel'), '#FFFFFF', 'white panels');
  assert.equal(tokenIn(LIGHT, 'ink'), '#2B2529', 'charcoal text, not aubergine');
});

test('structure is neutral: lines, hovers and shadows stopped being pink', () => {
  const block = LIGHT.slice(0, LIGHT.indexOf('\n}'));
  for (const name of ['line', 'line-strong', 'hairline', 'hover-wash', 'hover-wash-soft']) {
    const m = block.match(new RegExp(`--${name}:\\s*rgba\\((\\d+), ?(\\d+), ?(\\d+)`));
    assert.ok(m, `--${name} is an rgba token`);
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    // The old values were rgba(150,80,110) and rgba(195,78,114): a red
    // channel far above the others is what a pink line is.
    assert.ok(r - b < 20 && r - g < 25, `--${name} is neutral, got rgb(${r},${g},${b})`);
  }
  assert.ok(!/--shadow-card:[^;]*rgba\(160, 90, 130/.test(LIGHT), 'the panel shadow is no longer rose-cast');
});

test('the aurora is a wash again, not a coat of paint', () => {
  const amb = LIGHT.slice(LIGHT.indexOf('--ambient:'), LIGHT.indexOf(';', LIGHT.indexOf('--ambient:')));
  const alphas = [...amb.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\)/g)].map((m) => Number(m[1]));
  assert.equal(alphas.length, 3, 'still three gradients');
  for (const a of alphas) assert.ok(a <= 0.08, `ambient layer at ${a} is still painting the canvas`);
});

test('every semantic hue clears AA on both light grounds, and none of them is the brand', () => {
  const semantic = { success: null, warning: null, danger: null };
  const themed = CSS.slice(CSS.indexOf('--canvas: #FAF7F3'));
  for (const name of Object.keys(semantic)) semantic[name] = tokenIn(themed, name);
  const brand = tokenIn(themed, 'brand-primary');
  for (const [name, hex] of Object.entries(semantic)) {
    for (const ground of ['#FFFFFF', '#FAF7F3']) {
      assert.ok(contrast(hex, ground) >= 4.5, `${name} on ${ground} is ${contrast(hex, ground).toFixed(2)}:1`);
    }
    assert.notEqual(hex, brand, `${name} must not be the accent colour`);
  }
});

// ── 7-9. Type that reads as a hierarchy ───────────────────────────────────

test('the type scale got bigger everywhere and nothing readable is under 13px', () => {
  // Chapter 9 raised the scale again and made every role a calc() over
  // --fs-step, which is what the Text size preference moves. `px` reads the
  // base of that expression, which is the Comfortable value.
  const scale = ['fs-page', 'fs-section', 'fs-card', 'fs-body', 'fs-label', 'fs-meta', 'fs-table'].map(px);
  for (const v of scale) assert.ok(v >= 13, `${v}px is below the 13px floor`);
  assert.ok(px('fs-page') >= 30, 'display is 30px or more');
  assert.ok(px('fs-card') >= 18, 'headings are at least 18px');
  assert.ok(px('fs-body') >= 15, 'body is at least 15px');
});

test('the roles are strictly ordered, and the top of the scale is not flat', () => {
  const order = ['fs-page', 'fs-section', 'fs-card', 'fs-body', 'fs-label', 'fs-meta'].map(px);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] < order[i - 1], `${order[i]}px must be smaller than ${order[i - 1]}px`);
  }
  // Display → heading → body is where hierarchy is actually read; those gaps
  // are now 9px and 3px rather than 13px and 1.5px.
  assert.ok(order[0] - order[2] >= 10, 'display and heading are clearly different sizes');
  assert.ok(order[2] - order[3] >= 3, 'heading and body are clearly different sizes');
});

test('the roles that carry meaning ask for weight, not just size', () => {
  assert.match(CSS, /\.ui-heading\{[^}]*font-weight:600/);
  assert.match(CSS, /\.ui-body\{[^}]*font-weight:450/);
  assert.match(CSS, /\.ui-small\{[^}]*font-weight:450/);
});

// ── 10-12. Four places and a drawer ───────────────────────────────────────

test('the rail is four destinations plus one collapsed More', () => {
  assert.deepEqual(SECTIONS, ['Work', 'More']);
  assert.deepEqual(RAIL_PRIMARY, ['journey', 'today', 'prospects', 'clients', 'health']);
  const layout = buildDefaultLayout(NAV, SECTIONS);
  assert.equal(layout.length, 2, 'two folders, not four');
  assert.equal(layout.find((s) => s.id === 'Work').collapsed, false);
  // Ary's call, 2026-08-18: More opens expanded and remembers her choice.
  assert.equal(layout.find((s) => s.id === 'More').collapsed, false);
});

test('nothing was deleted to get there: every view still resolves', () => {
  for (const key of ['today', 'prospects', 'clients', 'health', 'stats', 'settings', 'trash',
    'workspace', 'start', 'army', 'inbox', 'guide-automation', 'guide-agents', 'guide-sourcing',
    'prompts', 'handsoff']) {
    assert.ok(ALL_VIEWS.includes(key), `${key} is a preserved route`);
    assert.ok(SHELL.includes(`view === '${key}'`), `the shell still renders ${key}`);
  }
  assert.ok(OFF_RAIL_VIEWS.every((v) => !NAV.some((t) => t.key === v)), 'off-rail views have no rail entry');
  assert.equal(LAYOUT_KEY, 'ltb_nav_layout_v4', 'bumped when More became open-by-default');
});

test('the rail rows are bigger and have room, and the label is a body size', () => {
  const rail = src('components/GlassRail.jsx');
  // Chapter 8 went py-2.5/gap-3 and Ary called the result "too big of
  // spacing" on the real screen — the rows keep real padding, one notch
  // tighter, and the type stays a body size.
  assert.match(rail, /gap-2\.5 px-3 py-2/, 'rows have real padding without the sprawl');
  assert.match(rail, /w-\[19px\] h-\[19px\]/, 'and a 19px icon, up from 17');
  assert.match(rail, /truncate ui-body font-semibold/, 'the label is a body size, not a caption');
  assert.ok(!/text-\[[0-9.]+px\]/.test(rail), 'no raw sizes crept back in');
});

// ── 13-15. Today reads as groups ──────────────────────────────────────────

test("Today's groups are cards with their own edge, header and count", () => {
  const section = src('components/TodaySection.jsx');
  assert.match(section, /<section className="mt-4 border border-line-strong r-lg bg-panel shadow-card/);
  // The band is still how a titled group starts — Follow-ups and Needs
  // attention both still ask for one. Chapter 12 made it conditional so the
  // Today panel, which sits directly under a tab carrying the same title and
  // the same count, can skip saying both a third and fourth time.
  assert.match(section, /\{title \? \(/, 'the header band is conditional');
  assert.match(section, /border-b border-line bg-surface-subtle/, 'and is still a band when there is a title');
  assert.match(section, /r-pill px-2\.5 py-0\.5/, 'the count sits in the corner, not in the heading text');
  // All four of Today's groups wear it, including the two that used to draw
  // their own loose heading and made the page alternate card / not-card.
  for (const rel of ['components/TodayView.jsx', 'components/Followups.jsx', 'components/NeedsAttention.jsx']) {
    assert.match(src(rel), /from '\.\/TodaySection'/, `${rel} uses the shared group card`);
  }
});

test('the blurb is per group and never per row', () => {
  const today = src('components/TodayView.jsx');
  const section = src('components/TodaySection.jsx');
  assert.equal((section.match(/<p [^>]*>\{blurb\}<\/p>/g) || []).length, 1,
    'exactly one place renders the blurb, in the group header');
  const block = today.slice(today.indexOf('function Block('), today.indexOf('const smallBtn'));
  assert.ok(!/blurb/.test(block), 'a row block carries no prose of its own');
});

test('Today still holds only human work, and empty blocks still vanish', () => {
  const today = src('components/TodayView.jsx');
  for (const passive of ['SystemHealth', 'ShadowPanel', 'SendingSummary', 'HeldPanel', 'StatsView', 'CreditsBadge']) {
    assert.ok(!today.includes(passive), `${passive} is not on Today`);
  }
  assert.match(today, /function Block\(\{[^}]*\}\) \{\s*if \(!count\) return null;/, 'a zero-count block draws nothing');
});

// ── 16-18. The prospect page is five places ───────────────────────────────

test('the drawer is a tab strip, and it opens on Overview', () => {
  assert.match(DRAWER, /role="tablist"/);
  for (const t of ['overview', 'email', 'evidence', 'activity', 'more']) {
    assert.ok(DRAWER.includes(`{ key: '${t}',`), `${t} is a tab`);
    assert.ok(DRAWER.includes(`tab === '${t}'`), `${t} has a panel`);
  }
  assert.match(DRAWER, /useState\(initialTab \|\| 'overview'\)/);
});

test('the editable record and everything technical live under More', () => {
  const more = DRAWER.slice(DRAWER.indexOf("tab === 'more'"));
  for (const marker of ['The record</SectionHead>', 'Contact</SectionHead>', '<SystemDetails']) {
    assert.ok(more.includes(marker), `${marker} is inside More`);
  }
  // And not on the surface a prospect opens on.
  const overview = DRAWER.slice(DRAWER.indexOf("tab === 'overview'"), DRAWER.indexOf("tab === 'email'"));
  assert.ok(!overview.includes('The record'), 'Overview is not a form');
});

test('identity is a bordered block above the tabs, and renders for a real person', async () => {
  const head = src('components/ProspectHeadline.jsx');
  assert.match(head, /r-lg border border-line-strong bg-surface-subtle px-4 py-3\.5/, 'a real container');
  // Pinned above the strip: the tabs are declared after the headline.
  assert.ok(DRAWER.indexOf('<ProspectHeadline') < DRAWER.indexOf('<DrawerTabs'), 'identity outranks the tabs');
  const Headline = (await import('../components/ProspectHeadline.jsx')).default;
  const html = renderToString(React.createElement(Headline, {
    prospect: { id: 4, name: 'Mary', business_name: 'Peak Development', stage: 'Email 2', do_not_contact: 0, unsubscribed: 0 },
  }));
  assert.match(html, /Peak Development/);
});

// ── 19-20. Words people use ───────────────────────────────────────────────

test('Not this offer is gone, and the states it sat between stay distinct', () => {
  assert.equal(REL_LABEL[REL.NO_TO_THIS_OFFER], 'Not interested');
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED], REL_LABEL[REL.WON]];
  assert.equal(new Set(labels).size, labels.length, 'four states, four different words');
  for (const rel of ['lib/relationship.mjs', 'components/DeferralResolver.jsx']) {
    assert.ok(!src(rel).includes('Not this offer'), `${rel} no longer says it`);
  }
});

test('no internal enum reaches a label anywhere in the vocabulary', () => {
  for (const v of Object.values(REL_LABEL)) {
    assert.ok(!/^[A-Z_]+$/.test(v), `"${v}" is an enum, not a sentence`);
  }
});

// ── 21-22. System speaks English ──────────────────────────────────────────

test('every failure a person meets has a short human form', () => {
  const cases = [
    ['page.goto: net::ERR_NAME_NOT_RESOLVED', 'Domain does not resolve'],
    ['connect ETIMEDOUT 104.21.0.1:443', 'Website timed out'],
    ['connect ECONNREFUSED 127.0.0.1:80', 'Website refused the connection'],
    ['Request failed with status code 403', 'Website blocked the check'],
    ['Just a moment... cloudflare challenge', 'Website showed a bot challenge'],
  ];
  for (const [raw, expected] of cases) {
    const f = friendlyError(raw);
    assert.equal(f.short, expected, `"${raw}" reads as "${f.short}"`);
    assert.ok(!looksTechnical(f.short), `"${f.short}" still reads like a log line`);
    assert.equal(f.raw, raw, 'the raw text is kept, not discarded');
  }
});

test('System health no longer prints a raw provider error on any line', () => {
  const health = src('components/SystemHealth.jsx');
  assert.match(health, /friendlyError\(h\.error\)\.short/, 'the attempt list is translated');
  assert.ok(!/\$\{h\.error\}/.test(health), 'nothing interpolates the raw string into visible text');
  // Except behind the disclosure, which is where it belongs.
  assert.match(health, /Technical details<\/summary>/);
});

// ── 23. Prospects opens on urgency ────────────────────────────────────────

test('the lists are ordered by urgency and All is last', () => {
  assert.equal(TABS[0].id, VIEW.ATTENTION);
  assert.equal(TABS[TABS.length - 1].id, VIEW.ALL);
  assert.equal(TABS.length, 6, 'same six questions, reordered');
});

test('the opening list is the first one with anything in it, and falls back to All', () => {
  assert.equal(openingTab({ [VIEW.ATTENTION]: 3, [VIEW.REPLIED]: 9 }), VIEW.ATTENTION);
  assert.equal(openingTab({ [VIEW.ATTENTION]: 0, [VIEW.REPLIED]: 9 }), VIEW.REPLIED);
  assert.equal(openingTab({ [VIEW.FINISHED]: 622 }), VIEW.ALL, 'a finished-only workspace is not urgent');
  assert.equal(openingTab({}), VIEW.ALL);
});

test('the opening pick runs once and a deliberate choice freezes it', () => {
  assert.match(SHELL, /const pickedTab = useRef\(false\);/);
  assert.match(SHELL, /if \(pickedTab\.current\) return;/);
  assert.equal((SHELL.match(/pickedTab\.current = true/g) || []).length, 5,
    'set by the effect itself, a tab click, the cross-view walk, a hash route, and the jump to a row (which forces All)');
});

// ── Clients ───────────────────────────────────────────────────────────────

test('Clients splits by the only question it answers, and hides an empty group', () => {
  const cv = src('components/ClientsView.jsx');
  assert.match(cv, /title: 'Needs onboarding', list: awaitingSetup/);
  assert.match(cv, /title: 'Active', list: onboarded/);
  assert.match(cv, /\.filter\(\(g\) => g\.list\.length > 0\)/, 'an empty group is not drawn');
  // An empty checklist is setup not started, which is the whole point.
  assert.match(cv, /\(c\.onboarding \|\| \[\]\)\.length === 0\s*\n?\s*\|\| \(c\.onboarding \|\| \[\]\)\.some\(\(st\) => !st\.done\)/);
});

test('Clients and the Hive joined the visual system', () => {
  for (const rel of ['components/ClientsView.jsx', 'components/ArmyPanel.jsx']) {
    const s = src(rel);
    assert.deepEqual(s.match(/text-\[[0-9.]+px\]/g), null, `${rel} has raw font sizes`);
    assert.deepEqual(s.match(/rounded-\[[0-9]+px\]/g), null, `${rel} has raw radii`);
  }
});

// ── Nothing dangerous moved ───────────────────────────────────────────────

test('no endpoint changed on any surface this chapter touched', () => {
  const q = src('components/ApprovalQueue.jsx');
  assert.deepEqual([...new Set([...q.matchAll(/fetch\('([^'?]+)/g)].map((m) => m[1]))], ['/api/outreach']);
  assert.ok(!/action: 'send'/.test(DRAWER), 'the drawer still cannot send email');
});

test('the hard-stop boundary still suppresses every next action', async () => {
  const Headline = (await import('../components/ProspectHeadline.jsx')).default;
  for (const flag of ['do_not_contact', 'unsubscribed']) {
    const html = renderToString(React.createElement(Headline, {
      prospect: { id: 1, name: 'X', business_name: 'X Co', stage: 'Email 2', do_not_contact: 0, unsubscribed: 0, [flag]: 1 },
    }));
    const text = String(html).replace(/<[^>]*>/g, ' ');
    assert.match(text, /no further contact/);
    assert.ok(!/Next/.test(text), `${flag} still renders no next-action box`);
  }
});

test('the package-level automation invariant is exactly as it was', () => {
  const base = {
    status: 'APPROVED', email_subject: 'S', email_body: 'B', priority_band: 'P2',
    followups: [{ step: 2, subject: 'S2', body: 'B2' }], allowed_length: 2, sequence_max_step: 2,
  };
  const sent = { rating: '💙', emails_sent: 1 };
  assert.ok(approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, sent, { autoSendFollowups: true }).automation);
  assert.equal(approvalCard({ ...base, sequence_approved: 0, auto_followup_approved: 0 }, sent, { autoSendFollowups: true }).automation, null);
  assert.equal(approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, { rating: '💙', emails_sent: 0 }, { autoSendFollowups: true }).automation, null);
});

test('the stage vocabulary and the send guard were not touched', () => {
  assert.ok(/export const STAGES = \[[^\]]*'Rejected'/s.test(src('lib/db.js')));
  assert.match(src('lib/send-guard.mjs'), /approvalFingerprint/);
});
