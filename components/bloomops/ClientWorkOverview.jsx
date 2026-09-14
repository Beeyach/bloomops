import { Section, Status, Button, Notice } from './Primitives';
import { Icon } from './Icons';
import { ServiceStatus } from './Services';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES } from '@/lib/bloomops/project-values.mjs';
import { ACTION_STATUS_LABELS } from '@/lib/bloomops/action-values.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import styles from './ClientWorkOverview.module.css';

const kinds = { project: 'Project', milestone: 'Milestone', action: 'Task', deliverable: 'Deliverable' };
const clientTab = (id, tab) => `/clients/${encodeURIComponent(id)}?tab=${tab}`;
function More({ href, children }) { return <Button href={href} variant="ghost" size="sm" icon="chevron-right">{children}</Button>; }
function WorkList({ result, kind }) {
  if (!result.items.length) return <p className="bo-small">No open {kind === 'project' ? 'projects' : 'tasks'} available to you.</p>;
  return <ul className={styles.rows}>{result.items.map(item => <li key={item.id}>
    <a className={styles.workLink} href={item.href}><Icon name={kind === 'project' ? 'work' : 'check'} size={16}/><span>{item.title}</span><Icon name="chevron-right" size={16}/></a>
    <div className={styles.states}><Status label={kind === 'project' ? PROJECT_STATUS_LABELS[item.status] : ACTION_STATUS_LABELS[item.status]}
      tone={kind === 'project' ? PROJECT_STATUS_TONES[item.status] : item.status === 'waiting' ? 'warning' : 'info'}/>
      {item.overdue && <span className={styles.late}>Overdue</span>}{item.blocked && <span className="bo-small">Waiting on prerequisite</span>}</div>
  </li>)}</ul>;
}
function Deadline({ item, today }) {
  return <a href={item.href} className={styles.deadlineLink}>
    <span className={styles.dateIcon}><Icon name="calendar" size={20}/></span>
    <span><span className={styles.deadlineDate}>{item.date === today ? 'Today' : formatDate(item.date)}</span>
      <span className="bo-small">{kinds[item.kind]}</span><strong>{item.title}</strong>
      {item.blocked && <span className="bo-small">Waiting on prerequisite</span>}</span>
    <Icon name="chevron-right" size={16}/>
  </a>;
}
export function ClientWorkLoading() {
  return <div className={styles.loading} role="status" aria-label="Loading client overview"><span>Loading client overview</span>
    {[1, 2, 3].map(n => <div key={n} className={styles.skeleton} aria-hidden="true"/>)}</div>;
}
export function ClientWorkError({ clientId }) {
  return <Notice tone="error">The client overview could not be loaded. <a className="bo-link" href={clientTab(clientId, 'overview')}>Try again</a></Notice>;
}
export default function ClientWorkOverview({ clientId, overview }) {
  const { services, projects, actions, requests, nextDeadline, overdue, today, timezone } = overview;
  return <div className={styles.overview} data-client-overview>
    <Section id="purchased-services" title="Purchased services" aside={<More href={clientTab(clientId, 'services')}>{services.hasMore ? 'More services' : 'All services'}</More>}>
      {services.items.length ? <ul className={styles.services}>{services.items.map(service => <li key={service.id}>
        <div><strong>{service.serviceTypeName}</strong>{service.packageName && <span className="bo-small">{service.packageName}</span>}</div><ServiceStatus status={service.status}/>
      </li>)}</ul> : <p className="bo-small">No purchased services available to you.</p>}
    </Section>
    <div className={styles.columns}>
      <Section id="current-work" title="Current work">
        <div className={styles.subhead}><h3>Projects</h3>{projects.items.length > 0 && <More href={clientTab(clientId, 'projects')}>{projects.hasMore ? 'More projects' : 'All projects'}</More>}</div>
        <WorkList result={projects} kind="project"/>
        <div className={styles.subhead}><h3>Tasks</h3><More href={`/work?tab=actions&view=all&clientId=${encodeURIComponent(clientId)}`}>{actions.hasMore ? 'More tasks' : 'All tasks'}</More></div>
        <WorkList result={actions} kind="action"/>
      </Section>
      <div>
        <Section id="next-deadline" title="Next deadline">
          {nextDeadline ? <Deadline item={nextDeadline} today={today}/> : <p className="bo-small">No upcoming deadline available to you.</p>}
          <p className={styles.timezone}>Dates in {timezone.replaceAll('_', ' ')}</p>
          {overdue && <div className={styles.overdue}><span className={styles.late}>Past due</span><a className="bo-link" href={overdue.href}>{overdue.title}</a><span className="bo-small">{kinds[overdue.kind]} due {formatDate(overdue.date)}</span></div>}
        </Section>
        <Section id="open-requests" title="Open requests" aside={requests.state !== 'unavailable' && <More href={clientTab(clientId, 'onboarding')}>{requests.hasMore ? 'More requests' : 'Onboarding'}</More>}>
          {requests.state === 'unavailable' ? <p className="bo-small">Onboarding is not available to you.</p> : requests.state === 'not_created' ? <p className="bo-small">Onboarding has not been created yet.</p> : <>
            {!!requests.progress?.total && <div className={styles.progress}><p className="bo-small">{requests.progress.done} of {requests.progress.total} required steps satisfied</p><progress value={requests.progress.done} max={requests.progress.total} aria-label="Required onboarding steps satisfied"/></div>}
            {requests.items.length ? <ul className={styles.requests}>{requests.items.map(item => <li key={item.id}>
              <a className={styles.workLink} href={clientTab(clientId, 'onboarding')}><Icon name={item.audience === 'review' ? 'shield-check' : 'onboarding'} size={16}/><span>{item.title}</span><Icon name="chevron-right" size={16}/></a>
              <div className={styles.states}><Status label={item.audience === 'review' ? 'Needs verification' : item.audience === 'client' ? 'Client action' : 'Team action'} tone={item.audience === 'review' ? 'warning' : 'info'} glyph="clock"/>
                <span className="bo-small">{item.required ? 'Required' : 'Optional'}</span>{item.status === 'blocked' && <span className={styles.late}>Blocked</span>}</div>
            </li>)}</ul> : <p className="bo-small">No open onboarding requests available to you.</p>}
          </>}
        </Section>
      </div>
    </div>
  </div>;
}
