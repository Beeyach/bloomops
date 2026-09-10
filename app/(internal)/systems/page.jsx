import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { ACTIONS } from '@/lib/bloomops/authorization.mjs';
import { systemsProjection } from '@/lib/bloomops/systems.mjs';
import { Button, Notice, PageHeader } from '@/components/bloomops/Primitives';
import { SystemsOverview } from '@/components/bloomops/SystemsOverview';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Systems' };

export default async function SystemsPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const projection = await systemsProjection(access.db, actor, await searchParams || {});
  return <>
    <PageHeader title="Systems" subtitle="Projects, next steps and delivery across your Systems services."
      actions={ACTIONS['project.create'].roles.includes(actor.role) && <Button href="/work/projects/new">Create project in Work</Button>} />
    {projection.ok ? <SystemsOverview projection={projection} /> : <Notice tone="error">
      <p>Those filters are unavailable. <a className="bo-link" href="/systems">Reset filters</a></p>
    </Notice>}
  </>;
}
