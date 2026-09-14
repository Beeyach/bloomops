'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { promptDialog } from '../lib/dialog.mjs';
import { matchEmbed, isFacebookShare } from '../lib/embeds.mjs';
import { Icon } from './Icons';

import { toast } from '../lib/toast.mjs';
// The menu behind the + on a block handle. Everything here inserts AT a
// position rather than transforming the current selection, which is what makes
// "add below" and alt-click "add above" possible from a block you are not
// standing in.
//
// Deliberately not a slash menu. Typing "/" to open one was tried and reverted
// (b97d696) because it duplicated the toolbar; this is reached from the gutter
// instead, so it adds a way in rather than a second way to do the same thing.

const GROUPS = [
  {
    label: 'Basic blocks',
    items: [
      { id: 'paragraph', label: 'Text', hint: '', node: { type: 'paragraph' } },
      { id: 'h1', label: 'Heading 1', hint: '#', node: { type: 'heading', attrs: { level: 1 } } },
      { id: 'h2', label: 'Heading 2', hint: '##', node: { type: 'heading', attrs: { level: 2 } } },
      { id: 'h3', label: 'Heading 3', hint: '###', node: { type: 'heading', attrs: { level: 3 } } },
      { id: 'h4', label: 'Heading 4', hint: '####', node: { type: 'heading', attrs: { level: 4 } } },
      { id: 'bulletList', label: 'Bulleted list', hint: '-', node: { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] } },
      { id: 'orderedList', label: 'Numbered list', hint: '1.', node: { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] } },
      { id: 'taskList', label: 'To-do list', hint: '[]', node: { type: 'taskList', content: [{ type: 'taskItem', content: [{ type: 'paragraph' }] }] } },
      {
        id: 'toggle',
        label: 'Toggle list',
        hint: '>',
        node: {
          type: 'toggle',
          attrs: { open: true },
          content: [{ type: 'toggleSummary' }, { type: 'toggleBody', content: [{ type: 'paragraph' }] }],
        },
      },
      { id: 'blockquote', label: 'Quote', hint: '"', node: { type: 'blockquote', content: [{ type: 'paragraph' }] } },
      { id: 'callout', label: 'Callout', hint: '', node: { type: 'callout', attrs: { tone: 'note' }, content: [{ type: 'paragraph' }] } },
      { id: 'codeBlock', label: 'Code', hint: '```', node: { type: 'codeBlock' } },
      { id: 'divider', label: 'Divider', hint: '---', node: { type: 'horizontalRule' } },
      { id: 'equation', label: 'Block equation', hint: '$$', node: { type: 'equation', attrs: { latex: '' } } },
    ],
  },
  {
    label: 'Layout',
    items: [2, 3, 4].map((n) => ({
      id: `cols${n}`,
      label: `${n} columns`,
      node: {
        type: 'columns',
        attrs: { count: n },
        content: Array.from({ length: n }, () => ({
          type: 'column',
          content: [{ type: 'paragraph' }],
        })),
      },
    })),
  },
  {
    label: 'Media',
    items: [
      { id: 'table', label: 'Table', icon: 'table', action: 'table' },
      { id: 'image', label: 'Image', icon: 'image', action: 'image' },
      { id: 'video', label: 'Video', icon: 'play', action: 'video' },
      { id: 'embed', label: 'Web bookmark', icon: 'link', action: 'embed' },
    ],
  },
  {
    // Views over a table the workspace already has, rather than an empty
    // database you would need to fill first.
    label: 'Database',
    items: [
      { id: 'board', label: 'Board view', icon: 'table', node: { type: 'databaseView', attrs: { source: 'prospects', view: 'board', groupBy: 'stage' } } },
      { id: 'dbcalendar', label: 'Calendar view', icon: 'calendar-check', node: { type: 'databaseView', attrs: { source: 'prospects', view: 'calendar', groupBy: 'stage' } } },
      { id: 'dbgallery', label: 'Gallery view', icon: 'image', node: { type: 'databaseView', attrs: { source: 'prospects', view: 'gallery', groupBy: 'stage' } } },
      { id: 'dbtable', label: 'Table view', icon: 'table', node: { type: 'databaseView', attrs: { source: 'prospects', view: 'table', groupBy: 'stage' } } },
    ],
  },
];

const ITEM =
  'flex items-center gap-2.5 w-full pl-3 pr-2 py-1.5 rounded-[7px] text-left text-[13px] text-ink-2 hover:bg-hover-wash-soft transition';

export default function BlockInsertMenu({ editor, pos, above, onClose, tools, allowDatabaseViews = true, databaseSource = 'prospects' }) {
  // The gutter passes a number; the slash menu passes a {from,to} range so
  // picking a block replaces the empty paragraph the "/" was typed in.
  const at = typeof pos === 'number' ? pos : pos.from;
  const [filter, setFilter] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const available = GROUPS.map(g => ({...g, items: g.items.filter(i => allowDatabaseViews || i.node?.type !== 'databaseView')})).filter(g => g.items.length);
    if (!q) return available;
    return available
      .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [filter, allowDatabaseViews]);

  async function insert(item) {
    onClose();
    if (item.node) {
      const node = item.node.type === 'databaseView' && databaseSource === 'actions' ? {...item.node, attrs: {...item.node.attrs, source: 'actions', groupBy: 'status'}} : item.node;
      editor.chain().insertContentAt(pos, node).focus().run();
      return;
    }
    // Actions need the editor's own commands or a dialog, so they run after
    // the menu closes rather than being expressed as a node.
    if (item.action === 'table') {
      editor.chain().insertContentAt(pos, { type: 'paragraph' }).focus(at).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      return;
    }
    if (item.action === 'image') {
      editor.commands.focus(at);
      tools?.insertImage?.();
      return;
    }
    if (item.action === 'video') {
      editor.commands.focus(at);
      tools?.insertVideo?.();
      return;
    }
    if (item.action === 'embed') {
      const raw = await promptDialog({
        title: 'Add a link',
        placeholder: 'Paste a Loom, Figma, Google Docs, Maps, Instagram or Facebook link',
        confirmLabel: 'Add',
      });
      if (!raw || !raw.trim()) return;
      const selfHost = typeof window !== 'undefined' ? window.location.hostname : null;
      let url = raw.trim();
      if (isFacebookShare(url)) {
        const res = await fetch('/api/embed/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        }).catch(() => null);
        const data = res && res.ok ? await res.json() : null;
        if (!data?.url) {
          toast("That Facebook share link didn't resolve. Open the post, click its timestamp, and use the link from the address bar.", { tone: 'error' });
          return;
        }
        url = data.url;
      }
      const hit = matchEmbed(url, selfHost);
      if (!hit) {
        toast('That needs to be an https link to somewhere other than this site.', { tone: 'error' });
        return;
      }
      editor.chain().insertContentAt(pos, { type: 'embed', attrs: { provider: hit.provider, url: hit.url } }).focus().run();
    }
  }

  return (
    <div
      className="absolute left-0 top-7 z-50 w-[232px] glass-panel !bg-panel p-1.5"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Type to filter…"
        className="w-full mb-1 bg-input border border-line rounded-[7px] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
      />
      <div className="max-h-[290px] overflow-y-auto">
        {groups.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-ink-3">Nothing matches “{filter}”.</div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-ink-3 uppercase tracking-wide">
              {g.label}
            </div>
            {g.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(item)}
                className={ITEM}
              >
                {item.icon ? (
                  <Icon name={item.icon} className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[11px] text-ink-3 font-mono">{item.hint}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-ink-3 border-t border-line mt-1">
        {allowDatabaseViews && databaseSource !== 'actions' ? <>Adding {above ? 'above' : 'below'} · Esc to close</> : 'Press Esc to close.'}
      </div>
    </div>
  );
}
