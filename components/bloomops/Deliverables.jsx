import { formatDate } from '@/lib/bloomops/format.mjs';
import { DELIVERABLE_STATUS_LABELS } from '@/lib/bloomops/deliverable-values.mjs';
import { Status, Button } from './Primitives';
import { DeliverableFiles } from './Files';

export function DeliverableList({ items = [], files = [], controls = null }) {
  if (!items.length) return <p className="bo-body">No Deliverables to show yet.</p>;
  return <ul className="bo-deliverables" aria-label="Deliverables">{items.map(item => <li key={item.id} className="bo-deliverable" id={`deliverable-${item.id}`} data-deliverable-id={item.id}>
    <div className="bo-deliverable-heading"><h3 className="bo-row-title">{item.title}</h3>
      <Status label={DELIVERABLE_STATUS_LABELS[item.status]} tone={item.status === 'delivered' ? 'success' : 'neutral'} glyph={item.status === 'delivered' ? 'check' : 'dot'} />
    </div>
    <div className="bo-form-actions">{item.targetDate&&<span className="bo-small">Target {formatDate(item.targetDate)}</span>}{item.deliveredAt&&<span className="bo-small">Delivered {formatDate(item.deliveredAt)}</span>}<span className="bo-small">{item.visibility==='client'?'Client visible when the Project is shared':item.visibility==='restricted'?'Restricted':'Internal'}</span></div>
    {item.clientLabel && <p className="bo-small">Client-facing label: {item.clientLabel}</p>}
    {item.description && <p className="bo-body bo-project-reason">{item.description}</p>}
    <Button href={`/discussions/deliverable/${item.id}`} icon="message" variant="ghost" size="sm">Discussion</Button>
    {controls?.(item)}
    <DeliverableFiles items={files.filter(file => file.deliverableId === item.id)} />
  </li>)}</ul>;
}

// Only the five-field Client DTO enters this component. Empty and hidden-only
// sets have no section, counter, progress indicator or future-feature control.
export function PortalDeliverables({ summary, discussionBase="/portal" }) {
  if (!summary?.items.length) return null;
  return <div className="bo-portal-deliverables">
    <h3 className="bo-row-title">Deliverables</h3>
    <ul className="bo-deliverables" aria-label="Project deliverables">{summary.items.map(item => <li key={item.id} className="bo-deliverable">
      <div className="bo-deliverable-heading"><span className="bo-row-title">{item.label}</span><Status label={item.statusLabel} /></div>
      <Button href={`${discussionBase}/discussions/deliverable/${item.id}`} icon="message" variant="ghost" size="sm">Discuss deliverable</Button>
      {(item.deliveredAt || item.targetDate) && <p className="bo-small">{item.deliveredAt ? `Delivered ${formatDate(item.deliveredAt)}` : `Target ${formatDate(item.targetDate)}`}</p>}
    </li>)}</ul>
  </div>;
}
