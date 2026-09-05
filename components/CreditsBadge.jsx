'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';

// The balance, wherever it matters. One number, in the app's own currency,
// with the price list a click away so a number has meaning attached to it.
// Admins can top any workspace back up from here.

let CACHE = null;
const listeners = new Set();

export async function refreshCredits() {
  try {
    const d = await fetch('/api/credits').then((r) => r.json());
    CACHE = d;
    listeners.forEach((fn) => fn(d));
    return d;
  } catch {
    return CACHE;
  }
}

export default function CreditsBadge({ compact = false }) {
  const [data, setData] = useState(CACHE);
  const [open, setOpen] = useState(false);
  const [topUp, setTopUp] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const fn = (d) => setData(d);
    listeners.add(fn);
    // Show whatever is cached straight away so the number does not flash, then
    // always ask. The cache lives for the life of the page, so without this a
    // badge mounted after a scan or a render showed a balance from before it,
    // and the only way to correct it was a reload.
    if (CACHE) setData(CACHE);
    refreshCredits();
    return () => listeners.delete(fn);
  }, []);

  // Opening the panel is the moment somebody is actually reading the number.
  useEffect(() => { if (open) refreshCredits(); }, [open]);

  if (!data) return null;

  const low = data.balance <= 25;

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/credits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: target.trim() || undefined, balance: Number(topUp) || 0 }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setMsg(`${d.workspace} now has ${d.balance.toLocaleString()} credits.`);
      setTopUp('');
      await refreshCredits();
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Credits left in this workspace. Click for what things cost."
        className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-1.5 rounded-[8px] border transition ${
          low
            ? 'border-rose bg-rose-tint text-rose-text'
            : 'border-line-strong text-ink hover:border-rose hover:text-rose-text'
        }`}
      >
        <Icon name="sparkle" className="w-3.5 h-3.5" />
        {data.balance.toLocaleString()}
        {!compact && <span className="font-medium text-ink-3">credits</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-[300px] glass-panel !bg-panel p-3 space-y-2.5">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Credits left</span>
            <span className="block text-[22px] font-semibold text-bright leading-tight">{data.balance.toLocaleString()}</span>
            {data.spentAllTime > 0 && (
              <span className="block text-[12px] text-ink-3">{data.spentAllTime.toLocaleString()} used so far.</span>
            )}
          </div>

          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-1">What things cost</span>
            <ul className="space-y-1">
              {(data.prices || []).map((p) => (
                <li key={p.label} className="flex gap-2 text-[12.5px] leading-snug">
                  <span className="text-ink-2 flex-1 min-w-0">{p.label}</span>
                  <span className="text-ink font-semibold shrink-0 num-tabular">{p.price}</span>
                </li>
              ))}
            </ul>
          </div>

          {data.isAdmin && (
            <div className="pt-2 border-t border-line space-y-1.5">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Top up</span>
              <div className="flex gap-1.5">
                <input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="this workspace"
                  className="w-[110px] bg-input-bg border border-line rounded-[8px] px-2 py-1.5 text-[12.5px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
                />
                <input
                  type="number"
                  min="0"
                  value={topUp}
                  onChange={(e) => setTopUp(e.target.value)}
                  placeholder="new balance"
                  className="flex-1 min-w-0 bg-input-bg border border-line rounded-[8px] px-2 py-1.5 text-[12.5px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
                />
                <button
                  onClick={save}
                  disabled={saving || topUp === ''}
                  className="text-[12px] font-semibold px-2.5 rounded-[8px] btn-bloom transition disabled:opacity-50"
                >
                  Set
                </button>
              </div>
              <p className="text-[11.5px] text-ink-3 leading-snug">
                Sets the balance outright, it does not add. Leave the first box empty for this workspace.
              </p>
              {msg && (
                <p className={`text-[12px] ${msg.startsWith('Failed') ? 'text-poppy-text' : 'text-leaf-text'}`}>{msg}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
