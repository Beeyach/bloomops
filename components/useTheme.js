'use client';

import { useCallback, useEffect, useState } from 'react';

// Browser-chrome color, kept in step with --bg in globals.css (Full Bloom).
const THEME_COLORS = { dark: '#1A1118', light: '#FBF7F4' };

// Light is the default everywhere below. Dark is never inferred — it is
// only ever the answer when someone explicitly asked for it and it was
// saved, which is why every check below tests for 'dark' rather than
// falling back to it.
function readTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function storedTheme() {
  try {
    return localStorage.getItem('ltb_theme') === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}

function applyMetaColor(value) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[value];
}

// Theme state backed by html[data-theme]. All colors resolve through CSS
// variables, so applying the attribute is the entire theme switch; React
// state exists only so toggle buttons re-render their own icon/label.
// The mount effect re-enforces the stored preference because React 19
// hydration can strip attributes on <html> that aren't in the JSX,
// undoing the pre-paint boot script.
export default function useTheme() {
  // Initial state is ALWAYS 'light' — the server renders light, and the
  // client's first (hydration) render must produce identical markup even
  // when the boot script already applied a stored dark theme. The mount
  // effect below reveals the real theme one frame later.
  const [theme, setThemeState] = useState('light');

  useEffect(() => {
    const desired = storedTheme();
    if (document.documentElement.dataset.theme !== desired) {
      document.documentElement.dataset.theme = desired;
    }
    applyMetaColor(desired);
    setThemeState(desired);
    // Multiple components use this hook (sidebar toggle, Settings). The
    // attribute is the shared source of truth, so every instance watches
    // it — a theme change from any surface syncs all the others' labels.
    const observer = new MutationObserver(() => setThemeState(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('ltb_theme', value); } catch (e) {}
    applyMetaColor(value);
    setThemeState(value);
  }, []);

  const toggle = useCallback(() => {
    setTheme(readTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
