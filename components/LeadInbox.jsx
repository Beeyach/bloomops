'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog } from '../lib/dialog.mjs';
import { tzFormat } from '../lib/tz.mjs';
import Hint from './Hint';
import InfoTip from './InfoTip';
import BloomSpinner from './BloomSpinner';
import { scanPrice } from '../lib/credits.mjs';
import Select from './Select';
import { Icon, IconTile } from './Icons';
import { toast } from '../lib/toast.mjs';
import {
  DEFAULT_ENGINE_SETTINGS,
  LEAD_PLATFORMS,
  LEAD_STATUSES,
  PLATFORM_TIPS,
  buildSearchUrl,
  buildAdLibraryUrl,
  buildVerdictPrompt,
  buildBuyerFinderPrompt,
  buildMessageWriterPrompt,
  parseScoringResult,
} from '@/lib/engine-prompts.mjs';

const EMPTY_FORM = { platform: 'Facebook', post_url: '', post_text: '', author_name: '', author_handle: '' };

// What each saved scan is called in the recent list. They used to be listed one
// kind at a time, so the kind never needed saying; now they share a list and a
// row reading only “life coach” could be any of them.
// How many past scans to show before folding the rest away.
const RECENT_SHOWN = 3;

// Which bucket and filters the leads list was left on. Deliberately not the
// search box: a hidden search term surviving a reload looks like missing data
// rather than a filter, and unlike the tabs there is nothing on screen showing
// why the list is short.
const LEAD_VIEW_KEY = 'leadsthatbloom:leadview:v1';

// The real statuses plus the "all" tab, which is a view rather than a status.
// Built from the shared list so a status added there is accepted here without
// this needing to be remembered.
const LEAD_VIEW_TABS = [...LEAD_STATUSES, 'all'];
const LEAD_VIEW_SIZES = ['all', 'solo', 'mid', 'big'];

function readLeadView() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(LEAD_VIEW_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    // A value that no longer exists is dropped rather than restored. Otherwise
    // a renamed bucket comes back as a filter matching nothing, and an empty
    // list with no visible reason reads as lost leads.
    return {
      status: LEAD_VIEW_TABS.includes(raw.status) ? raw.status : null,
      size: LEAD_VIEW_SIZES.includes(raw.size) ? raw.size : null,
      platform: raw.platform === 'all' || LEAD_PLATFORMS.includes(raw.platform) ? raw.platform : null,
    };
  } catch {
    return {};
  }
}

const SCAN_LABEL = {
  maps: 'Map scan',
  'ig-profiles': 'Instagram profiles',
  'ig-discover': 'Instagram discovery',
  podcast: 'Podcast guests',
  'booking-search': 'Booking pages',
};

function Label({ children }) {
  // Apify-style field labels: normal case, semibold, readable — not a
  // tracked-uppercase whisper.
  return (
    <div className="ui-body font-semibold text-charcoal mb-1.5">{children}</div>
  );
}

// Colored-dot verdict chip (CSS dots — no emoji, per the Windows rendering rule).
// Overrule the AI. The verdict the model gave is a guess from text; you can
// open their page and see the truth. Your call sticks — a re-score won't
// undo it — and the note is the point: "AI persona, scam review" is the kind
// of thing that becomes a red rule later.
function VerdictOverride({ lead, onSave }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(lead.your_note || '');
  const flipTo = lead.verdict === 'green' ? 'red' : 'green';

  useEffect(() => { setNote(lead.your_note || ''); }, [lead.id, lead.your_note]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 ui-small text-muted underline underline-offset-2 hover:text-charcoal transition"
      >
        {lead.verdict_source === 'you' ? 'Change your call' : 'Disagree? Set it yourself'}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Why? e.g. AI-generated persona, scam review on their page"
        className="w-full bg-paper border border-line r-md px-2.5 py-1.5 ui-small text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { onSave(lead.id, { verdict: flipTo, your_note: note.trim() }); setOpen(false); }}
          className="px-2.5 py-1 r-md ui-small font-medium border border-rose-line text-rose-text bg-rose-tint hover:brightness-110 transition"
        >
          Mark {flipTo}
        </button>
        <button
          type="button"
          onClick={() => { onSave(lead.id, { your_note: note.trim() }); setOpen(false); }}
          className="px-2.5 py-1 r-md ui-small font-medium border border-line text-charcoal-2 hover:bg-blush-soft transition"
        >
          Just save the note
        </button>
        <button
          type="button"
          onClick={() => { setNote(lead.your_note || ''); setOpen(false); }}
          className="px-2.5 py-1 r-md ui-small text-muted hover:text-charcoal transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function VerdictChip({ verdict }) {
  if (!verdict) {
    return <span className="ui-meta uppercase tracking-[0.14em] text-muted">unscored</span>;
  }
  const green = verdict === 'green';
  return (
    <span className="inline-flex items-center gap-1.5 ui-meta uppercase tracking-[0.14em]">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${green ? 'bg-emerald-600' : 'bg-red-500'}`}
      />
      <span className={green ? 'text-emerald-700' : 'text-red-600'}>{verdict}</span>
    </span>
  );
}

function parseReasons(lead) {
  try {
    const r = JSON.parse(lead.verdict_reasons || '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

// Ad-scan leads carry "~96,362 page likes" in their notes — the only place
// the size lives. Parsed here so the list can filter by it and the card can
// wear it as a badge.
function pageLikesOf(lead) {
  const m = (lead.notes || '').match(/~([\d,]+) page likes/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
function fmtLikes(n) {
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
}
function PageSizeBadge({ likes }) {
  if (likes == null) return null;
  const big = likes > 50000;
  const solo = likes <= 10000;
  return (
    <span
      title={big ? 'Big page. Probably a brand with an agency behind it, not a solo practice.' : solo ? 'Solo practice size. Usually your best targets.' : 'Mid-size page.'}
      className={'px-2 py-0.5 ui-meta rounded border ' + (
        big ? 'border-line text-muted' : solo ? 'border-leaf text-leaf-text' : 'border-line text-charcoal-2'
      )}
    >
      {fmtLikes(likes)} likes{big ? ' · big page' : ''}
    </span>
  );
}

// Facebook keeps serving page pictures at a stable Graph URL derived from
// the page handle — used when a scan didn't store (or lost) an avatar.
function fbPictureOf(lead) {
  const src = lead.post_url || lead.author_handle || '';
  const m = String(src).match(/facebook\.com\/([A-Za-z0-9.\-_]{3,})/i);
  if (!m) return null;
  const handle = m[1].replace(/\/+$/, '');
  if (/^(ads|sharer|profile\.php|groups|pages|watch|share|people)$/i.test(handle)) return null;
  return `https://graph.facebook.com/${handle}/picture?type=square&width=128`;
}

// Profile picture with a monogram fallback — scan CDN links expire after a
// while, so a broken <img> quietly becomes initials on a tinted circle.
const MONOGRAM_TINTS = ['bg-blush-soft', 'bg-hover-wash', 'bg-paper'];
const AVATAR_SIZES = {
  sm: 'w-8 h-8 ui-small',
  md: 'w-9 h-9 ui-body',
  lg: 'w-12 h-12 ui-heading',
};
function LeadAvatar({ lead, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const name = lead.author_name || lead.author_handle || '?';
  const initials = name.replace(/^@/, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const src = lead.avatar_url || fbPictureOf(lead);
  const sz = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className={`${sz} rounded-full object-cover border border-line shrink-0`}
      />
    );
  }
  const tint = MONOGRAM_TINTS[(name.charCodeAt(0) || 0) % MONOGRAM_TINTS.length];
  return (
    <span className={`${sz} rounded-full border border-line shrink-0 flex items-center justify-center font-medium text-charcoal-2 ${tint}`} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

// Render text with any http(s) URLs as real links.
function Linkified({ text, className = '' }) {
  if (!text) return null;
  const parts = String(text).split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-mauve-deep underline decoration-dotted break-all">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

// Honey Bee appends the DM after an "--- AI draft ---" divider and the
// scorer appends "suggested_first_line:", both into lead.notes. Buried
// there they read as more grey paragraphs, which is why "where do the
// drafts go?" was a fair question. Both are pulled out and shown as
// copyable blocks; whatever is left stays as notes.
function splitNotes(notes) {
  let text = String(notes || '');
  let draft = null;
  let opener = null;

  const dm = text.match(/---\s*AI draft\s*---\s*([\s\S]*)$/i);
  if (dm) {
    draft = dm[1].trim();
    text = text.slice(0, dm.index).trim();
  }

  const om = text.match(/(?:^|\n)\s*(?:suggested_first_line|First line)\s*:\s*([\s\S]+?)(?:\n{2,}|$)/i);
  if (om) {
    opener = om[1].trim();
    text = (text.slice(0, om.index) + text.slice(om.index + om[0].length)).trim();
  }

  return { draft, opener, rest: text };
}

// A quotable block with a copy button. `tone` marks the DM as the main
// event; the opener is a supporting note.
function CopyBlock({ label, text, primary = false }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <div className={'r-lg px-4 py-3.5 mb-5 max-w-[68ch] border ' + (primary ? 'border-rose-line bg-card-hover' : 'border-line bg-card-hover')}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="ui-small font-semibold uppercase tracking-wider text-ink-3">{label}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {}
          }}
          className="ui-small font-medium text-ink-2 hover:text-ink transition"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="ui-body text-ink leading-[1.7] whitespace-pre-wrap">{text}</p>
    </div>
  );
}

// "Where did this lead come from" — pulled out of the scan note.
// Each platform's mark and brand color, so a queue of mixed sources scans
// by logo instead of by reading eight lowercase words. Colors are the real
// brand hues, saturated enough to sit on the dark surface too. X and
// Threads brand in black, which vanishes on dark; they ride the ink color.
const PLATFORM_META = {
  Facebook: { icon: 'facebook', color: '#1877F2' },
  Instagram: { icon: 'instagram', color: '#E4405F' },
  Threads: { icon: 'at-sign', color: 'var(--ink-2)' },
  LinkedIn: { icon: 'linkedin', color: '#0A66C2' },
  Upwork: { icon: 'briefcase', color: '#14A800' },
  Reddit: { icon: 'reddit', color: '#FF4500' },
  X: { icon: 'x', color: 'var(--ink-2)' },
  Other: { icon: 'globe', color: 'var(--ink-3)' },
};

// Logo + name, inline. Used in the queue rows, the reading pane, and the
// platform filter menu, so the mark always appears beside its word.
function PlatformTag({ platform, iconOnly = false, iconClass = 'w-3.5 h-3.5' }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.Other;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span style={{ color: meta.color }} className="inline-flex shrink-0">
        <Icon name={meta.icon} className={iconClass} />
      </span>
      {!iconOnly && platform}
    </span>
  );
}

function sourceOf(lead) {
  const m = (lead.notes || '').match(/(ad scan|Post scan|Maps scan):\s*"([^"]+)"\s*([A-Z]{2,3})?/i);
  return m ? `${m[1]}: “${m[2]}”${m[3] ? ' · ' + m[3] : ''}` : null;
}

// The header's overflow menu: the secondary actions that used to sit as three
// ghost buttons now live behind a ··· so the header reads as one calm row.
function HeaderMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More"
        className="w-9 h-9 inline-flex items-center justify-center r-md border border-line text-ink-3 hover:text-ink hover:border-rose transition"
      >
        <span className="ui-display leading-none tracking-widest">···</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 z-30 min-w-[180px] r-lg border border-line bg-panel shadow-card p-1">
          {items.filter(Boolean).map((it) => (
            <button
              key={it.label}
              onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full text-left ui-body px-3 py-2 r-md text-ink-2 hover:bg-hover-wash-soft hover:text-ink transition"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// The "fill these in before your first scan" warning, reduced from a full gold
// card to one dismissible line. It still only appears when settings are
// genuinely incomplete, so it cannot nag someone who is already set up.
function SetupNote({ missing, onOpenSettings }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || !missing.length) return null;
  const names = missing.map((m) => m[0]).join(', ');
  return (
    <div className="flex items-center gap-2.5 r-lg border border-gold/40 bg-gold/5 px-3.5 py-2">
      <Icon name="target" className="w-4 h-4 text-gold-text shrink-0" />
      <p className="ui-small text-ink-2 flex-1 min-w-0">
        Before your first scan, tell it what a good lead looks like.{' '}
        <span className="text-ink-3">Still to set: {names}.</span>
      </p>
      <button onClick={onOpenSettings} className="ui-small font-medium text-rose-text hover:underline whitespace-nowrap">
        Open Settings →
      </button>
      <button onClick={() => setHidden(true)} aria-label="Dismiss" className="text-ink-3 hover:text-ink transition">
        <Icon name="x" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function LeadInbox({ onOpenProspect, onNavigate }) {
  const [leads, setLeads] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_ENGINE_SETTINGS);
  const [loading, setLoading] = useState(true);
  // Read back on mount, so leaving this view and returning does not put you at
  // the top of Review again. Switching to Prospects and back was losing the
  // tab, the platform and the size every time, and the work here is done in
  // passes through one bucket.
  //
  // Read straight into the initial state rather than in an effect: setting it
  // afterwards renders Review first and moves the list under you.
  const saved = readLeadView();
  const [statusFilter, setStatusFilter] = useState(saved.status || 'new'); // tab: 'new' (Review) | 'qualified' | 'skipped' | 'promoted' | 'all'
  const [platformFilter, setPlatformFilter] = useState(saved.platform || 'all');
  const [sizeFilter, setSizeFilter] = useState(saved.size || 'all'); // 'all' | 'solo' | 'mid' | 'big'
  const [search, setSearch] = useState('');
  // Review-workspace state: the focused lead, which tool drawer is open,
  // the last decision (for Undo), and a brief saved flash.
  const [selectedId, setSelectedId] = useState(null);
  const [openTool, setOpenTool] = useState(null); // null | 'scan' | 'phrases' | 'add'
  const [mobileView, setMobileView] = useState('queue'); // <lg only: 'queue' | 'detail'
  const [lastDecision, setLastDecision] = useState(null); // { id, prev: {verdict, status} }
  const [savedFlash, setSavedFlash] = useState(false);

  // Remember where the list was left. No hydration guard needed: the values
  // Warm the scan allowance the moment the tab opens, so clicking "Find new
  // leads" later never waits on the network.
  useEffect(() => { prefetchScanLimits(); }, []);

  // came out of storage on the first render, so the first write puts back what
  // was already there.
  useEffect(() => {
    try {
      localStorage.setItem(
        LEAD_VIEW_KEY,
        JSON.stringify({ status: statusFilter, platform: platformFilter, size: sizeFilter })
      );
    } catch {}
  }, [statusFilter, platformFilter, sizeFilter]);
  // Cards promoted THIS session stay visible in the active view (with their
  // View/Undo row) instead of vanishing the moment the status flips — the
  // "where did it go??" fix. On reload they file away like any promoted lead.
  // Declared before `visible` below, which closes over it.
  const [justPromoted, setJustPromoted] = useState(() => new Set());
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    Promise.all([
      fetch('/api/leads').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([leadsData, settingsData]) => {
        setLeads(leadsData.leads || []);
        setSettings({ ...DEFAULT_ENGINE_SETTINGS, ...(settingsData.settings || {}) });
      })
      .catch(() => setError('Could not load the inbox.'))
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings(next) {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSettings({ ...DEFAULT_ENGINE_SETTINGS, ...(data.settings || {}) });
      return true;
    } catch (e) {
      toast(`Couldn't save. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => saveSettings(next) } });
      return false;
    }
  }

  async function reloadLeads() {
    try {
      const data = await fetch('/api/leads').then((r) => r.json());
      setLeads(data.leads || []);
      return data.leads || [];
    } catch {
      return leadsRef.current;
    }
  }

  // Guard Bee, right where the leads land: one /api/ai score call per
  // unscored lead, sequential so each call reads the cached rubric the one
  // before it wrote. Same loop the Hive runs, minus the trip to another tab.
  const [scoring, setScoring] = useState(null); // { done, total } while running

  // The hunt card: collapsed by default so reviewing owns the page. It
  // opens itself only when the inbox is empty (hunting IS the job then),
  // and via the New scan button. State, not CSS, so the form's dropdown
  // portals never render while hidden.
  const [scanOpen, setScanOpen] = useState(false);
  const scanAutoOpened = useRef(false);
  useEffect(() => {
    if (!loading && !scanAutoOpened.current) {
      scanAutoOpened.current = true;
      if (leadsRef.current.length === 0) setScanOpen(true);
    }
  }, [loading]);
  async function scoreUnscored() {
    if (scoring) return;
    const todo = leadsRef.current.filter((l) => !l.verdict && l.status === 'new');
    if (!todo.length) return;
    setScoring({ done: 0, total: todo.length });
    let green = 0;
    let failed = 0;
    for (const l of todo) {
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'score', leadId: l.id }),
        });
        if (!res.ok) {
          failed += 1;
          // The daily cap applies to the whole run, not just this call.
          if (res.status === 429) break;
        } else {
          const data = await res.json().catch(() => ({}));
          if (data.verdict === 'green') green += 1;
        }
      } catch {
        failed += 1;
      }
      setScoring((s) => (s ? { ...s, done: s.done + 1 } : s));
    }
    setScoring(null);
    await reloadLeads();
    const scored = todo.length - failed;
    toast(
      failed
        ? `Scored ${scored}, ${failed} failed. The failed ones are still unscored.`
        : `Scored ${scored}: ${green} green, ${scored - green} skipped.`,
      failed ? { tone: 'error' } : {}
    );
  }

  // Fires whenever a scan or import lands leads. Fresh leads deserve a
  // verdict while the scan is still warm, but scoring spends her AI credit,
  // so it is one offered click, never automatic.
  async function handleLeadsLanded() {
    const fresh = await reloadLeads();
    const unscored = fresh.filter((l) => !l.verdict && l.status === 'new').length;
    if (unscored > 0 && settings.aiKeySet) {
      toast(
        `${unscored} lead${unscored === 1 ? '' : 's'} waiting for a verdict.`,
        { action: { label: 'Score now', onClick: scoreUnscored }, duration: 12000 }
      );
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      // justPromoted cards float above the tab filter so a fresh promote
      // never vanishes mid-session.
      if (statusFilter !== 'all' && l.status !== statusFilter && !justPromoted.has(l.id)) return false;
      if (platformFilter !== 'all' && l.platform !== platformFilter) return false;
      if (q) {
        const hay = [l.author_name, l.author_handle, l.post_text, l.notes]
          .map((x) => (x || '').toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      if (sizeFilter !== 'all') {
        const likes = pageLikesOf(l);
        // Unknown sizes stay visible in every band — hiding them would
        // silently bury paste-in leads that never had a like count.
        if (likes != null) {
          if (sizeFilter === 'solo' && likes > 10000) return false;
          if (sizeFilter === 'mid' && (likes <= 10000 || likes > 50000)) return false;
          if (sizeFilter === 'big' && likes <= 50000) return false;
        }
      }
      return true;
    });
  }, [leads, statusFilter, platformFilter, sizeFilter, search, justPromoted]);

  const unscoredCount = useMemo(
    () => leads.filter((l) => !l.verdict && l.status === 'new').length,
    [leads]
  );
  const tabCounts = useMemo(() => {
    const c = { new: 0, qualified: 0, skipped: 0, promoted: 0 };
    for (const l of leads) if (c[l.status] != null) c[l.status] += 1;
    return c;
  }, [leads]);
  // Momentum: how much of everything that ever arrived has a decision.
  const reviewedCount = leads.length - tabCounts.new;

  // Single write path: optimistic patch → server confirm → rollback + alert.
  async function updateLead(id, patch) {
    const before = leadsRef.current;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const { lead } = await res.json();
      setLeads((ls) => ls.map((l) => (l.id === id ? lead : l)));
      return lead;
    } catch (e) {
      setLeads(before);
      toast(`Update failed: ${e.message || e}`, { tone: 'error', action: { label: 'Retry', onClick: () => updateLead(id, patch) } });
      return null;
    }
  }

  async function addLead() {
    if (!form.post_text.trim() && !form.post_url.trim()) {
      setError('Paste the post text or a link first.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const { lead } = await res.json();
      setLeads((ls) => [lead, ...ls]);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setAdding(false);
    }
  }

  async function deleteLead(id) {
    if (!(await confirmDialog({ title: 'Delete lead', message: "Delete this lead? This can't be undone." }))) return;
    const before = leadsRef.current;
    setLeads((ls) => ls.filter((l) => l.id !== id));
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setLeads(before);
      toast(`Delete failed: ${e.message || e}`, { tone: 'error' });
    }
  }

  // Keep a valid selection: if the focused lead left the queue (filter or
  // decision), fall to the first visible one.
  useEffect(() => {
    if (selectedId != null && visible.some((l) => l.id === selectedId)) return;
    setSelectedId(visible.length ? visible[0].id : null);
  }, [visible, selectedId]);

  const selected = selectedId != null ? leads.find((l) => l.id === selectedId) : null;

  function selectLead(id) {
    setSelectedId(id);
    setMobileView('detail');
  }
  function moveSelection(delta) {
    if (!visible.length) return;
    const i = visible.findIndex((l) => l.id === selectedId);
    const next = visible[Math.min(visible.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))];
    if (next) setSelectedId(next.id);
  }

  // A decision applies the patch, remembers how to undo it, flashes Saved,
  // and advances to the next lead so a session flows without extra clicks.
  async function decide(lead, kind) {
    const patch = kind === 'good'
      ? { verdict: 'green', status: 'qualified' }
      : { verdict: 'red', status: 'skipped' };
    const i = visible.findIndex((l) => l.id === lead.id);
    const next = visible[i + 1] || visible[i - 1] || null;
    const prev = { verdict: lead.verdict, status: lead.status };
    const saved = await updateLead(lead.id, patch);
    if (!saved) return;
    setLastDecision({ id: lead.id, prev, label: kind === 'good' ? 'Good fit' : 'Skip' });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
    if (next) setSelectedId(next.id);
  }
  async function undoLast() {
    if (!lastDecision) return;
    const saved = await updateLead(lastDecision.id, lastDecision.prev);
    if (!saved) return;
    setSelectedId(lastDecision.id);
    setLastDecision(null);
  }

  // Keyboard: G / S / N decide, arrows walk the queue. Never while typing,
  // never while a tool drawer is open. The listener is installed once and
  // reads the CURRENT state/functions through a per-render ref — a closure
  // from mount would act on a stale queue.
  const kbRef = useRef({});
  kbRef.current = { selected, openTool, decide, moveSelection };
  useEffect(() => {
    function onKey(e) {
      const { selected, openTool, decide, moveSelection } = kbRef.current;
      if (openTool) return;
      // A held-down key auto-repeats ~30×/sec — combined with auto-advance
      // that skip-machine-guns the whole queue. One decision per press.
      if (e.repeat) return;
      const t = e.target;
      if (t && (t.closest?.('input, textarea, select, [contenteditable]'))) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); return; }
      if (!selected) return;
      const k = e.key.toLowerCase();
      if (k === 'g' && selected.status === 'new') decide(selected, 'good');
      else if (k === 's' && selected.status === 'new') decide(selected, 'skip');
      else if (k === 'n' && selected.status === 'new') {
        document.getElementById('lead-ask-ai')?.click();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted">
        <BloomSpinner size={34} />
        <span className="text-sm">Loading inbox…</span>
      </div>
    );
  }

  // "Find new leads" used to only scroll, and the scan card is usually
  // already on screen, so the button looked broken. Now it puts the cursor
  // in the field you were sent there to fill.
  function focusScanForm() {
    setScanOpen(true);
    // Let the expanded card render before scrolling to it.
    setTimeout(() => {
      const card = document.getElementById('scan-card');
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const field = card.querySelector('textarea, input[type="text"], input:not([type])');
      if (field) setTimeout(() => field.focus(), 320);
    }, 60);
  }

  const ringPct = leads.length ? reviewedCount / leads.length : 0;
  const RING_R = 9;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className="w-full max-w-[1700px] mx-auto space-y-4">
      {/* Page header: where you stand, at a glance, plus every tool as a
          drawer. The review workspace below owns the page. */}
      {/* Direction A "Calm command bar": one slim row. Serif title, a mono
          TO-REVIEW pill, a short progress bar, the primary New scan, and the
          secondary actions folded into a ··· menu. The old progress ring and
          the Collect ▸ Score ▸ Message ▸ Prospects step line are gone. */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-serif ui-display text-bright leading-none">New finds</h1>
        {leads.length > 0 && (
          tabCounts.new > 0 ? (
            <span className="ui-meta tracking-[0.08em] px-2 py-1 rounded-full bg-rose-tint text-rose-text">
              {tabCounts.new} TO REVIEW
            </span>
          ) : (
            <span className="ui-meta tracking-[0.08em] px-2 py-1 rounded-full bg-leaf/10 text-leaf-text inline-flex items-center gap-1">
              ALL REVIEWED <Icon name="check" className="w-3 h-3" strokeWidth={2.5} />
            </span>
          )
        )}
        {leads.length > 0 && reviewedCount > 0 && (
          <div
            title="Share of all leads with a decision, i.e. everything no longer in To review"
            className="flex items-center gap-2 w-full max-w-[260px] min-w-[120px]"
          >
            <div className="flex-1 h-1.5 rounded-full bg-input-bg overflow-hidden">
              <div
                className="h-full rounded-full bg-rose transition-[width] duration-500"
                style={{ width: Math.round(ringPct * 100) + '%' }}
              />
            </div>
            <span className="ui-small text-ink-3 whitespace-nowrap">{Math.round(ringPct * 100)}%</span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={focusScanForm}
            className="ui-body font-medium px-3.5 py-2 r-md btn-bloom transition"
          >
            New scan
          </button>
          <HeaderMenu
            items={[
              // With a key saved the bee runs right here; without one, the
              // Hive page explains what a key is and where it goes.
              unscoredCount > 0 && (settings.aiKeySet
                ? { label: `Guard Bee scores all (${unscoredCount})`, onClick: scoreUnscored }
                : onNavigate && { label: 'Guard Bee scores all', onClick: () => onNavigate('army') }),
              { label: 'Search phrases', onClick: () => setOpenTool('phrases') },
              { label: 'Add lead', onClick: () => setOpenTool('add') },
              { label: 'Import Apify dataset', onClick: () => setOpenTool('apify') },
            ]}
          />
        </div>
      </div>

      {scoring && (
        <div className="bg-panel border border-line-strong shadow-card r-lg px-4 py-2.5 flex items-center gap-3">
          <Icon name="bee" className="w-4 h-4 text-mauve-deep shrink-0" />
          <span className="ui-body text-ink">
            Guard Bee is scoring… {scoring.done} / {scoring.total}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-blush-soft overflow-hidden">
            <div
              className="h-full bg-mauve-deep transition-[width] duration-300"
              style={{ width: `${Math.round((scoring.done / Math.max(1, scoring.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Aim before you shoot: scans and bees can only find "good" leads if
          the settings say what good means. Ellen's first ad scan pulled pure
          junk for exactly this reason. Never silently again. */}
      {(() => {
        const dflt = DEFAULT_ENGINE_SETTINGS;
        const aim = [
          ['What you sell', Boolean((settings.offer || '').trim())],
          ['Who you sell to', Boolean((settings.audience || '').trim())],
          ['Positioning', Boolean((settings.positioning || '').trim())],
          ['Green/red rules', JSON.stringify(settings.greenRules) !== JSON.stringify(dflt.greenRules) || JSON.stringify(settings.redRules) !== JSON.stringify(dflt.redRules)],
          ['Buyer phrases', JSON.stringify(settings.intentPhrases) !== JSON.stringify(dflt.intentPhrases)],
        ];
        return <SetupNote missing={aim.filter(([, ok]) => !ok)} onOpenSettings={() => { window.location.hash = 'settings'; }} />;
      })()}

      {/* The scan form lives ON the page. Hunting is the main event, not a
          drawer. Phrases and manual-add stay tucked away. */}
      <div id="scan-card" className="bg-panel border border-line-strong r-lg shadow-card border-l-4 border-l-rose">
        {scanOpen ? (
          <div className="p-5 relative">
            <button
              onClick={() => setScanOpen(false)}
              className="absolute right-4 top-4 inline-flex items-center gap-1 ui-small font-medium px-2.5 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              title="Tuck the hunt card away"
            >
              <Icon name="chevron-up" className="w-3.5 h-3.5" />
              Hide
            </button>
            <ScanPanel onImported={handleLeadsLanded} phrases={settings.intentPhrases || []} standalone />
          </div>
        ) : (
          <button
            onClick={() => setScanOpen(true)}
            className="w-full flex items-center gap-3.5 px-5 py-4 text-left r-lg hover:bg-card-hover transition"
          >
            <span className="w-9 h-9 r-md bg-rose-tint text-rose-text inline-flex items-center justify-center shrink-0">
              <Icon name="search" className="w-5 h-5" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block ui-heading font-semibold text-bright leading-tight">Find new leads</span>
              <span className="block ui-small text-ink-2 truncate">
                Facebook ads and posts, Google Maps, Instagram, podcasts, booking pages
              </span>
            </span>
            <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 ui-small font-medium px-2.5 py-1.5 r-md border border-line-strong text-ink">
              Open
              <Icon name="chevron-down" className="w-3.5 h-3.5" />
            </span>
          </button>
        )}
      </div>

      {openTool === 'apify' && (
        <ToolModal title="Import an Apify dataset" onClose={() => setOpenTool(null)}>
          <ApifyImportForm
            onDone={() => {
              setOpenTool(null);
              handleLeadsLanded();
            }}
          />
        </ToolModal>
      )}
      {openTool === 'phrases' && (
        <ToolModal title="Search phrases" onClose={() => setOpenTool(null)} bare>
          <FindPanel settings={settings} onSave={saveSettings} onImported={handleLeadsLanded} />
        </ToolModal>
      )}
      {openTool === 'add' && (
        <ToolModal title="Add a lead manually" onClose={() => setOpenTool(null)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Label>Platform</Label>
            <Select
              value={form.platform}
              onChange={(v) => setForm((f) => ({ ...f, platform: v }))}
              options={LEAD_PLATFORMS}
              ariaLabel="Platform"
              className="w-full"
              buttonClassName="w-full !py-2"
              minWidth={0}
            />
          </div>
          <div>
            <Label>Post link</Label>
            <input
              value={form.post_url}
              onChange={(e) => setForm((f) => ({ ...f, post_url: e.target.value }))}
              placeholder="https://…"
              className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
          <div>
            <Label>Their name</Label>
            <input
              value={form.author_name}
              onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
              placeholder="Who posted it"
              className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
          <div>
            <Label>Profile / handle</Label>
            <input
              value={form.author_handle}
              onChange={(e) => setForm((f) => ({ ...f, author_handle: e.target.value }))}
              placeholder="@handle or profile URL"
              className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
        </div>
        <Label>The post</Label>
        <textarea
          value={form.post_text}
          onChange={(e) => setForm((f) => ({ ...f, post_text: e.target.value }))}
          rows={3}
          placeholder="Paste what they wrote, word for word…"
          className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve mb-3"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={addLead}
            disabled={adding}
            className="px-4 py-2 ui-body font-medium r-md bg-charcoal text-paper ui-control"
          >
            {adding ? 'Adding…' : 'Add to inbox'}
          </button>
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>
        </ToolModal>
      )}

      {/* The review workspace: queue | active lead | decisions. */}
      {leads.length === 0 ? (
        <div className="bg-panel border border-line-strong shadow-card r-lg text-center text-muted py-16 px-6">
          <p className="font-serif text-2xl text-charcoal-2 mb-2">Nothing here yet.</p>
          <p className="ui-heading mb-5">Run a scan to bring some leads in, or paste a post you found yourself. Either way works.</p>
          <button
            onClick={() => focusScanForm()}
            className="px-5 py-2.5 ui-body font-medium r-md btn-bloom transition"
          >
            Find new leads
          </button>
        </div>
      ) : (
        <>
        {/* One toolbar for the whole workspace: tabs on the left, search
            and filters on the right. Living inside the narrow queue column
            these wrapped into a two-line jumble; full width they read as
            one calm row. */}
        <div className="bg-panel border border-line-strong r-lg px-3 py-2.5 shadow-card flex items-center gap-2 flex-wrap">
          <div className="flex flex-wrap gap-1">
            {[
              ['new', 'Review', tabCounts.new],
              ['qualified', 'Qualified', tabCounts.qualified],
              ['skipped', 'Skipped', tabCounts.skipped],
              ['promoted', 'In Prospects', tabCounts.promoted],
              ['all', 'All', leads.length],
            ].map(([key, label, n]) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={'px-2.5 py-1.5 ui-body font-medium r-md transition ' + (
                    active ? 'btn-bloom' : 'text-charcoal-2 hover:bg-blush-soft'
                  )}
                >
                  {label} <span className={active ? 'opacity-90' : 'text-muted'}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              aria-label="Search leads" className="w-[200px] h-10 bg-paper border border-line r-md px-3 ui-body text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
            <Select
              value={sizeFilter}
              onChange={(v) => setSizeFilter(v)}
              options={[
                { value: 'all', label: 'Any size' },
                { value: 'solo', label: 'Solo (≤10k)' },
                { value: 'mid', label: 'Mid (10–50k)' },
                { value: 'big', label: 'Big (50k+)' },
              ]}
              ariaLabel="Page size"
              buttonClassName="h-10"
              minWidth={0}
            />
            <Select
              value={platformFilter}
              onChange={(v) => setPlatformFilter(v)}
              options={[
                { value: 'all', label: 'All platforms' },
                ...LEAD_PLATFORMS.map((p) => ({ value: p, label: <PlatformTag platform={p} /> })),
              ]}
              ariaLabel="Platform filter"
              buttonClassName="h-10"
              minWidth={0}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)] items-start">
          {/* Queue */}
          <div className={mobileView === 'detail' ? 'hidden lg:block' : ''}>
            <ul className="bg-panel border border-line-strong r-lg shadow-card overflow-hidden divide-y divide-hairline max-h-[calc(100vh-320px)] min-h-[160px] overflow-y-auto slim-scroll">
              {visible.length === 0 && (
                <li className="px-4 py-6 ui-body text-muted text-center">Nothing matches these filters.</li>
              )}
              {visible.map((lead) => (
                <QueueItem
                  key={lead.id}
                  lead={lead}
                  selected={lead.id === selectedId}
                  onSelect={() => selectLead(lead.id)}
                />
              ))}
            </ul>
          </div>

          {/* Active lead */}
          <div className={mobileView === 'queue' ? 'hidden lg:block' : ''}>
            <button
              onClick={() => setMobileView('queue')}
              className="lg:hidden mb-2 ui-body font-medium text-charcoal-2 hover:text-charcoal"
            >
              ← Back to queue
            </button>
            {selected ? (
              /* The decision bar sits ON TOP of the lead card, full width:
                 judge and judged as one unit. The side-rail version floated
                 at the far edge of a wide screen and read as a separate
                 widget; this reads as a header. */
              <div className="flex flex-col gap-3">
                <div>
                  <DecisionPanel
                    lead={selected}
                    decide={decide}
                    undoLast={undoLast}
                    lastDecision={lastDecision}
                    savedFlash={savedFlash}
                    updateLead={updateLead}
                    updateLocal={(lead) => setLeads((ls) => ls.map((l) => (l.id === lead.id ? lead : l)))}
                    onPromoted={(id) => setJustPromoted((s) => new Set(s).add(id))}
                    moveSelection={moveSelection}
                    onOpenProspect={onOpenProspect}
                  />
                </div>
                <LeadDetail
                  lead={selected}
                  settings={settings}
                  updateLead={updateLead}
                  deleteLead={deleteLead}
                />
              </div>
            ) : (
              <div className="bg-panel border border-line-strong shadow-card r-lg px-6 py-16 text-center">
                {tabCounts.new === 0 && statusFilter === 'new' ? (
                  <>
                    <p className="font-serif text-2xl text-leaf-text mb-2 flex items-center justify-center gap-2">
                      <Icon name="check-circle" className="w-6 h-6" />
                      All reviewed
                    </p>
                    <p className="ui-heading text-charcoal-2 mb-4">
                      {tabCounts.qualified > 0
                        ? `${tabCounts.qualified} qualified and waiting for DMs.`
                        : 'The review pile is empty. Go find some more.'}
                    </p>
                    {tabCounts.qualified > 0 ? (
                      <button
                        onClick={() => setStatusFilter('qualified')}
                        className="px-4 py-2.5 ui-body font-medium r-md bg-mauve-deep text-paper hover:opacity-90 transition"
                      >
                        Work the qualified pile →
                      </button>
                    ) : (
                      <button
                        onClick={() => focusScanForm()}
                        className="px-4 py-2.5 ui-body font-medium r-md btn-bloom transition"
                      >
                        Find new leads
                      </button>
                    )}
                  </>
                ) : (
                  <p className="ui-heading text-muted">Pick a lead from the queue.</p>
                )}
              </div>
            )}
          </div>

        </div>
        </>
      )}
    </div>
  );
}

// Overlay drawer for tools that used to eat the page (scan, phrases,
// add-lead). Escape or a backdrop click closes it. `bare` trims the inner
// padding when the child brings its own card.
function ToolModal({ title, onClose, bare = false, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-start justify-center p-4 pt-[7vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={'w-full max-w-[780px] max-h-[85vh] overflow-y-auto slim-scroll r-lg border border-line bg-panel shadow-card ' + (bare ? 'p-2' : 'p-5')}>
        <div className={'flex items-start justify-between ' + (bare ? 'px-3 pt-2' : 'mb-3')}>
          {bare ? <span /> : <h2 className="font-serif ui-display text-charcoal leading-tight">{title}</h2>}
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 r-md text-muted hover:text-charcoal hover:bg-blush-soft transition inline-flex items-center justify-center"><Icon name="x" className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// One row in the review queue: who, where, how big, and what happened.
const QUEUE_STATUS = {
  promoted: { label: 'In Prospects', cls: 'text-leaf-text' },
  qualified: { label: 'Qualified', cls: 'text-emerald-500' },
  skipped: { label: 'Skipped', cls: 'text-muted' },
};
// Memoized on the row's own data: deciding one lead used to re-render all
// 144 queue rows because the click handler is a fresh closure every render.
// Only the lead object and its selected flag matter to what a row shows.
const QueueItem = memo(function QueueItem({ lead, selected, onSelect }) {
  const likes = pageLikesOf(lead);
  const st = QUEUE_STATUS[lead.status];
  return (
    <li>
      <button
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={'w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition border-l-2 ' + (
          selected ? 'bg-blush-soft border-rose' : 'border-transparent hover:bg-blush-soft/50'
        )}
      >
        <LeadAvatar lead={lead} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block ui-body font-medium text-charcoal truncate leading-tight">
            {lead.author_name || lead.author_handle || 'Unknown'}
          </span>
          <span className="block ui-small text-muted truncate">
            <PlatformTag platform={lead.platform} />
            {likes != null ? ` · ${fmtLikes(likes)} likes` : ''}
          </span>
        </span>
        {st ? (
          <span className={'ui-small font-medium shrink-0 ' + st.cls}>{st.label}</span>
        ) : lead.verdict ? (
          <span
            className={'w-2.5 h-2.5 rounded-full shrink-0 ' + (lead.verdict === 'green' ? 'bg-emerald-500' : 'bg-red-500')}
            title={'AI verdict: ' + lead.verdict}
          />
        ) : null}
      </button>
    </li>
  );
}, (prev, next) => prev.lead === next.lead && prev.selected === next.selected);

// The reading pane: one lead, comfortable type, every link a real link.
// Signals arrive as a JSON string on the lead (or already parsed). Always an
// array so the chip row renders in either shape.
function parseSignals(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && x.label) : [];
  } catch {
    return [];
  }
}

function LeadDetail({ lead, settings, updateLead, deleteLead }) {
  const [askAI, setAskAI] = useState(false);
  useEffect(() => { setAskAI(false); }, [lead.id]);
  const likes = pageLikesOf(lead);
  const reasons = parseReasons(lead);
  const source = sourceOf(lead);
  const profileUrl = /^https?:\/\//.test(lead.author_handle || '')
    ? lead.author_handle
    : (lead.post_url || null);
  return (
    <div className="bg-panel border border-line-strong r-lg shadow-card p-5 sm:p-6">
      <div className="flex items-start gap-3.5 mb-4">
        <LeadAvatar lead={lead} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="ui-display font-semibold text-charcoal leading-tight">{lead.author_name || 'Unknown'}</h2>
            <PageSizeBadge likes={likes} />
          </div>
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noreferrer" className="ui-body text-mauve-deep underline decoration-dotted break-all">
              {profileUrl.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )}
          <div className="ui-body text-muted mt-0.5">
            <PlatformTag platform={lead.platform} />
            {source ? ` · ${source}` : ''}
          </div>
        </div>
        <button
          onClick={() => deleteLead(lead.id)}
          title="Delete this lead (asks first)"
          aria-label="Delete this lead"
          className="shrink-0 w-8 h-8 r-md text-muted hover:text-charcoal hover:bg-blush-soft transition inline-flex items-center justify-center"
        >
          <Icon name="trash" className="w-4 h-4" />
        </button>
      </div>

      {lead.post_text ? (
        <div className="ui-body leading-[1.7] text-charcoal whitespace-pre-wrap max-w-[68ch] border-l-2 border-blush pl-4 mb-5">
          <Linkified text={lead.post_text} />
        </div>
      ) : (
        <p className="ui-body text-muted italic mb-5">No post text. Open the source link to see the page.</p>
      )}

      {reasons.length > 0 && (
        <div className="mb-5 max-w-[68ch]">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="ui-small font-semibold uppercase tracking-wider text-ink-3">Why it's a fit</span>
            {lead.confidence === 'low' && (
              <span
                title="The AI could not verify this one. Usually no ad copy and no landing page. Check them yourself before you write."
                className="ui-meta px-2 py-0.5 rounded-full border border-line-strong text-ink-3 whitespace-nowrap"
              >
                Unverified
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r, i) => (
              <span
                key={i}
                className="ui-body px-3 py-1.5 r-md border border-line bg-card text-ink leading-snug"
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      <CopyBlock label="Your DM, drafted by Honey Bee" text={splitNotes(lead.notes).draft} primary />
      <CopyBlock label="Suggested opening line" text={splitNotes(lead.notes).opener} />

      {splitNotes(lead.notes).rest && (
        <div className="ui-body text-ink-2 leading-[1.7] whitespace-pre-wrap max-w-[68ch] mb-5">
          <Linkified text={splitNotes(lead.notes).rest} />
        </div>
      )}

      {parseSignals(lead.signals).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="ui-small font-semibold uppercase tracking-wider text-ink-3">On their page</span>
          {parseSignals(lead.signals).map((s) => (
            <span
              key={s.key}
              className="ui-small font-medium px-2.5 py-1 r-md border border-rose-line text-rose-text bg-rose-tint"
            >
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {lead.post_url && (
          <a
            href={lead.post_url}
            target="_blank"
            rel="noreferrer"
            className="h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border border-line text-charcoal-2 hover:bg-blush-soft transition"
          >
            <span className="inline-flex items-center gap-1.5">View source <Icon name="external-link" className="w-3.5 h-3.5" /></span>
          </a>
        )}
        {lead.dest_url && (
          <a
            href={lead.dest_url}
            target="_blank"
            rel="noreferrer"
            title="The page their ads send paid traffic to. Walk it like a customer before you message them. Whatever breaks between the click and the booking is the thing you fix."
            className="h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border border-rose-line text-rose-text bg-rose-tint hover:brightness-110 transition"
          >
            <span className="inline-flex items-center gap-1.5">Their landing page <Icon name="external-link" className="w-3.5 h-3.5" /></span>
          </a>
        )}
        {/* The email pulled off their landing page, if one was there. This is
            the whole reason the ad scan is worth running for email outreach:
            the address to actually write to. A mailto opens a draft; the label
            is the address itself so it can be read and copied at a glance. When
            none was found the lead still stands as a match, so say so plainly
            rather than hiding the gap. */}
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            title="Pulled from their landing page. Opens a new email to them."
            className="h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border border-rose-line text-rose-text bg-rose-tint hover:brightness-110 transition"
          >
            <span className="inline-flex items-center gap-1.5"><Icon name="mail" className="w-3.5 h-3.5" /> {lead.email}</span>
          </a>
        ) : lead.dest_url ? (
          <span
            title="No email was listed on their landing page. They're still a match — reach them another way, or check the page yourself."
            className="h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border border-line text-ink-3"
          >
            No email on their site
          </span>
        ) : null}
        {(lead.author_name || lead.author_handle) && (
          <a
            href={buildAdLibraryUrl(lead.author_name || lead.author_handle)}
            target="_blank"
            rel="noreferrer"
            title="Facebook's public ad archive. Shows every ad this page is running right now, which proves they spend money and gives you something real to open with."
            className="h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border border-line text-charcoal-2 hover:bg-blush-soft transition"
          >
            <span className="inline-flex items-center gap-1.5">See their ads <Icon name="external-link" className="w-3.5 h-3.5" /></span>
          </a>
        )}
        <CopyDmButton lead={lead} settings={settings} />
        {lead.status === 'new' && (
          <button
            id="lead-ask-ai"
            onClick={() => setAskAI((v) => !v)}
            className="h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border border-line text-charcoal-2 hover:bg-blush-soft transition"
          >
            {askAI ? 'Close AI helper' : 'Ask AI about this lead'}
          </button>
        )}
      </div>

      {askAI && (
        <ScorePanel lead={lead} settings={settings} updateLead={updateLead} onClose={() => setAskAI(false)} />
      )}
    </div>
  );
}

// The sticky decision rail: status, the three verdicts, undo, navigation.
function DecisionPanel({ lead, decide, undoLast, lastDecision, savedFlash, updateLead, updateLocal, onPromoted, moveSelection, onOpenProspect }) {
  const [promoting, setPromoting] = useState(false);
  const [unpromoting, setUnpromoting] = useState(false);
  const reasons = parseReasons(lead);

  async function promote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/promote`, { method: 'POST' });
      let data = {};
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) {
        toast(data.error || `Promote failed (HTTP ${res.status})`, { tone: 'error', action: { label: 'Retry', onClick: promote } });
        return;
      }
      updateLocal(data.lead);
      if (onPromoted) onPromoted(lead.id);
    } catch (e) {
      toast(`Promote failed: ${e.message || e}`, { tone: 'error', action: { label: 'Retry', onClick: promote } });
    } finally {
      setPromoting(false);
    }
  }
  async function unpromote() {
    setUnpromoting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/promote`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || `Undo failed (HTTP ${res.status})`, { tone: 'error', action: { label: 'Retry', onClick: unpromote } });
        return;
      }
      updateLocal(data.lead);
    } catch (e) {
      toast(`Undo failed: ${e.message || e}`, { tone: 'error', action: { label: 'Retry', onClick: unpromote } });
    } finally {
      setUnpromoting(false);
    }
  }

  // A horizontal decision bar, not a side rail. The rail floated at the far
  // right of a wide screen as its own box, which read as a widget nobody
  // connected to the lead; the bar sits directly on top of the lead card, so
  // the thing being judged and the buttons that judge it are one unit.
  const act = 'h-9 inline-flex items-center gap-1.5 px-3.5 r-md ui-body font-semibold transition ui-control';
  const outline = act + ' border border-line-strong bg-paper text-charcoal-2 hover:bg-blush-soft';
  const quiet = 'h-9 inline-flex items-center px-3 r-md border border-line ui-body text-charcoal-2 hover:bg-blush-soft transition';
  const kbdDark = 'ui-meta px-1.5 py-0.5 rounded bg-white/20';
  const kbdLight = 'ui-meta px-1.5 py-0.5 rounded bg-blush-soft text-muted';

  return (
    <div className="bg-panel border border-line-strong r-lg shadow-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="ui-small text-muted">Fit</span>
        <VerdictChip verdict={lead.verdict} />
        {/* No AI-reason paragraph here: the same sentence already renders
            under "Why it's a fit" in the center pane. */}
        {lead.verdict_source === 'you' && (
          <span className="ui-meta text-rose-text font-medium whitespace-nowrap">You decided this one</span>
        )}
        <VerdictOverride lead={lead} onSave={updateLead} />
      </div>

      {lead.status === 'new' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => decide(lead, 'good')}
            title="Worth messaging. Marks them green and moves them to Qualified."
            className={act + ' bg-emerald-700 text-white hover:bg-emerald-600'}
          >
            <Icon name="check" className="w-4 h-4" strokeWidth={2.5} /> Good fit
            <kbd className={kbdDark}>G</kbd>
          </button>
          <button
            onClick={() => decide(lead, 'skip')}
            title="Not a target. Marks them red and files them under Skipped. Nothing gets deleted."
            className={act + ' btn-bloom'}
          >
            <Icon name="x" className="w-4 h-4" strokeWidth={2.5} /> Skip
            <kbd className={kbdDark}>S</kbd>
          </button>
          <button
            onClick={() => document.getElementById('lead-ask-ai')?.click()}
            title="Not sure? The AI will give you a verdict and tell you why."
            className={outline}
          >
            Not sure, ask AI
            <kbd className={kbdLight}>N</kbd>
          </button>
        </div>
      )}
      {lead.status === 'qualified' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={promote}
            disabled={promoting}
            title="Creates a prospect row in your pipeline. Do this once the DM is sent, or ready to send."
            className={act + ' bg-mauve-deep text-paper hover:opacity-90'}
          >
            {promoting ? 'Adding…' : 'Add to Prospects →'}
          </button>
          <button
            onClick={() => updateLead(lead.id, { status: 'skipped' })}
            className={outline}
          >
            Not a fit after all
          </button>
        </div>
      )}
      {lead.status === 'skipped' && (
        <button
          onClick={() => updateLead(lead.id, { status: 'new' })}
          className={outline}
        >
          Restore to Review
        </button>
      )}
      {lead.status === 'promoted' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="ui-body font-medium text-leaf-text inline-flex items-center gap-1"><Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} /> In Prospects</span>
          <button
            onClick={() => {
              // Hand the row id over so Prospects can clear its filters and
              // scroll to it. Plain navigation used to drop you on the sheet
              // with the row hidden behind whatever filter was already on.
              if (onOpenProspect) onOpenProspect(lead.promoted_prospect_id);
              else window.location.hash = 'prospects';
            }}
            title="Opens your Prospects table and scrolls to their row."
            className={outline}
          >
            View in Prospects →
          </button>
          <button
            onClick={unpromote}
            disabled={unpromoting}
            title="Takes them back out of Prospects. The row goes to Trash and the lead comes back here."
            className={quiet}
          >
            {unpromoting ? 'Undoing…' : 'Un-promote'}
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {savedFlash && <span className="ui-small text-leaf-text font-medium inline-flex items-center gap-1" role="status">Saved <Icon name="check" className="w-3 h-3" strokeWidth={2.5} /></span>}
        {lastDecision && (
          <button onClick={undoLast} className={quiet} title={`Undo last decision (${lastDecision.label})`}>
            Undo
          </button>
        )}
        <button onClick={() => moveSelection(-1)} title="Previous lead (↑)" className={quiet}>↑ Prev</button>
        <button onClick={() => moveSelection(1)} title="Next lead (↓)" className={quiet}>↓ Next</button>
        <span className="hidden xl:inline ui-meta text-muted whitespace-nowrap">G good · S skip · N ask AI · ↑↓ move</span>
      </div>

      {lead.your_note && (
        <p className="w-full ui-small text-charcoal-2 leading-snug border-l-2 border-rose-line pl-2 order-last">{lead.your_note}</p>
      )}
      {lead.status === 'qualified' && (
        <p className="w-full ui-small text-muted leading-snug order-last">
          Copy the DM prompt, send the message yourself from your own account, then add them to Prospects so the follow-ups get tracked.
        </p>
      )}
    </div>
  );
}

function ScorePanel({ lead, settings, updateLead, onClose }) {
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [parseError, setParseError] = useState('');

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildVerdictPrompt(settings, lead));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setParseError('Copy failed. Your browser blocked clipboard access.');
    }
  }

  async function applyPaste() {
    const res = parseScoringResult(pasted);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setParseError('');
    const { verdict, reasons, suggestedFirstLine } = res.data;
    const notes = suggestedFirstLine
      ? `${lead.notes ? `${lead.notes}\n` : ''}First line: ${suggestedFirstLine}`
      : lead.notes || '';
    const saved = await updateLead(lead.id, { verdict, verdict_reasons: reasons, notes });
    if (saved) onClose();
  }

  async function manualVerdict(verdict) {
    const saved = await updateLead(lead.id, { verdict, verdict_reasons: [] });
    if (saved) onClose();
  }

  return (
    <div className="mt-3 border border-line r-lg bg-paper p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="ui-small font-semibold text-charcoal">
          Score this lead
        </span>
        <button onClick={onClose} className="text-xs text-muted hover:text-charcoal">
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={copyPrompt}
          className="px-3 py-1.5 ui-body font-medium r-md bg-charcoal text-paper"
        >
          {copied ? <span className="inline-flex items-center gap-1">Copied <Icon name="check" className="w-3 h-3" strokeWidth={2.5} /></span> : '1 · Copy prompt'}
        </button>
        <span className="text-xs text-muted">
          Paste it into ChatGPT or Claude (free is fine), then paste the reply below.
        </span>
      </div>

      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={3}
        placeholder="2 · Paste the AI's reply here…"
        className="w-full bg-panel border border-line-strong shadow-card r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={applyPaste}
          disabled={!pasted.trim()}
          className="px-3 py-1.5 ui-body font-medium r-md bg-charcoal text-paper ui-control"
        >
          Apply result
        </button>
        <span className="ui-small text-muted">or manually:</span>
        <button
          onClick={() => manualVerdict('green')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 ui-body font-medium r-md border border-line bg-surface hover:bg-blush-soft"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" /> Green
        </button>
        <button
          onClick={() => manualVerdict('red')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 ui-body font-medium r-md border border-line bg-surface hover:bg-blush-soft"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Red
        </button>
      </div>
      {parseError && <div className="text-xs text-red-700">{parseError}</div>}
    </div>
  );
}


// ── Find: intent phrases + per-platform sourcing (the "it finds" screen) ──

function CopyDmButton({ lead, settings, small = false }) {
  const [copied, setCopied] = useState(false);
  if (!lead.post_text) return null;
  const cls = small
    ? `text-xs underline decoration-dotted transition ${copied ? 'text-leaf-text' : 'text-mauve-deep'}`
    : `h-10 inline-flex items-center px-3.5 ui-body font-medium r-md border transition ${
        copied ? 'border-leaf text-leaf-text' : 'border-line text-charcoal-2 hover:bg-blush-soft'
      }`;
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(buildMessageWriterPrompt(settings, lead));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {}
      }}
      title="Copies a prompt written around this exact post. Paste it into ChatGPT or Claude and it drafts the DM for you."
      className={cls}
    >
      {copied ? <span className="inline-flex items-center gap-1">Copied <Icon name="check" className="w-3 h-3" strokeWidth={2.5} /></span> : 'Copy DM prompt'}
    </button>
  );
}

// In-app Facebook ad scan. Renders only when the workspace has an allowance
// (or the user is an admin). The server runs Apify on a shared token — the
// user just types a niche and presses Scan. Results land in this inbox.
// In-app scans: three one-form scrapers that run server-side on the shared
// Apify token. No Apify account, no dataset IDs, no copy-paste — pick a
// mode, fill the fields, press Scan. Renders only when the workspace has an
// allowance (or the user is an admin).
// Platform marks for the scan tabs. Drawn simply on purpose: at 14px a
// faithful multi-path logo turns to mush, and these need to be readable
// at a glance more than they need to be pixel-accurate.
function PlatformMark({ id, active }) {
  const dim = active ? '#fff' : null;
  // Discovery is Instagram too, but the job is "find more like these", so it
  // gets the Instagram glyph with a spark rather than a second identical tab.
  if (id === 'ig-discover') {
    return (
      <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] shrink-0" aria-hidden="true" fill="none">
        <rect x="2.5" y="2.5" width="15" height="15" rx="4.5" stroke={dim || '#C13584'} strokeWidth="1.8" />
        <circle cx="10" cy="10" r="3.4" stroke={dim || '#C13584'} strokeWidth="1.8" />
        <path d="M19 14.5 19.9 17.1 22.5 18 19.9 18.9 19 21.5 18.1 18.9 15.5 18 18.1 17.1z" fill={dim || '#E1306C'} />
      </svg>
    );
  }
  if (id === 'fb-ads' || id === 'fb-posts') {
    return (
      <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] shrink-0" aria-hidden="true">
        <path
          fill={dim || '#1877F2'}
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8v8.44C19.61 23.08 24 18.09 24 12.07z"
        />
      </svg>
    );
  }
  if (id === 'ig-profiles') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="w-[14px] h-[14px] shrink-0" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke={dim || '#E4405F'} strokeWidth="2" />
        <circle cx="12" cy="12" r="4.2" stroke={dim || '#E4405F'} strokeWidth="2" />
        <circle cx="17.6" cy="6.4" r="1.3" fill={dim || '#E4405F'} />
      </svg>
    );
  }
  if (id === 'podcast') {
    // A microphone: the podcast glyph, purple like the app rather than any one
    // platform's brand, since a feed is platform-neutral.
    return (
      <svg viewBox="0 0 24 24" fill="none" className="w-[14px] h-[14px] shrink-0" aria-hidden="true">
        <rect x="9" y="2.5" width="6" height="11" rx="3" stroke={dim || '#7E3B94'} strokeWidth="2" />
        <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke={dim || '#7E3B94'} strokeWidth="2" strokeLinecap="round" />
        <path d="M12 17.5V21M8.5 21h7" stroke={dim || '#7E3B94'} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'booking-search') {
    // A calendar: they already take bookings, which is the whole signal.
    return (
      <svg viewBox="0 0 24 24" fill="none" className="w-[14px] h-[14px] shrink-0" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" stroke={dim || '#2C7A5A'} strokeWidth="2" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" stroke={dim || '#2C7A5A'} strokeWidth="2" strokeLinecap="round" />
        <path d="m8.5 14 2.2 2.2L15.5 12" stroke={dim || '#2C7A5A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-[14px] h-[14px] shrink-0" aria-hidden="true">
      <path
        d="M12 22s7-6.34 7-11.5A7 7 0 0 0 5 10.5C5 15.66 12 22 12 22z"
        stroke={dim || '#EA4335'}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10.3" r="2.6" fill={dim || '#EA4335'} />
    </svg>
  );
}

const SCAN_MODES = [
  {
    id: 'fb-ads',
    icon: 'facebook',
    color: '#1877F2',
    label: 'Facebook ads',
    tip: 'Finds pages that are paying to advertise in your niche right now. If someone is spending on ads, they have a budget. That is the whole point of this one.',
    lands: 'Whatever it finds lands in this inbox.',
  },
  {
    id: 'fb-posts',
    icon: 'facebook',
    color: '#1877F2',
    label: 'Facebook posts',
    tip: 'Searches public posts for a phrase a buyer would type. Write it the way someone complains, not the way you would advertise: "my front desk keeps missing calls" finds owners, while "manage my calendar and client intake" mostly finds assistants advertising that they do it.',
    lands: 'Only posts that actually ask for something land here. Facebook matches words, not intent, so most of what comes back is people selling the same service. Those are dropped before they reach you and the scan tells you how many. Facebook post search has no country filter, so results are worldwide.',
  },
  {
    id: 'ig-profiles',
    icon: 'instagram',
    color: '#E4405F',
    label: 'Instagram profiles',
    tip: 'Paste Instagram handles and it checks each one against your Dream Client Checklist. Followers, real engagement, whether the bio reads like a business, whether the link goes somewhere you can actually buy, and the revenue signals it can see.',
    lands: 'Results show up below with a pass or fail on the must-haves and a score out of 6. Nothing is added until you pick. The one thing it cannot check is whether they run ads, so each card links you to the Ad Library for that.',
  },
  {
    id: 'ig-discover',
    icon: 'instagram',
    color: '#E4405F',
    label: 'Find similar',
    tip: 'The other way round from the one before it. Give it 1 to 5 handles of clients like the ones you want more of, and it comes back with accounts Instagram itself considers similar, already scored against your Dream Client Checklist. Seed it with people you actually liked working with, not just anyone big.',
    lands: 'Up to 30 accounts show up below, already scored, and that includes the ones that did not qualify. The checklist cannot see everything, so a near-miss is still yours to judge. Use the tabs to look at just the ones that qualify or just the ones that did not, and each card tells you which must-have it missed. Anyone you have been shown in an earlier scan is left out, so you never sift the same person twice. Nothing is added until you pick.',
  },
  {
    id: 'maps',
    icon: 'map-pin',
    color: '#EA4335',
    label: 'Google Maps',
    tip: 'Up to 4 niches at once, separated by commas, plus one city. Like "wedding photographer, florist" in "Denver, Colorado".',
    lands: 'Results show up below first so you can look before anything moves. Nothing gets added until you pick it. The ones with an email land in Prospects as Prescreen so you can still say strong or skip. The rest land as New.',
  },
  {
    id: 'podcast',
    icon: 'mic',
    color: '#A855F7',
    label: 'Podcast guests',
    tip: 'Paste the RSS feed URLs of podcasts your dream clients guest on, one per line. A coach who goes on a show to be interviewed is warm, findable, and named in the feed. Finding a show\'s feed URL is a manual step, so paste the feeds you already know.',
    lands: 'Every guest it could name shows up below. Episodes where it could not pull a name are kept so you can read who it was, but only rows with a name get imported. Guests land in this inbox as new leads. Costs nothing, since podcast feeds are open.',
  },
  {
    id: 'booking-search',
    icon: 'calendar-check',
    color: '#14A800',
    label: 'Booking pages',
    tip: 'Finds businesses already using a scheduling tool like Calendly or Acuity, by searching the booking platforms for your niche. If they take bookings online, they are running a real practice. Type the niche the way you would search it, like "wedding photographer" or "personal trainer".',
    lands: 'Results show up below with their booking link. Nothing is added until you pick. They land in Prospects as New. This one uses a paid search API, so it needs a key set up on the server first.',
  },
];

// What the bee is "doing" while a scan runs — cycled under the progress
// track so a 2-minute wait never looks frozen.
// One truthful line per scan type. These do NOT rotate: the scan reports
// nothing back until it finishes, so advancing a label on a timer would be
// inventing progress. (The rotating SCAN_PHASES this replaces did exactly
// that.)
const SCAN_WAITING = {
  'ig-profiles': 'Opening each profile and scoring it against your checklist.',
  'ig-discover': 'Asking Instagram who is similar to your seed accounts.',
  'fb-ads': 'Searching the Ad Library for pages paying to advertise.',
  'fb-posts': 'Reading fresh public posts for your phrase.',
  maps: 'Searching Google Maps for businesses that match.',
  podcast: 'Reading the podcast feeds and pulling out the guests.',
  'booking-search': 'Searching the booking platforms for your niche.',
};

function ScanProgress({ mode, contacts }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor(elapsed / 60);
  const time = mins > 0 ? `${mins}m ${elapsed % 60}s` : `${elapsed}s`;

  // Indeterminate on purpose. A scan runs on Apify's side and reports nothing
  // back until it is finished, so there is no honest fraction to show and no
  // real stage boundary to announce. The old version faked both: an
  // exponential curve capped at 92%, and stage labels advancing on a timer
  // rather than on work. One truthful line and the elapsed clock is all this
  // genuinely knows.
  const label =
    (SCAN_WAITING[mode] || SCAN_WAITING.maps) +
    (mode === 'maps' && contacts ? ' Looking for emails takes longer.' : '');

  // Bloom spinner + flowing scan bar, per the redesign. The bar is
  // indeterminate on purpose — a scan reports nothing until it finishes, so a
  // travelling light band says "working" without faking a percentage. Replaces
  // the butterfly-loop BloomProgress that used to sit here.
  return (
    <div className="mt-4 border-t border-line pt-4 flex items-center gap-3.5">
      <BloomSpinner size={30} />
      <div className="flex-1 min-w-0">
        <div className="ui-body text-ink mb-1.5">
          {label} <span className="text-ink-3">{time}</span>
        </div>
        <div className="scanbar"><div className="scanbar-fill" /></div>
        <div className="ui-small text-ink-3 mt-1.5">
          You can leave this page. We'll keep it running.
        </div>
      </div>
    </div>
  );
}

// One fetch per session, not one per open. The allowance changes about never,
// so the scanner should not make her watch a spinner every time the card
// opens. Filled by the panel's own refresh and by the prefetch in LeadInbox,
// then reused instantly; a background refresh keeps it honest.
let LIMITS_CACHE = null; // { limits, used, isAdmin }
export async function prefetchScanLimits() {
  try {
    const d = await fetch('/api/limits').then((r) => r.json());
    if (d && d.limits) {
      LIMITS_CACHE = { limits: d.limits, used: d.usage?.adScansThisWeek || 0, isAdmin: Boolean(d.isAdmin) };
    }
  } catch {}
  return LIMITS_CACHE;
}

function ScanPanel({ onImported, phrases = [], standalone = false }) {
  const [limits, setLimits] = useState(() => LIMITS_CACHE?.limits ?? null); // null = loading
  const [limitsError, setLimitsError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => LIMITS_CACHE?.isAdmin ?? false);
  const [used, setUsed] = useState(() => LIMITS_CACHE?.used ?? 0);
  const [mode, setMode] = useState('fb-ads');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('US');
  const [location, setLocation] = useState('');
  const [count, setCount] = useState(50);
  const [contacts, setContacts] = useState(false);
  // fb-posts recency. An ask from a year ago was answered by someone else
  // long ago.
  const [days, setDays] = useState(30);
  // fb-ads page-size cap: solo practices live in the small band; 100k-like
  // pages are brands with agencies. Filtering is free — same scan, we just
  // keep fewer.
  const [maxLikes, setMaxLikes] = useState(10000);
  // fb-ads: keep only ads that have been running 30+ days — sustained spend
  // is the strongest "has budget" signal an ad can give.
  const [longRunning, setLongRunning] = useState(false);
  // Instagram handles, one per line or comma separated.
  const [handles, setHandles] = useState('');
  // Both Instagram modes are driven by pasted handles rather than a search
  // phrase, so every branch that used to name ig-profiles asks this instead.
  const isHandleMode = mode === 'ig-profiles' || mode === 'ig-discover';
  // Podcast pastes feed URLs into the same multi-line box the handle modes use,
  // and they travel as `query` the way a maps niche does.
  const isFeedMode = mode === 'podcast';
  // Podcast and booking search read public pages themselves. They buy nothing
  // from outside, so the server charges nothing, and the button used to quote
  // a price anyway.
  const freeScan = mode === 'podcast' || mode === 'booking-search';
  // maps junk filters, applied by the actor itself: minimum Google rating
  // and whether places need a website. Same run, fewer bad rows.
  const [minStars, setMinStars] = useState('threeAndHalf');
  const [siteFilter, setSiteFilter] = useState('');
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState('');
  // Maps review buffer: results wait here until the user picks.
  const [results, setResults] = useState(null);
  const [scanId, setScanId] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [resultFilter, setResultFilter] = useState('all');
  // How many the last import actually added, so there is something to follow
  // to. Cleared whenever a new scan starts.
  const [justAdded, setJustAdded] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [importing, setImporting] = useState(false);
  // Past maps scans — their results stay on the server, so a review list
  // you navigated away from can always be reopened.
  const [recent, setRecent] = useState([]);
  const [reopening, setReopening] = useState(null);

  async function refreshRecent() {
    try {
      const d = await fetch('/api/scan?list=maps').then((r) => r.json());
      if (Array.isArray(d?.scans)) setRecent(d.scans);
    } catch {}
  }
  useEffect(() => { refreshRecent(); }, []);

  // Looks up the real websites for a set of booking rows. One paid search each,
  // which is why it is a button rather than something that happens on its own.
  async function lookUpSites(indices) {
    if (enriching || !scanId || !indices.length) return;
    setEnriching(true);
    try {
      const res = await fetch('/api/scan/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, indices }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      if (Array.isArray(d.results)) setResults(d.results);
      setMsg(
        d.found > 0
          ? `Found ${d.found} website${d.found === 1 ? '' : 's'} out of ${d.looked} looked up.`
          : `Looked up ${d.looked}, none had a site we could find. They may only exist on the booking platform.`
      );
    } catch (e) {
      setMsg('Failed: ' + e.message);
    } finally {
      setEnriching(false);
    }
  }

  async function reopenScan(id) {
    if (reopening) return;
    setReopening(id);
    try {
      const d = await fetch('/api/scan?id=' + id).then((r) => r.json());
      const list = d?.results || [];
      if (!list.length) { setMsg('That scan has no stored results.'); return; }
      // The mode a scan is reopened in has to be the type it was run as. This
      // was pinned to 'maps', which was true of every reopenable scan when it
      // was written and stopped being true once podcast and booking-search
      // started landing in review lists: their rows would have come back
      // rendered as maps results, reading fields that are not on them.
      setMode(d?.scan?.type || 'maps');
      setScanId(id);
      setResults(list);
      setPicked(new Set());
      setResultFilter('all');
      setMsg('Reopened "' + (d?.scan?.query || 'scan') + '". Rows already in Prospects are marked.');
    } catch (e) {
      setMsg('Failed: ' + e.message);
    } finally {
      setReopening(null);
    }
  }

  async function refreshLimits() {
    setLimitsError(false);
    const got = await prefetchScanLimits();
    if (got) {
      setLimits(got.limits);
      setUsed(got.used);
      setIsAdmin(got.isAdmin);
    } else if (!LIMITS_CACHE) {
      setLimitsError(true);
    }
  }
  // Stale-while-revalidate: the cache renders instantly, the network answer
  // quietly replaces it. Only a cold cache ever shows the spinner.
  useEffect(() => { refreshLimits(); }, []);

  const allowance = limits?.adScansPerWeek || 0;
  const enabled = isAdmin || allowance > 0;
  // Never a blank band. This used to return null while the allowance loaded,
  // so opening "Find new leads" showed an empty card with a Hide button — and
  // if the request failed, it stayed empty with no way out. Loading gets a
  // spinner; failure gets the reason and a Retry.
  if (!limits) {
    return limitsError ? (
      <div className="py-6 text-center">
        <p className="ui-body text-ink mb-3">Couldn't load your scan allowance, so the scanner can't open.</p>
        <button
          onClick={refreshLimits}
          className="ui-body font-semibold px-4 py-2 r-md btn-bloom transition"
        >
          Try again
        </button>
      </div>
    ) : (
      <div className="py-8 flex items-center justify-center gap-2.5 ui-body text-ink-2">
        <BloomSpinner size={18} />
        Opening the scanner…
      </div>
    );
  }
  if (!enabled) {
    // No silent vanishing: a workspace without an allowance sees WHY the
    // scans aren't there instead of a mysteriously missing feature.
    return (
      <div className="text-center py-6">
        <div className="ui-heading text-charcoal-2 mb-1">Scans are not switched on for this workspace yet.</div>
        <p className="ui-body text-muted">Ask your admin to set a weekly scan allowance. Once they do, Facebook ads, Facebook posts and Google Maps show up right here.</p>
      </div>
    );
  }
  const left = isAdmin ? null : Math.max(0, allowance - used);
  const m = SCAN_MODES.find((x) => x.id === mode);

  async function runScan() {
    // Instagram mode fills `handles`, not `query`, so the old
    // `!query.trim()` guard bailed here silently: the button looked
    // enabled, clicking it did nothing at all, and no message appeared
    // because the function returned before any state changed.
    const hasInput = isHandleMode || isFeedMode ? handles.trim() : query.trim();
    if (scanning || !hasInput) return;
    setScanning(true);
    setResults(null);
    setPicked(new Set());
    // Belongs to the import that produced it, not to whatever runs next.
    setJustAdded(0);
    setMsg('Starting the scan…');
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mode,
          query: isFeedMode ? handles.trim() : isHandleMode ? (query.trim() || 'handles') : query.trim(),
          country,
          location: location.trim(),
          count,
          contacts: mode === 'maps' ? contacts : false,
          maxLikes: mode === 'fb-ads' && maxLikes ? maxLikes : null,
          longRunning: mode === 'fb-ads' ? longRunning : false,
          handles: isHandleMode ? handles : null,
          days: mode === 'fb-posts' ? days : undefined,
          minStars: mode === 'maps' && minStars ? minStars : null,
          siteFilter: mode === 'maps' && siteFilter ? siteFilter : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      const id = data.scanId;
      setScanId(id);
      setMsg('');
      // Non-Apify scans (podcast, booking) finish inside the POST and return
      // status 'done' with their summary already, so there is nothing to poll.
      // Polling GET for them returns no summary and the result fell through to
      // the wrong "nothing worth adding" branch.
      if (data.status === 'done') {
        const sum = data.summary || {};
        const list = sum.results || [];
        setResults(list);
        const errNote = (sum.errors && sum.errors.length) ? ` ${sum.errors.length} feed(s) could not be read.` : '';
        setMsg(list.length ? `Found ${list.length}. Pick which to add below.${errNote}` : 'The scan finished but found nothing. Check the feed URLs.');
        setScanning(false);
        refreshLimits();
        return;
      }
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 8000));
        const poll = await fetch('/api/scan?id=' + id).then((r) => r.json()).catch(() => null);
        const sRow = poll?.scan;
        if (!sRow) continue;
        if (sRow.status === 'failed') throw new Error(sRow.error || 'The scan failed.');
        if (sRow.status === 'done') {
          const sum = poll.summary || {};
          // The server says where a scan lands. Keying off the mode instead
          // meant Instagram results were scored, stored, and never rendered —
          // they land in review exactly like Maps does.
          if (sum.landsIn === 'review' || mode === 'maps') {
            const list = sum.results || poll.results || [];
            setResults(list);
            const seenNote = sum.alreadySeen ? ` ${sum.alreadySeen} you have already been shown were left out.` : '';
            setMsg(list.length
              ? `Found ${list.length}. Pick which to add below.${seenNote}`
              : sum.alreadySeen
                ? `Everything it found this time you have already been shown. Try different seed accounts.`
                : 'The scan finished but found nothing for that search. Try a broader niche or a bigger city.');
          } else {
            // Say what was thrown away and why. 3 leads out of 50 looks like a
            // broken scan unless you can see the other 47 were people selling
            // the same service.
            const added = sRow.leads_added ?? 0;
            const f = sum.funnel;
            if (f) {
              // The whole funnel, so a small "added" number reads as the four
              // filters working rather than a broken scan. One advertiser runs
              // many ads, so the ad count always collapses to fewer businesses.
              const bits = [];
              if (f.alreadyInInbox) bits.push(`${f.alreadyInInbox} already in your inbox`);
              if (f.belowBarOrJunk) bits.push(`${f.belowBarOrJunk} under the follower bar or junk`);
              const tail = bits.length ? ` — ${bits.join(', ')} left out.` : '';
              setMsg(
                added > 0
                  ? `${added} new added below. ${f.ads} ads → ${f.businesses} businesses.${tail}`
                  : `${f.businesses} businesses found, but ${f.alreadyInInbox ? 'you already have them all' : 'none cleared the follower bar'}. Try different wording or a country you have not scanned.`
              );
            } else {
              const drops = sum.dropped
                ? Object.entries(sum.dropped).map(([why, n]) => `${n} ${why}`).join(', ')
                : '';
              setMsg(
                added > 0
                  ? `${added} real ask${added === 1 ? '' : 's'} added below.` + (drops ? ` Skipped: ${drops}.` : '')
                  : `Nothing worth adding from that phrase.` + (drops ? ` Skipped: ${drops}.` : '') +
                    ' Try wording it the way someone complains rather than the way you would advertise.'
              );
            }
            setQuery('');
            if (onImported) onImported();
          }
          refreshLimits();
          refreshRecent();
          return;
        }
      }
      throw new Error('Timed out waiting for the scan. It may still finish. Check Recent scans in a few minutes.');
    } catch (e) {
      setMsg('Failed: ' + e.message);
      refreshLimits();
    } finally {
      setScanning(false);
    }
  }

  // Picker helpers
  // Instagram results carry checklist verdicts instead of place fields.
  const isIg = Boolean(results && results.length && results[0] && results[0].handle);
  // Podcast results have their own shape: no website, no email, and a guest may
  // or may not have been named. The website/email filter chips do not apply, so
  // they get their own two, all and named-only.
  const isPodcast = Boolean(results && results.length && results[0] && results[0].show);
  // A booking row is a name plus a scheduling link. Its website is not known
  // yet and is looked up on import, so anything keyed on having one has to
  // treat this shape differently.
  const isBooking = Boolean(results && results.length && results[0] && results[0].bookingUrl);
  const shown = (results || []).map((r, i) => ({ ...r, i })).filter((r) => {
    if (resultFilter === 'website') return Boolean(r.website);
    if (resultFilter === 'email') return Boolean(r.email);
    if (resultFilter === 'named') return Boolean(r.guest);
    if (resultFilter === 'qualified') return Boolean(r.qualifies);
    if (resultFilter === 'musthaves') return r.mustHaves === 'Y';
    // The near-misses. They failed the rubric, not your judgement — the
    // checklist can't see everything, so these stay reviewable instead of
    // being thrown away.
    if (resultFilter === 'rejected') return !r.qualifies;
    return true;
  });
  const anyEmails = (results || []).some((r) => r.email);
  function togglePick(i) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }
  function pickAllShown() {
    setPicked((prev) => {
      const shownIdx = shown.filter((r) => !r.imported).map((r) => r.i);
      const allPicked = shownIdx.every((i) => prev.has(i));
      const n = new Set(prev);
      shownIdx.forEach((i) => { if (allPicked) n.delete(i); else n.add(i); });
      return n;
    });
  }
  async function importPicked() {
    if (importing || picked.size === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/scan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, indices: [...picked] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      const parts = [];
      if (data.toScreen) parts.push(data.toScreen + ' added, ready for your strong or skip pass');
      if (data.fresh) parts.push(data.fresh + ' New');
      if (data.skippedDuplicate) parts.push(data.skippedDuplicate + ' already tracked, skipped');
      // Booking rows arrive with a scheduling link and no website, and their
      // real site is searched for during this import. Worth saying, because the
      // review list above shows no websites at all and then the prospects that
      // come out of it have one, which reads as the app inventing them.
      const note = isBooking && (data.added ?? 0) > 0
        ? ' Their websites were looked up as they were added.'
        : '';
      setMsg('Added to Prospects: ' + (parts.join(' · ') || 'nothing new') + '.' + note);
      setJustAdded(data.added ?? ((data.toScreen ?? 0) + (data.fresh ?? 0)));
      // Keep the list open with imported rows marked — the rest of the
      // results never vanish, they wait for your next pass.
      if (Array.isArray(data.results)) setResults(data.results);
      setPicked(new Set());
      refreshRecent();
      if (onImported) onImported();
    } catch (e) {
      setMsg('Failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={standalone ? '' : 'mt-5 pt-4 border-t border-line'}>
      <div className="flex items-center gap-2.5 mb-1">
        <IconTile name="sparkle" tone="rose" size={26} radius={8} />
        <h3 className="font-serif text-xl text-charcoal flex-1">
          Find new leads
          <InfoTip title="How scans work">
            A scan is a program that reads public pages for you and writes down what it finds. It runs on our server, not on your computer, and it never touches your own social accounts. You do not need an account anywhere for this.
            {' '}
            <b>Facebook ads</b> finds pages paying to advertise. <b>Facebook posts</b> finds people asking for help in the words you searched. <b>Google Maps</b> finds local businesses by niche and city, and shows you everything first so you decide what gets in.
            {' '}
            <b>Fill in your Settings before your first scan.</b> The scan only knows what a good lead looks like if you told it. What you sell, who you sell to, and your green and red rules. Skip that part and you get a pile of names you will just delete.
          </InfoTip>
        </h3>
        {left != null && (
          <span
            title="Each scan frees up again 7 days after you run it."
            className={'ui-small font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ' + (
              left === 0
                ? 'border-poppy text-poppy-text'
                : left <= 2
                  ? 'border-gold text-gold-text'
                  : 'border-line text-ink-2'
            )}
          >
            {left} of {allowance} scans left this week
          </span>
        )}
      </div>

      {/* "This week" reads like a Monday reset, but the window is rolling —
          each scan frees itself up 7 days after you run it. Saying so out
          loud beats a tooltip nobody hovers on a phone. */}
      {left !== null && (
        <p className="ui-small text-muted mb-3 -mt-1">
          You get {allowance} scans a week, rolling: each one comes back 7 days after you run it.
        </p>
      )}

      {/* Command-bar mode picker: the seven scan types moved behind one
          dropdown so the panel reads as a single row instead of a wall of
          chips. The per-mode fields still appear below when the mode needs
          them. */}
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 ui-body text-ink-3">
          <Icon name="search" className="w-4 h-4" />
          Find leads on
        </span>
        <Select
          value={mode}
          onChange={(v) => { setMode(v); setMsg(''); setResults(null); setPicked(new Set()); setJustAdded(0); }}
          options={SCAN_MODES.map((x) => ({
            value: x.id,
            label: (
              <span className="inline-flex items-center gap-2">
                <span style={{ color: x.color }} className="inline-flex shrink-0">
                  <Icon name={x.icon} className="w-3.5 h-3.5" />
                </span>
                {x.label}
              </span>
            ),
          }))}
          ariaLabel="Scan type"
          disabled={scanning}
          buttonClassName="min-w-[170px]"
        />
      </div>

      <p className="ui-small text-charcoal-2 mb-2">{m.tip} {m.lands}</p>

      {(isHandleMode || isFeedMode) && (
        <div className="mb-2.5">
          <Label>{isFeedMode ? 'Podcast RSS feed URLs' : mode === 'ig-discover' ? 'Seed handles. Clients like the ones you want more of' : 'Instagram handles'}</Label>
          <textarea
            value={handles}
            onChange={(e) => setHandles(e.target.value)}
            rows={4}
            disabled={scanning || left === 0}
            placeholder={
              isFeedMode
                ? 'One feed URL per line.\nhttps://feeds.example.com/theshow\nhttps://anchor.fm/s/xxxx/podcast/rss'
                : mode === 'ig-discover'
                ? 'One to five, one per line.\n@aclientyouloved\n@anotheronelikeher'
                : 'One per line, or separated by commas.\n@dreamclient\ninstagram.com/anotherone\nthirdhandle'
            }
            className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve ui-control"
          />
          <p className="ui-small text-muted mt-1">
            {(() => {
              if (isFeedMode) {
                const n = handles.split(/[\n,]+/).map((h) => h.trim()).filter((u) => /^https?:\/\//i.test(u)).length;
                return n === 0 ? 'Up to 15 feeds per scan. Paste the RSS URL, not the show page.' : `${n} feed${n === 1 ? '' : 's'}${n > 15 ? ', only the first 15 will run' : ''}.`;
              }
              const n = handles.split(/[\n,;\s]+/).map((h) => h.trim()).filter(Boolean).length;
              const max = mode === 'ig-discover' ? 5 : 40;
              if (n === 0) {
                return mode === 'ig-discover'
                  ? 'Up to 5 seeds. It returns up to 30 similar accounts, and skips anyone you have already been shown.'
                  : 'Up to 40 profiles per scan.';
              }
              return `${n} handle${n === 1 ? '' : 's'}${n > max ? `, only the first ${max} will run` : ''}.`;
            })()}
          </p>
        </div>
      )}

      <div className="flex gap-2.5 flex-wrap items-end">
        <div className={isHandleMode || isFeedMode ? 'flex-1 min-w-[220px] hidden' : 'flex-1 min-w-[220px]'}>
          <Label>{mode === 'fb-posts' ? 'Buyer phrase' : mode === 'maps' ? 'Niches (up to 4, comma-separated)' : mode === 'booking-search' ? 'Niche to search for' : 'Niche or keyword'}</Label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runScan(); }}
            placeholder={
              mode === 'fb-posts'
                ? 'e.g. "what booking system do you use"'
                : mode === 'maps'
                  ? 'e.g. "wedding photographer, florist"'
                  : mode === 'booking-search'
                    ? 'e.g. "nutritionist" or "massage therapist"'
                    : 'e.g. "interior designer" or "pilates studio"'
            }
            list={mode === 'fb-posts' ? 'scan-phrases' : undefined}
            disabled={scanning || left === 0}
            className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve ui-control"
          />
        </div>
        {mode === 'fb-posts' && (
          <datalist id="scan-phrases">
            {phrases.map((ph) => <option key={ph} value={ph} />)}
          </datalist>
        )}
        {mode === 'fb-ads' && (
          <div>
            <Label>Location</Label>
            <Select
              value={country}
              onChange={(v) => setCountry(v)}
              disabled={scanning}
              options={['US', 'CA', 'AU', 'NZ', 'GB', 'ALL'].map((c) => ({ value: c, label: c === 'GB' ? 'UK' : c }))}
              ariaLabel="Location"
              minWidth={0}
            />
          </div>
        )}
        {mode === 'fb-ads' && (
          <div>
            <Label>Audience size</Label>
            <Select
              value={maxLikes}
              onChange={(v) => setMaxLikes(Number(v))}
              disabled={scanning}
              options={[
                { value: 10000, label: 'Solo-size (1k–10k likes)' },
                { value: 50000, label: 'Up to 50k likes' },
                { value: 0, label: 'Any size (1k+)' },
              ]}
              ariaLabel="Audience size"
              minWidth={0}
            />
          </div>
        )}
        {mode === 'maps' && (
          <div>
            <Label>Location</Label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder='e.g. "Denver, Colorado"'
              disabled={scanning}
              className="w-[190px] bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve ui-control"
            />
          </div>
        )}
        {mode === 'maps' && (
          <div>
            <Label>Min rating</Label>
            <Select
              value={minStars}
              onChange={(v) => setMinStars(v)}
              disabled={scanning}
              options={[
                { value: '', label: 'Any rating' },
                { value: 'three', label: '3★+' },
                { value: 'threeAndHalf', label: '3.5★+' },
                { value: 'four', label: '4★+' },
                { value: 'fourAndHalf', label: '4.5★+' },
              ]}
              placeholder="Any rating"
              ariaLabel="Min rating"
              minWidth={0}
            />
          </div>
        )}
        {mode === 'maps' && (
          <div>
            <Label>Website</Label>
            <Select
              value={siteFilter}
              onChange={(v) => setSiteFilter(v)}
              disabled={scanning}
              options={[
                { value: '', label: 'All places' },
                { value: 'withWebsite', label: 'With a website' },
                { value: 'withoutWebsite', label: 'Without a website' },
              ]}
              placeholder="All places"
              ariaLabel="Website filter"
              minWidth={0}
            />
          </div>
        )}
        {mode === 'fb-posts' && (
          <div>
            <Label>Posted within</Label>
            <Select
              value={days}
              onChange={(v) => setDays(Number(v))}
              disabled={scanning || left === 0}
              options={[
                { value: 7, label: 'Last 7 days' },
                { value: 30, label: 'Last 30 days' },
                { value: 90, label: 'Last 90 days' },
              ]}
              ariaLabel="Posted within"
              minWidth={0}
            />
          </div>
        )}
        <div className={isHandleMode ? 'hidden' : ''}>
          <Label>Results</Label>
          <Select
            value={count}
            onChange={(v) => setCount(Number(v))}
            disabled={scanning}
            options={[20, 50, 100].map((n) => ({ value: n, label: `${n} results` }))}
            ariaLabel="Results"
            minWidth={0}
          />
        </div>
        <button
          onClick={runScan}
          disabled={scanning || left === 0 || (isHandleMode || isFeedMode ? !handles.trim() : !query.trim())}
          title={freeScan ? 'This one is free. It reads public pages, it buys nothing.' : `This scan costs ${scanPrice(count).toLocaleString()} credits`}
          className="px-4 py-2 ui-body font-medium r-md btn-bloom transition ui-control"
        >
          {scanning ? 'Scanning…' : (freeScan ? 'Start scan · free' : `Start scan · ${scanPrice(count).toLocaleString()} credits`)}
        </button>
      </div>

      {mode === 'maps' && (
        <label className="flex items-start gap-2 mt-2 ui-small text-charcoal-2 cursor-pointer">
          <input
            type="checkbox"
            checked={contacts}
            onChange={(e) => setContacts(e.target.checked)}
            disabled={scanning}
            className="mt-0.5"
          />
          <span>
            Also look for business emails on their websites. <b>Honest note, this one costs more.</b> It opens each result's site to read it, so it is the only option here that really adds up. It is capped at 25 results no matter what you pick above. Anything with an email lands in Prospects as Prescreen so you can still say strong or skip.
          </span>
        </label>
      )}
      {mode === 'fb-ads' && (
        <label className="flex items-start gap-2 mt-2 ui-small text-charcoal-2 cursor-pointer">
          <input
            type="checkbox"
            checked={longRunning}
            onChange={(e) => setLongRunning(e.target.checked)}
            disabled={scanning}
            className="mt-0.5"
          />
          <span>
            Only ads that have been running <b>30 days or longer</b>. If someone has paid for the same ad for a month, they have a real budget. You get fewer results this way and better ones. Get rich quick pages are filtered out of every ads scan for you already.
          </span>
        </label>
      )}

      {left === 0 && !scanning && (
        <p className="ui-small text-muted mt-2">You have used all your scans for this week. Each one frees up again 7 days after you ran it.</p>
      )}
      {scanning && <ScanProgress mode={mode} contacts={contacts} />}
      {msg && !scanning && (
        <p className={'ui-small mt-2 ' + (msg.startsWith('Failed') ? 'text-poppy-text' : 'text-charcoal-2')}>{msg}</p>
      )}
      {/* Somewhere to go after importing. Rows were added to a different view
          with nothing on screen acknowledging it, so the only way to see what
          had just happened was to remember where to look. */}
      {justAdded > 0 && !scanning && (
        <p className="ui-small mt-1">
          <button
            onClick={() => { window.location.hash = 'prospects'; }}
            className="font-medium text-mauve-deep underline decoration-dotted"
          >
            See the {justAdded} in Prospects →
          </button>
          <span className="text-muted"> They are at the top, under New.</span>
        </p>
      )}

      {/* Maps review picker */}
      {results && results.length > 0 && (
        <div className="mt-3 border border-line r-lg overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-line bg-blush-soft/40">
            {isIg ? (
              ['all', 'qualified', 'musthaves', 'rejected'].map((f) => (
                <button
                  key={f}
                  onClick={() => setResultFilter(f)}
                  className={'ui-small font-medium px-2.5 py-1 rounded-full border transition ' + (
                    resultFilter === f ? 'bg-mauve-deep text-paper border-mauve-deep' : 'border-line text-charcoal-2'
                  )}
                >
                  {f === 'all'
                    ? 'All (' + results.length + ')'
                    : f === 'qualified'
                      ? 'Qualifies (' + results.filter((r) => r.qualifies).length + ')'
                      : f === 'musthaves'
                        ? 'Passed must-haves (' + results.filter((r) => r.mustHaves === 'Y').length + ')'
                        : 'Did not qualify (' + results.filter((r) => !r.qualifies).length + ')'}
                </button>
              ))
            ) : isPodcast ? (
              ['all', 'named'].map((f) => (
                <button
                  key={f}
                  onClick={() => setResultFilter(f)}
                  className={'ui-small font-medium px-2.5 py-1 rounded-full border transition ' + (
                    resultFilter === f ? 'bg-mauve-deep text-paper border-mauve-deep' : 'border-line text-charcoal-2'
                  )}
                >
                  {f === 'all' ? 'All (' + results.length + ')' : 'Named guest (' + results.filter((r) => r.guest).length + ')'}
                </button>
              ))
            ) : (
              // A booking row never carries a website at scan time: the search
              // returns a scheduling link, and the real site is looked up on
              // import, one search per row you actually picked. So "With
              // website" was always (0) here and read as "none of these have a
              // site", which is the opposite of what is true. It is dropped for
              // this mode rather than shown as a permanent zero.
              ['all', 'website', 'email'].map((f) => (
                (f !== 'website' || !isBooking) && (f !== 'email' || anyEmails) && (
                  <button
                    key={f}
                    onClick={() => setResultFilter(f)}
                    className={'ui-small font-medium px-2.5 py-1 rounded-full border transition ' + (
                      resultFilter === f ? 'bg-mauve-deep text-paper border-mauve-deep' : 'border-line text-charcoal-2'
                    )}
                  >
                    {f === 'all' ? 'All (' + results.length + ')' : f === 'website' ? 'With website (' + results.filter((r) => r.website).length + ')' : 'With email (' + results.filter((r) => r.email).length + ')'}
                  </button>
                )
              ))
            )}
            {/* Booking rows arrive with no website, and picking blind on a name
                alone is most of the work. This looks up the ones currently
                shown, so the search spend is a deliberate act on a shortlist
                rather than a tax on all fifty. Rows already looked up are not
                bought again. */}
            {isBooking && (() => {
              const todo = shown.filter((r) => !r.website && !r.siteChecked && !r.imported);
              if (!todo.length) return null;
              return (
                <button
                  onClick={() => lookUpSites(todo.map((r) => r.i))}
                  disabled={Boolean(enriching)}
                  // A real button, not an underlined link. This is the one
                  // action on this bar that spends money and it was the
                  // quietest thing on screen.
                  className="ml-auto shrink-0 ui-small font-medium px-2.5 py-1 rounded-full border border-mauve-deep bg-mauve-deep text-paper hover:opacity-90 transition ui-control"
                >
                  {enriching ? 'Looking…' : `Look up ${todo.length} website${todo.length === 1 ? '' : 's'}`}
                </button>
              );
            })()}
            <button onClick={pickAllShown} className={(isBooking ? '' : 'ml-auto ') + 'ui-small font-medium text-mauve-deep underline decoration-dotted'}>
              Select all shown
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto slim-scroll divide-y divide-line">
            {shown.map((r) => (
              <label
                key={r.i}
                className={'flex items-start gap-2.5 px-3 py-2 ' + (r.imported ? 'opacity-55' : 'cursor-pointer hover:bg-blush-soft/30')}
              >
                {r.imported ? (
                  <span className="mt-0.5 w-4 inline-flex justify-center text-leaf-text" title={r.imported === 'duplicate' ? 'Already tracked before this scan' : 'Added to Prospects'}><Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} /></span>
                ) : (
                  <input type="checkbox" checked={picked.has(r.i)} onChange={() => togglePick(r.i)} className="mt-1" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="ui-body font-medium text-charcoal truncate">{r.name}</span>
                    {r.email && !r.imported && (
                      <span className="shrink-0 ui-meta uppercase tracking-[0.08em] px-1.5 py-px rounded-full border border-leaf text-leaf-text">email</span>
                    )}
                    {r.qualifies && !r.imported && (
                      <span className="shrink-0 ui-meta font-medium px-1.5 py-px rounded-full border border-leaf text-leaf-text">qualifies</span>
                    )}
                    {r.imported && (
                      <span className="shrink-0 ui-meta uppercase tracking-[0.08em] px-1.5 py-px rounded-full border border-line text-muted">
                        {r.imported === 'duplicate' ? 'already tracked' : 'added'}
                      </span>
                    )}
                  </span>
                  {r.show ? (
                    <span className="block ui-small text-muted truncate">
                      {r.guest ? `Guest on ${r.show}` : `On ${r.show} — no guest name found, read the episode`}
                      {' · '}
                      {r.episode}
                    </span>
                  ) : r.handle ? (
                    <>
                      <span className="block ui-small text-muted truncate">
                        @{r.handle} · {(r.followers || 0).toLocaleString()} followers
                        {' · '}
                        <span className={r.mustHaves === 'Y' ? 'text-leaf-text' : 'text-muted'}>
                          {r.mustHaves === 'Y' ? 'Passed must-haves' : 'Failed must-haves'}
                        </span>
                        {' · '}
                        <span className={r.revenueScore >= 2 ? 'text-charcoal' : 'text-muted'}>
                          {r.revenueScore}/6 signals
                        </span>
                      </span>
                      <span className="block ui-small text-muted truncate">
                        {(r.mustHaveDetail || []).filter((d) => !d.pass).map((d) => d.detail).join(' · ')
                          || (r.signals || []).join(' · ')
                          || 'Passed every must-have'}
                      </span>
                    </>
                  ) : r.bookingUrl ? (
                    <>
                      <span className="block ui-small text-muted truncate">
                        {r.platform ? `Books through ${r.platform}` : 'Takes bookings online'}
                      </span>
                      <span className="block ui-small truncate text-mauve-deep">
                        {(r.website || r.bookingUrl).replace(/^https?:\/\/(www\.)?/, '')}
                      </span>
                      {/* A found site replaces the booking link on the line
                          above, so say which one is being shown. Otherwise the
                          row silently changes meaning after a lookup. */}
                      {r.website && (
                        <span className="block ui-meta text-leaf-text">their own site</span>
                      )}
                      {!r.website && r.siteChecked && (
                        <span className="block ui-meta text-muted">
                          No site found. They may only exist on the booking platform.
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="block ui-small text-muted truncate">
                        {[r.category, r.city].filter(Boolean).join(' · ')}
                        {r.score ? (
                          <span className="inline-flex items-center gap-0.5"> · <Icon name="star" className="w-3 h-3 text-gold-text" filled /> {r.score} ({r.reviews})</span>
                        ) : ''}
                      </span>
                      <span className="block ui-small truncate">
                        {r.website ? <span className="text-mauve-deep">{r.website.replace(/^https?:\/\/(www\.)?/, '')}</span> : <span className="text-muted">no website</span>}
                        {r.email ? <span className="text-emerald-700"> · {r.email}</span> : null}
                      </span>
                    </>
                  )}
                </span>
                {r.handle && (
                  <a
                    href={buildAdLibraryUrl(r.name || r.handle)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="The one check this scan cannot do: are they running ads?"
                    className="shrink-0 ui-meta text-muted hover:text-mauve-deep underline decoration-dotted mt-0.5"
                  >
                    ads?
                  </a>
                )}
                {r.mapsUrl && (
                  <a
                    href={r.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 ui-meta text-muted hover:text-mauve-deep underline decoration-dotted mt-0.5"
                  >
                    map
                  </a>
                )}
              </label>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-3 ui-small text-muted">Nothing matches this filter.</p>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 border-t border-line bg-blush-soft/40">
            <span className="ui-small text-charcoal-2">
              {picked.size} selected
              {results.some((r) => r.imported) ? ' · checked rows are already in Prospects' : ''}
            </span>
            <button
              onClick={importPicked}
              disabled={importing || picked.size === 0}
              className="ml-auto px-3 py-1.5 ui-small font-medium r-md bg-mauve-deep text-paper hover:opacity-90 transition ui-control"
            >
              {importing ? 'Adding…' : 'Add ' + picked.size + (isPodcast ? ' to Leads' : ' to Prospects')}
            </button>
          </div>
        </div>
      )}

      {/* Past scans. Nothing is ever lost: reopen any list and keep picking.
          Hidden while a fresh result list is on screen.

          This was gated on being in maps mode, which was the last place the
          results actually went missing: the API was fixed to return booking and
          podcast scans, and they still could not be reached, because the list
          that offers them is only drawn while the maps mode is selected. Any
          reviewable scan is shown now, whatever mode the picker is on, since
          the thing being reopened is a saved list rather than a property of the
          mode currently chosen. */}
      {!scanning && recent.length > 0 && !(results && results.length > 0) && (
        // One line each, and only the newest few. Ten two-line rows was taller
        // than the thing they sit under, for a list that is consulted
        // occasionally and read top-down when it is.
        <div className="mt-3">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="ui-small font-semibold text-muted">Recent scans</span>
            {recent.length > RECENT_SHOWN && (
              <button
                onClick={() => setShowAllRecent((v) => !v)}
                className="ui-meta text-mauve-deep underline decoration-dotted"
              >
                {showAllRecent ? 'Show fewer' : `Show all ${recent.length}`}
              </button>
            )}
          </div>
          <div className="border border-line r-lg divide-y divide-line overflow-hidden">
            {(showAllRecent ? recent : recent.slice(0, RECENT_SHOWN)).map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1 min-w-0 truncate ui-small">
                  <span className="text-charcoal">“{s.query}”</span>
                  {/* Which kind of scan, now that they are listed together. A
                      row saying only "life coach" could be any of them. */}
                  <span className="text-muted">
                    {s.country ? ' · ' + s.country : ''}
                    {' · '}{SCAN_LABEL[s.type] || s.type || 'scan'}
                    {' · '}{(s.items_found ?? 0)} found
                    {(s.leads_added ?? 0) > 0 ? `, ${s.leads_added} added` : ''}
                    {' · '}{tzFormat(s.created_at, { month: 'short', day: 'numeric' })}
                  </span>
                </span>
                {s.status === 'done' && (s.items_found ?? 0) > 0 && (
                  <button
                    onClick={() => reopenScan(s.id)}
                    disabled={Boolean(reopening)}
                    className="shrink-0 ui-small font-medium px-2.5 py-0.5 r-md border border-line text-charcoal-2 hover:border-mauve transition ui-control"
                  >
                    {reopening === s.id ? 'Opening…' : 'Review'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Ran a scraper yourself in the Apify console? Paste the finished dataset's
// id (or its URL) and it lands in the inbox as leads — server-side fetch on
// the saved token, deduped by url, capped at 200 per import.
function ApifyImportForm({ onDone }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function runImport() {
    const datasetId = value.trim();
    if (!datasetId || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/import/apify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const bits = [`${data.added} added`];
      if (data.skippedDuplicate) bits.push(`${data.skippedDuplicate} already in the inbox`);
      if (data.skippedEmpty) bits.push(`${data.skippedEmpty} had nothing usable`);
      toast(`Dataset imported: ${bits.join(', ')}.`);
      onDone();
    } catch (e) {
      setMsg(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="ui-body text-charcoal-2">
        Run any scraper in your own Apify console, then paste the finished
        dataset's id or URL here. The rows land in this inbox as new leads,
        ready to score. Uses the Apify token saved in Settings.
      </p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') runImport(); }}
        placeholder="Dataset id or https://console.apify.com/storage/datasets/..."
        className="w-full bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={runImport}
          disabled={busy || !value.trim()}
          className="ui-body font-medium px-3.5 py-2 r-md btn-bloom transition ui-control"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
        {msg && <span className="ui-small text-poppy-text">{msg}</span>}
      </div>
    </div>
  );
}

function FindPanel({ settings, onSave, onImported, startCollapsed = false }) {
  const [open, setOpen] = useState(true);
  // Once leads exist, the inbox is a workplace, not a tutorial: collapse
  // the Find toolbox so the leads list leads. Runs once when the parent's
  // first load lands; after that the user's toggle is law.
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    if (startCollapsed && !autoCollapsedRef.current) {
      autoCollapsedRef.current = true;
      setOpen(false);
    }
  }, [startCollapsed]);
  const [platform, setPlatform] = useState('Facebook');
  const [newPhrase, setNewPhrase] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [allCopied, setAllCopied] = useState(false);
  const phrases = settings.intentPhrases || [];
  async function copyText(text, idx) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {}
  }

  function addPhrase() {
    const p = newPhrase.trim();
    if (!p || phrases.includes(p)) return;
    setNewPhrase('');
    onSave({ ...settings, intentPhrases: [...phrases, p] });
  }

  function removePhrase(p) {
    onSave({ ...settings, intentPhrases: phrases.filter((x) => x !== p) });
  }

  return (
    <div className="bg-panel border border-line-strong shadow-card r-lg shadow-card p-5">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center justify-between w-full text-left">
        <h2 className="font-serif text-2xl text-charcoal">Search phrases</h2>
        <span className="text-xs text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <>
          <p className="text-sm text-charcoal-2 mt-1 mb-3">
            These are the words your ideal client types when they need what you sell. Things like
            &ldquo;need help with my website&rdquo;. Not the words you would use to describe your service, the words
            they use when they are stuck. The Facebook posts scan searches these for you. You can also copy one
            and search it yourself on any platform, then paste what you find into the inbox. The closer these
            are to how your buyers actually talk, the better everything downstream gets.
          </p>
          <Hint id="find-panel">
            Tap the arrow on any phrase to open that platform's search already filled in.
            Found a real ask? Paste it below, score it, and the green ones get a DM written from their exact words.
          </Hint>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Select
              value={platform}
              onChange={(v) => setPlatform(v)}
              options={LEAD_PLATFORMS}
              ariaLabel="Platform"
              minWidth={0}
            />
            <span className="text-xs text-charcoal-2 flex-1 min-w-[200px]">
              {PLATFORM_TIPS[platform] || PLATFORM_TIPS.Other}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="ui-small font-semibold text-charcoal">
              Intent phrases ({phrases.length})
            </span>
            {phrases.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(phrases.join('\n'));
                    setAllCopied(true);
                    setTimeout(() => setAllCopied(false), 1600);
                  } catch {}
                }}
                title="Copy every phrase, one per line"
                className={`ui-small font-medium px-2.5 py-1 r-md border transition ${
                  allCopied ? 'border-leaf text-leaf-text' : 'border-line-strong text-charcoal-2 hover:bg-blush-soft'
                }`}
              >
                {allCopied ? 'Copied all' : 'Copy all'}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {phrases.map((p, i) => (
              <span key={p} className="inline-flex items-center gap-1 border border-line rounded-full pl-3 pr-1 py-0.5 ui-small text-charcoal bg-paper">
                <button onClick={() => copyText(p, i)} title="Copy phrase" className="hover:text-mauve-deep">
                  {copiedIdx === i ? 'Copied!' : p}
                </button>
                <a
                  href={buildSearchUrl(platform, p)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Search this on ${platform}`}
                  className="w-5 h-5 rounded-full text-muted hover:text-mauve-deep flex items-center justify-center"
                ><Icon name="external-link" className="w-3 h-3" /></a>
                <button onClick={() => removePhrase(p)} title="Remove" aria-label={`Remove phrase ${p}`} className="w-5 h-5 rounded-full text-muted hover:text-charcoal inline-flex items-center justify-center"><Icon name="x" className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addPhrase(); }}
              placeholder="Add a phrase buyers type"
              className="flex-1 min-w-[180px] bg-paper border border-line r-md px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
            <button
              onClick={addPhrase}
              className="px-3 py-2 ui-body font-medium r-md border border-line text-charcoal-2 hover:bg-blush-soft"
            >
              Add
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(buildBuyerFinderPrompt(settings));
                  setPromptCopied(true);
                  setTimeout(() => setPromptCopied(false), 2000);
                } catch {}
              }}
              title="Copy the buyer-finder prompt (uses your offer + audience from Settings), paste into ChatGPT or Claude, then add the phrases it gives you"
              className={`px-3 py-2 ui-body font-medium r-md transition ${
                promptCopied ? 'border border-leaf text-leaf-text' : 'bg-mauve-deep text-paper hover:opacity-90'
              }`}
            >
              {promptCopied ? 'Copied' : 'Generate more (AI prompt)'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
