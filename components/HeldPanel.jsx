'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/toast.mjs';
import { PREVIEW, BUCKET_BY_ID, loadedLabel } from '@/lib/today-buckets.mjs';

// The businesses we cannot write to yet.
//
// The one thing this screen must never do is read like a rejection pile. A
// missing address is a prerequisite nobody has satisfied, not a verdict, and an
// address that bounced says something about an inbox rather than about the
// business. Everything already established about them is shown right next to
// the problem, so picking one back up never feels like starting again.

const WAY = {
  FORM: 'contact form',
  PHONE: 'phone',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  TWITTER: 'X',
  WHATSAPP: 'WhatsApp',
};

// The distinct routes in, named and deduplicated, capped at four.
//
// Exported because the deduplication is the point and a test can hold it: the
// list that arrives is one entry per discovered URL, and what a person needs to
// know is how many kinds of way in there are.
export function waysOf(item = {}) {
  const seen = [];
  for (const w of item.otherWays || []) {
    const label = WAY[w?.type] || String(w?.type || '').toLowerCase();
    if (label && !seen.includes(label)) seen.push(label);
  }
  return seen.slice(0, 4);
}

export default function HeldPanel({ onOpen, onViewAll = null, full = false }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');

  // A page, not the whole pile. 702 cards is not a screen, and the count in
  // the header is the real total either way.
  const load = useCallback((offset = 0, append = false) => {
    const qs = new URLSearchParams({ limit: String(full ? 25 : PREVIEW), offset: String(offset) });
    if (full && tab !== 'all') qs.set('state', tab === 'none' ? 'NONE' : 'NEEDS_CONTACT_RECOVERY');
    if (full && query.trim()) qs.set('q', query.trim());
    fetch(`/api/held?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setData((prev) => (append && prev ? { ...d, items: [...prev.items, ...d.items] } : d));
      })
      .catch(() => {});
  }, [full, tab, query]);
  useEffect(() => { load(0, false); }, [load]);

  if (!data) return null;

  const retry = async (item) => {
    setBusy(item.id);
    try {
      const r = await (await fetch('/api/contact-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: [item.id], force: true }),
      })).json();
      toast(r?.queued ? 'Looking again now.' : 'Queued to look again.', { tone: 'success' });
      setTimeout(() => load(0, false), 1200);
    } catch {
      toast('That did not go through.', { tone: 'error' });
    }
    setBusy(null);
  };

  // Filtering happens on the server in full mode, so a filter narrows the
  // whole bucket rather than only the page that happens to be loaded.
  const items = full
    ? data.items
    : data.items.filter((i) => (tab === 'all' ? true : tab === 'none' ? i.state === 'NONE' : i.state === 'NEEDS_CONTACT_RECOVERY'));

  return (
    <section className="glass-card rounded-[8px] overflow-hidden">
      <header className="px-4 py-3 border-b border-line">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* On its own page the bucket header has already said the title and
              said it is not a rejection pile. Saying both again, six lines
              lower and in slightly different words, read as two different
              screens stacked on each other. The count still has to appear
              somewhere, so in full mode that is all this shows. */}
          <div className="min-w-0">
            {full ? (
              <p className="text-[13px] text-ink-2">
                <span className="font-semibold text-ink tabular-nums">{data.total}</span> waiting on an address.
              </p>
            ) : (
              <>
                <h2 className="text-[15px] font-semibold text-ink">
                  Waiting on a way to reach them
                  {/* The real total, always. A header that counted the loaded page
                      would say 25 when the job is 702. */}
                  <span className="ml-2 text-[13px] font-normal text-ink-3 tabular-nums">{data.total}</span>
                </h2>
                <p className="mt-1 text-[13px] text-ink-2">
                  Not skipped, and not judged. We just do not have an address that works yet, so nothing
                  is being spent on them until we do.
                </p>
              </>
            )}
          </div>
          {!full && onViewAll && data.total > data.items.length && (
            <button
              onClick={() => onViewAll(BUCKET_BY_ID.held.view)}
              className="shrink-0 text-[12px] font-semibold text-rose-text hover:underline"
            >
              View all {data.total} →
            </button>
          )}
        </div>

        {full && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip active={tab === 'all'} onClick={() => setTab('all')}>all {data.total}</Chip>
              <Chip active={tab === 'none'} onClick={() => setTab('none')}>never found one {data.none}</Chip>
              <Chip active={tab === 'bounced'} onClick={() => setTab('bounced')}>stopped working {data.bounced}</Chip>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or website"
              className="mt-2 w-full max-w-sm glass-control px-3 py-2 text-[13px] bg-hover-wash"
            />
          </>
        )}
      </header>

      {!items.length ? (
        <p className="px-4 py-4 text-[13px] text-ink-2">Nothing waiting. Everyone active has a way in.</p>
      ) : (
        <ul>
          {items.map((i) => (
            <li key={i.id} className="px-4 py-3 border-b border-line last:border-b-0">
              <div className="flex items-start gap-3 flex-wrap">
                <button onClick={() => onOpen?.(i)} className="min-w-0 flex-1 text-left">
                  <span className="block font-medium text-ink truncate">
                    {i.name}
                    {i.rating ? <span className="text-ink-3 font-normal"> · you rated {i.rating}</span> : null}
                  </span>
                  {i.website ? <span className="block text-[12px] text-ink-3 truncate">{i.website}</span> : null}
                  <span className="block text-[13px] text-ink-2 mt-0.5">{i.why}</span>

                  {(i.keeps.hasFindings || i.keeps.band || i.keeps.verification) ? (
                    <span className="block text-[12px] text-ink-2 mt-1">
                      Still true about them:
                      {i.keeps.hasFindings ? ' your notes' : ''}
                      {i.keeps.siteCheckedAt ? ' · the site check' : ''}
                      {i.keeps.band ? ` · ${i.keeps.band}` : ''}
                      . None of that is lost.
                    </span>
                  ) : null}

                  {/* One chip per kind of route, not one per URL. A site with
                      a contact form linked from three pages was rendering
                      "contact form · contact form · contact form", which reads
                      as three ways in when there is one. */}
                  {waysOf(i).length ? (
                    <span className="flex flex-wrap gap-1.5 mt-1.5">
                      {waysOf(i).map((label) => (
                        <span key={label} className="text-[12px] px-2 py-0.5 rounded-[8px] border border-line text-ink-2">
                          {label}
                        </span>
                      ))}
                    </span>
                  ) : null}

                  {i.lastTried ? (
                    <span className="block text-[12px] text-ink-3 mt-1">
                      Last looked {String(i.lastTried).slice(0, 10)}
                      {i.pagesChecked != null ? `, ${i.pagesChecked} pages` : ''}
                    </span>
                  ) : null}
                </button>

                <button
                  onClick={() => retry(i)}
                  disabled={busy === i.id}
                  className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-60"
                >
                  Look again
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* The counter is about a list. With no list it printed "Nothing here."
          directly under "Nothing waiting", which is the same news twice. */}
      {full && items.length > 0 && (
        <div className="px-4 py-3 border-t border-line flex items-center gap-3 flex-wrap">
          <span className="text-[12px] text-ink-3">
            {loadedLabel({ returned: items.length, total: data.matched ?? data.total })}
          </span>
          {data.hasMore && (
            <button
              onClick={() => load(data.nextOffset, true)}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              Load 25 more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Chip({ active, onClick, children }) {
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
