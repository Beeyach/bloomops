'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SiteFavicon from './SiteFavicon';
import { Icon } from './Icons';

// Cmd+K / Ctrl+K: jump anywhere. Type a few letters and hit Enter — a
// prospect opens in their drawer, a view switches. At 5,800 rows the
// fastest way to a lead stopped being the table.
//
// Self-contained: owns its open state and hotkey; the parent only supplies
// data and the two actions.

const VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'inbox', label: 'Leads' },
  { key: 'clients', label: 'Clients' },
  { key: 'stats', label: 'Stats' },
  { key: 'workspace', label: 'Templates' },
  { key: 'prompts', label: 'Chat prompts' },
  { key: 'settings', label: 'Settings' },
];

const MAX_PROSPECTS = 8;

export default function CommandPalette({ prospects, onOpenProspect, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQ('');
        setSel(0);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const views = VIEWS
      .filter((v) => !needle || v.label.toLowerCase().includes(needle))
      .map((v) => ({ type: 'view', key: `v:${v.key}`, view: v }));
    if (!needle) return views.slice(0, 5);
    const hits = [];
    for (const p of prospects || []) {
      const hay = `${p.name || ''} ${p.business_name || ''} ${p.email || ''} ${p.domain || ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
      // Names that START with the query outrank mere mentions.
      const rank = (p.name || p.business_name || '').toLowerCase().startsWith(needle) ? 0 : 1;
      hits.push({ type: 'prospect', key: `p:${p.id}`, p, rank });
      if (hits.length >= MAX_PROSPECTS * 3) break;
    }
    hits.sort((a, b) => a.rank - b.rank);
    return [...hits.slice(0, MAX_PROSPECTS), ...views.slice(0, 3)];
  }, [q, prospects]);

  useEffect(() => { setSel(0); }, [q]);

  function activate(item) {
    setOpen(false);
    if (!item) return;
    if (item.type === 'prospect') onOpenProspect(item.p);
    else onNavigate(item.view.key);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/30 flex items-start justify-center pt-[16vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="glass-panel w-full max-w-[520px] overflow-hidden !rounded-xl shadow-card">
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Icon name="search" className="w-4 h-4 text-ink-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); activate(results[sel]); }
            }}
            placeholder="Jump to a prospect or a view…"
            aria-label="Search prospects and views"
            className="flex-1 bg-transparent py-3.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <kbd className="text-[10px] font-semibold text-ink-3 border border-line rounded-[5px] px-1.5 py-0.5">esc</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto slim-scroll py-1.5">
          {results.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-ink-2 italic">Nothing matches. Try a name, business, or email.</p>
          )}
          {results.map((item, i) => (
            <button
              key={item.key}
              onClick={() => activate(item)}
              onMouseEnter={() => setSel(i)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition ${
                i === sel ? 'bg-rose-tint' : ''
              }`}
            >
              {item.type === 'prospect' ? (
                <>
                  <SiteFavicon domain={item.p.domain} size={16} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      {item.p.name || item.p.business_name || item.p.email || `#${item.p.id}`}
                    </span>
                    <span className="block text-[11px] text-ink-2 truncate">
                      {[item.p.business_name !== item.p.name ? item.p.business_name : null, item.p.stage || 'New']
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-[10px] text-ink-3 shrink-0">open</span>
                </>
              ) : (
                <>
                  <Icon name="sparkle" className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                  <span className="flex-1 text-[13px] font-medium text-ink">{item.view.label}</span>
                  <span className="text-[10px] text-ink-3 shrink-0">view</span>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
