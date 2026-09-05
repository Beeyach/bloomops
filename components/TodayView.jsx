'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { warmWaiting, videoOwed, CLOSED_STAGES } from '@/lib/today.mjs';
import { lastVideoView } from '@/lib/watch-url.mjs';
import { tzHour } from '@/lib/tz.mjs';
import { todaySections, isSettled } from '@/lib/today-sections.mjs';
import { TODAY_APPROVALS_LIMIT, BUCKET_BY_ID } from '@/lib/today-buckets.mjs';
import { TODAY_TABS, TAB_BUCKETS, TAB_PILES, TODAY_TAB_KEY, openingTodayTab, todaySummary, isTodayClear, isTodayTab } from '@/lib/today-tabs.mjs';
import { TODAY_TAB_KIND, kindOf, ICON } from '@/lib/semantic.mjs';
import { Tile, Pill, Meta } from './Semantic';
import { VIEW } from '@/lib/prospect-action.mjs';
import { RATING_META } from '@/lib/stage-meta.mjs';
import OnboardingChecklist from './OnboardingChecklist';
import ExceptionQueue from './ExceptionQueue';
import ApprovalQueue from './ApprovalQueue';
import Followups from './Followups';
import NeedsAttention from './NeedsAttention';
import ProspectListRow from './ProspectListRow';
import DeferralResolver from './DeferralResolver';
import { Icon, IconTile } from './Icons';
import Section from './TodaySection';

function greetingWord() {
  const h = tzHour(); // Pacific hour, so the greeting matches the workspace clock
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function readName() {
  try { return localStorage.getItem('ltb_name') || ''; } catch (e) { return ''; }
}

// A bordered group that holds a run of rows. One box, many lines — 262
// individually-bordered cards stacked down a page is a wall of boxes, not a
// list.
function ListGroup({ children }) {
  // Inside a Section card since Chapter 8, so it carries a light edge rather
  // than a second heavy border and a second shadow around the first one.
  return <div className="border border-line r-md bg-panel overflow-hidden">{children}</div>;
}

// No edge at all: rows divide themselves, and the panel is the container.
function BareGroup({ children }) {
  return <div className="-mx-1">{children}</div>;
}


// A sub-list inside a section: its own small label, its own cap, its own way
// through to the full list.
function Block({ label, count, hidden, onViewAll, viewAllLabel, children, bare = false }) {
  if (!count) return null;
  // `bare` drops the second border. Chapter 11: the panel around these
  // already IS a card, so a bordered group inside it was a box in a box —
  // rows now sit on one surface with dividers between them.
  const Group = bare ? BareGroup : ListGroup;
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="ui-body font-semibold text-ink">{label}</span>
        <span className="ui-small text-ink-2 num-tabular">{count.toLocaleString()}</span>
      </div>
      <Group>{children}</Group>
      {hidden > 0 && onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 ui-small font-medium text-ink-2 underline decoration-dotted underline-offset-2 hover:text-rose-text transition"
        >
          {viewAllLabel || `View all ${count.toLocaleString()}`}
        </button>
      ) : null}
    </div>
  );
}

// The tabs read their icon from the shared vocabulary rather than keeping a
// second list of their own, so a tab and the rows inside it cannot disagree
// about what a reply looks like.
const TAB_ICON = Object.fromEntries(
  Object.entries(TODAY_TAB_KIND).map(([tab, kind]) => [tab, kindOf(kind).icon])
);

// Today's tab strip. Counts are subtle on purpose: they say how much is
// there, they are not five badges competing to be read first.
function TodayTabs({ value, counts, onChange, pending = false }) {
  return (
    <div role="tablist" aria-label="Today" className="flex items-stretch gap-1 flex-wrap border-b border-line mb-1">
      {TODAY_TABS.map((t) => {
        const active = value === t.id;
        const n = counts[t.id] || 0;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active ? 'true' : 'false'}
            onClick={() => onChange(t.id)}
            // The open tab is underlined in its OWN family's colour, so the
            // strip says which kind of work you are looking at before the
            // panel below has rendered a word of it.
            style={active ? { borderColor: `var(--tone-${kindOf(TODAY_TAB_KIND[t.id]).tone}-ink)`,
                              color: `var(--tone-${kindOf(TODAY_TAB_KIND[t.id]).tone}-ink)` } : undefined}
            className={`ui-body font-semibold px-3 py-2.5 -mb-px border-b-2 transition inline-flex items-center gap-2 ${
              active ? '' : 'border-transparent text-ink-2 hover:text-ink hover:border-line-strong'
            }`}
          >
            <Icon name={TAB_ICON[t.id]} className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
            {t.label}
            {/* "…" while the counts are unresolved. A zero that is really
                "still counting" is the flash Ary caught on a fresh load. */}
            <span className={`ui-small num-tabular font-semibold ${active ? '' : 'text-ink-3'}`}>
              {pending ? '…' : n.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const smallBtn = 'ui-small font-semibold px-2.5 py-1 r-md btn-bloom transition';
const quietBtn = 'ui-small font-medium px-2.5 py-1 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition';

// The app's opening screen. Four questions, in the order they matter:
// who needs me, what is waiting for my approval, what is due, and what is
// merely untidy.
//
// What used to be here and is not any more: the cadence groups (Overdue / Due
// today / Coming up, grouped by next_action_date), which said "Email 5" about
// six hundred people who were waiting for nothing; and the 4,700-row
// "Needs a date" footer, which is the untouched import pile and belongs in
// Prospects. Neither was work. Both were the first thing on the page.
export default function TodayView({ prospects, dueFn, daysSinceFn, pastDueFn, onOpen, onNavigate, onNudged, onSnooze, onChanged, ready = true }) {
  // Ids the server's exception queue has already claimed. It knows about
  // replies and stuck jobs the browser cannot see, and it outranks everything
  // below: somebody who wrote back must never also appear in a cadence pile
  // telling Ary the sweep has them covered.
  const [handled, setHandled] = useState(() => new Set());
  const [exceptionCount, setExceptionCount] = useState(0);
  const claim = useCallback((ids, total) => {
    setHandled(new Set(ids));
    setExceptionCount(Number(total) || ids.length);
  }, []);

  // Per-bucket totals from the same fetch the queue already makes, and the
  // approval total from the same payload the cards come from. Both exist so a
  // tab can be labelled without rendering its contents.
  //
  // totalsState is the difference between "zero" and "not counted yet".
  // Today used to render Replies 0 for the seconds the queue fetch took,
  // which is a lie with a celebration attached: the all-clear card fired on
  // an empty first render. Nothing below claims a number until this settles.
  const [bucketTotals, setBucketTotals] = useState({});
  const [totalsState, setTotalsState] = useState('pending'); // pending | loaded | error
  const [approvalCount, setApprovalCount] = useState(0);
  const onTotals = useCallback((t) => {
    setBucketTotals(t || {});
    setTotalsState(t ? 'loaded' : 'error');
  }, []);
  const onApprovalCount = useCallback((n) => setApprovalCount(n), []);

  const HOT_VIEW_DAYS = 3;
  const hotViewers = useMemo(() => (prospects || [])
    .map((p) => ({ prospect: p, view: lastVideoView(p.activity_log) }))
    .filter(({ prospect, view }) => {
      if (!view) return false;
      if (handled.has(prospect.id)) return false;
      if (CLOSED_STAGES.has(prospect.stage)) return false;
      const ageDays = (Date.now() - Date.parse(view.ts)) / 86400000;
      if (!Number.isFinite(ageDays) || ageDays > HOT_VIEW_DAYS) return false;
      const lastContact = String(prospect.last_contact_date || '');
      return !lastContact || lastContact < view.ts.slice(0, 10);
    })
    .sort((a, b) => String(b.view.ts).localeCompare(String(a.view.ts))), [prospects, handled]);

  // Everything the router places, minus whoever the server already claimed.
  const claimedByServer = useMemo(
    () => new Set([...handled, ...hotViewers.map(({ prospect }) => prospect.id)]),
    [handled, hotViewers]
  );
  const sections = useMemo(
    () => todaySections(prospects || [], { skip: claimedByServer }),
    [prospects, claimedByServer]
  );

  // Everything the router has now placed somewhere. The older warm list runs
  // after this and is filtered against it, so nobody is listed twice under two
  // different descriptions of the same situation — which is what Today did
  // before, three times over, and every count on the page was inflated by it.
  const placed = useMemo(() => {
    const s = new Set(claimedByServer);
    for (const { prospect } of sections.needsYou.rows) s.add(prospect.id);
    for (const { prospect } of sections.followups.due.rows) s.add(prospect.id);
    for (const { prospect } of sections.followups.upcoming.rows) s.add(prospect.id);
    return s;
  }, [claimedByServer, sections]);

  // The older human worklist: warm leads gone quiet, a setup to check, a
  // proposal with no answer. Kept because the router speaks about the cold
  // sequence and these are not in one — but only for people nothing else has
  // already placed.
  //
  // Filtered twice on purpose: once against everything already drawn above,
  // and once against the relationship. warmWaiting reasons from "they replied
  // and have gone quiet", which is true of a deferral three weeks out and of
  // somebody who said no to this offer in July. Neither is waiting on Ary.
  const warm = useMemo(() => (daysSinceFn
    ? warmWaiting(prospects, { daysSince: daysSinceFn, pastDue: pastDueFn, dueFn })
    : []
  ).filter(({ prospect }) => !placed.has(prospect.id) && !isSettled(prospect)),
  [prospects, daysSinceFn, pastDueFn, dueFn, placed]);

  // Recorded videos that have not gone out. Small, and genuinely only Ary's
  // job, so it sits with the rest of her work rather than in a group of its own
  // halfway down the page.
  const videoReady = useMemo(() => (prospects || []).filter(
    (p) => videoOwed(p) && !placed.has(p.id) && !isSettled(p)
      && !warm.some(({ prospect }) => prospect.id === p.id)
  ), [prospects, placed, warm]);

  // Work mode: walk the Needs-you pile one prospect at a time. The id list is
  // snapshotted at Start so acting on somebody never yanks the deck out from
  // under the walk.
  const [work, setWork] = useState(null); // null | { ids: number[], at: number }
  const walkable = useMemo(
    () => [...sections.needsYou.rows.map(({ prospect }) => prospect), ...warm.map(({ prospect }) => prospect)],
    [sections, warm]
  );

  const [name, setName] = useState('');
  useEffect(() => { setName(readName()); }, []);

  const toProspects = (tab, actionFilter = null) =>
    () => onNavigate && onNavigate('prospects', { tab, actionFilter });

  // What each tab holds. Every number is counted from the same source the
  // panel below renders from, so a tab label and its contents cannot disagree.
  //
  // The exception pile is its own tab rather than part of the headline number:
  // "160 addresses to find" is a project, not a morning.
  // Every pile, by the name lib/today-tabs.mjs uses for it. The counts and
  // the panels below both read this, so a tab's number and its contents are
  // the same list counted twice rather than two lists that might disagree.
  // The queue reports totals keyed by the BUCKET value ('needs-reply'), not
  // by the definition id ('replies'). Reading them by id returned undefined
  // for every bucket — Chapter 9 hid it behind a fallback to the overall
  // exception count, and Chapter 11's stricter counting exposed it as a tab
  // reading "Replies 0" above four visible rows. BUCKET_BY_ID is the bridge.
  const bucket = (id) => Number(bucketTotals[BUCKET_BY_ID[id]?.bucket] || 0);
  const pile = {
    needsYou: sections.needsYou.total,
    hotViewers: hotViewers.length,
    warm: warm.length,
    videoReady: videoReady.length,
    due: sections.followups.due.total,
    upcoming: sections.followups.upcoming.total,
    attention: sections.attention.total,
  };
  const countTab = (tab) =>
    (TAB_BUCKETS[tab] || []).reduce((n, b) => n + bucket(b), 0)
    + (TAB_PILES[tab] || []).reduce((n, k) => n + (pile[k] || 0), 0);
  const counts = {
    replies: countTab('replies'),
    approvals: countTab('approvals') + approvalCount,
    followups: countTab('followups'),
    decisions: countTab('decisions'),
    exceptions: countTab('exceptions'),
  };
  // Loading, loaded-and-empty, and loaded-with-work are three different
  // mornings. `resolved` is loading's end: the prospect store is in and the
  // queue fetch has answered (or failed, which is its own honest state).
  const resolved = Boolean(ready) && totalsState !== 'pending';
  const queueFailed = totalsState === 'error';
  const clear = resolved && !queueFailed && isTodayClear(counts);
  // One number. The five live on the tabs.
  const total = Object.values(counts).reduce((n, v) => n + (v || 0), 0);
  const oneLine = `${total.toLocaleString()} ${total === 1 ? 'thing' : 'things'} waiting on you.`;

  // Which tab is open. A deliberate choice is remembered for this session
  // only — the list you want is the one you want right now, and tomorrow
  // morning should open on whatever is actually waiting.
  const [chosen, setChosen] = useState(null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(TODAY_TAB_KEY);
      if (isTodayTab(saved)) setChosen(saved);
    } catch (e) {}
  }, []);
  const chooseTab = useCallback((id) => {
    setChosen(id);
    try { sessionStorage.setItem(TODAY_TAB_KEY, id); } catch (e) {}
  }, []);
  const tab = openingTodayTab(counts, chosen);
  const tabDef = TODAY_TABS.find((t) => t.id === tab) || TODAY_TABS[0];

  return (
    <div className="w-full max-w-[860px] mx-auto rise-in">
    <div className="min-w-0 w-full">
      <h1 className="font-serif ui-display text-bright leading-tight">
        {greetingWord()}{name ? `, ${name}` : ''}
      </h1>
      {/* One line, and only about the tabs that have something in them. The
          paragraph this replaces re-explained "nothing sends on its own" at
          the top of a page that says it again inside Follow-ups. */}
      {/* The tab strip below carries every one of these numbers, each with
          its own icon — and in a different order, so printing them again as
          a sentence made the eye re-sort five figures it had already read.
          One total, or nothing. */}
      <p className="ui-body text-ink-2 mb-5">
        {!resolved ? 'Adding up what needs you…' : clear ? 'Nothing is waiting on you.' : oneLine}
      </p>

      <OnboardingChecklist
        onNavigate={onNavigate}
        prospectCount={prospects.length}
        established={prospects.length > 25}
      />

      {/* The all-clear card and the workspace are siblings, not branches of a
          ternary. They have to be: the exception queue and the approval queue
          are what COUNT the work, so putting them inside a "there is work"
          branch means an empty first render decides there is none, unmounts
          the things that would have said otherwise, and Today stays clear
          for ever. So both queues mount unconditionally below, and `clear`
          only decides what is visible. */}
      {clear ? (
        <div className="border border-line-strong r-lg bg-panel shadow-card p-10 text-center mt-2 rise-in">
          <div className="flex justify-center mb-3">
            <IconTile name="sprout" tone="leaf" size={44} />
          </div>
          <p className="text-bright font-semibold ui-heading">You&apos;re clear for today.</p>
          <p className="ui-body text-ink-2 mt-1 mb-4">Enjoy it.</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => onNavigate && onNavigate('inbox')}
              className="ui-body font-semibold px-4 py-2 r-md btn-bloom transition"
            >
              Hunt new leads
            </button>
            <button
              onClick={() => onNavigate && onNavigate('prospects')}
              className="ui-body font-medium px-4 py-2 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              Open the list
            </button>
          </div>
        </div>
      ) : null}

      <div className={clear ? 'hidden' : ''} aria-hidden={clear ? 'true' : undefined}>
          <TodayTabs value={tab} counts={counts} onChange={chooseTab} pending={!resolved} />
          {queueFailed && (
            <p className="ui-small text-ink-2 mt-2">
              Part of today&apos;s queue did not load.{' '}
              <button onClick={() => window.location.reload()} className="underline decoration-dotted hover:text-rose-text transition">Refresh to retry</button>
            </p>
          )}

          {/* No title, no count: the tab immediately above is already both,
              and the panel was saying each a third time. The blurb stays —
              it is the one thing the tab has no room for. */}
          <Section blurb={tabDef.blurb}>
            {/* Three quiet placeholder rows while unresolved; the tab's empty
                sentence only once the numbers are real. */}
            {!resolved && (
              <div className="space-y-2 py-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[52px] r-md bg-hover-wash-soft animate-pulse" />
                ))}
              </div>
            )}
            {resolved && counts[tab] === 0 ? (
              <p className="ui-body text-ink-2">{tabDef.empty}</p>
            ) : null}

            {/* One instance, always mounted whatever tab is open: it owns the
                exception fetch, and its per-bucket totals are what label the
                tabs. Unmounting it would take the labels with it. `only`
                narrows what it draws to the buckets this tab owns; an empty
                list draws nothing and still reports. */}
            <ExceptionQueue
              only={TAB_BUCKETS[tab] || []}
              tabKind={TODAY_TAB_KIND[tab]}
              onClaim={claim}
              onTotals={onTotals}
              onChanged={onChanged}
              onViewAll={(v) => onNavigate && onNavigate(v)}
              onOpen={(id) => {
                const p = (prospects || []).find((x) => x.id === id);
                if (p) onOpen(p);
              }}
            />

            {/* Owned by TAB_PILES, not by the tab name.
                The one-source-of-truth pass took `needsYou` out of
                TAB_PILES.replies, which fixed the COUNT — and this block went
                on rendering sixteen rows underneath the one real reply,
                because it only ever checked which tab was open. So Replies
                said 1 and listed 17, and clicking one of the sixteen opened
                the wrong thing.
                Reading the map means the invariant is enforced by the render
                rather than merely declared next to it. */}
            {tab === 'replies' && TAB_PILES.replies.includes('needsYou') && (
              <>
                <Block
                  label="Waiting on your reply"
                  count={sections.needsYou.total}
                  hidden={sections.needsYou.hidden}
                  onViewAll={toProspects(VIEW.REPLIED)}
                  viewAllLabel={`View all ${sections.needsYou.total.toLocaleString()} in Replied`}
                  bare
                >
                  {sections.needsYou.rows.map(({ prospect, state }) => {
                    // An open wait with no date is the one row that carries
                    // something underneath it. The pair shares one divider,
                    // and the attachment is indented to the row's text column,
                    // so it reads as part of THIS person rather than as a
                    // loose band floating between two of them.
                    const openWait = state.relationship?.state === 'DEFERRED'
                      && !state.relationship?.deferredUntil;
                    return (
                      <div key={prospect.id} className={openWait ? 'border-b border-hairline last:border-b-0' : ''}>
                        <ProspectListRow
                          prospect={prospect}
                          state={state}
                          kind="reply"
                          tabKind="reply"
                          ratingMeta={RATING_META}
                          onOpen={onOpen}
                          divider={!openWait}
                        />
                        {openWait && (
                          // Indented to the row's own text column, written as
                          // the sum of the row's parts rather than a magic
                          // number: px-4 + the 30px tile + gap-3. An arbitrary
                          // Tailwind class here did not survive the build, and
                          // the block sat under the tile instead.
                          <div
                            className="pr-4 pb-3"
                            style={{ paddingLeft: 'calc(1rem + 30px + 0.75rem)' }}
                          >
                            <DeferralResolver
                              prospectId={prospect.id}
                              onReply={() => onOpen(prospect)}
                              onResolved={() => onChanged && onChanged()}
                              compact
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Block>

                {walkable.length > 1 && (
                  <button
                    onClick={() => setWork({ ids: walkable.map((p) => p.id), at: 0 })}
                    title="Work through these one at a time, big buttons, no wall of rows"
                    className="ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition"
                  >
                    Work through them one at a time
                  </button>
                )}
              </>
            )}

            {/* ── Follow-ups: everything that earns a nudge. Gone quiet and
                   watched-your-video moved here from Replies, because
                   neither of them is an answer. ─────────────────────────── */}
            {tab === 'followups' && (
              <>
                <Block label="Watched your video" count={hotViewers.length} bare>
                  {hotViewers.map(({ prospect, view }) => {
                    const ageDays = Math.floor((Date.now() - Date.parse(view.ts)) / 86400000);
                    return (
                      <ProspectListRow
                        key={prospect.id}
                        prospect={prospect}
                        state={{ label: 'They opened your audit video', context: view.text, tone: 'high' }}
                        kind="watched"
                        tabKind="followup"
                        waitingDays={ageDays}
                        ratingMeta={RATING_META}
                        onOpen={onOpen}
                        actions={
                          <>
                            <button onClick={() => onNudged && onNudged(prospect)} title="I wrote to them: stamps last contact, counts the touch, logs it" className={smallBtn}>Nudged</button>
                            <button onClick={() => onSnooze && onSnooze(prospect)} title="Not now: come back to this one in 7 days" className={quietBtn}>Snooze 7d</button>
                          </>
                        }
                      />
                    );
                  })}
                </Block>

                <Block label="Gone quiet" count={warm.length} bare>
                  {warm.slice(0, 6).map(({ prospect, waiting }) => (
                    <ProspectListRow
                      key={prospect.id}
                      prospect={prospect}
                      state={{ label: 'Needs a nudge from you', context: null, tone: 'action' }}
                      kind="waiting"
                      tabKind="followup"
                      waitingDays={waiting}
                      ratingMeta={RATING_META}
                      onOpen={onOpen}
                      actions={
                        <>
                          <button onClick={() => onNudged && onNudged(prospect)} title="I reached out today: stamps last contact, counts the touch, logs it" className={smallBtn}>Nudged</button>
                          <button onClick={() => onSnooze && onSnooze(prospect)} title="Not now: come back to this one in 7 days" className={quietBtn}>Snooze 7d</button>
                        </>
                      }
                    />
                  ))}
                </Block>

                <Followups
                  bare
                  due={sections.followups.due}
                  upcoming={sections.followups.upcoming}
                  upcomingCountOnly
                  ratingMeta={RATING_META}
                  onOpen={onOpen}
                  onViewAll={toProspects(VIEW.IN_OUTREACH)}
                />
              </>
            )}

            {/* ── Approvals also owns a recorded video that has not gone out:
                   it is work to read and send, not a reply. ─────────────── */}
            {tab === 'approvals' && (
              <Block label="Video recorded, not sent" count={videoReady.length} bare>
                {videoReady.slice(0, 6).map((p) => (
                  <ProspectListRow
                    key={p.id}
                    prospect={p}
                    state={{ label: 'A video is recorded and waiting', context: null, tone: 'action' }}
                    kind="video"
                    tabKind="approval"
                    ratingMeta={RATING_META}
                    onOpen={onOpen}
                  />
                ))}
              </Block>
            )}

            {/* Approvals stays mounted so its count keeps the tab labelled;
                only its visibility follows the tab. Three cards at most, so
                this costs a preview render, not a page. */}
            <div className={tab === 'approvals' ? '' : 'hidden'} aria-hidden={tab === 'approvals' ? undefined : 'true'}>
              <ApprovalQueue
                hideHeader
                previewLimit={TODAY_APPROVALS_LIMIT}
                onCount={onApprovalCount}
                onViewAll={(v) => onNavigate && onNavigate(v)}
                onOpen={(id) => {
                  const p = (prospects || []).find((x) => x.id === id);
                  if (p) onOpen(p);
                }}
              />
            </div>

            {tab === 'exceptions' && (
              <NeedsAttention
                bare
                kinds={sections.attention.kinds}
                total={sections.attention.total}
                onNavigate={onNavigate}
              />
            )}
          </Section>
      </div>
    </div>

    {work && (
      <WorkMode
        work={work}
        setWork={setWork}
        prospects={prospects}
        daysSinceFn={daysSinceFn}
        onNudged={onNudged}
        onSnooze={onSnooze}
        onOpen={onOpen}
      />
    )}
    </div>
  );
}

// ── Work mode ──────────────────────────────────────────────────────────
// One prospect at a time, full screen. The pile stays hidden; each card
// shows who is waiting, how long, and three big honest choices. Keyboard:
// N nudged, S snooze, arrows move, Esc leaves.
function WorkMode({ work, setWork, prospects, daysSinceFn, onNudged, onSnooze, onOpen }) {
  const { ids, at } = work;
  const done = at >= ids.length;
  const prospect = done ? null : prospects.find((p) => p.id === ids[at]);
  const advance = () => setWork((w) => (w ? { ...w, at: w.at + 1 } : w));
  const back = () => setWork((w) => (w ? { ...w, at: Math.max(0, w.at - 1) } : w));
  const close = () => setWork(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      const t = e.target;
      if (t && t.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); advance(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); back(); return; }
      if (!prospect) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { onNudged && onNudged(prospect); advance(); }
      else if (k === 's') { onSnooze && onSnooze(prospect); advance(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect?.id, at]);

  const days = prospect && daysSinceFn ? daysSinceFn(prospect) : null;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10, 5, 12, 0.82)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[560px] bg-panel border border-line-strong shadow-card r-lg p-7 relative">
        <button
          onClick={close}
          aria-label="Leave work mode"
          className="absolute right-4 top-4 w-8 h-8 r-md text-ink-2 hover:text-ink hover:bg-hover-wash-soft transition inline-flex items-center justify-center"
        >
          <Icon name="x" className="w-4 h-4" />
        </button>

        {done ? (
          <div className="text-center py-8">
            <span className="inline-flex w-12 h-12 r-lg items-center justify-center mb-4" style={{ background: 'rgba(107, 199, 154, 0.16)', color: 'var(--leaf-text)' }}>
              <Icon name="check-circle" className="w-6 h-6" />
            </span>
            <p className="font-serif ui-display text-bright mb-1">That's everyone.</p>
            <p className="ui-body text-ink-2 mb-6">The pile is clear. Nothing else needs you right now.</p>
            <button onClick={close} className="px-5 py-2.5 ui-body font-semibold r-md btn-bloom transition">
              Back to Today
            </button>
          </div>
        ) : !prospect ? (
          <div className="text-center py-8">
            <p className="ui-body text-ink-2 mb-4">This one left the list already.</p>
            <button onClick={advance} className="px-4 py-2 ui-body font-semibold r-md btn-bloom transition">Next</button>
          </div>
        ) : (
          <>
            <div className="ui-small font-semibold text-ink-2 mb-5">
              {at + 1} of {ids.length}
            </div>
            <h2 className="font-serif ui-display text-bright leading-tight mb-1">
              {prospect.business_name || prospect.name || prospect.email || 'Unnamed'}
            </h2>
            {prospect.name && prospect.name !== prospect.business_name && (
              <p className="ui-body text-ink-2">{prospect.name}</p>
            )}
            <p className="ui-body font-semibold text-gold-text mt-2 mb-4">
              {days == null ? 'Never contacted' : days === 0 ? 'Contacted today' : days === 1 ? 'Waiting 1 day' : `Waiting ${days} days`}
              {prospect.reply_type ? ` · replied: ${prospect.reply_type}` : ''}
            </p>
            {(prospect.info || '').trim() && (
              <p className="ui-body text-ink-2 leading-relaxed border-l-2 border-line-strong pl-3 mb-5 max-h-28 overflow-y-auto slim-scroll whitespace-pre-wrap">
                {String(prospect.info).slice(0, 400)}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <button
                onClick={() => { onNudged && onNudged(prospect); advance(); }}
                title="I reached out today: stamps last contact, counts the touch"
                className="py-3 ui-body font-semibold r-lg btn-bloom transition"
              >
                Nudged
              </button>
              <button
                onClick={() => { onSnooze && onSnooze(prospect); advance(); }}
                title="Not now: come back in 7 days"
                className="py-3 ui-body font-semibold r-lg border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                Snooze 7d
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => { close(); onOpen && onOpen(prospect); }}
                className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                Open profile
              </button>
              <span className="flex items-center gap-2">
                <button onClick={back} disabled={at === 0} className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition ui-control">
                  Back
                </button>
                <button onClick={advance} className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition">
                  Skip
                </button>
              </span>
            </div>
            <p className="ui-meta text-ink-3 mt-4">Keys: N nudged · S snooze · arrows move · Esc leave</p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
