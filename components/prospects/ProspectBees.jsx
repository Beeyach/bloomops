'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { toast } from '../../lib/toast.mjs';
import { beeAccess } from '../../lib/bee-access.mjs';
import { appendEntry, lastReplyText } from '../../lib/activity-log.mjs';
import { replyPatch } from '../../lib/prospect-parse.mjs';

// The four prospect-scoped bees, in the drawer where the prospect already
// is. Each one reads the whole record server-side (audit profile, video and
// watch state, timeline, Ary's notes), so none of that has to be re-typed.
//
// Nothing here writes to the record except the voice note, and that only
// after the plan is shown and confirmed.

const BEES = [
  {
    id: 'reply-coach',
    label: 'Draft a reply',
    icon: 'message',
    hint: 'Paste what they wrote back. The draft answers it in your voice, using their audit and what they watched.',
    needsReply: true,
    resultKey: 'draft',
  },
  {
    id: 'call-prep',
    label: 'Call brief',
    icon: 'file',
    hint: 'A one-pager before a call: who they are, what is broken, what they watched, and the three questions to ask.',
    resultKey: 'brief',
  },
  {
    id: 'proposal',
    label: 'Fill proposal',
    icon: 'briefcase',
    hint: 'Fills your proposal template with their findings and platform. Your tiers and prices are never changed.',
    resultKey: 'proposal',
  },
];

export default function ProspectBees({ prospect, onPatch }) {
  const [access, setAccess] = useState(null);
  const [open, setOpen] = useState(null); // bee id
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null); // { id, text }
  const [replyText, setReplyText] = useState('');
  // Whether Gmail already holds this conversation. When it does, the paste
  // box below is not the flow — the Conversation section is — and offering a
  // paste-first path taught exactly the habit this app exists to end.
  const [gmailSynced, setGmailSynced] = useState(null);
  const [copied, setCopied] = useState(false);

  // Voice note state.
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [plan, setPlan] = useState(null); // { patch, summary }
  const recRef = useRef(null);

  useEffect(() => { beeAccess().then(setAccess); }, []);

  // Checked only when the reply bee is opened, and only once per prospect:
  // the answer decides whether the paste box exists at all.
  useEffect(() => {
    if (open !== 'reply-coach' || gmailSynced !== null || !prospect?.id) return;
    let alive = true;
    fetch(`/api/prospects/${prospect.id}/gmail-thread`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setGmailSynced(Boolean(d?.messages?.length)); })
      .catch(() => { if (alive) setGmailSynced(false); });
    return () => { alive = false; };
  }, [open, gmailSynced, prospect?.id]);
  // Prefilled from whatever already recorded their reply: the drawer's "what
  // did they say" box, or the reply-sync skill's REPLYSYNC line in the notes.
  // Pasting is the fallback, not the routine.
  // Which prospect a request belongs to. The drawer stays mounted while the
  // arrow keys walk the list, so a call started on Dave used to resolve into
  // Maria's drawer: her screen showed his brief, and worse, applying his voice
  // note wrote his stage and dates onto her record. Every response now checks
  // that the drawer is still on the prospect it was asked about.
  const forId = useRef(prospect?.id);
  useEffect(() => {
    forId.current = prospect?.id;
    setResult(null); setPlan(null); setTranscript(''); setOpen(null);
    setGmailSynced(null);
    setBusy(null);
    stopListening();
    setReplyText(lastReplyText(prospect || {}));
  }, [prospect?.id]);

  // A recognizer left running keeps the microphone open after the drawer is
  // closed, with Chrome's recording dot lit until the tab dies.
  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);

  if (!access) return null;
  if (!access.allowed) {
    return (
      <p className="text-[12px] text-ink-3 leading-snug">
        The Hive bees are not switched on for this workspace yet.
      </p>
    );
  }

  async function run(bee) {
    if (bee.needsReply && !replyText.trim()) {
      setOpen(bee.id);
      return;
    }
    setBusy(bee.id);
    setResult(null);
    const asked = prospect.id;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: bee.id, prospectId: prospect.id, replyText }),
      });
      const data = await res.json().catch(() => ({}));
      if (asked !== forId.current) return; // the drawer moved on
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult({ id: bee.id, text: data[bee.resultKey] || '' });
    } catch (e) {
      if (asked === forId.current) toast(e.message, { tone: 'error' });
    } finally {
      if (asked === forId.current) setBusy(null);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Your browser blocked clipboard access.', { tone: 'error' });
    }
  }

  // ── Voice note ─────────────────────────────────────────────────────────
  // Chrome's own speech recognition does the listening, so no audio ever
  // leaves the machine and there is nothing to pay for. Only the finished
  // text goes to the bee.
  const speechOk = typeof window !== 'undefined'
    && (window.SpeechRecognition || window.webkitSpeechRecognition);

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      toast(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Could not hear that (${e.error}).`, { tone: 'error' });
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setTranscript('');
    setPlan(null);
    setListening(true);
    rec.start();
  }

  function stopListening() {
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }

  async function readNote() {
    if (!transcript.trim()) return;
    setBusy('voice-note');
    const asked = prospect.id;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'voice-note', prospectId: prospect.id, transcript }),
      });
      const data = await res.json().catch(() => ({}));
      if (asked !== forId.current) return; // do not put Dave's note on Maria
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.plan || !Object.keys(data.plan).length) {
        toast('Nothing in that note changes the record. Saved nothing.');
        setPlan(null);
      } else {
        setPlan({ patch: data.plan, summary: data.summary });
      }
    } catch (e) {
      toast(e.message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function applyPlan() {
    const p = plan.patch;
    const patch = {};
    if (p.note) patch.activity_log = appendEntry(prospect.activity_log, 'note', p.note);
    if (p.stage) patch.stage = p.stage;
    if (p.next_action_date) patch.next_action_date = p.next_action_date;
    if (p.call_booked) patch.call_booked = 1;
    if (p.proposal_sent) patch.proposal_sent = 1;
    if (p.reply_type) Object.assign(patch, replyPatch(prospect, p.reply_type));
    // Awaited, and the plan is kept until it lands. Before this it announced
    // success immediately, cleared the plan and the transcript, and then a
    // rejected save produced a second, contradicting toast with nothing left
    // to retry from.
    try {
      await onPatch(patch);
      setPlan(null);
      setTranscript('');
      toast('Applied to the record.');
    } catch (e) {
      toast(`Could not apply that. ${e?.message || e}`, { tone: 'error' });
    }
  }

  const planLines = plan
    ? Object.entries(plan.patch).map(([k, v]) => {
        const label = { note: 'Note', stage: 'Stage', next_action_date: 'Follow up on', reply_type: 'They answered', call_booked: 'Call booked', proposal_sent: 'Proposal sent' }[k] || k;
        return `${label}: ${v === 1 ? 'yes' : String(v).slice(0, 120)}`;
      })
    : [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {BEES.map((bee) => (
          <button
            key={bee.id}
            onClick={() => (bee.needsReply && open !== bee.id ? setOpen(bee.id) : run(bee))}
            disabled={!!busy}
            title={bee.hint}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-line-strong text-ink hover:border-rose hover:text-rose-text transition disabled:opacity-50"
          >
            <Icon name={bee.icon} className="w-3.5 h-3.5" />
            {busy === bee.id ? 'Thinking…' : bee.label}
          </button>
        ))}
        {speechOk && (
          <button
            onClick={listening ? stopListening : startListening}
            title="Say what happened and it turns into updates: a note, a stage, a follow-up date. Nothing is saved until you confirm."
            className={'inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border transition ' + (
              listening ? 'border-rose bg-rose text-white' : 'border-line-strong text-ink hover:border-rose hover:text-rose-text'
            )}
          >
            <Icon name="mic" className="w-3.5 h-3.5" />
            {listening ? 'Listening, tap to stop' : 'Voice note'}
          </button>
        )}
      </div>

      {open === 'reply-coach' && gmailSynced === null && (
        <p className="text-[12px] text-ink-3">Checking Gmail…</p>
      )}
      {open === 'reply-coach' && gmailSynced === true && (
        <p className="text-[12.5px] text-ink-2 leading-snug">
          This conversation is synced from Gmail. Use <span className="font-semibold">Draft reply</span> in
          the Conversation section above — there is nothing to paste.
        </p>
      )}
      {open === 'reply-coach' && gmailSynced === false && (
        <div className="space-y-1.5">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={4}
            placeholder="Gmail message unavailable. Paste the missing message here only if needed."
            title="Filled in from the reply already logged on this prospect, by you or by the reply sync. Paste over it if you have their fuller wording."
            className="w-full border border-line rounded-[8px] px-2.5 py-2 text-[12.5px] leading-relaxed text-ink bg-input-bg resize-y focus:outline-none focus:border-rose"
          />
          <p className="text-[11.5px] text-ink-3 leading-snug">
            Gmail could not supply this conversation, so this is the fallback: paste their message if you have it.
          </p>
          <button
            onClick={() => run(BEES[0])}
            disabled={busy === 'reply-coach' || !replyText.trim()}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition disabled:opacity-50"
          >
            {busy === 'reply-coach' ? 'Writing…' : 'Draft the reply'}
          </button>
        </div>
      )}

      {(transcript || listening) && (
        <div className="border border-line rounded-[8px] px-2.5 py-2 space-y-1.5">
          <p className="text-[12.5px] text-ink leading-relaxed whitespace-pre-wrap">
            {transcript || 'Listening…'}
          </p>
          {!listening && transcript && !plan && (
            <button
              onClick={readNote}
              disabled={busy === 'voice-note'}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition disabled:opacity-50"
            >
              {busy === 'voice-note' ? 'Reading…' : 'Turn into updates'}
            </button>
          )}
        </div>
      )}

      {plan && (
        <div className="border border-rose-line rounded-[8px] px-2.5 py-2 space-y-1.5 bg-blush-soft">
          <p className="text-[12px] font-semibold text-ink">This will change:</p>
          <ul className="text-[12.5px] text-ink-2 space-y-0.5">
            {planLines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <div className="flex gap-1.5">
            <button onClick={applyPlan} className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition">Apply</button>
            <button onClick={() => setPlan(null)} className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition">Discard</button>
          </div>
        </div>
      )}

      {result && (
        <div className="border border-line rounded-[8px] px-2.5 py-2 space-y-1.5">
          <div className="text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-h-[300px] overflow-y-auto slim-scroll">
            {result.text}
          </div>
          <div className="flex gap-1.5">
            <button onClick={copyResult} className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => setResult(null)} className="text-[12px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
