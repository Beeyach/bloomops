import { ACTION_FILTER_FIELDS, ACTION_PRIORITIES, ACTION_STATUSES, ACTION_STATUS_LABELS, ACTION_VIEWS } from '@/lib/bloomops/action-values.mjs';
import { Button, EmptyState, Facts, Field, Status } from './Primitives';

export const actionLabel = value => value ? value[0].toUpperCase() + value.slice(1) : '';
const filterLabels = { clientId: 'Client', departmentId: 'Department', serviceEngagementId: 'Service', projectId: 'Project', assigneeMembershipId: 'Assignee', status: 'Status', priority: 'Priority' };
export const workActionHref = values => `/work?${new URLSearchParams(Object.entries({ tab: 'actions', ...values }).filter(([, value]) => value != null && value !== '')).toString()}`;

export function WorkTabs({ active = 'actions' }) {
  return <nav className="bo-tabs" aria-label="Work sections"><ul className="bo-tab-strip">
    {[['actions', '/work', 'Actions'], ['projects', '/work?tab=projects', 'Projects']].map(([key, href, label]) => <li key={key}><a href={href} className="bo-client-tab" aria-current={active === key ? 'page' : undefined}>{label}</a></li>)}
  </ul></nav>;
}

export function ActionFilters({ view = 'mine', filters = {}, options = {} }) {
  return <>
    <nav className="bo-action-views" aria-label="Action views">{ACTION_VIEWS.map(value => <a key={value} href={workActionHref({ ...filters, view: value })} aria-current={view === value ? 'page' : undefined}>{actionLabel(value)}</a>)}</nav>
    <details className="bo-action-filter-panel"><summary>Filters{Object.keys(filters).length ? ` (${Object.keys(filters).length} applied)` : ''}</summary>
    <form action="/work" className="bo-action-filters">
      <input type="hidden" name="tab" value="actions" /><input type="hidden" name="view" value={view} />
      {ACTION_FILTER_FIELDS.map(key => {
        const choices = key === 'status' ? ACTION_STATUSES.map(id => ({ id, name: ACTION_STATUS_LABELS[id] })) : key === 'priority' ? ACTION_PRIORITIES.map(id => ({ id, name: actionLabel(id) })) : options[key]?.items || [];
        return <Field key={key} id={`action-filter-${key}`} label={filterLabels[key]}>
          <select id={`action-filter-${key}`} name={key} className="bo-control" defaultValue={filters[key] || ''}>
            <option value="">All</option>{filters[key] && !choices.some(choice => choice.id === filters[key]) && <option value={filters[key]}>Selected filter</option>}
            {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name || 'Unnamed'}</option>)}
          </select>
        </Field>;
      })}
      <div className="bo-action-filter-buttons"><Button type="submit">Apply filters</Button><Button href={workActionHref({ view })} variant="ghost">Clear filters</Button></div>
    </form>
    {Object.values(options).some(group => group.hasMore) && <p className="bo-small">Each filter shows its first 200 choices. You can also open a Project to work with its Actions.</p>}
    </details>
  </>;
}

export function ActionList({ items = [], controls = null, projectContext = false, structured = true }) {
  if (!items.length) return <EmptyState title="No Actions in this view"><p>Try another view or adjust the filters.</p></EmptyState>;
  return <ul className="bo-actions" aria-label="Actions">{items.map(item => <li key={item.id} className="bo-action-row" data-action-id={item.id}>
    <div className="bo-action-main"><h3 className="bo-row-title"><a href={`/work/actions/${item.id}`} className="bo-action-title">{item.title}</a></h3>
      {!projectContext && (structured ? <dl className="bo-ads-context"><div><dt>Client</dt><dd>{item.clientName}</dd></div><div><dt>Project</dt><dd>{item.projectName}</dd></div></dl> : <dl className="bo-record-context"><div><dt>Client</dt><dd>{item.clientName}</dd></div><div><dt>Project</dt><dd>{item.projectName}</dd></div></dl>)}
      {item.dependencyBlocked && <p className="bo-action-blocked">Dependency blocked</p>}
      {item.waitingReason && (structured ? <dl className="bo-ads-context"><div><dt>Waiting on {actionLabel(item.waitingType)}</dt><dd className="bo-project-reason">{item.waitingReason}</dd></div></dl> : <p className="bo-small bo-project-reason">Waiting on {actionLabel(item.waitingType)}: {item.waitingReason}</p>)}
    </div>
    <div className="bo-action-state"><Status label={ACTION_STATUS_LABELS[item.status]} tone={item.status === 'done' ? 'success' : 'neutral'} glyph={item.status === 'done' ? 'check' : 'dot'} /><span className="bo-small">{actionLabel(item.priority)} priority</span></div>
    <div className="bo-action-meta"><span>{item.assigneeName || 'Unassigned'}{item.assigneeMembershipId && !item.assigneeActive ? ' (inactive)' : ''}</span>
      <span>{item.dueDate ? <>Due <time dateTime={item.dueDate}>{item.dueDate}</time>{item.overdue ? (structured ? <strong className="bo-action-blocked"> Overdue</strong> : ' Overdue') : ''}</> : 'No due date'}</span>
    </div>
    {controls && <div className="bo-action-row-controls">{controls(item)}</div>}
  </li>)}</ul>;
}

export function ActionPagination({ result, filters, view }) {
  if (result.page <= 1 && !result.hasMore) return null;
  return <nav className="bo-action-pagination" aria-label="Action pages">
    {result.page > 1 && <Button href={workActionHref({ ...filters, view, page: result.page - 1 })}>Previous page</Button>}
    <span className="bo-small">Page {result.page}<span className="bo-pagination-note">Up to 200 Actions per page</span></span>
    {result.hasMore && <Button href={workActionHref({ ...filters, view, page: result.page + 1 })}>Next page</Button>}
  </nav>;
}

export function ActionFacts({ action }) {
  return <>
    <Facts items={[
      ['Status', ACTION_STATUS_LABELS[action.status]], ['Priority', actionLabel(action.priority)],
      ['Assignee', `${action.assigneeName || 'Unassigned'}${action.assigneeMembershipId && !action.assigneeActive ? ' (inactive)' : ''}`],
      ['Due date', action.dueDate || 'Not set'], ['Visibility', actionLabel(action.visibility)],
      ...(action.milestoneName ? [['Milestone', action.milestoneName]] : []),
      ...(action.completedAt ? [['Completed', new Date(action.completedAt).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC']] : []),
    ]} />
    {action.description && <p className="bo-body bo-project-reason">{action.description}</p>}
    {action.waitingReason && <p className="bo-body bo-project-reason">Waiting on {actionLabel(action.waitingType)}: {action.waitingReason}</p>}
    {action.dependencyBlocked && <p className="bo-action-blocked">Dependency blocked: A prerequisite is still unresolved.</p>}
    {action.overdue && <p className="bo-small">This Action is overdue.</p>}
  </>;
}
