import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { readTogether } from '@/lib/bloomops/read-batch.mjs';
import { ACTIONS } from '@/lib/bloomops/authorization.mjs';
import { listProjectSummaries } from '@/lib/bloomops/work-projections.mjs';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/lib/bloomops/project-values.mjs';
import { Button, Field, PageHeader } from '@/components/bloomops/Primitives';
import { ProjectList } from '@/components/bloomops/Projects';
import { actionFilterOptions, listActions, normalizeActionFilters } from '@/lib/bloomops/actions.mjs';
import { ActionFilters, ActionList, ActionPagination, WorkTabs } from '@/components/bloomops/Actions';
import { Notice } from '@/components/bloomops/Primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Work' };

export default async function WorkPage({ searchParams }) {
  const { access, actor } = await requireShell('internal');
  const query = await searchParams;
  if (query?.tab !== 'projects') {
    const { tab: _tab, ...input } = query || {};
    const normalized = normalizeActionFilters(input);
    const { view, filters, page } = normalized.ok ? normalized : { view: 'mine', filters: {}, page: 1 };
    const [result, options] = await readTogether(access.db, db => Promise.all([listActions(db, actor, { ...filters, view, page }), actionFilterOptions(db, actor)]));
    return <>
      <PageHeader title="Actions" subtitle="Work · The next steps across your clients and projects." />
      <WorkTabs /><Button href="/team/workload" variant="ghost">Action workload</Button>
      {ACTIONS['project.create'].roles.includes(actor.role)&&<Button href="/work/setups" variant="ghost">Reusable Work setups</Button>}
      {!normalized.ok && <Notice tone="warning">Those filters are unavailable. Showing your Actions.</Notice>}
      <ActionFilters view={view} filters={filters} options={options} />
      <ActionList items={result.items || []} />
      <ActionPagination result={result} view={view} filters={filters} />
      <p className="bo-small bo-action-footnote">Dates follow each Client’s timezone, or UTC when none is set. Dependency-blocked work is excluded from Overdue.</p>
    </>;
  }
  const status = PROJECT_STATUSES.includes(query?.status) ? query.status : 'all';
  const projects = await listProjectSummaries(access.db, actor, { status });
  return <>
    <PageHeader title="Projects" subtitle="Work · Delivery across your clients and services." actions={ACTIONS['project.create'].roles.includes(actor.role) && <Button href="/work/projects/new" variant="primary">Create project</Button>} />
    <WorkTabs active="projects" />
    {ACTIONS['project.create'].roles.includes(actor.role)&&<Button href="/work/setups" variant="ghost">Reusable Work setups</Button>}
    <form className="bo-project-filter" action="/work">
      <input type="hidden" name="tab" value="projects" />
      <Field id="project-filter-status" label="Status"><select id="project-filter-status" name="status" className="bo-control" defaultValue={status}>
        <option value="all">All statuses</option>{PROJECT_STATUSES.map(value => <option key={value} value={value}>{PROJECT_STATUS_LABELS[value]}</option>)}
      </select></Field><Button type="submit">Apply filter</Button>
    </form>
    <ProjectList projects={projects.items} hasMore={projects.hasMore} filtered={status !== 'all'} />
  </>;
}
