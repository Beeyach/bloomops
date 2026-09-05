'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './Icons';

// Right-side glass drawer. Children = the form. Esc / backdrop click close;
// focus moves in on open and returns to the trigger on close.
export default function AddProspectDrawer({ open, onClose, title = 'Add a prospect', children }) {
  const panelRef = useRef(null);
  const lastActive = useRef(null);

  // Held in a ref so the effect below does not depend on it. The parent passes
  // a fresh arrow function every render, so listing onClose as a dependency
  // re-ran this effect on every keystroke and stole focus mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement;
    const panel = panelRef.current;
    // Fields first. The close button comes before the form in the DOM, so
    // asking for any focusable element handed back the X and typing went
    // nowhere.
    const field = panel?.querySelector('input, select, textarea');
    (field || panel?.querySelector('button'))?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panel) {
        const items = panel.querySelectorAll('a, button, input, select, textarea, [tabindex]');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      lastActive.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-panel absolute right-4 top-4 bottom-4 w-full max-w-md overflow-y-auto p-6 !bg-panel"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl text-ink">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-[6px] text-ink-2 hover:text-ink hover:bg-hover-wash-soft transition inline-flex items-center justify-center" aria-label="Close">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
