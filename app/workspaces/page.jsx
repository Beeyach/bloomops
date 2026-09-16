import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {getAccessOrProblem} from '@/lib/bloomops/access.mjs';
import {listMyWorkspaces} from '@/lib/bloomops/workspaces.mjs';
import {ROLE_LABELS} from '@/lib/bloomops/membership.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import WorkspaceChooser from '@/components/bloomops/WorkspaceChooser';
import WorkspaceTransition from '@/components/bloomops/WorkspaceTransition';
import '../prospecting.css';
export const dynamic='force-dynamic';
export const metadata={title:'Your workspaces'};
export default async function WorkspacesPage({searchParams}){
 const {access}=await getAccessOrProblem(await headers());if(!access)redirect('/sign-in');
 const params=await searchParams;
 if(typeof params.switch==='string'&&/^[a-f0-9-]{36}$/.test(params.switch))return <div className="bo-root"><main id="main" className="bo-workspace-page"><PageHeader title="Switch workspace"/><WorkspaceTransition nonce={params.switch} userId={access.user.id}/></main></div>;
 const rawPage=Number(params.page||1),page=Number.isInteger(rawPage)&&rawPage>=1&&rawPage<=10000?rawPage:1;
 const workspaces=await listMyWorkspaces(access.db,access.user.id,{page});
 return <div className="bo-root"><main id="main" className="bo-workspace-page">
  <Button href={access.membership?.role==='client'?'/portal':'/'} variant="ghost" icon="chevron-left">Back to Bloomsi</Button>
  <PageHeader title="Your workspaces" subtitle="Choose where you want to work."/>
  <WorkspaceChooser identity={{name:access.user.name,email:access.user.email}} workspaces={workspaces.slice(0,100).map(w=>({...w,roleLabel:ROLE_LABELS[w.role]}))} currentId={access.workspace?.id||null} canCreate={['owner','admin'].includes(access.membership?.role)}/>
 <nav aria-label="Workspace pages" className="bo-prospect-pagination">{page>1&&<Button href={'/workspaces?page='+(page-1)}>Previous workspaces</Button>}{workspaces.length>100&&<Button href={'/workspaces?page='+(page+1)}>More workspaces</Button>}</nav>
 </main></div>;
}
