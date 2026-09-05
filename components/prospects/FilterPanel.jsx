'use client';

// The Filters popover content (rating checklist, grouped stage checklist,
// due-only toggle). Extracted verbatim from ProspectsApp.jsx (split step 8).

import { Icon } from '../Icons';
import StageIcon from './StageIcon';
import { RATING_META, STAGE_META } from '../../lib/stage-meta.mjs';
import { groupStages } from '../../lib/stage-groups.mjs';

// Sentinel for "no rating" in the rating filter checklist.
export const NO_RATING = '__none__';

// Content of the Filters popover (Task 4): rating checklist, stage
// checklist, and the due-only toggle — the same controls that used to sit
// in the toolbar-card filter row, now rendered inside a PortalMenu popover.
// No wrapper div of its own — PortalMenu supplies the positioned/portaled
// container (see the `Filters ▾` button in the topbar).
export default function FilterPanel({
  ratings,
  stages,
  ratingChecked,
  stageChecked,
  toggleRating,
  toggleStage,
  dueOnly,
  onToggleDue,
  dueCount,
  lensActive,
  onSelectAll,
  onClearAll,
  onDone,
}) {
  return (
    <>
      <FilterSection label="Rating">
        {ratings.map((r) => {
          const rm = RATING_META[r] || {};
          return (
            <FilterRow
              key={r}
              checked={ratingChecked.has(r)}
              onChange={() => toggleRating(r)}
              label={
                <span className="flex items-center gap-2 text-sm text-charcoal">
                  <span
                    className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                    style={{ backgroundColor: rm.bg, borderColor: rm.color, color: rm.color }}
                  >
                    <Icon name={rm.icon} filled={rm.filled} className="w-3 h-3" />
                  </span>
                  {rm.label || r}
                </span>
              }
            />
          );
        })}
        <FilterRow
          checked={ratingChecked.has(NO_RATING)}
          onChange={() => toggleRating(NO_RATING)}
          label={
            <span className="flex items-center gap-2 text-sm text-muted italic">
              <span className="w-5 h-5 rounded-full border border-dashed border-line shrink-0" />
              (no rating)
            </span>
          }
        />
      </FilterSection>

      {/* An active lens replaces the stage/due filters entirely (see the
          LENSES note), so while one is on these two sections would silently
          do nothing. Dim and lock them rather than pretend they still apply.
          Rating stays live — the pipeline really does keep applying it. */}
      {lensActive && (
        <div className="text-[11px] text-gold-text">
          Paused while the "{lensActive}" chip is on.
        </div>
      )}
      <div className={lensActive ? 'opacity-45 pointer-events-none' : ''}>
      <FilterSection label="Stage">
        {/* Grouped into Pipeline / Warm / Closed / Parked so 20+ stages read
            as four short lists, not one long scroll. Every stage stays its own
            checkbox inside its group — this only groups them visually. */}
        {groupStages(stages).map((group) => (
          <div key={group.key} className="mb-1.5 last:mb-0">
            <div className="px-1 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </div>
            {group.stages.map((s) => {
              const m = STAGE_META[s] || {};
              return (
                <FilterRow
                  key={s}
                  checked={stageChecked.has(s)}
                  onChange={() => toggleStage(s)}
                  label={
                    <span className={`flex items-center gap-2 text-sm ${m.faded ? 'text-muted' : 'text-charcoal'}`}>
                      <span
                        className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: m.bg === 'transparent' ? 'var(--surface)' : m.bg,
                          borderColor: m.border,
                          color: m.border,
                        }}
                      >
                        <StageIcon stage={s} className="w-3 h-3" />
                      </span>
                      {s}
                    </span>
                  }
                />
              );
            })}
          </div>
        ))}
      </FilterSection>

      <FilterSection label="Due">
        <FilterRow
          checked={dueOnly}
          onChange={onToggleDue}
          label={
            <span className="flex items-center gap-2 text-sm text-charcoal">
              <Icon name="bell" className="w-3.5 h-3.5" />
              Due for follow-up
              {dueCount > 0 && (
                <span className="text-[10px] opacity-70">· {dueCount}</span>
              )}
            </span>
          }
        />
      </FilterSection>
      </div>

      <div className="mt-4 pt-3 border-t border-line/70 flex items-center justify-between">
        <div className="flex gap-4">
          <button
            onClick={onSelectAll}
            className="text-[12px] font-medium text-mauve-deep hover:underline"
          >
            Select all
          </button>
          <button
            onClick={onClearAll}
            className="text-[12px] font-medium text-muted hover:text-charcoal"
          >
            Uncheck all
          </button>
        </div>
        <button
          onClick={onDone}
          className="px-3 py-1.5 text-[12px] font-medium bg-charcoal text-paper rounded-full hover:bg-mauve-deep transition"
        >
          Done
        </button>
      </div>
    </>
  );
}

// Small key-value row used in the import preview. Label is small and muted,
// value is a tabular figure. `accent` makes the value mauve (the "this is
// what's happening" number), `muted` softens it (the skip count).
function Stat({ label, value, accent, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[11px] font-medium text-muted">
        {label}
      </dt>
      <dd
        className={`num-tabular text-2xl ${
          accent ? 'text-mauve-deep' : muted ? 'text-muted' : 'text-charcoal'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function FilterSection({ label, children }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-[12px] font-semibold text-charcoal mb-2">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterRow({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2.5 px-1.5 py-1 rounded-md hover:bg-blush-soft/60 cursor-pointer select-none transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

