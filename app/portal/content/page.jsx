import { redirect } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { hasPortalContent, portalContent } from '@/lib/bloomops/portal-content.mjs';
import { PortalContentList } from '@/components/bloomops/PortalContent';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content' };
export default async function ContentPage({ searchParams }) {
  const { access, actor } = await requireShell('portal');
  const now = new Date();
  if (!await hasPortalContent(access.db, actor, { now })) redirect('/portal');
  const result = await portalContent(access.db, actor, await searchParams || {}, { now });
  if (!result.ok) return <><PageHeader title="Your content" /><Notice tone="error">Choose an available Content view and page.</Notice><Button href="/portal/content">Reset view</Button></>;
  return <PortalContentList result={result} />;
}
