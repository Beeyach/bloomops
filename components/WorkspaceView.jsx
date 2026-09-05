'use client';

import { useEffect, useState } from 'react';
import { confirmDialog, promptDialog } from '../lib/dialog.mjs';
import { Icon } from './Icons';

import { toast } from '../lib/toast.mjs';
// Workspace (spec §3c, amendment A5): the SMM's scripts, SOPs, and
// templates in editable groups of copyable blocks. Self-contained data
// view — fetches its own groups; the API seeds defaults on first load.
// [Bracketed fill-in slots] used to blend into the text. Render them as
// little rose chips so it's obvious what to replace before pasting.
function renderWithSlots(body) {
  const parts = String(body || '').split(/(\[[^\]\n]{1,80}\])/g);
  if (parts.length === 1) return body;
  return parts.map((p, i) =>
    p.startsWith('[') && p.endsWith(']') ? (
      <mark
        key={i}
        className="bg-rose-tint text-rose-text rounded-[6px] px-1 py-px font-medium"
      >
        {p}
      </mark>
    ) : (
      p
    )
  );
}

export default function WorkspaceView({
  category = 'workspace',
  heading = 'Workspace',
  subheading = 'Your scripts, SOPs, and templates. Copy to use one, edit anything to make it yours.',
  locked = false,
  adminOnly = false,
  copyDecorate = null,
  // Chapter 10. A short numbered strip above the pages: icon, title, one
  // line each. The Sourcing guide is a set of pages Ary writes herself, so
  // this is added ABOVE her content rather than rewriting any of it — the
  // brief asked for a small visual cleanup, not a docs project.
  steps = null,
}) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [editing, setEditing] = useState(null); // { groupId, itemId|null (null = new item) }
  // Locked categories (the guides) ship with the app and are read-only for
  // user accounts. Admin accounts can edit them. The role comes from the
  // signed session, so a user can't unlock editing by any client trick.
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => { if (alive) { setIsAdmin(d.role === 'admin'); setRoleLoaded(true); } })
      .catch(() => { if (alive) setRoleLoaded(true); });
    return () => { alive = false; };
  }, []);
  const canEdit = !locked || isAdmin;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/library?category=${category}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) setGroups(data.groups || []);
      } catch (e) {
        if (alive) setError(`Couldn't load the workspace. ${e.message}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [category]);

  // adminOnly views (API wiring docs) are invisible to regular workspaces —
  // the nav hides the tab, and this covers a typed-in deep link. Sits below
  // every hook so the hook order never changes between renders.
  if (adminOnly && !roleLoaded) {
    return (
      <div className="canvas-read py-8 space-y-3" aria-hidden="true">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
      </div>
    );
  }
  if (adminOnly && !isAdmin) {
    return (
      <div className="canvas-read mx-auto bg-panel border border-line-strong shadow-card rounded-2xl p-10 text-center text-muted">
        This section is managed by your admin.
      </div>
    );
  }

  async function patchGroup(id, patch) {
    setBusy(true);
    try {
      const res = await fetch(`/api/library/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGroups((prev) => prev.map((g) => (g.id === id ? data.group : g)));
      return data.group;
    } catch (e) {
      toast(`Couldn't save. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => patchGroup(id, patch) } });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addGroup() {
    const title = await promptDialog({ title: 'New group', placeholder: 'Group name', confirmLabel: 'Add' });
    if (!title || !title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGroups((prev) => [...prev, data.group]);
    } catch (e) {
      toast(`Couldn't add the group. ${e.message}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup(group) {
    const count = group.items.length;
    const what = count === 1 ? '1 block' : `${count} blocks`;
    if (!(await confirmDialog({ title: 'Delete group', message: `Delete "${group.title}" and its ${what}? This can't be undone.` }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/library/${group.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (e) {
      toast(`Couldn't delete. ${e.message}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // "Copied" is only shown when the write actually resolved. The old version
  // ran the same done() on .catch and when the API was missing entirely, so a
  // blocked clipboard still flashed Copied and the paste came out empty.
  async function copyBlock(item) {
    const text = copyDecorate ? copyDecorate(item.body, item) : item.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1500);
    } catch {
      toast('Your browser blocked clipboard access, so nothing was copied.', { tone: 'error' });
    }
  }

  function saveItem(group, itemId, title, body, notes) {
    let items;
    if (itemId) {
      items = group.items.map((it) => (it.id === itemId ? { ...it, title, body, notes } : it));
    } else {
      items = [...group.items, { id: `it-${Date.now()}`, title, body, notes }];
    }
    setEditing(null);
    patchGroup(group.id, { items });
  }

  async function removeItem(group, item) {
    if (!(await confirmDialog({ title: 'Delete block', message: `Delete "${item.title}" from ${group.title}?` }))) return;
    patchGroup(group.id, { items: group.items.filter((it) => it.id !== item.id) });
  }

  if (loading) {
    return (
      <div className="canvas-read mt-4 space-y-3" aria-hidden="true">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-3/4" />
      </div>
    );
  }
  if (error) return <div className="text-poppy-text mt-4">{error}</div>;

  return (
    <div className="canvas-read">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-1">
        <h1 className="font-serif ui-display text-bright leading-tight">{heading}</h1>
        {canEdit && (
          <button
            disabled={busy}
            onClick={addGroup}
            className="text-[13px] font-medium px-4 py-2.5 rounded-[8px] btn-bloom transition disabled:opacity-50"
          >
            Add group
          </button>
        )}
      </div>
      <p className="ui-body text-ink-2 mb-4">{subheading}</p>

      {steps ? (
        <ol className="grid gap-2 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {steps.map((st, i) => (
            <li key={st.title} className="flex items-start gap-2.5 r-md border border-line bg-panel px-3 py-2.5">
              <span
                className="shrink-0 w-6 h-6 r-sm inline-flex items-center justify-center ui-small font-bold"
                style={{ color: 'var(--tone-brand-ink)', background: 'var(--tone-brand-bg)' }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <Icon name={st.icon} className="w-[15px] h-[15px] shrink-0 text-ink-2" strokeWidth={2} />
                  <span className="ui-body font-semibold text-ink">{st.title}</span>
                </span>
                <span className="block ui-small text-ink-2 mt-0.5 leading-snug">{st.line}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {locked && !isAdmin && (
        <p className="text-[12px] text-ink-3 -mt-2 mb-4 flex items-center gap-1.5">
          <Icon name="lock" className="w-3.5 h-3.5 shrink-0" />
          These instructions ship with the app and stay up to date, so they are read-only. Copy anything you need.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.id} className="mb-7">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-semibold text-[17px] text-bright flex-1 min-w-0 truncate">{group.title}</h2>
            {canEdit && (
              <>
                <button
                  disabled={busy}
                  onClick={async () => {
                    const title = await promptDialog({ title: 'Rename group', defaultValue: group.title, confirmLabel: 'Rename' });
                    if (title && title.trim() && title.trim() !== group.title) patchGroup(group.id, { title: title.trim() });
                  }}
                  aria-label="Rename group"
                  className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:text-ink hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"
                ><Icon name="pencil" className="w-4 h-4" /></button>
                <button
                  disabled={busy}
                  onClick={() => removeGroup(group)}
                  aria-label="Delete group"
                  className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:text-poppy-text hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"
                ><Icon name="x" className="w-4 h-4" /></button>
              </>
            )}
          </div>
          {group.note ? <p className="text-sm text-ink-3 mb-2">{group.note}</p> : null}

          <div className="flex flex-col gap-2">
            {group.items.map((item) =>
              editing && editing.groupId === group.id && editing.itemId === item.id ? (
                <BlockEditor
                  key={item.id}
                  initialTitle={item.title}
                  initialBody={item.body}
                  initialNotes={item.notes || ''}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(t, b, n) => saveItem(group, item.id, t, b, n)}
                />
              ) : (
                <div key={item.id} className="glass-panel p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-bright flex-1 min-w-0 truncate">{item.title}</h3>
                    <button
                      onClick={() => copyBlock(item)}
                      className={`text-[13px] font-medium px-3 py-1.5 rounded-[8px] border transition shrink-0 ${
                        copiedId === item.id
                          ? 'border-leaf text-leaf-text'
                          : 'border-line-strong text-ink hover:bg-hover-wash-soft'
                      }`}
                    >
                      {copiedId === item.id ? (
                        <span className="inline-flex items-center gap-1"><Icon name="check" className="w-3.5 h-3.5" /> Copied</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><Icon name="copy" className="w-3.5 h-3.5" /> Copy</span>
                      )}
                    </button>
                    {canEdit && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => setEditing({ groupId: group.id, itemId: item.id })}
                          aria-label="Edit block"
                          className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:text-ink hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"
                        ><Icon name="pencil" className="w-4 h-4" /></button>
                        <button
                          disabled={busy}
                          onClick={() => removeItem(group, item)}
                          aria-label="Delete block"
                          className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:text-poppy-text hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"
                        ><Icon name="x" className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm text-ink-2 leading-relaxed">{renderWithSlots(item.body)}</pre>
                  {item.notes ? (
                    <div className="mt-3 pt-3 border-t border-line">
                      <div className="text-[12px] font-semibold text-ink-3 mb-1">Notes</div>
                      <p className="whitespace-pre-wrap text-[13px] text-ink-3 leading-relaxed">{item.notes}</p>
                    </div>
                  ) : null}
                </div>
              )
            )}

            {editing && editing.groupId === group.id && editing.itemId === null ? (
              <BlockEditor
                initialTitle=""
                initialBody=""
                initialNotes=""
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(t, b, n) => saveItem(group, null, t, b, n)}
              />
            ) : canEdit ? (
              <button
                disabled={busy}
                onClick={() => setEditing({ groupId: group.id, itemId: null })}
                className="self-start text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-50"
              >
                Add block
              </button>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function BlockEditor({ initialTitle, initialBody, initialNotes, busy, onCancel, onSave }) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [notes, setNotes] = useState(initialNotes || '');
  return (
    <div className="glass-panel p-4">
      <label className="block text-[13px] font-semibold text-ink mb-1.5">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Follow-up 3"
        className="cell-input mb-3"
        autoFocus
      />
      <label className="block text-[13px] font-semibold text-ink mb-1.5">Text</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder="The text you want to copy later"
        className="cell-input"
        style={{ minHeight: 160, whiteSpace: 'pre-wrap' }}
      />
      <label className="block text-[13px] font-semibold text-ink mb-1.5 mt-3">Notes (optional)</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="When to use this, what to tweak, results it got"
        className="cell-input"
        style={{ minHeight: 60, whiteSpace: 'pre-wrap' }}
      />
      <div className="flex gap-2 mt-3">
        <button
          disabled={busy || !title.trim()}
          onClick={() => onSave(title.trim(), body, notes)}
          className="text-[13px] font-medium px-4 py-2 rounded-[8px] btn-bloom transition disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="text-[13px] font-medium px-4 py-2 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
