import { formatDate } from '@/lib/bloomops/format.mjs';
import { MILESTONE_STATUS_LABELS } from '@/lib/bloomops/milestone-values.mjs';
import { Status } from './Primitives';

export function MilestoneProgress({ progress }) {
  if (!progress) return null;
  return <div className="bo-milestone-progress">
    <p className="bo-small">{progress.finished} of {progress.total} milestones finished</p>
    <progress max={progress.total} value={progress.finished} aria-label="Milestones finished">{progress.percentage}%</progress>
  </div>;
}

export function MilestoneList({ items, controls = null }) {
  if (!items.length) return <p className="bo-body">No milestones to show yet.</p>;
  return <ol className="bo-milestones" aria-label="Milestones">
    {items.map((item, index) => <li key={item.id} className="bo-milestone" id={`milestone-${item.id}`} data-milestone-id={item.id}>
      <div className="bo-milestone-heading"><h3 className="bo-row-title">{item.name}</h3>
        <Status label={MILESTONE_STATUS_LABELS[item.status]} tone={item.status === 'completed' ? 'success' : item.status === 'waiting' ? 'warning' : 'neutral'} glyph={item.status === 'completed' ? 'check' : item.status === 'waiting' ? 'clock' : 'dot'} />
      </div>
      <p className="bo-small bo-record-subtitle">{[item.startDate && `Starts ${formatDate(item.startDate)}`, item.targetDate && `Target ${formatDate(item.targetDate)}`,
        item.completedAt && `Completed ${formatDate(item.completedAt)}`, item.visibility === 'client' ? 'Client visible when the project is shared' : item.visibility === 'restricted' ? 'Restricted' : 'Internal'].filter(Boolean).map(label=><span key={label}>{label}</span>)}</p>
      {item.clientLabel && <p className="bo-small">Client-facing label: {item.clientLabel}</p>}
      {item.waitingReason && <p className="bo-body bo-project-reason">Waiting on: {item.waitingReason}</p>}
      {controls?.(item, index)}
    </li>)}
  </ol>;
}

// The DTO contains no internal names, ordering slots, revisions or identities.
export function PortalMilestones({ summary }) {
  if (!summary?.items.length) return null;
  return <div className="bo-portal-milestones">
    <MilestoneProgress progress={summary.progress} />
    <ol className="bo-milestones" aria-label="Project milestones">
      {summary.items.map(item => <li key={item.id} className="bo-milestone">
        <div className="bo-milestone-heading"><span className="bo-row-title">{item.label}</span><Status label={item.statusLabel} /></div>
        {(item.completedAt || item.targetDate) && <p className="bo-small">{item.completedAt ? `Completed ${formatDate(item.completedAt)}` : `Target ${formatDate(item.targetDate)}`}</p>}
      </li>)}
    </ol>
  </div>;
}
