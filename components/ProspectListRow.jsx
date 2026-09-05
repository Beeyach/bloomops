'use client';

// One prospect, as four lines with four different weights.
//
// The old row was a spreadsheet cell: business, name and country set at the
// same size on the same line, then a coloured chip saying "Email 5". Everything
// competed and the one thing worth knowing — what happens next — was the part
// written in the database's own vocabulary.
//
// The order here is fixed and it is the order somebody reads:
//
//   Peak Development Strategies      ← who this is
//   Mary · Australia                 ← who to write to, and where
//   Email 2 due                      ← what happens next
//   1 email sent · last contact Jul 11   ← how we got here
//
// Nothing technical appears anywhere in it. Ids, package versions, queue
// states, provider threads and raw enums all live on the prospect page behind
// System details, which is where somebody goes when they are asking a
// technical question.

import { listIdentity } from '@/lib/row-identity.mjs';
import { COUNTRY_META } from '@/lib/country-meta.mjs';
import { TONE } from '@/lib/prospect-action.mjs';
import { isInternalTest, INTERNAL_LABEL } from '@/lib/canary.mjs';
import SiteFavicon from './SiteFavicon';
import { Icon } from './Icons';
import { Tile, Pill, Meta, Monogram } from './Semantic';
import { TONE as SEM, kindOf, ICON, shortDuration } from '@/lib/semantic.mjs';

// The router's tone, translated into one of the five semantic families.
//
// Chapter 10: this used to be a text colour and nothing else, so "what is
// happening" was a sentence you had to read. It is now a pill — icon, word,
// family — which is the same information at a glance. Only "high" reaches for
// a loud family: a person who wrote back is the one row on a page that should
// catch the eye, and if six states are coloured then none of them are.
const TONE_FAMILY = {
  high: SEM.INFO,       // somebody wrote to you
  action: SEM.WAIT,     // something wants doing
  calm: SEM.NEUTRAL,
  notice: SEM.WAIT,
  muted: SEM.NEUTRAL,
  quiet: SEM.NEUTRAL,
};

const countryLabel = (code) => COUNTRY_META[code]?.label || null;

export default function ProspectListRow({
  prospect, state, onOpen, ratingMeta = null,
  // One extra phrase this particular list wants said — "watched your video
  // yesterday", "waiting 12 days". Sits with the context line, never above the
  // action, because the action is still the answer.
  note = null, noteClass = 'text-ink-2 font-medium',
  // What the person wrote, already trimmed to a line. Drawn as a quote rather
  // than folded into `context`, which is styled to recede.
  quote = null,
  // Whatever this list lets you do without opening the prospect.
  actions = null,
  // Chapter 10. What KIND of work this row is, from lib/semantic.mjs. Today's
  // tabs pass it, so every row in the Replies tab wears the reply icon and
  // the reply colour; the Prospects list leaves it off, because there the
  // question is who these people are rather than what job they belong to.
  kind = null,
  // Chapter 11. What the surrounding TAB already means. When a row's own
  // kind is the same thing the tab is named after, the pill is saying the
  // tab's name back to you — "A conversation is open" on every row of
  // Replies — so it is dropped and the state stays as the quiet context
  // line. A pill has to add a DIFFERENT fact to earn its place.
  tabKind = null,
  // A compact "how long" for the left column's second line — a number of
  // days, rendered as "3d" beside a clock rather than a sentence.
  waitingDays = null,
  // Chapter 12. When something is attached BELOW this row — the deferral
  // resolver is the only case — the divider has to move to the bottom of
  // the pair. Drawn between the row and its own attachment, it made the
  // attachment look like it belonged to the next person.
  divider = true,
}) {
  const id = listIdentity(prospect, { countryLabel });
  const family = TONE_FAMILY[state?.tone || TONE.muted] || SEM.NEUTRAL;
  // The state is redundant when this row IS the thing the tab is called.
  //
  // Chapter 11 dropped the PILL in that case and kept the words as quiet
  // context, which was half a fix: "A conversation is open" under a tab
  // called Replies is still the tab's name said twice. It is dropped
  // entirely now. What the row is stays legible from three other places —
  // the active tab, the message tile in the left column, and the action —
  // and the row gets its space back for the things only it knows: who this
  // is, how long they have waited, and what they said.
  const redundant = !!tabKind && !!kind && kind === tabKind;
  const internal = isInternalTest(prospect);
  const rating = prospect.rating || '';
  const rm = (ratingMeta && ratingMeta[rating]) || null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen && onOpen(prospect)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen && onOpen(prospect); }
      }}
      className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition hover:bg-card-hover ${
        divider ? 'border-b border-hairline last:border-b-0' : ''
      }`}
      style={kind ? { '--tone-ink': `var(--tone-${kindOf(kind).tone}-ink)` } : undefined}
    >
      {/* Left column: what kind of work this is, when the list knows; who
          this is, when it does not. Never empty, so rows line up. */}
      <div className="shrink-0 pt-[1px] relative">
        {kind ? (
          <Tile kind={kind} size={30} />
        ) : prospect.domain ? (
          <span className="inline-flex items-center justify-center w-[30px] h-[30px] r-sm border border-line bg-surface-subtle">
            <SiteFavicon domain={prospect.domain} size={17} />
          </span>
        ) : (
          <Monogram name={id.primary} size={30} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* 1. The business. The biggest thing in the row. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="ui-heading font-semibold text-ink leading-snug break-words">
            {id.primary}
          </span>
          {internal && (
            <span className="shrink-0 ui-meta font-medium px-1.5 py-0.5 r-sm border border-line text-ink-3">
              {INTERNAL_LABEL}
            </span>
          )}
        </div>

        {/* 2 and 3, on ONE line: who to write to, what happens next, and how
               long it has been waiting.
               These were three stacked lines, so a row saying four short
               things stood four lines tall and five rows filled a screen.
               They are all short and they all belong to the same glance.
               The pill still only appears when it says something the
               surrounding tab does not already say. */}
        {(id.secondary || (state?.label && !redundant) || waitingDays != null) && (
          <div className="mt-0.5 flex items-center gap-x-2 gap-y-1 flex-wrap">
            {id.secondary && (
              <span className="ui-small text-ink-2 leading-snug break-words">{id.secondary}</span>
            )}
            {state?.label && !redundant && (
              <Pill kind={kind || undefined} tone={family} icon={kind ? undefined : ICON.next}>
                {state.label}
              </Pill>
            )}
            {waitingDays != null && (
              <Meta icon={ICON.waiting} label="waiting">{shortDuration(waitingDays)}</Meta>
            )}
          </div>
        )}

        {/* 3b. What they actually said.
            Not the quiet line below: on a Replies row this is the reason the
            row exists, and the one thing Ary cannot work out from the name.
            So it reads at body size in full-strength ink, with the quotation
            marks doing the work a label would otherwise have to. */}
        {quote && (
          <p className="ui-body text-ink leading-snug mt-1 break-words">
            <span className="text-ink-3" aria-hidden="true">“</span>
            {quote}
            <span className="text-ink-3" aria-hidden="true">”</span>
          </p>
        )}

        {/* 4. How we got here. Quietest line on the row. */}
        {(state?.context || note) && (
          <div className="ui-meta leading-snug mt-0.5 break-words flex flex-wrap items-baseline gap-x-1.5">
            {note && <span className={noteClass}>{note}</span>}
            {note && state?.context && <span className="text-ink-3" aria-hidden="true">·</span>}
            {state?.context && <span className="text-ink-3">{state.context}</span>}
          </div>
        )}
      </div>

      {actions ? (
        <span className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {actions}
        </span>
      ) : null}

      {/* Ary's own verdict, far right and small. Stored as an emoji because
          automation writes it, drawn as the line icon because emojis do not
          belong in this part of the app. Same treatment as the drawer's
          rating menu, so one mark means one thing everywhere. */}
      {rm ? (
        <span
          className="shrink-0 pt-1 inline-flex items-center"
          style={{ color: rm.color }}
          title={rm.label}
        >
          <Icon name={rm.icon} filled={rm.filled} className="w-4 h-4" />
          <span className="sr-only">{rm.label}</span>
        </span>
      ) : null}
    </div>
  );
}
