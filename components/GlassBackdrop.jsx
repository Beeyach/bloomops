'use client';

// Rewritten (July 2026): this used to paint drifting blurred rose orbs, a
// honeycomb pattern and a vignette behind the app. Ambient blobs are the
// single loudest "AI-generated dashboard" tell there is, and they fought
// the data for attention. The working surface is now a flat, calm canvas —
// depth comes from surface values and hairlines, not atmosphere.
export default function GlassBackdrop() {
  return (
    <div aria-hidden="true">
      <style>{`
        .ltb-dark{position:fixed;inset:0;z-index:-2;background:var(--bg)}
      `}</style>
      <div className="ltb-dark" />
    </div>
  );
}
