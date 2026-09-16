import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { contentOptions, getContent } from '@/lib/bloomops/content.mjs';
import { openContentApproval } from '@/lib/bloomops/content-approvals.mjs';
import ContentPlatforms from '@/components/bloomops/ContentPlatforms';
import ContentForm from '@/components/bloomops/ContentForm';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit Content' };
export default async function EditContentPage({ params }) {
  const { access, actor } = await requireShell('internal');
  const item = await getContent(access.db, actor, (await params).contentId);
  if (!item) notFound();
  const options = await contentOptions(access.db, actor, { query: item.clientName.slice(0, 120) });
  item.approvalRequested=!!(await openContentApproval(access.db,actor,item.id));
  return <><Button href={`/social/${item.id}`} variant="ghost">Back to Content</Button><PageHeader title="Edit Content" subtitle={<span className="bo-record-subtitle"><span>{item.clientName}</span><span>{item.serviceName || 'Client-level Content'}</span></span>} /><ContentForm item={item} options={options} /><ContentPlatforms item={item} /></>;
}
