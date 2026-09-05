'use client';

import { useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '../lib/dialog.mjs';
import Select from './Select';
import { Icon, IconTile } from './Icons';
import { Pill } from './Semantic';
import RichEditor from './RichEditor';
import { CLIENT_STAGES } from '../lib/client-profile.mjs';
import { tzToday } from '../lib/tz.mjs';
import Hint from './Hint';

import { toast } from '../lib/toast.mjs';
// Clients + onboarding checklists (spec §3b). Self-contained data view,
// LeadInbox-style: fetches its own list, updates via PUT with
// update-on-confirm (await server, then set state, alert on failure).
export default function ClientsView({ prospects, onOpenProspect }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [newStep, setNewStep] = useState('');
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addProspectId, setAddProspectId] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/clients');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) setClients(data.clients || []);
      } catch (e) {
        if (alive) setError(`Couldn't load clients. ${e.message}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const linkedProspectIds = useMemo(
    () => new Set(clients.map((c) => c.prospect_id).filter(Boolean)),
    [clients]
  );
  const unlinkedClientStage = useMemo(
    () => (prospects || []).filter((p) => p.stage === 'Client' && !linkedProspectIds.has(p.id)),
    [prospects, linkedProspectIds]
  );

  async function patchClient(id, patch) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClients((prev) => prev.map((c) => (c.id === id ? data.client : c)));
      return data.client;
    } catch (e) {
      toast(`Couldn't save. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => patchClient(id, patch) } });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createClient(fields) {
    setBusy(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClients((prev) => [data.client, ...prev]);
      setOpenId(data.client.id);
    } catch (e) {
      toast(`Couldn't create the client. ${e.message}`, { tone: 'error', action: { label: 'Retry', onClick: () => createClient(fields) } });
    } finally {
      setBusy(false);
    }
  }

  async function removeClient(client) {
    if (!(await confirmDialog({ title: 'Delete client', message: `Delete ${client.name} and their checklist? This can't be undone.` }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      setOpenId(null);
    } catch (e) {
      toast(`Couldn't delete. ${e.message}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const open = clients.find((c) => c.id === openId) || null;

  // A client needs onboarding while any checklist step is unticked, and also
  // when nobody has built them a checklist yet — an empty list is setup not
  // started, not setup finished.
  const awaitingSetup = clients.filter((c) => (c.onboarding || []).length === 0
    || (c.onboarding || []).some((st) => !st.done));
  const onboarded = clients.filter((c) => (c.onboarding || []).length > 0
    && (c.onboarding || []).every((st) => st.done));

  if (loading) {
    return (
      <div className="tpl-data mt-4" aria-hidden="true">
        <div className="skeleton h-8 w-44 mb-4" />
        <div className="tpl-grid">
          <div className="skeleton h-[124px]" />
          <div className="skeleton h-[124px]" />
          <div className="skeleton h-[124px]" />
          <div className="skeleton h-[124px]" />
        </div>
      </div>
    );
  }
  if (error) return <div className="text-poppy-text mt-4">{error}</div>;

  if (open) {
    return (
      <ClientDetail
        client={open}
        busy={busy}
        newStep={newStep}
        setNewStep={setNewStep}
        onBack={() => setOpenId(null)}
        onPatch={(patch) => patchClient(open.id, patch)}
        onDelete={() => removeClient(open)}
      />
    );
  }

  return (
    <div className="tpl-data">
      <h1 className="font-serif ui-display text-bright leading-tight mb-1">Clients</h1>
      <p className="text-ink-2 mb-4">
        Onboarding checklists for everyone who signed.
        {(() => {
          // The number this tab exists for. Only counts rates that are plain
          // numbers, and only from relationships still running; a card with a
          // free-text rate simply is not summed rather than being guessed at.
          const active = clients.filter((c) => c.stage !== 'Ended' && c.stage !== 'Paused');
          const sum = active.reduce((n, c) => {
            const raw = String(c.monthly_rate || '').trim().replace(/^\$/, '');
            return /^\d+(\.\d+)?$/.test(raw) ? n + Number(raw) : n;
          }, 0);
          return sum > 0
            ? <span className="text-leaf-text font-semibold">{` ${active.length} active, $${sum.toLocaleString()}/mo coming in.`}</span>
            : null;
        })()}
      </p>
      <Hint id="clients-view">
        When a prospect's stage becomes <b>Client</b>, they appear up top with a
        "Start onboarding" button, and that creates their card and checklist here.
      </Hint>

      {unlinkedClientStage.length > 0 && (
        <div className="glass-panel px-4 py-3 mb-4 flex flex-col gap-2">
          <div className="ui-small font-semibold text-rose-text">
            In Client stage, not set up yet
          </div>
          {unlinkedClientStage.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="flex-1 min-w-0 truncate text-ink">
                {p.business_name || p.name || p.email}
              </span>
              <button
                onClick={() => onOpenProspect(p)}
                className="ui-body font-medium px-3 py-1.5 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                View
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  createClient({
                    name: p.business_name || p.name || p.email,
                    prospect_id: p.id,
                    handle: p.email || '',
                    start_date: tzToday(),
                  })
                }
                className="ui-body font-medium px-3 py-1.5 r-md btn-bloom transition disabled:opacity-50"
              >
                Start onboarding
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4">
        {!addOpen ? (
          <button
            disabled={busy}
            onClick={() => { setAddOpen(true); setAddName(''); setAddProspectId(''); }}
            className="ui-body font-medium px-4 py-2.5 r-md btn-bloom transition disabled:opacity-50"
          >
            Add client
          </button>
        ) : (
          <div className="glass-panel p-4">
            <div className="font-medium text-ink mb-2">New client</div>
            <div className="flex gap-2 flex-wrap items-center">
              {/* Only people who could actually become a client. This used to
                  list every prospect in the workspace, so signing a new client
                  meant scrolling past hundreds of Lost and Rejected rows.
                  Warmest stages first, then alphabetical. */}
              <Select
                value={addProspectId}
                onChange={(id) => {
                  // The "no candidates" row is informational, not selectable.
                  if (id === '__none__') return;
                  setAddProspectId(id);
                  const p = (prospects || []).find((x) => String(x.id) === id);
                  if (p) setAddName(p.business_name || p.name || p.email || '');
                }}
                minWidth={220}
                ariaLabel="Start from a prospect"
                placeholder="Start from a prospect (fills the rest)"
                buttonClassName="!py-2 !text-sm"
                options={(() => {
                  const RANK = { 'Setup Check': 0, 'Proposal Sent': 1, Interested: 2, Rekindled: 3, Client: 4 };
                  const candidates = (prospects || [])
                    .filter((p) => !clients.some((c) => c.prospect_id === p.id))
                    .filter((p) => RANK[p.stage] != null)
                    .sort((a, b) =>
                      (RANK[a.stage] - RANK[b.stage]) ||
                      String(a.business_name || a.name || '').localeCompare(String(b.business_name || b.name || ''))
                    );
                  const base = [{ value: '', label: 'Start from a prospect (fills the rest)' }];
                  if (!candidates.length) {
                    return [...base, { value: '__none__', label: 'No prospects at Interested or later yet' }];
                  }
                  return [
                    ...base,
                    ...candidates.map((p) => ({
                      value: String(p.id),
                      label: `${p.business_name || p.name || p.email || 'Unnamed'}${p.stage ? ` · ${p.stage}` : ''}`,
                    })),
                  ];
                })()}
              />
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim()) document.getElementById('ltb-add-client-go')?.click(); }}
                placeholder="Client name"
                className="flex-1 min-w-[180px] bg-input border border-line r-md px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
              />
              <button
                id="ltb-add-client-go"
                disabled={busy || !addName.trim()}
                onClick={() => {
                  const p = (prospects || []).find((x) => String(x.id) === addProspectId);
                  createClient({
                    name: addName.trim(),
                    prospect_id: p ? p.id : null,
                    handle: p ? (p.email || '') : '',
                    start_date: tzToday(),
                  });
                  setAddOpen(false);
                }}
                className="ui-body font-medium px-4 py-2 r-md btn-bloom transition disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => setAddOpen(false)}
                className="ui-body font-medium px-3 py-2 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition"
              >
                Cancel
              </button>
            </div>
            <p className="ui-small text-ink-3 mt-2">
              Picking a prospect links the two: their email fills the handle, and their row stays connected to this onboarding.
            </p>
          </div>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="glass-panel border-dashed p-10 text-center rise-in">
          <div className="flex justify-center mb-3">
            <IconTile name="briefcase" tone="leaf" size={44} />
          </div>
          <p className="text-bright font-semibold ui-heading">No clients yet</p>
          <p className="text-ink-2 text-sm mt-1">When a prospect reaches the Client stage, start their onboarding here.</p>
        </div>
      ) : (
        <>
        {/* Chapter 8: two groups, not one grid.
            "Clients looks redundant" was the verdict, and it was fair — every
            card had the same shape whether the person needed three hours of
            setup or nothing at all. Onboarding is the only question this page
            answers, so it is the split. A group with nobody in it is not
            drawn, so a fully-onboarded book of clients is one list again. */}
        {[
          { key: 'setup', title: 'Needs onboarding', list: awaitingSetup,
            blurb: 'Setup is not finished. These are the ones with work left on them.' },
          { key: 'running', title: 'Active', list: onboarded,
            blurb: 'Onboarded and running. Nothing here is waiting on you.' },
        ].filter((g) => g.list.length > 0).map(({ key, title, list, blurb }) => (
          <section key={key} className="mb-8 last:mb-0">
            <div className="flex items-baseline gap-2.5 mb-1">
              <h2 className="ui-heading font-semibold text-ink">{title}</h2>
              <span className="ui-small text-ink-2 num-tabular">{list.length.toLocaleString()}</span>
            </div>
            <p className="ui-small text-ink-2 mb-3">{blurb}</p>
            <div className="tpl-grid">
          {list.map((c) => {
            const total = c.onboarding.length;
            const done = c.onboarding.filter((s) => s.done).length;
            const next = c.onboarding.find((s) => !s.done);
            const pct = total ? Math.round((done / total) * 100) : 0;
            const complete = total > 0 && done === total;
            const stage = c.stage || 'Onboarding';
            const stageTone =
              stage === 'Active' ? 'border-leaf text-leaf-text'
              : stage === 'Paused' ? 'border-gold text-gold-text'
              : stage === 'Ended' ? 'border-line text-ink-3'
              : 'border-rose-line text-rose-text';
            // Last touch, so a card says whether this relationship is warm
            // rather than only how far onboarding got.
            const lastStep = [...c.onboarding].filter((s) => s.done && s.doneDate).sort((a, b) => String(b.doneDate).localeCompare(String(a.doneDate)))[0];
            // The card's identity: a rose monogram, so a wall of clients
            // reads as people rather than as rows that happen to be boxes.
            const initials = String(c.name || '?')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join('') || '?';
            // "450" is a number; "$450/mo" is money. Stored as free text, so
            // only a purely numeric value gets dressed up.
            const rate = (() => {
              const raw = String(c.monthly_rate || '').trim();
              if (!raw) return '';
              return /^\$?\d+(\.\d+)?$/.test(raw) ? `$${raw.replace(/^\$/, '')}/mo` : raw;
            })();
            const started = (() => {
              const d = new Date(String(c.start_date || '') + 'T00:00:00');
              if (Number.isNaN(d.getTime())) return c.start_date || '';
              const sameYear = d.getFullYear() === new Date().getFullYear();
              return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' });
            })();
            return (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="client-card text-left"
              >
                <div className="flex items-start gap-2.5 mb-2.5">
                  <span className="w-9 h-9 r-md bg-blush-soft text-rose-text font-bold ui-heading inline-flex items-center justify-center shrink-0">
                    {initials}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-bright ui-heading truncate">{c.name}</span>
                    {c.handle && <span className="block ui-small text-ink-3 truncate">{c.handle}</span>}
                  </span>
                  {/* Chapter 10: one pill, in the family the state belongs
                      to — onboarded is done, everything else is waiting. */}
                  <Pill kind={complete ? 'client' : 'onboarding'}>{stage}</Pill>
                </div>

                {/* Progress reads as a number AND a bar: the bar alone made
                    8/12 and 11/12 look the same at a glance. An empty
                    checklist gets no bar at all — a grey 0/0 track reads as
                    something broken rather than something not started. */}
                {total > 0 && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-[6px] flex-1 rounded-full bg-hover-wash overflow-hidden">
                      <div className="h-full rounded-full bg-leaf" style={{ width: pct + '%' }} />
                    </div>
                    <span className="ui-meta text-ink-3 num-tabular shrink-0">
                      {complete ? 'onboarded' : done + '/' + total}
                    </span>
                  </div>
                )}

                {/* One next action, said once. The pill above already says
                    the state, so this line no longer repeats it. */}
                <p className={'ui-body truncate mb-2.5 ' + (total === 0 ? 'text-rose-text font-medium' : 'text-ink-2')}>
                  {complete
                    ? (lastStep ? 'Finished ' + lastStep.doneDate : 'Nothing outstanding')
                    : next ? next.label : 'Set up their checklist'}
                </p>

                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap ui-small text-ink-3 pt-2 border-t border-line">
                  {started && <span>Started {started}</span>}
                  {rate && <span className="text-leaf-text font-semibold">{rate}</span>}
                  {(c.files || []).length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="link" className="w-3 h-3" />{(c.files || []).length}
                    </span>
                  )}
                  <span className="ml-auto inline-flex items-center gap-1 text-rose-text font-medium client-card-go">
                    Open <Icon name="arrow-left" className="w-3 h-3 rotate-180" />
                  </span>
                </div>
              </button>
            );
          })}
            </div>
          </section>
        ))}
        </>
      )}
    </div>
  );
}

function Field({ label, value, onCommit, placeholder, type = 'text' }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <div>
      <label className="block ui-body font-semibold text-ink mb-1.5">{label}</label>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value || '')) onCommit(draft); }}
        className="cell-input"
      />
    </div>
  );
}

function ClientDetail({ client, busy, newStep, setNewStep, onBack, onPatch, onDelete }) {
  const total = client.onboarding.length;
  const done = client.onboarding.filter((s) => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  function toggleStep(stepId) {
    const onboarding = client.onboarding.map((s) =>
      s.id === stepId
        ? { ...s, done: !s.done, doneDate: !s.done ? tzToday() : null }
        : s
    );
    onPatch({ onboarding });
  }

  function moveStep(stepId, dir) {
    const idx = client.onboarding.findIndex((s) => s.id === stepId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= client.onboarding.length) return;
    const onboarding = [...client.onboarding];
    [onboarding[idx], onboarding[swap]] = [onboarding[swap], onboarding[idx]];
    onPatch({ onboarding });
  }

  async function removeStep(step) {
    if (!(await confirmDialog({ title: 'Remove step', message: `Remove "${step.label}" from this checklist?` }))) return;
    onPatch({ onboarding: client.onboarding.filter((s) => s.id !== step.id) });
  }

  function addStep() {
    const label = newStep.trim();
    if (!label) return;
    const onboarding = [
      ...client.onboarding,
      { id: `ob-${Date.now()}`, label, done: false, doneDate: null },
    ];
    setNewStep('');
    onPatch({ onboarding });
  }

  const nextStep = client.onboarding.find((s) => !s.done);

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 ui-body font-medium text-ink-2 hover:text-ink mb-3 transition">
        <Icon name="arrow-left" className="w-3.5 h-3.5" />
        Clients
      </button>
      <h1 className="font-serif ui-display text-bright leading-tight mb-1">{client.name}</h1>
      <p className="text-ink-2">{done} of {total} onboarding steps done</p>
      <div className="h-[7px] rounded-full bg-hover-wash mt-2 mb-6 overflow-hidden max-w-[420px]">
        <div className="h-full rounded-full bg-leaf" style={{ width: `${pct}%` }} />
      </div>

      {/* Detail workspace: the work lives in the main column, the facts about
          the client follow you down the page in the rail. */}
      <div className="tpl-detail">
        <div className="min-w-0">

      <div className="glass-panel p-4 mb-5">
        {client.onboarding.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1.5 border-b border-line last:border-b-0 py-1">
            <button
              disabled={busy}
              onClick={() => toggleStep(step.id)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left py-2 disabled:opacity-60"
            >
              <span
                className={`w-[22px] h-[22px] shrink-0 rounded-full border-2 flex items-center justify-center text-white ${
                  step.done ? 'bg-leaf border-leaf' : 'border-line-strong'
                }`}
              >
                {step.done ? <Icon name="check" className="w-3 h-3" strokeWidth={2.5} /> : null}
              </span>
              <span className={`min-w-0 truncate ${step.done ? 'text-ink-3' : 'text-ink'}`}>{step.label}</span>
              {step.done && step.doneDate ? (
                <span className="ui-meta text-ink-3 shrink-0">{step.doneDate}</span>
              ) : null}
            </button>
            <button disabled={busy || i === 0} onClick={() => moveStep(step.id, -1)} aria-label="Move up"
              className="w-9 h-9 shrink-0 r-md text-ink-3 hover:text-ink hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"><Icon name="chevron-up" className="w-4 h-4" /></button>
            <button disabled={busy || i === client.onboarding.length - 1} onClick={() => moveStep(step.id, 1)} aria-label="Move down"
              className="w-9 h-9 shrink-0 r-md text-ink-3 hover:text-ink hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"><Icon name="chevron-down" className="w-4 h-4" /></button>
            <button disabled={busy} onClick={() => removeStep(step)} aria-label="Remove step"
              className="w-9 h-9 shrink-0 r-md text-ink-3 hover:text-poppy-text hover:bg-hover-wash-soft disabled:opacity-25 inline-flex items-center justify-center"><Icon name="x" className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStep(); }}
            placeholder="Add a step"
            className="cell-input flex-1"
          />
          <button disabled={busy} onClick={addStep}
            className="ui-body font-medium px-4 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      <div className="glass-panel p-4 mb-5">
        <label className="block ui-body font-semibold text-ink mb-1">Working notes</label>
        <p className="ui-small text-ink-3 mb-2">
          The whole page is yours. Type <b>#&nbsp;</b> for a heading, <b>-&nbsp;</b> for a list, highlight any text for
          the toolbar with <b>Table</b> in it. Paste screenshots straight in. Everything saves when you click away.
        </p>
        <RichEditor
          key={client.id}
          value={client.body || ''}
          onSave={(html) => { if (html !== (client.body || '')) onPatch({ body: html }); }}
          placeholder="What was agreed, what you are waiting on, where things stand."
        />
      </div>

      {/* Danger last, and separated. Deleting a client was previously one
          neutral-looking button sitting under the notes. */}
      <div className="r-lg border border-line p-4 mb-5">
        <div className="ui-body font-semibold text-ink mb-1">Danger zone</div>
        <p className="ui-small text-ink-3 mb-3">
          Deleting removes {client.name} and their checklist, notes and links. It cannot be undone.
        </p>
        <button onClick={onDelete} disabled={busy}
          className="ui-body font-medium px-4 py-2.5 r-md border border-poppy text-poppy-text hover:bg-hover-wash-soft transition disabled:opacity-50">
          Delete {client.name}
        </button>
      </div>

        </div>

        {/* ── Contextual rail ─────────────────────────────────────────── */}
        <aside className="tpl-detail-rail space-y-4">
          <div className="glass-panel p-4">
            <div className="ui-body font-semibold text-ink mb-2">Stage</div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {CLIENT_STAGES.map((st) => {
                const on = (client.stage || 'Onboarding') === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onPatch({ stage: st })}
                    aria-pressed={on}
                    className={'px-2.5 py-1 r-md ui-small font-medium border transition cursor-pointer ' + (
                      on ? 'border-rose-line text-rose-text bg-rose-tint' : 'border-line text-ink-3 hover:border-line-strong'
                    )}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            {nextStep && (
              <div className="pt-3 border-t border-line">
                <div className="ui-meta uppercase tracking-[0.08em] text-ink-3 mb-1">Next action</div>
                <p className="ui-body text-ink">{nextStep.label}</p>
              </div>
            )}
          </div>

          <div className="glass-panel p-4 space-y-3">
            <Field label="Client name" value={client.name} onCommit={(v) => { if (v.trim()) onPatch({ name: v.trim() }); }} />
            <Field label="Email" value={client.handle} onCommit={(v) => onPatch({ handle: v })} />
            <Field label="Monthly rate" value={client.monthly_rate} placeholder="$450 per month" onCommit={(v) => onPatch({ monthly_rate: v })} />
            <Field label="Start date" value={client.start_date} type="date" onCommit={(v) => onPatch({ start_date: v })} />
            <div>
              <label className="block ui-body font-semibold text-ink mb-1.5">Quick notes</label>
              <NotesArea value={client.notes} onCommit={(v) => onPatch({ notes: v })} />
            </div>
          </div>

          <ClientFiles files={client.files || []} onChange={(files) => onPatch({ files })} />
        </aside>
      </div>
    </div>
  );
}

// Labelled links to whatever lives in Drive: the contract, brand assets,
// invoices. Deliberately links and not uploads — the file stays in one place
// and Google keeps owning who can open it, which matters most for the one
// document here that is actually legal.
function ClientFiles({ files, onChange }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const canAdd = /^https?:\/\//i.test(url.trim());

  function add() {
    if (!canAdd) return;
    onChange([...(files || []), { label: label.trim(), url: url.trim() }]);
    setLabel('');
    setUrl('');
  }

  return (
    <div className="glass-panel p-4 mb-5">
      <label className="block ui-body font-semibold text-ink mb-1">Files and links</label>
      <p className="ui-small text-muted mb-2.5">
        Paste the share link from Drive. The contract, their brand assets, the invoice folder. Nothing is copied here,
        so whoever you gave access to in Drive is still the only one who can open it.
      </p>

      {(files || []).length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {files.map((f, i) => {
            // The label is optional, so a link saved without one rendered an
            // anchor containing nothing: stored fine, shown as an empty row,
            // impossible to click ever again. Fall back to the URL.
            const name = (f.label || '').trim() || f.url;
            return (
              <li key={i} className="flex items-center gap-2">
                <Icon name="link" className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-body text-rose-text hover:underline truncate flex-1"
                >
                  {name}
                </a>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, n) => n !== i))}
                  title={`Remove ${name}`}
                  className="text-ink-3 hover:text-poppy-text transition shrink-0"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Contract"
          className="cell-input flex-1 min-w-[130px] bg-panel border border-line-strong shadow-card rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="https://drive.google.com/..."
          className="cell-input flex-[2] min-w-[200px] bg-panel border border-line-strong shadow-card rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="ui-body font-medium px-4 r-md border border-line-strong text-ink hover:bg-hover-wash-soft transition disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function NotesArea({ value, onCommit }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value || '')) onCommit(draft); }}
      rows={4}
      className="cell-input"
      style={{ minHeight: 96, whiteSpace: 'pre-wrap' }}
    />
  );
}
