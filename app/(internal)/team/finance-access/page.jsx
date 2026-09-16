import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {financeAccessMembers} from '@/lib/bloomops/finance.mjs';
import {PageHeader,Button} from '@/components/bloomops/Primitives';
import FinanceAccess from '@/components/bloomops/FinanceAccess';
export const dynamic='force-dynamic';
export default async function FinanceAccessPage({searchParams}){const {access,actor}=await requireShell('internal'),page=Number((await searchParams).page||1),result=await financeAccessMembers(access.db,actor,page);if(!result)notFound();return <><PageHeader title="Finance access" subtitle="Finance grants do not expand Client or Service assignments. Client portal identities cannot receive access." actions={<Button href="/team">Team</Button>}/>{result.items.map(member=><FinanceAccess key={actor.workspaceId+actor.userId+member.id} member={member} scope={{workspaceId:actor.workspaceId,userId:actor.userId}}/>)}<nav aria-label="Finance access pages">{page>1&&<Button href={'?page='+(page-1)}>Previous members</Button>}{result.more&&<Button href={'?page='+(page+1)}>Next members</Button>}</nav></>;}
