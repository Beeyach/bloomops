import { MILESTONE_STATUS_LABELS } from '@/lib/bloomops/milestone-values.mjs';
import { plural } from '@/lib/bloomops/format.mjs';
import { workActionHref } from './Actions';
import {Icon} from './Icons';
import { Status } from './Primitives';

// Only a B6 read model supplies these fields. Existing Client Project lists
// can keep using ProjectList without acquiring another dashboard query.
export function WorkSummary({ project, execution = false, structured = false }) {
  const { milestones, actions, deliverables, readyFiles } = project;
  if (!milestones && !actions?.open && !deliverables?.total && !readyFiles && !(execution && actions?.total)) return null;
  const href = `/work/projects/${project.id}`;
  const phase = execution ? project.currentPhase : null;
  const detail = (label, tone = 'neutral') => <Status label={label} tone={tone} />;
  return <ul className={structured ? 'bo-work-summary bo-work-summary-structured' : 'bo-work-summary'} aria-label={`Summary for ${project.name}`}>
    {phase && <li className="bo-work-phase"><a className="bo-link" href={`${href}#project-milestones-title`}>{phase.status === 'upcoming' ? 'Next phase' : 'Current phase'}: {phase.name}{detail(MILESTONE_STATUS_LABELS[phase.status], phase.status === 'waiting' ? 'warning' : 'info')}</a></li>}
    {milestones && <li className="bo-work-progress"><progress aria-label={`${milestones.finished} of ${milestones.total} milestones finished`} max={Math.max(1,milestones.total)} value={milestones.finished}/><a className="bo-link" href={`${href}#project-milestones-title`}>{milestones.finished} of {milestones.total} milestones finished{detail(`${milestones.percentage}%`, milestones.percentage === 100 ? 'success' : 'neutral')}</a></li>}
    {execution && actions?.total > 0 && <li><a className="bo-link" href={`${href}#project-actions-title`}>{actions.done} of {actions.total} Actions done{actions.cancelled > 0 && detail(`${actions.cancelled} cancelled`)}</a></li>}
    {actions?.open > 0 && <li><a className="bo-link" href={`${href}#project-actions-title`}><Icon name="check" size={16}/>{plural(actions.open, 'open Action')}</a>
      {execution && actions.blocked > 0 && <a className="bo-link" href={`${href}#project-actions-title`}>{actions.blocked} blocked by dependencies</a>}
      {['overdue', 'waiting', 'review'].filter(key => actions[key] > 0).map(key => <a key={key} className="bo-link" href={workActionHref({ projectId: project.id, view: key })}>{actions[key]} {key === 'review' ? 'in Review' : key}</a>)}
    </li>}
    {deliverables?.total > 0 && <li><a className="bo-link" href={`${href}#project-deliverables-title`}><Icon name="files" size={16}/>{plural(deliverables.total, 'Deliverable')}
      {deliverables.clientReview > 0 && detail(`${deliverables.clientReview} in Client Review`, 'warning')}
      {deliverables.internalReview > 0 && detail(`${deliverables.internalReview} in Internal Review`, 'info')}
      {deliverables.approved > 0 && detail(`${deliverables.approved} approved`, 'success')}
      {deliverables.delivered > 0 && detail(`${deliverables.delivered} delivered`, 'success')}
    </a></li>}
    {readyFiles > 0 && <li><a className="bo-link" href={`${href}#project-files-title`}>{plural(readyFiles, 'Ready file')}</a></li>}
  </ul>;
}
