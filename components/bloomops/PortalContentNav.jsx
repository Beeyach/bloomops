'use client';
import { usePathname } from 'next/navigation';

// The server decides eligibility. Ordinary links request fresh shell/data on
// every visit, including after completing an approval or revoking visibility.
export default function PortalContentNav() {
  const path = usePathname();
  const content = path === '/portal/content' || path?.startsWith('/portal/content/');
  return <nav className="bo-portal-content-nav" aria-label="Client portal">
    <a href="/portal" aria-current={path === '/portal' ? 'page' : undefined}>Home</a>
    <a href="/portal/content" aria-current={content ? 'page' : undefined}>Content</a>
  </nav>;
}
