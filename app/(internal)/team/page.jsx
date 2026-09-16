import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { readTogether } from '@/lib/bloomops/read-batch.mjs';
import { ROLE_DESCRIPTIONS, teamViewFor } from '@/lib/bloomops/shell.mjs';
import { ROLE_LABELS, listWorkspaceMembers } from '@/lib/bloomops/membership.mjs';
import { listInvitations } from '@/lib/bloomops/invitations.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { Button, Facts, PageHeader, Surface } from '@/components/bloomops/Primitives';
import TeamManager from '@/components/bloomops/TeamManager';

// Team. The engine decides which of two screens renders (teamViewFor):
// the directory with invitation and membership management for people who
// hold members.manage, over the real A3 routes; a calm limited view for
// everyone else, which never loads the directory at all. Action workload
// has its own permission-filtered route; it never grants directory access.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const { access, actor } = await requireShell('internal');
  const role = access.membership.role;

  if (teamViewFor(actor) !== 'manage') {
    return (
      <>
        <PageHeader title="Team" subtitle={navItem('team').purpose} actions={<><Button href="/team/workload">Action workload</Button><Button href="/team/departments">Department work</Button></>} />
        <Surface padding="lg" className="bo-page-narrow">
          <h2 className="bo-h2" style={{ marginBottom: 12 }}>
            Your place in {access.workspace.name}
          </h2>
          <Facts items={[['Name', access.user.name || 'Not set'], ['Email', access.user.email], ['Role', ROLE_LABELS[role] || role], ['What that means', ROLE_DESCRIPTIONS[role] || '']]} />
          <p className="bo-body" style={{ marginTop: 20 }}>
            The member list and invitations are managed by the workspace Owner and Admins. If someone needs to be added or changed, ask them.
          </p>
        </Surface>
      </>
    );
  }

  const [rows, invitations] = await readTogether(access.db, db => Promise.all([listWorkspaceMembers(db, access.workspace.id), listInvitations(db, access.workspace.id)]));
  const members = rows.map((m) => ({ ...m, roleLabel: ROLE_LABELS[m.role] || m.role }));
  return <><TeamManager members={members} invitations={invitations.map((i) => ({ ...i, roleLabel: ROLE_LABELS[i.role] || i.role }))} selfMembershipId={access.membership.id} workspaceName={access.workspace.name} /></>;
}
