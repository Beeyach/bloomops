// Chapter 9: one job at a time.
//
// Chapter 8 made the app legible. It did not make it short. Today still put
// every category on screen at once, the type was still small on a large
// monitor, dark mode was still the light palette at night, and the prospect
// drawer had nowhere to put a video. The verdict: "show one job at a time".
//
// So Today is five tabs, the type scale went up again and became adjustable,
// dark mode got its own neutral ink palette, the drawer grew a conditional
// Video tab, the Hive numbers its steps, and the same sentence stopped being
// printed on every row under a heading that already said it.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  TODAY_TABS, TODAY_PRIORITY, TAB_BUCKETS, TODAY_TAB_KEY,
  openingTodayTab, todaySummary, isTodayClear, isTodayTab,
} from '../lib/today-tabs.mjs';
import { TEXT_SIZES, TEXT_SIZE_KEY, DEFAULT_TEXT_SIZE, normalizeTextSize, textSizeAttr } from '../lib/text-size.mjs';
import { hasVideo, videoState } from '../lib/prospect-video.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';
import { friendlyError } from '../lib/friendly-errors.mjs';
import { approvalCard } from '../lib/approval.mjs';
import { TABS as PROSPECT_TABS } from '../lib/prospect-tabs.mjs';

// The runtime JSX hook only handles DYNAMIC imports, so components are
// loaded inside the tests that need them.
const loadDrawer = async () => (await import('../components/ProspectDrawer.jsx')).drawerTabs;

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const CSS = src('app/globals.css');
const TODAY = src('components/TodayView.jsx');
const DRAWER = src('components/ProspectDrawer.jsx');
const HIVE = src('components/ArmyPanel.jsx');

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
const DARK = CSS.slice(0, CSS.indexOf('--bg: #FAF7F3'));
const DARK_THEME = CSS.slice(CSS.indexOf('--canvas: #11141A'), CSS.indexOf('html[data-theme="light"] {\n  --canvas'));
const tokenIn = (block, name) => {
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} is defined`);
  return m[1];
};

// ── 1-6. Today is five places, not one scroll ─────────────────────────────

test('Today renders a tab strip and one panel, not every category stacked', () => {
  assert.deepEqual(TODAY_TABS.map((t) => t.id),
    ['replies', 'approvals', 'followups', 'decisions', 'exceptions']);
  assert.match(TODAY, /role="tablist" aria-label="Today"/);
  // Chapter 12: the panel is no longer titled at all — the tab above it is
  // the title, and repeating it was the same word twice within 200px.
  assert.match(TODAY, /<Section blurb=\{tabDef\.blurb\}>/);
  assert.ok(!/title=\{tabDef\.label\}/.test(TODAY), 'the panel does not re-title itself');
  // The old stacked layout is gone: no four hard-coded Section titles.
  assert.ok(!/title="Needs your reply"/.test(TODAY));
  assert.ok(!/title="Approvals"/.test(TODAY));
});

test('the default tab is the highest-priority one that has anything in it', () => {
  assert.deepEqual(TODAY_PRIORITY, ['replies', 'decisions', 'approvals', 'followups', 'exceptions']);
  assert.equal(openingTodayTab({ replies: 4, approvals: 2, followups: 5 }), 'replies');
  assert.equal(openingTodayTab({ approvals: 2, followups: 5, decisions: 1 }), 'decisions');
  assert.equal(openingTodayTab({ approvals: 2, followups: 5 }), 'approvals');
  assert.equal(openingTodayTab({ followups: 5 }), 'followups');
  assert.equal(openingTodayTab({ exceptions: 160 }), 'exceptions');
  assert.equal(openingTodayTab({}), 'replies', 'an empty day still opens somewhere sensible');
});

test('a manual choice wins over priority, even when its tab is empty', () => {
  // Being moved off the thing you were working on because you finished it is
  // worse than an empty panel that says so.
  assert.equal(openingTodayTab({ replies: 9 }, 'followups'), 'followups');
  assert.equal(openingTodayTab({ replies: 9 }, 'nonsense'), 'replies', 'a junk value falls back');
  assert.ok(isTodayTab('decisions') && !isTodayTab('decision'));
});

test('the chosen tab is remembered for the session and no longer', () => {
  // sessionStorage, not localStorage: tomorrow morning should open on
  // whatever is actually waiting, not on last night's tab.
  assert.match(TODAY, /sessionStorage\.getItem\(TODAY_TAB_KEY\)/);
  assert.match(TODAY, /sessionStorage\.setItem\(TODAY_TAB_KEY, id\)/);
  assert.ok(!/localStorage\.\w+\(TODAY_TAB_KEY/.test(TODAY), 'not persisted across sessions');
  assert.equal(TEXT_SIZE_KEY.endsWith('_v1'), true);
  assert.equal(TODAY_TAB_KEY, 'ltb_today_tab_v1');
});

test('an empty tab is one line, not a large empty section', () => {
  // Chapter 11 gave each tab its own empty line — "Nobody is waiting on an
  // answer" says more than "Nothing here right now" and costs the same. What
  // Chapter 9 was protecting is that it is ONE short line, never a stack.
  for (const t of TODAY_TABS) {
    assert.ok(t.empty && !/\n/.test(t.empty) && t.empty.length < 60, `${t.id}'s empty state is one short line`);
  }
  assert.match(TODAY, /counts\[tab\] === 0 \?[\s\S]{0,120}\{tabDef\.empty\}/);
});

test('an all-clear day says so once, and draws no tabs at all', () => {
  assert.ok(isTodayClear({}));
  assert.ok(isTodayClear({ replies: 0, approvals: 0 }));
  assert.ok(!isTodayClear({ exceptions: 1 }));
  // The review found the sentence rendered twice — once on this line and
  // again as the card's heading directly below it. The line says something
  // different now; the card keeps the headline. Said once, which is what
  // this test was always for.
  assert.match(TODAY, /clear \? 'Nothing is waiting on you\.' : oneLine/);
  const clearCopy = TODAY.match(/clear for today/g) || [];
  assert.equal(clearCopy.length, 1, 'the all-clear headline appears exactly once');
  // The strip and the panel are hidden on a clear day rather than unmounted:
  // the exception and approval queues are what COUNT the work, so a branch
  // that removes them when Today believes it is clear would make that belief
  // permanent. This is the line that keeps them mounted.
  assert.match(TODAY, /<div className=\{clear \? 'hidden' : ''\} aria-hidden=\{clear \? 'true' : undefined\}>/);
  const clearCard = TODAY.slice(TODAY.indexOf('{clear ? ('), TODAY.indexOf(') : null}'));
  assert.ok(!clearCard.includes('<TodayTabs'), 'no tab strip over an empty day');
  assert.ok(!clearCard.includes('<ExceptionQueue'), 'and the queues are not inside it');
});

test('the summary line names only the tabs that have something', () => {
  assert.equal(todaySummary({ replies: 4, approvals: 2, followups: 5 }), '4 replies · 2 approvals · 5 follow-ups');
  assert.equal(todaySummary({ replies: 1, followups: 1 }), '1 reply · 1 follow-up');
  assert.equal(todaySummary({ replies: 0, approvals: 0 }), '', 'nothing to say is said by saying nothing');
});

test('each tab owns a named slice of the exception queue, and the counts read the same source', () => {
  // Chapter 11 re-cut ownership: a deferral that came round is a follow-up,
  // an old draft waiting is an approval, and Decisions holds only what the
  // app genuinely would not decide. The invariant Chapter 9 cared about — a
  // tab owns a NAMED slice and the counts read the same map the panels do —
  // is unchanged, and the Chapter 11 suite asserts it as a strict partition.
  assert.deepEqual(TAB_BUCKETS.replies, ['replies']);
  assert.deepEqual(TAB_BUCKETS.followups, ['deferrals']);
  assert.deepEqual(TAB_BUCKETS.approvals, ['legacy']);
  assert.deepEqual(TAB_BUCKETS.decisions, ['decisions']);
  assert.deepEqual(TAB_BUCKETS.exceptions, ['blocked', 'held']);
  assert.match(TODAY, /only=\{TAB_BUCKETS\[tab\] \|\| \[\]\}/);
  // One instance, always mounted, so the totals that label the tabs survive
  // switching to a tab that owns no buckets.
  assert.equal((TODAY.match(/<ExceptionQueue/g) || []).length, 1);
  assert.match(TODAY, /onTotals=\{onTotals\}/);
  assert.match(src('components/ExceptionQueue.jsx'), /if \(data\?\.totals && onTotals\) onTotals\(data\.totals\)/);
});

// ── 7-9. Type, and the size preference ────────────────────────────────────

test('the Chapter 9 scale is bigger again, with a 14px floor by default', () => {
  assert.equal(px('fs-page'), 32);
  assert.equal(px('fs-section'), 24);
  assert.equal(px('fs-card'), 19);
  assert.equal(px('fs-body'), 16);
  assert.equal(px('fs-label'), 15);
  assert.equal(px('fs-meta'), 14);
  for (const r of ['fs-page', 'fs-section', 'fs-card', 'fs-body', 'fs-label', 'fs-meta', 'fs-table']) {
    assert.ok(px(r) >= 14, `--${r} is below the 14px floor`);
  }
});

test('every role is one expression over one token, so the preference moves all of them', () => {
  for (const r of ['fs-page', 'fs-section', 'fs-card', 'fs-body', 'fs-label', 'fs-meta', 'fs-table']) {
    assert.match(CSS, new RegExp(`--${r}: calc\\([0-9.]+px \\+ var\\(--fs-step\\)\\)`), `--${r} follows --fs-step`);
  }
  // The review found Chapter 9's default overshot: on a full screen it read
  // as wasted space. Compact is the default now, so :root carries the -1 and
  // the other two step up from it. Same three sizes, same roles, same ratios.
  assert.match(CSS, /--fs-step: -1px;/);
  assert.match(CSS, /html\[data-textsize="comfortable"\] \{ --fs-step: 0px; \}/);
  assert.match(CSS, /html\[data-textsize="large"\]\s*\{ --fs-step: 2px; \}/);
});

test('Compact never drops below the Chapter 8 scale', () => {
  // The floor is a promise: Compact is for fitting more on screen, not for
  // undoing two chapters of making the app readable.
  const CH8 = { 'fs-page': 31, 'fs-section': 22, 'fs-card': 18, 'fs-body': 15, 'fs-label': 14, 'fs-meta': 13, 'fs-table': 14 };
  for (const [role, floor] of Object.entries(CH8)) {
    assert.ok(px(role) - 1 >= floor, `compact --${role} is ${px(role) - 1}px, under the ${floor}px floor`);
  }
});

test('three text sizes, stored locally, with anything unrecognised falling back', () => {
  // Listed smallest-first, and Compact is the default after the pixel review.
  assert.deepEqual(TEXT_SIZES.map((t) => t.id), ['compact', 'comfortable', 'large']);
  assert.equal(DEFAULT_TEXT_SIZE, 'compact');
  assert.equal(normalizeTextSize('large'), 'large');
  assert.equal(normalizeTextSize('enormous'), 'compact');
  assert.equal(normalizeTextSize(null), 'compact');
  // The default carries no attribute, so it costs no CSS rule.
  assert.equal(textSizeAttr('compact'), null);
  assert.equal(textSizeAttr('large'), 'large');
});

test('the preference is applied before first paint, not one frame after', () => {
  const layout = src('app/layout.jsx');
  assert.match(layout, /localStorage\.getItem\('ltb_textsize_v1'\)/);
  assert.match(layout, /z==='large'\|\|z==='comfortable'/, 'the two non-default sizes set the attribute');
  assert.match(layout, /d\.dataset\.textsize=z/);
  assert.match(layout, /delete d\.dataset\.textsize/, 'Comfortable clears the attribute');
  const hook = src('components/useTextSize.js');
  assert.match(hook, /localStorage\.setItem\(TEXT_SIZE_KEY, value\)/);
  assert.match(hook, /useState\(DEFAULT_TEXT_SIZE\)/, 'hydration-safe initial state');
  assert.match(src('components/SettingsView.jsx'), /role="radiogroup" aria-label="Text size"/);
});

// ── 10-11. Dark is its own palette now ────────────────────────────────────

test('dark is neutral ink, not the light palette at night', () => {
  // Chapter 10 took the same neutral direction darker; the shape of the
  // assertion is unchanged and the values moved with the palette.
  for (const [name, hex] of [['bg', '#11141A'], ['panel', '#191D24'], ['ink', '#F5F2ED']]) {
    assert.equal(tokenIn(DARK, name), hex, `dark --${name}`);
  }
  // Neutral means the three channels sit close together. The plum this
  // replaces was #1A1118 — a red channel well above the green one.
  for (const name of ['bg', 'panel', 'surface', 'card-hover']) {
    const hex = tokenIn(DARK, name);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 15, `--${name} ${hex} still carries a colour cast`);
    assert.ok(b >= r, `--${name} ${hex} is warm-shifted, which is what plum looked like`);
  }
});

test('no aurora, no glow, no gradient behind the dark app', () => {
  assert.match(DARK, /--ambient: none;/);
  assert.ok(!/--ambient:\s*\n?\s*radial-gradient[\s\S]{0,400}rgba\(210, 69, 107/.test(DARK),
    'the plum radial gradients are gone');
});

test('dark text and semantics clear AA on canvas, panel and the raised surface', () => {
  const grounds = ['#11141A', '#191D24', '#242932'];
  const checks = {
    'text-primary': 7, 'text-secondary': 4.5, 'text-muted': 4.5,
    success: 4.5, warning: 4.5, danger: 4.5, info: 4.5,
  };
  for (const [name, min] of Object.entries(checks)) {
    const hex = tokenIn(DARK_THEME, name);
    for (const ground of grounds) {
      const ratio = contrast(hex, ground);
      assert.ok(ratio >= min, `dark --${name} on ${ground} is ${ratio.toFixed(2)}:1, needs ${min}`);
    }
  }
  // Disabled controls stay stated rather than faded.
  const d = contrast(tokenIn(DARK, 'disabled-ink'), tokenIn(DARK, 'disabled-bg'));
  assert.ok(d >= 4.5, `dark disabled text is ${d.toFixed(2)}:1`);
  // And white still reads on the primary button.
  assert.ok(contrast('#FFFFFF', tokenIn(DARK, 'rose-btn')) >= 4.5);
});

test('light stays the default and the primary direction', () => {
  assert.match(src('app/layout.jsx'), /d\.dataset\.theme=t==='dark'\?'dark':'light'/);
  assert.match(src('components/useTheme.js'), /useState\('light'\)/);
  // Light was not repainted by this chapter: the Chapter 8 values stand.
  const LIGHT = CSS.slice(CSS.indexOf('--bg: #FAF7F3'));
  assert.equal(tokenIn(LIGHT, 'bg'), '#FAF7F3');
  assert.equal(tokenIn(LIGHT, 'panel'), '#FFFFFF');
  assert.equal(tokenIn(LIGHT, 'ink'), '#2B2529');
});

// ── 12-16. The drawer, and its conditional Video tab ──────────────────────

test('the drawer offers Overview / Email / Evidence / Activity / More, plus Video when there is one or one is earned', async () => {
  const drawerTabs = await loadDrawer();
  const bare = { id: 1, name: 'A' };
  assert.deepEqual(drawerTabs(bare).map((t) => t.key),
    ['overview', 'email', 'evidence', 'activity', 'more']);
  const withVideo = { id: 2, name: 'B', video_url: 'https://example.com/v.mp4' };
  assert.deepEqual(drawerTabs(withVideo).map((t) => t.key),
    ['overview', 'email', 'evidence', 'video', 'activity', 'more']);
  assert.equal(drawerTabs(withVideo)[3].label, 'Video');
  // 2026-08-28: the Video tab also appears when recording is earned
  // (SEND/MAYBE tier, no video yet) so Ary can find the Record button.
  const needsRecording = { id: 3, name: 'C', video_tier: 'SEND' };
  assert.deepEqual(drawerTabs(needsRecording).map((t) => t.key),
    ['overview', 'email', 'evidence', 'video', 'activity', 'more']);
  // Dead rating: recording not earned, no tab.
  const dead = { id: 4, name: 'D', video_tier: 'SEND', rating: '✖️' };
  assert.deepEqual(drawerTabs(dead).map((t) => t.key),
    ['overview', 'email', 'evidence', 'activity', 'more']);
});

test('Video appears only for real video content, never for the scanner opinion', () => {
  assert.equal(hasVideo({ video_url: 'x' }), true);
  assert.equal(hasVideo({ video_sent_at: '2026-08-01' }), true);
  assert.equal(hasVideo({ activity_log: JSON.stringify([{ tag: 'VIDEOVIEW', text: 'Watched 75% of the video', ts: '2026-08-01T00:00:00Z' }]) }), true);
  // The scanner scores nearly every prospect. A tier or a severity is an
  // opinion that a video WOULD be worth making — not a video.
  assert.equal(hasVideo({ video_tier: 'SEND', video_score: 9, video_reasons: '["a"]' }), false);
  assert.equal(hasVideo({}), false);
  assert.equal(hasVideo(null), false);
  assert.equal(videoState({}), null);
  assert.equal(videoState({ video_url: 'x' }).key, 'ready');
  assert.equal(videoState({ video_url: 'x', video_sent_at: 'y' }).key, 'sent');
});

test('walking onto a prospect with no video cannot strand the drawer on a hidden tab', () => {
  assert.match(DRAWER, /if \(!tabs\.some\(\(t\) => t\.key === tab\)\) setTab\('overview'\)/);
});

test('Email holds outreach only, Evidence holds proof only, More owns the record', () => {
  const slice = (from, to) => DRAWER.slice(DRAWER.indexOf(from), to ? DRAWER.indexOf(to) : undefined);
  const email = slice("tab === 'email'", "tab === 'evidence'");
  assert.ok(email.includes('<OutreachHistory'), 'Email shows what went out');
  assert.ok(!email.includes('<ProspectCard'), 'and not the why-chosen evidence');
  assert.ok(!email.includes('The record'), 'and not the editable record');

  const evidence = slice("tab === 'evidence'", "tab === 'video'");
  assert.ok(evidence.includes('<ProspectCard'), 'Evidence shows why they were chosen');
  assert.ok(!evidence.includes('<OutreachHistory'), 'and not the sends');
  assert.ok(!evidence.includes('<AuditVideo'), 'the video moved to its own tab');

  const more = slice("tab === 'more'");
  for (const marker of ['The record</SectionHead>', 'Contact</SectionHead>', '<SystemDetails']) {
    assert.ok(more.includes(marker), `${marker} is under More`);
  }
});

test('the Video panel renders the audit video and says what state it is in', () => {
  const video = DRAWER.slice(DRAWER.indexOf("tab === 'video'"), DRAWER.indexOf("tab === 'activity'"));
  assert.ok(video.includes('<AuditVideo'), 'the video itself');
  assert.ok(video.includes('vState.label'), 'and one line saying where it got to');
});

// ── 17-18. The Hive reads as a sequence ───────────────────────────────────

test('the Hive opens with a named, numbered workflow', () => {
  assert.match(HIVE, /Lead workflow<\/h3>/);
  assert.match(HIVE, /const WORKFLOW_STEPS = 5;/);
  // The numbers are derived from the employee table, so the strip and the
  // cards cannot disagree about what step something is.
  assert.match(HIVE, /const emp = EMPLOYEES\.find\(\(e\) => e\.id === s\.bee\);/);
  assert.match(HIVE, /step: emp\.step/);
  // It wraps rather than scrolling sideways: a sequence you have to drag to
  // finish reading is not a sequence you can see.
  assert.match(HIVE, /<ol className="flex items-center gap-x-2 gap-y-2 flex-wrap">/);
});

test('every workflow helper leads with its step number, not its mascot', () => {
  assert.match(HIVE, /Step \{emp\.step\}/);
  assert.match(HIVE, /<BeeBadge id=\{emp\.id\} size=\{44\}/, 'the mascot came down in size');
  // The step eyebrow is declared before the name in the card.
  const start = HIVE.indexOf('hive-card border');
  const card = HIVE.slice(start, HIVE.indexOf('How to use', start));
  assert.ok(card.indexOf('Step {emp.step}') < card.indexOf('{emp.name}'), 'the number reads first');
});

// ── 19-20. How-to popups ──────────────────────────────────────────────────

test('the How-to popup opens with four short lines', () => {
  // Chapter 10 turned the four lines into four labelled rows with coloured
  // label chips. Same four facts, same fallback chain, less reading.
  assert.match(HIVE, /\['WHEN', sh\.when \|\| b\.when \|\| firstSentence\(g\.when\), 'wait'\]/);
  assert.match(HIVE, /\['DOES', sh\.does \|\| b\.what \|\| firstSentence\(g\.what\), 'info'\]/);
  assert.match(HIVE, /\['SAVES TO', sh\.saves \|\| b\.result \|\| firstSentence\(g\.lands\), 'good'\]/);
  assert.match(HIVE, /\['COST', g\.cost, 'neutral'\]/);
  assert.match(HIVE, /function firstSentence\(text\)/);
});

test('the long version is still there, collapsed', () => {
  const modal = HIVE.slice(HIVE.indexOf('function BeeGuideModal'), HIVE.indexOf('const STOPPABLE'));
  assert.match(modal, /More details\s*\n\s*<\/summary>/);
  assert.match(modal, /\{LONG\.map/);
  for (const key of ['What it does', 'When to run it', 'What you need first', 'Where results land']) {
    assert.ok(modal.includes(`'${key}'`), `${key} survives in the long version`);
  }
});

// ── 21-22. Redundancy ─────────────────────────────────────────────────────

test('the sentence a tab already says is not printed on every row inside it', () => {
  const ex = src('lib/exceptions.mjs');
  assert.ok(!/detail: 'Cold outreach stopped here/.test(ex), 'the Replies row stopped repeating it');
  assert.ok(!/Nothing sends on its own while follow-up automation is off/.test(src('lib/prospect-action.mjs')),
    'the Follow-ups row stopped repeating it');
  // Said at tab level, once per tab that needs it, and nowhere else.
  const approvals = TODAY_TABS.find((t) => t.id === 'approvals');
  const followups = TODAY_TABS.find((t) => t.id === 'followups');
  assert.match(approvals.blurb, /Nothing sends until you say so\./);
  assert.match(followups.blurb, /Nothing sends on its own\./);
  for (const t of TODAY_TABS) {
    assert.equal((t.blurb.match(/Nothing sends/g) || []).length <= 1, true, `${t.id} says it at most once`);
  }
  // And the approval surface's own header is suppressed inside the tab that
  // already names it.
  assert.match(TODAY, /hideHeader/);
});

test('Decisions asks for a call instead of naming a bee that failed', () => {
  const ex = src('lib/exceptions.mjs');
  assert.match(ex, /headline: 'Needs your call'/);
  assert.ok(!/headline: 'Vet could not decide'/.test(ex), 'no row still says it');
});

test("Chapter 8's plain language survived", () => {
  assert.equal(REL_LABEL[REL.NO_TO_THIS_OFFER], 'Not interested');
  const labels = [REL_LABEL[REL.NO_TO_THIS_OFFER], REL_LABEL[REL.NO_TO_US], REL_LABEL[REL.DEFERRED], REL_LABEL[REL.WON]];
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(friendlyError('page.goto: net::ERR_NAME_NOT_RESOLVED').short, 'Domain does not resolve');
  assert.match(src('components/SystemHealth.jsx'), /friendlyError\(h\.error\)\.short/);
  assert.match(src('components/SystemHealth.jsx'), /Technical details<\/summary>/);
});

// ── 23-25. Nothing dangerous moved ────────────────────────────────────────

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

test('package, send and approval semantics are byte-for-byte what they were', () => {
  const base = {
    status: 'APPROVED', email_subject: 'S', email_body: 'B', priority_band: 'P2',
    followups: [{ step: 2, subject: 'S2', body: 'B2' }], allowed_length: 2, sequence_max_step: 2,
  };
  const sent = { rating: '💙', emails_sent: 1 };
  assert.ok(approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, sent, { autoSendFollowups: true }).automation);
  assert.equal(approvalCard({ ...base, sequence_approved: 0, auto_followup_approved: 0 }, sent, { autoSendFollowups: true }).automation, null);
  assert.equal(approvalCard({ ...base, sequence_approved: 1, auto_followup_approved: 0 }, { rating: '💙', emails_sent: 0 }, { autoSendFollowups: true }).automation, null);
  const q = src('components/ApprovalQueue.jsx');
  assert.equal((q.match(/btn-send/g) || []).length, 1, 'still exactly one send control');
  assert.deepEqual([...new Set([...q.matchAll(/fetch\('([^'?]+)/g)].map((m) => m[1]))], ['/api/outreach']);
  assert.match(src('lib/send-guard.mjs'), /approvalFingerprint/);
});

test('no backend route, scheduler or Gmail path was touched', () => {
  assert.ok(!/action: 'send'/.test(DRAWER), 'the drawer still cannot send email');
  // The only new reads are the ones Today needs to label its own tabs, and
  // they come from payloads the components already fetched.
  assert.match(src('components/ExceptionQueue.jsx'), /onTotals/);
  assert.match(src('components/ApprovalQueue.jsx'), /if \(data && onCount\) onCount/);
  const inbox = src('components/LeadInbox.jsx');
  assert.deepEqual([...new Set([...inbox.matchAll(/fetch\('(\/api\/[a-z/-]+)[?']/g)].map((m) => m[1]))].sort(),
    ['/api/ai', '/api/import/apify', '/api/leads', '/api/limits',
     '/api/scan', '/api/scan/enrich', '/api/scan/import', '/api/settings']);
});

// ── Regression checks the brief asked for by name ─────────────────────────

test('Prospects keeps its urgency-first default and its limited quick filters', () => {
  assert.equal(PROSPECT_TABS[0].label, 'Needs attention');
  assert.equal(PROSPECT_TABS[PROSPECT_TABS.length - 1].label, 'All');
  assert.match(src('components/ProspectsApp.jsx'), /const pickedTab = useRef\(false\);/);
});

test('Clients still splits onboarding from active', () => {
  const cv = src('components/ClientsView.jsx');
  assert.match(cv, /title: 'Needs onboarding', list: awaitingSetup/);
  assert.match(cv, /title: 'Active', list: onboarded/);
});
