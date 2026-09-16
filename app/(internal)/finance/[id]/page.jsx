import {notFound} from 'next/navigation';
import {requireShell} from '@/lib/bloomops/shell-server.mjs';
import {financePermission,getFinanceRecord} from '@/lib/bloomops/finance.mjs';
import FinanceEditor from '@/components/bloomops/FinanceEditor';
export const dynamic='force-dynamic';
export default async function FinanceRecord({params}){const {access,actor}=await requireShell('internal'),record=await getFinanceRecord(access.db,actor,(await params).id);if(!record)notFound();return <FinanceEditor key={actor.workspaceId+actor.userId+record.id+record.revision} scope={{workspaceId:actor.workspaceId,userId:actor.userId}} initial={record} canEdit={await financePermission(access.db,actor,'finance.edit')}/>;}
