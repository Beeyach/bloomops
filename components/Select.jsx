'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A custom <select> replacement. Styled trigger + a menu portalled to <body>,
// so the open list matches the app instead of the OS popup AND escapes any
// table/panel overflow (the exact problem the native selects had). Positioned
// with fixed coordinates from the trigger rect; flips upward when there isn't
// room below. Closes on outside pointerdown, Escape, and scroll/resize.
//
// Behaviour is a drop-in match for <select>: pass value + onChange(value).
//
//   <Select
//     value={p.stage}
//     onChange={(v) => onPatch({ stage: v })}
//     options={STAGES}                         // strings, or {value,label}
//     placeholder="Stage"
//     ariaLabel="Stage"
//   />

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Chevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ color: 'var(--ink-3)', transition: 'transform 160ms ease', transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  disabled = false,
  className = '',
  buttonClassName = '',
  minWidth = 180,
  ariaLabel,
  // 'surface' (default) is styled for the app background; 'dark' is for the
  // charcoal bulk-action pill, where a light trigger would clash.
  tone = 'surface',
}) {
  const opts = options.map((o) => (o && typeof o === 'object' ? o : { value: o, label: String(o) }));
  const current = opts.find((o) => String(o.value) === String(value));

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const menuH = Math.min(opts.length * 36 + 12, 300);
    const below = window.innerHeight - b.bottom;
    const flipUp = below < menuH + 10 && b.top > below;
    setPos({
      left: b.left,
      top: flipUp ? b.top - 6 : b.bottom + 6,
      width: Math.max(b.width, minWidth),
      flipUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onScroll = () => place();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // Scroll listener is capture:true so it fires for any scroll container,
    // matching the app's existing portal-menu behaviour.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, opts.length]);

  return (
    <div className={'relative inline-block ' + className}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={
          'inline-flex items-center justify-between gap-2.5 rounded-[8px] px-3 py-2 text-[13px] font-medium ' +
          (tone === 'dark'
            ? 'bg-transparent border border-paper/25 text-paper hover:bg-paper/10 disabled:opacity-50 '
            : 'bg-surface border text-ink transition hover:border-rose-line disabled:opacity-50 ') +
          'focus:outline-none ' + buttonClassName
        }
        style={{
          minWidth,
          // Dark tone borrows the theme-aware paper border from its className;
          // only override to rose when open. Surface tone drives the border
          // inline for both states.
          borderColor: tone === 'dark'
            ? (open ? 'var(--rose)' : undefined)
            : (open ? 'var(--rose)' : 'var(--line-strong)'),
          boxShadow: open && tone !== 'dark' ? '0 0 0 3px var(--rose-tint)' : 'none',
        }}
      >
        <span className={tone === 'dark' ? 'text-paper' : (current ? 'text-ink' : 'text-ink-3')} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : placeholder}
        </span>
        <Chevron open={open} />
      </button>

      {open && typeof document !== 'undefined' && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="bg-panel border border-line rounded-[12px] shadow-card p-1.5 slim-scroll"
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            minWidth: pos.width,
            maxHeight: 300,
            overflowY: 'auto',
            zIndex: 9999,
            transform: pos.flipUp ? 'translateY(-100%)' : 'none',
            animation: 'ltb-select-pop 140ms cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          {opts.map((o) => {
            const on = String(o.value) === String(value);
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => { onChange && onChange(o.value); setOpen(false); }}
                className={
                  'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-[8px] text-[13px] text-left transition ' +
                  (on ? 'text-rose-text font-medium' : 'text-ink-2 hover:bg-hover-wash-soft hover:text-ink')
                }
              >
                <span style={{ width: 14, flex: 'none', color: 'var(--rose-text)' }}>{on ? <CheckIcon /> : null}</span>
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{o.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// Add this keyframe once (Select relies on it; it's also in
// handoff/globals-additions.css if you pasted that):
//   @keyframes ltb-select-pop { from { opacity:0; transform: translateY(-4px) } to { opacity:1; transform:none } }
