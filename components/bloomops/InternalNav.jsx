'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { INTERNAL_NAV, activeKey, navGroups } from '@/lib/bloomops/navigation.mjs';
import { Icon } from './Icons';

// The internal navigation, drawn from lib/bloomops/navigation.mjs. The
// same list is the desktop sidebar and the tablet rail; the stylesheet
// decides the geometry. NavList is the pure part so it can be rendered
// in tests with a known active key; InternalNav derives the active key
// from the route.

export function NavList({ items = INTERNAL_NAV, active = null, LinkComponent = Link, onNavigate = null }) {
  const groups = navGroups(items);
  return (
    <nav aria-label="Main">
      {groups.map((group) => (
        <ul key={group.key} className="bo-nav bo-nav-group" aria-label={group.label}>
          {group.items.map((item) => (
            <li key={item.key}>
              <LinkComponent
                href={item.href}
                className="bo-nav-item"
                aria-current={active === item.key ? 'page' : undefined}
                onClick={onNavigate || undefined}
              >
                <Icon name={item.key} className="bo-nav-icon" />
                <span className="bo-nav-label">{item.label}</span>
              </LinkComponent>
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}

export default function InternalNav({ items = INTERNAL_NAV }) {
  const pathname = usePathname();
  return <NavList items={items} active={activeKey(pathname, items)} />;
}
