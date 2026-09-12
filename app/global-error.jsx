'use client';

// Last-resort boundary: catches throws in the root layout itself, where
// the stylesheets may not have painted, so this one uses inline styles
// only and renders its own <html>/<body>, per the App Router contract.
export default function GlobalError({ error, reset }) {
  if (typeof console !== 'undefined' && error) console.error(error);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFF', color: '#18152B', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>Bloomsi hit a problem</h1>
          <p style={{ fontSize: 15, color: '#5D5873', marginBottom: 20 }}>Your data is safe. Reloading clears this almost every time.</p>
          <button
            type="button"
            onClick={() => (reset ? reset() : window.location.reload())}
            style={{ fontSize: 15, fontWeight: 500, minHeight: 44, padding: '0 22px', borderRadius: 10, border: 0, cursor: 'pointer', background: '#18152B', color: '#FFFFFF' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
