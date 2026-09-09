import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { schema } from '@/lib/bloomops/db.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { recordingRequestCondition } from '@/lib/bloomops/content-file-access.mjs';
import { listContentFiles } from '@/lib/bloomops/content-files.mjs';
import FileControls from '@/components/bloomops/FileControls';
import { Button, PageHeader } from '@/components/bloomops/Primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recording needed' };
export default async function RecordingPage({ params }) {
  const { access, actor } = await requireShell('portal'), { contentId } = await params, c = schema.contentItems;
  const [request] = await access.db.select({ id: c.id, title: c.title }).from(c)
    .where(and(eq(c.id, contentId), recordingRequestCondition(actor))).limit(1);
  if (!request) notFound();
  const files = await listContentFiles(access.db, actor, contentId, { portal: true });
  return <><Button href="/portal" variant="ghost">Back to home</Button><PageHeader title="Recording needed" subtitle={request.title} />
    <FileControls contentId={request.id} summary={files} mayManage portal />
  </>;
}
