'use client';

// Last-resort boundary: catches throws in the root layout itself, where
// globals.css may not have painted — so this one uses inline styles only
// and renders its own <html>/<body>, per the App Router contract.
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1A1118', color: '#F2E9EE', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Leads That Bloom hit a snag</h1>
          <p style={{ fontSize: 14, color: '#B097A4', marginBottom: 20 }}>
            Your data is safe. Reloading clears this almost every time.
          </p>
          <button
            onClick={() => (reset ? reset() : window.location.reload())}
            style={{ fontSize: 14, fontWeight: 600, padding: '10px 22px', borderRadius: 8, border: 0, cursor: 'pointer', background: '#E0708F', color: '#2C1220' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
