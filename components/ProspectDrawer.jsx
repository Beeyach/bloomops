'use client';

import { useEffect, useRef, useState } from 'react';
import Select from './Select';
import AuditVideo from './AuditVideo';
import AuditProfile from './prospects/AuditProfile';
import ProspectBees from './prospects/ProspectBees';
import ProspectCard from './prospects/ProspectCard';
import { Icon } from './Icons';
import { mergedTimeline, appendEntry } from '../lib/activity-log.mjs';
import ConversationTimeline from './ConversationTimeline';
import { tzFormat } from '../lib/tz.mjs';
import SiteFavicon from './SiteFavicon';

import { toast } from '../lib/toast.mjs';
import { cachedActionState } from '../lib/prospect-state-cache.mjs';
import { PILE } from '../lib/prospect-action.mjs';
import ProspectHeadline from './ProspectHeadline';
import OutreachHistory from './OutreachHistory';
import SystemDetails from './SystemDetails';
import { hasVideo, videoState } from '../lib/prospect-video.mjs';
import { recordingEarned } from '../lib/journey-stages.mjs';
import { Tile, Pill, Meta } from './Semantic';
import { ICON } from '@/lib/semantic.mjs';
import DeferralResolver from './DeferralResolver';

// One lead's whole picture in a slide-over, opened from Today / Clients.
// Everything edits in place through the parent's updateProspect (optimistic,
// server-confirmed). The table is the spreadsheet; this is the profile.
//
// Chapter 8: identity is pinned, everything else is a tab.
//
//   pinned    who this is, and what happens next   ← ProspectHeadline
//   pinned    the four things you can do to them   ← quick actions
//   Overview  what they said                       ← ConversationTimeline
//   Email     what has actually gone out           ← OutreachHistory
//   Evidence  why we contacted them, and the audit ← ProspectCard, AuditVideo
//   Activity  the log                              ← Timeline
//   More      the editable record, and technical   ← the form, SystemDetails
//
// It used to open with an editable name field and two form fields, which is a
// page that answers "what can I change about this row" before it answers
// "who is this and what is happening". Chapter 3 fixed the order; the six
// titled groups it left behind still read as one long document, which is why
// they are five places now.

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block ui-small font-semibold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Section marker: icon + serif label over a hairline, so the drawer reads
// as a few titled groups instead of one long run of fields.
function SectionHead({ icon, children }) {
  return (
    <div className="flex items-center gap-1.5 pt-4 border-t border-hairline text-ink-2">
      <Icon name={icon} className="w-3.5 h-3.5" />
      <span className="font-serif ui-heading text-ink">{children}</span>
    </div>
  );
}

// The five questions a prospect page gets asked, as five places instead of
// one scroll. Ary's verdict on the single-column version was that it read as
// "just words with different fonts" — six titled groups in a row is a
// document, and a document is not something you operate. Identity and the
// next action stay pinned above the strip; everything else is one click.
// Video is conditional. A tab that is always there is a promise the record
// cannot always keep — most prospects have never had a video near them — so
// it appears only when one actually exists (see lib/prospect-video.mjs, which
// is deliberately strict about what counts).
export function drawerTabs(prospect) {
  return [
    { key: 'overview', label: 'Overview' },
    { key: 'email', label: 'Email' },
    { key: 'evidence', label: 'Evidence' },
    ...(hasVideo(prospect) || recordingEarned(prospect) ? [{ key: 'video', label: 'Video' }] : []),
    { key: 'activity', label: 'Activity' },
    { key: 'more', label: 'More' },
  ];
}

function DrawerTabs({ value, onChange, tabs }) {
  return (
    <div role="tablist" aria-label="Prospect sections" className="flex items-stretch gap-1 border-b border-line -mx-1 px-1">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active ? 'true' : 'false'}
            onClick={() => onChange(t.key)}
            className={`ui-small font-semibold px-2.5 py-2 -mb-px border-b-2 transition ${
              active
                ? 'border-rose text-rose-text'
                : 'border-transparent text-ink-2 hover:text-ink hover:border-line-strong'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const inputCls =
  'w-full bg-transparent border border-line r-md px-2.5 py-1.5 ui-body text-ink focus:outline-none focus:border-rose transition';

// Timeline tag → color, on the existing status hues so nothing new is
// invented. Unknown tags fall back to ink.
const LOG_TAG_COLOR = {
  reply: 'var(--leaf-text)',
  call: 'var(--leaf-text)',
  note: 'var(--ink-2)',
  email: 'var(--rose-text)',
  stage: 'var(--rose-text)',
  video: 'var(--gold-text)',
  prescreen: 'var(--mauve-deep)',
  replysync: 'var(--gold-text)',
  vidtest: 'var(--gold-text)',
  declined: 'var(--poppy-text)',
};

// Chapter 10: every event type gets a glyph, from the shared vocabulary
// where one exists. A timeline of forty identical bullets is a text feed;
// the icon is what lets you find the reply among the stage changes.
const LOG_TAG_ICON = {
  reply: ICON.reply,
  call: 'mic',
  note: 'file-text',
  email: ICON.email,
  stage: 'trending-up',
  video: ICON.video,
  prescreen: ICON.evidence,
  replysync: ICON.reply,
  vidtest: ICON.video,
  declined: ICON.blocked,
};

// Automation tags are internal codes; the timeline shows plain words.
const LOG_TAG_LABEL = {
  replysync: 'Reply synced',
  vidtest: 'A/B test',
  prescreen: 'Prescreen',
  declined: 'Declined',
};

// The activity timeline: real { ts, tag, text } entries from activity_log,
// merged with the legacy info-field markers the app recognizes
// (PRESCREEN / REPLYSYNC / VIDTEST / DECLINED). Info itself is never
// rewritten here — the markers just render as history too.
function Timeline({ prospect, onPatch }) {
  const [draft, setDraft] = useState('');
  const entries = mergedTimeline(prospect.activity_log, prospect.info);

  function logNote() {
    const text = draft.trim();
    if (!text) return;
    onPatch({ activity_log: appendEntry(prospect.activity_log, 'note', text) });
    setDraft('');
  }

  const last = entries[0];
  const summary = entries.length === 0
    ? 'Nothing logged yet'
    : `${entries.length.toLocaleString()} ${entries.length === 1 ? 'entry' : 'entries'}${last?.text ? ` · last: ${String(last.text).slice(0, 60)}` : ''}`;

  return (
    // History has its own tab now (Chapter 8), so it no longer has to hide
    // behind a disclosure to stay out of the present's way — you only get
    // here by asking for it. The summary line stays as the header.
    <section>
      <div className="flex items-baseline gap-2 ui-small font-medium text-ink-2 mb-3">
        <span className="ui-heading font-semibold text-ink">Activity</span>
        <span className="text-ink-3">{summary}</span>
      </div>
      <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); logNote(); } }}
          placeholder="Log a touch: called her, she replied on IG…"
          className={inputCls}
        />
        <button
          onClick={logNote}
          disabled={!draft.trim()}
          className="shrink-0 ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition ui-control"
        >
          Log it
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="ui-small text-ink-3 italic">
          Nothing logged yet. Notes land here with a timestamp, and automations add their own.
        </p>
      ) : (
        <ol className="relative border-l border-line pl-6 space-y-3">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              {/* The glyph replaces the bare dot: same position, same colour,
                  but it now says what KIND of event this was before the
                  label beside it has been read. */}
              <span
                className="absolute -left-[27px] top-[1px] w-[18px] h-[18px] inline-flex items-center justify-center rounded-full border"
                style={{
                  borderColor: LOG_TAG_COLOR[e.tag] || 'var(--ink-3)',
                  color: LOG_TAG_COLOR[e.tag] || 'var(--ink-2)',
                  backgroundColor: 'var(--surface)',
                }}
                aria-hidden="true"
              >
                <Icon name={LOG_TAG_ICON[e.tag] || 'circle-dot'} className="w-[11px] h-[11px]" strokeWidth={2.2} />
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className="ui-meta font-semibold uppercase tracking-wide"
                  style={{ color: LOG_TAG_COLOR[e.tag] || 'var(--ink-2)' }}
                >
                  {LOG_TAG_LABEL[e.tag] || e.tag}
                </span>
                <span className="ui-meta text-ink-3">
                  {e.ts
                    ? tzFormat(e.ts, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : 'from notes'}
                </span>
              </div>
              <p className="ui-small text-ink leading-relaxed break-words">{e.text}</p>
            </li>
          ))}
        </ol>
      )}
      </div>
    </section>
  );
}

export default function ProspectDrawer({
  prospect: p,
  stages,
  ratings,
  ratingMeta,   // emoji value → { icon, filled, color, label } for display
  sources,
  replyTypes,
  onPatch,      // (patch) => void. Already bound to this prospect
  onLogTouch,   // stamps last_contact_date=today, emails_sent+1
  onSetReply,   // (type|null) => void
  onShowInTable,
  onOpenSequence, // opens the email-sequence modal for this prospect
  onNavigate,   // (view) => void, for the one next step the card points at
  onSnooze,     // parks it: next_action_date = 7 days out
  onClose,
  focusNotes,   // true when opened from the table's info dot — jump to Notes
  onChanged,    // the record changed underneath us; re-read it from the server
  onPrev,       // open the previous prospect in the current list (null at the top)
  onNext,       // open the next one (null at the end)
  position,     // { at, of } for the "3 of 19" label, or null
  initialTab,   // test seam: open on a given tab so one render can be asserted
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      // Arrow-walk the list — but never while typing in a field.
      const el = document.activeElement;
      const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (typing) return;
      if (e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  // Which section is showing. Reset per prospect, so walking the list with
  // the arrow keys always lands on Overview rather than on whatever tab the
  // last person happened to be read in.
  const tabs = drawerTabs(p);
  const vState = videoState(p);
  const [tab, setTab] = useState(initialTab || 'overview');
  // Bumped by the Draft reply quick action; the conversation's draft box
  // starts generating when it changes, so the button IS the workflow.
  const [draftNonce, setDraftNonce] = useState(0);
  useEffect(() => { setTab(initialTab || 'overview'); }, [p?.id, initialTab]);
  // Walking the list can land on somebody with no video while the Video tab
  // is open, which would leave the drawer showing a panel that is not in the
  // strip. Fall back to Overview rather than render a tab nobody can see.
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab('overview');
  }, [tabs, tab]);

  // What they said when they replied, logged as one activity entry. The chip
  // records THAT they answered; this records the words.
  const [replySaid, setReplySaid] = useState('');
  // Same reason as the Timeline key below. What Dave said must not be sitting
  // in the box when the drawer moves to Maria, because saving it writes his
  // words into her timeline as though she had said them.
  useEffect(() => { setReplySaid(''); }, [p?.id]);
  const saveReplySaid = () => {
    const said = replySaid.trim();
    if (!said) return;
    onPatch({ activity_log: appendEntry(p.activity_log, 'REPLY', `They said: ${said}`) });
    setReplySaid('');
    toast('Logged what they said.');
  };

  // What has actually been sent, and the machinery behind it. One read, shared
  // by the history section and the System details disclosure so the friendly
  // view and the diagnostic view can never describe different sends. Fails
  // quietly: a missing send record is a smaller problem than a drawer that
  // will not open.
  const [outreach, setOutreach] = useState({ sends: [], packages: [], jobs: [], loading: true });
  useEffect(() => {
    let alive = true;
    setOutreach({ sends: [], packages: [], jobs: [], loading: true });
    if (!p?.id) return undefined;
    fetch(`/api/prospects/${p.id}/outreach`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setOutreach({ sends: d?.sends || [], packages: d?.packages || [], jobs: d?.jobs || [], loading: false });
      })
      .catch(() => { if (alive) setOutreach({ sends: [], packages: [], jobs: [], loading: false }); });
    return () => { alive = false; };
  }, [p?.id]);

  // The info dot opens THIS drawer (one surface, not a second popup); it
  // lands on the Notes section so the click still goes straight to the note.
  const notesRef = useRef(null);
  useEffect(() => {
    if (!focusNotes || !p) return;
    // Notes live under More now, so the jump has to switch tabs before it can
    // scroll: the anchor does not exist while another panel is rendered.
    setTab('more');
    const id = requestAnimationFrame(() => notesRef.current?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(id);
  }, [focusNotes, p?.id]);

  if (!p) return null;

  // The one canonical answer about this person, computed here and handed to
  // both the headline and the technical disclosure so they cannot drift.
  const state = cachedActionState(p);

  // For somebody genuinely waiting on Ary, the drawer's job is the reply —
  // one dominant button that opens the conversation and starts the draft,
  // instead of four equally weighted actions none of which is the work.
  const needsReply = state.pile === PILE.NEEDS_YOU && Boolean(state.relationship?.needsPerson);

  const text = (field, placeholder = '—') => (
    <input
      key={`${p.id}:${field}:${p[field] ?? ''}`}
      type="text"
      defaultValue={p[field] || ''}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== (p[field] || '')) onPatch({ [field]: v || null });
      }}
      className={inputCls}
    />
  );

  const date = (field) => (
    <input
      key={`${p.id}:${field}:${p[field] ?? ''}`}
      type="date"
      defaultValue={p[field] || ''}
      onBlur={(e) => {
        const v = e.target.value;
        if (v !== (p[field] || '')) onPatch({ [field]: v || null });
      }}
      className={inputCls}
    />
  );

  const yesNo = (field) => (
    <Select
      value={p[field] === 1 ? '1' : p[field] === 0 ? '0' : ''}
      onChange={(v) => onPatch({ [field]: v === '' ? '' : Number(v) })}
      options={[{ value: '', label: '—' }, { value: '1', label: 'Yes' }, { value: '0', label: 'No' }]}
      ariaLabel={field}
      className="w-full"
      buttonClassName="w-full"
      minWidth={0}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] max-w-full h-full overflow-y-auto slim-scroll bg-panel border-l border-line shadow-card px-7 pt-5 pb-12 space-y-5">
        {/* The walk controls and the close button, on their own line above the
            headline. They used to sit beside the name, which clipped long
            business names mid-letter and made the biggest text on the page
            compete with three buttons. */}
        <div className="flex items-center justify-end gap-2">
          {/* Walk the current list without closing: buttons + ↑/↓ keys. */}
          <span className="shrink-0 inline-flex items-center gap-0.5">
            {position && (
              <span className="ui-meta text-ink-3 num-tabular mr-1">{position.at} / {position.of}</span>
            )}
            <button
              onClick={() => onPrev && onPrev()}
              disabled={!onPrev}
              aria-label="Previous prospect (up arrow)"
              title="Previous prospect (↑)"
              className="w-8 h-8 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition inline-flex items-center justify-center ui-control"
            >
              <Icon name="chevron-up" className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNext && onNext()}
              disabled={!onNext}
              aria-label="Next prospect (down arrow)"
              title="Next prospect (↓)"
              className="w-8 h-8 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition inline-flex items-center justify-center ui-control"
            >
              <Icon name="chevron-down" className="w-4 h-4" />
            </button>
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 r-md text-ink-3 hover:text-ink hover:bg-hover-wash-soft transition inline-flex items-center justify-center"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {/* Who this is, what happened, what next. Nothing above it. */}
        <ProspectHeadline
          prospect={p}
          state={state}
          action={state.relationship?.state === 'DEFERRED' && !state.relationship?.deferredUntil ? (
            <DeferralResolver
              prospectId={p.id}
              onResolved={() => onChanged && onChanged()}
            />
          ) : null}
        />

        {/* Quick actions. One filled button, chosen by the state: when the
            person is waiting on Ary the work is the reply, and everything
            else steps back to an outline. */}
        <div className="flex items-center gap-2 flex-wrap">
          {needsReply && (
            <button
              onClick={() => { setTab('overview'); setDraftNonce((n) => n + 1); }}
              title="Opens the conversation and drafts a reply from it"
              className="ui-body font-semibold px-3 py-1.5 r-md btn-bloom transition inline-flex items-center gap-1.5"
            >
              <Icon name="pencil" className="w-3.5 h-3.5" />
              Draft reply
            </button>
          )}
          <button
            onClick={onLogTouch}
            title="Stamps today as the last contact and adds one to the touch count"
            className={needsReply
              ? 'ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition'
              : 'ui-body font-medium px-3 py-1.5 r-md btn-bloom transition'}
          >
            Log a touch today
          </button>
          {onSnooze && (
            <button
              onClick={onSnooze}
              title="Not now: come back to this one in 7 days"
              className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              Snooze 7d
            </button>
          )}
          {onOpenSequence && (
            <button
              onClick={onOpenSequence}
              title="See and copy the emails queued for this prospect"
              className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition inline-flex items-center gap-1.5"
            >
              <Icon name="mail" className="w-3.5 h-3.5" />
              Emails
            </button>
          )}
          <button
            onClick={onShowInTable}
            className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
          >
            Show in table →
          </button>
        </div>

        <DrawerTabs value={tab} onChange={setTab} tabs={tabs} />

        {/* ── Overview: what they said, and what you do about it. ────────── */}
        {tab === 'overview' && (
          <div className="space-y-5">
          {/* What they actually said, and how you got here. Above everything
              else the record holds, because it is what decides the next move: a
              stage is where a prospect sits, this is what a person told you. */}
          <ConversationTimeline prospectId={p.id} focusDraft={draftNonce} />
          </div>
        )}

        {/* ── Email: everything that has gone out, and nothing else. ─────── */}
        {tab === 'email' && (
          <div className="space-y-5">
          {/* What has actually gone out, from recorded sends only. */}
          <OutreachHistory sends={outreach.sends} loading={outreach.loading} sentCount={p.emails_sent || 0} prospectId={p.id} />
          </div>
        )}

        {/* ── Evidence: why this person, and what was checked. ───────────── */}
        {tab === 'evidence' && (
          <div className="space-y-5">
          {/* Why they were worth contacting, what was checked, how to reach
              them, where they came from. Computed in the browser from the row
              already loaded, so it costs nothing and needs no button. */}
          <ProspectCard prospect={p} onNavigate={onNavigate} />
          </div>
        )}

        {/* ── Video: only rendered when the record actually has one. ─────── */}
        {tab === 'video' && (
          <div className="space-y-5">
            {vState && (
              <div className="flex items-center gap-3">
                <Tile kind={vState.key === 'watched' ? 'watched' : 'video'} size={38} />
                <div className="min-w-0">
                  <Pill kind={vState.key === 'watched' ? 'watched' : 'video'}>{vState.label}</Pill>
                </div>
              </div>
            )}
            <AuditVideo prospect={p} onPatch={onPatch} />
          </div>
        )}

        {/* ── Activity: the log, open. It has a tab now, so it no longer has
               to hide behind a disclosure to stay out of the way. ────────── */}
        {tab === 'activity' && (
          <div className="space-y-5">
          {/* Activity timeline: addLog entries + recognized info markers. */}
          {/* Keyed on the prospect: the drawer does not remount when the
              arrow keys walk the list, so the half-typed note for one person
              used to still be sitting in the box for the next, and "Log it"
              wrote it onto them. */}
          <Timeline key={p.id} prospect={p} onPatch={onPatch} />
          <p className="ui-meta text-muted">
            Added {p.created_at ? tzFormat(p.created_at, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            {p.updated_at ? ` · last edited ${tzFormat(p.updated_at, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          </p>
          </div>
        )}

        {/* ── More: the editable record, and everything technical. This is
               the form that used to open the page. ─────────────────────── */}
        {tab === 'more' && (
          <div className="space-y-5">
          <SectionHead icon="trending-up">The record</SectionHead>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Business">
              {text('business_name')}
              {/* CSV imports copy the name into business_name; the field stays
                  editable, this just flags the duplicate. */}
              {p.business_name && p.business_name === p.name ? (
                <span className="block ui-meta text-ink-3 mt-1">
                  Same as the name; imports did this. Edit to set the real business.
                </span>
              ) : null}
            </Field>
            <Field label="Person">{text('name')}</Field>
            <Field label="Niche">{text('niche')}</Field>
            <Field label="Stage">
              <Select
                value={p.stage || 'New'}
                onChange={(v) => onPatch({ stage: v })}
                options={stages}
                ariaLabel="Stage"
                className="w-full"
                buttonClassName="w-full"
                minWidth={0}
              />
            </Field>
            <Field label="Rating">
              <Select
                value={p.rating || ''}
                onChange={(v) => onPatch({ rating: v || null })}
                // Stored value stays the emoji string (automation contract);
                // the menu shows the line icon + plain word. Emojis in the UI
                // are Ary's no; they live only in Workspace pages.
                options={[{ value: '', label: '—' }, ...ratings.map((r) => {
                  const rm = (ratingMeta && ratingMeta[r]) || {};
                  return {
                    value: r,
                    label: (
                      <span className="inline-flex items-center gap-2">
                        <span style={{ color: rm.color }}>
                          <Icon name={rm.icon || 'circle'} filled={rm.filled} className="w-3.5 h-3.5" />
                        </span>
                        {rm.label || r}
                      </span>
                    ),
                  };
                })]}
                ariaLabel="Rating"
                className="w-full"
                buttonClassName="w-full"
                minWidth={0}
              />
            </Field>
            <Field label="Call booked?">{yesNo('call_booked')}</Field>
            <Field label="Proposal sent?">{yesNo('proposal_sent')}</Field>
          </div>

          {/* Reply lives WITH the pipeline state it belongs to — it sat four
              sections down, past contact and dates, as if an answer were an
              afterthought. Chips carry strong edges (a11y) and say on hover
              that a second click clears them. */}
          <div>
            <span className="block ui-small font-semibold text-ink-2 mb-1">Did they answer?</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {replyTypes.map((t) => {
                const active = p.replied && p.reply_type === t;
                // The hover is the definition, not the mechanics: which replies
                // belong under which chip, and what marking it changes.
                const REPLY_HELP = {
                  interested: 'Any real engagement counts: a question, a maybe, a "tell me more". Auto emails stop, and they join your warm list so going quiet resurfaces them in Today.',
                  defer: 'A "not now": busy season, come back next month, just had a baby. Auto emails stop; give them a Snooze or a next follow-up date so they come back at the right time.',
                  decline: 'A clear no thanks. Auto emails stop and the record stays, so you never write to them cold again by accident.',
                };
                return (
                  <button
                    key={t}
                    onClick={() => onSetReply(active ? null : t)}
                    title={active ? 'Click again to clear the reply' : REPLY_HELP[t] || `Mark their reply as ${t}`}
                    className={`ui-small font-medium px-2.5 py-1 rounded-full border transition capitalize ${
                      active
                        ? 'bg-rose-btn text-white border-rose-btn'
                        : 'border-line-strong text-ink hover:border-rose hover:text-rose-text'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
              {p.replied && !p.reply_type ? (
                <button onClick={() => onSetReply(null)} className="ui-small text-ink-3 underline decoration-dotted">clear</button>
              ) : null}
            </div>
            {p.reply_date && <p className="ui-small text-ink-3 mt-1">Replied on {tzFormat(p.reply_date, { month: 'short', day: 'numeric' })}</p>}
            {/* What they actually said, one line, into the activity log. The
                chip records THAT they answered; this records the words, which
                is what future-you wants when deciding how to write back. */}
            {p.replied && p.reply_type ? (
              <div className="flex gap-1.5 mt-1.5">
                <input
                  value={replySaid}
                  onChange={(e) => setReplySaid(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveReplySaid(); }}
                  placeholder={'What did they say? e.g. "asked about pricing"'}
                  className={inputCls + ' flex-1 ui-small'}
                />
                <button
                  onClick={saveReplySaid}
                  disabled={!replySaid.trim()}
                  className="ui-small font-semibold px-3 r-md btn-bloom transition ui-control"
                >
                  Log it
                </button>
              </div>
            ) : null}
          </div>
          <SectionHead icon="mail-open">Contact</SectionHead>
          <div className="space-y-2.5">
            <Field label="Email">
              <div className="flex gap-1.5">
                {text('email')}
                {p.email ? (
                  <button
                    // writeText rejects rather than throwing, so the old sync
                    // try/catch never caught a blocked clipboard — it failed
                    // silently and the user pasted whatever was there before.
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(p.email);
                      } catch {
                        toast('Your browser blocked clipboard access, so the email was not copied.', { tone: 'error' });
                      }
                    }}
                    title="Copy email"
                    className="shrink-0 px-2.5 r-md border border-line text-ink-3 hover:text-rose-text hover:border-rose transition ui-small"
                  >
                    Copy
                  </button>
                ) : null}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Where you found them">
                <Select
                  value={p.source || ''}
                  onChange={(v) => onPatch({ source: v || null })}
                  options={[{ value: '', label: '—' }, ...sources.map((s) => ({ value: s, label: s }))]}
                  ariaLabel="Where you found them"
                  placeholder="—"
                  className="w-full"
                  buttonClassName="w-full"
                  minWidth={0}
                />
                {/* Named for what it is. This is the older free-text field, and
                    it is not the structured origin the acquisition rollups read:
                    those are recorded when a prospect is added and cannot be
                    backfilled from here without inventing history. The card
                    above shows whichever one this record actually has. */}
                <span className="block ui-meta text-ink-3 mt-1">
                  The older field. Prospects added now record this when you add them.
                </span>
              </Field>
              <Field label="Touches sent">
                <input
                  key={`${p.id}:es:${p.emails_sent ?? 0}`}
                  type="number"
                  min="0"
                  defaultValue={p.emails_sent || 0}
                  onBlur={(e) => {
                    const n = Math.max(0, Number(e.target.value) || 0);
                    if (n !== (p.emails_sent || 0)) onPatch({ emails_sent: n });
                  }}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
          {/* Dates */}
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Last contact">{date('last_contact_date')}</Field>
            <Field label="Next follow-up">{date('next_action_date')}</Field>
          </div>
          {/* The bees, where the prospect is. Each one reads this whole record
              server-side, so nothing here has to be re-typed into a chat. */}
          <SectionHead icon="bee">Ask a bee</SectionHead>
          <ProspectBees prospect={p} onPatch={onPatch} />
          <div ref={notesRef} className="scroll-mt-4" />
          <SectionHead icon="file">Notes</SectionHead>
          {/* The audit notes rendered as a profile: the audit flow writes a
              consistent template, and parsing it beats making anyone read it.
              Raw text and an editor sit behind a toggle for corrections. */}
          {(p.audit_notes || '').trim() ? (
            <AuditProfile
              notes={p.audit_notes}
              onSave={(v) => onPatch({ audit_notes: v || null })}
            />
          ) : null}

          {/* Notes */}
          <Field label="Your notes">
            <textarea
              key={`${p.id}:info:${(p.info || '').length}`}
              defaultValue={p.info || ''}
              placeholder="Anything worth remembering about this lead."
              rows={5}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (p.info || '')) onPatch({ info: v || null });
              }}
              className={inputCls + ' resize-y min-h-[110px] leading-relaxed'}
            />
          </Field>
          {/* Last on the page and closed. Ids, codes, fingerprints, provider
              threads, queue states. Kept in full, out of the way. */}
          <SystemDetails
            prospect={p}
            state={state}
            sends={outreach.sends}
            packages={outreach.packages}
            jobs={outreach.jobs}
          />
          </div>
        )}
      </div>
    </div>
  );
}
