import { INTERNAL_NAV } from '@/lib/bloomops/navigation.mjs';
import InternalNav from './InternalNav';
import MobileNav from './MobileNav';
import AccountMenu from './AccountMenu';
import ShellHosts from './ShellHosts';

// The internal application chrome, rendered by app/(internal)/layout.jsx
// for Owner, Admin, Project Manager, and Team Member. One composition,
// three geometries from the stylesheet: a labelled sidebar from 1024px, a
// labelled rail between 768px and 1023px, and a top bar plus bottom tab
// bar on phones. The workspace, the person, and their role are shown once
// each; the pages own everything else.
//
// This component never decides who may see it. The layout has already
// resolved that through lib/bloomops/shell-server.mjs, and every page
// resolves it again for itself.

function WorkspaceMark({ name }) {
  return (
    <span className="bo-mark" aria-hidden="true">
      {String(name || 'B').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function InternalShell({ workspace, user, roleLabel, children }) {
  const account = { name: user.name, email: user.email, roleLabel, workspaceName: workspace.name };
  return (
    <div className="bo-root">
      <a className="bo-skip" href="#main">
        Skip to content
      </a>
      <div className="bo-shell">
        <aside className="bo-sidebar" aria-label="Workspace">
          <div className="bo-sidebar-head">
            <WorkspaceMark name={workspace.name} />
            <div className="bo-workspace-text" style={{ minWidth: 0 }}>
              <div className="bo-workspace-name">{workspace.name}</div>
              <div className="bo-workspace-sub">BloomOps</div>
            </div>
          </div>
          <div className="bo-sidebar-scroll">
            <InternalNav items={INTERNAL_NAV} />
          </div>
          <div className="bo-sidebar-foot">
            <AccountMenu {...account} placement="up" settingsHref="/settings" />
          </div>
        </aside>
        <div className="bo-main">
          <header className="bo-topbar bo-topbar-internal">
            <div className="bo-topbar-title">
              <WorkspaceMark name={workspace.name} />
              <div style={{ minWidth: 0 }}>
                <div className="bo-workspace-name">{workspace.name}</div>
              </div>
            </div>
            <AccountMenu {...account} placement="down" compact settingsHref="/settings" />
          </header>
          <main id="main" className="bo-page" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <MobileNav items={INTERNAL_NAV} />
      <ShellHosts />
    </div>
  );
}
