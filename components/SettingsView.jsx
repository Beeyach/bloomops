'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ENGINE_SETTINGS, LEAD_PLATFORMS } from '@/lib/engine-prompts.mjs';
import useTheme from './useTheme';
import useTextSize from './useTextSize';
import { TEXT_SIZES } from '@/lib/text-size.mjs';
import InfoTip from './InfoTip';
import { senderName } from '@/lib/gmail-send.mjs';
import GmailCard from './GmailCard';
import EconomicsCard from './EconomicsCard';
import BaselineCard from './BaselineCard';
import { Icon } from './Icons';

// Section label.
function Label({ children }) {
  // Apify-style field labels: normal case, semibold, readable — not a
  // tracked-uppercase whisper.
  return (
    <div className="text-[13px] font-semibold text-charcoal mb-1.5">
      {children}
    </div>
  );
}

// Editable list of one-line rule strings.
// One chip per stage. Lit = it appears in the dropdown, dimmed = hidden.
// Clicking toggles. There is deliberately no "delete stage" here — a stage
// with leads on it should never vanish out from under them.
function StageToggles({ stages, hidden, onChange }) {
  const hiddenSet = new Set(hidden);
  const shownCount = stages.filter((s) => !hiddenSet.has(s)).length;

  function toggle(stage) {
    const next = new Set(hidden);
    if (next.has(stage)) next.delete(stage);
    // Keep at least one stage standing — an empty dropdown is a dead end.
    else if (shownCount > 1) next.add(stage);
    onChange([...next]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.map((s) => {
        const isHidden = hiddenSet.has(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            aria-pressed={!isHidden}
            title={isHidden ? `${s} is hidden from the dropdown` : `${s} shows in the dropdown`}
            className={`px-2.5 py-1 rounded-[8px] text-[12px] font-medium border transition cursor-pointer ${
              isHidden
                ? 'border-line-strong text-ink-2 bg-transparent hover:text-ink'
                : 'border-rose-line text-rose-text bg-rose-tint hover:brightness-110'
            }`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

// A settings group: icon tile, serif heading, one-line subtitle, then its
// fields. The id anchors the sticky rail. Preferences and Admin pass a neutral
// tile so the page is not all rose.
function SectionCard({ id, icon, title, subtitle, tone = 'rose', children }) {
  const tile = tone === 'neutral' ? 'bg-control-bg text-ink-2' : 'bg-rose-tint text-rose-text';
  return (
    <section id={`set-${id}`} data-set-section={id} className="scroll-mt-4">
      <div className="flex items-start gap-3 mb-3">
        <span className={`shrink-0 w-[34px] h-[34px] rounded-[10px] inline-flex items-center justify-center ${tile}`}>
          <Icon name={icon} className="w-[17px] h-[17px]" />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="font-serif text-[20px] leading-tight text-bright">{title}</h2>
          {subtitle && <p className="text-[12.5px] text-ink-3 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="rounded-[16px] border border-line-strong bg-panel shadow-card p-5">{children}</div>
    </section>
  );
}

// Color-coded rule chips: a dot, the text, and an ✕, plus a dashed "add" chip
// that reveals an inline input. Same rules-in / onChange-out contract as the
// old RuleList, so nothing about how green/red rules are stored changes.
function ChipList({ rules, onChange, tone, addLabel }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  const dot = tone === 'green' ? 'bg-leaf' : 'bg-poppy';
  const chip =
    tone === 'green'
      ? 'border-leaf/40 bg-leaf/10 text-leaf-text'
      : 'border-poppy/40 bg-poppy/10 text-poppy-text';
  function commit() {
    const t = draft.trim();
    if (t) onChange([...rules, t]);
    setDraft('');
    setAdding(false);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {rules.map((rule, i) => (
        <span key={`${rule}-${i}`} className={`inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full border text-[12px] ${chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
          <span className="max-w-[280px] truncate">{rule}</span>
          <button
            onClick={() => onChange(rules.filter((_, j) => j !== i))}
            className="opacity-60 hover:opacity-100 transition"
            aria-label="Remove"
          >
            <Icon name="x" className="w-3 h-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(''); setAdding(false); } }}
          onBlur={commit}
          placeholder="Type it, Enter to add"
          className="text-[12px] bg-input-bg border border-line rounded-full px-3 py-1 text-ink focus:outline-none focus:border-rose min-w-[180px]"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-line-strong text-[12px] text-ink-3 hover:text-ink hover:border-rose transition"
        >
          <Icon name="plus" className="w-3 h-3" /> {addLabel}
        </button>
      )}
    </div>
  );
}

// Voice samples as quoted cards with a rose left border, plus an add row. Same
// list contract as before.
function VoiceSamples({ samples, onChange }) {
  const [draft, setDraft] = useState('');
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...samples, t]);
    setDraft('');
  }
  return (
    <div className="space-y-2">
      {samples.length > 0 && (
        <ul className="space-y-2">
          {samples.map((s, i) => (
            <li key={`${s}-${i}`} className="group flex items-start gap-2">
              <p className="flex-1 text-[13px] text-ink-2 leading-relaxed border-l-2 border-rose-line bg-card-hover rounded-r-lg pl-3 pr-3 py-2 italic">
                {s}
              </p>
              <button
                onClick={() => onChange(samples.filter((_, j) => j !== i))}
                className="mt-1 text-ink-3 hover:text-poppy-text transition"
                aria-label="Remove sample"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Paste a real message you sent that got a reply"
          className="flex-1 bg-input-bg border border-line rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-ink-3/60 focus:outline-none focus:border-rose"
        />
        <button onClick={add} className="px-3.5 py-2 text-[12px] font-semibold rounded-lg bg-control-bg text-ink border border-line hover:border-rose transition">
          Add
        </button>
      </div>
    </div>
  );
}

// The sticky left section rail. Clicking scrolls to a section; the active item
// is tracked by which section is nearest the top of the viewport.
// The workspace 5-email template. One place to write the sequence; the
// sequence modal fills [name]/[business]/[website] per prospect and COPIES
// — editing here never rewrites emails already stored on rows.
function SequenceTemplateEditor({ value, onChange, inputCls }) {
  const entries = Array.isArray(value) ? value : [];
  const get = (n) => entries.find((e) => Number(e.number) === n) || { number: n, subject: '', body: '' };
  const set = (n, field, v) => {
    const others = entries.filter((e) => Number(e.number) !== n);
    const mine = { ...get(n), [field]: v };
    const next = [...others, mine]
      .filter((e) => String(e.subject || '').trim() || String(e.body || '').trim())
      .sort((a, b) => a.number - b.number);
    onChange(next);
  };
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-ink-3">
        Placeholders fill in per prospect when applied: <b className="text-ink-2">[name]</b> (first name),
        <b className="text-ink-2"> [full name]</b>, <b className="text-ink-2">[business]</b>,
        <b className="text-ink-2"> [website]</b>. Leave an email fully blank to skip it.
      </p>
      {[1, 2, 3, 4, 5].map((n) => {
        const e = get(n);
        return (
          <div key={n}>
            <Label>Email {n}</Label>
            <input
              value={e.subject}
              onChange={(ev) => set(n, 'subject', ev.target.value)}
              placeholder={`Subject for email ${n}`}
              className={inputCls + ' mb-1.5'}
            />
            <textarea
              value={e.body}
              onChange={(ev) => set(n, 'body', ev.target.value)}
              placeholder={`Body for email ${n} — [name], [business] and [website] fill in per prospect`}
              rows={3}
              className={inputCls + ' resize-y leading-relaxed'}
            />
          </div>
        );
      })}
    </div>
  );
}

const SETTINGS_SECTIONS = [
  { id: 'offer', icon: 'briefcase', label: 'Your offer' },
  { id: 'scoring', icon: 'check-circle', label: 'Lead scoring' },
  { id: 'voice', icon: 'message', label: 'Your voice' },
  { id: 'template', icon: 'mail-open', label: 'Email template' },
  { id: 'sending', icon: 'send', label: 'Sending' },
  { id: 'pipeline', icon: 'list-todo', label: 'Pipeline' },
  { id: 'sources', icon: 'search', label: 'Sources' },
  { id: 'preferences', icon: 'settings', label: 'Preferences' },
];

function SettingsRail({ items, active, onJump }) {
  return (
    <nav className="settings-rail sticky top-2 self-start">
      <ul className="space-y-0.5">
        {items.map((s) => {
          const on = active === s.id;
          return (
            <li key={s.id}>
              <button
                onClick={() => onJump(s.id)}
                className={`w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg text-[13px] transition ${
                  on ? 'text-rose-text bg-rose-tint shadow-[inset_2.5px_0_0_0_var(--rose)]' : 'text-ink-3 hover:text-ink hover:bg-hover-wash-soft'
                }`}
              >
                <Icon name={s.icon} className="w-[15px] h-[15px] shrink-0" />
                {s.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function SettingsView({ stages = [] }) {
  const { theme, setTheme } = useTheme();
  const { size, setSize } = useTextSize();
  const [settings, setSettings] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // "Your name" is per-device localStorage, not an engine setting, so the
  // Save button below can never light up for it. It needs to confirm itself
  // or the field looks unsaved forever.
  const [nameSaved, setNameSaved] = useState(false);
  const nameTimer = useRef(null);
  useEffect(() => () => clearTimeout(nameTimer.current), []);
  // API keys and tokens are admin territory — regular workspaces run on
  // whatever the admin configured and never see these fields.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/limits')
      .then((r) => r.json())
      .then((d) => { if (alive) setIsAdmin(Boolean(d?.isAdmin)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = { ...DEFAULT_ENGINE_SETTINGS, ...(d.settings || {}) };
        setSettings(s);
        setSavedSnapshot(JSON.stringify(s));
      })
      .catch(() => setError('Could not load settings.'));
  }, []);

  // Which section the sticky rail highlights: whichever is nearest the top.
  const [activeSection, setActiveSection] = useState('offer');
  useEffect(() => {
    const secs = [...document.querySelectorAll('[data-set-section]')];
    if (!secs.length) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActiveSection(vis.target.dataset.setSection);
      },
      { rootMargin: '-8% 0px -72% 0px' }
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [settings, isAdmin]);
  const jumpTo = (id) => document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!settings) {
    if (error) return <div className="text-center text-poppy-text text-sm py-16">{error}</div>;
    return (
      <div className="max-w-[720px] mx-auto py-8 space-y-3" aria-hidden="true">
        <div className="skeleton h-8 w-40 mb-5" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-2/3" />
      </div>
    );
  }

  const dirty = JSON.stringify(settings) !== savedSnapshot;
  const patch = (p) => setSettings((s) => ({ ...s, ...p }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const d = await res.json();
      setSettings(d.settings);
      setSavedSnapshot(JSON.stringify(d.settings));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'w-full bg-input-bg border border-line rounded-lg px-3 py-2 text-[13px] text-ink placeholder:text-ink-3/60 focus:outline-none focus:border-rose transition';

  return (
    <div className="canvas-read">
      <div className="mb-6">
        <h1 className="font-serif text-[30px] leading-tight text-bright">Settings</h1>
        <p className="text-[13px] text-ink-3 mt-0.5">Teach the app who you are and how you work. It only takes ten minutes, and you only do it once.</p>
      </div>

      <div className="settings-grid">
        <SettingsRail
          items={isAdmin ? [...SETTINGS_SECTIONS, { id: 'admin', icon: 'lock', label: 'Admin' }] : SETTINGS_SECTIONS}
          active={activeSection}
          onJump={jumpTo}
        />

        <div className="max-w-[600px] w-full space-y-8">
          {/* 1. Your offer */}
          <SectionCard id="offer" icon="briefcase" title="Your offer" subtitle="What you sell and who you sell it to. Every prompt reads this first.">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>
                    Your name
                    <InfoTip title="Where does this show up?">
                      On every email that goes out, as the sender. It is the first thing a stranger
                      sees, before they read a word. It is also the name the AI writes on your behalf.
                    </InfoTip>
                  </Label>
                  <input value={settings.operatorName || ''} onChange={(e) => patch({ operatorName: e.target.value })}
                    placeholder="e.g. Ary" className={inputCls} />
                </div>
                <div>
                  <Label>Your business name</Label>
                  <input value={settings.businessName || ''} onChange={(e) => patch({ businessName: e.target.value })}
                    placeholder="e.g. Bloomwired" className={inputCls} />
                </div>
              </div>
              {/* Shown rather than described.
                  The old note under Your name said "nothing here is ever shown
                  to a prospect on its own", which stopped being true the day
                  the app started sending its own email: the name goes straight
                  into the From line. It arrived reading "Ary", which tells a
                  stranger nothing, and nowhere on this screen said it would. */}
              {senderName(settings) ? (
                <p className="text-[12px] text-ink-2">
                  Your emails arrive from{' '}
                  <span className="font-semibold text-ink">{senderName(settings)}</span>. That is the
                  name a stranger sees first.
                </p>
              ) : null}
              <div>
                <Label>What you sell</Label>
                <textarea value={settings.offer} onChange={(e) => patch({ offer: e.target.value })} rows={2}
                  placeholder="e.g. Social media management and content for small service businesses" className={inputCls} />
              </div>
              <div>
                <Label>Who you sell to</Label>
                <textarea value={settings.audience} onChange={(e) => patch({ audience: e.target.value })} rows={2}
                  placeholder="e.g. Coaches, realtors and clinic owners who are too busy to post" className={inputCls} />
              </div>
              <div>
                <Label>
                  Positioning sentence
                  <InfoTip title="What makes a good one?">
                    One sentence: I help [who] get [result] through [method]. If it could describe five businesses, tighten it. This is what the AI leans on to tell a fit from a near-miss.
                  </InfoTip>
                </Label>
                <textarea value={settings.positioning || ''} onChange={(e) => patch({ positioning: e.target.value })} rows={2}
                  placeholder="I help [who] get [result] through [method]." className={inputCls} />
              </div>
            </div>
          </SectionCard>

          {/* 2. Lead scoring */}
          <SectionCard id="scoring" icon="check-circle" title="Lead scoring" subtitle="What makes a lead worth reaching out to, and what makes it a skip.">
            <div className="space-y-4">
              <div>
                <Label>Green-light signals</Label>
                <ChipList rules={settings.greenRules} onChange={(greenRules) => patch({ greenRules })} tone="green" addLabel="Add signal" />
              </div>
              <div>
                <Label>Red flags</Label>
                <ChipList rules={settings.redRules} onChange={(redRules) => patch({ redRules })} tone="red" addLabel="Add flag" />
              </div>
            </div>
          </SectionCard>

          {/* 3. Your voice */}
          <SectionCard id="voice" icon="message" title="Your voice" subtitle="A few real DMs that got replies. Voice is patterns, not vocabulary.">
            <VoiceSamples samples={settings.voiceSamples || []} onChange={(voiceSamples) => patch({ voiceSamples })} />
          </SectionCard>

          {/* Email template */}
          <SectionCard id="template" icon="mail-open" title="Email template" subtitle="Write the 5-email sequence once. Apply it to any prospect from their Emails cell.">
            <SequenceTemplateEditor
              value={settings.sequenceTemplate || []}
              onChange={(sequenceTemplate) => patch({ sequenceTemplate })}
              inputCls={inputCls}
            />
          </SectionCard>

          {/* Sending. One switch, defaulting to off, that the operator flips
              herself. It gates the engine's follow-up sender only: everything
              it may transmit was approved word for word (the fingerprint check
              refuses edited copy), and every send-time refusal — the window,
              the caps, a reply arriving first — stays in force. First emails
              are a separate switch that this section deliberately does not
              offer. */}
          <SectionCard id="sending" icon="send" title="Sending" subtitle="What the engine may send without another tap from you.">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label>Auto-send approved follow-ups</Label>
                <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">
                  Sends follow-ups you approved, word for word, on their scheduled day. Only inside your
                  send window ({settings.sendWindowStartHour}:00–{settings.sendWindowEndHour}:00, {settings.workspaceTimezone}),
                  at most {settings.hourlySendLimit} an hour and {settings.dailySendLimit} a day. If someone replies first,
                  their follow-up is cancelled. This switch never touches first emails, and editing an
                  approved draft takes its approval away until you approve it again.
                </p>
              </div>
              <button
                onClick={() => patch({ autoSendApprovedFollowups: !settings.autoSendApprovedFollowups })}
                aria-pressed={Boolean(settings.autoSendApprovedFollowups)}
                className={`shrink-0 px-4 py-1.5 text-[13px] font-semibold rounded-lg border transition ${
                  settings.autoSendApprovedFollowups
                    ? 'btn-bloom border-transparent'
                    : 'bg-input-bg text-ink border-line-strong hover:border-rose'
                }`}
              >
                {settings.autoSendApprovedFollowups ? 'On' : 'Off'}
              </button>
            </div>
            {settings.autoSendApprovedFollowups && JSON.stringify(settings) !== savedSnapshot && (
              <p className="text-[12px] text-rose-text mt-3">
                Takes effect when you press Save.
              </p>
            )}
          </SectionCard>

          {/* 4. Pipeline */}
          <SectionCard id="pipeline" icon="list-todo" title="Pipeline" subtitle="The stages you actually use. Switch off the rest so they leave the dropdown.">
            <StageToggles stages={stages} hidden={settings.hiddenStages || []} onChange={(hiddenStages) => patch({ hiddenStages })} />
          </SectionCard>

          {/* 5. Sources */}
          <SectionCard id="sources" icon="search" title="Sources" subtitle="The platforms you hunt leads on.">
            <div className="flex flex-wrap gap-2">
              {LEAD_PLATFORMS.map((p) => {
                const on = settings.platforms.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => patch({ platforms: on ? settings.platforms.filter((x) => x !== p) : [...settings.platforms, p] })}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-full border transition ${
                      on ? 'btn-bloom border-transparent' : 'bg-input-bg text-ink border-line-strong hover:border-rose'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* 6. Preferences */}
          <SectionCard id="preferences" icon="settings" tone="neutral" title="Preferences" subtitle="Appearance and your name. Saved on this device only.">
            <div className="space-y-4">
              <div>
                <Label>Appearance</Label>
                <div className="inline-flex r-lg border border-line p-0.5 bg-input-bg">
                  {['light', 'dark'].map((t) => (
                    <button key={t} onClick={() => setTheme(t)}
                      className={`px-4 py-1.5 r-sm ui-small font-semibold transition ${
                        theme === t ? 'text-rose-text bg-rose-tint' : 'text-ink-2 hover:text-ink'
                      }`}>
                      {t === 'light' ? 'Light' : 'Dark'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Chapter 9. Two chapters in a row raised the type scale by
                  guessing at somebody else's eyes on somebody else's monitor;
                  this stops guessing. Stored in this browser, not the
                  workspace — the same person on a laptop and a 27" monitor
                  wants different answers. */}
              <div>
                <Label>Text size</Label>
                <div className="inline-flex r-lg border border-line p-0.5 bg-input-bg" role="radiogroup" aria-label="Text size">
                  {TEXT_SIZES.map((t) => (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={size === t.id ? 'true' : 'false'}
                      onClick={() => setSize(t.id)}
                      title={t.hint}
                      className={`px-4 py-1.5 r-sm ui-small font-semibold transition ${
                        size === t.id ? 'text-rose-text bg-rose-tint' : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="ui-meta text-ink-2 mt-1.5">
                  {(TEXT_SIZES.find((t) => t.id === size) || TEXT_SIZES[0]).hint}
                </p>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5" htmlFor="ltb-name">Your name</label>
                <input id="ltb-name"
                  defaultValue={typeof window !== 'undefined' ? (() => { try { return localStorage.getItem('ltb_name') || ''; } catch (e) { return ''; } })() : ''}
                  onChange={(e) => {
                    try {
                      localStorage.setItem('ltb_name', e.target.value.trim());
                      setNameSaved(true);
                      clearTimeout(nameTimer.current);
                      nameTimer.current = setTimeout(() => setNameSaved(false), 1600);
                    } catch (err) {}
                  }}
                  placeholder="Used in the Today greeting"
                  className={inputCls + ' max-w-[280px]'} />
                <span aria-live="polite" className={`block mt-1 text-[12px] text-leaf-text transition-opacity duration-500 ${nameSaved ? 'opacity-100' : 'opacity-0'}`}>
                  Saved on this device
                </span>
              </div>
            </div>
          </SectionCard>

          {/* Admin */}
          {isAdmin && (
            <SectionCard id="admin" icon="lock" tone="neutral" title="Admin" subtitle="Keys, tokens, the video voice, and workspace allowances. Only you see these.">
              <div className="space-y-5">
                <div>
                  <Label>
                    AI Hive key (Anthropic or OpenAI)
                    <InfoTip title="What is an API key?">
                      An API key is a password that lets this app use Claude or ChatGPT on your account. It is a separate thing from a chat subscription, so having one of those does not give you this. You get a key at console.anthropic.com for Claude or platform.openai.com for ChatGPT, put a bit of credit on it, and paste it here. Each run uses a little of that credit. Nothing is shared with anyone else.
                    </InfoTip>
                  </Label>
                  <p className="text-[12px] text-ink-3 mb-2">Makes the one-click scoring, drafting and reports work. Your key, your cost. Encrypted and never shown again.</p>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input type="password" value={settings.aiKey === '__clear__' ? '' : (settings.aiKey || '')}
                      onChange={(e) => patch({ aiKey: e.target.value })}
                      placeholder={settings.aiKeySet && settings.aiKey !== '__clear__' ? 'Key saved ✓. Paste a new one to replace' : 'sk-ant-... or sk-...'}
                      autoComplete="off" className={inputCls + ' flex-1 min-w-[220px]'} />
                    {settings.aiKeySet && (
                      <button onClick={() => patch({ aiKey: settings.aiKey === '__clear__' ? '' : '__clear__' })}
                        className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition ${settings.aiKey === '__clear__' ? 'border-poppy text-poppy-text' : 'border-line text-ink-3 hover:text-ink'}`}
                        title="Removes the saved key when you press Save">
                        {settings.aiKey === '__clear__' ? 'Will remove on save' : 'Remove key'}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Label>
                    Model
                    <InfoTip title="Which model?">
                      Which Claude or ChatGPT model the Hive runs on. Leave it as claude-sonnet-5 unless you have a reason to change it; a typo here makes every Hive run fail.
                    </InfoTip>
                  </Label>
                  <input value={settings.aiModel || ''} onChange={(e) => patch({ aiModel: e.target.value })}
                    placeholder="claude-sonnet-5" className={inputCls + ' max-w-[280px]'} />
                </div>
                <div>
                  <Label>
                    Apify token (lead sourcing)
                    <InfoTip title="What is Apify?">
                      Apify is a website at apify.com that runs ready made scrapers for you. A scraper is just a program that reads public pages and writes down what it finds. You pick one, tell it what to search, and the results collect on their servers. The free plan comes with a monthly allowance that covers a lot of lead hunting. The token is the password that lets this app use your account, and you find it on Apify under Settings, then Integrations.
                    </InfoTip>
                  </Label>
                  <p className="text-[12px] text-ink-3 mb-2">Runs the Facebook and Maps scans when no shared token is set. Never touches your own social accounts. Encrypted and never shown again.</p>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input type="password" value={settings.apifyToken === '__clear__' ? '' : (settings.apifyToken || '')}
                      onChange={(e) => patch({ apifyToken: e.target.value })}
                      placeholder={settings.apifyTokenSet && settings.apifyToken !== '__clear__' ? 'Token saved ✓. Paste a new one to replace' : 'apify_api_...'}
                      autoComplete="off" className={inputCls + ' flex-1 min-w-[220px]'} />
                    {settings.apifyTokenSet && (
                      <button onClick={() => patch({ apifyToken: settings.apifyToken === '__clear__' ? '' : '__clear__' })}
                        className={`text-[12px] font-medium px-2.5 py-1.5 rounded-lg border transition ${settings.apifyToken === '__clear__' ? 'border-poppy text-poppy-text' : 'border-line text-ink-3 hover:text-ink'}`}
                        title="Removes the saved token when you press Save">
                        {settings.apifyToken === '__clear__' ? 'Will remove on save' : 'Remove token'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="pt-1 border-t border-line">
                  <VoiceCard />
                </div>
                <div className="pt-1 border-t border-line">
                  <VoiceCacheCard />
                </div>
                <GmailCard />
                <AdminLimitsCard />
                <EconomicsCard />
                <BaselineCard />
              </div>
            </SectionCard>
          )}

          {/* Sticky save bar */}
          <div className="sticky bottom-2 z-10">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/90 backdrop-blur px-4 py-2.5 shadow-card">
              <button onClick={save} disabled={!dirty || saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg btn-bloom disabled:opacity-40">
                {saving && <span className="ltb-loading-dots"><i /><i /><i /></span>}
                {saving ? 'Saving' : 'Save settings'}
              </button>
              {dirty && !saving && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-gold-text">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold" /> Unsaved changes
                </span>
              )}
              {error && <span className="text-[12px] text-poppy-text">{error}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Admin-only: the voice that narrates this workspace's audit videos. Cloned
// once from a sample so the videos sound like the owner. Two ways in, because
// the browser's own recording is the smooth path but a phone voice memo is the
// reliable one — an iPhone .m4a always clones cleanly, a browser recording
// depends on the codec. Not public yet: giving a client the recorder is a plan
// decision that waits on the tier system.
function VoiceCard() {
  const [voice, setVoice] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState(null); // { blob, url, name }
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    let alive = true;
    fetch('/api/voice')
      .then((r) => r.json())
      .then((d) => { if (alive) { setVoice(d?.voice || null); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  async function startRecording() {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setClip({ blob, url: URL.createObjectURL(blob), name: 'recording.webm' });
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      mediaRef.current = rec;
      setRecording(true);
    } catch (e) {
      setErr('Could not use the microphone. Allow mic access, or upload a voice memo instead.');
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    setClip({ blob: f, url: URL.createObjectURL(f), name: f.name });
  }

  async function submit() {
    if (!clip || busy) return;
    setBusy(true); setErr(''); setMsg('Cloning the voice, this takes a few seconds…');
    try {
      const fd = new FormData();
      fd.append('file', clip.blob, clip.name);
      fd.append('name', voice?.name || 'Workspace voice');
      const res = await fetch('/api/voice', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Clone failed.');
      setVoice(d.voice);
      setClip(null);
      setMsg('Done. New videos in this workspace will use this voice.');
    } catch (e) {
      setErr(e.message);
      setMsg('');
    } finally {
      setBusy(false);
    }
  }

  async function removeVoice() {
    if (!confirm('Remove this voice? Videos go back to the default until you set a new one.')) return;
    setBusy(true);
    try {
      await fetch('/api/voice', { method: 'DELETE' });
      setVoice(null);
      setMsg('Voice removed. Videos will use the default.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  // Sits inside the Admin section now, so no outer card of its own.
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink mb-1">Video voice</h3>
      <p className="text-[12px] text-ink-3 mb-3">
        The voice that narrates this workspace's audit videos. Record a sample or upload a phone voice
        memo, play it back to check it, then use it. A phone .m4a is the most reliable file.
      </p>

      {/* What makes a good sample. The clone copies the delivery, not just the
          timbre, so the sample should sound the way the videos should sound:
          warm and unhurried, not read like a news anchor. */}
      <details className="mb-3 rounded-lg border border-line bg-blush-soft/30 px-3 py-2">
        <summary className="text-[13px] font-medium text-charcoal-2 cursor-pointer select-none">
          How to record a good one
        </summary>
        <div className="mt-2 text-[12px] text-muted leading-relaxed space-y-1.5">
          <p><span className="text-charcoal-2 font-medium">Length:</span> one to two minutes. More does not help; a clean minute beats a noisy five.</p>
          <p><span className="text-charcoal-2 font-medium">Where:</span> a quiet room, phone held a hand's width away. No music, no TV, no fan.</p>
          <p><span className="text-charcoal-2 font-medium">How:</span> talk the way you would to a client, warm and unhurried. Do not read it like the news. A few natural pauses are good.</p>
          <p className="pt-1"><span className="text-charcoal-2 font-medium">Read this out, twice:</span></p>
          <p className="rounded-md bg-paper border border-line p-2 text-charcoal-2 italic">
            Hi, so I just took a quick look at your website, and there is one thing I wanted to point out.
            It is a small thing, but it is the kind of thing people notice, and it might be costing you a
            few enquiries a week without you ever knowing. I put together a short walkthrough so you can
            see exactly what I mean. If it is already handled on your end, no worries at all, just ignore
            me. Either way, I am curious how you are keeping track of everything right now.
          </p>
        </div>
      </details>

      {voice && (
        <div className="mb-3 flex items-center gap-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-leaf text-leaf-text">
            <Icon name="check" className="w-3.5 h-3.5" /> Voice set
          </span>
          <span className="text-muted">{voice.name}</span>
          <button onClick={removeVoice} disabled={busy} className="ml-auto text-[12px] text-muted underline decoration-dotted hover:text-poppy-text">
            Remove
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button onClick={startRecording} disabled={busy} className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-line text-charcoal-2 hover:border-mauve transition disabled:opacity-50">
            Record
          </button>
        ) : (
          <button onClick={stopRecording} className="text-[13px] font-medium px-3 py-1.5 rounded-lg bg-poppy text-paper transition">
            Stop recording
          </button>
        )}
        <label className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-line text-charcoal-2 hover:border-mauve transition cursor-pointer">
          Upload a file
          <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm" onChange={onFile} className="hidden" disabled={busy} />
        </label>
      </div>

      {clip && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <audio src={clip.url} controls className="h-9" />
          <span className="text-[12px] text-muted truncate max-w-[160px]">{clip.name}</span>
          <button onClick={submit} disabled={busy} className="text-[13px] font-medium px-3 py-1.5 rounded-lg btn-bloom transition disabled:opacity-50">
            {busy ? 'Cloning…' : voice ? 'Replace voice' : 'Use this voice'}
          </button>
          <button onClick={() => setClip(null)} disabled={busy} className="text-[12px] text-muted underline decoration-dotted">Discard</button>
        </div>
      )}

      {msg && <p className="mt-2 text-[12px] text-mauve-deep">{msg}</p>}
      {err && <p className="mt-2 text-[12px] text-poppy-text">{err}</p>}
    </div>
  );
}

// The narration lines the renderer is holding on to.
//
// A cached clip is reused in every video that needs that line, forever. That is
// the saving and also the risk: a take that came out wrong is not one bad
// video, it is every video from here on. So they can be played and thrown away.
//
// Deleting one IS the re-record. The renderer only calls the voice when the
// file is missing, so the next video needing that line records it fresh, and
// only that line — everything else stays cached.
function VoiceCacheCard() {
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setErr('');
    try {
      const res = await fetch('/api/voice-cache');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setEntries(d.entries || []);
    } catch (e) {
      setErr(e.message);
      setEntries([]);
    }
  }

  useEffect(() => {
    if (open && entries === null) load();
  }, [open, entries]);

  async function drop(id) {
    if (busy) return;
    setBusy(id);
    setErr('');
    try {
      const res = await fetch(`/api/voice-cache?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setEntries((prev) => (prev || []).map((e) => (e.id === id ? { ...e, cached: false, bytes: null } : e)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }

  const held = (entries || []).filter((e) => e.cached);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[13px] font-semibold text-ink"
      >
        {/* Rotated rather than swapped: there is no chevron-right in the set,
            and a missing icon name renders nothing at all. */}
        <Icon
          name="chevron-down"
          className={`w-3.5 h-3.5 text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        Saved voice lines
        {entries && (
          <span className="text-[12px] font-normal text-ink-3">
            {held.length} of {entries.length} recorded
          </span>
        )}
      </button>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
        These lines are the same in every video, so each one is paid for once and reused. Have a listen. Delete
        any that came out wrong and the next video that needs it records a new one.
      </p>

      {open && (
        <div className="mt-3">
          {entries === null && <p className="text-[12px] text-ink-3">Loading…</p>}
          {entries && entries.length === 0 && !err && (
            <p className="text-[12px] text-ink-3">Nothing recorded yet. They save themselves as you make videos.</p>
          )}
          {entries && entries.length > 0 && (
            <ul className="border border-line rounded-[10px] divide-y divide-line overflow-hidden">
              {entries.map((e) => (
                <li key={e.id} className="px-3 py-2 flex items-start gap-2.5">
                  <span className="flex-1 min-w-0">
                    {/* A clip whose wording could not be worked back out of its
                        hash still gets a row, because it is still Ary's voice
                        and still replaceable. Play tells her what it is, which
                        is the only thing the missing text would have. */}
                    <span className={`block text-[12px] leading-relaxed ${e.text ? 'text-ink-2' : 'text-ink-3 italic'}`}>
                      {e.text || 'Recorded line · press play to hear it'}
                    </span>
                    <span className="block text-[11px] text-ink-3 mt-0.5">
                      {e.source === 'good' ? 'compliment'
                        : e.source === 'script' ? 'every video'
                        : e.source === 'connector' ? 'connector'
                        : e.source === 'other' ? 'unlabelled' : 'problem'}
                      {e.key ? ` · ${e.key}` : ''}
                      {e.cached ? ` · ${Math.round((e.bytes || 0) / 1024)}kb` : ' · not recorded yet'}
                    </span>
                  </span>
                  {e.cached && (
                    <>
                      {/* Native controls. A play button of our own would be a
                          nicer shape and one more thing to get wrong. */}
                      <audio
                        controls
                        preload="none"
                        src={`/api/voice-cache?id=${encodeURIComponent(e.id)}`}
                        className="h-8 w-44 shrink-0"
                      />
                      <button
                        onClick={() => drop(e.id)}
                        disabled={busy === e.id}
                        title="Forget this take. The next video that needs the line records a new one."
                        className="shrink-0 text-[12px] font-medium px-2 py-1 rounded-lg border border-line-strong text-ink hover:border-rose hover:text-rose-text transition disabled:opacity-50"
                      >
                        {busy === e.id ? '…' : 'Redo'}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {err && <p className="mt-2 text-[12px] text-poppy-text">{err}</p>}
        </div>
      )}
    </div>
  );
}

// Admin-only: hand another workspace a weekly ad-scan allowance. Regular
// users never see this card (the GET tells us the role). Scans run on the
// server's shared Apify token, so the allowance IS the spend control.
function AdminLimitsCard() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [ws, setWs] = useState('ellen');
  const [perWeek, setPerWeek] = useState('');
  const [aiPerDay, setAiPerDay] = useState('');
  const [beesPerDay, setBeesPerDay] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/limits')
      .then((r) => r.json())
      .then((d) => { if (alive) setIsAdmin(Boolean(d?.isAdmin)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!isAdmin) return null;

  async function saveLimits() {
    setSaving(true);
    setMsg('');
    try {
      // Only the fields actually filled in are sent. The server merges onto
      // the workspace's stored limits, so leaving a box empty changes nothing.
      const limits = {};
      if (perWeek !== '') limits.adScansPerWeek = Number(perWeek) || 0;
      if (aiPerDay !== '') limits.aiCallsPerDay = Number(aiPerDay) || 0;
      if (beesPerDay !== '') limits.beesPerDay = Number(beesPerDay) || 0;
      const res = await fetch('/api/limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: ws.trim(), limits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg(`Saved: ${data.workspace} gets ${data.limits.adScansPerWeek} scan${data.limits.adScansPerWeek === 1 ? '' : 's'} a week, ${data.limits.aiCallsPerDay} AI calls a day, and ${data.limits.beesPerDay || 'no'} Hive bee run${data.limits.beesPerDay === 1 ? '' : 's'} a day.`);
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pt-4 border-t border-line">
      <h3 className="text-[13px] font-semibold text-ink mb-1">Workspace allowances</h3>
      <p className="text-[13px] text-charcoal-2 mb-3">
        Give a workspace a weekly scan allowance (Facebook ads, Facebook posts, Google Maps. One shared pool). Their scans run on the
        server's shared Apify token. The number you set here is their spend cap.
        0 turns the feature off (they won't see the scan panel at all).
        AI calls per day caps scoring, drafting and reports on their own key (default 300).
        Hive bees per day is separate and starts at 0: the reply coach, call prep, best five, proposal, objections and voice note each carry a
        full prospect profile, so they cost the most. Set a number to switch them on for that workspace. Your own workspace is never capped.
        Fill in only what you want to change; the other allowance keeps its value.
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        <input
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          placeholder="workspace (e.g. ellen)"
          className="w-[160px] bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
        />
        <input
          type="number"
          min="0"
          value={perWeek}
          onChange={(e) => setPerWeek(e.target.value)}
          placeholder="scans / week"
          className="w-[120px] bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
        />
        <input
          type="number"
          min="0"
          value={aiPerDay}
          onChange={(e) => setAiPerDay(e.target.value)}
          placeholder="AI calls / day"
          title="How many AI calls this workspace can make per day (scoring, drafts, reports). Default 300."
          className="w-[130px] bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
        />
        <input
          type="number"
          min="0"
          value={beesPerDay}
          onChange={(e) => setBeesPerDay(e.target.value)}
          placeholder="bee runs / day"
          title="How many Hive bee runs this workspace gets per day (reply coach, call prep, best five, proposal, objections, voice note). 0 hides them."
          className="w-[130px] bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
        />
        <button
          onClick={saveLimits}
          disabled={saving || !ws.trim() || (perWeek === '' && aiPerDay === '' && beesPerDay === '')}
          className="px-3 py-2 text-[13px] font-medium rounded-lg bg-mauve-deep text-paper hover:opacity-90 transition disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Set allowance'}
        </button>
      </div>
      {msg && <p className={`text-[12px] mt-2 ${msg.startsWith('Failed') ? 'text-poppy-text' : 'text-leaf-text'}`}>{msg}</p>}
    </div>
  );
}
