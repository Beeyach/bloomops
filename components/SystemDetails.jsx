'use client';

// One closed door, and everything technical behind it.
//
// Ids, stages, action codes, package versions, fingerprints, provider message
// and thread ids, queue states, error kinds, raw timestamps. None of it is
// deleted and none of it is wrong — it is simply never the answer to the
// question somebody opened a prospect to ask.
//
// Default closed, and it stays closed until somebody chooses otherwise. This is
// the only place in the app where monospace is right, because this is the only
// place where the text really is machine output.

import { systemDetails } from '@/lib/system-details.mjs';
import { Icon } from './Icons';

export default function SystemDetails({ prospect, state = null, sends = [], packages = [], jobs = [] }) {
  const groups = systemDetails(prospect || {}, { state, sends, packages, jobs });
  if (!groups.length) return null;

  return (
    <details className="pt-4 border-t border-hairline">
      <summary className="cursor-pointer inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink-2 transition">
        <Icon name="settings" className="w-3.5 h-3.5" />
        System details
      </summary>

      <div className="mt-2 space-y-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-2">{g.title}</p>
            <dl className="mt-1 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[11.5px]">
              {g.rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-ink-3 whitespace-nowrap">{r.label}</dt>
                  <dd className="text-ink-2 font-mono break-all">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}
