import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getContent } from '@/lib/bloomops/content.mjs';
import { ContentDetail } from '@/components/bloomops/ContentViews';
import FileControls from '@/components/bloomops/FileControls';
import { listContentFiles, canRestrictContentFiles } from '@/lib/bloomops/content-files.mjs';
import { contentFileActivityRows } from '@/lib/bloomops/content-file-activity.mjs';
import { describeEvent } from '@/lib/bloomops/client-activity.mjs';
import { ActivityRow } from '@/components/bloomops/Clients';
import { Section } from '@/components/bloomops/Primitives';
import { contentApprovalHistory,openContentApproval } from '@/lib/bloomops/content-approvals.mjs';
import ContentApprovals from '@/components/bloomops/ContentApprovals';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content' };
export default async function ContentPage({ params,searchParams }) {
  const { access, actor } = await requireShell('internal');
  const item = await getContent(access.db, actor, (await params).contentId);
  if (!item) notFound();
  const [files, canRestrict, activity] = await Promise.all([listContentFiles(access.db, actor, item.id), canRestrictContentFiles(access.db, actor, item.id), contentFileActivityRows(access.db, actor, { contentId: item.id })]);
  const query=await searchParams,rawPage=query?.approvalPage||'1';
  if(typeof rawPage!=='string'||!/^\d{1,7}$/.test(rawPage)||Number(rawPage)<1||Number(rawPage)>1000000)notFound();
  const [history,openRound]=await Promise.all([contentApprovalHistory(access.db,actor,item.id,{page:Number(rawPage)}),openContentApproval(access.db,actor,item.id)]);
  return <><ContentDetail item={{...item,approvalRequested:!!openRound}} /><ContentApprovals item={item} history={history} openRound={openRound} mayManage={['owner','admin','project_manager'].includes(actor.role)} /><FileControls contentId={item.id} summary={files} mayManage canRestrict={canRestrict} />
    <Section id="content-file-history" title="File activity">{activity.length ? <ol className="bo-activity-list">{activity.map(row => <ActivityRow key={row.id} event={{ id: row.id, actor: row.actorName || row.actorEmail, occurredAt: row.occurredAt, ...describeEvent(row.eventType, JSON.parse(row.metadataJson || '{}')) }} />)}</ol> : <p className="bo-body">No file activity to show yet.</p>}</Section></>;
}
