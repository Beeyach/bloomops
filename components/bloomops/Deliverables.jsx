import { formatDate } from '@/lib/bloomops/format.mjs';
import { DELIVERABLE_STATUS_LABELS } from '@/lib/bloomops/deliverable-values.mjs';
import { Status } from './Primitives';

export function DeliverableList({ items = [], controls = null }) {
  if (!items.length) return <p className="bo-body">No Deliverables to show yet.</p>;
  return <ul className="bo-deliverables" aria-label="Deliverables">{items.map(item => <li key={item.id} className="bo-deliverable" data-deliverable-id={item.id}>
    <div className="bo-deliverable-heading"><h3 className="bo-row-title">{item.title}</h3>
      <Status label={DELIVERABLE_STATUS_LABELS[item.status]} tone={item.status === 'delivered' ? 'success' : 'neutral'} glyph={item.status === 'delivered' ? 'check' : 'dot'} />
    </div>
    <p className="bo-small">{[item.targetDate && `Target ${formatDate(item.targetDate)}`, item.deliveredAt && `Delivered ${formatDate(item.deliveredAt)}`,
      item.visibility === 'client' ? 'Client visible when the Project is shared' : item.visibility === 'restricted' ? 'Restricted' : 'Internal'].filter(Boolean).join(' · ')}</p>
    {item.clientLabel && <p className="bo-small">Client-facing label: {item.clientLabel}</p>}
    {item.description && <p className="bo-body bo-project-reason">{item.description}</p>}
    {controls?.(item)}
  </li>)}</ul>;
}

// Only the five-field Client DTO enters this component. Empty and hidden-only
// sets have no section, counter, progress indicator or future-feature control.
export function PortalDeliverables({ summary }) {
  if (!summary?.items.length) return null;
  return <div className="bo-portal-deliverables">
    <h3 className="bo-row-title">Deliverables</h3>
    <ul className="bo-deliverables" aria-label="Project deliverables">{summary.items.map(item => <li key={item.id} className="bo-deliverable">
      <div className="bo-deliverable-heading"><span className="bo-row-title">{item.label}</span><Status label={item.statusLabel} /></div>
      {(item.deliveredAt || item.targetDate) && <p className="bo-small">{item.deliveredAt ? `Delivered ${formatDate(item.deliveredAt)}` : `Target ${formatDate(item.targetDate)}`}</p>}
    </li>)}</ul>
  </div>;
}
