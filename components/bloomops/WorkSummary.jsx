import { MILESTONE_STATUS_LABELS } from '@/lib/bloomops/milestone-values.mjs';
import { plural } from '@/lib/bloomops/format.mjs';
import { workActionHref } from './Actions';

// Only a B6 read model supplies these fields. Existing Client Project lists
// can keep using ProjectList without acquiring another dashboard query.
export function WorkSummary({ project, execution = false }) {
  const { milestones, actions, deliverables, readyFiles } = project;
  if (!milestones && !actions?.open && !deliverables?.total && !readyFiles && !(execution && actions?.total)) return null;
  const href = `/work/projects/${project.id}`;
  const phase = execution ? project.currentPhase : null;
  return <ul className="bo-work-summary" aria-label={`Summary for ${project.name}`}>
    {phase && <li><a className="bo-link" href={`${href}#project-milestones-title`}>{phase.status === 'upcoming' ? 'Next phase' : 'Current phase'}: {phase.name} · {MILESTONE_STATUS_LABELS[phase.status]}</a></li>}
    {milestones && <li><a className="bo-link" href={`${href}#project-milestones-title`}>{milestones.finished} of {milestones.total} milestones finished · {milestones.percentage}%</a></li>}
    {execution && actions?.total > 0 && <li><a className="bo-link" href={`${href}#project-actions-title`}>{actions.done} of {actions.total} Actions done{actions.cancelled > 0 && ` · ${actions.cancelled} cancelled`}</a></li>}
    {actions?.open > 0 && <li><a className="bo-link" href={`${href}#project-actions-title`}>{plural(actions.open, 'open Action')}</a>
      {execution && actions.blocked > 0 && <a className="bo-link" href={`${href}#project-actions-title`}>{actions.blocked} blocked by dependencies</a>}
      {['overdue', 'waiting', 'review'].filter(key => actions[key] > 0).map(key => <a key={key} className="bo-link" href={workActionHref({ projectId: project.id, view: key })}>{actions[key]} {key === 'review' ? 'in Review' : key}</a>)}
    </li>}
    {deliverables?.total > 0 && <li><a className="bo-link" href={`${href}#project-deliverables-title`}>{plural(deliverables.total, 'Deliverable')}
      {deliverables.clientReview > 0 && ` · ${deliverables.clientReview} in Client Review`}
      {deliverables.internalReview > 0 && ` · ${deliverables.internalReview} in Internal Review`}
      {deliverables.approved > 0 && ` · ${deliverables.approved} approved`}
      {deliverables.delivered > 0 && ` · ${deliverables.delivered} delivered`}
    </a></li>}
    {readyFiles > 0 && <li><a className="bo-link" href={`${href}#project-files-title`}>{plural(readyFiles, 'Ready file')}</a></li>}
  </ul>;
}
