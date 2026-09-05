'use client';

import { useEffect, useState } from 'react';
import { confirmDialog } from '../lib/dialog.mjs';
import WorkspaceView from './WorkspaceView';
import { Icon, IconTile } from './Icons';

import { toast } from '../lib/toast.mjs';
const ACTIVE_KEY = 'ltb_active_project';

// Chat prompts with projects. A project is a named set of fill-ins, one
// per client or niche. Pick one and every Copy button personalizes the
// prompt with those details, so the same library serves every client
// without hand-editing brackets each time.

const EMPTY = { name: '', who: '', offer: '', platform: '', notes: '' };

function buildDecorator(project) {
  if (!project) return null;
  return (body) => {
    const lines = [
      '',
      '',
      `--- Fill-ins for this run (project: ${project.name}) ---`,
      project.who ? `Who I'm targeting: ${project.who}` : '',
      project.offer ? `What I'm selling them: ${project.offer}` : '',
      project.platform ? `Platform: ${project.platform}` : '',
      project.notes ? `Extra notes: ${project.notes}` : '',
      'Use these details to fill every bracketed slot above before answering.',
    ].filter((l) => l !== '');
    return body + lines.join('\n');
  };
}

export default function PromptsHub() {
  const [projects, setProjects] = useState(null); // null = loading
  const [activeId, setActiveId] = useState('');
  const [editing, setEditing] = useState(null); // project object or 'new'
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = (await (await fetch('/api/settings')).json()).settings || {};
        if (!alive) return;
        setProjects(s.promptProjects || []);
        try {
          const stored = localStorage.getItem(ACTIVE_KEY) || '';
          if ((s.promptProjects || []).some((p) => p.id === stored)) setActiveId(stored);
        } catch {}
      } catch {
        if (alive) setProjects([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function persist(next) {
    setSaving(true);
    try {
      const res = await fetch('/api/settings');
      const s = (await res.json()).settings || {};
      const put = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { ...s, promptProjects: next } }),
      });
      if (!put.ok) throw new Error((await put.json()).error || `HTTP ${put.status}`);
      const saved = (await put.json()).settings.promptProjects || [];
      setProjects(saved);
      return saved;
    } catch (e) {
      toast(`Couldn't save the project. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => persist(next) } });
      return null;
    } finally {
      setSaving(false);
    }
  }

  function pick(id) {
    const next = activeId === id ? '' : id;
    setActiveId(next);
    try { localStorage.setItem(ACTIVE_KEY, next); } catch {}
  }

  async function saveDraft() {
    if (!draft.name.trim()) return;
    let next;
    if (editing === 'new') {
      next = [...(projects || []), { ...draft, id: crypto.randomUUID() }];
    } else {
      next = (projects || []).map((p) => (p.id === editing.id ? { ...p, ...draft } : p));
    }
    const saved = await persist(next);
    if (saved) {
      setEditing(null);
      setDraft(EMPTY);
      if (editing === 'new' && saved.length) pick(saved[saved.length - 1].id);
    }
  }

  async function removeProject(p) {
    if (!(await confirmDialog({ title: 'Delete project', message: `Delete project "${p.name}"? The prompts themselves stay.` }))) return;
    const saved = await persist((projects || []).filter((x) => x.id !== p.id));
    if (saved && activeId === p.id) pick(p.id); // toggles off
  }

  const active = (projects || []).find((p) => p.id === activeId) || null;
  const field = 'w-full bg-input border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose';

  return (
    <>
      <div className="canvas-read mb-5">
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2.5 mb-1">
            <IconTile name="target" tone="rose" size={28} radius={8} />
            <div className="font-semibold text-bright flex-1">Projects</div>
          </div>
          <p className="text-[13px] text-ink-3 mb-3">
            A project holds the fill-ins for one client or niche. Pick one and every Copy below carries its details, so the prompt arrives ready instead of full of blank brackets.
          </p>

          {projects === null ? (
            <div className="flex gap-1.5" aria-hidden="true">
              <div className="skeleton h-7 w-24 rounded-full" />
              <div className="skeleton h-7 w-28 rounded-full" />
              <div className="skeleton h-7 w-24 rounded-full" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 items-center">
              {projects.map((p) => (
                <span
                  key={p.id}
                  className={`inline-flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-[12px] border transition ${
                    activeId === p.id
                      ? 'border-rose text-rose-text bg-rose-tint'
                      : 'border-line text-ink-2 hover:bg-hover-wash-soft'
                  }`}
                >
                  <button onClick={() => pick(p.id)} title={activeId === p.id ? 'Deselect' : 'Use for copies'}>
                    {p.name}
                  </button>
                  <button
                    onClick={() => { setEditing(p); setDraft({ name: p.name, who: p.who, offer: p.offer, platform: p.platform, notes: p.notes }); }}
                    aria-label={`Edit ${p.name}`}
                    className="w-5 h-5 rounded-full text-ink-3 hover:text-ink flex items-center justify-center"
                  ><Icon name="pencil" className="w-3 h-3" /></button>
                  <button
                    onClick={() => removeProject(p)}
                    aria-label={`Delete ${p.name}`}
                    className="w-5 h-5 rounded-full text-ink-3 hover:text-poppy-text flex items-center justify-center"
                  ><Icon name="x" className="w-3 h-3" /></button>
                </span>
              ))}
              <button
                onClick={() => { setEditing('new'); setDraft(EMPTY); }}
                className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1 rounded-full border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                <Icon name="plus" className="w-3 h-3" />
                New project
              </button>
            </div>
          )}

          {active && (
            <p className="text-[12px] text-leaf-text mt-2">
              Copying for {active.name}. Every prompt below goes out with its fill-ins attached.
            </p>
          )}

          {editing && (
            <div className="mt-3 pt-3 border-t border-line grid gap-2 sm:grid-cols-2">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Project name, e.g. Ellen · med spas" className={field} />
              <input value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} placeholder="Main platform, e.g. Facebook groups" className={field} />
              <input value={draft.who} onChange={(e) => setDraft({ ...draft, who: e.target.value })} placeholder="Who this targets, e.g. spa owners in Manila" className={field} />
              <input value={draft.offer} onChange={(e) => setDraft({ ...draft, offer: e.target.value })} placeholder="The offer, e.g. content + DM handling, ₱15k/mo" className={field} />
              <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything else the prompts should know" className={`${field} sm:col-span-2`} />
              <div className="flex gap-2 sm:col-span-2">
                <button
                  disabled={saving || !draft.name.trim()}
                  onClick={saveDraft}
                  className="text-[13px] font-medium px-4 py-2 rounded-[8px] btn-bloom transition disabled:opacity-40"
                >
                  {editing === 'new' ? 'Create project' : 'Save changes'}
                </button>
                <button
                  onClick={() => { setEditing(null); setDraft(EMPTY); }}
                  className="text-[13px] font-medium px-3 py-2 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <WorkspaceView
        category="prompts"
        heading="Chat prompts"
        subheading="The raw prompts behind find, filter, and write. Copy into ChatGPT or Claude, tune the wording to your voice."
        copyDecorate={buildDecorator(active)}
      />
    </>
  );
}
