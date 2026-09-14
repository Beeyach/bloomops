import BrandLogo from './BrandLogo';
import { Button } from './Primitives';
import { Icon } from './Icons';
import ClientPreviewGuard from './ClientPreviewGuard';
import styles from './ClientPreviewShell.module.css';

export default function ClientPreviewShell({ client, contact, workspaceName, base, apiBase, section, hasContent, hasPages, children }) {
  const exitHref = `/clients/${encodeURIComponent(client.id)}`;
  return <div className={`bo-root bo-portal ${styles.root}`}>
    <a className="bo-skip" href="#main">Skip to content</a>
    <div className={styles.banner}>
      <div className={styles.identity}><Icon name="eye" size={20}/><div><strong>Client preview</strong><span>Read only</span></div></div>
      <div className={styles.person}><strong>{client.name}</strong><span>Viewing as {contact.name}</span></div>
      <div className={styles.actions}><Button href={`${exitHref}/preview`} variant="ghost">Change contact</Button><Button href={exitHref}>Exit preview</Button></div>
    </div>
    <ClientPreviewGuard checkUrl={apiBase} exitHref={exitHref}>
      <header className="bo-topbar"><div className="bo-topbar-title"><BrandLogo/><div><div className="bo-workspace-name">{workspaceName}</div><div className="bo-workspace-sub">Client portal</div></div></div></header>
      <nav className="bo-portal-content-nav" aria-label="Preview navigation">
        <a href={base} aria-current={section==='home'?'page':undefined}>Home</a>
        {hasContent&&<a href={`${base}/content`} aria-current={section==='content'?'page':undefined}>Content</a>}
        {hasPages&&<a href={`${base}/pages`} aria-current={section==='pages'?'page':undefined}>Pages</a>}
      </nav>
      <main id="main" className="bo-portal-page" tabIndex={-1}>{children}</main>
      <footer className="bo-portal-foot">{workspaceName} client portal</footer>
    </ClientPreviewGuard>
  </div>;
}
