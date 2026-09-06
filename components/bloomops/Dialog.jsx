'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './Icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// One modal for everything the shell opens: confirmations, the invite
// form, and the phone navigation sheet (`sheet`). It traps Tab, closes on
// Escape and on a click outside, locks page scroll, moves focus in on
// open and back to the opener on close, and is labelled by its title.
export default function Dialog({ open, onClose, title, children, sheet = false, initialFocus = null, describedBy = null }) {
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const titleId = useRef(`bo-dialog-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusTarget = (initialFocus && panel?.querySelector(initialFocus)) || panel?.querySelector(FOCUSABLE) || panel;
    const raf = requestAnimationFrame(() => focusTarget?.focus?.());

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open, onClose, initialFocus]);

  if (!open) return null;

  return (
    <div className={`bo-backdrop${sheet ? ' bo-backdrop-sheet' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy || undefined}
        tabIndex={-1}
        className={sheet ? 'bo-sheet' : 'bo-dialog'}
      >
        <div className="bo-dialog-head">
          <h2 id={titleId} className="bo-h2">
            {title}
          </h2>
          <button type="button" className="bo-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
