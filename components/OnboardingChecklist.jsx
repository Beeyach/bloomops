'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { CHECKLIST } from '@/lib/help-copy.mjs';

// Five things worth doing once, and then never again.
//
// This replaces two older cards that sat on Today: a welcome panel and a
// three-step setup list. Both described the product as it was before the
// current outreach flow, telling somebody to score a lead and write a DM. Copy
// that describes a workflow the app no longer has is worse than no copy: it
// teaches the wrong model and then the screen contradicts it.
//
// Rules it keeps to. It never blocks anything. It never asks for a send. It
// costs nothing to render, makes no network call of its own beyond what Today
// already loaded, and once it is gone it stays gone.
//
// State is a localStorage key, deliberately.
//
// The alternative was a settings column, and a migration plus a write path for
// "which help card has this person seen" is a lot of machinery for a fact
// nobody needs on another device. The cost is honest and small: a new browser
// shows it again. That is also why it hides itself for a workspace that
// obviously predates it, so a veteran on a fresh laptop is not welcomed to an
// app they have used for a year.
const DONE_KEY = 'ltb_onboarding_v2';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) || '{}');
    return { dismissed: raw.dismissed === true, seen: new Set(raw.seen || []) };
  } catch {
    return { dismissed: false, seen: new Set() };
  }
}

function save(state) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify({ dismissed: state.dismissed, seen: [...state.seen] }));
  } catch {}
}

export default function OnboardingChecklist({ onNavigate, prospectCount = 0, established = false }) {
  // Starts hidden so the server render and the first client render agree.
  const [state, setState] = useState(null);

  useEffect(() => {
    const s = load();
    if (!s.dismissed) setState(s);
  }, []);

  if (!state || established) return null;

  // The one item the app can answer for itself. The rest are "have you looked
  // at this yet", which is a fact about the person and not about the data, so
  // clicking through is what ticks them.
  const isDone = (item) => (item.id === 'prospects' ? prospectCount > 0 : state.seen.has(item.id));
  const done = CHECKLIST.filter(isDone).length;

  const dismiss = () => {
    const next = { ...state, dismissed: true };
    save(next);
    setState(null);
  };

  const visit = (item) => {
    const seen = new Set(state.seen);
    seen.add(item.id);
    const next = { ...state, seen };
    save(next);
    // All five done means it has served its purpose. Going quietly is better
    // than a congratulations panel nobody asked for.
    if (CHECKLIST.every((c) => (c.id === 'prospects' ? prospectCount > 0 : seen.has(c.id)))) {
      save({ ...next, dismissed: true });
      setState(null);
    } else {
      setState(next);
    }
    if (onNavigate) onNavigate(item.go);
  };

  return (
    <section aria-label="Getting started" className="border border-line-strong rounded-[8px] bg-panel shadow-card p-4 mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">New here?</h2>
          <p className="text-[13px] text-ink-2">
            Five short things, once. <span className="tabular-nums">{done} of {CHECKLIST.length}</span> done.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
        >
          Hide this
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2 list-none p-0 m-0">
        {CHECKLIST.map((c) => {
          const complete = isDone(c);
          return (
            <li key={c.id} className="flex items-start gap-3">
              {/* A tick is a shape as well as a colour, so the state does not
                  depend on being able to tell green from grey. */}
              <span
                className={`mt-0.5 w-[18px] h-[18px] shrink-0 rounded-full border-2 flex items-center justify-center ${
                  complete ? 'bg-leaf border-leaf text-white' : 'border-line-strong'
                }`}
                aria-hidden="true"
              >
                {complete ? <Icon name="check" className="w-3 h-3" strokeWidth={2.5} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] ${complete ? 'text-ink-3' : 'text-ink font-medium'}`}>
                  {c.title}{complete ? <span className="sr-only"> (done)</span> : null}
                </span>
                {!complete && <span className="block text-[12.5px] text-ink-2 leading-snug">{c.detail}</span>}
              </span>
              {!complete && (
                <button
                  onClick={() => visit(c)}
                  className="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
                >
                  {c.action}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
