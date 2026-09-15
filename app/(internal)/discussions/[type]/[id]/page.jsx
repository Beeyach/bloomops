import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getRecordDiscussions} from '@/lib/bloomops/record-discussions.mjs';
import RecordDiscussion from '@/components/bloomops/RecordDiscussion';
export const dynamic='force-dynamic';
export const metadata={title:'Discussion'};
export default async function DiscussionPage({params,searchParams}){
  const {access,actor}=await requireShell('internal'),parent=await params,q=await searchParams||{};
  const data=await getRecordDiscussions(access.db,actor,parent,{threadId:q.threadId||null,page:q.page?Number(q.page):1,resolved:q.resolved==='true'});if(!data)notFound();
  const returnHref=parent.type==='client'?`/clients/${parent.id}`:parent.type==='action'?`/work/actions/${parent.id}`:`/work/projects/${data.parent.projectId}${parent.type==='deliverable'?`#deliverable-${parent.id}`:''}`;
  return <RecordDiscussion initial={data} workspaceId={actor.workspaceId} api={`/api/bloomops/discussions/${parent.type}/${parent.id}`} returnHref={returnHref}/>;
}
