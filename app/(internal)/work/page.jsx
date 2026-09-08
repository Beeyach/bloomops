import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { ACTIONS } from '@/lib/bloomops/authorization.mjs';
import { listProjects } from '@/lib/bloomops/projects.mjs';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, PageHeader } from '@/components/bloomops/Primitives';
import { ProjectList } from '@/components/bloomops/Projects';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projects · Work' };

export default async function WorkPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const query = await searchParams;
  const status = PROJECT_STATUSES.includes(query?.status) ? query.status : 'all';
  const projects = await listProjects(access.db, actor, { status });
  return <>
    <PageHeader title="Projects" subtitle="Work · Delivery across your clients and services." actions={ACTIONS['project.create'].roles.includes(actor.role) && <Button href="/work/projects/new" variant="primary">Create project</Button>} />
    <form className="bo-project-filter" action="/work">
      <Field id="project-filter-status" label="Status"><select id="project-filter-status" name="status" className="bo-control" defaultValue={status}>
        <option value="all">All statuses</option>{PROJECT_STATUSES.map(value => <option key={value} value={value}>{PROJECT_STATUS_LABELS[value]}</option>)}
      </select></Field><Button type="submit">Apply filter</Button>
    </form>
    <ProjectList projects={projects.items} hasMore={projects.hasMore} filtered={status !== 'all'} />
  </>;
}
