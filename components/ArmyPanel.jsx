'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import BloomProgress from './BloomProgress';
import ScanBar from './ScanBar';
import { beeAccess } from '../lib/bee-access.mjs';
import { PRICES } from '../lib/credits.mjs';
import CreditsBadge, { refreshCredits } from './CreditsBadge';
import { RUN, isLive, describe, abandonedSummary } from '../lib/scanner-run.mjs';
import { livenessSummary } from '../lib/scanner-liveness.mjs';
import { Pill } from './Semantic';

// The hive: in-app worker bees that RUN, not prompts you copy. Each one
// calls /api/ai with the user's own key (set in Settings) and applies the
// result straight to the database. The prompt content is identical to the
// copy-paste versions in Chat prompts — same brains, no clipboard.
//
// Everything a newbie needs lives on the card or one tap away: the order
// to run things in (step chips), whether a bee has work right now (the
// readiness line, computed from live data), and a per-bee "How to use"
// popup with when / what you need / where results land.
const EMPLOYEES = [
  {
    id: 'scout',
    sheet: { when: 'Starting out, or searches going stale', does: 'Writes 10 buyer phrases', saves: 'The Find panel in Leads' },
    job: 'Find search phrases',
    group: 'find',
    name: 'Scout Bee',
    step: 1,
    tagline: 'Finds the words your buyers type when they need you, and saves them for your searches.',
    action: 'Run a phrase sweep',
    task: 'phrases',
    resultsLabel: 'See them in Leads',
    resultsView: 'inbox',
    guide: {
      what: 'It reads what you sell and who you sell to from your Settings, then comes back with 10 phrases your buyers would actually type. Those phrases go into the Find panel in Leads. You search them on Facebook, Instagram or LinkedIn to find people asking for what you do.',
      when: 'Once when you start, then every week or two. Also any time your searches stop turning up good posts.',
      needs: 'What you sell and who you help, written in Settings. Sidebar, System, Settings, first two boxes.',
      go: 'settings',
      goLabel: 'Open Settings',
      lands: 'In the Search phrases panel in Leads, added to the list you already have. Nothing you saved gets removed.',
      cost: `${PRICES.phrases} credits`,
    },
  },
  {
    id: 'judge',
    sheet: { when: 'New leads have landed', does: 'Marks each one green or red', saves: 'Each lead in your inbox' },
    job: 'Score new leads',
    group: 'find',
    name: 'Guard Bee',
    step: 2,
    tagline: 'Reads every new lead in your inbox and tells you green or red, with the reason.',
    action: 'Score all new leads',
    task: 'score-all',
    resultsLabel: 'See verdicts in Leads',
    resultsView: 'inbox',
    guide: {
      what: 'It checks every unscored lead against the green and red rules you set. Greens get marked qualified, reds get filed under skipped. Each one comes with a written reason, so when you disagree you can see exactly what it was thinking and overrule it.',
      when: 'Right after new leads land in your inbox. The card tells you when there are leads waiting.',
      needs: 'Leads waiting in the Leads tab. Run a scan there, or paste in posts you found yourself.',
      go: 'inbox',
      goLabel: 'Open Leads',
      lands: 'On each lead in your inbox. A green or red verdict, the reasons behind it, and a suggested first line for the greens.',
      cost: `${PRICES['lead-score']} credit per lead`,
    },
  },
  {
    id: 'ghostwriter',
    sheet: { when: 'Guard has marked leads green', does: 'Drafts a DM in your voice', saves: 'The lead record' },
    job: 'Draft outreach',
    group: 'find',
    name: 'Honey Bee',
    step: 3,
    tagline: 'Writes a DM in your voice for every green lead, so you are never staring at a blank box.',
    action: 'Draft for all greens',
    task: 'draft-all',
    resultsLabel: 'Open Leads to read them',
    resultsView: 'inbox',
    guide: {
      what: 'It reads the voice samples you saved in Settings and writes a DM that sounds like you for every green lead that does not have one yet. The draft gets saved in the lead notes. It never sends anything. You copy it, change what you want, and send it yourself from your own account.',
      when: 'After Guard Bee has scored. Greens go in, drafts come out. Usually right after a scoring run.',
      needs: 'At least one green lead that has no draft yet. If you have none, run Guard Bee first.',
      lands: 'On the lead itself. Open any green lead in Leads and the draft sits at the top of the card in its own box with a Copy button. Click the lead in the queue on the left to see it.',
      cost: `${PRICES['lead-draft']} credit per draft`,
    },
  },
  {
    id: 'vet',
    sheet: { when: 'Before a recording session', does: 'Opens each site and rates it', saves: 'Tier and severity on each row' },
    job: 'Check who needs a video',
    group: 'pipeline',
    name: 'Vet Bee',
    step: 4,
    tagline: 'Checks every site again and says who actually earns an audit video. No AI and no recording, just a browser opening each page.',
    action: 'Check who needs a video',
    task: 'precheck',
    // No model call anywhere in its loop, so a missing writing key must not
    // grey it out. It was the one bee that could still run and it was the one
    // bee locked.
    noKey: true,
    resultsLabel: 'See them in Prospects',
    resultsView: 'prospects',
    guide: {
      brief: {
        what: 'Opens every prospect\u2019s site and says who actually earns an audit video.',
        when: 'Before a recording session.',
        result: 'Video tier, severity and reasons written onto each row.',
      },
      what: 'It opens each prospect\u2019s site the same way the recorder would, applies the same rule, and writes the answer back onto the row: the tier, the severity and what it actually found. Two verified problems worth ten between them, or one worth seven alone, earns a video. Anything less does not, because a video about one small thing spends two minutes of a stranger\u2019s attention and then asks for money.',
      when: 'Before a recording session, and any time the severities look wrong. The scan that first rated these read the sites a different way, and where the two disagree this one is right, because it is the one that would have to point a camera at the answer.',
      needs: 'Prospects with a website in the Domain column. It skips anyone without one.',
      go: 'prospects',
      goLabel: 'Open Prospects',
      lands: 'On each row: video tier, severity and reasons, all replaced. Sort by severity in Prospects afterwards and record from the top.',
      cost: `${PRICES.precheck} credit per site, and about a minute each`,
    },
  },
  {
    id: 'analyst',
    sheet: { when: 'Once a week', does: 'Reads the whole pipeline', saves: 'A Pipeline report page' },
    job: 'Write the weekly report',
    group: 'pipeline',
    name: 'Waggle Bee',
    step: 5,
    tagline: 'Reads your whole pipeline and tells you where you are losing people and who you forgot.',
    action: 'Write this week’s report',
    task: 'analyze',
    resultsLabel: 'Open the report',
    resultsView: 'report-page',
    guide: {
      what: 'It reads your real Prospects table, not a summary, and writes you a report. Where people are dropping out of your pipeline, the 5 prospects you have neglected the longest by name, and three specific things to do next week.',
      when: 'Once a week. Monday morning or Friday afternoon, whichever you actually sit down. It reads everything, so running it more often does not tell you more.',
      needs: 'Prospects in your pipeline. The more honest your stages and dates, the more useful this is.',
      go: 'prospects',
      goLabel: 'Open Prospects',
      lands: 'Saved as a new page in your sidebar called Pipeline report. Read it whenever, delete it when you are done with it.',
      cost: `${PRICES.analyze} credits`,
    },
  },
  // The two pipeline-wide bees. beeGated: they read a lot and cost the most,
  // so a workspace only sees them with an allowance (Settings, admin only).
  {
    id: 'picker',
    sheet: { when: 'A day you have half an hour', does: 'Ranks who to contact now', saves: 'A shortlist with messages' },
    job: 'Rank who to contact',
    group: 'pipeline',
    name: 'Pick Bee',
    step: 6,
    beeGated: true,
    tagline: 'Picks the five people most likely to answer today, and writes each message for you.',
    action: "Pick today's five",
    task: 'best5',
    resultsLabel: 'Open the picks',
    resultsView: 'report-page',
    guide: {
      what: 'It ranks everyone active by how likely they are to answer right now. Watching your audit video counts most, then replying before, then a warm stage gone quiet. It comes back with five names, why each one is worth writing to today, and the full message for each, in your voice.',
      when: 'First thing, on a day you have half an hour to send. It skips anyone you already contacted today.',
      needs: 'Prospects in your pipeline. It reads stages, replies and video views, so the more the tracker knows the better the picks.',
      go: 'prospects',
      goLabel: 'Open Prospects',
      lands: "Saved as a new page called Today's five. Read it, copy each message, send them yourself.",
      cost: `${PRICES.best5} credits`,
    },
  },
  {
    id: 'memory',
    sheet: { when: 'Replies start feeling repetitive', does: 'Groups replies by what they meant', saves: 'A What people say page' },
    job: 'Sort what replies say',
    group: 'pipeline',
    name: 'Echo Bee',
    step: 7,
    beeGated: true,
    tagline: 'Reads every reply you logged and tells you what people actually object to, and what worked.',
    action: 'Read my replies',
    task: 'objections',
    resultsLabel: 'Open the read-out',
    resultsView: 'report-page',
    guide: {
      what: 'It sorts every reply you have logged into what people were really saying: price, timing, they have someone already, they would rather do it themselves. Then it looks at which of those later booked a call or took a proposal, and tells you what that path looked like. Your own history, not sales advice from the internet.',
      when: 'Once a month, or whenever replies start feeling repetitive. It needs a few logged replies to say anything honest.',
      needs: 'Replies with their actual words saved. Here is where: open Prospects, click anyone who wrote back, and under "Did they answer?" press Interested, Defer or Decline. A box appears asking what they said. Type it, press Log it. That box is what feeds this, and the reply sync fills it in for you on anything that came through your inbox.',
      go: 'prospects',
      goLabel: 'Open Prospects',
      lands: 'Saved as a new page called What people say. It says plainly when the data is too thin rather than guessing.',
      cost: `${PRICES.objections} credits`,
    },
  },
  {
    id: 'buzz',
    sheet: { when: 'You sit down to batch content', does: 'Writes short-form scripts', saves: 'A Content scripts page' },
    job: 'Write content scripts',
    group: 'content',
    name: 'Buzz Bee',
    step: 8,
    beeGated: true,
    needsHandles: true,
    tagline: 'Reads what already worked on Instagram in your niche, then writes scripts modelled on it.',
    action: 'Write my scripts',
    task: 'content-scripts',
    resultsLabel: 'Open the scripts',
    resultsView: 'report-page',
    guide: {
      brief: {
        what: 'Reads Instagram accounts you name and writes short-form scripts modelled on their best posts.',
        when: 'When you sit down to batch content.',
        result: 'A Content scripts page in your sidebar.',
      },
      what: 'You name two or three Instagram accounts doing well in your niche. It reads their recent posts, keeps the ones that actually pulled numbers, and hands those to the AI as reference points before a word is written. That is the whole trick: an AI asked for "a good hook" invents one, which is why AI scripts read like AI. Given the hooks that really worked, it has something to model instead.',
      when: 'When you sit down to batch content. Once a fortnight is plenty, and the same accounts can be reused.',
      needs: 'The handles, typed on this card. Public accounts only.',
      lands: 'Saved as a page called Content scripts: each one with its hook, which post it was modelled on, the spoken script and the on-screen text. It never copies their words.',
      cost: `${PRICES['content-scripts']} credits`,
    },
  },
];

// Two loops, not one pile. The first three bees turn strangers into leads you
// can write to; the last three work the pipeline you already have. Showing
// six cards in a row made them look like six versions of the same thing.
// Chapter 11: the workflow is explained once, by the strip at the top. These
// used to re-explain it in three paragraphs underneath — "Scout finds the
// words, Guard sorts, Honey writes the DM. You send." is the strip, in prose,
// for the second time. A group now says where its leads come from and which
// helpers work on them, and nothing else.
const GROUPS = [
  {
    id: 'find',
    title: 'Scanner leads',
    run: 'Scout → Guard → Honey',
    blurb: 'Strangers the scanner found: posts, threads, ads.',
  },
  {
    id: 'pipeline',
    title: 'Prospects',
    run: 'Vet → Waggle → Pick → Echo',
    blurb: 'People already in your pipeline, with a site you audited.',
  },
  {
    id: 'content',
    title: 'Your own content',
    run: 'Buzz',
    blurb: 'Nothing to do with leads. Instagram accounts you name.',
  },
];

// The loop, including the two steps only YOU can do. Rendered as a strip so
// a first-timer knows the order without reading four paragraphs.
// The lead workflow, in order, with the two steps only a person can do.
//
// Chapter 9: the numbers are the point. This was a row of coloured pills whose
// order you had to infer from left-to-right reading and the bee names — "AI
// Hive has barely any hierarchy" — so the step number now leads each chip and
// outranks the mascot dot. The bee steps are derived from EMPLOYEES.step
// rather than written out again here, so the strip and the cards can never
// disagree about what step something is.
const WORKFLOW_STEPS = 5;
const LOOP = [
  { bee: 'scout' },
  // The chip already wears a YOU badge, so the label does not start with
  // "You" as well — it read "YOU You gather leads" on screen.
  { label: 'gather the leads', bee: null, hint: 'Search the phrases, paste what you find into Leads' },
  { bee: 'judge' },
  { bee: 'ghostwriter' },
  { label: 'send them', bee: null, hint: 'Copy each draft, tweak it, send from your real account' },
  { bee: 'vet' },
  { bee: 'analyst' },
].map((s) => {
  if (!s.bee) return s;
  const emp = EMPLOYEES.find((e) => e.id === s.bee);
  return { ...s, step: emp.step, label: emp.name.replace(/ Bee$/, ''), hint: emp.tagline };
});

// Premium duotone badges, one gradient per bee — the color IS the identity,
// so the loop strip's dots and the card badges match without labels.
const BEE_STYLE = {
  // A little bee in flight — the scout leaves the hive to find the words.
  scout: {
    from: '#F0B44A', to: '#D97E2B',
    icon: (
      <>
        <path d="M11 4.1 9.7 2.6M13 4.1l1.3-1.5" />
        <circle cx="12" cy="6.4" r="1.9" />
        <ellipse cx="7" cy="11" rx="3" ry="1.9" transform="rotate(-28 7 11)" />
        <ellipse cx="17" cy="11" rx="3" ry="1.9" transform="rotate(28 17 11)" />
        <path d="M12 8.6c2.5 0 4.2 2.2 4.2 5.1S14.5 21 12 21s-4.2-4.4-4.2-7.3 1.7-5.1 4.2-5.1z" />
        <path d="M8.1 12.6h7.8M7.8 15.6h8.4M8.9 18.5h6.2" />
      </>
    ),
  },
  // A honeycomb cell with a check — the guard decides what enters the hive.
  judge: {
    from: '#4BC08B', to: '#1E9A66',
    icon: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M8.8 12.2l2.2 2.2 4.4-4.6" />
      </>
    ),
  },
  // A honey drop mid-drip — the honey bee turns greens into something sweet.
  ghostwriter: {
    from: '#E890AB', to: '#C25680',
    icon: (
      <>
        <path d="M12 2.8s6.2 6.6 6.2 11.1a6.2 6.2 0 0 1-12.4 0C5.8 9.4 12 2.8 12 2.8z" />
        <path d="M9.4 14.3a3 3 0 0 0 2.1 2.6" />
      </>
    ),
  },
  // The waggle dance — a figure-eight is literally how bees report where
  // the good stuff is.
  analyst: {
    from: '#A78BFA', to: '#7A57D1',
    icon: (
      <path d="M17.4 8.4c2.1 0 3.7 1.6 3.7 3.6s-1.6 3.6-3.7 3.6c-3.1 0-7.7-7.2-10.8-7.2-2.1 0-3.7 1.6-3.7 3.6s1.6 3.6 3.7 3.6c3.1 0 7.7-7.2 10.8-7.2z" />
    ),
  },
  // Sound rings coming off a point: what is already carrying in the niche.
  buzz: {
    from: '#F2A0D0', to: '#B54B92',
    icon: (
      <>
        <circle cx="7" cy="12" r="2.4" />
        <path d="M12 8.2a5.4 5.4 0 0 1 0 7.6" />
        <path d="M15.6 5.4a10 10 0 0 1 0 13.2" />
        <path d="M19.2 2.6a14.6 14.6 0 0 1 0 18.8" />
      </>
    ),
  },
  // A checked circle over a site: this one inspects rather than writes, and
  // wears a calm slate so it does not compete with the bees that spend money.
  vet: {
    from: '#8FA6C4', to: '#4C6489',
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m8.4 11 1.9 1.9 3.6-3.8" />
        <path d="m16 16 4.2 4.2" />
      </>
    ),
  },
  // A bloom with one petal picked out — this one chooses the five worth your
  // morning, so the flower the whole app is named for does the choosing.
  picker: {
    from: '#FF9C7A', to: '#E0526B',
    icon: (
      <>
        <circle cx="12" cy="12" r="2.6" />
        <circle cx="12" cy="5.6" r="3" />
        <circle cx="18.4" cy="12" r="3" />
        <circle cx="12" cy="18.4" r="3" />
        <circle cx="5.6" cy="12" r="3" />
      </>
    ),
  },
  // Sound coming back at you — the echo of every reply already sitting in
  // the tracker.
  memory: {
    from: '#5FD3D1', to: '#2A9AA6',
    icon: (
      <>
        <path d="M5 9.5v5" />
        <path d="M8.5 6.5v11" />
        <path d="M12 8.5v7" />
        <path d="M15.5 4.5v15" />
        <path d="M19 9.5v5" />
      </>
    ),
  },
};

// The row's own colour, taken from the badge gradient the bee already owns.
// The cards used to sit on --surface with a hairline border, which on the
// dark theme is very nearly the page itself: six boxes that had to be looked
// for. A tinted wash and a solid left edge in the bee's colour make each row
// the thing it is.
export function beeTint(id, ready = true) {
  const s = BEE_STYLE[id];
  if (!s) return {};
  // The left edge is identity and never fades: you can find a bee by its
  // colour alone. The wash is restraint, not decoration, so it is barely
  // there and it disappears entirely on a row that has no work, which is how
  // a blocked step reads as blocked without being greyed into illegibility.
  return {
    borderLeft: `4px solid ${ready ? s.to : 'var(--line-strong)'}`,
    background: ready
      ? `linear-gradient(90deg, ${s.to}14, var(--panel) 260px)`
      : 'var(--panel)',
  };
}

function BeeBadge({ id, size = 40, buzzing = false }) {
  const s = BEE_STYLE[id];
  if (!s) return null;
  return (
    <span
      className={'inline-flex items-center justify-center r-lg shrink-0 ' + (buzzing ? 'hive-working' : '')}
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
        boxShadow: `0 4px 14px -4px ${s.to}66`,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ width: size * 0.5, height: size * 0.5 }}
      >
        {s.icon}
      </svg>
    </span>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto slim-scroll r-lg border border-line bg-panel shadow-card p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="font-serif ui-display text-bright leading-tight">{title}</div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 r-sm text-ink-3 hover:text-ink hover:bg-hover-wash-soft transition inline-flex items-center justify-center"><Icon name="x" className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HowItWorksModal({ onClose }) {
  return (
    <ModalShell title="How the AI Hive works" onClose={onClose}>
      {/* Four lines, not four paragraphs. The long version told the whole
          story to someone who came here to press one button. */}
      <ul className="ui-body text-ink-2 leading-relaxed space-y-2.5">
        <li><b className="text-ink">Work left to right.</b> The step numbers are the order.</li>
        <li><b className="text-ink">Nothing is ever sent.</b> Results land in your own database. You send.</li>
        <li><b className="text-ink">Re-running is safe.</b> Finished work is kept and skipped, never redone.</li>
        {/* Asked before pressing, not discovered afterwards. The live line
            under a running batch already says this; somebody deciding whether
            to start one at all cannot see that line yet. */}
        <li><b className="text-ink">Stop is safe too.</b> It stops the next one starting. Whatever is already in progress finishes, and everything done before you pressed it is kept.</li>
        <li><b className="text-ink">Cost is small.</b> Except the weekly report, which reads everything. Once a week is plenty.</li>
      </ul>
    </ModalShell>
  );
}

// The first sentence of a paragraph, which is what most of these guides
// already lead with. Where it does not stand on its own, the employee carries
// an explicit `guide.brief` instead (Vet and Buzz) rather than every one of
// them repeating copy that derives correctly.
function firstSentence(text) {
  const t = String(text || '').trim();
  const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

function BeeGuideModal({ emp, onClose, onNavigate }) {
  const g = emp.guide;
  // Chapter 10: a cheat sheet, not a summary.
  //
  // Chapter 9 got this down from five paragraphs to four short lines, and Ary's
  // verdict was that four short lines of identical white text is still flat.
  // So the label is a coloured chip, the value is one phrase, and the whole
  // default view is under 180 characters — you read it the way you read a
  // recipe card, not the way you read a page.
  const sh = emp.sheet || {};
  const b = g.brief || {};
  const SHORT = [
    ['WHEN', sh.when || b.when || firstSentence(g.when), 'wait'],
    ['DOES', sh.does || b.what || firstSentence(g.what), 'info'],
    ['SAVES TO', sh.saves || b.result || firstSentence(g.lands), 'good'],
    ['COST', g.cost, 'neutral'],
  ];
  const LONG = [
    ['What it does', g.what],
    ['When to run it', g.when],
    ['What you need first', g.needs],
    ['Where results land', g.lands],
  ];
  return (
    <ModalShell
      title={<span className="inline-flex items-center gap-2.5"><BeeBadge id={emp.id} size={32} /> {emp.name}</span>}
      onClose={onClose}
    >
      <div className="ui-body text-ink-2 leading-relaxed">
        {/* The job, said once, under the name in the title bar. */}
        <p className="ui-body font-semibold text-ink -mt-1 mb-3">{emp.job}</p>

        <dl className="space-y-2">
          {SHORT.filter(([, text]) => text).map(([label, text, tone]) => (
            <div key={label} className="flex items-baseline gap-2.5">
              <dt
                className="shrink-0 w-[74px] text-right ui-meta font-bold uppercase tracking-[0.07em] px-1.5 py-0.5 r-sm"
                style={{
                  color: `var(--tone-${tone}-ink)`,
                  background: `var(--tone-${tone}-bg)`,
                }}
              >
                {label}
              </dt>
              <dd className="min-w-0 flex-1 ui-body text-ink">{text}</dd>
            </div>
          ))}
        </dl>

        <details className="pt-4 mt-3 border-t border-line">
          <summary className="cursor-pointer ui-small font-semibold text-ink-2 hover:text-ink transition">
            More details
          </summary>
          <div className="mt-2.5 space-y-3">
            {LONG.map(([label, text]) => (
              <p key={label}>
                <b className="text-ink block ui-small font-semibold mb-0.5">{label}</b>
                {text}
              </p>
            ))}
          </div>
        </details>
        {/* Telling someone where a thing lives and leaving them to find it is
            how a guide becomes another thing to work out. This takes them. */}
        {g.go && onNavigate && (
          <button
            onClick={() => { onNavigate(g.go); onClose(); }}
            className="ui-body font-semibold px-4 py-2 r-md btn-bloom transition"
          >
            {g.goLabel || 'Take me there'}
          </button>
        )}
      </div>
    </ModalShell>
  );
}

// The workers that walk a list one item at a time. Everything else is a single
// call, where a Stop button would be a button that does nothing.
const STOPPABLE = new Set(['score-all', 'draft-all', 'precheck']);

export default function ArmyPanel({ onReport, onNavigate, onOpenPage, prospectCount = 0, prospects = [], onProspectsChanged }) {
  const [keySet, setKeySet] = useState(null); // null = loading
  const [running, setRunning] = useState(null); // employee id
  const [status, setStatus] = useState({}); // id -> { msg, ok } feedback per bee
  const [progress, setProgress] = useState({}); // id -> { done, total, label } real N-of-M
  const [howOpen, setHowOpen] = useState(false);
  const [guideFor, setGuideFor] = useState(null); // employee object
  const [leads, setLeads] = useState(null); // null = loading
  // Survives a reload: before this, the "Open the report" button existed only
  // for the session that generated it, and a refresh sent you digging through
  // the sidebar for the page.
  const REPORT_PAGE_KEY = 'ltb_bee_report_pages';
  // One id per bee. They shared a single key, so running Buzz Bee repointed
  // Waggle Bee's "Open the report" button at the Instagram scripts.
  const [reportPages, setReportPages] = useState({});
  // The two heaviest bees only appear where they are allowed. The server
  // refuses them anyway; this keeps a workspace from seeing a button that
  // can only ever answer no.
  const [beeOk, setBeeOk] = useState(false);
  // Buzz Bee's two inputs. Kept on the card rather than in Settings: they are
  // the question the bee asks, and they change per batch.
  const HANDLES_KEY = 'ltb_buzz_handles';
  const VIEWS_KEY = 'ltb_buzz_minviews';
  const [handles, setHandles] = useState('');
  const [minViews, setMinViews] = useState('50000');
  useEffect(() => {
    try {
      setHandles(localStorage.getItem(HANDLES_KEY) || '');
      setMinViews(localStorage.getItem(VIEWS_KEY) || '50000');
    } catch {}
  }, []);
  useEffect(() => { beeAccess().then((a) => setBeeOk(a.allowed)); }, []);
  // Long loops check this before each site so closing the Hive ends them.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  // The run behind whichever scanner is going, as the server sees it.
  //
  // These loops live in this tab, so a stop that only existed here would be
  // forgotten the moment the tab reloaded. The run is a row: this reports
  // progress against it and reads its state back on the same call, and Stop
  // writes to it. Nothing extra is fetched to notice a stop.
  const [runState, setRunState] = useState(null);   // { id, scanner, state, ... }
  const runRef = useRef(null);
  const stopRef = useRef(false);

  // A run that died and was closed, so Ary finds out here rather than only in
  // System health. Nothing rendered it before: the Hive only ever drew a run
  // while this tab was the one driving it, so a run that died in a previous
  // session left no trace on the page it was started from.
  const [lastIncident, setLastIncident] = useState(null);

  // Close out runs whose tab went away, so an old one does not sit on screen
  // claiming to still be going. Then look at what came back.
  useEffect(() => {
    let alive = true;
    (async () => {
      await fetch('/api/scanner-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconcile', id: 0 }),
      }).catch(() => {});

      const d = await fetch('/api/scanner-runs').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive || !d?.runs?.length) return;
      const newest = d.runs[0];
      if (newest.state !== RUN.ABANDONED) return;
      // Recent only. The same day-long window System health uses: an incident
      // nobody can act on any more is history, not a warning.
      const closed = Date.parse(String(newest.finished_at || '').replace(' ', 'T') + 'Z');
      if (Number.isFinite(closed) && Date.now() - closed > 24 * 60 * 60 * 1000) return;
      setLastIncident(newest);
    })();
    return () => { alive = false; };
  }, []);

  // The Vet Bee's run, watched rather than driven.
  //
  // Its work happens in the queue now, so this tab is a spectator: it starts the
  // run, then polls it, and closing the page changes nothing. Kept apart from
  // `runState` because that one belongs to the loops still running here, and
  // this one has to survive a reload and a `run()` that already returned.
  const [serverRun, setServerRun] = useState(null);
  // How fast it has been going lately, or null when too few have finished for
  // the answer to be worth anything.
  const [speed, setSpeed] = useState(null);
  // Why the run is quiet, when it is. Waiting for a free site checker is not a
  // failure and must never be worded like one.
  const [waiting, setWaiting] = useState(null);

  // Pick a live scan back up. This is the whole point of the change: come back
  // an hour later, on a different device, and the run is still there going.
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await fetch('/api/scanner-runs').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive) return;
      const live = (d?.runs || []).find((r) => r.scanner === 'precheck' && r.durable && isLive(r.state));
      if (live) setServerRun(live);
    })();
    return () => { alive = false; };
  }, []);

  // Watching it. Every few seconds while it is alive, and never otherwise.
  useEffect(() => {
    if (!serverRun || !isLive(serverRun.state)) return undefined;
    let alive = true;
    const id = setInterval(async () => {
      const d = await fetch(`/api/scanner-runs?id=${serverRun.id}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive || !d?.run) return;
      setServerRun(d.run);
      // Only shown once there are enough finished checks for the number to
      // hold still. The server decides that, not this page.
      setSpeed(d.speed?.enough ? d.speed : null);
      setWaiting(d.liveness || null);
      if (!isLive(d.run.state)) {
        const s = describe(d.run);
        say('vet', `${s.text}${s.detail ? ` ${s.detail}` : ''}`, d.run.state !== RUN.FAILED);
        if (onProspectsChanged) onProspectsChanged();
        refreshCredits();
      }
    }, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [serverRun?.id, serverRun?.state]);

  async function startRun(scanner, total, label, prospectIds = null) {
    stopRef.current = false;
    try {
      const r = await (await fetch('/api/scanner-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', scanner, total, label, ...(prospectIds ? { prospectIds } : {}) }),
      })).json();
      if (prospectIds) { setServerRun(r.run || null); return r.run || null; }
      runRef.current = r.run || null;
      setRunState(r.run || null);
      return r.run || null;
    } catch { return null; }
  }

  // Progress and the stop check, in one call. Returns false when the loop
  // should put the work down.
  async function tick(processed, total, extra = {}) {
    const run = runRef.current;
    if (!run) return !stopRef.current;
    if (stopRef.current) return false;
    try {
      const r = await (await fetch('/api/scanner-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'progress', id: run.id, processed, total, ...extra }),
      })).json();
      if (r.run) { runRef.current = r.run; setRunState(r.run); }
      return r.mayContinue ? r.mayContinue.ok : true;
    } catch {
      // A failed progress report is not a reason to abandon real work.
      return !stopRef.current;
    }
  }

  async function finishRun(counts = {}) {
    const run = runRef.current;
    if (!run) return;
    try {
      const r = await (await fetch('/api/scanner-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', id: run.id, ...counts }),
      })).json();
      if (r.run) setRunState(r.run);
    } catch {}
    runRef.current = null;
  }

  // Stop. Instant in this tab, and recorded on the server so a reload agrees.
  async function stopRun() {
    const run = runRef.current || runState;
    if (serverRun && isLive(serverRun.state)) {
      // A server run keeps going whether or not this tab is here, so stopping
      // it is a request to the server and not a flag in this page.
      setServerRun((x) => (x ? { ...x, state: RUN.STOPPING } : x));
      const r = await fetch('/api/scanner-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', id: serverRun.id }),
      }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (r?.run) setServerRun(r.run);
      return;
    }
    if (!run) return;
    stopRef.current = true;
    setRunState((x) => (x ? { ...x, state: 'STOPPING' } : x));
    try {
      const r = await (await fetch('/api/scanner-runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', id: run.id }),
      })).json();
      if (r.run) setRunState(r.run);
    } catch {}
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REPORT_PAGE_KEY) || '{}');
      if (saved && typeof saved === 'object') setReportPages(saved);
    } catch {}
  }, []);
  const setReportPageId = (beeId, id) => {
    setReportPages((prev) => {
      const next = { ...prev };
      if (id == null) delete next[beeId];
      else next[beeId] = id;
      try { localStorage.setItem(REPORT_PAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  async function refreshLeads() {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch {
      setLeads([]);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (alive) setKeySet(Boolean(data.settings?.aiKeySet));
      } catch {
        if (alive) setKeySet(false);
      }
    })();
    refreshLeads();
    return () => { alive = false; };
  }, []);

  // Live worklists, so every card can say whether there is anything to do.
  const unscored = (leads || []).filter((l) => !l.verdict && l.status !== 'promoted');
  const undrafted = (leads || []).filter(
    (l) => l.verdict === 'green' && l.status !== 'promoted' && !(l.notes || '').includes('--- AI draft ---')
  );

  // What each bee would say about its queue right now. `go` renders as a
  // small navigation link next to the readiness line.
  // Which single helper each lane is currently pointing at.
  //
  // Chapter 11A: "runnable" was being drawn as "do this", so six helpers wore
  // full cards and the question "what should I do next" needed six
  // comparisons. A lane features the earliest helper that has real work
  // waiting; if none does, it features the earliest one that can run at all,
  // which is the helper that would create work for the rest of the lane.
  //
  // Nothing new is computed here. `pending` comes from counts readiness
  // already produced (unscored leads, undrafted greens) and every other
  // helper simply has none, which is the honest answer rather than a
  // fabricated one.
  function featuredFor(lane) {
    const inLane = EMPLOYEES
      .filter((e) => e.group === lane && (!e.beeGated || beeOk))
      .sort((a, b) => a.step - b.step);
    const withWork = inLane.find((e) => {
      const r = readiness(e);
      return r.ready && Number(r.pending) > 0;
    });
    if (withWork) return withWork.id;
    const anyReady = inLane.find((e) => readiness(e).ready);
    return anyReady ? anyReady.id : null;
  }

  function readiness(emp) {
    if (leads === null) return { text: '', ready: true };
    if (emp.id === 'scout') {
      return { text: 'Ready whenever. New phrases merge into your list.', ready: true };
    }
    if (emp.id === 'judge') {
      return unscored.length
        ? { text: `${unscored.length} lead${unscored.length === 1 ? '' : 's'} waiting at the door.`, ready: true, pending: unscored.length }
        : { text: 'No unscored leads. Add finds to Leads first.', ready: false, go: 'inbox', goLabel: 'Open Leads' };
    }
    if (emp.id === 'ghostwriter') {
      return undrafted.length
        ? { text: `${undrafted.length} green${undrafted.length === 1 ? '' : 's'} waiting for a draft.`, ready: true, pending: undrafted.length }
        : { text: 'No greens without drafts. Run Guard Bee (step 2) first.', ready: false };
    }
    if (emp.id === 'analyst') {
      return prospectCount > 0
        ? { text: `Will read all ${prospectCount} prospects.`, ready: true }
        : { text: 'Your pipeline is empty. Nothing to report on yet.', ready: false, go: 'prospects', goLabel: 'Open Prospects' };
    }
    if (emp.id === 'buzz') {
      const list = handles.split(/[\n,]/).map((h) => h.trim()).filter(Boolean);
      return list.length
        ? { text: `Will read ${list.length} account${list.length === 1 ? '' : 's'} and keep what beat ${Number(minViews || 0).toLocaleString()}.`, ready: true }
        : { text: 'Name the accounts to learn from first.', ready: false };
    }
    if (emp.id === 'vet') {
      const n = (prospects || []).filter((x) => x && x.domain).length;
      return n
        ? { text: `Will check ${n} site${n === 1 ? '' : 's'}, about a minute each.`, ready: true }
        : { text: 'No prospects with a website yet.', ready: false, go: 'prospects', goLabel: 'Open Prospects' };
    }
    if (emp.id === 'picker') {
      return prospectCount > 0
        ? { text: `Will rank all ${prospectCount} and pick five.`, ready: true }
        : { text: 'Your pipeline is empty, so there is nobody to pick.', ready: false, go: 'prospects', goLabel: 'Open Prospects' };
    }
    if (emp.id === 'memory') {
      return { text: 'Reads every reply you have logged.', ready: true };
    }
    return { text: '', ready: true };
  }

  // One obvious thing to do. The Hive showed six equal cards and no answer to
  // "where do I start", which is the only question somebody opening it has.
  // Whichever bee has real work waiting wins, in loop order.
  function nextUp() {
    if (!keySet || leads === null) return null;
    const order = ['judge', 'ghostwriter', 'picker', 'analyst', 'scout'];
    for (const id of order) {
      const emp = EMPLOYEES.find((e) => e.id === id);
      if (!emp) continue;
      if (emp.beeGated && !beeOk) continue;
      const r = readiness(emp);
      if (!r.ready) continue;
      // Scout is always "ready", so it is the fallback rather than a suggestion.
      if (id === 'scout') return { emp, why: 'Nothing is waiting. Go find new words to search.' };
      return { emp, why: r.text };
    }
    return null;
  }

  function say(id, msg, ok = true) {
    setStatus((prev) => ({ ...prev, [id]: { msg, ok } }));
  }

  // Real N-of-M for the batch bees. One API call per lead, so `done` only
  // ever counts work that actually finished — the stem may not draw ahead of
  // the calls that returned.
  function step(id, done, total, label) {
    setProgress((prev) => ({ ...prev, [id]: { done, total, label } }));
  }
  function clearStep(id) {
    setProgress((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function aiCall(payload) {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function run(emp) {
    if (running) return;
    setRunning(emp.id);
    say(emp.id, 'Working…');
    try {
      if (emp.task === 'phrases') {
        const data = await aiCall({ task: 'phrases' });
        say(emp.id, `Added ${data.added.length} phrases (${data.total} total).`);
      } else if (emp.task === 'score-all') {
        const targets = unscored;
        if (!targets.length) { say(emp.id, 'Nothing to score. The inbox is clean.'); return; }
        let green = 0, red = 0;
        step(emp.id, 0, targets.length, 'Checking buyer intent');
        await startRun('score-all', targets.length, 'Checking buyer intent');
        let cut = false;
        for (let i = 0; i < targets.length; i++) {
          if (!aliveRef.current) return;
          const data = await aiCall({ task: 'score', leadId: targets[i].id });
          if (data.verdict === 'green') green++; else red++;
          // Counted AFTER the call returns, never before.
          step(emp.id, i + 1, targets.length, 'Checking buyer intent');
          // Asked before the next one starts, so the item in flight always
          // finishes and its answer is kept.
          if (!(await tick(i + 1, targets.length, { succeeded: green + red }))) {
            cut = i + 1 < targets.length;
            break;
          }
        }
        await finishRun({ processed: green + red, succeeded: green + red });
        say(emp.id, cut
          ? `Stopped. Everything already done was kept: ${green} green, ${red} red of ${targets.length}.`
          : `Done: ${green} green, ${red} red.`);
        refreshLeads();
      } else if (emp.task === 'draft-all') {
        const targets = undrafted;
        if (!targets.length) { say(emp.id, 'Every green already has a draft.'); return; }
        step(emp.id, 0, targets.length, 'Writing your messages');
        await startRun('draft-all', targets.length, 'Writing your messages');
        let wrote = 0;
        let cutDrafts = false;
        for (let i = 0; i < targets.length; i++) {
          if (!aliveRef.current) return;
          await aiCall({ task: 'draft', leadId: targets[i].id });
          wrote += 1;
          step(emp.id, i + 1, targets.length, 'Writing your messages');
          if (!(await tick(i + 1, targets.length, { succeeded: wrote }))) {
            cutDrafts = i + 1 < targets.length;
            break;
          }
        }
        await finishRun({ processed: wrote, succeeded: wrote });
        say(emp.id, cutDrafts
          ? `Stopped. The ${wrote} already written were kept.`
          : `Done: ${wrote} draft${wrote === 1 ? '' : 's'} written.`);
        refreshLeads();
      } else if (emp.task === 'content-scripts') {
        const list = handles.split(/[\n,]/).map((h) => h.trim().replace(/^@/, '')).filter(Boolean);
        if (!list.length) { say(emp.id, 'Name at least one account first.'); return; }
        say(emp.id, 'Reading their posts. This takes a minute.');
        const data = await aiCall({
          task: 'content-scripts',
          handles: list,
          minViews: Number(minViews) || 0,
          count: 5,
        });
        if (onReport) {
          const pageId = await onReport(data.scripts, 'Content scripts', '🎬');
          if (pageId) setReportPageId(emp.id, pageId);
        }
        say(emp.id, `Wrote 5 scripts from ${data.usedPosts} posts that worked, best one at ${Number(data.topReach || 0).toLocaleString()}.`);
      } else if (emp.task === 'precheck') {
        // This used to be a for-loop right here: one site a minute, one HTTP
        // call at a time, for as long as the tab stayed open. It asked for
        // 5,484 sites once, got through 70, and the laptop slept. Nothing was
        // left to say which 5,414 had not been done.
        //
        // Now the list is written down and the queue works through it. Starting
        // is all this page does.
        const targets = (prospects || []).filter((x) => x && x.domain);
        if (!targets.length) { say(emp.id, 'No prospects with a website to check.'); return; }
        const started = await startRun('precheck', targets.length, 'Opening their sites', targets.map((t) => t.id));
        if (!started) { say(emp.id, 'Could not start that scan. Try again in a moment.', false); return; }
        const n = Number(started.total || targets.length);
        say(emp.id, started.state === RUN.RUNNING && started.processed
          ? `Carrying on with the scan already going: ${started.processed} of ${n} done.`
          : `Started on ${n.toLocaleString('en-US')} site${n === 1 ? '' : 's'}. You can close this page. LTB keeps working in the background.`);
      } else if (emp.task === 'best5') {
        say(emp.id, 'Ranking everyone active. This one takes a moment.');
        const data = await aiCall({ task: 'best5' });
        if (onReport) {
          const pageId = await onReport(data.picks, "Today's five", '⭐');
          if (pageId) setReportPageId(emp.id, pageId);
          say(emp.id, `Picked from ${data.considered} people.`);
        } else {
          say(emp.id, 'Picks ready.');
        }
      } else if (emp.task === 'objections') {
        say(emp.id, 'Reading your replies.');
        const data = await aiCall({ task: 'objections' });
        if (onReport) {
          const pageId = await onReport(data.report, 'What people say', '💬');
          if (pageId) setReportPageId(emp.id, pageId);
          say(emp.id, `Read ${data.replies} replies.`);
        } else {
          say(emp.id, 'Read-out ready.');
        }
      } else if (emp.task === 'analyze') {
        say(emp.id, 'Reading the pipeline… (30–60 seconds)');
        const data = await aiCall({ task: 'analyze' });
        if (onReport) {
          const pageId = await onReport(data.report);
          if (pageId) setReportPageId(emp.id, pageId);
          say(emp.id, `Report ready (${data.prospectCount} prospects analyzed).`);
        } else {
          say(emp.id, 'Report ready.');
        }
      }
    } catch (e) {
      say(emp.id, `Failed: ${e.message}`, false);
    } finally {
      setRunning(null);
      clearStep(emp.id);
      refreshCredits();
    }
  }

  // Where the "view results" button for a finished run goes.
  function resultsAction(emp) {
    if (emp.resultsView === 'report-page') {
      const pageId = reportPages[emp.id];
      if (!pageId || !onOpenPage) return null;
      return () => onOpenPage(pageId);
    }
    if (!onNavigate) return null;
    return () => onNavigate(emp.resultsView);
  }


  // One featured helper per lane, computed once. Everything else is compact.
  const featured = Object.fromEntries(GROUPS.map((g) => [g.id, featuredFor(g.id)]));
  const nothingToRun = Object.values(featured).every((id) => !id);

  return (
    <div className="w-full max-w-[1500px] mx-auto mb-8">
      {/* Hero: who the hive is, whether it's awake, and the one door to
          the full explanation. */}
      <div className="glass-panel px-6 py-5 mb-4">
        <div className="flex items-center gap-3.5 flex-wrap">
          <span
            className="w-11 h-11 r-lg inline-flex items-center justify-center text-white bee-bob shrink-0"
            style={{ background: 'linear-gradient(135deg, #F0B44A, #D97E2B)', boxShadow: '0 4px 14px -4px #D97E2B66' }}
            aria-hidden="true"
          >
            <Icon name="bee" className="w-6 h-6" strokeWidth={1.8} />
          </span>
          <div className="flex-1 min-w-[220px]">
            <div className="ui-display font-semibold text-bright leading-tight">Your AI Hive</div>
            <div className="ui-body text-ink-2">
              {keySet === null
                ? 'Waking the hive…'
                : keySet
                  ? 'Ready to go. One click per bee, and nothing gets sent without you.'
                  : 'Not running yet. Every bee except Vet Bee needs an AI connection, and that lives in your admin’s Settings. Vet Bee only opens websites, so it works either way.'}
            </div>
          </div>
          {keySet === false ? (
            <button
              onClick={() => onNavigate && onNavigate('settings')}
              className="ui-body font-medium px-4 py-2 rounded-lg btn-bloom transition"
            >
              Open Settings
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <CreditsBadge />
              <button
                onClick={() => setHowOpen(true)}
                className="ui-body font-medium px-3.5 py-2 rounded-lg border border-line-strong text-ink hover:text-rose-text hover:border-rose transition"
              >
                How it works
              </button>
            </span>
          )}
        </div>

        {/* A run that stopped on its own. Quiet on purpose: nothing here needs
            fixing, the completed work is safe, and the only thing to decide is
            whether to scan again. Alarming styling would be a lie about how
            much trouble this is. */}
        {lastIncident ? (() => {
          const sum = abandonedSummary(lastIncident);
          const at = (v) => (v ? String(v).replace(' ', ' at ').slice(0, 16) : null);
          return (
            <div className="mt-4 border border-line-strong r-md bg-panel shadow-card p-4">
              <p className="ui-heading font-semibold text-ink">{sum.headline}</p>
              <p className="ui-body text-ink-2 leading-relaxed mt-0.5">
                <span className="font-semibold text-ink">{sum.progress}</span>. {sum.kept}
              </p>
              <p className="ui-small text-ink-2 leading-relaxed mt-1">{sum.next}</p>
              <details className="mt-2">
                <summary className="cursor-pointer ui-small text-ink-3 hover:text-ink-2 transition">
                  Technical details
                </summary>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 ui-small">
                  {[
                    ['Run', `#${lastIncident.id} · ${lastIncident.scanner}`],
                    ['Started', at(lastIncident.started_at)],
                    ['Last reported', at(lastIncident.heartbeat_at)],
                    ['Closed', at(lastIncident.finished_at)],
                    ['Reason', lastIncident.stop_reason],
                    ['State', lastIncident.state],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="text-ink-2 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>
          );
        })() : null}

        {/* Lead workflow: the order, said as an order. Wraps to as many rows
            as it needs instead of scrolling sideways, because a sequence you
            have to drag to finish reading is not a sequence you can see. */}
        <div className="mt-5">
          <h3 className="ui-small font-semibold uppercase tracking-[0.08em] text-ink-2 mb-2">Lead workflow</h3>
          {nothingToRun && (
            <p className="ui-body text-ink-2 mb-3">Nothing needs running right now.</p>
          )}
          <ol className="flex items-center gap-x-2 gap-y-2 flex-wrap">
            {LOOP.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span
                  title={s.hint || ''}
                  className={`inline-flex items-center gap-2 px-3 py-2 r-md ui-small font-semibold whitespace-nowrap border ${
                    s.bee
                      ? 'border-line-strong bg-surface-subtle text-ink'
                      : 'border-dashed border-rose-line bg-rose-tint text-rose-text'
                  }`}
                >
                  {s.bee ? (
                    <>
                      {/* The number leads. The bee's colour is still here, as
                          a dot behind the digit, but it is no longer the only
                          thing telling you where in the run this sits. */}
                      {/* Flat, not a gradient: the number is the signal and a
                          gradient chip beside seven others is decoration. It
                          is a size larger than the label it precedes, which
                          is what "the number outranks the mascot" means. */}
                      <span
                        className="w-6 h-6 r-sm shrink-0 inline-flex items-center justify-center ui-small font-bold text-white"
                        style={{ background: BEE_STYLE[s.bee].to }}
                      >
                        {s.step}
                      </span>
                      {s.label}
                    </>
                  ) : (
                    <>
                      <span className="ui-meta font-bold tracking-wide" aria-hidden="true">YOU</span>
                      {s.label}
                    </>
                  )}
                </span>
                {i < LOOP.length - 1 && <span className="text-ink-3 ui-small" aria-hidden="true">→</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Start here. One card, the bee with actual work, a real count and one
          button. Everything below is the full shelf for when she wants it. */}
      {(() => {
        const up = nextUp();
        if (!up) return null;
        const st = status[up.emp.id];
        const isRunning = running === up.emp.id;
        return (
          <div className="mt-5 rounded-2xl border border-rose-line bg-blush-soft p-5 flex items-start gap-4 flex-wrap">
            <BeeBadge id={up.emp.id} size={52} buzzing={isRunning} />
            <div className="min-w-0 flex-1">
              <span className="block ui-meta font-bold uppercase tracking-[0.1em] text-rose-text mb-0.5">Start here</span>
              <span className="block ui-heading font-semibold text-bright leading-snug">{up.why}</span>
              <span className="block ui-body text-ink-2 mt-0.5">{up.emp.name} handles this. {up.emp.tagline}</span>
              {st && !isRunning && (
                <span className={'block ui-small mt-1 ' + (st.ok ? 'text-leaf-text' : 'text-poppy-text')}>{st.msg}</span>
              )}
            </div>
            <button
              onClick={() => run(up.emp)}
              disabled={running !== null}
              className="ui-heading font-semibold px-5 py-2.5 r-md btn-bloom transition disabled:opacity-50 shrink-0"
            >
              {isRunning ? 'Working…' : up.emp.action}
            </button>
          </div>
        );
      })()}

      {/* The bees, in their lanes. One helper per lane is drawn as a card —
          the one that lane is pointing at — and the rest are lines. */}
      {GROUPS.map((g) => {
        const mine = EMPLOYEES.filter((emp) => emp.group === g.id && (!emp.beeGated || beeOk));
        if (!mine.length) return null;
        return (
        <div key={g.id} className="mt-8 first:mt-0">
          {/* Chapter 8: "AI Hive has barely any hierarchy" — a bold 13px line
              over a paragraph, in front of cards carrying heavy borders and
              shadows, is not a heading, it is a sentence. The group header is
              a band now, so the three groups read as three groups. */}
          <div className="border-b-2 border-line-strong pb-2 mb-4">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h3 className="ui-heading font-semibold text-bright">{g.title}</h3>
              <span className="ui-small font-semibold text-ink-2 num-tabular">{g.run}</span>
            </div>
            <p className="ui-small text-ink-2 mt-1 max-w-[70ch]">{g.blurb}</p>
          </div>
          <div className="flex flex-col gap-3">
        {mine.map((emp) => {
          const r = readiness(emp);
          const st = status[emp.id];
          // Was a prefix match on four hand-written phrases, so the four bees
          // added later finished successfully and never showed their button.
          const done = !!(st && st.ok);
          const openResults = done ? resultsAction(emp) : null;
          // The Vet Bee's run belongs to the server, so its card follows that
          // row rather than whether this tab happens to be inside `run()`.
          const watching = emp.task === 'precheck' && serverRun && isLive(serverRun.state) ? serverRun : null;
          const disabled = (!keySet && !emp.noKey) || running !== null || Boolean(watching) || (leads !== null && !r.ready);
          const isRunning = running === emp.id || Boolean(watching);
          const card = watching || runState;
          // Only for the run this page is watching, and only for a healthy wait.
          const waitCopy = emp.task === 'precheck' && waiting
            && (waiting.mode === 'WAITING_CAPACITY' || waiting.mode === 'WAITING_BUDGET')
            ? livenessSummary(waiting) : null;
          const prog = watching
            ? { done: Number(watching.processed || 0), total: Number(watching.total || 0), label: 'Opening their sites' }
            : progress[emp.id];
          return (
            // Chapter 11: a helper you cannot run right now is a line, not a
            // card. Every helper the same size meant the one thing that was
            // actually actionable had to be found by reading five identical
            // boxes. Blocked helpers say what is missing and stop there.
            // Chapter 11A: expanded is reserved for the ONE helper each lane
            // is pointing at, plus whatever is actually running.
            //
            // `done` used to expand a helper too, and that quietly undid the
            // cap: `status` has a single writer and is never cleared, so
            // `done` only ever accumulates. Run three helpers and three cards
            // are open on top of the featured one — the wall of equal cards
            // this chapter exists to remove, rebuilt by using the page. Only
            // a run in progress earns the extra card now, and at most one can
            // run at a time. What a finished helper had to say moves into its
            // compact row, so nothing is lost.
            !(emp.id === featured[emp.group] || isRunning) ? (
              <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5 r-md border border-line flex-wrap">
                {/* Helpers outside the five-step run have no step to show,
                    and a bare em dash where a number goes reads as missing
                    data rather than as "not part of the sequence". */}
                {emp.step <= WORKFLOW_STEPS && (
                  <span className="ui-meta font-bold uppercase tracking-[0.09em] text-ink-3 shrink-0">
                    Step {emp.step}
                  </span>
                )}
                <span className="ui-body font-semibold text-ink shrink-0" title={emp.tagline}>{emp.name}</span>
                <span className="ui-small text-ink-2 min-w-0 flex-1">
                  {/* A helper that has run says what it did; one that has not
                      says what it would do. */}
                  {done && st?.msg ? st.msg : (r.text || emp.job)}
                </span>
                {openResults && (
                  <button
                    onClick={openResults}
                    className="shrink-0 ui-small font-semibold underline decoration-dotted text-rose-text hover:text-rose transition"
                  >
                    {emp.resultsLabel} →
                  </button>
                )}
                {r.go && onNavigate && (
                  <button
                    onClick={() => onNavigate(r.go)}
                    className="shrink-0 ui-small font-semibold underline decoration-dotted text-ink-2 hover:text-rose-text transition"
                  >
                    {r.goLabel} →
                  </button>
                )}
                {/* A helper that is compact only because something earlier in
                    the lane is more useful can still be run — the button is
                    quiet, not absent. Nothing is hidden by this chapter. */}
                {r.ready && !disabled && (
                  <button
                    onClick={() => run(emp)}
                    className="shrink-0 ui-small font-semibold underline decoration-dotted text-ink-2 hover:text-rose-text transition"
                  >
                    {emp.action}
                  </button>
                )}
              </div>
            ) : (
            <div
              key={emp.id}
              className="hive-card border border-line-strong r-lg shadow-card px-5 py-4 flex items-center gap-5 flex-wrap"
              style={beeTint(emp.id, r.ready)}
            >
              {/* The mascot came down from 56 to 44: the step is what tells
                  you where in the run this sits, so it is what leads. */}
              <BeeBadge id={emp.id} size={44} buzzing={isRunning} />
              <div className="min-w-0 flex-1 basis-[280px]">
                {emp.step <= WORKFLOW_STEPS && (
                  <p className="ui-meta font-bold uppercase tracking-[0.09em] text-rose-text mb-0.5">
                    Step {emp.step}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* The sentence that used to sit here is on the title and
                      in the popup; the card says the job in three words. */}
                  <span className="ui-heading font-semibold text-bright" title={emp.tagline}>{emp.name}</span>
                  <button
                    onClick={() => setGuideFor(emp)}
                    aria-label={`How to use ${emp.name}`}
                    className="ui-small font-medium text-ink-2 hover:text-rose-text underline decoration-dotted transition"
                  >
                    How to use
                  </button>
                </div>
                <p className="ui-body text-ink-2 leading-snug mt-0.5">{emp.job}</p>
                {/* The state pill is unconditional: a card whose readiness
                    check happens to have nothing to SAY still has a state,
                    and "no sentence" is not the same as "no state". */}
                {r && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Pill kind={r.ready ? 'approved' : 'waiting'}>{r.ready ? 'Ready' : 'Not ready'}</Pill>
                    {/* The sentence only appears when it adds something. When
                        a helper is ready its readiness line said "Ready
                        whenever" beside a pill already saying Ready; when it
                        is not, the line is the only place that says what is
                        missing, so it stays. */}
                    {r.text && !r.ready && <span className="ui-small text-ink-2">{r.text}</span>}
                    {r.go && onNavigate && (
                      <button onClick={() => onNavigate(r.go)} className="ui-small font-semibold underline decoration-dotted text-ink-2 hover:text-rose-text transition">
                        {r.goLabel} →
                      </button>
                    )}
                  </div>
                )}
              </div>
              {emp.needsHandles && (
                <div className="w-full flex items-end gap-2 flex-wrap order-last">
                  <label className="flex-1 basis-[320px] min-w-0">
                    <span className="block ui-meta font-semibold uppercase tracking-[0.08em] text-ink-3 mb-1">
                      Instagram accounts to learn from
                    </span>
                    <input
                      value={handles}
                      onChange={(e) => {
                        setHandles(e.target.value);
                        try { localStorage.setItem(HANDLES_KEY, e.target.value); } catch {}
                      }}
                      placeholder="@coachjane, @thebookedsalon"
                      className="w-full bg-input-bg border border-line r-md px-2.5 py-2 ui-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
                    />
                  </label>
                  <label className="w-[170px]">
                    <span
                      className="block ui-meta font-semibold uppercase tracking-[0.08em] text-ink-3 mb-1 cursor-help"
                      title="Posts below this many views are thrown away before the AI sees anything. A flop teaches it to write like a flop. Big accounts: 50,000 or more. Smaller local creators: try 10,000, or their good posts get filtered out too."
                    >
                      Ignore posts under
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={minViews}
                      onChange={(e) => {
                        setMinViews(e.target.value);
                        try { localStorage.setItem(VIEWS_KEY, e.target.value); } catch {}
                      }}
                      className="w-full bg-input-bg border border-line r-md px-2.5 py-2 ui-body text-ink focus:outline-none focus:border-rose"
                    />
                  </label>
                  <p className="w-full ui-small text-ink-3 leading-snug">
                    Anything with fewer views than this is thrown away before the AI reads it, so it only ever learns from posts that worked. Lower it to about 10,000 for smaller local accounts.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  disabled={disabled}
                  onClick={() => run(emp)}
                  className="h-11 px-6 ui-heading font-semibold r-md btn-bloom transition disabled:opacity-40 whitespace-nowrap"
                >
                  {isRunning ? 'Working…' : emp.action}
                </button>
                {/* Only while this one is actually going, and only for the
                    batch workers where stopping means anything. */}
                {isRunning && card && STOPPABLE.has(emp.task) && (
                  <button
                    onClick={stopRun}
                    disabled={card.state === 'STOPPING'}
                    className="h-11 px-4 ui-body font-semibold r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-60 whitespace-nowrap"
                  >
                    {card.state === 'STOPPING' ? 'Stopping…' : 'Stop'}
                  </button>
                )}
                {openResults && (
                  <button
                    onClick={openResults}
                    className="h-11 px-4 ui-body font-medium r-md bg-rose-tint text-rose-text border border-rose-line hover:bg-rose hover:text-white transition whitespace-nowrap"
                  >
                    {emp.resultsLabel} →
                  </button>
                )}
              </div>
              {/* Real progress only. `prog` is set from calls that already
                  returned, so the stem never draws ahead of the work. */}
              {isRunning && card && STOPPABLE.has(emp.task) && (
                <>
                  <p className="w-full ui-small text-ink-2 mt-1" role="status">
                    {card.state === 'STOPPING'
                      ? 'Stopping after the current one finishes...'
                      : `Scanning ${card.processed || 0}${card.total ? ` of ${card.total}` : ''}${card.current_item ? ` · ${card.current_item}` : ''}`}
                  </p>
                  {/* Only true for the run the queue owns, so it is only said
                      there. The other bees still hold their loop in this tab. */}
                  {watching && card.state !== 'STOPPING' && (
                    <p className="w-full ui-small text-ink-3">
                      You can close this page. LTB keeps working in the background.
                      {/* No ETA. A speed from four samples swings by a factor of
                          three, and a wrong finish time is worse than none. */}
                      {speed ? ` About ${speed.perHour} sites an hour recently.` : ''}
                    </p>
                  )}
                  {/* Waiting on purpose. Said in the same calm voice as
                      everything else, because nothing is wrong and there is
                      nothing for her to do. No force-run button for the same
                      reason: there is no queue to jump. */}
                  {watching && waitCopy && (
                    <p className="w-full ui-small text-ink-2">
                      <b className="text-ink">{waitCopy.headline}.</b> {waitCopy.detail}
                    </p>
                  )}
                </>
              )}
              {isRunning && prog && prog.total > 0 && (
                <div className="w-full mt-1">
                  {/* The mock's Scan progress bar: real N-of-M, flowing fill,
                      a bloom at the leading edge. "Auditing sites · 26 of 60"
                      is exactly this. */}
                  <ScanBar done={prog.done} total={prog.total} label={prog.label} />
                </div>
              )}
              {isRunning && !prog && (
                <div className="w-full mt-1">
                  <BloomProgress indeterminate label="Reading the context" />
                </div>
              )}
              {st && !isRunning && (
                <p className={`w-full ui-small ${st.ok ? 'text-leaf-text' : 'text-poppy-text'}`} role="status">
                  {st.msg}
                </p>
              )}
            </div>
            )
          );
        })}
          </div>
        </div>
        );
      })}
      {/* The prompt shelf. The two prompt libraries left the sidebar (the
          app and the Cowork skills do those jobs now), but the pages still
          exist for the rare day one is wanted — one quiet row here instead
          of two permanent tabs. */}
      {onNavigate && (
        <div className="mt-6 pt-4 border-t border-line flex items-center gap-x-4 gap-y-1 flex-wrap ui-small">
          <span className="text-ink-3">Prompt shelf, for the rare day you want to paste one:</span>
          <button
            onClick={() => onNavigate('prompts')}
            className="text-ink-2 underline decoration-dotted hover:text-rose-text transition"
          >
            Chat prompts
          </button>
          <button
            onClick={() => onNavigate('handsoff')}
            className="text-ink-2 underline decoration-dotted hover:text-rose-text transition"
          >
            Cowork prompts
          </button>
        </div>
      )}
      {howOpen && <HowItWorksModal onClose={() => setHowOpen(false)} />}
      {guideFor && <BeeGuideModal emp={guideFor} onClose={() => setGuideFor(null)} onNavigate={onNavigate} />}
    </div>
  );
}
