import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {listWorkSetups} from '@/lib/bloomops/work-setups.mjs';
import WorkSetup from '@/components/bloomops/WorkSetup';
export const dynamic='force-dynamic';
export default async function Page(){const {access,actor}=await requireShell('internal'),result=await listWorkSetups(access.db,actor);if(!result.ok||!result.canEdit)notFound();return <WorkSetup key={`${actor.workspaceId}:${actor.userId}:new`} scope={{workspaceId:actor.workspaceId,userId:actor.userId}}/>;}
