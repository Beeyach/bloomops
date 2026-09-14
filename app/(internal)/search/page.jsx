import '../../search.css';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import WorkspaceSearch from '@/components/bloomops/WorkspaceSearch';
export const dynamic='force-dynamic';
export const metadata={title:'Search'};
export default async function SearchPage(){const {access,actor}=await requireShell('internal');return <WorkspaceSearch userId={actor.userId} workspaceId={actor.workspaceId} workspaceName={access.workspace.name}/>;}
