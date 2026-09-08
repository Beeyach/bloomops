import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { contentOptions, getContent } from '@/lib/bloomops/content.mjs';
import ContentForm from '@/components/bloomops/ContentForm';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit Content' };
export default async function EditContentPage({ params }) {
  const { access, actor } = await requireShell('internal');
  const item = await getContent(access.db, actor, (await params).contentId);
  if (!item) notFound();
  const options = await contentOptions(access.db, actor, { query: item.clientName.slice(0, 120) });
  return <><Button href={`/social/${item.id}`} variant="ghost">Back to Content</Button><PageHeader title="Edit Content" subtitle={`${item.clientName} · ${item.serviceName || 'Client-level Content'}`} /><ContentForm item={item} options={options} /></>;
}
