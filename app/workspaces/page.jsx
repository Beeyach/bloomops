import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAccessOrProblem} from '@/lib/bloomops/access.mjs';
import {listMyWorkspaces} from '@/lib/bloomops/workspaces.mjs';
import {ROLE_LABELS} from '@/lib/bloomops/membership.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import WorkspaceChooser from '@/components/bloomops/WorkspaceChooser';
import '../prospecting.css';
export const dynamic='force-dynamic';
export const metadata={title:'Your workspaces'};
export default async function WorkspacesPage({searchParams}){
 const {access}=await getAccessOrProblem(await headers());if(!access)redirect('/sign-in');
 const rawPage=Number((await searchParams).page||1),page=Number.isInteger(rawPage)&&rawPage>=1&&rawPage<=10000?rawPage:1;
 const workspaces=await listMyWorkspaces(access.db,access.user.id,{page});
 return <div className="bo-root"><main id="main" className="bo-workspace-page">
  <Button href={access.membership?.role==='client'?'/portal':'/'} variant="ghost" icon="chevron-left">Back to Bloomsi</Button>
  <PageHeader title="Your workspaces" subtitle="Choose where you want to work."/>
  <p className="bo-body">Signed in as <strong>{access.user.name}</strong></p><p className="bo-small">{access.user.email}</p>
  <WorkspaceChooser workspaces={workspaces.slice(0,100).map(w=>({...w,roleLabel:ROLE_LABELS[w.role]}))} currentId={access.workspace?.id||null} canCreate={['owner','admin'].includes(access.membership?.role)}/>
 <nav aria-label="Workspace pages" className="bo-prospect-pagination">{page>1&&<Button href={'/workspaces?page='+(page-1)}>Previous workspaces</Button>}{workspaces.length>100&&<Button href={'/workspaces?page='+(page+1)}>More workspaces</Button>}</nav>
 </main></div>;
}
