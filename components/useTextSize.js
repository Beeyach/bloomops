'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TEXT_SIZE, TEXT_SIZE_KEY, normalizeTextSize, textSizeAttr } from '../lib/text-size.mjs';

// Same shape and same discipline as useTheme: the attribute on <html> is the
// source of truth, React state exists only so a control can re-render its own
// label, and every instance watches the attribute so a change on one surface
// is reflected on the others.
//
// Initial state is ALWAYS the default, because the server renders the default
// and the client's first (hydration) render has to produce identical markup
// even when the boot script already applied a stored preference. The mount
// effect reveals the real value one frame later — but the SIZE is already
// correct at that point, because the boot script set the attribute before
// paint. Only the control's own label lags, and only for a frame.

function readSize() {
  if (typeof document === 'undefined') return DEFAULT_TEXT_SIZE;
  return normalizeTextSize(document.documentElement.dataset.textsize);
}

function storedSize() {
  try {
    return normalizeTextSize(localStorage.getItem(TEXT_SIZE_KEY));
  } catch (e) {
    return DEFAULT_TEXT_SIZE;
  }
}

function apply(value) {
  const attr = textSizeAttr(value);
  if (attr) document.documentElement.dataset.textsize = attr;
  else delete document.documentElement.dataset.textsize;
}

export default function useTextSize() {
  const [size, setSizeState] = useState(DEFAULT_TEXT_SIZE);

  useEffect(() => {
    const desired = storedSize();
    apply(desired);
    setSizeState(desired);
    const observer = new MutationObserver(() => setSizeState(readSize()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-textsize'] });
    return () => observer.disconnect();
  }, []);

  const setSize = useCallback((next) => {
    const value = normalizeTextSize(next);
    apply(value);
    try { localStorage.setItem(TEXT_SIZE_KEY, value); } catch (e) {}
    setSizeState(value);
  }, []);

  return { size, setSize };
}
