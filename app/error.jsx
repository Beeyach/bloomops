'use client';

// Route-level error boundary. Before this existed, ANY render throw in the
// app (which is one 6,000-line component tree) white-screened the whole
// workspace with no way back but a manual reload. Now a crash lands here:
// plain words, the error preserved for reporting, one obvious way out.
export default function AppError({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="glass-panel max-w-[440px] w-full p-8 text-center">
        <h1 className="font-serif text-[26px] text-bright leading-tight mb-2">
          Something broke on this screen
        </h1>
        <p className="text-[13.5px] text-ink-2 mb-1">
          Your data is safe — this is a display crash, not a data loss.
          Reloading almost always clears it.
        </p>
        {error?.message ? (
          <p className="text-[11.5px] text-ink-3 mb-5 break-words [overflow-wrap:anywhere]">
            Details for Claude: {String(error.message).slice(0, 300)}
          </p>
        ) : (
          <span className="block mb-5" />
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="text-[13px] font-semibold px-4 py-2 rounded-[8px] btn-bloom transition"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-[13px] font-medium px-4 py-2 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
          >
            Reload the app
          </button>
        </div>
      </div>
    </div>
  );
}
