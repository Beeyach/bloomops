import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {getWorkspacePage} from '@/lib/bloomops/pages.mjs';
import PageReader from '@/components/bloomops/PageReader';
import PageEditor from '@/components/bloomops/PageEditor';
export const dynamic='force-dynamic';
export const metadata={title:'Page'};
export default async function WorkspacePage({params}){
 const {access,actor}=await requireShell('internal');const page=await getWorkspacePage(access.db,actor,(await params).id);if(!page)notFound();
 return page.canEdit?<PageEditor key={page.id} initial={page} userId={actor.userId}/>:<PageReader page={page}/>;
}
