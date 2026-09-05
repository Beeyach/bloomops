'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { toast } from '@/lib/toast.mjs';

// Connecting the mailbox, and saying honestly what that lets the app do.
//
// The consent screen Google shows says "read your email", which is true and
// frightening and says nothing about why. This says why, and says the limits.
//
// Two scopes now: read, and send. `gmail.send` can send and cannot read, so the
// pair is still narrower than the single `gmail.modify` that would cover both.
// Saying so plainly matters more now than when there was one: an app that can
// email your prospects should not be vague about it. A test fails if a third
// scope is ever requested.

const ago = (iso) => {
  const h = (Date.now() - Date.parse(iso)) / 3600000;
  if (!Number.isFinite(h)) return 'a while ago';
  if (h < 1) { const m = Math.max(1, Math.round(h * 60)); return `${m} minute${m === 1 ? '' : 's'} ago`; }
  if (h < 24) { const n = Math.round(h); return `${n} hour${n === 1 ? '' : 's'} ago`; }
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

export default function GmailCard() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/gmail/status')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d && setState(d))
    .catch(() => {});

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await (await fetch('/api/gmail/connect')).json();
      if (r.url) { window.location.href = r.url; return; }
      toast(r.error || 'Gmail is not set up on this deployment yet.', { tone: 'error' });
    } catch {
      toast('Could not start the Gmail connection.', { tone: 'error' });
    }
    setBusy(false);
  };

  const act = async (action) => {
    setBusy(true);
    try {
      const r = await (await fetch('/api/gmail/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })).json();
      if (r.error) toast(r.error, { tone: 'error' });
      else toast(action === 'disconnect' ? 'Gmail disconnected' : 'Listening again', { tone: 'success' });
      await load();
    } catch {
      toast('That did not work.', { tone: 'error' });
    }
    setBusy(false);
  };

  if (!state) return null;
  const box = state.mailboxes?.[0] || null;
  const connected = box?.connected;

  return (
    <div className="pt-1 border-t border-line">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon name="mail" className="w-4 h-4 text-ink-2" />
        <h3 className="font-semibold text-ink">Gmail</h3>
      </div>

      {!box && (
        <>
          <p className="text-[12px] text-ink-3 mb-2 max-w-[62ch]">
            Connect the inbox you send from and replies show up here on their own, within
            a minute or two, without you opening anything. It is also what stops a
            follow-up going out on top of somebody who already wrote back.
          </p>
          <p className="text-[12px] text-ink-3 mb-2 max-w-[62ch]">
            Leads That Bloom asks to <strong>read</strong> this mailbox, and to
            <strong> send</strong> from it. Sending stays switched off until you turn it
            on below, and even then it only sends emails you approved yourself. It
            cannot change or delete anything, and it only ever opens messages in a
            conversation with one of your prospects.
          </p>
          {state.configured ? (
            <button onClick={connect} disabled={busy}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition disabled:opacity-60">
              Connect Gmail
            </button>
          ) : (
            <p className="text-[12px] text-poppy-text">
              Not set up on this deployment yet. GMAIL-INTEGRATION.md has the five minutes of setup it needs.
            </p>
          )}
        </>
      )}

      {box && (
        <>
          <p className={`text-[13px] font-semibold ${connected ? 'text-leaf-text' : 'text-poppy-text'}`}>
            {connected ? `Connected: ${box.emailAddress}` : 'Gmail needs reconnecting'}
          </p>
          <p className="text-[12px] text-ink-3 mt-0.5">
            {box.lastSyncAt ? `Last read ${ago(box.lastSyncAt)}.` : 'Not read yet.'}
            {box.watchHoursLeft != null && connected
              ? ` Listening for another ${Math.max(0, box.watchHoursLeft)} hours, renewed automatically.`
              : ''}
          </p>
          {box.lastError && <p className="text-[12px] text-poppy-text mt-1">{box.lastError}</p>}
          <div className="flex gap-2 mt-2 flex-wrap">
            {connected ? (
              <button onClick={() => act('renew')} disabled={busy}
                className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-60">
                Check it is listening
              </button>
            ) : (
              <button onClick={connect} disabled={busy}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] btn-bloom transition disabled:opacity-60">
                Reconnect Gmail
              </button>
            )}
            <button onClick={() => act('disconnect')} disabled={busy}
              className="text-[12px] font-medium px-2.5 py-1.5 rounded-[8px] border border-line-strong text-ink-3 hover:text-ink transition disabled:opacity-60"
              title="Stops the app reading this mailbox and forgets the authorisation">
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
