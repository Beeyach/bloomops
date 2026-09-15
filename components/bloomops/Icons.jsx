// Line icons for the BloomOps shell: one stroke weight, currentColor, no
// fill, decorative by default (aria-hidden). Eleven for the navigation,
// the rest for controls. Plain components with no hooks, so they render
// on the server and in tests alike.

const PATHS = {
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
  send: <><path d="m22 2-7 20-4-9L2 9zM22 2 11 13"/></>,
  search: <><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></>,
  filter: <path d="M3 4h18l-7 8v7l-4 2v-9z"/>,
  sort: <><path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,

  table: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 15h7M14 20h5"/></>,
  history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 6v6l4 2"/></>,
  skills: <><path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1zM12 5v15"/></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  prospecting: <><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7.5 10h5M10 7.5v5"/></>,
  // Instagram geometry shared with the existing editor icon vocabulary.
  instagram: <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
  video: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-7 5 7" /></>,
  signature: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12M8 8h4M8 12h2" /><path d="m13 15-1 4 4-1 6-6-3-3zM18 10l3 3" /></>,
  key: <><circle cx="8" cy="8" r="5" /><path d="m11.5 11.5 9 9M16 16l3-3M19 19l3-3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  'shield-check': <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  download: <><path d="M12 3v13m-5-5 5 5 5-5M4 16v4h16v-4" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
  'external-link': <><path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></>,
  home: <><path d="M3 11.2 12 4l9 7.2" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></>,
  clients: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 12.5h18" /></>,
  onboarding: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m8.5 13 2.5 2.5 4.5-5" /></>,
  work: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="7" rx="1.5" /></>,
  social: <><circle cx="12" cy="12" r="4" /><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" /></>,
  ads: <><path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1z" /><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5" /></>,
  systems: <><rect x="3" y="3" width="6" height="6" rx="1.5" /><rect x="15" y="15" width="6" height="6" rx="1.5" /><path d="M9 6h5a3 3 0 0 1 3 3v6" /><path d="M6 9v6a3 3 0 0 0 3 3h6" /></>,
  pages: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17" cy="9" r="2.5" /><path d="M21.5 19c0-2.6-1.8-4.5-4.2-4.9" /></>,
  finance: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 12h.01M17 12h.01" /></>,
  settings: <><path d="M4 6h8M18 6h2M4 12h2M10 12h10M4 18h8M18 18h2" /><circle cx="14" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></>,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'sign-out': <><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="m15 8 4 4-4 4" /><path d="M19 12H9" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
};

export const ICON_NAMES = Object.keys(PATHS);

export function Icon({ name, className = '', size = null, strokeWidth = 1.75, label = null }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size || undefined}
      height={size || undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : 'true'}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      focusable="false"
    >
      {paths}
    </svg>
  );
}
