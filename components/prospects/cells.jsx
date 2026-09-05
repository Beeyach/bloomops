'use client';

// Every cell component the prospects table renders, plus the popover
// machinery (PortalMenu) and small style helpers they share. Extracted
// verbatim from ProspectsApp.jsx (split step 7).

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icons';
import SiteFavicon from '../SiteFavicon';
import StageIcon from './StageIcon';
import {
  STAGE_META, RATING_META, REPLY_TYPE_META,
} from '../../lib/stage-meta.mjs';
import { COUNTRY_META } from '../../lib/country-meta.mjs';
import { parseEmailSequence, parseVideoReasons } from '../../lib/prospect-parse.mjs';
import { getLastSentNumber } from '../../lib/due.mjs';
import { watchUrl, watchPreviewUrl, videoSeen } from '../../lib/watch-url.mjs';

export function stageStyle(s) {
  return STAGE_META[s] || STAGE_META.New;
}
export function stageLabel(s) {
  // Plain text label — used inside native <select> options where SVGs
  // aren't allowed. Visual identity (icon, color) is carried by the
  // <StageChip> / <StagePicker> components instead.
  return s;
}
// Days-since-contact color scale. Picked to harmonize with STAGE_META
// borders so the column doesn't look like a foreign element.
export function daysAgoColor(n) {
  if (n == null) return 'var(--age-none)';
  if (n <= 2) return 'var(--age-fresh)';      // fresh green
  if (n <= 5) return 'var(--age-warm)';      // warm amber
  if (n <= 10) return 'var(--age-stale)';     // burnt orange
  return 'var(--age-cold)';                  // alarm red
}
export function normalizeDomainHref(domain) {
  if (!domain) return '#';
  let d = domain.trim();
  if (!/^https?:\/\//i.test(d)) d = 'https://' + d;
  return d;
}
// "https://example.com/review/jane-doe" → "example.com/review/jane-doe"
export function stripProtocol(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function StagePicker({ value, stages, onChange }) {
  const [open, setOpen] = useState(false);
  // `stages` arrives already filtered by the workspace's hidden list. If
  // this row is sitting on a hidden stage, it still gets to appear in its
  // own menu — otherwise the row would show a stage you couldn't re-pick
  // after changing your mind.
  const pickable = useMemo(
    () => (stages.includes(value) ? stages : [value, ...stages]),
    [stages, value]
  );
  // Fixed-position coords for the popover, computed from the button rect
  // when opened. Rendered through a portal so the table's overflow-x-auto
  // container can't clip it, and flipped above the button when there isn't
  // enough room below (the bug: bottom rows opened downward off-screen).
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const MENU_WIDTH = 208; // w-52
  const MENU_MAX_HEIGHT = Math.round(
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400
  );

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 320) && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setPos(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 6, maxHeight: spaceBelow - 16 }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Close when the PAGE/table scrolls (the fixed-position menu would
    // drift away from its button). But ignore scrolls that happen INSIDE
    // the menu's own list — otherwise scrolling a long stage list snaps
    // it shut. This was the "minimizes by itself, can't scroll" bug.
    function onScroll(e) {
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function pick(s) {
    setOpen(false);
    if (s !== value) onChange(s);
  }

  const meta = STAGE_META[value] || STAGE_META.New;
  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="rounded-[8px] border px-2.5 py-1 text-[12px] font-medium tracking-[0.1em] inline-flex items-center gap-1.5 transition hover:brightness-110"
        style={{
          backgroundColor: meta.bg === 'transparent' ? 'var(--surface)' : meta.bg,
          borderColor: meta.border,
          color: meta.border,
        }}
        title={value}
      >
        <StageIcon stage={value} className="w-3 h-3 shrink-0" />
        <span className="truncate max-w-[110px]">{value}</span>
        <Icon name="chevron-down" className="w-3 h-3 opacity-60" />
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 w-52 bg-surface border border-line rounded-xl shadow-card p-1.5 overflow-y-auto bw-scroll"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: Math.max(160, Math.min(pos.maxHeight, MENU_MAX_HEIGHT)),
            }}
          >
            {pickable.map((s) => {
              const m = STAGE_META[s] || {};
              const isCurrent = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pick(s)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                    isCurrent ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: m.bg === 'transparent' ? 'var(--surface)' : m.bg,
                      borderColor: m.border,
                      color: m.border,
                    }}
                  >
                    <StageIcon stage={s} className="w-3.5 h-3.5" />
                  </span>
                  <span style={{ color: m.faded ? 'var(--ink-2)' : 'var(--ink)' }}>{s}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// Country selector. Same portal + flip machinery as StagePicker so it
// never gets clipped by the table's horizontal scroll. Shows the two-letter
// code (or a dashed placeholder), opens a small list of code + name.
export function CountryPicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const meta = value ? COUNTRY_META[value] : null;

  const MENU_WIDTH = 176; // w-44
  const MENU_MAX_HEIGHT = Math.round(
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 360
  );

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 260) && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setPos(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 6, maxHeight: spaceBelow - 16 }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll(e) {
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function pick(c) {
    setOpen(false);
    if (c !== (value || null)) onChange(c);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border hover:bg-blush-soft transition text-sm ${
          meta ? 'border-line' : 'border-amber-400/60 bg-amber-50/40'
        }`}
        title={meta ? `${meta.label} · ${meta.tz}` : 'No country set. Breaks the follow-up sweep. Click to set.'}
      >
        {meta ? (
          <span className="text-xs font-semibold text-charcoal">{value}</span>
        ) : (
          <>
            {/* Amber dot: missing country breaks the follow-up sweeps. */}
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-xs text-muted/70">—</span>
          </>
        )}
        <Icon name="chevron-down" className="w-3 h-3 opacity-50" />
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 w-44 bg-surface border border-line rounded-xl shadow-card p-1.5 overflow-y-auto bw-scroll"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: Math.max(120, Math.min(pos.maxHeight, MENU_MAX_HEIGHT)),
            }}
          >
            <button
              type="button"
              onClick={() => pick(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                !value ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'
              }`}
            >
              <span className="w-5 text-center text-muted">—</span>
              <span className="text-muted">None</span>
            </button>
            {options.map((c) => {
              const m = COUNTRY_META[c] || {};
              const isCurrent = c === value;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                    isCurrent ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'
                  }`}
                >
                  <span className="text-xs font-semibold text-charcoal w-7">{c}</span>
                  <span className="truncate text-muted">{m.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// Small generic portal dropdown, positioned off the trigger's rect and flipped
// up when there's no room below — same anti-clip machinery as CountryPicker.
// `renderTrigger(open)` draws the button; `children` is the menu content.
export function PortalMenu({ width = 176, panelClassName, renderTrigger, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const MAX_H = Math.round(typeof window !== 'undefined' ? window.innerHeight * 0.5 : 320);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < Math.min(MAX_H, 240) && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setPos(openUp
      ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
      : { left, top: rect.bottom + 6, maxHeight: spaceBelow - 16 });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    function onScroll(e) { if (!popRef.current?.contains(e.target)) setOpen(false); }
    function onResize() { setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <span ref={btnRef} onClick={() => (open ? setOpen(false) : openMenu())}>
        {renderTrigger(open)}
      </span>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className={`fixed z-50 overflow-y-auto bw-scroll ${panelClassName || 'bg-surface border border-line rounded-xl shadow-card p-1.5'}`}
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width, maxHeight: Math.max(120, Math.min(pos.maxHeight, MAX_H)) }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </div>
  );
}

// Reply indicator + setter. A colored dot when replied (by reply_type),
// a faint outline when not. Opens a picker for the three dispositions.
export function RepliedCell({ prospect, replyTypes, onSet }) {
  const type = prospect.reply_type || null;
  const m = type ? REPLY_TYPE_META[type] : null;
  const title = m
    ? `${m.label}${prospect.reply_date ? ` · ${prospect.reply_date}` : ''}`
    : 'No reply logged';

  return (
    <PortalMenu
      width={160}
      renderTrigger={() => (
        <button
          type="button"
          className="inline-flex items-center justify-center w-6 h-6 rounded-full border transition hover:brightness-95"
          style={m
            ? { backgroundColor: m.bg, borderColor: m.color }
            : { backgroundColor: 'transparent', borderColor: 'var(--line-strong)', borderStyle: 'dashed' }}
          title={title}
        >
          {m
            ? <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
            : <span className="text-[10px] text-muted/50">—</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <button
            onClick={() => { close(); if (type != null) onSet(null); }}
            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition ${!type ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'}`}
          >
            <span className="text-muted">No reply</span>
          </button>
          {replyTypes.map((t) => {
            const tm = REPLY_TYPE_META[t] || {};
            return (
              <button
                key={t}
                onClick={() => { close(); if (t !== type) onSet(t); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition ${t === type ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tm.color }} />
                {tm.label || t}
              </button>
            );
          })}
        </>
      )}
    </PortalMenu>
  );
}









// Compact cell that reads at a glance:
//   · no sequence, no extras → ghost mail + "＋" (add a sequence)
//   · no sequence, but a review PDF exists → clipboard (data worth seeing)
//   · sequence with unsent emails → mail + count of what's LEFT to send
//   · sequence fully sent → green check (complete)
// Clicking always opens the viewer modal.
export function SeqCell({ prospect, onOpen }) {
  // Slim first-paint rows don't carry email_sequence yet — shimmer for the
  // second it takes the full rows to swap in, instead of flashing the
  // "add a sequence" ghost on rows that have five emails stored.
  if (prospect._hydrating) {
    return <span className="skeleton inline-block w-7 h-4 rounded" aria-hidden="true" />;
  }
  const seq = parseEmailSequence(prospect.email_sequence);
  const count = Array.isArray(seq) ? seq.length : 0;
  // Only count what the Seq modal actually shows. Audit notes moved to the
  // Info modal, so they must not make this cell promise content here.
  const hasExtras = !!(prospect.pdf_filename || prospect.review_url);

  // Nothing stored at all — invite adding a sequence.
  if (!count && !hasExtras) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg border border-dashed border-line text-muted/60 hover:text-mauve-deep hover:border-mauve transition"
        title="No emails stored yet. Click to add"
      >
        <Icon name="mail" className="w-3.5 h-3.5" />
        <span className="text-[10px] leading-none">＋</span>
      </button>
    );
  }

  // A review PDF but no emails yet — still worth opening.
  if (!count) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center px-1.5 py-1 rounded-lg border border-line text-charcoal-2 hover:bg-blush-soft transition"
        title="Review PDF stored. Click to view"
      >
        <Icon name="clipboard" className="w-3.5 h-3.5" />
      </button>
    );
  }

  const lastSent = getLastSentNumber(prospect);
  const unsent = seq.filter((e) => (e.number || 0) > lastSent).length;

  // Every stored email has gone out.
  if (unsent === 0) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center px-1.5 py-1 rounded-lg border border-line hover:bg-blush-soft transition"
        style={{ color: 'var(--positive-text)' }}
        title={`All ${count} email${count === 1 ? '' : 's'} sent. Click to view`}
      >
        <Icon name="check-circle" className="w-3.5 h-3.5" />
      </button>
    );
  }

  // Some still to send — the badge is a to-do count.
  return (
    <button
      onClick={onOpen}
      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-line hover:bg-blush-soft transition text-mauve-deep"
      title={`${unsent} of ${count} email${count === 1 ? '' : 's'} left to send. Click to view`}
    >
      <Icon name="mail" className="w-3.5 h-3.5" />
      <span className="text-[11px] num-tabular text-charcoal-2">{unsent}</span>
    </button>
  );
}


export function ColResizer({ onMouseDown }) {
  // A wide, easy-to-grab zone on the right edge with an always-visible
  // divider line that lights up rose on hover, so every column reads as
  // resizable. Stops propagation so mousedown doesn't trigger the th sort.
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className="group/rz absolute top-0 right-0 h-full w-3 cursor-col-resize select-none flex justify-end z-10"
      title="Drag to resize"
    >
      <div className="w-px h-full bg-line-strong group-hover/rz:bg-rose group-hover/rz:w-[2px] transition-[width,background-color] duration-150 ease-[cubic-bezier(0.22,0.61,0.36,1)]" />
    </div>
  );
}

export function focusNextEditable(currentTd, shiftKey) {
  if (!currentTd) return;
  const row = currentTd.closest('tr');
  if (!row) return;
  const cells = Array.from(row.querySelectorAll('td[data-tab="1"]'));
  const idx = cells.indexOf(currentTd);
  const nextIdx = shiftKey ? idx - 1 : idx + 1;
  const next = cells[nextIdx];
  if (next) next.click();
}

// `display` swaps what the cell SHOWS (e.g. "3d ago") while `value` stays the
// stored form the editor opens with; `titleText` overrides the hover text.
// `onDisplayClick` repurposes the cell's click (e.g. the Name cell opens the
// profile — the thing everyone tries first); editing then moves behind a
// hover-revealed pencil so the rare action stops squatting on the common one.
export function EditableCell({ value, onSave, type = 'text', displayClassName = '', action = null, display, titleText, onDisplayClick }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);
  const tdRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      if (input) {
        input.focus();
        try { input.select(); } catch {}
      }
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft === '' ? null : draft;
    if ((value ?? null) !== next) onSave(next);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value ?? '');
      setEditing(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit();
      const td = tdRef.current;
      setTimeout(() => focusNextEditable(td, e.shiftKey), 0);
    }
  }

  return (
    <td
      ref={tdRef}
      data-tab="1"
      className="px-3 py-1.5 align-top border-b border-hairline text-ink-2"
      onClick={() => !editing && (onDisplayClick ? onDisplayClick() : setEditing(true))}
    >
      {editing ? (
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="cell-input text-sm"
        />
      ) : (
        <span className="flex items-center gap-1 min-w-0">
          {/* title = the full value: these cells truncate with an ellipsis,
              and hovering was the only way to read a long email or business
              name without entering edit mode. DomainCell already did this. */}
          <span
            className={`cell-display text-sm min-w-0 ${displayClassName} ${
              onDisplayClick ? 'cursor-pointer hover:underline decoration-rose decoration-1 underline-offset-2' : ''
            }`}
            title={titleText ?? (value ? String(value) : undefined)}
          >
            {display ?? (value || <span className="text-muted/60">—</span>)}
          </span>
          {onDisplayClick && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              aria-label="Edit"
              title="Edit"
              className="hit-24 shrink-0 p-0.5 rounded-[5px] transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-mauve-deep hover:bg-hover-wash-soft"
            >
              <Icon name="pencil" className="w-3 h-3" />
            </button>
          )}
          {action}
        </span>
      )}
    </td>
  );
}

// Tri-state Yes / No / undecided cell for call_booked and proposal_sent.
// The DB stores NULL (undecided), 1 (Yes) or 0 (No); the select passes those
// back as '' | 1 | 0 so the API's general branch maps '' → NULL.
// Pass/fail gate from a qualification checklist. Y is a real signal, so
// it gets the accent; N stays quiet (it is the common answer).
// One picker for every simple cell choice. The table used to mix a
// styled stage popover with raw OS <select> menus, so half the dropdowns
// rendered white-on-blue system chrome in the middle of a dark table.
// This wears the same trigger and panel as the stage picker.
export function CellPicker({ value, options, onChange, placeholder = '—', width = 168, tone, title }) {
  const current = options.find((o) => String(o.value) === String(value ?? ''));
  return (
    <PortalMenu
      width={width}
      renderTrigger={(open) => (
        <button
          type="button"
          title={title}
          className={
            'w-full text-left rounded-[6px] border px-2 py-1 text-[12px] transition inline-flex items-center justify-between gap-1.5 ' +
            (open ? 'border-rose bg-hover-wash-soft' : 'border-transparent hover:border-line')
          }
          style={{ color: current ? (tone ? tone(current.value) : 'var(--ink)') : 'var(--ink-3)' }}
        >
          <span className="truncate">{current ? current.label : placeholder}</span>
          <Icon name="chevron-down" className="w-3 h-3 opacity-50 shrink-0" />
        </button>
      )}
    >
      {(close) => (
        <>
          {options.map((o) => {
            const selected = String(o.value) === String(value ?? '');
            return (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => { close(); if (!selected) onChange(o.value); }}
                className={
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-[13px] transition ' +
                  (selected ? 'bg-rose-tint text-rose-text' : 'text-ink hover:bg-hover-wash-soft')
                }
              >
                <span className="flex-1 truncate">{o.label}</span>
                {selected && <Icon name="check" className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })}
        </>
      )}
    </PortalMenu>
  );
}

// Pass/fail gate from the qualification checklist.
export function MustHavesCell({ value, onChange }) {
  return (
    <CellPicker
      value={value === 'Y' || value === 'N' ? value : ''}
      onChange={onChange}
      title="Did they pass all three must-haves?"
      width={150}
      options={[
        { value: '', label: '—' },
        { value: 'Y', label: 'Yes, all three' },
        { value: 'N', label: 'No' },
      ]}
      tone={(v) => (v === 'Y' ? 'var(--leaf-text)' : 'var(--ink-2)')}
    />
  );
}

// 0-7 revenue signals. 2+ is the qualifying line, so 2+ reads as ink and
// below that stays grey — the number tells you where it stands.
export function RevenueScoreCell({ value, onChange }) {
  const n = Number.isInteger(value) ? value : '';
  return (
    <CellPicker
      value={n === '' ? '' : String(n)}
      onChange={(v) => onChange(v === '' ? '' : Number(v))}
      title="Revenue signals. Two or more qualifies."
      width={150}
      options={[
        { value: '', label: '—' },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
          value: String(i),
          label: i === 0 ? '0 signals' : `${i} signal${i === 1 ? '' : 's'}${i >= 2 ? ' ✓' : ''}`,
        })),
      ]}
      tone={(v) => (Number(v) >= 2 ? 'var(--ink)' : 'var(--ink-2)')}
    />
  );
}

// Yes / No / not answered. Stored as 1 / 0 / null. `title` explains which
// question the cell answers on hover — its sibling pickers already do this.
export function YesNoCell({ value, onChange, title }) {
  return (
    <CellPicker
      value={value === 1 ? '1' : value === 0 ? '0' : ''}
      onChange={(v) => onChange(v === '' ? '' : Number(v))}
      title={title}
      width={140}
      options={[
        { value: '', label: '—' },
        { value: '1', label: 'Yes' },
        { value: '0', label: 'No' },
      ]}
      tone={(v) => (v === '1' ? 'var(--leaf-text)' : 'var(--ink-2)')}
    />
  );
}

export function RatingCell({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // The swatches used to be an absolutely-positioned div inside the cell. The
  // table wrapper sets overflow-x, and CSS makes the other axis auto the moment
  // one axis is not visible, so the menu was clipped on the lower rows and
  // opening it grew the wrapper's scrollHeight, which threw a scrollbar in and
  // shifted the table. Every other picker in this table already renders into a
  // portal at fixed coordinates for exactly this reason. This one was missed.
  // Laid out as a grid rather than the old single column. Ten swatches stacked
  // vertically made a 44px strip about 340px tall, which is what ran off the
  // bottom of the table in the first place, and which read as circles floating
  // over the rows rather than as a menu.
  const MENU_COLS = 4;
  const MENU_WIDTH = 148;
  const MENU_MAX_HEIGHT = Math.round(
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400
  );

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 320) && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setPos(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 6, maxHeight: spaceBelow - 16 }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Close on any scroll outside the menu: it is positioned at fixed
    // coordinates, so it would otherwise drift away from its own button.
    function onScroll(e) {
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // Rating value in the DB is still the emoji string (so import/export
  // CSVs stay portable). We just render it as a colored icon swatch.
  const m = value ? RATING_META[value] : null;
  const buttonStyle = m
    ? { backgroundColor: m.bg, borderColor: m.border, color: m.color }
    : { backgroundColor: 'transparent', borderColor: 'var(--line-strong)', borderStyle: 'dashed', color: 'var(--ink-3)' };

  function pick(v) {
    setOpen(false);
    if ((value ?? null) !== (v ?? null)) onChange(v);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        style={buttonStyle}
        className="w-7 h-7 rounded-full border flex items-center justify-center transition hover:brightness-95"
        title={m?.label || 'Set rating'}
      >
        {m ? (
          <Icon name={m.icon} filled={m.filled} className="w-3.5 h-3.5" />
        ) : (
          <span className="text-xs">—</span>
        )}
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 bg-surface border border-line rounded-xl shadow-card p-2 grid gap-1.5 overflow-y-auto bw-scroll"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: MENU_WIDTH,
              gridTemplateColumns: `repeat(${MENU_COLS}, minmax(0, 1fr))`,
              maxHeight: Math.max(120, Math.min(pos.maxHeight, MENU_MAX_HEIGHT)),
            }}
          >
            <button
              type="button"
              onClick={() => pick(null)}
              className="w-7 h-7 mx-auto rounded-full border border-dashed border-line text-xs text-muted hover:bg-blush-soft transition flex items-center justify-center"
              title="Clear rating"
            >
              —
            </button>
            {options.map((r) => {
              const rm = RATING_META[r] || {};
              const isCurrent = r === value;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => pick(r)}
                  style={{ backgroundColor: rm.bg, borderColor: rm.color, color: rm.color }}
                  className={`w-7 h-7 mx-auto rounded-full border flex items-center justify-center transition hover:brightness-95 ${
                    isCurrent ? 'ring-2 ring-offset-1 ring-offset-surface ring-mauve' : ''
                  }`}
                  title={rm.label || r}
                >
                  <Icon name={rm.icon} filled={rm.filled} className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}


// Whether this prospect can be sent a video, readable without opening anything.
//
// Three states worth telling apart at a glance, because they lead to different
// actions: a video already exists and can go in an email today, a video is
// worth recording, or there is nothing to record. The last one is not a mark
// against the prospect. Their site is fine, and they stay in the sequence like
// everyone else, so it stays quiet rather than shouting a verdict.
export function VideoCell({ prospect, onOpenProfile }) {
  const tier = prospect.video_tier || null;

  // A recorded video has two states worth telling apart, both derived rather
  // than stored: waiting to go out, which is the one that needs doing, and
  // already gone, which is history and stays quiet. Either way the cell is
  // still the link to watch it.
  if (prospect.video_url) {
    const sentAt = prospect.video_sent_at || null;
    // The watch page told us they opened it. This is the hottest signal in
    // the table — a prospect who watched is a prospect to write to today —
    // so it outranks the quiet 'Sent' state visually.
    const seen = videoSeen(prospect.activity_log);
    return (
      <a
        href={watchPreviewUrl(prospect.video_url)}
        target="_blank"
        rel="noopener noreferrer"
        title={
          seen
            ? `They opened the video. ${seen.label}. Click to watch it yourself.`
            : sentAt
              ? `Video email sent on ${sentAt}. Click to watch it.`
              : 'Video is recorded and has not gone out yet. Click to watch it.'
        }
        className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border transition ${
          seen
            ? 'border-rose bg-blush-soft text-rose-text font-semibold hover:brightness-105'
            : sentAt
              ? 'border-line text-ink-3 hover:bg-blush-soft'
              : 'border-rose-btn bg-rose-btn text-white hover:brightness-110'
        }`}
      >
        <Icon name={seen ? 'eye' : 'play'} className="w-3 h-3" />
        {/* Action words, one vocabulary: 'Ready' = recorded, waiting to go
            out (the solid rose pill — the one thing to act on); 'Sent' =
            history, quiet; 'Seen'/'Watched' = they opened it, follow up. */}
        <span className="text-[10px] leading-none">
          {seen ? (seen.pct >= 95 ? 'Watched' : `Seen ${seen.pct >= 25 ? `${seen.pct}%` : ''}`.trim()) : sentAt ? 'Sent' : 'Ready'}
        </span>
      </a>
    );
  }

  if (tier === 'SEND' || tier === 'MAYBE') {
    const strong = tier === 'SEND';
    return (
      <button
        onClick={onOpenProfile}
        title={
          strong
            ? 'Something on their site is visibly broken. Open the profile to record it.'
            : 'A few small things. Open the profile to look before spending the credits.'
        }
        className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border transition ${
          strong
            ? 'border-rose text-rose-text font-semibold hover:bg-rose hover:text-white'
            : 'border-line text-ink-2 hover:border-rose hover:text-rose-text'
        }`}
      >
        <Icon name="play" className="w-3 h-3" />
        <span className="text-[10px] leading-none">{strong ? 'Record' : 'Look first'}</span>
      </button>
    );
  }

  const quiet = {
    NO_VIDEO: 'Their site is in good order, so there is nothing to record. Email them as normal.',
    SKIP: 'Their site is in good order, so there is nothing to record. Email them as normal.',
    BLOCKED: 'Their site would not load for the scanner. Worth looking yourself.',
  };
  return (
    <span
      className="text-[11px] text-ink-3"
      title={tier ? quiet[tier] || tier : 'Not scanned for a video yet.'}
    >
      {tier === 'BLOCKED' ? 'Blocked' : '—'}
    </span>
  );
}

export function DomainCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      try { inputRef.current?.select(); } catch {}
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft === '' ? null : draft;
    if ((value ?? null) !== next) onSave(next);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        className="cell-input text-sm"
      />
    );
  }
  if (!value) {
    return (
      <span className="cell-display text-sm text-muted/60" onClick={() => setEditing(true)}>
        —
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {/* The site's own mark, so a column of 1,700 URLs stops being a wall
          of text. Falls back to the quiet flower when there's no icon. */}
      <SiteFavicon domain={value} size={16} />
      <a
        href={normalizeDomainHref(value)}
        target="_blank"
        rel="noopener noreferrer"
        // A whole column of saturated link color is 1,700 shouts. Links
        // read as body text and earn the accent on hover.
        className="text-ink-2 hover:text-rose-text hover:underline text-sm truncate min-w-0 transition-colors"
        onClick={(e) => e.stopPropagation()}
        title={value}
      >
        {value}
      </a>
      <button
        onClick={() => setEditing(true)}
        className="hit-24 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-muted hover:text-mauve-deep opacity-0 group-hover:opacity-100 transition"
        title="Edit"
      >
        <Icon name="pencil" className="w-3 h-3" />
      </button>
    </div>
  );
}
