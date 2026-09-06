import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';
import { workspaceOverview } from '@/lib/bloomops/overview.mjs';
import { PageHeader, Section } from '@/components/bloomops/Primitives';
import { AreaMap, StateRows } from '@/components/bloomops/HomeOverview';

// Home in Release A is orientation: which workspace, who you are here,
// what exists right now (read through your own scope), and the map of the
// product. The operational dashboard (what needs doing next) belongs to a
// later release and is not imitated here.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function HomePage() {
  const { access, actor } = await requireShell('internal');
  const overview = await workspaceOverview(access.db, actor);
  const roleLabel = ROLE_LABELS[access.membership.role] || access.membership.role;
  const who = access.user.name ? `${access.user.name}, ${roleLabel}` : roleLabel;
  return (
    <>
      <PageHeader title={access.workspace.name} subtitle={`Your BloomOps workspace. You are signed in as ${who}.`} />
      <Section id="state" title="Right now">
        <StateRows overview={overview} scopeKind={actor.scope?.kind} />
      </Section>
      <Section id="areas" title="Areas of BloomOps">
        <AreaMap />
      </Section>
    </>
  );
}
