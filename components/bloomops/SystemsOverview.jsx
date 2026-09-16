import { formatDate } from '@/lib/bloomops/format.mjs';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from '@/lib/bloomops/project-values.mjs';
import { DELIVERABLE_STATUS_LABELS } from '@/lib/bloomops/deliverable-values.mjs';
import { Button, EmptyState, Field, Section, Status } from './Primitives';
import { ProjectHealth, ProjectStatus } from './Projects';
import {Icon} from './Icons';
import { WorkSummary } from './WorkSummary';

const pageHref = (filters, page) => '/systems?' + new URLSearchParams({ ...filters, page });

export function SystemsOverview({ projection }) {
  const { filters, projects, deliverables, options } = projection;
  return <div className="bo-systems">
    <form className="bo-action-filters" action="/systems" aria-label="Systems filters">
      <Field id="systems-client" label="Client"><select className="bo-control" id="systems-client" name="clientId" defaultValue={filters.clientId}>
        <option value="">All clients</option>{options.clients.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      <Field id="systems-service" label="Service"><select className="bo-control" id="systems-service" name="serviceEngagementId" defaultValue={filters.serviceEngagementId}>
        <option value="">All Systems services</option>{options.services.items.map(item => <option key={item.id} value={item.id}>{item.clientName}: {item.name}</option>)}
      </select></Field>
      <Field id="systems-status" label="Project status"><select className="bo-control" id="systems-status" name="status" defaultValue={filters.status}>
        <option value="active">Active projects</option><option value="all">All statuses</option>
        {PROJECT_STATUSES.map(status => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}
      </select></Field>
      <div className="bo-action-filter-buttons"><Button type="submit">Apply filters</Button><Button href="/systems" variant="ghost">Reset filters</Button></div>
    </form>
    {(options.clients.hasMore || options.services.hasMore) && <p className="bo-small">Showing the first 200 filter choices, plus your selection. Choose a Client to narrow Services, or browse the project pages below.</p>}
    <Section id="systems-projects" title="Systems projects">
      <p className="bo-small">Projects needing attention appear first, then target date. Open a project to continue its work.</p>
      {!projects.items.length ? <EmptyState title="No Systems projects in this view" actions={<Button href="/work?tab=projects">Open Work projects</Button>}>
        <p>Projects you can access under a Systems service appear here. Try another filter or open Work to manage projects.</p>
      </EmptyState> : <ul className="bo-rows" aria-label="Systems projects">
        {projects.items.map(project => <li className="bo-project-row" key={project.id} data-project-id={project.id}>
          <div className="bo-row-text"><a className="bo-link bo-project-name" href={`/work/projects/${project.id}`}>{project.name}</a>
            <dl className="bo-record-context"><div><dt>Client</dt><dd>{project.clientName}</dd></div><div><dt>Service</dt><dd>{project.serviceName}</dd></div></dl>
          </div>
          <div className="bo-project-state"><ProjectStatus status={project.status} />{!['archived','cancelled','completed'].includes(project.status)&&<ProjectHealth health={project.health} />}</div>
          <div className="bo-project-meta">{!['archived','cancelled','completed'].includes(project.status)&&project.attentionReason && <span>{project.attentionReason}</span>}
            <span><Icon name="calendar" size={16}/>{project.targetDate ? <>Target <time dateTime={project.targetDate}>{formatDate(project.targetDate)}</time></> : 'No target date'}</span>
          </div>
          <WorkSummary project={project} execution />
        </li>)}
      </ul>}
      {(filters.page > 1 || projects.hasMore) && <nav className="bo-action-pagination" aria-label="Systems project pages">
        {filters.page > 1 && <Button href={pageHref(filters, filters.page - 1)}>Previous projects</Button>}
        <span className="bo-small">Page {filters.page}</span>
        {projects.hasMore && filters.page < 10000 && <Button href={pageHref(filters, filters.page + 1)}>Next projects</Button>}
      </nav>}
    </Section>
    {deliverables.items.length > 0 && <Section id="systems-deliverables" title="Deliverables to move forward">
      <p className="bo-small">Across the selected projects: review and approved work, plus targets in the next 14 days or already past. Dates follow each Client’s timezone, or UTC when unset.</p>
      <ul className="bo-home-outputs" aria-label="Systems deliverables">{deliverables.items.map(item => <li key={item.id} data-deliverable-id={item.id}>
        <div><a className="bo-link bo-project-name" href={`/work/projects/${item.projectId}#project-deliverables-title`}>{item.title}</a>
          <dl className="bo-record-context"><div><dt>Client</dt><dd>{item.clientName}</dd></div><div><dt>Project</dt><dd>{item.projectName}</dd></div></dl></div>
        <div className="bo-home-output-state"><Status label={DELIVERABLE_STATUS_LABELS[item.status]} />
          {item.targetDate && <span className="bo-small">Target <time dateTime={item.targetDate}>{formatDate(item.targetDate)}</time></span>}
        </div>
      </li>)}</ul>
      {deliverables.hasMore && <p className="bo-small">Showing the first {deliverables.items.length}. Narrow the filters or open a project for its full delivery list.</p>}
    </Section>}
  </div>;
}
