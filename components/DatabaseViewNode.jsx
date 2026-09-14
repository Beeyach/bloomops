'use client';

import { useEffect, useMemo, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { DatabaseView } from '../lib/editor-extensions.mjs';
import { CLIENT_STAGES } from '../lib/client-profile.mjs';
import Select from './Select';
import { Icon } from './Icons';

import {Board,Calendar,Gallery,Table} from './DatabaseViewPresentation';
import { toast } from '../lib/toast.mjs';
// Live views of tables the workspace already owns, rendered inside a page.
//
// Rows are fetched here and never written into the document, so nothing about
// the pipeline can leak through pages.body to a public /p/<token> link. The
// node stores which view to draw; this component is the only thing that turns
// that into data, and it only runs for a signed-in session.

// Everything that differs between tables lives here, so the four views below
// are written once rather than once per source.
const SOURCES = {
  prospects: {
    label: 'Prospects',
    endpoint: '/api/prospects',
    rows: (d) => d.prospects || [],
    stages: (d) => d.stages || [],
    write: (id) => `/api/prospects/${id}`,
    title: (r) => r.business_name || r.name || r.email || 'Untitled',
    meta: (r) => r.country,
    badge: (r) => r.rating,
    dateField: 'next_action_date',
    dateLabel: 'next action date',
    columns: [
      ['Business', (r) => r.business_name || r.name || '—'],
      ['Stage', (r) => r.stage || 'New'],
      ['Country', (r) => r.country || '—'],
    ],
  },
  clients: {
    label: 'Clients',
    endpoint: '/api/clients',
    rows: (d) => d.clients || [],
    stages: () => CLIENT_STAGES,
    write: (id) => `/api/clients/${id}`,
    title: (r) => r.name || 'Untitled',
    meta: (r) => r.handle,
    badge: (r) => (r.monthly_rate ? `${r.monthly_rate}` : null),
    dateField: 'start_date',
    dateLabel: 'start date',
    columns: [
      ['Client', (r) => r.name || '—'],
      ['Stage', (r) => r.stage || '—'],
      ['Rate', (r) => (r.monthly_rate ? String(r.monthly_rate) : '—')],
    ],
  },
};

const VIEWS = [
  { id: 'board', label: 'Board' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'table', label: 'Table' },
];

// Sort keys are named per source so "Date" reads as the right thing on each
// table — next action on prospects, start date on clients.
function sortOptions(src) {
  return [
    { id: '', label: 'Default order' },
    { id: 'title:asc', label: 'Name A–Z' },
    { id: 'title:desc', label: 'Name Z–A' },
    { id: 'stage:asc', label: 'Stage' },
    { id: 'date:asc', label: `${src.dateLabel[0].toUpperCase()}${src.dateLabel.slice(1)}, soonest` },
    { id: 'date:desc', label: `${src.dateLabel[0].toUpperCase()}${src.dateLabel.slice(1)}, latest` },
  ];
}

function DatabaseViewComponent({ node, updateAttributes, selected, editor }) {
  const { view, source } = node.attrs;
  const src = SOURCES[source] || SOURCES.prospects;
  const [rows, setRows] = useState(null);
  const [stages, setStages] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // A malformed attribute must not take the block down — an unreadable filter
  // means "no filter", which shows more rather than silently hiding rows.
  const filter = useMemo(() => {
    try {
      const parsed = JSON.parse(node.attrs.filter || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, [node.attrs.filter]);

  const pickedStages = Array.isArray(filter.stage) ? filter.stage : [];

  // How this block is configured is part of the document, so every change goes
  // through here and asks for a save. Deferred by a tick because the attribute
  // lands via a ProseMirror transaction and getHTML has to see it.
  function configure(attrs) {
    updateAttributes(attrs);
    setTimeout(() => editor?.storage?.requestSave?.(), 0);
  }

  function toggleStage(stage) {
    const next = pickedStages.includes(stage)
      ? pickedStages.filter((s) => s !== stage)
      : [...pickedStages, stage];
    configure({ filter: next.length ? JSON.stringify({ ...filter, stage: next }) : '' });
  }

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError('');
    fetch(src.endpoint)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return;
        setRows(src.rows(d));
        setStages(src.stages(d));
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [src.endpoint]);

  // One write path for every view and every source. Dragging a card between
  // board columns and dropping one on a calendar day are the same operation
  // with a different field, so there is one place a write can go wrong — the
  // same reasoning the prospects table already documents.
  //
  // Optimistic, with the previous rows kept so a failed write rolls back
  // rather than leaving a card where the server disagrees with it.
  async function patch(id, fields, what) {
    const previous = rows;
    setBusyId(id);
    setRows((rs) => rs.map((r) => (String(r.id) === String(id) ? { ...r, ...fields } : r)));
    try {
      // PUT, not PATCH: both routes take a partial body and write only the
      // keys present, so this touches one field and nothing else.
      const res = await fetch(src.write(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setRows(previous);
      toast(`Couldn't ${what} that row. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => patch(id, fields, what) } });
    } finally {
      setBusyId(null);
    }
  }

  const move = (id, stage) => patch(id, { stage }, 'move');
  const reschedule = (id, date) => patch(id, { [src.dateField]: date }, 'reschedule');

  // Filter and sort are applied here, once, so every view below renders the
  // same slice. Rows with no date sort last in both directions — an empty date
  // is "not scheduled", not "the beginning of time".
  const visible = useMemo(() => {
    let out = rows || [];
    if (pickedStages.length) {
      out = out.filter((r) => pickedStages.includes(r.stage || stages[0]));
    }
    const [key, dir] = String(node.attrs.sort || '').split(':');
    if (key) {
      const sign = dir === 'desc' ? -1 : 1;
      const value = (r) =>
        key === 'title' ? src.title(r) : key === 'stage' ? r.stage || '' : r[src.dateField] || '';
      out = [...out].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        if (key === 'date') {
          if (!av && !bv) return 0;
          if (!av) return 1;
          if (!bv) return -1;
        }
        return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sign;
      });
    }
    return out;
  }, [rows, pickedStages, node.attrs.sort, src, stages]);

  const hiddenCount = (rows?.length || 0) - visible.length;

  return (
    <NodeViewWrapper className={`ltb-dbview${selected ? ' is-selected' : ''}`} data-view={view}>
      <div className="ltb-dbview-head" contentEditable={false}>
        <Icon name="table" className="w-3.5 h-3.5" />
        <div className="ltb-dbview-tabs">
          {Object.entries(SOURCES).map(([id, s]) => (
            <button
              key={id}
              type="button"
              onClick={() => configure({ source: id })}
              className={id === source ? 'is-on' : ''}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ltb-dbview-tabs ltb-dbview-viewtabs">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => configure({ view: v.id })}
              className={v.id === view ? 'is-on' : ''}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter and sort belong to this block, not the page, so two views of
          the same table can sit side by side showing different slices. */}
      <div className="ltb-dbview-bar" contentEditable={false}>
        <div className="ltb-dbview-filterwrap">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={pickedStages.length ? 'is-on' : ''}
          >
            {pickedStages.length ? `Stage: ${pickedStages.length}` : 'Filter'}
          </button>
          {filterOpen && (
            <div className="ltb-dbview-filtermenu">
              {stages.map((s) => (
                <button key={s} type="button" onClick={() => toggleStage(s)}>
                  <span className="ltb-dbview-check">{pickedStages.includes(s) ? '✓' : ''}</span>
                  {s}
                </button>
              ))}
              {pickedStages.length > 0 && (
                <button
                  type="button"
                  className="ltb-dbview-clear"
                  onClick={() => { configure({ filter: '' }); setFilterOpen(false); }}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        <Select
          value={node.attrs.sort || ''}
          onChange={(v) => configure({ sort: v })}
          options={sortOptions(src).map((o) => ({ value: o.id, label: o.label }))}
          ariaLabel="Sort"
          minWidth={150}
          buttonClassName="!py-1 !text-[12px]"
        />

        {hiddenCount > 0 && (
          <span className="ltb-dbview-hidden">{hiddenCount} hidden by filter</span>
        )}
      </div>

      <div contentEditable={false}>
        {error && <div className="ltb-dbview-msg">Couldn’t load {src.label.toLowerCase()}. {error}</div>}
        {!error && rows === null && <div className="ltb-dbview-msg">Loading…</div>}
        {!error && rows?.length === 0 && (
          <div className="ltb-dbview-msg">
            No {src.label.toLowerCase()} yet. Add one in the {src.label} tab and it shows up here.
          </div>
        )}
        {/* Rows exist but the filter hides all of them — say so, rather than
            showing the "nothing here yet" message and implying an empty table. */}
        {!error && rows?.length > 0 && visible.length === 0 && (
          <div className="ltb-dbview-msg">
            Every row is hidden by this block’s filter.{' '}
            <button type="button" className="ltb-dbview-inline" onClick={() => configure({ filter: '' })}>
              Clear it
            </button>
          </div>
        )}
        {!error && visible.length > 0 && view === 'board' && (
          <Board rows={visible} stages={stages} src={src} onMove={move} busyId={busyId} />
        )}
        {!error && visible.length > 0 && view === 'calendar' && (
          <Calendar rows={visible} src={src} onReschedule={reschedule} busyId={busyId} />
        )}
        {!error && visible.length > 0 && view === 'gallery' && <Gallery rows={visible} src={src} />}
        {!error && visible.length > 0 && view === 'table' && <Table rows={visible} src={src} />}
      </div>
    </NodeViewWrapper>
  );
}

export const DatabaseViewWithView = DatabaseView.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseViewComponent);
  },
});
