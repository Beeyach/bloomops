'use client';

// Six lists, and the states inside the one you are looking at.
//
// Two rows, and the difference between them matters. The top row is the
// question ("who has replied?") and there are six of those, for ever. The
// bottom row is whatever states happen to exist inside that answer today, built
// from the rows themselves — so it shrinks as work gets done and never offers a
// filter that would come back empty.
//
// The old top-level filters were the database's stages: Email 1 through Email
// 5, New, Prescreen, Validated. Six hundred rows sat at Email 5 and none of
// them were waiting for anything.

import { TABS } from '@/lib/prospect-tabs.mjs';

// The blurb shown while the New finds tab is active. Everything else about
// that screen still belongs to LeadInbox; this strip only makes it a tab of
// the same workspace instead of a separate app area.
const NEW_FINDS_BLURB = 'Raw finds awaiting your look. The good ones get added to the pipeline.';

export default function ProspectTabs({
  tab, onTab, counts,
  filters = [], activeFilter = null, onFilter,
  // { count, active, onOpen } — rendered as the first tab when provided.
  newFinds = null,
}) {
  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const blurb = newFinds?.active ? NEW_FINDS_BLURB : current.blurb;

  return (
    <div className="canvas-data glass-panel px-4 py-3">
      <div className="flex items-center gap-1 flex-wrap" role="tablist" aria-label="Prospect lists">
        {newFinds && (
          <button
            type="button"
            role="tab"
            aria-selected={newFinds.active}
            onClick={() => newFinds.onOpen && newFinds.onOpen()}
            title={NEW_FINDS_BLURB}
            className={`r-md px-3 py-2 flex items-center gap-2 leading-tight transition border ${
              newFinds.active
                ? 'bg-rose-btn text-white border-rose-btn'
                : 'border-line text-ink-2 hover:bg-hover-wash-soft hover:border-line-strong'
            }`}
          >
            <span className="ui-body font-medium whitespace-nowrap">New finds</span>
            <span className={`ui-body font-semibold num-tabular ${newFinds.active ? '' : 'text-ink'}`}>
              {(newFinds.count ?? 0).toLocaleString()}
            </span>
          </button>
        )}
        {TABS.map((t) => {
          const active = t.id === tab && !newFinds?.active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(t.id)}
              title={t.blurb}
              className={`r-md px-3 py-2 flex items-center gap-2 leading-tight transition border ${
                active
                  ? 'bg-rose-btn text-white border-rose-btn'
                  : 'border-line text-ink-2 hover:bg-hover-wash-soft hover:border-line-strong'
              }`}
            >
              <span className="ui-body font-medium whitespace-nowrap">{t.label}</span>
              <span className={`ui-body font-semibold num-tabular ${active ? '' : 'text-ink'}`}>
                {(counts?.[t.id] ?? 0).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* One sentence saying what this pile is, so a tab never has to be
          guessed at from its name. */}
      <p className="ui-small text-ink-2 mt-2">{blurb}</p>

      {filters.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pt-2.5 border-t border-hairline">
          <span className="ui-small text-ink-3 mr-0.5">Narrow to</span>
          {filters.map((f) => {
            const active = activeFilter === f.label;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => onFilter(active ? null : f.label)}
                className={`r-md border px-2.5 py-1 ui-small transition ${
                  active
                    ? 'bg-rose-tint text-rose-text border-rose-line font-semibold'
                    : 'border-line text-ink-2 hover:bg-hover-wash-soft hover:border-line-strong'
                }`}
              >
                {f.label}
                <span className="ml-1.5 num-tabular text-ink font-semibold">{f.count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
