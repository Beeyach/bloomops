'use client';

// Every email that actually went to this person, oldest first.
//
// Two provenances, drawn apart on purpose and never mixed:
//   1. Recorded sends — the guarded native transport wrote these down as it
//      sent them. They get the Sent card treatment.
//   2. Observed in Gmail — the manual era. Nothing recorded them at send
//      time, but the mailbox holds them, and since the conversation store
//      landed the app holds Gmail's copy. Shown as what they are: Gmail's
//      account of what went out, not a guarded send record.
// A prospect with neither still says so plainly, because drawing plausible
// lines nobody wrote down is the habit that produced 622 prospects with an
// unknowable Email 1 date.
//
// The identifiers that came with each send (provider message id, thread id,
// package version, fingerprint) are not here. They are in System details, one
// disclosure below, where a technical question can be answered without a
// technical answer being forced on everybody else.

import { useEffect, useState } from 'react';
import { tzFormat } from '@/lib/tz.mjs';
import { Icon } from './Icons';
import { Tile, Pill } from './Semantic';
import { ICON } from '@/lib/semantic.mjs';

const day = (v) => (v ? tzFormat(v, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

export default function OutreachHistory({ sends = [], loading = false, sentCount = 0, prospectId = null }) {
  // Gmail's copy of what went out, read from the same stored conversation the
  // Overview shows. Served from the store, so this is one cheap read.
  const [observed, setObserved] = useState(null); // null = loading
  useEffect(() => {
    let alive = true;
    setObserved(null);
    if (!prospectId) { setObserved([]); return undefined; }
    fetch(`/api/prospects/${prospectId}/gmail-thread`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setObserved((d?.messages || []).filter((m) => m.from === 'Ary')); })
      .catch(() => { if (alive) setObserved([]); });
    return () => { alive = false; };
  }, [prospectId]);

  const observedReady = observed !== null;
  const nothingAnywhere = !loading && sends.length === 0 && observedReady && observed.length === 0;

  return (
    <section>
      <div className="flex items-center gap-2 text-ink-2">
        <Icon name={ICON.email} className="w-[18px] h-[18px]" />
        <span className="ui-heading font-semibold text-ink">Outreach history</span>
      </div>

      {loading ? (
        <p className="ui-small text-ink-2 mt-2">Reading the send record…</p>
      ) : sends.length === 0 ? (
        nothingAnywhere ? (
          <p className="ui-small text-ink-2 mt-2 leading-relaxed">
            {sentCount > 0
              ? `The record counts ${sentCount} cold email${sentCount === 1 ? '' : 's'}, but none of them were written down at the time, and Gmail holds no copy either. There is nothing here to show, and nothing worth guessing.`
              : 'Nothing has been sent to them yet.'}
          </p>
        ) : null
      ) : (
        // Chapter 10: each send is a card with a state, not a line of text.
        // Five identical white rows made "what happened to this person" a
        // reading job; a Sent pill and a mail tile make it a glance.
        <ol className="mt-3 space-y-2 list-none p-0 m-0">
          {sends.map((s) => (
            <li key={s.id} className="flex items-start gap-3 r-md border border-line bg-panel px-3 py-2.5">
              <Tile kind="sent" size={32} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="ui-body font-semibold text-ink">Email {s.sequence_step}</span>
                  <Pill kind="sent">Sent</Pill>
                </div>
                {s.subject ? <p className="ui-small text-ink-2 mt-1 break-words">{s.subject}</p> : null}
                <p className="ui-meta text-ink-3 mt-1 num-tabular">{day(s.sent_at) || 'undated'}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Gmail's account of what went out. Rendered whenever the mailbox
          holds outbound to this person that the guarded record does not —
          which is every manual-era send. */}
      {!loading && observedReady && observed.length > 0 && (
        <div className={sends.length ? 'mt-4' : 'mt-2'}>
          <p className="ui-meta text-ink-3">
            {sends.length
              ? 'Also in Gmail, from before sends were recorded natively:'
              : 'Sent by hand, before sends were recorded natively. As Gmail holds them:'}
          </p>
          <ol className="mt-2 space-y-2 list-none p-0 m-0">
            {observed.map((m) => (
              <li key={m.messageId} className="r-md border border-line bg-panel px-3 py-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="ui-meta text-ink-3 num-tabular">{day(m.at) || 'undated'}</span>
                  {m.subject ? <span className="ui-small font-semibold text-ink break-words">{m.subject}</span> : null}
                  <span className="ui-meta text-ink-3">Observed in Gmail</span>
                </div>
                {m.text ? (
                  <p className="ui-small text-ink-2 leading-relaxed mt-1 whitespace-pre-line break-words">{m.text}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
      {!loading && !observedReady && sends.length === 0 && (
        <p className="ui-meta text-ink-3 mt-2">Checking what Gmail holds…</p>
      )}
    </section>
  );
}
