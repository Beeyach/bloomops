import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { portalOnboarding } from '@/lib/bloomops/onboarding-views.mjs';
import { PortalHome } from '@/components/bloomops/PortalHome';
import { portalProjects } from '@/lib/bloomops/projects.mjs';
import { portalMilestoneSummaries } from '@/lib/bloomops/milestones.mjs';
import { portalDeliverables } from '@/lib/bloomops/deliverables.mjs';
import { listFiles } from '@/lib/bloomops/files.mjs';
import { recordingRequests } from '@/lib/bloomops/content-files.mjs';
import { approvalRequests } from '@/lib/bloomops/content-approvals.mjs';

// Portal Home. What it can say today is decided by the A4 scope rules: a
// Client reaches only the clients their client_contacts row is linked to.
// Nothing here works around an unlinked account (no email matching, no
// invitation lookup). A9 supplies the durable accepted contact link.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function PortalHomePage() {
  const { access, actor } = await requireShell('portal');
  const [clients, projects, milestones] = await Promise.all([portalOnboarding(access.db, actor), portalProjects(access.db, actor), portalMilestoneSummaries(access.db, actor)]);
  const deliverables = Object.fromEntries(await Promise.all(projects.map(async project => [project.id, await portalDeliverables(access.db, actor, project.id)])));
  const files = Object.fromEntries(await Promise.all(projects.map(async project => [project.id, await listFiles(access.db, actor, project.id, { portal: true })])));
  const recordings = await recordingRequests(access.db, actor);
  const approvals=await approvalRequests(access.db,actor);
  return <PortalHome workspaceName={access.workspace.name} user={access.user} approvals={approvals} recordings={recordings} milestones={milestones} deliverables={deliverables} files={files} clients={clients.map(client => ({ ...client, projects: projects.filter(project => project.clientId === client.id) }))} />;
}
