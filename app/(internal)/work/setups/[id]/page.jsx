import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getWorkSetup} from '@/lib/bloomops/work-setups.mjs';
import {workSetupOptions} from '@/lib/bloomops/work-setup-api.mjs';
import WorkSetup from '@/components/bloomops/WorkSetup';
export const dynamic='force-dynamic';
export default async function Page({params}){const {access,actor}=await requireShell('internal'),setup=await getWorkSetup(access.db,actor,(await params).id);if(!setup)notFound();const options=await workSetupOptions(access.db,actor);return <WorkSetup key={`${actor.workspaceId}:${actor.userId}:${setup.id}`} initial={setup} options={options} scope={{workspaceId:actor.workspaceId,userId:actor.userId}}/>;}
