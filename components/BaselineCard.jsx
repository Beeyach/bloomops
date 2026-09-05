'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';

// Do we have enough data to learn anything yet?
//
// That is the only question this answers, and the answer is going to be "no"
// for a while. Showing it anyway is the point: the strongest temptation once
// counting works is to start explaining the counts, and a page that says
// "3 sends, too few to conclude anything" is the cheapest defence against that.
//
// No rates below their gate, no comparisons at all, and legacy counted in its
// own box where it cannot quietly enlarge a denominator.

const num = (n) => Number(n || 0).toLocaleString();

const GATE_STYLE = {
  INSUFFICIENT: 'text-ink-3',
  EARLY_SIGNAL: 'text-ink-2',
  USABLE: 'text-leaf-text',
  STRONGER_EVIDENCE: 'text-leaf-text',
};

export default function BaselineCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/baseline')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Could not load the baseline.');
        return j;
      })
      .then((j) => { if (alive) setData(j); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return <div className="pt-1 border-t border-line"><p className="text-[12.5px] text-poppy-text">{error}</p></div>;
  }
  if (!data) return null;

  return (
    <div className="pt-1 border-t border-line">
      <h3 className="text-[14px] font-semibold text-bright">Is there enough to learn from yet?</h3>
      <p className="text-[12px] text-ink-3 mt-0.5 mb-3">
        Prospects with the full record attached, from {data.from} onwards. Counts only.
      </p>

      <div className={`rounded-[10px] border px-3 py-2.5 mb-3 ${
        data.readiness.ok ? 'border-leaf/40 bg-leaf/10' : 'border-line bg-control-bg'
      }`}>
        <div className="flex items-start gap-2">
          <Icon name="check-circle" className="w-4 h-4 mt-0.5 shrink-0 text-ink-2" />
          <p className="text-[12.5px] text-ink">{data.readiness.why}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line mb-3">
        <table className="w-full text-[12.5px]">
          <tbody>
            {data.steps.map((s) => (
              <tr key={s.key} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5 text-ink">{s.label}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${GATE_STYLE[s.gate] || 'text-ink-2'}`}>{num(s.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 mb-3">
        {[['Prepared work that went out', data.rates.approvalToSend], ['Replies per send', data.rates.replyPerSend]].map(([label, r]) => (
          <div key={label} className="rounded-[10px] border border-line bg-control-bg px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-ink-3">{label}</div>
            <div className="text-[13px] text-ink mt-0.5 tabular-nums">{r.readable}</div>
          </div>
        ))}
      </div>

      {data.sources.length > 0 && (
        <div className="mb-3">
          <h4 className="text-[13px] font-semibold text-bright mb-1.5">Where they came from</h4>
          <ul className="space-y-0.5">
            {data.sources.map((s) => (
              <li key={s.provider} className="text-[12px] text-ink-2 flex justify-between gap-3">
                <span>{s.provider === 'UNKNOWN' ? 'Origin never recorded' : s.provider.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="tabular-nums">{num(s.n)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.needsReconciliation.length > 0 && (
        <div className="rounded-[10px] border border-poppy/40 bg-poppy/10 px-3 py-2.5 mb-3">
          <p className="text-[12.5px] font-medium text-poppy-text">
            {data.needsReconciliation.length} send{data.needsReconciliation.length === 1 ? '' : 's'} nobody could match to a message
          </p>
          <p className="text-[12px] text-ink-2 mt-0.5">
            They happened. Which Gmail message each one is could not be established without guessing, so it was not.
          </p>
        </div>
      )}

      <div className="rounded-[10px] border border-line bg-control-bg px-3 py-2.5">
        <p className="text-[12.5px] text-ink">
          Older records: {num(data.legacy.prospects)} prospects, {num(data.legacy.clients)} of them clients.
        </p>
        <p className="text-[12px] text-ink-3 mt-0.5">{data.legacy.note}</p>
      </div>
    </div>
  );
}
