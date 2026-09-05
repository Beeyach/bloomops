'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeDialog, resolveDialog } from '../lib/dialog.mjs';
import { Icon } from './Icons';

// Renders whatever dialog the store currently holds. Mounted once at the
// app root. Keyboard: Enter confirms, Escape cancels.
export default function DialogHost() {
  const [dialog, setDialog] = useState(null);
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const cancelRef = useRef(null);
  const panelRef = useRef(null);
  const prevFocusRef = useRef(null);

  useEffect(() => subscribeDialog(setDialog), []);
  useEffect(() => {
    if (!dialog) {
      // Hand focus back to whatever opened the dialog.
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
      return;
    }
    prevFocusRef.current = document.activeElement;
    if (dialog.kind === 'prompt') {
      setText(dialog.defaultValue || '');
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      // Destructive confirms start on Cancel — Enter still confirms, but a
      // stray Space or Tab won't delete anything.
      setTimeout(() => cancelRef.current?.focus(), 20);
    }
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && dialog.kind !== 'prompt') { e.preventDefault(); confirm(); }
      else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        const focusables = panelRef.current?.querySelectorAll('button, input');
        if (!focusables || focusables.length === 0) return;
        const list = [...focusables];
        const idx = list.indexOf(document.activeElement);
        e.preventDefault();
        const next = e.shiftKey
          ? list[(idx - 1 + list.length) % list.length]
          : list[(idx + 1) % list.length];
        next.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog]);

  if (!dialog) return null;

  function cancel() { resolveDialog(dialog.kind === 'prompt' ? null : false); }
  function confirm() {
    if (dialog.kind === 'prompt') {
      const v = text.trim();
      resolveDialog(v || null);
    } else {
      resolveDialog(true);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title || 'Confirm'}
        className="w-full max-w-[400px] rounded-[12px] border border-line bg-panel shadow-card p-5 rise-in"
      >
        {dialog.title && (
          <div className="flex items-center gap-2.5 mb-1">
            {dialog.danger && (
              <span
                className="w-8 h-8 shrink-0 rounded-full text-poppy-text inline-flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--poppy) 14%, transparent)' }}
                aria-hidden="true"
              >
                <Icon name="alert-triangle" className="w-4 h-4" />
              </span>
            )}
            <div className="font-serif text-[22px] text-bright leading-tight">{dialog.title}</div>
          </div>
        )}
        {/* pre-line so a message can use line breaks. Everything before this
            was a single sentence, but a confirm that lists what it is about to
            spend needs its numbers on their own lines to be read at all. */}
        {dialog.message && (
          <p className="text-[13px] text-ink-2 leading-snug whitespace-pre-line">{dialog.message}</p>
        )}

        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
            placeholder={dialog.placeholder}
            className="w-full mt-3 bg-input border border-line rounded-[8px] px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
          />
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            ref={cancelRef}
            onClick={cancel}
            className="text-[13px] font-medium px-3.5 py-2 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose"
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={confirm}
            className={`text-[13px] font-medium px-3.5 py-2 rounded-[8px] text-white transition ${
              dialog.danger ? 'bg-poppy hover:opacity-90' : 'bg-rose hover:bg-rose-hover'
            }`}
          >
            {dialog.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
