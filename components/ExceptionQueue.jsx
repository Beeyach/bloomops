'use client';

import { useEffect, useState, useCallback } from 'react';
import { Icon } from './Icons';
import { toast } from '@/lib/toast.mjs';
import ProspectListRow from './ProspectListRow';
import { failureCard } from '@/lib/friendly-errors.mjs';
import { waitingLabel } from '@/lib/row-identity.mjs';
import { TODAY_TAB_KIND } from '@/lib/semantic.mjs';

// Which of the shared concepts each exception bucket is. Deferrals are a
// decision (somebody asked for later and later arrived); held and legacy are
// exceptions; blocked is the only one that is a genuine failure.
const BUCKET_KIND = {
  replies: 'reply',
  decisions: 'decision',
  deferrals: 'decision',
  blocked: 'failed',
  held: 'exception',
  legacy: 'draft',
};
import DeferralResolver from './DeferralResolver';
import { RATING_META } from '@/lib/stage-meta.mjs';
import { BUCKETS, BUCKET_BY_ID, PREVIEW, sectionView, shouldRender, viewAllLabel } from '@/lib/today-buckets.mjs';

// The top of Today, as a dashboard.
//
// It used to render everything, which meant that with a few hundred prospects
// in play "Ready for approval" ended up a long way down, and an empty section
// rendered as nothing at all. "There is none" and "you have not scrolled far
// enough" looked identical, which is the worst possible ambiguity on a page
// whose job is telling somebody what to do today.
//
// So: every section shows its real total and the first few rows, the sections
// Ary acts on render even at zero, and the full list lives on its own page.
//
// This component serves both. `only` renders one bucket in full; without it,
// Today gets previews.

const ICON = {
  replies: 'message',
  approvals: 'check-circle',
  decisions: 'alert-triangle',
  deferrals: 'clock',
  blocked: 'refresh-cw',
  held: 'search',
  legacy: 'archive',
};

const TONE = {
  replies: 'text-poppy-text',
  approvals: 'text-mauve-deep',
  decisions: 'text-rose-text',
  deferrals: 'text-ink-2',
  blocked: 'text-ink-2',
  held: 'text-ink-2',
  legacy: 'text-ink-3',
};

// The collapsed disclosure for a raw error.
//
// Monospace lives here and nowhere else on Today: it is the one place the text
// really is machine output, and setting the rest of a card in it is what made
// this page read like a console.
function TechnicalDetails({ raw, open, onToggle }) {
  if (!raw) return null;
  return (
    <div className="px-4 pb-2">
      <button
        onClick={onToggle}
        aria-expanded={Boolean(open)}
        className="ui-small text-ink-3 underline decoration-dotted hover:text-ink-2 transition"
      >
        System details
      </button>
      {open && (
        <pre className="mt-1.5 ui-meta text-ink-2 bg-hover-wash-soft border border-line r-md p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-[200px]">
          {raw}
        </pre>
      )}
    </div>
  );
}

// `only` is a bucket id, or a list of them. Chapter 9's Today tabs each own
// a slice of this queue — Replies is one bucket, Decisions is two, Exceptions
// is three — so a single id was no longer enough. With `only` set, the big
// per-bucket chrome is suppressed; with more than one id, each bucket keeps a
// compact label so two lists are not silently concatenated.
export default function ExceptionQueue({ onOpen, onClaim, onViewAll, onChanged, onTotals, only = null, tabKind = null, pageSize = 25 }) {
  const [data, setData] = useState(null);
  const [openDraft, setOpenDraft] = useState(null);
  const [openTech, setOpenTech] = useState(null);
  const [busy, setBusy] = useState(null);
  const [shown, setShown] = useState(pageSize);

  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    fetch('/api/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) { setFailed(false); setData(d); }
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  // A failed queue fetch is a fact Today needs, not a silence: without this
  // the tabs sat on zero for ever and read as an empty morning.
  useEffect(() => {
    if (failed && !data && onTotals) onTotals(null);
  }, [failed, data, onTotals]);

  // Told upward so the client-computed piles below can skip these rows, and so
  // the headline counts the same work the cards show.
  useEffect(() => {
    if (data?.rows && onClaim) onClaim(data.rows.map((r) => r.id), data.total ?? data.rows.length);
  }, [data, onClaim]);

  // Per-bucket totals, so Today can label a tab without rendering its
  // contents. The server already sends them; nothing extra is fetched.
  useEffect(() => {
    if (data?.totals && onTotals) onTotals(data.totals);
  }, [data, onTotals]);

  if (!data) return null;
  const gmail = data.gmail || {};
  const gmailBroken = gmail.status === 'needs-reconnect' || gmail.status === 'error';

  const ago = (iso) => {
    const h = (Date.now() - Date.parse(iso)) / 3600000;
    if (!Number.isFinite(h)) return 'a while ago';
    if (h < 1) { const m = Math.max(1, Math.round(h * 60)); return `${m} minute${m === 1 ? '' : 's'} ago`; }
    if (h < 24) { const n = Math.round(h); return `${n} hour${n === 1 ? '' : 's'} ago`; }
    const d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  };

  const reconnect = async () => {
    try {
      const r = await (await fetch('/api/gmail/connect')).json();
      if (r.url) { window.location.href = r.url; return; }
      toast(r.error || 'Gmail is not set up on this deployment yet.', { tone: 'error' });
    } catch {
      toast('Could not start the Gmail connection.', { tone: 'error' });
    }
  };

  const copy = async (row) => {
    try {
      await navigator.clipboard.writeText(row.draft || '');
      toast('Draft copied', { tone: 'success' });
    } catch {
      toast('Your browser blocked the copy. Select the text and copy it by hand.', { tone: 'error' });
    }
  };

  const legacyAct = async (row, action) => {
    setBusy(row.id);
    try {
      const res = await fetch('/api/legacy-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: row.id, action }),
      });
      const r = await res.json().catch(() => ({}));
      if (r.ok) {
        toast(
          action === 'dismiss'
            ? 'Put aside. Nothing else about them changed.'
            : r.already
              ? 'There is already new outreach waiting for them.'
              : 'Redoing it now. It will show up under Ready for approval.',
          { tone: 'success' }
        );
        setData((d) => ({ ...d, rows: d.rows.filter((x) => x.id !== row.id) }));
      } else {
        toast(r.reason || 'That did not go through.', { tone: 'error' });
      }
    } catch {
      toast('That did not go through.', { tone: 'error' });
    }
    setBusy(null);
  };

  // The whole pre-V2 pile, off the list in one go.
  //
  // Only ever dismiss. There is no bulk redo, because redoing outreach for a
  // hundred people nobody re-read is exactly the thing the single-row buttons
  // exist to prevent.
  const dismissAllLegacy = async (count) => {
    if (!window.confirm(
      `Put ${count} old ${count === 1 ? 'draft' : 'drafts'} aside?\n\n`
      + 'They come off today\'s list and nothing else changes. The draft text, '
      + 'the stage and the rating all stay, and nothing is sent.'
    )) return;
    setBusy('legacy-all');
    try {
      const res = await fetch('/api/legacy-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss-all' }),
      });
      const r = await res.json().catch(() => ({}));
      if (r.ok) {
        toast(
          `${r.dismissed} old ${r.dismissed === 1 ? 'draft' : 'drafts'} put aside. Nothing was sent.`,
          { tone: 'success' }
        );
        load();
        onChanged && onChanged();
      } else {
        toast(r.error || 'That did not go through.', { tone: 'error' });
      }
    } catch {
      toast('That did not go through.', { tone: 'error' });
    }
    setBusy(null);
  };

  // Run the check again. The existing queue path, never a parallel one.
  const retry = async (row) => {
    setBusy(row.id);
    try {
      const res = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: row.id }),
      });
      const r = await res.json().catch(() => ({}));
      toast(r.ok ? 'Queued to try again.' : (r.error || 'That did not go through.'), { tone: r.ok ? 'success' : 'error' });
      if (r.ok) setData((d) => ({ ...d, rows: d.rows.filter((x) => x.id !== row.id) }));
    } catch {
      toast('That did not go through.', { tone: 'error' });
    }
    setBusy(null);
  };

  const onlyIds = only ? (Array.isArray(only) ? only : [only]) : null;
  const defs = onlyIds
    ? onlyIds.map((id) => BUCKET_BY_ID[id]).filter(Boolean)
    : BUCKETS.filter((b) => b.bucket);
  // More than one bucket in one panel: each keeps a small label of its own.
  const subLabels = !!onlyIds && onlyIds.length > 1;
  const sections = defs
    .filter((b) => b.bucket)
    .map((b) => sectionView(b, {
      items: data.rows.filter((r) => r.bucket === b.bucket),
      total: data.totals?.[b.bucket],
      limit: onlyIds ? shown : PREVIEW,
    }));

  const Row = ({ def, r }) => {
    const isLegacy = def.id === 'legacy';
    const isBlocked = def.id === 'blocked';
    // Translated for display. The raw text is kept and shown on request; it is
    // never the headline, because a stack trace is not a status.
    const fail = isBlocked ? failureCard(r) : null;

    // The same row shape as every other list in the app: business, then
    // person and place, then what is happening, then the quiet line. The
    // friendly failure title lands where the action goes, and the raw error
    // stays behind the disclosure below.
    // When the detail IS the person's own words, it leaves `context` and
    // becomes the row's quote instead. Same string, different weight: context
    // is styled to recede, and what they said is the point of the row.
    const saidIt = !fail && !isLegacy && r.quote && r.detail;
    const state = {
      label: fail ? fail.title : (isLegacy ? 'An old draft is waiting' : r.headline),
      context: fail
        ? fail.detail
        : (isLegacy && r.at ? `Written ${ago(r.at)}` : (saidIt ? null : r.detail)),
      tone: def.id === 'replies' ? 'high' : 'action',
    };

    return (
      <div className="border-b border-line last:border-b-0">
        <ProspectListRow
          prospect={r}
          state={state}
          // The wrapper above already draws the divider. The row drawing its
          // own put a line between a person and the resolver attached to
          // them, so the attachment read as the next person's.
          divider={false}
          ratingMeta={RATING_META}
          // Chapter 10: the bucket decides the icon and the colour, so a
          // row in Replies is blue with a message glyph and a row in
          // Exceptions is amber with an alert, without either component
          // choosing for itself. "Waiting 12 days" became a clock and "12d".
          kind={BUCKET_KIND[def.id] || null}
          quote={saidIt ? r.detail : null}
          tabKind={tabKind}
          waitingDays={isLegacy ? null : r.waitingDays}
          noteClass="text-mauve-deep font-medium"
          onOpen={() => onOpen && onOpen(r.id)}
          actions={
            <>
              {isLegacy && (
                <>
                  <button
                    onClick={() => legacyAct(r, 'regenerate')}
                    disabled={busy === r.id}
                    className="ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition ui-control"
                  >
                    Redo it
                  </button>
                  <button
                    onClick={() => legacyAct(r, 'dismiss')}
                    disabled={busy === r.id}
                    className="ui-small font-medium px-2.5 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition ui-control"
                  >
                    Put aside
                  </button>
                </>
              )}
              {fail?.canRetry && (
                <button
                  onClick={() => retry(r)}
                  disabled={busy === r.id}
                  className="ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition ui-control"
                >
                  Try again
                </button>
              )}
              {r.draft && (
                <button
                  onClick={() => setOpenDraft(openDraft === r.id ? null : r.id)}
                  className="ui-small font-medium px-2.5 py-1.5 r-md border border-line text-ink-2 hover:bg-hover-wash-soft transition"
                >
                  {openDraft === r.id ? 'Hide' : 'Read it'}
                </button>
              )}
            </>
          }
        />

        {/* They asked for later and nobody wrote down when. Resolvable here,
            because the card somebody is looking at is the right place to fix
            the reason it will not go away. */}
        {r.datelessDeferral && (
          // Indented to the row's own text column — written as the sum of the
          // row's parts (px-4 + the 30px tile + gap-3) rather than a magic
          // number. It sat under the tile, left of everything it belonged to.
          <div className="pr-4 pb-3" style={{ paddingLeft: 'calc(1rem + 30px + 0.75rem)' }}>
            <DeferralResolver
              prospectId={r.id}
              onReply={() => onOpen && onOpen(r.id)}
              onResolved={() => { load(); onChanged && onChanged(); }}
              compact
            />
          </div>
        )}

        {fail?.hasTechnical && (
          <TechnicalDetails
            raw={fail.technical}
            open={openTech === r.id}
            onToggle={() => setOpenTech(openTech === r.id ? null : r.id)}
          />
        )}

        {r.draft && openDraft === r.id && (
          <div className="px-4 pb-3">
            <div className="ui-body text-ink whitespace-pre-wrap bg-hover-wash-soft border border-line r-md p-3 max-h-[300px] overflow-auto">
              {r.draft}
            </div>
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={() => copy(r)}
                className="ui-small font-medium px-2.5 py-1 r-md border border-line text-ink-2 hover:bg-hover-wash-soft transition"
              >
                Copy the old way
              </button>
              {r.email && (
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(r.email)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-small font-medium px-2.5 py-1 r-md border border-line text-ink-2 hover:bg-hover-wash-soft transition"
                >
                  Open Gmail
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className={onlyIds ? '' : 'mt-6'} aria-label="Needs a decision">
      {!onlyIds && gmailBroken && (
        <div className="border border-poppy-border bg-poppy-wash r-lg p-4 mb-4">
          <p className="font-semibold text-poppy-text">Gmail sync needs reconnecting</p>
          <p className="ui-body text-ink-2 mt-0.5">
            Replies are not being picked up, so a follow-up could go out on top of one.
            {gmail.lastSyncAt ? ` Last read ${ago(gmail.lastSyncAt)}.` : ''}
          </p>
          {gmail.lastError && <p className="ui-small text-ink-2 mt-1">{gmail.lastError}</p>}
          <button
            onClick={reconnect}
            className="mt-2 ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition"
          >
            Reconnect Gmail
          </button>
        </div>
      )}

      {sections
        .filter(shouldRender)
        // Inside a Today tab, an empty bucket draws nothing at all. The tab
        // has already said "Nothing here right now"; a second empty-state
        // paragraph under a sub-label reading "Needs your decision 0" is the
        // same news three times. On its own page the empty states stay,
        // because there a missing section reads as a missing feature.
        .filter((s) => !(onlyIds && s.isEmpty))
        .map((s) => {
        const def = BUCKET_BY_ID[s.id];
        return (
          <div key={s.id} className={onlyIds ? 'mt-4 first:mt-0' : 'mt-6'}>
            {subLabels && (
              <div className="flex items-baseline gap-2 mb-2">
                <span className="ui-body font-semibold text-ink">{s.title}</span>
                <span className="ui-small text-ink-2 num-tabular">{s.total}</span>
              </div>
            )}
            {!onlyIds && (
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div className="min-w-0">
                  <div className={`flex items-center gap-1.5 ui-body font-semibold ${TONE[s.id] || 'text-ink-2'}`}>
                    <Icon name={ICON[s.id] || 'circle'} className="w-3.5 h-3.5" />
                    {s.title}
                    <span className="text-ink-3 font-normal tabular-nums">{s.total}</span>
                  </div>
                  <p className="ui-small text-ink-2 mt-0.5">{s.blurb}</p>
                </div>
                {viewAllLabel(s) && onViewAll && (
                  <button
                    onClick={() => onViewAll(def.view)}
                    className="shrink-0 ui-small font-semibold text-rose-text hover:underline"
                  >
                    {viewAllLabel(s)} →
                  </button>
                )}
              </div>
            )}

            {s.isEmpty ? (
              <p className="ui-body text-ink-3 border border-line r-lg bg-panel px-4 py-3">
                {s.emptyText}
              </p>
            ) : (
              <>
                {/* One tap for a pile that is stale by construction. Every card
                    here predates Strategy V2 and the only honest verdict on all
                    of them is the same one, so offering it once beats offering
                    it a hundred times. */}
                {s.id === 'legacy' && s.total > 1 && (
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                    <p className="ui-small text-ink-2">
                      All of these were written before the new outreach flow.
                    </p>
                    <button
                      onClick={() => dismissAllLegacy(s.total)}
                      disabled={busy === 'legacy-all'}
                      aria-busy={busy === 'legacy-all' || undefined}
                      className="shrink-0 ui-small font-semibold px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition ui-control"
                    >
                      {busy === 'legacy-all' ? 'Putting them aside…' : `Put all ${s.total} aside`}
                    </button>
                  </div>
                )}
                <div className="border border-line-strong r-lg bg-panel shadow-card overflow-hidden">
                  {s.preview.map((r) => <Row key={r.id} def={def} r={r} />)}
                </div>
                {onlyIds && s.hasMore && (
                  <button
                    onClick={() => setShown((n) => n + pageSize)}
                    className="mt-3 ui-body font-semibold px-4 py-2 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
                  >
                    Load {Math.min(pageSize, s.remaining)} more
                  </button>
                )}
                {onlyIds && (
                  <p className="mt-2 ui-small text-ink-3">
                    Showing {s.shown} of {s.total}.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      {!only && data.unmatchedReplies?.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-1.5 ui-body font-semibold text-ink-2 mb-2">
            <Icon name="help-circle" className="w-3.5 h-3.5" />
            Replies we could not match ({data.unmatchedReplies.length})
          </div>
          <div className="border border-line r-lg bg-panel overflow-hidden">
            {data.unmatchedReplies.map((u, i) => (
              <div key={i} className="px-4 py-2.5 border-b border-line last:border-b-0">
                <p className="ui-body text-ink truncate">{u.from_address}</p>
                <p className="ui-small text-ink-2 truncate">{u.subject || 'no subject'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
