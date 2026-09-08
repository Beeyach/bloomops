import { formatDate } from '@/lib/bloomops/format.mjs';
import { DELIVERABLE_STATUS_LABELS } from '@/lib/bloomops/deliverable-values.mjs';
import { Button, EmptyState, Section, Status } from './Primitives';
import { ActionList, workActionHref } from './Actions';
import { WorkSummary } from './WorkSummary';

const actionSections = [['overdue', 'Overdue'], ['today', 'Today'], ['waiting', 'Waiting'], ['review', 'In review']];

export function OperationalHome({ projection }) {
  const { actions, projects, deliverables, recent } = projection;
  const visibleActions = actionSections.filter(([view]) => actions[view].items.length);
  const empty = !visibleActions.length && !projects.items.length && !deliverables.items.length && !recent.items.length;
  return <div className="bo-home">
    {empty && <EmptyState title="Nothing needs attention here right now" actions={<Button href="/work">Open your work</Button>}>
      <p>Your due Actions, Projects needing attention and upcoming delivery will appear here as work moves forward.</p>
    </EmptyState>}
    {visibleActions.length > 0 && <div className="bo-home-action-sections">{visibleActions.map(([view, title]) => <Section key={view} id={`home-${view}`} title={title}
      aside={<Button size="sm" variant="ghost" href={workActionHref({ view })}>View {view === 'review' ? 'review' : view} Actions</Button>}>
      <ActionList items={actions[view].items} />
      {actions[view].hasMore && <p className="bo-small">Showing the first {actions[view].items.length}. Open the view for more.</p>}
    </Section>)}</div>}
    {projects.items.length > 0 && <Section id="home-projects" title="Projects needing attention" aside={<Button size="sm" variant="ghost" href="/work?tab=projects">View Projects</Button>}>
      <ul className="bo-home-projects" aria-label="Projects needing attention">{projects.items.map(project => <li key={project.id} data-project-id={project.id}>
        <div className="bo-home-project-head"><div><a className="bo-link bo-project-name" href={`/work/projects/${project.id}`}>{project.name}</a>
          <p className="bo-small">{[project.clientName, project.serviceName].filter(Boolean).join(' · ')}</p></div>
          <span className="bo-home-reason">{project.attentionReason}</span>
        </div>
        <WorkSummary project={project} />
      </li>)}</ul>
      {projects.hasMore && <p className="bo-small">Showing the first {projects.items.length} Projects needing attention. Open Projects for the rest of your work.</p>}
    </Section>}
    {deliverables.items.length > 0 && <Section id="home-deliverables" title="Deliverables to move forward">
      <p className="bo-small">Review and approved work, plus targets in the next 14 days or already past.</p>
      <ul className="bo-home-outputs" aria-label="Deliverables to move forward">{deliverables.items.map(item => <li key={item.id} data-deliverable-id={item.id}>
        <div><a className="bo-link bo-project-name" href={`/work/projects/${item.projectId}#project-deliverables-title`}>{item.title}</a>
          <p className="bo-small">{item.clientName} · {item.projectName}</p></div>
        <div className="bo-home-output-state"><Status label={DELIVERABLE_STATUS_LABELS[item.status]} />
          {item.targetDate && <span className="bo-small">Target <time dateTime={item.targetDate}>{formatDate(item.targetDate)}</time></span>}
        </div>
      </li>)}</ul>
      {deliverables.hasMore && <p className="bo-small">Showing the first {deliverables.items.length}. <a className="bo-link" href="/work?tab=projects">Open Projects for more Deliverables.</a></p>}
    </Section>}
    {recent.items.length > 0 && <Section id="home-recent" title="Recently delivered and uploaded">
      <p className="bo-small">From the past 14 days.</p>
      <ol className="bo-home-outputs" aria-label="Recent outputs">{recent.items.map(item => <li key={item.eventId} data-output-id={item.id}>
        <div><a className="bo-link bo-project-name" href={`/work/projects/${item.projectId}#project-${item.kind === 'file' ? 'files' : 'deliverables'}-title`}>{item.title}</a>
          <p className="bo-small">{item.clientName} · {item.projectName}</p></div>
        <div className="bo-home-output-state"><span>{item.kind === 'file' ? 'File uploaded' : 'Deliverable delivered'}</span>
          <time className="bo-small" dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time>
        </div>
      </li>)}</ol>
      {recent.hasMore && <p className="bo-small">Showing the {recent.items.length} most recent outputs. <a className="bo-link" href="/work?tab=projects">Open a Project for its history.</a></p>}
    </Section>}
    {!empty && <p className="bo-small bo-action-footnote">Action dates and Deliverable targets follow each Client’s timezone, or UTC when none is set. Dependency-blocked work is excluded from Overdue.</p>}
  </div>;
}
