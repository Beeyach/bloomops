import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { portalClients } from '@/lib/bloomops/overview.mjs';
import { PortalHome } from '@/components/bloomops/PortalHome';

// Portal Home. What it can say today is decided by the A4 scope rules: a
// Client reaches only the clients their client_contacts row is linked to.
// Nothing here works around an unlinked account (no email matching, no
// invitation lookup); activation and linkage are A9 and A10.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function PortalHomePage() {
  const { access, actor } = await requireShell('portal');
  const clients = await portalClients(access.db, actor);
  return <PortalHome workspaceName={access.workspace.name} user={access.user} clients={clients} />;
}
