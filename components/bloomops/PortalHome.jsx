import Onboarding from './Onboarding';
import { Surface, Button } from './Primitives';
import { PortalProjects } from './Projects';

// The server supplies only the dedicated Client-safe onboarding projection.

function firstName(user) {
  const name = String(user?.name || '').trim();
  return name ? name.split(/\s+/)[0] : '';
}

export function PortalHome({ workspaceName, user, clients = [], milestones = {}, deliverables = {}, files = {}, recordings = [], approvals = {items:[],hasMore:false}, preview = null }) {
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
        {single ? `Your work with ${workspaceName}.` : `Your work with ${workspaceName}, across ${clients.length} accounts.`}
      </p>
      {clients.map(client => <section key={client.id} className="bo-section" aria-labelledby={`onboarding-${client.id}`}>
        <h2 id={`onboarding-${client.id}`} className="bo-h2">{single ? 'Your onboarding' : `Onboarding for ${client.name}`}</h2>
        <Button href={`${preview?.base||"/portal"}/discussions/client/${client.id}`} icon="message" variant="ghost">Discussion</Button>
        <Onboarding clientId={client.id} onboarding={client.onboarding} portal readOnly={Boolean(preview)} />
      </section>)}
      {approvals.items.length>0&&<section className="bo-section" aria-labelledby="approvals-needed"><h2 id="approvals-needed" className="bo-h2">Approval needed</h2>
        <p className="bo-body">Your team has work ready for your review.</p>
        <ul className="bo-content-list">{approvals.items.map(item=><li key={item.id}><a className="bo-content-title" href={`${preview?.base || "/portal"}/approvals/${item.id}`}>{item.title}</a></li>)}</ul>
        {approvals.hasMore&&<p className="bo-hint">Showing the first 200 requests. More will appear as you respond.</p>}
      </section>}
      {!preview && recordings.length > 0 && <section className="bo-section" aria-labelledby="recordings-needed"><h2 id="recordings-needed" className="bo-h2">Recording needed</h2>
        <p className="bo-body">Your team is ready for your short recordings.</p>
        <ul className="bo-content-list">{recordings.map(item => <li key={item.id}><a className="bo-content-title" href={`/portal/recordings/${item.id}`}>{item.title}</a></li>)}</ul>
      </section>}
      {clients.filter(client => client.projects?.length).map(client => <section key={`projects-${client.id}`} className="bo-section" aria-labelledby={`projects-${client.id}`}>
        <h2 id={`projects-${client.id}`} className="bo-h2">{single ? 'Your projects' : `Projects for ${client.name}`}</h2>
        <PortalProjects projects={client.projects} milestones={milestones} deliverables={deliverables} files={files} downloadBase={preview?.apiBase} discussionBase={preview?.base||"/portal"} />
      </section>)}
    </>
  );
}
