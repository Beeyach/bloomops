// The one frame every signed-out screen shares: the BloomOps mark, a
// title, a short line of context, and a panel. Server-renderable, no
// state. Also frames the not-found page, since a person there may not be
// signed in either.
export default function AuthShell({ title, lead, children, footer = null }) {
  return (
    <div className="bo-root">
      <main className="bo-auth">
        <div className="bo-auth-card">
          <div className="bo-auth-head">
            <span className="bo-mark bo-mark-lg" aria-hidden="true">
              B
            </span>
            <div>
              <p className="bo-small" style={{ marginBottom: 4 }}>
                BloomOps
              </p>
              <h1 className="bo-display">{title}</h1>
              {lead && (
                <p className="bo-lede" style={{ marginTop: 8 }}>
                  {lead}
                </p>
              )}
            </div>
          </div>
          {children && <div className="bo-surface bo-auth-panel">{children}</div>}
          {footer && <p className="bo-auth-foot">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
