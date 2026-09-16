import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getWorkspacePage} from '@/lib/bloomops/pages.mjs';
import PageReader from '@/components/bloomops/PageReader';
import PageEditor from '@/components/bloomops/PageEditor';
export const dynamic='force-dynamic';
export const metadata={title:'Page'};
export default async function WorkspacePage({params}){
 const {access,actor}=await requireShell('portal');const page=await getWorkspacePage(access.db,actor,(await params).id);if(!page)notFound();
 return page.canEdit?<PageEditor key={JSON.stringify([actor.userId,page.workspaceId,page.id])} initial={page} userId={actor.userId}/>:<PageReader page={page} userId={actor.userId}/>;
}
