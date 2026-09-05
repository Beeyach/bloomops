'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { APP_TZ } from '@/lib/tz.mjs';
import BloomSpinner from './BloomSpinner';

// Where this person and Ary stand, and how they got there.
//
// Two things, deliberately drawn apart. The card at the top is a summary of
// right now; the list under it is what actually happened, in order, and nothing
// in it is ever edited. That separation is the whole point: somebody who said
// "not this offer" in the morning and "yes please" in the afternoon has one
// current state and two events, and the old app collapsed them into a single
// word and filed her as rejected.
//
// Loaded on demand rather than with the row, because most of the time nobody
// opens a prospect to read their history, and a fetch nobody asked for is a
// fetch that slows down the list.

// The tone each state carries. Deliberately mild for "not this offer": it is
// not a failure, and dressing it in red is how a perfectly warm prospect gets
// scrolled past for ever.
const TONE = {
  ACCEPTED_OFFER: 'text-leaf-text bg-leaf-tint border-leaf-line',
  WON: 'text-leaf-text bg-leaf-tint border-leaf-line',
  RECONSIDERED: 'text-leaf-text bg-leaf-tint border-leaf-line',
  INTERESTED: 'text-leaf-text bg-leaf-tint border-leaf-line',
  BUDGET_CONCERN: 'text-ink bg-hover-wash-soft border-line-strong',
  DEFERRED: 'text-ink bg-hover-wash-soft border-line-strong',
  AMBIGUOUS: 'text-ink bg-hover-wash-soft border-line-strong',
  // Not red. This one is still a live relationship.
  NO_TO_THIS_OFFER: 'text-ink-2 bg-hover-wash-soft border-line-strong',
  // The only genuinely closed one.
  NO_TO_US: 'text-poppy-text bg-poppy-tint border-poppy-line',
  LOST: 'text-ink-2 bg-hover-wash-soft border-line-strong',
};

const when = (ts) => {
  if (!ts) return '';
  const d = new Date(String(ts).replace(' ', 'T') + (String(ts).endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function ConversationTimeline({ prospectId, focusDraft = 0 }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  // What the Gmail thread fetch actually found, reported up by GmailThread.
  // "No reply yet" may only be said once this is 'empty' — saying it while
  // the thread was still loading is how a synced conversation read as none.
  const [threadState, setThreadState] = useState('loading');

  useEffect(() => {
    let alive = true;
    if (!prospectId) return undefined;
    setData(null);
    fetch(`/api/prospects/${prospectId}/conversation`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [prospectId]);

  if (!data) {
    return (
      <>
        <SectionTitle />
        <p className="ui-meta text-ink-3 mb-2">Loading the conversation…</p>
      </>
    );
  }
  const { current, timeline = [], options = [] } = data;

  // No classification and no old status either. The Gmail conversation still
  // renders if one exists — a synced thread the app refuses to show is how
  // Chris's warm reply read as "No reply yet" — but Draft reply stays hidden:
  // with nothing to answer it would only invite off-sequence nudges.
  // "No reply yet" waits for the thread fetch to come back genuinely empty;
  // a failed fetch says so instead of pretending nobody wrote.
  if (!current?.state && !timeline.length) {
    return (
      <>
        <SectionTitle />
        <GmailThread prospectId={prospectId} onState={setThreadState} />
        {/* A loaded conversation is something to answer even before anything
            has been classified — the acceptance walk found Chris's warm reply
            rendered with no draft box at all. No thread still means no draft
            button, so an uncontacted prospect never grows an off-sequence
            nudge. */}
        {threadState === 'loaded' && <DraftReply prospectId={prospectId} autoStart={focusDraft} />}
        {threadState === 'empty' && <p className="ui-small text-ink-3">No reply yet.</p>}
      </>
    );
  }

  async function correct(state) {
    setSaving(true);
    setPicking(false);
    try {
      const r = await fetch(`/api/prospects/${prospectId}/conversation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      }).then((x) => (x.ok ? x.json() : null));
      if (r?.current) {
        // Refetch rather than patching in place: the correction is a new event
        // and belongs in the list, not just in the card.
        const fresh = await fetch(`/api/prospects/${prospectId}/conversation`).then((x) => (x.ok ? x.json() : null));
        if (fresh) setData(fresh);
      }
    } catch {}
    setSaving(false);
  }

  return (
    <>
      <SectionTitle />

      <GmailThread prospectId={prospectId} />

      <DraftReply prospectId={prospectId} autoStart={focusDraft} />

      {/* Where things stand. One line, no enum. */}
      {current?.state && (
        <div className={`rounded-[10px] border px-3.5 py-3 mb-3 ${TONE[current.state] || 'border-line-strong'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="ui-body font-semibold">{current.label}</span>
            {current.legacy && (
              <span className="ui-meta text-ink-3">from the older record</span>
            )}
          </div>
          <p className="ui-small text-ink-2 leading-snug mt-0.5">{current.explain}</p>
        </div>
      )}

      {/* What actually happened. Oldest first, so it reads like a story. */}
      {timeline.length > 0 && (
        <ol className="space-y-2 mb-2">
          {timeline.map((e, i) => {
            const latest = i === timeline.length - 1;
            return (
              <li key={e.id} className="flex gap-2.5">
                <span
                  className={`mt-[6px] w-[7px] h-[7px] rounded-full shrink-0 ${latest ? 'bg-rose' : 'bg-line-strong'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="ui-meta text-ink-3 tabular-nums">{when(e.at)}</span>
                    <span className={`ui-small ${latest ? 'font-semibold text-ink' : 'text-ink-2'}`}>{e.label}</span>
                    {/* Who decided. A guess and your judgement are not the
                        same fact and the page should not pretend otherwise. */}
                    <span className="ui-meta text-ink-3">{e.who}</span>
                    {latest && <span className="ui-meta text-rose-text">now</span>}
                  </div>
                  {e.detail && <p className="ui-small text-ink-2 leading-snug">{e.detail}</p>}
                  {e.deferUntil && (
                    <p className="ui-meta text-ink-3">Asked for around {String(e.deferUntil).slice(0, 10)}.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Disagreeing with LTB. Recorded as its own entry, never an edit. */}
      {!picking ? (
        <button
          onClick={() => setPicking(true)}
          disabled={saving}
          className="ui-small font-medium text-ink-2 underline decoration-dotted hover:text-rose-text transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'This is not right'}
        </button>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.state}
              onClick={() => correct(o.state)}
              className="ui-small font-medium px-2.5 py-1.5 rounded-[7px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() => setPicking(false)}
            className="ui-small text-ink-3 px-2 py-1.5 hover:text-ink transition"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}


// The conversation itself, from Gmail, in whole messages.
//
// This replaces the era in which the app knew a thread existed and could not
// show it, so Ary pasted a message into a box that her own mailbox was
// holding in full. Read-only: rendered, never edited, never written back.
function GmailThread({ prospectId, onState }) {
  const [convo, setConvo] = useState(null);
  // Only the newest message shows by default. The rest of the thread is one
  // click away, and the draft context never depended on what is on screen —
  // the server reads the whole conversation either way.
  const [showAll, setShowAll] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!prospectId) return undefined;
    setConvo(null);
    setShowAll(false);
    fetch(`/api/prospects/${prospectId}/gmail-thread`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setConvo(d || { messages: [], unavailable: 'error' }); })
      .catch(() => { if (alive) setConvo({ messages: [], unavailable: 'error' }); });
    return () => { alive = false; };
  }, [prospectId]);

  // Loading, loaded, genuinely empty, or failed — told upward, because the
  // parent owns the "No reply yet" sentence and must not say it early.
  useEffect(() => {
    if (!onState) return;
    if (!convo) onState('loading');
    else if (convo.messages?.length) onState('loaded');
    else if (!convo.unavailable || convo.unavailable === 'no-thread') onState('empty');
    else onState('error');
  }, [convo, onState]);

  // The stored copy serves instantly; this asks Gmail directly for anything
  // the store has not seen yet, on Ary's say-so.
  async function updateNow() {
    if (updating) return;
    setUpdating(true);
    try {
      const d = await fetch(`/api/prospects/${prospectId}/gmail-thread?refresh=1`).then((r) => (r.ok ? r.json() : null));
      if (d) setConvo(d);
    } catch {}
    setUpdating(false);
  }

  if (!convo) return <p className="ui-meta text-ink-3 mb-2">Loading the Gmail conversation…</p>;
  if (!convo.messages?.length) {
    // A recorded conversation that will not load is a failure to admit, not
    // a "No reply yet": the mailbox may be unreachable while the reply is
    // entirely real.
    if (convo.unavailable && convo.unavailable !== 'no-thread') {
      return (
        <p className="ui-meta text-ink-3 mb-2">
          The Gmail conversation could not be loaded right now.{' '}
          <button
            onClick={updateNow}
            disabled={updating}
            className="underline decoration-dotted hover:text-rose-text transition disabled:opacity-50"
          >
            {updating ? 'Trying…' : 'Try again'}
          </button>
        </p>
      );
    }
    return null;
  }

  const messages = convo.messages;
  const earlier = messages.length - 1;
  const shown = showAll ? messages : messages.slice(-1);
  // One subject for the whole conversation, not one per card. Threads keep a
  // subject for months; repeating it on every message was pure noise.
  const subject = [...messages].reverse().find((m) => m.subject)?.subject || null;

  return (
    <div className="mb-3 space-y-2">
      {subject && <p className="ui-meta text-ink-3 truncate">{subject}</p>}
      {earlier > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="ui-meta font-medium text-ink-2 underline decoration-dotted hover:text-rose-text transition"
        >
          {showAll
            ? 'Hide the earlier messages'
            : `Show the whole conversation · ${earlier} earlier message${earlier === 1 ? '' : 's'}`}
        </button>
      )}
      {shown.map((m) => (
        <div
          key={m.messageId}
          className={`rounded-[10px] border px-3 py-2 ${
            m.from === 'Ary' ? 'border-line bg-hover-wash-soft' : 'border-rose-line bg-rose-tint'
          }`}
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="ui-small font-semibold text-ink">{m.from === 'Ary' ? 'Ary' : (m.fromAddress || 'Them')}</span>
            <span className="ui-meta text-ink-3 tabular-nums">{String(m.at || '').slice(0, 10)}</span>
          </div>
          {/* Their words are the content of this whole screen: body size,
              full ink. The old 13px made a client's sentence weigh the same
              as a timestamp. */}
          <p className="ui-body text-ink leading-relaxed mt-1 whitespace-pre-line break-words">{m.text || '(no text)'}</p>
        </div>
      ))}
      <p className="ui-meta text-ink-3">
        {showAll || earlier === 0
          ? 'From Gmail, synced automatically. Nothing to paste.'
          : 'From Gmail, synced automatically. Draft reply still reads the whole conversation.'}
        {convo.syncedAt
          ? ` Updated ${new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(convo.syncedAt))}.`
          : ''}{' '}
        <button
          onClick={updateNow}
          disabled={updating}
          className="ui-meta font-medium text-ink-2 underline decoration-dotted hover:text-rose-text transition disabled:opacity-50"
        >
          {updating ? 'Updating…' : 'Update now'}
        </button>
      </p>
    </div>
  );
}

// Draft a reply here instead of pasting the thread into ChatGPT.
//
// The button does one thing: ask the server to read this conversation and
// write something Ary can edit. It cannot send. There is no send path wired
// to it at all, which is the point — the value is that the thread never
// leaves the app by hand, not that the machine gains a voice.
function DraftReply({ prospectId, autoStart = 0 }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [fingerprint, setFingerprint] = useState(null);
  const [sources, setSources] = useState([]);
  const [threadAgeDays, setThreadAgeDays] = useState(null);
  // The drawer's Draft reply quick action bumps autoStart; a fresh bump
  // starts a generation exactly once, and never stomps a draft in progress
  // or one already being edited.
  const started = useRef(0);
  useEffect(() => {
    if (!autoStart || autoStart === started.current) return;
    started.current = autoStart;
    if (!draft && !busy && !sending && !sent) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // One-button mode: Draft & send writes the draft, shows it, and sends it
  // after a visible countdown unless Ary cancels or starts editing. The words
  // always pass in front of her eyes; the countdown just spares her the
  // second click when they look right. Editing stops the clock — typing IS
  // reviewing, and a reviewed draft deserves a deliberate Send.
  const [countdown, setCountdown] = useState(null); // null | seconds remaining
  const countdownRef = useRef(null);
  const clearCountdown = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
  };
  useEffect(() => () => clearCountdown(), []);
  // The text and fingerprint ride along explicitly: the interval's closure
  // would otherwise capture the render-time (empty) draft state and send
  // nothing.
  function startCountdown(text, fp) {
    clearCountdown();
    setCountdown(10);
    countdownRef.current = setInterval(() => {
      setCountdown((s) => {
        if (s == null) return null;
        if (s <= 1) { clearCountdown(); send({ body: text, fp }); return null; }
        return s - 1;
      });
    }, 1000);
  }
  async function draftAndSend() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || "Couldn't draft that reply just now. Try again."); return; }
      setDraft(json.draft || '');
      setFingerprint(json.fingerprint || null);
      setSources(json.basedOn?.sources || []);
      setThreadAgeDays(json.threadAgeDays ?? null);
      setSent(false);
      if (json.draft) startCountdown(json.draft, json.fingerprint || null);
    } catch {
      setError("Couldn't draft that reply just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    clearCountdown();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || "Couldn't draft that reply just now. Try again."); return; }
      setDraft(json.draft || '');
      setFingerprint(json.fingerprint || null);
      setSources(json.basedOn?.sources || []);
      setThreadAgeDays(json.threadAgeDays ?? null);
      setSent(false);
    } catch {
      setError("Couldn't draft that reply just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function send(overrides = {}) {
    if (sending || sent) return;
    const bodyText = overrides.body ?? draft;
    const fp = overrides.fp ?? fingerprint;
    clearCountdown();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/reply-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId, body: bodyText, fingerprint: fp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's refusals are already written for a person to read:
        // "A newer message came in", "This person unsubscribed".
        setError(json?.error || "Couldn't send that reply. Nothing was sent. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't send that reply. Nothing was sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (!draft && !busy && !error) {
    return (
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <button
          onClick={generate}
          className="inline-flex items-center gap-1.5 ui-small font-semibold px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
        >
          <Icon name="pencil" className="w-3.5 h-3.5" />
          Draft reply
        </button>
        {/* The one-button walk: writes the draft, shows it, sends after a
            cancellable countdown. Editing or Cancel turns it back into an
            ordinary draft. */}
        <button
          onClick={draftAndSend}
          title="Writes the draft, shows it for ten seconds, then sends unless you cancel or edit"
          className="inline-flex items-center gap-1.5 ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition"
        >
          <Icon name="pencil" className="w-3.5 h-3.5" />
          Draft &amp; send
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3">
      {busy && (
        <div className="flex items-center gap-2">
          <BloomSpinner size={16} />
          <span className="ui-small text-ink-2">Reading the conversation…</span>
        </div>
      )}

      {error && (
        <div className="ui-small text-ink-2 mb-2">
          {error}{' '}
          <button onClick={generate} className="underline hover:text-ink transition">Try again</button>
        </div>
      )}

      {!busy && draft && (
        <>
          {countdown != null && (
            <div className="mb-1.5 flex items-center gap-2 r-md border border-rose-line bg-rose-tint px-3 py-2">
              <BloomSpinner size={14} />
              <span className="ui-small font-semibold text-rose-text num-tabular">
                Sending in {countdown}s…
              </span>
              {/* Rendered only inside the `draft &&` block, so this render's
                  draft and fingerprint are the live ones — unlike the interval
                  closure, which has to carry them explicitly. */}
              <button
                onClick={() => send()}
                className="ui-small font-semibold px-2.5 py-1 r-md btn-bloom transition"
              >
                Send now
              </button>
              <button
                onClick={clearCountdown}
                className="ui-small font-medium px-2.5 py-1 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                Cancel
              </button>
              <span className="ui-meta text-ink-3">Typing in the draft also stops it.</span>
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setCopied(false); clearCountdown(); }}
            rows={9}
            className="w-full ui-body text-ink r-md border border-line-strong bg-card px-3 py-2 leading-relaxed"
            aria-label="Draft reply"
          />
          {sources.length > 0 && (
            <p className="ui-meta text-ink-3 mt-1">
              Using: {sources.join(' · ')}
            </p>
          )}
          {threadAgeDays > 45 && !sent && (
            <p className="ui-meta font-medium text-poppy-text mt-1">
              This conversation is {threadAgeDays} days old. Your reply will start a new email, not thread into the old one.
            </p>
          )}
          <p className="ui-meta text-ink-3 mt-1 mb-2">
            {sent
              ? 'Sent. They have it.'
              : threadAgeDays > 45
                ? 'Read it and change anything before it goes.'
                : 'Read it and change anything before it goes. Send puts it in the same Gmail thread.'}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* The deliberate one. Filled, because it is the action the whole
                block exists for, and disabled while in flight so a second
                click cannot post a second copy. */}
            <button
              onClick={send}
              disabled={sending || sent}
              className="ui-small font-semibold px-3 py-1.5 r-md btn-bloom transition disabled:opacity-60 inline-flex items-center gap-1.5"
            >
              {sending && <BloomSpinner size={14} />}
              {sent ? 'Sent' : sending ? 'Sending…' : 'Send reply'}
            </button>
            <button
              onClick={() => { navigator.clipboard?.writeText(draft); setCopied(true); }}
              className="ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={generate}
              disabled={busy}
              className="ui-small font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
            >
              Regenerate
            </button>
            <button
              onClick={() => { clearCountdown(); setDraft(''); setError(null); setCopied(false); }}
              className="ui-small font-medium px-3 py-1.5 r-md text-ink-2 hover:text-ink transition"
            >
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SectionTitle() {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      {/* An icon the set actually has. `message-circle` is not one of them and
          rendered as nothing at all. Serif ink, like the drawer's other
          section heads — the tiny gray caps read as a caption, not a place. */}
      <Icon name="mail-open" className="w-[16px] h-[16px] text-rose-text" strokeWidth={1.8} />
      <span className="font-serif ui-heading text-ink">Conversation</span>
    </div>
  );
}
