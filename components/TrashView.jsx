'use client';

import { useEffect, useState } from 'react';
import { confirmDialog } from '../lib/dialog.mjs';
import { Icon, IconTile } from './Icons';

import { toast } from '../lib/toast.mjs';
// The Trash: soft-deleted pages and prospects, restorable, auto-purged after
// 30 days. onChanged lets the parent refresh its page/prospect lists when
// something is restored (so it reappears in the sidebar / table).
export default function TrashView({ onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const d = await (await fetch('/api/trash')).json();
      setData(d);
    } catch {
      setData({ pages: [], prospects: [], purgeDays: 30 });
    }
  }
  useEffect(() => { load(); }, []);

  // Restore / delete-forever / empty all run through here. A failure has to be
  // said out loud: silently reloading the list makes a failed restore look like
  // the item was purged, and a failed purge look like it was deleted.
  async function act(method, kind, id) {
    setBusy(true);
    try {
      const res = await fetch('/api/trash', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind ? { kind, id } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await load();
      if (onChanged) onChanged();
    } catch (e) {
      toast(`${method === 'PUT' ? "Couldn't restore that." : "Couldn't delete that."} ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => act(method, kind, id) } });
    } finally {
      setBusy(false);
    }
  }

  async function purgeOne(kind, label) {
    return confirmDialog({ title: 'Delete forever', message: `Permanently delete "${label}"? This can't be undone.` });
  }

  if (!data) {
    return (
      <div className="canvas-work mt-4 space-y-2" aria-hidden="true">
        <div className="skeleton h-8 w-40 mb-4" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-2/3" />
      </div>
    );
  }

  // Prospects render a flower stroke; pages keep their user-chosen emoji
  // (that's their data) and only fall back to the file icon when unset.
  const items = [
    ...data.prospects.map((p) => ({ kind: 'prospect', id: p.id, emoji: null, label: p.business_name || p.name || p.email || 'Unnamed prospect', sub: p.stage, deleted_at: p.deleted_at })),
    ...data.pages.map((p) => ({ kind: 'page', id: p.id, emoji: p.emoji || null, label: p.title || 'Untitled', sub: 'page', deleted_at: p.deleted_at })),
  ];

  return (
    <div className="canvas-work">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-1">
        <h1 className="font-serif text-[34px] text-bright leading-tight">Trash</h1>
        {items.length > 0 && (
          <button
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ title: 'Empty trash', message: `Permanently delete all ${items.length} item${items.length === 1 ? '' : 's'}? This can't be undone.` })) {
                act('DELETE', null, null);
              }
            }}
            className="text-[13px] font-medium px-4 py-2.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-50"
          >
            Empty trash
          </button>
        )}
      </div>
      <p className="text-ink-2 mb-4">
        Deleted pages and prospects rest here. Restore them anytime, or they clear themselves after {data.purgeDays} days.
      </p>

      {items.length === 0 ? (
        <div className="glass-panel border-dashed p-10 text-center rise-in">
          <div className="flex justify-center mb-3">
            <IconTile name="trash" tone="rose" size={44} />
          </div>
          <p className="text-bright font-semibold text-[15px]">Trash is empty</p>
          <p className="text-ink-2 text-sm mt-1">Anything you delete lands here first, so nothing is lost by accident.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <div key={`${it.kind}-${it.id}`} className="glass-panel px-4 py-3 flex items-center gap-3">
              <span className="text-[16px] shrink-0 inline-flex items-center justify-center w-5" aria-hidden="true">
                {it.emoji ? it.emoji : (
                  <span className={it.kind === 'prospect' ? 'text-rose-text' : 'text-ink-3'}>
                    <Icon name={it.kind === 'prospect' ? 'flower' : 'file'} className="w-4 h-4" strokeWidth={1.8} />
                  </span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-ink truncate">{it.label}</div>
                <div className="text-[12px] text-ink-3">{it.sub}{it.deleted_at ? ` · deleted ${it.deleted_at.slice(0, 10)}` : ''}</div>
              </div>
              <button
                disabled={busy}
                onClick={() => act('PUT', it.kind, it.id)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-[8px] bg-rose-tint text-rose-text border border-rose-line hover:bg-rose hover:text-white transition disabled:opacity-50"
              >
                <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
                Restore
              </button>
              <button
                disabled={busy}
                onClick={async () => { if (await purgeOne(it.kind, it.label)) act('DELETE', it.kind, it.id); }}
                className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-line text-ink-3 hover:text-poppy-text hover:border-poppy transition disabled:opacity-50"
              >
                Delete forever
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
