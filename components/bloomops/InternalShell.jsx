import NotificationBell from './NotificationBell';
import {Icon} from './Icons';
import Link from 'next/link';
import BrandLogo from './BrandLogo';
import { INTERNAL_NAV } from '@/lib/bloomops/navigation.mjs';
import InternalNav from './InternalNav';
import MobileNav from './MobileNav';
import AccountMenu from './AccountMenu';
import ShellHosts from './ShellHosts';
import SearchLink from './SearchLink';

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

export default function InternalShell({ workspace, user, roleLabel, membershipId, children }) {
  const account = { name: user.name, email: user.email, roleLabel, workspaceName: workspace.name };
  return (
    <div className="bo-root">
      <a className="bo-skip" href="#main">
        Skip to content
      </a>
      <div className="bo-shell">
        <aside className="bo-sidebar" aria-label="Workspace">
          <div className="bo-sidebar-head">
            <BrandLogo />

          </div>
          <div className="bo-sidebar-scroll">
            <SearchLink />
            <InternalNav items={INTERNAL_NAV} />
          </div>
          <div className="bo-sidebar-foot">
            <AccountMenu {...account} placement="up" settingsHref="/settings" />
          </div>
        </aside>
        <div className="bo-main">
          <header className="bo-internal-utilities">
            <BrandLogo />
            <Link href="/workspaces" className="bo-workspace-control" title={workspace.name} aria-label={`Switch workspace: ${workspace.name}`}><Icon name="team" size={18}/><span><small>Workspace</small><strong>{workspace.name}</strong></span><Icon name="chevron-down" size={16}/></Link>
            <NotificationBell scope={{workspaceId:workspace.id,userId:user.id,membershipId}}/>
            <SearchLink compact/>
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
