import { notFound } from 'next/navigation';
import { evaluate, loadInternalClientResource } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getClient, ownerCandidates, timezoneOptions } from '@/lib/bloomops/clients.mjs';
import { listContacts } from '@/lib/bloomops/client-contacts.mjs';
import { clientActivity } from '@/lib/bloomops/client-activity.mjs';
import { EmptyState, Notice, Section, Surface } from '@/components/bloomops/Primitives';
import { ActivityRow, ClientDetailHeader, ClientTabs, ContactRow, isClientTab } from '@/components/bloomops/Clients';
import ClientOverview, { ClientFactsList } from '@/components/bloomops/ClientOverview';
import ClientContacts from '@/components/bloomops/ClientContacts';

// One client (A6). The canonical route is /clients/:id; the five Release A
// tabs are `?tab=`, so every section is an address that can be shared and
// returned to and the browser's own back step works.
//
// Two decisions on this page are the engine's, made fresh on the server for
// this request and never in the browser:
//
//   whether this person may see this client at all. The client is loaded as
//   an INTERNAL record, so a Client membership is refused on visibility and
//   an unassigned Team Member on scope; both, and a client in another
//   workspace, and an id that never existed, all end in the same not-found.
//   Nothing here says which.
//
//   whether they may change anything. `client.manage` is Owner, Admin, and
//   Project Manager. A Team Member who is assigned to this client reads the
//   same facts with no controls rendered, and the routes behind those
//   controls would refuse them anyway.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { access, actor } = await requireShell('internal');
  const client = await getClient(access.db, actor, id);
  return { title: client ? client.name : 'Client' };
}

export default async function ClientDetailPage({ params, searchParams }) {
  const { access, actor } = await requireShell('internal');
  const { id } = await params;
  const query = await searchParams;

  // The same question the API asks, through the same engine: an internal
  // client record. A refusal here is a not-found, whatever its reason.
  const resource = await loadInternalClientResource(access.db, access.workspace.id, id);
  if (!resource || !evaluate(actor, { action: 'client.view', resource }).allowed) notFound();
  const client = await getClient(access.db, actor, id);
  if (!client) notFound();

  const mayManage = evaluate(actor, { action: 'client.manage', resource }).allowed;
  const tab = isClientTab(query?.tab) ? query.tab : 'overview';
  const contacts = await listContacts(access.db, access.workspace.id, client.id);

  return (
    <>
      <ClientDetailHeader client={client} />
      <ClientTabs clientId={client.id} active={tab} />
      {tab === 'overview' && <OverviewTab access={access} client={client} contacts={contacts} mayManage={mayManage} />}
      {tab === 'services' && <ServicesTab />}
      {tab === 'onboarding' && <OnboardingTab clientName={client.name} />}
      {tab === 'team' && <TeamTab client={client} mayManage={mayManage} />}
      {tab === 'activity' && <ActivityTab access={access} client={client} />}
    </>
  );
}

async function OverviewTab({ access, client, contacts, mayManage }) {
  if (!mayManage) {
    return (
      <>
        <Section id="details" title="Details">
          <ClientFactsList client={client} />
        </Section>
        <Section id="contacts" title="Contacts">
          {contacts.length === 0 ? (
            <EmptyState title="No contacts yet">
              <p>Nobody at {client.name} has been added as a contact.</p>
            </EmptyState>
          ) : (
            <ul className="bo-rows" aria-label="Contacts">
              {contacts.map((contact) => (
                <ContactRow key={contact.id} contact={contact} />
              ))}
            </ul>
          )}
        </Section>
        <p className="bo-small">You are assigned to this client, so you can see it. Changing a client is done by the workspace Owner, an Admin, or a Project Manager.</p>
      </>
    );
  }
  const owners = await ownerCandidates(access.db, access.workspace.id, { clientId: client.id });
  return (
    <>
      <ClientOverview client={client} owners={owners} timezones={timezoneOptions()} />
      <ClientContacts clientId={client.id} clientName={client.name} contacts={contacts} />
    </>
  );
}

// A7 owns service types, purchased engagements, and their lifecycle. This
// tab says so and shows nothing invented: no catalogue, no fake package,
// no placeholder rows.
function ServicesTab() {
  return (
    <Section id="services" title="Services">
      <Surface tone="mist" padding="lg" className="bo-page-narrow">
        <p className="bo-body">
          What this client has bought will live here: one entry per service, each with its own status, so a client with Social, Ads, and GHL Systems is still one
          client.
        </p>
        <p className="bo-body">Services are part of a later BloomOps release. Nothing has been set up for this client yet.</p>
      </Surface>
    </Section>
  );
}

// A8 generates onboarding from templates, A9 creates the instance at
// activation, and A10 is what the client sees. None of that exists, so this
// tab says exactly that and invents no progress, checklist, or percentage.
function OnboardingTab({ clientName }) {
  return (
    <Section id="onboarding" title="Onboarding">
      <Surface tone="mist" padding="lg" className="bo-page-narrow">
        <p className="bo-body">
          Onboarding has not started for {clientName}. What the agency needs from a client is generated when the client is activated, which is part of a later
          BloomOps release.
        </p>
      </Surface>
    </Section>
  );
}

// A6 owns one team fact about a client: who is responsible for it inside
// the agency. Assigning people to a client or to one of its services, and
// everything that follows from that, is A7's; this tab does not pretend
// otherwise and offers no assignment controls.
function TeamTab({ client, mayManage }) {
  return (
    <Section id="team" title="Team">
      {client.owner ? (
        <>
          <p className="bo-body">
            <span className="bo-strong">{client.owner.name}</span> is responsible for this client inside the agency
            {client.owner.roleLabel ? ` (${client.owner.roleLabel})` : ''}.
          </p>
          {!client.owner.active && (
            <Notice tone="warning">
              {client.owner.name} is no longer active in this workspace. The client has not been reassigned; choose a new owner when someone takes it on.
            </Notice>
          )}
        </>
      ) : (
        <p className="bo-body">Nobody owns this client yet.</p>
      )}
      <p className="bo-small">
        The owner is who is responsible, not who has access. Being named here does not give anyone access they did not already have.
        {mayManage ? ' Change the owner from Edit details on the Overview tab.' : ''}
      </p>
      <Surface tone="mist" padding="lg" className="bo-page-narrow" style={{ marginTop: 16 }}>
        <p className="bo-body">Assigning people to this client and to its individual services is part of a later BloomOps release.</p>
      </Surface>
    </Section>
  );
}

// Real history, from the append-only activity_events table, in words. The
// event codes, the ids, and the metadata stay on the server. This is
// internal: the client portal never receives any of it.
async function ActivityTab({ access, client }) {
  const events = await clientActivity(access.db, access.workspace.id, client.id);
  return (
    <Section id="activity" title="Activity">
      {events.length === 0 ? (
        <EmptyState title="Nothing has happened yet">
          <p>Changes to this client are recorded here as they happen.</p>
        </EmptyState>
      ) : (
        <ol className="bo-activity" aria-label={`History for ${client.name}`}>
          {events.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </ol>
      )}
      <p className="bo-small">This history is internal. It is never shown in the client portal.</p>
    </Section>
  );
}
