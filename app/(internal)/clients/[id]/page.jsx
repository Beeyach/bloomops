import Onboarding from '@/components/bloomops/Onboarding';
import { onboardingView } from '@/lib/bloomops/onboarding-views.mjs';
import ClientActivation from '@/components/bloomops/ClientActivation';
import { activationSummary } from '@/lib/bloomops/client-activation.mjs';
import { notFound } from 'next/navigation';
import { evaluate, loadInternalClientResource } from '@/lib/bloomops/authorization.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { getClient, ownerCandidates, timezoneOptions } from '@/lib/bloomops/clients.mjs';
import { listContacts } from '@/lib/bloomops/client-contacts.mjs';
import { clientActivity } from '@/lib/bloomops/client-activity.mjs';
import { availableServiceTypes, listClientServices } from '@/lib/bloomops/services.mjs';
import { listServiceTypes } from '@/lib/bloomops/service-catalog.mjs';
import { assignmentCandidates, listClientAssignments, listServiceAssignments } from '@/lib/bloomops/assignments.mjs';
import { EmptyState, Notice, Section, Surface } from '@/components/bloomops/Primitives';
import { ActivityRow, ClientDetailHeader, ClientTabs, ContactRow, isClientTab } from '@/components/bloomops/Clients';
import { AssignmentRow, ServiceRow, ServiceTeamHeading } from '@/components/bloomops/Services';
import ClientOverview, { ClientFactsList } from '@/components/bloomops/ClientOverview';
import ClientContacts from '@/components/bloomops/ClientContacts';
import ClientServices from '@/components/bloomops/ClientServices';
import ClientTeam from '@/components/bloomops/ClientTeam';

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
  const mayActivate = evaluate(actor, { action: 'client.activate', resource }).allowed;
  const activation = await activationSummary(access.db, access.workspace.id, client.id);
  const tab = isClientTab(query?.tab) ? query.tab : 'overview';
  const contacts = await listContacts(access.db, access.workspace.id, client.id);

  return (
    <>
      <ClientDetailHeader client={client} />
      {mayActivate && <ClientActivation clientId={client.id} draft={client.relationshipStatus === 'draft'} activation={activation} />}
      <ClientTabs clientId={client.id} active={tab} />
      {tab === 'overview' && <OverviewTab access={access} client={client} contacts={contacts} mayManage={mayManage} />}
      {tab === 'services' && <ServicesTab access={access} actor={actor} client={client} mayManage={mayManage} />}
      {tab === 'onboarding' && <OnboardingTab access={access} actor={actor} client={client} />}
      {tab === 'team' && <TeamTab access={access} actor={actor} client={client} mayManage={mayManage} />}
      {tab === 'activity' && <ActivityTab access={access} actor={actor} client={client} />}
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

// What this client has bought (A7). One row per purchased service, each
// with its own status, so a client with Social, Ads, and GHL is still one
// client.
//
// A manager gets the real controls. A Team Member who reaches this client
// reads the same rows with no controls at all, rendered on the server, and
// the routes behind those controls would refuse them anyway. Which services
// a Team Member sees is the engine's answer, not this page's: someone
// assigned to the client sees all of them, someone assigned to one service
// sees that one.
async function ServicesTab({ access, actor, client, mayManage }) {
  const services = await listClientServices(access.db, actor, client.id);
  if (!mayManage) {
    return (
      <Section id="services" title="Services">
        {services.length === 0 ? (
          <EmptyState title="No services yet">
            <p>Nothing has been added for {client.name} yet.</p>
          </EmptyState>
        ) : (
          <ul className="bo-rows" aria-label="Purchased services">
            {services.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </ul>
        )}
        <p className="bo-small bo-service-note">Services are added and changed by the workspace Owner, an Admin, or a Project Manager.</p>
      </Section>
    );
  }
  const catalogue = await listServiceTypes(access.db, access.workspace.id);
  const availableTypes = await availableServiceTypes(access.db, access.workspace.id, client.id, catalogue);
  return <ClientServices clientId={client.id} clientName={client.name} services={services} availableTypes={availableTypes} />;
}

// A8 generates onboarding from templates, A9 creates the instance at
// activation, and A10 owns client completion and verification. This tab
// reports only whether the initial onboarding has been created.
async function OnboardingTab({ access, actor, client }) {
  const onboarding = await onboardingView(access.db, actor, client.id);
  return <Section id="onboarding" title="Onboarding"><Onboarding clientId={client.id} onboarding={onboarding} /></Section>;
}

// Who is responsible for this client (A6), and who has access to it (A7).
//
// Three sections, kept apart on purpose because they are three different
// facts. The owner is responsibility and grants nothing. The client-wide
// team reaches the client and every service under it. A service team
// reaches one service and nothing else.
async function TeamTab({ access, actor, client, mayManage }) {
  const [services, clientAssignments] = await Promise.all([
    listClientServices(access.db, actor, client.id),
    listClientAssignments(access.db, access.workspace.id, client.id),
  ]);
  const byService = await listServiceAssignments(access.db, access.workspace.id, services.map((s) => s.id));
  const serviceAssignments = Object.fromEntries([...byService.entries()]);

  const owner = <OwnerSection client={client} mayManage={mayManage} />;
  if (!mayManage) {
    return (
      <>
        {owner}
        <Section id="client-team" title="Client-wide team">
          <p className="bo-body">People here work across every service {client.name} has.</p>
          {clientAssignments.length === 0 ? (
            <p className="bo-small">Nobody is assigned to the whole client yet.</p>
          ) : (
            <ul className="bo-rows" aria-label="Client-wide team">
              {clientAssignments.map((assignment) => (
                <AssignmentRow key={assignment.id} assignment={assignment} />
              ))}
            </ul>
          )}
        </Section>
        <Section id="service-teams" title="Service teams">
          <p className="bo-body">People here work on one service only.</p>
          {services.length === 0 ? (
            <p className="bo-small">No services have been added yet.</p>
          ) : (
            services.map((service) => (
              <div key={service.id} className="bo-service-team">
                <ServiceTeamHeading service={service} />
                {(serviceAssignments[service.id] || []).length === 0 ? (
                  <p className="bo-small">Nobody is assigned to this service yet.</p>
                ) : (
                  <ul className="bo-rows" aria-label={`${service.serviceTypeName} team`}>
                    {serviceAssignments[service.id].map((assignment) => (
                      <AssignmentRow key={assignment.id} assignment={assignment} />
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </Section>
        <p className="bo-small">Assignments are changed by the workspace Owner, an Admin, or a Project Manager.</p>
      </>
    );
  }

  const candidates = await assignmentCandidates(access.db, access.workspace.id);
  return (
    <ClientTeam
      clientId={client.id}
      clientName={client.name}
      clientAssignments={clientAssignments}
      services={services}
      serviceAssignments={serviceAssignments}
      candidates={candidates}
    >
      {owner}
    </ClientTeam>
  );
}

// The A6 owner fact, unchanged by A7. Ownership is responsibility, not
// access: naming somebody here writes no assignment row, and removing their
// assignment leaves this exactly as recorded.
function OwnerSection({ client, mayManage }) {
  return (
    <Section id="team" title="Internal owner">
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
        The owner is who is responsible, not who has access. Access comes from the assignments below.
        {mayManage ? ' Change the owner from Edit details on the Overview tab.' : ''}
      </p>
    </Section>
  );
}

// Real history, from the append-only activity_events table, in words. The
// event codes, the ids, and the metadata stay on the server. This is
// internal: the client portal never receives any of it.
async function ActivityTab({ access, actor, client }) {
  const events = await clientActivity(access.db, access.workspace.id, client.id, { actor });
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
