'use client';

// A wait that nobody wrote a date for, and the three ways out of it.
//
// Three prospects in production said "later" and nothing recorded when later
// was. They are not due today and they will not be due tomorrow, so they sit on
// Today for ever — visible, which is right, and unresolvable from the screen
// they are visible on, which is not.
//
// The three actions are deliberately unequal.
//
//   Set a date        the answer almost every one of these wants
//   Reply now         opens the conversation; writes nothing at all
//   Not interested    the least destructive truthful state, and NOT a close
//
// There is no one-click "no follow-up" here on purpose. "No follow-up" is
// ambiguous between "not this particular offer" and "never contact them again",
// and those are a live relationship and a closed one. The soft one is a button;
// the hard one stays in the correction menu on the prospect's own page, where
// it comes with an explanation. Silently turning "later" into a rejection is
// exactly the bug this whole model was built to end.

import { useState } from 'react';
import { REL } from '@/lib/relationship.mjs';
import { toast } from '@/lib/toast.mjs';
import { Icon } from './Icons';

// Chapter 12: the semantic type scale and radii, like everything else. These
// were the last raw pixel sizes on a daily surface.
// Deliberately NOT the filled primary button. This appears once per unresolved
// wait, so a list with three of them had three solid accent blocks down it and
// nothing on the screen looked more important than anything else. It keeps the
// accent and the calendar glyph, which is enough to read as the main move.
const btn = 'ui-small font-semibold px-2.5 py-1 r-sm border border-rose-line bg-rose-tint text-rose-text hover:bg-rose hover:text-white transition disabled:opacity-60';
const quiet = 'ui-small font-medium px-2.5 py-1 r-sm border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-60';

const nice = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

export default function DeferralResolver({ prospectId, onReply, onResolved, compact = false }) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(body, said) {
    setBusy(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error || 'That did not go through.', { tone: 'error' });
        return;
      }
      toast(said, { tone: 'success' });
      setPicking(false);
      setDate('');
      onResolved && onResolved(json.patch || null);
    } catch {
      toast('That did not go through.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const setDateNow = () => {
    if (!date) return;
    send(
      { state: REL.DEFERRED, deferUntil: date, note: `You set the follow-up date to ${date}.` },
      `Coming back on ${nice(date)}.`
    );
  };

  const notThisOffer = () => send(
    { state: REL.NO_TO_THIS_OFFER, note: 'You closed the open wait: not this offer.' },
    'Filed as not this offer. They stay in Replied.'
  );

  return (
    <div className={compact ? '' : 'mt-2'}>
      <p className="ui-small text-ink-2 leading-snug">
        They asked for later, and no date was recorded.
      </p>

      {picking ? (
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <label className="sr-only" htmlFor={`defer-${prospectId}`}>Follow-up date</label>
          <input
            id={`defer-${prospectId}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent border border-line r-sm px-2 py-1 ui-small text-ink focus:outline-none focus:border-rose transition"
          />
          <button type="button" onClick={setDateNow} disabled={!date || busy} className={btn}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setPicking(false); setDate(''); }} disabled={busy} className={quiet}>
            Cancel
          </button>
          {date ? (
            <span className="ui-small text-ink-2">Come back {nice(date)}</span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
          <button type="button" onClick={() => setPicking(true)} disabled={busy} className={btn}>
            <Icon name="calendar-check" className="w-3.5 h-3.5 inline-block mr-1 -mt-px" />
            Set a date
          </button>
          {onReply ? (
            <button type="button" onClick={onReply} disabled={busy} className={quiet}>
              Reply now
            </button>
          ) : null}
          <button
            type="button"
            onClick={notThisOffer}
            disabled={busy}
            title="Files this as: they turned down this particular offer. The relationship stays open and they stay in Replied."
            className={quiet}
          >
            Not interested
          </button>
        </div>
      )}

      {/* What stood here: "To close the relationship entirely, open them and
          use the correction menu under Conversation. It is deliberately not a
          button here." That is the reasoning behind a design decision, shown
          to the person using the app, once per row — two of them on one
          screen in the shipped build. The reasoning belongs in the comment at
          the top of this file, where it now lives alone. Somebody who wants
          to close a relationship opens the prospect, which is where the
          control is and where it comes with its explanation. */}
    </div>
  );
}
