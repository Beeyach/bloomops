import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { visibleClients } from '@/lib/bloomops/overview.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { plural } from '@/lib/bloomops/format.mjs';
import { EmptyState, PageHeader, Status } from '@/components/bloomops/Primitives';

// Clients in A5 is the destination and its honest initial state. The
// list, creation, detail, contacts, status and health editing, and
// assignments are A6. What renders here is read-only: the name and
// relationship status of each client the person may see, or nothing.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clients' };

const STATUS_TONE = {
  active: ['success', 'check'],
  onboarding: ['info', 'clock'],
  paused: ['warning', 'clock'],
  draft: ['neutral', 'dot'],
  completed: ['neutral', 'check'],
  ended: ['neutral', 'dash'],
};

export default async function ClientsPage() {
  const { access, actor } = await requireShell('internal');
  const clients = await visibleClients(access.db, actor);
  const assigned = actor.scope?.kind === 'assigned';
  return (
    <>
      <PageHeader title="Clients" subtitle={navItem('clients').purpose} />
      {clients.length === 0 ? (
        <EmptyState title={assigned ? 'No clients are assigned to you' : 'No clients yet'}>
          {assigned ? (
            <p>When you are assigned to a client or to one of their services, it will appear here.</p>
          ) : (
            <p>There are no clients in this workspace yet. Adding clients is not available in BloomOps yet; when it is, each client will appear here with their services, status, and health.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <p className="bo-small" style={{ marginBottom: 12 }}>
            {plural(clients.length, 'client')}
          </p>
          <ul className="bo-rows" aria-label="Clients">
            {clients.map((client) => {
              const [tone, glyph] = STATUS_TONE[client.relationshipStatus] || ['neutral', 'dot'];
              return (
                <li key={client.id} className="bo-row">
                  <span className="bo-row-text">
                    <span className="bo-row-title">{client.name}</span>
                  </span>
                  <span className="bo-row-end">
                    <Status label={client.statusLabel} tone={tone} glyph={glyph} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
