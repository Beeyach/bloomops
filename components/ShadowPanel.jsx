'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/toast.mjs';

// Watching the follow-up automation decide, without letting it act.
//
// Automatic follow-up sending ships off. The only honest way to decide whether
// it can be trusted is to watch it choose on real packages and read the reasons
// it gives, because an unexpected block is a bug to fix rather than a rule to
// relax.
//
// So this is a viewing surface, deliberately. There is no enable button here.
// The switch lives in settings, it is off, and only Ary turns it on.

const BLOCK_LABEL = {
  'automation-off': 'The switch is off (expected while in shadow)',
  'not-approved': 'Not approved',
  'stale-approval': 'The package changed after approval',
  'copy-not-approved': 'That email was not in the package when you approved it',
  'past-allowed-length': 'Past the number of emails this prospect is allowed',
  'evidence-stale': 'The evidence is older than the limit',
  'contact-changed': 'The address changed after approval',
  'unanswered-reply': 'They replied and nothing has gone back yet',
  'unsubscribed': 'They unsubscribed',
  'declined': 'They said no',
  'client': 'They are a client',
  'do-not-contact': 'Marked do not contact',
  'active-conversation': 'A conversation is happening',
  'deferred-until': 'Parked until a later date',
  'invalid-contact': 'The address bounced',
  'terminal-stage': 'The sequence is over',
  'no-contact': 'No address on the record',
  'missing-evidence': 'No evidence behind it',
  'mailbox-unhealthy': 'The mailbox needs attention',
  'reply-state-stale': 'Replies have not been read recently enough',
  'no-send-scope': 'The mailbox cannot send',
  'outside-window': 'Outside the sending hours',
  'rate-limit': 'The daily or hourly limit is reached',
  'too-soon': 'Approved too recently',
  'already-sent': 'Already sent',
  'incomplete-prospect': 'The record is missing fields the guard reads',
};

export default function ShadowPanel() {
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    fetch('/api/send-shadow')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      const r = await (await fetch('/api/send-shadow', { method: 'POST' })).json();
      if (r.evaluated != null) {
        toast(`Checked ${r.evaluated}. ${r.wouldSend} would have gone out, ${r.wouldBlock} were held. Nothing was sent.`, { tone: 'success' });
        load();
      } else {
        toast(r.error || 'That did not run.', { tone: 'error' });
      }
    } catch {
      toast('That did not run.', { tone: 'error' });
    }
    setRunning(false);
  };

  const blocks = data?.byBlock || [];
  const shown = filter === 'all' ? blocks : blocks.filter((b) => b.block === filter);
  const total = data?.total ?? 0;

  return (
    <section className="glass-card rounded-[8px] overflow-hidden">
      <header className="px-4 py-3 border-b border-line">
        <h2 className="text-[15px] font-semibold text-ink">Follow-ups, watched</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          The app works out whether each approved follow-up would go out, then does not send it.
          This is how you decide whether to let it.
        </p>
        <p className="mt-2 inline-flex items-center gap-2 text-[12px] font-semibold text-ink px-2.5 py-1 rounded-[8px] border border-line-strong bg-hover-wash">
          Watching only. No follow-ups are being sent.
        </p>
      </header>

      <div className="px-4 py-3 flex flex-wrap items-center gap-4">
        <Stat label="checked" value={total} />
        <Stat label="would have gone" value={data?.wouldSend ?? 0} />
        <Stat label="held back" value={Math.max(0, total - (data?.wouldSend ?? 0))} />
        <Stat label="actually sent" value={0} />
        <button
          onClick={run}
          disabled={running}
          className="ml-auto text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition disabled:opacity-60"
        >
          {running ? 'Checking' : 'Check now'}
        </button>
      </div>

      {total === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-ink-2">
          Nothing checked yet. Press Check now once there are approved packages, then come back.
        </p>
      ) : (
        <>
          <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>everything</FilterChip>
            {blocks.map((b) => (
              <FilterChip key={b.block} active={filter === b.block} onClick={() => setFilter(b.block)}>
                {BLOCK_LABEL[b.block] || b.block} ({b.n})
              </FilterChip>
            ))}
          </div>

          <ul className="border-t border-line">
            {shown.map((b) => (
              <li key={b.block} className="px-4 py-2.5 border-b border-line last:border-b-0 flex items-start gap-3">
                <span className="shrink-0 text-[13px] font-semibold text-ink tabular-nums w-8">{b.n}</span>
                <span className="min-w-0 flex-1 text-[13px] text-ink">{BLOCK_LABEL[b.block] || b.block}</span>
                {b.lastAt ? <span className="shrink-0 text-[12px] text-ink-3">{String(b.lastAt).slice(0, 16)}</span> : null}
              </li>
            ))}
            {!shown.length ? <li className="px-4 py-3 text-[13px] text-ink-2">Nothing held back for that reason.</li> : null}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <span className="flex flex-col">
      <span className="text-[18px] font-semibold text-ink tabular-nums leading-none">{value}</span>
      <span className="text-[12px] text-ink-2 mt-0.5">{label}</span>
    </span>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`text-[12px] px-2.5 py-1 rounded-[8px] border transition ${
        active
          ? 'border-line-strong bg-hover-wash font-semibold text-ink'
          : 'border-line text-ink-2 hover:bg-hover-wash-soft'
      }`}
    >
      {children}
    </button>
  );
}
