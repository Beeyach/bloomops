'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import { pageSlug, pageHash } from '../lib/page-url.mjs';
import { warmWaiting, dueAuto } from '../lib/today.mjs';
import { finalizeWriteApi } from '../lib/bloom-result.mjs';
import { vidtestStats } from '../lib/vidtest.mjs';
import { groupStages } from '../lib/stage-groups.mjs';
import {
  todayIso, isoShift, daysBetween,
  AUTO_EMAIL_STAGES, STAMP_ONLY_STAGES, EMAIL_SEND_DAYS, DUE_DAYS_BY_STAGE,
  DEFAULT_DUE_STAGES, FINISHED_AFTER_DAYS, FINISHED_FROM_STAGE, shouldAutoFinish,
  POST_SEQUENCE_STAGES, VIDEO_FOLLOWUP_DAYS, videoSlotRank,
  daysUntilDue, isDueProspect, nextActionForStage, applyNextAction,
  getLastSentNumber, daysSinceContact, pastDueDays,
} from '../lib/due.mjs';
import {
  parseEmailSequence, parseVideoReasons, parseSentEmail, buildSentEmail,
  replyPatch,
} from '../lib/prospect-parse.mjs';
import { COUNTRY_META, normalizeCountry } from '../lib/country-meta.mjs';
import {
  STAGE_META, RATING_META, RATING_ALIASES, normalizeRating, REPLY_TYPE_META,
} from '../lib/stage-meta.mjs';
import { computeStats } from '../lib/prospect-stats.mjs';
import { VIEW } from '../lib/prospect-action.mjs';
import { classify, tabCounts, inTab, actionFilters, openingTab, TABS } from '../lib/prospect-tabs.mjs';
import { layoutFor, readLayouts, LAYOUT_KEY as PROSPECT_LAYOUT_KEY } from '../lib/prospect-layout.mjs';

// The sourcing loop in five steps, shown above the guide pages. The pages
// themselves are Ary's own writing and are not touched: this is the map you
// read before deciding which essay you actually need.
const SOURCING_STEPS = [
  { icon: 'target', title: 'Pick a niche', line: 'One kind of business at a time.' },
  { icon: 'search', title: 'Find phrases', line: 'Scout writes what your buyers type.' },
  { icon: 'globe', title: 'Scan results', line: 'Search those phrases and collect posts.' },
  { icon: 'inbox-in', title: 'Review New finds', line: 'Green or red, one pass.' },
  { icon: 'sprout', title: 'Promote the good ones', line: 'They become prospects.' },
];
import ProspectTabs from './ProspectTabs';
import ProspectListRow from './ProspectListRow';
import { makeBloomApi, enrichProspect } from '../lib/bloom-api.mjs';
import StageIcon from './prospects/StageIcon';
import StatsView from './prospects/StatsView';
import {
  stageStyle, stageLabel, daysAgoColor, stripProtocol,
  PortalMenu, StagePicker, CountryPicker, RepliedCell, SeqCell,
  ColResizer, EditableCell, CellPicker, MustHavesCell, RevenueScoreCell,
  YesNoCell, RatingCell, VideoCell, DomainCell,
} from './prospects/cells';
import EmailSequenceModal from './prospects/EmailSequenceModal';
import FilterPanel, { NO_RATING } from './prospects/FilterPanel';
import { appendEntry, parseLog, withAutoLog } from '../lib/activity-log.mjs';
import SiteFavicon from './SiteFavicon';
import CommandPalette from './CommandPalette';
import ToastHost from './ToastHost';
import { toast } from '../lib/toast.mjs';
import { faviconHost } from '../lib/favicon.mjs';
import { fillSequenceTemplate, sanitizeSequenceTemplate } from '../lib/sequence-template.mjs';
import SettingsView from './SettingsView';
import ShadowPanel from './ShadowPanel';
import SendingSummary from './SendingSummary';
import SpendBreaker from './SpendBreaker';
import { REGIONS, inRegion } from '@/lib/regions.mjs';
import HeldPanel from './HeldPanel';
import BucketPage from './BucketPage';
import { BUCKET_VIEWS, bucketForView } from '../lib/today-buckets.mjs';
import TodayView from './TodayView';
import JourneyView from './JourneyView';
import ClientsView from './ClientsView';
import WorkspaceView from './WorkspaceView';
import PageView from './PageView';
import Hint from './Hint';
import BloomSpinner from './BloomSpinner';
import Select from './Select';
import ArmyPanel from './ArmyPanel';
import SkillStudio from './SkillStudio';
import PromptsHub from './PromptsHub';
import DialogHost from './DialogHost';
import TrashView from './TrashView';
import ProspectDrawer from './ProspectDrawer';
import RenderWatcher from './RenderWatcher';
import { queueRenders, MAX_CONCURRENT } from '@/lib/renderQueue.mjs';
import { confirmDialog, promptDialog } from '@/lib/dialog.mjs';
import LeadInbox from './LeadInbox';
import GlassBackdrop from './GlassBackdrop';
import GlassRail from './GlassRail';
import StartHerePage from './StartHerePage';
import SystemHealth, { SystemTabs } from './SystemHealth';
import AddProspectDrawer from './AddProspectDrawer';
import ImportPreview from './ImportPreview';
import { Icon } from './Icons';
import { CLOSED_STAGES } from '@/lib/today.mjs';

const COLUMNS = [
  { key: 'name',              label: 'Name' },
  { key: 'business_name',     label: 'Business' },
  { key: 'niche',             label: 'Niche' },
  { key: 'email',             label: 'Email' },
  { key: 'domain',            label: 'Domain' },
  { key: 'country',           label: 'Country' },
  { key: 'source',            label: 'Source' },
  { key: 'rating',            label: 'Rating' },
  { key: 'stage',             label: 'Stage' },
  { key: 'call_booked',       label: 'Call?' },
  { key: 'proposal_sent',     label: 'Proposal?' },
  // Qualification scoring (opt-in for any workspace; on by default for
  // nobody). Must-haves is the pass/fail gate, revenue score is 0-7.
  { key: 'must_haves',        label: 'Must-haves' },
  { key: 'revenue_score',     label: 'Rev score' },
  { key: 'last_contact_date', label: 'Last Contact' },
  { key: 'next_action_date',  label: 'Next Action' },
  { key: 'email_sequence',    label: 'Emails' },
  { key: 'video',             label: 'Video' },
  { key: 'replied',           label: 'Reply' },
];


// Default column widths (px). User-resized values are merged from localStorage.
const COL_DEFAULTS = {
  __select: 44,
  name: 230,
  business_name: 190,
  niche: 128,
  email: 230,
  domain: 190,
  country: 96,
  source: 136,
  rating: 84,
  stage: 168,
  call_booked: 76,
  proposal_sent: 96,
  last_contact_date: 132,
  next_action_date: 132,
  email_sequence: 68,
  video: 76,
  replied: 76,
  __delete: 44,
};
const COL_MIN_WIDTH = 36;
const COL_WIDTHS_KEY = 'leadsthatbloom:colWidths:v1';
// v2: introduces per-workspace default hidden columns (see DEFAULT_HIDDEN).
// Bumped from v1 so the new cold-email columns start hidden for existing users
// instead of showing up unannounced in a layout they'd already settled.
const HIDDEN_COLS_KEY = 'leadsthatbloom:hiddenCols:v2';
// Name stays visible always — a row must never be anonymous.
const ALWAYS_VISIBLE_COLS = new Set(['name']);

// The three cold-email tracker columns adopted from Ellen's spreadsheet.
const TRACKER_COLS = ['niche', 'call_booked', 'proposal_sent', 'must_haves', 'revenue_score'];

// Default hidden columns per workspace, applied only when the user has no
// saved preference yet. Everyone keeps their existing layout; the tracker
// columns stay hidden until turned on. Ellen's workspace instead mirrors her
// own spreadsheet — the tracker columns show and the ones she never used hide.
const DEFAULT_HIDDEN = {
  default: TRACKER_COLS,
  // Ellen's Dream Client Checklist lives in must_haves + revenue_score,
  // so those stay visible for her while hidden elsewhere by default.
  ellen: ['domain', 'country', 'rating', 'last_contact_date', 'email_sequence', 'replied'],
};

const FILTERS_KEY = 'leadsthatbloom:filters:v1';
// List or spreadsheet. Remembered, because it is a working preference rather
// than a filter — somebody who lives in the table should not have to choose it
// every morning.
const LAYOUT_KEY = 'leadsthatbloom:layout:v1';

// Rows rendered at once. A few hundred is comfortable; the whole list is not,
// and the list is now thousands.
const PAGE_SIZES = [50, 100, 200, 500];
const DEFAULT_PAGE_SIZE = 100;

// Quick-lens predicates. A lens answers ONE question ("what did I send
// today?") so while one is active it replaces the STAGE and due filters —
// but search and the RATING filter still apply, so "Validated minus the
// ✖️ skips" works the way anyone would expect. Definitions mirror the
// chip counts (sendStats / newCount) exactly.
//
// Module level so a saved lens can be checked against it on load: a key that
// no longer exists is dropped rather than restored as an active chip that
// filters nothing.
// Where a prospect is, as a scope rather than a filter.
//
// AU and US run on different clocks and get worked on different days, so
// "who is due" is nearly always asked about one of them and not both. The
// lenses answered what state a prospect is in and never where they are, so
// separating the two meant typing a country into search and hoping.
// Region scoping lives in lib/regions.mjs now, shared with the journey view.

const LENSES = {
  // isDueProspect, not the raw date. Asking daysUntilDue alone meant a stale
  // next_action_date on a closed row was enough: a Rejected prospect, three
  // Invalid Email addresses and a Client all showed as due.
  'due-today': (p) => isDueProspect(p),
  'due-tomorrow': (p) => daysUntilDue(p) === 1,
  'new': (p) => (p.stage || 'New') === 'New',
  'prescreen': (p) => p.stage === 'Prescreen',
  'validated': (p) => p.stage === 'Validated',
  // Same rule Today uses for "Needs a date": active stage, no date.
  'unscheduled': (p) => !CLOSED_STAGES.has(p.stage || 'New')
    && (p.next_action_date == null || String(p.next_action_date).trim() === ''),
  'sent-today': (p) => p.last_contact_date === todayIso(),
  'sent-yesterday': (p) => p.last_contact_date === isoShift(-1),
  // Everyone the scan found something worth recording on, whatever stage
  // they are at. A prospect who went quiet three weeks ago is the best
  // audience for a video, so this deliberately ignores the stage filters
  // like every other lens does. Already-rendered rows stay in: the link
  // still needs to go in an email.
  'video': (p) => p.video_tier === 'SEND' || p.video_tier === 'MAYBE',
  // The recording worklist: worth a video AND not yet recorded AND not a
  // skip. This is the "what do I sit down and record" view, narrower than
  // "Worth a video" above, which keeps already-rendered rows in so their
  // link can still be pasted into an email.
  'needs-video': (p) =>
    (p.video_tier === 'SEND' || p.video_tier === 'MAYBE')
    && !p.video_url
    && p.rating !== '✖️',
  // Finished videos, whatever the prospect's stage or tier. This is the
  // "I need a link to paste into an email" view, and it is separate from
  // the queue above because those are two different jobs: one decides what
  // to record, this one collects what came back.
  'video-ready': (p) => !!p.video_url,
  // Recorded and still waiting to go out. The send half of the worklist,
  // where "To record" is the recording half.
  'video-queued': (p) => !!p.video_url && !p.video_sent_at,
  // Rated Strong but there is no address to send to. These come out of a
  // prescreen that liked the business and could not find a way to reach them,
  // so the work is finding the email, not deciding about the prospect. Once
  // one is found they move to Validated; once the hunt is given up they get
  // the 📭 rating and drop out of here.
  'needs-email': (p) => p.rating === '💚' && !(p.email || '').trim(),
};

// Human name for every lens, INCLUDING the ones with no chip in the row
// (e.g. 'unscheduled', reached from Today's "Needs a date"). The toolbar's
// ✕ Clear pill uses this so an active lens is always visible by name.
const LENS_LABELS = {
  'due-today': 'Due today',
  'due-tomorrow': 'Due tomorrow',
  'new': 'New',
  'prescreen': 'Prescreen',
  'validated': 'Validated',
  'unscheduled': 'Needs a date',
  'sent-today': 'Sent today',
  'sent-yesterday': 'Sent yesterday',
  'video': 'Worth a video',
  'needs-video': 'To record',
  'video-ready': 'Videos ready',
  'video-queued': 'Video queued',
  'needs-email': 'Needs email',
};








// Icon set lives in components/Icons.jsx now (shared with every view);
// `Icon` is imported at the top of this file. Same names, same visuals.


// Custom stage selector. Renders as a chip that opens a popover with each
// option laid out as [colored icon swatch] + [name]. Replaces the native
// <select> we had before — same data, much nicer affordance.
// Sideways scrolling needs a control, not just a hint. Shift+wheel and
// trackpad swipes work natively, but neither is discoverable — someone who
// does not already know them has no way to reach column 20.
//
// The buttons sit ABOVE the table rather than floating over it: hovering a
// control on top of the rows it moves means covering the data you are trying
// to read. Both are always rendered and disable at the ends, so the row does
// not change height as you scroll.
function TableScrollControls({ targetRef }) {
  const [state, setState] = useState({ left: false, right: false, scrollable: false });

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return undefined;
    const check = () => {
      const max = el.scrollWidth - el.clientWidth;
      setState({
        scrollable: max > 8,
        left: el.scrollLeft > 8,
        right: max > 8 && el.scrollLeft < max - 8,
      });
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [targetRef]);

  // Roughly three columns per press: far enough to feel like progress,
  // short enough that you do not lose your place.
  const nudge = (dir) => {
    const el = targetRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.6), behavior: 'smooth' });
  };

  if (!state.scrollable) return null;

  return (
    <div className="ltb-scroll-controls">
      <button
        type="button"
        onClick={() => nudge(-1)}
        disabled={!state.left}
        aria-label="Scroll columns left"
        className="ltb-scroll-btn"
      >
        <Icon name="arrow-left" className="w-5 h-5" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        disabled={!state.right}
        aria-label="Scroll columns right"
        className="ltb-scroll-btn"
      >
        <Icon name="arrow-left" className="w-5 h-5 rotate-180" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// Where a prospect was found. Deliberately the acquisition origin and not the
// insertion path: somebody who typed into this form having seen the business on
// Facebook is a SOCIAL_POST, and recording that as MANUAL would poison the one
// acquisition question the tracker was rebuilt to be able to answer.
const ORIGIN_OPTIONS = [
  { value: 'MAP_LISTING', label: 'Google Maps' },
  { value: 'SOCIAL_POST', label: 'A post or social profile' },
  { value: 'DIRECTORY', label: 'A directory' },
  { value: 'REFERRAL', label: 'Somebody referred them' },
  { value: 'REACTIVATION', label: 'Picking an old one back up' },
  { value: 'MANUAL', label: 'I just knew about them' },
  { value: 'OTHER', label: 'Something else' },
];

const ORIGIN_HINT = {
  MAP_LISTING: 'What did you search for?',
  SOCIAL_POST: 'Which platform?',
  DIRECTORY: 'Which directory?',
  REFERRAL: 'Who referred them?',
  REACTIVATION: 'Where did it come from originally?',
  MANUAL: 'Any detail worth keeping',
  OTHER: 'Any detail worth keeping',
};

export default function ProspectsApp({ stages, ratings, countries = [], sources = [], replyTypes = [] }) {
  // ─── Canonical store ───────────────────────────────────────────────────
  // `allProspects` is the single source of truth. The table renders from a
  // memoized filtered/sorted projection of this array. Writes patch this
  // array directly (optimistic) and re-confirm against the server response.
  // No more server-side filter fetches — that's what was causing the silent
  // revert and filter-desync bugs.
  const [allProspects, setAllProspects] = useState([]);
  const [storeReady, setStoreReady] = useState(false);
  const [search, setSearch] = useState('');
  // Filter sets hold the *checked* (visible) options. Default: everything checked.
  const allRatingOpts = useMemo(() => [...ratings, NO_RATING], [ratings]);
  const allStageOpts = useMemo(() => [...stages], [stages]);
  const [ratingChecked, setRatingChecked] = useState(() => new Set(allRatingOpts));
  const [stageChecked, setStageChecked] = useState(() => new Set(allStageOpts));
  const [dueOnly, setDueOnly] = useState(false);
  const [missingCountryOnly, setMissingCountryOnly] = useState(false);
  // One quick lens at a time (topbar chips): 'due-today' | 'due-tomorrow' |
  // 'new' | 'sent-today' | 'sent-yesterday' | null. See visibleProspects.
  // Which System question is open. Session-only, like Today's tabs: opening
  // System tomorrow should start from "is it okay".
  // Which part of the world is on screen. Sits above the lenses because it
  // scopes all of them: "due today" means something different in Sydney.
  const [region, setRegion] = useState('');
  const [systemTab, setSystemTab] = useState('overview');
  const chooseSystemTab = useCallback((id) => {
    setSystemTab(id);
    try { sessionStorage.setItem('ltb_system_tab_v1', id); } catch (e) {}
  }, []);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('ltb_system_tab_v1');
      if (['overview', 'issues', 'automation', 'usage'].includes(saved)) setSystemTab(saved);
    } catch (e) {}
  }, []);
  const [quickLens, setQuickLens] = useState(null);
  // Which of the six lists is open, and which state inside it (if any).
  //
  // These sit above every other filter because they are the question being
  // asked; the rest narrow the answer. Both are plain state rather than saved
  // preferences: the list you want is the one you want today.
  const [tab, setTab] = useState(VIEW.ALL);
  const [actionFilter, setActionFilter] = useState(null);
  // Chapter 8: Prospects opens on whatever actually wants something from you.
  // It runs once — the moment counts first exist — and a single click, hash
  // route or search sets pickedTab and it never runs again, so it can never
  // yank a list out from under someone mid-task.
  const pickedTab = useRef(false);
  // The list is the default and the spreadsheet is a click away. Both are real
  // tools — the list answers "what is happening with these people", the table
  // answers "let me edit forty cells" — and the first question is the common
  // one, which is not the one the screen used to open on.
  // Chapter 11: the preference is per tab. One value across all seven meant
  // opening the spreadsheet once to edit forty cells left Needs attention as
  // a spreadsheet for ever, and those two tabs are not asking the same
  // question. See lib/prospect-layout.mjs.
  const [layouts, setLayouts] = useState({});
  useEffect(() => {
    try { setLayouts(readLayouts(localStorage.getItem(PROSPECT_LAYOUT_KEY))); } catch {}
  }, []);
  const layout = layoutFor(tab, layouts);
  const chooseLayout = useCallback((next) => {
    setLayouts((prev) => {
      const merged = { ...prev, [tab]: next };
      try { localStorage.setItem(PROSPECT_LAYOUT_KEY, JSON.stringify(merged)); } catch {}
      return merged;
    });
  }, [tab]);
  // Going somewhere, and arriving with the list already narrowed.
  //
  // "View" on Today's Needs-attention summary used to land on the whole
  // Prospects table with no filter at all, so the number you clicked and the
  // screen you arrived at had nothing to do with each other.
  const goTo = useCallback((next, opts = null) => {
    if (next === 'prospects' && opts) {
      if (opts.tab) { pickedTab.current = true; setTab(opts.tab); }
      setActionFilter(opts.actionFilter || null);
    }
    setView(next);
  }, []);
  // How many rows go in the DOM at once, and which slice is on screen. The size
  // is remembered with the other filters; the page number is not, because
  // coming back to page 7 of a list you have not looked at since is disorienting
  // in a way that coming back to your own page size is not.
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);

  // Saved views: a named snapshot of search + filters + lens + sort, stored
  // per browser. One click restores a working setup like "IG · no proposal".
  const SAVED_VIEWS_KEY = 'ltb_saved_views_v1';
  const [savedViews, setSavedViews] = useState([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored)) setSavedViews(stored);
      }
    } catch {}
  }, []);
  function persistViews(next) {
    setSavedViews(next);
    try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next)); } catch {}
  }
  async function saveCurrentView() {
    const name = await promptDialog({ title: 'Save this view', message: 'Name it after the question it answers, like "IG coaches · no proposal".', placeholder: 'View name' });
    if (!name || !name.trim()) return;
    const snapshot = {
      id: Date.now().toString(36),
      name: name.trim().slice(0, 40),
      state: {
        search,
        stages: [...stageChecked],
        ratings: [...ratingChecked],
        dueOnly,
        quickLens,
        sort,
      },
    };
    persistViews([...savedViews.filter((v) => v.name !== snapshot.name), snapshot]);
  }
  function applyView(v) {
    const s = v.state || {};
    setSearch(s.search || '');
    setStageChecked(new Set(Array.isArray(s.stages) ? s.stages : allStageOpts));
    setRatingChecked(new Set(Array.isArray(s.ratings) ? s.ratings : allRatingOpts));
    setDueOnly(Boolean(s.dueOnly));
    setQuickLens(s.quickLens || null);
    if (s.sort && s.sort.key) setSort(s.sort);
  }
  const tableScrollRef = useRef(null);
  const [view, setView] = useState('today'); // 'today' | 'prospects' | 'inbox' | 'clients' | 'workspace' | 'prompts' | 'stats' | 'settings' | 'page'
  // Notion-style custom pages: list lives in the sidebar, one open at a time.
  const [pages, setPages] = useState([]);
  const [activePageId, setActivePageId] = useState(null);
  // Stages this workspace has switched off. They stay fully functional —
  // this only trims the dropdown so Ellen isn't scrolling past email stages
  // she never sends, and vice versa.
  const [hiddenStages, setHiddenStages] = useState([]);
  const visibleStages = useMemo(() => {
    const hide = new Set(hiddenStages);
    const list = stages.filter((s) => !hide.has(s));
    return list.length ? list : stages; // never hand back an empty menu
  }, [stages, hiddenStages]);

  // ── Browser history ↔ view sync ────────────────────────────────────────
  // Every view lives at a #hash (pages at #page:<id>), so the browser Back/
  // Forward buttons walk your tab history instead of leaving the site.
  // The Leads tab is still called `inbox` internally — renaming the view key
  // would touch every call site for no user-visible gain. The URL is what
  // people read, so it says what the tab says. Old #inbox links still resolve.
  const VIEW_TO_HASH = { inbox: 'leads' };
  const HASH_TO_VIEW = { leads: 'inbox' };
  const VALID_VIEWS = useMemo(() => new Set([
    'journey',
    'today', 'prospects', 'inbox', 'clients', 'stats', 'workspace', 'prompts',
    'settings', 'page', 'army', 'handsoff', 'guide-agents', 'guide-sourcing',
    'guide-automation', 'trash', 'start', 'health',
    // One per Today bucket, so "view all" is a real place with its own URL
    // and the browser's back button lands where you expect.
    ...BUCKET_VIEWS,
  ]), []);
  // Set while handling popstate so the push-effect below doesn't re-push
  // the entry the user just navigated to.
  const fromPopRef = useRef(false);
  // A page hash the URL asked for before pages finished loading. Held here
  // until the list arrives, then resolved to a real page id.
  const pendingPageRef = useRef(null);

  useEffect(() => {
    const parse = () => {
      const h = decodeURIComponent(window.location.hash.slice(1) || '');
      // Readable form: #page/pipeline-report-b959d454. The trailing chunk is
      // the page id's first 8 characters, which keeps two pages of the same
      // name apart. The old #page:<full-uuid> links still resolve.
      if (h.startsWith('page/')) return { view: 'page', pageKey: h.slice(5) };
      if (h.startsWith('page:')) return { view: 'page', pageId: h.slice(5) };
      return { view: HASH_TO_VIEW[h] || h };
    };
    // Adopt a hash on first load (refresh / shared link keeps the tab).
    const init = parse();
    const openPage = (s) => {
      if (s.pageId) { setActivePageId(s.pageId); setView('page'); return; }
      if (s.pageKey) { pendingPageRef.current = s.pageKey; setView('page'); }
    };
    if (VALID_VIEWS.has(init.view)) {
      if (init.view === 'page') openPage(init);
      else setView(init.view);
    }
    const onPop = () => {
      const s = parse();
      fromPopRef.current = true;
      if (VALID_VIEWS.has(s.view)) {
        if (s.view === 'page') openPage(s);
        else setView(s.view);
      } else {
        setView('today');
      }
    };
    // hashchange as well as popstate: a plain <a href="#settings"> fires only
    // hashchange, so without this the URL changed and the screen did not.
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A hash asked for a page before the list loaded — resolve it now. Match on
  // the id suffix first (exact), then fall back to the slug alone so a link
  // typed by hand still lands somewhere sensible.
  useEffect(() => {
    const key = pendingPageRef.current;
    if (!key || !pages.length) return;
    pendingPageRef.current = null;
    const suffix = key.slice(-8);
    const byId = pages.find((p) => String(p.id).slice(0, 8) === suffix);
    const hit = byId || pages.find((p) => pageSlug(p.title) === key.replace(/-[0-9a-f]{8}$/, ''));
    if (hit) setActivePageId(hit.id);
    else setView('today');
  }, [pages]);

  useEffect(() => {
    const page = view === 'page' && activePageId ? pages.find((p) => p.id === activePageId) : null;
    const target = page ? '#' + pageHash(page) : view === 'page' && activePageId ? `#page:${activePageId}` : `#${VIEW_TO_HASH[view] || view}`;
    if (fromPopRef.current) { fromPopRef.current = false; return; }
    if (decodeURIComponent(window.location.hash) === target) return;
    window.history.pushState(null, '', target);
  }, [view, activePageId, pages]);

  const loadPages = useCallback(async () => {
    try {
      const res = await fetch('/api/pages');
      if (!res.ok) return;
      const data = await res.json();
      setPages(data.pages || []);
    } catch {}
  }, []);
  useEffect(() => { loadPages(); }, [loadPages]);

  // Which stages this workspace switched off. Re-read whenever Settings
  // closes, so a toggle takes effect without a reload.
  const loadHiddenStages = useCallback(async () => {
    try {
      const s = (await (await fetch('/api/settings')).json()).settings || {};
      setHiddenStages(Array.isArray(s.hiddenStages) ? s.hiddenStages : []);
    } catch {}
  }, []);
  useEffect(() => { loadHiddenStages(); }, [loadHiddenStages, view]);

  async function createPage(parentId = null) {
    // Notion behavior: create instantly, rename inline on the page itself.
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No emoji: new pages wear the neutral file stroke until the user
        // picks one (their emoji is their data; the default isn't).
        // parent_id is only sent when this is a subpage. The server checks
        // the parent belongs to this workspace before honouring it.
        body: JSON.stringify({ title: 'Untitled', emoji: '', parent_id: parentId || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPages((prev) => [...prev, data.page]);
      setActivePageId(data.page.id);
      setView('page');
    } catch (err) {
      toast(`Couldn't create the page. ${err.message}`, { tone: 'error' });
    }
  }

  async function patchPage(id, patch) {
    try {
      const res = await fetch(`/api/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPages((prev) => prev.map((p) => (p.id === id ? data.page : p)));
      return true;
    } catch (err) {
      toast(`Couldn't save the page. ${err.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => patchPage(id, patch) } });
      return false;
    }
  }

  // Duplicate = a fresh page carrying the same body, dropped beside the
  // original. Notion habit: build one "template" page, duplicate per use.
  async function duplicatePage(page) {
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${page.title || 'Untitled'} copy`,
          emoji: page.emoji || '',
          parent_id: page.parent_id || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (page.body) {
        await fetch(`/api/pages/${data.page.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: page.body }),
        });
      }
      setPages((prev) => [...prev, { ...data.page, body: page.body || data.page.body }]);
      setActivePageId(data.page.id);
      setView('page');
      toast(`Duplicated "${page.title || 'Untitled'}".`);
    } catch (err) {
      toast(`Couldn't duplicate the page. ${err.message}`, { tone: 'error' });
    }
  }

  async function deletePage(page) {
    if (!(await confirmDialog({ title: `Move "${page.title}" to Trash?`, message: 'The page leaves your sidebar but stays in Trash for 30 days, where you can restore it anytime.', confirmLabel: 'Move to Trash' }))) return;
    try {
      const res = await fetch(`/api/pages/${page.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPages((prev) => prev.filter((p) => p.id !== page.id));
      setActivePageId(null);
      setView('workspace');
    } catch (err) {
      toast(`Couldn't delete the page. ${err.message}`, { tone: 'error' });
    }
  }
  const [newLeadCount, setNewLeadCount] = useState(0);
  const [seqProspect, setSeqProspect] = useState(null); // row shown in the email-sequence modal
  // True when the drawer was opened from a row's info dot: it jumps to Notes.
  const [drawerFocusNotes, setDrawerFocusNotes] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const hydratedFiltersRef = useRef(false);
  const [sort, setSort] = useState({ key: 'default', dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState({
    name: '', business_name: '', email: '', domain: '', country: '', source: '', claude_chat_link: '',
    // Where you FOUND them, which is not the same as the fact that you typed
    // them in. Typing a business you saw on Facebook into this form does not
    // make the origin "manual", and getting that wrong quietly poisons the one
    // acquisition question the tracker was rebuilt to be able to answer.
    origin_class: '', origin_subtype: '',
  });
  const [highlightId, setHighlightId] = useState(null);
  // The prospect profile drawer (opened from Today / Clients). Stores the id
  // and derives the live row from allProspects so edits reflect instantly.
  const [drawerId, setDrawerId] = useState(null);
  const drawerProspect = drawerId != null ? allProspects.find((x) => x.id === drawerId) : null;

  // Jump from Today/Clients straight to a prospect's ROW: clear anything
  // that could hide it (search, filters, due-only), switch views, then the
  // effect below scrolls it into view once the table has rendered.
  // Drop every filter that could hide a row someone was just sent to. Shared
  // because both jumps into the table (a single prospect, and the missing-
  // country card) were each missing a different one: this one left quickLens
  // on, the other left the stage/rating sets narrowed.
  function clearFiltersForJump() {
    setSearch('');
    setDueOnly(false);
    setMissingCountryOnly(false);
    setQuickLens(null);
    setRatingChecked(new Set(allRatingOpts));
    setStageChecked(new Set(allStageOpts));
  }

  // The jump target survives until the row is actually on screen. The old
  // version raced: the highlight cleared itself after 2.6s and the scroll
  // poller gave up after 1s, while clearing six filters over 5,500 rows can
  // take longer than both (a debounced search reset alone eats a third of a
  // second) — so on a slower device "Show in table" landed on page 1 of the
  // full table with nothing marked, which reads as nothing at all.
  const [jumpId, setJumpId] = useState(null);

  function openProspectRow(p) {
    clearFiltersForJump();
    // The projection is tab-scoped, so clearing filters is not enough: a
    // person in Replied stays invisible while Needs attention is open, and
    // that is exactly how "Show in table" showed a page with no them on it.
    pickedTab.current = true;
    setTab(VIEW.ALL);
    setActionFilter(null);
    // The button promises the TABLE. The All tab may be remembered as the
    // list, and only table rows have refs a jump can land on.
    setLayouts((prev) => {
      const merged = { ...prev, [VIEW.ALL]: 'table' };
      try { localStorage.setItem(PROSPECT_LAYOUT_KEY, JSON.stringify(merged)); } catch {}
      return merged;
    });
    setView('prospects');
    setJumpId(p.id);
  }

  // Scroll the highlighted row to the center once its ref exists (the table
  // mounts a tick after setView, so poll briefly instead of racing it).
  // Still serves the create-prospect flash, which sets highlightId directly.
  useEffect(() => {
    if (!highlightId || view !== 'prospects') return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = rowRefs.current[highlightId];
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        clearInterval(timer);
      } else if (++tries > 20) {
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [highlightId, view]);
  const [importPreview, setImportPreview] = useState(null);
  const [importCsvText, setImportCsvText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [colWidths, setColWidths] = useState(COL_DEFAULTS);
  const [hiddenCols, setHiddenCols] = useState(() => new Set());
  const rowRefs = useRef({});
  const fileInputRef = useRef(null);
  const hydratedWidthsRef = useRef(false);

  // Live mirror of allProspects for use in stable callbacks (window.bloom
  // closures, write helpers). Keeps reads O(1) without re-running effects.
  const allProspectsRef = useRef(allProspects);
  allProspectsRef.current = allProspects;

  // Load saved column widths + hidden columns once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_WIDTHS_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && typeof stored === 'object') {
          setColWidths((prev) => ({ ...prev, ...stored }));
        }
      }
    } catch {}
    hydratedWidthsRef.current = true;
  }, []);

  // Hidden columns: a saved preference wins; otherwise seed from the
  // workspace default (which is why this waits on /api/auth for the
  // workspace). Ellen's workspace gets her spreadsheet layout; everyone
  // else keeps the tracker columns hidden. The workspace name is also kept
  // in state — the stage-filter default below depends on it.
  const [workspace, setWorkspace] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      let ws = 'default';
      try {
        const d = await fetch('/api/auth').then((r) => r.json());
        if (d && d.workspace) ws = d.workspace;
      } catch {}
      if (!alive) return;
      setWorkspace(ws);
      try {
        const rawHidden = localStorage.getItem(HIDDEN_COLS_KEY);
        if (rawHidden) {
          const stored = JSON.parse(rawHidden);
          if (Array.isArray(stored)) {
            setHiddenCols(new Set(stored.filter((k) => !ALWAYS_VISIBLE_COLS.has(k))));
            return;
          }
        }
      } catch {}
      const def = DEFAULT_HIDDEN[ws] || DEFAULT_HIDDEN.default;
      setHiddenCols(new Set(def.filter((k) => !ALWAYS_VISIBLE_COLS.has(k))));
    })();
    return () => { alive = false; };
  }, []);

  // Ary's default working view (her spec, 2026-07-18): the ACTIVE pipeline
  // only. Hidden by default — raw pools (New, Validated), dead ends
  // (Finished, Rejected, Lost, Invalid Email), and skip/dead-site ratings.
  // The New/Validated topbar chips remain the doors into the hidden pools;
  // ✕ Clear returns to THIS baseline, and the Filters panel can still
  // Select-all to see absolutely everything. Other workspaces see it all.
  // The list opens showing everybody.
  //
  // It used to open with seven stages and two ratings switched off for this
  // workspace — New, Prescreen, Validated, Finished, Rejected, Lost, Invalid
  // Email, plus the skip and dead-site marks. That was the right answer to a
  // spreadsheet: it kept 4,291 untouched imports out of the way.
  //
  // It is the wrong answer to six tabs, because it fights them. Measured on the
  // live data, those defaults would have shown 23 of the 68 conversations in
  // Replied, 152 of the 220 in Needs attention, 38 of the 4,701 in Not
  // contacted, and 305 of the 781 in Finished — every tab a fraction of its own
  // headline, and Today's "160 need an email address" linking to a list of far
  // fewer. Worse, this pass moved forty-two settled conversations off Today on
  // the promise that Replied still holds them, and thirty-eight of those are at
  // Rejected or Lost.
  //
  // The job the stage default was doing is now the Not contacted tab's job, and
  // it does it without hiding anything. The filters themselves are untouched:
  // anyone who wants a narrower list sets one in Filters, and it is remembered.
  const defaultStageSet = useMemo(() => new Set(allStageOpts), [allStageOpts]);
  const defaultRatingSet = useMemo(() => new Set(allRatingOpts), [allRatingOpts]);

  function toggleColumn(key) {
    if (ALWAYS_VISIBLE_COLS.has(key)) return;
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => !hiddenCols.has(c.key)),
    [hiddenCols]
  );
  const col = (key) => !hiddenCols.has(key);

  // Persist column widths after hydration.
  useEffect(() => {
    if (!hydratedWidthsRef.current) return;
    try {
      localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths]);

  // Refresh the new-lead count on mount and whenever the view changes
  // (returning from the Inbox updates it).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/leads?status=new')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNewLeadCount((d.leads || []).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view]);

  // Load saved filter state once on mount. Values that no longer exist in the
  // current option lists are dropped silently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && typeof stored === 'object') {
          if (Array.isArray(stored.rating)) {
            const valid = new Set(allRatingOpts);
            setRatingChecked(new Set(stored.rating.filter((v) => valid.has(v))));
          }
          if (Array.isArray(stored.stage)) {
            const valid = new Set(allStageOpts);
            setStageChecked(new Set(stored.stage.filter((v) => valid.has(v))));
          }
          // A lens is restored only if it still exists, so a renamed or
          // removed one comes back as the normal view rather than an active
          // chip that filters nothing.
          if (typeof stored.lens === 'string' && LENSES[stored.lens]) {
            setQuickLens(stored.lens);
          }
          if (typeof stored.dueOnly === 'boolean') setDueOnly(stored.dueOnly);
          if (typeof stored.missingCountryOnly === 'boolean') {
            setMissingCountryOnly(stored.missingCountryOnly);
          }
          // Only one of the offered sizes, so a stored value from an older
          // version cannot put an arbitrary number of rows on screen.
          if (PAGE_SIZES.includes(stored.pageSize)) setPageSize(stored.pageSize);
          // Older versions of this app persisted a `read` array; it's silently
          // ignored now that the Read column has been removed.
        }
      }
    } catch {}
    hydratedFiltersRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filter state after hydration.
  useEffect(() => {
    if (!hydratedFiltersRef.current) return;
    try {
      localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          rating: [...ratingChecked],
          stage: [...stageChecked],
          lens: quickLens,
          dueOnly,
          missingCountryOnly,
          pageSize,
        })
      );
    } catch {}
  }, [ratingChecked, stageChecked, quickLens, dueOnly, missingCountryOnly, pageSize]);

  // Any change to what is being filtered puts you back on the first page.
  // Staying on page 7 while the list underneath becomes a different list shows
  // an arbitrary slice of something you did not ask for.
  useEffect(() => {
    setPage(0);
  }, [search, quickLens, dueOnly, missingCountryOnly, ratingChecked, stageChecked, sort, pageSize]);

  function startColResize(e, key) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[key] ?? COL_DEFAULTS[key] ?? 100;
    function onMove(ev) {
      const w = Math.max(COL_MIN_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((prev) => (prev[key] === w ? prev : { ...prev, [key]: w }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  const totalTableWidth =
    (colWidths.__select ?? COL_DEFAULTS.__select) +
    visibleColumns.reduce((sum, c) => sum + (colWidths[c.key] ?? COL_DEFAULTS[c.key] ?? 100), 0) +
    (colWidths.__delete ?? COL_DEFAULTS.__delete);

  // Build query string for CSV export (server still does the filtering for
  // exports so the download matches what the user sees).
  function appendFilterParams(url) {
    if (search) url.searchParams.set('search', search);
    if (ratingChecked.size < allRatingOpts.length) {
      if (ratingChecked.size === 0) url.searchParams.append('rating', '__nomatch__');
      else ratingChecked.forEach((r) => url.searchParams.append('rating', r));
    }
    if (stageChecked.size < allStageOpts.length) {
      if (stageChecked.size === 0) url.searchParams.append('stage', '__nomatch__');
      else stageChecked.forEach((s) => url.searchParams.append('stage', s));
    }
  }

  // Monotonic request token. When the user triggers loadAll repeatedly
  // (writes, imports, manual refresh), an older response can resolve after
  // a newer one — we drop any response whose token isn't the latest.
  const loadAllTokenRef = useRef(0);

  // First visit loads in two phases: ?slim=1 (all columns except ~3.6MB of
  // TEXT blobs the table never renders) paints the table fast, then the full
  // rows swap in behind it. Slim rows carry _hydrating so the few cells that
  // DO read a heavy field (the Emails chip) show a shimmer instead of a
  // wrong empty state for that second. Later refreshes go straight to full —
  // the flash is only worth avoiding once there's something on screen.
  const hydratedRef = useRef(false);
  const loadAll = useCallback(async () => {
    const token = ++loadAllTokenRef.current;
    if (!hydratedRef.current) {
      try {
        const slimRes = await fetch('/api/prospects?slim=1');
        if (slimRes.ok) {
          const slimData = await slimRes.json();
          if (token !== loadAllTokenRef.current) return;
          setAllProspects((slimData.prospects || []).map((p) => ({ ...p, _hydrating: 1 })));
          setStoreReady(true);
        }
      } catch {}
    }
    const res = await fetch('/api/prospects');
    if (!res.ok) return;
    const data = await res.json();
    if (token !== loadAllTokenRef.current) return;
    hydratedRef.current = true;
    setAllProspects(data.prospects || []);
    setStoreReady(true);
  }, []);

  // Initial load. Runs once.
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Jumping straight to a row from Leads. Two things could hide the prospect:
  // it was created seconds ago so the loaded list may not have it, and any
  // filter left on in Prospects would exclude it (that is why landing there
  // showed nothing until you clicked the New stage yourself). Refetch when it
  // is missing, then hand off to openProspectRow, which clears the filters,
  // highlights the row and scrolls it into view.
  const openProspectById = useCallback(
    async (id) => {
      if (!id) {
        setView('prospects');
        return;
      }
      let p = allProspects.find((x) => x.id === id);
      if (!p) {
        const res = await fetch('/api/prospects');
        if (res.ok) {
          const data = await res.json();
          setAllProspects(data.prospects || []);
          p = (data.prospects || []).find((x) => x.id === id);
        }
      }
      // A row that genuinely is not there (deleted, or another workspace) still
      // gets you to the sheet rather than leaving the click doing nothing.
      if (p) openProspectRow(p);
      else setView('prospects');
    },
    [allProspects]
  );

  // Promotions happen in the Inbox view outside the canonical store's write
  // path — refetch when the user returns to the Prospects tab.
  useEffect(() => {
    if (view === 'prospects' || view === 'today') loadAll();
  }, [view]);

  // The auto-mark-Finished effect lives further down, after `updateProspect`
  // is defined (it can't reference updateProspect before declaration).
  const autoFinishedRef = useRef(false);

  // ─── Client-side filter + sort projection ──────────────────────────────
  // Pure derivation from (allProspects, filter sets, search, sort). No
  // async, no network, no race conditions. Toggling a checkbox re-renders
  // synchronously with the new filter applied — the badge, the row count,
  // and the rendered rows are always one consistent snapshot.
  //
  // Search is debounced BEFORE it reaches this memo: filtering joins ten
  // fields per row, and at 5,500 rows doing that on every keystroke made
  // typing feel like wading. The input itself stays instant (it renders
  // from `search`); only the expensive projection waits for a 150ms pause.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(id);
  }, [search]);

  // What is actually happening with every prospect, worked out once.
  //
  // prospectActionState runs the whole follow-up schedule per row, so at 5,800
  // rows this is the one place it may happen. The tab counts, the narrowing
  // chips, the filter and every rendered row read from this map.
  const classified = useMemo(() => classify(allProspects), [allProspects]);

  // Everything the search box and the filter popovers allow, before the tab
  // narrows it.
  //
  // The tab counts are taken from HERE rather than from the whole store, so
  // clicking a tab always produces exactly the number printed on it. Counting
  // from the store instead put "All 35" above a list of 24 rows, which reads as
  // eleven prospects having gone missing.
  const baseRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const ratingAll = ratingChecked.size === allRatingOpts.length;
    const stageAll = stageChecked.size === allStageOpts.length;
    const lensFn = quickLens ? LENSES[quickLens] : null;

    return allProspects.filter((p) => {
      if (!inRegion(p, region)) return false;
      if (q) {
        // `info` is in here so the notes column is searchable, which is what
        // makes tagged batches findable: the video triage writes "VIDEO: SEND"
        // into Info, and searching that pulls the whole render queue without
        // opening a single row. Any future tagging works the same way.
        const hay = [p.name, p.business_name, p.email, p.domain, p.stage, p.rating, p.country, p.source, p.info, p.video_tier]
          .map((x) => (x || '').toString().toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      if (lensFn && !lensFn(p)) return false;
      if (!ratingAll) {
        const key = p.rating || NO_RATING;
        if (!ratingChecked.has(key)) return false;
      }
      if (lensFn) return true; // lens replaces the stage/due filters only
      if (!stageAll) {
        if (!stageChecked.has(p.stage || 'New')) return false;
      }
      if (dueOnly && !isDueProspect(p)) return false;
      if (missingCountryOnly && p.country) return false;
      return true;
    });
  }, [allProspects, debouncedSearch, ratingChecked, stageChecked, dueOnly, missingCountryOnly, quickLens, region, allRatingOpts.length, allStageOpts.length]);

  const searching = debouncedSearch.trim().length > 0;
  const tabTotals = useMemo(
    () => tabCounts(baseRows, classified, { includeInternal: searching }),
    [baseRows, classified, searching]
  );
  useEffect(() => {
    if (pickedTab.current) return;
    const total = Object.values(tabTotals || {}).reduce((a, b) => a + (b || 0), 0);
    if (!total) return; // nothing loaded yet; All is a fine place to wait
    pickedTab.current = true;
    const want = openingTab(tabTotals);
    if (want !== tab) setTab(want);
  }, [tabTotals, tab]);

  // The narrowing chips describe the open tab, not the whole database: offering
  // "Old sequence finished · 622" while looking at Replied is offering a filter
  // that empties the screen.
  // Searching is the one way to reach the internal test row. Browsing must not
  // turn it up — a canary sitting in All is a row Ary can accidentally work —
  // but a row nothing can find is a row that has effectively been deleted, and
  // this one is real and still sending.
  const tabRows = useMemo(
    () => baseRows.filter((p) => inTab(p, classified, tab)
      || (searching && classified.get(p.id)?.internal && tab === VIEW.ALL)),
    [baseRows, classified, tab, searching]
  );
  const tabFilters = useMemo(() => actionFilters(tabRows, classified), [tabRows, classified]);
  // A chip that no longer exists in this tab must not keep filtering silently.
  useEffect(() => {
    if (actionFilter && !tabFilters.some((f) => f.label === actionFilter)) setActionFilter(null);
  }, [tabFilters, actionFilter]);

  const visibleProspects = useMemo(() => {
    const rows = actionFilter
      ? tabRows.filter((p) => classified.get(p.id)?.state?.label === actionFilter)
      : tabRows;

    // Sort. Default = 'New' stage on top, then last_contact_date DESC,
    // then id DESC. Column-header sort overrides default with the chosen
    // direction.
    const dir = sort.dir === 'desc' ? -1 : 1;
    function defaultCmp(a, b) {
      const aNew = a.stage === 'New' ? 0 : 1;
      const bNew = b.stage === 'New' ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      const aD = a.last_contact_date || '';
      const bD = b.last_contact_date || '';
      if (aD !== bD) {
        if (!aD) return 1;
        if (!bD) return -1;
        return aD > bD ? -1 : 1;
      }
      return (b.id || 0) - (a.id || 0);
    }
    function fieldCmp(key) {
      return (a, b) => {
        let av = a[key];
        let bv = b[key];
        const aNull = av == null || av === '';
        const bNull = bv == null || bv === '';
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      };
    }

    const sorted = [...rows];
    // Under the video lens the default order is the render queue. Score alone
    // used to decide it, which quietly wasted the best slot: a video only rides
    // the email the prospect has not been sent yet, so one recorded while they
    // are still on email 2 goes out on day 7, and the same video recorded three
    // days later has to wait for day 14 or fall out of the sequence entirely.
    // Sorting by how much of the sequence is left first, then by score, means
    // the rows that can still catch the early slot get recorded while they can.
    if ((quickLens === 'video' || quickLens === 'needs-video') && sort.key === 'default') {
      sorted.sort((a, b) =>
        videoSlotRank(a) - videoSlotRank(b)
        || (b.video_score ?? -1) - (a.video_score ?? -1)
        || (b.id || 0) - (a.id || 0));
    } else if (sort.key === 'default') sorted.sort(defaultCmp);
    // The Video column cell holds the tier and score; sorting it means sorting
    // by the numeric score, not the absent 'video' field.
    else if (sort.key === 'video') sorted.sort(fieldCmp('video_score'));
    // Ratings are emoji strings; codepoint order is a shuffle. Sort by their
    // rank in the ratings list instead (💚 first … 📭 last, unrated at the end).
    else if (sort.key === 'rating') {
      const rank = (v) => {
        const i = ratings.indexOf(v);
        return i === -1 ? ratings.length : i;
      };
      sorted.sort((a, b) => (rank(a.rating) - rank(b.rating)) * (sort.dir === 'desc' ? -1 : 1));
    }
    else sorted.sort(fieldCmp(sort.key));
    return sorted;
  }, [tabRows, classified, actionFilter, quickLens, sort, ratings]);

  // Only a page of rows is put in the DOM. Every row that matched used to be
  // rendered, which is fine at a few hundred and not at three and a half
  // thousand: the New lens alone builds that many rows, each with its own
  // pickers and cells, and the browser spends seconds on markup nobody has
  // scrolled to.
  //
  // visibleProspects stays the whole filtered set, because the counts and the
  // "N / M shown" line are about the filter, not about the page.
  const pageCount = Math.max(1, Math.ceil(visibleProspects.length / pageSize));
  const pageProspects = useMemo(
    () => visibleProspects.slice(page * pageSize, page * pageSize + pageSize),
    [visibleProspects, page, pageSize]
  );
  // Keyboard nav over the table: ↑/↓ move the active row (the same one a
  // click pins), Enter opens its profile. Silent while typing in any field,
  // while the drawer is open, or off the Prospects view.
  useEffect(() => {
    if (view !== 'prospects') return;
    function onKey(e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      const el = document.activeElement;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (drawerId != null) return;
      const rows = pageProspects;
      if (!rows.length) return;
      const idx = rows.findIndex((p) => p.id === activeRowId);
      if (e.key === 'Enter') {
        if (idx !== -1) { e.preventDefault(); setDrawerId(rows[idx].id); }
        return;
      }
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? rows[Math.min(rows.length - 1, idx + 1)]
        : rows[Math.max(0, (idx === -1 ? rows.length : idx) - 1)];
      setActiveRowId(next.id);
      rowRefs.current[next.id]?.scrollIntoView({ block: 'nearest' });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, pageProspects, activeRowId, drawerId]);

  // Back to the first page whenever the filtered set changes underneath, and
  // never stranded on a page that no longer exists.
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(0);
  }, [pageCount, page]);

  // Jump-to-row ("Show in table", the Leads hand-off) must also jump to the
  // row's PAGE. The highlight and scroll only work on rows that are in the
  // DOM, and at 5,800 rows the target usually lives pages deep — so the
  // button read as doing nothing at all. Declared after the page-reset
  // effects so it wins the render pass; re-runs as the projection settles
  // (the debounced search catching up, filters clearing).
  useEffect(() => {
    if (!highlightId || view !== 'prospects') return;
    const idx = visibleProspects.findIndex((x) => x.id === highlightId);
    if (idx === -1) return;
    const target = Math.floor(idx / pageSize);
    setPage((prev) => (prev === target ? prev : target));
  }, [highlightId, visibleProspects, pageSize, view]);

  // The jump itself. Runs again every time the projection settles further
  // (the search debounce catching up, filters clearing, the page flipping)
  // until the row exists in the DOM — then scrolls it to center, flashes it,
  // and lets go. Declared here, after visibleProspects, because it reads it.
  useEffect(() => {
    if (!jumpId || view !== 'prospects') return;
    const idx = visibleProspects.findIndex((x) => x.id === jumpId);
    if (idx === -1) return;
    const target = Math.floor(idx / pageSize);
    if (page !== target) {
      setPage(target);
      return;
    }
    const el = rowRefs.current[jumpId];
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(jumpId);
    setJumpId(null);
    setTimeout(() => setHighlightId(null), 2600);
  }, [jumpId, view, visibleProspects, page, pageSize]);

  // What every count on this screen is counted from.
  //
  // The rating filter narrows the rows even while a lens is on, and none of the
  // chip counts applied it, so switching off Skip and Dead site removed them
  // from the table and left them in every number above it. Due today read 3
  // with two rows under it, and the missing one was a dead site.
  //
  // A count that disagrees with the list beneath it is worse than no count: it
  // reads as rows having gone missing. Every chip counts from here now, so
  // turning a rating off takes it out of the numbers and the rows together.
  // Region scopes the counts as well as the rows. A chip reading 24 above a
  // table showing 3 is the same class of bug as a count that disagrees with
  // its own list.
  const countable = useMemo(() => {
    const ratingAll = ratingChecked.size === allRatingOpts.length;
    if (ratingAll && !region) return allProspects;
    return allProspects.filter((p) => inRegion(p, region)
      && (ratingAll || ratingChecked.has(p.rating || NO_RATING)));
  }, [allProspects, ratingChecked, region, allRatingOpts.length]);

  const dueCount = useMemo(
    () => countable.reduce((n, p) => n + (isDueProspect(p) ? 1 : 0), 0),
    [countable]
  );

  // Backing for the topbar "New" quick chip: count of untouched leads, and
  // whether the stage filter is currently narrowed to exactly 'New'.
  const newCount = useMemo(
    () => countable.reduce((n, p) => n + ((p.stage || 'New') === 'New' ? 1 : 0), 0),
    [countable]
  );
  const prescreenCount = useMemo(
    () => countable.reduce((n, p) => n + (p.stage === 'Prescreen' ? 1 : 0), 0),
    [countable]
  );
  const validatedCount = useMemo(
    () => countable.reduce((n, p) => n + (p.stage === 'Validated' ? 1 : 0), 0),
    [countable]
  );
  const videoCount = useMemo(
    () => countable.reduce(
      (n, p) => n + (p.video_tier === 'SEND' || p.video_tier === 'MAYBE' ? 1 : 0),
      0
    ),
    [countable]
  );
  const videoReadyCount = useMemo(
    () => countable.reduce((n, p) => n + (p.video_url ? 1 : 0), 0),
    [countable]
  );
  // Strong, but no way to reach them yet.
  const needsEmailCount = useMemo(
    () => countable.reduce(
      (n, p) => n + (p.rating === '💚' && !(p.email || '').trim() ? 1 : 0),
      0
    ),
    [countable]
  );
  // Recorded but not yet sent.
  const videoQueuedCount = useMemo(
    () => countable.reduce((n, p) => n + (p.video_url && !p.video_sent_at ? 1 : 0), 0),
    [countable]
  );
  // The recording worklist count — worth a video, not yet recorded, not skipped.
  const needsVideoCount = useMemo(
    () => countable.reduce(
      (n, p) => n + (
        (p.video_tier === 'SEND' || p.video_tier === 'MAYBE') && !p.video_url && p.rating !== '✖️'
          ? 1 : 0
      ),
      0
    ),
    [countable]
  );

  // Send cadence at a glance: sent today / yesterday (by last_contact_date),
  // and due today / tomorrow (by daysUntilDue).
  const sendStats = useMemo(() => {
    const today = todayIso();
    const yesterday = isoShift(-1);
    let sentToday = 0, sentYesterday = 0, dueToday = 0, dueTomorrow = 0;
    for (const p of countable) {
      if (p.last_contact_date === today) sentToday++;
      else if (p.last_contact_date === yesterday) sentYesterday++;
      // The chip and the list have to answer the same question, or the
      // number above the table disagrees with the rows under it.
      if (isDueProspect(p)) dueToday++;
      else if (daysUntilDue(p) === 1 && !CLOSED_STAGES.has(p.stage || 'New')) dueTomorrow++;
    }
    return { sentToday, sentYesterday, dueToday, dueTomorrow };
  }, [countable]);

  // How many lens chips would actually draw. Declared here rather than
  // beside the other lens code above, because every count it reads is
  // defined between the two points and a const cannot be read early.
  // How many lens chips would actually draw. Due today always draws (an
  // explicit zero there means "all clear"), and the active lens must stay
  // visible to be turned off; everything else only appears when it has rows.
  const lensesWorthShowing = [
    sendStats.dueTomorrow, newCount, prescreenCount, validatedCount,
    sendStats.sentToday, sendStats.sentYesterday,
    needsEmailCount, needsVideoCount, videoQueuedCount,
  // The `>= 0` this replaces was always true, so the band rendered on every
  // screen with nothing in it but the Due-today chip — the exact empty row
  // Chapter 11 claimed to have removed.
  ].filter((n) => n > 0).length + (sendStats.dueToday > 0 ? 1 : 0) + (quickLens ? 1 : 0);


  // ─── Bridge to window.bloom ───────────────────────────────────────
  // Refs let us hand the API stable closures over the live store + write
  // path without recreating the API on every render.
  const getAllRef = useRef(() => []);
  getAllRef.current = () => allProspectsRef.current;
  const updateProspectByIdRef = useRef(async () => null);
  const createProspectRef = useRef(async () => null);
  const refreshRef = useRef(async () => {});
  refreshRef.current = () => loadAll();

  // Install / tear down the window.bloom automation surface.
  useEffect(() => {
    const api = makeBloomApi({
      stages,
      ratings,
      countries,
      sources,
      replyTypes,
      autoEmailStages: AUTO_EMAIL_STAGES,
      getAllProspects: () => getAllRef.current(),
      updateProspectById: (id, patch) => updateProspectByIdRef.current(id, patch),
      createProspect: (payload) => createProspectRef.current(payload),
      refresh: () => refreshRef.current(),
    });
    if (typeof window !== 'undefined') {
      window.bloom = api;
      // eslint-disable-next-line no-console
      console.info(
        '[bloom] window.bloom ready:\n  ' +
          Object.keys(api).filter((k) => typeof api[k] === 'function').join(', ')
      );
    }
    return () => {
      if (typeof window !== 'undefined' && window.bloom === api) {
        delete window.bloom;
      }
    };
  }, [stages, ratings, countries, sources, replyTypes]);

  // The Filters badge and ✕ Clear measure DEVIATION FROM THE WORKSPACE
  // DEFAULT, not from show-everything — Ary's baseline hides eight things
  // on purpose, and a permanently-lit badge would teach her to ignore it.
  const setDiff = (a, b) => {
    let d = 0;
    for (const x of a) if (!b.has(x)) d++;
    for (const x of b) if (!a.has(x)) d++;
    return d;
  };
  const hiddenCount =
    setDiff(ratingChecked, defaultRatingSet) +
    setDiff(stageChecked, defaultStageSet) +
    (dueOnly ? 1 : 0) +
    (missingCountryOnly ? 1 : 0);
  // Rows the search box and the filter popovers are holding back, whatever the
  // tab. Counted before the tab narrows anything, because a tab is not a filter
  // — it is the question being asked.
  const hiddenByFilters = Math.max(0, allProspects.length - baseRows.length);
  // A saved filter that removes a whole reply state from a tab is exactly the
  // kind of thing somebody needs a way out of, even when it IS their default.
  const hasActiveFilter = search.length > 0 || hiddenCount > 0 || quickLens != null || hiddenByFilters > 0;
  const totalCount = allProspects.length;
  const showEmptyState = storeReady && totalCount === 0 && !hasActiveFilter;

  function toggleInSet(setter, value) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function selectAllFilters() {
    setRatingChecked(new Set(allRatingOpts));
    setStageChecked(new Set(allStageOpts));
  }
  function clearAllFilters() {
    setRatingChecked(new Set());
    setStageChecked(new Set());
  }
  // Toolbar "✕ Clear": return to THIS WORKSPACE'S default view (Ary's is
  // active-pipeline-only), not to show-everything. The FilterPanel's
  // Select-all remains the way to genuinely see every row.
  function resetFilters() {
    setSearch('');
    setDueOnly(false);
    setMissingCountryOnly(false);
    setQuickLens(null);
    setRatingChecked(new Set(defaultRatingSet));
    setStageChecked(new Set(defaultStageSet));
  }
  // Columns whose stored value is a JSON blob or free text: "sorting" them
  // localeCompares raw JSON and produces an arbitrary order under a
  // confident-looking arrow, so their headers simply don't sort.
  const UNSORTABLE_COLUMNS = new Set(['email_sequence']);
  function toggleSort(key) {
    if (UNSORTABLE_COLUMNS.has(key)) return;
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'default', dir: 'asc' };
    });
  }

  // Canonical write path. Used by the UI cells (rating, stage, etc.) AND
  // by window.bloom.* — there's only one path, so there's only one
  // place a write can go wrong. Writes are keyed by stable id, patch the
  // canonical `allProspects` array (not any filtered view), then replace
  // the row with the server's confirmed row on success.
  //
  // The silent-revert bug fix: the previous architecture re-fetched
  // filtered rows from the server on every filter change. A PUT in flight
  // could be raced by a GET that returned pre-write rows, and the row in
  // the filtered view would silently revert to the old stage. Now there's
  // no per-filter-change refetch — the store is the single truth and
  // filter changes are pure derivations from it.
  const updateProspect = useCallback(async (id, patch) => {
    // The activity timeline fills itself: a stage move, a logged reply, or
    // the video going out rides along in the same PUT as an activity_log
    // entry. addLog's own writes pass through untouched (see withAutoLog).
    const prevRow = allProspectsRef.current.find((x) => x.id === id);
    patch = withAutoLog(prevRow, patch);
    setAllProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      const res = await fetch(`/api/prospects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`save failed (${res.status}) ${body}`);
      }
      const data = await res.json();
      const fresh = data.prospect;
      setAllProspects((prev) => prev.map((p) => (p.id === id ? fresh : p)));
      // A mis-click on a dropdown used to be silently permanent. The three
      // consequential quick-edits (stage, rating, reply) confirm themselves
      // with a toast whose Undo reverts EVERY field the patch carried
      // (stage changes ride with dates and counts), except the activity
      // log — history stays history, and the revert writes its own entry.
      const undoKeys = Object.keys(patch).filter((k) => k !== 'activity_log');
      if (prevRow && undoKeys.some((k) => k === 'stage' || k === 'rating' || k === 'reply_type')) {
        const label =
          patch.stage && patch.stage !== prevRow.stage ? `Stage → ${patch.stage}`
            : 'reply_type' in patch ? 'Reply updated'
            : 'Rating updated';
        const revert = {};
        for (const k of undoKeys) revert[k] = prevRow[k] ?? null;
        toast(label, { action: { label: 'Undo', onClick: () => updateProspect(id, revert) } });
      }
      // A new Client gets an onboarding card without a second creation step.
      // Fire-and-forget: the POST is idempotent by prospect_id server-side,
      // so a re-flip or a race with the Clients view's own button is safe.
      if (patch.stage === 'Client' && prevRow && prevRow.stage !== 'Client') {
        fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_id: id,
            name: fresh.name || fresh.business_name || fresh.email || 'New client',
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d?.client) return;
            toast(d.existed ? 'They already have a client card' : 'Client card created', {
              action: { label: 'Open', onClick: () => setView('clients') },
            });
          })
          .catch(() => {
            toast('Could not create the client card. Open Clients and press Start onboarding.', { tone: 'error' });
          });
      }
      return fresh;
    } catch (e) {
      // Only this row goes back. Restoring the whole list snapshot took every
      // other edit down with it: change A, change B, B saves, A fails, and
      // B's server-confirmed row was reverted on screen along with A. She had
      // no way to know B was still saved except by reloading.
      if (prevRow) setAllProspects((prev) => prev.map((p) => (p.id === id ? prevRow : p)));
      // No more browser alert(): the failure is a toast with a Retry that
      // resends the exact same patch.
      toast(`Save failed: ${e.message}`, {
        tone: 'error',
        action: { label: 'Retry', onClick: () => updateProspect(id, patch).catch(() => {}) },
      });
      throw e;
    }
  }, []);

  // Expose the canonical write path to window.bloom via the bridge ref.
  updateProspectByIdRef.current = updateProspect;

  // Auto-mark Finished: once the canonical store hydrates on first load,
  // sweep for prospects whose band is spent and who have been quiet long
  // enough, and flip them to 'Finished'. Runs at most once per page load
  // (guarded by autoFinishedRef) so it doesn't re-fire on later state
  // changes. Idempotent — once a row is 'Finished' it won't re-match.
  //
  // This used to key on stage 'Email 5', which V2 never reaches, so nothing
  // had auto-finished since the three-email cap shipped. `shouldAutoFinish`
  // asks the band instead, and refuses to touch warm stages or anybody still
  // owed a video.
  useEffect(() => {
    if (!storeReady || autoFinishedRef.current) return;
    autoFinishedRef.current = true;
    const candidates = allProspectsRef.current.filter((p) => shouldAutoFinish(p));
    if (candidates.length === 0) return;
    Promise.all(
      candidates.map((p) =>
        updateProspect(p.id, { stage: 'Finished' }).catch(() => null)
      )
    ).then(() => {
      // eslint-disable-next-line no-console
      console.info(
        `[bloom] auto-marked ${candidates.length} spent → Finished (${FINISHED_AFTER_DAYS}+ days quiet)`
      );
    });
  }, [storeReady, updateProspect]);

  async function handleStageChange(p, newStage) {
    const patch = { stage: newStage };
    if (AUTO_EMAIL_STAGES.has(newStage)) {
      patch.last_contact_date = todayIso();
      patch.emails_sent = (p.emails_sent || 0) + 1;
      applyNextAction(patch, newStage, p);
    } else if (STAMP_ONLY_STAGES.has(newStage)) {
      patch.last_contact_date = todayIso();
    }
    await updateProspect(p.id, patch);
  }

  // Canonical create path, shared by the quick-add form and
  // window.bloom.addProspect(). POSTs, then pushes the server's row
  // into the store so the table updates without a refetch. Throws on
  // failure so callers can decide how to surface it.
  const createProspect = useCallback(async (payload) => {
    const res = await fetch('/api/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`create failed (HTTP ${res.status}) ${detail}`.trim());
    }
    const data = await res.json();
    setAllProspects((prev) => [data.prospect, ...prev]);
    return data.prospect;
  }, []);

  createProspectRef.current = createProspect;

  async function addProspect(e) {
    e?.preventDefault?.();
    const { name, business_name, email, domain, country, source, claude_chat_link, origin_class, origin_subtype } = quickAdd;
    if (!origin_class) {
      toast('Pick where you found them first. It is one tap, and it is the only way the tracker can ever tell you which sources are worth your time.', { tone: 'error' });
      return;
    }
    // Say so rather than returning quietly. A dead Add button reads as a
    // broken app, which is exactly how the focus-stealing bug presented.
    if (!name && !business_name && !email && !domain) {
      toast('Add a name, business, email or website first, then press Add.', { tone: 'error' });
      return;
    }
    // Duplicate guard: the CSV importer has skipped matches for months, but
    // hand-adds went in blind. Same rules — exact email first, then the bare
    // host — and a confirm instead of a hard block, because "same domain"
    // can legitimately be two people at one company.
    {
      const emailKey = String(email || '').trim().toLowerCase();
      const hostKey = faviconHost(domain);
      const dupe = allProspectsRef.current.find((p) =>
        (emailKey && String(p.email || '').trim().toLowerCase() === emailKey)
        || (hostKey && faviconHost(p.domain) === hostKey)
      );
      if (dupe) {
        const who = dupe.name || dupe.business_name || dupe.email || `#${dupe.id}`;
        const what = emailKey && String(dupe.email || '').trim().toLowerCase() === emailKey ? 'email' : 'website';
        const ok = await confirmDialog({
          title: 'Looks like a duplicate',
          message: `${who} already has this ${what} (${dupe.stage || 'New'} stage). Add a second row anyway?`,
          confirmLabel: 'Add anyway',
          cancelLabel: 'Cancel',
          danger: false,
        });
        if (!ok) return;
      }
    }
    try {
      const created = await createProspect({
        name,
        business_name,
        email,
        domain,
        country: country || null,
        source: source || null,
        claude_chat_link: claude_chat_link.trim() || null,
        rating: '💚', // new prospects default to Strong
        stage: 'New',
        origin_class,
        origin_subtype: origin_subtype.trim() || null,
      });
      setQuickAdd({ name: '', business_name: '', email: '', domain: '', country: '', source: '', claude_chat_link: '', origin_class: '', origin_subtype: '' });
      setHighlightId(created.id);
      setTimeout(() => setHighlightId(null), 1800);
      setAddOpen(false);
    } catch (err) {
      // Don't fail silently — surface the server error so a broken write
      // path (e.g. a 405 from a bad deploy) is obvious instead of looking
      // like the button did nothing.
      toast(`Couldn't add prospect. ${err.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => addProspect() } });
    }
  }

  // Conventional destructive flow: trash icon → app-styled modal → delete.
  // The message is truthful: prospects soft-delete to Trash (30-day window),
  // so we say "move to Trash", never "can't be undone".
  async function requestDelete(id) {
    if (pendingDelete) return; // a delete is already in flight
    const p = allProspectsRef.current.find((x) => x.id === id);
    const who = p ? (p.name || p.business_name || p.email || 'this prospect') : 'this prospect';
    const ok = await confirmDialog({
      title: `Move ${who} to Trash?`,
      message: 'The row leaves your table but stays in Trash for 30 days, where you can restore it anytime.',
      confirmLabel: 'Move to Trash',
    });
    if (!ok) return;
    setPendingDelete(id);
    try {
      const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAllProspects((prev) => prev.filter((x) => x.id !== id));
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch (err) {
      toast(`Couldn't move to Trash. ${err.message}`, { tone: 'error' });
    } finally {
      setPendingDelete(null);
    }
  }

  // The neutral pill used by every non-destructive action in the selection
  // bar. Shared so the treatments cannot drift apart again.
  const BULK_BTN =
    'text-[12px] font-medium px-3 py-1 rounded-full border border-paper/30 bg-paper/10 text-paper hover:bg-paper/20 hover:border-paper/50 transition';

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!(await confirmDialog({ title: `Move ${selected.size} prospect${selected.size === 1 ? '' : 's'} to Trash?`, message: 'They leave your table but stay in Trash for 30 days, where you can restore them anytime.', confirmLabel: 'Move to Trash' }))) return;
    // Only drop the rows the server actually accepted. Removing all of them
    // regardless meant a failed delete looked like it worked — the row left
    // the table, never reached Trash, and came back on the next load.
    const results = await Promise.all(
      [...selected].map(async (id) => {
        try {
          const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
          return res.ok ? id : null;
        } catch {
          return null;
        }
      })
    );
    const deleted = new Set(results.filter((id) => id != null));
    const failed = selected.size - deleted.size;
    setAllProspects((prev) => prev.filter((p) => !deleted.has(p.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !deleted.has(id))));
    if (failed > 0) {
      toast(`Couldn't move ${failed} prospect${failed === 1 ? '' : 's'} to Trash. ${failed === 1 ? 'It is' : 'They are'} still in your table.`, { tone: 'error' });
    }
  }

  async function bulkStage(newStage) {
    if (selected.size === 0) return;
    const ids = [...selected];
    // updateProspect already does optimistic + server confirm per row.
    await Promise.all(
      ids.map((id) => {
        const p = allProspectsRef.current.find((x) => x.id === id);
        const patch = { stage: newStage };
        if (AUTO_EMAIL_STAGES.has(newStage) && p) {
          patch.last_contact_date = todayIso();
          patch.emails_sent = (p.emails_sent || 0) + 1;
          applyNextAction(patch, newStage, p);
        } else if (STAMP_ONLY_STAGES.has(newStage)) {
          patch.last_contact_date = todayIso();
        }
        return updateProspect(id, patch).catch(() => null);
      })
    );
  }

  // Queues a video for everything selected that can have one. Deliberately a
  // confirm rather than a silent start: this is the one action in the app that
  // spends real money, about 580 ElevenLabs credits a video, and a mis-click on
  // eighty selected rows is forty five thousand of them.
  //
  // Only the queue is created here. RenderWatcher runs it two at a time, which
  // is what the render service can hold, and keeps going if this view closes.
  async function bulkRecordVideos() {
    const chosen = visibleProspects.filter((p) => selected.has(p.id));
    const withDomain = chosen.filter((p) => p.domain && String(p.domain).trim());
    const already = withDomain.filter((p) => p.video_url);
    const todo = withDomain.filter((p) => !p.video_url);
    const skipped = chosen.length - withDomain.length;

    if (!todo.length) {
      await confirmDialog({
        title: already.length ? 'Already recorded' : 'Nothing to record',
        message: already.length
          ? 'Every one of those already has a video. Open a prospect and use Re-record to replace one.'
          : 'None of those have a domain, so there is nothing to record.',
        confirmLabel: 'OK',
        danger: false,
      });
      return;
    }
    const mins = Math.ceil(todo.length / MAX_CONCURRENT) * 3;
    const lines = [
      `Record ${todo.length} audit video${todo.length === 1 ? '' : 's'}?`,
      '',
      `Roughly ${(todo.length * 580).toLocaleString()} ElevenLabs credits.`,
      `About ${mins} minute${mins === 1 ? '' : 's'}, two at a time.`,
    ];
    if (already.length)
      lines.push(`${already.length} already ${already.length === 1 ? 'has' : 'have'} one and will be left alone.`);
    if (skipped) lines.push(`${skipped} ${skipped === 1 ? 'has' : 'have'} no domain and will be skipped.`);
    lines.push('', 'Keep this tab open while it runs.');
    const ok = await confirmDialog({
      title: `Record ${todo.length} audit video${todo.length === 1 ? '' : 's'}?`,
      message: lines.slice(2).join('\n'),
      confirmLabel: 'Record',
      danger: false,
    });
    if (!ok) return;

    queueRenders(todo.map((p) => ({ id: p.id, name: p.name || p.business_name || p.domain })));
    setSelected(new Set());
  }

  // Fills the workspace email template into every selected row that has no
  // stored sequence yet — the same copy-with-placeholders-filled the modal's
  // "Use the template" button makes, minus the 4,700 modal visits. Rows that
  // already have emails are never touched.
  async function bulkApplyTemplate() {
    const chosen = visibleProspects.filter((p) => selected.has(p.id));
    if (!chosen.length) return;
    let tpl = [];
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      tpl = sanitizeSequenceTemplate(data?.settings?.sequenceTemplate);
    } catch {
      toast('Could not load the template. Check your connection and try again.', { tone: 'error' });
      return;
    }
    if (!tpl.length) {
      await confirmDialog({
        title: 'No template yet',
        message: 'Write your reusable email template first in Settings, under Email template. Then this button fills it in for everyone selected.',
        confirmLabel: 'OK',
        danger: false,
      });
      return;
    }
    const seqOf = (p) => parseEmailSequence(p.email_sequence);
    const todo = chosen.filter((p) => !(Array.isArray(seqOf(p)) && seqOf(p).length > 0));
    const already = chosen.length - todo.length;
    if (!todo.length) {
      await confirmDialog({
        title: 'Nothing to fill',
        message: 'Everyone selected already has emails stored. Open a prospect to edit theirs.',
        confirmLabel: 'OK',
        danger: false,
      });
      return;
    }
    const lines = [
      `Fills in ${tpl.length} email${tpl.length === 1 ? '' : 's'} with each prospect's name and business.`,
    ];
    if (already) lines.push(`${already} already ${already === 1 ? 'has' : 'have'} emails and will be left alone.`);
    const ok = await confirmDialog({
      title: `Apply the template to ${todo.length} prospect${todo.length === 1 ? '' : 's'}?`,
      message: lines.join('\n'),
      confirmLabel: 'Apply',
      danger: false,
    });
    if (!ok) return;
    const results = await Promise.all(
      todo.map((p) =>
        updateProspect(p.id, { email_sequence: JSON.stringify(fillSequenceTemplate(tpl, p)) })
          .then(() => true)
          .catch(() => false)
      )
    );
    const applied = results.filter(Boolean).length;
    const failed = todo.length - applied;
    toast(
      failed
        ? `Template applied to ${applied}, failed on ${failed}. The failed rows are unchanged.`
        : `Template applied to ${applied} prospect${applied === 1 ? '' : 's'}.`,
      failed ? { tone: 'error' } : {}
    );
    setSelected(new Set());
  }

  async function bulkRating(newRating) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) => updateProspect(id, { rating: newRating }).catch(() => null))
    );
  }

  async function bulkCountry(newCountry) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) => updateProspect(id, { country: newCountry }).catch(() => null))
    );
  }

  function onFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      setImportCsvText(text);
      // Nothing catches a throw inside a FileReader callback, and res.json()
      // throws on a non-JSON error body — which is how a bad CSV produced no
      // preview and no error at all.
      try {
        const res = await fetch('/api/prospects/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: text, confirm: false }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setImportPreview(data);
        else toast(data.error || `Import preview failed (HTTP ${res.status})`, { tone: 'error' });
      } catch (e) {
        toast(`Import preview failed. ${e.message}`, { tone: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function confirmImport() {
    try {
      const res = await fetch('/api/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importCsvText, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || `Import failed (HTTP ${res.status})`, { tone: 'error', action: { label: 'Retry', onClick: confirmImport } });
        return;
      }
      setImportPreview(null);
      setImportCsvText('');
      await loadAll();
      toast(`Imported ${data.imported}, skipped ${data.skipped}.`);
    } catch (e) {
      toast(`Import failed. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: confirmImport } });
    }
  }

  function exportCsv() {
    const url = new URL('/api/prospects/export', window.location.origin);
    appendFilterParams(url);
    window.location.href = url.toString();
  }

  // A ready-to-edit template matching the import route's known columns, so
  // nobody has to guess the format. Two example rows show the shapes.
  // The sample is documentation, not filler: every column the importer
  // accepts, one row per situation you actually hit, and a comment row
  // naming the allowed values so nobody has to guess what goes in `stage`
  // or `rating`.
  function downloadSampleCsv() {
    const headers = [
      'name', 'business_name', 'email', 'domain', 'country', 'source',
      'rating', 'stage', 'niche', 'emails_sent', 'last_contact_date',
      'next_action_date', 'call_booked', 'proposal_sent', 'must_haves',
      'revenue_score', 'info', 'origin_class', 'origin_subtype',
      'origin_batch', 'origin_query', 'origin_at',
    ];
    const legend = [
      `# stage: ${STAGES.join(' | ')}`,
      `# rating: ${RATINGS.join(' ')}  (leave blank for unrated)`,
      `# source: ${SOURCES.filter(Boolean).join(' | ')}`,
      '# country: US | CA | UK | AU | NZ',
      '# call_booked / proposal_sent: 1 for yes, 0 for no, blank for not asked yet',
      '# must_haves: Y or N   revenue_score: 0-7   dates: YYYY-MM-DD',
      '# origin_class: MAP_LISTING | SOCIAL_POST | DIRECTORY | MANUAL | REFERRAL | REACTIVATION | OTHER',
      '# Delete these # lines before importing. `name` and `origin_class` are required.',
    ];
    const rows = [
      ['Maria Santos', 'Sunrise Cafe', 'maria@sunrisecafe.com', 'sunrisecafe.com', 'US', 'Instagram',
       '💚', 'New', 'Cafe', '0', '', '', '', '', '', '', 'Great photos, nothing posted since June',
       'SOCIAL_POST', 'Instagram', '', '', ''],
      ['James Lee', 'Ironworks Gym', 'james@ironworksgym.com', 'ironworksgym.com', 'CA', 'Cold email',
       '💚', 'Email 2', 'Gym', '2', '2026-07-10', '2026-07-20', '0', '0', 'Y', '3',
       'Runs ads, no organic posting. Asked about pricing.', 'OTHER', 'Legacy list', '', '', ''],
      ['Dr. Ana Cruz', 'Cruz Family Law', 'ana@cruzfamilylaw.com', 'cruzfamilylaw.com', 'US', 'Referral',
       '💙', 'Proposal Sent', 'Attorney', '4', '2026-07-15', '2026-07-22', '1', '1', 'Y', '5',
       'Sent the proposal after the call. Decision expected next week.', 'REFERRAL', '', '', '', ''],
      ['Sam Okafor', '', 'sam@example.com', '', 'UK', 'LinkedIn',
       '', 'Prescreen', 'Coaching', '0', '', '', '', '', '', '',
       'Found on a scan, still need to check if they are a real fit',
       'SOCIAL_POST', 'LinkedIn', '', '', ''],
      ['Wilted Studio', 'Wilted Studio', '', 'wiltedstudio.com', 'AU', '',
       '🥀', 'Rejected', '', '0', '', '', '', '', 'N', '0', 'Site is dead, domain parked',
       'DIRECTORY', '', '', '', ''],
    ];
    const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [
      ...legend,
      headers.join(','),
      ...rows.map((r) => r.map(esc).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leads-that-bloom-sample.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // The last row ticked by hand, which is where a shift-click measures from.
  // Held in a ref because nothing renders from it and a re-render per click
  // would be a re-render of the whole table.
  const lastPicked = useRef(null);

  // Shift-click takes everything between the last row ticked and this one, the
  // way every list of checkboxes has worked since forever. Picking sixty rows
  // out of a page of a hundred was sixty clicks without it.
  //
  // The range is taken from the rows as they are currently sorted and filtered,
  // so it is the span the eye sees rather than a span of ids. Sorting by score
  // and shift-clicking down the top twenty selects those twenty, not whichever
  // ids happen to fall between two numbers.
  function toggleSelect(id, shiftKey = false) {
    const order = pageProspects.map((p) => p.id);
    const from = lastPicked.current == null ? -1 : order.indexOf(lastPicked.current);
    const to = order.indexOf(id);
    if (shiftKey && from !== -1 && to !== -1 && from !== to) {
      const [a, b] = from < to ? [from, to] : [to, from];
      const span = order.slice(a, b + 1);
      // The anchor's own state decides the whole range, so shift-clicking
      // through a selection clears it rather than leaving a checkerboard.
      const picking = selected.has(lastPicked.current);
      setSelected((prev) => {
        const n = new Set(prev);
        for (const rowId of span) {
          if (picking) n.add(rowId);
          else n.delete(rowId);
        }
        return n;
      });
      // The anchor stays put, so a second shift-click measures from the same
      // row again and the range can be extended without starting over.
      //
      // It only ever adds within the new span, so shift-clicking back towards
      // the anchor does not un-select what a wider reach already took. Undoing
      // that needs its own click, which is the usual bargain: the alternative
      // is remembering the previous span so it can be subtracted, and that goes
      // wrong the moment the sort or the filter changes underneath it.
      return;
    }
    lastPicked.current = id;
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  // Selects the rows on screen, not every row that matched. Ticking a header
  // box and silently selecting three thousand rows you cannot see is how a bulk
  // action goes wrong, and the box sits above a page of a hundred.
  function toggleSelectAll() {
    const onPage = pageProspects.map((p) => p.id);
    const allPicked = onPage.length > 0 && onPage.every((id) => selected.has(id));
    if (allPicked) {
      setSelected((prev) => {
        const next = new Set(prev);
        onPage.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...onPage]));
    }
  }

  return (
    <>
      <GlassBackdrop />
      {/* Full-width shell. The sidebar is flush to the edge (Editorial
          Botanical shell); the page padding lives on <main> so the rail can
          run full-height against the viewport instead of floating inside a
          padded box. */}
      <div className="flex flex-col md:flex-row pb-24 md:pb-0 min-h-screen">
        <GlassRail
          view={view}
          setView={setView}
          newLeadCount={newLeadCount}
          clocks={<WorldClockBar compact />}
          pages={pages}
          activePageId={activePageId}
          onSelectPage={(id) => { setActivePageId(id); setView('page'); }}
          prospects={allProspects}
          onOpenProspect={(p) => setDrawerId(p.id)}
          onNewPage={createPage}
          onPatchPage={patchPage}
          onDeletePage={deletePage}
          onDuplicatePage={duplicatePage}
        />
        <main className="flex-1 min-w-0 flex flex-col gap-4 p-[clamp(14px,1.8vw,36px)] md:pl-9">
      {/* Topbar: glass search + due/sent chips + add-prospect trigger.
          Search state/handler and the two counts are the same ones the
          old toolbar/cadence-strip used. Only relocated + restyled.
          Import/export moved in here too since the toolbar card would
          otherwise hold nothing but them plus the filters row. */}
      {view === 'prospects' && (
        <Hint id="prospect-tabs-v1" title="How Prospects works">
          <b>The tabs are the question</b> — who has replied, who is mid-sequence,
          who is finished. Under them, <b>Narrow to</b> filters by what happens next.
          Click any row to open the whole picture. Switch to <b>Table</b> for the
          spreadsheet, where every cell still edits in place.
        </Hint>
      )}
      {view === 'prospects' && (
        <ProspectTabs
          tab={tab}
          onTab={(t) => { pickedTab.current = true; setTab(t); setActionFilter(null); }}
          counts={tabTotals}
          filters={tabFilters}
          activeFilter={actionFilter}
          onFilter={setActionFilter}
          newFinds={{ count: newLeadCount, active: false, onOpen: () => setView('inbox') }}
        />
      )}
      {view === 'prospects' && (
        <div className="canvas-data glass-panel flex items-center gap-3 flex-wrap px-4 py-3">
          <div className="glass-control flex-1 min-w-[240px] rounded-[12px] px-4 py-3 flex items-center gap-2">
            <span className="text-ink-2 shrink-0">
              <Icon name="search" className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search name, business, email, domain…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search prospects by name, business, email or domain"
                    className="text-sm bg-transparent border-0 outline-none w-full placeholder:text-ink-2/70 text-ink"
            />
          </div>

          {/* Saved views: restore a whole working setup (search + filters +
              lens + sort) in one click. Stored per browser. */}
          <PortalMenu
            width={250}
            panelClassName="glass-panel !bg-panel p-2 w-[250px]"
            renderTrigger={() => (
              <button
                type="button"
                className="glass-control rounded-[8px] px-4 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-hover-wash transition"
              >
                Views ▾
              </button>
            )}
          >
            {(closeMenu) => (
              <div className="flex flex-col gap-0.5">
                {savedViews.length === 0 && (
                  <p className="px-2 py-1.5 text-[12px] text-ink-3 leading-snug">
                    No saved views yet. Set up filters you like, then save them
                    here to bring back in one click.
                  </p>
                )}
                {savedViews.map((v) => (
                  <div key={v.id} className="flex items-center gap-1 rounded-[8px] hover:bg-hover-wash-soft">
                    <button
                      onClick={() => { applyView(v); closeMenu(); }}
                      className="flex-1 min-w-0 text-left px-2 py-1.5 text-[13px] text-ink truncate"
                      title={v.name}
                    >
                      {v.name}
                    </button>
                    <button
                      onClick={() => persistViews(savedViews.filter((x) => x.id !== v.id))}
                      aria-label={`Delete view ${v.name}`}
                      className="w-6 h-6 shrink-0 rounded-[6px] text-ink-3 hover:text-poppy-text inline-flex items-center justify-center"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { closeMenu(); saveCurrentView(); }}
                  className="mt-0.5 px-2 py-1.5 text-left text-[13px] font-medium text-rose-text hover:bg-hover-wash-soft rounded-[8px]"
                >
                  ＋ Save current view
                </button>
              </div>
            )}
          </PortalMenu>

          {/* Filters popover (Task 4). Due-only toggle + stage/rating
              checklists, relocated here via the same PortalMenu machinery
              used by StagePicker/CountryPicker/RepliedCell elsewhere in this
              file (portal-rendered, click-out + Esc + scroll/resize close,
              flips above the button when there's no room below). Filter
              state/logic is untouched. Only the UI moved. */}
          <PortalMenu
            width={320}
            panelClassName="glass-panel !bg-panel p-4 w-[320px]"
            renderTrigger={() => (
              <button
                type="button"
                className="glass-control rounded-[8px] px-4 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-hover-wash transition relative"
              >
                Filters ▾
                {hiddenCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-btn text-white text-[9px] leading-none flex items-center justify-center"
                    title={`${hiddenCount} change${hiddenCount === 1 ? '' : 's'} from your default view`}
                  >
                    {hiddenCount}
                  </span>
                )}
              </button>
            )}
          >
            {(closeFilters) => (
              <FilterPanel
                ratings={ratings}
                stages={stages}
                ratingChecked={ratingChecked}
                stageChecked={stageChecked}
                toggleRating={(r) => toggleInSet(setRatingChecked, r)}
                toggleStage={(s) => toggleInSet(setStageChecked, s)}
                dueOnly={dueOnly}
                onToggleDue={() => setDueOnly((v) => !v)}
                dueCount={dueCount}
                lensActive={quickLens ? LENS_LABELS[quickLens] || quickLens : null}
                onSelectAll={selectAllFilters}
                onClearAll={clearAllFilters}
                onDone={closeFilters}
              />
            )}
          </PortalMenu>

          {/* Column visibility picker: same PortalMenu machinery as
              Filters. Name stays locked on so a row is never anonymous. */}
          <PortalMenu
            width={230}
            panelClassName="glass-panel !bg-panel p-3 w-[230px]"
            renderTrigger={() => (
              <button
                type="button"
                className="glass-control rounded-[8px] px-4 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-hover-wash transition relative"
              >
                Columns ▾
                {hiddenCols.size > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-btn text-white text-[9px] leading-none flex items-center justify-center"
                    title={`${hiddenCols.size} column${hiddenCols.size === 1 ? '' : 's'} hidden`}
                  >
                    {hiddenCols.size}
                  </span>
                )}
              </button>
            )}
          >
            {() => (
              <div className="flex flex-col gap-0.5">
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-[6px] text-sm ${
                      ALWAYS_VISIBLE_COLS.has(c.key) ? 'opacity-50' : 'cursor-pointer hover:bg-hover-wash-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(c.key)}
                      disabled={ALWAYS_VISIBLE_COLS.has(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    <span className="text-ink">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </PortalMenu>

          {/* How many rows are on screen, and how many a filter is holding
              back.
              This used to read "8 / 54 shown" while the Replied tab was open,
              which is two different facts glued together: eight of those
              fifty-four are in this tab and forty-six are in the other five.
              It read as a filter hiding forty-six rows. Now the tab's own
              number is on its chip, and this line only ever talks about
              filters — including a saved one, which can quietly take a whole
              reply state out of a tab and, before this, said nothing. */}
          <span className="text-[12px] font-medium text-ink-2 whitespace-nowrap">
            <span className="num-tabular">{visibleProspects.length.toLocaleString()}</span> shown
            {hiddenByFilters > 0 ? (
              <>
                {' · '}
                <span className="num-tabular">{hiddenByFilters.toLocaleString()}</span>
                {' hidden by your filters'}
              </>
            ) : null}
          </span>

          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-ink transition"
              title="Back to your default view"
            >
              <Icon name="x" className="w-3 h-3" />
              {/* Names the active lens so a jump from Today (which turns on
                  the chip-less 'unscheduled' lens) is never a mystery filter. */}
              {quickLens ? `Clear · ${LENS_LABELS[quickLens] || quickLens}` : 'Clear'}
            </button>
          )}

          {/* The missing-country filter has no row in the Filters popover
              (it's set by the Stats card jump), so without this pill it hid
              rows invisibly and lit the badge with no way to see why. */}
          {missingCountryOnly && (
            <button
              onClick={() => setMissingCountryOnly(false)}
              className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full bg-gold/15 text-gold-text border border-gold/40 hover:border-gold transition"
              title="Showing only prospects with no country set. Click to turn off."
            >
              <Icon name="x" className="w-3 h-3" />
              Missing country only
            </button>
          )}

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="glass-control p-2 rounded-[8px] text-ink-2 hover:text-ink transition"
              title="Import CSV"
              aria-label="Import CSV"
            >
              <Icon name="upload" className="w-4 h-4" />
            </button>
            <input
              type="file"
              accept=".csv,text/csv"
              ref={fileInputRef}
              className="hidden"
              onChange={onFilePick}
            />
            <button
              onClick={exportCsv}
              className="glass-control p-2 rounded-[8px] text-ink-2 hover:text-ink transition"
              title="Export CSV"
              aria-label="Export CSV"
            >
              <Icon name="download" className="w-4 h-4" />
            </button>
            <button
              onClick={downloadSampleCsv}
              className="glass-control p-2 rounded-[8px] text-ink-2 hover:text-ink transition text-[12px] font-medium"
              title="Download a sample CSV showing the import format"
              aria-label="Download a CSV template showing the import format"
            >
              CSV template
            </button>
          </div>

          <button
            className="text-[13px] font-medium px-4 py-2.5 rounded-[8px] btn-bloom"
            onClick={() => setAddOpen(true)}
          >
            Add prospect
          </button>

          {/* Working lenses, behind a disclosure.
              These are real and they are used — "what did I send today", "what
              is left to record" — but they are the operator's questions, not
              the ones the page is for, and ten of them permanently across the
              top is how the screen came to read as a control panel. The six
              tabs above answer what is happening; these narrow by the shape of
              the work. Closed by default, one click to open.
              A chip whose count is zero doesn't render at all — except Due
              today, whose explicit zero means "all clear", and the active
              lens, which must stay visible to be turned off. */}
          {/* Chapter 11: when the drawer would open onto nothing, the row
              does not render at all. A "Working lenses" line whose contents
              are one permanently-zero chip is a band of chrome charging rent
              for nothing. `lensesWorthShowing` counts what would actually
              draw, using the same rule the chips below use. */}
          {/* Where, before what. Region scopes every lens and the table, so
              "Due today" can mean the twenty-four Americans without also
              meaning whoever is due in Sydney. Always visible, unlike the
              lenses: which half of the world you are working on is not a
              detail to go looking for. */}
          <div className="w-full flex items-center gap-1.5 flex-wrap pt-1">
            <span className="ui-small font-semibold text-ink-3 mr-0.5">Where</span>
            {REGIONS.map((r) => {
              const on = region === r.id;
              const n = allProspects.reduce((acc, p) => acc + (inRegion(p, r.id) ? 1 : 0), 0);
              if (n === 0 && !on && r.id) return null;
              return (
                <button
                  key={r.id || "all"}
                  type="button"
                  onClick={() => setRegion(on ? "" : r.id)}
                  aria-pressed={on}
                  title={on ? "Show everywhere again" : `Only ${r.label}`}
                  className={`ui-small font-medium px-2.5 py-1 r-md border transition ${
                    on ? "btn-bloom border-transparent" : "bg-input-bg text-ink-2 border-line hover:border-rose hover:text-ink"
                  }`}
                >
                  {r.label}
                  <span className={`ml-1.5 num-tabular ${on ? "opacity-80" : "text-ink-3"}`}>{n}</span>
                </button>
              );
            })}
          </div>

          {lensesWorthShowing > 0 && (
          <details className="w-full pt-1 border-t border-hairline" open={Boolean(quickLens)}>
            <summary className="cursor-pointer inline-block ui-small font-semibold text-ink-2 hover:text-ink transition">
              Working lenses
              {quickLens ? ` · ${LENS_LABELS[quickLens] || quickLens}` : ''}
            </summary>
          <div className="w-full flex items-stretch gap-1.5 flex-wrap pt-2">
            {[
              ['due-today', 'Due today', sendStats.dueToday, true, 'bell'],
              ['due-tomorrow', 'Due tomorrow', sendStats.dueTomorrow, false, 'sunrise'],
              ['new', 'New', newCount, false, 'sprout'],
              ['prescreen', 'Prescreen', prescreenCount, false, 'search'],
              ['validated', 'Validated', validatedCount, false, 'check'],
              ['sent-today', 'Sent today', sendStats.sentToday, false, 'send'],
              ['sent-yesterday', 'Sent yesterday', sendStats.sentYesterday, false, 'send'],
              ['needs-email', 'Needs email', needsEmailCount, false, 'mail-open'],
              ['needs-video', 'To record', needsVideoCount, false, 'mic'],
              ['video-queued', 'Video queued', videoQueuedCount, false, 'play'],
            ].map(([key, label, count, urgent, chipIcon]) => {
              const active = quickLens === key;
              if (count === 0 && !active && key !== 'due-today') return null;
              const hot = urgent && count > 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQuickLens(active ? null : key)}
                  title={active ? 'Click to show the normal view again' : `Show only: ${label.toLowerCase()}`}
                  className={`rounded-lg border px-3 py-1.5 flex items-center gap-2 leading-tight transition cursor-pointer ${
                    active
                      ? 'bg-rose-btn text-white border-rose-btn'
                      : 'border-line text-ink-2 hover:bg-hover-wash-soft hover:border-line-strong'
                  }`}
                >
                  <Icon name={chipIcon} className="w-3 h-3 opacity-70 shrink-0" />
                  <span className="text-[12px] font-medium whitespace-nowrap">{label}</span>
                  <span className={`text-[13px] font-semibold num-tabular ${
                    active ? '' : hot ? 'text-rose-text' : 'text-ink'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>
          </details>
          )}
        </div>
      )}

      {/* Rendered outside the view ternary below so it's available even in
          the empty-state branch. The topbar's Add-prospect button shows
          for any non-empty-or-empty prospects view. */}
      <AddProspectDrawer open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={addProspect} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Name"
            value={quickAdd.name}
            onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
            className="glass-control w-full px-3 py-2 text-sm bg-hover-wash"
          />
          <input
            type="text"
            placeholder="Business"
            value={quickAdd.business_name}
            onChange={(e) => setQuickAdd({ ...quickAdd, business_name: e.target.value })}
            className="glass-control w-full px-3 py-2 text-sm bg-hover-wash"
          />
          <input
            type="text"
            placeholder="Email or @handle"
            value={quickAdd.email}
            onChange={(e) => setQuickAdd({ ...quickAdd, email: e.target.value })}
            className="glass-control w-full px-3 py-2 text-sm bg-hover-wash"
          />
          <input
            type="text"
            placeholder="Domain"
            value={quickAdd.domain}
            onChange={(e) => setQuickAdd({ ...quickAdd, domain: e.target.value })}
            className="glass-control w-full px-3 py-2 text-sm bg-hover-wash"
          />
          <Select
            value={quickAdd.country}
            onChange={(v) => setQuickAdd({ ...quickAdd, country: v })}
            options={[{ value: '', label: 'Country' }, ...countries.map((c) => ({ value: c, label: c }))]}
            placeholder="Country"
            ariaLabel="Country"
            className="w-full"
            buttonClassName="w-full !py-2"
            minWidth={0}
          />
          <Select
            value={quickAdd.origin_class}
            onChange={(v) => setQuickAdd({ ...quickAdd, origin_class: v })}
            options={ORIGIN_OPTIONS}
            placeholder="Where did you find them?"
            ariaLabel="Where did you find them"
            className="w-full"
            buttonClassName="w-full !py-2"
            minWidth={0}
          />
          {quickAdd.origin_class ? (
            <input
              type="text"
              placeholder={ORIGIN_HINT[quickAdd.origin_class] || 'Any detail worth keeping'}
              value={quickAdd.origin_subtype}
              onChange={(e) => setQuickAdd({ ...quickAdd, origin_subtype: e.target.value })}
              className="glass-control w-full px-3 py-2 text-sm bg-hover-wash"
            />
          ) : null}
          <input
            type="text"
            placeholder="Chat link"
            value={quickAdd.claude_chat_link}
            onChange={(e) => setQuickAdd({ ...quickAdd, claude_chat_link: e.target.value })}
            className="glass-control w-full px-3 py-2 text-sm bg-hover-wash"
          />
          <button
            type="submit"
            className="mt-1 px-5 py-2.5 text-[13px] font-medium btn-bloom rounded-[8px] transition"
          >
            Add
          </button>
        </form>
      </AddProspectDrawer>

      {view === 'journey' ? (
        <JourneyView
          prospects={allProspects}
          ready={storeReady}
          onOpen={(p) => setDrawerId(p.id)}
          onNavigate={goTo}
        />
      ) : view === 'today' ? (
        <TodayView
          prospects={allProspects}
          ready={storeReady}
          onChanged={() => loadAll()}
          dueFn={daysUntilDue}
          daysSinceFn={daysSinceContact}
          pastDueFn={pastDueDays}
          onNavigate={goTo}
          onOpen={(p) => setDrawerId(p.id)}
          // The Needs-you quick actions. Nudged = the same stamp the drawer's
          // "Log a touch today" makes, plus its own timeline entry; the row
          // then leaves the list because the quiet timer just reset.
          onNudged={(p) =>
            updateProspect(p.id, {
              last_contact_date: todayIso(),
              emails_sent: (p.emails_sent || 0) + 1,
              activity_log: appendEntry(p.activity_log, 'note', 'Nudged from Today'),
            })
          }
          onSnooze={(p) =>
            updateProspect(p.id, {
              next_action_date: isoShift(7),
              activity_log: appendEntry(p.activity_log, 'note', 'Snoozed 7 days from Today'),
            })
          }
        />
      ) : view === 'clients' ? (
        <ClientsView
          prospects={allProspects}
          onOpenProspect={(p) => setDrawerId(p.id)}
        />
      ) : view === 'health' ? (
        <div className="grid gap-4">
          {/* Chapter 11: System is four questions, not one report. The tab
              strip lives here because the automation panels below belong to
              the control room too — Health owns three of the four tabs and
              these own the fourth. */}
          <div className="w-full max-w-[820px] mx-auto">
            <SystemTabs value={systemTab} onChange={chooseSystemTab} />
          </div>
          <SystemHealth onNavigate={(v) => setView(v)} tab={systemTab} />
          {systemTab === 'automation' && (
            <div className="w-full max-w-[820px] mx-auto grid gap-4">
              <SendingSummary onNavigate={(v) => setView(v)} />
              <SpendBreaker />
              <ShadowPanel />
              <HeldPanel onOpen={(i) => openProspectById(i.id)} onViewAll={(v) => setView(v)} />
            </div>
          )}
        </div>
      ) : view === 'start' ? (
        <StartHerePage onNavigate={(v) => setView(v)} />
      ) : view === 'workspace' ? (
        <WorkspaceView heading="Templates" subheading="Your scripts, SOPs, and templates. Copy to use one, edit anything to make it yours." />
      ) : view === 'prompts' ? (
        <PromptsHub />
      ) : view === 'army' ? (
        <>
          <ArmyPanel
            prospectCount={allProspects.length}
            // Vet Bee needs the rows themselves: it checks each site and
            // writes the verdict back, so a count is not enough.
            prospects={allProspects}
            onProspectsChanged={() => loadAll()}
            onNavigate={(v) => setView(v)}
            onOpenPage={(id) => { setActivePageId(id); setView('page'); }}
            onReport={async (report, title = 'Pipeline report', emoji = '📊') => {
              const res = await fetch('/api/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Each bee names its own page: a chart for the weekly report,
                // a star for today's picks, a speech bubble for the replies
                // read-out. One glyph each keeps them apart in the sidebar.
                body: JSON.stringify({ title, emoji }),
              });
              if (!res.ok) throw new Error('could not create the report page');
              const { page } = await res.json();
              // Waggle Bee writes markdown, tables included. marked handles
              // the whole grammar; the old hand-rolled splitter only knew
              // headings and flattened tables into pipe soup.
              const html = marked.parse(report, { gfm: true, breaks: true });
              await fetch('/api/pages/' + page.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: html }),
              });
              setPages((prev) => [...prev, { ...page, body: html }]);
              return page.id;
            }}
          />
        </>
      ) : view === 'handsoff' ? (
        <WorkspaceView
          category="handsoff"
          heading="Cowork prompts"
          subheading="Editable prompts for agents that run on their own: Claude Cowork or ChatGPT agent mode. Each block's notes say which AI and which plan you need. Edit anything, it saves here."
        />
      ) : view === 'guide-agents' ? (
        <WorkspaceView
          category="guide-agents"
          heading="Connect an AI"
          subheading="Give any AI the keys to this app: paste these blocks into a Cowork skill, an agent prompt, or a custom GPT and it can read and write your leads for you. If you never build your own automations, you can skip this tab."
          locked
          adminOnly
        />
      ) : view === 'guide-sourcing' ? (
        <WorkspaceView
          category="guide-sourcing"
          heading="Sourcing guide"
          steps={SOURCING_STEPS}
          subheading="How to collect leads at scale, scraping included, without risking the accounts you sell with."
          locked
        />
      ) : view === 'guide-automation' ? (
        <>
          <SkillStudio />
          <WorkspaceView
            category="guide-automation"
            heading="Automation guide"
            subheading="How to install the Bloom .skill files and put the daily loop on a schedule in Claude Cowork."
            locked
          />
        </>
      ) : view === 'page' && pages.find((p) => p.id === activePageId) ? (
        <PageView
          page={pages.find((p) => p.id === activePageId)}
          allPages={pages}
          prospects={allProspects}
          onOpenProspect={(id) => openProspectById(id)}
          onOpenPage={(id) => setActivePageId(id)}
          onPatch={(patch) => patchPage(activePageId, patch)}
          onDelete={() => deletePage(pages.find((p) => p.id === activePageId))}
        />
      ) : view === 'stats' ? (
        <StatsView
          prospects={allProspects}
          stages={stages}
          onShowMissingCountry={() => {
            // Widen first, then narrow to the one thing asked for — otherwise
            // the card said "23, click to see them" and landed on an empty
            // table because the default stage/rating filters excluded them.
            clearFiltersForJump();
            setMissingCountryOnly(true);
            setView('prospects');
          }}
          onShowWarm={() => setView('today')}
          onShowDueAuto={() => setView('today')}
          onShowStage={(stage) => {
            // Same widen-then-narrow as missing-country: reset every filter,
            // then show just this one stage, so the count on the card matches
            // the rows that land in the table.
            clearFiltersForJump();
            setStageChecked(new Set([stage]));
            setView('prospects');
          }}
        />
      ) : bucketForView(view) ? (
        <BucketPage
          view={view}
          onBack={() => setView('today')}
          onOpen={(x) => openProspectById(typeof x === 'object' ? x.id : x)}
        />
      ) : view === 'settings' ? (
        <div className="grid gap-4">
          <SettingsView stages={stages} />
          {/* Chapter 6: the status surfaces moved to System health, the one
              control room. Settings keeps the dials and one pointer to the
              room where their effect is visible. */}
          <p className="text-[13px] text-ink-2">
            What these switches are currently doing, what automation is holding, and why, all live under{' '}
            <button
              onClick={() => setView('health')}
              className="font-medium underline decoration-dotted underline-offset-2 hover:text-rose-text transition"
            >
              System health
            </button>.
          </p>
        </div>
      ) : view === 'trash' ? (
        <TrashView onChanged={() => { loadAll(); loadPages(); }} />
      ) : view === 'inbox' ? (
        <div className="flex flex-col gap-4">
          <ProspectTabs
            tab={null}
            onTab={(t) => { pickedTab.current = true; setView('prospects'); setTab(t); setActionFilter(null); }}
            counts={tabTotals}
            newFinds={{ count: newLeadCount, active: true }}
          />
          <LeadInbox onOpenProspect={openProspectById} onNavigate={(v) => setView(v)} />
        </div>
      ) : showEmptyState ? (
        <section className="bg-panel border border-line-strong shadow-card rounded-2xl p-16 text-center shadow-card">
          <div className="inline-flex w-16 h-16 mb-5 rounded-full bg-blush-soft items-center justify-center text-mauve-deep">
            <Icon name="sprout" className="w-7 h-7" />
          </div>
          <h2 className="font-serif text-3xl text-charcoal mb-2">
            A quiet beginning.
          </h2>
          <p className="text-sm text-charcoal-2 mb-8 max-w-sm mx-auto leading-relaxed">
            Nothing yet. Import your CSV. Or just add the first prospect by
            hand. Either way, every row from here will save automatically.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 text-[13px] font-medium bg-charcoal text-paper rounded-full hover:bg-mauve-deep transition"
          >
            Import CSV
          </button>
        </section>
      ) : (
        <>
          <div className="canvas-data glass-panel overflow-hidden">
            {/* Panel head. Serif title + the same total/due counts the old
                toolbar count row derived (totalCount, dueCount), not
                recomputed here. */}
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-hairline">
              <h1 className="font-serif text-[26px] text-ink">
                {(TABS.find((t) => t.id === tab) || TABS[0]).label}
              </h1>
              {/* Text swap rather than two conditional blocks — renders more
                  reliably (kit tip). The spinner only shows on the first load,
                  before storeReady flips true. */}
              <span className="flex items-center gap-3 text-[12px] font-medium text-ink-2 num-tabular">
                {!storeReady && <BloomSpinner size={18} />}
                {/* No counts here: the toolbar's "N / M shown" line and the
                    Due today chip already say both numbers a few px above. */}
                <span>{!storeReady ? 'Gathering your prospects…' : ''}</span>
                {/* Two ways to read the same rows. The list says what is
                    happening; the table lets you edit forty cells. Neither is
                    a mode the other can do, so both stay. */}
                <span className="inline-flex rounded-[8px] border border-line overflow-hidden">
                  {[['list', 'List'], ['table', 'Table']].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => chooseLayout(key)}
                      aria-pressed={layout === key}
                      className={`px-3 py-1.5 text-[12px] font-medium transition ${
                        layout === key ? 'bg-rose-btn text-white' : 'text-ink-2 hover:bg-hover-wash-soft'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
                {/* The column-scroll arrows live in the head now — parked in
                    their own row they left a tall dead band over the table. */}
                {layout === 'table' && <TableScrollControls targetRef={tableScrollRef} />}
              </span>
            </div>

            {layout === 'list' ? (
              <div>
                {!storeReady && (
                  <div className="px-4 py-10 text-center text-[13px] text-ink-2">Gathering your prospects…</div>
                )}
                {storeReady && pageProspects.length === 0 && (
                  <div className="px-4 py-14 text-center text-[13px] text-ink-2">
                    Nothing in this list right now.
                  </div>
                )}
                {pageProspects.map((p) => (
                  <ProspectListRow
                    key={p.id}
                    prospect={p}
                    state={classified.get(p.id)?.state}
                    ratingMeta={RATING_META}
                    onOpen={(x) => setDrawerId(x.id)}
                  />
                ))}
              </div>
            ) : (
            <div className="ltb-table-shell">
            <div
              ref={tableScrollRef}
              className="overflow-x-auto bw-scroll ltb-table-wrap"
              onClick={(e) => {
                // Active-row tracking. A click anywhere inside a data row pins
                // that row; a click on empty tbody/wrapper space clears it.
                // Header clicks (sort, resize handles) are ignored entirely.
                if (e.target.closest('thead')) return;
                const tr = e.target.closest('tr[data-row-id]');
                if (tr) setActiveRowId(Number(tr.dataset.rowId));
                else setActiveRowId(null);
              }}
            >
            <table
              className="text-sm border-collapse ltb-table"
              style={{
                tableLayout: 'fixed',
                width: totalTableWidth,
                // Frozen-column offset follows the checkbox column when it is
                // resized, instead of assuming its default width.
                '--frozen-x': (colWidths.__select ?? COL_DEFAULTS.__select) + 'px',
              }}
            >
              <colgroup>
                <col style={{ width: colWidths.__select ?? COL_DEFAULTS.__select }} />
                {visibleColumns.map((c) => (
                  <col
                    key={c.key}
                    style={{ width: colWidths[c.key] ?? COL_DEFAULTS[c.key] ?? 100 }}
                  />
                ))}
                <col style={{ width: colWidths.__delete ?? COL_DEFAULTS.__delete }} />
              </colgroup>
              {/* Header is mono uppercase tracked, sits on the paper bg
                  with a hairline divider below. Feels like a column
                  label, not a heavy table header. */}
              <thead>
                <tr>
                  <th className="relative px-3 py-3 text-left text-[11px] uppercase tracking-[0.08em] text-ink font-bold bg-hover-wash-soft border-y border-hairline">
                    <input
                      type="checkbox"
                      // A screen reader announced twenty-one checkboxes on
                      // this page and could not tell you what any of them
                      // selected.
                      aria-label={`Select all ${pageProspects.length} prospects on this page`}
                      checked={pageProspects.length > 0 && pageProspects.every((p) => selected.has(p.id))}
                      onChange={toggleSelectAll}
                    />
                    <ColResizer onMouseDown={(e) => startColResize(e, '__select')} />
                  </th>
                  {visibleColumns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`relative py-3 px-3 text-left text-[11px] uppercase tracking-[0.08em] text-ink font-bold bg-hover-wash-soft border-y border-hairline select-none whitespace-nowrap overflow-hidden transition ${
                        UNSORTABLE_COLUMNS.has(c.key) ? '' : 'cursor-pointer'
                      }`}
                    >
                      {c.label}
                      {sort.key === c.key && (
                        <span className="ml-1 text-mauve">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                      <ColResizer onMouseDown={(e) => startColResize(e, c.key)} />
                    </th>
                  ))}
                  <th className="relative bg-hover-wash-soft border-y border-hairline">
                    <ColResizer onMouseDown={(e) => startColResize(e, '__delete')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* First load: staggered skeleton rows so the sheet never
                    flashes an empty "No matches" before the data lands. */}
                {!storeReady &&
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={`skel-${i}`} className="ltb-skelrow" style={{ animationDelay: `${i * 0.06}s` }}>
                      <td colSpan={visibleColumns.length + 2} className="px-3 py-2.5 border-b border-hairline">
                        <div className="skeleton h-4 w-full max-w-[520px] rounded" />
                      </td>
                    </tr>
                  ))}
                {storeReady && visibleProspects.length === 0 && (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 2}
                      className="px-4 py-14 text-center text-[13px] border-b border-hairline text-ink-2"
                    >
                      No matches. Adjust filters or add a prospect.
                    </td>
                  </tr>
                )}
                {pageProspects.map((p, rowIndex) => {
                  const stageKey = p.stage || 'New';
                  const c = stageStyle(stageKey);
                  const highlighted = highlightId === p.id;
                  const isPending = pendingDelete === p.id;
                  const isActive = activeRowId === p.id;
                  const hasInfo = (p.info || '').trim() !== '';
                  // Per-row visual identity is now a 4px left stripe in the
                  // stage's border color (painted via the --stage-stripe CSS
                  // variable, see globals.css). No more full-row tint — the
                  // chip alone carries the stage color so the table stays
                  // scannable. `faded` still dims the row slightly for
                  // dead-end stages like Lost.
                  const rowStyle = {
                    '--stage-stripe': c.border,
                    opacity: c.faded ? 0.7 : 1,
                    // Gentle staggered settle as rows arrive. Capped so a long
                    // list does not delay the last rows by seconds.
                    animationDelay: `${Math.min(rowIndex, 12) * 0.05}s`,
                  };
                  return (
                    <tr
                      key={p.id}
                      data-row-id={p.id}
                      data-active-row={isActive ? 'true' : undefined}
                      data-selected={selected.has(p.id) ? 'true' : undefined}
                      ref={(el) => (rowRefs.current[p.id] = el)}
                      className={`group ltb-rowin transition hover:bg-hover-wash-soft ${
                        highlighted ? 'ring-2 ring-rose ring-inset bg-rose-tint' : ''
                      }`}
                      style={rowStyle}
                    >
                      <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                        {/* The shift key is read off the click, not the change:
                            a native change event does not carry modifier keys,
                            so onChange alone would never see it. onChange stays
                            as a no-op because the box is controlled and React
                            warns about a checked input without one. */}
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name || p.business_name || p.email || 'this prospect'}`}
                          checked={selected.has(p.id)}
                          onChange={() => {}}
                          onClick={(e) => toggleSelect(p.id, e.shiftKey)}
                        />
                      </td>
                      <EditableCell
                        value={p.name}
                        onSave={(v) => updateProspect(p.id, { name: v })}
                        displayClassName="text-ink font-medium"
                        // The name IS the profile link — the first thing
                        // anyone clicks opens the drawer instead of an
                        // editor nobody expected. Renaming lives behind the
                        // hover pencil EditableCell shows for this mode.
                        onDisplayClick={() => setDrawerId(p.id)}
                        titleText={`Open ${p.name || p.business_name || 'this prospect'}'s profile`}
                        action={
                          <>
                            {/* The info dot stays visible at rest — it marks
                                which rows have notes, so hover-gating it would
                                erase the signal it exists to give. */}
                            {hasInfo && (
                              <button
                                onClick={(e) => {
                                  // The cell click opens the profile; this
                                  // one opens the notes instead.
                                  e.stopPropagation();
                                  setDrawerFocusNotes(true);
                                  setDrawerId(p.id);
                                }}
                                aria-label="View info"
                                title={p.info.length > 300 ? `${p.info.slice(0, 300)}…` : p.info}
                                className="shrink-0 ml-auto p-0.5 rounded-[5px] transition text-mauve-deep hover:opacity-80"
                              >
                                <Icon name="info" className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        }
                      />
                      {col('business_name') && (
                        <EditableCell
                          value={p.business_name}
                          onSave={(v) => updateProspect(p.id, { business_name: v })}
                          displayClassName="text-[12px] text-ink-2"
                        />
                      )}
                      {col('niche') && (
                        <EditableCell
                          value={p.niche}
                          onSave={(v) => updateProspect(p.id, { niche: v })}
                          displayClassName="text-[12px] text-ink-2"
                        />
                      )}
                      {col('email') && (
                        <EditableCell value={p.email} onSave={(v) => updateProspect(p.id, { email: v })} />
                      )}
                      {col('domain') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <DomainCell
                            value={p.domain}
                            onSave={(v) => updateProspect(p.id, { domain: v })}
                          />
                        </td>
                      )}
                      {col('country') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <CountryPicker
                            value={p.country}
                            options={countries}
                            onChange={(v) => updateProspect(p.id, { country: v })}
                          />
                        </td>
                      )}
                      {col('source') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <CellPicker
                            value={p.source || ''}
                            onChange={(v) => updateProspect(p.id, { source: v || null })}
                            width={180}
                            options={[{ value: '', label: '—' }, ...sources.map((sv) => ({ value: sv, label: sv }))]}
                          />
                        </td>
                      )}
                      {col('rating') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <RatingCell
                            value={p.rating}
                            options={ratings}
                            onChange={(v) => updateProspect(p.id, { rating: v })}
                          />
                        </td>
                      )}
                      {col('stage') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <StagePicker
                            value={stageKey}
                            stages={visibleStages}
                            onChange={(s) => handleStageChange(p, s)}
                          />
                        </td>
                      )}
                      {col('call_booked') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <YesNoCell
                            value={p.call_booked}
                            title="Have they booked a call?"
                            onChange={(v) => updateProspect(p.id, { call_booked: v })}
                          />
                        </td>
                      )}
                      {/* Body order MUST match COLUMNS order (call, proposal,
                          must-haves, rev score) — proposal_sent used to render
                          after revenue_score, putting every tracker cell under
                          the wrong header whenever all four were visible. */}
                      {col('proposal_sent') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <YesNoCell
                            value={p.proposal_sent}
                            title="Has a proposal been sent?"
                            onChange={(v) => updateProspect(p.id, { proposal_sent: v })}
                          />
                        </td>
                      )}
                      {col('must_haves') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <MustHavesCell
                            value={p.must_haves}
                            onChange={(v) => updateProspect(p.id, { must_haves: v })}
                          />
                        </td>
                      )}
                      {col('revenue_score') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <RevenueScoreCell
                            value={p.revenue_score}
                            onChange={(v) => updateProspect(p.id, { revenue_score: v })}
                          />
                        </td>
                      )}
                      {/* One column for one fact: "3d ago" colored by age,
                          exact date on hover, click opens the date editor.
                          The old Days column showed this same field as a bare
                          count one cell away. */}
                      {col('last_contact_date') && (() => {
                        const age = daysBetween(p.last_contact_date);
                        return (
                          <EditableCell
                            value={p.last_contact_date}
                            type="date"
                            display={age != null ? (
                              <span style={{ color: daysAgoColor(age) }} className="font-semibold num-tabular">
                                {age <= 0 ? 'today' : `${age}d ago`}
                              </span>
                            ) : null}
                            titleText={p.last_contact_date
                              ? `Last contact: ${p.last_contact_date}. Click to edit.`
                              : 'Never contacted. Click to set a date.'}
                            onSave={(v) => updateProspect(p.id, { last_contact_date: v || null })}
                          />
                        );
                      })()}
                      {/* The due cue lives HERE now, on the date that explains
                          it — not on a bell one column away. */}
                      {col('next_action_date') && (
                        <EditableCell
                          value={p.next_action_date}
                          type="date"
                          displayClassName={p.next_action_date && isDueProspect(p) ? 'text-rose-text font-semibold' : ''}
                          titleText={p.next_action_date && isDueProspect(p)
                            ? `Due now — next action was scheduled for ${p.next_action_date}`
                            : undefined}
                          onSave={(v) => updateProspect(p.id, { next_action_date: v || null })}
                        />
                      )}
                      {col('email_sequence') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <SeqCell prospect={p} onOpen={() => setSeqProspect(p)} />
                        </td>
                      )}
                      {col('video') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <VideoCell prospect={p} onOpenProfile={() => setDrawerId(p.id)} />
                        </td>
                      )}
                      {col('replied') && (
                        <td className="px-3 py-1.5 align-top border-b border-hairline text-ink-2">
                          <RepliedCell
                            prospect={p}
                            replyTypes={replyTypes}
                            onSet={(type) => updateProspect(p.id, replyPatch(p, type))}
                          />
                        </td>
                      )}
                      <td className="px-3 py-1.5 align-top text-right border-b border-hairline text-ink-2">
                        <button
                          onClick={() => requestDelete(p.id)}
                          disabled={isPending}
                          aria-label={`Move ${p.name || p.business_name || 'prospect'} to Trash`}
                          className={`hit-24 p-1 rounded-[6px] transition ${
                            isPending
                              ? 'opacity-60 text-muted'
                              : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted hover:text-poppy-text hover:bg-hover-wash-soft'
                          }`}
                          title="Move to Trash"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </div>
            )}
          </div>

          {/* Pager. Says which rows these are rather than only a page number,
              because "601 to 700 of 3,575" answers where you are and a bare
              "page 7" does not. Hidden entirely when the table is empty —
              the tbody's "No matches" message is the single voice then, not
              a second "No rows" plus a pointless rows-per-page select. */}
          {visibleProspects.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap px-1 pt-3">
            <span className="text-[12px] text-ink-3 num-tabular">
              {`${page * pageSize + 1}–${Math.min((page + 1) * pageSize, visibleProspects.length)} of ${visibleProspects.length}`}
            </span>

            <span className="flex items-center gap-1.5 ml-auto">
              <span className="text-[12px] text-ink-3">Rows</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
                className="text-[12px] px-2 py-1 rounded-lg border border-line bg-input-bg text-ink-2 outline-none focus:border-rose transition"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </span>

            {pageCount > 1 && (
              <span className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-[12px] font-medium px-2.5 py-1 rounded-lg border border-line-strong text-ink hover:border-rose hover:text-rose-text transition disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
                >
                  Back
                </button>
                <span className="text-[12px] text-ink-3 num-tabular">
                  {page + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="text-[12px] font-medium px-2.5 py-1 rounded-lg border border-line-strong text-ink hover:border-rose hover:text-rose-text transition disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
                >
                  Next
                </button>
              </span>
            )}
          </div>
          )}
        </>
      )}

      {selected.size > 0 && (
        // Every action in this bar is a bordered pill now. It used to carry
        // three different treatments at once: two dotted-underline text links,
        // three bordered dropdowns, and two bare words, one of which deleted
        // things. Nothing marked where a target began, and Delete sat next to
        // Clear with the same weight, which is a mis-click waiting to happen.
        // It also could not wrap, so selecting rows on a narrow window pushed
        // the bar off both edges.
        // Lifted clear of the mobile tab bar (GlassRail's md:hidden nav, which
        // is fixed to bottom-0 with its own safe-area padding). At bottom-6
        // this pill sat straight on top of it and covered Today, Prospects
        // and Leads while any row was selected.
        // w-max because a fixed element at left-1/2 gets its available width
        // from the containing block MINUS that offset, so this pill was being
        // laid out inside half the viewport and wrapping long before it had
        // to. The translate only moves it afterwards; it does not give the
        // width back.
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-max max-w-[calc(100vw-2rem)] bg-charcoal text-paper px-4 py-2.5 rounded-[22px] shadow-pill flex items-center justify-center gap-2 flex-wrap text-sm">
          <span className="text-[12px] font-medium text-paper/80 px-1">
            <span className="num-tabular text-paper">{selected.size}</span> selected
          </span>
          <span className="w-px h-4 bg-paper/25" />
          <button
            onClick={bulkRecordVideos}
            title="Records an audit video for each selected prospect that has a domain"
            className={BULK_BTN}
          >
            Record videos
          </button>
          <button
            onClick={bulkApplyTemplate}
            title="Fills the workspace email template into every selected prospect that has no emails yet"
            className={BULK_BTN}
          >
            Apply template
          </button>
          <span className="w-px h-4 bg-paper/25" />
          {/* Action menus: value stays empty, picking an option fires the bulk
              action. tone="dark" so the trigger fits the charcoal pill. */}
          <Select
            value=""
            onChange={(v) => { if (v) bulkRating(v === '__clear' ? null : v); }}
            options={[
              { value: '', label: 'Rating' },
              { value: '__clear', label: '— clear —' },
              // Stored values stay emoji (import/export + window.bloom
              // portability); only the menu wears the line icon + word.
              ...ratings.map((r) => {
                const rm = RATING_META[r] || {};
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
              }),
            ]}
            placeholder="Rating"
            ariaLabel="Change rating for selected"
            tone="dark"
            minWidth={0}
            buttonClassName="!rounded-full !px-3 !py-1 !text-xs"
          />
          <Select
            value=""
            onChange={(v) => { if (v) bulkStage(v); }}
            options={[{ value: '', label: 'Stage' }, ...stages.map((s) => ({ value: s, label: stageLabel(s) }))]}
            placeholder="Stage"
            ariaLabel="Change stage for selected"
            tone="dark"
            minWidth={0}
            buttonClassName="!rounded-full !px-3 !py-1 !text-xs"
          />
          <Select
            value=""
            onChange={(v) => { if (v) bulkCountry(v === '__clear' ? null : v); }}
            options={[
              { value: '', label: 'Country' },
              { value: '__clear', label: '— clear —' },
              ...countries.map((c) => ({ value: c, label: c })),
            ]}
            placeholder="Country"
            ariaLabel="Change country for selected"
            tone="dark"
            minWidth={0}
            buttonClassName="!rounded-full !px-3 !py-1 !text-xs"
          />
          <span className="w-px h-4 bg-paper/25" />
          <button
            onClick={() => setSelected(new Set())}
            title="Deselect everything. Nothing is changed."
            className={BULK_BTN}
          >
            Clear
          </button>
          {/* Last, and the only one that looks like it bites. It was bare red
              text beside an equally bare "Clear"; now it is the one pill in a
              different colour, and it is at the end rather than in the middle
              of the row. The confirm dialog behind it is unchanged. */}
          <button
            onClick={bulkDelete}
            title="Moves the selected prospects to Trash, where they stay for 30 days"
            className="text-[12px] font-medium px-3 py-1 rounded-full border transition"
            style={{
              color: 'var(--on-invert-danger)',
              backgroundColor: 'var(--on-invert-danger-bg)',
              borderColor: 'var(--on-invert-danger-border)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--on-invert-danger-hover-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--on-invert-danger-bg)'; }}
          >
            Move to Trash
          </button>
        </div>
      )}

      {seqProspect && (
        <EmailSequenceModal
          // Read the live row from the canonical store, not the snapshot taken
          // at click time — otherwise an edit saves but the modal keeps showing
          // the stale sequence.
          prospect={allProspects.find((p) => p.id === seqProspect.id) || seqProspect}
          // Re-pulled when the sequence is opened. The row came from a store
          // loaded when the page did, and the sweep moves stages while the tab
          // sits there: The Climbing Dietitian was shown Email 2 as next to
          // send when email 2 had already gone and Email 3 was next. Nothing
          // was wrong with the arithmetic, the stage it was reading was an hour
          // old. Which is worse than a wrong number, because it is a right
          // number about a moment that has passed.
          onOpened={refreshRef.current}
          onClose={() => setSeqProspect(null)}
          onSaveSequence={(sequence) =>
            updateProspect(seqProspect.id, { email_sequence: JSON.stringify(sequence) })
          }
        />
      )}

      <ImportPreview
        preview={importPreview}
        onCancel={() => {
          setImportPreview(null);
          setImportCsvText('');
        }}
        onConfirm={confirmImport}
      />
        </main>
      </div>
      <DialogHost />
      <ToastHost />
      {/* Cmd+K / Ctrl+K — jump to any prospect or view from anywhere. */}
      <CommandPalette
        prospects={allProspects}
        onOpenProspect={(p) => openProspectRow(p)}
        onNavigate={(v) => setView(v)}
      />
      {/* Outside the drawer on purpose. A render outlives the drawer that
          started it, so the thing watching for it cannot be inside. */}
      <RenderWatcher />
      {drawerProspect && (() => {
        // The list the drawer walks with ↑/↓: the table's current filtered
        // view when the row is in it, the whole store otherwise (e.g. opened
        // from Today with a table filter that excludes it).
        const walk = visibleProspects.some((x) => x.id === drawerProspect.id)
          ? visibleProspects
          : allProspects;
        const at = walk.findIndex((x) => x.id === drawerProspect.id);
        return (
        <ProspectDrawer
          prospect={drawerProspect}
          onChanged={() => loadAll()}
          position={at !== -1 ? { at: at + 1, of: walk.length } : null}
          onPrev={at > 0 ? () => setDrawerId(walk[at - 1].id) : null}
          onNext={at !== -1 && at < walk.length - 1 ? () => setDrawerId(walk[at + 1].id) : null}
          stages={visibleStages}
          ratings={ratings}
          ratingMeta={RATING_META}
          sources={sources}
          replyTypes={replyTypes}
          onPatch={(patch) => updateProspect(drawerProspect.id, patch)}
          onLogTouch={() =>
            updateProspect(drawerProspect.id, {
              last_contact_date: todayIso(),
              emails_sent: (drawerProspect.emails_sent || 0) + 1,
            })
          }
          onSetReply={(type) => updateProspect(drawerProspect.id, replyPatch(drawerProspect, type))}
          onShowInTable={() => {
            setDrawerId(null);
            openProspectRow(drawerProspect);
          }}
          onOpenSequence={() => setSeqProspect(drawerProspect)}
          // The card's one next step points at a place that already exists.
          // Closing first, because leaving the drawer open over the screen it
          // just sent somebody to is a dead end with a backdrop.
          onNavigate={(v) => { setDrawerId(null); setView(v); }}
          onSnooze={() =>
            updateProspect(drawerProspect.id, {
              next_action_date: isoShift(7),
              activity_log: appendEntry(drawerProspect.activity_log, 'note', 'Snoozed 7 days from the profile'),
            })
          }
          onClose={() => { setDrawerId(null); setDrawerFocusNotes(false); }}
          focusNotes={drawerFocusNotes}
        />
        );
      })()}
    </>
  );
}

/* ----- World clock ----- */

// Real-time digital clocks shown as a strip at the top. Times are derived
// per-tick from a single Date via Intl timezone formatting — no per-clock
// timers, just one interval.
const WORLD_CLOCKS = [
  { label: 'Toronto',     tz: 'America/Toronto' },
  { label: 'LA · PST',    tz: 'America/Los_Angeles' },
  { label: 'Florida',     tz: 'America/New_York' },
  { label: 'Sydney',      tz: 'Australia/Sydney' },
  { label: 'London',      tz: 'Europe/London' },
];

function WorldClockBar({ compact = false }) {
  // Start null so SSR and first client render match (no hydration mismatch);
  // fill in on mount, then tick every second.
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <div>
        {WORLD_CLOCKS.map((c) => {
          const time = now
            ? now.toLocaleTimeString('en-US', {
                timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: true,
              })
            : '––:––';
          return (
            <div
              key={c.tz}
              className="flex justify-between text-[10px] tracking-[0.1em] text-ink-2 py-0.5"
            >
              <span>{c.label}</span>
              <b className="font-medium">{time}</b>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {WORLD_CLOCKS.map((c) => {
        const time = now
          ? now.toLocaleTimeString('en-US', {
              timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: true,
            })
          : '––:––';
        return (
          <span
            key={c.tz}
            className="inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-full bg-panel border border-line-strong shadow-card px-2.5 py-1"
          >
            <span className="text-[10px] font-medium text-muted">
              {c.label}
            </span>
            <span className="text-[11px] num-tabular text-charcoal-2">
              {time}
            </span>
          </span>
        );
      })}
    </div>
  );
}
