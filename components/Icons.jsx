'use client';

// Shared icon set — the app's third icon surface after GlassRail's
// NAV_ICON_PATHS (nav strokes) and ArmyPanel's BEE_STYLE (gradient duotone
// badges). Same language: lucide-style 24×24 strokes, currentColor, sized
// by w/h utilities. Inline JSX fragments, no lucide-react runtime dep.
export const ICON_PATHS = {
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  pencil: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>,
  trash: <><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  lightbulb: <><path d="M15 14c.2-1 .7-1.7 1.5-2.5A7 7 0 1 0 5 9c0 1 .5 2.5 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  sparkle: <><path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="M19 3v3M20.5 4.5h-3M5 17v3M6.5 18.5h-3" /></>,
  sprout: <><path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" /><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" /><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" /></>,
  'inbox-in': <><polyline points="22 13 16 13 14 16 10 16 8 13 2 13" /><path d="M5.45 6.11 2 13v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5l-3.45-6.89A2 2 0 0 0 16.76 5H7.24a2 2 0 0 0-1.79 1.11z" /><path d="M12 2v6m0 0 2.5-2.5M12 8 9.5 5.5" /></>,
  sunrise: <><path d="M12 2v8" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m8 6 4-4 4 4" /><path d="M16 18a4 4 0 0 0-8 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  'book-open': <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  flower: <><circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="6.2" r="2.8" /><circle cx="12" cy="17.8" r="2.8" /><circle cx="6.2" cy="12" r="2.8" /><circle cx="17.8" cy="12" r="2.8" /></>,
  bee: <><ellipse cx="12" cy="14" rx="5" ry="6" /><path d="M9.5 11.5h5M9 14.5h6M9.8 17.5h4.4" /><path d="M8.5 8.5C6 6.5 3.5 7 3 9c-.4 1.7 1.5 3 4 2.6" /><path d="M15.5 8.5c2.5-2 5-1.5 5.5.5.4 1.7-1.5 3-4 2.6" /><path d="M10.5 6.5 9 4.5M13.5 6.5 15 4.5" /></>,
  file: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  // ── Chapter 10 additions ───────────────────────────────────────────────
  // The semantic map in lib/semantic.mjs asks for one glyph per concept and
  // these six had no glyph, so components were either reaching for a
  // near-miss or (in the case of arrow-right, which ProspectHeadline and
  // ProspectCard both already asked for) rendering nothing at all.
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  // Evidence: something was checked and stood up to it.
  shield: <><path d="M12 3l7 3v6c0 4.4-3 8.1-7 9-4-.9-7-4.6-7-9V6z" /><path d="M9 12.2l2.1 2.1L15.2 10" /></>,
  // Activity, as history: a clock with its hand, wound back.
  history: <><path d="M3.5 9A9 9 0 1 1 3 12" /><path d="M3 4.5V9h4.5" /><path d="M12 7.5V12l3 1.8" /></>,
  // A business, as a building rather than a briefcase: the briefcase already
  // means "client" in the rail, and one glyph cannot mean two things.
  building: <><path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15" /><path d="M15 10h4a1 1 0 0 1 1 1v10" /><path d="M2 21h20" /><path d="M8 9h3M8 13h3M8 17h3" /></>,
  // System health, as a heartbeat.
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  // A decision: one path that became two, with nothing choosing between them.
  split: <><path d="M6 3v6a4 4 0 0 0 4 4h8" /><path d="M6 21v-6a4 4 0 0 1 4-4h8" /><path d="M15 10l3 3-3 3" /><path d="M15 4l3 3-3 3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  quote: <><path d="M10 11h-4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.7-1.3 4.3-4 5" /><path d="M19 11h-4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2.7-1.3 4.3-4 5" /></>,
  'list-todo': <><rect x="3" y="5" width="6" height="6" rx="1" /><path d="m4.5 8 1.2 1.2L8 6.9" /><path d="M13 7h8M13 17h8" /><rect x="3" y="14" width="6" height="6" rx="1" /></>,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 10v10M15 10v10" /></>,
  mic: <><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v5M9 22h6" /></>,
  heart: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />,
  'rotate-ccw': <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  circle: <circle cx="12" cy="12" r="9" />,
  play: <polygon points="6 3 20 12 6 21 6 3" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  'alert-triangle': <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  recycle: <><path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L7.2 9.5" /><path d="M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7l-1.2-2.1" /><path d="m14 16-3 3 3 3" /><path d="M8.3 13.6 7.2 9.5 3.1 10.6" /><path d="m9.3 5.8 1.1-1.9A1.8 1.8 0 0 1 12 3a1.8 1.8 0 0 1 1.5.9l3.9 6.8" /><path d="m13.4 9.6 4.1 1.1 1.1-4.1" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  'trending-up': <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  'calendar-check': <><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" /></>,
  'mail-open': <><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" /><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" /></>,
  mail: <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  'mail-x': <><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="m17 17 5 5M22 17l-5 5" /></>,
  'x-circle': <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></>,
  'check-circle': <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  'circle-dot': <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  'external-link': <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m18 15-6-6-6 6" />,
  'arrow-left': <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  briefcase: <><rect width="20" height="14" x="2" y="7" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  ban: <><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" /></>,
  hourglass: <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />,
  'map-pin': <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  'at-sign': <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  reddit: <><circle cx="12" cy="14" r="7" /><circle cx="9.2" cy="13.5" r="1" fill="currentColor" stroke="none" /><circle cx="14.8" cy="13.5" r="1" fill="currentColor" stroke="none" /><path d="M9 17c1 .8 2 1.1 3 1.1s2-.3 3-1.1" /><path d="m12 7 .8-3.2 2.9.9" /><circle cx="16.8" cy="4.2" r="1.2" /></>,
  instagram: <><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></>,
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  linkedin: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></>,
  clipboard: <><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
  'file-text': <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M9 13h6M9 17h6" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 9 5-5 5 5" /><path d="M12 4v12" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 11 5 5 5-5" /><path d="M12 16V4" /></>,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
};

export function Icon({ name, className = 'w-4 h-4', strokeWidth = 2, filled = false }) {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

// Gradient duotone tile — same construction as ArmyPanel's BeeBadge
// (gradient wash, white stroke icon, soft glow in the tile's own color),
// for the moments where an icon carries identity, not just meaning:
// panel headers, orientation cards, empty states.
export const TILE_TONES = {
  rose: { from: '#E890AB', to: '#C25680' },
  gold: { from: '#F0B44A', to: '#D97E2B' },
  leaf: { from: '#4BC08B', to: '#1E9A66' },
  violet: { from: '#A78BFA', to: '#7A57D1' },
  sky: { from: '#7FB2E5', to: '#4A7DC0' },
};

export function IconTile({ name, tone = 'rose', size = 36, radius = 11, className = '' }) {
  const t = typeof tone === 'string' ? TILE_TONES[tone] || TILE_TONES.rose : tone;
  const iconPx = Math.round(size * 0.52);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
        boxShadow: `0 4px 14px -4px ${t.to}66`,
      }}
      aria-hidden="true"
    >
      <span style={{ display: 'inline-flex', width: iconPx, height: iconPx }}>
        <Icon name={name} className="w-full h-full" strokeWidth={2} />
      </span>
    </span>
  );
}
