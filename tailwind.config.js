/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-driven tokens (Amendment A1). Values live in globals.css
        // under html[data-theme="light"] / html[data-theme="dark"].
        // `muted` and `mauve-deep` take /opacity modifiers in JSX, so they
        // use the RGB-triplet alpha-capable form.
        bg: 'var(--bg)',
        wash: 'var(--bg)',
        panel: 'var(--panel)',
        surface: 'var(--surface)',
        // Chapter 8 needs real containers, so the two quieter grounds
        // from the Chapter 7 token layer become utilities too.
        'surface-subtle': 'var(--surface-subtle)',
        'surface-sunken': 'var(--surface-sunken)',
        'card-hover': 'var(--card-hover)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        bright: 'var(--bright)',
        rose: 'var(--rose)',
        'rose-hover': 'var(--rose-hover)',
        'rose-deep': 'var(--rose-deep)',
        // The rose that carries white text. Deeper than the accent so the
        // pairing clears WCAG AA; see the token comment in globals.css.
        'rose-btn': 'var(--rose-btn)',
        'rose-text': 'var(--rose-text)',
        'rose-tint': 'var(--rose-tint)',
        leaf: 'var(--leaf)',
        'leaf-text': 'rgb(var(--leaf-text-rgb) / <alpha-value>)',
        gold: 'var(--gold)',
        'gold-text': 'var(--gold-text)',
        poppy: 'var(--poppy)',
        'poppy-text': 'var(--poppy-text)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        hairline: 'var(--hairline)',
        'rose-line': 'var(--rose-line)',
        'hover-wash': 'var(--hover-wash)',
        'hover-wash-soft': 'var(--hover-wash-soft)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'mauve-deep': 'rgb(var(--mauve-deep-rgb) / <alpha-value>)',
        // Transitional aliases (kept so existing JSX compiles).
        charcoal: 'var(--ink)',
        'charcoal-2': 'var(--ink-2)',
        mauve: 'var(--rose)',
        blush: 'var(--rose-tint)',
        'blush-soft': 'var(--card-hover)',
        paper: 'var(--bg)',
      },
      fontFamily: {
        // Editorial Botanical direction (July 2026) — supersedes the earlier
        // "retire serif / no mono" call. The shell is editorial: Instrument
        // Serif for display headings, Instrument Sans for UI, IBM Plex Mono
        // for data and micro-labels. This matches the approved mock exactly.
        serif: ['"Instrument Serif"', 'Georgia', 'ui-serif', 'serif'],
        logo: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'Inter', '-apple-system', '"Segoe UI Variable Text"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Premium elevation, theme-driven: soft layered depth on dark,
        // rose-tinted lift on light. Values live in globals.css.
        card: 'var(--shadow-card)',
        pill: 'var(--shadow-pill)',
      },
    },
  },
  plugins: [],
};
