import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { portalOnboarding } from '@/lib/bloomops/onboarding-views.mjs';
import { PortalHome } from '@/components/bloomops/PortalHome';
import { portalProjects } from '@/lib/bloomops/projects.mjs';

// Portal Home. What it can say today is decided by the A4 scope rules: a
// Client reaches only the clients their client_contacts row is linked to.
// Nothing here works around an unlinked account (no email matching, no
// invitation lookup). A9 supplies the durable accepted contact link.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function PortalHomePage() {
  const { access, actor } = await requireShell('portal');
  const [clients, projects] = await Promise.all([portalOnboarding(access.db, actor), portalProjects(access.db, actor)]);
  return <PortalHome workspaceName={access.workspace.name} user={access.user} clients={clients.map(client => ({ ...client, projects: projects.filter(project => project.clientId === client.id) }))} />;
}
