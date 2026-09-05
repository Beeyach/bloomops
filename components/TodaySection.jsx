'use client';

import { Icon } from './Icons';

// One of Today's action groups, as a card.
//
// Chapter 8: this was a heading with rows underneath it, which is a document.
// Ary's verdict was "Today is cramped and unreadable" and "if I opened it, I
// would lose motivation on working" — a page of undifferentiated text does
// that. A group is a thing now: its own edge, its own header band, its own
// count in the corner, its own body. You can see where one job ends and the
// next begins without reading a word.
//
// `blurb` renders once per GROUP and never per row.
// Chapter 12: a Section with no title draws no header band. On Today the tab
// immediately above the panel is already the title, the icon and the count,
// so a band repeating all three was the same information a third time and a
// second horizontal rule for the eye to cross.
export default function Section({ icon, title, count, blurb, children }) {
  return (
    <section className="mt-4 border border-line-strong r-lg bg-panel shadow-card overflow-hidden">
      {title ? (
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line bg-surface-subtle">
          {icon && (
            <span className="inline-flex text-ink-2" aria-hidden="true">
              <Icon name={icon} className="w-[18px] h-[18px]" />
            </span>
          )}
          <h2 className="ui-heading font-semibold text-ink flex-1 min-w-0">{title}</h2>
          {count != null && count > 0 ? (
            <span className="shrink-0 ui-small font-semibold num-tabular text-ink-2 bg-surface-sunken border border-line r-pill px-2.5 py-0.5">
              {count.toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="px-5 py-4">
        {blurb ? <p className="ui-small text-ink-2 mb-3.5 max-w-[70ch]">{blurb}</p> : null}
        {children}
      </div>
    </section>
  );
}
