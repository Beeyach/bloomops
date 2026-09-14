import BrandLogo from './BrandLogo';
import AccountMenu from './AccountMenu';
import ShellHosts from './ShellHosts';
import PortalContentNav from './PortalContentNav';

// The client portal chrome, rendered by app/portal/layout.jsx for Client
// members only. Deliberately not the internal shell with parts hidden:
// there is no sidebar and no internal link
// anywhere in this tree. A top bar names the agency's workspace and the
// person; the page underneath is calm and short. Portal destinations
// (Content, Projects, Files) join here only when the features behind them
// exist and apply to this client.
export default function PortalShell({ workspace, user, hasContent = false, hasPages = false, children }) {
  return (
    <div className="bo-root bo-portal">
      <a className="bo-skip" href="#main">
        Skip to content
      </a>
      <header className="bo-topbar">
        <div className="bo-topbar-title">
          <BrandLogo />
          <div style={{ minWidth: 0 }}>
            <div className="bo-workspace-name">{workspace.name}</div>
            <div className="bo-workspace-sub">Client portal</div>
          </div>
        </div>
        <AccountMenu name={user.name} email={user.email} roleLabel="Client" workspaceName={workspace.name} placement="down" compact />
      </header>
      {(hasContent||hasPages)&&<PortalContentNav hasContent={hasContent} hasPages={hasPages}/>}
      <main id="main" className="bo-portal-page" tabIndex={-1}>
        {children}
      </main>
      <footer className="bo-portal-foot">{workspace.name} client portal</footer>
      <ShellHosts />
    </div>
  );
}
