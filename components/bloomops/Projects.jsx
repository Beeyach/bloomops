import { formatDate } from '@/lib/bloomops/format.mjs';
import { PROJECT_HEALTH_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES, PROJECT_VISIBILITY_LABELS } from '@/lib/bloomops/project-values.mjs';
import { EmptyState, Facts, Status } from './Primitives';
import { PortalMilestones } from './Milestones';

export function ProjectStatus({ status }) {
  return <Status label={PROJECT_STATUS_LABELS[status]} tone={PROJECT_STATUS_TONES[status]} glyph={status === 'completed' ? 'check' : ['waiting', 'blocked'].includes(status) ? 'clock' : 'dot'} />;
}

export function ProjectHealth({ health }) {
  return <Status label={PROJECT_HEALTH_LABELS[health]} tone={health === 'on_track' ? 'success' : health === 'at_risk' ? 'error' : 'warning'} />;
}

export function ProjectList({ projects, filtered = false, hasMore = false }) {
  if (!projects.length) return <EmptyState title={filtered ? 'No projects match this view' : 'No projects yet'}>
    <p>{filtered ? 'Choose another status to see more work.' : 'Projects bring a client’s delivery into one place. Projects you have access to will appear here.'}</p>
  </EmptyState>;
  return <>
    <ul className="bo-rows" aria-label="Projects">
      {projects.map(project => <li key={project.id} className="bo-project-row">
        <div className="bo-row-text">
          <a className="bo-link bo-project-name" href={`/work/projects/${project.id}`}>{project.name}</a>
          <span className="bo-row-meta">{[project.clientName, project.serviceName, project.departmentName].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="bo-project-state"><ProjectStatus status={project.status} /><ProjectHealth health={project.health} /></div>
        <div className="bo-project-meta"><span>{project.targetDate ? `Target ${formatDate(project.targetDate)}` : 'No target date'}</span><span className="bo-small">{project.ownerName || 'No owner yet'}</span></div>
      </li>)}
    </ul>
    {hasMore && <p className="bo-small">Showing the first {projects.length} projects. Choose a status or open a client’s Projects tab to narrow the view.</p>}
  </>;
}

export function ProjectFacts({ project, clientHref = null }) {
  return <Facts items={[
    ['Client', clientHref ? <a key="client" className="bo-link" href={clientHref}>{project.clientName}</a> : project.clientName],
    ['Service', project.serviceName || 'Client-level project'],
    ['Department', project.departmentName || 'Not set'],
    ['Status', <ProjectStatus key="status" status={project.status} />],
    ['Health', <ProjectHealth key="health" health={project.health} />],
    ['Internal owner', project.ownerName ? `${project.ownerName}${project.ownerActive ? '' : ' (no longer an active internal member)'}` : 'Nobody yet'],
    ['Start date', formatDate(project.startDate) || 'Not set'],
    ['Target date', formatDate(project.targetDate) || 'Not set'],
    ...(project.completedAt ? [['Completed', formatDate(project.completedAt)]] : []),
    ['Visibility', PROJECT_VISIBILITY_LABELS[project.visibility]],
    ['Client-facing label', project.clientLabel || 'Uses the project name when client visible'],
  ]} />;
}

// Only the dedicated portal DTO is accepted here. No internal record props
// are forwarded into a Client component or serialized into its page.
export function PortalProjects({ projects = [], milestones = {} }) {
  if (!projects.length) return null;
  return <ul className="bo-rows" aria-label="Your projects">
    {projects.map(project => <li key={project.id} className="bo-row bo-portal-project">
      <span className="bo-row-text"><span className="bo-row-title">{project.label}</span>
        {(project.completedAt || project.targetDate) && <span className="bo-row-meta">{project.completedAt ? `Completed ${formatDate(project.completedAt)}` : `Target ${formatDate(project.targetDate)}`}</span>}
      </span>
      <Status label={project.statusLabel} />
      <PortalMilestones summary={milestones[project.id]} />
    </li>)}
  </ul>;
}
