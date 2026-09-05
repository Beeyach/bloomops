'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Icon } from './Icons';
import { toast } from '@/lib/toast.mjs';
import { friendlyError } from '@/lib/friendly-errors.mjs';
import { Pill } from './Semantic';
import { ICON } from '@/lib/semantic.mjs';
import { HEALTH, ago } from '@/lib/system-health.mjs';

// Is it working?
//
// Today answers "what needs me". This answers "is the machine behind Today
// still running", and until now nothing did. A quiet Today could mean
// everything is fine or it could mean nothing had run since Tuesday, and there
// was no way to tell those apart without opening the database.
//
// The whole design rests on one refusal: a pause must never look like a
// failure. Waiting for the day's budget drawn in red teaches somebody to ignore
// red, and after that the one real failure a month is invisible too. So there
// are exactly two loud states, both of them earned, and everything else is
// calm.
//
// No score, no percentage, no gauge. A number like 97/100 is invented, and it
// makes people ask what the missing three is instead of reading the sentence
// that says what is actually wrong.

// How often the page refreshes itself. Slow on purpose: this is a page somebody
// leaves open, every refresh is a handful of aggregates, and nothing here
// changes second to second.
const REFRESH_MS = 45_000;

// 498460 is a number somebody has to squint at. Grouped, it is a number they
// can read, which matters more here than anywhere: this page exists to be
// glanced at.
const num = (n) => Number(n ?? 0).toLocaleString('en-US');

const TONE = {
  [HEALTH.HEALTHY]: { color: 'var(--leaf-text)', bg: 'var(--leaf-wash, rgba(90,150,110,0.10))', icon: 'check-circle' },
  [HEALTH.IDLE]: { color: 'var(--ink-2)', bg: 'var(--control-bg, rgba(0,0,0,0.03))', icon: 'moon' },
  [HEALTH.WAITING]: { color: 'var(--ink-2)', bg: 'var(--control-bg, rgba(0,0,0,0.03))', icon: 'clock' },
  [HEALTH.ATTENTION]: { color: 'var(--gold-text)', bg: 'var(--gold-wash, rgba(200,160,60,0.12))', icon: 'alert-triangle' },
  [HEALTH.DEGRADED]: { color: 'var(--poppy-text)', bg: 'var(--poppy-wash, rgba(200,80,60,0.12))', icon: 'alert-triangle' },
};

const SERVICE_TONE = {
  OK: { label: 'Working', color: 'var(--leaf-text)', mark: '✓' },
  STALE: { label: 'Quiet', color: 'var(--gold-text)', mark: '·' },
  DOWN: { label: 'Not responding', color: 'var(--poppy-text)', mark: '✕' },
  UNKNOWN: { label: 'Not measured', color: 'var(--ink-3)', mark: '?' },
};

// Chapter 10: each area of the system is a titled group with a glyph, so the
// page reads as five places rather than one column of uppercase labels.
// `icon` and `state` are optional — a section with nothing to say about
// itself still renders exactly as it did.
// Chapter 11: System became a long operational report — every subsystem on
// one page, so answering "is it okay" meant scrolling past the whole machine.
// Four tabs, by the question each one answers:
//
//   Overview    is it okay, does anything need me, what happened today
//   Issues      what is broken, grouped and in human words
//   Automation  what can send, and what is being held
//   Usage       budget and credits
//
// `tab` on a Section says which one it belongs to. Nothing about what the
// sections contain changed — only how many are on screen at once.
// The open tab, shared with every Section without threading a prop through
// six levels of JSX. A Section declares which tab it belongs to and returns
// null when that is not the open one.
const SystemTab = createContext('overview');

export const SYSTEM_TABS = [
  { id: 'overview', label: 'Overview', icon: 'activity' },
  { id: 'issues', label: 'Issues', icon: 'alert-triangle' },
  { id: 'automation', label: 'Automation', icon: 'send' },
  { id: 'usage', label: 'Usage', icon: 'sparkle' },
];

export function SystemTabs({ value, onChange }) {
  return (
    <div role="tablist" aria-label="System" className="flex items-stretch gap-1 flex-wrap border-b border-line mb-1">
      {SYSTEM_TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active ? 'true' : 'false'}
            onClick={() => onChange(t.id)}
            className={`ui-body font-semibold px-3 py-2.5 -mb-px border-b-2 transition inline-flex items-center gap-2 ${
              active
                ? 'border-rose text-rose-text'
                : 'border-transparent text-ink-2 hover:text-ink hover:border-line-strong'
            }`}
          >
            <Icon name={t.icon} className="w-[17px] h-[17px] shrink-0" strokeWidth={2} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children, note = null, icon = null, state = null, tab = null }) {
  const open = useContext(SystemTab);
  if (tab && tab !== open) return null;
  return (
    <section className="mt-7">
      <div className="flex items-center gap-2.5 flex-wrap">
        {icon && (
          <span className="inline-flex text-ink-2" aria-hidden="true">
            <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={2} />
          </span>
        )}
        <h2 className="ui-heading font-semibold text-ink">{title}</h2>
        {state}
      </div>
      {note ? <p className="mt-1 ui-small text-ink-2 leading-relaxed">{note}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

// A count only appears when it is not zero. A grid of noughts is the fastest
// way to make a page look broken while nothing is wrong with it.
function Counts({ items }) {
  const live = items.filter((i) => Number(i.n) > 0);
  if (!live.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
      {live.map((i) => (
        <li key={i.label} className="border border-line r-md bg-hover-wash-soft px-3 py-2 min-w-[110px]">
          <span className="block font-serif ui-display text-bright tabular-nums leading-none">{num(i.n)}</span>
          <span className="block ui-small text-ink-2 mt-1">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SystemHealth({ onNavigate, tab = 'overview' }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(() => {
    fetch('/api/system-health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { setData(d); setFailed(false); setLoadedAt(Date.now()); })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // The one action on the page, and it is the app's existing per-prospect
  // retry with every guard, budget check and dedupe still in front of it.
  // There is no retry-everything, on purpose: a button that replays two
  // hundred failures is a button that spends two hundred credits by accident.
  const retry = async (item) => {
    setBusy(item.id);
    try {
      const r = await fetch('/api/jobs/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: item.prospectId }),
      });
      const j = await r.json().catch(() => ({}));
      toast(r.ok ? 'Queued to try again.' : (j.error || 'That could not be queued.'), { tone: r.ok ? 'success' : 'error' });
      setTimeout(load, 1200);
    } catch {
      toast('That could not be queued.', { tone: 'error' });
    }
    setBusy(null);
  };

  if (failed) {
    return (
      <div className="w-full max-w-[820px] mx-auto">
        <h1 className="font-serif ui-display text-bright leading-tight">System health</h1>
        <p className="mt-3 ui-body text-ink-2 border border-line-strong r-md bg-panel shadow-card p-4">
          The health check itself could not be loaded, so this page cannot tell you anything true right
          now. That is a problem with this page, not necessarily with the rest of the app.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full max-w-[820px] mx-auto">
        <h1 className="font-serif ui-display text-bright leading-tight">System health</h1>
        <p className="mt-3 ui-body text-ink-3">Checking…</p>
      </div>
    );
  }

  const { overall, queue, attention, budget, credits, work, contact, hive, services, technical } = data;
  const tone = TONE[overall.state] || TONE[HEALTH.IDLE];
  const seconds = loadedAt ? Math.round((Date.now() - loadedAt) / 1000) : null;

  return (
    <SystemTab.Provider value={tab}>
    <div className="w-full max-w-[820px] mx-auto rise-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1 className="font-serif ui-display text-bright leading-tight">System health</h1>
        <div className="flex items-center gap-2 shrink-0">
          <span className="ui-small text-ink-3">
            {seconds == null ? '' : seconds < 5 ? 'Updated just now' : `Updated ${seconds}s ago`}
          </span>
          <button
            onClick={load}
            className="ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── The answer, first ─────────────────────────────────────────── */}
      <div className="mt-4 flex items-start gap-3 border border-line-strong r-lg bg-panel shadow-card p-4">
        <span
          className="shrink-0 mt-[2px] w-8 h-8 r-md inline-flex items-center justify-center"
          style={{ backgroundColor: tone.bg, color: tone.color }}
          aria-hidden="true"
        >
          <Icon name={tone.icon} className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="ui-heading font-semibold leading-snug" style={{ color: tone.color }}>{overall.headline}</p>
          <p className="ui-body text-ink-2 leading-relaxed mt-0.5">{overall.detail}</p>
        </div>
      </div>

      {/* ── Working now, and what is waiting ──────────────────────────── */}
      <Section tab="overview" title="Right now" icon={ICON.system}>
        {queue.running === 0 && queue.queued === 0 && queue.waitingBudget === 0 && queue.waitingHuman === 0 ? (
          <p className="ui-body text-ink-2">Nothing is running and nothing is queued.</p>
        ) : (
          <Counts
            items={[
              { label: 'being worked on', n: queue.running },
              { label: 'ready to run', n: queue.readyNow ?? queue.queued },
              { label: 'waiting for a retry', n: queue.waitingRetry ?? 0 },
              { label: "waiting for today's budget", n: queue.waitingBudget },
              { label: 'waiting on you', n: queue.waitingHuman },
            ]}
          />
        )}
        {/* When the next attempt happens, said rather than left to be worked
            out from a timestamp. A job in backoff read as "queued" and was
            reported as a stuck queue; it was retrying on schedule the whole
            time. */}
        {(data.retrying || []).length > 0 ? (
          <div className="mt-3 r-md border border-line-strong p-3">
            <p className="ui-small font-semibold text-ink">
              Waiting for a retry. Nothing is wrong and nothing needs doing.
            </p>
            <ul className="mt-2 space-y-1.5">
              {(data.retrying || []).map((j) => (
                <li key={j.id} className="ui-small text-ink-2">
                  <span className="text-ink">{j.kind}</span>
                  {' — next attempt at '}
                  {new Date(j.nextAttemptAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {j.maxAttempts ? ` (attempt ${j.attempt} of ${j.maxAttempts} so far)` : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {queue.waitingBudget > 0 ? (
          <p className="mt-2 ui-small text-ink-2 leading-relaxed">
            Waiting for budget is a pause, not a rejection. Those prospects are still eligible and pick
            up again once the allowance resets.
          </p>
        ) : null}
        {queue.waitingHuman > 0 && onNavigate ? (
          <button
            onClick={() => onNavigate('today')}
            className="mt-2 ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
          >
            See them in Today
          </button>
        ) : null}
      </Section>

      {/* ── What broke ────────────────────────────────────────────────── */}
      {attention.length > 0 ? (
        <Section tab="issues"
          icon={ICON.exception}
          state={<Pill kind="exception">{`${attention.length}${data.attentionTruncated ? '+' : ''} need attention`}</Pill>}
          title="Website checks"
          note="Background work that could not finish. Nothing here sent an email or changed a prospect."
        >
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {attention.map((a) => (
              <li key={a.id} className="border border-line-strong r-md bg-panel shadow-card p-3">
                <p className="ui-body font-semibold text-ink">{a.title || 'It could not finish'}</p>
                <p className="ui-body text-ink-2 leading-relaxed mt-0.5">{a.what}</p>
                {a.who ? <p className="ui-small text-ink-3 mt-1 break-words">{a.who}</p> : null}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {a.retryable ? (
                    <button
                      onClick={() => retry(a)}
                      disabled={busy === a.id}
                      className="ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition ui-control"
                    >
                      Try again
                    </button>
                  ) : null}
                  {(a.history || []).length > 1 ? (
                    <details className="w-full">
                      {/* What it went through before it stopped. A job that
                          failed once and worked is not shown here at all; this
                          list only appears where there is more than one try to
                          explain. */}
                      <summary className="cursor-pointer ui-meta text-ink-3 hover:text-ink-2 transition">
                        {`${a.history.length} attempts`}
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {a.history.map((h) => (
                          <li key={`${h.attempt}-${h.event}`} className="ui-meta text-ink-3">
                            {`Attempt ${h.attempt} — `}
                            {h.event === 'succeeded' ? 'completed'
                              : h.event === 'retry_scheduled' ? `failed; retry scheduled for ${h.runAfter ? new Date(h.runAfter).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'later'}`
                              : h.event === 'terminal_failed' ? 'failed, no retries left'
                              : String(h.event || '').replace(/_/g, ' ')}
                            {/* This line printed the raw provider text, so
                                `page.goto: net::ERR_NAME_NOT_RESOLVED` was on
                                screen even though the card above it had
                                already been translated. The raw string is
                                still available under Technical details. */}
                            {h.error ? ` — ${friendlyError(h.error).short}` : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <details className="ml-auto">
                    <summary className="cursor-pointer ui-meta text-ink-3 hover:text-ink-2 transition">Technical details</summary>
                    <pre className="mt-1 ui-meta text-ink-3 whitespace-pre-wrap break-words max-w-full">{JSON.stringify(a.technical, null, 1)}</pre>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ── Did anything happen today ─────────────────────────────────── */}
      <Section tab="overview"
        icon="calendar-check"
        title="Today's work"
        note="Counted per prospect, so a job that ran twice on one business is one website checked."
      >
        {[work.sitesChecked, work.contactSearches, work.contactsFound, work.packagesPrepared, work.vetDecisions, work.jobsFinished].every((n) => !n) ? (
          <p className="ui-body text-ink-2">Nothing has run yet today.</p>
        ) : (
          <Counts
            items={[
              { label: 'websites checked', n: work.sitesChecked },
              { label: 'contact searches', n: work.contactSearches },
              { label: 'addresses found', n: work.contactsFound },
              { label: 'drafts prepared', n: work.packagesPrepared },
              { label: 'vet decisions', n: work.vetDecisions },
              { label: 'jobs finished', n: work.jobsFinished },
            ]}
          />
        )}
      </Section>

      {/* ── Money, in its two separate meanings ───────────────────────── */}
      <Section tab="usage" title="Budget and credits" icon="sparkle">
        <div className="border border-line-strong r-md bg-panel shadow-card p-4 space-y-2">
          <p className="ui-body text-ink">
            Today's automatic allowance:{' '}
            <span className="font-semibold tabular-nums">{num(budget.spentToday)}</span> of{' '}
            <span className="tabular-nums">{num(budget.dailyAllowance)}</span> used.{' '}
            {budget.remaining > 0
              ? `${num(budget.remaining)} left.`
              : 'It resets at midnight UTC.'}
          </p>
          {credits.balance != null ? (
            <p className="ui-body text-ink-2">
              Credit balance <span className="font-semibold text-ink tabular-nums">{num(credits.balance)}</span>
              {credits.usedToday > 0 ? <> · <span className="tabular-nums">{num(credits.usedToday)}</span> spent today</> : null}
            </p>
          ) : null}
          {/* Said rather than hidden. The prospect-detail pass measured this:
              12 of 153 credit events carry a prospect id, so any per-prospect
              figure would be wrong on nearly every record. */}
          <p className="ui-small text-ink-3 leading-relaxed">
            These are workspace totals. Spend is not reliably recorded against individual prospects, so
            no per-prospect cost is shown anywhere.
          </p>
        </div>
      </Section>

      {/* ── The contact backlog, as inventory ─────────────────────────── */}
      {(contact.waiting > 0 || contact.broken > 0 || contact.searching > 0) ? (
        <Section tab="issues"
          icon={ICON.email}
          title="Contact recovery"
          note="Waiting for a way in is pipeline inventory, not a system failure. Nobody here has been turned down."
        >
          <Counts
            items={[
              { label: 'waiting for an address', n: contact.waiting },
              { label: 'address stopped working', n: contact.broken },
              { label: 'searches running', n: contact.searching },
            ]}
          />
          {onNavigate ? (
            <button
              onClick={() => onNavigate('today/held')}
              className="mt-2 ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              Open the list
            </button>
          ) : null}
        </Section>
      ) : null}

      {/* ── Hive ──────────────────────────────────────────────────────── */}
      <Section tab="overview" title="Hive" icon={ICON.hive}>
        <p className="ui-body text-ink-2 leading-relaxed">{hive.text}</p>
      </Section>

      {/* ── Services, each with its evidence ──────────────────────────── */}
      <Section tab="overview"
        icon="settings"
        title="Background services"
        note="Each state below is backed by something that actually happened, never by a setting being present."
      >
        <ul className="border border-line-strong r-md bg-panel shadow-card divide-y divide-line list-none p-0 m-0">
          {services.map((s) => {
            const t = SERVICE_TONE[s.state] || SERVICE_TONE.UNKNOWN;
            return (
              <li key={s.label} className="px-4 py-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="ui-body font-semibold text-ink">{s.label}</span>
                  <span className="ui-small font-semibold" style={{ color: t.color }}>
                    <span aria-hidden="true">{t.mark}</span> {t.label}
                  </span>
                  <span className="ui-small text-ink-3 ml-auto">{ago(s.agoMinutes)}</span>
                </div>
                <p className="ui-small text-ink-2 leading-snug mt-0.5">{s.signal}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ── Everything internal ───────────────────────────────────────── */}
      <details className="mt-7 border border-line r-md p-4">
        <summary className="cursor-pointer ui-body font-semibold text-ink-2">Technical details</summary>
        <div className="mt-2 space-y-3">
          <div>
            <p className="ui-small font-semibold text-ink-2">Queue</p>
            <pre className="ui-meta text-ink-3 whitespace-pre-wrap break-words">{JSON.stringify(queue, null, 1)}</pre>
          </div>
          {data.byKind?.length ? (
            <div>
              <p className="ui-small font-semibold text-ink-2">By job kind</p>
              <pre className="ui-meta text-ink-3 whitespace-pre-wrap break-words">{JSON.stringify(data.byKind, null, 1)}</pre>
            </div>
          ) : null}
          <div>
            <p className="ui-small font-semibold text-ink-2">Thresholds and timestamps</p>
            <pre className="ui-meta text-ink-3 whitespace-pre-wrap break-words">{JSON.stringify(technical, null, 1)}</pre>
          </div>
        </div>
      </details>
    </div>
    </SystemTab.Provider>
  );
}
