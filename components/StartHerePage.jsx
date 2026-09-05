'use client';

import { useEffect, useState } from 'react';
import { sendingState, MODE } from '@/lib/sending-state.mjs';
import { FLOW, FLOW_LINE, DAILY, AUTOMATIC, YOURS, GLOSSARY } from '@/lib/help-copy.mjs';
import { Icon } from './Icons';

// The page a person opens when they have forgotten everything.
//
// It is not documentation. Documentation describes a system; this describes a
// morning. The test it has to pass is that somebody who has not touched the app
// for a month can read it for five minutes and know what to do next, and the
// second test is that nothing on it is a promise the settings can break.
//
// Which is why the sending panel loads the real configuration. Every previous
// answer to "will this send an email" was a sentence somebody typed, and a
// typed sentence cannot know that a switch moved.

// The five places, each in one sentence and three steps. Deliberately not
// generated from the guides: a guide explains a subject, and this answers
// "what do I actually do here".
const HELP_TASKS = [
  {
    title: 'Today',
    icon: 'sun',
    lede: 'Your work queue. One kind of job at a time.',
    steps: ['Open the tab with a number on it', 'Work the rows top to bottom', 'Empty tabs mean nothing is waiting'],
    go: 'today',
    goLabel: 'Open Today',
  },
  {
    title: 'Prospects',
    icon: 'flower',
    lede: 'Everyone, and what is happening with them.',
    steps: ['Pick the list you want from the tabs', 'Click a row to open the whole picture', 'Switch to Table to edit many cells'],
    go: 'prospects',
    goLabel: 'Open Prospects',
  },
  {
    title: 'Email and approvals',
    icon: 'mail',
    lede: 'Nothing goes out until you say so.',
    steps: ['Read the reason before the email', 'Approve the words, then approve the sequence', 'Send now is the only thing that sends'],
    go: 'today',
    goLabel: 'Go to Approvals',
  },
  {
    title: 'AI Hive',
    icon: 'bee',
    lede: 'Helpers that do one job each, in order.',
    steps: ['Follow the numbered workflow strip', 'Run the one that says Ready', 'How to use tells you what it costs'],
    go: 'army',
    goLabel: 'Open AI Hive',
  },
  {
    title: 'System',
    icon: 'activity',
    lede: 'Whether the background work is running.',
    steps: ['Overview answers "is it okay"', 'Issues lists what stopped, in plain words', 'Automation says what is allowed to send'],
    go: 'health',
    goLabel: 'Open System',
  },
];

function Section({ id, title, lede, children }) {
  return (
    <section aria-labelledby={id} className="mt-9 first:mt-0">
      <h2 id={id} className="text-[17px] font-semibold text-bright">{title}</h2>
      {lede ? <p className="mt-1 text-[13.5px] text-ink-2 leading-relaxed">{lede}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// A mode reads as a word, and the word is backed by a shape as well as a
// colour, because colour alone is not something everybody can use.
function ModeBadge({ mode }) {
  const tone = mode === MODE.AUTOMATIC
    ? 'bg-poppy-wash text-poppy-text border-poppy-text/30'
    : mode === MODE.MANUAL
      ? 'bg-leaf-wash text-leaf-text border-leaf-text/30'
      : 'bg-control-bg text-ink-2 border-line-strong';
  const mark = mode === MODE.AUTOMATIC ? '▶' : mode === MODE.MANUAL ? '✓' : '◦';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border text-[12px] font-semibold ${tone}`}>
      <span aria-hidden="true">{mark}</span>{mode}
    </span>
  );
}

// `initialSettings` is only ever passed by a test. Server rendering does not
// run effects, so without it the only state a test can assert is "checking",
// and the sending panel is precisely the part that has to be asserted. The
// approval queue carries the same seam for the same reason.
export default function StartHerePage({ onNavigate, initialSettings = null }) {
  const [settings, setSettings] = useState(initialSettings);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setSettings(d.settings || {}); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const send = settings ? sendingState(settings) : null;
  const go = (v) => () => onNavigate && onNavigate(v);

  return (
    <div className="w-full max-w-[820px] mx-auto rise-in">
      <h1 className="font-serif ui-display text-bright leading-tight">Help</h1>
      <p className="mt-1 ui-body text-ink-2 leading-relaxed">
        Five places, and what you do in each. The long version is underneath.
      </p>

      {/* ── Chapter 11: a task-based landing.
             This page opened as an essay about the model — true, and not what
             somebody who has forgotten how to approve an email needs. Five
             cards, one sentence and three steps each, and the essay is still
             below for the day the whole model is the question. ─────────── */}
      <ol className="grid gap-3 mt-6 list-none p-0 m-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {HELP_TASKS.map((t) => (
          <li key={t.title} className="r-lg border border-line bg-panel px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex text-ink-2" aria-hidden="true">
                <Icon name={t.icon} className="w-[17px] h-[17px]" strokeWidth={2} />
              </span>
              <h2 className="ui-heading font-semibold text-ink">{t.title}</h2>
            </div>
            <p className="ui-small text-ink-2 mt-1 leading-snug">{t.lede}</p>
            <ol className="mt-2.5 space-y-1 list-none p-0 m-0">
              {t.steps.map((step, i) => (
                <li key={step} className="flex gap-2 ui-small text-ink">
                  <span className="shrink-0 ui-meta font-bold text-ink-3 num-tabular pt-[3px]">{i + 1}</span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
            {t.go && (
              <button
                onClick={go(t.go)}
                className="mt-3 ui-small font-semibold text-rose-text hover:underline"
              >
                {t.goLabel} →
              </button>
            )}
          </li>
        ))}
      </ol>

      <details className="mt-8 pt-5 border-t border-line">
        <summary className="cursor-pointer ui-body font-semibold text-ink-2 hover:text-ink transition">
          How the whole thing works
        </summary>
        <div className="mt-4">

      {/* ── 1. The model ─────────────────────────────────────────────── */}
      <Section id="sh-flow" title="The whole thing in one line">
        <ol className="flex flex-wrap gap-2 list-none p-0 m-0">
          {FLOW.map((f, i) => (
            <li
              key={f.step}
              className="flex-1 min-w-[142px] border border-line rounded-[8px] bg-hover-wash-soft px-3 py-2.5"
            >
              <span className="block text-[13px] font-semibold text-ink">
                <span className="text-ink-3 tabular-nums mr-1.5">{i + 1}</span>{f.step}
              </span>
              <span className="block text-[12px] text-ink-2 leading-snug mt-0.5">{f.sub}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[13.5px] text-ink-2 leading-relaxed">{FLOW_LINE}</p>
      </Section>

      {/* ── 2. The daily loop ────────────────────────────────────────── */}
      <Section
        id="sh-daily"
        title="What you do each day"
        lede="Four things. If you only remember one, remember the first."
      >
        <ol className="list-none p-0 m-0 flex flex-col gap-3">
          {DAILY.map((d, i) => (
            <li key={d.title} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rose-tint text-rose-text text-[12px] font-semibold flex items-center justify-center tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-ink">{d.title}</span>
                <span className="block text-[13.5px] text-ink-2 leading-relaxed">{d.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <button onClick={go('today')} className="mt-4 text-[13px] font-semibold px-4 py-2 rounded-[8px] btn-bloom transition">
          Open Today
        </button>
      </Section>

      {/* ── 3. Split of labour ───────────────────────────────────────── */}
      <Section
        id="sh-split"
        title="What the app does, and what only you can do"
        lede="Everything on the left happens without you opening anything."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-line-strong rounded-[8px] bg-panel shadow-card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Leads That Bloom handles</h3>
            <ul className="mt-2 flex flex-col gap-2 list-none p-0 m-0">
              {AUTOMATIC.map((a) => (
                <li key={a.what}>
                  <span className="block text-[13px] text-ink">{a.what}</span>
                  <span className="block text-[12.5px] text-ink-2 leading-snug">{a.how}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-line-strong rounded-[8px] bg-panel shadow-card p-4">
            <h3 className="text-[13px] font-semibold text-ink">You handle</h3>
            <ul className="mt-2 flex flex-col gap-2 list-none p-0 m-0">
              {YOURS.map((y) => (
                <li key={y.what}>
                  <span className="block text-[13px] text-ink">{y.what}</span>
                  <span className="block text-[12.5px] text-ink-2 leading-snug">{y.how}</span>
                </li>
              ))}
              {/* Sending belongs to whoever the settings say it belongs to, so
                  it is written from the settings rather than listed above. */}
              {send ? (
                <li>
                  <span className="block text-[13px] text-ink">
                    {send.first.approvalSends ? 'Deciding, not sending' : 'Pressing send'}
                  </span>
                  <span className="block text-[12.5px] text-ink-2 leading-snug">
                    {send.first.approvalSends
                      ? 'First emails go out on their own once approved. Approving is the moment that matters.'
                      : 'Approving a draft does not send it. You press Send now when you are ready.'}
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── 4. What actually sends ───────────────────────────────────── */}
      <Section
        id="sh-sending"
        title="What will actually send an email"
        lede="Read from your current settings, not written down here. If a switch moves, this moves with it."
      >
        {failed ? (
          <p className="text-[13.5px] text-ink-2 border border-line-strong rounded-[8px] bg-panel shadow-card p-4">
            Your sending settings could not be loaded just now, so this cannot tell you the truth about
            them. Open Settings to see them directly.
          </p>
        ) : !send ? (
          <p className="text-[13.5px] text-ink-3 border border-line rounded-[8px] p-4">Checking your settings…</p>
        ) : (
          <div className="border border-line-strong rounded-[8px] bg-panel shadow-card divide-y divide-line">
            <div className="p-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-[13.5px] font-semibold text-ink">First emails</h3>
                <ModeBadge mode={send.first.mode} />
              </div>
              <p className="mt-1.5 text-[13.5px] text-ink-2 leading-relaxed">{send.first.detail}</p>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-[13.5px] font-semibold text-ink">Follow-ups</h3>
                <ModeBadge mode={send.followups.mode} />
              </div>
              <p className="mt-1.5 text-[13.5px] text-ink-2 leading-relaxed">{send.followups.detail}</p>
            </div>
            <div className="p-4">
              <h3 className="text-[13.5px] font-semibold text-ink">Whenever something does send</h3>
              <p className="mt-1.5 text-[13.5px] text-ink-2 leading-relaxed">
                Sending only happens {send.window.text}, and never more than {send.caps.text}. That
                applies to Send now as well: it is about the person receiving the email, not about who
                pressed the button.
              </p>
              <button
                onClick={go('settings')}
                className="mt-3 text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                Open Settings
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* ── 5. Vocabulary ────────────────────────────────────────────── */}
      <Section
        id="sh-words"
        title="Words you'll see"
        lede="The short line is usually enough. Open one if you want the rest."
      >
        <div className="border border-line-strong rounded-[8px] bg-panel shadow-card divide-y divide-line">
          {GLOSSARY.map((g) => (
            <details key={g.term} className="group">
              <summary className="cursor-pointer list-none px-4 py-2.5 flex items-baseline gap-3 hover:bg-hover-wash-soft transition">
                <span className="text-[13.5px] font-semibold text-ink shrink-0">{g.term}</span>
                <span className="text-[13px] text-ink-2 min-w-0">{g.short}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-3 group-open:hidden">more</span>
              </summary>
              <p className="px-4 pb-3 text-[13px] text-ink-2 leading-relaxed">{g.body}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ── 6. When something looks stuck ────────────────────────────── */}
      <Section id="sh-stuck" title="When something looks stuck">
        <ul className="flex flex-col gap-2.5 list-none p-0 m-0 text-[13.5px] text-ink-2 leading-relaxed">
          <li>
            <b className="text-ink font-semibold">Nothing in Today.</b> That is a good day, not a broken
            app. New work arrives on its own.
          </li>
          <li>
            <b className="text-ink font-semibold">Somebody is in the wrong place.</b> Every bucket page
            has a short line saying why people are in it. Open that first.
          </li>
          <li>
            <b className="text-ink font-semibold">A check stopped.</b> Automation stopped on Today says
            what happened in plain words, and most of them are worth one press of Try again.
          </li>
          <li>
            <b className="text-ink font-semibold">You cannot reach someone.</b> They are in Waiting on a
            way to reach them. Look again searches their own pages once more, for free.
          </li>
        </ul>
      </Section>

      {/* The engineering material is real and stays reachable. It is just not
          the product manual, and putting it beside Today taught people to
          treat the architecture as the instructions. */}
      <details className="mt-9 border border-line rounded-[8px] p-4">
        <summary className="cursor-pointer text-[13px] font-semibold text-ink-2">Technical details</summary>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">
          The written-down engineering material lives in the repository, and the setup guides are still
          in the sidebar under Resources. Nothing there is needed to use the app day to day.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={go('settings')} className="ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition">Settings</button>
          <button onClick={go('guide-automation')} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition">Automation guide</button>
          <button onClick={go('guide-sourcing')} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition">Sourcing guide</button>
          <button onClick={go('guide-agents')} className="text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition">Connect an AI</button>
        </div>
      </details>
        </div>
      </details>
    </div>
  );
}
