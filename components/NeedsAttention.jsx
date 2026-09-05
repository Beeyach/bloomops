'use client';

// The recoverable problems, counted rather than listed.
//
// There are 220 of them in production and 160 are the same problem: an address
// that went missing. Listed one per row they push the sixty-eight people who
// actually wrote back off the bottom of the screen, which is the opposite of
// what Today is for. So each kind gets one line with a number, and the list
// itself lives in Prospects where a long list belongs.
//
// None of these are failures. An address that needs finding is work, not an
// error, and the styling says so — no red, no warning icon, no exclamation.

import { VIEW } from '@/lib/prospect-action.mjs';
import { Icon } from './Icons';
import Section from './TodaySection';


// Chapter 9 put this inside one of Today's tab panels, which is already a
// group card with a header and a blurb. `bare` drops the second card so the
// page does not draw a box inside a box, and drops the blurb so the same
// sentence is not printed twice on one screen.
function Bare({ children }) { return <div className="space-y-4">{children}</div>; }

export default function NeedsAttention({ kinds = [], total = 0, onNavigate, bare = false,}) {
  if (!kinds.length) return null;

  const Wrap = bare ? Bare : Section;

  return (
    // Chapter 8: the same group card as every other section on Today. The
    // count moved into the header pill, which also fixes it reading as
    // "Needs attention(7)" with no space before the bracket.
    <Wrap
      icon="info"
      title="Needs attention"
      count={total}
      blurb="Things LTB cannot finish on its own. None of them are urgent, and none of them are broken."
    >
      <div className="border border-line r-md bg-panel overflow-hidden">
        {kinds.map((k) => (
          <div key={k.label} className="flex items-center gap-3 px-4 py-3.5 border-b border-hairline last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="ui-body font-semibold text-ink">{k.label}</div>
              <div className="ui-small text-ink-2 mt-0.5">{k.hint}</div>
            </div>
            <div className="shrink-0 ui-heading font-semibold text-ink num-tabular">
              {k.count.toLocaleString()}
            </div>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('prospects', { tab: VIEW.ATTENTION, actionFilter: k.label })}
              className="shrink-0 ui-small font-semibold px-2.5 py-1.5 r-md border border-line-strong bg-panel text-ink hover:bg-hover-wash-soft transition"
            >
              View
            </button>
          </div>
        ))}
      </div>
    </Wrap>
  );
}
