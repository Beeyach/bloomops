'use client';

// The first thing on a prospect's page, answering the three questions in order.
//
//   Who?            Peak Development Strategies · Mary · Australia
//   What happened?  Email 2 due
//   What next?      Email 2 became due Aug 10. Nothing sends on its own.
//
// The page used to open with an editable name field, then Business and Niche
// side by side, then four buttons — so the first thing it said was "here is a
// form", and what was actually happening with this person was four hundred
// pixels further down inside a card.
//
// Every word here comes from prospectActionState. This component decides
// nothing; if it disagreed with the row in the list, one of them would be
// lying.

import { prospectActionState } from '@/lib/prospect-action.mjs';
import { listIdentity } from '@/lib/row-identity.mjs';
import { COUNTRY_META } from '@/lib/country-meta.mjs';
import { isInternalTest, INTERNAL_LABEL } from '@/lib/canary.mjs';
import SiteFavicon from './SiteFavicon';
import { Icon } from './Icons';
import { Pill, Monogram } from './Semantic';
import { TONE as SEM, ICON } from '@/lib/semantic.mjs';

// The router's tone, as one of the five semantic families. Chapter 10: the
// canonical state is a pill now rather than a coloured sentence, so it reads
// as a state at a glance instead of having to be read as prose.
const HEAD_TONE = {
  high: SEM.INFO,
  action: SEM.WAIT,
  calm: SEM.NEUTRAL,
  notice: SEM.WAIT,
  muted: SEM.NEUTRAL,
  quiet: SEM.NEUTRAL,
};

const countryLabel = (code) => COUNTRY_META[code]?.label || null;

export default function ProspectHeadline({ prospect: p, state: given = null, action = null }) {
  if (!p) return null;
  const state = given || prospectActionState(p, {});
  const id = listIdentity(p, { countryLabel });

  // A hard boundary is not a state among states. When the person said stop,
  // the header says so in their words, visually apart from every normal
  // label, and offers no next action: there is none.
  const boundary = p.do_not_contact ? 'Do not contact' : p.unsubscribed ? 'Unsubscribed' : null;

  return (
    <header>
      {/* Chapter 8: a bordered block, not a run of text. Who this is has to
          be a thing on the page you can point at — the version without an
          edge read as the first paragraph of a document rather than as the
          person the page is about. */}
      <div className="flex items-start gap-3.5 r-lg border border-line-strong bg-surface-subtle px-4 py-3.5">
        {/* Chapter 10: never an empty left column. A favicon in a bordered
            square when there is a site, a monogram when there is not. */}
        {p.domain ? (
          <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-[42px] h-[42px] r-md border border-line bg-panel">
            <SiteFavicon domain={p.domain} size={24} />
          </span>
        ) : (
          <Monogram name={id.primary} size={42} className="mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-serif ui-display text-bright leading-tight break-words">{id.primary}</h2>
          {id.secondary && <p className="ui-body text-ink-2 mt-1 break-words">{id.secondary}</p>}
          {isInternalTest(p) && (
            <p className="mt-1.5 inline-block ui-meta font-semibold px-1.5 py-0.5 r-sm border border-line text-ink-3">
              {INTERNAL_LABEL} · not a real prospect
            </p>
          )}
        </div>
      </div>

      {boundary ? (
        <div
          className="flex items-start gap-2 r-md px-3 py-2.5 mt-4 border"
          style={{ borderColor: 'var(--on-invert-danger-border, var(--poppy-text))', backgroundColor: 'var(--on-invert-danger-bg, transparent)' }}
        >
          <span className="shrink-0 mt-[2px] inline-flex" style={{ color: 'var(--poppy-text)' }} aria-hidden="true">
            <Icon name="x" className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block ui-heading font-semibold" style={{ color: 'var(--poppy-text)' }}>{boundary}</span>
            <span className="block ui-small text-ink-2 mt-0.5">
              They asked for no further contact. Nothing here should ever reach out to them again.
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* What happened. One state, said once, as a pill. */}
          <div className="mt-4">
            <Pill tone={HEAD_TONE[state.tone] || HEAD_TONE.muted} icon={ICON.next}>{state.label}</Pill>
          </div>
          {state.context && <p className="ui-small text-ink-2 mt-1.5">{state.context}</p>}

          {/* What next. Its own box, because it is the answer somebody opened the
              page for, and a sentence in a paragraph is not an answer. */}
          <div
            className="flex items-start gap-2 r-md px-3 py-2.5 mt-3"
            style={{ backgroundColor: 'var(--hover-wash-soft, rgba(0,0,0,0.02))' }}
          >
            <Icon name="arrow-right" className="w-3.5 h-3.5 shrink-0 mt-[3px] text-rose-text" />
            <div className="min-w-0 flex-1">
              <span className="block ui-meta font-semibold uppercase tracking-[0.07em] text-ink-2">Next</span>
              <span className="block ui-body text-ink leading-snug mt-0.5">{state.detail}</span>
              {/* Where Next is something Ary can settle on the spot, it is settled
                  here. Sending her back to Today to fix a record she is already
                  looking at is the kind of round trip that leaves things unfixed. */}
              {action}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
