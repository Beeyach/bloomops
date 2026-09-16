import { Button, EmptyState } from './Primitives';
import { ClientStatus } from './Clients';
import { plural } from '@/lib/bloomops/format.mjs';

// Lifecycle labels describe Clients, not checklist completion. The destination
// reads the actual onboarding instance and independently checks current access.
export function OnboardingClients({ clients, total }) {
  if (!clients.length) return <EmptyState title="No Clients available for onboarding" actions={<Button href="/clients">Open Clients</Button>}>
    <p>Clients you have permission to open appear here. A checklist is created when a Client is activated.</p>
  </EmptyState>;
  return <section aria-label="Client checklists">
    <p className="bo-small bo-list-count">{clients.length < total ? `Showing ${clients.length} of ${total} Clients` : plural(clients.length, 'Client')}</p>
    <ul className="bo-rows">
      {clients.map(client => <li key={client.id}>
        <a className="bo-row bo-client-row" href={`/clients/${client.id}?tab=onboarding`}>
          <span className="bo-row-text"><span className="bo-row-title">{client.name}</span><span className="bo-row-meta">Open onboarding checklist</span></span>
          <span className="bo-row-end"><ClientStatus status={client.relationshipStatus} /></span>
        </a>
      </li>)}
    </ul>
    {clients.length < total && <Button href="/clients">Find a Client by lifecycle</Button>}
  </section>;
}
