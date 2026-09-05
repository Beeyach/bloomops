// The one frame every signed-out screen shares: wordmark, a title, a short
// line of context, and a panel. Server-renderable, no state. Uses the
// existing Bloom tokens and panel classes; A5 owns the real shell and any
// redesign of these screens.
export default function AuthShell({ title, lead, children, footer = null }) {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] rise-in">
        <div className="flex flex-col items-center text-center mb-6">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="w-[40px] h-[40px] mb-3">
            <g fill="var(--rose)">
              <circle cx="16" cy="8.5" r="6" /><circle cx="23.5" cy="13.5" r="6" />
              <circle cx="20.5" cy="22" r="6" /><circle cx="11.5" cy="22" r="6" />
              <circle cx="8.5" cy="13.5" r="6" />
            </g>
            <circle cx="16" cy="15.5" r="4.4" fill="var(--bg)" />
          </svg>
          <p className="font-logo text-[15px] tracking-[0.08em] uppercase text-ink-3">BloomOps</p>
          <h1 className="font-logo text-[28px] text-bright leading-tight mt-1">{title}</h1>
          {lead && <p className="text-[14px] text-ink-3 mt-2 text-balance">{lead}</p>}
        </div>
        <div className="glass-panel p-5">{children}</div>
        {footer && <div className="text-center text-[12px] text-ink-3 mt-4 text-balance">{footer}</div>}
      </div>
    </main>
  );
}
