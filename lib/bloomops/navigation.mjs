// The BloomOps information architecture, as plain data.
//
// One list feeds the desktop sidebar, the tablet rail, the phone tab bar
// and its "More" sheet, the active state, and the area list on Home, so
// the product has one navigation and not five that drift apart. The
// order and the labels come from docs/PRODUCT_SPEC.md and stay the same
// for every internal role: what a person may do inside an area is decided
// on the server by the A4 engine, never by hiding an entry here.
//
// `availability` says whether the area does real work in Release A ("now")
// or is a deliberate placeholder until its own phase ("later"); Home uses
// it to be honest about what is live. `mobile` marks the four destinations
// that sit on the phone tab bar; the rest open from More.

export const INTERNAL_NAV = [
  {
    key: 'home',
    label: 'Home',
    href: '/',
    group: 'home',
    availability: 'now',
    mobile: true,
    purpose: 'Where you are, who you are signed in as, and where to go.',
  },
  {
    key: 'prospecting', label: 'Prospecting', href: '/prospecting', group: 'home', availability: 'now', mobile: false,
    purpose: 'Structured prospects and manually prepared outreach drafts in a separate workspace.',
  },
  {
    key: 'clients',
    label: 'Clients',
    href: '/clients',
    group: 'delivery',
    availability: 'now',
    mobile: true,
    purpose: 'Every client the agency works with, their services, and where each one stands.',
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    href: '/onboarding',
    group: 'delivery',
    availability: 'now',
    mobile: true,
    purpose: 'What each new client still needs to provide before delivery can start.',
  },
  {
    key: 'work',
    label: 'Work',
    href: '/work',
    group: 'delivery',
    availability: 'now',
    mobile: false,
    purpose: 'Projects and delivery progress across your clients and services.',
  },
  {
    key: 'social',
    label: 'Social',
    href: '/social',
    group: 'departments',
    availability: 'now',
    mobile: false,
    purpose: 'Ideas and editorial details for your clients.',
  },
  {
    key: 'ads',
    label: 'Ads',
    href: '/ads',
    group: 'departments',
    availability: 'later',
    mobile: false,
    purpose: 'Campaigns, creative, approvals, and light performance tracking.',
  },
  {
    key: 'systems',
    label: 'Systems',
    href: '/systems',
    group: 'departments',
    availability: 'now',
    mobile: false,
    purpose: 'Projects, next steps, and delivery across your Systems services.',
  },
  {
    key: 'pages',
    label: 'Pages',
    href: '/pages',
    group: 'agency',
    availability: 'now',
    mobile: false,
    purpose: 'SOPs, briefs, meeting notes, and client documentation.',
  },
  {
    key: 'team',
    label: 'Team',
    href: '/team',
    group: 'agency',
    availability: 'now',
    mobile: true,
    purpose: 'Who is in the workspace, their role, and open invitations.',
  },
  {
    key: 'finance',
    label: 'Finance',
    href: '/finance',
    group: 'agency',
    availability: 'later',
    mobile: false,
    purpose: 'Lightweight tracking of what each client pays and when.',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/settings',
    group: 'agency',
    availability: 'now',
    mobile: false,
    purpose: 'Your account, your workspace, and what you have access to.',
  },
];

// Sidebar groups, in order. Labels are for the Home area list; the sidebar
// itself separates groups with a hairline and no heading.
export const NAV_GROUPS = [
  { key: 'home', label: 'Home' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'departments', label: 'Departments' },
  { key: 'agency', label: 'Agency' },
];

export const PORTAL_NAV = [{ key: 'home', label: 'Home', href: '/portal' }];

export const PROSPECTING_NAV = [
  {key:'home',label:'Back to Bloomsi',href:'/',group:'home',mobile:true},
  {key:'overview',label:'Overview',href:'/prospecting/overview',group:'delivery',mobile:true},
  {key:'prospecting',label:'Prospects',href:'/prospecting',group:'delivery',mobile:true},
  {key:'skills',label:'Skills Library',href:'/prospecting/skills',group:'delivery',mobile:true},
];
export const inProspecting=pathname=>pathname==='/prospecting'||pathname?.startsWith('/prospecting/');

export function navItem(key) {
  return INTERNAL_NAV.find((item) => item.key === key) || null;
}

export function navGroups(items = INTERNAL_NAV) {
  return NAV_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group === group.key) })).filter((g) => g.items.length > 0);
}

// The phone tab bar: the four `mobile` destinations, then More.
export function mobilePrimary(items = INTERNAL_NAV) {
  return items.filter((item) => item.mobile);
}

export function mobileMore(items = INTERNAL_NAV) {
  return items.filter((item) => !item.mobile);
}

// Which destination a path belongs to. The root matches only itself; any
// other destination owns its path and everything under it, so /team and
// /team/anything both light up Team. Unknown paths light nothing.
export function activeKey(pathname, items = INTERNAL_NAV) {
  const path = String(pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (['/prospecting/sender','/prospecting/mailbox','/prospecting/mailbox/reports'].includes(path) && items.some(item => item.key === 'overview')) return 'overview';
  let best = null;
  for (const item of items) {
    if (item.href === '/') {
      if (path === '/') return item.key;
      continue;
    }
    if (path === item.href || path.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best ? best.key : null;
}
