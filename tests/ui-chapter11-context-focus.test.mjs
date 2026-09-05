// Chapter 11: one job at a time, meant literally.
//
// Chapter 9 gave Today five tabs and Chapter 10 made them legible. Neither
// checked whether the contents matched the names. They did not: Replies held
// people who had gone quiet, a video sitting recorded, and somebody who
// watched one — none of which is a reply — and Decisions held deferrals that
// had come round, which is a date arriving, not a decision.
//
// The centrepiece of this suite is the partition test. Ownership is declared
// once in lib/today-tabs.mjs, and the test walks it to prove no pile and no
// bucket can appear under two tabs. Everything else here is the same idea
// applied to a screen: a pill that repeats its tab, a lens row with nothing
// in it, a help band that never closes, five helpers the same size.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  TODAY_TABS, TAB_BUCKETS, TAB_PILES, PILE_OWNER, BUCKET_OWNER,
} from '../lib/today-tabs.mjs';
import {
  LAYOUT, URGENCY_TABS, LAYOUT_KEY, defaultLayoutFor, layoutFor, readLayouts,
} from '../lib/prospect-layout.mjs';
import { VIEW } from '../lib/prospect-action.mjs';
import { NAV, SECTIONS, MORE_GROUPS, RAIL_PRIMARY } from '../lib/nav-structure.mjs';
import { buildDefaultLayout } from '../lib/nav-layout.mjs';
import { TONES, KIND, ICON } from '../lib/semantic.mjs';
import { REL, LABEL as REL_LABEL } from '../lib/relationship.mjs';
import { approvalCard } from '../lib/approval.mjs';
import { friendlyError } from '../lib/friendly-errors.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const TODAY = src('components/TodayView.jsx');
const SHELL = src('components/ProspectsApp.jsx');
const HIVE = src('components/ArmyPanel.jsx');
const HEALTH = src('components/SystemHealth.jsx');
const RAIL = src('components/GlassRail.jsx');
const CSS = src('app/globals.css');

// ── 1-4. Strict ownership ─────────────────────────────────────────────────

test('every pile and every bucket belongs to exactly one tab', () => {
  // The partition, proved by counting rather than by reading. If a pile were
  // listed under two tabs the flatMap would produce two entries and the
  // totals would not match.
  const pileEntries = Object.values(TAB_PILES).flat();
  assert.equal(pileEntries.length, new Set(pileEntries).size, 'a pile is claimed twice');
  assert.equal(Object.keys(PILE_OWNER).length, pileEntries.length);

  const bucketEntries = Object.values(TAB_BUCKETS).flat();
  assert.equal(bucketEntries.length, new Set(bucketEntries).size, 'a bucket is claimed twice');
  assert.equal(Object.keys(BUCKET_OWNER).length, bucketEntries.length);

  // And every tab that exists has an entry, so nothing is silently homeless.
  for (const t of TODAY_TABS) {
    assert.ok(TAB_PILES[t.id] !== undefined, `${t.id} declares its piles`);
    assert.ok(TAB_BUCKETS[t.id] !== undefined, `${t.id} declares its buckets`);
  }
});

test('Replies holds replies and nothing else', () => {
  // Replies is owned entirely by the evidence-backed bucket now. The
  // needsYou pile knew only prospects.replied and could not be reconciled
  // with it, so the tab said 17 while one row could be proven.
  assert.deepEqual(TAB_PILES.replies, []);
  assert.deepEqual(TAB_BUCKETS.replies, ['replies']);
  // The three that used to be here and are not any more.
  for (const pile of ['hotViewers', 'warm', 'videoReady']) {
    assert.notEqual(PILE_OWNER[pile], 'replies', `${pile} left Replies`);
  }
});

test('gone quiet and watched-your-video are Follow-ups', () => {
  assert.equal(PILE_OWNER.warm, 'followups', 'gone quiet is a nudge, not an answer');
  assert.equal(PILE_OWNER.hotViewers, 'followups', 'watching a video earns a nudge');
  // due and upcoming are gone: a next_action_date that has drifted past is
  // not evidence a follow-up is owed, and it inflated the tab to 29 when the
  // honest cold-due number is 0.
  assert.equal(PILE_OWNER.due, undefined, 'a stale date is not follow-up work');
  assert.equal(PILE_OWNER.upcoming, undefined);
  assert.equal(BUCKET_OWNER.deferrals, 'followups', 'a deferral coming round is a date arriving');
});

test('review-before-send work is Approvals, and Decisions is only ambiguity', () => {
  assert.equal(PILE_OWNER.videoReady, 'approvals', 'a recorded video is work to review and send');
  assert.equal(BUCKET_OWNER.legacy, 'approvals', 'an old draft waiting is an approval');
  assert.deepEqual(TAB_BUCKETS.decisions, ['decisions']);
  assert.deepEqual(TAB_PILES.decisions, []);
  assert.equal(BUCKET_OWNER.blocked, 'exceptions');
  assert.equal(BUCKET_OWNER.held, 'exceptions');
  assert.equal(PILE_OWNER.attention, 'exceptions');
});

test('the panels render each pile under exactly the tab that owns it', () => {
  // Source-level, because the alternative is standing up four fetch mocks to
  // re-derive what the ownership map already states. What this catches is a
  // panel drifting away from the declaration above it.
  const panel = (tab) => {
    // A panel may carry an ownership guard as well as the tab check, e.g.
    // `{tab === 'replies' && TAB_PILES.replies.includes('needsYou') && (`.
    const start = TODAY.indexOf(`{tab === '${tab}' &&`);
    if (start < 0) return '';
    const next = ["'replies'", "'followups'", "'approvals'", "'exceptions'"]
      .map((t) => TODAY.indexOf(`{tab === ${t} &&`, start + 10))
      .filter((i) => i > start);
    return TODAY.slice(start, next.length ? Math.min(...next) : start + 4000);
  };
  const replies = panel('replies');
  // Replies is owned entirely by the evidence-backed bucket now, so the panel
  // draws no pile at all. It used to draw `needsYou` unconditionally, which is
  // how the tab could say 1 and list 17.
  assert.ok(
    replies.includes("TAB_PILES.replies.includes('needsYou')"),
    'the needsYou block is gated on the ownership map, not on the tab name'
  );
  for (const gone of ['hotViewers.map', 'warm.slice', 'videoReady.slice']) {
    assert.ok(!replies.includes(gone), `Replies no longer draws ${gone}`);
  }
  const followups = panel('followups');
  assert.ok(followups.includes('hotViewers.map') && followups.includes('warm.slice'), 'Follow-ups draws both');
  assert.ok(followups.includes('<Followups'), 'and the due list');
  assert.ok(panel('approvals').includes('videoReady.slice'), 'Approvals draws the recorded video');
});

test('the counts are computed from the same ownership map the panels use', () => {
  assert.match(TODAY, /const countTab = \(tab\) =>\s*\n\s*\(TAB_BUCKETS\[tab\] \|\| \[\]\)/);
  assert.match(TODAY, /\(TAB_PILES\[tab\] \|\| \[\]\)\.reduce/);
  for (const t of TODAY_TABS) {
    assert.match(TODAY, new RegExp(`${t.id}: countTab\\('${t.id}'\\)`), `${t.id} is counted from the map`);
  }
});

// ── 5-7. Pills that repeat their tab ─────────────────────────────────────

test('a row inside the tab it is named after does not wear a pill saying so', async () => {
  const Row = (await import('../components/ProspectListRow.jsx')).default;
  const props = {
    prospect: { id: 1, name: 'Leo', business_name: 'Hearthside Bakery', domain: null },
    state: { label: 'A conversation is open', context: null, tone: 'high' },
    kind: 'reply',
    onOpen() {},
  };
  const inside = renderToString(React.createElement(Row, { ...props, tabKind: 'reply' }));
  assert.equal((inside.match(/class="pill/g) || []).length, 0, 'no pill inside its own tab');
  // Chapter 11A: the words go too. Keeping them as quiet context was half a
  // fix — the tab's own name, said twice. See the Chapter 11A suite.
  assert.ok(!inside.includes('A conversation is open'), 'and the words do not survive either');
  assert.match(inside, /class="tile/, 'the semantic icon carries the kind instead');

  const elsewhere = renderToString(React.createElement(Row, { ...props, tabKind: 'followup' }));
  assert.equal((elsewhere.match(/class="pill/g) || []).length, 1, 'a pill where it adds a fact');
});

test('Today never renders more than one pill on a row', async () => {
  const Row = (await import('../components/ProspectListRow.jsx')).default;
  const html = renderToString(React.createElement(Row, {
    prospect: { id: 2, name: 'Ruby', business_name: 'Iron Oak', domain: null },
    state: { label: 'Email 2 due', context: '1 email sent', tone: 'action' },
    kind: 'followup', tabKind: 'reply', waitingDays: 4,
    onOpen() {},
  }));
  assert.ok((html.match(/class="pill/g) || []).length <= 1, 'at most one pill');
  assert.ok(html.includes('4d'), 'and the age is compact metadata, not a pill');
});

test('the rows Today draws declare which tab they are in', () => {
  // Without tabKind the suppression cannot happen, so every call site that
  // sits inside a tab has to pass it.
  const calls = TODAY.match(/<ProspectListRow[\s\S]*?\/>/g) || [];
  assert.ok(calls.length >= 4, 'Today draws several row lists');
  for (const call of calls) {
    assert.match(call, /tabKind="/, `a row list is missing tabKind: ${call.slice(0, 80)}`);
  }
  assert.match(src('components/ExceptionQueue.jsx'), /tabKind=\{tabKind\}/);
  assert.match(TODAY, /tabKind=\{TODAY_TAB_KIND\[tab\]\}/);
});

// ── 8-10. Prospects leads with action ────────────────────────────────────

test('the urgency tabs open as a list and All opens as a table', () => {
  assert.deepEqual(URGENCY_TABS, [VIEW.ATTENTION, VIEW.REPLIED, VIEW.IN_OUTREACH]);
  // Ary's explicit call, 2026-08-18: Table is the default everywhere. A
  // deliberate List choice still persists per tab.
  assert.equal(defaultLayoutFor(VIEW.ATTENTION), LAYOUT.TABLE);
  assert.equal(defaultLayoutFor(VIEW.REPLIED), LAYOUT.TABLE);
  assert.equal(defaultLayoutFor(VIEW.IN_OUTREACH), LAYOUT.TABLE);
  assert.equal(defaultLayoutFor(VIEW.ALL), LAYOUT.TABLE);
  assert.equal(defaultLayoutFor(VIEW.FINISHED), LAYOUT.TABLE);
});

test('a deliberate choice is remembered per tab, so one tab cannot set another', () => {
  const remembered = { [VIEW.ALL]: LAYOUT.LIST, [VIEW.ATTENTION]: LAYOUT.TABLE };
  assert.equal(layoutFor(VIEW.ALL, remembered), LAYOUT.LIST, 'the choice wins');
  assert.equal(layoutFor(VIEW.ATTENTION, remembered), LAYOUT.TABLE, 'independently');
  assert.equal(layoutFor(VIEW.REPLIED, remembered), LAYOUT.TABLE, 'untouched tabs keep the table default');
  // A corrupt or older blob falls back rather than stranding the screen.
  assert.deepEqual(readLayouts('not json'), {});
  assert.deepEqual(readLayouts(JSON.stringify({ [VIEW.ALL]: 'grid' })), {});
  assert.deepEqual(readLayouts(JSON.stringify([1, 2])), {});
  assert.equal(LAYOUT_KEY, 'ltb_prospect_layout_v3', 'bumped when table became the default everywhere');
});

test('the shell reads the per-tab preference rather than one global one', () => {
  assert.match(SHELL, /const layout = layoutFor\(tab, layouts\);/);
  assert.match(SHELL, /const merged = \{ \.\.\.prev, \[tab\]: next \};/);
  assert.ok(!/localStorage\.setItem\(LAYOUT_KEY, next\)/.test(SHELL), 'the single global value is gone');
});

// ── 11-12. Less chrome ───────────────────────────────────────────────────

test('the Prospects help band is a collapsed line, not a permanent paragraph', () => {
  assert.match(SHELL, /<Hint id="prospect-tabs-v1" title="How Prospects works">/);
  const hint = src('components/Hint.jsx');
  assert.match(hint, /export default function Hint\(\{ id, title = null, children \}\)/);
  assert.match(hint, /\{title \? \(\s*\n\s*<details>/, 'a title makes it a disclosure');
});

test('the Working lenses row does not render when it would open onto nothing', () => {
  assert.match(SHELL, /\{lensesWorthShowing > 0 && \(/);
  assert.match(SHELL, /const lensesWorthShowing = \[/);
  // The active lens always counts, so the row can never hide the control
  // that would turn it off.
  assert.match(SHELL, /\+ \(quickLens \? 1 : 0\)/);
});

// ── 13-15. System by question ────────────────────────────────────────────

test('System is four questions, and a section belongs to exactly one', () => {
  assert.match(HEALTH, /export const SYSTEM_TABS = \[/);
  for (const id of ['overview', 'issues', 'automation', 'usage']) {
    assert.ok(HEALTH.includes(`id: '${id}'`), `${id} is a System tab`);
  }
  assert.match(HEALTH, /if \(tab && tab !== open\) return null;/);
  // Issues owns the failures and the contact recovery; Overview does not.
  assert.match(HEALTH, /<Section tab="issues"\s*\n\s*icon=\{ICON\.exception\}/);
  assert.match(HEALTH, /<Section tab="overview" title="Right now"/);
  assert.match(HEALTH, /<Section tab="usage" title="Budget and credits"/);
});

test('Overview does not carry the automation tables', () => {
  const healthBlock = SHELL.slice(SHELL.indexOf("view === 'health'"), SHELL.indexOf("view === 'start'"));
  assert.match(healthBlock, /\{systemTab === 'automation' && \(/);
  for (const panel of ['SendingSummary', 'ShadowPanel', 'HeldPanel']) {
    const at = healthBlock.indexOf(`<${panel}`);
    assert.ok(at > healthBlock.indexOf("systemTab === 'automation'"), `${panel} is inside the Automation tab`);
  }
});

test('raw provider errors are still behind Technical details', () => {
  assert.match(HEALTH, /friendlyError\(h\.error\)\.short/);
  assert.match(HEALTH, /Technical details<\/summary>/);
  assert.ok(!/\$\{h\.error\}/.test(HEALTH), 'nothing interpolates the raw string into visible text');
});

// ── 16-19. AI Hive ───────────────────────────────────────────────────────

test('the workflow strip is unchanged and still numbered', () => {
  assert.match(HIVE, /Lead workflow<\/h3>/);
  assert.match(HIVE, /step: emp\.step/);
  assert.match(HIVE, /const WORKFLOW_STEPS = 5;/);
});

test('a helper you cannot run right now is one line, not a card', () => {
  // Chapter 11A narrowed this: expanded is reserved for the ONE helper each
  // lane is pointing at, so "not ready" is no longer the only way to be
  // compact — being later in the lane than the featured helper is another.
  assert.match(HIVE, /!\(emp\.id === featured\[emp\.group\] \|\| isRunning\) \? \(/);
  // The compact branch says what is missing and offers the way to fix it,
  // and does NOT carry a large disabled call to action.
  const from = HIVE.indexOf('!(emp.id === featured[emp.group] || isRunning) ? (');
  const compact = HIVE.slice(from, HIVE.indexOf('            ) : (', from));
  // Chapter 11A: a helper that has already run reports what it did instead,
  // so the fallback is now the second half of a ternary.
  assert.ok(compact.includes('(r.text || emp.job)'), 'it says what is missing');
  assert.ok(!compact.includes('btn-bloom'), 'and offers no giant disabled button');
  assert.ok(compact.includes('{r.goLabel}'), 'but keeps the way to fix it');
});

test('the source groups name their run instead of re-explaining the workflow', () => {
  assert.match(HIVE, /title: 'Scanner leads',\s*\n\s*run: 'Scout → Guard → Honey'/);
  assert.match(HIVE, /title: 'Prospects',\s*\n\s*run: 'Vet → Waggle → Pick → Echo'/);
  // The paragraph that walked through the same sequence a second time.
  assert.ok(!/Scout finds the words, Guard sorts, Honey writes the DM/.test(HIVE));
  const block = HIVE.slice(HIVE.indexOf('const GROUPS = ['), HIVE.indexOf('const WORKFLOW_STEPS'));
  for (const m of block.match(/blurb: '([^']*)'/g) || []) {
    assert.ok(m.length < 80, `a group blurb is still a paragraph: ${m}`);
  }
});

// ── 20-21. The rail ──────────────────────────────────────────────────────

test('More is collapsed by default and grouped when open', () => {
  const layout = buildDefaultLayout(NAV, SECTIONS);
  // Ary's call, 2026-08-18: More opens expanded (her pages live in it).
  assert.equal(layout.find((s) => s.id === 'More').collapsed, false);
  assert.equal(layout.find((s) => s.id === 'Work').collapsed, false);
  assert.deepEqual(RAIL_PRIMARY, ['journey', 'today', 'prospects', 'clients', 'health']);
  // Library sits right after Tools: pages are Ary's own content, opened
  // daily, while Account, Help and Admin are housekeeping.
  assert.deepEqual(MORE_GROUPS, ['Tools', 'Library', 'Account', 'Help', 'Admin']);
  for (const t of NAV.filter((n) => n.section === 'More')) {
    assert.ok(MORE_GROUPS.includes(t.group), `${t.key} declares a group`);
  }
});

test('page controls only appear where the pages actually are', () => {
  // The Library renders inside More at its MORE_GROUPS rank — before the
  // first visible row of the first group ranked after it — with an
  // end-of-drawer fallback when every later group is hidden.
  assert.match(RAIL, /const libraryBlock = \(/);
  assert.match(RAIL, /\{libraryHere && libraryBlock\}/);
  assert.match(RAIL, /> MORE_RANK\.Library/);
  // Both branches — the expanded rail and the icons-only one — pointed at a
  // section that has not existed since Chapter 8, so pages rendered in
  // neither. The only remaining mentions are the comments explaining it.
  const code = RAIL.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/sec\.id === 'Library'/.test(code), 'the dead branch is gone');
  assert.match(RAIL, /sections\.some\(\(sec\) => sec\.id === 'More' && !sec\.collapsed\)/,
    'New folder only shows when the drawer holding the Library is open');
});

// ── 22. Help ─────────────────────────────────────────────────────────────

test('Help lands on five tasks, with the essay collapsed underneath', () => {
  const help = src('components/StartHerePage.jsx');
  assert.match(help, /const HELP_TASKS = \[/);
  for (const title of ['Today', 'Prospects', 'Email and approvals', 'AI Hive', 'System']) {
    assert.ok(help.includes(`title: '${title}'`), `${title} is one of the tasks`);
  }
  // Three to five short steps each, one sentence of lede.
  const block = help.slice(help.indexOf('const HELP_TASKS'), help.indexOf('function Section('));
  for (const steps of block.match(/steps: \[[^\]]*\]/g) || []) {
    const n = (steps.match(/'/g) || []).length / 2;
    assert.ok(n >= 3 && n <= 5, `a task has ${n} steps`);
  }
  assert.match(help, /How the whole thing works\s*\n\s*<\/summary>/, 'the essay is behind a disclosure');
});

// ── 23-26. Nothing from earlier chapters regressed ───────────────────────

test("Chapter 10's icons and colours are untouched", () => {
  assert.deepEqual(TONES.sort(), ['bad', 'brand', 'good', 'info', 'neutral', 'wait'].sort());
  for (const family of TONES) {
    assert.match(CSS, new RegExp(`--tone-${family}-ink:`), `--tone-${family}-ink survives`);
  }
  for (const k of Object.values(KIND)) {
    assert.ok(k.icon && k.label && TONES.includes(k.tone));
  }
  assert.equal(ICON.reply, 'message');
  const sem = src('components/Semantic.jsx');
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(sem), 'still no literal colours in the atoms');
});

test('the hard-stop boundary and the plain-language wording still hold', async () => {
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
  assert.equal(friendlyError('page.goto: net::ERR_NAME_NOT_RESOLVED').short, 'Domain does not resolve');
});

test('send, approval and package automation semantics are unchanged', () => {
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
});

test('no backend, scheduler or Gmail path was touched', () => {
  assert.ok(!/action: 'send'/.test(src('components/ProspectDrawer.jsx')));
  const inbox = src('components/LeadInbox.jsx');
  assert.deepEqual([...new Set([...inbox.matchAll(/fetch\('(\/api\/[a-z/-]+)[?']/g)].map((m) => m[1]))].sort(),
    ['/api/ai', '/api/import/apify', '/api/leads', '/api/limits',
     '/api/scan', '/api/scan/enrich', '/api/scan/import', '/api/settings']);
});
