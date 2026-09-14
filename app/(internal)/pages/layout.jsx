import '@/app/pages.css';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getWorkspacePageTree} from '@/lib/bloomops/page-hierarchy.mjs';
import PagesWorkspace from '@/components/bloomops/PagesWorkspace';
export const dynamic='force-dynamic';
export default async function PagesLayout({children}){const {access,actor}=await requireShell('internal');const tree=await getWorkspacePageTree(access.db,actor);return <PagesWorkspace key={actor.workspaceId} initialTree={tree||{revision:0,canManage:false,hasSharing:false,rows:[]}} workspaceId={actor.workspaceId}>{children}</PagesWorkspace>;}
