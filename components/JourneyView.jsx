'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  JOURNEY_TABS, JOURNEY_TAB_KEY, openingJourneyTab,
  journeyPartition, hiddenSummary, recordingEarned,
} from '@/lib/journey-stages.mjs';
import { REGIONS, inRegion, JOURNEY_REGION_KEY } from '@/lib/regions.mjs';
import { cachedActionState } from '@/lib/prospect-state-cache.mjs';
import { videoOwed } from '@/lib/today.mjs';
import { RATING_META } from '@/lib/stage-meta.mjs';
import ProspectListRow from './ProspectListRow';
import Section from './TodaySection';
import ApprovalQueue from './ApprovalQueue';
import ClientsView from './ClientsView';
import { Icon } from './Icons';

// The journey: the app as five places, in the order Ary thinks about people.
//
// Every non-deleted prospect is in exactly one tab (lib/journey-stages.mjs
// owns the partition and a test counts it), and no tab hides a row silently:
// under the list sits the accounting line — "Not shown: 214 — 180 finished
// without a reply · 20 waiting on a date" — and every segment expands in
// place. The day this was designed Ary was looking at "3 due" with no way to
// learn where the other forty were. A count that cannot explain itself is
// the bug this view exists to end.
//
// Assembled from the pieces that already worked: ProspectListRow, Section,
// ApprovalQueue (always-mounted so its count exists before the tab is
// opened), ClientsView. The tab choice survives a refresh, not a new
// session; the region choice is persistent, because which half of the world
// you are working is a standing fact.

const TAB_TONE = {
  unprocessed: 'neutral',
  ready: 'wait',
  following: 'brand',
  warm: 'info',
  clients: 'good',
};

const TAB_ICON = {
  unprocessed: 'sparkle',
  ready: 'send',
  following: 'clock',
  warm: 'message',
  clients: 'heart',
};

const readStore = (store, key) => {
  try { return window[store].getItem(key); } catch { return null; }
};
const writeStore = (store, key, value) => {
  try { window[store].setItem(key, value); } catch {}
};

function JourneyTabs({ value, counts, onChange }) {
  return (
    <div role="tablist" aria-label="Journey" className="flex items-stretch gap-1 flex-wrap border-b border-line mb-1">
      {JOURNEY_TABS.map((t) => {
        const active = value === t.id;
        const n = counts[t.id] || 0;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active ? 'true' : 'false'}
            onClick={() => onChange(t.id)}
            style={active ? { borderColor: `var(--tone-${TAB_TONE[t.id]}-ink)`, color: `var(--tone-${TAB_TONE[t.id]}-ink)` } : undefined}
            className={`ui-body font-semibold px-3 py-2.5 -mb-px border-b-2 transition inline-flex items-center gap-2 ${
              active ? '' : 'border-transparent text-ink-2 hover:text-ink hover:border-line-strong'
            }`}
          >
            <Icon name={TAB_ICON[t.id]} className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
            {t.label}
            <span className={`ui-small num-tabular font-semibold ${active ? '' : 'text-ink-3'}`}>{n.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}

function ListGroup({ children }) {
  return <div className="border border-line r-md bg-panel overflow-hidden">{children}</div>;
}

const GROUP_CAP = 30;

// The accounting line and its expansions. Each hidden group is a button; an
// open group renders its rows right there, capped, with the remainder named.
function HiddenAccounting({ stage, onOpen }) {
  const [open, setOpen] = useState(null);
  const summary = hiddenSummary(stage);
  if (!summary) return null;
  const openGroup = stage.hidden.find((g) => g.key === open) || null;
  return (
    <div className="mt-3">
      <div className="ui-body text-ink-2 leading-relaxed">
        {`Not shown: ${summary.total.toLocaleString()} — `}
        {summary.parts.map((part, i) => (
          <span key={part.key}>
            {i > 0 ? ' · ' : ''}
            <button
              type="button"
              onClick={() => setOpen(open === part.key ? null : part.key)}
              aria-expanded={open === part.key ? 'true' : 'false'}
              className={`underline decoration-dotted underline-offset-2 transition ${
                open === part.key ? 'text-ink font-semibold' : 'hover:text-ink'
              }`}
            >
              {part.text}
            </button>
          </span>
        ))}
      </div>
      {openGroup ? (
        <div className="mt-2">
          <ListGroup>
            {openGroup.rows.slice(0, GROUP_CAP).map((p) => (
              <ProspectListRow key={p.id} prospect={p} state={cachedActionState(p)} ratingMeta={RATING_META} onOpen={onOpen} />
            ))}
          </ListGroup>
          {openGroup.count > GROUP_CAP ? (
            <p className="mt-1.5 ui-small text-ink-2">
              {`and ${(openGroup.count - GROUP_CAP).toLocaleString()} more like these`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Rows({ rows, onOpen, note }) {
  if (!rows.length) return null;
  return (
    <ListGroup>
      {rows.map((p) => (
        <ProspectListRow
          key={p.id}
          prospect={p}
          state={cachedActionState(p)}
          ratingMeta={RATING_META}
          onOpen={onOpen}
          note={note ? note(p) : null}
        />
      ))}
    </ListGroup>
  );
}

export default function JourneyView({ prospects = [], ready = false, onOpen, onNavigate }) {
  const [tab, setTab] = useState(null);
  const [region, setRegion] = useState(() => readStore('localStorage', JOURNEY_REGION_KEY) || '');
  const [context, setContext] = useState({ clientIds: new Set(), livePackageIds: new Set() });

  useEffect(() => {
    let alive = true;
    fetch('/api/journey/context')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setContext({
          clientIds: new Set(d.clientIds || []),
          livePackageIds: new Set((d.livePackages || []).map((x) => x.prospectId)),
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ready]);

  const scoped = useMemo(
    () => prospects.filter((p) => inRegion(p, region)),
    [prospects, region]
  );

  const partition = useMemo(
    () => journeyPartition(scoped, context),
    [scoped, context]
  );

  // The opening tab waits for real counts, so a remembered choice wins and a
  // fresh morning opens on whatever is actually waiting.
  useEffect(() => {
    if (tab || !ready) return;
    const remembered = readStore('sessionStorage', JOURNEY_TAB_KEY);
    setTab(openingJourneyTab(partition.counts, remembered));
  }, [ready, tab, partition.counts]);

  const chooseTab = (id) => {
    setTab(id);
    writeStore('sessionStorage', JOURNEY_TAB_KEY, id);
  };
  const chooseRegion = (id) => {
    setRegion(id);
    writeStore('localStorage', JOURNEY_REGION_KEY, id);
  };

  const active = tab || 'warm';
  const def = JOURNEY_TABS.find((t) => t.id === active) || JOURNEY_TABS[0];
  const stage = partition.stages[active] || { shown: [], hidden: [], total: 0 };

  // Region counts come from the full partition per region id only for the
  // active choice — the row of chips shows counts for the CURRENT scope's
  // whole population so the world always sums.
  return (
    <div className="w-full max-w-[880px] mx-auto grid gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="ui-small font-semibold text-ink-2 mr-0.5">Where</span>
        {REGIONS.map((r) => {
          const on = region === r.id;
          const n = prospects.reduce((acc, p) => acc + (inRegion(p, r.id) ? 1 : 0), 0);
          if (n === 0 && !on && r.id) return null;
          return (
            <button
              key={r.id || 'all'}
              type="button"
              onClick={() => chooseRegion(on ? '' : r.id)}
              aria-pressed={on ? 'true' : 'false'}
              className={`ui-small font-medium px-2.5 py-1.5 r-md border transition ${
                on ? 'btn-bloom border-transparent' : 'bg-input-bg text-ink-2 border-line hover:border-rose hover:text-ink'
              }`}
            >
              {r.label}
              <span className={`ml-1.5 num-tabular ${on ? 'opacity-80' : 'text-ink-3'}`}>{n.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <JourneyTabs value={active} counts={partition.counts} onChange={chooseTab} />

      <Section icon={TAB_ICON[active]} title={def.label} count={stage.shown.length} blurb={def.blurb}>
        {active === 'clients' ? (
          <>
            <ClientsView prospects={scoped} onOpenProspect={onOpen} />
            <HiddenAccounting stage={stage} onOpen={onOpen} />
          </>
        ) : active === 'ready' ? (
          <ReadyTab stage={stage} onOpen={onOpen} onNavigate={onNavigate} prospects={scoped} />
        ) : (
          <>
            {stage.shown.length ? (
              <Rows rows={stage.shown} onOpen={onOpen} />
            ) : (
              <p className="ui-body text-ink-2 py-1">{def.empty}</p>
            )}
            <HiddenAccounting stage={stage} onOpen={onOpen} />
          </>
        )}
      </Section>
    </div>
  );
}

// Ready is sections rather than one list: work waiting on approval, videos
// to record, recordings that never went out, and everything else staged.
function ReadyTab({ stage, onOpen, onNavigate, prospects }) {
  const toRecord = stage.shown.filter((p) => recordingEarned(p));
  const recordedUnsent = stage.shown.filter((p) => videoOwed(p));
  const staged = stage.shown.filter((p) => !recordingEarned(p) && !videoOwed(p));
  return (
    <>
      {/* Always mounted, exactly like Today did it: the queue owns its own
          fetch and its own count, and hiding it would hide the number. */}
      <div className="mb-5">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="ui-body font-semibold text-ink">Waiting for your approval</span>
        </div>
        <ApprovalQueue
          hideHeader
          previewLimit={3}
          onViewAll={(v) => onNavigate && onNavigate(v)}
          onOpen={(id) => {
            const p = (prospects || []).find((x) => x.id === id);
            if (p) onOpen(p);
          }}
        />
      </div>

      {toRecord.length ? (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="ui-body font-semibold text-ink">To record</span>
            <span className="ui-small text-ink-2 num-tabular">{toRecord.length.toLocaleString()}</span>
          </div>
          <Rows rows={toRecord} onOpen={onOpen} note={(p) => (String(p.video_tier) === 'SEND' ? 'video earned' : 'watch first, then decide')} />
        </div>
      ) : null}

      {recordedUnsent.length ? (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="ui-body font-semibold text-ink">Recorded, not sent</span>
            <span className="ui-small text-ink-2 num-tabular">{recordedUnsent.length.toLocaleString()}</span>
          </div>
          <Rows rows={recordedUnsent} onOpen={onOpen} note={() => 'a recording is waiting to go out'} />
        </div>
      ) : null}

      {staged.length ? (
        <div className="mb-5 last:mb-0">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="ui-body font-semibold text-ink">Sequences staged</span>
            <span className="ui-small text-ink-2 num-tabular">{staged.length.toLocaleString()}</span>
          </div>
          <Rows rows={staged} onOpen={onOpen} />
        </div>
      ) : null}

      <HiddenAccounting stage={stage} onOpen={onOpen} />
    </>
  );
}
