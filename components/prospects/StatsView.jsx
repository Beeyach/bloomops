'use client';

// The Stats tab: live analytics over the canonical prospect list, plus the
// funnel targets + daily log section. Extracted verbatim from
// ProspectsApp.jsx (split step 6).

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import Hint from '../Hint';
import StageIcon from './StageIcon';
import { computeStats } from '../../lib/prospect-stats.mjs';
import { REPLY_TYPE_META, STAGE_META } from '../../lib/stage-meta.mjs';
import { groupStages } from '../../lib/stage-groups.mjs';
import { toast } from '../../lib/toast.mjs';
import { todayIso } from '../../lib/due.mjs';

/* ----- Stats view ----- */

// Live analytics over the canonical prospect list. Pure derivation via
// useMemo — recomputes instantly whenever a stage changes, no refetch.
export default function StatsView({ prospects, stages, onShowMissingCountry, onShowWarm, onShowDueAuto, onShowStage }) {
  // Opens the prospects table filtered to a single stage, but only when there
  // are rows to show — a card reading 0 shouldn't pretend to be a link.
  const stageJump = (stage, count) => (count > 0 && onShowStage ? () => onShowStage(stage) : undefined);
  const s = useMemo(() => computeStats(prospects), [prospects]);
  const maxStage = Math.max(1, ...stages.map((st) => s.byStage[st] || 0));
  const maxReplyEmail = Math.max(1, ...Object.values(s.repliesByEmail));

  // Funnel targets + daily outreach log (adopted from Ellen's tracker).
  // Fetched here so the whole Stats tab stays one self-contained view.
  const [targets, setTargets] = useState(null);
  const [logEntries, setLogEntries] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/targets')
      .then((r) => r.json())
      // {} = loaded-but-unset, so the card can tell "still loading" (null)
      // from "no targets yet" and show a skeleton instead of flashing copy.
      .then((d) => { if (alive) setTargets(d && d.targets ? d.targets : {}); })
      .catch(() => { if (alive) setTargets({}); });
    fetch('/api/daily-log?days=60')
      .then((r) => r.json())
      .then((d) => { if (alive && d && Array.isArray(d.entries)) setLogEntries(d.entries); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div className="canvas-data space-y-4">
      <div>
        <h1 className="font-serif text-[34px] text-bright leading-tight mb-1">Stats</h1>
        <p className="text-ink-2 text-[13px] mb-2">
          How the pipeline is actually doing, counted off your real rows.
        </p>
      </div>
      <Hint id="stats-view">
        Every number here is clickable when it isn't zero — it opens the exact list it
        counts. The two that matter daily: <b>Due today (auto)</b> sends itself,
        <b> Needs you</b> waits for you.
      </Hint>
      <TargetsSection
        targets={targets}
        onSaved={setTargets}
        entries={logEntries || []}
        prospects={prospects}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total prospects" value={s.total} icon="flower" tone="rose" />
        <StatCard label="Reached out" value={s.reachedOut} sub={`${s.newCount} not contacted yet`} icon="send" tone="rose" />
        <StatCard label="Responded" value={s.responded} sub={`${s.responseRate}% response rate`} accent icon="message" tone="leaf" />
        <StatCard
          label="Clients"
          value={s.clients}
          icon="heart"
          tone="leaf"
          sub={`${s.conversionRate}% conversion${s.paymentAwaiting ? ` · ${s.paymentAwaiting} awaiting pay` : ''}`}
          onClick={stageJump('Client', s.clients)}
          accent
        />
      </div>

      {/* Action row. The numbers I work off, not vanity. Five columns
          because it holds five cards — at four, the last one wrapped into a
          lonely row of one. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Due today (auto)"
          value={s.dueAuto}
          icon="send"
          tone="rose"
          sub="sends automatically, no action needed"
          onClick={s.dueAuto > 0 ? onShowDueAuto : undefined}
          accent
        />
        <StatCard
          label="Needs you"
          value={s.warmWaiting}
          icon="user"
          tone="gold"
          sub={s.warmWaiting > 0 ? 'warm / snoozed / setup — oldest first' : 'nothing waiting on you'}
          onClick={s.warmWaiting > 0 ? onShowWarm : undefined}
          warn={s.warmWaiting > 0}
        />
        <StatCard
          label="Missing country"
          value={s.missingCountry}
          icon="globe"
          tone="gold"
          sub={s.missingCountry > 0 ? 'click to see them' : 'all set'}
          onClick={s.missingCountry > 0 ? onShowMissingCountry : undefined}
          warn={s.missingCountry > 0}
        />
        <StatCard label="Snoozed" value={s.snoozed} sub={`${s.snoozedDueThisWeek} due this week`} onClick={stageJump('Snoozed', s.snoozed)} icon="moon" tone="gold" />
        <StatCard
          icon="mail-open"
          label="Avg emails before reply"
          value={s.avgEmailsBeforeReply ?? '—'}
          sub={s.repliedCount > 0 ? `over ${s.repliedCount} replies` : 'no replies logged'}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Interested" value={s.interested} onClick={stageJump('Interested', s.interested)} small icon="heart" tone="rose" />
        {/* Counts the call_booked field (set from the drawer), not the
            long-removed 'Booked' stage, which pinned this card at 0 forever. */}
        <StatCard label="Booked calls" value={s.callsBooked} small icon="calendar-check" tone="leaf" />
        <StatCard label="Rejected" value={s.rejected} onClick={stageJump('Rejected', s.rejected)} small icon="ban" tone="poppy" />
        <StatCard label="Lost" value={s.lost} onClick={stageJump('Lost', s.lost)} small icon="x-circle" tone="poppy" />
        <StatCard label="Invalid email" value={s.byStage['Invalid Email'] || 0} onClick={stageJump('Invalid Email', s.byStage['Invalid Email'] || 0)} small icon="mail-x" tone="poppy" />
      </div>

      {/* The 50/50 audit-video test, read from VIDTEST:A/B info markers. Arm A
          got the video, arm B a plain follow-up. Both arms are tagged over the
          same window, so unlike the old all-time chart they're comparable. The
          card refuses to name a winner until both arms clear the floor. */}
      <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <div className="text-[13px] font-semibold text-ink-2">Audit video A/B test</div>
          <div className="text-[11px] text-muted">50/50 test, Email 3, started Aug 5</div>
        </div>
        {s.vidtest.A.count === 0 && s.vidtest.B.count === 0 ? (
          <p className="text-sm text-muted italic mt-2">
            No prospects tagged yet. Tag each test prospect with a <code>VIDTEST:A</code> (got the
            video) or <code>VIDTEST:B</code> (plain) line in their info to start the count.
          </p>
        ) : (
          <>
            <div className="space-y-2.5 mt-2">
              {[
                { key: 'A', label: 'A · video', arm: s.vidtest.A, color: 'bg-mauve-deep' },
                { key: 'B', label: 'B · plain', arm: s.vidtest.B, color: 'bg-mauve' },
              ].map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-charcoal">{row.label}</span>
                  <div className="flex-1 h-3.5 rounded bg-paper overflow-hidden">
                    <div
                      className={`h-full rounded-r ${row.color}`}
                      style={{ width: `${Math.min(100, row.arm.rate)}%` }}
                    />
                  </div>
                  <span className="w-28 text-right num-tabular text-xs text-charcoal">
                    {row.arm.count > 0 ? `${row.arm.rate}%` : '—'}
                    <span className="text-muted"> · {row.arm.replied}/{row.arm.count}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-muted leading-relaxed">
              {s.vidtest.readable
                ? `Both arms have ${s.vidtest.min}+ prospects, so the gap is worth reading. Trust a big gap, not a small one.`
                : `Too early to read — both arms need ${s.vidtest.min}+ (A has ${s.vidtest.A.count}, B has ${s.vidtest.B.count}). Below that, any difference is luck.`}
            </p>
          </>
        )}
      </div>

      {/* Reply outcomes + which touch earns replies. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
          <div className="font-serif text-[17px] text-bright mb-3">
            Reply outcomes
          </div>
          {s.repliedCount === 0 ? (
            <p className="text-sm text-muted italic">No replies logged yet.</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {['interested', 'defer', 'decline'].map((t) => {
                const m = REPLY_TYPE_META[t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="font-serif num-tabular text-2xl text-charcoal">{s.replyByType[t]}</span>
                    <span className="text-[12px] font-medium text-ink-2">{m.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
          <div className="font-serif text-[17px] text-bright mb-3">
            Replies by email #
          </div>
          <div className="space-y-1.5">
            {[1, 2, 3, 4, 5].map((n) => {
              const count = s.repliesByEmail[n] || 0;
              return (
                <div key={n} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs text-charcoal">Email {n}</span>
                  <div className="flex-1 h-3.5 rounded bg-paper overflow-hidden">
                    <div
                      className="h-full rounded-r bg-mauve"
                      style={{ width: `${(count / maxReplyEmail) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right num-tabular text-xs text-charcoal">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Which send day earns replies. The column this reads (a lead's
            last_contact_date) only remembers the LAST send, so it's
            directional — said out loud below, and rates hide until a day
            has enough sends to mean anything. */}
        <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
          <div className="font-serif text-[17px] text-bright mb-3">
            Replies by send day
          </div>
          <div className="space-y-1.5">
            {(() => {
              const DAY_MIN = 30;
              const rates = s.byWeekday.map((d) => (d.sent >= DAY_MIN ? d.replies / d.sent : null));
              const best = Math.max(...rates.filter((r) => r != null), 0);
              return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => {
                const d = s.byWeekday[i];
                const rate = rates[i];
                const isBest = rate != null && rate === best && best > 0;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`w-14 shrink-0 text-xs ${isBest ? 'font-semibold text-leaf-text' : 'text-charcoal'}`}>{label}</span>
                    <div className="flex-1 h-3.5 rounded bg-paper overflow-hidden">
                      <div
                        className={`h-full rounded-r ${isBest ? 'bg-leaf' : 'bg-mauve'}`}
                        style={{ width: rate != null ? `${Math.min(100, rate * 100 * 4)}%` : '0%' }}
                      />
                    </div>
                    <span className="w-20 text-right num-tabular text-[11px] text-charcoal">
                      {rate != null
                        ? `${Math.round(rate * 1000) / 10}%`
                        : d.sent > 0 ? '—' : ''}
                      <span className="text-muted"> · {d.replies}/{d.sent}</span>
                    </span>
                  </div>
                );
              });
            })()}
          </div>
          <p className="mt-3 text-[12px] text-muted leading-relaxed">
            By each lead's last send day, so it's directional rather than exact.
            Days under 30 sends show counts only — a rate there is luck, not signal.
          </p>
        </div>
      </div>

      <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
        <div className="font-serif text-[17px] text-bright mb-4">
          Breakdown by stage
        </div>
        <div className="space-y-3">
          {/* Same four buckets as the filter, each with its own subtotal, so
              the shape of the pipeline reads at a glance. */}
          {groupStages(stages).map((group) => {
            const groupTotal = group.stages.reduce((n, st) => n + (s.byStage[st] || 0), 0);
            return (
              <div key={group.key}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{group.label}</span>
                  <span className="num-tabular text-[11px] text-muted">{groupTotal}</span>
                </div>
                <div className="space-y-1.5">
                  {group.stages.map((st) => {
                    const count = s.byStage[st] || 0;
                    const meta = STAGE_META[st] || {};
                    const share = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
                    return (
                      <div key={st} className="flex items-center gap-3">
                        <span
                          className="w-36 shrink-0 flex items-center gap-1.5 text-xs"
                          style={{ color: meta.faded ? 'var(--ink-2)' : 'var(--ink)' }}
                        >
                          <span style={{ color: meta.border }}>
                            <StageIcon stage={st} className="w-3.5 h-3.5" />
                          </span>
                          <span className="truncate">{st}</span>
                        </span>
                        <div className="flex-1 h-4 rounded bg-paper overflow-hidden">
                          {/* Solid stage-color fill. The old translucent fill
                              with a 2px end-cap read as a stray ")" glyph at
                              the tip of every bar. */}
                          <div
                            className="h-full rounded-r"
                            style={{
                              width: `${(count / maxStage) * 100}%`,
                              backgroundColor: meta.border,
                              opacity: 0.85,
                            }}
                          />
                        </div>
                        <span className="w-10 text-right num-tabular text-xs text-charcoal">
                          {count}
                        </span>
                        <span className="w-10 text-right num-tabular text-[10px] text-muted">
                          {share}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-ink-3 leading-relaxed">
        Due now = leads whose next-action date (or stage window, if unset) is
        today or past. Response rate = responded ÷ reached out ("Responded"
        counts Interested, Setup Check, Client, Rejected, Snoozed). Reply
        outcomes / avg-emails-before-reply come from the structured `replied`
        fields, so they fill in as you log replies. Conversion = Clients ÷
        reached out.
      </p>

      <SourcePerformanceSection prospects={prospects} />

      <DailyLogSection
        entries={logEntries}
        setEntries={setLogEntries}
        dailyTarget={targets ? targets.dailyTarget : 0}
        appCount={prospects.filter((p) => p.last_contact_date === todayIso()).length}
      />
    </div>
  );
}

// Which channel actually converts. Closes the learning loop: you log every
// send, so the replies and wins per source are already in the data — this
// just surfaces them. Sources with fewer than 5 contacted rows are grouped
// under "Too early to judge" instead of flashing misleading 0% / 100% rates.
function SourcePerformanceSection({ prospects }) {
  const rows = useMemo(() => {
    const by = new Map();
    for (const p of prospects) {
      const s2 = p.stage || 'New';
      const contacted = (p.emails_sent || 0) > 0 || (s2 !== 'New' && s2 !== 'Prescreen' && s2 !== 'Validated');
      if (!contacted) continue;
      const key = p.source || 'No source set';
      const cur = by.get(key) || { source: key, total: 0, replied: 0, clients: 0 };
      cur.total += 1;
      if (p.replied || ['Interested', 'Proposal Sent', 'Setup Check', 'Client'].includes(p.stage)) cur.replied += 1;
      if (p.stage === 'Client') cur.clients += 1;
      by.set(key, cur);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  }, [prospects]);

  const judged = rows.filter((r) => r.total >= 5);
  const early = rows.filter((r) => r.total < 5);
  if (judged.length === 0 && early.length === 0) return null;

  return (
    <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
      <div className="font-serif text-[17px] text-bright mb-3">
        What's working · by source
      </div>
      {judged.length === 0 ? (
        <p className="text-sm text-muted">
          Not enough contacted leads per source yet. This fills in as you work
          the pipeline and log where each lead came from.
        </p>
      ) : (
        <div className="space-y-1.5">
          {judged.map((r) => {
            const rate = Math.round((r.replied / r.total) * 100);
            return (
              <div key={r.source} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs text-ink truncate">{r.source}</span>
                <div className="flex-1 h-3.5 rounded bg-paper overflow-hidden">
                  <div className="h-full rounded-r bg-mauve" style={{ width: `${rate}%` }} />
                </div>
                <span className="w-24 text-right num-tabular text-xs text-charcoal">
                  {r.replied}/{r.total} · {rate}%
                </span>
                <span className="w-14 text-right num-tabular text-[10px] text-muted">
                  {r.clients > 0 ? `${r.clients} won` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {early.length > 0 && (
        <p className="text-[12px] text-ink-3 mt-2.5">
          Too early to judge (under 5 contacted): {early.map((r) => `${r.source} (${r.total})`).join(' · ')}
        </p>
      )}
      <p className="text-[11px] text-ink-3 mt-2">
        Replied = a logged reply or a stage at Interested or beyond. Rates compare channels, not people.
      </p>
    </div>
  );
}

// ── Funnel targets + daily log (adopted from Ellen's tracker) ────────────

// Sum a daily-log entry's sends / replies.
function logSent(e) {
  return (e.pe_sent || 0) + (e.li_sent || 0) + (e.ig_sent || 0) + (e.ce_sent || 0);
}
function logReplies(e) {
  return (e.pe_replies || 0) + (e.li_replies || 0) + (e.ig_replies || 0) +
    (e.ce_replies || 0) + (e.misc_replies || 0);
}

// Month-at-a-glance + funnel math. Only the input targets are stored; the
// needed-counts derive from the rates, same formulas as the spreadsheet:
// proposals = clients ÷ close rate, calls = proposals ÷ call rate,
// leads = calls ÷ lead rate.
function TargetsSection({ targets, onSaved, entries, prospects }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const t = targets || { clientsGoal: 0, proposalCloseRate: 0.2, callToProposalRate: 0.5, leadToCallRate: 0.02, dailyTarget: 0, channelSplit: { pe: 0, li: 0, ig: 0, ce: 0 } };
  const active = t.clientsGoal > 0;

  const proposalsNeeded = active ? Math.ceil(t.clientsGoal / t.proposalCloseRate) : 0;
  const callsNeeded = active ? Math.ceil(proposalsNeeded / t.callToProposalRate) : 0;
  const leadsNeeded = active ? Math.ceil(callsNeeded / t.leadToCallRate) : 0;

  // Actuals. Contacted/replies come from the daily log (current month);
  // calls, proposals and clients from the prospect rows themselves.
  const monthKey = todayIso().slice(0, 7);
  const monthEntries = entries.filter((e) => String(e.date || '').startsWith(monthKey));
  const contacted = monthEntries.reduce((n, e) => n + logSent(e), 0);
  const replies = monthEntries.reduce((n, e) => n + logReplies(e), 0);
  const calls = prospects.reduce((n, p) => n + (p.call_booked === 1 ? 1 : 0), 0);
  const proposals = prospects.reduce((n, p) => n + (p.proposal_sent === 1 ? 1 : 0), 0);
  const clients = prospects.reduce((n, p) => n + (p.stage === 'Client' ? 1 : 0), 0);

  const pctOf = (n, goal) => (goal > 0 ? `${Math.round((n / goal) * 100)}% of ${goal}` : undefined);

  function startEdit() {
    setDraft({
      clientsGoal: t.clientsGoal || '',
      proposalCloseRate: t.proposalCloseRate,
      callToProposalRate: t.callToProposalRate,
      leadToCallRate: t.leadToCallRate,
      dailyTarget: t.dailyTarget || '',
      pe: t.channelSplit?.pe || '', li: t.channelSplit?.li || '',
      ig: t.channelSplit?.ig || '', ce: t.channelSplit?.ce || '',
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        targets: {
          clientsGoal: Number(draft.clientsGoal) || 0,
          proposalCloseRate: Number(draft.proposalCloseRate) || 0.2,
          callToProposalRate: Number(draft.callToProposalRate) || 0.5,
          leadToCallRate: Number(draft.leadToCallRate) || 0.02,
          dailyTarget: Number(draft.dailyTarget) || 0,
          channelSplit: {
            pe: Number(draft.pe) || 0, li: Number(draft.li) || 0,
            ig: Number(draft.ig) || 0, ce: Number(draft.ce) || 0,
          },
        },
      };
      const res = await fetch('/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      const d = await res.json();
      if (onSaved && d.targets) onSaved(d.targets);
      setEditing(false);
    } catch (e) {
      toast('Save failed: ' + e.message, { tone: 'error', action: { label: 'Retry', onClick: save } });
    } finally {
      setSaving(false);
    }
  }

  const num = (field, step, width = 'w-20') => (
    <input
      type="number"
      step={step}
      min="0"
      value={draft[field]}
      onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
      className={`${width} bg-transparent border border-line rounded-[6px] px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-rose`}
    />
  );

  return (
    <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-ink-2">
          Month at a glance
        </div>
        <button
          onClick={editing ? () => setEditing(false) : startEdit}
          className="text-[12px] font-medium text-ink-2 hover:text-rose-text transition"
        >
          {editing ? 'Cancel' : active ? 'Edit targets' : 'Set targets'}
        </button>
      </div>

      {targets == null && !editing ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-1/3" />
        </div>
      ) : editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-2">
            <label className="flex items-center gap-2">Clients wanted {num('clientsGoal', '1', 'w-16')}</label>
            <label className="flex items-center gap-2">Proposal→client rate {num('proposalCloseRate', '0.05', 'w-16')}</label>
            <label className="flex items-center gap-2">Call→proposal rate {num('callToProposalRate', '0.05', 'w-16')}</label>
            <label className="flex items-center gap-2">Lead→call rate {num('leadToCallRate', '0.005', 'w-16')}</label>
            <label className="flex items-center gap-2">Touches per day {num('dailyTarget', '5', 'w-16')}</label>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-2">
            <span className="text-[12px] font-medium text-ink-3">Daily split:</span>
            <label className="flex items-center gap-2">Personal email {num('pe', '1', 'w-14')}</label>
            <label className="flex items-center gap-2">LinkedIn {num('li', '1', 'w-14')}</label>
            <label className="flex items-center gap-2">Instagram {num('ig', '1', 'w-14')}</label>
            <label className="flex items-center gap-2">Cold email {num('ce', '1', 'w-14')}</label>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="text-[13px] font-medium px-3.5 py-1.5 rounded-[8px] btn-bloom transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      ) : !active ? (
        // Unconfigured, this stays one quiet line instead of a paragraph
        // squatting on the best real estate of the Stats page.
        <p className="text-[12.5px] text-ink-3">
          Set a client goal and this becomes your month scoreboard: contacted,
          calls, proposals, wins, against what the math says you need.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Leads contacted" value={contacted} sub={pctOf(contacted, leadsNeeded)} small />
            <StatCard label="Replies" value={replies} sub="this month" small />
            <StatCard label="Calls booked" value={calls} sub={pctOf(calls, callsNeeded)} small />
            <StatCard label="Proposals sent" value={proposals} sub={pctOf(proposals, proposalsNeeded)} small accent />
            <StatCard label="Clients won" value={clients} sub={pctOf(clients, t.clientsGoal)} small accent />
          </div>
          <p className="mt-3 text-[12px] text-ink-3 num-tabular">
            The math: {t.clientsGoal} clients ÷ {t.proposalCloseRate} close rate = {proposalsNeeded} proposals
            · ÷ {t.callToProposalRate} = {callsNeeded} calls
            · ÷ {t.leadToCallRate} = {leadsNeeded.toLocaleString()} leads
            {t.dailyTarget > 0 ? ` · ${t.dailyTarget} touches a day` : ''}
          </p>
        </>
      )}
    </div>
  );
}

// Editable daily outreach log: one row per day, per-channel send counts.
// The visible Replies input writes to misc_replies; the display total also
// counts any channel-attributed replies imported from a spreadsheet.
function DailyLogSection({ entries, setEntries, dailyTarget, appCount = 0 }) {
  const [busyDate, setBusyDate] = useState(null);

  async function upsert(date, patch) {
    setBusyDate(date);
    try {
      const res = await fetch('/api/daily-log', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...patch }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      const d = await res.json();
      setEntries((prev) => {
        const list = prev || [];
        const idx = list.findIndex((e) => e.date === date);
        if (idx === -1) {
          return [...list, d.entry].sort((a, b) => (a.date < b.date ? 1 : -1));
        }
        return list.map((e) => (e.date === date ? d.entry : e));
      });
    } catch (e) {
      toast('Save failed: ' + e.message, { tone: 'error' });
    } finally {
      setBusyDate(null);
    }
  }

  const list = entries || [];
  const today = todayIso();
  const hasToday = list.some((e) => e.date === today);

  const totals = list.reduce(
    (acc, e) => ({ sent: acc.sent + logSent(e), replies: acc.replies + logReplies(e) }),
    { sent: 0, replies: 0 }
  );

  const CHANNELS = [
    ['pe_sent', 'PE'], ['li_sent', 'LI'], ['ig_sent', 'IG'], ['ce_sent', 'CE'],
  ];

  return (
    <div className="bg-panel border border-line-strong shadow-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-ink-2">
          Daily log · last 60 days
        </div>
        <div className="flex items-center gap-2">
          {/* The app already knows every prospect whose last contact is
              today; hand-typing that number was the same fact twice. Shown
              until the cold-email column agrees with the count. Nothing
              writes without the click. */}
          {(() => {
            if (appCount <= 0) return null;
            const todayEntry = list.find((e) => e.date === today);
            if ((todayEntry?.ce_sent || 0) === appCount) return null;
            return (
              <button
                onClick={() => upsert(today, { ce_sent: appCount })}
                title={`The app counted ${appCount} prospect${appCount === 1 ? '' : 's'} contacted today. One click fills the cold email column with it.`}
                className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-blush-soft transition"
              >
                Use app count ({appCount})
              </button>
            );
          })()}
          {!hasToday && (
            <button
              onClick={() => upsert(today, { pe_sent: 0 })}
              className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] bg-rose-tint text-rose-text border border-rose-line hover:bg-rose hover:text-white transition"
            >
              + Log today
            </button>
          )}
        </div>
      </div>

      {entries == null ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">
          Log how many touches you send each day (personal email, LinkedIn,
          Instagram, cold email) and the replies that come back. The month
          totals feed the scoreboard above.
        </p>
      ) : (
        <div className="overflow-x-auto slim-scroll">
          <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
            <thead>
              <tr className="text-left text-[12px] font-semibold text-ink-2">
                <th className="py-1.5 pr-3">Date</th>
                {CHANNELS.map(([, label]) => (
                  <th key={label} className="py-1.5 pr-3 text-right" title={{ PE: 'Personal email', LI: 'LinkedIn', IG: 'Instagram', CE: 'Cold email' }[label]}>{label}</th>
                ))}
                <th className="py-1.5 pr-3 text-right">Total</th>
                {dailyTarget > 0 && <th className="py-1.5 pr-3 text-right">Gap</th>}
                <th className="py-1.5 pr-3 text-right">Replies</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const total = logSent(e);
                const gap = total - dailyTarget;
                return (
                  <tr key={e.date} className={`border-t border-hairline ${busyDate === e.date ? 'opacity-60' : ''}`}>
                    <td className="py-1 pr-3 whitespace-nowrap text-ink">{e.date}</td>
                    {CHANNELS.map(([field]) => (
                      <td key={field} className="py-1 pr-3 text-right">
                        <input
                          type="number"
                          min="0"
                          defaultValue={e[field] || 0}
                          onBlur={(ev) => {
                            const n = Math.max(0, Number(ev.target.value) || 0);
                            if (n !== (e[field] || 0)) upsert(e.date, { [field]: n });
                          }}
                          className="w-14 text-right bg-transparent border border-transparent hover:border-line rounded-[6px] px-1 py-0.5 num-tabular text-ink-2 focus:outline-none focus:border-rose"
                        />
                      </td>
                    ))}
                    <td className="py-1 pr-3 text-right num-tabular text-ink">{total}</td>
                    {dailyTarget > 0 && (
                      <td className={`py-1 pr-3 text-right num-tabular ${gap >= 0 ? 'text-ink-2' : 'text-rose-text'}`}>
                        {gap >= 0 ? `+${gap}` : gap}
                      </td>
                    )}
                    <td className="py-1 pr-3 text-right">
                      <input
                        type="number"
                        min="0"
                        defaultValue={logReplies(e)}
                        onBlur={(ev) => {
                          const n = Math.max(0, Number(ev.target.value) || 0);
                          if (n !== logReplies(e)) {
                            // The inline number is the day's TOTAL replies;
                            // adjust misc so channel-attributed counts stay.
                            const attributed = logReplies(e) - (e.misc_replies || 0);
                            upsert(e.date, { misc_replies: Math.max(0, n - attributed) });
                          }
                        }}
                        className="w-14 text-right bg-transparent border border-transparent hover:border-line rounded-[6px] px-1 py-0.5 num-tabular text-ink-2 focus:outline-none focus:border-rose"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[12px] font-semibold text-ink-2">
                <td className="py-1.5 pr-3">Total</td>
                <td colSpan={4} />
                <td className="py-1.5 pr-3 text-right num-tabular">{totals.sent}</td>
                {dailyTarget > 0 && <td />}
                <td className="py-1.5 pr-3 text-right num-tabular">{totals.replies}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// Every card is the same neutral card. Color enters only when a number
// has something to say: a `warn` metric that isn't zero (something is
// waiting on you), or an `accent` metric that isn't zero (something went
// right). A rose border around "Due now: 0" was the design shouting
// about nothing — the loudest kind of noise there is.
// Card tones: each metric family gets a color so the grid reads by hue
// before it reads by words. Quiet metrics stay neutral.
const CARD_TONES = {
  rose: { bg: 'var(--rose-tint)', color: 'var(--rose-text)' },
  leaf: { bg: 'rgba(107, 199, 154, 0.14)', color: 'var(--leaf-text)' },
  gold: { bg: 'rgba(220, 174, 94, 0.16)', color: 'var(--gold-text)' },
  poppy: { bg: 'rgba(229, 138, 116, 0.15)', color: 'var(--poppy-text)' },
  neutral: { bg: 'var(--hover-wash)', color: 'var(--ink-2)' },
};

function StatCard({ label, value, sub, accent, small, warn, onClick, icon, tone }) {
  const clickable = typeof onClick === 'function';
  const Tag = clickable ? 'button' : 'div';
  const live = Number(value) > 0;
  const valueTone = warn && live ? 'text-gold-text' : accent && live ? 'text-rose-text' : 'text-ink';
  const t = CARD_TONES[tone] || CARD_TONES.neutral;
  return (
    <Tag
      onClick={onClick}
      className={`text-left w-full bg-panel border border-line-strong shadow-card rounded-xl p-4 transition ${
        clickable ? 'hover:bg-card-hover cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
        {icon && (
          <span
            className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center shrink-0"
            style={{ background: t.bg, color: t.color }}
          >
            <Icon name={icon} className="w-3.5 h-3.5" strokeWidth={2.2} />
          </span>
        )}
        {label}
      </div>
      <div className={`mt-1.5 font-serif num-tabular ${small ? 'text-2xl' : 'text-[34px]'} leading-none ${valueTone}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-ink-2">{sub}</div>}
    </Tag>
  );
}
