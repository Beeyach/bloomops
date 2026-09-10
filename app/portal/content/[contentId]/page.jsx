import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getPortalContent } from '@/lib/bloomops/portal-content.mjs';
import { PortalContentDetail } from '@/components/bloomops/PortalContent';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content' };
export default async function ContentDetailPage({ params }) {
  const { access, actor } = await requireShell('portal');
  const item = await getPortalContent(access.db, actor, (await params).contentId);
  if (!item) notFound();
  return <PortalContentDetail item={item} />;
}
