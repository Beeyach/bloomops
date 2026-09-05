'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { parseAuditNotes } from '../../lib/audit-profile.mjs';

// The audit notes as a profile instead of a wall of text. The audit skill
// already writes a consistent template; this renders it as labelled fields
// and status-marked checklists, parsed on the fly, so every note ever stored
// gets the layout retroactively. Anything the parser doesn't recognize shows
// under "More notes" untouched, and the raw text stays one toggle away —
// including an editor, since sometimes a wrong line needs correcting by hand.

const RATING_TONE = {
  STRONG: 'border-leaf text-leaf-text',
  MAYBE: 'border-gold text-gold-text',
  WEAK: 'border-line text-ink-3',
  SKIP: 'border-rose-line text-rose-text',
};

const STATUS_META = {
  good: { icon: 'check', cls: 'text-leaf-text' },
  bad: { icon: 'x', cls: 'text-rose-text' },
  warn: { icon: 'circle', cls: 'text-gold-text' },
};

const FIELD_ICON = {
  Business: 'briefcase',
  Platform: 'globe',
  Tools: 'sparkle',
  Currency: 'circle',
  'Dead-address check': 'search',
};

const SECTION_ICON = {
  'Activity signals': 'bell',
  'Site audit': 'eye',
};

export default function AuditProfile({ notes, onSave }) {
  const [mode, setMode] = useState('profile'); // profile | raw | edit
  const [draft, setDraft] = useState('');
  const profile = useMemo(() => parseAuditNotes(notes), [notes]);
  const empty = !profile.rating && profile.fields.length === 0 && profile.sections.length === 0;

  const ratingKey = String(profile.rating || '').split(/\s/)[0].toUpperCase();
  const ratingTone = RATING_TONE[ratingKey] || 'border-line text-ink-2';

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[12px] font-semibold text-ink-2">Audit profile</span>
        {profile.rating && mode === 'profile' && (
          <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${ratingTone}`}>
            {profile.rating}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          {mode === 'profile' && (
            <button
              onClick={() => setMode('raw')}
              className="text-[11.5px] text-ink-3 underline decoration-dotted hover:text-ink"
            >
              View raw
            </button>
          )}
          {mode === 'raw' && (
            <>
              <button
                onClick={() => { setDraft(notes || ''); setMode('edit'); }}
                className="text-[11.5px] text-ink-3 underline decoration-dotted hover:text-ink"
              >
                Edit
              </button>
              <button
                onClick={() => setMode('profile')}
                className="text-[11.5px] text-ink-3 underline decoration-dotted hover:text-ink"
              >
                Profile view
              </button>
            </>
          )}
        </span>
      </div>

      {mode === 'edit' ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full border border-line rounded-[8px] px-2.5 py-2 text-[12.5px] leading-relaxed text-ink bg-input-bg resize-y focus:outline-none focus:border-rose"
          />
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={() => { onSave && onSave(draft); setMode('profile'); }}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition"
            >
              Save
            </button>
            <button
              onClick={() => setMode('raw')}
              className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === 'raw' || empty ? (
        <div className="border border-line rounded-[8px] px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-[240px] overflow-y-auto slim-scroll">
          {notes}
        </div>
      ) : (
        /* An open profile, not a box: icon, label, info, the way every
           profile page lays it out. The drawer already provides the frame. */
        <div className="space-y-3 pt-1">
          {profile.fields.map((f) => (
            <div key={f.label} className="flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-[8px] bg-blush-soft text-rose-text inline-flex items-center justify-center shrink-0">
                <Icon name={FIELD_ICON[f.label] || 'file'} className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{f.label}</span>
                <span className="block text-[12.5px] text-ink leading-snug break-words [overflow-wrap:anywhere]">{f.value}</span>
              </span>
            </div>
          ))}

          {profile.sections.map((s) => (
            <div key={s.title}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="w-7 h-7 rounded-[8px] bg-blush-soft text-rose-text inline-flex items-center justify-center shrink-0">
                  <Icon name={SECTION_ICON[s.title] || 'file'} className="w-3.5 h-3.5" />
                </span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{s.title}</span>
              </div>
              <ul className="space-y-1.5 pl-[38px]">
                {s.items.map((it, i) => {
                  const meta = it.status ? STATUS_META[it.status] : null;
                  return (
                    <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug">
                      {meta ? (
                        <Icon name={meta.icon} className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.cls}`} strokeWidth={2.5} />
                      ) : (
                        <span className="w-1 h-1 rounded-full bg-ink-3 mt-2 shrink-0" />
                      )}
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {it.label && <span className="font-semibold text-ink">{it.label}: </span>}
                        <span className="text-ink-2">{it.text}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {profile.leftover && (
            <div className="flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-[8px] bg-blush-soft text-rose-text inline-flex items-center justify-center shrink-0">
                <Icon name="file" className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">More notes</span>
                <span className="block text-[12.5px] leading-relaxed text-ink-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{profile.leftover}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
