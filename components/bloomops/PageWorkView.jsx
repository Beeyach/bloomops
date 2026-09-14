'use client';
import {useEffect, useId, useState} from 'react';
import {Board, Calendar, Gallery, Table} from '../DatabaseViewPresentation';
import {Icon} from './Icons';
import {ACTION_STATUSES, ACTION_STATUS_LABELS} from '../../lib/bloomops/action-values.mjs';
import {PAGE_WORK_LAYOUTS, pageWorkConfiguration} from '../../lib/bloomops/page-work-values.mjs';

const layoutIcons = {table: 'table', board: 'work', calendar: 'calendar', gallery: 'overview'};
const labels = {table: 'Table', board: 'Board', calendar: 'Calendar', gallery: 'Gallery'};
const status = row => <span className={'bo-work-view-status is-' + row.status}>{ACTION_STATUS_LABELS[row.status]}</span>;
const title = row => <a href={'/work/actions/' + encodeURIComponent(row.id)}>{row.title}</a>;
const source = {
  mobileAgenda: true, statusLabel: status, title, textTitle: row => row.title, meta: row => row.assigneeName || 'Unassigned', badge: () => null,
  dateField: 'dueDate', dateLabel: 'due date',
  columns: [['Action', title], ['Status', status], ['Due', row => row.dueDate || 'No date'], ['Assignee', row => row.assigneeName || 'Unassigned']],
};

export default function PageWorkView({pageId, workspaceId, attrs, canReadWork, onConfigure}) {
  const config = pageWorkConfiguration(attrs), filterId = useId();
  const [temporary, setTemporary] = useState(null), [page, setPage] = useState(1);
  const [enabled, setEnabled] = useState(false), [refresh, setRefresh] = useState(0), [state, setState] = useState({});
  const view = temporary?.view ?? config?.view, filter = temporary?.filter ?? config?.filter;
  useEffect(() => {
    if (!enabled || !canReadWork || !config) return;
    const controller = new AbortController();
    setState({loading: true});
    const query = new URLSearchParams({workspaceId, status: filter, page: String(page)});
    fetch(`/api/bloomops/pages/${encodeURIComponent(pageId)}/work?${query}`, {signal: controller.signal, cache: 'no-store'})
      .then(async response => {
        if (response.status === 404 || response.status === 403) return {unavailable: true};
        if (!response.ok) throw new Error('load');
        const data = await response.json();
        if (!data.ok || !Array.isArray(data.items)) throw new Error('load');
        return {data};
      }).then(result => {if (!controller.signal.aborted) setState(result);})
      .catch(() => {if (!controller.signal.aborted) setState({error: true});});
    return () => controller.abort();
  }, [enabled, canReadWork, Boolean(config), workspaceId, pageId, filter, page, refresh]);

  if (!config || !canReadWork) return <div className="bo-work-view-unavailable"><Icon name="lock" size={16}/><span>Work view unavailable.</span></div>;
  const configure = patch => {
    if ('filter' in patch) setPage(1);
    if (onConfigure) onConfigure({...config, ...patch});
    else setTemporary(current => ({view, filter, ...current, ...patch}));
  };
  const rows = (state.data?.items || []).map(row => ({...row, stage: ACTION_STATUS_LABELS[row.status]}));
  return <section className="bo-work-view" aria-label="Linked Work view" contentEditable={false}>
    <div className="bo-work-view-heading"><Icon name="work" size={18}/><strong>Work</strong><span>Linked view</span></div>
    <div className="bo-work-view-controls">
      <div className="bo-work-view-layouts" role="group" aria-label="Work layout">
        {PAGE_WORK_LAYOUTS.map(layout => <button type="button" key={layout} aria-pressed={view === layout} onClick={() => configure({view: layout})}><Icon name={layoutIcons[layout]} size={16}/>{labels[layout]}</button>)}
      </div>
      <div className="bo-work-view-filter"><label htmlFor={filterId}>Status</label><select id={filterId} value={filter} onChange={event => configure({filter: event.target.value})}><option value="">All statuses</option>{ACTION_STATUSES.map(value => <option key={value} value={value}>{ACTION_STATUS_LABELS[value]}</option>)}</select></div>
      {enabled && <button type="button" aria-label="Refresh Work view" onClick={() => setRefresh(n => n + 1)} disabled={state.loading}><Icon name="refresh" size={16}/></button>}
    </div>
    {!enabled && <button type="button" className="bo-work-view-load" onClick={() => setEnabled(true)}>Show Work</button>}
    {enabled && <div aria-live="polite">
      {state.loading && <p role="status">Loading Work…</p>}
      {state.error && <p role="alert">Couldn’t load Work. <button type="button" onClick={() => setRefresh(n => n + 1)}>Try again</button></p>}
      {state.unavailable && <p>Work view unavailable.</p>}
      {state.data && <>
        {!rows.length && <p>No actions on this result page.</p>}
        {rows.length > 0 && view === 'table' && <Table rows={rows} src={source}/>}
        {rows.length > 0 && view === 'board' && <Board rows={rows} stages={Object.values(ACTION_STATUS_LABELS)} src={source}/>}
        {rows.length > 0 && view === 'calendar' && <Calendar rows={rows} src={source}/>}
        {rows.length > 0 && view === 'gallery' && <Gallery rows={rows} src={source}/>}
        <div className="bo-work-view-pagination"><span>Showing {rows.length} actions on page {page}</span><button type="button" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><button type="button" disabled={!state.data.hasMore} onClick={() => setPage(n => n + 1)}>Next</button></div>
        {view === 'calendar' && <p className="bo-work-view-note">Calendar dates and counts cover this result page. Use Table to see every returned action.</p>}
      </>}
    </div>}
  </section>;
}
