'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { INTERNAL_NAV, activeKey, mobileMore, mobilePrimary } from '@/lib/bloomops/navigation.mjs';
import Dialog from './Dialog';
import { Icon } from './Icons';

// The phone composition of the same navigation: four destinations on a
// bottom bar and More, which opens the other seven as a labelled sheet.
// Nothing is dropped; every destination keeps its label. Hidden by the
// stylesheet from 768px up, where the sidebar takes over.

export function TabBar({ items = INTERNAL_NAV, active = null, moreOpen = false, onMore = null, LinkComponent = Link }) {
  const primary = mobilePrimary(items);
  const moreActive = mobileMore(items).some((item) => item.key === active);
  return (
    <nav className="bo-tabbar" aria-label="Main">
      {primary.map((item) => (
        <LinkComponent key={item.key} href={item.href} className="bo-tab" aria-current={active === item.key ? 'page' : undefined}>
          <span className="bo-tab-glyph">
            <Icon name={item.key} className="bo-nav-icon" />
          </span>
          {item.label}
        </LinkComponent>
      ))}
      <button type="button" className="bo-tab" aria-expanded={moreOpen} aria-haspopup="dialog" aria-current={moreActive && !moreOpen ? 'page' : undefined} onClick={onMore || undefined}>
        <span className="bo-tab-glyph">
          <Icon name="more" className="bo-nav-icon" />
        </span>
        More
      </button>
    </nav>
  );
}

export function MoreSheet({ items = INTERNAL_NAV, active = null, open, onClose, LinkComponent = Link }) {
  const rest = mobileMore(items);
  return (
    <Dialog open={open} onClose={onClose} title="More" sheet>
      <ul className="bo-sheet-list" aria-label="More destinations">
        {rest.map((item) => (
          <li key={item.key}>
            <LinkComponent href={item.href} className="bo-nav-item" aria-current={active === item.key ? 'page' : undefined} onClick={onClose}>
              <Icon name={item.key} className="bo-nav-icon" />
              <span className="bo-nav-label">{item.label}</span>
            </LinkComponent>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export default function MobileNav({ items = INTERNAL_NAV }) {
  const pathname = usePathname();
  const active = activeKey(pathname, items);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  return (
    <>
      <TabBar items={items} active={active} moreOpen={open} onMore={() => setOpen((v) => !v)} />
      <MoreSheet items={items} active={active} open={open} onClose={close} />
    </>
  );
}
