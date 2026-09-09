import { notFound } from 'next/navigation';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getPortalApproval } from '@/lib/bloomops/content-approvals.mjs';
import PortalApproval from '@/components/bloomops/PortalApproval';
export const dynamic='force-dynamic';
export const metadata={title:'Approval needed'};
export default async function ApprovalPage({params}) {
  const {access,actor}=await requireShell('portal');
  const item=await getPortalApproval(access.db,actor,(await params).roundId);if(!item)notFound();
  return <PortalApproval item={item}/>;
}
