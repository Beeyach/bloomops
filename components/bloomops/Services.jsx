// The semantic pieces the Services and Team tabs are built from: a service
// status marker, a service row, an assignment row, and the two headings that
// keep client-wide and service-specific assignment apart.
//
// None of them uses hooks, so a server component, a client component, and a
// render test all get the same markup. None of them is a card: a purchased
// service is an ordinary operational record, so it is a hairline row with a
// name, its department, its status, and a quiet second line. No progress
// ring, no chart, no invented statistic. Styling lives in app/bloomops.css
// under `bo-service-*` and `bo-assign-*`.
import { SERVICE_STATUS_TONE, serviceStatusLabel } from '@/lib/bloomops/services.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import { Status } from './Primitives';

const dateOnly = (value) => (value ? formatDate(`${value}T00:00:00.000Z`) : null);

// Where one purchased service stands. Label and glyph both, so it is never
// colour alone, and deliberately its own table: a paused service and a
// paused client are different facts that share a word.
export function ServiceStatus({ status, className = '' }) {
  const [tone, glyph] = SERVICE_STATUS_TONE[status] || ['neutral', 'dot'];
  return <Status label={serviceStatusLabel(status)} tone={tone} glyph={glyph} className={className} />;
}

// One purchased service. The service name leads, the department sits with
// it because that is where the work lives, and the second line carries the
// package and the start date when there are any. The scope note is shown
// under the row rather than inside it, so a long one does not push the
// status marker around.
export function ServiceRow({ service, actions = null }) {
  const meta = [service.departmentName, service.packageName, service.startDate ? `Started ${dateOnly(service.startDate)}` : null].filter(Boolean);
  return (
    <li className={`bo-row bo-service-row${actions ? ' bo-row-wrap' : ''}`}>
      <span className="bo-row-text">
        <span className="bo-row-title">{service.serviceTypeName}</span>
        {meta.length > 0 && <span className="bo-row-meta">{meta.join(' · ')}</span>}
        {service.scopeNotes && <span className="bo-service-scope">{service.scopeNotes}</span>}
      </span>
      <span className="bo-row-end bo-service-row-state">
        <ServiceStatus status={service.status} />
      </span>
      {actions && <span className="bo-row-end">{actions}</span>}
    </li>
  );
}

// One assigned person. The assignment role is a word beside the name, never
// a colour: Lead and Member are different responsibilities and a screen
// reader must hear which. Someone whose membership has ended keeps their
// place in the list and is marked in words too, because the assignment is a
// record of who was put on this work and removing it is a decision.
export function AssignmentRow({ assignment, actions = null }) {
  const meta = [assignment.roleLabel, assignment.email].filter(Boolean);
  return (
    <li className={`bo-row bo-assign-row${actions ? ' bo-row-wrap' : ''}`}>
      <span className="bo-row-text">
        <span className="bo-row-title">
          {assignment.name}
          {/* A real space, not only the marker's left margin: without it the
              name and the role run together in the accessible text and in
              anything that reads textContent. */}
          {' '}
          <span className="bo-assign-role">{assignment.assignmentRoleLabel}</span>
        </span>
        {meta.length > 0 && <span className="bo-row-meta">{meta.join(' · ')}</span>}
        {!assignment.active && <span className="bo-row-meta">No longer active in this workspace.</span>}
      </span>
      {actions && <span className="bo-row-end">{actions}</span>}
    </li>
  );
}

// The heading of one service's own team inside the Team tab. It repeats the
// service name and its status so the list underneath is never ambiguous
// about which engagement it belongs to.
export function ServiceTeamHeading({ service }) {
  return (
    <div className="bo-service-team-head">
      <h3 className="bo-h3">{service.serviceTypeName}</h3>
      <ServiceStatus status={service.status} />
    </div>
  );
}
