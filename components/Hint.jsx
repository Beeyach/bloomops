'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';

const STORE_KEY = 'ltb_hints_dismissed';

function dismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

// A one-time tip bubble for newcomers. Renders nothing once dismissed
// (persisted per device). Mounted hidden so hydration matches the server,
// then revealed if the id hasn't been dismissed.
// Chapter 11: `title` turns a Hint into a collapsed disclosure — one line
// that opens if you want it. A permanent explanatory band across the top of
// a working screen is copy competing with the work; a summary line is the
// same offer, taking one line instead of four.
export default function Hint({ id, title = null, children }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!dismissed().has(id));
  }, [id]);

  if (!show) return null;

  function close() {
    setShow(false);
    try {
      const next = dismissed();
      next.add(id);
      localStorage.setItem(STORE_KEY, JSON.stringify([...next]));
    } catch {}
  }

  return (
    // A tip is not an alert. Tinting it accent-pink made every screen open
    // with a colored band across the top; it sits on the surface now and
    // reads as an aside, which is what it is.
    <div className="flex items-start gap-2.5 r-lg border border-line bg-panel px-3.5 py-2 mb-4 ui-small leading-relaxed text-ink-2">
      <span className="shrink-0 mt-0.5 text-ink-3" aria-hidden="true"><Icon name="lightbulb" className="w-4 h-4" strokeWidth={1.8} /></span>
      <div className="flex-1 min-w-0">
        {title ? (
          <details>
            <summary className="cursor-pointer ui-small font-semibold text-ink-2 hover:text-ink transition">
              {title}
            </summary>
            <div className="mt-2">{children}</div>
          </details>
        ) : children}
      </div>
      <button
        onClick={close}
        aria-label="Dismiss tip"
        className="shrink-0 w-6 h-6 rounded-[6px] text-ink-3 hover:text-ink-2 hover:bg-hover-wash-soft transition inline-flex items-center justify-center"
      >
        <Icon name="x" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
