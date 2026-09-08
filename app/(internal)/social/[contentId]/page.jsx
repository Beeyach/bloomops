import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getContent } from '@/lib/bloomops/content.mjs';
import { ContentDetail } from '@/components/bloomops/ContentViews';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content' };
export default async function ContentPage({ params }) {
  const { access, actor } = await requireShell('internal');
  const item = await getContent(access.db, actor, (await params).contentId);
  if (!item) notFound();
  return <ContentDetail item={item} />;
}
