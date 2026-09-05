'use client';

import { useEffect, useRef, useState } from 'react';

// A small "what is this?" bubble for tools a user may never have met:
// Apify, API keys, .skill files. Renders an ⓘ button inline; click opens
// a plain-words explainer. Click outside or Esc closes it.
export default function InfoTip({ title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={title}
        aria-expanded={open}
        className={`w-[17px] h-[17px] rounded-full border text-[10px] leading-none font-semibold inline-flex items-center justify-center transition ml-1 ${
          open
            ? 'border-rose text-rose-text bg-rose-tint'
            : 'border-line-strong text-ink-3 hover:text-rose-text hover:border-rose'
        }`}
      >
        ?
      </button>
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 top-[22px] z-50 block w-[280px] rounded-[12px] border border-line bg-panel shadow-card p-3 text-left cursor-auto font-sans">
          <span className="block font-sans font-semibold text-ink text-[12px] mb-1">{title}</span>
          <span className="block font-sans text-[12px] leading-snug text-ink-2 font-normal normal-case tracking-normal whitespace-normal">{children}</span>
        </span>
      )}
    </span>
  );
}
