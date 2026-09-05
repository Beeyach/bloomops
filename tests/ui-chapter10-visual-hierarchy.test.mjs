// Chapter 10: hierarchy that is not made of font sizes.
//
// Nine chapters raised the type scale and the answer to "what is this row"
// was still "read the sentence". Chapter 10 stops adjusting fonts and gives
// the app the other four tools instead: one icon per concept, five colour
// families, compact pills, and containers.
//
// The rule these tests exist to protect is the one that is easiest to lose:
// colour is never the only signal. Every state carries an icon and a word as
// well, so a greyscale screenshot and a colour-blind reader lose nothing.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { TONE, TONES, ICON, KIND, TODAY_TAB_KIND, kindOf, iconOf, toneOf, shortDuration } from '../lib/semantic.mjs';
import { TODAY_TABS } from '../lib/today-tabs.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';
import { approvalCard } from '../lib/approval.mjs';
import { friendlyError } from '../lib/friendly-errors.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const CSS = src('app/globals.css');
const ICONS = src('components/Icons.jsx');
const HIVE = src('components/ArmyPanel.jsx');
const DRAWER = src('components/ProspectDrawer.jsx');
const TODAY = src('components/TodayView.jsx');

const px = (name) => {
  const m = CSS.match(new RegExp(`--${name}:\\s*(?:calc\\()?([0-9.]+)px`));
  assert.ok(m, `--${name} is defined`);
  return Number(m[1]);
};
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
// Composite a tint over its ground, which is what a pill background is.
const over = (hex, alpha, ground) => {
  const f = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const g = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
  return '#' + f.map((v, i) => Math.round(v * alpha + g[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
};
const toneBlock = (theme) => {
  const start = CSS.indexOf('SEMANTIC FAMILIES');
  const rest = CSS.slice(start);
  const marker = theme === 'light' ? 'html[data-theme="light"] {' : ':root, html[data-theme="dark"] {';
  const from = rest.indexOf(marker);
  return rest.slice(from, rest.indexOf('\n}', from));
};
const toneInk = (theme, family) => {
  const m = toneBlock(theme).match(new RegExp(`--tone-${family}-ink:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--tone-${family}-ink in ${theme}`);
  return m[1];
};

// ── 1. The Chapter 9 scale is untouched ───────────────────────────────────

test('the type scale is exactly what Chapter 9 left, and still adjustable', () => {
  // These are the base numbers each role is written against. What the pixel
  // review changed is the step the app starts on (now -1, Compact), not the
  // scale itself — Comfortable still resolves to exactly these.
  assert.equal(px('fs-page'), 32);
  assert.equal(px('fs-section'), 24);
  assert.equal(px('fs-card'), 19);
  assert.equal(px('fs-body'), 16);
  assert.equal(px('fs-label'), 15);
  assert.equal(px('fs-meta'), 14);
  assert.match(CSS, /html\[data-textsize="comfortable"\] \{ --fs-step: 0px; \}/);
  assert.match(CSS, /html\[data-textsize="large"\]\s*\{ --fs-step: 2px; \}/);
});

// ── 2-5. One icon per concept, five colours, and never colour alone ───────

test('every concept in the vocabulary has an icon that actually exists', () => {
  const defined = new Set([...ICONS.matchAll(/(?:^|\n)\s*'?([a-zA-Z0-9-]+)'?:\s*</g)].map((m) => m[1]));
  for (const [name, glyph] of Object.entries(ICON)) {
    assert.ok(defined.has(glyph), `${name} → "${glyph}" is not in the icon library`);
  }
  for (const [name, k] of Object.entries(KIND)) {
    assert.ok(defined.has(k.icon), `kind ${name} → "${k.icon}" is not in the icon library`);
  }
});

test('the same meaning gets the same icon everywhere', () => {
  // A reply is a message whether it is a Today row, a drawer tab or a
  // timeline entry — the map is the single place that decides.
  assert.equal(iconOf('reply'), ICON.conversation);
  assert.equal(iconOf('watched'), ICON.video);
  assert.equal(iconOf('failed'), iconOf('exception'), 'both are the alert glyph');
  assert.equal(iconOf('approval'), iconOf('approved'));
});

test('there are five families plus a neutral, and no component picks a hex', () => {
  assert.deepEqual(TONES.sort(), ['bad', 'brand', 'good', 'info', 'neutral', 'wait'].sort());
  for (const theme of ['light', 'dark']) {
    for (const family of TONES) {
      const block = toneBlock(theme);
      for (const part of ['ink', 'bg', 'line']) {
        assert.match(block, new RegExp(`--tone-${family}-${part}:`), `${theme} --tone-${family}-${part}`);
      }
    }
  }
  // The atoms read the variables; they never accept a colour.
  const sem = src('components/Semantic.jsx');
  assert.match(sem, /var\(--tone-\$\{tone\}-ink\)/);
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(sem), 'Semantic.jsx contains no literal colours');
});

test('colour is never the only signal: every state carries an icon and a word', () => {
  for (const [name, k] of Object.entries(KIND)) {
    assert.ok(k.icon, `${name} has an icon`);
    assert.ok(k.label && k.label.length > 1, `${name} has a word`);
    assert.ok(TONES.includes(k.tone), `${name} has a known family`);
  }
  // The pill always renders its text; the icon is what is optional.
  const sem = src('components/Semantic.jsx');
  assert.match(sem, /const text = children \?\? k\?\.label;/);
  assert.match(sem, /\{glyph && <Icon/);
});

test('the semantic families are visually distinct from one another', () => {
  // Two families that look alike are one family with two names. Every pair of
  // HUES must differ by more than a nudge in a single channel; neutral is
  // excluded on purpose, because it is a grey and comparing it to a hue
  // measures saturation rather than confusability.
  for (const theme of ['light', 'dark']) {
    const inks = ['info', 'good', 'wait', 'bad', 'brand'].map((f) => toneInk(theme, f));
    for (let i = 0; i < inks.length; i++) {
      for (let j = i + 1; j < inks.length; j++) {
        const a = [1, 3, 5].map((k) => parseInt(inks[i].slice(k, k + 2), 16));
        const b = [1, 3, 5].map((k) => parseInt(inks[j].slice(k, k + 2), 16));
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        assert.ok(dist > 60, `${theme} ${inks[i]} and ${inks[j]} are only ${Math.round(dist)} apart`);
      }
    }
  }
});

test('every family clears AA as text, and on its own tinted pill', () => {
  const grounds = { light: ['#FFFFFF', '#FAF7F3'], dark: ['#11141A', '#191D24', '#242932'] };
  const alpha = { light: 0.10, dark: 0.14 };
  for (const theme of ['light', 'dark']) {
    for (const family of TONES) {
      const ink = toneInk(theme, family);
      for (const ground of grounds[theme]) {
        const r = contrast(ink, ground);
        assert.ok(r >= 4.5, `${theme} ${family} on ${ground} is ${r.toFixed(2)}:1`);
      }
      const pill = over(ink, alpha[theme], grounds[theme][0]);
      const r = contrast(ink, pill);
      assert.ok(r >= 4.5, `${theme} ${family} on its own pill is ${r.toFixed(2)}:1`);
    }
  }
});

// ── 6-8. Today's cards read as cards ─────────────────────────────────────

test("Today's tabs and their rows share one vocabulary", () => {
  for (const t of TODAY_TABS) {
    assert.ok(TODAY_TAB_KIND[t.id], `${t.id} maps to a concept`);
    assert.ok(kindOf(TODAY_TAB_KIND[t.id]).icon, `${t.id} has an icon`);
  }
  // The tab strip derives its icons from the map rather than keeping a
  // second list, so a tab and its rows cannot wear different glyphs.
  assert.match(TODAY, /const TAB_ICON = Object\.fromEntries\(\s*Object\.entries\(TODAY_TAB_KIND\)/);
  assert.match(TODAY, /<Icon name=\{TAB_ICON\[t\.id\]\}/);
  assert.match(TODAY, /var\(--tone-\$\{kindOf\(TODAY_TAB_KIND\[t\.id\]\)\.tone\}-ink\)/);
});

test('a task row is a tile, a name, one pill and compact metadata', async () => {
  const Row = (await import('../components/ProspectListRow.jsx')).default;
  const html = renderToString(React.createElement(Row, {
    prospect: { id: 1, name: 'Mary', business_name: 'Peak Development', domain: null, stage: 'Email 2' },
    state: { label: 'Email 2 due', context: '1 email sent', tone: 'action' },
    kind: 'followup',
    waitingDays: 3,
    onOpen() {},
  }));
  assert.match(html, /class="tile/, 'a semantic tile leads the row');
  assert.match(html, /class="pill/, 'the state is a pill');
  assert.equal((html.match(/class="pill/g) || []).length, 1, 'exactly one pill on a row');
  assert.ok(html.includes('Peak Development'), 'the business is still the strongest line');
  assert.ok(html.includes('Email 2 due'), 'the router still supplies the words');
  assert.ok(html.includes('3d'), 'waiting is compact');
  assert.ok(!html.includes('3 days waiting'), 'and no longer a phrase');
});

test('a row with no kind still renders, and never with an empty left column', async () => {
  const Row = (await import('../components/ProspectListRow.jsx')).default;
  const html = renderToString(React.createElement(Row, {
    prospect: { id: 2, name: 'Otis', business_name: 'Kind Roots', domain: null },
    state: { label: 'Sequence finished', context: null, tone: 'quiet' },
    onOpen() {},
  }));
  assert.match(html, /class="tile/, 'a monogram fills the left column');
  assert.ok(html.includes('KR') || html.includes('Kind Roots'), 'the monogram is the business initials');
});

test('duration is compact and honest about the short cases', () => {
  assert.equal(shortDuration(0), '1d', 'nothing is ever "0d"');
  assert.equal(shortDuration(3), '3d');
  assert.equal(shortDuration(45), '2mo');
  assert.equal(shortDuration(400), '1y');
  assert.equal(shortDuration(null), null);
  assert.equal(shortDuration(-2), null);
});

// ── 9-11. The drawer got more visual ─────────────────────────────────────

test('the identity card has a visual for the business and one state pill', () => {
  const head = src('components/ProspectHeadline.jsx');
  assert.match(head, /<Monogram name=\{id\.primary\}/, 'a monogram when there is no site');
  assert.match(head, /w-\[42px\] h-\[42px\] r-md border border-line/, 'and a bordered favicon square when there is');
  assert.match(head, /<Pill tone=\{HEAD_TONE\[state\.tone\] \|\| HEAD_TONE\.muted\}/, 'the state is a pill');
  assert.ok(!/text-rose-text',\n  action: 'text-ink'/.test(head), 'the old colour-only tone map is gone');
});

test('Email renders sends as stated cards, not identical text lines', () => {
  const oh = src('components/OutreachHistory.jsx');
  assert.match(oh, /<Tile kind="sent"/);
  assert.match(oh, /<Pill kind="sent">Sent<\/Pill>/);
  assert.match(oh, /r-md border border-line bg-panel/, 'each send has its own container');
});

test('Activity events carry their own glyph, and Video says its state as a pill', () => {
  assert.match(DRAWER, /const LOG_TAG_ICON = \{/);
  assert.match(DRAWER, /<Icon name=\{LOG_TAG_ICON\[e\.tag\] \|\| 'circle-dot'\}/);
  const video = DRAWER.slice(DRAWER.indexOf("tab === 'video'"), DRAWER.indexOf("tab === 'activity'"));
  assert.match(video, /<Tile kind=\{vState\.key === 'watched' \? 'watched' : 'video'\}/);
  assert.match(video, /<Pill kind=\{vState\.key === 'watched' \? 'watched' : 'video'\}/);
});

// ── 12-13. Dark is darker and still neutral ──────────────────────────────

test('dark canvas and panels went darker and stayed neutral', () => {
  const DARK = CSS.slice(0, CSS.indexOf('--bg: #FAF7F3'));
  const tok = (n) => DARK.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`))[1];
  const val = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  // Chapter 9's values, which these must be darker than.
  assert.ok(val(tok('bg')) < val('#181B20'), 'canvas is darker than Chapter 9');
  assert.ok(val(tok('panel')) < val('#22262D'), 'panels are darker than Chapter 9');
  for (const name of ['bg', 'panel', 'surface', 'card-hover']) {
    const hex = tok(name);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 15, `--${name} ${hex} carries a colour cast`);
    assert.ok(b >= r, `--${name} ${hex} is warm-shifted, which is what the plum looked like`);
  }
  assert.match(DARK, /--ambient: none;/, 'still no aurora');
});

test('dark text and disabled controls still clear AA on the darker grounds', () => {
  const DARK = CSS.slice(0, CSS.indexOf('--bg: #FAF7F3'));
  const tok = (n) => DARK.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`))[1];
  for (const ground of ['#11141A', '#191D24', '#242932']) {
    assert.ok(contrast(tok('ink'), ground) >= 7, `primary on ${ground}`);
    assert.ok(contrast(tok('ink-2'), ground) >= 4.5, `secondary on ${ground}`);
    assert.ok(contrast(tok('ink-3'), ground) >= 4.5, `muted on ${ground}`);
  }
  assert.ok(contrast(tok('disabled-ink'), tok('disabled-bg')) >= 4.5, 'disabled pair');
  assert.ok(contrast('#FFFFFF', tok('rose-btn')) >= 4.5, 'white on the primary button');
});

// ── 14-16. AI Hive ───────────────────────────────────────────────────────

test('the name is exactly AI Hive', () => {
  assert.ok(HIVE.includes('AI Hive'), 'the name survives');
  assert.ok(!/\bHive Lab\b|\bAI Helpers Hub\b|\bAssistants\b/.test(HIVE), 'and was not renamed');
  const nav = src('lib/nav-structure.mjs');
  assert.match(nav, /label: 'AI helpers'/, 'the rail entry is unchanged too');
});

test('a helper card is step, name, job, state, action — with no paragraph', () => {
  assert.match(HIVE, /Step \{emp\.step\}/);
  assert.match(HIVE, /<p className="ui-body text-ink-2 leading-snug mt-0\.5">\{emp\.job\}<\/p>/);
  assert.match(HIVE, /<Pill kind=\{r\.ready \? 'approved' : 'waiting'\}>\{r\.ready \? 'Ready' : 'Not ready'\}<\/Pill>/);
  // The tagline is a sentence and it left the card body for the title.
  assert.match(HIVE, /title=\{emp\.tagline\}>\{emp\.name\}/);
  assert.ok(!/leading-snug mt-0\.5 max-w-\[70ch\]">\{emp\.tagline\}/.test(HIVE), 'no paragraph above the action');
  // Every helper actually has one.
  const block = HIVE.slice(HIVE.indexOf('const EMPLOYEES'), HIVE.indexOf('const GROUPS'));
  assert.equal((block.match(/\n {4}job: '/g) || []).length, 8, 'all eight helpers have a job');
});

test('the workflow strip is still in order, and the number outranks the mascot', () => {
  assert.match(HIVE, /Lead workflow<\/h3>/);
  assert.match(HIVE, /step: emp\.step/, 'numbers come from the employee table');
  assert.match(HIVE, /<ol className="flex items-center gap-x-2 gap-y-2 flex-wrap">/);
  // Flat, not a gradient chip: gradients are the decorative look this
  // chapter was told not to add.
  assert.match(HIVE, /style=\{\{ background: BEE_STYLE\[s\.bee\]\.to \}\}/);
  assert.ok(!/w-5 h-5 r-pill[^>]*linear-gradient/.test(HIVE));
  assert.match(HIVE, /<BeeBadge id=\{emp\.id\} size=\{44\}/);
});

// ── 17-19. The How-to cheat sheet ────────────────────────────────────────

test('the How-to popup is four labelled rows with coloured labels', () => {
  assert.match(HIVE, /\['WHEN', sh\.when/);
  assert.match(HIVE, /\['DOES', sh\.does/);
  assert.match(HIVE, /\['SAVES TO', sh\.saves/);
  assert.match(HIVE, /\['COST', g\.cost, 'neutral'\]/);
  assert.match(HIVE, /background: `var\(--tone-\$\{tone\}-bg\)`/, 'the labels are chips, not plain text');
  assert.match(HIVE, /<dl className="space-y-2">/, 'and it is a description list, which is what it is');
});

test('the default view of every popup is under 180 characters', () => {
  const block = HIVE.slice(HIVE.indexOf('const EMPLOYEES'), HIVE.indexOf('const GROUPS'));
  const bees = block.split(/\n {4}id: '/).slice(1);
  assert.equal(bees.length, 8);
  for (const bee of bees) {
    const id = bee.slice(0, bee.indexOf("'"));
    const get = (re) => (bee.match(re) || [, ''])[1];
    const chars = get(/job: '([^']*)'/).length
      + get(/when: '([^']*)'/).length
      + get(/does: '([^']*)'/).length
      + get(/saves: '([^']*)'/).length
      + 'WHENDOESSAVES TOCOST'.length + 12;
    assert.ok(chars < 180, `${id}'s cheat sheet is ${chars} characters`);
  }
});

test('the full explanation is still there, still collapsed', () => {
  const modal = HIVE.slice(HIVE.indexOf('function BeeGuideModal'), HIVE.indexOf('const STOPPABLE'));
  assert.match(modal, /More details\s*\n\s*<\/summary>/);
  assert.match(modal, /\{LONG\.map/);
  for (const key of ['What it does', 'When to run it', 'What you need first', 'Where results land']) {
    assert.ok(modal.includes(`'${key}'`), `${key} survives under the disclosure`);
  }
});

// ── 20-21. System, and the Sourcing guide ────────────────────────────────

test('System is grouped areas with glyphs and a state, not a column of labels', () => {
  const sh = src('components/SystemHealth.jsx');
  assert.match(sh, /function Section\(\{ title, children, note = null, icon = null, state = null, tab = null \}\)/);
  // Chapter 11: a section declares which of System's four questions it
  // answers, and renders nothing when that is not the open one.
  assert.match(sh, /if \(tab && tab !== open\) return null;/);
  assert.match(sh, /title="Website checks"/, 'the failure group is named for what it checks');
  assert.match(sh, /<Pill kind="exception">/, 'and carries its count as a pill');
  assert.match(sh, /icon=\{ICON\.system\}/);
  // Human errors and the technical disclosure are exactly as Chapter 8 left.
  assert.match(sh, /friendlyError\(h\.error\)\.short/);
  assert.match(sh, /Technical details<\/summary>/);
});

test('the Sourcing guide opens with five steps and does not rewrite the pages', () => {
  const shell = src('components/ProspectsApp.jsx');
  assert.match(shell, /const SOURCING_STEPS = \[/);
  for (const title of ['Pick a niche', 'Find phrases', 'Scan results', 'Review New finds', 'Promote the good ones']) {
    assert.ok(shell.includes(`title: '${title}'`), `${title} is one of the steps`);
  }
  assert.match(shell, /steps=\{SOURCING_STEPS\}/);
  // The strip is additive: the guide still renders the same pages from the
  // same category, and nothing Ary wrote was edited.
  assert.match(shell, /category="guide-sourcing"/);
  const ws = src('components/WorkspaceView.jsx');
  assert.match(ws, /\{steps \? \(/, 'the strip is optional and sits above the content');
});

// ── 22. Redundancy ───────────────────────────────────────────────────────

test('a state is not said twice on the same card', () => {
  // Clients said the state in a pill and then again in the sentence below.
  const cv = src('components/ClientsView.jsx');
  assert.match(cv, /<Pill kind=\{complete \? 'client' : 'onboarding'\}>/);
  assert.ok(!/'Finished onboarding ' \+ lastStep\.doneDate/.test(cv), 'the sentence stopped repeating the pill');
  assert.ok(!/'Next: ' \+ next\.label/.test(cv), 'and stopped prefixing the action with a label');
  // Chapter 9's de-duplication held.
  assert.ok(!/detail: 'Cold outreach stopped here/.test(src('lib/exceptions.mjs')));
  assert.ok(!/Nothing sends on its own while follow-up automation is off/.test(src('lib/prospect-action.mjs')));
});

// ── 23-24. Nothing dangerous moved ───────────────────────────────────────

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
  assert.equal(REL_LABEL[REL.NO_TO_THIS_OFFER], 'Not interested');
});

test('package, send and approval semantics are unchanged', () => {
  const base = {
    status: 'APPROVED', email_subject: 'S', email_body: 'B', priority_band: 'P2',
    followups: [{ step: 2, subject: 'S2', body: 'B2' }], allowed_length: 2, sequence_max_step: 2,
  };
  const sent = { rating: '💙', emails_sent: 1 };
  assert.ok(approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, sent, { autoSendFollowups: true }).automation);
  assert.equal(approvalCard({ ...base, sequence_approved: 0, auto_followup_approved: 0 }, sent, { autoSendFollowups: true }).automation, null);
  const q = src('components/ApprovalQueue.jsx');
  assert.equal((q.match(/btn-send/g) || []).length, 1);
  assert.deepEqual([...new Set([...q.matchAll(/fetch\('([^'?]+)/g)].map((m) => m[1]))], ['/api/outreach']);
  assert.match(src('lib/send-guard.mjs'), /approvalFingerprint/);
  assert.equal(friendlyError('page.goto: net::ERR_NAME_NOT_RESOLVED').short, 'Domain does not resolve');
});

test('no backend, scheduler or Gmail path was touched', () => {
  assert.ok(!/action: 'send'/.test(DRAWER), 'the drawer still cannot send email');
  const inbox = src('components/LeadInbox.jsx');
  assert.deepEqual([...new Set([...inbox.matchAll(/fetch\('(\/api\/[a-z/-]+)[?']/g)].map((m) => m[1]))].sort(),
    ['/api/ai', '/api/import/apify', '/api/leads', '/api/limits',
     '/api/scan', '/api/scan/enrich', '/api/scan/import', '/api/settings']);
});

// ── Accessibility ────────────────────────────────────────────────────────

test('decorative visuals are hidden from assistive tech, and compact metadata is not', () => {
  const sem = src('components/Semantic.jsx');
  // The tile and the monogram repeat what the text beside them already says.
  assert.match(sem, /export function Tile\(\{[\s\S]{0,600}aria-hidden="true"/);
  assert.match(sem, /export function Monogram\(\{[\s\S]{0,700}aria-hidden="true"/);
  // "3d" beside a clock is meaningless read aloud, so the noun is spoken.
  assert.match(sem, /\{label && <span className="sr-only">\{label\}: <\/span>\}/);
});
