'use client';

// Follow-ups, in two halves, because they are two different questions.
//
// Due now is work: the day has arrived and nothing will go out unless somebody
// makes it go out. Coming up is not work at all — it is the next week, and
// thirty-two rows of "due Thursday" on the page somebody opens to decide what
// to do this morning is thirty-two rows of noise. So the first half lists, the
// second half counts and shows the three nearest.
//
// Every date here is arithmetic on recorded sends. Opening this page makes no
// model call and writes nothing; Preview asks for one draft, for one person,
// and saves none of it.

import { useState } from 'react';
import { UPCOMING_DAYS } from '@/lib/followup-schedule.mjs';
import { DUE_LIMIT, UPCOMING_PREVIEW } from '@/lib/today-sections.mjs';
import ProspectListRow from './ProspectListRow';
import { Icon } from './Icons';
import Section from './TodaySection';

function ListGroup({ children }) {
  return <div className="border border-line-strong r-lg bg-panel shadow-card overflow-hidden">{children}</div>;
}


// Chapter 9 put this inside one of Today's tab panels, which is already a
// group card with a header and a blurb. `bare` drops the second card so the
// page does not draw a box inside a box, and drops the blurb so the same
// sentence is not printed twice on one screen.
function Bare({ children }) { return <div className="space-y-4">{children}</div>; }

export default function Followups({ due, upcoming, onOpen, onViewAll, ratingMeta, upcomingCountOnly = false, bare = false,}) {
  const [previews, setPreviews] = useState({});
  const [busyId, setBusyId] = useState(null);

  if (!due?.total && !upcoming?.total) return null;

  async function preview(prospect, step) {
    setBusyId(prospect.id);
    try {
      const res = await fetch('/api/followup-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id, step }),
      });
      const json = await res.json();
      setPreviews((prev) => ({
        ...prev,
        [prospect.id]: res.ok && json?.ok
          ? { subject: json.subject, body: json.body }
          : { error: json?.error || 'That draft could not be written.' },
      }));
    } catch {
      setPreviews((prev) => ({ ...prev, [prospect.id]: { error: 'That draft could not be written.' } }));
    } finally {
      setBusyId(null);
    }
  }

  const Wrap = bare ? Bare : Section;

  return (
    // Chapter 8: the same group card as every other section on Today. The
    // blurb is said once, at the top, in the only wording that is currently
    // true. Not "queued", not "sends itself", not "ready to auto-send".
    <Wrap
      icon="send"
      title="Follow-ups"
      blurb="Nothing sends automatically while follow-up automation is off."
    >

      {due?.total > 0 && (
        <>
          <div className="ui-body font-semibold text-ink-2 mb-1.5">
            Due now ({due.total.toLocaleString()})
          </div>
          <ListGroup>
            {due.rows.map(({ prospect, state }) => (
              <div key={prospect.id}>
                <ProspectListRow
                  prospect={prospect}
                  state={state}
                  ratingMeta={ratingMeta}
                  onOpen={onOpen}
                  actions={
                    <button
                      type="button"
                      onClick={() => preview(prospect, state.schedule?.step)}
                      disabled={busyId === prospect.id}
                      title="Writes one draft so you can read it. Nothing is saved and nothing is sent."
                      className="ui-small font-medium px-2.5 py-1.5 r-md border border-line-strong bg-panel text-ink hover:bg-hover-wash-soft transition ui-control"
                    >
                      {busyId === prospect.id ? 'Writing…' : previews[prospect.id] ? 'Write again' : 'Preview'}
                    </button>
                  }
                />
                {previews[prospect.id] && (
                  <div className="mx-4 mb-3 -mt-1 r-md border border-line bg-hover-wash-soft p-3">
                    <div className="ui-meta font-semibold text-ink-2 mb-1">
                      Preview only. This has not been saved or sent.
                    </div>
                    {previews[prospect.id].error ? (
                      <div className="ui-body text-poppy-text">{previews[prospect.id].error}</div>
                    ) : (
                      <>
                        <div className="ui-body font-semibold text-ink">{previews[prospect.id].subject}</div>
                        <div className="ui-body text-ink whitespace-pre-wrap mt-1">{previews[prospect.id].body}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </ListGroup>
          {due.hidden > 0 && (
            <button
              type="button"
              onClick={() => onViewAll && onViewAll()}
              className="mt-2 ui-small font-medium text-ink-2 underline decoration-dotted underline-offset-2 hover:text-rose-text transition"
            >
              View all {due.total.toLocaleString()} due
            </button>
          )}
        </>
      )}

      {upcoming?.total > 0 && upcomingCountOnly && (
        // Today's version: next week's machine-scheduled work is a number,
        // not rows. Nobody decides anything about it this morning.
        <p className={`ui-body text-ink-2 ${due?.total > 0 ? 'mt-4' : ''}`}>
          {upcoming.total.toLocaleString()} coming up in the next {upcoming.withinDays || UPCOMING_DAYS} days.{' '}
          <button
            type="button"
            onClick={() => onViewAll && onViewAll()}
            className="font-medium underline decoration-dotted underline-offset-2 hover:text-rose-text transition"
          >
            View them in Prospects
          </button>
        </p>
      )}

      {upcoming?.total > 0 && !upcomingCountOnly && (
        <div className={due?.total > 0 ? 'mt-5' : ''}>
          <div className="ui-body font-semibold text-ink-2 mb-1.5">
            {upcoming.total.toLocaleString()} coming up in the next {upcoming.withinDays || UPCOMING_DAYS} days
          </div>
          <ListGroup>
            {upcoming.rows.map(({ prospect, state }) => (
              <ProspectListRow
                key={prospect.id}
                prospect={prospect}
                state={state}
                ratingMeta={ratingMeta}
                onOpen={onOpen}
              />
            ))}
          </ListGroup>
          {upcoming.hidden > 0 && (
            <button
              type="button"
              onClick={() => onViewAll && onViewAll()}
              className="mt-2 ui-small font-medium text-ink-2 underline decoration-dotted underline-offset-2 hover:text-rose-text transition"
            >
              View all {upcoming.total.toLocaleString()} coming up
            </button>
          )}
        </div>
      )}
    </Wrap>
  );
}

export { DUE_LIMIT, UPCOMING_PREVIEW };
