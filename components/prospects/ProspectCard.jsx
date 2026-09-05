'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { tzFormat } from '../../lib/tz.mjs';
import { prospectCard } from '../../lib/prospect-card.mjs';

// The record, in the order somebody reads it.
//
// Who, where they are, why or why not, what was actually checked, how to reach
// them, where they came from, what has happened, what is next. The old card
// answered four of those and led with "evidence: sufficient · confidence: 0.7",
// which is a debugging line wearing a headline's clothes.
//
// Everything here is computed from the row that is already loaded, plus one
// small read for the alternate contact routes, which live in their own table.
// No model call, no verdict recomputed in React: lib/prospect-card.mjs reads
// the canonical answers and this draws them.

// Tone is a shape as well as a colour. `stop` is reserved for conclusions about
// the business; a prerequisite that has not been met yet never gets it, because
// "waiting for an address" drawn in red reads as a rejection and it is not one.
const TONE = {
  good: { color: 'var(--leaf-text)', bg: 'var(--leaf-wash, rgba(90,150,110,0.10))', icon: 'check-circle' },
  action: { color: 'var(--rose-text)', bg: 'var(--rose-tint)', icon: 'arrow-right' },
  quiet: { color: 'var(--ink-2)', bg: 'var(--control-bg, rgba(0,0,0,0.03))', icon: 'clock' },
  stop: { color: 'var(--ink-3)', bg: 'var(--control-bg, rgba(0,0,0,0.03))', icon: 'ban' },
};

function Block({ title, children, count = null }) {
  return (
    <section className="pt-4 border-t border-hairline first:pt-0 first:border-t-0">
      {/* Serif and rose, sentence case: the labels stopped dressing like the
          content. Ary's call — "don't be afraid to use colors or a different
          font" — after three passes of gray-on-gray caps still read flat. */}
      <h3 className="font-serif ui-body font-semibold text-rose-text">
        {title}
        {count != null ? <span className="ml-1.5 font-sans ui-meta font-normal tabular-nums text-ink-3">{count}</span> : null}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const day = (v) => (v ? tzFormat(v, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

export default function ProspectCard({ prospect: p, onNavigate }) {
  const [candidates, setCandidates] = useState([]);

  // The candidates table is per prospect and not on the row. One read, and it
  // fails quietly: an alternate route nobody can see is a smaller problem than
  // a drawer that will not open.
  useEffect(() => {
    let alive = true;
    setCandidates([]);
    if (!p?.id) return undefined;
    fetch(`/api/prospects/${p.id}/contacts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setCandidates(d.candidates || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [p?.id]);

  const card = useMemo(() => prospectCard(p || {}, { candidates }), [p, candidates]);
  const { situation, qualification, knowledge, contact, origin, history, next } = card;
  const tone = TONE[situation.tone] || TONE.quiet;

  return (
    <section className="border border-line-strong rounded-xl bg-panel shadow-card p-5 space-y-4">
      {/* ── Where they are now. One state, said once. ─────────────────── */}
      <div>
        <div className="flex items-start gap-2">
          <span
            className="shrink-0 mt-[3px] w-[22px] h-[22px] rounded-[7px] inline-flex items-center justify-center"
            style={{ backgroundColor: tone.bg, color: tone.color }}
            aria-hidden="true"
          >
            <Icon name={tone.icon} className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif ui-heading leading-snug" style={{ color: tone.color }}>
              {situation.headline}
            </p>
            <p className="ui-small text-ink-2 leading-relaxed mt-0.5">{situation.body}</p>
            {/* The rules' own sentence, where they wrote one. */}
            {situation.detail ? (
              <p className="ui-meta text-ink-3 leading-relaxed mt-1">{situation.detail}</p>
            ) : null}
          </div>
        </div>

        {/* Said out loud, because it is the difference between "we are not
            finished" and "we said no", and those look identical if nobody
            writes it down. Skipped when the situation's own body already
            carries the caveat — one sentence, said once. */}
        {!situation.judgement && situation.tone === 'quiet' && !situation.caveatInBody ? (
          <p className="mt-1.5 ml-[30px] ui-meta text-ink-3">
            Nothing here is a judgement about the business. It can change.
          </p>
        ) : null}
      </div>

      {/* ── What next. Points at a place, never at a mutation. ────────── */}
      <div className="flex items-start gap-2 rounded-[8px] px-3 py-2" style={{ backgroundColor: 'var(--hover-wash-soft, rgba(0,0,0,0.02))' }}>
        <Icon name="arrow-right" className="w-3.5 h-3.5 shrink-0 mt-[3px] text-rose-text" />
        <span className="min-w-0 flex-1 ui-small text-ink leading-snug">{next.text}</span>
        {next.view && onNavigate ? (
          <button
            onClick={() => onNavigate(next.view)}
            className="shrink-0 ui-meta font-medium px-2.5 py-1 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
          >
            Go
          </button>
        ) : null}
      </div>

      {/* ── Why, or what is still missing ────────────────────────────── */}
      <Block title={qualification.strong ? 'Why they are worth contacting' : 'What is still missing'}>
        {/* A bare "Never checked." adds nothing the checklist and the
            knowledge block do not already say, whatever the situation — it
            survived under "They wrote back" on Mary Ann's card. */}
        {qualification.why && !/^never checked\.?$/i.test(qualification.why.trim()) ? (
          <p className="ui-small text-ink leading-relaxed">{qualification.why}</p>
        ) : qualification.why || situation.caveatInBody ? null : (
          <p className="ui-small text-ink-2 leading-relaxed">
            Nothing on record yet, so there is nothing to say about them that would be true.
          </p>
        )}

        <ul className="mt-2 grid gap-1 sm:grid-cols-2 list-none p-0 m-0">
          {qualification.dimensions.map((d) => (
            <li key={d.test} className="flex items-start gap-1.5 ui-small leading-snug">
              <span
                className="shrink-0 mt-[1px]"
                style={{ color: d.passed ? 'var(--leaf-text)' : 'var(--ink-3)' }}
                aria-hidden="true"
              >
                <Icon name={d.passed ? 'check' : 'circle'} className="w-3 h-3" strokeWidth={2.4} />
              </span>
              <span className={d.passed ? 'text-ink' : 'text-ink-3'}>
                {d.label}
                <span className="sr-only">{d.passed ? ': yes' : ': not yet'}</span>
              </span>
            </li>
          ))}
        </ul>

        {qualification.strong ? (
          <p className="mt-2 ui-meta text-ink-3 leading-snug">
            Worth contacting is about having something true to say. It is not a guess about whether
            they will buy, and it says nothing about what they can afford.
          </p>
        ) : null}

        {qualification.band ? (
          <p className="mt-1.5 ui-meta text-ink-3">
            Priority {qualification.band}: at most {qualification.maxTouches} cold email
            {qualification.maxTouches === 1 ? '' : 's'} ever
            {qualification.bandProvisional ? ', and nobody has rated them yet' : ''}.
          </p>
        ) : null}
      </Block>

      {/* ── What was actually checked ─────────────────────────────────── */}
      <Block title="What we know" count={knowledge.total || null}>
        {knowledge.sections.length === 0 ? (
          <p className="ui-small text-ink-2 leading-relaxed">
            Nothing yet. The site check has not run.
          </p>
        ) : (
          <div className="space-y-2.5">
            {knowledge.sections.map((s) => (
              <div key={s.tier}>
                <p className="ui-small font-semibold text-ink-2">{s.heading}</p>
                <ul className="mt-1 space-y-1 list-none p-0 m-0">
                  {s.items.map((it, i) => (
                    <li key={i} className="ui-small leading-snug">
                      <span className="text-ink break-words">{it.text}</span>
                      {/* The tier is the footnote, not the headline. */}
                      <span className="block ui-meta text-ink-3 break-words">
                        {[s.note, it.observedAt ? day(it.observedAt) : null].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Freshness only when there was a run to date. The fallback used to
            re-announce "never been run" under a block that had just said it. */}
        {knowledge.freshness ? (
          <p className="mt-2 ui-meta text-ink-3">
            {knowledge.freshness}
            {knowledge.stale ? ` · older than ${knowledge.staleDays} days, worth a fresh check` : ''}
          </p>
        ) : null}

        {knowledge.unknowns.length > 0 ? (
          <details className="mt-1.5 group">
            {/* A disclosure has to look like one: chevron that turns, dotted
                underline. Plain gray text read as a caption, and the batch
                caught Ary never realising it opened. */}
            <summary className="cursor-pointer list-none inline-flex items-center gap-1 ui-small font-medium text-ink-2 underline decoration-dotted underline-offset-2 hover:text-ink transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[10px] h-[10px] shrink-0 transition-transform group-open:rotate-90" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
              What we do not know ({knowledge.unknowns.length})
            </summary>
            <ul className="mt-1 space-y-1 list-none p-0 m-0">
              {knowledge.unknowns.map((g, i) => (
                <li key={i} className="ui-small text-ink-2 leading-snug">{g}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </Block>

      {/* ── How to reach them. Separate from whether they are worth it. ─ */}
      <Block title="How we can reach them">
        {contact.usable ? (
          <>
            <p className="ui-body text-ink break-all">{contact.email}</p>
            {contact.emailOrigin ? (
              <p className="ui-meta text-ink-3 leading-snug">{contact.emailOrigin}</p>
            ) : null}
          </>
        ) : (
          <p className="ui-small text-ink-2 leading-relaxed">{contact.blockedReason}</p>
        )}

        {contact.alternates.length > 0 ? (
          <div className="mt-2">
            <p className="ui-meta text-ink-3">Other ways in</p>
            <ul className="mt-1 flex flex-wrap gap-1.5 list-none p-0 m-0">
              {contact.alternates.map((a) => (
                <li key={a.type} className="ui-meta px-2 py-0.5 rounded-[8px] border border-line text-ink-2">
                  {a.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Only ever printed when a run is on the record. Saying "we looked"
            without a run behind it is the claim this whole product avoids. */}
        {contact.tried ? (
          <p className="mt-2 ui-meta text-ink-3 leading-snug">
            Last looked {day(contact.tried.at)}
            {contact.tried.pages != null ? `, ${contact.tried.pages} page${contact.tried.pages === 1 ? '' : 's'} read` : ''}
            {contact.tried.text ? `. ${contact.tried.text}` : '.'}
          </p>
        ) : null}
      </Block>

      {/* ── Where they came from ──────────────────────────────────────── */}
      <Block title="Where they came from">
        <p className={`ui-small ${origin.recorded ? 'text-ink' : 'text-ink-3'}`}>{origin.label}</p>
        {(origin.subtype || origin.query || origin.batch) ? (
          <p className="ui-meta text-ink-3 leading-snug break-words">
            {[origin.subtype, origin.query, origin.batch ? `batch ${origin.batch}` : null].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {!origin.recorded && !origin.legacy ? (
          <p className="ui-meta text-ink-3 leading-snug">
            Nobody was asked where this one was found. Newer prospects record it when they are added.
          </p>
        ) : null}
      </Block>

      {/* ── What has happened, from stored moments only ───────────────── */}
      {history.length > 0 ? (
        <Block title="What has happened">
          <ol className="space-y-1 list-none p-0 m-0">
            {history.map((h, i) => (
              <li key={i} className="flex items-baseline gap-2 ui-small leading-snug flex-wrap">
                <span className="text-ink-3 tabular-nums shrink-0">{day(h.at)}</span>
                <span className="text-ink">{h.what}</span>
                {h.detail ? <span className="text-ink-3 min-w-0 break-words">{h.detail}</span> : null}
              </li>
            ))}
          </ol>
          <p className="mt-1.5 ui-meta text-ink-3 leading-snug">
            Only moments that were written down at the time. Anything the app did not record is absent
            rather than guessed.
          </p>
        </Block>
      ) : null}

      {/* The internal values used to have their own disclosure here. There is
          now exactly one on the page — System details, at the very bottom —
          and it holds these plus the send, package and queue records this card
          never had access to. Two technical disclosures on one page is two
          places to look and one of them is always out of date. */}
    </section>
  );
}
