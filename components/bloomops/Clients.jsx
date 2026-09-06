// The semantic pieces the Clients area is built from: a client row, the
// two independent state markers, the lifecycle filter strip, the detail
// header and its tabs, a contact row, and an activity line.
//
// None of them uses hooks, so a server component, a client component, and
// a render test all get the same markup. None of them is a card: a client
// is an ordinary operational record, so the list is hairline rows and the
// detail is sections of facts. Nothing here is holographic, gradient, or
// decorated. Styling lives in app/bloomops.css under `bo-client-*`.
import {
  CLIENT_FILTERS,
  CLIENT_HEALTH_TONE,
  CLIENT_STATUS_TONE,
  clientHealthLabel,
  clientStatusLabel,
} from '@/lib/bloomops/clients.mjs';
import { formatDate } from '@/lib/bloomops/format.mjs';
import { Status } from './Primitives';
import { Icon } from './Icons';

// Relationship status: where the client stands with the agency.
export function ClientStatus({ status, className = '' }) {
  const [tone, glyph] = CLIENT_STATUS_TONE[status] || ['neutral', 'dot'];
  return <Status label={clientStatusLabel(status)} tone={tone} glyph={glyph} className={className} />;
}

// Health: how the work is going. A separate fact from status, shown
// separately, and never inferred from it. Label and glyph both, so it is
// never colour alone.
export function ClientHealth({ health, className = '' }) {
  const [tone, glyph] = CLIENT_HEALTH_TONE[health] || ['neutral', 'dot'];
  return <Status label={clientHealthLabel(health)} tone={tone} glyph={glyph} className={className} />;
}

// One client in the list. The name leads; the line beneath it carries the
// context that helps someone find the right client (who the agency talks
// to, who owns it internally, when it started) without turning every fact
// into a pill.
export function ClientRow({ client }) {
  const context = [
    client.primaryContact?.name || null,
    client.owner ? `Owner: ${client.owner.name}` : null,
    client.startDate ? `Started ${formatDate(`${client.startDate}T00:00:00.000Z`)}` : null,
  ].filter(Boolean);
  return (
    <li>
      <a className="bo-row bo-client-row" href={`/clients/${client.id}`}>
        <span className="bo-row-text">
          <span className="bo-row-title">{client.name}</span>
          {context.length > 0 && <span className="bo-row-meta">{context.join(' · ')}</span>}
        </span>
        <span className="bo-row-end bo-client-row-state">
          <ClientStatus status={client.relationshipStatus} />
          <ClientHealth health={client.health} />
        </span>
        <span className="bo-client-row-go" aria-hidden="true">
          <Icon name="chevron-right" size={18} />
        </span>
      </a>
    </li>
  );
}

// The lifecycle filters. Links, not buttons: the list is rendered on the
// server, so the filter is part of the address, works without JavaScript,
// is keyboard and screen-reader ordinary, and is bookmarkable. Changing it
// cannot widen what anyone sees; the server rebuilds the scope from the
// actor every time and the filter only narrows it.
export function ClientFilters({ active, counts, basePath = '/clients' }) {
  return (
    <nav className="bo-filters" aria-label="Filter clients by status">
      <ul className="bo-filter-strip">
        {CLIENT_FILTERS.map((filter) => {
          const current = filter.key === active;
          const count = counts?.[filter.key];
          return (
            <li key={filter.key}>
              <a
                className="bo-filter"
                href={filter.key === 'all' ? basePath : `${basePath}?status=${filter.key}`}
                aria-current={current ? 'true' : undefined}
              >
                {filter.label}
                {typeof count === 'number' && <span className="bo-filter-count bo-num">{count}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// The detail header: the client's name, and the two state facts beside it.
export function ClientDetailHeader({ client, actions = null }) {
  return (
    <header className="bo-client-head">
      <div className="bo-client-head-text">
        <p className="bo-client-back">
          <a className="bo-link" href="/clients">
            <Icon name="chevron-left" size={16} aria-hidden="true" />
            All clients
          </a>
        </p>
        <h1 id="page-title" className="bo-display">
          {client.name}
        </h1>
        <p className="bo-client-head-state">
          <ClientStatus status={client.relationshipStatus} />
          <ClientHealth health={client.health} />
        </p>
      </div>
      {actions && <div className="bo-page-header-actions">{actions}</div>}
    </header>
  );
}

export const CLIENT_TABS = [
  ['overview', 'Overview'],
  ['services', 'Services'],
  ['onboarding', 'Onboarding'],
  ['team', 'Team'],
  ['activity', 'Activity'],
];

export function isClientTab(key) {
  return CLIENT_TABS.some(([id]) => id === key);
}

// The five Release A tabs. Links again, so each tab is an address a person
// can share and return to, and so the browser's own back behaviour works.
// The strip scrolls inside itself on a narrow screen rather than shrinking
// five labels into something unreadable or pushing the page sideways.
export function ClientTabs({ clientId, active }) {
  return (
    <nav className="bo-tabs" aria-label="Client sections">
      <ul className="bo-tab-strip">
        {CLIENT_TABS.map(([key, label]) => (
          <li key={key}>
            <a
              className="bo-client-tab"
              href={key === 'overview' ? `/clients/${clientId}` : `/clients/${clientId}?tab=${key}`}
              aria-current={key === active ? 'page' : undefined}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// One contact, as a row. The primary marker is a word beside the name, not
// a colour, and the address and phone are plain text rather than pills.
export function ContactRow({ contact, actions = null }) {
  const meta = [contact.title, contact.email, contact.phone].filter(Boolean);
  return (
    <li className={`bo-row${actions ? ' bo-row-wrap' : ''}`}>
      <span className="bo-row-text">
        <span className="bo-row-title">
          {contact.name}
          {contact.isPrimary && <span className="bo-client-primary">Primary contact</span>}
        </span>
        {meta.length > 0 && <span className="bo-row-meta">{meta.join(' · ')}</span>}
        {contact.linked && <span className="bo-row-meta">Can sign in to the client portal.</span>}
      </span>
      {actions && <span className="bo-row-end">{actions}</span>}
    </li>
  );
}

// One line of history: what happened, who did it, and when, in words. The
// event code, the ids, and the metadata JSON stay on the server.
export function ActivityRow({ event }) {
  const when = event.occurredAt ? formatDate(event.occurredAt) : '';
  return (
    <li className="bo-activity-row">
      <span className="bo-activity-mark" aria-hidden="true" />
      <span className="bo-activity-text">
        <span className="bo-activity-title">{event.title}</span>
        {event.detail && <span className="bo-activity-detail">{event.detail}</span>}
        <span className="bo-activity-meta">
          {event.actor ? `${event.actor} · ${when}` : when}
        </span>
      </span>
    </li>
  );
}
