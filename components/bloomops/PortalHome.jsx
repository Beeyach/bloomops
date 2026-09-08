import Onboarding from './Onboarding';
import { Surface } from './Primitives';
import { PortalProjects } from './Projects';

// The server supplies only the dedicated Client-safe onboarding projection.

function firstName(user) {
  const name = String(user?.name || '').trim();
  return name ? name.split(/\s+/)[0] : '';
}

export function PortalHome({ workspaceName, user, clients = [] }) {
  const first = firstName(user);
  if (clients.length === 0) {
    return (
      <>
        <h1 className="bo-display bo-display-lg">{first ? `Hello, ${first}` : 'Hello'}</h1>
        <p className="bo-lede" style={{ marginTop: 12 }}>
          This is your portal with {workspaceName}.
        </p>
        <Surface padding="lg" style={{ marginTop: 32 }}>
          <h2 className="bo-h2" style={{ marginBottom: 8 }}>
            Your portal is not connected yet
          </h2>
          <p className="bo-body">
            You are signed in as {user.email}, but this account has not been connected to your work with {workspaceName} yet, so there is nothing to show for now. {workspaceName} will finish setting it up.
          </p>
          <p className="bo-body" style={{ marginTop: 12 }}>
            If you expected to see something here, reply to the person who invited you.
          </p>
        </Surface>
      </>
    );
  }
  const single = clients.length === 1 ? clients[0] : null;
  return (
    <>
      <h1 className="bo-display bo-display-lg">{first ? `Hello, ${first}` : 'Hello'}</h1>
      <p className="bo-lede" style={{ marginTop: 12 }}>
        {single ? `${single.name} · Your work with ${workspaceName}.` : `Your work with ${workspaceName}, across ${clients.length} accounts.`}
      </p>
      {clients.map(client => <section key={client.id} className="bo-section" aria-labelledby={`onboarding-${client.id}`}>
        <h2 id={`onboarding-${client.id}`} className="bo-h2">{single ? 'Your onboarding' : `${client.name} · Onboarding`}</h2>
        <Onboarding clientId={client.id} onboarding={client.onboarding} portal />
      </section>)}
      {clients.filter(client => client.projects?.length).map(client => <section key={`projects-${client.id}`} className="bo-section" aria-labelledby={`projects-${client.id}`}>
        <h2 id={`projects-${client.id}`} className="bo-h2">{single ? 'Your projects' : `${client.name} · Projects`}</h2>
        <PortalProjects projects={client.projects} />
      </section>)}
    </>
  );
}
