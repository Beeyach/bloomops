'use client';
import {useState} from 'react';

// Local date parts, not toISOString: these are plain calendar days, and
// converting through UTC shifts them a day for anyone west of Greenwich —
// which is everyone this workspace sells to.
function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Whole weeks covering the month, so the grid never shows a ragged first row.
function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function Board({ rows, stages, src, onMove, busyId }) {
  // Only stages holding something, so an empty table is not fifteen empty
  // columns you have to scroll past.
  const used = stages.filter((s) => rows.some((r) => (r.stage || stages[0]) === s));
  const columns = used.length ? used : stages.slice(0, 4);

  return (
    <div className="ltb-dbview-board">
      {columns.map((stage) => {
        const items = rows.filter((r) => (r.stage || stages[0]) === stage);
        return (
          <div
            key={stage}
            className="ltb-dbview-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              if (id && onMove) onMove(id, stage);
            }}
          >
            <div className="ltb-dbview-colhead">
              <span>{stage}</span>
              <span className="ltb-dbview-count">{items.length}</span>
            </div>
            {items.map((r) => (
              <div
                key={r.id}
                draggable={Boolean(onMove)}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(r.id))}
                className={`ltb-dbview-card${busyId === r.id ? ' is-busy' : ''}`}
              >
                <div className="ltb-dbview-cardtitle">{src.title(r)}</div>
                {src.meta(r) && <div className="ltb-dbview-cardmeta">{src.meta(r)}</div>}
              </div>
            ))}
            {items.length === 0 && <div className="ltb-dbview-empty">{onMove ? 'Drop here' : 'No actions'}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function Calendar({ rows, src, onReschedule, busyId }) {
  const now = new Date();
  const [offset, setOffset] = useState(0);
  const shown = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const cells = monthCells(year, month);
  const today = ymd(now);

  // Only rows carrying a date land on the grid; the rest are counted
  // underneath so they are not silently invisible.
  const dated = rows.filter((r) => r[src.dateField]);
  const undated = rows.length - dated.length;

  return (
    <div className="ltb-dbview-cal">
      <div className="ltb-dbview-calhead">
        <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">‹</button>
        <span>{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label="Next month">›</button>
        {offset !== 0 && (
          <button type="button" className="ltb-dbview-today" onClick={() => setOffset(0)}>Today</button>
        )}
      </div>
      <div className="ltb-dbview-calgrid">
        {DAY_NAMES.map((d) => <div key={d} className="ltb-dbview-dayname">{d}</div>)}
        {cells.map((d) => {
          const key = ymd(d);
          const items = dated.filter((r) => String(r[src.dateField]).slice(0, 10) === key);
          return (
            <div
              key={key}
              className={
                'ltb-dbview-day' +
                (d.getMonth() !== month ? ' is-outside' : '') +
                (key === today ? ' is-today' : '')
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id && onReschedule) onReschedule(id, key);
              }}
            >
              <div className="ltb-dbview-daynum">{d.getDate()}</div>
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable={Boolean(onReschedule)}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(r.id))}
                  className={`ltb-dbview-pill${busyId === r.id ? ' is-busy' : ''}`}
                  title={src.textTitle ? src.textTitle(r) : `${src.title(r)} · ${r.stage || ''}`}
                >
                  {src.title(r)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {src.mobileAgenda && <div className="bo-work-view-agenda">
        {cells.filter(d => d.getMonth() === month).map(d => {
          const day = ymd(d), items = dated.filter(row => row[src.dateField] === day);
          return items.length ? <section key={day}><h3>{d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'})}</h3>{items.map(row => <div key={row.id}>{src.title(row)}{src.statusLabel?.(row)}</div>)}</section> : null;
        })}
        {!dated.some(row => String(row[src.dateField]).slice(0,7) === ymd(shown).slice(0,7)) && <p>No actions scheduled this month.</p>}
      </div>}
      {undated > 0 && (
        <div className="ltb-dbview-more">
          {undated} {undated === 1 ? 'row has' : 'rows have'} no {src.dateLabel}, so {undated === 1 ? 'it is' : 'they are'} not on this calendar.
        </div>
      )}
    </div>
  );
}

export function Gallery({ rows, src }) {
  return (
    <div className="ltb-dbview-gallery">
      {rows.slice(0, 60).map((r) => (
        <div key={r.id} className="ltb-dbview-tile">
          <div className="ltb-dbview-tiletop">
            <span className="ltb-dbview-cardtitle">{src.title(r)}</span>
            {src.badge(r) && <span className="ltb-dbview-rating">{src.badge(r)}</span>}
          </div>
          <div className="ltb-dbview-cardmeta">{src.statusLabel ? src.statusLabel(r) : r.stage || '—'}</div>
          {src.meta(r) && <div className="ltb-dbview-cardmeta">{src.meta(r)}</div>}
        </div>
      ))}
      {rows.length > 60 && <div className="ltb-dbview-more">Showing the first 60 of {rows.length}.</div>}
    </div>
  );
}

export function Table({ rows, src }) {
  return (
    <div className="ltb-dbview-table">
      <table>
        <thead>
          <tr>{src.columns.map(([h]) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r) => (
            <tr key={r.id}>
              {src.columns.map(([h, get]) => <td key={h}>{get(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && <div className="ltb-dbview-more">Showing the first 50 of {rows.length}.</div>}
    </div>
  );
}

