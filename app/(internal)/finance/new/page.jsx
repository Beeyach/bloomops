import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {financePermission,financeParents} from '@/lib/bloomops/finance.mjs';
import FinanceEditor from '@/components/bloomops/FinanceEditor';
export const dynamic='force-dynamic';
export default async function NewFinance(){const {access,actor}=await requireShell('internal');if(!await financePermission(access.db,actor)||!await financePermission(access.db,actor,'finance.edit'))notFound();return <FinanceEditor key={actor.workspaceId+actor.userId} scope={{workspaceId:actor.workspaceId,userId:actor.userId}} parents={await financeParents(access.db,actor)} canEdit/>;}
