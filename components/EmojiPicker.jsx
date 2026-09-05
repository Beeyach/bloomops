'use client';

import { useEffect, useRef, useState } from 'react';

// A small emoji popover. Curated grid for one-tap picking, plus a text
// field for anything not in the grid. Replaces window.prompt, which felt
// broken because most people do not know how to type an emoji on a laptop.
const GRID = [
  '📄', '📝', '📋', '📌', '📎', '🗂️', '📁', '🗒️',
  '📊', '📈', '📉', '🧾', '💼', '🗓️', '⏰', '✅',
  '💡', '🔥', '⭐', '🎯', '🚀', '🌱', '🌸', '🌷',
  '🌺', '💐', '🍃', '🔌', '🕷️', '🛰️', '🤖', '🪖',
  '🕵️', '⚖️', '✍️', '📥', '📤', '💬', '📣', '🔍',
  '💰', '🏷️', '🧠', '❤️', '💗', '💜', '🩷', '✨',
];

export default function EmojiPicker({ value, onPick, onClose }) {
  const [custom, setCustom] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function commitCustom() {
    const e = custom.trim();
    if (e) onPick(e.slice(0, 8));
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 mt-1 w-[248px] rounded-[12px] border border-line bg-panel shadow-card p-2.5"
    >
      <div className="grid grid-cols-8 gap-0.5 mb-2">
        {GRID.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e)}
            className={`h-7 rounded-[8px] text-[16px] leading-none flex items-center justify-center hover:bg-hover-wash-soft transition ${
              value === e ? 'bg-rose-tint' : ''
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={custom}
          onChange={(ev) => setCustom(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') commitCustom(); }}
          placeholder="Paste any emoji"
          className="flex-1 min-w-0 bg-input border border-line rounded-[8px] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
        />
        <button
          onClick={commitCustom}
          disabled={!custom.trim()}
          className="px-2.5 py-1.5 text-[12px] font-medium rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Set
        </button>
      </div>
    </div>
  );
}
