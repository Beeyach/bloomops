import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {getAccessOrProblem,getActor} from '@/lib/bloomops/access.mjs';
import {WORKSPACE_COOKIE,selectedWorkspace} from '@/lib/bloomops/workspace-selection.mjs';
import {getWorkspacePage} from '@/lib/bloomops/pages.mjs';
import AuthShell from '@/components/auth/AuthShell';
import OpenSharedPage from '@/components/bloomops/OpenSharedPage';
export const dynamic='force-dynamic';
export const metadata={title:'Shared page'};
export default async function SharedPage({params,searchParams}){
 const id=(await params).id,workspace=(await searchParams)?.workspace;
 if(typeof workspace!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(workspace))notFound();
 const original=await headers(),current=selectedWorkspace(original),selected=new Headers();original.forEach((value,key)=>selected.append(key,value));
 const cookies=String(original.get('cookie')||'').split(';').map(value=>value.trim()).filter(value=>value&&!value.startsWith(WORKSPACE_COOKIE+'='));cookies.push(WORKSPACE_COOKIE+'='+workspace);selected.set('cookie',cookies.join('; '));
 const {access}=await getAccessOrProblem(selected);if(!access)redirect('/sign-in?next='+encodeURIComponent('/shared-pages/'+id+'?workspace='+workspace));
 if(!access.membership||access.workspace?.id!==workspace)notFound();const actor=await getActor(access),page=await getWorkspacePage(access.db,actor,id);if(!page)notFound();
 const destination=(actor.role==='client'?'/portal/pages/':'/pages/')+id;
 if(current===workspace)redirect(destination);
 return <AuthShell title="Open shared page"><OpenSharedPage workspaceId={workspace} workspaceName={access.workspace.name} destination={destination}/></AuthShell>;
}
