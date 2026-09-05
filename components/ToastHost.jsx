'use client';

import { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast } from '../lib/toast.mjs';
import { Icon } from './Icons';

// Renders the toast stack bottom-center, above the bulk-select bar. Strong
// edges and full-ink text throughout (a11y): a notification nobody can see
// is worse than none.
export default function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeToasts(setItems), []);
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 px-4 w-full max-w-[480px] pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto w-full flex items-center gap-2.5 rounded-xl border px-4 py-2.5 shadow-card backdrop-blur bg-surface/95 ${
            t.tone === 'error' ? 'border-poppy' : 'border-line-strong'
          }`}
        >
          <Icon
            name={t.tone === 'error' ? 'alert-triangle' : 'check'}
            className={`w-4 h-4 shrink-0 ${t.tone === 'error' ? 'text-poppy-text' : 'text-leaf-text'}`}
          />
          <span className="flex-1 min-w-0 text-[13px] text-ink break-words">{t.message}</span>
          {t.action && (
            <button
              onClick={() => { dismissToast(t.id); t.action.onClick(); }}
              className="shrink-0 text-[12.5px] font-semibold text-rose-text hover:underline underline-offset-2"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="shrink-0 p-0.5 rounded-[5px] text-ink-3 hover:text-ink transition"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
