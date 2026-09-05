// The mock's "Scan progress" bar: a determinate fill with a flowing sheen and
// a small bloom spinning at the leading edge, plus a percentage. Ported exactly
// from the Editorial Botanical mock (.rf-grow).
//
// Determinate only — it is driven by a real done/total, so the width IS the
// number. It is not used for the Apify scans, which report no honest fraction;
// its home is work that genuinely counts (the AI Hive's N-of-M progress).

export default function ScanBar({ done = 0, total = 0, label }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="ltb-scanprog" role="status" aria-live="polite">
      <div className="ltb-scanprog-head">
        {label && <span className="ltb-scanprog-label">{label}</span>}
        <span className="ltb-scanprog-pct">{pct}%</span>
      </div>
      <div className="ltb-scanprog-bar">
        <div className="ltb-scanprog-track">
          <div className="ltb-scanprog-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="ltb-scanprog-marker" style={{ left: `${pct}%` }}>
          <svg viewBox="0 0 24 24" width="18" height="18" className="ltb-scanprog-bloom" aria-hidden="true">
            <ellipse cx="12" cy="6.4" rx="2.7" ry="4.6" fill="var(--rose)" />
            <ellipse cx="17.6" cy="12" rx="4.6" ry="2.7" fill="var(--rose)" />
            <ellipse cx="12" cy="17.6" rx="2.7" ry="4.6" fill="var(--rose)" />
            <ellipse cx="6.4" cy="12" rx="4.6" ry="2.7" fill="var(--rose)" />
            <circle cx="12" cy="12" r="2.9" fill="var(--gold)" />
          </svg>
        </div>
      </div>
      {total > 0 && (
        <div className="ltb-scanprog-sub">{Math.min(done, total)} of {total}</div>
      )}
    </div>
  );
}
