'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from './Icons';

// What the product costs to run, next to what it charges.
//
// Operational, not analytical. Two numbers decide whether anything is wrong:
// what came in, and what went out where we actually know what it cost. The
// third number is the one most dashboards leave out, and it is the reason this
// exists: how much of the spend has no measurement behind it at all.
//
// Nothing here holds a price. Every figure arrives from the credit catalog via
// the API, because a display constant is a second copy of a price and the
// first thing to go stale.

const PERIODS = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']];

const usd = (n) => (n == null ? null : `$${Number(n).toFixed(n < 1 ? 4 : 2)}`);
const num = (n) => Number(n || 0).toLocaleString();

function Figure({ label, value, hint, tone = 'plain' }) {
  const colour =
    tone === 'good' ? 'text-leaf-text'
      : tone === 'warn' ? 'text-poppy-text'
        : 'text-bright';
  return (
    <div className="rounded-[10px] border border-line bg-control-bg px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`text-[19px] leading-tight font-serif ${colour} tabular-nums`}>{value}</div>
      {hint && <div className="text-[11.5px] text-ink-3 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function EconomicsCard() {
  const [period, setPeriod] = useState('7d');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState('');
  const [prospect, setProspect] = useState(null);

  const load = useCallback(async (p) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/economics?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not load the numbers.');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  async function loadProspect() {
    const id = Number(String(lookup).trim());
    if (!Number.isInteger(id) || id <= 0) { setError('Enter a prospect id.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/economics?prospect=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Not found.');
      setProspect(json);
    } catch (e) {
      setError(e.message);
      setProspect(null);
    } finally {
      setBusy(false);
    }
  }

  const t = data?.totals;

  return (
    <div className="pt-1 border-t border-line">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-bright">What this costs to run</h3>
          <p className="text-[12px] text-ink-3 mt-0.5">
            Vendor spend against credits charged. Anything not measured is listed rather than counted as free.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODS.map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg border transition ${
                period === key
                  ? 'border-rose bg-rose-tint text-rose-text'
                  : 'border-line bg-control-bg text-ink-2 hover:text-ink'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-[12.5px] text-poppy-text mb-3">{error}</p>
      )}

      {t && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-3">
            <Figure label="Credits used" value={num(t.credits)}
              hint={t.refundedCredits ? `${num(t.refundedCredits)} refunded` : 'No refunds'} />
            <Figure label="Implied revenue" value={usd(t.revenueUsd)} hint="Credits at their set value" />
            <Figure label="Measured cost" value={usd(t.knownCostUsd)}
              hint={`${num(t.calls)} AI calls${t.failures ? `, ${t.failures} failed` : ''}`} />
            <Figure
              label="Known margin"
              value={usd(t.knownMarginUsd)}
              tone={t.knownMarginUsd < 0 ? 'warn' : 'good'}
              hint={data.complete ? 'Everything in this period is costed' : 'Excludes the gaps below'}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 mb-3">
            <Figure label="Spent by the automation" value={num(t.autoCredits)} hint="Without anyone clicking" />
            <Figure label="Approved, not sent" value={num(data.approvedNotSent)}
              tone={data.approvedNotSent > 0 ? 'warn' : 'plain'}
              hint={data.approvedNotSent ? 'Work paid for that has not gone out' : 'Nothing sitting'} />
          </div>

          {!data.complete && (
            <div className="rounded-[10px] border border-poppy/40 bg-poppy/10 px-3 py-2.5 mb-3">
              <div className="flex items-start gap-2">
                <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 shrink-0 text-poppy-text" />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-poppy-text">
                    Real spend with no number against it
                  </p>
                  <ul className="mt-1 space-y-1">
                    {data.unmeasured.map((u) => (
                      <li key={u.action} className="text-[12px] text-ink-2">
                        <span className="font-medium text-ink">{u.label}</span>
                        {u.operations ? ` — ${num(u.operations)} run` : ''}
                        {u.gap ? `. ${u.gap}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-ink-3 border-b border-line">
                  <th className="font-medium px-3 py-2">Action</th>
                  <th className="font-medium px-3 py-2 text-right tabular-nums">Credits</th>
                  <th className="font-medium px-3 py-2 text-right tabular-nums">Charged</th>
                  <th className="font-medium px-3 py-2 text-right tabular-nums">Cost</th>
                  <th className="font-medium px-3 py-2 text-right tabular-nums">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-3 text-ink-3">Nothing spent in this period.</td></tr>
                )}
                {data.rows.map((r) => (
                  <tr key={r.action} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink">
                      {r.label}
                      {r.freeByDesign && <span className="ml-1.5 text-[11px] text-ink-3">free on purpose</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">{num(r.netCredits)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">{usd(r.revenueUsd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">
                      {r.costUsd === null ? <span className="text-poppy-text">not measured</span> : usd(r.costUsd)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.marginUsd != null && r.marginUsd < 0 ? 'text-poppy-text' : 'text-ink-2'}`}>
                      {r.marginUsd === null ? '—' : usd(r.marginUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-3 pt-3 border-t border-line">
        <h4 className="text-[13px] font-semibold text-bright mb-1.5">What one prospect cost</h4>
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="econ-prospect" className="text-[12.5px] text-ink-2">Prospect id</label>
          <input id="econ-prospect" value={lookup} onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') loadProspect(); }}
            inputMode="numeric" placeholder="1134"
            className="w-[110px] rounded-lg border border-line bg-control-bg px-2.5 py-1.5 text-[13px] text-ink" />
          <button onClick={loadProspect} disabled={busy}
            className="text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-rose bg-rose-tint text-rose-text disabled:opacity-60">
            Look it up
          </button>
        </div>

        {prospect?.prospect && (
          <div className="mt-2.5 rounded-[10px] border border-line bg-control-bg px-3 py-2.5">
            <p className="text-[13px] text-bright font-medium">
              {prospect.prospect.name || `#${prospect.prospect.prospectId}`}
              <span className="text-ink-3 font-normal"> · {prospect.prospect.stage || 'New'}</span>
            </p>
            <p className="text-[12px] text-ink-2 mt-0.5">
              {prospect.prospect.outcome.playbook ? `${prospect.prospect.outcome.playbook}. ` : ''}
              {prospect.prospect.outcome.sends
                ? `${prospect.prospect.outcome.sends} sent.`
                : prospect.prospect.outcome.approvedAt ? 'Approved, not sent.' : 'Never sent.'}
              {prospect.prospect.outcome.replied ? ` Replied ${prospect.prospect.outcome.replyType || ''}.` : ''}
              {prospect.prospect.outcome.firstClientAt ? ' Became a client.' : ''}
            </p>
            <ul className="mt-2 space-y-0.5">
              {prospect.prospect.rows.map((r) => (
                <li key={r.action} className="text-[12px] text-ink-2 flex justify-between gap-3">
                  <span>{r.label}{r.ops > 1 ? ` ×${r.ops}` : ''}</span>
                  <span className="tabular-nums">
                    {num(r.credits)} credits{r.costKnown ? ` · ${usd(r.costUsd)}` : ''}
                  </span>
                </li>
              ))}
              {prospect.prospect.rows.length === 0 && (
                <li className="text-[12px] text-ink-3">Nothing was charged against this one.</li>
              )}
            </ul>
            <p className="text-[12px] text-ink mt-2 tabular-nums">
              {num(prospect.prospect.credits)} credits, {usd(prospect.prospect.knownCostUsd)} measured cost.
            </p>
            {!prospect.prospect.complete && (
              <p className="text-[11.5px] text-poppy-text mt-1">
                Not the whole bill: {prospect.prospect.unmeasured.join(', ')} has no measured cost yet.
              </p>
            )}
            <p className="text-[11.5px] text-ink-3 mt-1">{prospect.aiCostNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
